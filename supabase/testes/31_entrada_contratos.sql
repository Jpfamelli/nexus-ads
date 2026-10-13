-- ============================================================
-- ÓRBITA — supabase/testes/31_entrada_contratos.sql · smoke de 20261013f_entrada_contratos.sql (plano 1000, frente srv, lote srv-3)
--   formulário com utm_medium/content/term, gclid, fbclid e aceite (SV-137 origem/plataforma) · SV-136 a mesma trava ·
--   SV-198 contato bloqueado · SV-228 telefone vazio no webhook · nx_auto_base.canais[].provedor · convites[].departamentos ·
--   execuções com contato/negócio · nx_negocio_mover com p_req · SV-139 conversas só na 1ª página · SV-114 estado_desde ·
--   SV-117 nx_dados_colunas
-- Roda em begin … rollback; termina em raise exception 'OK_31_…'.
-- ============================================================
begin;
create or replace function pg_temp.ok(p boolean, p_caso text) returns void language plpgsql as $f$
begin
  if not coalesce(p, false) then raise exception 'FALHOU: %', p_caso; end if;
end $f$;
create or replace function pg_temp.erro(p_sql text) returns text language plpgsql as $f$
declare m text; h text; s text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics m = message_text, h = pg_exception_hint, s = returned_sqlstate;
  return m || coalesce('|' || nullif(h, ''), '') || '|' || s;
end $f$;

do $t$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  org_p uuid; cA uuid; k_adm uuid; kM uuid; kC uuid; dep uuid; f uuid; e_nova uuid; e_ag uuid; aut uuid;
  t_adm text := 'tok-31-adm-' || sfx;
  ch text := encode(extensions.gen_random_bytes(24), 'hex');
  tel text := '5512996' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  tel2 text := '5512995' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  tel3 text := '5512994' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  ct bigint; ct2 bigint; cv bigint; l1 bigint; m1 bigint; req uuid := gen_random_uuid();
  j json; jb jsonb; jb2 jsonb; n int; v_ult timestamptz;
