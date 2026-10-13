-- ============================================================
-- ÓRBITA — supabase/testes/27_seguranca_dados.sql · smoke de 20261013b_seguranca_dados.sql (plano 1000, frente srv)
--   SV-189 nx_login_ip (cf-connecting-ip) · SV-127 cliente pausado no nx_ctx · SV-188 IA para gestor/super
--   SV-107 formulário sem negócio em dobro · SV-108 limites por IP (formulário e rastreio) · SV-111 página de conversas com
--   desempate por id · SV-135 nota fixada na linha do tempo + nx_crm_tempo_pagina · SV-058 nx_midia_visiveis
-- Roda em begin … rollback; termina em raise exception 'OK_27_…'.
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
  org_p uuid; cA uuid; cB uuid; cP uuid; kM uuid;
  k_sup uuid; k_adm uuid; k_at uuid; k_out uuid; k_colega uuid;
  t_sup text := 'tok-27-sup-' || sfx; t_adm text := 'tok-27-adm-' || sfx; t_at text := 'tok-27-at-' || sfx;
  ch text := encode(extensions.gen_random_bytes(24), 'hex');
  ip1 text := '198.51.100.' || (floor(random() * 200) + 1)::int; ip2 text := '192.0.2.' || (floor(random() * 200) + 1)::int;
  pre text := '55129' || lpad((floor(random() * 9000) + 1000)::text, 4, '0');
  ct bigint; ct2 bigint; cv1 bigint; cv2 bigint; cv3 bigint; neg bigint; nt bigint; v_ts timestamptz;
  j json; jb jsonb; n int; e text; ctx jsonb;
