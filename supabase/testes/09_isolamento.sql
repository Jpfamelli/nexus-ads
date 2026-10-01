-- ============================================================
-- ÓRBITA — supabase/testes/09_isolamento.sql · F8
-- Smoke transacional multi-org/multi-cliente e varredura das RPCs
-- concedidas ao painel. Executar somente no Supabase nexus-ads.
-- Cria fixtures fictícias e termina em ROLLBACK; nenhuma credencial real.
-- Falha = exceção 'FALHOU: <caso>'.
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

-- Hash determinístico de todas as linhas do tenant B (tabelas nx_* com cliente_id),
-- além da org, contas e sessões da revenda. Uma RPC que altere qualquer linha é detectada.
create or replace function pg_temp.hash_tenant_b(p_cliente uuid, p_org uuid) returns text
language plpgsql as $f$
declare r record; parte text; material text := '';
begin
  for r in
    select distinct c.relname
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = c.oid
     where n.nspname = 'public' and c.relkind in ('r','p')
       and c.relname like 'nx\_%' escape '\'
       and a.attname = 'cliente_id' and a.attnum > 0 and not a.attisdropped
     order by c.relname
  loop
    execute format(
      'select coalesce(string_agg(md5(row_to_json(x)::text), '','' order by row_to_json(x)::text), '''') from public.%I x where x.cliente_id = $1',
      r.relname
    ) into parte using p_cliente;
    material := material || r.relname || ':' || coalesce(parte, '') || E'\n';
  end loop;

  select coalesce(string_agg(md5(row_to_json(x)::text), ',' order by x.id::text), '')
    into parte from public.nx_orgs x where x.id = p_org;
  material := material || 'nx_orgs:' || coalesce(parte, '') || E'\n';

  select coalesce(string_agg(md5(row_to_json(x)::text), ',' order by x.id::text), '')
    into parte from public.nx_contas x where x.org_id = p_org;
  material := material || 'nx_contas:' || coalesce(parte, '') || E'\n';

  select coalesce(string_agg(md5(row_to_json(x)::text), ',' order by x.token_hash), '')
    into parte from public.nx_sessoes x join public.nx_contas c on c.id = x.conta_id
   where c.org_id = p_org;
  material := material || 'nx_sessoes:' || coalesce(parte, '') || E'\n';
  return md5(material);
end $f$;

do $teste$
declare
  sufixo text := substr(md5(txid_current()::text), 1, 10);
  privado text;
  marcador text;
  token_a text;
  token_b text;
  token_atend_a text;
  token_atend_b text;
  token_gestor_b text;
  token_super text;
  org_a uuid;
  org_b uuid;
  cli_a uuid;
  cli_b uuid;
  conta_a uuid;
  conta_b uuid;
  atend_a uuid;
  atend_b uuid;
  gestor_b uuid;
  conta_super uuid;
  empresa_b bigint;
  contato_b bigint;
  negocio_b bigint;
  funil_b uuid;
  estagio_b uuid;
  etiqueta_b uuid;
  tarefa_b bigint;
  nota_b bigint;
  departamento_b uuid;
  canal_b uuid;
  conversa_b bigint;
  mensagem_b bigint;
  resposta_b uuid;
  automacao_b uuid;
  campo_b uuid;
  motivo_b uuid;
  template_b uuid;
  convite_b uuid;
  visao_b uuid;
  importacao_b bigint;
  notificacao_b bigint;
  r record;
  a record;
  v_nome text;
  v_tipo text;
  v_elemento text;
  v_chave text;
  v_id jsonb;
  v_ids jsonb;
  v_payload jsonb;
  v_cliente uuid;
  v_args text;
  v_expr text;
  v_sql text;
  v_result jsonb;
  v_erro text;
  v_hint text;
  v_sqlstate text;
  v_pass int;
  v_rpc_count int := 0;
  v_sonda_id boolean;
  v_hash_antes text;
  v_hash_depois text;
  v_tabela text;
  v_rls boolean;
  v_j jsonb;
begin
  privado := 'F8_B_PRIVATE_' || sufixo;
  marcador := 'F8_PROBE_' || sufixo;
  token_a := 'tok-f8-a-' || sufixo;
  token_b := 'tok-f8-b-' || sufixo;
  token_atend_a := 'tok-f8-at-a-' || sufixo;
  token_atend_b := 'tok-f8-at-b-' || sufixo;
  token_gestor_b := 'tok-f8-org-b-' || sufixo;
  token_super := 'tok-f8-super-' || sufixo;

  -- A é a Nexus/plataforma; B é uma revenda isolada com seu próprio cliente.
  select id into org_a from public.nx_orgs where tipo = 'plataforma' limit 1;
  perform pg_temp.ok(org_a is not null, 'org da plataforma existe');
  insert into public.nx_planos (id, nome, limites, modulos, ordem)
  values ('f8_teste', 'F8 teste', '{}'::jsonb, '{crm,conversas,relatorios,ads,automacoes,marca}', 999)
  on conflict (id) do nothing;
  insert into public.nx_orgs (slug, nome, tipo, limites)
  values ('f8-revenda-' || sufixo, privado || ' revenda', 'revenda', '{"plano_padrao":"f8_teste"}'::jsonb)
  returning id into org_b;

  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status)
  values ('f8-a-' || sufixo, 'F8 Nexus teste A', org_a, 'interno', 'odonto', 'ativo') returning id into cli_a;
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status)
  values ('f8-b-' || sufixo, privado || ' cliente', org_b, 'f8_teste', 'oficina', 'ativo') returning id into cli_b;

  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id)
  values ('f8-a-' || sufixo || '@teste.local', 'Admin A', 'hash-falso-f8', 'clinica', true, org_a) returning id into conta_a;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id)
  values ('f8-b-' || sufixo || '@teste.local', 'Admin B', 'hash-falso-f8', 'clinica', true, org_b) returning id into conta_b;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id)
  values ('f8-at-a-' || sufixo || '@teste.local', 'Atendente A', 'hash-falso-f8', 'clinica', true, org_a) returning id into atend_a;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id)
  values ('f8-at-b-' || sufixo || '@teste.local', 'Atendente B', 'hash-falso-f8', 'clinica', true, org_b) returning id into atend_b;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id)
  values ('f8-org-b-' || sufixo || '@teste.local', 'Gestor revenda B', 'hash-falso-f8', 'gestor', true, org_b) returning id into gestor_b;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id)
  values ('f8-super-' || sufixo || '@teste.local', 'Super plataforma', 'hash-falso-f8', 'gestor', true, org_a) returning id into conta_super;

  insert into public.nx_acessos (conta_id, cliente_id, papel)
  values (conta_a, cli_a, 'admin'), (atend_a, cli_a, 'atendente'),
         (conta_b, cli_b, 'admin'), (atend_b, cli_b, 'atendente');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em)
  values (public.nx_hash(token_a), conta_a, now() + interval '1 hour'),
         (public.nx_hash(token_b), conta_b, now() + interval '1 hour'),
         (public.nx_hash(token_atend_a), atend_a, now() + interval '1 hour'),
         (public.nx_hash(token_atend_b), atend_b, now() + interval '1 hour'),
         (public.nx_hash(token_gestor_b), gestor_b, now() + interval '1 hour'),
         (public.nx_hash(token_super), conta_super, now() + interval '1 hour');

  -- IDs de B válidos em cada entidade coberta pelo contrato; todas as linhas ficam no rollback.
  select id into funil_b from public.nx_funis where cliente_id = cli_b and padrao limit 1;
  if funil_b is null then
    insert into public.nx_funis (cliente_id, nome, padrao, conta_no_ads, ativo)
    values (cli_b, privado || ' funil', true, true, true) returning id into funil_b;
  end if;
  select id into estagio_b from public.nx_estagios where cliente_id = cli_b and funil_id = funil_b and marco = 'nova' limit 1;
  if estagio_b is null then
    insert into public.nx_estagios (cliente_id, funil_id, nome, ordem, tipo, marco)
    values (cli_b, funil_b, 'Nova F8', 1, 'aberto', 'nova') returning id into estagio_b;
  end if;
  select id into departamento_b from public.nx_departamentos where cliente_id = cli_b and padrao limit 1;
  if departamento_b is null then
    insert into public.nx_departamentos (cliente_id, nome, padrao, distribuicao)
    values (cli_b, privado || ' depto', true, 'manual') returning id into departamento_b;
  end if;
  insert into public.nx_empresas (cliente_id, nome) values (cli_b, privado || ' empresa') returning id into empresa_b;
  insert into public.nx_etiquetas (cliente_id, nome) values (cli_b, 'F8-' || sufixo) returning id into etiqueta_b;
  insert into public.nx_campos (cliente_id, entidade, chave, rotulo, tipo)
  values (cli_b, 'negocio', 'f8_' || sufixo, privado || ' campo', 'texto') returning id into campo_b;
  insert into public.nx_motivos_perda (cliente_id, nome) values (cli_b, privado || ' motivo') returning id into motivo_b;
  insert into public.nx_contatos (cliente_id, nome, telefone, origem, empresa_id, dono_id, etiquetas)
  values (cli_b, privado || ' contato', '5512' || lpad((txid_current() % 100000000)::text, 8, '0'),
          'manual', empresa_b, atend_b, array[etiqueta_b]) returning id into contato_b;
  insert into public.nx_leads (cliente_id, contato_id, funil_id, estagio_id, titulo, nome, telefone,
                               origem, etapa, status, dono_id, motivo_perda_id)
  values (cli_b, contato_b, funil_b, estagio_b, privado || ' negocio', privado || ' contato',
          '5512' || lpad(((txid_current() + 1) % 100000000)::text, 8, '0'),
          'manual', 'nova', 'aberto', atend_b, motivo_b) returning id into negocio_b;
  insert into public.nx_tarefas (cliente_id, titulo, dono_id, contato_id, negocio_id, criado_por)
  values (cli_b, privado || ' tarefa', atend_b, contato_b, negocio_b, conta_b) returning id into tarefa_b;
  insert into public.nx_notas (cliente_id, contato_id, negocio_id, autor_id, texto)
  values (cli_b, contato_b, negocio_b, atend_b, privado || ' nota') returning id into nota_b;
  insert into public.nx_canais (cliente_id, nome, phone_number_id, departamento_id)
  values (cli_b, 'F8 canal', 'f8-' || sufixo, departamento_b) returning id into canal_b;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, atribuida_a,
                                   negocio_id, protocolo, ultima_entrada_em)
  values (cli_b, canal_b, contato_b, departamento_b, atend_b, negocio_b, 'F8-' || sufixo, now()) returning id into conversa_b;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo,
                                   corpo, wamid, status)
  values (cli_b, conversa_b, contato_b, canal_b, 'in', 'texto', privado || ' mensagem',
          'wamid.F8.' || sufixo, 'recebida') returning id into mensagem_b;
  insert into public.nx_respostas (cliente_id, atalho, titulo, corpo, departamento_id)
  values (cli_b, 'f8-' || sufixo, privado || ' resposta', privado || ' corpo', departamento_b) returning id into resposta_b;
  insert into public.nx_templates (cliente_id, canal_id, nome, idioma, categoria, status, corpo)
  values (cli_b, canal_b, 'f8_' || sufixo, 'pt_BR', 'UTILITY', 'APPROVED', privado || ' modelo') returning id into template_b;
  insert into public.nx_automacoes (cliente_id, nome, gatilho, criado_por)
  values (cli_b, privado || ' automacao', 'conversa_nova', conta_b) returning id into automacao_b;
  insert into public.nx_convites (token_hash, org_id, cliente_id, papel, email, nome, criado_por, expira_em)
  values (md5('f8-convite-' || sufixo), org_b, cli_b, 'atendente', 'f8-convite-' || sufixo || '@teste.local',
          'F8 convite', gestor_b, now() + interval '1 hour') returning id into convite_b;
  insert into public.nx_visoes (cliente_id, conta_id, tela, nome, filtro)
  values (cli_b, conta_b, 'contatos', privado || ' visao', '{}'::jsonb) returning id into visao_b;
  insert into public.nx_importacoes (cliente_id, conta_id, arquivo, total)
  values (cli_b, conta_b, privado || '.csv', 1) returning id into importacao_b;
  insert into public.nx_notificacoes (cliente_id, conta_id, tipo, titulo, corpo, link)
  values (cli_b, atend_b, 'sistema', privado || ' notificacao', privado, '#/conversas') returning id into notificacao_b;

  -- Token de A não entra em B; nem o gestor da revenda B acessa a Nexus.
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ctx(%L,%L,%L)', token_a, cli_b, 'leitura')) = 'sem_acesso',
    'admin A não entra em B');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ctx(%L,%L,%L)', token_gestor_b, cli_a, 'leitura')) = 'sem_acesso',
    'gestor da revenda B não entra na Nexus A');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ctx(%L,%L,%L)', token_atend_a, cli_a, 'admin')) = 'sem_permissao',
    'atendente A não ganha papel admin');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contato_ver(%L,%L,%L)', token_a, cli_a, contato_b)) = 'contato_nao_encontrado',
    'ID de contato B não revela dados a A');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_ver(%L,%L,%L)', token_a, cli_a, negocio_b)) = 'negocio_nao_encontrado',
    'ID de negócio B não revela dados a A');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ver(%L,%L,%L)', token_a, cli_a, conversa_b)) = 'conversa_nao_encontrada',
    'ID de conversa B não revela dados a A');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_empresa_ver(%L,%L,%L)', token_a, cli_a, empresa_b)) = 'empresa_nao_encontrada',
    'ID de empresa B não revela dados a A');

  -- Inventário vem do catálogo: função nova com assinatura que recebe IDs/JSON não fica fora do smoke.
  v_ids := jsonb_build_object(
    'org', org_b, 'cliente', cli_b, 'conta', conta_b, 'empresa', empresa_b, 'contato', contato_b,
    'negocio', negocio_b, 'funil', funil_b, 'estagio', estagio_b, 'etiqueta', etiqueta_b,
    'tarefa', tarefa_b, 'nota', nota_b, 'departamento', departamento_b, 'canal', canal_b,
    'conversa', conversa_b, 'mensagem', mensagem_b, 'resposta', resposta_b, 'automacao', automacao_b,
    'campo', campo_b, 'motivo', motivo_b, 'template', template_b, 'convite', convite_b,
    'visao', visao_b, 'importacao', importacao_b, 'notificacao', notificacao_b
  );
  v_hash_antes := pg_temp.hash_tenant_b(cli_b, org_b);

  for r in
    select p.oid, p.proname, p.proargnames, p.proargtypes::oid[] as tipos
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.proname like 'nx\_%' escape '\'
       and has_function_privilege('anon', p.oid, 'execute')
       and (
         coalesce(p.proargnames, '{}'::text[]) && array[
           'p_id','p_ids','p_cliente','p_clientes','p_org','p_conta','p_usuario','p_contato','p_negocio',
           'p_estagio','p_funil','p_canal','p_template','p_convite','p_mensagem','p_conversa','p_mover_para',
           'p_manter','p_remover','p_empresa','p_departamento','p_resposta','p_automacao','p_campo','p_motivo',
           'p_etiqueta','p_importacao','p_visao','p_chave'
         ]
         or ('p_token' = any(coalesce(p.proargnames, '{}'::text[])) and exists (
              select 1 from unnest(p.proargtypes::oid[]) q(tipo) where q.tipo = 'jsonb'::regtype))
         or ('p_org' = any(coalesce(p.proargnames, '{}'::text[])))
         or ('p_token' = any(coalesce(p.proargnames, '{}'::text[])))
       )
     order by p.proname, p.oid
  loop
    v_rpc_count := v_rpc_count + 1;
    v_sonda_id := coalesce(r.proargnames, '{}'::text[]) && array[
      'p_id','p_ids','p_cliente','p_clientes','p_org','p_conta','p_usuario','p_contato','p_negocio',
      'p_estagio','p_funil','p_canal','p_template','p_convite','p_mensagem','p_conversa','p_mover_para',
      'p_manter','p_remover','p_empresa','p_departamento','p_resposta','p_automacao','p_campo','p_motivo',
      'p_etiqueta','p_importacao','p_visao','p_chave'
    ] or ('p_token' = any(coalesce(r.proargnames, '{}'::text[])) and exists (
      select 1 from unnest(r.tipos) q(tipo) where q.tipo = 'jsonb'::regtype));
    for v_pass in 1..3 loop
      -- pass 1: admin A + cliente A + IDs de B; pass 2: admin A contra cliente B;
      -- pass 3: chamada sem sessão. Métodos sem esses parâmetros só recebem pass 1.
      if not v_sonda_id and v_pass <> 3 then continue; end if;
      if v_pass = 2 and not ('p_cliente' = any(coalesce(r.proargnames, '{}'::text[]))) then continue; end if;
      if v_pass = 3 and not ('p_token' = any(coalesce(r.proargnames, '{}'::text[]))) then continue; end if;
      v_args := '';
      for a in
        select x.ordinality, r.proargnames[x.ordinality] as nome, x.tipo,
               pg_catalog.format_type(x.tipo, null) as tipo_sql, t.typelem
          from unnest(r.tipos) with ordinality x(tipo, ordinality)
          join pg_catalog.pg_type t on t.oid = x.tipo
         order by x.ordinality
      loop
        v_nome := coalesce(a.nome, '');
        v_tipo := a.tipo_sql;
        v_chave := null;

        if v_nome = 'p_id' or v_nome in ('p_ids','p_remover','p_manter') then
          v_chave := case
            when r.proname like '%contato%' then 'contato'
            when r.proname like '%negocio%' or r.proname like '%lead%' then 'negocio'
            when r.proname like '%conversa%' or r.proname like 'nx_cv_%' then 'conversa'
            when r.proname like '%mensagem%' or r.proname like '%msg%' then 'mensagem'
            when r.proname like '%tarefa%' then 'tarefa'
            when r.proname like '%nota%' then 'nota'
            when r.proname like '%empresa%' then 'empresa'
            when r.proname like '%funil%' then 'funil'
            when r.proname like '%estagio%' then 'estagio'
            when r.proname like '%etiqueta%' then 'etiqueta'
            when r.proname like '%campo%' then 'campo'
            when r.proname like '%motivo%' then 'motivo'
            when r.proname like '%canal%' then 'canal'
            when r.proname like '%departamento%' then 'departamento'
            when r.proname like '%resposta%' then 'resposta'
            when r.proname like '%template%' then 'template'
            when r.proname like '%convite%' then 'convite'
            when r.proname like '%automacao%' then 'automacao'
            when r.proname like '%visao%' then 'visao'
            when r.proname like '%importacao%' then 'importacao'
            when r.proname like '%notificacao%' then 'notificacao'
            when r.proname like '%usuario%' or r.proname like '%conta%' then 'conta'
            when r.proname like '%cliente%' then 'cliente'
            when r.proname like '%org%' then 'org'
            else null end;
        elsif v_nome = 'p_mover_para' then v_chave := 'funil';
        elsif v_nome = 'p_cliente' and v_tipo <> 'uuid' then v_chave := 'cliente';
        elsif v_nome = 'p_clientes' then v_chave := 'cliente';
        elsif v_nome like '%contato%' then v_chave := 'contato';
        elsif v_nome like '%negocio%' or v_nome like '%lead%' then v_chave := 'negocio';
        elsif v_nome like '%conversa%' then v_chave := 'conversa';
        elsif v_nome like '%mensagem%' then v_chave := 'mensagem';
        elsif v_nome like '%estagio%' then v_chave := 'estagio';
        elsif v_nome like '%funil%' then v_chave := 'funil';
        elsif v_nome like '%etiqueta%' then v_chave := 'etiqueta';
        elsif v_nome like '%tarefa%' then v_chave := 'tarefa';
        elsif v_nome like '%nota%' then v_chave := 'nota';
        elsif v_nome like '%empresa%' then v_chave := 'empresa';
        elsif v_nome like '%departamento%' then v_chave := 'departamento';
        elsif v_nome like '%canal%' then v_chave := 'canal';
        elsif v_nome like '%template%' then v_chave := 'template';
        elsif v_nome like '%convite%' then v_chave := 'convite';
        elsif v_nome like '%resposta%' then v_chave := 'resposta';
        elsif v_nome like '%automacao%' then v_chave := 'automacao';
        elsif v_nome like '%campo%' then v_chave := 'campo';
        elsif v_nome like '%motivo%' then v_chave := 'motivo';
        elsif v_nome like '%visao%' then v_chave := 'visao';
        elsif v_nome like '%importacao%' then v_chave := 'importacao';
        elsif v_nome like '%notificacao%' then v_chave := 'notificacao';
        elsif v_nome like '%org%' then v_chave := 'org';
        elsif v_nome like '%conta%' or v_nome like '%usuario%' or v_nome like '%dono%' or v_nome like '%autor%' then v_chave := 'conta';
        end if;

        v_id := case when v_chave is null then null else v_ids -> v_chave end;
        if v_tipo = 'jsonb' then
          v_payload := jsonb_build_object(
            'id', coalesce(v_id, v_ids -> 'negocio'), 'cliente_id', v_ids -> 'cliente', 'org_id', v_ids -> 'org',
            'contato_id', v_ids -> 'contato', 'negocio_id', v_ids -> 'negocio', 'conversa_id', v_ids -> 'conversa',
            'mensagem_id', v_ids -> 'mensagem', 'funil_id', v_ids -> 'funil', 'estagio_id', v_ids -> 'estagio',
            'empresa_id', v_ids -> 'empresa', 'canal_id', v_ids -> 'canal', 'departamento_id', v_ids -> 'departamento',
            'template_id', v_ids -> 'template', 'convite_id', v_ids -> 'convite', 'automacao_id', v_ids -> 'automacao',
            'etiqueta_id', v_ids -> 'etiqueta', 'campo_id', v_ids -> 'campo', 'motivo_perda_id', v_ids -> 'motivo',
            'dono_id', v_ids -> 'conta', 'conta_id', v_ids -> 'conta', 'nome', marcador, 'titulo', marcador,
            'telefone', '5512' || lpad((txid_current() % 100000000)::text, 8, '0'), 'origem', 'manual',
            'etapa', 'nova', 'status', 'aberto', 'valor_previsto', 1,
            'etiquetas', jsonb_build_array(v_ids -> 'etiqueta'),
            'estagios', jsonb_build_array(jsonb_build_object('id', v_ids -> 'estagio', 'nome', marcador, 'marco', 'nova'))
          );
          v_expr := format('%L::jsonb', v_payload::text);
        elsif v_tipo = 'uuid' then
          if v_nome = 'p_cliente' then
            v_expr := format('%L::uuid', case when v_pass = 2 then cli_b::text else cli_a::text end);
          elsif v_id is not null then
            v_expr := format('%L::uuid', v_id #>> '{}');
          else
            v_expr := 'null::uuid';
          end if;
        elsif v_tipo in ('bigint','integer','smallint') then
          if v_id is not null then v_expr := format('%L::%s', v_id #>> '{}', v_tipo);
          else v_expr := format('1::%s', v_tipo); end if;
        elsif a.typelem <> 0 then
          v_elemento := pg_catalog.format_type(a.typelem, null);
          if v_id is not null then
            v_expr := format('array[%L::%s]::%s', v_id #>> '{}', v_elemento, v_tipo);
          else
            v_expr := format('''{}''::%s', v_tipo);
          end if;
        elsif v_tipo in ('text','character varying','character') then
          v_expr := format('%L::%s', case
            when v_nome = 'p_token' then case when v_pass = 3 then '' else token_a end
            when v_nome = 'p_convite' then 'token-falso-f8-' || sufixo
            when v_nome = 'p_chave' then 'chave-falsa-f8-' || sufixo
            when v_nome = 'p_email' then 'f8-probe-' || sufixo || '@teste.local'
            when v_nome = 'p_senha' then 'senha-falsa-f8'
            when v_nome = 'p_confirmacao' then 'EXCLUIR'
            when v_nome = 'p_papel' then 'atendente'
            when v_nome = 'p_status' then 'aberta'
            when v_nome = 'p_etapa' then 'nova'
            when v_nome = 'p_tipo' then 'texto'
            when v_nome = 'p_direcao' then 'in'
            when v_nome = 'p_tela' then 'contatos'
            when v_nome = 'p_gatilho' then 'conversa_nova'
            when v_nome = 'p_canal' then 'meta'
            when v_nome = 'p_nome' or v_nome = 'p_titulo' then marcador
            when v_nome = 'p_org' then 'f8-inexistente'
            else marcador end, v_tipo);
        elsif v_tipo = 'boolean' then v_expr := 'true';
        elsif v_tipo = 'date' then v_expr := 'current_date';
        elsif v_tipo = 'timestamp with time zone' then v_expr := 'now()';
        elsif v_tipo = 'timestamp without time zone' then v_expr := 'localtimestamp';
        elsif v_tipo in ('numeric','real','double precision') then v_expr := format('1::%s', v_tipo);
        else
          v_expr := format('null::%s', v_tipo);
        end if;
        v_args := v_args || case when v_args = '' then '' else ', ' end || v_expr;
      end loop;

      v_sql := format('select coalesce(jsonb_agg(to_jsonb(q)), ''[]''::jsonb) from public.%I(%s) q', r.proname, v_args);
      v_erro := null;
      v_sqlstate := null;
      v_result := '[]'::jsonb;
      begin
        execute v_sql into v_result;
      exception when others then
        get stacked diagnostics
          v_erro = message_text,
          v_hint = pg_exception_hint,
          v_sqlstate = returned_sqlstate;
        -- Permission denial is a valid isolation outcome. Other class-42 errors
        -- indicate broken generated SQL, a missing object, or an incompatible signature.
        if v_sqlstate like '42%' and v_sqlstate <> '42501' then
          raise exception 'FALHOU: falha estrutural ao sondar RPC % no pass % (SQLSTATE %): %',
            r.proname, v_pass, v_sqlstate, v_erro;
        end if;
      end;

      perform pg_temp.ok(position(privado in coalesce(v_result::text, '')) = 0,
        'RPC ' || r.proname || ' não revela texto de B no pass ' || v_pass || coalesce(': ' || v_erro, ''));
      if v_pass = 3 and v_erro is null and v_result not in ('[]'::jsonb, 'null'::jsonb, '{}'::jsonb)
         and v_result::text !~ '"(sessao_invalida|conta_pendente|sem_acesso|sem_permissao|so_gestor|convite_invalido|codigo_invalido|chave_invalida)"'
         -- `nx_sair` é logout idempotente: sem sessão, sua única resposta pública é [{"ok":true}].
         and not (r.proname = 'nx_sair' and v_result = '[{"ok":true}]'::jsonb) then
        raise exception 'FALHOU: RPC anon sem sessão devolveu conteúdo: %', r.proname;
      end if;
    end loop;
  end loop;
  perform pg_temp.ok(v_rpc_count > 0, 'catálogo encontrou RPCs públicas com entrada de ID/JSON');
  v_hash_depois := pg_temp.hash_tenant_b(cli_b, org_b);
  perform pg_temp.ok(v_hash_depois = v_hash_antes, 'nenhuma linha da revenda B mudou após sondas catalogadas');

  -- Marca pública e verificação de convite respondem sem sessão por desenho;
  -- elas não podem conter identificadores ou dados privados do tenant. nx_sair só retorna ok=true.
  v_j := public.nx_marca_publica('host-f8-inexistente-' || sufixo || '.invalid', null)::jsonb;
  perform pg_temp.ok(position(cli_b::text in v_j::text) = 0 and position(privado in v_j::text) = 0,
    'nx_marca_publica devolve somente configuração pública');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_convite_ver(%L)', 'convite-inexistente-' || sufixo)) like 'convite_invalido%',
    'nx_convite_ver não revela dados para token inexistente');

  -- Todas as tabelas nx_* permanecem sem SELECT de navegador e com RLS ligado.
  for r in
    select c.relname, c.relrowsecurity
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p') and c.relname like 'nx\_%' escape '\'
     order by c.relname
  loop
    perform pg_temp.ok(not has_table_privilege('anon', 'public.' || r.relname, 'select')
                   and not has_table_privilege('authenticated', 'public.' || r.relname, 'select'),
      'sem SELECT direto em public.' || r.relname);
    perform pg_temp.ok(r.relrowsecurity, 'RLS ligada em public.' || r.relname);
  end loop;

  perform pg_temp.ok(
    not has_function_privilege('anon', 'public.nx_ctx(text,uuid,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.nx_ctx(text,uuid,text)', 'execute')
    and not has_function_privilege('anon', 'public.nx_disparar(text,jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.nx_disparar(text,jsonb)', 'execute'),
    'nx_ctx e nx_disparar não são executáveis pelo navegador'
  );
  v_erro := pg_temp.erro(format('select public.nx_executar(%L,%L,%L)', token_super, 'nx-enviar', '{}'));
  perform pg_temp.ok(v_erro = 'funcao_invalida', 'painel não dispara nx-enviar via nx_executar: ' || v_erro);

  -- A resposta de integração mostra nomes de campos, nunca valores secretos.
  insert into public.nx_integracoes (cliente_id, canal, ativo, cred)
  values (cli_a, 'meta', true, '{"access_token":"F8_FAKE_TOKEN_DO_TESTE","app_secret":"F8_FAKE_SECRET_DO_TESTE"}'::jsonb);
  v_j := public.nx_integracoes_status(token_a, cli_a)::jsonb;
  perform pg_temp.ok(v_j::text like '%access_token%' and v_j::text like '%app_secret%'
                 and v_j::text not like '%F8_FAKE_TOKEN_DO_TESTE%'
                 and v_j::text not like '%F8_FAKE_SECRET_DO_TESTE%',
    'status lista campos preenchidos sem devolver credenciais');

  raise exception 'OK 09_isolamento — org Nexus/revenda, admin/atendente, entidades B, % RPCs do catálogo, hashes, permissões e credenciais', v_rpc_count;
end $teste$;

rollback;