begin
  perform pg_temp.ok(exists (select 1 from public.nx_versao_banco where nome = '20261013f_entrada_contratos'), 'versão registrada');
  select id into org_p from public.nx_orgs where tipo = 'plataforma' limit 1;
  insert into public.nx_clientes (slug, nome, org_id, vertical, status, entrada_chave) values ('t31-' || sfx, 'Teste 31', org_p, 'odonto', 'ativo', ch) returning id into cA;
  update public.nx_clientes set modulos = array(select distinct unnest(coalesce(modulos, '{}'::text[]) || array['crm', 'conversas', 'automacoes', 'ads'])) where id = cA;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t31-adm-' || sfx || '@teste.local', 'Admin 31', 'x', 'clinica', true, org_p) returning id into k_adm;
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas) values (k_adm, cA, 'admin', true);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(t_adm), k_adm, now() + interval '1 hour');
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor) values (cA, 'Meta 31', 'pn-31-' || sfx, 'meta') returning id into kM;
  insert into public.nx_canais (cliente_id, nome, provedor, codewords_numero) values (cA, 'Aparelho 31', 'codewords', '+5512991230031') returning id into kC;
  select id into f from public.nx_funis where cliente_id = cA and padrao limit 1;
  select id into e_nova from public.nx_estagios where funil_id = f and marco = 'nova' limit 1;
  select id into e_ag from public.nx_estagios where funil_id = f and marco = 'agendada' and tipo = 'aberto' limit 1;

  -- ---------------------------------------------------------- formulário: UTMs completos, gclid/fbclid, aceite (SV-137)
  j := public.nx_lead_entrada(ch, jsonb_build_object('nome', 'Bia 31', 'telefone', tel, 'utm_source', 'instagram', 'utm_medium', 'paid',
         'utm_campaign', 'promo-31', 'utm_content', 'video-a', 'utm_term', 'implante', 'fbclid', 'FB.31_x', 'aceite_privacidade', true));
  select * into jb from (select to_jsonb(l) from public.nx_leads l where l.cliente_id = cA and l.nome = 'Bia 31') x(to_jsonb);
  perform pg_temp.ok(jb ->> 'origem' = 'anuncio' and jb ->> 'plataforma' = 'meta' and jb ->> 'campanha_ext' = 'promo-31', 'formulário: instagram + paid → anúncio da Meta com a campanha');
  perform pg_temp.ok(jb -> 'rastreio' ->> 'utm_medium' = 'paid' and jb -> 'rastreio' ->> 'utm_content' = 'video-a' and jb -> 'rastreio' ->> 'utm_term' = 'implante'
                 and jb -> 'rastreio' ->> 'fbclid' = 'FB.31_x' and (jb -> 'rastreio' ->> 'aceite_privacidade')::boolean and jb -> 'rastreio' ? 'aceite_em',
                 'formulário: utm_medium/content/term, fbclid e aceite gravados no rastreio do negócio');
  perform pg_temp.ok(jb ->> 'obs' like '%utm_medium=paid%' and jb ->> 'obs' like '%aceitou a política de privacidade%', 'formulário: e na observação');
  perform pg_temp.ok(exists (select 1 from public.nx_contatos k where k.cliente_id = cA and k.id = (jb ->> 'contato_id')::bigint and k.origem = 'anuncio' and k.plataforma = 'meta'),
    'formulário: contato com a origem/plataforma do 1º toque');
  j := public.nx_lead_entrada(ch, jsonb_build_object('nome', 'Caio 31', 'telefone', tel2, 'gclid', 'Cj0KCQ-31'));
  perform pg_temp.ok(exists (select 1 from public.nx_leads l where l.cliente_id = cA and l.nome = 'Caio 31' and l.origem = 'anuncio' and l.plataforma = 'google' and l.gclid = 'Cj0KCQ-31'),
    'formulário: gclid → anúncio do Google com o gclid');
  j := public.nx_lead_entrada(ch, jsonb_build_object('nome', 'Duda 31', 'email', 'duda31-' || sfx || '@exemplo.com'));
  perform pg_temp.ok(exists (select 1 from public.nx_leads l where l.cliente_id = cA and l.nome = 'Duda 31' and l.origem = 'site' and l.plataforma is null
                              and not (coalesce(l.rastreio, '{}'::jsonb) ? 'aceite_privacidade')), 'formulário: sem UTM → site, sem aceite');
  perform pg_temp.ok(pg_get_functiondef('public.nx_lead_entrada(text,jsonb)'::regprocedure) like '%nx_tel_chave(v_tel)%'
                 and pg_get_functiondef('public.nx_lead_webhook(uuid,text,text[],text,jsonb,date,integer)'::regprocedure) like '%nx_tel_chave(public.nx_tel_normalizar(v_tel, true))%'
                 and pg_get_functiondef('public.nx_wa_entrada(uuid,jsonb)'::regprocedure) like '%coalesce(v_chave, v_wa)%'
                 and pg_get_functiondef('public.nx_wa_entrada(uuid,jsonb)'::regprocedure) like '%set_config(''lock_timeout'', ''5s'', true)%',
    'SV-136/SV-254: a mesma chave de trava (cliente + nx_tel_chave) e lock_timeout nas três');

  -- ---------------------------------------------------------- SV-198 contato bloqueado · SV-228
  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id, bloqueado, ultimo_contato_em) values (cA, 'Bloq 31', tel3, tel3, true, now() - interval '10 days') returning id into ct;
  select ultimo_contato_em into v_ult from public.nx_contatos where id = ct;
  j := public.nx_wa_entrada(kM, jsonb_build_object('wamid', 'w31b' || sfx, 'wa_id', tel3, 'nome', 'Outro Nome', 'tipo', 'texto', 'corpo', 'insisto'));
  perform pg_temp.ok((j ->> 'bloqueado')::boolean and (j ->> 'mensagem_id') is not null, 'bloqueado: a mensagem é gravada');
  perform pg_temp.ok((select ultimo_contato_em from public.nx_contatos where id = ct) = v_ult and (select nome from public.nx_contatos where id = ct) = 'Bloq 31',
    'bloqueado: ultimo_contato_em e nome inalterados');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_lead_webhook(%L, %L, null, null, null, current_date, 30)', cA, '')) = 'telefone_invalido|telefone|22023',
    'webhook: telefone vazio → 22023 com hint telefone');

  -- ---------------------------------------------------------- contratos
  perform pg_temp.ok(exists (select 1 from json_array_elements(public.nx_auto_base(cA) -> 'canais') x where (x ->> 'id')::uuid = kC and x ->> 'provedor' = 'codewords'),
    'nx_auto_base.canais[].provedor');
  insert into public.nx_departamentos (cliente_id, nome) values (cA, 'Recepção 31') returning id into dep;
  insert into public.nx_convites (token_hash, org_id, cliente_id, papel, departamentos, email, expira_em)
    values (public.nx_hash('conv-31-' || sfx), org_p, cA, 'atendente', array[dep], 'conv31@teste.local', now() + interval '2 days');
  j := public.nx_usuarios_listar(t_adm, cA);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'convites') x where x -> 'departamentos' ->> 0 = dep::text), 'nx_usuarios_listar.convites[].departamentos');
  perform pg_temp.ok(j::jsonb ?& array['usuarios', 'eu', 'limite', 'uso', 'departamentos'], 'nx_usuarios_listar: as chaves de sempre');
  insert into public.nx_automacoes (cliente_id, nome, gatilho) values (cA, 'Auto 31', 'negocio_criado') returning id into aut;
  select id, contato_id into l1, ct2 from public.nx_leads where cliente_id = cA and nome = 'Bia 31';
  insert into public.nx_auto_execucoes (automacao_id, cliente_id, chave, ok, detalhe) values (aut, cA, 'te:' || l1, true, 'feito'), (aut, cA, 'xx:zz', true, 'outro');
  j := public.nx_automacao_execucoes(t_adm, cA, aut, 50);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j) x where x ->> 'chave' = 'te:' || l1 and x ->> 'negocio_titulo' is not null
                              and x ->> 'contato_nome' = (select nome from public.nx_contatos where id = ct2)), 'execuções: contato_nome e negocio_titulo pela chave');
  perform pg_temp.ok(exists (select 1 from json_array_elements(j) x where x ->> 'chave' = 'xx:zz' and (x -> 'contato_nome') is not null and x ->> 'contato_nome' is null),
    'execuções: chave sem alvo → campos nulos (presentes)');

  -- ---------------------------------------------------------- nx_negocio_mover com p_req
  j := public.nx_negocio_mover(t_adm, cA, l1, e_ag, null, '{}'::jsonb, req);
  perform pg_temp.ok((select estagio_id from public.nx_leads where id = l1) = e_ag, 'mover com p_req: moveu');
  update public.nx_leads set estagio_id = e_nova where id = l1;
  j := public.nx_negocio_mover(t_adm, cA, l1, e_ag, null, '{}'::jsonb, req);
  perform pg_temp.ok((select estagio_id from public.nx_leads where id = l1) = e_nova, 'mover com o MESMO p_req: devolve o resultado guardado, não move de novo');
  perform public.nx_negocio_mover(t_adm, cA, l1, e_ag);
  perform pg_temp.ok((select estagio_id from public.nx_leads where id = l1) = e_ag, 'mover sem p_req: a assinatura de sempre (4 argumentos) continua');

  -- ---------------------------------------------------------- SV-139 conversas só na 1ª página
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status) values (cA, kM, ct2, '2026-31a' || sfx, 'aberta') returning id into cv;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status) values (cA, cv, ct2, kM, 'in', 'texto', 'oi 31', 'recebida') returning id into m1;
  jb := public.nx_cv_mensagens(t_adm, cA, cv, null, null, null, 50)::jsonb;
  perform pg_temp.ok(jb ? 'conversas' and jsonb_array_length(jb -> 'conversas') >= 1 and jb ? 'itens' and jb ? 'ultimo_id', '1ª página: com a lista de atendimentos');
  jb := public.nx_cv_mensagens(t_adm, cA, cv, null, null, m1 - 1, 50)::jsonb;
  perform pg_temp.ok(not (jb ? 'conversas') and jsonb_array_length(jb -> 'itens') = 1, 'delta: sem a lista (a tela guarda a da 1ª página)');
  jb := public.nx_cv_mensagens(t_adm, cA, cv, m1, null, null, 50)::jsonb;
  perform pg_temp.ok(not (jb ? 'conversas'), 'página anterior: sem a lista');

  -- ---------------------------------------------------------- SV-114 estado_desde
  perform public.nx_canal_historico_gravar(kC, cA, null, 'conectado', 'teste 31');
  perform pg_temp.ok((select estado_desde from public.nx_canais where id = kC) = now(), 'estado_desde gravado na mudança');
  perform pg_temp.ok(exists (select 1 from json_array_elements(public.nx_pulso(t_adm, cA) -> 'canais') x where (x ->> 'id')::uuid = kC and (x ->> 'desde')::timestamptz = now()),
    'pulso: desde pela coluna');
  update public.nx_canais set estado_desde = null where id = kC;
  perform pg_temp.ok(exists (select 1 from json_array_elements(public.nx_pulso(t_adm, cA) -> 'canais') x where (x ->> 'id')::uuid = kC and (x ->> 'desde') is not null),
    'pulso: sem a coluna, o histórico (como antes)');
  n := public.nx_canais_estado_desde_preencher();
  perform pg_temp.ok(n >= 1 and (select estado_desde from public.nx_canais where id = kC) is not null, 'preencher: canais antigos');

  -- ---------------------------------------------------------- SV-117 nx_dados em colunas
  insert into public.nx_metricas_dia (cliente_id, plataforma, nivel, data, campanha_ext, campanha_nome, anuncio_ext, impressoes, cliques, gasto, conversoes)
    values (cA, 'meta', 'campanha', current_date - 1, 'c31', 'Campanha 31', '', 1000, 50, 12.5, 3),
           (cA, 'meta', 'campanha', current_date - 2, 'c31', 'Campanha 31', '', 800, 40, 10, 2);
  jb := public.nx_dados(t_adm, cA, 30)::jsonb;
  jb2 := public.nx_dados_colunas(t_adm, cA, 30)::jsonb;
  perform pg_temp.ok(jb2 -> 'metricas' ->> 'formato' = 'colunas' and (jb2 -> 'metricas' ->> 'n')::int = jsonb_array_length(jb -> 'metricas'), 'colunas: mesmo número de linhas');
  perform pg_temp.ok((select sum((x ->> 'g')::numeric) from jsonb_array_elements(jb -> 'metricas') x)
                     = (select sum(v::numeric) from jsonb_array_elements_text(jb2 -> 'metricas' -> 'campos' -> 'g') v), 'colunas: os mesmos números (gasto)');
  perform pg_temp.ok(jb2 - 'metricas' - 'agora' = jb - 'metricas' - 'agora', 'colunas: o resto da resposta igual');
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_dados_colunas(text,uuid,integer)', 'execute')
                 and has_function_privilege('anon', 'public.nx_negocio_mover(text,uuid,bigint,uuid,double precision,jsonb,uuid)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_canais_estado_desde_preencher()', 'execute'), 'permissões');

  raise exception 'OK_31_ENTRADA_CONTRATOS — formulário com UTMs/aceite e origem, mesma trava, bloqueado intocado, telefone 22023, provedor/departamentos/execuções, mover com p_req, conversas só na 1ª página, estado_desde, nx_dados em colunas';
end $t$;
rollback;
