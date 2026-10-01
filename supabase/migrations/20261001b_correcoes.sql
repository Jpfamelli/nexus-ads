-- ============================================================
-- ÓRBITA (SaaS da Nexus) — 20261001b_correcoes.sql
-- Correções da rodada de testes de 01/10/2026 (10 lentes). Só ACRESCENTA: create or replace
-- (mesmo nome, mesma assinatura — o que as funções já faziam continua igual), tabelas/colunas
-- if not exists, cron com unschedule antes. Toda função security definer + search_path ''.
-- Depende de 20261001a. Smoke: supabase/testes/13_correcoes.sql.
--
-- Cada seção diz qual achado fecha. Gerada por remendos sobre a ÚLTIMA definição de cada função.
-- ============================================================

-- ------------------------------------------------------------
-- 1. nx_cv_ver devolve o provedor do canal (alta · T04)
-- ------------------------------------------------------------
-- o painel só mostra a pílula da IA e os botões «Assumir» / «Devolver para a IA» quando conversa.canal.provedor = 'codewords';
-- o nx_cv_base já trazia (20260929a), o nx_cv_ver não.

create or replace function public.nx_cv_ver(p_token text, p_cliente uuid, p_id bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  cv public.nx_conversas;
  k public.nx_contatos;
  v_rank int;
  v_conv jsonb;
  v_anuncio jsonb;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  v_rank := public.nx_rank(v.papel);
  if not public.nx_cv_visivel(v, p_cliente, p_id) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  select * into cv from public.nx_conversas where id = p_id;
  select * into k from public.nx_contatos where id = cv.contato_id and cliente_id = p_cliente;

  v_conv := public.nx_cv_json_item(cv) || jsonb_build_object(
    'aberta_em', cv.aberta_em, 'primeira_resposta_em', cv.primeira_resposta_em,
    'resolvida_em', cv.resolvida_em,
    'departamento', (select jsonb_build_object('id', d.id, 'nome', d.nome, 'cor', d.cor)
                       from public.nx_departamentos d where d.id = cv.departamento_id),
    'atribuida', (select jsonb_build_object('id', x.id, 'nome', x.nome)
                    from public.nx_contas x where x.id = cv.atribuida_a),
    'canal', (select jsonb_build_object('id', c.id, 'nome', c.nome, 'numero_exibicao', c.numero_exibicao,
                                        'status', c.status,
                                        'tem_token', case when c.provedor = 'codewords'
                                                          then c.codewords_api_segredo is not null and c.codewords_phone_id is not null
                                                          else c.token_segredo is not null end,
                                        'provedor', c.provedor,
                                        'ia_ligada', case when c.provedor = 'codewords' then c.ia_ligada end,
                                        'ia_rota', case when c.provedor = 'codewords' then c.codewords_rota end)
                from public.nx_canais c where c.id = cv.canal_id),
    'resolvida_por', (select jsonb_build_object('id', x.id, 'nome', x.nome)
                        from public.nx_contas x where x.id = cv.resolvida_por));

  if k.anuncio_ext is not null or k.campanha_ext is not null then
    select jsonb_build_object('plataforma', coalesce(k.plataforma, m.plataforma),
                              'campanha_nome', m.campanha_nome, 'anuncio_nome', m.anuncio_nome)
      into v_anuncio
      from public.nx_metricas_dia m
     where m.cliente_id = p_cliente
       and ((k.anuncio_ext is not null and m.anuncio_ext = k.anuncio_ext)
            or (k.anuncio_ext is null and m.campanha_ext = k.campanha_ext))
     order by m.data desc limit 1;
  end if;
  if v_anuncio is null and k.plataforma is not null then
    v_anuncio := jsonb_build_object('plataforma', k.plataforma, 'campanha_nome', null, 'anuncio_nome', null);
  end if;

  return json_build_object(
    'conversa', v_conv,
    'contato', to_jsonb(k) - 'busca' - 'tel_chave',
    'anuncio', v_anuncio,
    'negocios', coalesce((select jsonb_agg(public.nx_cv_json_card(l) order by l.criado_em desc)
                            from public.nx_leads l
                           where l.cliente_id = p_cliente and l.contato_id = k.id and l.status = 'aberto'
                             and (v.papel not in ('atendente', 'leitura') or v.ver_todas
                                  or l.dono_id = v.conta_id or l.dono_id is null)), '[]'::jsonb),
    'atendimentos', coalesce((select jsonb_agg(jsonb_build_object(
                                'id', x.id, 'protocolo', x.protocolo, 'status', x.status,
                                'aberta_em', x.aberta_em, 'resolvida_em', x.resolvida_em,
                                'canal_id', x.canal_id,
                                'atribuida_nome', (select a.nome from public.nx_contas a where a.id = x.atribuida_a))
                                order by x.aberta_em desc)
                                from public.nx_conversas x
                               where x.cliente_id = p_cliente and x.contato_id = k.id
                                 and (not x.oculta or v_rank >= 2)), '[]'::jsonb),
    'tarefas', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', t.id, 'tipo', t.tipo, 'titulo', t.titulo, 'vence_em', t.vence_em,
                           'atrasada', t.vence_em is not null and t.vence_em < now(),
                           'negocio_id', t.negocio_id,
                           'dono', (select jsonb_build_object('id', a.id, 'nome', a.nome)
                                      from public.nx_contas a where a.id = t.dono_id))
                           order by t.vence_em nulls last, t.id)
                           from public.nx_tarefas t
                          where t.cliente_id = p_cliente and t.contato_id = k.id and t.concluida_em is null), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------
-- 2. nx_auto_config_ok: «toda mensagem» (sem palavras) e filtro que não bate = não roda (alta + média · T05)
-- ------------------------------------------------------------
-- (a) mensagem_recebida sem a chave «palavras»: jsonb_typeof(NULL) deixava o IF nulo e o gatilho nunca casava;
-- (b) filtro configurado com atributo ausente no evento (conversa sem departamento, negócio sem funil...) dava NULL
--     e o lote tratava NULL como «casa». Agora todo ramo devolve true/false, nunca NULL.

create or replace function public.nx_auto_config_ok(p_gatilho text, p_cfg jsonb, p_ref jsonb)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
declare c jsonb := coalesce(p_cfg, '{}'::jsonb); r jsonb := coalesce(p_ref, '{}'::jsonb); v_txt text;
begin
  case p_gatilho
    when 'conversa_nova', 'conversa_resolvida' then
      return coalesce((c ->> 'canal_id' is null or c ->> 'canal_id' = r ->> 'canal_id')
         and (c ->> 'departamento_id' is null or c ->> 'departamento_id' = r ->> 'departamento_id'), false);
    when 'mensagem_recebida' then
      if c ->> 'canal_id' is not null and c ->> 'canal_id' is distinct from r ->> 'canal_id' then return false; end if;
      -- sem palavras (chave ausente, null ou lista vazia) = toda mensagem recebida
      if coalesce(jsonb_typeof(c -> 'palavras'), 'null') <> 'array' then return true; end if;
      if jsonb_array_length(c -> 'palavras') = 0 then return true; end if;
      v_txt := public.nx_auto_norm(r ->> 'texto');
      if v_txt = '' then return false; end if;
      return exists (select 1 from jsonb_array_elements_text(c -> 'palavras') w
                      where public.nx_auto_norm(w) <> '' and position(public.nx_auto_norm(w) in v_txt) > 0);
    when 'negocio_criado', 'negocio_ganho', 'negocio_perdido' then
      return coalesce(c ->> 'funil_id' is null or c ->> 'funil_id' = r ->> 'funil_id', false);
    when 'negocio_estagio' then
      return coalesce(c ->> 'estagio_id' is not null and c ->> 'estagio_id' = r ->> 'estagio_para', false);
    when 'etiqueta_adicionada' then
      return coalesce(c ->> 'etiqueta_id' is not null and c ->> 'etiqueta_id' = r ->> 'etiqueta_id', false);
    else
      return false;
  end case;
end $$;

