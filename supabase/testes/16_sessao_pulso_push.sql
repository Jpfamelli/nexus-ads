-- ============================================================
-- ÓRBITA — supabase/testes/16_sessao_pulso_push.sql · frente B · plano de 01/10/2026 (M17)
-- Smoke de 20261002b_sessao_pulso_push.sql. Só o M17 existe na migração: o pulso com não lidas (M19) e o push (M20) não foram
-- feitos, apesar do nome do arquivo, e por isso não há caso deles aqui.
--   M17  nx_app_sessao renova a sessão quando faltam < 20 dias (para now() + 30 dias); não renova com 20 dias ou mais, não renova duas vezes
--        seguidas, não renova sessão vencida nem token inválido (sessao_invalida) e não mexe na sessão de outra conta;
--        sessão ociosa (ninguém chama) vence em 30 dias do mesmo jeito.
-- Roda em begin … rollback. O bloco principal SEMPRE termina em exceção:
--   'OK_16_SESSAO_PULSO_PUSH …' = todos os casos passaram · 'FALHOU: <caso>' = falha
-- ============================================================
begin;

create or replace function pg_temp.erro(p_sql text) returns text language plpgsql as $f$
declare m text; h text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics m = message_text, h = pg_exception_hint;
  return m || coalesce('|' || nullif(h, ''), '');
end $f$;

create or replace function pg_temp.ok(p boolean, p_caso text) returns void language plpgsql as $f$
begin
  if not coalesce(p, false) then raise exception 'FALHOU: %', p_caso; end if;
end $f$;

do $t$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  k1 uuid; k2 uuid;
  t10 text := 'tok-16-10d-' || sfx;      -- vence em 10 dias: renova
  t25 text := 'tok-16-25d-' || sfx;      -- vence em 25 dias: não renova
  t19 text := 'tok-16-19d-' || sfx;      -- vence em 19 dias: renova (dentro da janela)
  t21 text := 'tok-16-21d-' || sfx;      -- vence em 21 dias: não renova (fora da janela)
  tvenc text := 'tok-16-venc-' || sfx;   -- já venceu
  toutra text := 'tok-16-outra-' || sfx; -- sessão de OUTRA conta, vence em 5 dias
  v_antes timestamptz; v_depois timestamptz; v_outra_antes timestamptz; j json;
begin
  -- ---------------------------------------------------------- fixtures
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-16-a-' || sfx || '@teste.local', 'Ana Sessão', 'x', 'clinica', true) returning id into k1;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-16-b-' || sfx || '@teste.local', 'Bia Sessão', 'x', 'clinica', true) returning id into k2;
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash(t10), k1, now() + interval '10 days'),
    (public.nx_hash(t25), k1, now() + interval '25 days'),
    (public.nx_hash(t19), k1, now() + interval '19 days'),
    (public.nx_hash(t21), k1, now() + interval '21 days'),
    (public.nx_hash(tvenc), k1, now() - interval '1 hour'),
    (public.nx_hash(toutra), k2, now() + interval '5 days');

  -- ---------------------------------------------------------- M17.1 faltam 10 dias → renova para ~30 dias
  v_outra_antes := (select expira_em from public.nx_sessoes where token_hash = public.nx_hash(toutra));
  j := public.nx_app_sessao(t10);
  perform pg_temp.ok((j -> 'conta' ->> 'id')::uuid = k1, 'a leitura da sessão devolve a conta de quem chamou');
  v_depois := (select expira_em from public.nx_sessoes where token_hash = public.nx_hash(t10));
  perform pg_temp.ok(v_depois > now() + interval '29 days 23 hours' and v_depois <= now() + interval '30 days', 'faltando 10 dias: a sessão passa a vencer em ~30 dias');

  -- ---------------------------------------------------------- M17.2 renovar não reescreve a cada abertura
  v_antes := v_depois;
  perform public.nx_app_sessao(t10);
  v_depois := (select expira_em from public.nx_sessoes where token_hash = public.nx_hash(t10));
  perform pg_temp.ok(v_depois = v_antes, 'uma segunda abertura logo depois não reescreve expira_em (só a cada ~10 dias)');

  -- ---------------------------------------------------------- M17.3 a janela é de 20 dias
  v_antes := (select expira_em from public.nx_sessoes where token_hash = public.nx_hash(t25));
  perform public.nx_app_sessao(t25);
  perform pg_temp.ok((select expira_em from public.nx_sessoes where token_hash = public.nx_hash(t25)) = v_antes, 'faltando 25 dias: não renova');
  v_antes := (select expira_em from public.nx_sessoes where token_hash = public.nx_hash(t21));
  perform public.nx_app_sessao(t21);
  perform pg_temp.ok((select expira_em from public.nx_sessoes where token_hash = public.nx_hash(t21)) = v_antes, 'faltando 21 dias: não renova (fora da janela)');
  perform public.nx_app_sessao(t19);
  perform pg_temp.ok((select expira_em from public.nx_sessoes where token_hash = public.nx_hash(t19)) > now() + interval '29 days', 'faltando 19 dias: renova (dentro da janela)');

  -- ---------------------------------------------------------- M17.4 sessão vencida e token inválido não renovam
  v_antes := (select expira_em from public.nx_sessoes where token_hash = public.nx_hash(tvenc));
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_app_sessao(%L)', tvenc)) like 'sessao_invalida%', 'sessão vencida levanta sessao_invalida');
  perform pg_temp.ok((select expira_em from public.nx_sessoes where token_hash = public.nx_hash(tvenc)) = v_antes, 'e NÃO é ressuscitada pela renovação');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_app_sessao(%L)', 'token-que-nao-existe-' || sfx)) like 'sessao_invalida%', 'token inexistente levanta sessao_invalida');
  perform pg_temp.ok(pg_temp.erro('select public.nx_app_sessao(null)') like 'sessao_invalida%', 'token nulo levanta sessao_invalida');

  -- ---------------------------------------------------------- M17.5 só a sessão de quem chamou é renovada
  perform pg_temp.ok((select expira_em from public.nx_sessoes where token_hash = public.nx_hash(toutra)) = v_outra_antes, 'a sessão de outra conta (mesmo vencendo em 5 dias) não foi tocada');

  -- ---------------------------------------------------------- M17.6 sessão ociosa vence do mesmo jeito
  update public.nx_sessoes set expira_em = now() - interval '1 second' where token_hash = public.nx_hash(toutra);
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_app_sessao(%L)', toutra)) like 'sessao_invalida%', 'sessão que ninguém abriu em 30 dias vence e pede entrar de novo');

  raise exception 'OK_16_SESSAO_PULSO_PUSH — M17: renovação por uso, janela de 20 dias, sem ressuscitar vencida, isolamento por conta';
end $t$;

rollback;