begin
  select id into org_p from public.nx_orgs where tipo = 'plataforma' limit 1;
  perform pg_temp.ok(org_p is not null, 'fixture: org da plataforma');
  perform pg_temp.ok(exists (select 1 from public.nx_versao_banco where nome = '20261013b_seguranca_dados'), 'versão registrada');
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status, entrada_chave) values ('t27-a-' || sfx, 'Teste 27 A', org_p, 'interno', 'odonto', 'ativo', ch) returning id into cA;
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status) values ('t27-b-' || sfx, 'Teste 27 B', org_p, 'interno', 'odonto', 'ativo') returning id into cB;
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status, ativo) values ('t27-p-' || sfx, 'Teste 27 P', org_p, 'interno', 'odonto', 'ativo', false) returning id into cP;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t27-sup-' || sfx || '@teste.local', 'Super 27', 'x', 'gestor', true, org_p) returning id into k_sup;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t27-adm-' || sfx || '@teste.local', 'Admin 27', 'x', 'clinica', true, org_p) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t27-at-' || sfx || '@teste.local', 'Atendente 27', 'x', 'clinica', true, org_p) returning id into k_at;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t27-out-' || sfx || '@teste.local', 'Outra 27', 'x', 'clinica', true, org_p) returning id into k_out;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t27-col-' || sfx || '@teste.local', 'Colega 27', 'x', 'clinica', true, org_p) returning id into k_colega;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_adm, cA, 'admin'), (k_adm, cP, 'admin'), (k_out, cB, 'atendente'), (k_colega, cA, 'atendente');
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas) values (k_at, cA, 'atendente', false);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash(t_sup), k_sup, now() + interval '1 hour'), (public.nx_hash(t_adm), k_adm, now() + interval '1 hour'),
    (public.nx_hash(t_at), k_at, now() + interval '1 hour');
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor) values (cA, 'Meta 27', 'pn-27-' || sfx, 'meta') returning id into kM;

  -- ---------------------------------------------------------- SV-189 IP
  perform set_config('request.headers', json_build_object('cf-connecting-ip', ip1, 'x-forwarded-for', 'forjado, 10.0.0.1')::text, true);
  perform pg_temp.ok(public.nx_login_ip() = ip1, 'cf-connecting-ip vale antes do 1º x-forwarded-for (que o cliente forja)');
  perform set_config('request.headers', json_build_object('x-forwarded-for', ip2 || ', 10.0.0.1')::text, true);
  perform pg_temp.ok(public.nx_login_ip() = ip2, 'sem ele, o 1º do x-forwarded-for (como antes)');
  perform set_config('request.headers', '', true);

  -- ---------------------------------------------------------- SV-127 cliente pausado
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_fn_ctx(%L,%L,%L)', t_adm, cP, 'atendente')) = 'cliente_pausado', 'pausado: escrita da equipe → cliente_pausado');
  perform pg_temp.ok((public.nx_fn_ctx(t_adm, cP, 'leitura')::jsonb ->> 'conta_id')::uuid = k_adm, 'pausado: leitura segue');
  perform pg_temp.ok((public.nx_fn_ctx(t_sup, cP, 'admin')::jsonb ->> 'papel') = 'super', 'super não é barrado');
  perform pg_temp.ok((public.nx_fn_ctx(t_adm, cA, 'admin')::jsonb ->> 'papel') = 'admin', 'cliente ativo: como sempre');

  -- ---------------------------------------------------------- SV-188 IA para gestor/super
  j := public.nx_ia_reservar(cA, k_sup, 'sugerir');
  perform pg_temp.ok((j ->> 'ok')::boolean and (j ->> 'reserva_id') is not null, 'super sem nx_acessos reserva a IA ' || j::text);
  perform pg_temp.ok((public.nx_ia_reservar(cA, k_adm, 'resumir') ->> 'ok')::boolean, 'admin do cliente: como sempre');
  perform pg_temp.ok(public.nx_ia_reservar(cA, k_out, 'sugerir') ->> 'erro' = 'sem_acesso', 'atendente de OUTRO cliente: sem_acesso');

  -- ---------------------------------------------------------- SV-107 formulário: negócio aberto recebe a nota
  perform public.nx_lead_entrada(ch, jsonb_build_object('nome', 'Paula Site', 'telefone', pre || '01001', 'mensagem', 'Quero avaliar'));
  select l.id, l.contato_id into neg, ct from public.nx_leads l where l.cliente_id = cA and l.origem = 'site';
  perform public.nx_lead_entrada(ch, jsonb_build_object('nome', 'Paula Site', 'telefone', pre || '01001', 'mensagem', 'Quero avaliar'));
  perform pg_temp.ok((select count(*) from public.nx_leads where cliente_id = cA and contato_id = ct) = 1, '2 envios iguais → 1 negócio');
  perform pg_temp.ok((select count(*) from public.nx_notas where negocio_id = neg) = 2, '… e 2 notas');
  perform pg_temp.ok((select count(*) from public.nx_notificacoes where cliente_id = cA and conta_id = k_adm and link = '#/crm/negocio/' || neg) = 1, '… e 1 aviso (o 2º em 30 min não repete)');
  update public.nx_leads set status = 'perdido' where id = neg;
  perform public.nx_lead_entrada(ch, jsonb_build_object('nome', 'Paula Site', 'telefone', pre || '01001'));
  perform pg_temp.ok((select count(*) from public.nx_leads where cliente_id = cA and contato_id = ct) = 2, 'negócio fechado → negócio novo');

  -- ---------------------------------------------------------- SV-108 limites por IP
  perform set_config('request.headers', json_build_object('x-forwarded-for', ip1)::text, true);
  for i in 1..5 loop perform public.nx_lead_entrada(ch, jsonb_build_object('nome', 'IP ' || i, 'telefone', pre || lpad((2000 + i)::text, 5, '0'))); end loop;
  e := pg_temp.erro(format('select public.nx_lead_entrada(%L, %L::jsonb)', ch, jsonb_build_object('nome', 'IP 6', 'telefone', pre || '02006')));
  perform pg_temp.ok(e like 'limite_taxa%', '6º formulário do mesmo IP na hora → limite_taxa (' || e || ')');
  perform set_config('request.headers', json_build_object('x-forwarded-for', ip2)::text, true);
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_lead_entrada(%L, %L::jsonb)', ch, jsonb_build_object('nome', 'Outro IP', 'telefone', pre || '02007'))) = 'ok', 'outro IP passa');
  for i in 1..60 loop perform public.nx_rastreio_registrar(ch, '{"utm_source":"x"}'::jsonb); end loop;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_rastreio_registrar(%L, %L::jsonb)', ch, '{"utm_source":"x"}')) = 'limite_taxa', '61º clique do mesmo IP no minuto → limite_taxa');
  perform set_config('request.headers', json_build_object('x-forwarded-for', ip1)::text, true);
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_rastreio_registrar(%L, %L::jsonb)', ch, '{"utm_source":"x"}')) = 'ok', 'outro IP registra');
  perform set_config('request.headers', '', true);

  -- ---------------------------------------------------------- SV-111 página de conversas com o mesmo horário
  v_ts := date_trunc('second', now()) - interval '5 minutes';
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Igual 1', pre || '03001') returning id into ct;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, ultima_entrada_em, ultima_msg_em)
    values (cA, kM, ct, '2026-27a' || sfx, 'aberta', v_ts, v_ts) returning id into cv1;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Igual 2', pre || '03002') returning id into ct;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, ultima_entrada_em, ultima_msg_em)
    values (cA, kM, ct, '2026-27b' || sfx, 'aberta', v_ts, v_ts) returning id into cv2;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Igual 3', pre || '03003') returning id into ct2;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, ultima_entrada_em, ultima_msg_em, atribuida_a)
    values (cA, kM, ct2, '2026-27c' || sfx, 'aberta', v_ts, v_ts, k_colega) returning id into cv3;
  update public.nx_conversas set ultima_msg_em = v_ts, ultima_entrada_em = v_ts where id in (cv1, cv2, cv3);
  jb := public.nx_cv_listar(t_adm, cA, jsonb_build_object('aba', 'abertas', 'canal_id', kM), 2, v_ts + interval '1 second')::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb -> 'itens') = 2 and (jb ->> 'tem_mais')::boolean, 'página 1: 2 de 3 com o mesmo horário');
  jb := public.nx_cv_listar(t_adm, cA, jsonb_build_object('aba', 'abertas', 'canal_id', kM, 'antes_id', (jb -> 'itens' -> 1 ->> 'id')), 2, v_ts)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb -> 'itens') = 1 and (jb -> 'itens' -> 0 ->> 'id')::bigint = least(cv1, cv2, cv3), 'página 2 (antes_id) traz a 3ª ' || jb::text);
  jb := public.nx_cv_listar(t_adm, cA, jsonb_build_object('aba', 'abertas', 'canal_id', kM), 2, v_ts)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb -> 'itens') = 0, 'sem antes_id: como antes (só o horário)');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_listar(%L,%L,%L::jsonb)', t_adm, cA, '{"antes_id":"x"}')) like 'dados_invalidos%', 'antes_id inválido → dados_invalidos');

  -- ---------------------------------------------------------- SV-135 linha do tempo
  select l.id into neg from public.nx_leads l where l.cliente_id = cA and l.status = 'aberto' order by l.id limit 1;
  insert into public.nx_notas (cliente_id, contato_id, negocio_id, texto, fixada, criado_em)
    values (cA, (select contato_id from public.nx_leads where id = neg), neg, 'Nota fixada antiga 27', true, now() - interval '30 days') returning id into nt;
  insert into public.nx_historico (cliente_id, contato_id, negocio_id, tipo, dados, criado_em)
    select cA, (select contato_id from public.nx_leads where id = neg), neg, 'automacao', '{}'::jsonb, now() - g * interval '1 minute' from generate_series(1, 100) g;
  jb := public.nx_negocio_ver(t_adm, cA, neg)::jsonb;
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(jb -> 'tempo') t where t ->> 'fonte' = 'nota' and (t ->> 'id')::bigint = nt),
    'nota fixada aparece mesmo com 100 eventos mais novos');
  perform pg_temp.ok(jsonb_array_length(jb -> 'tempo') = 80, 'a 1ª página continua com 80');
  v_ts := (select min((t ->> 'em')::timestamptz) from jsonb_array_elements(jb -> 'tempo') t where t ->> 'fonte' = 'historico');
  jb := public.nx_crm_tempo_pagina(t_adm, cA, neg, null, v_ts)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb -> 'itens') >= 20 and not exists (select 1 from jsonb_array_elements(jb -> 'itens') t where (t ->> 'em')::timestamptz >= v_ts),
    'nx_crm_tempo_pagina traz o resto, todo antes do corte');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_crm_tempo_pagina(%L,%L,%s)', t_adm, cB, neg)) in ('sem_acesso', 'negocio_nao_encontrado'), 'negócio de outro cliente: não');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_crm_tempo_pagina(%L,%L)', t_adm, cA)) = 'dados_invalidos', 'sem negócio nem contato: dados_invalidos');

  -- ---------------------------------------------------------- SV-058 mídia visível
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, status, midia)
    values (cA, cv1, (select contato_id from public.nx_conversas where id = cv1), kM, 'in', 'imagem', 'recebida', jsonb_build_object('path', cA || '/in/2026-10/vis.jpg', 'estado', 'ok'));
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, status, midia)
    values (cA, cv3, ct2, kM, 'in', 'imagem', 'recebida', jsonb_build_object('path', cA || '/in/2026-10/colega.jpg', 'estado', 'ok'));
  ctx := public.nx_fn_ctx(t_at, cA, 'leitura')::jsonb;
  jb := public.nx_midia_visiveis(ctx, cA, array[cA || '/in/2026-10/vis.jpg', cA || '/in/2026-10/colega.jpg', cA || '/out/2026-10/novo.jpg', cB || '/in/x.jpg'])::jsonb;
  perform pg_temp.ok(jb ? (cA || '/in/2026-10/vis.jpg') and jb ? (cA || '/out/2026-10/novo.jpg'), 'vê a mídia da conversa visível e o upload ainda sem mensagem ' || jb::text);
  perform pg_temp.ok(not (jb ? (cA || '/in/2026-10/colega.jpg')), 'NÃO vê a mídia da conversa atribuída a outro (ver_todas = false)');
  perform pg_temp.ok(not (jb ? (cB || '/in/x.jpg')), 'nunca path de outro cliente');
  ctx := public.nx_fn_ctx(t_adm, cA, 'leitura')::jsonb;
  perform pg_temp.ok(public.nx_midia_visiveis(ctx, cA, array[cA || '/in/2026-10/colega.jpg'])::jsonb ? (cA || '/in/2026-10/colega.jpg'), 'o admin vê');

  -- ---------------------------------------------------------- permissões
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_midia_visiveis(jsonb,uuid,text[])', 'execute')
                 and has_function_privilege('anon', 'public.nx_crm_tempo_pagina(text,uuid,bigint,bigint,timestamp with time zone)', 'execute')
                 and not has_function_privilege('authenticated', 'public.nx_crm_tempo_pagina(text,uuid,bigint,bigint,timestamp with time zone)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_crm_tempo(uuid,public.nx_ctx_t,bigint,bigint,timestamp with time zone)', 'execute'),
    'permissões: interna só service_role; a página do painel para anon (nunca authenticated)');
  raise exception 'OK_27_SEGURANCA_DADOS — IP pelo cf-connecting-ip, cliente pausado, IA da equipe Nexus, formulário sem negócio em dobro, limites por IP, página de conversas, linha do tempo, mídia visível';
end $t$;
rollback;