-- ------------------------------------------------------------
-- 3. CRM: campo obrigatório vazio ([] e {} contam como vazio) — nx_crm_vazio (baixa · T03)
-- ------------------------------------------------------------
create or replace function public.nx_crm_vazio(p jsonb)
returns boolean
language sql immutable
security definer
set search_path = ''
as $$
  select case when p is null then true
              else case jsonb_typeof(p)
                     when 'null' then true
                     when 'string' then btrim(p #>> '{}') = ''
                     when 'array' then jsonb_array_length(p) = 0
                     when 'object' then p = '{}'::jsonb
                     else false end end
$$;

-- ------------------------------------------------------------
-- 4. nx_negocio_mover: [] obrigatório não passa; consulta fora da agenda avisa (média + baixa · T03/T06)
-- ------------------------------------------------------------
-- nx_crm_aviso_agenda: o CRM aceita o encaixe manual, mas a agenda é a autoridade dos horários — quando a consulta marcada
-- pelo CRM cai em horário ocupado, fora do expediente ou no passado, grava uma nota no negócio e devolve o código
-- (aviso_agenda) no cartão. Não bloqueia: o atendente decide.

create or replace function public.nx_crm_aviso_agenda(p_cliente uuid, p_lead bigint, p_conta uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare l public.nx_leads; v_erro text; v_txt text;
begin
  select * into l from public.nx_leads x where x.id = p_lead and x.cliente_id = p_cliente;
  if l.id is null or l.consulta_em is null then return null; end if;
  v_erro := public.nx_agenda_checar(p_cliente, l.consulta_em, l.servico, l.id, false);
  if v_erro is null then return null; end if;
  v_txt := case v_erro when 'horario_ocupado' then 'o horário já está ocupado na agenda'
                       when 'fora_do_horario' then 'fora do horário de atendimento da agenda'
                       when 'passado' then 'a data já passou'
                       when 'antecedencia' then 'sem a antecedência mínima da agenda'
                       else 'fora das regras da agenda' end;
  insert into public.nx_notas (cliente_id, contato_id, negocio_id, autor_id, texto)
  values (p_cliente, l.contato_id, l.id, p_conta,
          left('Atenção: consulta marcada pelo CRM para ' || public.nx_agenda_rotulo(l.consulta_em) || ' — ' || v_txt || '.', 5000));
  return v_erro;
end $$;

create or replace function public.nx_negocio_mover(p_token text, p_cliente uuid, p_id bigint, p_estagio uuid,
                                                   p_ordem double precision default null, p_extra jsonb default '{}'::jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  x jsonb := coalesce(p_extra, '{}'::jsonb);
  l public.nx_leads; e public.nx_estagios; m public.nx_motivos_perda;
  v_valor numeric; v_mot uuid; v_txt text; v_dc date; v_da date; v_ce timestamptz; v_campos jsonb;
  v_ordem double precision; v_ch text; v_muda boolean; v_aviso text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if jsonb_typeof(x) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'extra'; end if;
  select * into l from public.nx_leads where id = p_id and cliente_id = p_cliente for update;
  if l.id is null or (public.nx_crm_restrito(v) and l.dono_id is not null and l.dono_id <> v.conta_id) then
    raise exception 'negocio_nao_encontrado' using errcode = '22023';
  end if;
  select * into e from public.nx_estagios where id = p_estagio and cliente_id = p_cliente;
  if e.id is null then raise exception 'estagio_invalido' using errcode = '22023'; end if;

  v_valor := l.valor; v_mot := l.motivo_perda_id; v_txt := l.motivo_perda_txt;
  v_dc := l.data_consulta; v_da := l.data_agenda; v_ce := l.consulta_em; v_campos := l.campos;
  if jsonb_typeof(x -> 'campos') = 'object' then v_campos := jsonb_strip_nulls(v_campos || (x -> 'campos')); end if;
  -- mudou de etapa (ou de situação)? Só reordenar na mesma coluna não pede nada.
  v_muda := e.id is distinct from l.estagio_id or e.tipo is distinct from l.status;

  if v_muda and e.tipo = 'ganho' then
    v_valor := coalesce(public.nx_crm_num(x, 'valor'), l.valor, l.valor_previsto);
    if v_valor is null then raise exception 'valor_obrigatorio' using errcode = '22023'; end if;
    select c.chave into v_ch from public.nx_campos c
     where c.cliente_id = p_cliente and c.entidade = 'negocio' and c.obrigatorio and c.ativo
       and (c.funil_id is null or c.funil_id = e.funil_id)
       and public.nx_crm_vazio(v_campos -> c.chave)
     order by c.ordem, c.criado_em limit 1;
    if v_ch is not null then raise exception 'campo_obrigatorio' using errcode = '22023', hint = v_ch; end if;
    if e.marco = 'fechou' then
      v_dc := coalesce(l.data_consulta, public.nx_crm_data(x, 'data_consulta'), v_hoje);
    end if;
  elsif v_muda and e.tipo = 'perdido' then
    if x ? 'motivo_perda_id' then v_mot := public.nx_crm_uuid(x, 'motivo_perda_id'); end if;
    if x ? 'motivo_perda_txt' then v_txt := left(nullif(btrim(x ->> 'motivo_perda_txt'), ''), 500); end if;
    if v_mot is not null then
      select * into m from public.nx_motivos_perda where id = v_mot and cliente_id = p_cliente;
      if m.id is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'motivo_perda_id'; end if;
    end if;
    if exists (select 1 from public.nx_motivos_perda y where y.cliente_id = p_cliente and y.ativo) then
      if v_mot is null then raise exception 'motivo_obrigatorio' using errcode = '22023'; end if;
      if m.exige_texto and v_txt is null then raise exception 'motivo_obrigatorio' using errcode = '22023', hint = 'texto'; end if;
    end if;
  end if;
  if v_muda and e.marco = 'agendada' then
    if nullif(x ->> 'consulta_em', '') is not null then
      v_ce := public.nx_crm_ts(x, 'consulta_em');
      v_dc := (v_ce at time zone 'America/Sao_Paulo')::date;
    elsif nullif(x ->> 'data_consulta', '') is not null then
      v_dc := public.nx_crm_data(x, 'data_consulta');
    end if;
    v_da := coalesce(l.data_agenda, v_hoje);
  end if;

  -- posição: p_ordem nulo → topo da coluna de destino
  v_ordem := p_ordem;
  if v_ordem is null then
    select min(y.ordem) - 1 into v_ordem from public.nx_leads y
     where y.cliente_id = p_cliente and y.estagio_id = e.id and y.id <> l.id;
    v_ordem := coalesce(v_ordem, -extract(epoch from clock_timestamp()));
  end if;

  update public.nx_leads y set
    estagio_id = e.id, ordem = v_ordem, valor = v_valor,
    motivo_perda_id = case when e.tipo = 'perdido' then v_mot else y.motivo_perda_id end,
    motivo_perda_txt = case when e.tipo = 'perdido' then v_txt else y.motivo_perda_txt end,
    data_consulta = v_dc, data_agenda = v_da, consulta_em = v_ce, campos = v_campos,
    atualizado_em = now()
  where y.id = l.id;   -- o gatilho da F1 aplica etapa↔marco, status, fechado_em e a TRAVA DO ADS
  -- consulta nova/alterada: confere a agenda e avisa (nota + aviso_agenda), sem bloquear o encaixe
  if v_ce is not null and v_ce is distinct from l.consulta_em then
    v_aviso := public.nx_crm_aviso_agenda(p_cliente, l.id, v.conta_id);
  end if;
  return ((public.nx_crm_cards(p_cliente, array[l.id], v)::jsonb -> 0)
          || case when v_aviso is not null then jsonb_build_object('aviso_agenda', v_aviso) else '{}'::jsonb end)::json;
end $$;

-- ------------------------------------------------------------
-- 5. nx_contato_salvar: [] obrigatório não passa (baixa · T03)
-- ------------------------------------------------------------
create or replace function public.nx_contato_salvar(p_token text, p_cliente uuid, p_contato jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  c jsonb := coalesce(p_contato, '{}'::jsonb);
  v_id bigint := public.nx_crm_int8(c, 'id');
  k public.nx_contatos;
  v_tel text; v_email text; v_uf text; v_origem text; v_dono uuid; v_emp bigint; v_outro bigint;
  v_campos jsonb; v_ch text; v_optin boolean; v_optin_or text; v_nome text;
  origens constant text[] := array['anuncio','whatsapp','indicacao','organico','manual','site','importacao'];
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if jsonb_typeof(c) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'contato'; end if;
  if v_id is not null then
    select * into k from public.nx_contatos where id = v_id and cliente_id = p_cliente for update;
    if k.id is null or (public.nx_crm_restrito(v) and k.dono_id is not null and k.dono_id <> v.conta_id) then
      raise exception 'contato_nao_encontrado' using errcode = '22023';
    end if;
  end if;
  -- validações das chaves presentes
  if c ? 'nome' then v_nome := left(nullif(btrim(c ->> 'nome'), ''), 160); end if;
  if c ? 'telefone' and nullif(btrim(c ->> 'telefone'), '') is not null then
    v_tel := public.nx_tel_normalizar(c ->> 'telefone');
    if v_tel is null then raise exception 'telefone_invalido' using errcode = '22023', hint = 'telefone'; end if;
    select x.id into v_outro from public.nx_contatos x
     where x.cliente_id = p_cliente and x.tel_chave = public.nx_tel_chave(v_tel)
       and x.id is distinct from v_id limit 1;
    if v_outro is not null then raise exception 'telefone_em_uso' using errcode = '22023', hint = v_outro::text; end if;
  end if;
  if c ? 'email' then
    v_email := lower(nullif(btrim(c ->> 'email'), ''));
    if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'email';
    end if;
  end if;
  if c ? 'uf' then
    v_uf := upper(nullif(btrim(c ->> 'uf'), ''));
    if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'uf'; end if;
  end if;
  if c ? 'origem' then
    v_origem := nullif(btrim(c ->> 'origem'), '');
    if v_origem is not null and not (v_origem = any(origens)) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'origem';
    end if;
  end if;
  if c ? 'dono_id' then
    v_dono := public.nx_crm_uuid(c, 'dono_id');
    if not public.nx_crm_dono_ok(p_cliente, v_dono) then raise exception 'dados_invalidos' using errcode = '22023', hint = 'dono_id'; end if;
  end if;
  if c ? 'empresa_id' then
    v_emp := public.nx_crm_int8(c, 'empresa_id');
    if v_emp is not null and not exists (select 1 from public.nx_empresas e where e.id = v_emp and e.cliente_id = p_cliente) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'empresa_id';
    end if;
  end if;
  if c ? 'campos' and jsonb_typeof(c -> 'campos') not in ('object', 'null') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'campos';
  end if;
  if c ? 'optin_marketing' then
    if jsonb_typeof(c -> 'optin_marketing') not in ('boolean', 'null') then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'optin_marketing';
    end if;
    v_optin := (c ->> 'optin_marketing')::boolean;
    v_optin_or := left(nullif(btrim(c ->> 'optin_origem'), ''), 60);
    if v_optin_or is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'optin_origem'; end if;
  end if;
  v_campos := jsonb_strip_nulls(coalesce(k.campos, '{}'::jsonb)
                || coalesce(case when jsonb_typeof(c -> 'campos') = 'object' then c -> 'campos' end, '{}'::jsonb));
  -- campos obrigatórios do contato: ao criar, ou quando os campos são editados
  if v_id is null or c ? 'campos' then
    select x.chave into v_ch from public.nx_campos x
     where x.cliente_id = p_cliente and x.entidade = 'contato' and x.obrigatorio and x.ativo
       and public.nx_crm_vazio(v_campos -> x.chave)
     order by x.ordem, x.criado_em limit 1;
    if v_ch is not null then raise exception 'campo_obrigatorio' using errcode = '22023', hint = v_ch; end if;
  end if;

  if v_id is null then
    if v_nome is null and v_tel is null and v_email is null then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'nome';
    end if;
    perform public.nx_exigir_limite(p_cliente, 'contatos', 1);
    insert into public.nx_contatos (cliente_id, nome, telefone, email, documento, nascimento, cidade, uf, empresa_id,
                                    origem, dono_id, etiquetas, campos, obs, optin_marketing, optin_em, optin_origem)
    values (p_cliente, v_nome, v_tel, v_email,
            left(nullif(btrim(c ->> 'documento'), ''), 40), public.nx_crm_data(c, 'nascimento'),
            left(nullif(btrim(c ->> 'cidade'), ''), 80), v_uf, v_emp,
            coalesce(v_origem, 'manual'),
            case when c ? 'dono_id' then v_dono else v.conta_id end,
            public.nx_crm_etiquetas_ok(p_cliente, public.nx_crm_uuids(c, 'etiquetas')),
            v_campos, left(nullif(btrim(c ->> 'obs'), ''), 5000),
            v_optin, case when c ? 'optin_marketing' then now() end, v_optin_or)
    returning * into k;
  else
    update public.nx_contatos x set
      nome = case when c ? 'nome' then v_nome else x.nome end,
      telefone = case when c ? 'telefone' then v_tel else x.telefone end,
      -- número trocado à mão: o wa_id antigo não vale mais para envio
      wa_id = case when c ? 'telefone' and public.nx_tel_chave(v_tel) is distinct from x.tel_chave then null else x.wa_id end,
      email = case when c ? 'email' then v_email else x.email end,
      documento = case when c ? 'documento' then left(nullif(btrim(c ->> 'documento'), ''), 40) else x.documento end,
      nascimento = case when c ? 'nascimento' then public.nx_crm_data(c, 'nascimento') else x.nascimento end,
      cidade = case when c ? 'cidade' then left(nullif(btrim(c ->> 'cidade'), ''), 80) else x.cidade end,
      uf = case when c ? 'uf' then v_uf else x.uf end,
      empresa_id = case when c ? 'empresa_id' then v_emp else x.empresa_id end,
      origem = case when c ? 'origem' then coalesce(v_origem, x.origem) else x.origem end,
      dono_id = case when c ? 'dono_id' then v_dono else x.dono_id end,
      etiquetas = case when c ? 'etiquetas' then public.nx_crm_etiquetas_ok(p_cliente, public.nx_crm_uuids(c, 'etiquetas')) else x.etiquetas end,
      campos = case when c ? 'campos' then v_campos else x.campos end,
      obs = case when c ? 'obs' then left(nullif(btrim(c ->> 'obs'), ''), 5000) else x.obs end,
      optin_marketing = case when c ? 'optin_marketing' then v_optin else x.optin_marketing end,
      optin_em = case when c ? 'optin_marketing' then now() else x.optin_em end,
      optin_origem = case when c ? 'optin_marketing' then v_optin_or else x.optin_origem end
    where x.id = k.id;
  end if;
  return public.nx_crm_contato_json(p_cliente, k.id)::json;
end $$;

-- ------------------------------------------------------------
-- 6. nx_crm_ts: data pura («2026-10-06») é 00:00 de São Paulo, não UTC (baixa · T06)
-- ------------------------------------------------------------
create or replace function public.nx_crm_ts(p jsonb, k text)
returns timestamptz
language plpgsql stable
security definer
set search_path = ''
as $$
declare s text := nullif(btrim(p ->> k), '');
begin
  if s is null then return null; end if;
  -- sem fuso explícito = horário de São Paulo
  if s ~ '^\d{4}-\d{2}-\d{2}$' then return (s::date)::timestamp at time zone 'America/Sao_Paulo'; end if;
  if s ~ '(Z|[+-]\d{2}(:?\d{2})?)$' then return s::timestamptz; end if;
  return s::timestamp at time zone 'America/Sao_Paulo';
exception when others then
  raise exception 'dados_invalidos' using errcode = '22023', hint = k;
end $$;

-- ------------------------------------------------------------
-- 7. nx_tel_normalizar: zero de tronco e «+» (baixa · T03)
-- ------------------------------------------------------------
-- «(012) 99777-3031» e «0 12 99777-3030» eram gravados com 12 dígitos e sem o 55 (não deduplicavam nem enviavam);
-- «+1 415 555 2671» (DDI explícito) ganhava 55. Agora o 0 de tronco sai e o «+» vale como DDI informado.

create or replace function public.nx_tel_normalizar(p text, p_com_ddi boolean default false)
returns text
language plpgsql immutable
security definer
set search_path = ''
as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); v_mais boolean := btrim(coalesce(p, '')) like '+%';
begin
  if coalesce(p_com_ddi, false) or v_mais then
    return case when length(d) between 8 and 15 then d end;
  end if;
  -- zero de tronco (DDD nunca começa com 0): 012997773031 → 12997773031
  if left(d, 1) = '0' and length(d) in (11, 12) and substr(d, 2, 1) <> '0' then d := substr(d, 2); end if;
  if length(d) between 10 and 11 then return '55' || d; end if;
  if length(d) between 12 and 15 then return d; end if;
  return null;
end $$;

-- ------------------------------------------------------------
-- 8. nx_crm_filtro_negocios: a busca por telefone do kanban casa com ou sem o 9º dígito (baixa · T03)
-- ------------------------------------------------------------
create or replace function public.nx_crm_filtro_negocios(p_cliente uuid, v public.nx_ctx_t, p_filtro jsonb, p_kanban boolean)
returns text
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  f jsonb := coalesce(p_filtro, '{}'::jsonb);
  w text := format('l.cliente_id = %L', p_cliente);
  q text; d text; dk text; x text; ids uuid[]; n int; nv numeric;
begin
  if jsonb_typeof(f) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'filtro'; end if;
  if public.nx_crm_restrito(v) then
    w := w || format(' and (l.dono_id = %L or l.dono_id is null)', v.conta_id);
  end if;
  -- busca: só dígitos (≥ 4) → telefone; senão título/nome/serviço sem acento
  q := btrim(coalesce(f ->> 'busca', ''));
  if q <> '' then
    d := regexp_replace(q, '\D', '', 'g');
    if q ~ '^[0-9\s().+-]+$' and length(d) >= 4 then
      dk := coalesce(public.nx_tel_chave(public.nx_tel_normalizar(d)), d);
      w := w || format(' and (l.telefone like %L or l.telefone like %L or public.nx_tel_chave(l.telefone) like %L)',
                       '%' || d || '%', '%' || dk || '%', '%' || dk || '%');
    else
      q := lower(extensions.unaccent('extensions.unaccent'::regdictionary, q));
      q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
      w := w || format(' and lower(extensions.unaccent(''extensions.unaccent''::regdictionary, coalesce(l.titulo, '''') || '' '' || coalesce(l.nome, '''') || '' '' || coalesce(l.servico, ''''))) like %L', '%' || q || '%');
    end if;
  end if;
  -- responsável
  x := f ->> 'dono';
  if x = 'eu' then w := w || format(' and l.dono_id = %L', v.conta_id);
  elsif x = 'sem' then w := w || ' and l.dono_id is null';
  elsif nullif(x, '') is not null then w := w || format(' and l.dono_id = %L', public.nx_crm_uuid(f, 'dono'));
  end if;
  -- etiquetas
  if jsonb_typeof(f -> 'etiquetas') = 'object' then
    ids := public.nx_crm_uuids(f -> 'etiquetas', 'ids');
    if cardinality(ids) > 0 then
      case coalesce(f -> 'etiquetas' ->> 'op', 'alguma')
        when 'alguma' then w := w || format(' and l.etiquetas && %L::uuid[]', ids);
        when 'todas' then w := w || format(' and l.etiquetas @> %L::uuid[]', ids);
        when 'nenhuma' then w := w || format(' and not (l.etiquetas && %L::uuid[])', ids);
        else raise exception 'dados_invalidos' using errcode = '22023', hint = 'etiquetas';
      end case;
    end if;
  end if;
  -- origem
  if jsonb_typeof(f -> 'origem') = 'array' and jsonb_array_length(f -> 'origem') > 0 then
    w := w || format(' and l.origem = any(%L::text[])', array(select jsonb_array_elements_text(f -> 'origem')));
  end if;
  -- status
  x := coalesce(nullif(f ->> 'status', ''), 'todos');
  if x in ('aberto', 'ganho', 'perdido') then w := w || format(' and l.status = %L', x);
  elsif x <> 'todos' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'status';
  end if;
  -- datas (fuso SP)
  if nullif(f ->> 'criado_de', '') is not null then
    w := w || format(' and l.criado_em >= (%L::date::timestamp at time zone ''America/Sao_Paulo'')', public.nx_crm_data(f, 'criado_de'));
  end if;
  if nullif(f ->> 'criado_ate', '') is not null then
    w := w || format(' and l.criado_em < ((%L::date + 1)::timestamp at time zone ''America/Sao_Paulo'')', public.nx_crm_data(f, 'criado_ate'));
  end if;
  -- valores (final se houver, senão previsto)
  nv := public.nx_crm_num(f, 'valor_min');
  if nv is not null then w := w || format(' and coalesce(l.valor, l.valor_previsto, 0) >= %L::numeric', nv); end if;
  nv := public.nx_crm_num(f, 'valor_max');
  if nv is not null then w := w || format(' and coalesce(l.valor, l.valor_previsto, 0) <= %L::numeric', nv); end if;
  -- parados há N dias na etapa
  n := public.nx_crm_int8(f, 'parado_dias');
  if n is not null and n > 0 then
    w := w || format(' and l.status = ''aberto'' and l.estagio_em < now() - make_interval(days => %s)', least(n, 3650));
  end if;
  -- empresa (do contato)
  if nullif(f ->> 'empresa_id', '') is not null then
    w := w || format(' and exists (select 1 from public.nx_contatos k where k.id = l.contato_id and k.empresa_id = %L)',
                     public.nx_crm_int8(f, 'empresa_id'));
  end if;
  w := w || public.nx_crm_filtro_campo('l', f);
  -- kanban: colunas ganho/perdido só com fechados nos últimos N dias (padrão 30; ≤ 0 = todos)
  if p_kanban then
    n := coalesce(public.nx_crm_int8(f, 'fechados_dias'), 30);
    if n > 0 then
      w := w || format(' and (l.status = ''aberto'' or l.fechado_em >= now() - make_interval(days => %s))', least(n, 36500));
    end if;
  end if;
  return w;
end $$;

-- ------------------------------------------------------------
-- 9. nx_auto_mover / nx_auto_erro_texto: ganho automático respeita o campo obrigatório do negócio (média · T03)
-- ------------------------------------------------------------
-- o mover manual (nx_negocio_mover) devolve campo_obrigatorio; a automação (mover_estagio, mover_funil, IA) fechava como ganho
-- sem olhar. Agora a execução falha com o aviso e o negócio continua aberto.

create or replace function public.nx_auto_mover(p_cliente uuid, p_origem text, p_neg bigint, p_estagio uuid,
                                                p_motivo_perda text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare l public.nx_leads; e public.nx_estagios; v_funil text; v_ch text;
begin
  select * into l from public.nx_leads x where x.id = p_neg and x.cliente_id = p_cliente;
  if l.id is null then return 'mover: pulado (sem negócio)'; end if;
  select * into e from public.nx_estagios s where s.id = p_estagio and s.cliente_id = p_cliente;
  if e.id is null then raise exception 'estagio_invalido' using errcode = '22023', hint = 'nao_encontrado'; end if;
  if l.estagio_id = e.id then return 'já estava em «' || e.nome || '»'; end if;
  if e.tipo = 'ganho' and coalesce(l.valor, l.valor_previsto) is null then
    raise exception 'valor_obrigatorio' using errcode = '22023';
  end if;
  if e.tipo = 'ganho' then
    select c.chave into v_ch from public.nx_campos c
     where c.cliente_id = p_cliente and c.entidade = 'negocio' and c.obrigatorio and c.ativo
       and (c.funil_id is null or c.funil_id = e.funil_id)
       and public.nx_crm_vazio(l.campos -> c.chave)
     order by c.ordem, c.criado_em limit 1;
    if v_ch is not null then raise exception 'campo_obrigatorio' using errcode = '22023', hint = v_ch; end if;
  end if;
  update public.nx_leads x set
    estagio_id = e.id,
    ordem = -extract(epoch from clock_timestamp()),
    valor = case when e.tipo = 'ganho' then coalesce(x.valor, x.valor_previsto) else x.valor end,
    data_agenda = case when e.marco = 'agendada' then coalesce(x.data_agenda, (now() at time zone 'America/Sao_Paulo')::date) else x.data_agenda end,
    data_consulta = case when e.marco = 'fechou' then coalesce(x.data_consulta, (now() at time zone 'America/Sao_Paulo')::date) else x.data_consulta end,
    motivo_perda_txt = case when e.tipo = 'perdido'
                            then coalesce(x.motivo_perda_txt, left(coalesce(p_motivo_perda, 'Automação «' || p_origem || '»'), 500))
                            else x.motivo_perda_txt end
   where x.id = l.id and x.cliente_id = p_cliente;
  if l.funil_id is distinct from e.funil_id then
    select f.nome into v_funil from public.nx_funis f where f.id = e.funil_id;
    return 'movido para «' || e.nome || '» no funil «' || coalesce(v_funil, '?') || '»';
  end if;
  return 'movido para «' || e.nome || '»';
end $$;

create or replace function public.nx_auto_erro_texto(p_msg text, p_hint text, p_detalhe text)
returns text
language plpgsql immutable
security definer
set search_path = ''
as $$
declare v_n text; v_t text; v_r text; v_h text := nullif(btrim(coalesce(p_hint, '')), '');
begin
  if coalesce(p_detalhe, '') like 'acao:%' then
    v_n := split_part(p_detalhe, ':', 2);
    v_t := case split_part(p_detalhe, ':', 3)
      when 'criar_tarefa' then 'criar tarefa' when 'mover_estagio' then 'mover etapa'
      when 'criar_negocio' then 'criar negócio' when 'enviar_mensagem' then 'enviar mensagem'
      when 'enviar_template' then 'enviar modelo' when 'atribuir' then 'atribuir'
      when 'etiquetar' then 'etiqueta' when 'notificar' then 'avisar'
      when 'resolver_conversa' then 'resolver conversa' when 'alerta_whatsapp' then 'alerta no WhatsApp'
      when 'mover_funil' then 'mover de funil' when 'etiqueta_adicionar' then 'pôr etiqueta'
      when 'etiqueta_remover' then 'tirar etiqueta' when 'campo_atualizar' then 'preencher campo'
      when 'nota' then 'anotar' when 'esperar' then 'esperar' when 'parar' then 'parar'
      when 'ia_decidir' then 'IA decide'
      else split_part(p_detalhe, ':', 3) end;
  end if;
  v_r := case p_msg
    when 'valor_obrigatorio' then 'falta o valor para marcar como ganho'
    when 'campo_obrigatorio' then 'falta preencher o campo obrigatório «' || coalesce(v_h, '?') || '» para marcar como ganho'
    when 'estagio_invalido' then 'a etapa não é válida' || coalesce(' (' || v_h || ')', '')
    when 'funil_invalido' then case v_h
        when 'fechado_no_ads' then 'negócio fechado no funil de anúncios não muda de funil'
        when 'sai_do_ads' then 'esse negócio veio do funil de anúncios e só pode ir para outro funil de anúncios'
        else 'o funil não é válido' || coalesce(' (' || v_h || ')', '') end
    when 'template_invalido' then 'modelo inválido' || coalesce(': ' || v_h, '')
    when 'rodizio_indisponivel' then 'o rodízio ainda não está disponível neste ambiente'
    when 'funcao_invalida' then 'o alerta no WhatsApp ainda não está disponível'
    when 'dados_invalidos' then 'dados inválidos' || coalesce(' (' || v_h || ')', '')
    else left(coalesce(p_msg, 'erro desconhecido'), 300) || coalesce(' (' || left(v_h, 100) || ')', '')
  end;
  if v_n is not null then return 'Ação ' || v_n || ' (' || v_t || '): ' || v_r || '.'; end if;
  return upper(left(v_r, 1)) || substr(v_r, 2) || '.';
end $$;

-- ------------------------------------------------------------
-- 10. nx_auto_variavel_vazia: a mensagem da automação não sai com data, hora, nome ou valor em branco (média · T05)
-- ------------------------------------------------------------
create or replace function public.nx_auto_variavel_vazia(p_txt text, p_d jsonb)
returns text
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if position('{' in coalesce(p_txt, '')) = 0 then return null; end if;
  if p_txt like '%{data_consulta}%' and btrim(public.nx_auto_texto('{data_consulta}', p_d)) = '' then
    return 'a data da consulta não está marcada';
  end if;
  if p_txt like '%{hora_consulta}%' and btrim(public.nx_auto_texto('{hora_consulta}', p_d)) = '' then
    return 'a hora da consulta não está marcada';
  end if;
  if (p_txt like '%{primeiro_nome}%' or p_txt like '%{nome}%') and btrim(public.nx_auto_texto('{nome}', p_d)) = '' then
    return 'o contato não tem nome';
  end if;
  if p_txt like '%{valor}%' and btrim(public.nx_auto_texto('{valor}', p_d)) = '' then
    return 'o negócio não tem valor';
  end if;
  return null;
end $$;

-- ------------------------------------------------------------
-- 11. nx_auto_passos: tarefa só para quem tem acesso; mensagem não reabre atendimento nem sai com variável em branco; campo_atualizar valida pelo tipo (média + baixa · T01/T03/T04/T05)
-- ------------------------------------------------------------
-- · criar_tarefa: dono sem acesso ao cliente (ex-membro, outra organização) vira tarefa sem responsável (como o atribuir recusa)
-- · enviar_mensagem/enviar_template em «conversa resolvida»: usa a conversa resolvida (a pesquisa de satisfação não abre um
--   atendimento novo, que resolvido de novo repetiria o ciclo); gatilhos de conversa não reabrem conversa já resolvida
-- · enviar_mensagem com {data_consulta}/{hora_consulta}/{nome}/{valor} em branco é pulada com motivo legível
-- · campo_atualizar: validação pelo tipo do campo, igual à edição manual
-- · 'parar' devolve a posição (parou_em) para a tela não mostrar «3 de 3 passos»

create or replace function public.nx_auto_passos(p_auto public.nx_automacoes, p_acoes jsonb, p_alvo jsonb,
                                                 p_inicio int default 0, p_sim boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c uuid := p_auto.cliente_id;
  v_alvo jsonb := coalesce(p_alvo, '{}'::jsonb);
  v_d jsonb; ac jsonb; i int; v_total int; v_tipo text; v_det text[] := '{}'; v_n0 int;
  v_neg bigint; v_ct bigint; v_cv bigint; v_conta uuid; v_id uuid; v_n int; v_quando timestamptz;
  v_txt text; v_titulo text; v_link text; v_ntipo text; v_nome text; v_funil uuid; v_novo bigint;
  v_pars jsonb; v_par text; v_raw text; v_ue timestamptz; v_canal uuid; v_fila bigint; v_optin boolean;
  e public.nx_estagios; t public.nx_templates;
  v_msg text; v_hint text; v_st text;
  v_conversa_primeiro boolean := p_auto.gatilho in ('conversa_nova', 'mensagem_recebida', 'sem_resposta', 'conversa_resolvida');
  v_pas jsonb := '[]'::jsonb; v_prox int; v_esp int; v_canc boolean := true; v_parou boolean := false; v_ped bigint;
  v_acum int := 0; v_ini int;
  v_modo text; v_dep uuid; v_rem boolean; v_campo text; v_tarefa text; v_tmp text; v_val jsonb; v_nome2 text;
  fk public.nx_campos; v_resolvida boolean; v_parou_em int;
begin
  v_total := jsonb_array_length(coalesce(p_acoes, '[]'::jsonb));
  for i in greatest(coalesce(p_inicio, 0), 0) + 1 .. v_total loop
    ac := p_acoes -> (i - 1);
    v_tipo := ac ->> 'tipo';
    v_n0 := cardinality(v_det);
    v_ini := v_acum;
    begin
      v_d := public.nx_auto_dados(v_c, v_alvo);
      v_neg := (v_d #>> '{negocio,id}')::bigint;
      v_ct := (v_d #>> '{contato,id}')::bigint;
      v_cv := case when coalesce(v_d #>> '{conversa,status}', 'resolvida') <> 'resolvida' then (v_d #>> '{conversa,id}')::bigint end;

      case v_tipo
      -- -------------------------------------------------- criar_tarefa
      when 'criar_tarefa' then
        v_conta := case ac ->> 'dono'
          when 'responsavel' then coalesce((v_d #>> '{negocio,dono_id}')::uuid, (v_d #>> '{conversa,atribuida_a}')::uuid, (v_d #>> '{contato,dono_id}')::uuid)
          when 'atendente' then coalesce((v_d #>> '{conversa,atribuida_a}')::uuid, (v_d #>> '{negocio,dono_id}')::uuid, (v_d #>> '{contato,dono_id}')::uuid)
          else public.nx_auto_uuid(ac ->> 'dono') end;
        if v_conta is not null and not public.nx_auto_ref_ok(v_c, 'conta', v_conta) then v_conta := null; end if;
        v_titulo := left(coalesce(nullif(btrim(public.nx_auto_texto(ac ->> 'titulo', v_d)), ''), 'Tarefa da automação'), 160);
        insert into public.nx_tarefas (cliente_id, tipo, titulo, vence_em, dono_id, contato_id, negocio_id, automacao_id)
        values (v_c, coalesce(nullif(ac ->> 'tipo_tarefa', ''), 'tarefa'), v_titulo,
                now() + make_interval(hours => coalesce(public.nx_auto_int(ac -> 'vence_em_horas'), 24)),
                v_conta, v_ct, v_neg, p_auto.id);
        v_det := v_det || ('tarefa «' || left(v_titulo, 60) || '» para '
                           || coalesce((select k.nome from public.nx_contas k where k.id = v_conta), 'ninguém (sem responsável)'));

      -- -------------------------------------------------- mover_estagio
      when 'mover_estagio' then
        if v_neg is null then
          v_det := v_det || 'mover etapa: pulado (sem negócio)'::text;
        else
          v_det := v_det || public.nx_auto_mover(v_c, p_auto.nome, v_neg, public.nx_auto_uuid(ac ->> 'estagio_id'));
        end if;

      -- -------------------------------------------------- mover_funil
      when 'mover_funil' then
        if v_neg is null then
          v_det := v_det || 'mover de funil: pulado (sem negócio)'::text;
        else
          v_funil := public.nx_auto_uuid(ac ->> 'funil_id');
          if v_funil is null or not exists (select 1 from public.nx_funis f where f.id = v_funil and f.cliente_id = v_c and f.ativo) then
            raise exception 'funil_invalido' using errcode = '22023', hint = 'nao_encontrado';
          end if;
          select f.nome into v_nome from public.nx_funis f where f.id = v_funil;
          v_id := public.nx_auto_uuid(ac ->> 'estagio_id');
          if v_id is not null then
            select * into e from public.nx_estagios s where s.id = v_id and s.funil_id = v_funil and s.cliente_id = v_c;
            if e.id is null then raise exception 'estagio_invalido' using errcode = '22023', hint = 'nao_encontrado'; end if;
          else
            select * into e from public.nx_estagios s where s.funil_id = v_funil and s.cliente_id = v_c and s.tipo = 'aberto'
             order by s.ordem limit 1;
            if e.id is null then raise exception 'estagio_invalido' using errcode = '22023', hint = 'funil_sem_etapa'; end if;
          end if;
          if v_id is null and (v_d #>> '{negocio,funil_id}')::uuid = v_funil then
            v_det := v_det || ('já estava no funil «' || v_nome || '»');
          else
            v_det := v_det || public.nx_auto_mover(v_c, p_auto.nome, v_neg, e.id);
          end if;
        end if;

      -- -------------------------------------------------- criar_negocio
      when 'criar_negocio' then
        if v_ct is null then
          v_det := v_det || 'criar negócio: pulado (sem contato)'::text;
        else
          select * into e from public.nx_estagios s where s.id = public.nx_auto_uuid(ac ->> 'estagio_id') and s.cliente_id = v_c;
          v_funil := coalesce(public.nx_auto_uuid(ac ->> 'funil_id'), e.funil_id,
                              (select f.id from public.nx_funis f where f.cliente_id = v_c and f.padrao limit 1));
          if v_funil is null or not exists (select 1 from public.nx_funis f where f.id = v_funil and f.cliente_id = v_c and f.ativo) then
            raise exception 'funil_invalido' using errcode = '22023', hint = 'nao_encontrado';
          end if;
          if e.id is not null and e.funil_id <> v_funil then e := null; end if;
          if e.id is null then
            select * into e from public.nx_estagios s where s.funil_id = v_funil and s.tipo = 'aberto' order by s.ordem limit 1;
          end if;
          select f.nome into v_nome from public.nx_funis f where f.id = v_funil;
          if exists (select 1 from public.nx_leads l where l.cliente_id = v_c and l.contato_id = v_ct
                        and l.funil_id = v_funil and l.status = 'aberto') then
            v_det := v_det || ('criar negócio: pulado (já tinha um aberto em «' || v_nome || '»)');
          else
            insert into public.nx_leads (cliente_id, contato_id, funil_id, estagio_id, titulo, origem, dono_id)
            values (v_c, v_ct, v_funil, e.id,
                    nullif(left(btrim(public.nx_auto_texto(ac ->> 'titulo', v_d)), 120), ''), 'manual',
                    coalesce((v_d #>> '{contato,dono_id}')::uuid, (v_d #>> '{conversa,atribuida_a}')::uuid))
            returning id into v_novo;
            v_alvo := v_alvo || jsonb_build_object('negocio_id', v_novo);
            v_det := v_det || ('negócio criado em «' || v_nome || '»');
          end if;
        end if;

      -- -------------------------------------------------- enviar_mensagem (fila; fora da janela = pulada)
      when 'enviar_mensagem' then
        v_optin := (v_d #>> '{contato,optin_marketing}')::boolean;
        v_canal := case when v_cv is not null then (v_d #>> '{conversa,canal_id}')::uuid end;
        -- a conversa do alvo já foi resolvida (v_cv é nulo). Em «conversa resolvida» a própria conversa serve (nada de atendimento
        -- novo a cada resolução); nos gatilhos de conversa, o follow-up atrasado NÃO reabre o que a equipe já resolveu
        v_resolvida := v_cv is null and (v_d #>> '{conversa,id}') is not null and v_conversa_primeiro;
        if v_resolvida and p_auto.gatilho = 'conversa_resolvida' then
          v_cv := (v_d #>> '{conversa,id}')::bigint;
          v_canal := (v_d #>> '{conversa,canal_id}')::uuid;
          v_resolvida := false;
        end if;
        -- canal CodeWords (aparelho, 20260929a_codewords.sql): sem conversa aberta, abre uma no canal
        -- CodeWords do contato; lá não existe janela de 24 h nem modelo da Meta
        if v_ct is not null and v_canal is null and not v_resolvida and not coalesce((v_d #>> '{contato,bloqueado}')::boolean, false) then
          v_canal := public.nx_codewords_canal_contato(v_c, v_ct);
          if v_canal is not null then
            v_cv := public.nx_auto_abrir_conversa(v_c, v_ct, v_canal, v_neg, p_auto.nome);
            v_alvo := v_alvo || jsonb_build_object('conversa_id', v_cv);
          end if;
        end if;
        if v_ct is null then
          v_det := v_det || 'mensagem: pulada (sem contato)'::text;
        elsif coalesce((v_d #>> '{contato,bloqueado}')::boolean, false) then
          v_det := v_det || 'mensagem: pulada (contato bloqueado)'::text;
        elsif v_resolvida then
          v_det := v_det || 'mensagem: pulada (a conversa já foi resolvida)'::text;
        elsif v_cv is null or v_canal is null then
          v_det := v_det || 'mensagem: pulada (sem conversa aberta)'::text;
        elsif public.nx_auto_variavel_vazia(ac ->> 'texto', v_d) is not null then
          v_det := v_det || ('mensagem: pulada (' || public.nx_auto_variavel_vazia(ac ->> 'texto', v_d) || ')');
        else
          v_txt := btrim(public.nx_auto_texto(ac ->> 'texto', v_d));
          if v_txt = '' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'mensagem vazia'; end if;
          v_quando := public.nx_auto_quando(v_c, v_cv, p_auto.respeitar_horario);
          v_ue := (v_d #>> '{conversa,ultima_entrada_em}')::timestamptz;
          if exists (select 1 from public.nx_canais k where k.id = v_canal and k.provedor = 'codewords') then
            -- sem janela no aparelho; quem pediu para sair (SAIR) não recebe texto de automação
            v_ue := case when v_optin is false then null else 'infinity'::timestamptz end;
          end if;
          if v_ue is null or v_quando >= v_ue + interval '24 hours' then
            v_det := v_det || case when v_optin is false then 'mensagem: pulada (contato pediu para não receber)'
                                   else 'mensagem: pulada (fora da janela de 24 h)' end;
          else
            insert into public.nx_envios_fila (cliente_id, conversa_id, contato_id, canal_id, tipo, texto, origem, automacao_id, enviar_em)
            values (v_c, v_cv, v_ct, v_canal, 'texto', left(v_txt, 4096), 'automacao', p_auto.id, v_quando)
            returning id into v_fila;
            v_det := v_det || ('mensagem na fila' || case when v_quando > now() + interval '1 minute'
                                 then ' para ' || to_char(v_quando at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') else '' end);
          end if;
        end if;

      -- -------------------------------------------------- enviar_template (abre conversa se preciso)
      when 'enviar_template' then
        select * into t from public.nx_templates k where k.id = public.nx_auto_uuid(ac ->> 'template_id') and k.cliente_id = v_c;
        v_optin := (v_d #>> '{contato,optin_marketing}')::boolean;
        if t.id is null or upper(coalesce(t.status, '')) <> 'APPROVED' then
          raise exception 'template_invalido' using errcode = '22023', hint = 'o modelo não está aprovado';
        elsif v_ct is null then
          v_det := v_det || 'modelo: pulado (sem contato)'::text;
        elsif coalesce((v_d #>> '{contato,bloqueado}')::boolean, false) then
          v_det := v_det || 'modelo: pulado (contato bloqueado)'::text;
        elsif v_optin is false and upper(coalesce(t.categoria, '')) = 'MARKETING' then
          v_det := v_det || 'modelo: pulado (contato pediu para não receber)'::text;
        elsif coalesce(v_d #>> '{contato,wa_id}', v_d #>> '{contato,telefone}') is null then
          v_det := v_det || 'modelo: pulado (contato sem telefone)'::text;
        else
          v_pars := '[]'::jsonb; v_n := 0;
          for v_raw in select z from jsonb_array_elements_text(coalesce(ac -> 'parametros', '[]'::jsonb)) z loop
            v_n := v_n + 1;
            v_par := btrim(public.nx_auto_texto(v_raw, v_d));
            if v_par = '' then
              raise exception 'template_invalido' using errcode = '22023',
                hint = case when v_raw like '%{hora_consulta}%' then 'a hora da consulta não está marcada'
                            when v_raw like '%{data_consulta}%' then 'a data da consulta não está marcada'
                            else 'o parâmetro ' || v_n || ' ficou vazio' end;
            end if;
            v_pars := v_pars || to_jsonb(left(v_par, 1000));
          end loop;
          if v_n <> coalesce(t.num_parametros, 0) then
            raise exception 'template_invalido' using errcode = '22023', hint = 'o modelo pede ' || coalesce(t.num_parametros, 0) || ' parâmetros';
          end if;
          v_canal := t.canal_id;
          if v_cv is not null and (v_d #>> '{conversa,canal_id}')::uuid = v_canal then
            v_id := null;  -- usa a conversa do alvo
          elsif p_auto.gatilho = 'conversa_resolvida' and (v_d #>> '{conversa,id}') is not null
                and (v_d #>> '{conversa,canal_id}')::uuid = v_canal then
            v_cv := (v_d #>> '{conversa,id}')::bigint;   -- a conversa resolvida: sem atendimento novo a cada resolução
          else
            v_cv := public.nx_auto_abrir_conversa(v_c, v_ct, v_canal, v_neg, p_auto.nome);
          end if;
          v_quando := public.nx_auto_quando(v_c, v_cv, p_auto.respeitar_horario);
          v_txt := coalesce(t.corpo, '');
          for v_n in 1 .. jsonb_array_length(v_pars) loop
            v_txt := replace(v_txt, '{{' || v_n || '}}', v_pars ->> (v_n - 1));
          end loop;
          insert into public.nx_envios_fila (cliente_id, conversa_id, contato_id, canal_id, tipo, template, origem, automacao_id, enviar_em)
          values (v_c, v_cv, v_ct, v_canal, 'template',
                  jsonb_build_object('template_id', t.id, 'nome', t.nome, 'idioma', t.idioma, 'categoria', t.categoria,
                                     'parametros', v_pars, 'corpo', left(v_txt, 4096)),
                  'automacao', p_auto.id, v_quando)
          returning id into v_fila;
          v_alvo := v_alvo || jsonb_build_object('conversa_id', v_cv);
          v_det := v_det || ('modelo «' || t.nome || '» na fila' || case when v_quando > now() + interval '1 minute'
                               then ' para ' || to_char(v_quando at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') else '' end);
        end if;

      -- -------------------------------------------------- atribuir
      when 'atribuir' then
        if coalesce(ac ->> 'dono', '') <> '' then
          -- contrato novo: dono = rodizio | conta | departamento. Vale para o RESPONSÁVEL do negócio e para o
          -- ATENDENTE da conversa aberta (o que existir). Rodízio explícito: quem recebeu há mais tempo.
          v_modo := ac ->> 'dono';
          v_dep := public.nx_auto_uuid(ac ->> 'departamento_id');
          if v_dep is not null and not exists (select 1 from public.nx_departamentos d where d.id = v_dep and d.cliente_id = v_c) then
            raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
          end if;
          if v_neg is null and v_cv is null then
            v_det := v_det || 'atribuir: pulado (sem negócio nem conversa)'::text;
          elsif v_modo = 'departamento' and v_cv is null then
            v_det := v_det || 'atribuir: pulado (sem conversa aberta para mudar de departamento)'::text;
          else
            v_tmp := null;
            if v_cv is not null and v_dep is not null then
              select d.nome into v_nome from public.nx_departamentos d where d.id = v_dep;
              if (v_d #>> '{conversa,departamento_id}')::uuid is distinct from v_dep then
                update public.nx_conversas set departamento_id = v_dep, atualizado_em = now() where id = v_cv;
                perform public.nx_auto_sistema(v_cv, 'Movida para o departamento ' || coalesce(v_nome, '') || ' pela automação «' || p_auto.nome || '»');
              end if;
              v_tmp := 'conversa em «' || coalesce(v_nome, 'departamento') || '»';
            end if;
            v_conta := null;
            if v_modo = 'conta' then
              v_conta := public.nx_auto_uuid(ac ->> 'conta_id');
              if not public.nx_auto_ref_ok(v_c, 'conta', v_conta) then
                raise exception 'dados_invalidos' using errcode = '22023', hint = 'a pessoa não tem mais acesso';
              end if;
            elsif v_modo = 'rodizio' then
              v_conta := public.nx_auto_proximo(v_c, coalesce(v_dep, (v_d #>> '{conversa,departamento_id}')::uuid));
            elsif exists (select 1 from public.nx_departamentos d where d.id = v_dep and d.distribuicao = 'rodizio') then
              v_conta := public.nx_auto_proximo(v_c, v_dep);
            end if;
            if v_conta is null then
              v_det := v_det || coalesce(v_tmp, case when v_modo = 'rodizio' then 'rodízio: ninguém disponível (equipe sem acesso)'
                                                      else 'atribuir: nada a mudar' end);
            else
              select k.nome into v_nome from public.nx_contas k where k.id = v_conta;
              v_nome2 := coalesce(nullif(btrim(v_d #>> '{contato,nome}'), ''), 'contato');
              if v_neg is not null and (v_d #>> '{negocio,dono_id}')::uuid is distinct from v_conta then
                update public.nx_leads set dono_id = v_conta, atualizado_em = now() where id = v_neg and cliente_id = v_c;
                if v_cv is null then
                  perform public.nx_notificar(v_c, v_conta, 'atribuida',
                    left(coalesce(nullif(btrim(v_d #>> '{negocio,titulo}'), ''), nullif(btrim(v_d #>> '{negocio,nome}'), ''),
                                  nullif(btrim(v_d #>> '{contato,nome}'), ''), 'Negócio') || ' atribuído a você', 120),
                    'Pela automação «' || p_auto.nome || '»', '#/crm/negocio/' || v_neg);
                end if;
              end if;
              if v_cv is not null and (v_d #>> '{conversa,atribuida_a}')::uuid is distinct from v_conta then
                update public.nx_conversas set atribuida_a = v_conta, atualizado_em = now() where id = v_cv;
                perform public.nx_auto_sistema(v_cv, 'Atribuída a ' || coalesce(v_nome, 'atendente') || ' pela automação «' || p_auto.nome || '»');
                perform public.nx_notificar(v_c, v_conta, 'atribuida',
                  left('Conversa com ' || v_nome2 || ' atribuída a você', 120),
                  'Pela automação «' || p_auto.nome || '»', '#/conversas/' || v_cv);
              end if;
              update public.nx_acessos set ultima_atribuicao_em = clock_timestamp() where conta_id = v_conta and cliente_id = v_c;
              v_det := v_det || ('atribuído a ' || coalesce(v_nome, 'atendente')
                                 || case when v_neg is not null and v_cv is not null then ' (negócio e conversa)'
                                         when v_neg is not null then ' (negócio)' else ' (conversa)' end
                                 || coalesce(' · ' || v_tmp, ''));
            end if;
          end if;
        else
          -- contrato antigo (modo = rodizio | conta): só a conversa
          if v_cv is null then
            v_det := v_det || 'atribuir: pulado (sem conversa aberta)'::text;
          else
            v_id := public.nx_auto_uuid(ac ->> 'departamento_id');
            if v_id is not null then
              if not exists (select 1 from public.nx_departamentos d where d.id = v_id and d.cliente_id = v_c) then
                raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
              end if;
              update public.nx_conversas set departamento_id = v_id, atualizado_em = now() where id = v_cv and departamento_id is distinct from v_id;
            end if;
            if ac ->> 'modo' = 'conta' then
              v_conta := public.nx_auto_uuid(ac ->> 'conta_id');
              if not public.nx_auto_ref_ok(v_c, 'conta', v_conta) then
                raise exception 'dados_invalidos' using errcode = '22023', hint = 'a pessoa não tem mais acesso';
              end if;
              if (v_d #>> '{conversa,atribuida_a}')::uuid is distinct from v_conta then
                update public.nx_conversas set atribuida_a = v_conta, atualizado_em = now() where id = v_cv;
                update public.nx_acessos set ultima_atribuicao_em = now() where conta_id = v_conta and cliente_id = v_c;
                select k.nome into v_nome from public.nx_contas k where k.id = v_conta;
                perform public.nx_auto_sistema(v_cv, 'Atribuída a ' || coalesce(v_nome, 'atendente') || ' pela automação «' || p_auto.nome || '»');
                perform public.nx_notificar(v_c, v_conta, 'atribuida',
                  left('Conversa com ' || coalesce(nullif(v_d #>> '{contato,nome}', ''), 'contato') || ' atribuída a você', 120),
                  'Pela automação «' || p_auto.nome || '»', '#/conversas/' || v_cv);
              end if;
              v_det := v_det || ('atribuída a ' || coalesce((select k.nome from public.nx_contas k where k.id = v_conta), 'atendente'));
            else
              if to_regprocedure('public.nx_cv_distribuir(bigint)') is null then
                raise exception 'rodizio_indisponivel' using errcode = '22023';
              end if;
              v_conta := public.nx_cv_distribuir(v_cv);
              v_det := v_det || case when v_conta is null then 'rodízio: ninguém disponível (departamento sem rodízio ou equipe sem acesso)'
                                     else 'atribuída a ' || coalesce((select k.nome from public.nx_contas k where k.id = v_conta), 'atendente') end;
            end if;
          end if;
        end if;

      -- -------------------------------------------------- etiquetar
      when 'etiquetar' then
        v_id := public.nx_auto_uuid(ac ->> 'etiqueta_id');
        select k.nome into v_nome from public.nx_etiquetas k where k.id = v_id and k.cliente_id = v_c;
        if v_nome is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'a etiqueta não existe mais'; end if;
        if ac ->> 'alvo' = 'conversa' then
          if v_cv is null then
            v_det := v_det || 'etiqueta: pulada (sem conversa aberta)'::text;
          else
            update public.nx_conversas set
              etiquetas = case when coalesce((ac ->> 'remover')::boolean, false) then array_remove(etiquetas, v_id)
                               when v_id = any(etiquetas) then etiquetas else etiquetas || v_id end,
              atualizado_em = now()
             where id = v_cv;
            v_det := v_det || (case when coalesce((ac ->> 'remover')::boolean, false) then 'etiqueta «' || v_nome || '» tirada da conversa'
                                    else 'etiqueta «' || v_nome || '» na conversa' end);
          end if;
        else
          if v_ct is null then
            v_det := v_det || 'etiqueta: pulada (sem contato)'::text;
          else
            update public.nx_contatos set
              etiquetas = case when coalesce((ac ->> 'remover')::boolean, false) then array_remove(etiquetas, v_id)
                               when v_id = any(etiquetas) then etiquetas else etiquetas || v_id end
             where id = v_ct and cliente_id = v_c;
            v_det := v_det || (case when coalesce((ac ->> 'remover')::boolean, false) then 'etiqueta «' || v_nome || '» tirada do contato'
                                    else 'etiqueta «' || v_nome || '» no contato' end);
          end if;
        end if;

      -- -------------------------------------------------- etiqueta_adicionar / etiqueta_remover
      -- no NEGÓCIO (se houver) ou, sem negócio, no contato
      when 'etiqueta_adicionar', 'etiqueta_remover' then
        v_id := public.nx_auto_uuid(ac ->> 'etiqueta_id');
        select k.nome into v_nome from public.nx_etiquetas k where k.id = v_id and k.cliente_id = v_c;
        if v_nome is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'a etiqueta não existe mais'; end if;
        v_rem := v_tipo = 'etiqueta_remover';
        if v_neg is not null then
          update public.nx_leads set
            etiquetas = case when v_rem then array_remove(etiquetas, v_id)
                             when v_id = any(etiquetas) then etiquetas else etiquetas || v_id end,
            atualizado_em = now()
           where id = v_neg and cliente_id = v_c;
          v_det := v_det || (case when v_rem then 'etiqueta «' || v_nome || '» tirada do negócio'
                                  else 'etiqueta «' || v_nome || '» no negócio' end);
        elsif v_ct is not null then
          update public.nx_contatos set
            etiquetas = case when v_rem then array_remove(etiquetas, v_id)
                             when v_id = any(etiquetas) then etiquetas else etiquetas || v_id end
           where id = v_ct and cliente_id = v_c;
          v_det := v_det || (case when v_rem then 'etiqueta «' || v_nome || '» tirada do contato'
                                  else 'etiqueta «' || v_nome || '» no contato' end);
        else
          v_det := v_det || 'etiqueta: pulada (sem negócio nem contato)'::text;
        end if;

      -- -------------------------------------------------- campo_atualizar
      -- campo personalizado do contato ou do negócio (nx_campos) ou o «score» (0–100) do negócio
      when 'campo_atualizar' then
        v_campo := btrim(coalesce(ac ->> 'campo', ''));
        select * into fk from public.nx_campos k
         where k.cliente_id = v_c and k.chave = v_campo and k.ativo and k.entidade in ('contato', 'negocio')
         order by (k.entidade = 'contato') desc limit 1;
        if fk.id is null and v_campo <> 'score' then
          raise exception 'dados_invalidos' using errcode = '22023', hint = 'o campo não existe mais';
        end if;
        v_txt := left(btrim(public.nx_auto_texto(ac ->> 'valor', v_d)), 200);
        if v_txt = '' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'o valor ficou vazio'; end if;
        if fk.id is null then            -- score
          if v_txt !~ '^[0-9]{1,3}$' or v_txt::int > 100 then
            raise exception 'dados_invalidos' using errcode = '22023', hint = 'o score vai de 0 a 100';
          end if;
          v_val := to_jsonb(v_txt::int);
        else
          -- o MESMO validador do CRM (nx_crm_campo_valor): «R$ 1.234,56» e «1.500,50» viram número, data inexistente
          -- («2026-13-45», «31/02/2026») e link/e-mail/telefone inválidos são recusados
          v_val := case when fk.tipo = 'multi' then null
                        else public.nx_crm_campo_valor(fk.tipo, fk.opcoes, v_txt) end;
          if v_val is null then
            raise exception 'dados_invalidos' using errcode = '22023',
              hint = case fk.tipo when 'numero' then 'o valor não é um número' when 'moeda' then 'o valor não é um número'
                                  when 'sim_nao' then 'o valor precisa ser sim ou não' when 'data' then 'a data precisa ser AAAA-MM-DD ou DD/MM/AAAA'
                                  when 'opcao' then 'o valor não está entre as opções do campo'
                                  when 'url' then 'o link não é válido (use http:// ou https://)'
                                  when 'email' then 'o e-mail não é válido'
                                  when 'telefone' then 'o telefone não é válido'
                                  else 'esse tipo de campo não pode ser preenchido por automação' end;
          end if;
        end if;
        if fk.id is null or fk.entidade = 'negocio' then
          if v_neg is null then
            v_det := v_det || 'campo: pulado (sem negócio)'::text;
          else
            update public.nx_leads set campos = coalesce(campos, '{}'::jsonb) || jsonb_build_object(v_campo, v_val), atualizado_em = now()
             where id = v_neg and cliente_id = v_c;
            v_det := v_det || ('campo «' || v_campo || '» = ' || (v_val #>> '{}'));
          end if;
        else
          if v_ct is null then
            v_det := v_det || 'campo: pulado (sem contato)'::text;
          else
            update public.nx_contatos set campos = coalesce(campos, '{}'::jsonb) || jsonb_build_object(v_campo, v_val), atualizado_em = now()
             where id = v_ct and cliente_id = v_c;
            v_det := v_det || ('campo «' || v_campo || '» = ' || (v_val #>> '{}'));
          end if;
        end if;

      -- -------------------------------------------------- nota (histórico do negócio, ou do contato)
      when 'nota' then
        v_txt := left(btrim(public.nx_auto_texto(ac ->> 'texto', v_d)), 1000);
        if v_txt = '' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'a nota ficou vazia'; end if;
        if v_ct is null and v_neg is null then
          v_det := v_det || 'nota: pulada (sem contato nem negócio)'::text;
        else
          insert into public.nx_notas (cliente_id, contato_id, negocio_id, autor_id, texto)
          values (v_c, v_ct, v_neg, null, 'Automação «' || p_auto.nome || '»: ' || v_txt);
          v_det := v_det || ('nota «' || left(v_txt, 60) || case when char_length(v_txt) > 60 then '…' else '' end || '»');
        end if;

      -- -------------------------------------------------- notificar
      when 'notificar' then
        v_ntipo := case p_auto.gatilho when 'sem_resposta' then 'sem_resposta' when 'tarefa_vencida' then 'tarefa' else 'automacao' end;
        v_link := case
          when p_auto.gatilho = 'conversa_resolvida' and (v_d #>> '{conversa,id}') is not null then '#/conversas/' || (v_d #>> '{conversa,id}')
          when v_conversa_primeiro and v_cv is not null then '#/conversas/' || v_cv
          when v_neg is not null then '#/crm/negocio/' || v_neg
          when v_cv is not null then '#/conversas/' || v_cv
          when v_ct is not null then '#/contatos/' || v_ct
          when p_auto.gatilho = 'tarefa_vencida' then '#/tarefas' end;
        -- título e detalhe; só o texto (sem título) vira o título
        v_titulo := nullif(btrim(public.nx_auto_texto(ac ->> 'titulo', v_d)), '');
        v_txt := nullif(left(btrim(public.nx_auto_texto(ac ->> 'texto', v_d)), 500), '');
        if v_titulo is null and v_txt is not null then
          v_titulo := left(v_txt, 120);
          if char_length(v_txt) <= 120 then v_txt := null; end if;
        end if;
        v_titulo := left(coalesce(v_titulo, p_auto.nome), 120);
        if ac ->> 'para' = 'departamento' then
          v_dep := public.nx_auto_uuid(ac ->> 'departamento_id');
          if v_dep is null or not exists (select 1 from public.nx_departamentos d where d.id = v_dep and d.cliente_id = v_c) then
            raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
          end if;
          v_n := 0;
          for v_conta in
            select a.conta_id from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
             where a.cliente_id = v_c and k.aprovado and a.papel in ('atendente', 'supervisor', 'admin')
               and (cardinality(a.departamentos) = 0 or v_dep = any(a.departamentos))
          loop
            v_n := v_n + public.nx_notificar(v_c, v_conta, v_ntipo, v_titulo, v_txt, v_link);
          end loop;
          if v_n = 0 then v_n := public.nx_notificar(v_c, null, v_ntipo, v_titulo, v_txt, v_link); end if;
          v_conta := null;
          v_det := v_det || case when v_n = 0 then 'aviso: ninguém recebeu (sem pessoa com acesso)'
                                 when v_n = 1 then 'aviso para 1 pessoa do departamento'
                                 else 'aviso para ' || v_n || ' pessoas do departamento' end;
        else
          v_conta := case ac ->> 'para'
            when 'responsavel' then coalesce((v_d #>> '{negocio,dono_id}')::uuid, (v_d #>> '{conversa,atribuida_a}')::uuid, (v_d #>> '{contato,dono_id}')::uuid)
            when 'admins' then null
            else public.nx_auto_uuid(ac ->> 'para') end;
          v_n := public.nx_notificar(v_c, v_conta, v_ntipo, v_titulo, v_txt, v_link);
          -- responsável sem acesso ao cliente (ou sem responsável: v_conta nulo já vai aos admins) → admins
          if v_n = 0 and v_conta is not null and ac ->> 'para' = 'responsavel' then
            v_conta := null;
            v_n := public.nx_notificar(v_c, null, v_ntipo, v_titulo, v_txt, v_link);
          end if;
          v_det := v_det || case
            when v_n = 0 then 'aviso: ninguém recebeu (sem pessoa com acesso)'
            when v_conta is not null then 'aviso para ' || coalesce((select k.nome from public.nx_contas k where k.id = v_conta), 'a pessoa')
            when v_n = 1 then 'aviso para 1 pessoa'
            else 'aviso para ' || v_n || ' pessoas' end;
        end if;

      -- -------------------------------------------------- resolver_conversa
      when 'resolver_conversa' then
        if v_cv is null then
          v_det := v_det || 'resolver: pulado (sem conversa aberta)'::text;
        else
          update public.nx_conversas set status = 'resolvida', resolvida_em = now(), aguardando = false, atualizado_em = now()
           where id = v_cv and status <> 'resolvida';
          perform public.nx_auto_sistema(v_cv, 'Atendimento ' || coalesce(v_d #>> '{conversa,protocolo}', '') || ' resolvido pela automação «' || p_auto.nome || '»');
          v_det := v_det || 'conversa resolvida'::text;
        end if;

      -- -------------------------------------------------- alerta_whatsapp (P1: depende do modo alerta da nx-enviar, F2)
      -- só a agência (gestor/super) salva esta ação (nx_automacao_salvar) e ela tem teto por hora:
      -- sai pelo número da Nexus para o WhatsApp do gestor — uma automação de "mensagem recebida"
      -- não pode virar enxurrada nesse número
      when 'alerta_whatsapp' then
        if p_sim then
          v_det := v_det || 'alerta ao WhatsApp do gestor (na simulação não é enviado)'::text;
        -- execuções ok desta automação na última hora que não pularam o alerta (o detalhe pode vir cortado)
        elsif (select count(*) from public.nx_auto_execucoes x
             where x.automacao_id = p_auto.id and x.criado_em > now() - interval '1 hour' and x.ok
               and x.detalhe not like '%alerta: pulado%' and x.detalhe <> 'Condições não atendidas — nada feito.') >= 20 then
          v_det := v_det || 'alerta: pulado (limite de 20 por hora desta automação)'::text;
        else
          v_txt := left(btrim(public.nx_auto_texto(ac ->> 'texto', v_d)), 1000);
          perform public.nx_disparar('nx-enviar', jsonb_build_object('alerta', jsonb_build_object('cliente', v_c, 'texto', v_txt)));
          v_det := v_det || 'alerta pedido ao WhatsApp do gestor'::text;
        end if;

      -- -------------------------------------------------- esperar (passo de sequência)
      when 'esperar' then
        v_esp := public.nx_auto_int(ac -> 'minutos');
        if v_esp is null or v_esp not between 1 and 43200 then
          raise exception 'dados_invalidos' using errcode = '22023', hint = 'o tempo de espera vai de 1 a 43200 minutos';
        end if;
        v_canc := coalesce(ac ->> 'cancelar_se_cliente_responder', 'true') <> 'false';
        v_det := v_det || ('aguarda ' || public.nx_auto_dur(v_esp) || case when v_canc then ' (para se o cliente responder)' else '' end);
        if p_sim then
          v_acum := v_acum + v_esp;
        elsif i < v_total then
          v_prox := i;      -- índice (0 = a primeira) da próxima ação
        end if;

      -- -------------------------------------------------- parar (encerra a sequência deste alvo)
      when 'parar' then
        v_parou := true;
        v_parou_em := i;
        v_det := v_det || 'sequência encerrada aqui'::text;

      -- -------------------------------------------------- ia_decidir (a nx-ia responde; o resultado é aplicado por nx_auto_ia_resolver)
      when 'ia_decidir' then
        v_tarefa := ac ->> 'tarefa';
        if v_tarefa is null or v_tarefa not in ('classificar_etapa', 'resumir_nota', 'pontuar_lead') then
          raise exception 'dados_invalidos' using errcode = '22023', hint = 'a tarefa da IA';
        end if;
        v_tmp := case v_tarefa when 'classificar_etapa' then 'classificar a etapa' when 'resumir_nota' then 'resumir a conversa'
                               else 'pontuar o lead' end;
        if p_sim then
          v_det := v_det || case v_tarefa
            when 'classificar_etapa' then 'a IA escolheria a etapa'
              || coalesce(' entre: ' || (select string_agg(s.nome, ', ' order by s.ordem) from public.nx_estagios s
                                          where s.cliente_id = v_c and s.funil_id = (v_d #>> '{negocio,funil_id}')::uuid and s.tipo <> 'ganho'), '')
            when 'resumir_nota' then 'a IA escreveria um resumo da conversa como nota'
            else 'a IA daria uma nota de 0 a 100 ao lead' end;
        elsif not public.nx_auto_ia_ligada() then
          v_det := v_det || 'IA: pulado (a IA ainda não está configurada)'::text;
        elsif public.nx_limite(v_c, 'ia_mes') is not null and public.nx_uso(v_c, 'ia_mes') >= public.nx_limite(v_c, 'ia_mes') then
          v_det := v_det || 'IA: pulado (a cota de IA do mês acabou)'::text;
        elsif v_tarefa in ('classificar_etapa', 'pontuar_lead') and v_neg is null then
          v_det := v_det || 'IA: pulado (sem negócio)'::text;
        elsif v_tarefa = 'classificar_etapa' and coalesce(v_d #>> '{negocio,status}', 'aberto') <> 'aberto' then
          v_det := v_det || 'IA: pulado (o negócio já está fechado)'::text;
        elsif v_tarefa = 'resumir_nota' and (v_ct is null or not exists (
                select 1 from public.nx_mensagens m where m.cliente_id = v_c and m.contato_id = v_ct and m.tipo not in ('nota', 'sistema'))) then
          v_det := v_det || 'IA: pulado (sem conversa para resumir)'::text;
        elsif exists (select 1 from public.nx_auto_ia_pedidos q
                       where q.automacao_id = p_auto.id and q.tarefa = v_tarefa and q.status in ('pendente', 'processando')
                         and q.alvo ->> 'negocio_id' is not distinct from v_neg::text
                         and q.alvo ->> 'contato_id' is not distinct from v_ct::text) then
          v_det := v_det || 'IA: pulado (já está em análise)'::text;
        elsif (select count(*) from public.nx_auto_ia_pedidos q where q.cliente_id = v_c and q.status in ('pendente', 'processando')) >= 200 then
          v_det := v_det || 'IA: pulado (fila de decisões cheia)'::text;
        else
          insert into public.nx_auto_ia_pedidos (cliente_id, automacao_id, tarefa, instrucao, alvo)
          values (v_c, p_auto.id, v_tarefa, nullif(left(btrim(coalesce(ac ->> 'instrucao', '')), 500), ''),
                  jsonb_strip_nulls(jsonb_build_object('negocio_id', v_neg, 'contato_id', v_ct, 'conversa_id', (v_d #>> '{conversa,id}')::bigint)))
          returning id into v_ped;
          v_det := v_det || ('IA pedida: ' || v_tmp);
          v_prox := i;      -- a sequência espera a resposta da IA (mesmo que seja o último passo)
        end if;

      else
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'ação desconhecida';
      end case;
    exception when others then
      get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint, v_st = returned_sqlstate;
      raise exception using message = v_msg, hint = coalesce(v_hint, ''), detail = 'acao:' || i || ':' || coalesce(v_tipo, '?'), errcode = v_st;
    end;

    v_tmp := case when cardinality(v_det) > v_n0 then array_to_string(v_det[v_n0 + 1 : cardinality(v_det)], ' · ') else '' end;
    v_pas := v_pas || jsonb_build_array(jsonb_build_object('n', i, 'tipo', v_tipo, 'texto', v_tmp,
               'pulado', position('pulad' in lower(v_tmp)) > 0, 'depois_min', v_ini));
    exit when v_prox is not null or v_parou;
  end loop;
  return jsonb_build_object('detalhe', array_to_string(v_det, ' · '), 'passos', v_pas, 'proximo', v_prox,
                            'esperar_min', v_esp, 'cancelar_se_responder', v_canc, 'parou', v_parou,
                            'pedido', v_ped, 'alvo', v_alvo, 'total', v_total, 'parou_em', v_parou_em);
end $$;

-- ------------------------------------------------------------
-- 12. nx_auto_rodar / nx_auto_continuar: «parou» mostra o passo certo; a resposta do cliente antes da sequência cancela; erro conta como execução (baixa · T05)
-- ------------------------------------------------------------
create or replace function public.nx_auto_rodar(p_auto public.nx_automacoes, p_ref jsonb, p_chave text,
                                                p_evento bigint, p_prof int, p_tempo boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alvo jsonb; v_d jsonb; v_det text; v_quem text; v_r jsonb; v_estado text; v_total int; v_prox int;
  v_msg text; v_hint text; v_detalhe text;
begin
  if exists (select 1 from public.nx_auto_execucoes x where x.automacao_id = p_auto.id and x.chave = p_chave) then
    return 'repetido';
  end if;
  begin
    v_alvo := public.nx_auto_alvo(p_auto.cliente_id, p_ref);
    v_d := public.nx_auto_dados(p_auto.cliente_id, v_alvo);
    if not public.nx_auto_condicoes(p_auto.condicoes, v_d) then
      if p_tempo then
        insert into public.nx_auto_execucoes (automacao_id, cliente_id, evento_id, chave, ok, detalhe)
        values (p_auto.id, p_auto.cliente_id, p_evento, p_chave, true, 'Condições não atendidas — nada feito.')
        on conflict (automacao_id, chave) do nothing;
      end if;
      return 'pulou';
    end if;
    perform set_config('nx.automacao', p_auto.id::text, true);
    perform set_config('nx.profundidade', (coalesce(p_prof, 0) + 1)::text, true);
    v_r := public.nx_auto_passos(p_auto, p_auto.acoes, v_alvo, 0, false);
    v_det := v_r ->> 'detalhe';
    v_alvo := v_r -> 'alvo';
    v_total := (v_r ->> 'total')::int;
    v_prox := (v_r ->> 'proximo')::int;
    v_quem := coalesce(nullif(btrim(v_d #>> '{contato,nome}'), ''), nullif(btrim(v_d #>> '{negocio,nome}'), ''),
                       nullif(btrim(v_d #>> '{tarefa,titulo}'), ''));
    v_estado := case when (v_r ->> 'pedido') is not null then 'aguardando_ia'
                     when v_prox is not null then 'esperando'
                     when coalesce((v_r ->> 'parou')::boolean, false) then 'parada'
                     else 'concluida' end;
    insert into public.nx_auto_execucoes (automacao_id, cliente_id, evento_id, chave, ok, detalhe, estado, passo, total_passos, atualizado_em)
    values (p_auto.id, p_auto.cliente_id, p_evento, p_chave, true,
            left(coalesce(v_quem || ': ', '') || coalesce(nullif(v_det, ''), 'nada a fazer'), 1000),
            v_estado, case when v_estado = 'parada' then coalesce((v_r ->> 'parou_em')::int, v_total) else coalesce(v_prox, v_total) end,
            v_total, now())
    on conflict (automacao_id, chave) do nothing;
    if v_estado in ('esperando', 'aguardando_ia') then
      insert into public.nx_auto_sequencias (automacao_id, cliente_id, chave, contato_id, alvo, acoes, passo, continuar_em,
                                             cancelar_se_responder, pedido_id, status, profundidade, estagio_ref)
      values (p_auto.id, p_auto.cliente_id, p_chave, nullif(v_alvo ->> 'contato_id', '')::bigint, v_alvo, p_auto.acoes,
              coalesce(v_prox, v_total),
              case when v_estado = 'esperando' then now() + make_interval(mins => (v_r ->> 'esperar_min')::int) end,
              coalesce((v_r ->> 'cancelar_se_responder')::boolean, true), (v_r ->> 'pedido')::bigint,
              v_estado, coalesce(p_prof, 0), public.nx_auto_estagio_do_alvo(p_auto.cliente_id, v_alvo))
      on conflict (automacao_id, chave) do nothing;
    end if;
    -- a resposta do cliente que chegou ENTRE o gatilho e o início da sequência (o motor leva alguns segundos) também cancela:
    -- mensagem_recebida compara pelo id da mensagem do gatilho; os demais gatilhos, pelo horário do evento
    if v_estado = 'esperando' and coalesce((v_r ->> 'cancelar_se_responder')::boolean, true)
       and p_evento is not null and nullif(v_alvo ->> 'contato_id', '') is not null
       and exists (select 1 from public.nx_mensagens m
                    where m.cliente_id = p_auto.cliente_id and m.contato_id = (v_alvo ->> 'contato_id')::bigint
                      and m.direcao = 'in' and m.tipo not in ('sistema', 'nota')
                      and case when (p_ref ->> 'mensagem_id') ~ '^[0-9]{1,18}$' then m.id > (p_ref ->> 'mensagem_id')::bigint
                               else m.criado_em > (select ev.criado_em from public.nx_eventos ev where ev.id = p_evento) end) then
      update public.nx_auto_sequencias set status = 'cancelada', motivo = 'o cliente respondeu', atualizado_em = now()
       where automacao_id = p_auto.id and chave = p_chave and status = 'esperando';
      update public.nx_auto_execucoes x set estado = 'cancelada', atualizado_em = now(),
             detalhe = left(coalesce(x.detalhe, '') || ' · cancelada: o cliente respondeu', 1000)
       where x.automacao_id = p_auto.id and x.chave = p_chave;
    end if;
    update public.nx_automacoes set execucoes = execucoes + 1, ultima_execucao_em = now() where id = p_auto.id;
    if (v_alvo ->> 'contato_id') is not null or (v_alvo ->> 'negocio_id') is not null then
      perform public.nx_historico_add(p_auto.cliente_id, 'automacao', (v_alvo ->> 'contato_id')::bigint,
        (v_alvo ->> 'negocio_id')::bigint, (v_alvo ->> 'conversa_id')::bigint,
        jsonb_build_object('automacao_id', p_auto.id, 'nome', p_auto.nome, 'detalhe', left(v_det, 500)));
    end if;
    perform set_config('nx.automacao', '', true);
    perform set_config('nx.profundidade', '', true);
    return 'ok';
  exception
    when lock_not_available then
      return 'pendente';
    when others then
      get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint, v_detalhe = pg_exception_detail;
      insert into public.nx_auto_execucoes (automacao_id, cliente_id, evento_id, chave, ok, detalhe, estado, atualizado_em)
      values (p_auto.id, p_auto.cliente_id, p_evento, p_chave, false,
              left(public.nx_auto_erro_texto(v_msg, v_hint, v_detalhe), 1000), 'erro', now())
      on conflict (automacao_id, chave) do nothing;
      -- a execução com erro também tem linha na lista: conta em «execuções» e em «erros»
      update public.nx_automacoes set execucoes = execucoes + 1, erros = erros + 1, ultima_execucao_em = now() where id = p_auto.id;
      return 'erro';
  end;
end $$;

create or replace function public.nx_auto_continuar(p_seq public.nx_auto_sequencias)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.nx_automacoes; v_alvo jsonb; v_r jsonb; v_det text; v_prox int; v_total int; v_estado text; v_erro text;
  v_msg text; v_hint text; v_detalhe text;
  v_neg bigint; v_nstatus text; v_nest uuid; v_motivo text;
begin
  select * into a from public.nx_automacoes x where x.id = p_seq.automacao_id;
  if a.id is null or not a.ativo then
    update public.nx_auto_sequencias set status = 'cancelada', motivo = 'a automação foi desligada', atualizado_em = now()
     where id = p_seq.id;
    update public.nx_auto_execucoes x set estado = 'cancelada', atualizado_em = now(),
           detalhe = left(coalesce(x.detalhe, '') || ' · cancelada: a automação foi desligada', 1000)
     where x.automacao_id = p_seq.automacao_id and x.chave = p_seq.chave;
    return 'cancelada';
  end if;
  -- o negócio mudou enquanto a sequência esperava? Quem fechou por telefone não pode receber «ficou alguma dúvida sobre o
  -- orçamento?». Nas automações de etapa (negocio_estagio / tempo_no_estagio) vale a ETAPA de quando a sequência parou
  -- (estagio_ref): ganhar ou perder é mudar de etapa, e a própria sequência pode mover o negócio sem se cancelar. Nas de
  -- negócio aberto sem etapa (negocio_criado, antes_da_data, agendado) vale o status. Automações de ganho/perdido, de
  -- conversa, de tarefa e de «depois da data» não passam por aqui.
  v_neg := case when (p_seq.alvo ->> 'negocio_id') ~ '^[0-9]{1,18}$' then (p_seq.alvo ->> 'negocio_id')::bigint end;
  if v_neg is not null and a.gatilho in ('negocio_criado', 'negocio_estagio', 'tempo_no_estagio', 'antes_da_data', 'agendado') then
    select l.status, l.estagio_id into v_nstatus, v_nest from public.nx_leads l
     where l.id = v_neg and l.cliente_id = p_seq.cliente_id;
    if not found then
      v_motivo := 'o negócio não existe mais';
    elsif a.gatilho in ('negocio_estagio', 'tempo_no_estagio') then
      if p_seq.estagio_ref is not null and v_nest is distinct from p_seq.estagio_ref then
        v_motivo := 'o negócio mudou de etapa';
      end if;
    elsif v_nstatus = 'ganho' then
      v_motivo := 'o negócio foi ganho';
    elsif v_nstatus = 'perdido' then
      v_motivo := 'o negócio foi perdido';
    end if;
    if v_motivo is not null then
      update public.nx_auto_sequencias set status = 'cancelada', motivo = v_motivo, pedido_id = null, atualizado_em = now()
       where id = p_seq.id;
      update public.nx_auto_execucoes x set estado = 'cancelada', atualizado_em = now(),
             detalhe = left(coalesce(x.detalhe, '') || ' · cancelada: ' || v_motivo, 1000)
       where x.automacao_id = p_seq.automacao_id and x.chave = p_seq.chave;
      return 'cancelada';
    end if;
  end if;
  begin
    perform set_config('nx.automacao', a.id::text, true);
    perform set_config('nx.profundidade', (coalesce(p_seq.profundidade, 0) + 1)::text, true);
    v_alvo := public.nx_auto_alvo(p_seq.cliente_id, p_seq.alvo);
    v_r := public.nx_auto_passos(a, p_seq.acoes, v_alvo, p_seq.passo, false);
    v_det := v_r ->> 'detalhe';
    v_alvo := v_r -> 'alvo';
    v_total := (v_r ->> 'total')::int;
    v_prox := (v_r ->> 'proximo')::int;
    v_estado := case when (v_r ->> 'pedido') is not null then 'aguardando_ia'
                     when v_prox is not null then 'esperando'
                     when coalesce((v_r ->> 'parou')::boolean, false) then 'parada'
                     else 'concluida' end;
    update public.nx_auto_execucoes x set estado = v_estado,
           passo = case when v_estado = 'parada' then coalesce((v_r ->> 'parou_em')::int, v_total) else coalesce(v_prox, v_total) end,
           atualizado_em = now(),
           detalhe = left(coalesce(x.detalhe, '') || coalesce(' · ' || nullif(v_det, ''), ''), 1000)
     where x.automacao_id = p_seq.automacao_id and x.chave = p_seq.chave;
    update public.nx_auto_sequencias set
      alvo = v_alvo, atualizado_em = now(), passo = coalesce(v_prox, v_total),
      status = case v_estado when 'esperando' then 'esperando' when 'aguardando_ia' then 'aguardando_ia' else 'concluida' end,
      continuar_em = case when v_estado = 'esperando' then now() + make_interval(mins => (v_r ->> 'esperar_min')::int) end,
      cancelar_se_responder = case when v_estado = 'esperando' then coalesce((v_r ->> 'cancelar_se_responder')::boolean, true)
                                   else cancelar_se_responder end,
      estagio_ref = case when v_estado = 'esperando' then public.nx_auto_estagio_do_alvo(p_seq.cliente_id, v_alvo) else estagio_ref end,
      pedido_id = (v_r ->> 'pedido')::bigint,
      motivo = case when v_estado = 'parada' then 'a sequência foi encerrada pelo passo «parar»' else null end
     where id = p_seq.id;
    if (v_alvo ->> 'contato_id') is not null or (v_alvo ->> 'negocio_id') is not null then
      perform public.nx_historico_add(p_seq.cliente_id, 'automacao', (v_alvo ->> 'contato_id')::bigint,
        (v_alvo ->> 'negocio_id')::bigint, (v_alvo ->> 'conversa_id')::bigint,
        jsonb_build_object('automacao_id', a.id, 'nome', a.nome, 'detalhe', left(v_det, 500)));
    end if;
    perform set_config('nx.automacao', '', true);
    perform set_config('nx.profundidade', '', true);
    return 'ok';
  exception
    when lock_not_available then
      return 'pendente';
    when others then
      get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint, v_detalhe = pg_exception_detail;
      v_erro := public.nx_auto_erro_texto(v_msg, v_hint, v_detalhe);
      update public.nx_auto_sequencias set status = 'erro', motivo = left(v_erro, 300), pedido_id = null, atualizado_em = now()
       where id = p_seq.id;
      update public.nx_auto_execucoes x set ok = false, estado = 'erro', atualizado_em = now(),
             detalhe = left(coalesce(x.detalhe, '') || ' · ' || v_erro, 1000)
       where x.automacao_id = p_seq.automacao_id and x.chave = p_seq.chave;
      update public.nx_automacoes set erros = erros + 1, ultima_execucao_em = now() where id = a.id;
      return 'erro';
  end;
end $$;

-- ------------------------------------------------------------
-- 13. tempo_no_estagio: uma vez por entrada na etapa, mesmo depois de 60 dias (média · T05/T10)
-- ------------------------------------------------------------
-- a chave de deduplicação mora em nx_auto_execucoes, que a faxina apaga com 60 dias: um negócio parado na mesma etapa
-- voltava a casar e a automação (follow-up/reativação) repetia a cada ~60 dias. Agora o gatilho só olha negócios que
-- passaram do prazo nos últimos 30 dias (janela como a dos demais gatilhos de tempo): bem antes da faxina da chave.
-- Efeito bom: ligar a automação não dispara de uma vez para todo o estoque parado há meses.

create or replace function public.nx_auto_alvos_tempo(p_auto public.nx_automacoes, p_lim int)
returns table (chave text, ref jsonb)
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  c jsonb := coalesce(p_auto.config, '{}'::jsonb);
  v_min int; v_h int; v_dep uuid; v_est uuid; v_funil uuid; v_so boolean; v_hpad jsonb; v_hor time; v_dias int[];
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  case p_auto.gatilho
  when 'sem_resposta' then
    v_min := greatest(coalesce(public.nx_auto_int(c -> 'minutos'), 15), 5);
    v_dep := public.nx_auto_uuid(c ->> 'departamento_id');
    v_so := coalesce(c ->> 'so_no_horario', 'false') = 'true';
    select d.horario into v_hpad from public.nx_departamentos d where d.cliente_id = p_auto.cliente_id and d.padrao;
    return query
      select 'sr:' || cv.id || ':' || floor(extract(epoch from cv.ultima_entrada_em))::bigint,
             jsonb_build_object('conversa_id', cv.id, 'contato_id', cv.contato_id)
        from public.nx_conversas cv
        left join public.nx_departamentos d on d.id = cv.departamento_id
       where cv.cliente_id = p_auto.cliente_id and cv.status = 'aberta' and cv.aguardando and not cv.oculta
         and cv.ultima_entrada_em < now() - make_interval(mins => v_min)
         -- janela de 1 dia além do prazo: ligar a automação não dispara para conversas esquecidas há semanas
         and cv.ultima_entrada_em > now() - make_interval(mins => v_min + 1440)
         and (v_dep is null or cv.departamento_id = v_dep)
         and (not v_so or public.nx_horario_aberto(case when cv.departamento_id is null then v_hpad else d.horario end, now()))
         and not exists (select 1 from public.nx_auto_execucoes x
                          where x.automacao_id = p_auto.id
                            and x.chave = 'sr:' || cv.id || ':' || floor(extract(epoch from cv.ultima_entrada_em))::bigint)
       order by cv.ultima_entrada_em
       limit p_lim;
  when 'tempo_no_estagio' then
    v_est := public.nx_auto_uuid(c ->> 'estagio_id');
    v_h := greatest(coalesce(public.nx_auto_int(c -> 'horas'), 48), 1);
    return query
      select 'te:' || l.id || ':' || l.estagio_id || ':' || floor(extract(epoch from l.estagio_em))::bigint,
             jsonb_build_object('negocio_id', l.id, 'contato_id', l.contato_id)
        from public.nx_leads l
       where l.cliente_id = p_auto.cliente_id and l.estagio_id = v_est and l.status = 'aberto'
         and l.estagio_em < now() - make_interval(hours => v_h)
         and l.estagio_em > now() - make_interval(hours => v_h) - interval '30 days'
         and not exists (select 1 from public.nx_auto_execucoes x
                          where x.automacao_id = p_auto.id
                            and x.chave = 'te:' || l.id || ':' || l.estagio_id || ':' || floor(extract(epoch from l.estagio_em))::bigint)
       order by l.estagio_em
       limit p_lim;
  when 'tarefa_vencida' then
    return query
      select 'tv:' || t.id, jsonb_build_object('tarefa_id', t.id, 'negocio_id', t.negocio_id, 'contato_id', t.contato_id)
        from public.nx_tarefas t
       where t.cliente_id = p_auto.cliente_id and t.concluida_em is null
         and t.vence_em < now() and t.vence_em > now() - interval '7 days'
         -- anti-laço: tarefa criada por automação de "tarefa vencida" não dispara outra
         and not exists (select 1 from public.nx_automacoes a2 where a2.id = t.automacao_id and a2.gatilho = 'tarefa_vencida')
         and not exists (select 1 from public.nx_auto_execucoes x where x.automacao_id = p_auto.id and x.chave = 'tv:' || t.id)
       order by t.vence_em
       limit p_lim;
  when 'antes_da_data' then
    v_h := least(greatest(coalesce(public.nx_auto_int(c -> 'horas'), 24), 1), 72);
    v_funil := public.nx_auto_uuid(c ->> 'funil_id');
    if c ->> 'campo' = 'previsao_fechamento' then
      return query
        select 'ad:' || s.id || ':' || floor(extract(epoch from s.alvo))::bigint,
               jsonb_build_object('negocio_id', s.id, 'contato_id', s.contato_id)
          from (select l.id, l.contato_id, ((l.previsao_fechamento + time '09:00') at time zone 'America/Sao_Paulo') as alvo
                  from public.nx_leads l
                 where l.cliente_id = p_auto.cliente_id and l.status = 'aberto'
                   and l.previsao_fechamento between v_hoje and v_hoje + (v_h / 24 + 1)
                   and (v_funil is null or l.funil_id = v_funil)) s
         where s.alvo > now() and s.alvo <= now() + make_interval(hours => v_h)
           and not exists (select 1 from public.nx_auto_execucoes x
                            where x.automacao_id = p_auto.id and x.chave = 'ad:' || s.id || ':' || floor(extract(epoch from s.alvo))::bigint)
         order by s.alvo
         limit p_lim;
    else
      return query
        select 'ad:' || s.id || ':' || floor(extract(epoch from s.alvo))::bigint,
               jsonb_build_object('negocio_id', s.id, 'contato_id', s.contato_id)
          from (select l.id, l.contato_id, l.consulta_em as alvo
                  from public.nx_leads l
                 where l.cliente_id = p_auto.cliente_id and l.status = 'aberto' and l.consulta_em is not null
                   and l.consulta_em > now() and l.consulta_em <= now() + make_interval(hours => v_h)
                   and (v_funil is null or l.funil_id = v_funil)
                union all
                select l.id, l.contato_id, ((l.data_consulta + time '09:00') at time zone 'America/Sao_Paulo')
                  from public.nx_leads l
                 where l.cliente_id = p_auto.cliente_id and l.status = 'aberto' and l.consulta_em is null
                   and l.data_consulta between v_hoje and v_hoje + (v_h / 24 + 1)
                   and (v_funil is null or l.funil_id = v_funil)) s
         where s.alvo > now() and s.alvo <= now() + make_interval(hours => v_h)
           and not exists (select 1 from public.nx_auto_execucoes x
                            where x.automacao_id = p_auto.id and x.chave = 'ad:' || s.id || ':' || floor(extract(epoch from s.alvo))::bigint)
         order by s.alvo
         limit p_lim;
    end if;
  when 'apos_data' then
    -- X horas DEPOIS da data. Janela de 48 h: ligar a automação não dispara para datas antigas.
    v_h := least(greatest(coalesce(public.nx_auto_int(c -> 'horas'), 2), 1), 720);
    v_funil := public.nx_auto_uuid(c ->> 'funil_id');
    if c ->> 'campo' = 'previsao_fechamento' then
      return query
        select 'ap:' || s.id || ':' || floor(extract(epoch from s.alvo))::bigint,
               jsonb_build_object('negocio_id', s.id, 'contato_id', s.contato_id)
          from (select l.id, l.contato_id, ((l.previsao_fechamento + time '09:00') at time zone 'America/Sao_Paulo') as alvo
                  from public.nx_leads l
                 where l.cliente_id = p_auto.cliente_id and l.status = 'aberto'
                   and l.previsao_fechamento between v_hoje - (v_h / 24 + 4) and v_hoje
                   and (v_funil is null or l.funil_id = v_funil)) s
         where s.alvo + make_interval(hours => v_h) <= now()
           and s.alvo + make_interval(hours => v_h) > now() - interval '48 hours'
           and not exists (select 1 from public.nx_auto_execucoes x
                            where x.automacao_id = p_auto.id and x.chave = 'ap:' || s.id || ':' || floor(extract(epoch from s.alvo))::bigint)
         order by s.alvo
         limit p_lim;
    else
      -- a data da consulta vale para QUALQUER status: na clínica quem fecha na consulta vai para «fechou» (ganho) e quem
      -- não fecha para «não fechou» (perdido), e os dois devem receber o pós-atendimento (a condição de etapa separa quem faltou)
      return query
        select 'ap:' || s.id || ':' || floor(extract(epoch from s.alvo))::bigint,
               jsonb_build_object('negocio_id', s.id, 'contato_id', s.contato_id)
          from (select l.id, l.contato_id, l.consulta_em as alvo
                  from public.nx_leads l
                 where l.cliente_id = p_auto.cliente_id and l.consulta_em is not null
                   and l.consulta_em <= now() - make_interval(hours => v_h)
                   and l.consulta_em > now() - make_interval(hours => v_h) - interval '48 hours'
                   and (v_funil is null or l.funil_id = v_funil)
                union all
                select l.id, l.contato_id, ((l.data_consulta + time '09:00') at time zone 'America/Sao_Paulo')
                  from public.nx_leads l
                 where l.cliente_id = p_auto.cliente_id and l.consulta_em is null
                   and l.data_consulta between v_hoje - (v_h / 24 + 4) and v_hoje
                   and (v_funil is null or l.funil_id = v_funil)) s
         where s.alvo + make_interval(hours => v_h) <= now()
           and s.alvo + make_interval(hours => v_h) > now() - interval '48 hours'
           and not exists (select 1 from public.nx_auto_execucoes x
                            where x.automacao_id = p_auto.id and x.chave = 'ap:' || s.id || ':' || floor(extract(epoch from s.alvo))::bigint)
         order by s.alvo
         limit p_lim;
    end if;
  when 'agendado' then
    -- todo dia, num horário (America/Sao_Paulo), nos dias da semana escolhidos (0 = domingo … 6 = sábado):
    -- um alvo por negócio ABERTO que casa (funil e etapa opcionais), uma vez por dia. Rodando a partir
    -- do horário e por até 3 h (ligar a automação à tarde não dispara um lote "atrasado" de manhã).
    if coalesce(c ->> 'horario', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return; end if;
    v_hor := (c ->> 'horario')::time;
    v_dias := coalesce(array(select public.nx_auto_int(z) from jsonb_array_elements(
                case when jsonb_typeof(c -> 'dias_semana') = 'array' then c -> 'dias_semana' else '[0,1,2,3,4,5,6]'::jsonb end) z), '{}'::int[]);
    v_funil := public.nx_auto_uuid(c ->> 'funil_id');
    v_est := public.nx_auto_uuid(c ->> 'estagio_id');
    return query
      select 'ag:' || l.id || ':' || to_char(d.dia, 'YYYY-MM-DD'),
             jsonb_build_object('negocio_id', l.id, 'contato_id', l.contato_id)
        from (select x.dia from (values (v_hoje - 1), (v_hoje)) x(dia)
               where extract(dow from x.dia)::int = any(v_dias)
                 and ((x.dia + v_hor) at time zone 'America/Sao_Paulo') <= now()
                 and ((x.dia + v_hor) at time zone 'America/Sao_Paulo') + interval '3 hours' > now()) d
       cross join lateral (
         select l2.id, l2.contato_id from public.nx_leads l2
          where l2.cliente_id = p_auto.cliente_id and l2.status = 'aberto'
            and (v_funil is null or l2.funil_id = v_funil) and (v_est is null or l2.estagio_id = v_est)
            and not exists (select 1 from public.nx_auto_execucoes x
                             where x.automacao_id = p_auto.id and x.chave = 'ag:' || l2.id || ':' || to_char(d.dia, 'YYYY-MM-DD'))
          order by l2.id
          limit p_lim) l
       limit p_lim;
  else
    return;
  end case;
end $$;

-- ------------------------------------------------------------
-- 14. IA: pedido de cliente bloqueado não gasta cota; o resumo só grava nota de contato do próprio cliente (baixa · T01/T02)
-- ------------------------------------------------------------
create or replace function public.nx_auto_ia_pegar(p_pedido bigint default null, p_max int default 5)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare r public.nx_auto_ia_pedidos; v_out jsonb := '[]'::jsonb; v_lim int := least(greatest(coalesce(p_max, 5), 1), 20);
begin
  -- preso há mais de 10 min: volta para a fila (até 3 tentativas)
  for r in select * from public.nx_auto_ia_pedidos q
            where q.status = 'processando' and q.pego_em < now() - interval '10 minutes' for update skip locked loop
    perform public.nx_auto_ia_falhar(r.id, 'a IA não respondeu a tempo', true, 60, true);
  end loop;
  -- pedido de sequência que não espera mais (cancelada ou automação desligada) não gasta cota
  update public.nx_auto_ia_pedidos q set status = 'cancelado', concluido_em = now(), detalhe = 'a sequência foi cancelada'
   where q.status = 'pendente'
     and not exists (select 1 from public.nx_auto_sequencias s where s.pedido_id = q.id and s.status = 'aguardando_ia');
  for r in select * from public.nx_auto_ia_pedidos q
            where q.status = 'pendente' and q.proximo_em <= now() and (p_pedido is null or q.id = p_pedido)
            order by q.id limit v_lim for update skip locked loop
    if not public.nx_auto_cliente_apto(r.cliente_id) then
      -- cliente suspenso, sem o módulo, teste vencido ou organização suspensa: não gasta cota nem muda dado
      update public.nx_auto_ia_pedidos set status = 'cancelado', concluido_em = now(), detalhe = 'a automação está bloqueada neste cliente'
       where id = r.id;
      with c as (update public.nx_auto_sequencias set status = 'cancelada', motivo = 'a automação está bloqueada neste cliente',
                        pedido_id = null, atualizado_em = now()
                  where pedido_id = r.id and status = 'aguardando_ia' returning automacao_id, chave)
      update public.nx_auto_execucoes x set estado = 'cancelada', atualizado_em = now(),
             detalhe = left(coalesce(x.detalhe, '') || ' · cancelada: a automação está bloqueada neste cliente', 1000)
        from c where x.automacao_id = c.automacao_id and x.chave = c.chave;
      continue;
    end if;
    update public.nx_auto_ia_pedidos set status = 'processando', pego_em = now(), tentativas = tentativas + 1 where id = r.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', r.id, 'cliente_id', r.cliente_id, 'tarefa', r.tarefa, 'instrucao', r.instrucao, 'tentativas', r.tentativas + 1,
      'contexto', public.nx_auto_ia_contexto(r)));
  end loop;
  return v_out::json;
end $$;

create or replace function public.nx_auto_ia_resolver(p_pedido bigint, p_resultado jsonb, p_modelo text default null,
                                                      p_in int default null, p_out int default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.nx_auto_ia_pedidos; a public.nx_automacoes; l public.nx_leads; e public.nx_estagios;
  res jsonb := coalesce(p_resultado, '{}'::jsonb);
  v_neg bigint; v_ct bigint; v_det text; v_motivo text; v_txt text; v_id uuid; v_score int; v_prof int;
  v_msg text; v_hint text; v_err text;
begin
  select * into r from public.nx_auto_ia_pedidos q where q.id = p_pedido for update;
  if r.id is null then return json_build_object('ok', false, 'erro', 'pedido_nao_encontrado'); end if;
  if r.status <> 'processando' then return json_build_object('ok', false, 'erro', 'pedido_encerrado'); end if;
  select * into a from public.nx_automacoes x where x.id = r.automacao_id;
  select s.profundidade into v_prof from public.nx_auto_sequencias s where s.pedido_id = r.id and s.status = 'aguardando_ia';
  if a.id is null or not a.ativo or v_prof is null then
    update public.nx_auto_ia_pedidos set status = 'cancelado', pego_em = null, concluido_em = now(),
           detalhe = 'a sequência foi cancelada' where id = r.id;
    return json_build_object('ok', true, 'cancelado', true);
  end if;
  begin
    if jsonb_typeof(res) <> 'object' then
      raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'a resposta não é um objeto';
    end if;
    perform set_config('nx.automacao', a.id::text, true);
    perform set_config('nx.profundidade', (coalesce(v_prof, 0) + 1)::text, true);
    v_neg := nullif(r.alvo ->> 'negocio_id', '')::bigint;
    v_ct := nullif(r.alvo ->> 'contato_id', '')::bigint;
    if v_neg is not null then select * into l from public.nx_leads x where x.id = v_neg and x.cliente_id = r.cliente_id; end if;
    v_ct := coalesce(v_ct, l.contato_id);
    if v_ct is not null and not exists (select 1 from public.nx_contatos k where k.id = v_ct and k.cliente_id = r.cliente_id) then
      raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'o contato não existe mais';
    end if;
    case r.tarefa
      when 'classificar_etapa' then
        if l.id is null then raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'o negócio não existe mais'; end if;
        if l.status <> 'aberto' then raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'o negócio já foi fechado'; end if;
        v_id := public.nx_auto_uuid(res ->> 'etapa_id');
        select * into e from public.nx_estagios s
         where s.id = v_id and s.cliente_id = r.cliente_id and s.funil_id = l.funil_id and s.tipo <> 'ganho';
        if v_id is null or e.id is null then
          raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'a etapa escolhida não é uma das opções do funil';
        end if;
        v_motivo := left(nullif(btrim(coalesce(res ->> 'motivo', '')), ''), 300);
        v_det := public.nx_auto_mover(r.cliente_id, a.nome, l.id, e.id,
                   case when e.tipo = 'perdido' then 'IA: ' || coalesce(v_motivo, 'sem motivo informado') end);
        if v_motivo is not null and e.tipo <> 'perdido' and v_det like 'movido%' then
          insert into public.nx_notas (cliente_id, contato_id, negocio_id, autor_id, texto)
          values (r.cliente_id, l.contato_id, l.id, null, left('IA moveu para «' || e.nome || '»: ' || v_motivo, 5000));
        end if;
        v_det := 'IA: ' || v_det || coalesce(' (' || v_motivo || ')', '');
      when 'resumir_nota' then
        v_txt := btrim(coalesce(res ->> 'texto', ''));
        if v_txt = '' then
          raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'o resumo veio vazio';
        end if;
        -- resumo longo demais é CORTADO (com «…»), não recusado: a IA não conta caracteres e a cota já foi gasta
        if char_length(v_txt) > 1000 then v_txt := left(v_txt, 999) || '…'; end if;
        if v_ct is null and l.id is null then
          raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'sem contato nem negócio para anotar';
        end if;
        insert into public.nx_notas (cliente_id, contato_id, negocio_id, autor_id, texto)
        values (r.cliente_id, v_ct, l.id, null, 'IA: ' || v_txt);
        v_det := 'IA: resumo da conversa gravado como nota';
      when 'pontuar_lead' then
        if l.id is null then raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'o negócio não existe mais'; end if;
        v_score := public.nx_auto_int(res -> 'score');
        v_motivo := left(btrim(coalesce(res ->> 'motivo', '')), 400);
        if v_score is null or v_score not between 0 and 100 then
          raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'a nota vai de 0 a 100';
        end if;
        if v_motivo = '' then
          raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'o motivo veio vazio';
        end if;
        -- motivo longo demais é CORTADO (com «…»), não recusado: o schema não limita o tamanho e a cota já foi gasta
        if char_length(v_motivo) > 200 then v_motivo := left(v_motivo, 199) || '…'; end if;
        update public.nx_leads set
          campos = coalesce(campos, '{}'::jsonb) || jsonb_build_object('score', v_score, 'score_motivo', v_motivo,
                     'score_em', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI')),
          atualizado_em = now()
         where id = l.id and cliente_id = r.cliente_id;
        v_det := 'IA: lead com nota ' || v_score || ' (' || v_motivo || ')';
      else
        raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'tarefa desconhecida';
    end case;
    perform set_config('nx.automacao', '', true);
    perform set_config('nx.profundidade', '', true);
  exception when others then
    get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
    v_err := case when v_msg = 'ia_resultado_invalido' then 'a resposta da IA não pôde ser aplicada (' || coalesce(v_hint, 'inválida') || ')'
                  else rtrim(public.nx_auto_erro_texto(v_msg, v_hint, null), '.') end;
    update public.nx_auto_ia_pedidos set status = 'erro', pego_em = null, concluido_em = now(), resultado = res,
           modelo = left(p_modelo, 80), tokens_in = p_in, tokens_out = p_out, detalhe = left(v_err, 500)
     where id = r.id;
    perform public.nx_auto_ia_encerrar(r.id, false, left('IA: ' || v_err, 280));
    return json_build_object('ok', false, 'erro', 'resultado_invalido', 'detalhe', v_err);
  end;
  update public.nx_auto_ia_pedidos set status = 'aplicado', pego_em = null, concluido_em = now(), resultado = res,
         modelo = left(p_modelo, 80), tokens_in = p_in, tokens_out = p_out, detalhe = left(v_det, 500)
   where id = r.id;
  perform public.nx_auto_ia_encerrar(r.id, true, left(v_det, 280));
  if v_ct is not null or l.id is not null then
    perform public.nx_historico_add(r.cliente_id, 'automacao', v_ct, l.id, nullif(r.alvo ->> 'conversa_id', '')::bigint,
      jsonb_build_object('automacao_id', a.id, 'nome', a.nome, 'detalhe', left(v_det, 500)));
  end if;
  return json_build_object('ok', true, 'detalhe', v_det);
end $$;

-- ------------------------------------------------------------
-- 15. nx_auto_normalizar: listas enormes recusadas antes de varrer; automação que só espera/para é recusada (baixa · T01/T05)
-- ------------------------------------------------------------
create or replace function public.nx_auto_normalizar(p_cliente uuid, p_auto jsonb, p_ligar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a jsonb := coalesce(p_auto, '{}'::jsonb);
  v_nome text := btrim(coalesce(a ->> 'nome', ''));
  v_gat text := a ->> 'gatilho';
  c jsonb := case when jsonb_typeof(a -> 'config') = 'object' then a -> 'config' else '{}'::jsonb end;
  nc jsonb;
  v_conds jsonb := coalesce(a -> 'condicoes', '[]'::jsonb);
  v_acoes jsonb := coalesce(a -> 'acoes', '[]'::jsonb);
  nconds jsonb := '[]'::jsonb;
  nacoes jsonb := '[]'::jsonb;
  x jsonb; y jsonb; w jsonb;
  i int; n int; v_id uuid; v_id2 uuid; v_txt text; v_txt2 text; v_campo text; v_op text; v_tipo text; p text;
  v_esperas int := 0; v_modo text;
  t public.nx_templates; e public.nx_estagios;
begin
  if v_nome = '' then perform public.nx_auto_falha('dê um nome à automação'); end if;
  if char_length(v_nome) > 80 then perform public.nx_auto_falha('o nome pode ter até 80 caracteres'); end if;
  if v_gat is null or v_gat not in ('conversa_nova', 'mensagem_recebida', 'negocio_criado', 'negocio_estagio',
      'negocio_ganho', 'negocio_perdido', 'etiqueta_adicionada', 'sem_resposta', 'tempo_no_estagio',
      'tarefa_vencida', 'antes_da_data', 'agendado', 'apos_data', 'conversa_resolvida') then
    perform public.nx_auto_falha('escolha o gatilho em «Quando»');
  end if;

  -- ---------------------------------------------------------- Quando (config)
  case v_gat
    when 'conversa_nova', 'conversa_resolvida' then
      nc := jsonb_strip_nulls(jsonb_build_object(
        'canal_id', public.nx_auto_id(p_cliente, 'canal', c ->> 'canal_id', 'o número escolhido em «Quando» não existe mais'),
        'departamento_id', public.nx_auto_id(p_cliente, 'departamento', c ->> 'departamento_id', 'o departamento escolhido em «Quando» não existe mais')));
    when 'mensagem_recebida' then
      if c ? 'palavras' and jsonb_typeof(c -> 'palavras') not in ('array', 'null') then
        perform public.nx_auto_falha('as palavras estão em formato inválido');
      end if;
      if jsonb_typeof(c -> 'palavras') = 'array' and jsonb_array_length(c -> 'palavras') > 1000 then
        perform public.nx_auto_falha('use até 20 palavras');
      end if;
      select coalesce(jsonb_agg(s.w), '[]'::jsonb) into w
        from (select btrim(z) as w
                from jsonb_array_elements_text(case when jsonb_typeof(c -> 'palavras') = 'array' then c -> 'palavras' else '[]'::jsonb end) z
               where btrim(z) <> '') s;
      if jsonb_array_length(w) > 20 then perform public.nx_auto_falha('use até 20 palavras'); end if;
      if exists (select 1 from jsonb_array_elements_text(w) z where char_length(z) > 60) then
        perform public.nx_auto_falha('cada palavra pode ter até 60 caracteres');
      end if;
      nc := jsonb_strip_nulls(jsonb_build_object(
        'palavras', case when jsonb_array_length(w) > 0 then w end,
        'canal_id', public.nx_auto_id(p_cliente, 'canal', c ->> 'canal_id', 'o número escolhido em «Quando» não existe mais')));
    when 'negocio_criado', 'negocio_ganho', 'negocio_perdido' then
      nc := jsonb_strip_nulls(jsonb_build_object(
        'funil_id', public.nx_auto_id(p_cliente, 'funil', c ->> 'funil_id', 'o funil escolhido em «Quando» não existe mais')));
    when 'negocio_estagio' then
      if coalesce(btrim(c ->> 'estagio_id'), '') = '' then perform public.nx_auto_falha('escolha a etapa em «Quando»'); end if;
      nc := jsonb_build_object('estagio_id',
        public.nx_auto_id(p_cliente, 'estagio', c ->> 'estagio_id', 'a etapa escolhida em «Quando» não existe mais'));
    when 'tempo_no_estagio' then
      if coalesce(btrim(c ->> 'estagio_id'), '') = '' then perform public.nx_auto_falha('escolha a etapa em «Quando»'); end if;
      v_id := public.nx_auto_id(p_cliente, 'estagio', c ->> 'estagio_id', 'a etapa escolhida em «Quando» não existe mais');
      n := public.nx_auto_int(c -> 'horas');
      if n is null or n not between 1 and 2160 then perform public.nx_auto_falha('o tempo na etapa vai de 1 a 2160 horas'); end if;
      nc := jsonb_build_object('estagio_id', v_id, 'horas', n);
    when 'etiqueta_adicionada' then
      if coalesce(btrim(c ->> 'etiqueta_id'), '') = '' then perform public.nx_auto_falha('escolha a etiqueta em «Quando»'); end if;
      nc := jsonb_build_object('etiqueta_id',
        public.nx_auto_id(p_cliente, 'etiqueta', c ->> 'etiqueta_id', 'a etiqueta escolhida em «Quando» não existe mais'));
    when 'sem_resposta' then
      n := public.nx_auto_int(c -> 'minutos');
      if n is null or n not between 5 and 1440 then perform public.nx_auto_falha('o tempo sem resposta vai de 5 a 1440 minutos'); end if;
      nc := jsonb_strip_nulls(jsonb_build_object('minutos', n,
        'departamento_id', public.nx_auto_id(p_cliente, 'departamento', c ->> 'departamento_id', 'o departamento escolhido em «Quando» não existe mais'),
        'so_no_horario', coalesce(c ->> 'so_no_horario', 'false') = 'true'));
    when 'tarefa_vencida' then
      nc := '{}'::jsonb;
    when 'antes_da_data' then
      if coalesce(c ->> 'campo', '') not in ('consulta', 'previsao_fechamento') then
        perform public.nx_auto_falha('escolha a data em «Quando»');
      end if;
      n := public.nx_auto_int(c -> 'horas');
      if n is null or n not between 1 and 72 then perform public.nx_auto_falha('a antecedência vai de 1 a 72 horas'); end if;
      nc := jsonb_strip_nulls(jsonb_build_object('campo', c ->> 'campo', 'horas', n,
        'funil_id', public.nx_auto_id(p_cliente, 'funil', c ->> 'funil_id', 'o funil escolhido em «Quando» não existe mais')));
    when 'apos_data' then
      if coalesce(c ->> 'campo', '') not in ('consulta', 'previsao_fechamento') then
        perform public.nx_auto_falha('escolha a data em «Quando»');
      end if;
      n := public.nx_auto_int(c -> 'horas');
      if n is null or n not between 1 and 720 then perform public.nx_auto_falha('o tempo depois da data vai de 1 a 720 horas'); end if;
      nc := jsonb_strip_nulls(jsonb_build_object('campo', c ->> 'campo', 'horas', n,
        'funil_id', public.nx_auto_id(p_cliente, 'funil', c ->> 'funil_id', 'o funil escolhido em «Quando» não existe mais')));
    when 'agendado' then
      if coalesce(c ->> 'horario', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        perform public.nx_auto_falha('escolha o horário em «Quando» (de 00:00 a 23:59)');
      end if;
      if c ? 'dias_semana' and jsonb_typeof(c -> 'dias_semana') not in ('array', 'null') then
        perform public.nx_auto_falha('os dias da semana estão em formato inválido');
      end if;
      if jsonb_typeof(c -> 'dias_semana') = 'array' then
        if jsonb_array_length(c -> 'dias_semana') > 100 then
          perform public.nx_auto_falha('os dias da semana vão de 0 (domingo) a 6 (sábado)');
        end if;
        if exists (select 1 from jsonb_array_elements(c -> 'dias_semana') z
                    where public.nx_auto_int(z) is null or public.nx_auto_int(z) not between 0 and 6) then
          perform public.nx_auto_falha('os dias da semana vão de 0 (domingo) a 6 (sábado)');
        end if;
        select coalesce(jsonb_agg(s.d order by s.d), '[]'::jsonb) into w
          from (select distinct public.nx_auto_int(z) as d from jsonb_array_elements(c -> 'dias_semana') z) s;
        if jsonb_array_length(w) = 0 then perform public.nx_auto_falha('escolha pelo menos um dia da semana'); end if;
      else
        w := '[0,1,2,3,4,5,6]'::jsonb;     -- sem dias = todos os dias
      end if;
      v_id := public.nx_auto_id(p_cliente, 'funil', c ->> 'funil_id', 'o funil escolhido em «Quando» não existe mais');
      v_id2 := public.nx_auto_id(p_cliente, 'estagio', c ->> 'estagio_id', 'a etapa escolhida em «Quando» não existe mais');
      if v_id is not null and v_id2 is not null
         and not exists (select 1 from public.nx_estagios s where s.id = v_id2 and s.funil_id = v_id) then
        perform public.nx_auto_falha('a etapa escolhida em «Quando» não é desse funil');
      end if;
      nc := jsonb_strip_nulls(jsonb_build_object('horario', c ->> 'horario', 'dias_semana', w,
                                                 'funil_id', v_id, 'estagio_id', v_id2));
    else
      perform public.nx_auto_falha('escolha o gatilho em «Quando»');
  end case;

  -- ---------------------------------------------------------- Se (condições)
  if jsonb_typeof(v_conds) = 'null' then v_conds := '[]'::jsonb; end if;
  if jsonb_typeof(v_conds) <> 'array' then perform public.nx_auto_falha('as condições estão em formato inválido'); end if;
  if jsonb_array_length(v_conds) > 10 then perform public.nx_auto_falha('use até 10 condições'); end if;
  for i in 0 .. jsonb_array_length(v_conds) - 1 loop
    x := v_conds -> i;
    p := 'condição ' || (i + 1);
    if jsonb_typeof(x) <> 'object' then perform public.nx_auto_falha(p || ': escolha o campo'); end if;
    v_campo := coalesce(x ->> 'campo', '');
    v_op := coalesce(x ->> 'op', '');
    v_tipo := case
      when v_campo = 'origem' then 'origem'
      when v_campo = 'funil_id' then 'funil'
      when v_campo = 'estagio_id' then 'estagio'
      when v_campo = 'canal_id' then 'canal'
      when v_campo = 'departamento_id' then 'departamento'
      when v_campo = 'etiqueta' then 'etiqueta'
      when v_campo = 'texto' then 'texto'
      when v_campo = 'valor' then 'numero'
      when v_campo = 'dono_id' then 'conta'
      when v_campo ~ '^contato\.[a-z][a-z0-9_]{0,39}$' then 'campo'
    end;
    if v_tipo is null then perform public.nx_auto_falha(p || ': escolha o campo'); end if;
    if v_op not in ('igual', 'diferente', 'contem', 'nao_contem', 'maior', 'menor', 'vazio', 'preenchido') then
      perform public.nx_auto_falha(p || ': escolha a comparação');
    end if;
    if v_op in ('maior', 'menor') and v_tipo not in ('numero', 'campo') then
      perform public.nx_auto_falha(p || ': «maior» e «menor» valem só para valor e campos');
    end if;
    if v_op in ('vazio', 'preenchido') then
      y := jsonb_build_object('campo', v_campo, 'op', v_op);
    else
      v_txt := btrim(coalesce(x ->> 'valor', ''));
      if v_txt = '' then perform public.nx_auto_falha(p || ': preencha o valor'); end if;
      if v_tipo = 'numero' then
        if replace(v_txt, ',', '.') !~ '^-?[0-9]+(\.[0-9]+)?$' then
          perform public.nx_auto_falha(p || ': o valor precisa ser um número');
        end if;
        y := jsonb_build_object('campo', v_campo, 'op', v_op, 'valor', replace(v_txt, ',', '.')::numeric);
      else
        if v_tipo in ('funil', 'estagio', 'canal', 'departamento', 'etiqueta', 'conta') then
          v_id := public.nx_auto_uuid(v_txt);
          if v_id is null or not public.nx_auto_ref_ok(p_cliente, v_tipo, v_id) then
            perform public.nx_auto_falha(p || ': o item escolhido não existe mais');
          end if;
          v_txt := v_id::text;
        end if;
        if v_tipo = 'origem' and v_txt not in ('anuncio', 'whatsapp', 'indicacao', 'organico', 'manual', 'site', 'importacao') then
          perform public.nx_auto_falha(p || ': escolha a origem');
        end if;
        if char_length(v_txt) > 200 then perform public.nx_auto_falha(p || ': o valor pode ter até 200 caracteres'); end if;
        y := jsonb_build_object('campo', v_campo, 'op', v_op, 'valor', v_txt);
      end if;
    end if;
    nconds := nconds || jsonb_build_array(y);
  end loop;

  -- ---------------------------------------------------------- Então (ações)
  if jsonb_typeof(v_acoes) <> 'array' or jsonb_array_length(v_acoes) = 0 then
    perform public.nx_auto_falha('acrescente pelo menos uma ação em «Então»');
  end if;
  if jsonb_array_length(v_acoes) > 10 then perform public.nx_auto_falha('use até 10 ações'); end if;
  for i in 0 .. jsonb_array_length(v_acoes) - 1 loop
    x := v_acoes -> i;
    p := 'ação ' || (i + 1);
    if jsonb_typeof(x) <> 'object' or coalesce(x ->> 'tipo', '') not in ('criar_negocio', 'mover_estagio', 'criar_tarefa',
        'enviar_mensagem', 'enviar_template', 'atribuir', 'etiquetar', 'notificar', 'resolver_conversa', 'alerta_whatsapp',
        'mover_funil', 'etiqueta_adicionar', 'etiqueta_remover', 'campo_atualizar', 'nota', 'esperar', 'parar', 'ia_decidir') then
      perform public.nx_auto_falha(p || ': tipo de ação desconhecido');
    end if;
    case x ->> 'tipo'
      when 'criar_negocio' then
        v_id := public.nx_auto_id(p_cliente, 'funil', x ->> 'funil_id', p || ': o funil escolhido não existe mais');
        v_id2 := public.nx_auto_id(p_cliente, 'estagio', x ->> 'estagio_id', p || ': a etapa escolhida não existe mais');
        if v_id is not null and v_id2 is not null
           and not exists (select 1 from public.nx_estagios s where s.id = v_id2 and s.funil_id = v_id) then
          perform public.nx_auto_falha(p || ': a etapa não é desse funil');
        end if;
        v_txt := nullif(btrim(coalesce(x ->> 'titulo', '')), '');
        if char_length(v_txt) > 120 then perform public.nx_auto_falha(p || ': o título pode ter até 120 caracteres'); end if;
        y := jsonb_strip_nulls(jsonb_build_object('tipo', 'criar_negocio', 'funil_id', v_id, 'estagio_id', v_id2, 'titulo', v_txt));
      when 'mover_estagio' then
        if coalesce(btrim(x ->> 'estagio_id'), '') = '' then perform public.nx_auto_falha(p || ': escolha a etapa'); end if;
        y := jsonb_build_object('tipo', 'mover_estagio',
          'estagio_id', public.nx_auto_id(p_cliente, 'estagio', x ->> 'estagio_id', p || ': a etapa escolhida não existe mais'));
      when 'mover_funil' then
        if coalesce(btrim(x ->> 'funil_id'), '') = '' then perform public.nx_auto_falha(p || ': escolha o funil'); end if;
        v_id := public.nx_auto_id(p_cliente, 'funil', x ->> 'funil_id', p || ': o funil escolhido não existe mais');
        if not exists (select 1 from public.nx_funis f where f.id = v_id and f.ativo) then
          perform public.nx_auto_falha(p || ': o funil escolhido está desativado');
        end if;
        v_id2 := public.nx_auto_id(p_cliente, 'estagio', x ->> 'estagio_id', p || ': a etapa escolhida não existe mais');
        if v_id2 is not null and not exists (select 1 from public.nx_estagios s where s.id = v_id2 and s.funil_id = v_id) then
          perform public.nx_auto_falha(p || ': a etapa não é desse funil');
        end if;
        y := jsonb_strip_nulls(jsonb_build_object('tipo', 'mover_funil', 'funil_id', v_id, 'estagio_id', v_id2));
      when 'criar_tarefa' then
        v_txt := btrim(coalesce(x ->> 'titulo', ''));
        if v_txt = '' then perform public.nx_auto_falha(p || ': escreva o título da tarefa'); end if;
        if char_length(v_txt) > 160 then perform public.nx_auto_falha(p || ': o título pode ter até 160 caracteres'); end if;
        if x ? 'tipo_tarefa' and x -> 'tipo_tarefa' <> 'null'::jsonb
           and coalesce(x ->> 'tipo_tarefa', '') not in ('tarefa', 'ligacao', 'reuniao', 'visita', 'whatsapp', 'email') then
          perform public.nx_auto_falha(p || ': tipo de tarefa inválido');
        end if;
        n := 24;
        if x ? 'vence_em_horas' and x -> 'vence_em_horas' <> 'null'::jsonb and coalesce(x ->> 'vence_em_horas', '') <> '' then
          n := public.nx_auto_int(x -> 'vence_em_horas');
          if n is null or n not between 0 and 2160 then perform public.nx_auto_falha(p || ': o prazo vai de 0 a 2160 horas'); end if;
        end if;
        if coalesce(x ->> 'dono', '') not in ('responsavel', 'atendente') then
          v_id := public.nx_auto_uuid(x ->> 'dono');
          if v_id is null or not public.nx_auto_ref_ok(p_cliente, 'conta', v_id) then
            perform public.nx_auto_falha(p || ': escolha para quem é a tarefa');
          end if;
        end if;
        y := jsonb_build_object('tipo', 'criar_tarefa', 'titulo', v_txt,
          'tipo_tarefa', coalesce(nullif(x ->> 'tipo_tarefa', ''), 'tarefa'), 'vence_em_horas', n, 'dono', x ->> 'dono');
      when 'enviar_mensagem' then
        v_txt := btrim(coalesce(x ->> 'texto', ''));
        if v_txt = '' then perform public.nx_auto_falha(p || ': escreva a mensagem'); end if;
        if char_length(v_txt) > 4096 then perform public.nx_auto_falha(p || ': a mensagem pode ter até 4096 caracteres'); end if;
        y := jsonb_build_object('tipo', 'enviar_mensagem', 'texto', v_txt);
      when 'enviar_template' then
        if x ? 'parametros' and jsonb_typeof(x -> 'parametros') not in ('array', 'null') then
          perform public.nx_auto_falha(p || ': os parâmetros estão em formato inválido');
        end if;
        if jsonb_typeof(x -> 'parametros') = 'array' and jsonb_array_length(x -> 'parametros') > 100 then
          perform public.nx_auto_falha(p || ': use até 10 parâmetros');
        end if;
        select coalesce(jsonb_agg(coalesce(z #>> '{}', '') order by o), '[]'::jsonb) into w
          from jsonb_array_elements(case when jsonb_typeof(x -> 'parametros') = 'array' then x -> 'parametros' else '[]'::jsonb end)
               with ordinality q(z, o);
        if jsonb_array_length(w) > 10 then perform public.nx_auto_falha(p || ': use até 10 parâmetros'); end if;
        if exists (select 1 from jsonb_array_elements_text(w) z where char_length(z) > 200) then
          perform public.nx_auto_falha(p || ': cada parâmetro pode ter até 200 caracteres');
        end if;
        if coalesce(btrim(x ->> 'template_id'), '') = '' then
          if p_ligar then perform public.nx_auto_falha(p || ': escolha o modelo aprovado'); end if;
          v_txt := nullif(left(btrim(coalesce(x ->> 'template_nome', '')), 60), '');
          y := jsonb_strip_nulls(jsonb_build_object('tipo', 'enviar_template', 'template_nome', v_txt, 'parametros', w));
        else
          v_id := public.nx_auto_uuid(x ->> 'template_id');
          select * into t from public.nx_templates k where k.id = v_id and k.cliente_id = p_cliente;
          if t.id is null then perform public.nx_auto_falha(p || ': o modelo escolhido não existe mais'); end if;
          if p_ligar and upper(coalesce(t.status, '')) <> 'APPROVED' then
            perform public.nx_auto_falha(p || ': o modelo ainda não foi aprovado pela Meta');
          end if;
          if jsonb_array_length(w) <> coalesce(t.num_parametros, 0) then
            perform public.nx_auto_falha(p || ': o modelo pede ' || coalesce(t.num_parametros, 0) || ' parâmetro'
                                         || case when coalesce(t.num_parametros, 0) = 1 then '' else 's' end);
          end if;
          if exists (select 1 from jsonb_array_elements_text(w) z where btrim(z) = '') then
            perform public.nx_auto_falha(p || ': preencha todos os parâmetros');
          end if;
          y := jsonb_build_object('tipo', 'enviar_template', 'template_id', t.id, 'parametros', w);
        end if;
      when 'atribuir' then
        -- "dono" (rodizio | conta | departamento) é o campo do contrato novo; "modo" (rodizio | conta) é o antigo
        v_modo := coalesce(nullif(btrim(x ->> 'dono'), ''), nullif(btrim(x ->> 'modo'), ''));
        if v_modo is null or v_modo not in ('rodizio', 'conta', 'departamento')
           or (v_modo = 'departamento' and coalesce(x ->> 'dono', '') <> 'departamento') then
          perform public.nx_auto_falha(p || ': escolha como atribuir');
        end if;
        v_id := null;
        if v_modo = 'conta' then
          v_id := public.nx_auto_uuid(x ->> 'conta_id');
          if v_id is null or not public.nx_auto_ref_ok(p_cliente, 'conta', v_id) then
            perform public.nx_auto_falha(p || ': escolha a pessoa');
          end if;
        end if;
        v_id2 := public.nx_auto_id(p_cliente, 'departamento', x ->> 'departamento_id', p || ': o departamento escolhido não existe mais');
        if v_modo = 'departamento' and v_id2 is null then perform public.nx_auto_falha(p || ': escolha o departamento'); end if;
        y := jsonb_strip_nulls(jsonb_build_object('tipo', 'atribuir',
               case when coalesce(x ->> 'dono', '') <> '' then 'dono' else 'modo' end, v_modo,
               'conta_id', v_id, 'departamento_id', v_id2));
      when 'etiquetar' then
        if coalesce(btrim(x ->> 'etiqueta_id'), '') = '' and coalesce(btrim(x ->> 'etiqueta_nome'), '') = '' then
          perform public.nx_auto_falha(p || ': escolha a etiqueta');
        end if;
        if coalesce(btrim(x ->> 'etiqueta_id'), '') <> '' then
          v_id := public.nx_auto_id(p_cliente, 'etiqueta', x ->> 'etiqueta_id', p || ': a etiqueta escolhida não existe mais');
        else
          v_txt := btrim(x ->> 'etiqueta_nome');
          if char_length(v_txt) > 40 then perform public.nx_auto_falha(p || ': o nome da etiqueta pode ter até 40 caracteres'); end if;
          v_id := null;
        end if;
        if coalesce(x ->> 'alvo', '') not in ('contato', 'conversa') then
          perform public.nx_auto_falha(p || ': escolha onde pôr a etiqueta');
        end if;
        if v_id is null then
          -- modelo "preço → Orçamento": a etiqueta é achada pelo nome ou criada agora
          select k.id into v_id from public.nx_etiquetas k
           where k.cliente_id = p_cliente and lower(k.nome) = lower(v_txt) limit 1;
          if v_id is null then
            insert into public.nx_etiquetas (cliente_id, nome, cor) values (p_cliente, v_txt, '#E5B35C')
            on conflict do nothing returning id into v_id;
            if v_id is null then
              select k.id into v_id from public.nx_etiquetas k
               where k.cliente_id = p_cliente and lower(k.nome) = lower(v_txt) limit 1;
            end if;
          end if;
        end if;
        y := jsonb_build_object('tipo', 'etiquetar', 'etiqueta_id', v_id, 'alvo', x ->> 'alvo',
                                'remover', coalesce(x ->> 'remover', 'false') = 'true');
      when 'etiqueta_adicionar', 'etiqueta_remover' then
        if coalesce(btrim(x ->> 'etiqueta_id'), '') = '' then perform public.nx_auto_falha(p || ': escolha a etiqueta'); end if;
        y := jsonb_build_object('tipo', x ->> 'tipo',
          'etiqueta_id', public.nx_auto_id(p_cliente, 'etiqueta', x ->> 'etiqueta_id', p || ': a etiqueta escolhida não existe mais'));
      when 'campo_atualizar' then
        v_txt := btrim(coalesce(x ->> 'campo', ''));
        if v_txt !~ '^[a-z][a-z0-9_]{1,39}$' then perform public.nx_auto_falha(p || ': escolha o campo'); end if;
        if v_txt <> 'score' and not exists (select 1 from public.nx_campos k
              where k.cliente_id = p_cliente and k.chave = v_txt and k.entidade in ('contato', 'negocio') and k.ativo) then
          perform public.nx_auto_falha(p || ': o campo escolhido não existe mais');
        end if;
        v_txt2 := btrim(coalesce(x ->> 'valor', ''));
        if v_txt2 = '' then perform public.nx_auto_falha(p || ': escreva o valor'); end if;
        if char_length(v_txt2) > 200 then perform public.nx_auto_falha(p || ': o valor pode ter até 200 caracteres'); end if;
        y := jsonb_build_object('tipo', 'campo_atualizar', 'campo', v_txt, 'valor', v_txt2);
      when 'nota' then
        v_txt := btrim(coalesce(x ->> 'texto', ''));
        if v_txt = '' then perform public.nx_auto_falha(p || ': escreva a nota'); end if;
        if char_length(v_txt) > 1000 then perform public.nx_auto_falha(p || ': a nota pode ter até 1000 caracteres'); end if;
        y := jsonb_build_object('tipo', 'nota', 'texto', v_txt);
      when 'notificar' then
        v_id := null;
        if coalesce(x ->> 'para', '') not in ('responsavel', 'admins', 'departamento') then
          v_id := public.nx_auto_uuid(x ->> 'para');
          if v_id is null or not public.nx_auto_ref_ok(p_cliente, 'conta', v_id) then
            perform public.nx_auto_falha(p || ': escolha quem recebe o aviso');
          end if;
        end if;
        v_id2 := public.nx_auto_id(p_cliente, 'departamento', x ->> 'departamento_id', p || ': o departamento escolhido não existe mais');
        if x ->> 'para' = 'departamento' and v_id2 is null then perform public.nx_auto_falha(p || ': escolha o departamento'); end if;
        v_txt := btrim(coalesce(x ->> 'titulo', ''));
        v_txt2 := btrim(coalesce(x ->> 'texto', ''));
        -- o aviso precisa de título OU de texto (só o texto vira o título)
        if v_txt = '' and v_txt2 = '' then perform public.nx_auto_falha(p || ': escreva o título do aviso'); end if;
        if char_length(v_txt) > 120 then perform public.nx_auto_falha(p || ': o título do aviso pode ter até 120 caracteres'); end if;
        if char_length(v_txt2) > 500 then
          perform public.nx_auto_falha(p || ': o detalhe do aviso pode ter até 500 caracteres');
        end if;
        y := jsonb_strip_nulls(jsonb_build_object('tipo', 'notificar', 'para', x ->> 'para', 'titulo', nullif(v_txt, ''),
               'texto', nullif(v_txt2, ''),
               'departamento_id', case when x ->> 'para' = 'departamento' then v_id2 end));
      when 'esperar' then
        n := public.nx_auto_int(x -> 'minutos');
        if n is null or n not between 1 and 43200 then
          perform public.nx_auto_falha(p || ': a espera vai de 1 minuto a 30 dias (43200 minutos)');
        end if;
        if i = jsonb_array_length(v_acoes) - 1 then
          perform public.nx_auto_falha(p || ': depois de esperar, acrescente outra ação');
        end if;
        v_esperas := v_esperas + 1;
        if v_esperas > 5 then perform public.nx_auto_falha(p || ': use até 5 esperas'); end if;
        y := jsonb_build_object('tipo', 'esperar', 'minutos', n,
          'cancelar_se_cliente_responder', coalesce(x ->> 'cancelar_se_cliente_responder', 'true') <> 'false');
      when 'parar' then
        y := jsonb_build_object('tipo', 'parar');
      when 'ia_decidir' then
        if coalesce(x ->> 'tarefa', '') not in ('classificar_etapa', 'resumir_nota', 'pontuar_lead') then
          perform public.nx_auto_falha(p || ': escolha o que a IA faz');
        end if;
        v_txt := nullif(btrim(coalesce(x ->> 'instrucao', '')), '');
        if char_length(v_txt) > 500 then perform public.nx_auto_falha(p || ': a instrução pode ter até 500 caracteres'); end if;
        y := jsonb_strip_nulls(jsonb_build_object('tipo', 'ia_decidir', 'tarefa', x ->> 'tarefa', 'instrucao', v_txt));
      when 'resolver_conversa' then
        y := jsonb_build_object('tipo', 'resolver_conversa');
      when 'alerta_whatsapp' then
        v_txt := btrim(coalesce(x ->> 'texto', ''));
        if v_txt = '' or char_length(v_txt) > 1000 then
          perform public.nx_auto_falha(p || ': escreva o alerta (até 1000 caracteres)');
        end if;
        y := jsonb_build_object('tipo', 'alerta_whatsapp', 'texto', v_txt);
      else
        perform public.nx_auto_falha(p || ': tipo de ação desconhecido');
    end case;
    nacoes := nacoes || jsonb_build_array(y);
  end loop;

  if not exists (select 1 from jsonb_array_elements(nacoes) z where z ->> 'tipo' not in ('esperar', 'parar')) then
    perform public.nx_auto_falha('acrescente pelo menos um passo que faça algo, além de esperar ou parar');
  end if;
  return jsonb_build_object('nome', v_nome, 'gatilho', v_gat, 'config', nc, 'condicoes', nconds, 'acoes', nacoes,
                            'respeitar_horario', coalesce(a ->> 'respeitar_horario', 'false') = 'true');
end $$;

-- ------------------------------------------------------------
-- 16. Motor: 100 eventos por rodada de 15 s (baixa · T05)
-- ------------------------------------------------------------
-- a rodada de 25 eventos usava 0,1–0,5 s do orçamento de 1,5 s; uma importação de 1.000 negócios atrasava ~20 min as
-- automações do cliente. A rodada continua parando no orçamento (1,5 s) e a trava impede rodadas sobrepostas.
do $$
declare j record; v_agenda text;
begin
  for j in select jobid, schedule from cron.job where jobname = 'nx-automacoes' loop
    v_agenda := j.schedule;
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('nx-automacoes', coalesce(v_agenda, '15 seconds'), 'select public.nx_auto_lote(100)');
end $$;

-- ------------------------------------------------------------
-- 17. nx_negocio_salvar: responsável do contato novo, corrida de telefone, consulta apagada e consulta fora da agenda (média + baixa · T03/T06)
-- ------------------------------------------------------------
-- · «Sem responsável» no negócio novo deixa o contato embutido também sem dono (antes nascia com o dono = quem criou e o
--   atendente restrito via o negócio e levava erro na ficha);
-- · criações simultâneas do mesmo telefone novo: trava por telefone (a mesma chave da conversa) e quem chega depois
--   reaproveita o contato em vez de levar «duplicate key»;
-- · apagar a «Data e hora» da consulta (consulta_em = null) apaga a data da consulta de um negócio ABERTO — antes o
--   lembrete (antes_da_data) continuava disparando para uma consulta que não existe;
-- · consulta nova/alterada pelo CRM fora da agenda: nota + aviso_agenda (não bloqueia).

create or replace function public.nx_negocio_salvar(p_token text, p_cliente uuid, p_negocio jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  n jsonb := coalesce(p_negocio, '{}'::jsonb);
  v_id bigint := public.nx_crm_int8(n, 'id');
  l public.nx_leads; e public.nx_estagios; k public.nx_contatos;
  v_contato bigint; v_funil uuid; v_estagio uuid; v_dono uuid; v_tel text; v_email text; v_nome text;
  v_origem text; v_campos jsonb; v_conversa bigint; v_valor numeric; v_aviso text; v_ce_antes timestamptz;
  origens constant text[] := array['anuncio','whatsapp','indicacao','organico','manual','site','importacao'];
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if jsonb_typeof(n) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'negocio'; end if;
  if n ? 'campos' and jsonb_typeof(n -> 'campos') not in ('object', 'null') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'campos';
  end if;
  v_campos := jsonb_strip_nulls(coalesce(case when jsonb_typeof(n -> 'campos') = 'object' then n -> 'campos' end, '{}'::jsonb));
  if n ? 'origem' then
    v_origem := nullif(btrim(n ->> 'origem'), '');
    if v_origem is not null and not (v_origem = any(origens)) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'origem';
    end if;
  end if;
  if n ? 'dono_id' then
    v_dono := public.nx_crm_uuid(n, 'dono_id');
    if not public.nx_crm_dono_ok(p_cliente, v_dono) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'dono_id';
    end if;
  end if;

  if v_id is null then
    -- ---------------------------------------------------------- CRIAR
    -- contato: id existente OU {nome, telefone?, email?} (telefone já cadastrado → reaproveita)
    if nullif(n ->> 'contato_id', '') is not null then
      v_contato := public.nx_crm_int8(n, 'contato_id');
      select * into k from public.nx_contatos where id = v_contato and cliente_id = p_cliente;
      if k.id is null or (public.nx_crm_restrito(v) and k.dono_id is not null and k.dono_id <> v.conta_id) then
        raise exception 'contato_nao_encontrado' using errcode = '22023';
      end if;
    elsif jsonb_typeof(n -> 'contato') = 'object' then
      v_nome := left(nullif(btrim(n -> 'contato' ->> 'nome'), ''), 160);
      v_email := lower(nullif(btrim(n -> 'contato' ->> 'email'), ''));
      if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'email';
      end if;
      if nullif(btrim(n -> 'contato' ->> 'telefone'), '') is not null then
        v_tel := public.nx_tel_normalizar(n -> 'contato' ->> 'telefone');
        if v_tel is null then raise exception 'telefone_invalido' using errcode = '22023', hint = 'telefone'; end if;
        -- um de cada vez por telefone (mesma chave da criação de conversa): quem chega depois já enxerga o contato novo
        perform pg_advisory_xact_lock(hashtextextended(p_cliente::text || ':' || coalesce(public.nx_tel_chave(v_tel), v_tel), 0));
        v_contato := public.nx_contato_por_tel(p_cliente, v_tel);
      end if;
      if v_contato is null and v_email is not null then
        select x.id into v_contato from public.nx_contatos x
         where x.cliente_id = p_cliente and lower(x.email) = v_email order by x.id limit 1;
      end if;
      if v_contato is null then
        if v_nome is null and v_tel is null and v_email is null then
          raise exception 'dados_invalidos' using errcode = '22023', hint = 'contato';
        end if;
        perform public.nx_exigir_limite(p_cliente, 'contatos', 1);
        insert into public.nx_contatos (cliente_id, nome, telefone, email, origem, dono_id)
        values (p_cliente, v_nome, v_tel, v_email, 'manual', case when n ? 'dono_id' then v_dono else v.conta_id end)
        returning id into v_contato;
      elsif v_nome is not null then
        update public.nx_contatos x set nome = v_nome where x.id = v_contato and x.nome is null;
      end if;
    else
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'contato';
    end if;

    -- funil e etapa (padrão: funil padrão, 1ª etapa aberta)
    v_funil := public.nx_crm_uuid(n, 'funil_id');
    v_estagio := public.nx_crm_uuid(n, 'estagio_id');
    if v_funil is not null and not exists (select 1 from public.nx_funis f where f.id = v_funil and f.cliente_id = p_cliente and f.ativo) then
      raise exception 'funil_invalido' using errcode = '22023', hint = 'nao_encontrado';
    end if;
    if v_estagio is not null then
      select * into e from public.nx_estagios where id = v_estagio and cliente_id = p_cliente
                                                and (v_funil is null or funil_id = v_funil);
      if e.id is null then raise exception 'estagio_invalido' using errcode = '22023'; end if;
      if e.tipo <> 'aberto' then raise exception 'estagio_invalido' using errcode = '22023', hint = 'fechado'; end if;
      v_funil := e.funil_id;
    else
      if v_funil is null then
        select f.id into v_funil from public.nx_funis f where f.cliente_id = p_cliente and f.padrao and f.ativo limit 1;
        if v_funil is null then
          select f.id into v_funil from public.nx_funis f where f.cliente_id = p_cliente and f.ativo order by f.ordem limit 1;
        end if;
      end if;
      if v_funil is null then raise exception 'funil_invalido' using errcode = '22023', hint = 'nao_encontrado'; end if;
      select * into e from public.nx_estagios where funil_id = v_funil and tipo = 'aberto' order by ordem limit 1;
      if e.id is null then raise exception 'estagio_invalido' using errcode = '22023', hint = 'funil_sem_etapa'; end if;
    end if;

    insert into public.nx_leads (cliente_id, contato_id, funil_id, estagio_id, titulo, valor_previsto, dono_id,
                                 previsao_fechamento, consulta_em, servico, obs, campos, etiquetas, origem, atualizado_em)
    values (p_cliente, v_contato, e.funil_id, e.id,
            left(nullif(btrim(n ->> 'titulo'), ''), 120),
            public.nx_crm_num(n, 'valor_previsto'),
            case when n ? 'dono_id' then v_dono else v.conta_id end,
            public.nx_crm_data(n, 'previsao_fechamento'),
            public.nx_crm_ts(n, 'consulta_em'),
            left(nullif(btrim(n ->> 'servico'), ''), 120),
            left(nullif(btrim(n ->> 'obs'), ''), 5000),
            v_campos,
            public.nx_crm_etiquetas_ok(p_cliente, public.nx_crm_uuids(n, 'etiquetas')),
            coalesce(v_origem, 'manual'),
            now())
    returning * into l;

    if l.consulta_em is not null then v_aviso := public.nx_crm_aviso_agenda(p_cliente, l.id, v.conta_id); end if;

    -- "+ Oportunidade" da conversa: liga a conversa (do mesmo contato, visível) ao negócio novo
    v_conversa := public.nx_crm_int8(n, 'conversa_id');
    if v_conversa is not null then
      update public.nx_conversas cv set negocio_id = l.id
       where cv.id = v_conversa and cv.contato_id = l.contato_id
         and public.nx_cv_visivel(v, p_cliente, cv.id);
    end if;
    return (public.nx_crm_negocio_json(p_cliente, l.id, v)::jsonb
            || case when v_aviso is not null then jsonb_build_object('aviso_agenda', v_aviso) else '{}'::jsonb end)::json;
  end if;

  -- ---------------------------------------------------------- ATUALIZAR (só chaves presentes)
  select * into l from public.nx_leads where id = v_id and cliente_id = p_cliente for update;
  if l.id is null or (public.nx_crm_restrito(v) and l.dono_id is not null and l.dono_id <> v.conta_id) then
    raise exception 'negocio_nao_encontrado' using errcode = '22023';
  end if;
  v_ce_antes := l.consulta_em;
  if n ? 'valor' then
    v_valor := public.nx_crm_num(n, 'valor');
    if l.status = 'ganho' and v_valor is null then raise exception 'valor_obrigatorio' using errcode = '22023'; end if;
  end if;
  update public.nx_leads x set
    titulo = case when n ? 'titulo' then left(nullif(btrim(n ->> 'titulo'), ''), 120) else x.titulo end,
    valor_previsto = case when n ? 'valor_previsto' then public.nx_crm_num(n, 'valor_previsto') else x.valor_previsto end,
    valor = case when n ? 'valor' and x.status = 'ganho' then v_valor else x.valor end,
    dono_id = case when n ? 'dono_id' then v_dono else x.dono_id end,
    previsao_fechamento = case when n ? 'previsao_fechamento' then public.nx_crm_data(n, 'previsao_fechamento') else x.previsao_fechamento end,
    consulta_em = case when n ? 'consulta_em' then public.nx_crm_ts(n, 'consulta_em') else x.consulta_em end,
    -- só a data (sem hora): vale quando não veio consulta_em preenchido (com hora o gatilho deriva a data)
    data_consulta = case when n ? 'data_consulta' and nullif(n ->> 'consulta_em', '') is null
                         then public.nx_crm_data(n, 'data_consulta')
                         -- consulta_em apagado (negócio aberto que tinha hora marcada): a data da consulta sai junto
                         when n ? 'consulta_em' and nullif(n ->> 'consulta_em', '') is null and x.consulta_em is not null
                              and x.status = 'aberto' then null
                         else x.data_consulta end,
    servico = case when n ? 'servico' then left(nullif(btrim(n ->> 'servico'), ''), 120) else x.servico end,
    obs = case when n ? 'obs' then left(nullif(btrim(n ->> 'obs'), ''), 5000) else x.obs end,
    campos = case when n ? 'campos' then jsonb_strip_nulls(x.campos || coalesce(case when jsonb_typeof(n -> 'campos') = 'object' then n -> 'campos' end, '{}'::jsonb))
                  else x.campos end,
    etiquetas = case when n ? 'etiquetas' then public.nx_crm_etiquetas_ok(p_cliente, public.nx_crm_uuids(n, 'etiquetas')) else x.etiquetas end,
    origem = case when n ? 'origem' then coalesce(v_origem, x.origem) else x.origem end,
    atualizado_em = now()
  where x.id = l.id;
  if n ? 'consulta_em' and nullif(n ->> 'consulta_em', '') is not null then
    -- só quando a hora mudou
    if v_ce_antes is distinct from public.nx_crm_ts(n, 'consulta_em') then
      v_aviso := public.nx_crm_aviso_agenda(p_cliente, l.id, v.conta_id);
    end if;
  end if;
  return (public.nx_crm_negocio_json(p_cliente, l.id, v)::jsonb
          || case when v_aviso is not null then jsonb_build_object('aviso_agenda', v_aviso) else '{}'::jsonb end)::json;
end $$;

-- ------------------------------------------------------------
-- 18. Agenda: negócio ganho com consulta futura ocupa o horário; IA com trava antes de abrir negócio; duração do serviço do negócio; hint do início; truncamento (baixa · T06)
-- ------------------------------------------------------------
create or replace function public.nx_agenda_checar(p_cliente uuid, p_inicio timestamptz, p_servico text,
                                                   p_excluir bigint default null, p_encaixe boolean default false)
returns text
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  cfg jsonb; v_dur int; v_loc timestamp; v_dia date; v_ok boolean; v_n int;
begin
  if p_inicio is null then return 'dados_invalidos'; end if;
  if p_inicio <= now() then return 'passado'; end if;
  if coalesce(p_encaixe, false) then return null; end if;
  cfg := public.nx_agenda_cfg(p_cliente);
  v_dur := public.nx_agenda_dur(cfg, p_servico);
  if p_inicio < now() + make_interval(hours => (cfg ->> 'antecedencia_horas')::int) then return 'antecedencia'; end if;
  v_loc := p_inicio at time zone 'America/Sao_Paulo';
  v_dia := v_loc::date;
  if v_dia > (now() at time zone 'America/Sao_Paulo')::date + (cfg ->> 'dias_a_frente')::int then return 'fora_do_horario'; end if;
  select exists (select 1 from jsonb_array_elements(coalesce(cfg -> 'horario' -> ((extract(dow from v_dia)::int)::text), '[]'::jsonb)) f(value)
                  where v_dia + (f.value ->> 0)::time <= v_loc
                    and v_dia + (f.value ->> 1)::time >= v_loc + make_interval(mins => v_dur)) into v_ok;
  if not v_ok then return 'fora_do_horario'; end if;
  if exists (select 1 from jsonb_array_elements(cfg -> 'intervalos') i(value)
              where v_dia + (i.value ->> 0)::time < v_loc + make_interval(mins => v_dur)
                and v_dia + (i.value ->> 1)::time > v_loc) then
    return 'fora_do_horario';
  end if;
  if exists (select 1 from public.nx_agenda_bloqueios b
              where b.cliente_id = p_cliente and b.inicio < p_inicio + make_interval(mins => v_dur) and b.fim > p_inicio) then
    return 'fora_do_horario';
  end if;
  select count(*)::int into v_n from public.nx_leads l
   where l.cliente_id = p_cliente and l.status in ('aberto', 'ganho') and l.consulta_em is not null
     and l.id is distinct from p_excluir
     and l.consulta_em < p_inicio + make_interval(mins => v_dur)
     and l.consulta_em + make_interval(mins => public.nx_agenda_dur(cfg, l.servico)) > p_inicio;
  if v_n >= (cfg ->> 'capacidade')::int then return 'horario_ocupado'; end if;
  return null;
end $$;

create or replace function public.nx_agenda_slots(p_cliente uuid, p_de date, p_dias int, p_servico text default null,
                                                  p_excluir bigint default null)
returns table (t_inicio timestamptz, t_fim timestamptz, t_ocupados int, t_cap int)
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  cfg jsonb := public.nx_agenda_cfg(p_cliente);
  v_dur int := public.nx_agenda_dur(cfg, p_servico);
  v_passo int := coalesce((cfg ->> 'passo_min')::int, v_dur);
  v_cap int := (cfg ->> 'capacidade')::int;
  v_min timestamptz := now() + make_interval(hours => (cfg ->> 'antecedencia_horas')::int);
  v_ate date := (now() at time zone 'America/Sao_Paulo')::date + (cfg ->> 'dias_a_frente')::int;
  v_h jsonb := cfg -> 'horario';
  v_int jsonb := cfg -> 'intervalos';
begin
  return query
  with dias as (
    select g::date as dia from generate_series(p_de::timestamp, (p_de + (greatest(coalesce(p_dias, 1), 1) - 1))::timestamp, interval '1 day') g
  ),
  faixas as (
    select d.dia, (f.value ->> 0)::time as ini, (f.value ->> 1)::time as fim
      from dias d
      cross join lateral jsonb_array_elements(coalesce(v_h -> ((extract(dow from d.dia)::int)::text), '[]'::jsonb)) f(value)
     where d.dia <= v_ate
  ),
  cand as (
    select fa.dia, s as local_ini
      from faixas fa
      cross join lateral generate_series(fa.dia + fa.ini, fa.dia + fa.fim - make_interval(mins => v_dur),
                                         make_interval(mins => v_passo)) s
  ),
  c2 as (
    select c.local_ini, (c.local_ini at time zone 'America/Sao_Paulo') as ini_ts
      from cand c
     where (c.local_ini at time zone 'America/Sao_Paulo') >= v_min
       and not exists (select 1 from jsonb_array_elements(v_int) i(value)
                        where c.dia + (i.value ->> 0)::time < c.local_ini + make_interval(mins => v_dur)
                          and c.dia + (i.value ->> 1)::time > c.local_ini)
       and not exists (select 1 from public.nx_agenda_bloqueios b
                        where b.cliente_id = p_cliente
                          and b.inicio < (c.local_ini at time zone 'America/Sao_Paulo') + make_interval(mins => v_dur)
                          and b.fim > (c.local_ini at time zone 'America/Sao_Paulo'))
  )
  select k.ini_ts, k.ini_ts + make_interval(mins => v_dur),
         (select count(*)::int from public.nx_leads l
           where l.cliente_id = p_cliente and l.status in ('aberto', 'ganho') and l.consulta_em is not null
             and l.id is distinct from p_excluir
             and l.consulta_em < k.ini_ts + make_interval(mins => v_dur)
             and l.consulta_em + make_interval(mins => public.nx_agenda_dur(cfg, l.servico)) > k.ini_ts),
         v_cap
    from c2 k
   order by k.ini_ts;
end $$;

create or replace function public.nx_agenda_marcar_ia(p_canal uuid, p_telefone text, p_inicio timestamptz,
                                                      p_servico text default null, p_nome text default null,
                                                      p_observacao text default null, p_remarcar boolean default false)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.nx_canais; a jsonb; ct public.nx_contatos; v_neg bigint; v_funil uuid; v_nome text;
begin
  select * into k from public.nx_canais where id = p_canal and provedor = 'codewords';
  if k.id is null then raise exception 'canal_nao_encontrado' using errcode = '22023'; end if;
  if p_inicio is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'inicio'; end if;
  a := public.nx_codewords_alvo(p_canal, p_telefone);
  if (a ->> 'contato_id') is null then return json_build_object('ok', false, 'erro', 'contato_nao_encontrado'); end if;
  select * into ct from public.nx_contatos where id = (a ->> 'contato_id')::bigint and cliente_id = k.cliente_id;
  v_nome := left(nullif(btrim(regexp_replace(coalesce(p_nome, ''), '[[:cntrl:]]+', ' ', 'g')), ''), 160);
  if v_nome is not null and ct.nome is null then
    update public.nx_contatos set nome = v_nome where id = ct.id and nome is null;
  end if;
  -- a trava da agenda ANTES de procurar/abrir o negócio: dois «agendar» simultâneos não criam dois negócios abertos
  perform pg_advisory_xact_lock(hashtextextended('nx_agenda:' || k.cliente_id::text, 0));
  v_neg := public.nx_agenda_negocio_do_contato(k.cliente_id, ct.id, (a ->> 'negocio_id')::bigint);
  if v_neg is null then
    -- só há negócios fechados: a nova consulta abre um negócio novo no funil padrão
    select f.id into v_funil from public.nx_funis f where f.cliente_id = k.cliente_id and f.padrao and f.ativo limit 1;
    insert into public.nx_leads (cliente_id, nome, telefone, contato_id, origem, funil_id, etapa)
    values (k.cliente_id, coalesce(ct.nome, v_nome), coalesce(ct.telefone, ct.wa_id), ct.id, 'whatsapp', v_funil, 'nova')
    returning id into v_neg;
  end if;
  return public.nx_agenda_marcar_core(k.cliente_id, v_neg, p_inicio, p_servico, coalesce(p_remarcar, false), false, 'ia', p_observacao, null)::json;
end $$;

create or replace function public.nx_agenda_livres_ia(p_canal uuid, p_telefone text default null, p_servico text default null,
                                                      p_a_partir date default null, p_dias int default 7)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  k public.nx_canais; a jsonb; v_excluir bigint; cfg jsonb; r jsonb; v_serv text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_de date; v_dias int := least(greatest(coalesce(p_dias, 7), 1), 14);
begin
  select * into k from public.nx_canais where id = p_canal and provedor = 'codewords';
  if k.id is null then raise exception 'canal_nao_encontrado' using errcode = '22023'; end if;
  v_de := greatest(coalesce(p_a_partir, v_hoje), v_hoje);
  if p_telefone is not null and btrim(p_telefone) <> '' then
    a := public.nx_codewords_alvo(p_canal, p_telefone);
    if (a ->> 'contato_id') is not null then
      v_excluir := public.nx_agenda_negocio_do_contato(k.cliente_id, (a ->> 'contato_id')::bigint, (a ->> 'negocio_id')::bigint);
    end if;
  end if;
  cfg := public.nx_agenda_cfg(k.cliente_id);
  -- sem serviço no pedido: vale o do negócio do contato (marcar usa o mesmo) — o horário oferecido não é recusado depois
  v_serv := coalesce(nullif(btrim(p_servico), ''), (select l.servico from public.nx_leads l where l.id = v_excluir));
  -- livres, no máximo 4 por dia (dá variedade de dias) e 12 no total (os mais próximos)
  select coalesce(jsonb_agg(jsonb_build_object('inicio', public.nx_agenda_iso(y.t_inicio), 'rotulo', public.nx_agenda_rotulo(y.t_inicio))
                            order by y.t_inicio), '[]'::jsonb) into r
    from (select z.t_inicio
            from (select s.t_inicio,
                         row_number() over (partition by (s.t_inicio at time zone 'America/Sao_Paulo')::date order by s.t_inicio) as n_dia
                    from public.nx_agenda_slots(k.cliente_id, v_de, v_dias, v_serv, v_excluir) s
                   where s.t_ocupados < s.t_cap) z
           where z.n_dia <= 4 order by z.t_inicio limit 12) y;
  return json_build_object('ok', true, 'fuso', 'America/Sao_Paulo',
    'duracao_min', public.nx_agenda_dur(cfg, v_serv), 'horarios', r);
end $$;

create or replace function public.nx_agenda_livres(p_token text, p_cliente uuid, p_a_partir date default null,
                                                   p_dias int default 7, p_servico text default null, p_negocio bigint default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  cfg jsonb; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; r jsonb; v_serv text; v_trunc boolean := false;
  v_de date; v_dias int := least(greatest(coalesce(p_dias, 7), 1), 14);
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  cfg := public.nx_agenda_cfg(p_cliente);
  v_serv := coalesce(nullif(btrim(p_servico), ''), (select l.servico from public.nx_leads l where l.id = p_negocio and l.cliente_id = p_cliente));
  v_de := greatest(coalesce(p_a_partir, v_hoje), v_hoje);
  -- até 500 horários (por data); passou disso, «truncado» avisa que os dias mais à frente ficaram de fora
  select coalesce(jsonb_agg(jsonb_build_object('inicio', public.nx_agenda_iso(s.t_inicio), 'rotulo', public.nx_agenda_rotulo(s.t_inicio),
                                               'ocupados', s.t_ocupados, 'capacidade', s.t_cap, 'livre', s.t_ocupados < s.t_cap)
                            order by s.t_inicio) filter (where s.n <= 500), '[]'::jsonb),
         coalesce(bool_or(s.n > 500), false)
    into r, v_trunc
    from (select z.*, row_number() over (order by z.t_inicio) as n
            from public.nx_agenda_slots(p_cliente, v_de, v_dias, v_serv, p_negocio) z order by z.t_inicio limit 501) s;
  return json_build_object('fuso', 'America/Sao_Paulo', 'duracao_min', public.nx_agenda_dur(cfg, v_serv), 'horarios', r,
                           'truncado', v_trunc);
end $$;

create or replace function public.nx_agenda_marcar(p_token text, p_cliente uuid, p_negocio bigint, p_inicio text,
                                                   p_servico text default null, p_encaixe boolean default false,
                                                   p_observacao text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  l public.nx_leads; v_ini timestamptz;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  begin
    v_ini := public.nx_crm_ts(jsonb_build_object('t', p_inicio), 't');
  exception when others then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'inicio';
  end;
  if v_ini is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'inicio'; end if;
  select * into l from public.nx_leads where id = p_negocio and cliente_id = p_cliente;
  if l.id is null or (public.nx_crm_restrito(v) and l.dono_id is not null and l.dono_id <> v.conta_id) then
    raise exception 'negocio_nao_encontrado' using errcode = '22023';
  end if;
  return public.nx_agenda_marcar_core(p_cliente, p_negocio, v_ini, p_servico, true, coalesce(p_encaixe, false), 'painel',
                                      p_observacao, v.conta_id)::json;
end $$;

-- ------------------------------------------------------------
-- 19. nx_dados: lê com o teste vencido (admin conferido à parte) e devolve erro_envio dos alertas (média · T07)
-- ------------------------------------------------------------
create or replace function public.nx_dados(p_token text, p_cliente uuid, p_dias integer default 130)
 returns json
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura'); v_de date;
begin
  -- teste vencido bloqueia só ESCRITA (ESPEC §4.10): o nx_ctx deixa passar a leitura, o papel de admin é conferido aqui
  if public.nx_rank(v.papel) < public.nx_rank('admin') then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if v.papel not in ('gestor', 'super') then perform public.nx_exigir_modulo(p_cliente, 'ads'); end if;
  v_de := (now() at time zone 'America/Sao_Paulo')::date - least(greatest(coalesce(p_dias, 130), 7), 400);
  return json_build_object(
    'hoje', (now() at time zone 'America/Sao_Paulo')::date,
    'cliente', (select json_build_object('id', id, 'slug', slug, 'nome', nome, 'cfg', public.nx_cfg_publico(cfg, v.papel, 'dados')) from public.nx_clientes where id = p_cliente),
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
               where cliente_id = p_cliente and (data_conversa >= v_de or data_consulta >= v_de or etapa in ('nova', 'agendada'))
                 and (nx_leads.funil_id is null or exists (select 1 from public.nx_funis f where f.id = nx_leads.funil_id and f.conta_no_ads))) l), '[]'::json),
    'alertas', coalesce((
      select json_agg(row_to_json(a) order by a.criado_em desc)
        from (select regra, chave, severidade, mensagem, acao, referencia, criado_em, enviado_em, entregue_em, erro_envio
                from public.nx_alertas where cliente_id = p_cliente and criado_em > now() - interval '15 days') a), '[]'::json),
    'relatorios', coalesce((
      select json_agg(row_to_json(r) order by r.referencia desc)
        from (select tipo, referencia, texto, leitura_ia, enviado_em, erro, entregue_em
                from public.nx_relatorios where cliente_id = p_cliente order by referencia desc limit 20) r), '[]'::json),
    'integracoes', coalesce((
      select json_agg(json_build_object('canal', canal, 'ativo', ativo, 'ultimo_sync', ultimo_sync, 'status', status))
        from public.nx_integracoes where cliente_id = p_cliente), '[]'::json));
end $function$;

-- ------------------------------------------------------------
-- 20. Limites do plano: contagem atômica, sem passar do teto em chamadas paralelas (média · T08)
-- ------------------------------------------------------------
-- a checagem lia o uso, comparava e só depois inseria, sem trava: 40 chamadas paralelas de convite criaram 4 convites num
-- plano de 3 usuários. Agora cada (cliente, chave) e cada (organização, chave) tem uma trava de transação; quem chega
-- depois conta DEPOIS de o anterior gravar (por isso as duas funções deixam de ser STABLE: o instantâneo é novo a cada comando).
-- Ordem das travas: organização primeiro, depois cliente (sem ciclo entre chamadas).
-- nx_uso_org: a MESMA conta para o que a tela mostra e para o que o limite aplica (acessos + convites pendentes de CLIENTE;
-- o convite de gestor não ocupa vaga de usuário de cliente).

create or replace function public.nx_uso_org(p_org uuid, p_chave text)
returns int
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return case p_chave
    when 'empresas' then (select count(*) from public.nx_clientes c where c.org_id = p_org)::int
    when 'canais' then (select count(*) from public.nx_canais k join public.nx_clientes c on c.id = k.cliente_id where c.org_id = p_org)::int
    when 'usuarios' then ((select count(*) from public.nx_acessos a join public.nx_clientes c on c.id = a.cliente_id where c.org_id = p_org)
                        + (select count(*) from public.nx_convites v
                            where v.org_id = p_org and v.cliente_id is not null and v.usado_em is null and not v.revogado
                              and v.expira_em > now() and v.tentativas < 5))::int
    else 0 end;
end $$;

create or replace function public.nx_exigir_limite_org(p_org uuid, p_chave text, p_novos int default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.nx_orgs; v_lim int; v_uso int;
begin
  if p_chave not in ('empresas', 'usuarios', 'canais') then return; end if;
  select * into o from public.nx_orgs where id = p_org;
  if o.id is null or o.tipo <> 'revenda' or not (o.limites ? p_chave)
     or jsonb_typeof(o.limites -> p_chave) <> 'number' then
    return;
  end if;
  v_lim := floor((o.limites ->> p_chave)::numeric)::int;
  perform pg_advisory_xact_lock(hashtextextended('nx_limite_org:' || p_org::text || ':' || p_chave, 0));
  v_uso := public.nx_uso_org(p_org, p_chave);
  if v_uso + coalesce(p_novos, 1) > v_lim then
    raise exception 'limite_plano' using errcode = '22023', hint = 'org_' || p_chave || ':' || v_lim;
  end if;
end $$;

create or replace function public.nx_exigir_limite(p_cliente uuid, p_chave text, p_novos int default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_lim int;
begin
  -- organização primeiro (a trava dela vem antes da do cliente)
  if p_chave in ('usuarios', 'canais', 'empresas') then
    perform public.nx_exigir_limite_org((select c.org_id from public.nx_clientes c where c.id = p_cliente),
                                        p_chave, p_novos);
  end if;
  if p_chave <> 'empresas' then
    v_lim := public.nx_limite(p_cliente, p_chave);
    if v_lim is not null then
      perform pg_advisory_xact_lock(hashtextextended('nx_limite:' || p_cliente::text || ':' || p_chave, 0));
      if public.nx_uso(p_cliente, p_chave) + coalesce(p_novos, 1) > v_lim then
        raise exception 'limite_plano' using errcode = '22023', hint = p_chave || ':' || v_lim;
      end if;
    end if;
  end if;
end $$;

-- ------------------------------------------------------------
-- 21. Limites: canal criado pelo wa_phone_number_id e contato criado pelo lead respeitam o plano; uso da revenda = limite (média + baixa · T08)
-- ------------------------------------------------------------
create or replace function public.nx_tg_cliente_canal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('nx.sem_gatilho_canal', true) = '1' then return null; end if;
  if new.wa_phone_number_id is not null
     and not exists (select 1 from public.nx_canais k where k.phone_number_id = new.wa_phone_number_id) then
    perform public.nx_exigir_limite(new.id, 'canais', 1);
    insert into public.nx_canais (cliente_id, nome, phone_number_id, status, departamento_id)
    values (new.id, 'WhatsApp principal', new.wa_phone_number_id, 'pendente',
            (select d.id from public.nx_departamentos d where d.cliente_id = new.id and d.padrao limit 1));
  end if;
  return null;
end $$;

create or replace function public.nx_lead_salvar(p_token text, p_cliente uuid, p_lead jsonb)
 returns json
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  v_id bigint := nullif(p_lead->>'id', '')::bigint;
  r public.nx_leads;
begin
  if v_id is null then
    -- o contato que o gatilho do negócio cria também conta no limite de contatos do plano
    if nullif(regexp_replace(coalesce(p_lead->>'telefone', ''), '\D', '', 'g'), '') is not null
       and public.nx_tel_normalizar(p_lead->>'telefone') is not null
       and public.nx_contato_por_tel(p_cliente, p_lead->>'telefone') is null then
      perform public.nx_exigir_limite(p_cliente, 'contatos', 1);
    end if;
    insert into public.nx_leads (cliente_id, nome, telefone, origem, plataforma, campanha_ext, servico, etapa,
                                 data_conversa, data_agenda, data_consulta, valor, obs)
    values (p_cliente,
            nullif(trim(p_lead->>'nome'), ''),
            nullif(regexp_replace(coalesce(p_lead->>'telefone', ''), '\D', '', 'g'), ''),
            coalesce(nullif(p_lead->>'origem', ''), 'manual'),
            nullif(p_lead->>'plataforma', ''),
            nullif(p_lead->>'campanha_ext', ''),
            nullif(p_lead->>'servico', ''),
            coalesce(nullif(p_lead->>'etapa', ''), 'nova'),
            coalesce(nullif(p_lead->>'data_conversa', '')::date, (now() at time zone 'America/Sao_Paulo')::date),
            nullif(p_lead->>'data_agenda', '')::date,
            nullif(p_lead->>'data_consulta', '')::date,
            nullif(p_lead->>'valor', '')::numeric,
            nullif(p_lead->>'obs', ''))
    returning * into r;
  else
    update public.nx_leads set
      nome          = case when p_lead ? 'nome' then nullif(trim(p_lead->>'nome'), '') else nome end,
      telefone      = case when p_lead ? 'telefone' then nullif(regexp_replace(coalesce(p_lead->>'telefone', ''), '\D', '', 'g'), '') else telefone end,
      origem        = case when p_lead ? 'origem' then coalesce(nullif(p_lead->>'origem', ''), origem) else origem end,
      plataforma    = case when p_lead ? 'plataforma' then nullif(p_lead->>'plataforma', '') else plataforma end,
      campanha_ext  = case when p_lead ? 'campanha_ext' then nullif(p_lead->>'campanha_ext', '') else campanha_ext end,
      servico       = case when p_lead ? 'servico' then nullif(p_lead->>'servico', '') else servico end,
      etapa         = case when p_lead ? 'etapa' then coalesce(nullif(p_lead->>'etapa', ''), etapa) else etapa end,
      data_agenda   = case when p_lead ? 'data_agenda' then nullif(p_lead->>'data_agenda', '')::date else data_agenda end,
      data_consulta = case when p_lead ? 'data_consulta' then nullif(p_lead->>'data_consulta', '')::date else data_consulta end,
      valor         = case when p_lead ? 'valor' then nullif(p_lead->>'valor', '')::numeric else valor end,
      obs           = case when p_lead ? 'obs' then nullif(p_lead->>'obs', '') else obs end,
      atualizado_em = now()
    where id = v_id and cliente_id = p_cliente
    returning * into r;
    if r.id is null then raise exception 'lead_nao_encontrado'; end if;
  end if;
  return row_to_json(r);
end $function$;

create or replace function public.nx_uso_plano(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  x public.nx_clientes;
  o public.nx_orgs;
  p public.nx_planos;
  v_mb numeric;
begin
  select * into x from public.nx_clientes where id = p_cliente;
  select * into o from public.nx_orgs where id = x.org_id;
  select * into p from public.nx_planos where id = x.plano;
  select round(coalesce(sum((s.metadata ->> 'size')::bigint), 0) / 1048576.0, 1) into v_mb
    from storage.objects s where s.bucket_id = 'nx-midia' and s.name like p_cliente::text || '/%';
  return json_build_object(
    -- white-label: o preço de tabela da plataforma não aparece para a equipe do cliente de uma REVENDA
    -- (a agência cobra o preço dela); gestor/super e clientes diretos da plataforma veem
    'plano', json_build_object('id', p.id, 'nome', p.nome,
                               'preco_mensal', case when o.tipo = 'plataforma' or v.papel in ('gestor', 'super') then p.preco_mensal end),
    'status', x.status, 'teste_ate', x.teste_ate, 'modulos', x.modulos,
    'uso', json_build_object('usuarios', public.nx_uso(x.id, 'usuarios'), 'canais', public.nx_uso(x.id, 'canais'),
                             'funis', public.nx_uso(x.id, 'funis'), 'automacoes', public.nx_uso(x.id, 'automacoes'),
                             'contatos', (select count(*) from (select 1 from public.nx_contatos k where k.cliente_id = x.id limit 200001) s),
                             'ia_mes', public.nx_uso(x.id, 'ia_mes')),
    'limites', json_build_object('usuarios', public.nx_limite(x.id, 'usuarios'), 'canais', public.nx_limite(x.id, 'canais'),
                                 'funis', public.nx_limite(x.id, 'funis'), 'automacoes', public.nx_limite(x.id, 'automacoes'),
                                 'contatos', public.nx_limite(x.id, 'contatos'), 'ia_mes', public.nx_limite(x.id, 'ia_mes')),
    'org', case when o.tipo = 'revenda' and v.papel in ('gestor', 'super') then json_build_object(
             'uso', json_build_object(
               'empresas', public.nx_uso_org(o.id, 'empresas'),
               'usuarios', public.nx_uso_org(o.id, 'usuarios'),
               'canais', public.nx_uso_org(o.id, 'canais')),
             'limites', o.limites) end,
    'storage_mb', v_mb);
end $$;

create or replace function public.nx_orgs_listar(p_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare c public.nx_contas := public.nx_exigir_gestor(p_token); v_super boolean := public.nx_super(c);
begin
  return coalesce((
    select json_agg(json_build_object(
             'id', o.id, 'slug', o.slug, 'nome', o.nome, 'tipo', o.tipo, 'status', o.status, 'marca', o.marca, 'limites', o.limites,
             'empresas', public.nx_uso_org(o.id, 'empresas'),
             'usuarios', public.nx_uso_org(o.id, 'usuarios'),
             'canais', public.nx_uso_org(o.id, 'canais'))
           order by (o.tipo = 'plataforma') desc, o.nome)
      from public.nx_orgs o
     where v_super or o.id = c.org_id), '[]'::json);
end $$;

-- ------------------------------------------------------------
-- 22. Convites, contas e domínios (baixa · T08)
-- ------------------------------------------------------------
-- · revogar um convite já revogado devolve erro (e não grava outra linha de auditoria);
-- · nx_conta_definir grava auditoria (papel/aprovação/acessos); · domínio com rótulo DNS acima de 63 caracteres é recusado

create or replace function public.nx_convite_revogar(p_token text, p_cliente uuid, p_convite uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare c public.nx_contas := public.nx_conta_do_token(p_token); v public.nx_ctx_t; cv public.nx_convites;
begin
  if p_cliente is not null then
    v := public.nx_ctx(p_token, p_cliente, 'admin');
    update public.nx_convites set revogado = true
     where id = p_convite and cliente_id = p_cliente and usado_em is null and not revogado
    returning * into cv;
  else
    -- convite de gestor: gestor da própria org; super qualquer
    select * into cv from public.nx_convites where id = p_convite and cliente_id is null and usado_em is null and not revogado;
    if cv.id is not null and not (public.nx_super(c) or (c.papel = 'gestor' and cv.org_id = c.org_id)) then
      cv := null;
    end if;
    if cv.id is not null then update public.nx_convites set revogado = true where id = cv.id; end if;
  end if;
  if cv.id is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'convite'; end if;
  perform public.nx_auditar(cv.org_id, cv.cliente_id, c.id, 'convite_revogado', jsonb_build_object('convite', cv.id));
  return json_build_object('ok', true);
end $$;

create or replace function public.nx_conta_definir(p_token text, p_conta uuid, p_aprovado boolean, p_papel text, p_clientes uuid[])
 returns json
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare
  c public.nx_contas := public.nx_exigir_gestor(p_token);
  v_super boolean := public.nx_super(c);
  alvo public.nx_contas;
  v_cli uuid;
begin
  if p_papel is null or p_papel not in ('gestor', 'clinica') then raise exception 'papel_invalido'; end if;
  if p_conta = c.id and (p_papel <> 'gestor' or p_aprovado is false) then raise exception 'nao_pode_rebaixar_a_si'; end if;
  select * into alvo from public.nx_contas where id = p_conta;
  if alvo.id is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'conta'; end if;
  if not v_super then
    if not public.nx_conta_no_escopo(c, p_conta, null) then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
    if p_papel = 'gestor' and alvo.org_id is distinct from c.org_id then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
  end if;
  foreach v_cli in array coalesce(p_clientes, '{}'::uuid[]) loop
    if not public.nx_pode(c, v_cli) then raise exception 'sem_acesso' using errcode = '42501'; end if;
  end loop;
  update public.nx_contas set aprovado = coalesce(p_aprovado, aprovado), papel = p_papel where id = p_conta;
  delete from public.nx_acessos where conta_id = p_conta and not (cliente_id = any(coalesce(p_clientes, '{}'::uuid[])));
  -- um a um: o limite 'usuarios' (cliente e soma da org) conta os que já entraram nesta chamada
  foreach v_cli in array coalesce(p_clientes, '{}'::uuid[]) loop
    if not exists (select 1 from public.nx_acessos a where a.conta_id = p_conta and a.cliente_id = v_cli) then
      if not v_super then perform public.nx_exigir_limite(v_cli, 'usuarios', 1); end if;
      insert into public.nx_acessos (conta_id, cliente_id) values (p_conta, v_cli) on conflict do nothing;
    end if;
  end loop;
  if p_aprovado is false then delete from public.nx_sessoes where conta_id = p_conta; end if;
  perform public.nx_auditar(alvo.org_id, null, c.id, 'conta_definida',
    jsonb_build_object('conta', p_conta, 'papel', p_papel, 'aprovado', coalesce(p_aprovado, alvo.aprovado),
                       'clientes', to_jsonb(coalesce(p_clientes, '{}'::uuid[]))));
  return public.nx_contas_listar(p_token);
end $function$;

create or replace function public.nx_dominio_salvar(p_token text, p_host text, p_cliente uuid default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.nx_contas := public.nx_exigir_gestor(p_token);
  v_super boolean := public.nx_super(c);
  v_host text := lower(btrim(coalesce(p_host, '')));
  v_org uuid;
  v_alvo text := (select lower(substring(nullif(btrim(x.saas_url), '') from '^https?://([^/:]+)')) from public.nx_config x where x.id = 1);
begin
  -- aceita quem colou com protocolo ou barra no fim
  v_host := regexp_replace(regexp_replace(v_host, '^https?://', ''), '/.*$', '');
  if v_host !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' or char_length(v_host) > 253
     or v_host ~ '[a-z0-9-]{64,}'     -- rótulo DNS com mais de 63 caracteres
     or v_host = v_alvo or v_host ~ '(^|\.)(netlify\.app|github\.io|supabase\.co)$' then
    raise exception 'dominio_invalido' using errcode = '22023';
  end if;
  if p_cliente is not null then
    -- gestor só em cliente da PRÓPRIA org (o nx_pode aceitaria um acesso comum da conta num cliente de outra org)
    select x.org_id into v_org from public.nx_clientes x where x.id = p_cliente;
    if v_org is null or (not v_super and v_org is distinct from c.org_id) then
      raise exception 'sem_acesso' using errcode = '42501';
    end if;
  else
    v_org := c.org_id;
  end if;
  if exists (select 1 from public.nx_dominios d where d.host = v_host) then
    raise exception 'dominio_em_uso' using errcode = '22023';
  end if;
  insert into public.nx_dominios (host, org_id, cliente_id, status) values (v_host, v_org, p_cliente, 'pendente');
  perform public.nx_auditar(v_org, p_cliente, c.id, 'dominio', jsonb_build_object('host', v_host, 'acao', 'criado'));
  return public.nx_dominios_listar(p_token);
end $$;

-- ------------------------------------------------------------
-- 23. nx_cliente_salvar: o cfg é conferido no servidor (baixa · T07)
-- ------------------------------------------------------------
-- um cfg torto (regrasOff como número, ticket com texto) derrubava o radar do cliente: só a tela validava.
create or replace function public.nx_cfg_validar(p jsonb)
returns void
language plpgsql immutable
security definer
set search_path = ''
as $$
declare k text; v jsonb; z record;
begin
  if p is null or jsonb_typeof(p) = 'null' then return; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'cfg'; end if;
  foreach k in array array['cpaAlvo', 'orcamento', 'fee'] loop
    v := p -> k;
    if v is null or jsonb_typeof(v) = 'null' then continue; end if;
    if not (jsonb_typeof(v) = 'number' or (jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[0-9]+([.,][0-9]+)?$'))
       or (case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > 1000000000 else false end) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = k;
    end if;
  end loop;
  v := p -> 'regrasOff';
  if v is not null and jsonb_typeof(v) <> 'null' then
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 100
       or exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') > 60) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'regrasOff';
    end if;
  end if;
  v := p -> 'ticket';
  if v is not null and jsonb_typeof(v) <> 'null' then
    if jsonb_typeof(v) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'ticket'; end if;
    for z in select e.key, e.value from jsonb_each(v) e loop
      if jsonb_typeof(z.value) <> 'number' or (z.value #>> '{}')::numeric < 0 or (z.value #>> '{}')::numeric > 1000000000 then
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'ticket';
      end if;
    end loop;
  end if;
  v := p -> 'proximos';
  if v is not null and jsonb_typeof(v) <> 'null' then
    if jsonb_typeof(v) <> 'object'
       or exists (select 1 from jsonb_each(v) e where jsonb_typeof(e.value) <> 'string') then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'proximos';
    end if;
  end if;
  foreach k in array array['waGestor', 'waCliente'] loop
    v := p -> k;
    if v is null or jsonb_typeof(v) = 'null' or jsonb_typeof(v) = 'string' then continue; end if;
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 50
       or exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) not in ('string', 'number')) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = k;
    end if;
  end loop;
end $$;

create or replace function public.nx_cliente_salvar(p_token text, p_cliente jsonb)
 returns json
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare
  c public.nx_contas := public.nx_exigir_gestor(p_token);
  v_id uuid := nullif(p_cliente->>'id', '')::uuid;
  v_org uuid;
  o public.nx_orgs;
  v_plano text;
  v_mod text[];
  v_pid text := nullif(trim(coalesce(p_cliente->>'wa_phone_number_id', '')), '');
  r public.nx_clientes;
begin
  if v_id is not null and not public.nx_pode(c, v_id) then raise exception 'sem_acesso' using errcode = '42501'; end if;
  if p_cliente ? 'cfg' then perform public.nx_cfg_validar(p_cliente -> 'cfg'); end if;
  if p_cliente ? 'wa_phone_number_id' and v_pid is not null
     and (exists (select 1 from public.nx_canais k where k.phone_number_id = v_pid and k.cliente_id is distinct from v_id)
          or exists (select 1 from public.nx_clientes x where x.wa_phone_number_id = v_pid and x.id is distinct from v_id)) then
    raise exception 'numero_em_uso' using errcode = '22023';
  end if;
  if v_id is null then
    v_org := c.org_id;
    if public.nx_super(c) and nullif(p_cliente->>'org_id', '') is not null then
      begin
        v_org := (p_cliente->>'org_id')::uuid;
      exception when others then
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'org_id';
      end;
    end if;
    select * into o from public.nx_orgs where id = v_org;
    if o.id is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'org_id'; end if;
    v_plano := case when o.tipo = 'plataforma' then 'interno'
                    else coalesce(nullif(o.limites ->> 'plano_padrao', ''), 'essencial') end;
    select p.modulos into v_mod from public.nx_planos p where p.id = v_plano;
    if v_mod is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'plano'; end if;
    perform public.nx_exigir_limite_org(v_org, 'empresas', 1);
    insert into public.nx_clientes (slug, nome, cfg, wa_phone_number_id, org_id, plano, modulos)
    values (lower(trim(p_cliente->>'slug')), trim(p_cliente->>'nome'),
            coalesce(p_cliente->'cfg', '{}'::jsonb), v_pid, v_org, v_plano, v_mod)
    returning * into r;
  else
    update public.nx_clientes set
      nome = coalesce(nullif(trim(p_cliente->>'nome'), ''), nome),
      slug = coalesce(nullif(lower(trim(p_cliente->>'slug')), ''), slug),
      ativo = coalesce((p_cliente->>'ativo')::boolean, ativo),
      cfg = case when p_cliente ? 'cfg' then cfg || (p_cliente->'cfg') else cfg end,
      wa_phone_number_id = case when p_cliente ? 'wa_phone_number_id'
                                then nullif(trim(coalesce(p_cliente->>'wa_phone_number_id', '')), '') else wa_phone_number_id end
    where id = v_id returning * into r;
    if r.id is null then raise exception 'cliente_nao_encontrado'; end if;
  end if;
  return json_build_object('id', r.id, 'slug', r.slug, 'nome', r.nome, 'ativo', r.ativo, 'cfg', r.cfg, 'wa_phone_number_id', r.wa_phone_number_id);
end $function$;

-- ------------------------------------------------------------
-- 24. nx_entrar: e-mail inexistente custa o mesmo que senha errada (média, parcial · T10)
-- ------------------------------------------------------------
-- só o tempo igual: o limite de tentativas por conta exige gravar a falha FORA da transação que lança o erro (autonomous
-- transaction) ou mudar o contrato de erro do login — fica para o gateway (ver estado/F8.md, «Pendências da rodada»).

CREATE OR REPLACE FUNCTION public.nx_entrar(p_email text, p_senha text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare c public.nx_contas; v_token text;
begin
  select * into c from public.nx_contas where email = lower(trim(coalesce(p_email, '')));
  -- e-mail inexistente também paga uma verificação bcrypt (mesmo custo das contas), senão o tempo entrega quais e-mails existem
  if c.id is null then perform crypt(coalesce(p_senha, ''), gen_salt('bf', 10)); end if;
  if c.id is null or c.senha_hash <> crypt(coalesce(p_senha, ''), c.senha_hash) then
    perform pg_sleep(0.4);
    raise exception 'credenciais_invalidas';
  end if;
  if not c.aprovado then raise exception 'conta_pendente'; end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(v_token), c.id, now() + interval '30 days');
  delete from public.nx_sessoes where expira_em < now();
  return json_build_object('token', v_token, 'nome', c.nome, 'papel', c.papel);
end $function$;

-- ------------------------------------------------------------
-- 25. nx_rastreio_registrar: limite de taxa devolve 400 (era 500) (baixa · T10)
-- ------------------------------------------------------------
create or replace function public.nx_rastreio_registrar(p_chave text, p_dados jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  cli public.nx_clientes; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_min int; v_hora int; v_id bigint; v_cod text; v_pagina text;
begin
  if p_chave is null or p_chave !~ '^[0-9a-f]{48}$' then return json_build_object('ok', true, 'codigo', public.nx_rastreio_codigo_novo()); end if;
  select * into cli from public.nx_clientes c where c.entrada_chave = p_chave;
  if cli.id is null
     or not coalesce(cli.ativo, true)
     or coalesce(cli.status, 'ativo') not in ('ativo', 'teste')
     or (cli.status = 'teste' and cli.teste_ate is not null and cli.teste_ate < v_hoje)
     or not ('crm' = any(coalesce(cli.modulos, '{}'::text[])))
     or exists (select 1 from public.nx_orgs o where o.id = cli.org_id and o.status in ('suspenso', 'cancelado')) then
    return json_build_object('ok', true, 'codigo', public.nx_rastreio_codigo_novo());
  end if;

  perform pg_advisory_xact_lock(hashtextextended('nx_rastreio:' || cli.id::text, 0));
  select count(*) filter (where r.criado_em > now() - interval '1 minute')::int, count(*)::int into v_min, v_hora
    from public.nx_rastreio r where r.cliente_id = cli.id and r.criado_em > now() - interval '1 hour';
  if v_min >= 30 or v_hora >= 300 then raise exception 'limite_taxa' using errcode = '22023'; end if;
  delete from public.nx_rastreio r where r.cliente_id = cli.id and r.criado_em < now() - interval '45 days';

  -- página: só endereço (sem ? nem #), http(s)
  v_pagina := public.nx_rastreio_txt(jsonb_build_object('p', split_part(split_part(coalesce(d ->> 'pagina', ''), '#', 1), '?', 1)), 'p', 300);
  if v_pagina is not null and v_pagina !~* '^https?://' then v_pagina := null; end if;

  for i in 1..6 loop
    v_id := null;
    v_cod := public.nx_rastreio_codigo_novo();
    insert into public.nx_rastreio (cliente_id, codigo, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
                                    gclid, gbraid, wbraid, fbclid, pagina)
    values (cli.id, v_cod,
            public.nx_rastreio_txt(d, 'utm_source', 100), public.nx_rastreio_txt(d, 'utm_medium', 100),
            public.nx_rastreio_txt(d, 'utm_campaign', 150), public.nx_rastreio_txt(d, 'utm_content', 150),
            public.nx_rastreio_txt(d, 'utm_term', 150),
            public.nx_rastreio_txt(d, 'gclid', 250, true), public.nx_rastreio_txt(d, 'gbraid', 250, true),
            public.nx_rastreio_txt(d, 'wbraid', 250, true), public.nx_rastreio_txt(d, 'fbclid', 250, true), v_pagina)
    on conflict (cliente_id, codigo) do nothing
    returning id into v_id;
    exit when v_id is not null;
  end loop;
  if v_id is null then raise exception 'falha_temporaria' using errcode = '54000'; end if;
  return json_build_object('ok', true, 'codigo', v_cod);
end $$;

-- ------------------------------------------------------------
-- 26. Fila de envio: item pego mas nunca entregue ao processo volta para a fila; envio incerto deixa rastro na conversa (média + baixa · T04/T10)
-- ------------------------------------------------------------
-- Se a chamada nx_fila_pegar estourava o prazo no cliente (banco lento) DEPOIS de o banco marcar 'enviando', o processo nunca
-- recebia os itens e, 10 min depois, eles viravam «STATUS INCERTO» sem nunca terem sido enviados. A nx-enviar passa a mandar
-- um lote (cabeçalho x-fila-lote, lido do request.headers do PostgREST: a assinatura da função NÃO muda) e, se a chamada
-- falhar, devolve o lote (nx_fila_devolver_lote): como o processo NUNCA recebeu os itens, nenhum foi enviado e voltar para
-- 'pendente' é seguro. Sem o cabeçalho (nx-enviar atual) tudo continua igual.
alter table public.nx_envios_fila add column if not exists lote uuid;
create index if not exists nx_envios_fila_lote on public.nx_envios_fila (lote) where status = 'enviando';

create or replace function public.nx_fila_devolver_lote(p_lote uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  if p_lote is null then return 0; end if;
  with d as (
    update public.nx_envios_fila f set status = 'pendente', pego_em = null, lote = null,
           tentativas = greatest(f.tentativas - 1, 0)
     where f.lote = p_lote and f.status = 'enviando'
    returning f.id)
  select count(*)::int into v_n from d;
  return v_n;
end $$;

create or replace function public.nx_fila_pegar(p_limite int default 20, p_ids bigint[] default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v_ids bigint[]; v_lim int := greatest(1, least(coalesce(p_limite, 20), 100)); v json; v_lote uuid;
begin
  if p_ids is null then
    select array_agg(s.id) into v_ids from (
      select f.id from public.nx_envios_fila f
       where f.status = 'pendente' and f.enviar_em <= now()
       order by f.enviar_em, f.id
       limit v_lim
       for update skip locked) s;
  else
    select array_agg(s.id) into v_ids from (
      select f.id from public.nx_envios_fila f
       where f.id = any(p_ids) and f.status = 'pendente'
       order by f.id
       limit v_lim
       for update skip locked) s;
  end if;
  if v_ids is null then return '[]'::json; end if;

  -- lote do processo que pegou (cabeçalho x-fila-lote): se a resposta se perder, a nx-enviar devolve o lote
  begin
    v_lote := nullif(current_setting('request.headers', true)::json ->> 'x-fila-lote', '')::uuid;
  exception when others then v_lote := null;
  end;
  update public.nx_envios_fila set status = 'enviando', tentativas = tentativas + 1, lote = v_lote where id = any(v_ids);

  select coalesce(json_agg(json_build_object(
      'id', f.id, 'cliente_id', f.cliente_id, 'conversa_id', f.conversa_id,
      'contato_id', coalesce(f.contato_id, cv.contato_id), 'canal_id', coalesce(f.canal_id, cv.canal_id),
      'tipo', f.tipo, 'texto', f.texto, 'template', f.template, 'origem', f.origem,
      'automacao_id', f.automacao_id, 'criado_por', f.criado_por, 'enviar_em', f.enviar_em,
      'tentativas', f.tentativas,
      'conversa', case when cv.id is not null then json_build_object('id', cv.id, 'status', cv.status,
                                                                   'ultima_entrada_em', cv.ultima_entrada_em) end,
      'janela_aberta', coalesce(cv.ultima_entrada_em > now() - interval '24 hours', false),
      'contato', case when ct.id is not null then json_build_object('id', ct.id, 'wa_id', ct.wa_id,
                   'telefone', ct.telefone, 'nome', ct.nome, 'optin_marketing', ct.optin_marketing,
                   'bloqueado', ct.bloqueado) end,
      'modelo', (select json_build_object('id', t.id, 'nome', t.nome, 'idioma', t.idioma, 'categoria', t.categoria,
                                          'status', t.status, 'corpo', t.corpo, 'num_parametros', t.num_parametros,
                                          'componentes', t.componentes)
                   from public.nx_templates t
                  where f.tipo = 'template' and t.cliente_id = f.cliente_id
                    and t.canal_id = coalesce(f.canal_id, cv.canal_id)
                    and (case when coalesce(f.template ->> 'template_id', f.template ->> 'id', '')
                                   ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                              then t.id = coalesce(f.template ->> 'template_id', f.template ->> 'id')::uuid
                              else t.nome = f.template ->> 'nome'
                                   and t.idioma = coalesce(nullif(f.template ->> 'idioma', ''), t.idioma) end)
                  order by (t.status = 'APPROVED') desc, t.sincronizado_em desc
                  limit 1)
    ) order by f.id), '[]'::json)
    into v
    from public.nx_envios_fila f
    left join public.nx_conversas cv on cv.id = f.conversa_id and cv.cliente_id = f.cliente_id
    left join public.nx_contatos ct on ct.id = coalesce(f.contato_id, cv.contato_id) and ct.cliente_id = f.cliente_id
   where f.id = any(v_ids);
  return v;
end $$;

create or replace function public.nx_fila_chamar()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  for r in
    with u as (
      update public.nx_envios_fila f set
        status = 'falhou',
        erro = left(case when coalesce(f.erro, '') = ''
          then 'STATUS INCERTO: o processo foi interrompido durante o envio; confira a conversa antes de reenviar.'
          else f.erro || ' · STATUS INCERTO: o processo foi interrompido durante o envio; confira a conversa antes de reenviar.'
        end, 1000),
        processado_em = clock_timestamp(),
        pego_em = null
      where f.status = 'enviando'
        and coalesce(f.pego_em, f.enviar_em + interval '50 minutes') < clock_timestamp() - interval '10 minutes'
      returning f.id, f.conversa_id)
    select u.id, u.conversa_id from u
  loop
    -- rastro onde a equipe vê: mensagem de sistema na conversa (antes o item só mudava de status na fila)
    if r.conversa_id is not null then
      begin
        perform public.nx_auto_sistema(r.conversa_id,
          'Uma mensagem automática não teve o envio confirmado (status incerto): confira esta conversa antes de reenviar.');
      exception when others then
        raise warning 'nx_fila_chamar (rastro): %', sqlerrm;
      end;
    end if;
  end loop;

  if exists (select 1 from public.nx_envios_fila f where f.status = 'pendente' and f.enviar_em <= now())
     or exists (select 1 from public.nx_midia_lixo m where m.apagado_em is null and m.erro is null) then
    begin
      perform public.nx_disparar('nx-enviar', '{"fila":true}'::jsonb);
    exception when others then
      -- nx_disparar ainda sem nx-enviar ou sem funcoes_url: a fila espera a próxima rodada
      raise warning 'nx_fila_chamar: %', sqlerrm;
    end;
  end if;
end $$;

-- ------------------------------------------------------------
-- 27. Permissões das funções NOVAS (internas só service_role; as reescritas mantêm as permissões que já tinham)
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('nx_crm_vazio', 'nx_crm_aviso_agenda', 'nx_auto_variavel_vazia', 'nx_uso_org', 'nx_cfg_validar', 'nx_fila_devolver_lote')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    execute format('grant execute on function %s to service_role', r.fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
