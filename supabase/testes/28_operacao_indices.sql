-- ============================================================
-- ÓRBITA — supabase/testes/28_operacao_indices.sql · smoke de 20261013c_operacao_indices.sql (plano 1000, frente srv, lote srv-2)
--   SV-063 IA do relatório na cota · SV-116 primeira_entrada_em · SV-150 pausa geral de envios · SV-109/122/124 faxina em lotes
--   (rastreio, travas) · SV-081 renomear · SV-080 zerar ausentes · SV-197 relatório por cliente · SV-125 crons · SV-126 nx_saude ·
--   SV-051 (confirmação: sem o módulo, o contexto de envio já recusa) · índices e permissões
-- Roda em begin … rollback; termina em raise exception 'OK_28_…'.
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
-- disparos do pg_net nesta transação (PGlite: net.http_chamadas; Supabase: net.http_request_queue)
create or replace function pg_temp.disparos(p_url text, p_corpo text default '%') returns int language plpgsql as $f$
declare n int;
begin
  if to_regclass('net.http_chamadas') is not null then
    execute 'select count(*)::int from net.http_chamadas where url like $1 and corpo::text like $2' into n using p_url, p_corpo;
  else
    execute 'select count(*)::int from net.http_request_queue where url like $1 and convert_from(body, ''UTF8'') like $2' into n using p_url, p_corpo;
  end if;
  return n;
end $f$;

