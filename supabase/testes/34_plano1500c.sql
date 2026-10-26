-- ============================================================
-- ÓRBITA — supabase/testes/34_plano1500c.sql · smoke de 20261022a_plano1500c.sql (plano 1500c, frente srv)
--   SC-010 regra da senha · SC-014 sessão de 90 dias · SC-004 suspensões · UCB-047/UCC-030/SC-019/SC-020 nx_entrar · UCB-050
--   sessões · SC-013/UCB-114 nx_senha_trocar · SC-011/SC-001/SC-012 links de senha · SC-003/SC-005 convites · SC-018 cadastro ·
--   SC-099/SC-095/SC-096 IA · SC-036 rastreio · UCC-018/019 pulso · SC-008 início · AC-063/262/055 cfg · SC-057/AC-055 relatório
--   · SC-143..147 saúde · SC-116/190 faxina · SC-002/UCC-135 erros · UCC-104 eventos · SC-104/105 titular · SC-100/101 exclusão ·
--   SC-054 trava · SC-151 fila · SC-051/052/053 (nada para authenticated, search_path, RLS)
-- Roda em begin … rollback; termina em raise exception 'OK_34_PLANO1500C — …'.
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
  org_p uuid; cA uuid; k_adm uuid; k_at uuid; k_sup uuid; k_log uuid; kM uuid;
  t_adm text := 'tok-34-adm-' || sfx;
  t_at text := 'tok-34-at-' || sfx;
  t_sup text := 'tok-34-sup-' || sfx;
  t_velho text := 'tok-34-velho-' || sfx;
  ch text := encode(extensions.gen_random_bytes(24), 'hex');
  email_log text := 't34-log-' || sfx || '@teste.local';
  ct bigint; ct2 bigint; cv bigint; l1 bigint;
  j json; jb jsonb; n int; v_tok text; v_link1 text; v_link2 text; v_cv uuid; v_txt text;
