-- ============================================================
-- ÓRBITA — supabase/testes/02_acesso.sql · frente F1
-- Smoke do arquivo b (20260928b_saas_acesso.sql): RPCs antigas passando
-- por nx_ctx/nx_pode (A5/A6), números do nx_dados iguais aos de antes para
-- o gestor, funil fora do Ads some do nx_dados, cfg sensível, nx_executar,
-- contas/escopo, config só super.
-- Roda pelo execute_sql. TUDO em begin … rollback. Falha = 'FALHOU: <caso>'.
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

-- cópias das versões ANTIGAS (texto de 20260926_base_exportada.sql / 20260927_melhorias.sql)
create or replace function pg_temp.nx_pode_antigo(p_conta public.nx_contas, p_cliente uuid) returns boolean language sql as $f$
  select p_conta.papel = 'gestor'
      or exists (select 1 from public.nx_acessos a where a.conta_id = p_conta.id and a.cliente_id = p_cliente)
$f$;

create or replace function pg_temp.nx_sessao_antiga(p_token text) returns json language plpgsql as $f$
declare c public.nx_contas := public.nx_conta_do_token(p_token);
begin
  return json_build_object(
    'conta', json_build_object('id', c.id, 'nome', c.nome, 'email', c.email, 'papel', c.papel),
    'clientes', coalesce((
      select json_agg(json_build_object('id', x.id, 'slug', x.slug, 'nome', x.nome, 'ativo', x.ativo, 'cfg', x.cfg) order by x.nome)
        from public.nx_clientes x where pg_temp.nx_pode_antigo(c, x.id)), '[]'::json));
end $f$;

create or replace function pg_temp.nx_dados_antigo(p_token text, p_cliente uuid, p_dias integer default 130) returns json language plpgsql as $f$
declare c public.nx_contas := public.nx_conta_do_token(p_token); v_de date;
begin
  if not pg_temp.nx_pode_antigo(c, p_cliente) then raise exception 'sem_acesso' using errcode = '42501'; end if;
  v_de := (now() at time zone 'America/Sao_Paulo')::date - least(greatest(coalesce(p_dias, 130), 7), 400);
  return json_build_object(
    'hoje', (now() at time zone 'America/Sao_Paulo')::date,
    'cliente', (select json_build_object('id', id, 'slug', slug, 'nome', nome, 'cfg', cfg) from public.nx_clientes where id = p_cliente),
    'metricas', coalesce((
      select json_agg(json_build_object('p', plataforma, 'd', data, 'n', nivel, 'c', campanha_ext, 'cn', campanha_nome,
             'a', anuncio_ext, 'an', anuncio_nome, 'imp', impressoes, 'alc', alcance, 'freq', frequencia,
             'cli', cliques, 'g', gasto, 'conv', conversoes))
        from public.nx_metricas_dia where cliente_id = p_cliente and data >= v_de), '[]'::json),
    'leads', coalesce((
      select json_agg(row_to_json(l) order by l.data_conversa)
        from (select id, nome, telefone, origem, plataforma, campanha_ext, anuncio_ext, servico, etapa,
                     data_conversa, data_agenda, data_consulta, valor, obs
                from public.nx_leads
               where cliente_id = p_cliente and (data_conversa >= v_de or data_consulta >= v_de or etapa in ('nova', 'agendada'))) l), '[]'::json),
    'alertas', coalesce((
      select json_agg(row_to_json(a) order by a.criado_em desc)
        from (select regra, chave, severidade, mensagem, acao, referencia, criado_em, enviado_em, entregue_em
                from public.nx_alertas where cliente_id = p_cliente and criado_em > now() - interval '15 days') a), '[]'::json),
    'relatorios', coalesce((
      select json_agg(row_to_json(r) order by r.referencia desc)
        from (select tipo, referencia, texto, leitura_ia, enviado_em, erro, entregue_em
                from public.nx_relatorios where cliente_id = p_cliente order by referencia desc limit 20) r), '[]'::json),
    'integracoes', coalesce((
      select json_agg(json_build_object('canal', canal, 'ativo', ativo, 'ultimo_sync', ultimo_sync, 'status', status))
        from public.nx_integracoes where cliente_id = p_cliente), '[]'::json));
