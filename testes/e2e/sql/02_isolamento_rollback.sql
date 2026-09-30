-- ============================================================
-- ÓRBITA — testes/e2e/sql/02_isolamento_rollback.sql · E2E-3009 · caso 9 (parte que escreve)
-- Sessão TEMPORÁRIA (dentro da transação) da MESMA conta "Conta E2E Órbita" (admin do teste-e2e) tenta LER e ALTERAR,
-- pelas RPCs do painel, (a) objetos REAIS do cliente kamiguchi (funil, etapa, etiqueta, departamento, resposta, motivo)
-- e (b) objetos de um cliente B de OUTRA organização (fixture criada aqui: negócio, contato, conversa, canal, tarefa, nota,
-- automação…). Tudo termina em exceção → ROLLBACK (nada fica). Se alguma tentativa PASSAR, o hash das linhas do kamiguchi
-- e do cliente B muda e o teste acusa FURO.
-- Saída: a exceção final 'E2E3009_ISOLAMENTO_OK {...}' (tudo negado) ou 'E2E3009_ISOLAMENTO_FURO {...}'.
-- Não lê nx_config nem Vault. Só toca linhas do kamiguchi dentro da transação revertida.
-- ============================================================
begin;

create or replace function pg_temp.sonda(p_sql text) returns text language plpgsql as $f$
declare m text; h text; o text;
begin
  execute 'select (' || p_sql || ')::text' into o;
  return 'OK:' || left(coalesce(o, 'null'), 100);
exception when others then
  get stacked diagnostics m = message_text, h = pg_exception_hint;
  return 'ERR:' || m || coalesce('|' || nullif(h, ''), '');
end $f$;

-- hash de TODAS as linhas de um cliente (tabelas nx_* com cliente_id, exceto nx_integracoes) + a linha do próprio cliente
create or replace function pg_temp.hash_cliente(p_cliente uuid) returns text language plpgsql as $f$
declare r record; parte text; material text := '';
begin
  for r in select distinct c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            join pg_catalog.pg_attribute a on a.attrelid = c.oid
           where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname like 'nx\_%' escape '\'
             and a.attname = 'cliente_id' and a.attnum > 0 and not a.attisdropped and c.relname <> 'nx_integracoes'
           order by c.relname
  loop
    execute format('select coalesce(string_agg(md5(row_to_json(x)::text), %L order by row_to_json(x)::text), %L) from public.%I x where x.cliente_id = $1', ',', '', r.relname)
      into parte using p_cliente;
    material := material || r.relname || ':' || coalesce(parte, '') || E'\n';
  end loop;
  select md5(row_to_json(x)::text) into parte from public.nx_clientes x where x.id = p_cliente;
  return md5(material || coalesce(parte, ''));
end $f$;

do $t$
declare
  cA uuid; kam uuid; contaA uuid; sfx text := substr(md5(random()::text), 1, 8);
  tok text := 'e2e3009-tmp-' || substr(md5(random()::text), 1, 16);
  tokB text := 'e2e3009-tmpb-' || substr(md5(random()::text), 1, 16);
  orgB uuid; cB uuid; contaB uuid; negB bigint; ctB bigint; cvB bigint; caB uuid; tkB bigint; ntB bigint; auB uuid; msB bigint;
  fnB uuid; esB uuid; etB uuid; dpB uuid; rsB uuid; mtB uuid;
  fnK uuid; esK uuid; etK uuid; dpK uuid; rsK uuid; mtK uuid; esA uuid; negA bigint; j jsonb;
  hK0 text; hK1 text; hB0 text; hB1 text; negA_f0 uuid; negA_e0 uuid; negA_f1 uuid; negA_e1 uuid;
  sondas jsonb := '[]'::jsonb; r text; n_total int := 0; n_neg int := 0; furos jsonb := '[]'::jsonb; p record;
  v_ok boolean;