do $t$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  org_p uuid; cA uuid; cB uuid; kM uuid; ct bigint; cv bigint; cv2 bigint; f1 bigint; f2 bigint;
  k_sup uuid; k_adm uuid; t_sup text := 'tok-28-sup-' || sfx; t_adm text := 'tok-28-adm-' || sfx;
  pre text := '55129' || lpad((floor(random() * 9000) + 1000)::text, 4, '0');
  t0 timestamptz := date_trunc('second', now()) - interval '3 hours';
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  j json; jb jsonb; n int; n0 int; ctx jsonb;
begin
  select id into org_p from public.nx_orgs where tipo = 'plataforma' limit 1;
  perform pg_temp.ok(org_p is not null, 'fixture: org da plataforma');
  perform pg_temp.ok(exists (select 1 from public.nx_versao_banco where nome = '20261013c_operacao_indices'), 'versão registrada');
  -- plano 1000 (SV-140, 20261013e): o nx_disparar só chama https://<ref de 20>.supabase.co/functions/v1 — a URL de teste tem esse formato
  update public.nx_config set funcoes_url = coalesce(funcoes_url, 'https://abcdefghijklmnopqrst.supabase.co/functions/v1'),
                              cron_token = coalesce(cron_token, 'cron-28') where id = 1;
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status) values ('t28-a-' || sfx, 'Teste 28 A', org_p, 'interno', 'odonto', 'ativo') returning id into cA;
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status) values ('t28-b-' || sfx, 'Teste 28 B', org_p, 'interno', 'odonto', 'ativo') returning id into cB;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t28-sup-' || sfx || '@teste.local', 'Super 28', 'x', 'gestor', true, org_p) returning id into k_sup;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t28-adm-' || sfx || '@teste.local', 'Admin 28', 'x', 'clinica', true, org_p) returning id into k_adm;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_adm, cA, 'admin');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash(t_sup), k_sup, now() + interval '1 hour'), (public.nx_hash(t_adm), k_adm, now() + interval '1 hour');
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor) values (cA, 'Meta 28', 'pn-28-' || sfx, 'meta') returning id into kM;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Contato 28', pre || '00001') returning id into ct;

  -- ---------------------------------------------------------- SV-063 IA do relatório
  jb := public.nx_ia_reservar(cA, null, 'relatorio')::jsonb;
  perform pg_temp.ok((jb ->> 'ok')::boolean and (select acao from public.nx_ia_reservas where id = (jb ->> 'reserva_id')::uuid) = 'relatorio',
    'relatório reserva a IA sem conta (acao relatorio) ' || jb::text);
  perform pg_temp.ok(public.nx_ia_reservar(cA, null, 'sugerir') ->> 'erro' = 'dados_invalidos', 'sugerir sem conta continua recusado');
  perform pg_temp.ok(pg_temp.erro(format('insert into public.nx_ia_uso (cliente_id, acao, modelo, ok) values (%L, %L, %L, true)', cA, 'relatorio', 'm')) = 'ok',
    'nx_ia_uso aceita a ação relatorio');

  -- ---------------------------------------------------------- SV-116 primeira_entrada_em
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, ultima_entrada_em, ultima_msg_em)
    values (cA, kM, ct, '2026-28a' || sfx, 'aberta', t0, t0) returning id into cv;
  perform pg_temp.ok((select primeira_entrada_em from public.nx_conversas where id = cv) = t0, 'insert: 1ª entrada = ultima_entrada_em');
  update public.nx_conversas set ultima_entrada_em = t0 + interval '1 hour' where id = cv;
  perform pg_temp.ok((select primeira_entrada_em from public.nx_conversas where id = cv) = t0, 'mensagem nova não mexe na 1ª entrada');
  update public.nx_conversas set ultima_entrada_em = t0 - interval '1 hour' where id = cv;
  perform pg_temp.ok((select primeira_entrada_em from public.nx_conversas where id = cv) = t0 - interval '1 hour', 'mensagem recuperada mais antiga vira a 1ª (least)');
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, ultima_msg_em)
    values (cA, kM, ct, '2026-28b' || sfx, 'resolvida', t0) returning id into cv2;
  perform pg_temp.ok((select primeira_entrada_em from public.nx_conversas where id = cv2) is null, 'sem entrada: nula');
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status, criado_em)
    values (cA, cv2, ct, kM, 'in', 'texto', 'antiga 28', 'recebida', t0 - interval '2 days');
  update public.nx_conversas set ultima_entrada_em = t0 - interval '1 day' where id = cv2;   -- o gatilho grava…
  update public.nx_conversas set primeira_entrada_em = null where id = cv2;                   -- …e simulamos a conversa antiga sem a coluna
  n := public.nx_conversas_primeira_preencher(50000);
  perform pg_temp.ok(n >= 1 and (select primeira_entrada_em from public.nx_conversas where id = cv2) = t0 - interval '2 days',
    'preencher: a 1ª mensagem recebida de verdade (' || n || ')');

  -- ---------------------------------------------------------- SV-150 pausa geral
  insert into public.nx_envios_fila (cliente_id, conversa_id, tipo, texto, origem, enviar_em) values (cA, cv, 'texto', 'f28a', 'automacao', now() - interval '1 minute') returning id into f1;
  update public.nx_clientes set envios_pausados = true where id = cA;
  perform pg_temp.ok(json_array_length(public.nx_fila_pegar(20, array[f1])) = 0
                 and (select status from public.nx_envios_fila where id = f1) = 'pendente'
                 and (select tentativas from public.nx_envios_fila where id = f1) = 0, 'cliente pausado: o item espera (nada cancelado, nenhuma tentativa)');
  perform pg_temp.ok(not exists (select 1 from json_array_elements(public.nx_fila_pegar(100, null)) x where (x ->> 'id')::bigint = f1), 'pausado também na rodada geral');
  perform pg_temp.ok(public.nx_envios_pausado(cA) and not public.nx_envios_pausado(cB), 'nx_envios_pausado por cliente');
  update public.nx_clientes set envios_pausados = false where id = cA;
  update public.nx_operacao set envios_pausados = true where id = 1;
  perform pg_temp.ok(json_array_length(public.nx_fila_pegar(20, array[f1])) = 0 and public.nx_envios_pausado(cB), 'plataforma pausada: nada sai');
  perform pg_temp.ok(public.nx_auto_ia_pegar(null, 5)::text = '[]', 'plataforma pausada: nenhuma decisão de IA');
  update public.nx_operacao set envios_pausados = false where id = 1;
  perform pg_temp.ok(json_array_length(public.nx_fila_pegar(20, array[f1])) = 1, 'sem pausa: o item sai');
  -- RPC de plataforma (com auditoria)
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_envios_pausar(%L,%L,true,%L)', t_adm, cA, 'x')) <> 'ok' and not (select envios_pausados from public.nx_clientes where id = cA), 'admin do cliente não pausa');
  jb := public.nx_envios_pausar(t_sup, cA, true, 'incidente 28')::jsonb;
  perform pg_temp.ok((jb ->> 'pausado')::boolean and (select envios_pausados from public.nx_clientes where id = cA)
                 and exists (select 1 from public.nx_auditoria where cliente_id = cA and acao = 'envios_pausados'), 'super pausa o cliente (auditado)');
  jb := public.nx_envios_pausar(t_sup, null, true, 'incidente geral 28')::jsonb;
  perform pg_temp.ok(jb ->> 'escopo' = 'plataforma' and (select envios_pausados and motivo = 'incidente geral 28' and por = k_sup from public.nx_operacao where id = 1),
    'super pausa a plataforma (motivo e quem)');
  perform public.nx_envios_pausar(t_sup, null, false, null);
  perform public.nx_envios_pausar(t_sup, cA, false, null);

  -- ---------------------------------------------------------- SV-122 travas · SV-109/124 faxina em lotes
  insert into public.nx_travas (nome, ate, dono) values ('t28-vencida-' || sfx, now() - interval '2 days', 't28');
  perform public.nx_trava_pegar('t28-outra-' || sfx, 60, 't28');
  perform pg_temp.ok(exists (select 1 from public.nx_travas where nome = 't28-vencida-' || sfx), 'pegar trava não faz mais a faxina das vencidas (SV-122)');
  perform pg_temp.ok(not public.nx_trava_pegar('t28-outra-' || sfx, 60, 't28') and public.nx_trava_pegar('t28-vencida-' || sfx, 60, 't28'),
    'trava viva continua recusando; vencida é retomada');
  insert into public.nx_travas (nome, ate, dono) select 't28-lote-' || sfx || '-' || g, now() - interval '3 days', 't28' from generate_series(1, 25) g;
  n := public.nx_saas_faxina_lotes('nx_travas', format('nome like %L and ate < now() - interval %L', 't28-lote-' || sfx || '-%', '1 day'), 10, 50);
  perform pg_temp.ok(n = 25 and not exists (select 1 from public.nx_travas where nome like 't28-lote-' || sfx || '-%'), 'faxina em lotes de 10: 25 linhas em 3 lotes (' || n || ')');
  perform pg_temp.ok(pg_temp.erro($q$select public.nx_saas_faxina_lotes('nx_contas', 'true')$q$) = 'tabela_invalida', 'faxina só nas tabelas dela');
  insert into public.nx_rastreio (cliente_id, codigo, criado_em) values (cA, 'BBBBB', now() - interval '50 days'), (cA, 'CCCCC', now() - interval '10 days');
  insert into public.nx_travas (nome, ate, dono) values ('t28-velha-' || sfx, now() - interval '2 days', 't28');
  jb := public.nx_saas_faxina()::jsonb;
  perform pg_temp.ok(not exists (select 1 from public.nx_rastreio where cliente_id = cA and codigo = 'BBBBB')
                 and exists (select 1 from public.nx_rastreio where cliente_id = cA and codigo = 'CCCCC')
                 and not exists (select 1 from public.nx_travas where nome = 't28-velha-' || sfx)
                 and (jb ->> 'rastreio')::int >= 1 and (jb ->> 'travas')::int >= 1 and jb ? 'eventos' and jb ? 'login_falhas' and jb ? 'primeira_entrada',
    'faxina: rastreio > 45 dias, travas vencidas, chaves antigas e novas na resposta ' || jb::text);

  -- ---------------------------------------------------------- SV-081 renomear · SV-080 zerar ausentes
  insert into public.nx_metricas_dia (cliente_id, plataforma, data, nivel, campanha_ext, campanha_nome, anuncio_ext, anuncio_nome, impressoes, cliques, gasto, conversoes) values
    (cA, 'meta', hoje - 40, 'campanha', 'c1', 'Nome velho', '', null, 100, 5, 10, 1),
    (cA, 'meta', hoje - 40, 'anuncio', 'c1', 'Nome velho', 'a1', 'Anúncio velho', 100, 5, 10, 1),
    (cA, 'meta', hoje - 2, 'campanha', 'c1', 'Nome novo', '', null, 100, 5, 10, 1),
    (cA, 'meta', hoje - 2, 'campanha', 'c2', 'Some', '', null, 50, 2, 7, 1),
    (cA, 'meta', hoje - 3, 'campanha', 'c2', 'Some', '', null, 50, 2, 7, 1),
    (cA, 'meta', hoje - 20, 'campanha', 'c2', 'Some', '', null, 50, 2, 7, 1),
    (cA, 'google', hoje - 2, 'campanha', 'g1', 'Google', '', null, 50, 2, 7, 1);
  n := public.nx_metricas_renomear(cA, hoje - 7, jsonb_build_array(
         jsonb_build_object('tipo', 'campanha', 'plataforma', 'meta', 'ext', 'c1', 'nome', 'Nome novo'),
         jsonb_build_object('tipo', 'anuncio', 'plataforma', 'meta', 'ext', 'a1', 'nome', 'Anúncio novo')));
  perform pg_temp.ok(n = 3 and (select count(*) from public.nx_metricas_dia where cliente_id = cA and campanha_ext = 'c1' and campanha_nome = 'Nome novo') = 3
                 and (select anuncio_nome from public.nx_metricas_dia where cliente_id = cA and nivel = 'anuncio' and anuncio_ext = 'a1') = 'Anúncio novo',
    'renomear: o mapa inteiro numa chamada, só nos dias antes da janela (' || n || ')');
  perform pg_temp.ok(public.nx_metricas_renomear(cA, hoje - 7, '[]'::jsonb) = 0, 'mapa vazio: nada');
  n := public.nx_metricas_zerar_ausentes(cA, 'meta', hoje - 6, hoje, jsonb_build_array(
         jsonb_build_object('nivel', 'campanha', 'data', hoje - 2, 'campanha_ext', 'c1', 'anuncio_ext', '')));
  perform pg_temp.ok(n = 2
                 and (select sum(gasto) from public.nx_metricas_dia where cliente_id = cA and plataforma = 'meta' and campanha_ext = 'c2' and data >= hoje - 6) = 0
                 and (select gasto from public.nx_metricas_dia where cliente_id = cA and campanha_ext = 'c2' and data = hoje - 20) = 7
                 and (select gasto from public.nx_metricas_dia where cliente_id = cA and campanha_ext = 'c1' and data = hoje - 2 and nivel = 'campanha') = 10
                 and (select gasto from public.nx_metricas_dia where cliente_id = cA and plataforma = 'google') = 7
                 and (select campanha_nome from public.nx_metricas_dia where cliente_id = cA and campanha_ext = 'c2' and data = hoje - 2) = 'Some',
    'zerar: só o que não veio, só na janela, só a plataforma lida; a linha e o nome ficam (' || n || ')');
  perform pg_temp.ok(public.nx_metricas_zerar_ausentes(cA, 'meta', hoje - 60, hoje, '[]'::jsonb) = 0
                 and (select gasto from public.nx_metricas_dia where cliente_id = cA and campanha_ext = 'c2' and data = hoje - 20) = 7,
    'leitura vazia nunca zera a janela');

  -- ---------------------------------------------------------- SV-197 relatório por cliente · SV-125 crons
  n0 := pg_temp.disparos('%/nx-relatorio', '%' || cA::text || '%');
  n := public.nx_relatorio_chamar('diario');
  perform pg_temp.ok(n >= 2 and pg_temp.disparos('%/nx-relatorio', '%' || cA::text || '%') = n0 + 1
                 and pg_temp.disparos('%/nx-relatorio', '%' || cB::text || '%') >= 1, 'um disparo do nx-relatorio por cliente apto (' || n || ')');
  perform pg_temp.ok(pg_temp.erro($q$select public.nx_relatorio_chamar('semanal')$q$) = 'dados_invalidos|tipo', 'tipo inválido');
  perform pg_temp.ok((select count(*) from cron.job where jobname in ('nx-relatorio-diario', 'nx-relatorio-diario-2') and command like '%nx_relatorio_chamar(''diario'')%') = 2
                 and (select count(*) from cron.job where jobname in ('nx-relatorio-mensal', 'nx-relatorio-mensal-2', 'nx-relatorio-mensal-3') and command like '%nx_relatorio_chamar(''mensal'')%') = 3,
    'crons dos relatórios declarados e chamando nx_relatorio_chamar');
  perform pg_temp.ok((select count(*) from cron.job where jobname in ('nx-ciclo', 'nx-fila', 'nx-faxina-saas', 'nx-faxina-auto', 'nx-codewords-sync', 'nx-automacoes')) = 6,
    'os outros crons do repositório existem');

  -- ---------------------------------------------------------- SV-126 saúde
  insert into public.nx_envios_fila (cliente_id, conversa_id, tipo, texto, origem, enviar_em) values (cA, cv, 'texto', 'f28b', 'automacao', now() - interval '2 hours') returning id into f2;
  jb := public.nx_saude(t_sup)::jsonb;
  perform pg_temp.ok(jb ? 'tarefas' and jb ? 'cron_falhas_24h' and jb ? 'http_falhas_24h' and (jb ->> 'fila_atrasada')::int >= 1
                 and jsonb_typeof(jb -> 'problemas') = 'array'
                 and exists (select 1 from jsonb_array_elements_text(jb -> 'problemas') p where p like '%fila atrasadas%'), 'nx_saude: fila atrasada vira problema ' || left(jb::text, 400));
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(jb -> 'tarefas') t where t ->> 'tarefa' = 'nx-ciclo' and t ? 'atrasada'), 'tarefas com o prazo esperado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_saude(%L)', t_adm)) <> 'ok', 'nx_saude só da plataforma');

  -- ---------------------------------------------------------- SV-051 (confirmação) sem o módulo de conversas o contexto de envio recusa
  ctx := public.nx_fn_ctx(t_adm, cA, 'atendente')::jsonb;
  update public.nx_clientes set modulos = array_remove(modulos, 'conversas') where id = cA;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_contexto_envio(%L::jsonb,%L,%s)', ctx, cA, cv)) like 'modulo_desligado%',
    'texto/mídia/modelo/lido/reenviar passam por nx_cv_contexto_envio, que recusa sem o módulo');
  update public.nx_clientes set modulos = array_append(modulos, 'conversas') where id = cA;

  -- ---------------------------------------------------------- índices e permissões
  perform pg_temp.ok((select count(*) from pg_indexes where schemaname = 'public' and indexname in (
      'nx_conversas_lista_ordem', 'nx_conversas_aguardando', 'nx_conversas_nao_lidas', 'nx_contatos_tel_trgm', 'nx_metricas_anuncio',
      'nx_execucoes_tarefa', 'nx_travas_ate', 'nx_rastreio_criado', 'nx_mensagens_enviado_por', 'nx_historico_autor', 'nx_conversas_atribuida',
      'nx_conversas_resolvida_por', 'nx_conversas_ia_pausada_conta', 'nx_notas_autor', 'nx_tarefas_dono', 'nx_tarefas_criado_por')) = 16, 'os 16 índices');
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_saude(text)', 'execute')
                 and not has_function_privilege('authenticated', 'public.nx_saude(text)', 'execute')
                 and has_function_privilege('anon', 'public.nx_envios_pausar(text,uuid,boolean,text)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_saude_dados()', 'execute')
                 and not has_function_privilege('anon', 'public.nx_metricas_zerar_ausentes(uuid,text,date,date,jsonb)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_metricas_renomear(uuid,date,jsonb)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_relatorio_chamar(text)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_saas_faxina_lotes(text,text,int,int)', 'execute')
                 and has_function_privilege('anon', 'public.nx_rastreio_registrar(text,jsonb)', 'execute')
                 and has_function_privilege('service_role', 'public.nx_saude_dados()', 'execute'),
    'permissões: internas só service_role; RPCs de plataforma pela chave pública; o rastreio continua público');
  raise exception 'OK_28_OPERACAO_INDICES — IA do relatório, 1ª entrada, pausa geral, travas e faxina em lotes, renomear/zerar métricas, relatório por cliente, crons, nx_saude, módulo no envio, índices';
end $t$;
rollback;
