-- ============================================================
-- ÓRBITA — supabase/testes/14_crm_idempotencia_lote.sql · frente C · plano de 01/10/2026 (M25)
-- Smoke de 20261002c_crm_idempotencia_lote.sql:
--   a MESMA chave p_req repetida devolve o MESMO resultado e não cria outro registro (oportunidade, contato, tarefa, consulta);
--   editar (com id) não guarda chave; erro/recusa não é guardado (repetir executa de novo); a chave vale por cliente (B não vê A);
--   chave vencida (24 h) executa de novo; a mesma chave em OUTRA operação é erro; as chamadas SEM p_req seguem como antes;
--   quem repete passa pela mesma autenticação (token de B não repete a chave de A).
-- Roda em begin … rollback. O bloco principal SEMPRE termina em exceção:
--   'OK_14_CRM_IDEMPOTENCIA …' = todos os casos passaram · 'FALHOU: <caso>' = falha
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
  cA uuid; cB uuid; k_at uuid; k_atb uuid;
  tAt text := 'tok-14-at-' || sfx; tB text := 'tok-14-atb-' || sfx;
  r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid(); r3 uuid := gen_random_uuid(); r4 uuid := gen_random_uuid();
  r5 uuid := gen_random_uuid(); r6 uuid := gen_random_uuid(); r7 uuid := gen_random_uuid(); r8 uuid := gen_random_uuid();
  j1 json; j2 json; j3 json; j4 json; n bigint; n_antes int; n_req_antes int;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_qua date;
  neg bigint; neg2 bigint; ct bigint; ini text;