end $f$;

do $t$
declare
  v_plat uuid; v_rev uuid; cA uuid; cB uuid; cK uuid;
  k_gestor uuid; k_gr uuid; k_adm uuid; k_at uuid; k_le uuid; k_cli uuid; k_r2 uuid; k_r3 uuid;
  f_pac uuid; f_pos uuid; s_emtrat uuid; l1 bigint; lp bigint;
  j json; jn jsonb; ja jsonb; n int; c_old int; c_new int; rc record; kc public.nx_contas;
  cfg_sens jsonb := '{"fee":350,"waGestor":["5512999990000"],"waCliente":["5512988880000"],"assinatura":"Equipe","regrasOff":["r1"],"corMarca":"#145C66"}';
begin
  v_plat := public.nx_org_plataforma();
  -- o gestor ATUAL (conta real do painel, org plataforma) com uma sessão só desta transação
  select id into k_gestor from public.nx_contas where papel = 'gestor' and org_id = v_plat order by criado_em limit 1;
  perform pg_temp.ok(k_gestor is not null, 'existe o gestor atual');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash('tok-f1b-gestor'), k_gestor, now() + interval '1 hour');

  -- ---------------------------------------------------------- nx_pode e nx_sessao do gestor: iguais a antes
  select * into kc from public.nx_contas where id = k_gestor;
  perform pg_temp.ok(not exists (select 1 from public.nx_clientes x where public.nx_pode(kc, x.id) is distinct from pg_temp.nx_pode_antigo(kc, x.id)),
                     'nx_pode do gestor atual igual a antes em todos os clientes');
  perform pg_temp.ok(public.nx_sessao('tok-f1b-gestor')::jsonb = pg_temp.nx_sessao_antiga('tok-f1b-gestor')::jsonb,
                     'nx_sessao do gestor atual idêntica à de antes');
  perform pg_temp.ok((select ultimo_acesso is not null from public.nx_contas where id = k_gestor), 'nx_sessao atualiza ultimo_acesso');
  for rc in select id from public.nx_clientes loop
    perform pg_temp.ok(public.nx_dados('tok-f1b-gestor', rc.id)::jsonb = pg_temp.nx_dados_antigo('tok-f1b-gestor', rc.id)::jsonb,
                       'nx_dados do gestor igual a antes no cliente ' || rc.id);
  end loop;

  -- ---------------------------------------------------------- cenário de teste
  insert into public.nx_orgs (slug, nome, tipo, limites) values ('teste-f1b-rev', 'Revenda Teste F1b', 'revenda', '{"empresas":2}') returning id into v_rev;
  insert into public.nx_clientes (slug, nome, cfg) values ('teste-f1b-a', 'Teste F1b A', cfg_sens) returning id into cA;
  insert into public.nx_clientes (slug, nome, org_id) values ('teste-f1b-b', 'Teste F1b B', v_rev) returning id into cB;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('teste-f1b-gr@teste.local', 'Gestor Rev', 'x', 'gestor', true, v_rev) returning id into k_gr;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f1b-adm@teste.local', 'Admin A', 'x', 'clinica', true) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f1b-at@teste.local', 'Atendente A', 'x', 'clinica', true) returning id into k_at;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f1b-le@teste.local', 'Leitura A', 'x', 'clinica', true) returning id into k_le;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('teste-f1b-cli@teste.local', 'Clínica Rev', 'x', 'clinica', true, v_rev) returning id into k_cli;
  insert into public.nx_acessos (conta_id, cliente_id) values (k_adm, cA);                     -- papel padrão admin (painel clássico)
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_at, cA, 'atendente'), (k_le, cA, 'leitura'), (k_cli, cB, 'atendente');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash('tok-f1b-gr'), k_gr, now() + interval '1 hour'), (public.nx_hash('tok-f1b-adm'), k_adm, now() + interval '1 hour'),
    (public.nx_hash('tok-f1b-at'), k_at, now() + interval '1 hour'), (public.nx_hash('tok-f1b-le'), k_le, now() + interval '1 hour');
  select id into f_pac from public.nx_funis where cliente_id = cA and padrao;
  select id into f_pos from public.nx_funis where cliente_id = cA and not conta_no_ads;
  select id into s_emtrat from public.nx_estagios where funil_id = f_pos order by ordem limit 1;

  -- ---------------------------------------------------------- nx_pode novo
  select * into kc from public.nx_contas where id = k_gr;
  perform pg_temp.ok(public.nx_pode(kc, cB) and not public.nx_pode(kc, cA), 'nx_pode: gestor de revenda só na própria org');
  select * into kc from public.nx_contas where id = k_gestor;
  perform pg_temp.ok(public.nx_pode(kc, cB), 'nx_pode: super vê revenda');

  -- ---------------------------------------------------------- nx_lead_salvar (A6)
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_lead_salvar(%L,%L,%L)', 'tok-f1b-le', cA, '{"nome":"X","telefone":"12999990001"}')) = 'sem_permissao',
                     'leitura chamando nx_lead_salvar → sem_permissao');
  j := public.nx_lead_salvar('tok-f1b-at', cA, '{"nome":"Paciente F1b","telefone":"(12) 99999-0001","etapa":"nova"}');
  l1 := (j ->> 'id')::bigint;
  perform pg_temp.ok((select funil_id = f_pac and contato_id is not null and status = 'aberto' from public.nx_leads where id = l1), 'nx_lead_salvar cria negócio no funil padrão com contato');
  perform pg_temp.ok(j::jsonb ?& array['etapa','valor','data_conversa'], 'nx_lead_salvar devolve as chaves de sempre');
  j := public.nx_lead_salvar('tok-f1b-adm', cA, format('{"id":%s,"etapa":"fechou","valor":"1200"}', l1)::jsonb);
  perform pg_temp.ok((select status = 'ganho' and fechado_em is not null and estagio_id = (select id from public.nx_estagios where funil_id = f_pac and marco = 'fechou')
                        from public.nx_leads where id = l1), 'painel clássico: etapa fechou move para Fechou tratamento (ganho)');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_lead_salvar(%L,%L,%L)', 'tok-f1b-gr', cA, '{"nome":"X"}')) = 'sem_acesso',
                     'gestor de revenda não grava lead de cliente da Nexus');

  -- ---------------------------------------------------------- nx_dados: papel, módulo, suspensão, funil fora do Ads, cfg
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_dados(%L,%L)', 'tok-f1b-at', cA)) = 'sem_permissao', 'atendente não lê nx_dados (admin)');
  jn := public.nx_dados('tok-f1b-adm', cA)::jsonb;
  perform pg_temp.ok((jn #> '{cliente,cfg}') ?& array['fee','assinatura','regrasOff','corMarca']
                 and not ((jn #> '{cliente,cfg}') ?| array['waGestor','waCliente']), 'nx_dados de admin: com fee, sem waGestor/waCliente');
  ja := public.nx_dados('tok-f1b-gestor', cA)::jsonb;
  perform pg_temp.ok((ja #> '{cliente,cfg}') ?& array['fee','waGestor','waCliente','assinatura','regrasOff'], 'nx_dados do gestor com cfg inteiro');
  c_old := jsonb_array_length(ja -> 'leads');
  insert into public.nx_leads (cliente_id, nome, telefone, funil_id, origem) values (cA, 'Pós F1b', '12999990002', f_pos, 'manual') returning id into lp;
  perform pg_temp.ok((select funil_id = f_pos and estagio_id = s_emtrat from public.nx_leads where id = lp), 'negócio no pós-venda');
  c_new := jsonb_array_length(public.nx_dados('tok-f1b-gestor', cA)::jsonb -> 'leads');
  perform pg_temp.ok(c_new = c_old, 'funil conta_no_ads=false some do nx_dados');
  perform pg_temp.ok(jsonb_array_length(pg_temp.nx_dados_antigo('tok-f1b-gestor', cA)::jsonb -> 'leads') = c_old + 1, '(o nx_dados antigo contaria o pós-venda)');
  update public.nx_clientes set modulos = '{crm,conversas,relatorios}' where id = cA;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_dados(%L,%L)', 'tok-f1b-adm', cA)) = 'modulo_desligado|ads', 'módulo ads desligado → modulo_desligado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_integracoes_status(%L,%L)', 'tok-f1b-adm', cA)) = 'modulo_desligado|ads', 'integrações também exigem ads');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_dados(%L,%L)', 'tok-f1b-gestor', cA)) = 'ok', 'gestor/super passa sem o módulo');
  update public.nx_clientes set modulos = '{crm,conversas,relatorios,ads,automacoes,marca}', status = 'suspenso' where id = cA;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_dados(%L,%L)', 'tok-f1b-adm', cA)) = 'conta_suspensa', 'cliente suspenso + conta clinica chamando nx_dados → conta_suspensa');
  update public.nx_clientes set status = 'ativo' where id = cA;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_dados(%L,%L)', 'tok-f1b-gr', cA)) = 'sem_acesso', 'gestor de revenda não lê nx_dados da Nexus');

  -- ---------------------------------------------------------- nx_sessao: cfg sensível
  jn := public.nx_sessao('tok-f1b-adm')::jsonb;
  perform pg_temp.ok(jsonb_array_length(jn -> 'clientes') = 1
                 and not ((jn #> '{clientes,0,cfg}') ?| array['fee','waGestor','waCliente','assinatura','regrasOff'])
                 and (jn #>> '{clientes,0,cfg,corMarca}') = '#145C66', 'nx_sessao de conta clinica sem fee/waGestor/waCliente/assinatura/regrasOff');
  perform pg_temp.ok(jn ?& array['conta','clientes'] and (jn -> 'conta') ?& array['id','nome','email','papel'], 'nx_sessao mantém o formato');
  ja := public.nx_sessao('tok-f1b-gestor')::jsonb;
  perform pg_temp.ok((select (c -> 'cfg') ?& array['fee','waGestor','waCliente','assinatura','regrasOff']
                        from jsonb_array_elements(ja -> 'clientes') c where c ->> 'id' = cA::text), 'nx_sessao do gestor com tudo no cfg');
  jn := public.nx_sessao('tok-f1b-gr')::jsonb;
  perform pg_temp.ok(jsonb_array_length(jn -> 'clientes') = 1 and (jn #>> '{clientes,0,id}') = cB::text, 'nx_sessao do gestor de revenda só com os clientes dela');

  -- ---------------------------------------------------------- nx_integracoes_status / nx_integracao_salvar
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_integracoes_status(%L,%L)', 'tok-f1b-le', cA)) = 'sem_permissao', 'integrações: leitura → sem_permissao');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_integracoes_status(%L,%L)', 'tok-f1b-adm', cA)) = 'ok', 'integrações: admin lê');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_integracao_salvar(%L,%L,%L,%L)', 'tok-f1b-gr', cA, 'meta', '{"token":"x"}')) = 'sem_acesso',
                     'gestor de revenda não grava integração de cliente da Nexus');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_integracao_salvar(%L,%L,%L,%L)', 'tok-f1b-adm', cA, 'meta', '{"token":"x"}')) = 'so_gestor',
                     'integração continua só de gestor');

  -- ---------------------------------------------------------- nx_executar (A5)
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_executar(%L,%L,%L)', 'tok-f1b-gestor', 'nx-enviar', '{"alerta":{"texto":"x"}}')) = 'funcao_invalida',
                     'nx_executar(nx-enviar) → funcao_invalida');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_executar(%L,%L,%L)', 'tok-f1b-gr', 'nx-ciclo', json_build_object('cliente', cA))) = 'sem_acesso',
                     'gestor de revenda + cliente da Nexus → sem_acesso');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_executar(%L,%L,%L)', 'tok-f1b-gr', 'nx-ciclo', '{}')) = 'so_plataforma',
                     'sem cliente (todos) só super');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_executar(%L,%L,%L)', 'tok-f1b-gr', 'nx-ciclo', '{"cliente":"abc"}')) = 'dados_invalidos|cliente',
                     'cliente inválido → dados_invalidos');
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_disparar(text,jsonb)', 'execute')
                 and not has_function_privilege('authenticated', 'public.nx_disparar(text,jsonb)', 'execute'), 'nx_disparar sem grant para anon/authenticated');

  -- ---------------------------------------------------------- nx_cliente_salvar
  -- número de WhatsApp de OUTRO cliente (canal novo ou wa_phone_number_id) → numero_em_uso
  insert into public.nx_canais (cliente_id, nome, phone_number_id) values (cA, 'Segundo número', 'teste-f1b-pid-a2');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cliente_salvar(%L,%L)', 'tok-f1b-gr', json_build_object('id', cB, 'wa_phone_number_id', 'teste-f1b-pid-a2'))) = 'numero_em_uso',
                     'revenda não sequestra o número (canal) de cliente da Nexus');
  perform pg_temp.ok((select wa_phone_number_id is null from public.nx_clientes where id = cB), '(e nada gravado)');
  update public.nx_clientes set wa_phone_number_id = 'teste-f1b-pid-a1' where id = cA;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cliente_salvar(%L,%L)', 'tok-f1b-gr', '{"slug":"teste-f1b-x","nome":"X","wa_phone_number_id":"teste-f1b-pid-a1"}')) = 'numero_em_uso',
                     'cliente novo com o número de outro → numero_em_uso');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cliente_salvar(%L,%L)', 'tok-f1b-gestor', json_build_object('id', cA, 'nome', 'Teste F1b A', 'wa_phone_number_id', 'teste-f1b-pid-a1'))) = 'ok',
                     'painel clássico: salvar o cliente com o PRÓPRIO número continua valendo');
  j := public.nx_cliente_salvar('tok-f1b-gr', '{"slug":"teste-f1b-c","nome":"Teste F1b C"}');
  perform pg_temp.ok((select org_id = v_rev and plano = 'essencial' from public.nx_clientes where id = (j ->> 'id')::uuid), 'cliente criado pelo gestor de revenda nasce na org dela');
  perform pg_temp.ok((select modulos = (select p.modulos from public.nx_planos p where p.id = 'essencial') from public.nx_clientes where id = (j ->> 'id')::uuid),
                     'cliente da revenda nasce com os módulos DO PLANO (sem ads/automacoes/marca no essencial)');
  perform pg_temp.ok(j::jsonb ?& array['id','slug','nome','ativo','cfg','wa_phone_number_id'], 'nx_cliente_salvar mantém o formato');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cliente_salvar(%L,%L)', 'tok-f1b-gr', '{"slug":"teste-f1b-d","nome":"Teste F1b D"}')) = 'limite_plano|org_empresas:2',
                     'revenda no limite de empresas → limite_plano');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cliente_salvar(%L,%L)', 'tok-f1b-gr', json_build_object('id', cA, 'nome', 'Invasão'))) = 'sem_acesso',
                     'gestor de revenda não edita cliente da Nexus');
  j := public.nx_cliente_salvar('tok-f1b-gestor', json_build_object('slug', 'teste-f1b-e', 'nome', 'Teste F1b E', 'org_id', v_plat)::jsonb);
  perform pg_temp.ok((select org_id = v_plat and plano = 'interno' and modulos = '{crm,conversas,relatorios,ads,automacoes,marca}'
                        from public.nx_clientes where id = (j ->> 'id')::uuid), 'super cria cliente (plano interno na plataforma, todos os módulos — como antes)');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cliente_salvar(%L,%L)', 'tok-f1b-gestor', '{"slug":"teste-f1b-f","nome":"F","org_id":"nao-e-uuid"}')) = 'dados_invalidos|org_id',
                     'org_id inválido → dados_invalidos');
  j := public.nx_cliente_salvar('tok-f1b-gestor', json_build_object('id', cA, 'cfg', json_build_object('cpaAlvo', 90))::jsonb);
  perform pg_temp.ok((j::jsonb -> 'cfg') ?& array['fee','cpaAlvo'], 'cfg continua mesclado');

  -- ---------------------------------------------------------- nx_contas_listar / nx_conta_definir
  jn := public.nx_contas_listar('tok-f1b-gr')::jsonb;
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(jn) c where c ->> 'id' = k_gestor::text)
                 and exists (select 1 from jsonb_array_elements(jn) c where c ->> 'id' = k_cli::text), 'gestor de revenda só lista contas da org dela');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(public.nx_contas_listar('tok-f1b-gestor')::jsonb) c where c ->> 'id' = k_gr::text), 'super lista todas');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_conta_definir(%L,%L,true,%L,%L)', 'tok-f1b-gr', k_adm, 'clinica', array[cB])) = 'sem_permissao',
                     'gestor de revenda não mexe em conta da Nexus');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_conta_definir(%L,%L,true,%L,%L)', 'tok-f1b-gr', k_cli, 'clinica', array[cA])) = 'sem_acesso',
                     'gestor de revenda não dá acesso a cliente da Nexus');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_conta_definir(%L,%L,true,%L,%L)', 'tok-f1b-gr', k_gestor, 'clinica', array[]::uuid[])) = 'sem_permissao',
                     'gestor de revenda não rebaixa o super');
  perform public.nx_conta_definir('tok-f1b-gr', k_cli, true, 'clinica', array[cB]);
  perform pg_temp.ok((select papel from public.nx_acessos where conta_id = k_cli and cliente_id = cB) = 'atendente', 'nx_conta_definir mantém o papel do acesso que continua');
  perform public.nx_conta_definir('tok-f1b-gestor', k_at, true, 'clinica', array[cA, cB]);
  perform pg_temp.ok((select count(*) from public.nx_acessos where conta_id = k_at) = 2
                 and (select papel from public.nx_acessos where conta_id = k_at and cliente_id = cA) = 'atendente', 'super acrescenta acesso sem mexer no papel existente');
  perform pg_temp.ok((select org_id from public.nx_contas where id = k_at) = v_plat, 'org_id da conta nunca muda');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_conta_definir(%L,%L,true,null,%L)', 'tok-f1b-gestor', k_at, array[cA])) = 'papel_invalido',
                     'p_papel nulo → papel_invalido (antes: erro cru 23502)');
  -- limite 'usuarios' no acesso NOVO dado pelo gestor da revenda (cB: essencial = 3 usuários; já tem k_cli e k_at)
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('teste-f1b-r2@teste.local', 'Rev 2', 'x', 'clinica', true, v_rev) returning id into k_r2;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('teste-f1b-r3@teste.local', 'Rev 3', 'x', 'clinica', true, v_rev) returning id into k_r3;
  update public.nx_clientes set plano = 'essencial', limites = '{"usuarios":3}' where id = cB;
  perform pg_temp.ok((select count(*) from public.nx_acessos where cliente_id = cB) = 2, '(cB já tem 2 usuários)');
  perform public.nx_conta_definir('tok-f1b-gr', k_r2, true, 'clinica', array[cB]);
  perform pg_temp.ok((select count(*) from public.nx_acessos where cliente_id = cB) = 3, '3º usuário da revenda entra');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_conta_definir(%L,%L,true,%L,%L)', 'tok-f1b-gr', k_r3, 'clinica', array[cB])) = 'limite_plano|usuarios:3',
                     'gestor da revenda: 4º acesso → limite_plano (usuarios)');
  perform public.nx_conta_definir('tok-f1b-gr', k_r2, true, 'clinica', array[cB]);
  perform pg_temp.ok((select count(*) from public.nx_acessos where cliente_id = cB) = 3, 'redefinir quem já tem acesso não conta de novo');

  -- ---------------------------------------------------------- nx_config_ver / salvar
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_config_ver(%L)', 'tok-f1b-gr')) = 'so_plataforma', 'config: gestor de revenda → so_plataforma');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_config_salvar(%L,%L)', 'tok-f1b-gr', '{"modelo_ia":"x"}')) = 'so_plataforma', 'config salvar: gestor de revenda → so_plataforma');
  perform pg_temp.ok((public.nx_config_ver('tok-f1b-gestor')::jsonb) ?& array['webhook_url','wa_verify_token','tem_wa_token','saas_url','ultimas_execucoes'], 'config: super vê (com saas_url)');

  -- ---------------------------------------------------------- permissões
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_pode(public.nx_contas,uuid)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_papel_em(public.nx_contas,uuid)', 'execute')
                 and has_function_privilege('anon', 'public.nx_dados(text,uuid,integer)', 'execute')
                 and has_function_privilege('anon', 'public.nx_sessao(text)', 'execute'), 'grants do arquivo b');
  raise notice 'OK 02_acesso: todos os casos passaram';
end $t$;

select 'OK 02_acesso' as resultado;
rollback;
