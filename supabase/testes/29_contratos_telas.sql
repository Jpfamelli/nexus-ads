-- ============================================================
-- ÓRBITA — supabase/testes/29_contratos_telas.sql · smoke de 20261013d_contratos_telas.sql (plano 1000, frente srv, lote srv-2)
--   SV-110 nx_cv_listar sem janela (ordem, página, «Aguardando», busca) · CA-247 quem mandou a última saída · CA-001 marcar lida
--   AS-145 horário que cruza a meia-noite · nx_cv_base.departamentos.horario · CR-217 agendados sem data · CR-204 movido_por ·
--   nx_dados.agora / ultimo_sync_parcial / hora_conversa pela primeira_entrada_em
-- Roda em begin … rollback; termina em raise exception 'OK_29_…'.
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
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  cA uuid; k_adm uuid; k_at uuid; k_le uuid; k_col uuid; dep uuid;
  t_adm text := 'tok-29-adm-' || sfx; t_at text := 'tok-29-at-' || sfx; t_le text := 'tok-29-le-' || sfx;
  f uuid; e_nova uuid; e_ag uuid; kM uuid; ct bigint; ct2 bigint; ct3 bigint; ct4 bigint; cv1 bigint; cv2 bigint; cv3 bigint; cv4 bigint;
  l1 bigint; l2 bigint; l3 bigint;
  tel text := '5512996' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  t0 timestamptz := date_trunc('second', now());
  j json; jb jsonb; it jsonb; n int;
