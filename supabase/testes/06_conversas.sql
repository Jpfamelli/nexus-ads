-- ============================================================
-- ÓRBITA — supabase/testes/06_conversas.sql · frente F5
-- Smoke do arquivo e (20260928e_conversas.sql): números (canal único +
-- wa_phone_number_id, segredos no Vault, numero_em_uso, excluir),
-- visibilidade (atendente sem ver_todas não vê conversa de colega),
-- abas e contagens, busca, atribuir (mensagem de sistema + notificação),
-- resolver/reabrir (ja_existe_aberta), notas, etiquetas, nx_cv_nova
-- (canal/contato de outro cliente, telefone novo, janela real),
-- mensagens (página e delta com COMMIT ATRASADO), marcar lida,
-- vincular negócio, rodízio e manter_atendente (nx_cv_distribuir),
-- respostas rápidas, isolamento por id, módulo desligado, permissões e
-- P0-B (arquivo e_b): base.config, departamentos e horários (um só padrão,
-- excluir move para o padrão), busca nas mensagens (visibilidade), IA e
-- preferências; TEMPO (5.000 contatos, 5.000 negócios, 20.000 mensagens: < 2 s).
-- Roda pelo execute_sql em begin … rollback. O bloco principal SEMPRE
-- termina em exceção (rollback garantido):
--   'OK_06_CONVERSAS …tempos…'  = todos os casos passaram
--   'FALHOU: <caso>'            = falha
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

-- ids (bigint) dos itens de um retorno {itens:[{id…}]}
create or replace function pg_temp.ids(j json) returns bigint[] language sql as $f$
  select coalesce(array_agg((x ->> 'id')::bigint order by (x ->> 'id')::bigint), '{}')
    from json_array_elements(j -> 'itens') x
$f$;

do $t$
declare
  cA uuid; cB uuid; cT uuid;
  dep_rec uuid; dep_com uuid; dep_b uuid;
  k_adm uuid; k_a1 uuid; k_a2 uuid; k_sup uuid; k_le uuid; k_admb uuid;
  ch uuid; chB uuid; chT uuid;
  j json; jb jsonb; e text; n int; n2 int;
  ct1 bigint; ct2 bigint; ct3 bigint; ct4 bigint; ct6 bigint; ct7 bigint; ct8 bigint; ctB bigint; ctN bigint;
  cv1 bigint; cv2 bigint; cv3 bigint; cv4 bigint; cv5 bigint; cv6 bigint; cv7 bigint; cv8 bigint; cvB bigint; cvN bigint; cvO bigint; cvx bigint;
  m1 bigint; m2 bigint; mA bigint; mB bigint; mC bigint; mO bigint; mX bigint;
  dep_fin uuid; ct9 bigint; cv9 bigint; ids_ch bigint[];
  etq uuid; etqB uuid; neg1 bigint; neg2 bigint; negB bigint; rid uuid; ridB uuid;
  sec1 uuid; sec2 uuid;
  t0 timestamptz; ms numeric; v_log text := '';
  ts timestamptz;
