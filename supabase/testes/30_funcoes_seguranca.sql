-- ============================================================
-- ÓRBITA — supabase/testes/30_funcoes_seguranca.sql · smoke de 20261013e_funcoes_seguranca.sql (plano 1000, frente srv, lote srv-3)
--   SV-057 mídia apagada · SV-056 uploads referenciados · SV-006 qualidade do número · SV-012 contadores por canal ·
--   SV-268/SV-208 teto do agente por tipo e cliente suspenso · SV-049 reenvio v2 · SV-067 cache de resumo · SV-071 custo alto ·
--   SV-073 modelo_ia só claude-* · SV-140/SV-242 nx_disparar · SV-123 faxina · SV-118 índice · SV-128 sair de todos ·
--   SV-129 teto de sessões · SV-238 bloqueio por (conta, IP) · SV-239 login certo zera as falhas
-- Roda em begin … rollback; termina em raise exception 'OK_30_…'.
-- ============================================================
begin;
create or replace function pg_temp.ok(p boolean, p_caso text) returns void language plpgsql as $f$
begin
  if not coalesce(p, false) then raise exception 'FALHOU: %', p_caso; end if;
end $f$;
create or replace function pg_temp.erro(p_sql text) returns text language plpgsql as $f$
declare m text; h text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics m = message_text, h = pg_exception_hint;
  return m || coalesce('|' || nullif(h, ''), '');
end $f$;

do $t$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  org_p uuid; cA uuid; cB uuid; kM uuid; kM2 uuid; kC uuid; k_adm uuid; k_sup uuid; k_log uuid;
  t_adm text := 'tok-30-adm-' || sfx; t_sup text := 'tok-30-sup-' || sfx;
  seg text := encode(extensions.gen_random_bytes(32), 'hex');
  waba text := '3030' || lpad((floor(random() * 900000000) + 100000000)::text, 9, '0');
  tel text := '5512997' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  email_l text := 'login-30-' || sfx || '@teste.local';
  ip1 text := '198.51.100.' || (floor(random() * 200) + 1)::int; ip2 text := '203.0.113.' || (floor(random() * 200) + 1)::int;
  hip1 text := 'h' || left(public.nx_hash(ip1), 32); hip2 text := 'h' || left(public.nx_hash(ip2), 32);   -- plano 1500c: SC-108 as chaves de limite levam o RESUMO do IP (nx_login_ip devolve h + 32 hex), não o IP
  ct bigint; cv bigint; m1 bigint; m2 bigint; m3 bigint; m4 bigint;
  p1 text; p2 text; p3 text;
  j json; jb jsonb; n int; i int; v_def text;