begin
  perform pg_temp.ok(exists (select 1 from public.nx_versao_banco where nome = '20261013d_contratos_telas'), 'versão registrada');
  -- ---------------------------------------------------------- fixtures
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-29-' || sfx, 'Teste 29', 'odonto') returning id into cA;
  select id into f from public.nx_funis where cliente_id = cA and padrao limit 1;
  update public.nx_funis set conta_no_ads = true where id = f;
  select id into e_nova from public.nx_estagios where cliente_id = cA and funil_id = f and marco = 'nova' limit 1;
  select id into e_ag from public.nx_estagios where cliente_id = cA and funil_id = f and marco = 'agendada' and tipo = 'aberto' limit 1;
  perform pg_temp.ok(f is not null and e_nova is not null and e_ag is not null, 'fixture: funil padrão com nova/agendada');
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-29-adm-' || sfx || '@teste.local', 'Admin 29', 'x', 'clinica', true) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-29-at-' || sfx || '@teste.local', 'Atendente 29', 'x', 'clinica', true) returning id into k_at;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-29-le-' || sfx || '@teste.local', 'Leitura 29', 'x', 'clinica', true) returning id into k_le;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-29-col-' || sfx || '@teste.local', 'Colega Souza', 'x', 'clinica', true) returning id into k_col;
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas) values
    (k_adm, cA, 'admin', true), (k_at, cA, 'atendente', true), (k_le, cA, 'leitura', true), (k_col, cA, 'atendente', true);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(t_adm), k_adm, now() + interval '1 hour'),
    (public.nx_hash(t_at), k_at, now() + interval '1 hour'), (public.nx_hash(t_le), k_le, now() + interval '1 hour');
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor) values (cA, 'Meta 29', 'pn-29-' || sfx, 'meta') returning id into kM;
  insert into public.nx_departamentos (cliente_id, nome, horario) values (cA, 'Recepção 29', '{"1":[["08:00","18:00"]]}'::jsonb) returning id into dep;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Ana 29', tel) returning id into ct;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Bruno 29', '5512995' || right(tel, 6)) returning id into ct2;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Carla 29', '5512994' || right(tel, 6)) returning id into ct3;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Davi 29', '5512993' || right(tel, 6)) returning id into ct4;
  -- cv1: aguardando há 3 h (sem dono) · cv2: aguardando há 1 h, do atendente · cv3: aberta, última saída da IA · cv4: última saída do colega
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, nao_lidas, ultima_entrada_em, ultima_msg_em, ultima_msg_dir)
    values (cA, kM, ct, '2026-29a' || sfx, 'aberta', true, 2, t0 - interval '3 hours', t0 - interval '3 hours', 'in') returning id into cv1;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, nao_lidas, atribuida_a, ultima_entrada_em, ultima_msg_em, ultima_msg_dir)
    values (cA, kM, ct2, '2026-29b' || sfx, 'aberta', true, 4, k_at, t0 - interval '1 hour', t0 - interval '1 hour', 'in') returning id into cv2;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, ultima_entrada_em, ultima_msg_em, ultima_msg_dir)
    values (cA, kM, ct3, '2026-29c' || sfx, 'aberta', false, t0 - interval '2 hours', t0 - interval '10 minutes', 'out') returning id into cv3;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, ultima_entrada_em, ultima_msg_em, ultima_msg_dir)
    values (cA, kM, ct4, '2026-29d' || sfx, 'pendente', false, t0 - interval '5 hours', t0 - interval '20 minutes', 'out') returning id into cv4;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status, origem, enviado_por, criado_em) values
    (cA, cv3, ct3, kM, 'out', 'texto', 'resposta humana antiga', 'entregue', 'painel', k_at, t0 - interval '30 minutes'),
    (cA, cv3, ct3, kM, 'out', 'texto', 'resposta da IA', 'entregue', 'ia', null, t0 - interval '10 minutes'),
    (cA, cv4, ct4, kM, 'out', 'texto', 'oi do colega', 'entregue', 'painel', k_col, t0 - interval '20 minutes'),
    (cA, cv4, ct4, kM, 'out', 'nota', 'nota interna depois', 'entregue', 'painel', k_adm, t0 - interval '19 minutes');

  -- ---------------------------------------------------------- SV-110 nx_cv_listar sem janela + CA-247
  jb := public.nx_cv_listar(t_adm, cA, '{"aba":"abertas"}'::jsonb, 50, null)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb -> 'itens') = 3 and not (jb ->> 'tem_mais')::boolean
                 and (jb -> 'itens' -> 0 ->> 'id')::bigint = cv3 and (jb -> 'itens' -> 1 ->> 'id')::bigint = cv2 and (jb -> 'itens' -> 2 ->> 'id')::bigint = cv1,
    'abertas: mais recente primeiro ' || (jb -> 'itens')::text);
  select x into it from jsonb_array_elements(jb -> 'itens') x where (x ->> 'id')::bigint = cv3;
  perform pg_temp.ok(it ->> 'ultima_msg_origem' = 'ia' and it ? 'ultima_msg_por' and it -> 'ultima_msg_por' = 'null'::jsonb, 'última saída da IA → origem ia ' || it::text);
  select x into it from jsonb_array_elements(jb -> 'itens') x where (x ->> 'id')::bigint = cv1;
  perform pg_temp.ok(it -> 'ultima_msg_origem' = 'null'::jsonb, 'última mensagem do cliente: sem origem de saída');
  jb := public.nx_cv_listar(t_adm, cA, '{"aba":"pendentes"}'::jsonb, 50, null)::jsonb;
  perform pg_temp.ok((jb -> 'itens' -> 0 ->> 'ultima_msg_por')::uuid = k_col and jb -> 'itens' -> 0 ->> 'ultima_msg_por_nome' = 'Colega Souza'
                 and jb -> 'itens' -> 0 ->> 'ultima_msg_origem' = 'painel', 'última saída do colega (a nota interna não conta) ' || (jb -> 'itens' -> 0)::text);
  jb := public.nx_cv_listar(t_adm, cA, '{"aba":"aguardando"}'::jsonb, 1, null)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb -> 'itens') = 1 and (jb ->> 'tem_mais')::boolean and (jb -> 'itens' -> 0 ->> 'id')::bigint = cv1,
    'aguardando: quem espera há mais tempo primeiro, com tem_mais');
  jb := public.nx_cv_listar(t_adm, cA, '{"aba":"aguardando"}'::jsonb, 1, (jb -> 'itens' -> 0 ->> 'ultima_entrada_em')::timestamptz)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb -> 'itens') = 1 and not (jb ->> 'tem_mais')::boolean and (jb -> 'itens' -> 0 ->> 'id')::bigint = cv2, 'aguardando: página 2');
  jb := public.nx_cv_listar(t_adm, cA, '{"aba":"abertas"}'::jsonb, 2, null)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb -> 'itens') = 2 and (jb ->> 'tem_mais')::boolean, 'abertas: limite + tem_mais');
  jb := public.nx_cv_listar(t_adm, cA, '{"aba":"abertas"}'::jsonb, 2, (jb -> 'itens' -> 1 ->> 'ultima_msg_em')::timestamptz)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb -> 'itens') = 1 and (jb -> 'itens' -> 0 ->> 'id')::bigint = cv1, 'abertas: página 2');
  jb := public.nx_cv_listar(t_adm, cA, jsonb_build_object('aba', 'resolvidas', 'busca', tel), 50, null)::jsonb;
  perform pg_temp.ok((jb ->> 'busca')::boolean and exists (select 1 from jsonb_array_elements(jb -> 'itens') x where (x ->> 'id')::bigint = cv1)
                 and not exists (select 1 from jsonb_array_elements(jb -> 'itens') x where (x ->> 'id')::bigint = cv3), 'busca por telefone em todos os atendimentos');
  jb := public.nx_cv_listar(t_adm, cA, '{"aba":"minhas"}'::jsonb, 50, null)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb -> 'itens') = 0 and (jb -> 'contagens' ->> 'aguardando')::int = 2 and (jb -> 'contagens' ->> 'abertas')::int = 3,
    'minhas (do admin): nenhuma; contagens como antes');

  -- ---------------------------------------------------------- CA-001 marcar lida
  jb := public.nx_cv_marcar_lida(t_le, cA, cv1)::jsonb;
  perform pg_temp.ok((jb ->> 'ignorado')::boolean and (select nao_lidas from public.nx_conversas where id = cv1) = 2, 'leitura: não zera');
  jb := public.nx_cv_marcar_lida(t_adm, cA, cv2)::jsonb;
  perform pg_temp.ok((jb ->> 'ignorado')::boolean and (select nao_lidas from public.nx_conversas where id = cv2) = 4, 'admin abrindo a conversa do atendente: não zera');
  jb := public.nx_cv_marcar_lida(t_at, cA, cv2)::jsonb;
  perform pg_temp.ok(not (jb ->> 'ignorado')::boolean and (select nao_lidas from public.nx_conversas where id = cv2) = 0, 'o dono zera');
  jb := public.nx_cv_marcar_lida(t_adm, cA, cv1)::jsonb;
  perform pg_temp.ok(not (jb ->> 'ignorado')::boolean and (select nao_lidas from public.nx_conversas where id = cv1) = 0, 'conversa sem dono: quem atende zera');

  -- ---------------------------------------------------------- AS-145 horário que passa da meia-noite
  jb := public.nx_cv_horario_normalizar('{"1":[["08:00","12:00"],["22:00","02:00"]],"5":[["20:00","01:30"]]}'::jsonb);
  perform pg_temp.ok(jb -> '1' = '[["08:00","12:00"],["22:00","02:00"]]'::jsonb and jb -> '5' = '[["20:00","01:30"]]'::jsonb, 'faixa noturna como a última do dia ' || jb::text);
  perform pg_temp.ok(pg_temp.erro($q$select public.nx_cv_horario_normalizar('{"1":[["22:00","02:00"],["08:00","12:00"]]}'::jsonb)$q$) = 'dados_invalidos|horario', 'noturna antes de outra faixa: recusa');
  perform pg_temp.ok(pg_temp.erro($q$select public.nx_cv_horario_normalizar('{"1":[["10:00","10:00"]]}'::jsonb)$q$) = 'dados_invalidos|horario', 'início = fim: recusa');
  perform pg_temp.ok(public.nx_horario_aberto(jb, ((date '2026-10-12')::timestamp + time '23:30') at time zone 'America/Sao_Paulo')
                 and public.nx_horario_aberto(jb, ((date '2026-10-13')::timestamp + time '01:30') at time zone 'America/Sao_Paulo')
                 and not public.nx_horario_aberto(jb, ((date '2026-10-13')::timestamp + time '03:00') at time zone 'America/Sao_Paulo'),
    'o horário salvo é lido pelo nx_horario_aberto (segunda 22h até terça 02h)');

  -- ---------------------------------------------------------- nx_cv_base: horário dos departamentos para todos
  jb := public.nx_cv_base(t_at, cA)::jsonb;
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(jb -> 'departamentos') d where (d ->> 'id')::uuid = dep and d -> 'horario' = '{"1":[["08:00","18:00"]]}'::jsonb)
                 and jb -> 'config' = 'null'::jsonb, 'atendente recebe o horário (e continua sem a config de admin)');

  -- ---------------------------------------------------------- CR-217 agendados sem data · CR-204 movido_por
  insert into public.nx_leads (cliente_id, contato_id, funil_id, estagio_id, titulo, nome, status, etapa, data_conversa)
    values (cA, ct, f, e_ag, 'Sem data 29', 'Ana 29', 'aberto', 'agendada', hoje) returning id into l1;
  insert into public.nx_leads (cliente_id, contato_id, funil_id, estagio_id, titulo, nome, status, etapa, data_conversa, consulta_em, data_agenda)
    values (cA, ct2, f, e_ag, 'Com data 29', 'Bruno 29', 'aberto', 'agendada', hoje, now() + interval '1 day', hoje + 1) returning id into l2;
  insert into public.nx_leads (cliente_id, contato_id, funil_id, estagio_id, titulo, nome, status, etapa, data_conversa)
    values (cA, ct3, f, e_nova, 'Nova 29', 'Carla 29', 'aberto', 'nova', hoje) returning id into l3;
  jb := public.nx_inicio(t_adm, cA)::jsonb;
  perform pg_temp.ok((jb -> 'agendados_sem_data' ->> 'total')::int = 1 and (jb -> 'agendados_sem_data' -> 'itens' -> 0 ->> 'id')::bigint = l1
                 and jb -> 'agendados_sem_data' -> 'itens' -> 0 ->> 'contato_nome' = 'Ana 29', 'Início: agendados sem data ' || (jb -> 'agendados_sem_data')::text);
  perform pg_temp.ok(jb ? 'conversas' and jb ? 'series_14d' and jb ? 'agora', 'Início: o resto da resposta continua');
  insert into public.nx_historico (cliente_id, contato_id, negocio_id, tipo, dados, autor_id, criado_em) values
    (cA, ct3, l3, 'estagio', '{}'::jsonb, k_adm, now() - interval '1 hour'),
    (cA, ct3, l3, 'estagio', '{}'::jsonb, k_col, now() - interval '5 minutes');
  jb := public.nx_negocios_kanban(t_adm, cA, f)::jsonb;
  select c into it from jsonb_array_elements(jb -> 'colunas') col, jsonb_array_elements(col -> 'itens') c where (c ->> 'id')::bigint = l3;
  perform pg_temp.ok(it ->> 'movido_por' = 'Colega Souza' and (it ->> 'movido_por_id')::uuid = k_col and it ? 'movido_em', 'quadro: quem moveu por último ' || it::text);
  select c into it from jsonb_array_elements(jb -> 'colunas') col, jsonb_array_elements(col -> 'itens') c where (c ->> 'id')::bigint = l1;
  perform pg_temp.ok(it ? 'movido_por' and it -> 'movido_por' = 'null'::jsonb, 'sem troca registrada: movido_por nulo');

  -- ---------------------------------------------------------- nx_dados: agora, ultimo_sync_parcial, hora_conversa pela coluna
  insert into public.nx_integracoes (cliente_id, canal, ativo, ultimo_sync, ultimo_sync_parcial, status)
    values (cA, 'meta', true, now() - interval '5 hours', now() - interval '10 minutes', 'parcial — teto');
  update public.nx_conversas set negocio_id = l3 where id = cv3;
  update public.nx_conversas set primeira_entrada_em = (hoje::timestamp + time '10:05') at time zone 'America/Sao_Paulo' where id = cv3;
  jb := public.nx_dados(t_adm, cA, 30)::jsonb;
  perform pg_temp.ok(abs(extract(epoch from (jb ->> 'agora')::timestamptz - now())) < 5, 'nx_dados.agora');
  perform pg_temp.ok(jb -> 'integracoes' -> 0 ? 'ultimo_sync_parcial' and (jb -> 'integracoes' -> 0 ->> 'ultimo_sync_parcial') is not null, 'integrações com ultimo_sync_parcial');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(jb -> 'leads') x where (x ->> 'id')::bigint = l3 and (x ->> 'hora_conversa')::int = 10),
    'hora_conversa pela 1ª entrada da conversa (coluna)');
  raise exception 'OK_29_CONTRATOS_TELAS — lista sem janela, quem mandou a última saída, marcar lida só de quem atende, horário noturno, horário para todos, agendados sem data, movido_por, nx_dados.agora';
end $t$;
rollback;