begin
  -- ---------------------------------------------------------- clientes, departamentos, contas
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-f5-a', 'Teste F5 A', 'odonto') returning id into cA;
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-f5-b', 'Teste F5 B', 'odonto') returning id into cB;
  select id into dep_rec from public.nx_departamentos where cliente_id = cA and padrao and distribuicao = 'rodizio';
  select id into dep_com from public.nx_departamentos where cliente_id = cA and nome = 'Comercial' and distribuicao = 'manual';
  select id into dep_b from public.nx_departamentos where cliente_id = cB and padrao;
  perform pg_temp.ok(dep_rec is not null and dep_com is not null and dep_b is not null, 'modelo odonto: Recepção (rodízio) e Comercial (manual)');

  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f5-adm@teste.local', 'Admin F5', 'x', 'clinica', true) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f5-a1@teste.local', 'Ana F5', 'x', 'clinica', true) returning id into k_a1;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f5-a2@teste.local', 'Beto F5', 'x', 'clinica', true) returning id into k_a2;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f5-sup@teste.local', 'Sueli F5', 'x', 'clinica', true) returning id into k_sup;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f5-le@teste.local', 'Leo F5', 'x', 'clinica', true) returning id into k_le;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f5-admb@teste.local', 'Admin B F5', 'x', 'clinica', true) returning id into k_admb;
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas, departamentos, recebe_conversas) values
    (k_adm, cA, 'admin', true, '{}', false),
    (k_a1, cA, 'atendente', false, array[dep_rec], true),
    (k_a2, cA, 'atendente', false, array[dep_rec], true),
    (k_sup, cA, 'supervisor', true, array[dep_com], false),
    (k_le, cA, 'leitura', true, '{}', true),
    (k_admb, cB, 'admin', true, '{}', true);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash('tok-f5-adm'), k_adm, now() + interval '1 hour'), (public.nx_hash('tok-f5-a1'), k_a1, now() + interval '1 hour'),
    (public.nx_hash('tok-f5-a2'), k_a2, now() + interval '1 hour'), (public.nx_hash('tok-f5-sup'), k_sup, now() + interval '1 hour'),
    (public.nx_hash('tok-f5-le'), k_le, now() + interval '1 hour'), (public.nx_hash('tok-f5-admb'), k_admb, now() + interval '1 hour');

  -- ---------------------------------------------------------- números (nx_canais)
  perform pg_temp.ok(not exists (select 1 from public.nx_canais where cliente_id = cA), 'cliente novo sem canal');
  j := public.nx_canal_salvar('tok-f5-adm', cA, '{"nome":"Recepção","phone_number_id":"990000000501","waba_id":"990000000601","token":"EAAG-teste-token-f5-1234567890"}');
  ch := (j -> 'canal' ->> 'id')::uuid;
  perform pg_temp.ok((select count(*) from public.nx_canais where cliente_id = cA) = 1, 'nx_canal_salvar num cliente sem canal → exatamente UM nx_canais');
  perform pg_temp.ok((select wa_phone_number_id from public.nx_clientes where id = cA) = '990000000501', 'nx_canal_salvar preenche nx_clientes.wa_phone_number_id');
  perform pg_temp.ok(j -> 'webhook' ->> 'modo' = 'nexus' and position('?c=' in j -> 'webhook' ->> 'url') = 0
                     and j -> 'webhook' ->> 'verify_token' is null, 'sem app secret → webhook modo nexus, sem ?c= e sem verify token');
  perform pg_temp.ok((j -> 'canal' ->> 'tem_token')::boolean and not (j -> 'canal' ->> 'tem_app_secret')::boolean
                     and j -> 'canal' ->> 'status' = 'pendente', 'canal novo: tem_token, pendente');
  perform pg_temp.ok(position('EAAG' in j::text) = 0, 'token nunca volta na resposta');
  perform pg_temp.ok(public.nx_segredo_ler((select token_segredo from public.nx_canais where id = ch)) = 'EAAG-teste-token-f5-1234567890', 'token gravado no Vault');
  perform pg_temp.ok((select departamento_id from public.nx_canais where id = ch) = dep_rec, 'canal sem departamento cai no padrão');
  j := public.nx_canal_salvar('tok-f5-adm', cA, jsonb_build_object('id', ch, 'app_secret', 'abcdef0123456789abcdef0123456789'));
  perform pg_temp.ok(j -> 'webhook' ->> 'modo' = 'proprio'
                     and j -> 'webhook' ->> 'url' like '%/nx-whatsapp?c=' || (select chave_publica from public.nx_canais where id = ch)
                     and j -> 'webhook' ->> 'verify_token' = (select verify_token from public.nx_canais where id = ch),
                     'com app secret → modo proprio com ?c= e verify token do canal');
  perform pg_temp.ok(position('abcdef0123456789' in j::text) = 0, 'app secret nunca volta');
  update public.nx_canais set status = 'ativo', app_inscrito = true where id = ch;
  j := public.nx_canal_salvar('tok-f5-adm', cA, jsonb_build_object('id', ch, 'nome', 'Recepção principal'));
  perform pg_temp.ok(j -> 'canal' ->> 'status' = 'ativo' and j -> 'canal' ->> 'nome' = 'Recepção principal', 'renomear não derruba o status');
  j := public.nx_canal_salvar('tok-f5-adm', cA, jsonb_build_object('id', ch, 'waba_id', '990000000602'));
  perform pg_temp.ok(j -> 'canal' ->> 'status' = 'pendente' and j -> 'canal' ->> 'app_inscrito' is null, 'mudar waba_id volta para pendente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_canal_salvar(%L,%L,%L)', 'tok-f5-admb', cB,
                     '{"nome":"X","phone_number_id":"990000000501","waba_id":"990000000601"}')) = 'numero_em_uso|phone_number_id', 'número de outro cliente → numero_em_uso');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_canal_salvar(%L,%L,%L)', 'tok-f5-a1', cA,
                     '{"nome":"X","phone_number_id":"990000000509","waba_id":"990000000601"}')) = 'sem_permissao', 'atendente não configura número');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_canal_salvar(%L,%L,%L)', 'tok-f5-adm', cA,
                     '{"nome":"X","phone_number_id":"12a","waba_id":"990000000601"}')) = 'dados_invalidos|phone_number_id', 'phone_number_id inválido');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_canal_salvar(%L,%L,%L)', 'tok-f5-adm', cA,
                     jsonb_build_object('id', ch, 'coexistencia', 'talvez'))) = 'dados_invalidos|coexistencia', 'coexistencia não booleana → dados_invalidos (nunca erro cru)');
  j := public.nx_canal_salvar('tok-f5-admb', cB, '{"nome":"B","phone_number_id":"990000000502","waba_id":"990000000603"}');
  chB := (j -> 'canal' ->> 'id')::uuid;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_canal_salvar(%L,%L,%L)', 'tok-f5-adm', cA,
                     jsonb_build_object('id', chB, 'nome', 'roubado'))) = 'canal_nao_encontrado'
                     and (select nome from public.nx_canais where id = chB) = 'B', 'canal de outro cliente → canal_nao_encontrado e intacto');
  j := public.nx_canais_listar('tok-f5-adm', cA);
  perform pg_temp.ok(json_array_length(j) = 1 and (j -> 0 ->> 'id')::uuid = ch and position('EAAG' in j::text) = 0
                     and j -> 0 -> 'webhook' ->> 'modo' = 'proprio', 'nx_canais_listar: só os do cliente, sem segredo');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_canais_listar(%L,%L)', 'tok-f5-sup', cA)) = 'sem_permissao', 'supervisor não lista números');

  -- ---------------------------------------------------------- contatos e conversas (como o webhook da F2 grava)
  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id) values (cA, 'Maria Teste', '5512990000001', '5512990000001') returning id into ct1;
  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id) values (cA, 'João Teste', '5512990000002', '5512990000002') returning id into ct2;
  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id) values (cA, 'Carla Teste', '5512990000003', '5512990000003') returning id into ct3;
  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id) values (cA, 'Oculto Teste', '5512990000004', '5512990000004') returning id into ct4;
  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id) values (cB, 'Contato B', '5512990000009', '5512990000009') returning id into ctB;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, atribuida_a, protocolo, status, aguardando,
                                   nao_lidas, ultima_msg_em, ultima_msg_resumo, ultima_msg_dir, ultima_entrada_em)
  values (cA, ch, ct1, dep_rec, k_a1, '2026-900001', 'aberta', true, 2, now() - interval '1 hour', 'Oi', 'in', now() - interval '1 hour')
  returning id into cv1;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, atribuida_a, protocolo, status, aguardando,
                                   nao_lidas, ultima_msg_em, ultima_msg_resumo, ultima_msg_dir, ultima_entrada_em)
  values (cA, ch, ct2, dep_rec, null, '2026-900002', 'aberta', true, 1, now() - interval '2 hours', 'Bom dia', 'in', now() - interval '2 hours')
  returning id into cv2;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, atribuida_a, protocolo, status, aguardando,
                                   nao_lidas, ultima_msg_em, ultima_entrada_em)
  values (cA, ch, ct3, dep_com, k_a2, '2026-900003', 'pendente', false, 0, now() - interval '3 hours', now() - interval '3 hours')
  returning id into cv3;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, protocolo, status, aguardando, oculta,
                                   ultima_msg_em, ultima_entrada_em, resolvida_em)
  values (cA, ch, ct4, dep_rec, '2026-900004', 'resolvida', false, true, now() - interval '2 hours', now() - interval '2 hours', now() - interval '2 hours')
  returning id into cv4;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, protocolo, status)
  values (cB, chB, ctB, dep_b, '2026-900009', 'aberta') returning id into cvB;

  -- ---------------------------------------------------------- visibilidade, abas e contagens
  j := public.nx_cv_listar('tok-f5-a2', cA, '{"aba":"abertas"}');
  perform pg_temp.ok(pg_temp.ids(j) = array[cv2], 'atendente sem ver_todas: vê a sem dono do seu departamento e NÃO a do colega');
  j := public.nx_cv_listar('tok-f5-a2', cA, '{"aba":"minhas"}');
  perform pg_temp.ok(pg_temp.ids(j) = array[cv3], 'minhas = atribuídas a mim (aberta/pendente), mesmo fora do meu departamento');
  perform pg_temp.ok((j -> 'contagens' ->> 'minhas')::int = 1 and (j -> 'contagens' ->> 'abertas')::int = 1
                     and (j -> 'contagens' ->> 'pendentes')::int = 1 and (j -> 'contagens' ->> 'sem_dono')::int = 1
                     and (j -> 'contagens' ->> 'aguardando')::int = 1 and (j -> 'contagens' ->> 'nao_lidas')::int = 1,
                     'contagens do atendente batem com o que ele enxerga');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ver(%L,%L,%s)', 'tok-f5-a2', cA, cv1)) = 'conversa_nao_encontrada', 'atendente não abre conversa de colega (conversa_nao_encontrada)');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_mensagens(%L,%L,%s)', 'tok-f5-a2', cA, cv1)) = 'conversa_nao_encontrada', 'atendente não lê mensagens de conversa de colega');
  j := public.nx_cv_listar('tok-f5-adm', cA, '{"aba":"abertas"}');
  perform pg_temp.ok(pg_temp.ids(j) = array[cv1, cv2], 'admin vê todas as abertas (oculta fora)');
  perform pg_temp.ok((j -> 'contagens' ->> 'abertas')::int = 2 and (j -> 'contagens' ->> 'pendentes')::int = 1
                     and (j -> 'contagens' ->> 'sem_dono')::int = 1 and (j -> 'contagens' ->> 'aguardando')::int = 2
                     and (j -> 'contagens' ->> 'nao_lidas')::int = 2 and (j -> 'contagens' ->> 'minhas')::int = 0,
                     'contagens do admin');
  perform pg_temp.ok((j -> 'itens' -> 0 -> 'contato' ->> 'nome') is not null and (j -> 'itens' -> 0 ->> 'protocolo') is not null
                     and (j -> 'itens' -> 0 ->> 'janela_ate') is not null, 'ConversaItem com contato, protocolo e janela_ate');
  j := public.nx_cv_listar('tok-f5-adm', cA, '{"aba":"aguardando"}');
  perform pg_temp.ok((j -> 'itens' -> 0 ->> 'id')::bigint = cv2 and (j -> 'itens' -> 1 ->> 'id')::bigint = cv1, 'aguardando: mais antiga primeiro');
  j := public.nx_cv_listar('tok-f5-sup', cA, '{"aba":"abertas"}');
  perform pg_temp.ok(pg_temp.ids(j) = '{}'::bigint[], 'supervisor só vê o próprio departamento (Comercial)');
  j := public.nx_cv_listar('tok-f5-sup', cA, '{"aba":"pendentes"}');
  perform pg_temp.ok(pg_temp.ids(j) = array[cv3], 'supervisor vê a pendente do Comercial');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_listar(%L,%L,%L)', 'tok-f5-a1', cA, '{"aba":"ocultas"}')) = 'sem_permissao', 'aba ocultas só supervisor+');
  j := public.nx_cv_listar('tok-f5-adm', cA, '{"aba":"ocultas"}');
  perform pg_temp.ok(pg_temp.ids(j) = array[cv4], 'admin vê a oculta na aba ocultas');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ver(%L,%L,%s)', 'tok-f5-a1', cA, cv4)) = 'conversa_nao_encontrada', 'oculta invisível para atendente');
  j := public.nx_cv_listar('tok-f5-le', cA, '{"aba":"abertas"}');
  perform pg_temp.ok(pg_temp.ids(j) = array[cv1, cv2], 'leitura com ver_todas vê todas');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_listar(%L,%L,%L)', 'tok-f5-adm', cA, '{"aba":"xyz"}')) = 'dados_invalidos|aba', 'aba inválida');
  -- busca: nome sem acento/caixa, dígitos do telefone, protocolo
  perform pg_temp.ok(pg_temp.ids(public.nx_cv_listar('tok-f5-adm', cA, '{"aba":"abertas","busca":"MÁRIA"}')) = array[cv1], 'busca por nome sem acento');
  perform pg_temp.ok(pg_temp.ids(public.nx_cv_listar('tok-f5-adm', cA, '{"busca":"0000002"}')) = array[cv2], 'busca por dígitos do telefone');
  perform pg_temp.ok(pg_temp.ids(public.nx_cv_listar('tok-f5-adm', cA, '{"aba":"abertas","busca":"900003"}')) = array[cv3], 'busca por protocolo procura em todas as abas');
  perform pg_temp.ok(pg_temp.ids(public.nx_cv_listar('tok-f5-adm', cA, '{"busca":"oculto"}')) = '{}'::bigint[], 'busca não traz oculta');
  perform pg_temp.ok(pg_temp.ids(public.nx_cv_listar('tok-f5-adm', cA, '{"busca":"contato b"}')) = '{}'::bigint[], 'busca não atravessa cliente');
  perform pg_temp.ok(pg_temp.ids(public.nx_cv_listar('tok-f5-adm', cA, '{"aba":"abertas","atendente":"sem"}')) = array[cv2], 'filtro atendente sem dono');
  perform pg_temp.ok(pg_temp.ids(public.nx_cv_listar('tok-f5-adm', cA, jsonb_build_object('aba', 'abertas', 'canal_id', chB))) = '{}'::bigint[], 'filtro por canal de outro cliente → vazio');
  perform pg_temp.ok(pg_temp.ids(public.nx_cv_listar('tok-f5-adm', cA, '{"aba":"abertas","nao_lidas":true}')) = array[cv1, cv2], 'filtro só não lidas');
  -- paginação por p_antes
  j := public.nx_cv_listar('tok-f5-adm', cA, '{"aba":"abertas"}', 1);
  perform pg_temp.ok(pg_temp.ids(j) = array[cv1] and (j ->> 'tem_mais')::boolean, 'página 1 com tem_mais');
  j := public.nx_cv_listar('tok-f5-adm', cA, '{"aba":"abertas"}', 1, (j -> 'itens' -> 0 ->> 'ultima_msg_em')::timestamptz);
  perform pg_temp.ok(pg_temp.ids(j) = array[cv2] and not (j ->> 'tem_mais')::boolean, 'página 2 por p_antes');

  -- ---------------------------------------------------------- atribuir
  select count(*) into n from public.nx_notificacoes where conta_id = k_a1 and tipo = 'atribuida';
  j := public.nx_cv_atribuir('tok-f5-a2', cA, cv2, k_a2, null);
  perform pg_temp.ok((j ->> 'atribuida_a')::uuid = k_a2, 'atendente assume a sem dono');
  perform pg_temp.ok(exists (select 1 from public.nx_mensagens where conversa_id = cv2 and tipo = 'sistema' and corpo = 'Beto F5 assumiu'), 'assumir gera mensagem de sistema');
  perform pg_temp.ok((select ultima_atribuicao_em from public.nx_acessos where conta_id = k_a2 and cliente_id = cA) is not null, 'assumir atualiza ultima_atribuicao_em');
  j := public.nx_cv_atribuir('tok-f5-adm', cA, cv2, k_a1, null);
  perform pg_temp.ok((j ->> 'atribuida_a')::uuid = k_a1
                     and exists (select 1 from public.nx_mensagens where conversa_id = cv2 and tipo = 'sistema' and corpo = 'Transferida de Beto F5 para Ana F5'),
                     'transferir gera "Transferida de … para …"');
  perform pg_temp.ok((select count(*) from public.nx_notificacoes where conta_id = k_a1 and tipo = 'atribuida' and link = '#/conversas/' || cv2) = 1
                     and (select count(*) from public.nx_notificacoes where conta_id = k_a1 and tipo = 'atribuida') = n + 1, 'transferir notifica o novo dono');
  perform pg_temp.ok(exists (select 1 from public.nx_historico where conversa_id = cv2 and tipo = 'atribuida' and autor_id = k_adm), 'histórico atribuida com autor');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_atribuir(%L,%L,%s,%L)', 'tok-f5-adm', cA, cv2, k_admb)) = 'dados_invalidos|conta', 'atribuir a conta de outro cliente → dados_invalidos');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_atribuir(%L,%L,%s,%L)', 'tok-f5-adm', cA, cv2, k_le)) = 'dados_invalidos|conta', 'atribuir a conta somente leitura → dados_invalidos');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_atribuir(%L,%L,%s,%L,%L)', 'tok-f5-adm', cA, cv2, null, dep_b)) = 'dados_invalidos|departamento', 'departamento de outro cliente → dados_invalidos');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_atribuir(%L,%L,%s,%L)', 'tok-f5-le', cA, cv2, k_a1)) = 'sem_permissao', 'leitura não atribui');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_atribuir(%L,%L,%s,%L)', 'tok-f5-adm', cA, cvB, k_adm)) = 'conversa_nao_encontrada'
                     and (select atribuida_a from public.nx_conversas where id = cvB) is null, 'atribuir conversa de outro cliente → conversa_nao_encontrada e intacta');
  j := public.nx_cv_atribuir('tok-f5-adm', cA, cv2, null, dep_com);
  perform pg_temp.ok(j ->> 'atribuida_a' is null and (j ->> 'departamento_id')::uuid = dep_com
                     and exists (select 1 from public.nx_mensagens where conversa_id = cv2 and tipo = 'sistema' and corpo like '%Movida para Comercial'),
                     'mover para departamento: sem dono + "Movida para Comercial"');
  j := public.nx_cv_atribuir('tok-f5-adm', cA, cv2, k_a1, dep_rec);
  perform pg_temp.ok((j ->> 'atribuida_a')::uuid = k_a1 and (j ->> 'departamento_id')::uuid = dep_rec, 'pessoa e departamento juntos');

  -- ---------------------------------------------------------- nota interna
  update public.nx_conversas set nao_lidas = 3 where id = cv1;
  select ultima_msg_em into ts from public.nx_conversas where id = cv1;
  j := public.nx_cv_nota('tok-f5-a1', cA, cv1, '  Paciente prefere manhã  ');
  perform pg_temp.ok(j ->> 'tipo' = 'nota' and j ->> 'direcao' = 'out' and j ->> 'status' = 'enviada'
                     and j ->> 'corpo' = 'Paciente prefere manhã' and (j -> 'enviado_por' ->> 'id')::uuid = k_a1, 'nota: tipo nota, enviada, autor');
  perform pg_temp.ok((select ultima_msg_em = ts and nao_lidas = 3 and aguardando and primeira_resposta_em is null
                        from public.nx_conversas where id = cv1), 'nota NÃO mexe em ultima_msg, nao_lidas, aguardando, primeira_resposta');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_nota(%L,%L,%s,%L)', 'tok-f5-a1', cA, cv1, '   ')) = 'dados_invalidos|texto', 'nota vazia');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_nota(%L,%L,%s,%L)', 'tok-f5-le', cA, cv1, 'x')) = 'sem_permissao', 'leitura não escreve nota');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_nota(%L,%L,%s,%L)', 'tok-f5-adm', cA, cvB, 'x')) = 'conversa_nao_encontrada'
                     and not exists (select 1 from public.nx_mensagens where conversa_id = cvB), 'nota em conversa de outro cliente → conversa_nao_encontrada');

  -- ---------------------------------------------------------- marcar lida
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, wamid, status)
  values (cA, cv1, ct1, ch, 'in', 'texto', 'Oi, quero marcar', 'wamid.F5-TESTE-1', 'recebida') returning id into m1;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, wamid, status, enviado_por, responde_a_wamid, origem)
  values (cA, cv1, ct1, ch, 'out', 'texto', 'Claro! Qual dia?', 'wamid.F5-TESTE-2', 'entregue', k_a1, 'wamid.F5-TESTE-1', 'painel') returning id into m2;
  j := public.nx_cv_marcar_lida('tok-f5-le', cA, cv1);
  perform pg_temp.ok(j ->> 'ultimo_wamid_in' = 'wamid.F5-TESTE-1' and (select nao_lidas from public.nx_conversas where id = cv1) = 0, 'marcar lida zera e devolve o último wamid recebido');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_marcar_lida(%L,%L,%s)', 'tok-f5-adm', cA, cvB)) = 'conversa_nao_encontrada', 'marcar lida de outro cliente');

  -- ---------------------------------------------------------- mensagens: página, citação e DELTA (commit atrasado)
  j := public.nx_cv_mensagens('tok-f5-adm', cA, cv1);
  perform pg_temp.ok(not (j ->> 'tem_mais')::boolean and json_array_length(j -> 'itens') >= 3, 'página inicial');
  select (x ->> 'id')::bigint into mX from json_array_elements(j -> 'itens') x where (x ->> 'id')::bigint = m2;
  perform pg_temp.ok(mX = m2 and (select (x -> 'responde_a' ->> 'id')::bigint = m1 and x -> 'enviado_por' ->> 'nome' = 'Ana F5'
                                    from json_array_elements(j -> 'itens') x where (x ->> 'id')::bigint = m2), 'Mensagem com responde_a e enviado_por');
  perform pg_temp.ok((select bool_and(a < b) from (select (x ->> 'id')::bigint a, lead((x ->> 'id')::bigint) over () b
                                                    from json_array_elements(j -> 'itens') x) s where b is not null), 'página em ordem crescente de id');
  perform pg_temp.ok((j ->> 'ultimo_id')::bigint = (select max(id) from public.nx_mensagens where contato_id = ct1), 'ultimo_id = maior id');
  perform pg_temp.ok(json_array_length(j -> 'conversas') = 1 and (j -> 'conversas' -> 0 ->> 'protocolo') = '2026-900001', 'conversas do contato (separadores)');
  j := public.nx_cv_mensagens('tok-f5-adm', cA, cv1, null, null, null, 2);
  perform pg_temp.ok(json_array_length(j -> 'itens') = 2 and (j ->> 'tem_mais')::boolean, 'página de 2 com tem_mais');
  j := public.nx_cv_mensagens('tok-f5-adm', cA, cv1, (j -> 'itens' -> 0 ->> 'id')::bigint, null, null, 2);
  perform pg_temp.ok(json_array_length(j -> 'itens') >= 1 and (j -> 'itens' -> 0 ->> 'id')::bigint < m2, 'página anterior por p_antes_id');
  -- commit atrasado: B (id menor, atualizado há 20 s) e C (id menor, há 60 s) antes do cursor; A (id MAIOR, atualizado há 10 s)
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status, atualizado_em, criado_em)
  values (cA, cv1, ct1, ch, 'in', 'texto', 'B', 'recebida', now() - interval '20 seconds', now() - interval '20 seconds') returning id into mB;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status, atualizado_em, criado_em)
  values (cA, cv1, ct1, ch, 'in', 'texto', 'C', 'recebida', now() - interval '60 seconds', now() - interval '60 seconds') returning id into mC;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status, atualizado_em, criado_em)
  values (cA, cv1, ct1, ch, 'in', 'texto', 'A', 'recebida', now() - interval '10 seconds', now() - interval '10 seconds') returning id into mA;
  j := public.nx_cv_mensagens('tok-f5-adm', cA, cv1, null, now(), mC);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'itens') x where (x ->> 'id')::bigint = mA), 'delta: A (id maior, atualizado_em < p_desde) vem pelo id — commit atrasado');
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'itens') x where (x ->> 'id')::bigint = mB), 'delta: B (id menor, 20 s antes) vem pela sobreposição de 30 s');
  perform pg_temp.ok(not exists (select 1 from json_array_elements(j -> 'itens') x where (x ->> 'id')::bigint = mC), 'delta: C (60 s antes, id = cursor) não vem');
  perform pg_temp.ok((select count(*) = count(distinct x ->> 'id') from json_array_elements(j -> 'itens') x), 'delta sem id repetido');
  perform pg_temp.ok((j ->> 'ultimo_id')::bigint = mA and (j ->> 'agora') is not null, 'delta: ultimo_id e agora');
  j := public.nx_cv_mensagens('tok-f5-adm', cA, cv1, null, null, mA);
  perform pg_temp.ok(json_array_length(j -> 'itens') = 0 and (j ->> 'ultimo_id')::bigint = mA, 'delta só por id sem novidade → vazio, ultimo_id mantido');

  -- ---------------------------------------------------------- etiquetas
  select id into etq from public.nx_etiquetas where cliente_id = cA order by nome limit 1;
  select id into etqB from public.nx_etiquetas where cliente_id = cB order by nome limit 1;
  j := public.nx_cv_etiquetas('tok-f5-a1', cA, cv1, array[etq, etq]);
  perform pg_temp.ok(json_array_length(j -> 'etiquetas') = 1 and (j -> 'etiquetas' ->> 0)::uuid = etq, 'etiquetas substituem (sem repetir)');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_etiquetas(%L,%L,%s,%L::uuid[])', 'tok-f5-a1', cA, cv1, array[etqB])) = 'dados_invalidos|etiquetas', 'etiqueta de outro cliente → dados_invalidos');
  perform pg_temp.ok(pg_temp.ids(public.nx_cv_listar('tok-f5-adm', cA, jsonb_build_object('aba', 'abertas', 'etiquetas', array[etq]))) = array[cv1], 'filtro por etiqueta');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_etiquetas(%L,%L,%s,%L::uuid[])', 'tok-f5-adm', cA, cvB, array[etq])) = 'conversa_nao_encontrada', 'etiquetar conversa de outro cliente');

  -- ---------------------------------------------------------- status: resolver, reabrir, pendente
  j := public.nx_cv_status('tok-f5-adm', cA, cv1, 'resolvida');
  perform pg_temp.ok(j ->> 'status' = 'resolvida' and not (j ->> 'aguardando')::boolean
                     and (select resolvida_por = k_adm and resolvida_em is not null from public.nx_conversas where id = cv1), 'resolver grava resolvida_em/por e tira aguardando');
  perform pg_temp.ok(exists (select 1 from public.nx_mensagens where conversa_id = cv1 and tipo = 'sistema' and corpo = 'Atendimento 2026-900001 resolvido por Admin F5'), 'mensagem "Atendimento … resolvido por …"');
  perform pg_temp.ok(exists (select 1 from public.nx_historico where conversa_id = cv1 and tipo = 'conversa_resolvida'), 'histórico conversa_resolvida');
  perform pg_temp.ok(cv1 = any(pg_temp.ids(public.nx_cv_listar('tok-f5-adm', cA, '{"aba":"resolvidas"}'))), 'aparece em resolvidas');
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, protocolo, status)
  values (cA, ch, ct1, dep_rec, '2026-900005', 'aberta') returning id into cv5;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_status(%L,%L,%s,%L)', 'tok-f5-adm', cA, cv1, 'aberta')) = 'ja_existe_aberta|' || cv5, 'reabrir com outra aberta do mesmo contato+número → ja_existe_aberta (hint id)');
  j := public.nx_cv_mensagens('tok-f5-adm', cA, cv5);
  perform pg_temp.ok(json_array_length(j -> 'conversas') = 2 and exists (select 1 from json_array_elements(j -> 'itens') x where (x ->> 'id')::bigint = m1), 'histórico contínuo do contato (mensagens da conversa anterior)');
  perform public.nx_cv_status('tok-f5-adm', cA, cv5, 'resolvida');
  j := public.nx_cv_status('tok-f5-adm', cA, cv1, 'aberta');
  perform pg_temp.ok(j ->> 'status' = 'aberta' and (select resolvida_em is null and resolvida_por is null from public.nx_conversas where id = cv1), 'reabrir limpa resolvida_em/por');
  j := public.nx_cv_status('tok-f5-a1', cA, cv1, 'pendente');
  perform pg_temp.ok(j ->> 'status' = 'pendente', 'aberta → pendente');
  j := public.nx_cv_status('tok-f5-a1', cA, cv1, 'aberta');
  perform pg_temp.ok(j ->> 'status' = 'aberta', 'pendente → aberta');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_status(%L,%L,%s,%L)', 'tok-f5-adm', cA, cv1, 'fechada')) = 'dados_invalidos|status', 'status inválido');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_status(%L,%L,%s,%L)', 'tok-f5-adm', cA, cvB, 'resolvida')) = 'conversa_nao_encontrada'
                     and (select status from public.nx_conversas where id = cvB) = 'aberta', 'resolver conversa de outro cliente');

  -- ---------------------------------------------------------- vincular negócio e nx_cv_ver
  insert into public.nx_leads (cliente_id, contato_id, origem, titulo) values (cA, ct1, 'manual', 'Clareamento Maria') returning id into neg1;
  insert into public.nx_leads (cliente_id, contato_id, origem, titulo) values (cA, ct2, 'manual', 'Implante João') returning id into neg2;
  insert into public.nx_leads (cliente_id, contato_id, origem, titulo) values (cB, ctB, 'manual', 'B') returning id into negB;
  perform pg_temp.ok((select negocio_id from public.nx_conversas where id = cv1) = neg1, 'gatilho da F1 liga o negócio novo à conversa aberta');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_vincular_negocio(%L,%L,%s,%s)', 'tok-f5-adm', cA, cv1, negB)) = 'negocio_nao_encontrado', 'negócio de outro cliente → negocio_nao_encontrado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_vincular_negocio(%L,%L,%s,%s)', 'tok-f5-adm', cA, cv1, neg2)) = 'dados_invalidos|contato', 'negócio de outro contato → dados_invalidos');
  j := public.nx_cv_vincular_negocio('tok-f5-adm', cA, cv1, null);
  perform pg_temp.ok(j -> 'negocio' is null or json_typeof(j -> 'negocio') = 'null', 'desvincular');
  j := public.nx_cv_vincular_negocio('tok-f5-a1', cA, cv1, neg1);
  perform pg_temp.ok((j -> 'negocio' ->> 'id')::bigint = neg1 and j -> 'negocio' ->> 'estagio_nome' is not null, 'vincular devolve negocio com etapa');
  insert into public.nx_tarefas (cliente_id, titulo, contato_id, negocio_id, vence_em, dono_id)
  values (cA, 'Ligar para confirmar', ct1, neg1, now() - interval '1 hour', k_a1);
  j := public.nx_cv_ver('tok-f5-a1', cA, cv1);
  perform pg_temp.ok(j -> 'conversa' ->> 'protocolo' = '2026-900001' and j -> 'conversa' -> 'departamento' ->> 'nome' = 'Recepção'
                     and j -> 'conversa' -> 'atribuida' ->> 'nome' = 'Ana F5' and j -> 'conversa' -> 'canal' ->> 'nome' = 'Recepção principal',
                     'nx_cv_ver: conversa com departamento, atribuída e canal');
  perform pg_temp.ok(j -> 'contato' ->> 'nome' = 'Maria Teste' and (j -> 'contato' -> 'busca') is null and (j -> 'contato' -> 'tel_chave') is null, 'Contato sem busca/tel_chave');
  perform pg_temp.ok(json_array_length(j -> 'negocios') = 1 and (j -> 'negocios' -> 0 ->> 'id')::bigint = neg1
                     and (j -> 'negocios' -> 0 -> 'tarefa' ->> 'atrasada')::boolean, 'negócios abertos do contato (Card com tarefa atrasada)');
  perform pg_temp.ok(json_array_length(j -> 'atendimentos') = 2 and json_array_length(j -> 'tarefas') = 1, 'atendimentos e tarefas abertas');
  update public.nx_leads set dono_id = k_a2 where id = neg1;
  j := public.nx_cv_ver('tok-f5-a1', cA, cv1);
  perform pg_temp.ok(json_array_length(j -> 'negocios') = 0, 'atendente sem ver_todas não vê negócio de colega na lateral');
  j := public.nx_cv_ver('tok-f5-adm', cA, cv1);
  perform pg_temp.ok(json_array_length(j -> 'negocios') = 1, 'admin vê o negócio');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ver(%L,%L,%s)', 'tok-f5-adm', cA, cvB)) = 'conversa_nao_encontrada', 'nx_cv_ver de outro cliente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ver(%L,%L,%s)', 'tok-f5-admb', cA, cv1)) = 'sem_acesso', 'token de B com p_cliente A → sem_acesso');

  -- ---------------------------------------------------------- nx_cv_nova
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_nova(%L,%L,%L,%s)', 'tok-f5-adm', cA, chB, ct1)) = 'canal_nao_encontrado', 'nx_cv_nova com canal de outro cliente → canal_nao_encontrado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_nova(%L,%L,%L,%s)', 'tok-f5-adm', cA, ch, ctB)) = 'contato_nao_encontrado', 'nx_cv_nova com contato de outro cliente → contato_nao_encontrado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_nova(%L,%L,%L,null,%L)', 'tok-f5-adm', cA, ch, 'abc')) = 'telefone_invalido|telefone', 'telefone inválido');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_nova(%L,%L,%L)', 'tok-f5-adm', cA, ch)) = 'dados_invalidos|contato', 'sem contato e sem telefone');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_nova(%L,%L,%L,%s)', 'tok-f5-le', cA, ch, ct1)) = 'sem_permissao', 'leitura não inicia conversa');
  j := public.nx_cv_nova('tok-f5-adm', cA, ch, ct1);
  perform pg_temp.ok((j ->> 'id')::bigint = cv1, 'contato com atendimento aberto → devolve o mesmo');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_nova(%L,%L,%L,%s)', 'tok-f5-a1', cA, ch, ct3)) = 'ja_existe_aberta|' || cv3, 'aberta invisível para quem pede → ja_existe_aberta');
  select count(*) into n from public.nx_contatos where cliente_id = cA;
  j := public.nx_cv_nova('tok-f5-a1', cA, ch, null, '(12) 99000-0099', 'Paciente Novo');
  cvN := (j ->> 'id')::bigint;
  select contato_id into ctN from public.nx_conversas where id = cvN;
  perform pg_temp.ok((select telefone = '5512990000099' and origem = 'manual' and nome = 'Paciente Novo' from public.nx_contatos where id = ctN)
                     and (select count(*) from public.nx_contatos where cliente_id = cA) = n + 1, 'telefone digitado cria contato com 55 e origem manual');
  perform pg_temp.ok(j ->> 'status' = 'aberta' and not (j ->> 'aguardando')::boolean and (j ->> 'atribuida_a')::uuid = k_a1
                     and j ->> 'janela_ate' is null, 'conversa nova: aberta, não aguardando, atribuída a quem abriu, sem janela');
  perform pg_temp.ok(exists (select 1 from public.nx_mensagens where conversa_id = cvN and tipo = 'sistema' and corpo = 'Conversa iniciada por Ana F5'), 'mensagem "Conversa iniciada por …"');
  perform pg_temp.ok((public.nx_cv_nova('tok-f5-a1', cA, ch, null, '5512990000099') ->> 'id')::bigint = cvN, 'mesmo telefone (com 55) → mesma conversa');
  perform pg_temp.ok((public.nx_cv_nova('tok-f5-a1', cA, ch, null, '+55 12 9000-0099') ->> 'id')::bigint = cvN, '"+55" e sem o 9 → mesma conversa');
  -- telefone internacional digitado com "+"/"00" (a tela orienta "comece com o código do país"): número completo, sem 55
  j := public.nx_cv_nova('tok-f5-a1', cA, ch, null, '+1 415 555 1234', 'Gringo');
  cvx := (j ->> 'id')::bigint;
  perform pg_temp.ok((select k.telefone = '14155551234' and k.wa_id = '14155551234' from public.nx_contatos k
                        join public.nx_conversas c on c.contato_id = k.id where c.id = cvx), '"+1 415 555 1234" fica 14155551234 (não ganha 55)');
  perform pg_temp.ok((public.nx_cv_nova('tok-f5-a1', cA, ch, null, '001 (415) 555-1234') ->> 'id')::bigint = cvx, '"001 …" acha o mesmo contato');
  j := public.nx_cv_nova('tok-f5-a1', cA, ch, null, '+351 912 345 678');
  perform pg_temp.ok((select k.telefone from public.nx_contatos k join public.nx_conversas c on c.contato_id = k.id
                       where c.id = (j ->> 'id')::bigint) = '351912345678', '"+351 …" fica como veio');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_nova(%L,%L,%L,null,%L)', 'tok-f5-a1', cA, ch, '+12345')) = 'telefone_invalido|telefone', '"+" com menos de 8 dígitos → telefone_invalido');
  j := public.nx_cv_nova('tok-f5-adm', cA, ch, ct4);
  cvO := (j ->> 'id')::bigint;
  perform pg_temp.ok(cvO <> cv4 and (j ->> 'janela_ate')::timestamptz between now() + interval '21 hours' and now() + interval '23 hours',
                     'janela real: ultima_entrada_em da conversa anterior do contato no número');
  -- mensagens da conversa OCULTA não aparecem para atendente no histórico contínuo
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status)
  values (cA, cv4, ct4, ch, 'in', 'texto', 'mensagem na oculta', 'recebida') returning id into mO;
  perform public.nx_cv_atribuir('tok-f5-adm', cA, cvO, k_a1);
  j := public.nx_cv_mensagens('tok-f5-a1', cA, cvO);
  perform pg_temp.ok(not exists (select 1 from json_array_elements(j -> 'itens') x where (x ->> 'id')::bigint = mO), 'atendente não lê mensagens da conversa oculta');
  j := public.nx_cv_mensagens('tok-f5-adm', cA, cvO);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'itens') x where (x ->> 'id')::bigint = mO), 'admin lê o histórico inteiro');

  -- ---------------------------------------------------------- nx_cv_distribuir (rodízio e manter_atendente)
  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id) values (cA, 'Seis', '5512990000006', '5512990000006') returning id into ct6;
  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id) values (cA, 'Sete', '5512990000007', '5512990000007') returning id into ct7;
  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id) values (cA, 'Oito', '5512990000008', '5512990000008') returning id into ct8;
  -- Beto (a2) com MAIS abertas que Ana (a1)
  select count(*) into n from public.nx_conversas where cliente_id = cA and atribuida_a = k_a1 and status in ('aberta','pendente');
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, atribuida_a, protocolo, status)
  select cA, null, k.id, dep_rec, k_a2, 'T-' || k.id, 'aberta'
    from public.nx_contatos k where k.cliente_id = cA and k.id not in (ct6, ct7, ct8)
   order by k.id limit n;
  perform pg_temp.ok((select count(*) from public.nx_conversas where cliente_id = cA and atribuida_a = k_a2 and status in ('aberta','pendente'))
                   > (select count(*) from public.nx_conversas where cliente_id = cA and atribuida_a = k_a1 and status in ('aberta','pendente')), '(preparação: Beto com mais abertas)');
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, protocolo, status)
  values (cA, ch, ct6, dep_rec, '2026-900006', 'aberta') returning id into cv6;
  select count(*) into n from public.nx_notificacoes where conta_id = k_a1 and tipo = 'atribuida';
  perform pg_temp.ok(public.nx_cv_distribuir(cv6) = k_a1, 'rodízio distribui para quem tem menos abertas');
  perform pg_temp.ok((select atribuida_a from public.nx_conversas where id = cv6) = k_a1
                     and exists (select 1 from public.nx_mensagens where conversa_id = cv6 and tipo = 'sistema' and corpo like 'Atribuída a Ana F5 (rodízio%')
                     and (select count(*) from public.nx_notificacoes where conta_id = k_a1 and tipo = 'atribuida') = n + 1,
                     'rodízio grava, avisa na conversa e notifica');
  perform pg_temp.ok(public.nx_cv_distribuir(cv6) = k_a1, 'conversa já atribuída → devolve o dono');
  -- manter_atendente: Sete foi atendido pelo Beto antes
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, atribuida_a, protocolo, status, aberta_em, resolvida_em)
  values (cA, ch, ct7, dep_rec, k_a2, '2026-900070', 'resolvida', now() - interval '5 days', now() - interval '4 days');
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, protocolo, status)
  values (cA, ch, ct7, dep_rec, '2026-900007', 'aberta') returning id into cv7;
  perform pg_temp.ok(public.nx_cv_distribuir(cv7) = k_a2, 'manter_atendente: volta para quem atendeu antes (mesmo com mais abertas)');
  update public.nx_conversas set atribuida_a = null where id = cv7;
  update public.nx_acessos set recebe_conversas = false where conta_id = k_a2 and cliente_id = cA;
  perform pg_temp.ok(public.nx_cv_distribuir(cv7) = k_a1, 'quem atendeu antes não recebe mais → rodízio');
  update public.nx_acessos set recebe_conversas = true where conta_id = k_a2 and cliente_id = cA;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, protocolo, status)
  values (cA, ch, ct8, dep_com, '2026-900008', 'aberta') returning id into cv8;
  perform pg_temp.ok(public.nx_cv_distribuir(cv8) is null and (select atribuida_a from public.nx_conversas where id = cv8) is null, 'departamento manual → sem dono');
  perform pg_temp.ok(public.nx_cv_distribuir(-1) is null, 'conversa inexistente → null');

  -- ---------------------------------------------------------- respostas rápidas
  j := public.nx_resposta_salvar('tok-f5-sup', cA, '{"atalho":"/Teste_F5","titulo":"Teste","corpo":"Olá, {primeiro_nome}!"}');
  rid := (j ->> 'id')::uuid;
  perform pg_temp.ok(j ->> 'atalho' = 'teste_f5' and (j ->> 'ativo')::boolean, 'resposta criada (atalho sem / e minúsculo)');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_resposta_salvar(%L,%L,%L)', 'tok-f5-sup', cA, '{"atalho":"ola","titulo":"x","corpo":"y"}')) = 'atalho_em_uso|atalho', 'atalho repetido → atalho_em_uso');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_resposta_salvar(%L,%L,%L)', 'tok-f5-sup', cA, '{"atalho":"x y","titulo":"x","corpo":"y"}')) = 'dados_invalidos|atalho', 'atalho inválido');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_resposta_salvar(%L,%L,%L)', 'tok-f5-a1', cA, '{"atalho":"zz","titulo":"x","corpo":"y"}')) = 'sem_permissao', 'atendente não cria resposta');
  j := public.nx_resposta_salvar('tok-f5-sup', cA, jsonb_build_object('id', rid, 'titulo', 'Novo título'));
  perform pg_temp.ok(j ->> 'titulo' = 'Novo título' and j ->> 'atalho' = 'teste_f5' and j ->> 'corpo' = 'Olá, {primeiro_nome}!', 'editar só o que veio');
  j := public.nx_resposta_usada('tok-f5-a1', cA, rid);
  perform pg_temp.ok((j ->> 'usos')::int = 1, 'resposta usada soma 1');
  select id into ridB from public.nx_respostas where cliente_id = cB limit 1;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_resposta_salvar(%L,%L,%L)', 'tok-f5-sup', cA, jsonb_build_object('id', ridB, 'titulo', 'roubada'))) = 'dados_invalidos|id'
                     and (select titulo from public.nx_respostas where id = ridB) <> 'roubada', 'resposta de outro cliente → dados_invalidos e intacta');
  j := public.nx_resposta_usada('tok-f5-a1', cA, ridB);
  perform pg_temp.ok(not (j ->> 'ok')::boolean and (select usos from public.nx_respostas where id = ridB) = 0, 'usada com id de outro cliente não muda nada');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_resposta_excluir(%L,%L,%L)', 'tok-f5-sup', cA, ridB)) = 'dados_invalidos|id'
                     and exists (select 1 from public.nx_respostas where id = ridB), 'excluir resposta de outro cliente → dados_invalidos');
  -- (duas instruções: a subconsulta da mesma instrução ainda enxergaria a linha — snapshot)
  perform pg_temp.ok((public.nx_resposta_excluir('tok-f5-sup', cA, rid) ->> 'ok')::boolean, 'excluir resposta');
  perform pg_temp.ok(not exists (select 1 from public.nx_respostas where id = rid), 'resposta excluída some');

  -- ---------------------------------------------------------- nx_cv_base
  j := public.nx_cv_base('tok-f5-a1', cA);
  perform pg_temp.ok(j -> 'eu' ->> 'papel' = 'atendente' and (j -> 'eu' ->> 'id')::uuid = k_a1 and not (j -> 'eu' ->> 'ver_todas')::boolean, 'base: eu');
  perform pg_temp.ok(json_array_length(j -> 'canais') = 1 and json_array_length(j -> 'respostas') = 8 and json_array_length(j -> 'departamentos') = 2
                     and json_array_length(j -> 'usuarios') = 5 and json_array_length(j -> 'etiquetas') = 9, 'base: canais, respostas, departamentos, usuários, etiquetas');
  perform pg_temp.ok((j -> 'cfg' ->> 'recibo_leitura')::boolean and not (j -> 'cfg' ->> 'assinatura')::boolean and (j -> 'ia' ->> 'ligada') is not null
                     and (j -> 'ia' -> 'cota' ->> 'usadas') is not null, 'base: cfg padrão e ia');
  perform pg_temp.ok(position('EAAG' in j::text) = 0 and position('abcdef0123456789' in j::text) = 0, 'base sem segredo');

  -- ---------------------------------------------------------- módulo desligado
  update public.nx_clientes set modulos = '{crm,relatorios}' where id = cA;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_listar(%L,%L)', 'tok-f5-adm', cA)) = 'modulo_desligado|conversas', 'módulo desligado → modulo_desligado');
  update public.nx_clientes set modulos = '{crm,conversas,relatorios,ads,automacoes,marca}' where id = cA;

  -- ---------------------------------------------------------- excluir número
  select token_segredo, app_secret_segredo into sec1, sec2 from public.nx_canais where id = ch;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_canal_excluir(%L,%L,%L,%L)', 'tok-f5-adm', cA, ch, 'apagar')) = 'dados_invalidos|confirmacao', 'excluir exige digitar excluir');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_canal_excluir(%L,%L,%L,%L)', 'tok-f5-adm', cA, chB, 'excluir')) = 'canal_nao_encontrado'
                     and exists (select 1 from public.nx_canais where id = chB), 'excluir canal de outro cliente → canal_nao_encontrado');
  select count(*), array_agg(id) into n, ids_ch from public.nx_conversas where canal_id = ch;
  perform pg_temp.ok((public.nx_canal_excluir('tok-f5-adm', cA, ch, 'excluir') ->> 'ok')::boolean, 'excluir número');
  perform pg_temp.ok((select wa_phone_number_id from public.nx_clientes where id = cA) is null, 'nx_canal_excluir → wa_phone_number_id nulo');
  perform pg_temp.ok(not exists (select 1 from public.nx_canais where id = ch) and n > 0
                     and (select count(*) from public.nx_conversas where id = any(ids_ch) and canal_id is null) = n,
                     'conversas e mensagens ficam (canal_id nulo)');
  perform pg_temp.ok(not exists (select 1 from vault.secrets where id in (sec1, sec2)), 'segredos apagados do Vault');
  perform pg_temp.ok(not exists (select 1 from public.nx_canais where cliente_id = cA), 'sem canal → nenhum criado pelo gatilho');

  -- ---------------------------------------------------------- permissões
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_cv_distribuir(bigint)', 'execute')
                     and not has_function_privilege('authenticated', 'public.nx_cv_distribuir(bigint)', 'execute')
                     and has_function_privilege('service_role', 'public.nx_cv_distribuir(bigint)', 'execute'), 'nx_cv_distribuir só service_role');
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_cv_json_item(public.nx_conversas)', 'execute')
                     and not has_function_privilege('anon', 'public.nx_cv_json_msg(public.nx_mensagens)', 'execute')
                     and not has_function_privilege('anon', 'public.nx_cv_sistema(bigint,text,uuid)', 'execute')
                     and not has_function_privilege('anon', 'public.nx_canal_json(public.nx_canais)', 'execute'), 'montadoras internas sem anon');
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_cv_listar(text,uuid,jsonb,integer,timestamp with time zone)', 'execute')
                     and has_function_privilege('anon', 'public.nx_canal_salvar(text,uuid,jsonb)', 'execute')
                     and has_function_privilege('anon', 'public.nx_resposta_usada(text,uuid,uuid)', 'execute'), 'RPCs de painel com anon');
  perform pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                                  where ns.nspname = 'public' and (p.proname like 'nx_cv%' or p.proname like 'nx_canal%' or p.proname like 'nx_resposta%')
                                    and (not p.prosecdef or not ('search_path=""' = any(coalesce(p.proconfig, '{}'))))), 'todas security definer com search_path vazio');

  -- ========================================================== P0-B (arquivo e_b)
  -- ---------------------------------------------------------- nx_cv_base.config (só admin+)
  j := public.nx_cv_base('tok-f5-adm', cA);
  perform pg_temp.ok(json_array_length(j -> 'config' -> 'departamentos') = 2 and (j -> 'config' -> 'ia' ->> 'tom') = 'proximo'
                     and (j -> 'config' -> 'departamentos' -> 0 ->> 'conversas_abertas') is not null, 'base.config do admin: departamentos completos e ia');
  perform pg_temp.ok(json_typeof(public.nx_cv_base('tok-f5-a1', cA) -> 'config') = 'null', 'base.config ausente para atendente');
  -- ---------------------------------------------------------- departamentos e horários
  j := public.nx_departamento_salvar('tok-f5-adm', cA, '{"nome":"Financeiro","cor":"#a98bd6","distribuicao":"rodizio","manter_atendente":false,
       "horario":{"1":[["08:00","12:00"],["13:30","18:00"]],"6":[["08:00","12:00"]]},"msg_fora_horario":"  Voltamos já.  "}');
  dep_fin := (j ->> 'id')::uuid;
  perform pg_temp.ok(j ->> 'cor' = '#A98BD6' and j ->> 'distribuicao' = 'rodizio' and not (j ->> 'manter_atendente')::boolean
                     and not (j ->> 'padrao')::boolean and j ->> 'msg_fora_horario' = 'Voltamos já.'
                     and (j -> 'horario' -> '0')::text = '[]' and json_array_length(j -> 'horario' -> '1') = 2
                     and (select count(*) from json_object_keys(j -> 'horario')) = 7, 'departamento criado com horário normalizado (7 dias)');
  perform pg_temp.ok(public.nx_horario_aberto((select horario from public.nx_departamentos where id = dep_fin), '2026-09-28 10:00-03'::timestamptz)
                     and not public.nx_horario_aberto((select horario from public.nx_departamentos where id = dep_fin), '2026-09-28 12:30-03'::timestamptz),
                     'horário salvo é lido pelo nx_horario_aberto (F1)');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_departamento_salvar(%L,%L,%L)', 'tok-f5-adm', cA, '{"nome":"X1","horario":{"1":[["08:00","12:00"],["11:00","13:00"]]}}')) = 'dados_invalidos|horario', 'faixas sobrepostas → horario');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_departamento_salvar(%L,%L,%L)', 'tok-f5-adm', cA, '{"nome":"X2","horario":{"7":[]}}')) = 'dados_invalidos|horario', 'dia 7 → horario');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_departamento_salvar(%L,%L,%L)', 'tok-f5-adm', cA, '{"nome":"X3","horario":{"2":[["18:00","08:00"]]}}')) = 'dados_invalidos|horario', 'início depois do fim → horario');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_departamento_salvar(%L,%L,%L)', 'tok-f5-adm', cA, '{"nome":"X4","horario":{"2":[["08:00","12:00"],["13:00","14:00"],["15:00","16:00"]]}}')) = 'dados_invalidos|horario', 'mais de 2 faixas → horario');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_departamento_salvar(%L,%L,%L)', 'tok-f5-adm', cA, '{"nome":"X5","cor":"vermelho"}')) = 'dados_invalidos|cor', 'cor inválida');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_departamento_salvar(%L,%L,%L)', 'tok-f5-adm', cA, '{"nome":"financeiro"}')) = 'dados_invalidos|nome_repetido', 'nome repetido (sem caixa)');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_departamento_salvar(%L,%L,%L)', 'tok-f5-sup', cA, '{"nome":"X6"}')) = 'sem_permissao', 'supervisor não mexe em departamento');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_departamento_salvar(%L,%L,%L)', 'tok-f5-adm', cA, jsonb_build_object('id', dep_b, 'nome', 'roubado'))) = 'departamento_nao_encontrado'
                     and (select nome from public.nx_departamentos where id = dep_b) <> 'roubado', 'departamento de outro cliente → departamento_nao_encontrado e intacto');
  j := public.nx_departamento_salvar('tok-f5-adm', cA, jsonb_build_object('id', dep_fin, 'horario', null));
  perform pg_temp.ok(json_typeof(j -> 'horario') = 'null' and j ->> 'msg_fora_horario' = 'Voltamos já.' and j ->> 'nome' = 'Financeiro', 'horario null = 24 h; o resto fica');
  -- um só padrão
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_departamento_salvar(%L,%L,%L)', 'tok-f5-adm', cA, jsonb_build_object('id', dep_rec, 'padrao', false))) = 'dados_invalidos|padrao', 'padrão não deixa de ser sem outro no lugar');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_departamento_salvar(%L,%L,%L)', 'tok-f5-adm', cA, jsonb_build_object('id', dep_fin, 'padrao', true, 'ativo', false))) = 'dados_invalidos|padrao_inativo', 'padrão não pode ficar inativo');
  j := public.nx_departamento_salvar('tok-f5-adm', cA, jsonb_build_object('id', dep_fin, 'padrao', true));
  perform pg_temp.ok((j ->> 'padrao')::boolean and (select count(*) from public.nx_departamentos where cliente_id = cA and padrao) = 1
                     and not (select padrao from public.nx_departamentos where id = dep_rec), 'marcar outro como padrão tira o antigo (um só)');
  perform public.nx_departamento_salvar('tok-f5-adm', cA, jsonb_build_object('id', dep_rec, 'padrao', true));
  perform pg_temp.ok((select padrao from public.nx_departamentos where id = dep_rec) and not (select padrao from public.nx_departamentos where id = dep_fin), 'padrão de volta para a Recepção');
  -- excluir: conversas, números e acessos vão para o padrão
  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id) values (cA, 'Zelia Busca', '5512990000077', '5512990000077') returning id into ct9;
  insert into public.nx_conversas (cliente_id, contato_id, departamento_id, atribuida_a, protocolo, status, aguardando, ultima_entrada_em)
  values (cA, ct9, dep_fin, k_a1, '2026-900077', 'aberta', false, now()) returning id into cv9;
  update public.nx_acessos set departamentos = array[dep_fin] where conta_id = k_a2 and cliente_id = cA;
  update public.nx_acessos set departamentos = array[dep_rec, dep_fin] where conta_id = k_sup and cliente_id = cA;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_departamento_excluir(%L,%L,%L)', 'tok-f5-adm', cA, dep_rec)) = 'dados_invalidos|padrao', 'excluir o padrão → dados_invalidos');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_departamento_excluir(%L,%L,%L)', 'tok-f5-adm', cA, dep_b)) = 'departamento_nao_encontrado'
                     and exists (select 1 from public.nx_departamentos where id = dep_b), 'excluir departamento de outro cliente → departamento_nao_encontrado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_departamento_excluir(%L,%L,%L)', 'tok-f5-a1', cA, dep_fin)) = 'sem_permissao', 'atendente não exclui departamento');
  j := public.nx_departamento_excluir('tok-f5-adm', cA, dep_fin);
  perform pg_temp.ok((j ->> 'movidas')::int = 1 and (j ->> 'pessoas')::int = 2, 'excluir devolve o que foi movido');
  perform pg_temp.ok((select departamento_id from public.nx_conversas where id = cv9) = dep_rec
                     and not exists (select 1 from public.nx_departamentos where id = dep_fin), 'conversas do excluído vão para o padrão');
  perform pg_temp.ok((select departamentos from public.nx_acessos where conta_id = k_a2 and cliente_id = cA) = array[dep_rec]
                     and (select departamentos from public.nx_acessos where conta_id = k_sup and cliente_id = cA) = array[dep_rec],
                     'acessos do excluído passam para o padrão (nunca ficam vazios, sem repetir)');
  update public.nx_acessos set departamentos = array[dep_com] where conta_id = k_sup and cliente_id = cA;
  -- ---------------------------------------------------------- busca nas mensagens
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, direcao, tipo, corpo, status)
  values (cA, cv9, ct9, 'in', 'texto', 'Queria saber do clareamento Zebrafina no sábado', 'recebida') returning id into mX;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, direcao, tipo, corpo, status)
  values (cA, cv9, ct9, 'out', 'nota', 'Nota: zebrafina é o nome do pacote', 'enviada');
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, direcao, tipo, corpo, status)
  values (cA, cv9, ct9, 'in', 'texto', repeat('a', 300) || ' zebrafina ' || repeat('b', 300), 'recebida');
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, direcao, tipo, corpo, status)
  values (cB, cvB, ctB, 'in', 'texto', 'zebrafina do cliente B', 'recebida');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_buscar_msgs(%L,%L,%L)', 'tok-f5-adm', cA, 'ze')) = 'dados_invalidos|busca', 'busca nas mensagens exige 3 letras');
  j := public.nx_cv_buscar_msgs('tok-f5-adm', cA, 'ZEBRAFINA');
  perform pg_temp.ok(json_array_length(j) = 3 and (j -> 0 ->> 'conversa_id')::bigint = cv9 and j -> 0 ->> 'contato_nome' = 'Zelia Busca'
                     and (j -> 2 ->> 'mensagem_id')::bigint = mX, 'admin acha texto e nota (sem caixa), mais nova primeiro, só do cliente');
  perform pg_temp.ok(char_length(j -> 0 ->> 'trecho') <= 160 and position('zebrafina' in j -> 0 ->> 'trecho') > 0
                     and left(j -> 0 ->> 'trecho', 1) = '…', 'trecho ≤ 160 em volta do termo');
  perform pg_temp.ok(json_array_length(public.nx_cv_buscar_msgs('tok-f5-a1', cA, 'zebrafina')) = 3, 'atendente dono da conversa acha');
  perform pg_temp.ok(json_array_length(public.nx_cv_buscar_msgs('tok-f5-a2', cA, 'zebrafina')) = 0, 'atendente sem ver_todas NÃO acha conversa do colega');
  perform pg_temp.ok(json_array_length(public.nx_cv_buscar_msgs('tok-f5-adm', cA, 'zebra%')) = 0, 'curinga % é literal');
  perform pg_temp.ok(json_array_length(public.nx_cv_buscar_msgs('tok-f5-adm', cA, 'zebrafina', 1)) = 1, 'p_limite');
  -- ---------------------------------------------------------- assistente de IA e preferências
  j := public.nx_ia_config_salvar('tok-f5-adm', cA, '{"sobre":"  Clínica de teste.  ","tom":"formal"}');
  perform pg_temp.ok(j ->> 'sobre' = 'Clínica de teste.' and j ->> 'tom' = 'formal' and j ->> 'servicos' = '', 'ia salva e devolve todas as chaves');
  j := public.nx_ia_config_salvar('tok-f5-adm', cA, '{"regras":"Nunca dar preço fechado."}');
  perform pg_temp.ok(j ->> 'sobre' = 'Clínica de teste.' and j ->> 'regras' = 'Nunca dar preço fechado.' and j ->> 'tom' = 'formal', 'ia mescla (não apaga o que não veio)');
  perform pg_temp.ok((select cfg -> 'ia' ->> 'regras' from public.nx_clientes where id = cA) = 'Nunca dar preço fechado.'
                     and (public.nx_cv_base('tok-f5-adm', cA) -> 'config' -> 'ia' ->> 'sobre') = 'Clínica de teste.', 'cfg.ia gravado e lido pela base');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ia_config_salvar(%L,%L,%L)', 'tok-f5-adm', cA, '{"tom":"bravo"}')) = 'dados_invalidos|tom', 'tom inválido');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ia_config_salvar(%L,%L,%L)', 'tok-f5-adm', cA, jsonb_build_object('servicos', repeat('x', 14990)))) = 'dados_invalidos|tamanho', 'soma > 15.000 → tamanho');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ia_config_salvar(%L,%L,%L)', 'tok-f5-sup', cA, '{"sobre":"x"}')) = 'sem_permissao', 'supervisor não mexe na IA');
  j := public.nx_cv_config_salvar('tok-f5-adm', cA, '{"recibo_leitura":false}');
  perform pg_temp.ok(not (j ->> 'recibo_leitura')::boolean and not (j ->> 'assinatura')::boolean, 'preferências: recibo desligado, assinatura padrão');
  j := public.nx_cv_config_salvar('tok-f5-adm', cA, '{"assinatura":true}');
  perform pg_temp.ok(not (j ->> 'recibo_leitura')::boolean and (j ->> 'assinatura')::boolean
                     and (public.nx_cv_base('tok-f5-a1', cA) -> 'cfg' ->> 'assinatura')::boolean, 'preferências mesclam e a base devolve');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_config_salvar(%L,%L,%L)', 'tok-f5-adm', cA, '{"assinatura":"sim"}')) = 'dados_invalidos|assinatura', 'preferência não booleana');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_config_salvar(%L,%L,%L)', 'tok-f5-a1', cA, '{"assinatura":true}')) = 'sem_permissao', 'atendente não muda preferências');
  -- ---------------------------------------------------------- P1 nx_cv_ocultar (spam)
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ocultar(%L,%L,%s,true)', 'tok-f5-a1', cA, cv9)) = 'sem_permissao', 'atendente não oculta');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ocultar(%L,%L,%s,true)', 'tok-f5-adm', cA, cvB)) = 'conversa_nao_encontrada'
                     and not (select oculta from public.nx_conversas where id = cvB), 'ocultar conversa de outro cliente → conversa_nao_encontrada');
  j := public.nx_cv_ocultar('tok-f5-adm', cA, cv9, true);
  perform pg_temp.ok((j ->> 'oculta')::boolean and j ->> 'status' = 'resolvida' and (select bloqueado from public.nx_contatos where id = ct9)
                     and cv9 = any(pg_temp.ids(public.nx_cv_listar('tok-f5-adm', cA, '{"aba":"ocultas"}'))), 'ocultar = resolve + oculta + contato bloqueado');
  j := public.nx_cv_ocultar('tok-f5-adm', cA, cv9, false);
  perform pg_temp.ok(not (j ->> 'oculta')::boolean and not (select bloqueado from public.nx_contatos where id = ct9), 'desfazer tira o bloqueio');
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_cv_json_dep(public.nx_departamentos)', 'execute')
                     and not has_function_privilege('anon', 'public.nx_cv_horario_normalizar(jsonb)', 'execute')
                     and has_function_privilege('anon', 'public.nx_cv_buscar_msgs(text,uuid,text,integer)', 'execute')
                     and has_function_privilege('anon', 'public.nx_departamento_excluir(text,uuid,uuid)', 'execute'), 'permissões do arquivo e_b');

  -- ---------------------------------------------------------- TEMPO (regra 11): 5.000 contatos, 5.000 negócios, 20.000 mensagens
  perform set_config('nx.lote', '1', true);
  perform set_config('nx.sem_historico', '1', true);
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-f5-t', 'Teste F5 Tempo', 'odonto') returning id into cT;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_adm, cT, 'admin');
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas, departamentos)
  select k_a1, cT, 'atendente', false, array[(select id from public.nx_departamentos where cliente_id = cT and padrao)];
  insert into public.nx_canais (cliente_id, nome, phone_number_id) values (cT, 'Tempo', '990000000599') returning id into chT;
  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id)
  select cT, 'Contato Tempo ' || i, '55129' || lpad(i::text, 8, '0'), '55129' || lpad(i::text, 8, '0') from generate_series(1, 5000) i;
  insert into public.nx_leads (cliente_id, contato_id, origem, titulo)
  select cT, k.id, 'whatsapp', 'Negócio ' || k.id from public.nx_contatos k where k.cliente_id = cT;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, atribuida_a, protocolo, status, aguardando, nao_lidas,
                                   ultima_msg_em, ultima_msg_resumo, ultima_msg_dir, ultima_entrada_em, resolvida_em, aberta_em)
  select cT, chT, k.id, (select id from public.nx_departamentos where cliente_id = cT and padrao),
         case when k.rn % 3 = 0 then k_a1 when k.rn % 3 = 1 then k_adm end,
         '2026-' || lpad(k.rn::text, 6, '0'),
         case when k.rn % 5 = 0 then 'aberta' when k.rn % 7 = 0 then 'pendente' else 'resolvida' end,
         k.rn % 2 = 0, k.rn % 4,
         now() - (k.rn || ' minutes')::interval, 'mensagem ' || k.rn, 'in', now() - (k.rn || ' minutes')::interval,
         case when not (k.rn % 5 = 0 or k.rn % 7 = 0) then now() - (k.rn || ' minutes')::interval end,
         now() - (k.rn || ' minutes')::interval
    from (select id, row_number() over (order by id) rn from public.nx_contatos where cliente_id = cT) k
   where k.rn <= 3000;
  -- 16.000 mensagens espalhadas + 4.000 num contato só (histórico longo)
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status, criado_em, atualizado_em)
  select cT, cv.id, cv.contato_id, chT, case when i % 2 = 0 then 'in' else 'out' end, 'texto', 'texto de teste ' || i,
         case when i % 2 = 0 then 'recebida' else 'entregue' end, now() - (i || ' seconds')::interval, now() - (i || ' seconds')::interval
    from generate_series(1, 16000) i
    join (select id, contato_id, row_number() over (order by id) rn from public.nx_conversas where cliente_id = cT) cv
      on cv.rn = 1 + (i % 3000);
  select x.id into cvx from public.nx_conversas x where x.cliente_id = cT and x.status = 'aberta' order by x.id limit 1;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status)
  select cT, cv.id, cv.contato_id, chT, case when i % 2 = 0 then 'in' else 'out' end, 'texto', 'histórico longo ' || i,
         case when i % 2 = 0 then 'recebida' else 'entregue' end
    from generate_series(1, 4000) i, public.nx_conversas cv where cv.id = cvx;
  perform public.nx_pulso_lote_fim();
  perform set_config('nx.lote', '', true);
  perform set_config('nx.sem_historico', '', true);
  perform pg_temp.ok((select count(*) from public.nx_mensagens where cliente_id = cT) = 20000, '(preparação: 20.000 mensagens)');
  analyze public.nx_conversas;
  analyze public.nx_mensagens;
  analyze public.nx_contatos;

  t0 := clock_timestamp(); j := public.nx_cv_listar('tok-f5-adm', cT, '{"aba":"abertas"}');
  ms := extract(epoch from clock_timestamp() - t0) * 1000; v_log := v_log || ' abertas=' || round(ms) || 'ms';
  perform pg_temp.ok(ms < 2000 and json_array_length(j -> 'itens') = 50 and (j ->> 'tem_mais')::boolean, 'lento nx_cv_listar abertas ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_cv_listar('tok-f5-adm', cT, '{"aba":"aguardando"}');
  ms := extract(epoch from clock_timestamp() - t0) * 1000; v_log := v_log || ' aguardando=' || round(ms) || 'ms';
  perform pg_temp.ok(ms < 2000, 'lento nx_cv_listar aguardando ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_cv_listar('tok-f5-adm', cT, '{"aba":"resolvidas"}');
  ms := extract(epoch from clock_timestamp() - t0) * 1000; v_log := v_log || ' resolvidas=' || round(ms) || 'ms';
  perform pg_temp.ok(ms < 2000 and json_array_length(j -> 'itens') = 50, 'lento nx_cv_listar resolvidas ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_cv_listar('tok-f5-a1', cT, '{"aba":"abertas"}');
  ms := extract(epoch from clock_timestamp() - t0) * 1000; v_log := v_log || ' atendente=' || round(ms) || 'ms';
  perform pg_temp.ok(ms < 2000, 'lento nx_cv_listar atendente ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_cv_listar('tok-f5-adm', cT, '{"busca":"tempo 12"}');
  ms := extract(epoch from clock_timestamp() - t0) * 1000; v_log := v_log || ' busca_nome=' || round(ms) || 'ms';
  perform pg_temp.ok(ms < 2000 and json_array_length(j -> 'itens') > 0, 'lento nx_cv_listar busca nome ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_cv_listar('tok-f5-adm', cT, '{"busca":"00001234"}');
  ms := extract(epoch from clock_timestamp() - t0) * 1000; v_log := v_log || ' busca_tel=' || round(ms) || 'ms';
  perform pg_temp.ok(ms < 2000 and json_array_length(j -> 'itens') = 1, 'lento nx_cv_listar busca telefone ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_cv_mensagens('tok-f5-adm', cT, cvx);
  ms := extract(epoch from clock_timestamp() - t0) * 1000; v_log := v_log || ' msgs_pagina=' || round(ms) || 'ms';
  perform pg_temp.ok(ms < 2000 and json_array_length(j -> 'itens') = 50 and (j ->> 'tem_mais')::boolean, 'lento nx_cv_mensagens página ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_cv_mensagens('tok-f5-adm', cT, cvx, (j -> 'itens' -> 0 ->> 'id')::bigint);
  ms := extract(epoch from clock_timestamp() - t0) * 1000; v_log := v_log || ' msgs_antes=' || round(ms) || 'ms';
  perform pg_temp.ok(ms < 2000 and json_array_length(j -> 'itens') = 50, 'lento nx_cv_mensagens p_antes_id ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_cv_mensagens('tok-f5-adm', cT, cvx, null, now() + interval '1 minute', (select max(id) from public.nx_mensagens where cliente_id = cT));
  ms := extract(epoch from clock_timestamp() - t0) * 1000; v_log := v_log || ' msgs_delta=' || round(ms) || 'ms';
  perform pg_temp.ok(ms < 2000 and json_array_length(j -> 'itens') = 0, 'lento nx_cv_mensagens delta ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_cv_buscar_msgs('tok-f5-adm', cT, 'longo 1999');
  ms := extract(epoch from clock_timestamp() - t0) * 1000; v_log := v_log || ' busca_msgs=' || round(ms) || 'ms';
  perform pg_temp.ok(ms < 2000 and json_array_length(j) >= 1, 'lento nx_cv_buscar_msgs ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_cv_ver('tok-f5-adm', cT, cvx);
  ms := extract(epoch from clock_timestamp() - t0) * 1000; v_log := v_log || ' ver=' || round(ms) || 'ms';
  perform pg_temp.ok(ms < 2000, 'lento nx_cv_ver ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_cv_base('tok-f5-adm', cT);
  ms := extract(epoch from clock_timestamp() - t0) * 1000; v_log := v_log || ' base=' || round(ms) || 'ms';
  perform pg_temp.ok(ms < 2000, 'lento nx_cv_base ' || round(ms) || ' ms');
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, protocolo, status)
  select cT, chT, k.id, (select id from public.nx_departamentos where cliente_id = cT and padrao), 'T-dist', 'aberta'
    from public.nx_contatos k where k.cliente_id = cT and not exists (select 1 from public.nx_conversas x where x.contato_id = k.id) limit 1
  returning id into cv8;
  t0 := clock_timestamp(); perform public.nx_cv_distribuir(cv8);
  ms := extract(epoch from clock_timestamp() - t0) * 1000; v_log := v_log || ' distribuir=' || round(ms) || 'ms';
  perform pg_temp.ok(ms < 1000, 'lento nx_cv_distribuir ' || round(ms) || ' ms');

  raise exception 'OK_06_CONVERSAS todos os casos passaram ·%', v_log;
end $t$;

rollback;