begin
  select id into cA from public.nx_clientes where slug = 'teste-e2e';
  select id into kam from public.nx_clientes where slug = 'kamiguchi';
  select c.id into contaA from public.nx_contas c join public.nx_acessos a on a.conta_id = c.id and a.cliente_id = cA and a.papel = 'admin' limit 1;
  if cA is null or kam is null or contaA is null then raise exception 'FALHOU: pré-condição (teste-e2e/kamiguchi/conta admin)'; end if;
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(tok), contaA, now() + interval '10 minutes');

  -- objetos REAIS do kamiguchi (só ids; nada é lido além disso)
  select id into fnK from public.nx_funis where cliente_id = kam order by ordem limit 1;
  select id into esK from public.nx_estagios where cliente_id = kam order by ordem limit 1;
  select id into etK from public.nx_etiquetas where cliente_id = kam limit 1;
  select id into dpK from public.nx_departamentos where cliente_id = kam limit 1;
  select id into rsK from public.nx_respostas where cliente_id = kam limit 1;
  select id into mtK from public.nx_motivos_perda where cliente_id = kam limit 1;
  -- um negócio e uma etapa do teste-e2e (alvos "próprios" das tentativas de mover para fora)
  select id into esA from public.nx_estagios where cliente_id = cA and marco = 'nova' limit 1;
  select id into negA from public.nx_leads where cliente_id = cA order by id limit 1;

  -- cliente B, de OUTRA organização (revenda), com conta admin própria e objetos de cada entidade
  insert into public.nx_orgs (slug, nome, tipo) values ('e2e3009-' || sfx, 'E2E-3009 Org B', 'revenda') returning id into orgB;
  insert into public.nx_clientes (slug, nome, org_id, plano, modulos, vertical, status)
  values ('e2e3009-' || sfx, 'E2E-3009 Cliente B', orgB, 'profissional', array['crm', 'conversas', 'relatorios', 'ads', 'automacoes'], 'odonto', 'ativo') returning id into cB;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('e2e3009-b-' || sfx || '@exemplo.invalid', 'E2E-3009 Admin B', 'x', 'clinica', true, orgB) returning id into contaB;
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas, departamentos, recebe_conversas) values (contaB, cB, 'admin', true, '{}', false);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(tokB), contaB, now() + interval '10 minutes');
  j := public.nx_negocio_salvar(tokB, cB, jsonb_build_object('contato', jsonb_build_object('nome', 'E2E-3009 B', 'telefone', '5599000007701'), 'titulo', 'E2E-3009 B negócio'))::jsonb;
  negB := (j ->> 'id')::bigint; ctB := (j -> 'contato' ->> 'id')::bigint;
  tkB := (public.nx_tarefa_salvar(tokB, cB, jsonb_build_object('titulo', 'E2E-3009 B tarefa', 'negocio_id', negB))::jsonb ->> 'id')::bigint;
  ntB := (public.nx_nota_salvar(tokB, cB, jsonb_build_object('negocio_id', negB, 'texto', 'E2E-3009 B nota'))::jsonb ->> 'id')::bigint;
  insert into public.nx_canais (cliente_id, tipo, provedor, nome, numero_exibicao, status, codewords_numero, codewords_rota, ia_ligada, ia_volta_horas)
  values (cB, 'whatsapp_cloud', 'codewords', 'E2E-3009 canal B', '+5599000007799', 'pendente', '+5599000007799', 'fluxo', true, 6) returning id into caB;
  j := public.nx_wa_entrada(caB, jsonb_build_object('wamid', 'cw:' || caB || ':e2e3009-' || sfx, 'wa_id', '5599000007701', 'nome', 'E2E-3009 B', 'tipo', 'texto', 'corpo', 'oi do B'))::jsonb;
  cvB := (j ->> 'conversa_id')::bigint; msB := (j ->> 'mensagem_id')::bigint;
  auB := (public.nx_automacao_salvar(tokB, cB, jsonb_build_object('nome', 'E2E-3009 B auto', 'gatilho', 'tarefa_vencida', 'acoes', jsonb_build_array(jsonb_build_object('tipo', 'notificar', 'para', 'admins', 'titulo', 'x'))))::jsonb ->> 'id')::uuid;
  select id into fnB from public.nx_funis where cliente_id = cB order by ordem limit 1;
  select id into esB from public.nx_estagios where cliente_id = cB order by ordem limit 1;
  select id into etB from public.nx_etiquetas where cliente_id = cB limit 1;
  select id into dpB from public.nx_departamentos where cliente_id = cB limit 1;
  select id into rsB from public.nx_respostas where cliente_id = cB limit 1;
  select id into mtB from public.nx_motivos_perda where cliente_id = cB limit 1;
  if negB is null or cvB is null or fnB is null or rsB is null or mtB is null or fnK is null or rsK is null then
    raise exception 'FALHOU: fixtures incompletas (negB=% cvB=% fnB=% rsB=% mtB=% fnK=% rsK=%)', negB, cvB, fnB, rsB, mtB, fnK, rsK;
  end if;

  hK0 := pg_temp.hash_cliente(kam); hB0 := pg_temp.hash_cliente(cB);
  select funil_id, estagio_id into negA_f0, negA_e0 from public.nx_leads where id = negA;

  -- ------------------------------------------------------------------------------------------ as sondas
  for p in select * from (values
    -- (1) portão: p_cliente = kamiguchi (real) e = cliente B (outra org), payloads VÁLIDOS (estamos em rollback)
    ('gate kam: nx_crm_base', format('public.nx_crm_base(%L,%L)', tok, kam)),
    ('gate kam: nx_negocio_salvar', format('public.nx_negocio_salvar(%L,%L,%L)', tok, kam, '{"contato":{"nome":"E2E-3009 x","telefone":"5511955500001"},"titulo":"x"}')),
    ('gate kam: nx_contato_salvar', format('public.nx_contato_salvar(%L,%L,%L)', tok, kam, '{"nome":"E2E-3009 x","telefone":"5511955500002"}')),
    ('gate kam: nx_tarefa_salvar', format('public.nx_tarefa_salvar(%L,%L,%L)', tok, kam, '{"titulo":"E2E-3009 x"}')),
    ('gate kam: nx_nota_salvar', format('public.nx_nota_salvar(%L,%L,%L)', tok, kam, '{"texto":"E2E-3009 x"}')),
    ('gate kam: nx_funil_salvar', format('public.nx_funil_salvar(%L,%L,%L)', tok, kam, '{"nome":"E2E-3009 x"}')),
    ('gate kam: nx_etiqueta_salvar', format('public.nx_etiqueta_salvar(%L,%L,%L)', tok, kam, '{"nome":"E2E-3009 x"}')),
    ('gate kam: nx_resposta_salvar', format('public.nx_resposta_salvar(%L,%L,%L)', tok, kam, '{"atalho":"e2e3009","titulo":"x","corpo":"x"}')),
    ('gate kam: nx_departamento_salvar', format('public.nx_departamento_salvar(%L,%L,%L)', tok, kam, '{"nome":"E2E-3009 x"}')),
    ('gate kam: nx_motivo_salvar', format('public.nx_motivo_salvar(%L,%L,%L)', tok, kam, '{"nome":"E2E-3009 x"}')),
    ('gate kam: nx_automacao_salvar', format('public.nx_automacao_salvar(%L,%L,%L)', tok, kam, '{"nome":"E2E-3009 x","gatilho":"tarefa_vencida","acoes":[{"tipo":"notificar","para":"admins","titulo":"x"}]}')),
    ('gate kam: nx_agenda_config_salvar', format('public.nx_agenda_config_salvar(%L,%L,%L)', tok, kam, '{"capacidade":9}')),
    ('gate kam: nx_agenda_bloqueio_salvar', format('public.nx_agenda_bloqueio_salvar(%L,%L,%L)', tok, kam, '{"data":"2026-12-24","motivo":"x"}')),
    ('gate kam: nx_ia_config_salvar', format('public.nx_ia_config_salvar(%L,%L,%L)', tok, kam, '{"memoria_aprovada":"E2E-3009 hack"}')),
    ('gate kam: nx_cv_config_salvar', format('public.nx_cv_config_salvar(%L,%L,%L)', tok, kam, '{"assinatura":true}')),
    ('gate kam: nx_codewords_canal_salvar', format('public.nx_codewords_canal_salvar(%L,%L,%L)', tok, kam, '{"nome":"E2E-3009 x","numero":"+5512993009990","codewords_api_key":"cwk-teste-e2e3009-invalida-000000"}')),
    ('gate kam: nx_entrada_chave(gerar)', format('public.nx_entrada_chave(%L,%L,true)', tok, kam)),
    ('gate kam: nx_usuario_salvar', format('public.nx_usuario_salvar(%L,%L,%L)', tok, kam, format('{"nome":"x","email":"e2e3009-%s@exemplo.invalid","papel":"admin"}', sfx))),
    ('gate kam: nx_convite_criar', format('public.nx_convite_criar(%L,%L,%L,null)', tok, kam, '{"papel":"admin","nome":"x"}')),
    ('gate kam: nx_contatos_importar', format('public.nx_contatos_importar(%L,%L,%L,%L)', tok, kam, '[{"nome":"E2E-3009 i","telefone":"5511955500003"}]', '{}')),
    ('gate kam: nx_agenda_marcar', format('public.nx_agenda_marcar(%L,%L,%s,%L)', tok, kam, negA, '2026-10-05T10:00:00')),
    ('gate kam: nx_dados', format('public.nx_dados(%L,%L,30)', tok, kam)),
    ('gate kam: nx_cv_listar', format('public.nx_cv_listar(%L,%L,%L,20,null)', tok, kam, '{}')),
    ('gate kam: nx_canais_listar', format('public.nx_canais_listar(%L,%L)', tok, kam)),
    ('gate kam: nx_agenda_dia', format('public.nx_agenda_dia(%L,%L,null,7)', tok, kam)),
    ('gate kam: nx_integracao_salvar', format('public.nx_integracao_salvar(%L,%L,%L,%L,false)', tok, kam, 'meta', '{}')),
    ('gate kam: nx_tema_salvar', format('public.nx_tema_salvar(%L,%L,%L)', tok, kam, '{}')),
    ('gate kam: nx_uso_plano', format('public.nx_uso_plano(%L,%L)', tok, kam)),
    ('gate B: nx_crm_base', format('public.nx_crm_base(%L,%L)', tok, cB)),
    ('gate B: nx_negocios_kanban', format('public.nx_negocios_kanban(%L,%L,%L)', tok, cB, fnB)),
    ('gate B: nx_contatos_listar', format('public.nx_contatos_listar(%L,%L,%L,1,20,null)', tok, cB, '{}')),
    ('gate B: nx_cv_listar', format('public.nx_cv_listar(%L,%L,%L,20,null)', tok, cB, '{}')),
    ('gate B: nx_cv_base', format('public.nx_cv_base(%L,%L)', tok, cB)),
    ('gate B: nx_canais_listar', format('public.nx_canais_listar(%L,%L)', tok, cB)),
    ('gate B: nx_agenda_dia', format('public.nx_agenda_dia(%L,%L,null,7)', tok, cB)),
    ('gate B: nx_dados', format('public.nx_dados(%L,%L,30)', tok, cB)),
    ('gate B: nx_entrada_chave(gerar)', format('public.nx_entrada_chave(%L,%L,true)', tok, cB)),
    ('gate B: nx_codewords_canal_salvar', format('public.nx_codewords_canal_salvar(%L,%L,%L)', tok, cB, format('{"id":"%s","nome":"hack"}', caB))),
    ('gate B: nx_negocio_salvar', format('public.nx_negocio_salvar(%L,%L,%L)', tok, cB, '{"contato":{"nome":"E2E-3009 x","telefone":"5511955500004"},"titulo":"x"}')),
    ('gate B: nx_ia_config_salvar', format('public.nx_ia_config_salvar(%L,%L,%L)', tok, cB, '{"memoria_aprovada":"hack"}')),
    ('gate B: nx_automacoes_listar', format('public.nx_automacoes_listar(%L,%L)', tok, cB)),
    ('gate B: nx_uso_plano', format('public.nx_uso_plano(%L,%L)', tok, cB)),
    ('gate B (token de B em A): nx_crm_base', format('public.nx_crm_base(%L,%L)', tokB, cA)),
    ('gate B (token de B em kam): nx_crm_base', format('public.nx_crm_base(%L,%L)', tokB, kam)),
    ('gate B (token de B em kam): nx_dados', format('public.nx_dados(%L,%L,30)', tokB, kam)),
    -- (2) ids do cliente B (outra org) usados com p_cliente = teste-e2e (porta dos fundos)
    ('id B: nx_negocio_ver', format('public.nx_negocio_ver(%L,%L,%s)', tok, cA, negB)),
    ('id B: nx_negocio_mover', format('public.nx_negocio_mover(%L,%L,%s,%L)', tok, cA, negB, esA)),
    ('id B: nx_negocio_salvar(edita)', format('public.nx_negocio_salvar(%L,%L,%L)', tok, cA, format('{"id":%s,"titulo":"hack"}', negB))),
    ('id B: nx_negocio_excluir', format('public.nx_negocio_excluir(%L,%L,%s)', tok, cA, negB)),
    ('id B: nx_contato_ver', format('public.nx_contato_ver(%L,%L,%s)', tok, cA, ctB)),
    ('id B: nx_contato_salvar(edita)', format('public.nx_contato_salvar(%L,%L,%L)', tok, cA, format('{"id":%s,"nome":"hack"}', ctB))),
    ('id B: nx_contato_excluir', format('public.nx_contato_excluir(%L,%L,%s,%L)', tok, cA, ctB, 'excluir')),
    ('id B: nx_cv_ver', format('public.nx_cv_ver(%L,%L,%s)', tok, cA, cvB)),
    ('id B: nx_cv_mensagens', format('public.nx_cv_mensagens(%L,%L,%s,null,null,null,20)', tok, cA, cvB)),
    ('id B: nx_cv_status', format('public.nx_cv_status(%L,%L,%s,%L)', tok, cA, cvB, 'resolvida')),
    ('id B: nx_cv_atribuir', format('public.nx_cv_atribuir(%L,%L,%s,%L,null)', tok, cA, cvB, contaA)),
    ('id B: nx_cv_nota', format('public.nx_cv_nota(%L,%L,%s,%L)', tok, cA, cvB, 'hack')),
    ('id B: nx_cv_marcar_lida', format('public.nx_cv_marcar_lida(%L,%L,%s)', tok, cA, cvB)),
    ('id B: nx_cv_ocultar', format('public.nx_cv_ocultar(%L,%L,%s,true)', tok, cA, cvB)),
    ('id B: nx_cv_ia_pausar', format('public.nx_cv_ia_pausar(%L,%L,%s,1)', tok, cA, cvB)),
    ('id B: nx_cv_ia_devolver', format('public.nx_cv_ia_devolver(%L,%L,%s)', tok, cA, cvB)),
    ('id B: nx_cv_ia_estado', format('public.nx_cv_ia_estado(%L,%L,%s)', tok, cA, cvB)),
    ('id B: nx_cv_vincular_negocio', format('public.nx_cv_vincular_negocio(%L,%L,%s,%s)', tok, cA, cvB, negB)),
    ('id B: nx_cv_etiquetas', format('public.nx_cv_etiquetas(%L,%L,%s,array[%L]::uuid[])', tok, cA, cvB, etB)),
    ('id B: nx_tarefa_concluir', format('public.nx_tarefa_concluir(%L,%L,%s,true)', tok, cA, tkB)),
    ('id B: nx_tarefa_salvar(edita)', format('public.nx_tarefa_salvar(%L,%L,%L)', tok, cA, format('{"id":%s,"titulo":"hack"}', tkB))),
    ('id B: nx_tarefa_excluir', format('public.nx_tarefa_excluir(%L,%L,%s)', tok, cA, tkB)),
    ('id B: nx_nota_salvar(edita)', format('public.nx_nota_salvar(%L,%L,%L)', tok, cA, format('{"id":%s,"texto":"hack"}', ntB))),
    ('id B: nx_nota_excluir', format('public.nx_nota_excluir(%L,%L,%s)', tok, cA, ntB)),
    ('id B: nx_agenda_marcar', format('public.nx_agenda_marcar(%L,%L,%s,%L)', tok, cA, negB, '2026-10-05T10:00:00')),
    ('id B: nx_agenda_desmarcar', format('public.nx_agenda_desmarcar(%L,%L,%s,null)', tok, cA, negB)),
    ('id B: nx_funil_salvar(edita)', format('public.nx_funil_salvar(%L,%L,%L)', tok, cA, format('{"id":"%s","nome":"hack"}', fnB))),
    ('id B: nx_funil_excluir', format('public.nx_funil_excluir(%L,%L,%L,null)', tok, cA, fnB)),
    ('id B: nx_etiqueta_salvar(edita)', format('public.nx_etiqueta_salvar(%L,%L,%L)', tok, cA, format('{"id":"%s","nome":"hack"}', etB))),
    ('id B: nx_etiqueta_excluir', format('public.nx_etiqueta_excluir(%L,%L,%L)', tok, cA, etB)),
    ('id B: nx_resposta_salvar(edita)', format('public.nx_resposta_salvar(%L,%L,%L)', tok, cA, format('{"id":"%s","titulo":"hack"}', rsB))),
    ('id B: nx_resposta_excluir', format('public.nx_resposta_excluir(%L,%L,%L)', tok, cA, rsB)),
    ('id B: nx_resposta_usada', format('public.nx_resposta_usada(%L,%L,%L)', tok, cA, rsB)),
    ('id B: nx_departamento_salvar(edita)', format('public.nx_departamento_salvar(%L,%L,%L)', tok, cA, format('{"id":"%s","nome":"hack"}', dpB))),
    ('id B: nx_departamento_excluir', format('public.nx_departamento_excluir(%L,%L,%L)', tok, cA, dpB)),
    ('id B: nx_motivo_salvar(edita)', format('public.nx_motivo_salvar(%L,%L,%L)', tok, cA, format('{"id":"%s","nome":"hack"}', mtB))),
    ('id B: nx_motivo_excluir', format('public.nx_motivo_excluir(%L,%L,%L)', tok, cA, mtB)),
    ('id B: nx_canal_excluir', format('public.nx_canal_excluir(%L,%L,%L,%L)', tok, cA, caB, 'excluir')),
    ('id B: nx_codewords_canal_salvar(edita)', format('public.nx_codewords_canal_salvar(%L,%L,%L)', tok, cA, format('{"id":"%s","nome":"hack","rota":"direta"}', caB))),
    ('id B: nx_automacao_ativar', format('public.nx_automacao_ativar(%L,%L,%L,true)', tok, cA, auB)),
    ('id B: nx_automacao_excluir', format('public.nx_automacao_excluir(%L,%L,%L)', tok, cA, auB)),
    ('id B: nx_automacao_execucoes', format('public.nx_automacao_execucoes(%L,%L,%L,10)', tok, cA, auB)),
    ('id B: nx_usuario_remover(conta B)', format('public.nx_usuario_remover(%L,%L,%L)', tok, cA, contaB)),
    ('id B: nx_negocios_kanban(funil B)', format('public.nx_negocios_kanban(%L,%L,%L)', tok, cA, fnB)),
    ('id B: nx_negocios_coluna(etapa B)', format('public.nx_negocios_coluna(%L,%L,%L,%L,0)', tok, cA, esB, '{}')),
    -- (3) ids REAIS do kamiguchi usados com p_cliente = teste-e2e
    ('id kam: nx_funil_salvar(edita)', format('public.nx_funil_salvar(%L,%L,%L)', tok, cA, format('{"id":"%s","nome":"hack"}', fnK))),
    ('id kam: nx_funil_excluir', format('public.nx_funil_excluir(%L,%L,%L,null)', tok, cA, fnK)),
    ('id kam: nx_etiqueta_salvar(edita)', format('public.nx_etiqueta_salvar(%L,%L,%L)', tok, cA, format('{"id":"%s","nome":"hack"}', etK))),
    ('id kam: nx_etiqueta_excluir', format('public.nx_etiqueta_excluir(%L,%L,%L)', tok, cA, etK)),
    ('id kam: nx_resposta_salvar(edita)', format('public.nx_resposta_salvar(%L,%L,%L)', tok, cA, format('{"id":"%s","titulo":"hack"}', rsK))),
    ('id kam: nx_resposta_excluir', format('public.nx_resposta_excluir(%L,%L,%L)', tok, cA, rsK)),
    ('id kam: nx_departamento_salvar(edita)', format('public.nx_departamento_salvar(%L,%L,%L)', tok, cA, format('{"id":"%s","nome":"hack"}', dpK))),
    ('id kam: nx_departamento_excluir', format('public.nx_departamento_excluir(%L,%L,%L)', tok, cA, dpK)),
    ('id kam: nx_motivo_salvar(edita)', format('public.nx_motivo_salvar(%L,%L,%L)', tok, cA, format('{"id":"%s","nome":"hack"}', mtK))),
    ('id kam: nx_motivo_excluir', format('public.nx_motivo_excluir(%L,%L,%L)', tok, cA, mtK)),
    ('id kam: nx_negocios_kanban(funil kam)', format('public.nx_negocios_kanban(%L,%L,%L)', tok, cA, fnK)),
    ('id kam: nx_negocios_coluna(etapa kam)', format('public.nx_negocios_coluna(%L,%L,%L,%L,0)', tok, cA, esK, '{}')),
    ('id kam: nx_negocio_mover(meu negócio → etapa kam)', format('public.nx_negocio_mover(%L,%L,%s,%L)', tok, cA, negA, esK)),
    ('id kam: nx_negocio_salvar(funil kam)', format('public.nx_negocio_salvar(%L,%L,%L)', tok, cA, format('{"id":%s,"funil_id":"%s","estagio_id":"%s"}', negA, fnK, esK))),
    ('id kam: nx_automacao_salvar(etapa kam)', format('public.nx_automacao_salvar(%L,%L,%L)', tok, cA, format('{"nome":"E2E-3009 x","gatilho":"negocio_estagio","config":{"estagio_id":"%s"},"acoes":[{"tipo":"notificar","para":"admins","titulo":"x"}]}', esK))),
    ('id kam: nx_negocio_salvar(etiqueta kam)', format('public.nx_negocio_salvar(%L,%L,%L)', tok, cA, format('{"id":%s,"etiquetas":["%s"]}', negA, etK)))
  ) as s(d, q)
  loop
    r := pg_temp.sonda(p.q);
    n_total := n_total + 1;
    -- negada = exceção com código de acesso/inexistência/validação; "etiqueta descartada" é OK só se o valor do kam não entrou
    v_ok := r like 'ERR:%' and r ~ '(sem_acesso|sem_permissao|_nao_encontrad|dados_invalidos|estagio_invalido|funil_invalido|so_gestor|so_plataforma|funcao_invalida|limite_plano|automacao_invalida)';
    -- {ok:false} sem dados também é negação (nenhum efeito)
    if not v_ok and r like 'OK:{"ok" : false%' then v_ok := true; end if;
    if not v_ok and p.d = 'id kam: nx_negocio_salvar(funil kam)' and r like 'OK:%' then v_ok := true; end if;   -- aceito só se o negócio continuar no funil/etapa de origem (conferido depois das sondas)
    if not v_ok and p.d = 'id kam: nx_negocio_salvar(etiqueta kam)' and r like 'OK:%' and r not like '%' || etK::text || '%' then v_ok := true; end if;
    if v_ok then n_neg := n_neg + 1; else furos := furos || jsonb_build_array(jsonb_build_object('sonda', p.d, 'resultado', left(r, 160))); end if;
    sondas := sondas || jsonb_build_array(jsonb_build_object('s', p.d, 'r', left(r, 90)));
  end loop;

  hK1 := pg_temp.hash_cliente(kam); hB1 := pg_temp.hash_cliente(cB);
  select funil_id, estagio_id into negA_f1, negA_e1 from public.nx_leads where id = negA;
  if negA_f1 is distinct from negA_f0 or negA_e1 is distinct from negA_e0 then furos := furos || jsonb_build_array(jsonb_build_object('sonda', 'meu negócio mudou de funil/etapa por causa de ids do kamiguchi', 'resultado', negA_f0 || '/' || negA_e0 || ' → ' || negA_f1 || '/' || negA_e1)); end if;
  if hK1 is distinct from hK0 then furos := furos || jsonb_build_array(jsonb_build_object('sonda', 'HASH kamiguchi mudou durante as sondas', 'resultado', hK0 || ' → ' || hK1)); end if;
  if hB1 is distinct from hB0 then furos := furos || jsonb_build_array(jsonb_build_object('sonda', 'HASH cliente B (outra org) mudou durante as sondas', 'resultado', hB0 || ' → ' || hB1)); end if;

  raise exception '%', case when jsonb_array_length(furos) = 0
    then 'E2E3009_ISOLAMENTO_OK ' || jsonb_build_object('sondas', n_total, 'negadas', n_neg, 'hash_kam_igual', hK1 = hK0, 'hash_B_igual', hB1 = hB0, 'hash_kam', hK1, 'orgs_distintas', (select count(*) from public.nx_orgs))::text
    else 'E2E3009_ISOLAMENTO_FURO ' || jsonb_build_object('sondas', n_total, 'negadas', n_neg, 'furos', furos)::text end;
end $t$;

rollback;