begin
  -- ---------------------------------------------------------- fixtures
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-14-a-' || sfx, 'Teste 14 A', 'odonto') returning id into cA;
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-14-b-' || sfx, 'Teste 14 B', 'odonto') returning id into cB;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-14-at-' || sfx || '@teste.local', 'Beto Atende', 'x', 'clinica', true) returning id into k_at;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-14-atb-' || sfx || '@teste.local', 'Dora B', 'x', 'clinica', true) returning id into k_atb;
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas, departamentos, recebe_conversas) values
    (k_at, cA, 'atendente', true, '{}', false), (k_atb, cB, 'atendente', true, '{}', false);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash(tAt), k_at, now() + interval '1 hour'), (public.nx_hash(tB), k_atb, now() + interval '1 hour');
  v_qua := v_hoje + 3; while extract(dow from v_qua) <> 3 loop v_qua := v_qua + 1; end loop;

  -- ---------------------------------------------------------- 1. oportunidade: criar duas vezes com a mesma chave = 1
  j1 := public.nx_negocio_salvar(tAt, cA, jsonb_build_object('contato', jsonb_build_object('nome', 'Mariana Teste', 'telefone', '(12) 99830-1401'), 'titulo', 'Implante'), r1);
  j2 := public.nx_negocio_salvar(tAt, cA, jsonb_build_object('contato', jsonb_build_object('nome', 'Mariana Teste', 'telefone', '(12) 99830-1401'), 'titulo', 'Implante'), r1);
  perform pg_temp.ok((j1 ->> 'id') is not null and (j1 ->> 'id') = (j2 ->> 'id'), 'mesma chave → mesmo negócio');
  perform pg_temp.ok((select count(*) from public.nx_leads where cliente_id = cA and titulo = 'Implante') = 1, 'mesma chave → 1 negócio no banco');
  perform pg_temp.ok(j1::jsonb = j2::jsonb, 'o resultado repetido é idêntico ao primeiro');
  -- chave nova cria outro (sem a chave também; o comportamento antigo continua)
  j3 := public.nx_negocio_salvar(tAt, cA, jsonb_build_object('contato', jsonb_build_object('nome', 'Mariana Teste', 'telefone', '(12) 99830-1401'), 'titulo', 'Implante'), r2);
  perform pg_temp.ok((j3 ->> 'id') <> (j1 ->> 'id'), 'chave nova cria outro negócio');
  j3 := public.nx_negocio_salvar(tAt, cA, jsonb_build_object('contato', jsonb_build_object('nome', 'Mariana Teste', 'telefone', '(12) 99830-1401'), 'titulo', 'Implante'));
  j4 := public.nx_negocio_salvar(tAt, cA, jsonb_build_object('contato', jsonb_build_object('nome', 'Mariana Teste', 'telefone', '(12) 99830-1401'), 'titulo', 'Implante'));
  perform pg_temp.ok((j3 ->> 'id') <> (j4 ->> 'id'), 'sem chave: a RPC de 3 argumentos cria outro a cada chamada (como antes)');
  neg := (j1 ->> 'id')::bigint; ct := (j1 ->> 'contato_id')::bigint;
  if ct is null then ct := (select contato_id from public.nx_leads where id = neg); end if;
  perform pg_temp.ok(ct is not null, 'o negócio tem contato');

  -- editar (com id) não guarda chave e funciona com ou sem p_req
  n_req_antes := (select count(*) from public.nx_requisicoes where cliente_id = cA);
  j2 := public.nx_negocio_salvar(tAt, cA, jsonb_build_object('id', neg, 'titulo', 'Implante superior'), r3);
  perform pg_temp.ok((select titulo from public.nx_leads where id = neg) = 'Implante superior', 'editar com p_req edita');
  perform pg_temp.ok((select count(*) from public.nx_requisicoes where cliente_id = cA) = n_req_antes, 'editar não guarda chave');
  j2 := public.nx_negocio_salvar(tAt, cA, jsonb_build_object('id', neg, 'titulo', 'Implante superior 2'), null);
  perform pg_temp.ok((select titulo from public.nx_leads where id = neg) = 'Implante superior 2', 'p_req nulo delega para a RPC de 3 argumentos');

  -- ---------------------------------------------------------- 2. a chave guardada é por cliente e passa pela autenticação
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_salvar(%L,%L,%L,%L)', tB, cA, '{"contato":{"nome":"x","telefone":"12998301401"}}', r1)) = 'sem_acesso',
    'token de B não repete a chave de A (autentica antes de olhar o resultado)');
  j2 := public.nx_negocio_salvar(tB, cB, jsonb_build_object('contato', jsonb_build_object('nome', 'Cliente B', 'telefone', '(12) 99830-1402'), 'titulo', 'Do B'), r1);
  perform pg_temp.ok((j2 ->> 'id') <> (j1 ->> 'id') and (select cliente_id from public.nx_leads where id = (j2 ->> 'id')::bigint) = cB,
    'a MESMA chave em OUTRO cliente cria o negócio do outro cliente (a chave vale por cliente)');
  perform pg_temp.ok((select count(*) from public.nx_requisicoes where req = r1) = 2, 'duas linhas (A e B) para a mesma chave');

  -- ---------------------------------------------------------- 3. contato e tarefa
  j1 := public.nx_contato_salvar(tAt, cA, jsonb_build_object('nome', 'Pessoa Sem Telefone', 'origem', 'manual'), r4);
  j2 := public.nx_contato_salvar(tAt, cA, jsonb_build_object('nome', 'Pessoa Sem Telefone', 'origem', 'manual'), r4);
  perform pg_temp.ok((j1 ->> 'id') = (j2 ->> 'id') and (select count(*) from public.nx_contatos where cliente_id = cA and nome = 'Pessoa Sem Telefone') = 1, 'contato: mesma chave → 1 contato (mesmo sem telefone)');
  j1 := public.nx_contato_salvar(tAt, cA, jsonb_build_object('nome', 'Sem Chave', 'origem', 'manual'));
  j2 := public.nx_contato_salvar(tAt, cA, jsonb_build_object('nome', 'Sem Chave', 'origem', 'manual'));
  perform pg_temp.ok((j1 ->> 'id') <> (j2 ->> 'id'), 'contato sem chave: dois (como antes)');
  j1 := public.nx_tarefa_salvar(tAt, cA, jsonb_build_object('titulo', 'Ligar para a Mariana', 'negocio_id', neg), r5);
  j2 := public.nx_tarefa_salvar(tAt, cA, jsonb_build_object('titulo', 'Ligar para a Mariana', 'negocio_id', neg), r5);
  perform pg_temp.ok((j1 ->> 'id') = (j2 ->> 'id') and (select count(*) from public.nx_tarefas where cliente_id = cA and titulo = 'Ligar para a Mariana') = 1, 'tarefa: mesma chave → 1 tarefa');
  j2 := public.nx_tarefa_salvar(tAt, cA, jsonb_build_object('titulo', 'Ligar para a Mariana', 'negocio_id', neg), r6);
  perform pg_temp.ok((select count(*) from public.nx_tarefas where cliente_id = cA and titulo = 'Ligar para a Mariana') = 2, 'tarefa: chave nova → outra tarefa');

  -- ---------------------------------------------------------- 4. a mesma chave em OUTRA operação é erro do cliente
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_tarefa_salvar(%L,%L,%L,%L)', tAt, cA, '{"titulo":"x"}', r4)) = 'dados_invalidos|req',
    'chave usada por outra operação (contato) → dados_invalidos|req');

  -- ---------------------------------------------------------- 5. erro não é guardado: repetir executa de novo
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_salvar(%L,%L,%L,%L)', tAt, cA, '{"titulo":"sem contato"}', r7)) = 'dados_invalidos|contato', 'criar sem contato → erro');
  perform pg_temp.ok(not exists (select 1 from public.nx_requisicoes where cliente_id = cA and req = r7), 'o erro não deixa chave guardada');
  j1 := public.nx_negocio_salvar(tAt, cA, jsonb_build_object('contato_id', ct, 'titulo', 'Agora com contato'), r7);
  perform pg_temp.ok((j1 ->> 'id') is not null, 'a mesma chave, agora com dados válidos, executa');

  -- ---------------------------------------------------------- 6. chave vencida (24 h) executa de novo
  j1 := public.nx_negocio_salvar(tAt, cA, jsonb_build_object('contato_id', ct, 'titulo', 'Vence em 24 h'), r8);
  update public.nx_requisicoes set criado_em = now() - interval '25 hours' where cliente_id = cA and req = r8;
  j2 := public.nx_negocio_salvar(tAt, cA, jsonb_build_object('contato_id', ct, 'titulo', 'Vence em 24 h'), r8);
  perform pg_temp.ok((j1 ->> 'id') <> (j2 ->> 'id') and (select count(*) from public.nx_leads where cliente_id = cA and titulo = 'Vence em 24 h') = 2, 'chave com mais de 24 h executa de novo');
  perform pg_temp.ok((select count(*) from public.nx_requisicoes where cliente_id = cA and req = r8) = 1, 'e a chave vencida foi trocada pela nova (1 linha)');

  -- ---------------------------------------------------------- 7. consulta (nx_agenda_marcar com p_req)
  neg2 := (public.nx_negocio_salvar(tAt, cA, jsonb_build_object('contato_id', ct, 'titulo', 'Para a agenda'))->> 'id')::bigint;
  ini := to_char(v_qua, 'YYYY-MM-DD') || 'T10:00:00-03:00';
  j1 := public.nx_agenda_marcar(tAt, cA, neg2, ini, gen_random_uuid(), 'Avaliação');   -- chave própria só para provar a assinatura nova
  perform pg_temp.ok((j1 ->> 'ok')::boolean, 'marcar com p_req (assinatura nova, p_servico por nome)');
  perform public.nx_agenda_desmarcar(tAt, cA, neg2, 'teste');
  perform pg_temp.ok((select consulta_em from public.nx_leads where id = neg2) is null, 'desmarcada');
  -- a chave NOVA deste teste: marca, desmarca e repete a mesma chave → devolve o resultado guardado e NÃO marca de novo
  declare rk uuid := gen_random_uuid();
  begin
    j1 := public.nx_agenda_marcar(tAt, cA, neg2, ini, rk, 'Avaliação');
    perform pg_temp.ok((j1 ->> 'ok')::boolean and (select consulta_em from public.nx_leads where id = neg2) is not null, 'marcou');
    perform public.nx_agenda_desmarcar(tAt, cA, neg2, 'cliente desistiu');
    j2 := public.nx_agenda_marcar(tAt, cA, neg2, ini, rk, 'Avaliação');
    perform pg_temp.ok(j2::jsonb = j1::jsonb and (select consulta_em from public.nx_leads where id = neg2) is null,
      'repetir a chave depois de desmarcar devolve o resultado guardado e não marca de novo');
    -- sem p_req (7 argumentos) continua marcando
    j3 := public.nx_agenda_marcar(tAt, cA, neg2, ini);
    perform pg_temp.ok((j3 ->> 'ok')::boolean and (select consulta_em from public.nx_leads where id = neg2) is not null, 'sem p_req a RPC de 7 argumentos marca como antes');
    perform public.nx_agenda_desmarcar(tAt, cA, neg2, null);
  end;
  -- recusa não é guardada: horário ocupado agora, livre depois
  declare rk2 uuid := gen_random_uuid(); outro bigint;
  begin
    outro := (public.nx_negocio_salvar(tAt, cA, jsonb_build_object('contato_id', ct, 'titulo', 'Ocupa o horário'))->> 'id')::bigint;
    perform public.nx_agenda_marcar(tAt, cA, outro, ini);
    j1 := public.nx_agenda_marcar(tAt, cA, neg2, ini, rk2, 'Avaliação');
    perform pg_temp.ok(j1 ->> 'erro' = 'horario_ocupado', 'recusa: horário ocupado');
    perform pg_temp.ok(not exists (select 1 from public.nx_requisicoes where cliente_id = cA and req = rk2), 'a recusa não fica guardada');
    perform public.nx_agenda_desmarcar(tAt, cA, outro, null);
    j2 := public.nx_agenda_marcar(tAt, cA, neg2, ini, rk2, 'Avaliação');
    perform pg_temp.ok((j2 ->> 'ok')::boolean, 'a mesma chave dá certo quando o horário libera');
  end;

  -- ---------------------------------------------------------- 8. a tabela é fechada
  perform pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.nx_requisicoes'::regclass), 'RLS ligada em nx_requisicoes');
  perform pg_temp.ok(not has_table_privilege('anon', 'public.nx_requisicoes', 'select') and not has_table_privilege('authenticated', 'public.nx_requisicoes', 'select'), 'anon/authenticated não leem nx_requisicoes');
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_req_usar(uuid, uuid, text)', 'execute') and has_function_privilege('service_role', 'public.nx_req_usar(uuid, uuid, text)', 'execute'), 'ajudantes só para service_role');
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_negocio_salvar(text, uuid, jsonb, uuid)', 'execute'), 'a RPC com p_req é liberada ao painel como as de hoje');

  raise exception 'OK_14_CRM_IDEMPOTENCIA — todos os casos passaram';
end $t$;

rollback;