begin
  perform pg_temp.ok(exists (select 1 from public.nx_versao_banco where nome = '20261022a_plano1500c'), 'versão registrada');
  select id into org_p from public.nx_orgs where tipo = 'plataforma' limit 1;
  insert into public.nx_clientes (slug, nome, org_id, vertical, status, entrada_chave) values ('t34-' || sfx, 'Teste 34', org_p, 'odonto', 'ativo', ch) returning id into cA;
  update public.nx_clientes set modulos = array(select distinct unnest(coalesce(modulos, '{}'::text[]) || array['crm', 'conversas', 'automacoes', 'ads']))
   where id = cA;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t34-adm-' || sfx || '@teste.local', 'Admin Trinta e Quatro', 'x', 'clinica', true, org_p) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t34-at-' || sfx || '@teste.local', 'Atendente Trinta', 'x', 'clinica', true, org_p) returning id into k_at;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t34-sup-' || sfx || '@teste.local', 'Super Trinta', 'x', 'gestor', true, org_p) returning id into k_sup;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id)
  values (email_log, 'Login Trinta', extensions.crypt('senha-boa-34', extensions.gen_salt('bf', 4)), 'clinica', true, org_p) returning id into k_log;
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas) values (k_adm, cA, 'admin', true), (k_at, cA, 'atendente', true), (k_log, cA, 'atendente', true);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(t_adm), k_adm, now() + interval '1 hour'),
                                                                          (public.nx_hash(t_at), k_at, now() + interval '1 hour'),
                                                                          (public.nx_hash(t_sup), k_sup, now() + interval '1 hour');
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor) values (cA, 'Meta 34', 'pn-34-' || sfx, 'meta') returning id into kM;

  -- ---------------------------------------------------------- SC-010 regra da senha
  perform pg_temp.ok(pg_temp.erro($$select public.nx_senha_validar('   abc   ')$$) like 'senha_curta|%', 'SC-010: curta (espaços não contam)');
  perform pg_temp.ok(pg_temp.erro($$select public.nx_senha_validar('          ')$$) like 'senha_curta|%', 'SC-010: só espaços');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_senha_validar(%L)', repeat('a', 73))) like 'dados_invalidos|senha_longa|%', 'SC-010: > 72 bytes');
  perform pg_temp.ok(pg_temp.erro($$select public.nx_senha_validar('senha boa 1')$$) = 'ok', 'SC-010: senha boa');

  -- ---------------------------------------------------------- SC-014 sessão de no máximo 90 dias
  insert into public.nx_sessoes (token_hash, conta_id, expira_em, criado_em) values (public.nx_hash(t_velho), k_adm, now() + interval '10 days', now() - interval '91 days');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_conta_do_token(%L)', t_velho)) like 'sessao_invalida|%', 'SC-014: sessão criada há 91 dias não vale');
  perform pg_temp.ok((public.nx_conta_do_token(t_adm)).id = k_adm, 'SC-014: sessão nova vale');
  j := public.nx_app_sessao(t_adm);
  perform pg_temp.ok((j ->> 'expira_em')::timestamptz > now(), 'UCC-031: nx_app_sessao devolve expira_em');

  -- ---------------------------------------------------------- SC-004 suspender acesso / conta
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_acesso_suspender(%L, %L, %L)', t_adm, cA, k_adm)) like 'dados_invalidos|conta|%', 'SC-004: não suspende a si mesmo');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_acesso_suspender(%L, %L, %L)', t_at, cA, k_adm)) like 'sem_permissao|%', 'SC-004: atendente não suspende');
  j := public.nx_acesso_suspender(t_adm, cA, k_at, true);
  perform pg_temp.ok((j ->> 'suspenso')::boolean, 'SC-004: acesso suspenso');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ctx(%L, %L, %L)', t_at, cA, 'leitura')) like 'sem_acesso|suspenso|%', 'SC-004: nx_ctx recusa acesso suspenso');
  j := public.nx_acesso_suspender(t_adm, cA, k_at, false);
  perform pg_temp.ok((public.nx_ctx(t_at, cA, 'leitura')).conta_id = k_at, 'SC-004: reativado entra de novo');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_conta_suspender(%L, %L)', t_adm, k_at)) like 'sem_permissao|%', 'SC-004: só a plataforma suspende conta');
  j := public.nx_conta_suspender(t_sup, k_at, true);
  perform pg_temp.ok((j ->> 'suspenso')::boolean and not exists (select 1 from public.nx_sessoes where conta_id = k_at), 'SC-004: conta suspensa perde as sessões');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(t_at), k_at, now() + interval '1 hour');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_conta_do_token(%L)', t_at)) like 'sessao_invalida|%', 'SC-004: conta suspensa não usa token');
  j := public.nx_conta_suspender(t_sup, k_at, false);
  perform pg_temp.ok((public.nx_conta_do_token(t_at)).id = k_at, 'SC-004: conta reativada');

  -- ---------------------------------------------------------- nx_entrar (UCC-030, SC-019, SC-020, UCB-047)
  perform set_config('request.headers', '{"user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36"}', true);
  j := public.nx_entrar(email_log, 'senha-boa-34');
  v_tok := j ->> 'token';
  perform pg_temp.ok(v_tok ~ '^[0-9a-f]{64}$' and (j ->> 'expira_em')::timestamptz > now() + interval '29 days', 'UCC-030: token e expira_em');
  perform pg_temp.ok(exists (select 1 from public.nx_auditoria where conta_id = k_log and acao = 'entrou'), 'SC-019: entrada auditada');
  j := public.nx_entrar(email_log, 'senha-errada');
  perform pg_temp.ok(j ->> 'message' = 'credenciais_invalidas' and j ->> 'hint' = 'restam:9', 'UCB-047: hint restam:9 após 1 erro');
  perform set_config('request.headers', '', true);
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_entrar(%L, %L)', email_log, 'senha-errada')) like 'credenciais_invalidas|%', 'nx_entrar fora do PostgREST: raise como antes');
  update public.nx_contas set suspenso_em = now() where id = k_log;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_entrar(%L, %L)', email_log, 'senha-boa-34')) like 'conta_suspensa|%', 'SC-004: nx_entrar recusa conta suspensa');
  update public.nx_contas set suspenso_em = null where id = k_log;
  delete from public.nx_login_falhas where chave like 'conta:' || email_log || '%';

  -- ---------------------------------------------------------- UCB-050 sessões
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash('tok-34-outra-' || sfx), k_log, now() + interval '1 hour');
  j := public.nx_sessoes_listar(v_tok);
  perform pg_temp.ok(json_array_length(j) = 2 and (j -> 0 ->> 'atual')::boolean and j -> 0 ->> 'navegador' = 'Chrome · Windows'
                 and not (j -> 1 ->> 'atual')::boolean, 'UCB-050: lista com a atual primeiro e o navegador');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_sessao_encerrar(%L, %L)', v_tok, j -> 0 ->> 'id')) like 'dados_invalidos|sessao|%', 'UCB-050: não encerra a atual');
  j := public.nx_sessao_encerrar(v_tok, j -> 1 ->> 'id');
  perform pg_temp.ok((j ->> 'encerradas')::int = 1 and json_array_length(public.nx_sessoes_listar(v_tok)) = 1, 'UCB-050: encerra a outra');

  -- ---------------------------------------------------------- SC-013 / UCB-114 nx_senha_trocar
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_senha_trocar(%L, %L, %L)', v_tok, 'errada!!', 'senha-nova-34')) like 'credenciais_invalidas|%', 'SC-013: senha atual errada');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_senha_trocar(%L, %L, %L)', v_tok, 'senha-boa-34', 'curta')) like 'senha_curta|%', 'SC-010: nova curta');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash('tok-34-outra2-' || sfx), k_log, now() + interval '1 hour');
  j := public.nx_senha_trocar(v_tok, 'senha-boa-34', 'senha-nova-34');
  perform pg_temp.ok((j ->> 'sessoes_encerradas')::int = 1, 'UCB-114: sessoes_encerradas');
  insert into public.nx_login_falhas (chave, em) select 'senha:' || k_log::text, now() from generate_series(1, 5);
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_senha_trocar(%L, %L, %L)', v_tok, 'senha-nova-34', 'senha-nova-35')) like 'muitas_tentativas|%', 'SC-013: 5 erros em 15 min bloqueiam');

  -- ---------------------------------------------------------- SC-011 / SC-001 / SC-012 links de senha
  v_link1 := public.nx_senha_link_criar(t_adm, cA, k_log) ->> 'token';
  v_link2 := public.nx_senha_link_criar(t_adm, cA, k_log) ->> 'token';
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_senha_redefinir(%L, %L)', v_link1, 'senha-outra-34')) like 'link_invalido|%', 'SC-011: o link anterior deixa de valer');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_senha_redefinir(%L, %L)', v_link2, '       ')) like 'senha_curta|%', 'SC-010: redefinir com só espaços');
  update public.nx_contas set suspenso_em = now() where id = k_log;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_senha_redefinir(%L, %L)', v_link2, 'senha-outra-34')) like 'link_invalido|%', 'SC-012: conta suspensa não redefine');
  update public.nx_contas set suspenso_em = null where id = k_log;
  j := public.nx_senha_redefinir(v_link2, 'senha-outra-34');
  perform pg_temp.ok((j ->> 'ok')::boolean and (j ->> 'token') ~ '^[0-9a-f]{64}$' and (public.nx_conta_do_token(j ->> 'token')).id = k_log, 'SC-001: redefinir já entra');

  -- ---------------------------------------------------------- SC-003 / SC-005 convites
  j := public.nx_convite_criar(t_adm, cA, '{"papel":"atendente","nome":"Convidada 34"}'::jsonb);
  v_cv := (j ->> 'id')::uuid;
  perform pg_temp.ok((public.nx_convite_ver(j ->> 'token') ->> 'expira_em')::timestamptz > now(), 'SC-003: convite_ver devolve expira_em');
  j := public.nx_convite_regerar(t_adm, cA, v_cv);
  perform pg_temp.ok((j ->> 'id')::uuid <> v_cv and j ->> 'link' like '%#/convite/%'
                 and (select revogado from public.nx_convites where id = v_cv)
                 and (select nome from public.nx_convites where id = (j ->> 'id')::uuid) = 'Convidada 34', 'SC-005: link novo, antigo revogado, mesmos dados');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_convite_regerar(%L, %L, %L)', t_at, cA, (j ->> 'id')::uuid)) like 'sem_permissao|%', 'SC-005: só admin');

  update public.nx_convites set expira_em = now() - interval '1 day' where id = (j ->> 'id')::uuid;
  j := public.nx_usuarios_listar(t_adm, cA);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'convites') x where (x ->> 'vencido')::boolean and x ->> 'nome' = 'Convidada 34')
                 and exists (select 1 from json_array_elements(j -> 'usuarios') x where x::jsonb ? 'suspenso'), 'UCB-029: convite vencido vem com vencido:true; SC-004 suspenso por usuário');

  -- ---------------------------------------------------------- SC-018 cadastro
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_criar_conta(%L, %L, %L)', 't34-novo-' || sfx || '@teste.local', '        ', 'Novo')) like 'senha_curta|%', 'SC-010: cadastro com só espaços');
  insert into public.nx_login_falhas (chave, em) select 'cadastro:global', now() from generate_series(1, 50);
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_criar_conta(%L, %L, %L)', 't34-novo-' || sfx || '@teste.local', 'senha-boa-34', 'Novo')) like 'muitas_tentativas|%', 'SC-018: teto global');
  delete from public.nx_login_falhas where chave = 'cadastro:global';

  -- ---------------------------------------------------------- SC-099 / SC-095 / SC-096 IA
  update public.nx_clientes set ia_desligada = true where id = cA;
  perform pg_temp.ok(public.nx_ia_reservar(cA, k_adm, 'sugerir') ->> 'erro' = 'ia_desligada', 'SC-099: reservar recusa com a IA desligada');
  perform pg_temp.ok((public.nx_ia_custo_resumo(t_adm, cA) -> 'mes' ->> 'desligada')::boolean, 'SC-096: resumo mostra desligada');
  update public.nx_clientes set ia_desligada = false, cfg = coalesce(cfg, '{}'::jsonb) || '{"ia":{"desligada":true}}'::jsonb where id = cA;
  perform pg_temp.ok(public.nx_ia_reservar(cA, k_adm, 'sugerir') ->> 'erro' = 'ia_desligada', 'SC-099: cfg.ia.desligada também');
  update public.nx_clientes set cfg = cfg - 'ia' where id = cA;
  perform pg_temp.ok((public.nx_ia_reservar(cA, k_adm, 'sugerir') ->> 'ok')::boolean, 'SC-099: ligada reserva');
  n := public.nx_ia_franquia_avisar(cA, 80, date_trunc('month', now()));
  perform pg_temp.ok(n >= 1 and public.nx_ia_franquia_avisar(cA, 80, date_trunc('month', now())) = 0, 'SC-095: aviso de 80% uma vez por mês');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ia_custo_resumo(%L, %L)', t_at, cA)) like 'sem_permissao|%', 'SC-096: só admin');

  -- ---------------------------------------------------------- SC-036 rastreio
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_rastreio_registrar(%L, %L::jsonb)', ch,
           jsonb_build_object('pagina', 'https://x.test/', 'lixo', repeat(md5(random()::text), 400))::text)) like 'dados_invalidos|tamanho|%', 'SC-036: > 8 KB recusado');

  -- ---------------------------------------------------------- UCC-018/019 pulso · SC-008 início
  insert into public.nx_contatos (cliente_id, nome, telefone, email) values (cA, 'Titular Trinta', '5512990034001', 't34-tit-' || sfx || '@x.test') returning id into ct;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, ultima_entrada_em, atribuida_a)
  values (cA, kM, ct, 'p34a' || sfx, 'aberta', true, now() - interval '3 minutes', k_at) returning id into cv;
  j := public.nx_pulso(t_adm, cA);
  perform pg_temp.ok((j ->> 'ultima_msg_em')::timestamptz <= now() and j -> 'cliente' ->> 'status' = 'ativo', 'UCC-018/019: pulso');
  j := public.nx_inicio(t_adm, cA);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'conversas' -> 'aguardando_lista') x
                              where (x ->> 'id')::bigint = cv and (x ->> 'atribuida_id')::uuid = k_at and x ->> 'atribuida_nome' = 'Atendente Trinta' and (x ->> 'contato_id')::bigint = ct), 'SC-008/RC-228: quem atende e o contato');

  -- ---------------------------------------------------------- AC-063 / AC-262 / AC-055 cfg
  perform pg_temp.ok(pg_temp.erro($$select public.nx_cfg_validar('{"diasFechados":[0,6],"agenciaNome":"Nexus","relSemanal":true}'::jsonb)$$) = 'ok', 'AC-063/262/055: válidos');
  perform pg_temp.ok(pg_temp.erro($$select public.nx_cfg_validar('{"diasFechados":[7]}'::jsonb)$$) like 'dados_invalidos|diasFechados|%', 'AC-063: dia 7');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cfg_validar(%L::jsonb)', jsonb_build_object('agenciaCidade', repeat('x', 81)))) like 'dados_invalidos|agenciaCidade|%', 'AC-262: > 80');
  perform pg_temp.ok(pg_temp.erro($$select public.nx_cfg_validar('{"relSemanal":"sim"}'::jsonb)$$) like 'dados_invalidos|relSemanal|%', 'AC-055: relSemanal booleano');

  -- ---------------------------------------------------------- SC-057 / AC-055 relatório · saúde · faxina
  perform pg_temp.ok(pg_temp.erro($$select public.nx_relatorio_chamar('anual')$$) like 'dados_invalidos|tipo|%', 'relatório: tipo inválido');
  perform pg_temp.ok(pg_temp.erro($$select public.nx_relatorio_chamar('semanal')$$) = 'ok', 'AC-055: semanal aceito');
  perform pg_temp.ok(exists (select 1 from pg_constraint where conname = 'nx_relatorios_tipo_check' and pg_get_constraintdef(oid) like '%semanal%'), 'AC-055: CHECK aceita semanal');
  j := public.nx_saude_dados();
  perform pg_temp.ok(j ->> 'eventos_atrasados' is not null and j ->> 'integracoes_erro' is not null, 'SC-143/145: saúde');
  perform pg_temp.ok(json_array_length(j -> 'tarefas') = 2 and (j -> 'tarefas' -> 0)::jsonb ? 'atrasada' and j::jsonb ? 'crons_atrasados', 'SC-141/147: tarefas numa leitura e crons atrasados');
  insert into public.nx_erros_front (hash, mensagem, ultimo_em) values ('velho-' || sfx, 'x', now() - interval '31 days');
  j := public.nx_saas_faxina();
  perform pg_temp.ok((j ->> 'erros_front')::int >= 1 and j ->> 'notificacoes_nao_lidas' is not null, 'SC-190/116: faxina');

  -- ---------------------------------------------------------- SC-002 / UCC-135 erros · UCC-104 eventos
  j := public.nx_erro_cliente_registrar(t_adm, '{"codigo":"TypeError","tela":"#/conversas<x>","versao":"34","navegador":"Chrome"}'::jsonb);
  j := public.nx_erro_cliente_registrar(t_adm, '{"codigo":"TypeError","tela":"#/conversas<x>","versao":"34","navegador":"Chrome"}'::jsonb);
  perform pg_temp.ok((select contagem from public.nx_erros_front where hash = public.nx_hash('TypeError|/conversasx|34')) = 2, 'SC-002: dedupe com contagem (tela limpa)');
  j := public.nx_evento_registrar(t_adm, 'ver_plano', '{"de":"inicio"}'::jsonb);
  perform pg_temp.ok((j ->> 'ok')::boolean and exists (select 1 from public.nx_auditoria where conta_id = k_adm and acao = 'evento_comercial' and dados ->> 'tipo' = 'ver_plano'), 'UCC-104: evento');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_evento_registrar(%L, %L)', t_adm, 'Tipo Ruim!')) like 'dados_invalidos|tipo|%', 'UCC-104: tipo inválido');

  -- ---------------------------------------------------------- SC-104 / SC-105 titular · SC-100 / SC-101 exclusão
  insert into public.nx_leads (cliente_id, nome, contato_id, titulo, status) values (cA, 'Busca 34', ct, 'Clareamento Titular', 'aberto');
  j := public.nx_buscar(t_adm, cA, 'Clareamento');
  perform pg_temp.ok(j -> 'negocios' -> 0 ->> 'contato_telefone' = '5512990034001' and (j -> 'negocios' -> 0)::jsonb ? 'consulta_em', 'CC-197/267: telefone e consulta_em no negócio');
  perform pg_temp.ok((public.nx_empresas_listar(t_adm, cA)::jsonb -> 'itens') is not null, 'RC-311: empresas lista');
  -- SC-131 / UC-024 aviso do fim do teste
  update public.nx_clientes set status = 'teste', teste_ate = (now() at time zone 'America/Sao_Paulo')::date + 3 where id = cA;
  n := public.nx_teste_avisar();
  perform pg_temp.ok(exists (select 1 from public.nx_notificacoes where cliente_id = cA and conta_id = k_adm and titulo = 'O teste termina em 3 dias')
                 and public.nx_teste_avisar() = 0, 'SC-131: aviso a 3 dias, uma vez');
  update public.nx_clientes set status = 'ativo', teste_ate = null where id = cA;
  -- UCA-093 descrição da automação
  j := public.nx_automacao_salvar(t_adm, cA, '{"nome":"Auto 34","gatilho":"negocio_criado","acoes":[{"tipo":"nota","texto":"oi"}],"descricao":" Avisa a recepção "}'::jsonb);
  perform pg_temp.ok(j ->> 'descricao' = 'Avisa a recepção'
                 and exists (select 1 from json_array_elements(public.nx_automacoes_listar(t_adm, cA) -> 'itens') x where x ->> 'descricao' = 'Avisa a recepção'), 'UCA-093: salva e lista a descrição');
  -- CC-027 SLA por departamento
  j := public.nx_departamento_salvar(t_adm, cA, '{"nome":"Recepção 34","sla_aten":10,"sla_atraso":20,"sla_critico":45}'::jsonb);
  perform pg_temp.ok((j ->> 'sla_critico')::int = 45, 'CC-027: salva os limites');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_departamento_salvar(%L, %L, %L::jsonb)', t_adm, cA,
           jsonb_build_object('id', j ->> 'id', 'nome', 'Recepção 34', 'sla_atraso', 5))) like 'dados_invalidos|sla|%', 'CC-027: fora de ordem recusa');
  perform pg_temp.ok(exists (select 1 from json_array_elements(public.nx_cv_base(t_at, cA) -> 'departamentos') x where (x ->> 'sla_aten')::int = 10), 'CC-027: nx_cv_base devolve para o atendente');
  -- CC-245 / CC-324 / RC-065
  insert into public.nx_leads (cliente_id, nome, contato_id, titulo, status, previsao_fechamento) values (cA, 'Agenda 34', ct, 'Avaliação 34', 'aberto', current_date + 30) returning id into l1;
  jb := public.nx_agenda_marcar_core(cA, l1, date_trunc('hour', now()) + interval '2 days', null, false, true, 'painel', 'trazer exames', k_adm);
  perform pg_temp.ok((jb ->> 'ok')::boolean, 'agenda: marcou (encaixe)');
  j := public.nx_agenda_dia(t_adm, cA, ((now() + interval '2 days') at time zone 'America/Sao_Paulo')::date, 1);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'consultas') x
                              where (x ->> 'negocio_id')::bigint = l1 and x ->> 'obs' = 'trazer exames' and x ->> 'marcado_por' = k_adm::text), 'CC-245/324: obs e marcado_por');
  v_txt := (select x ->> 'inicio' from json_array_elements(j -> 'consultas') x where (x ->> 'negocio_id')::bigint = l1);
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_confirmar(%L, %L, %L, %L)', t_adm, cA, l1, '2020-01-01T10:00:00-03:00')) like 'dados_invalidos|consulta_mudou|%', 'CC-240: outro horário recusa');
  j := public.nx_agenda_confirmar(t_adm, cA, l1, v_txt);
  perform pg_temp.ok((j ->> 'ok')::boolean and exists (select 1 from json_array_elements(public.nx_agenda_dia(t_adm, cA, ((now() + interval '2 days') at time zone 'America/Sao_Paulo')::date, 1) -> 'consultas') x
                                                        where (x ->> 'negocio_id')::bigint = l1 and x ->> 'confirmada_em' is not null and x ->> 'confirmacao' = 'confirmada'), 'CC-240/239/RC-202: confirmada e devolvida');
  j := public.nx_suporte_entrar(t_sup, cA, 'conferir número');
  perform pg_temp.ok(j ->> 'ok' = 'true', 'UCB-091: gestor/super registra');
  perform pg_temp.ok(exists (select 1 from public.nx_auditoria where cliente_id = cA and acao = 'suporte_motivo' and dados ->> 'motivo' = 'conferir número'), 'UCB-091: motivo auditado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_suporte_entrar(%L, %L, %L)', t_adm, cA, 'x')) like 'sem_permissao|%', 'UCB-091: só gestor/super');
  perform pg_temp.ok(public.nx_crm_cards(cA, array[l1], public.nx_ctx(t_adm, cA, 'leitura')) -> 0 ->> 'previsao_fechamento' = (current_date + 30)::text, 'RC-065: previsão no cartão');
  j := public.nx_titular_localizar(t_adm, cA, '(12) 99003-4001');
  perform pg_temp.ok(json_array_length(j) = 1 and (j -> 0 ->> 'id')::bigint = ct, 'SC-105: acha pelo telefone');
  perform pg_temp.ok(json_array_length(public.nx_titular_localizar(t_adm, cA, 'T34-TIT-' || sfx || '@x.test')) = 1, 'SC-105: acha pelo e-mail');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_titular_localizar(%L, %L, %L)', t_adm, cA, '12')) like 'dados_invalidos|busca|%', 'SC-105: busca curta');
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status) values (cA, cv, ct, kM, 'in', 'texto', 'oi 34', 'recebida');
  insert into public.nx_leads (cliente_id, nome, contato_id, titulo, campos) values (cA, 'Lead 34', ct, 'Implante da Titular', '{"cpf":"123"}'::jsonb) returning id into l1;
  insert into public.nx_rastreio (cliente_id, codigo, telefone, negocio_id) values (cA, 'K7M2P', '5512990034001', l1);
  j := public.nx_titular_exportar(t_adm, cA, ct);
  perform pg_temp.ok(j -> 'contato' ->> 'nome' = 'Titular Trinta' and json_array_length(j -> 'negocios') = 3 and json_array_length(j -> 'mensagens') = 1, 'SC-104: exporta');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_titular_exportar(%L, %L, %L)', t_at, cA, ct)) like 'sem_permissao|%', 'SC-104: só admin');
  j := public.nx_contato_excluir(t_adm, cA, ct, 'excluir');
  perform pg_temp.ok((select l.campos = '{}'::jsonb and l.titulo is null and l.nome = 'Removido' from public.nx_leads l where l.id = l1), 'SC-100: negócio sem dado pessoal');
  perform pg_temp.ok((select r.telefone is null from public.nx_rastreio r where r.cliente_id = cA and r.codigo = 'K7M2P'), 'SC-101: rastreio sem telefone');

  -- ---------------------------------------------------------- SC-054 trava · SC-151 fila
  perform pg_temp.ok(public.nx_trava_pegar('t34-' || sfx, 60, 'a'), 'trava pega');
  perform pg_temp.ok(public.nx_trava_estender('t34-' || sfx, 3600, 'a') and not public.nx_trava_estender('t34-' || sfx, 3600, 'b'), 'SC-054: só o dono estende');
  perform pg_temp.ok((select ate > now() + interval '50 minutes' from public.nx_travas where nome = 't34-' || sfx), 'SC-054: prazo longo gravado');
  perform pg_temp.ok(public.nx_fila_resumo(t_adm, cA) ->> 'atrasadas' = '0', 'SC-151: fila');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_fila_resumo(%L, %L)', t_at, cA)) like 'sem_permissao|%', 'SC-151: atendente não');

  -- ---------------------------------------------------------- SC-051 / SC-052 / SC-053 e permissões
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_sessoes_listar(text)', 'execute')
                 and has_function_privilege('anon', 'public.nx_titular_exportar(text,uuid,bigint)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_sessao_criar(uuid)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_trava_estender(text,integer,text)', 'execute')
                 and has_function_privilege('service_role', 'public.nx_trava_estender(text,integer,text)', 'execute'), 'permissões das novas');
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname like 'nx\_%' and has_function_privilege('authenticated', p.oid, 'execute');
  perform pg_temp.ok(n = 0, format('SC-051: %s funções nx_ executáveis por authenticated', n));
  select string_agg(p.proname, ', ') into v_txt from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname like 'nx\_%' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%');
  perform pg_temp.ok(v_txt is null, 'SC-052: security definer sem search_path: ' || coalesce(v_txt, ''));
  select string_agg(c.relname, ', ') into v_txt from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and c.relname like 'nx\_%' and not c.relrowsecurity;
  perform pg_temp.ok(v_txt is null, 'SC-053: tabela sem RLS: ' || coalesce(v_txt, ''));

  raise exception 'OK_34_PLANO1500C — senha, sessões, suspensões, convites, IA, LGPD, relatório, saúde, faxina, trava e fila';
end $t$;
rollback;