begin
  perform pg_temp.ok(exists (select 1 from public.nx_versao_banco where nome = '20261013e_funcoes_seguranca'), 'versão registrada');
  select id into org_p from public.nx_orgs where tipo = 'plataforma' limit 1;
  perform pg_temp.ok(org_p is not null, 'fixture: org da plataforma');
  insert into public.nx_clientes (slug, nome, org_id, vertical, status) values ('t30-a-' || sfx, 'Teste 30 A', org_p, 'odonto', 'ativo') returning id into cA;
  insert into public.nx_clientes (slug, nome, org_id, vertical, status) values ('t30-b-' || sfx, 'Teste 30 B', org_p, 'odonto', 'ativo') returning id into cB;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t30-adm-' || sfx || '@teste.local', 'Admin 30', 'x', 'clinica', true, org_p) returning id into k_adm;
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas) values (k_adm, cA, 'admin', true);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(t_adm), k_adm, now() + interval '1 hour');
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor, waba_id, numero_exibicao) values (cA, 'Meta 30', 'pn-30-' || sfx, 'meta', waba, '+55 12 3999-0001') returning id into kM;
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor, waba_id, numero_exibicao) values (cB, 'Meta 30 B', 'pn-30b-' || sfx, 'meta', waba || '9', '+55 12 3999-0002') returning id into kM2;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Ana 30', tel) returning id into ct;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status) values (cA, kM, ct, '2026-30a' || sfx, 'aberta') returning id into cv;
  p1 := cA::text || '/out/2026-10/' || sfx || '-1.jpg'; p2 := cA::text || '/out/2026-10/' || sfx || '-2.pdf'; p3 := cA::text || '/out/2026-10/' || sfx || '-3.jpg';
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, status, midia, erro)
    values (cA, cv, ct, kM, 'out', 'imagem', 'falhou', jsonb_build_object('path', p1, 'mime', 'image/jpeg', 'estado', 'ok'), 'x') returning id into m1;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, status, midia)
    values (cA, cv, ct, kM, 'out', 'documento', 'enviada', jsonb_build_object('path', p2, 'mime', 'application/pdf', 'estado', 'ok')) returning id into m2;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, status, corpo, template)
    values (cA, cv, ct, kM, 'out', 'template', 'falhou', 'Olá Ana', jsonb_build_object('id', gen_random_uuid(), 'nome', 'boas_vindas', 'parametros', jsonb_build_array('Ana'))) returning id into m3;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, status, corpo)
    values (cA, cv, ct, kM, 'out', 'texto', 'enviada', 'já saiu') returning id into m4;

  -- ---------------------------------------------------------- SV-056 / SV-057
  j := public.nx_midia_referenciadas(cA, array[p1, p2, p3]);
  perform pg_temp.ok(json_array_length(j) = 2 and j::text like '%' || p1 || '%' and j::text not like '%' || p3 || '%', 'referenciadas: só as que viraram mensagem');
  perform pg_temp.ok(json_array_length(public.nx_midia_referenciadas(cB, array[p1])) = 0, 'referenciadas: outro cliente não vê');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_midia_apagada(%L, %L)', cB, array[p1])) like 'dados_invalidos%', 'apagada: path de outro cliente recusado');
  n := public.nx_midia_apagada(cA, array[p1]);
  perform pg_temp.ok(n = 1, 'apagada: 1 mensagem marcada');
  jb := (select midia from public.nx_mensagens where id = m1);
  perform pg_temp.ok(jb ->> 'estado' = 'apagada' and not (jb ? 'path') and jb ? 'apagada_em' and jb ->> 'mime' = 'image/jpeg', 'apagada: estado, sem path, resto mantido');
  perform pg_temp.ok((select midia ->> 'estado' from public.nx_mensagens where id = m2) = 'ok', 'apagada: a outra mídia intacta');

  -- ---------------------------------------------------------- SV-049 reenvio v2
  j := public.nx_cv_msg_reenvio_v2(jsonb_build_object('conta_id', k_adm, 'papel', 'admin', 'ver_todas', true, 'departamentos', '{}'::uuid[]), cA, m3);
  perform pg_temp.ok(j ->> 'tipo' = 'template' and (j -> 'template' ->> 'nome') = 'boas_vindas' and (j ->> 'conversa_id')::bigint = cv, 'reenvio v2: modelo falhado volta com o template');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_msg_reenvio_v2(%L, %L, %s)', jsonb_build_object('conta_id', k_adm, 'papel', 'admin', 'ver_todas', true), cA, m1)) = 'mensagem_nao_encontrada',
    'reenvio v2: mídia sem arquivo (apagada) não reenvia');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_msg_reenvio_v2(%L, %L, %s)', jsonb_build_object('conta_id', k_adm, 'papel', 'admin', 'ver_todas', true), cA, m4)) = 'mensagem_nao_encontrada',
    'reenvio v2: o que não falhou não reenvia');
  update public.nx_mensagens set status = 'falhou' where id = m2;
  j := public.nx_cv_msg_reenvio_v2(jsonb_build_object('conta_id', k_adm, 'papel', 'admin', 'ver_todas', true), cA, m2);
  perform pg_temp.ok(j ->> 'tipo' = 'documento' and j -> 'midia' ->> 'path' = p2 and j ->> 'template' is null, 'reenvio v2: documento falhado volta com o path');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_msg_reenvio_v2(%L, %L, %s)', jsonb_build_object('conta_id', k_adm, 'papel', 'admin', 'ver_todas', true), cB, m2)) = 'mensagem_nao_encontrada',
    'reenvio v2: mensagem de outro cliente');

  -- ---------------------------------------------------------- SV-006 qualidade
  j := public.nx_canal_qualidade(waba, '5512 3999-0001', 'qualidade', 'FLAGGED', 'limite TIER_1K');
  perform pg_temp.ok((j ->> 'canais')::int = 1 and (j ->> 'avisados')::int = 1, 'qualidade: 1 canal (só o da WABA e do número), 1 aviso');
  perform pg_temp.ok((select meta_qualidade ->> 'evento' from public.nx_canais where id = kM) = 'FLAGGED' and (select meta_qualidade from public.nx_canais where id = kM2) is null,
    'qualidade: gravada só no canal certo');
  perform pg_temp.ok(exists (select 1 from public.nx_notificacoes where cliente_id = cA and link = '#/config/numeros' and titulo like 'Meta 30: qualidade em queda%'), 'qualidade: admins avisados');
  j := public.nx_canal_qualidade(waba, null, 'qualidade', 'FLAGGED', null);
  perform pg_temp.ok((j ->> 'avisados')::int = 0, 'qualidade: o mesmo evento no mesmo dia não avisa de novo');
  j := public.nx_canal_qualidade(waba, '5512 3999-7777', 'conta', 'ACCOUNT_VIOLATION', null);
  perform pg_temp.ok((j ->> 'canais')::int = 0, 'qualidade: número que não é o do canal → nada');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_canal_qualidade(%L, null, %L, %L, null)', waba, 'qualidade', 'x y')) like 'dados_invalidos%', 'qualidade: evento inválido');

  -- ---------------------------------------------------------- SV-012 contadores
  j := public.nx_canal_contar(kM, '{"mensagens": 3, "duplicadas": 1, "retry_503": 1, "inventado": 9, "recibos": "x"}'::jsonb);
  jb := (select meta_contadores from public.nx_canais where id = kM);
  perform pg_temp.ok((jb ->> 'mensagens')::int = 3 and (jb ->> 'duplicadas')::int = 1 and (jb ->> 'retry_503')::int = 1 and not (jb ? 'inventado') and not (jb ? 'recibos')
                 and jb ->> 'dia' = to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD'), 'contar: só as chaves conhecidas, números, com o dia');
  perform public.nx_canal_contar(kM, '{"mensagens": 2}'::jsonb);
  perform pg_temp.ok((select (meta_contadores ->> 'mensagens')::int from public.nx_canais where id = kM) = 5, 'contar: soma no mesmo dia');
  update public.nx_canais set meta_contadores = jsonb_set(meta_contadores, '{dia}', '"2000-01-01"') where id = kM;
  perform public.nx_canal_contar(kM, '{"mensagens": 1}'::jsonb);
  jb := (select meta_contadores from public.nx_canais where id = kM);
  perform pg_temp.ok((jb ->> 'mensagens')::int = 1 and (jb -> 'anterior' ->> 'mensagens')::int = 5, 'contar: virou o dia → recomeça e guarda o anterior');

  -- ---------------------------------------------------------- SV-268 / SV-208 agente CodeWords
  insert into public.nx_canais (cliente_id, nome, provedor, codewords_numero, codewords_hook_hash)
    values (cA, 'Aparelho 30', 'codewords', '+5512991230030', encode(extensions.digest(seg, 'sha256'), 'hex')) returning id into kC;
  for i in 1..241 loop j := public.nx_codewords_canal(seg, 'mensagem'); end loop;
  perform pg_temp.ok((j ->> 'excedido')::boolean and j ->> 'tipo' = 'mensagem', 'agente: 241ª mensagem no minuto excede');
  j := public.nx_codewords_canal(seg, 'status');
  perform pg_temp.ok(not (j ->> 'excedido')::boolean and j ->> 'tipo' = 'outro' and (j ->> 'uso_minuto')::int = 1, 'agente: recibo conta à parte (não bloqueado pelas mensagens)');
  for i in 1..300 loop j := public.nx_codewords_canal(seg, 'status'); end loop;
  perform pg_temp.ok(not (j ->> 'excedido')::boolean, 'agente: 300 recibos/min não excedem');
  perform pg_temp.ok(not (j ->> 'suspenso')::boolean, 'agente: cliente ativo não é suspenso');
  update public.nx_clientes set status = 'suspenso' where id = cA;
  j := public.nx_codewords_canal(seg, 'mensagem');
  perform pg_temp.ok((j ->> 'suspenso')::boolean and (j ->> 'canal_id')::uuid = kC, 'agente: cliente suspenso vem marcado');
  update public.nx_clientes set status = 'ativo' where id = cA;
  perform pg_temp.ok(public.nx_codewords_canal(repeat('0', 64), 'mensagem') is null and public.nx_codewords_canal('x', 'outro') is null, 'agente: segredo errado → null');
  perform pg_temp.ok((public.nx_codewords_canal(seg) ->> 'canal_id')::uuid = kC, 'agente: a assinatura antiga (1 argumento) continua');

  -- ---------------------------------------------------------- SV-067 cache · SV-071 custo
  perform public.nx_ia_cache_gravar('resumir:1:' || sfx, cA, 'resumo guardado');
  perform pg_temp.ok(public.nx_ia_cache_ler('resumir:1:' || sfx) = 'resumo guardado', 'cache: lê o que gravou');
  update public.nx_ia_cache set criado_em = now() - interval '31 minutes' where chave = 'resumir:1:' || sfx;
  perform pg_temp.ok(public.nx_ia_cache_ler('resumir:1:' || sfx) is null, 'cache: vence em 30 min');
  insert into public.nx_ia_uso (cliente_id, acao, modelo, tokens_in, tokens_out, ok, custo_usd, criado_em)
    select cA, 'sugerir', 'claude-opus-5-5', 1000, 100, true, 3.5, ((now() at time zone 'America/Sao_Paulo')::date - 1)::timestamp at time zone 'America/Sao_Paulo' + interval '10 hours'
      from generate_series(1, 4);
  insert into public.nx_ia_uso (cliente_id, acao, modelo, tokens_in, tokens_out, ok, custo_usd, criado_em)
    values (cB, 'sugerir', 'claude-opus-5-5', 10, 10, true, 1, ((now() at time zone 'America/Sao_Paulo')::date - 1)::timestamp at time zone 'America/Sao_Paulo' + interval '11 hours');
  j := public.nx_ia_custo_alto((now() at time zone 'America/Sao_Paulo')::date - 1, 10);
  perform pg_temp.ok(j::text like '%' || cA::text || '%' and j::text not like '%' || cB::text || '%', 'custo alto: só o cliente acima do teto (US$ 14 > 10)');
  perform pg_temp.ok(exists (select 1 from json_array_elements(j) x where (x ->> 'cliente_id')::uuid = cA and (x ->> 'custo_usd')::numeric = 14 and (x ->> 'chamadas')::int = 4), 'custo alto: soma e chamadas');
  perform pg_temp.ok(json_array_length(public.nx_ia_custo_alto((now() at time zone 'America/Sao_Paulo')::date, 10)) = 0
                 or not (public.nx_ia_custo_alto((now() at time zone 'America/Sao_Paulo')::date, 10)::text like '%' || cA::text || '%'), 'custo alto: o dia certo');

  -- ---------------------------------------------------------- SV-073 nx_config_salvar
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t30-sup-' || sfx || '@teste.local', 'Super 30', 'x', 'gestor', true, org_p) returning id into k_sup;
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(t_sup), k_sup, now() + interval '1 hour');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_config_salvar(%L, %L)', t_sup, '{"modelo_ia":"gpt-4"}')) = 'dados_invalidos|modelo_ia', 'config: gpt-4 recusado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_config_salvar(%L, %L)', t_sup, '{"ia_aviso_custo_usd":"-3"}')) = 'dados_invalidos|ia_aviso_custo_usd', 'config: teto negativo recusado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_config_salvar(%L, %L)', t_sup, '{"modelo_ia":"claude-sonnet-5-5","ia_aviso_custo_usd":"25"}')) = 'ok', 'config: claude-* e teto válidos');
  perform pg_temp.ok((select modelo_ia from public.nx_config where id = 1) = 'claude-sonnet-5-5' and (select ia_aviso_custo_usd from public.nx_config where id = 1) = 25, 'config: gravado');
  perform pg_temp.ok((public.nx_config_ver(t_sup)::jsonb ->> 'ia_aviso_custo_usd')::numeric = 25, 'config: nx_config_ver devolve o teto (20261013h)');

  -- ---------------------------------------------------------- SV-140 / SV-242 nx_disparar
  v_def := pg_get_functiondef('public.nx_disparar(text,jsonb)'::regprocedure);
  perform pg_temp.ok(v_def like '%timeout_milliseconds := 155000%', 'disparar: pg_net espera 155 s');
  update public.nx_config set funcoes_url = 'https://evil.example.com/functions/v1' where id = 1;
  perform pg_temp.ok(pg_temp.erro('select public.nx_disparar(''nx-ciclo'', ''{}''::jsonb)') = 'funcoes_url_invalida', 'disparar: outro domínio → exceção, nada chamado');
  update public.nx_config set funcoes_url = 'https://abcdefghijklmnopqrst.supabase.co/functions/v1', cron_token = coalesce(cron_token, 'cron-30') where id = 1;
  perform pg_temp.ok(public.nx_disparar('nx-ciclo', '{}'::jsonb) is not null, 'disparar: o domínio do projeto chama');

  -- ---------------------------------------------------------- SV-123 faxina · SV-118 índice
  insert into public.nx_ia_reservas (cliente_id, conta_id, acao, criado_em, expira_em) values (cA, null, 'sugerir', now() - interval '9 days', now() - interval '8 days');
  insert into public.nx_codewords_taxa (canal_id, minuto, n) values (kC, date_trunc('minute', now()) - interval '3 hours', 5);
  insert into public.nx_taxa (chave, minuto, n) values ('t30:' || sfx, date_trunc('minute', now()) - interval '3 days', 1);
  insert into public.nx_ia_cache (chave, cliente_id, texto, criado_em) values ('velho:' || sfx, cA, 'x', now() - interval '2 days');
  jb := public.nx_saas_faxina()::jsonb;
  perform pg_temp.ok((jb ->> 'ia_reservas')::int >= 1 and (jb ->> 'codewords_taxa')::int >= 1 and (jb ->> 'taxa')::int >= 1 and (jb ->> 'ia_cache')::int >= 1
                 and jb ? 'primeira_entrada' and jb ? 'travas', 'faxina: os transitórios novos saem (e as chaves de antes continuam)');
  perform pg_temp.ok(not exists (select 1 from public.nx_ia_cache where chave = 'velho:' || sfx) and exists (select 1 from public.nx_ia_cache where chave = 'resumir:1:' || sfx),
    'faxina: cache > 1 d sai, recente fica');
  perform pg_temp.ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'nx_leads_cli_etapa'), 'índice nx_leads_cli_etapa');

  -- ---------------------------------------------------------- SV-128 sair de todos os aparelhos
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(t_adm || '-2'), k_adm, now() + interval '1 hour'),
    (public.nx_hash(t_adm || '-3'), k_adm, now() + interval '1 hour');
  j := public.nx_sessoes_encerrar(t_adm, true);
  perform pg_temp.ok((j ->> 'encerradas')::int = 2 and (select count(*) from public.nx_sessoes where conta_id = k_adm) = 1
                 and exists (select 1 from public.nx_sessoes where token_hash = public.nx_hash(t_adm)), 'sair de todos: 3 sessões → sobra a atual');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_sessoes_encerrar(%L, true)', 'tok-que-nao-existe')) like 'sessao_invalida%', 'sair de todos: token inválido');
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_sessoes_encerrar(text,boolean)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_canal_contar(uuid,jsonb)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_codewords_canal(text,text)', 'execute')
                 and not has_function_privilege('authenticated', 'public.nx_sessoes_encerrar(text,boolean)', 'execute'), 'permissões: painel para anon, internas só service_role');

  -- ---------------------------------------------------------- SV-129 / SV-238 / SV-239 login
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id)
  values (email_l, 'Login 30', extensions.crypt('senha-30-ok', extensions.gen_salt('bf', 4)), 'clinica', true, org_p) returning id into k_log;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_log, cA, 'admin');
  perform set_config('request.headers', json_build_object('x-forwarded-for', ip1)::text, true);
  for i in 1..9 loop j := public.nx_entrar(email_l, 'errada'); end loop;
  j := public.nx_entrar(email_l, 'senha-30-ok');
  perform pg_temp.ok(length(j ->> 'token') = 64, 'login: 9 erradas + a certa entra');
  perform pg_temp.ok(not exists (select 1 from public.nx_login_falhas where chave in ('conta:' || email_l, 'contaip:' || email_l || '|' || hip1))
                 and (select count(*) from public.nx_login_falhas where chave = 'ip:' || hip1) = 9, 'login: a certa zera as falhas da conta (as do IP ficam)');
  j := public.nx_entrar(email_l, 'errada');
  perform pg_temp.ok((j ->> 'message') = 'credenciais_invalidas', 'login: depois do sucesso, 1 errada não bloqueia');
  delete from public.nx_login_falhas where chave in ('conta:' || email_l, 'ip:' || hip1, 'contaip:' || email_l || '|' || hip1);
  for i in 1..10 loop perform public.nx_entrar(email_l, 'errada'); end loop;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_entrar(%L,%L)', email_l, 'senha-30-ok')) like 'muitas_tentativas|%', 'login: 10 falhas do IP 1 bloqueiam o IP 1');
  perform set_config('request.headers', json_build_object('x-forwarded-for', ip2)::text, true);
  j := public.nx_entrar(email_l, 'senha-30-ok');
  perform pg_temp.ok(length(j ->> 'token') = 64, 'login: outro IP ainda entra (10 falhas não trancam o dono)');
  insert into public.nx_login_falhas (chave) select 'conta:' || email_l from generate_series(1, 49);
  perform set_config('request.headers', json_build_object('x-forwarded-for', '192.0.2.77')::text, true);
  j := public.nx_entrar(email_l, 'errada');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_entrar(%L,%L)', email_l, 'senha-30-ok')) like 'muitas_tentativas|%', 'login: 50 falhas da conta (vários IPs) bloqueiam');
  perform pg_temp.ok(exists (select 1 from public.nx_notificacoes where conta_id = k_log and titulo = 'Muitas tentativas de entrar na sua conta'), 'login: a conta é avisada no limite alto');
  delete from public.nx_login_falhas where chave like 'conta:' || email_l or chave like 'contaip:' || email_l || '%' or chave in ('ip:' || hip1, 'ip:' || hip2, 'ip:192.0.2.77');
  perform set_config('request.headers', json_build_object('x-forwarded-for', ip2)::text, true);
  for i in 1..24 loop j := public.nx_entrar(email_l, 'senha-30-ok'); end loop;
  perform pg_temp.ok((select count(*) from public.nx_sessoes where conta_id = k_log) = 20 and exists (select 1 from public.nx_sessoes where token_hash = public.nx_hash(j ->> 'token')),
    'sessões: no máximo 20 por conta, a mais nova fica');
  perform set_config('request.headers', '', true);

  raise exception 'OK_30_FUNCOES_SEGURANCA — mídia apagada/referenciada, qualidade e contadores do número, agente por tipo e suspenso, reenvio v2, cache e custo de IA, modelo claude-*, disparo só no projeto, faxina, sair de todos, login por (conta, IP), teto de sessões';
end $t$;
rollback;
