-- ============================================================
-- ÓRBITA — 20260928d_crm.sql · frente F4 (CRM) · parte P0-A
-- §5.3 da ESPEC: nx_crm_base, kanban, coluna, negócio (ver/salvar/mover/
-- excluir), contatos (listar/ver/salvar/excluir), tarefas, notas, etiqueta.
-- Aditivo e idempotente (create or replace). Nenhuma tabela nova: tudo usa
-- as tabelas do arquivo a (F1). As regras de etapa ↔ marco, contato,
-- herança de atribuição e TRAVA DO ADS ficam SÓ no gatilho da F1
-- (nx_tg_negocio_antes); aqui só se valida o que é do CRM e se deixa o
-- erro do gatilho passar.
-- Erros: '42501' = acesso, '22023' = dados (message = código, hint opcional).
-- ============================================================

-- ------------------------------------------------------------
-- Leitores de jsonb (internos). Valor inválido → dados_invalidos (hint = chave).
-- ------------------------------------------------------------
create or replace function public.nx_crm_uuid(p jsonb, k text)
returns uuid
language plpgsql immutable
security definer
set search_path = ''
as $$
begin
  return nullif(btrim(p ->> k), '')::uuid;
exception when others then
  raise exception 'dados_invalidos' using errcode = '22023', hint = k;
end $$;

create or replace function public.nx_crm_int8(p jsonb, k text)
returns bigint
language plpgsql immutable
security definer
set search_path = ''
as $$
begin
  return nullif(btrim(p ->> k), '')::bigint;
exception when others then
  raise exception 'dados_invalidos' using errcode = '22023', hint = k;
end $$;

create or replace function public.nx_crm_num(p jsonb, k text)
returns numeric
language plpgsql immutable
security definer
set search_path = ''
as $$
declare v numeric;
begin
  v := nullif(btrim(p ->> k), '')::numeric;
  if v is not null and (v < 0 or v > 9999999999) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = k;
  end if;
  return round(v, 2);
exception when others then
  raise exception 'dados_invalidos' using errcode = '22023', hint = k;
end $$;

create or replace function public.nx_crm_data(p jsonb, k text)
returns date
language plpgsql immutable
security definer
set search_path = ''
as $$
declare s text := nullif(btrim(p ->> k), '');
begin
  if s is null then return null; end if;
  if s ~ '^\d{4}-\d{2}-\d{2}' then return left(s, 10)::date; end if;
  if s ~ '^\d{1,2}/\d{1,2}/\d{4}$' then return to_date(s, 'DD/MM/YYYY'); end if;
  raise exception 'x';
exception when others then
  raise exception 'dados_invalidos' using errcode = '22023', hint = k;
end $$;

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
  if s ~ '(Z|[+-]\d{2}(:?\d{2})?)$' then return s::timestamptz; end if;
  return s::timestamp at time zone 'America/Sao_Paulo';
exception when others then
  raise exception 'dados_invalidos' using errcode = '22023', hint = k;
end $$;

create or replace function public.nx_crm_uuids(p jsonb, k text)
returns uuid[]
language plpgsql immutable
security definer
set search_path = ''
as $$
begin
  if p -> k is null or jsonb_typeof(p -> k) = 'null' then return '{}'::uuid[]; end if;
  if jsonb_typeof(p -> k) <> 'array' then raise exception 'x'; end if;
  return coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(p -> k) x
                    where nullif(btrim(x), '') is not null), '{}'::uuid[]);
exception when others then
  raise exception 'dados_invalidos' using errcode = '22023', hint = k;
end $$;

-- a conta pode ser responsável neste cliente? (acesso, gestor da org ou super)
create or replace function public.nx_crm_dono_ok(p_cliente uuid, p_conta uuid)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if p_conta is null then return true; end if;
  return exists (select 1 from public.nx_acessos a where a.conta_id = p_conta and a.cliente_id = p_cliente)
      or exists (select 1 from public.nx_contas k join public.nx_clientes c on c.id = p_cliente
                  where k.id = p_conta and k.papel = 'gestor' and k.org_id = c.org_id)
      or exists (select 1 from public.nx_contas k join public.nx_orgs o on o.id = k.org_id
                  where k.id = p_conta and k.papel = 'gestor' and o.tipo = 'plataforma');
end $$;

-- usuário "de visão restrita" (atendente/leitura sem ver_todas): só enxerga o que é dele ou sem dono
create or replace function public.nx_crm_restrito(v public.nx_ctx_t)
returns boolean
language plpgsql immutable
security definer
set search_path = ''
as $$
begin
  return public.nx_rank(v.papel) < 2 and not coalesce(v.ver_todas, true);
end $$;

-- etiquetas válidas do cliente (id de outro cliente some, como id inexistente)
create or replace function public.nx_crm_etiquetas_ok(p_cliente uuid, p_ids uuid[])
returns uuid[]
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return coalesce((select array_agg(e.id order by e.nome) from public.nx_etiquetas e
                    where e.cliente_id = p_cliente and e.id = any(coalesce(p_ids, '{}'::uuid[]))), '{}'::uuid[]);
end $$;

-- ------------------------------------------------------------
-- Filtro (§5.1) → trecho WHERE. Todo valor entra por format(%L): sem injeção.
-- ------------------------------------------------------------
create or replace function public.nx_crm_filtro_campo(p_alias text, f jsonb)
returns text
language plpgsql immutable
security definer
set search_path = ''
as $$
declare c jsonb := f -> 'campo'; ch text; op text; val text; x text;
begin
  if c is null or jsonb_typeof(c) <> 'object' then return ''; end if;
  ch := c ->> 'chave'; op := coalesce(c ->> 'op', 'igual'); val := c ->> 'valor';
  if ch is null or ch !~ '^[a-z][a-z0-9_]{1,39}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'campo';
  end if;
  x := format('(%s.campos ->> %L)', p_alias, ch);
  case op
    when 'vazio' then return format(' and coalesce(%s, '''') = ''''', x);
    when 'preenchido' then return format(' and coalesce(%s, '''') <> ''''', x);
    when 'igual' then return format(' and lower(%s) = lower(%L)', x, coalesce(val, ''));
    when 'contem' then
      val := replace(replace(replace(lower(coalesce(val, '')), '\', '\\'), '%', '\%'), '_', '\_');
      return format(' and lower(%s) like %L', x, '%' || val || '%');
    when 'maior', 'menor' then
      if val ~ '^\d{4}-\d{2}-\d{2}' then
        return format(' and %s %s %L', x, case op when 'maior' then '>' else '<' end, val);
      end if;
      if val !~ '^-?\d+(\.\d+)?$' then
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'campo';
      end if;
      return format(' and (case when %s ~ ''^-?[0-9]+(\.[0-9]+)?$'' then %s::numeric end) %s %L::numeric',
                    x, x, case op when 'maior' then '>' else '<' end, val);
    else raise exception 'dados_invalidos' using errcode = '22023', hint = 'campo';
  end case;
end $$;

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
      w := w || format(' and (l.telefone like %L or l.telefone like %L)', '%' || d || '%', '%' || dk || '%');
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

create or replace function public.nx_crm_filtro_contatos(p_cliente uuid, v public.nx_ctx_t, p_filtro jsonb)
returns text
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  f jsonb := coalesce(p_filtro, '{}'::jsonb);
  w text := format('k.cliente_id = %L', p_cliente);
  q text; d text; dk text; x text; ids uuid[];
begin
  if jsonb_typeof(f) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'filtro'; end if;
  if public.nx_crm_restrito(v) then
    w := w || format(' and (k.dono_id = %L or k.dono_id is null)', v.conta_id);
  end if;
  q := btrim(coalesce(f ->> 'busca', ''));
  if q <> '' then
    d := regexp_replace(q, '\D', '', 'g');
    if q ~ '^[0-9\s().+-]+$' and length(d) >= 4 then
      dk := coalesce(public.nx_tel_chave(public.nx_tel_normalizar(d)), d);
      w := w || format(' and (k.telefone like %L or k.tel_chave like %L)', '%' || d || '%', '%' || dk || '%');
    else
      q := lower(extensions.unaccent('extensions.unaccent'::regdictionary, q));
      q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
      w := w || format(' and k.busca like %L', '%' || q || '%');
    end if;
  end if;
  x := f ->> 'dono';
  if x = 'eu' then w := w || format(' and k.dono_id = %L', v.conta_id);
  elsif x = 'sem' then w := w || ' and k.dono_id is null';
  elsif nullif(x, '') is not null then w := w || format(' and k.dono_id = %L', public.nx_crm_uuid(f, 'dono'));
  end if;
  if jsonb_typeof(f -> 'etiquetas') = 'object' then
    ids := public.nx_crm_uuids(f -> 'etiquetas', 'ids');
    if cardinality(ids) > 0 then
      case coalesce(f -> 'etiquetas' ->> 'op', 'alguma')
        when 'alguma' then w := w || format(' and k.etiquetas && %L::uuid[]', ids);
        when 'todas' then w := w || format(' and k.etiquetas @> %L::uuid[]', ids);
        when 'nenhuma' then w := w || format(' and not (k.etiquetas && %L::uuid[])', ids);
        else raise exception 'dados_invalidos' using errcode = '22023', hint = 'etiquetas';
      end case;
    end if;
  end if;
  if jsonb_typeof(f -> 'origem') = 'array' and jsonb_array_length(f -> 'origem') > 0 then
    w := w || format(' and k.origem = any(%L::text[])', array(select jsonb_array_elements_text(f -> 'origem')));
  end if;
  if nullif(f ->> 'criado_de', '') is not null then
    w := w || format(' and k.criado_em >= (%L::date::timestamp at time zone ''America/Sao_Paulo'')', public.nx_crm_data(f, 'criado_de'));
  end if;
  if nullif(f ->> 'criado_ate', '') is not null then
    w := w || format(' and k.criado_em < ((%L::date + 1)::timestamp at time zone ''America/Sao_Paulo'')', public.nx_crm_data(f, 'criado_ate'));
  end if;
  if nullif(f ->> 'empresa_id', '') is not null then
    w := w || format(' and k.empresa_id = %L', public.nx_crm_int8(f, 'empresa_id'));
  end if;
  if jsonb_typeof(f -> 'tem_negocio_aberto') = 'boolean' then
    w := w || case when (f ->> 'tem_negocio_aberto')::boolean then ' and ' else ' and not ' end
            || 'exists (select 1 from public.nx_leads l where l.contato_id = k.id and l.status = ''aberto'')';
  end if;
  if jsonb_typeof(f -> 'optin_marketing') = 'boolean' then
    w := w || format(' and k.optin_marketing is not distinct from %L::boolean', f ->> 'optin_marketing');
  end if;
  w := w || public.nx_crm_filtro_campo('k', f);
  return w;
end $$;

-- ------------------------------------------------------------
-- Montadores de JSON (internos)
-- ------------------------------------------------------------
-- Card (§5.1) na ordem de p_ids. nao_lidas só das conversas visíveis ao usuário.
create or replace function public.nx_crm_cards(p_cliente uuid, p_ids bigint[], v public.nx_ctx_t)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if p_ids is null or cardinality(p_ids) = 0 then return '[]'::json; end if;
  return coalesce((
    select json_agg(json_build_object(
      'id', l.id, 'titulo', l.titulo, 'nome', l.nome, 'telefone', l.telefone,
      'contato', case when k.id is null then null
                      else json_build_object('id', k.id, 'nome', k.nome, 'telefone', k.telefone) end,
      'valor_previsto', l.valor_previsto, 'valor', l.valor, 'status', l.status,
      'funil_id', l.funil_id, 'estagio_id', l.estagio_id, 'dono_id', l.dono_id,
      'etiquetas', l.etiquetas, 'servico', l.servico, 'origem', l.origem,
      'anuncio', (l.plataforma is not null or l.origem = 'anuncio'), 'plataforma', l.plataforma,
      'estagio_em', l.estagio_em, 'criado_em', l.criado_em, 'fechado_em', l.fechado_em,
      'consulta_em', l.consulta_em, 'data_consulta', l.data_consulta, 'ordem', l.ordem,
      'tarefa', (select json_build_object('vence_em', t.vence_em, 'atrasada', coalesce(t.vence_em < now(), false))
                   from public.nx_tarefas t
                  where t.negocio_id = l.id and t.concluida_em is null
                  order by t.vence_em nulls last, t.id limit 1),
      'nao_lidas', coalesce((
         select sum(cv.nao_lidas)::int from public.nx_conversas cv
          where cv.contato_id = l.contato_id and cv.status <> 'resolvida' and cv.nao_lidas > 0
            -- regra nx_cv_visivel
            and cv.cliente_id = p_cliente
            and (not cv.oculta or public.nx_rank(v.papel) >= 2)
            and ( public.nx_rank(v.papel) >= 3
               or cv.atribuida_a = v.conta_id
               or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                     or cv.departamento_id = any(v.departamentos))
                    and (public.nx_rank(v.papel) = 2 or cv.atribuida_a is null or v.ver_todas) ) )), 0)
    ) order by x.o)
    from unnest(p_ids) with ordinality x(id, o)
    join public.nx_leads l on l.id = x.id and l.cliente_id = p_cliente
    left join public.nx_contatos k on k.id = l.contato_id), '[]'::json);
end $$;

create or replace function public.nx_crm_tarefas_json(p_cliente uuid, p_ids bigint[])
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if p_ids is null or cardinality(p_ids) = 0 then return '[]'::json; end if;
  return coalesce((
    select json_agg(json_build_object(
      'id', t.id, 'tipo', t.tipo, 'titulo', t.titulo, 'descricao', t.descricao,
      'vence_em', t.vence_em, 'concluida_em', t.concluida_em, 'criado_em', t.criado_em,
      'atrasada', (t.concluida_em is null and t.vence_em < now()),
      'dono', case when d.id is null then null else json_build_object('id', d.id, 'nome', d.nome) end,
      'contato', case when k.id is null then null else json_build_object('id', k.id, 'nome', k.nome) end,
      'negocio', case when l.id is null then null
                      else json_build_object('id', l.id, 'titulo', coalesce(l.titulo, l.nome)) end,
      'automacao', t.automacao_id is not null
    ) order by x.o)
    from unnest(p_ids) with ordinality x(id, o)
    join public.nx_tarefas t on t.id = x.id and t.cliente_id = p_cliente
    left join public.nx_contas d on d.id = t.dono_id
    left join public.nx_contatos k on k.id = t.contato_id
    left join public.nx_leads l on l.id = t.negocio_id), '[]'::json);
end $$;

-- Tarefa ao alcance de quem tem VISÃO RESTRITA (atendente/leitura sem ver_todas): a própria (responsável
-- ou quem criou) ou ligada a negócio/contato que ele enxerga (é o que aparece na gaveta e na ficha).
-- Sem visão restrita: qualquer tarefa do cliente. Fora disso a tarefa se comporta como inexistente
-- (a resposta de salvar/concluir traz título, contato e negócio — não pode vazar o que é de colega).
create or replace function public.nx_crm_tarefa_ok(p_cliente uuid, v public.nx_ctx_t, p_id bigint)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
declare t public.nx_tarefas;
begin
  select * into t from public.nx_tarefas where id = p_id and cliente_id = p_cliente;
  if t.id is null then return false; end if;
  if not public.nx_crm_restrito(v) then return true; end if;
  if t.dono_id = v.conta_id or t.criado_por = v.conta_id then return true; end if;
  if t.negocio_id is null and t.contato_id is null then return false; end if;
  return (t.negocio_id is null or exists (select 1 from public.nx_leads l where l.id = t.negocio_id and l.cliente_id = p_cliente
                                             and (l.dono_id is null or l.dono_id = v.conta_id)))
     and (t.contato_id is null or exists (select 1 from public.nx_contatos k where k.id = t.contato_id and k.cliente_id = p_cliente
                                             and (k.dono_id is null or k.dono_id = v.conta_id)));
end $$;

create or replace function public.nx_crm_notas_json(p_cliente uuid, p_ids bigint[], v public.nx_ctx_t)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if p_ids is null or cardinality(p_ids) = 0 then return '[]'::json; end if;
  return coalesce((
    select json_agg(json_build_object(
      'id', n.id, 'texto', n.texto, 'fixada', n.fixada, 'criado_em', n.criado_em, 'editado_em', n.editado_em,
      'contato_id', n.contato_id, 'negocio_id', n.negocio_id,
      'autor', case when a.id is null then null else json_build_object('id', a.id, 'nome', a.nome) end,
      'pode_editar', (n.autor_id = v.conta_id or public.nx_rank(v.papel) >= 3)
    ) order by x.o)
    from unnest(p_ids) with ordinality x(id, o)
    join public.nx_notas n on n.id = x.id and n.cliente_id = p_cliente
    left join public.nx_contas a on a.id = n.autor_id), '[]'::json);
end $$;

-- linha do tempo (ItemTempo ≤ 80, mais recente primeiro). p_negocio preenchido → do negócio; senão do contato.
create or replace function public.nx_crm_tempo(p_cliente uuid, v public.nx_ctx_t, p_contato bigint, p_negocio bigint)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return coalesce((
    select json_agg(json_build_object('fonte', t.fonte, 'id', t.id, 'tipo', t.tipo, 'em', t.em,
                                      'autor', case when a.id is null then null else json_build_object('id', a.id, 'nome', a.nome) end,
                                      'dados', t.dados, 'negocio_id', t.negocio_id, 'conversa_id', t.conversa_id)
                    order by t.em desc, t.id desc)
    from (
      (select 'historico'::text as fonte, h.id, h.tipo, h.criado_em as em, h.autor_id, h.dados,
              h.negocio_id, h.conversa_id
         from public.nx_historico h
        where h.cliente_id = p_cliente
          and ((p_negocio is not null and h.negocio_id = p_negocio)
            or (p_negocio is null and h.contato_id = p_contato))
          and (h.conversa_id is null or exists (
                select 1 from public.nx_conversas cv where cv.id = h.conversa_id
                   -- regra nx_cv_visivel
                   and cv.cliente_id = p_cliente
                   and (not cv.oculta or public.nx_rank(v.papel) >= 2)
                   and ( public.nx_rank(v.papel) >= 3
                      or cv.atribuida_a = v.conta_id
                      or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                            or cv.departamento_id = any(v.departamentos))
                           and (public.nx_rank(v.papel) = 2 or cv.atribuida_a is null or v.ver_todas) ) )))
        order by h.criado_em desc limit 80)
      union all
      (select 'nota', n.id, 'nota', n.criado_em, n.autor_id,
              jsonb_build_object('texto', n.texto, 'fixada', n.fixada), n.negocio_id, null::bigint
         from public.nx_notas n
        where n.cliente_id = p_cliente
          and ((p_negocio is not null and n.negocio_id = p_negocio)
            or (p_negocio is null and n.contato_id = p_contato))
        order by n.criado_em desc limit 80)
      union all
      (select 'tarefa', t.id, case when t.concluida_em is null then 'tarefa' else 'tarefa_concluida' end,
              coalesce(t.concluida_em, t.criado_em), t.criado_por,
              jsonb_build_object('titulo', t.titulo, 'tipo', t.tipo, 'vence_em', t.vence_em, 'concluida_em', t.concluida_em),
              t.negocio_id, null::bigint
         from public.nx_tarefas t
        where t.cliente_id = p_cliente
          and ((p_negocio is not null and t.negocio_id = p_negocio)
            or (p_negocio is null and t.contato_id = p_contato))
        order by t.criado_em desc limit 80)
      order by 4 desc limit 80
    ) t
    left join public.nx_contas a on a.id = t.autor_id), '[]'::json);
end $$;

-- Negocio (§5.1) = Card + detalhes
create or replace function public.nx_crm_negocio_json(p_cliente uuid, p_id bigint, v public.nx_ctx_t)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare l public.nx_leads;
begin
  select * into l from public.nx_leads where id = p_id and cliente_id = p_cliente;
  if l.id is null then return null; end if;
  return (public.nx_crm_cards(p_cliente, array[p_id], v)::jsonb -> 0)
      || jsonb_build_object(
           'previsao_fechamento', l.previsao_fechamento, 'motivo_perda_id', l.motivo_perda_id,
           'motivo_perda_txt', l.motivo_perda_txt, 'fechado_em', l.fechado_em, 'campos', l.campos,
           'obs', l.obs, 'plataforma', l.plataforma, 'campanha_ext', l.campanha_ext,
           'anuncio_ext', l.anuncio_ext, 'etapa', l.etapa, 'data_agenda', l.data_agenda,
           'data_consulta', l.data_consulta, 'consulta_em', l.consulta_em, 'data_conversa', l.data_conversa,
           'atualizado_em', l.atualizado_em);
end $$;

create or replace function public.nx_crm_contato_json(p_cliente uuid, p_id bigint)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return (select to_jsonb(k) - 'busca' - 'tel_chave' from public.nx_contatos k where k.id = p_id and k.cliente_id = p_cliente);
end $$;

-- ------------------------------------------------------------
-- RPCs de painel
-- ------------------------------------------------------------

-- nx_crm_base: tudo o que o front guarda em memória
create or replace function public.nx_crm_base(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura'); c public.nx_clientes;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  select * into c from public.nx_clientes where id = p_cliente;
  return json_build_object(
    'eu', json_build_object('id', v.conta_id, 'nome', v.nome, 'papel', v.papel, 'ver_todas', v.ver_todas,
                            'restrito', public.nx_crm_restrito(v)),
    'funis', coalesce((
      select json_agg(json_build_object('id', f.id, 'nome', f.nome, 'ordem', f.ordem, 'padrao', f.padrao,
               'conta_no_ads', f.conta_no_ads, 'ativo', f.ativo,
               'estagios', coalesce((
                  select json_agg(json_build_object('id', e.id, 'nome', e.nome, 'cor', e.cor, 'ordem', e.ordem,
                           'tipo', e.tipo, 'marco', e.marco, 'probabilidade', e.probabilidade, 'sla_horas', e.sla_horas)
                           order by e.ordem, e.criado_em)
                    from public.nx_estagios e where e.funil_id = f.id), '[]'::json))
             order by f.ordem, f.criado_em)
        from public.nx_funis f where f.cliente_id = p_cliente), '[]'::json),
    'campos', coalesce((
      select json_agg(json_build_object('id', x.id, 'entidade', x.entidade, 'chave', x.chave, 'rotulo', x.rotulo,
               'tipo', x.tipo, 'opcoes', x.opcoes, 'obrigatorio', x.obrigatorio, 'funil_id', x.funil_id,
               'ordem', x.ordem, 'ativo', x.ativo) order by x.entidade, x.ordem, x.criado_em)
        from public.nx_campos x where x.cliente_id = p_cliente and x.ativo), '[]'::json),
    'etiquetas', coalesce((
      select json_agg(json_build_object('id', e.id, 'nome', e.nome, 'cor', e.cor) order by lower(e.nome))
        from public.nx_etiquetas e where e.cliente_id = p_cliente), '[]'::json),
    'motivos', coalesce((
      select json_agg(json_build_object('id', m.id, 'nome', m.nome, 'exige_texto', m.exige_texto, 'ordem', m.ordem)
               order by m.ordem, m.criado_em)
        from public.nx_motivos_perda m where m.cliente_id = p_cliente and m.ativo), '[]'::json),
    'usuarios', coalesce((
      select json_agg(json_build_object('id', u.id, 'nome', u.nome, 'papel', u.papel) order by lower(u.nome))
        from (select k.id, k.nome, a.papel
                from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
               where a.cliente_id = p_cliente and k.aprovado
              union
              select v.conta_id, v.nome, v.papel
               where not exists (select 1 from public.nx_acessos a where a.conta_id = v.conta_id and a.cliente_id = p_cliente)) u),
      '[]'::json),
    'ticket', case when jsonb_typeof(c.cfg -> 'ticket') = 'object' then c.cfg -> 'ticket' else '{}'::jsonb end,
    'vertical', c.vertical);
end $$;

-- nx_negocios_kanban: colunas do funil com totais, somas e os primeiros N cartões
create or replace function public.nx_negocios_kanban(p_token text, p_cliente uuid, p_funil uuid,
                                                     p_filtro jsonb default '{}'::jsonb, p_por_coluna int default 30)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  v_funil uuid;
  n int := least(greatest(coalesce(p_por_coluna, 30), 1), 100);
  w text; j json;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if p_funil is null then
    select f.id into v_funil from public.nx_funis f where f.cliente_id = p_cliente and f.padrao limit 1;
    if v_funil is null then
      select f.id into v_funil from public.nx_funis f where f.cliente_id = p_cliente order by f.ordem limit 1;
    end if;
  else
    select f.id into v_funil from public.nx_funis f where f.id = p_funil and f.cliente_id = p_cliente;
  end if;
  if v_funil is null then raise exception 'funil_invalido' using errcode = '22023', hint = 'nao_encontrado'; end if;
  w := public.nx_crm_filtro_negocios(p_cliente, v, p_filtro, true);
  execute format($q$
    with b as materialized (
      select l.id, l.estagio_id, l.status, l.ordem, l.valor, l.valor_previsto
        from public.nx_leads l where l.funil_id = $1 and %s),
    ag as (select b.estagio_id, count(*) as total, coalesce(sum(b.valor_previsto), 0) as sp,
                  coalesce(sum(b.valor), 0) as sv
             from b group by b.estagio_id),
    r as (select b.id, b.estagio_id,
                 row_number() over (partition by b.estagio_id order by b.ordem asc nulls last, b.id desc) as rn
            from b)
    select json_build_object(
      'funil_id', $1,
      'colunas', coalesce((
        select json_agg(json_build_object(
                 'estagio_id', e.id, 'total', coalesce(ag.total, 0),
                 'soma_previsto', coalesce(ag.sp, 0), 'soma_valor', coalesce(ag.sv, 0),
                 'itens', public.nx_crm_cards($2, array(select r.id from r where r.estagio_id = e.id and r.rn <= $3 order by r.rn), $4))
               order by e.ordem, e.criado_em)
          from public.nx_estagios e left join ag on ag.estagio_id = e.id
         where e.funil_id = $1), '[]'::json),
      'totais', (select json_build_object(
                   'abertos', count(*),
                   'soma_aberto', coalesce(sum(b.valor_previsto), 0),
                   'previsao_ponderada', coalesce(round(sum(coalesce(b.valor_previsto, 0) * e.probabilidade / 100.0), 2), 0))
                   from b join public.nx_estagios e on e.id = b.estagio_id
                  where b.status = 'aberto'))
  $q$, w) using v_funil, p_cliente, n, v into j;
  return j;
end $$;

-- nx_negocios_coluna: "ver mais" de uma coluna (30 em 30)
create or replace function public.nx_negocios_coluna(p_token text, p_cliente uuid, p_estagio uuid,
                                                     p_filtro jsonb default '{}'::jsonb, p_offset int default 0)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  e public.nx_estagios; w text; ids bigint[]; o int := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  select * into e from public.nx_estagios where id = p_estagio and cliente_id = p_cliente;
  if e.id is null then raise exception 'estagio_invalido' using errcode = '22023'; end if;
  w := public.nx_crm_filtro_negocios(p_cliente, v, p_filtro, true);
  execute format('select array(select l.id from public.nx_leads l where l.estagio_id = $1 and %s
                               order by l.ordem asc nulls last, l.id desc limit 31 offset $2)', w)
    using p_estagio, o into ids;
  return json_build_object(
    'itens', public.nx_crm_cards(p_cliente, ids[1:30], v),
    'tem_mais', coalesce(cardinality(ids), 0) > 30);
end $$;

-- nx_negocio_ver: gaveta do negócio
create or replace function public.nx_negocio_ver(p_token text, p_cliente uuid, p_id bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  l public.nx_leads; f public.nx_funis; e public.nx_estagios;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  select * into l from public.nx_leads where id = p_id and cliente_id = p_cliente;
  if l.id is null or (public.nx_crm_restrito(v) and l.dono_id is not null and l.dono_id <> v.conta_id) then
    raise exception 'negocio_nao_encontrado' using errcode = '22023';
  end if;
  select * into f from public.nx_funis where id = l.funil_id;
  select * into e from public.nx_estagios where id = l.estagio_id;
  return json_build_object(
    'negocio', public.nx_crm_negocio_json(p_cliente, l.id, v),
    'contato', public.nx_crm_contato_json(p_cliente, l.contato_id),
    'empresa', (select json_build_object('id', m.id, 'nome', m.nome, 'cidade', m.cidade, 'uf', m.uf)
                  from public.nx_contatos k join public.nx_empresas m on m.id = k.empresa_id
                 where k.id = l.contato_id and m.cliente_id = p_cliente),
    'funil', case when f.id is null then null
                  else json_build_object('id', f.id, 'nome', f.nome, 'conta_no_ads', f.conta_no_ads) end,
    'estagio', case when e.id is null then null
                    else json_build_object('id', e.id, 'nome', e.nome, 'cor', e.cor, 'ordem', e.ordem, 'tipo', e.tipo,
                                           'marco', e.marco, 'probabilidade', e.probabilidade, 'sla_horas', e.sla_horas) end,
    'anuncio', case when l.plataforma is null then null else json_build_object(
                  'plataforma', l.plataforma,
                  'campanha_nome', (select m.campanha_nome from public.nx_metricas_dia m
                                     where m.cliente_id = p_cliente and m.plataforma = l.plataforma
                                       and m.campanha_ext = l.campanha_ext and m.campanha_nome is not null
                                     order by m.data desc limit 1),
                  'anuncio_nome', (select m.anuncio_nome from public.nx_metricas_dia m
                                    where m.cliente_id = p_cliente and m.plataforma = l.plataforma
                                      and l.anuncio_ext is not null and m.anuncio_ext = l.anuncio_ext
                                      and m.anuncio_nome is not null
                                    order by m.data desc limit 1)) end,
    'tarefas', public.nx_crm_tarefas_json(p_cliente, array(
                 select t.id from public.nx_tarefas t where t.negocio_id = l.id and t.cliente_id = p_cliente
                  order by (t.concluida_em is null) desc, t.vence_em nulls last, t.id desc limit 60)),
    'notas', public.nx_crm_notas_json(p_cliente, array(
               select n.id from public.nx_notas n where n.negocio_id = l.id and n.cliente_id = p_cliente
                order by n.fixada desc, n.criado_em desc limit 60), v),
    'tempo', public.nx_crm_tempo(p_cliente, v, l.contato_id, l.id),
    'conversas', coalesce((
      select json_agg(json_build_object('id', cv.id, 'protocolo', cv.protocolo, 'status', cv.status, 'canal_id', cv.canal_id,
                                        'aberta_em', cv.aberta_em, 'resolvida_em', cv.resolvida_em, 'nao_lidas', cv.nao_lidas)
                      order by cv.aberta_em desc)
        from (select * from public.nx_conversas cv
               where cv.contato_id = l.contato_id
                 -- regra nx_cv_visivel
                 and cv.cliente_id = p_cliente
                 and (not cv.oculta or public.nx_rank(v.papel) >= 2)
                 and ( public.nx_rank(v.papel) >= 3
                    or cv.atribuida_a = v.conta_id
                    or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                          or cv.departamento_id = any(v.departamentos))
                         and (public.nx_rank(v.papel) = 2 or cv.atribuida_a is null or v.ver_todas) ) )
               order by cv.aberta_em desc limit 20) cv), '[]'::json),
    'outros', public.nx_crm_cards(p_cliente, array(
                select x.id from public.nx_leads x
                 where x.contato_id = l.contato_id and x.cliente_id = p_cliente and x.id <> l.id
                   and (not public.nx_crm_restrito(v) or x.dono_id is null or x.dono_id = v.conta_id)
                 order by (x.status = 'aberto') desc, x.criado_em desc limit 20), v));
end $$;

-- nx_negocio_salvar: cria (sem id) ou atualiza só as chaves presentes (com id)
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
  v_origem text; v_campos jsonb; v_conversa bigint; v_valor numeric;
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
        values (p_cliente, v_nome, v_tel, v_email, 'manual', coalesce(v_dono, v.conta_id))
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

    -- "+ Oportunidade" da conversa: liga a conversa (do mesmo contato, visível) ao negócio novo
    v_conversa := public.nx_crm_int8(n, 'conversa_id');
    if v_conversa is not null then
      update public.nx_conversas cv set negocio_id = l.id
       where cv.id = v_conversa and cv.contato_id = l.contato_id
         and public.nx_cv_visivel(v, p_cliente, cv.id);
    end if;
    return public.nx_crm_negocio_json(p_cliente, l.id, v)::json;
  end if;

  -- ---------------------------------------------------------- ATUALIZAR (só chaves presentes)
  select * into l from public.nx_leads where id = v_id and cliente_id = p_cliente for update;
  if l.id is null or (public.nx_crm_restrito(v) and l.dono_id is not null and l.dono_id <> v.conta_id) then
    raise exception 'negocio_nao_encontrado' using errcode = '22023';
  end if;
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
                         then public.nx_crm_data(n, 'data_consulta') else x.data_consulta end,
    servico = case when n ? 'servico' then left(nullif(btrim(n ->> 'servico'), ''), 120) else x.servico end,
    obs = case when n ? 'obs' then left(nullif(btrim(n ->> 'obs'), ''), 5000) else x.obs end,
    campos = case when n ? 'campos' then jsonb_strip_nulls(x.campos || coalesce(case when jsonb_typeof(n -> 'campos') = 'object' then n -> 'campos' end, '{}'::jsonb))
                  else x.campos end,
    etiquetas = case when n ? 'etiquetas' then public.nx_crm_etiquetas_ok(p_cliente, public.nx_crm_uuids(n, 'etiquetas')) else x.etiquetas end,
    origem = case when n ? 'origem' then coalesce(v_origem, x.origem) else x.origem end,
    atualizado_em = now()
  where x.id = l.id;
  return public.nx_crm_negocio_json(p_cliente, l.id, v)::json;
end $$;

-- nx_negocio_mover: arrastar no kanban / fita de etapas / ganhou-perdeu-reabrir
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
  v_ordem double precision; v_ch text; v_muda boolean;
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
       and nullif(btrim(coalesce(v_campos ->> c.chave, '')), '') is null
       and not coalesce(jsonb_typeof(v_campos -> c.chave) = 'array' and jsonb_array_length(v_campos -> c.chave) > 0, false)
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
  return (public.nx_crm_cards(p_cliente, array[l.id], v)::jsonb -> 0)::json;
end $$;

create or replace function public.nx_negocio_excluir(p_token text, p_cliente uuid, p_id bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); v_id bigint;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  delete from public.nx_leads where id = p_id and cliente_id = p_cliente returning id into v_id;
  if v_id is null then raise exception 'negocio_nao_encontrado' using errcode = '22023'; end if;
  return json_build_object('ok', true);
end $$;

-- nx_contatos_listar: busca sem acento, filtros, ordenação e página de até 100
create or replace function public.nx_contatos_listar(p_token text, p_cliente uuid, p_filtro jsonb default '{}'::jsonb,
                                                     p_pagina int default 1, p_por_pagina int default 50,
                                                     p_ordem text default 'recentes')
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  w text; itens json; v_total int; v_aprox int;
  n int := least(greatest(coalesce(p_por_pagina, 50), 1), 100);
  pg int := least(greatest(coalesce(p_pagina, 1), 1), 100000);
  ord text := case p_ordem
                when 'nome' then 'lower(k.nome) asc nulls last, k.id asc'
                when 'ultimo_contato' then 'k.ultimo_contato_em desc nulls last, k.id desc'
                else 'k.criado_em desc, k.id desc' end;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  w := public.nx_crm_filtro_contatos(p_cliente, v, p_filtro);
  execute format('select count(*) from (select 1 from public.nx_contatos k where %s limit 10001) x', w) into v_total;
  if v_total > 10000 then
    execute format('select count(*) from (select 1 from public.nx_contatos k where %s limit 100001) x', w) into v_aprox;
    v_total := null;
  end if;
  execute format($q$
    select coalesce(json_agg(json_build_object(
        'id', k.id, 'nome', k.nome, 'telefone', k.telefone, 'email', k.email,
        'empresa', case when e.id is null then null else json_build_object('id', e.id, 'nome', e.nome) end,
        'etiquetas', k.etiquetas, 'origem', k.origem, 'plataforma', k.plataforma, 'dono_id', k.dono_id,
        'negocios_abertos', (select count(*) from public.nx_leads l where l.contato_id = k.id and l.status = 'aberto'),
        'ultimo_contato_em', k.ultimo_contato_em, 'criado_em', k.criado_em,
        'optin_marketing', k.optin_marketing, 'cidade', k.cidade) order by %s), '[]'::json)
      from (select k.* from public.nx_contatos k where %s order by %s limit %s offset %s) k
      left join public.nx_empresas e on e.id = k.empresa_id
  $q$, ord, w, ord, n, (pg - 1) * n) into itens;
  return json_build_object(
    'itens', itens, 'total', v_total, 'total_aprox', v_aprox, 'pagina', pg, 'por_pagina', n,
    'tem_mais', case when v_total is null then json_array_length(itens) = n else pg * n < v_total end);
end $$;

-- nx_contato_ver: ficha 360
create or replace function public.nx_contato_ver(p_token text, p_cliente uuid, p_id bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  k public.nx_contatos;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  select * into k from public.nx_contatos where id = p_id and cliente_id = p_cliente;
  if k.id is null or (public.nx_crm_restrito(v) and k.dono_id is not null and k.dono_id <> v.conta_id) then
    raise exception 'contato_nao_encontrado' using errcode = '22023';
  end if;
  return json_build_object(
    'contato', public.nx_crm_contato_json(p_cliente, k.id),
    'empresa', (select json_build_object('id', m.id, 'nome', m.nome, 'cidade', m.cidade, 'uf', m.uf,
                                         'telefone', m.telefone, 'email', m.email, 'site', m.site)
                  from public.nx_empresas m where m.id = k.empresa_id and m.cliente_id = p_cliente),
    'negocios', public.nx_crm_cards(p_cliente, array(
                  select l.id from public.nx_leads l
                   where l.contato_id = k.id and l.cliente_id = p_cliente
                     and (not public.nx_crm_restrito(v) or l.dono_id is null or l.dono_id = v.conta_id)
                   order by (l.status = 'aberto') desc, l.criado_em desc limit 50), v),
    'conversas', coalesce((
      select json_agg(json_build_object('id', cv.id, 'protocolo', cv.protocolo, 'status', cv.status,
                                        'canal_id', cv.canal_id, 'atribuida_a', cv.atribuida_a,
                                        'atribuida_nome', (select a.nome from public.nx_contas a where a.id = cv.atribuida_a),
                                        'aberta_em', cv.aberta_em, 'resolvida_em', cv.resolvida_em,
                                        'primeira_resposta_em', cv.primeira_resposta_em, 'nao_lidas', cv.nao_lidas)
                      order by cv.aberta_em desc)
        from (select * from public.nx_conversas cv
               where cv.contato_id = k.id
                 -- regra nx_cv_visivel
                 and cv.cliente_id = p_cliente
                 and (not cv.oculta or public.nx_rank(v.papel) >= 2)
                 and ( public.nx_rank(v.papel) >= 3
                    or cv.atribuida_a = v.conta_id
                    or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                          or cv.departamento_id = any(v.departamentos))
                         and (public.nx_rank(v.papel) = 2 or cv.atribuida_a is null or v.ver_todas) ) )
               order by cv.aberta_em desc limit 30) cv), '[]'::json),
    'tarefas', public.nx_crm_tarefas_json(p_cliente, array(
                 select t.id from public.nx_tarefas t where t.contato_id = k.id and t.cliente_id = p_cliente
                  order by (t.concluida_em is null) desc, t.vence_em nulls last, t.id desc limit 60)),
    'notas', public.nx_crm_notas_json(p_cliente, array(
               select n.id from public.nx_notas n where n.contato_id = k.id and n.cliente_id = p_cliente
                order by n.fixada desc, n.criado_em desc limit 60), v),
    'tempo', public.nx_crm_tempo(p_cliente, v, k.id, null),
    'rfm', (select json_build_object('ganhos', count(*), 'total_gasto', coalesce(sum(l.valor), 0),
                                     'ultima_compra', max(l.fechado_em), 'ticket_medio', round(avg(l.valor), 2))
              from public.nx_leads l where l.contato_id = k.id and l.cliente_id = p_cliente and l.status = 'ganho'));
end $$;

-- nx_contato_salvar: cria/atualiza (chaves presentes)
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
       and nullif(btrim(coalesce(v_campos ->> x.chave, '')), '') is null
       and not coalesce(jsonb_typeof(v_campos -> x.chave) = 'array' and jsonb_array_length(v_campos -> x.chave) > 0, false)
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

-- nx_contato_excluir (LGPD): apaga contato, conversas, mensagens, tarefas e notas; negócios anonimizados
create or replace function public.nx_contato_excluir(p_token text, p_cliente uuid, p_id bigint, p_confirmacao text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); v_n int := 0; v_id bigint;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if coalesce(lower(btrim(p_confirmacao)), '') <> 'excluir' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'confirmacao';
  end if;
  select id into v_id from public.nx_contatos where id = p_id and cliente_id = p_cliente for update;
  if v_id is null then raise exception 'contato_nao_encontrado' using errcode = '22023'; end if;
  -- mídias das mensagens → faxina do Storage (só caminhos dentro da pasta deste cliente)
  insert into public.nx_midia_lixo (cliente_id, path)
  select p_cliente, m.midia ->> 'path'
    from public.nx_mensagens m
   where m.contato_id = v_id and m.cliente_id = p_cliente
     and m.midia ->> 'path' is not null and left(m.midia ->> 'path', 37) = p_cliente::text || '/';
  get diagnostics v_n = row_count;
  -- negócios ficam (ROI), sem dado pessoal
  update public.nx_leads set nome = 'Removido', telefone = null, obs = null, contato_id = null, atualizado_em = now()
   where contato_id = v_id and cliente_id = p_cliente;
  -- cascata: conversas, mensagens, tarefas, notas e histórico do contato
  delete from public.nx_contatos where id = v_id;
  return json_build_object('ok', true, 'midias_na_fila', v_n);
end $$;

-- ------------------------------------------------------------ tarefas
create or replace function public.nx_tarefa_salvar(p_token text, p_cliente uuid, p_tarefa jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  t jsonb := coalesce(p_tarefa, '{}'::jsonb);
  v_id bigint := public.nx_crm_int8(t, 'id');
  r public.nx_tarefas; l public.nx_leads;
  v_tipo text; v_titulo text; v_dono uuid; v_contato bigint; v_negocio bigint;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if jsonb_typeof(t) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'tarefa'; end if;
  if t ? 'tipo' then
    v_tipo := coalesce(nullif(btrim(t ->> 'tipo'), ''), 'tarefa');
    if v_tipo not in ('tarefa','ligacao','reuniao','visita','whatsapp','email') then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'tipo';
    end if;
  end if;
  if t ? 'titulo' then
    v_titulo := left(nullif(btrim(t ->> 'titulo'), ''), 160);
    if v_titulo is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'titulo'; end if;
  end if;
  if t ? 'dono_id' then
    v_dono := public.nx_crm_uuid(t, 'dono_id');
    if not public.nx_crm_dono_ok(p_cliente, v_dono) then raise exception 'dados_invalidos' using errcode = '22023', hint = 'dono_id'; end if;
  end if;
  -- negócio/contato do mesmo cliente E visíveis (visão restrita só liga ao que é dela ou sem dono)
  if nullif(t ->> 'negocio_id', '') is not null then
    v_negocio := public.nx_crm_int8(t, 'negocio_id');
    select * into l from public.nx_leads where id = v_negocio and cliente_id = p_cliente;
    if l.id is null or (public.nx_crm_restrito(v) and l.dono_id is not null and l.dono_id <> v.conta_id) then
      raise exception 'negocio_nao_encontrado' using errcode = '22023';
    end if;
  end if;
  if nullif(t ->> 'contato_id', '') is not null then
    v_contato := public.nx_crm_int8(t, 'contato_id');
    if not exists (select 1 from public.nx_contatos k where k.id = v_contato and k.cliente_id = p_cliente
                     and (not public.nx_crm_restrito(v) or k.dono_id is null or k.dono_id = v.conta_id)) then
      raise exception 'contato_nao_encontrado' using errcode = '22023';
    end if;
  end if;
  if v_id is not null and not public.nx_crm_tarefa_ok(p_cliente, v, v_id) then
    raise exception 'tarefa_nao_encontrada' using errcode = '22023';
  end if;
  if v_id is null then
    if v_titulo is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'titulo'; end if;
    insert into public.nx_tarefas (cliente_id, tipo, titulo, descricao, vence_em, dono_id, contato_id, negocio_id, criado_por)
    values (p_cliente, coalesce(v_tipo, 'tarefa'), v_titulo, left(nullif(btrim(t ->> 'descricao'), ''), 5000),
            public.nx_crm_ts(t, 'vence_em'), case when t ? 'dono_id' then v_dono else v.conta_id end,
            coalesce(v_contato, l.contato_id), v_negocio, v.conta_id)
    returning * into r;
  else
    update public.nx_tarefas x set
      tipo = case when t ? 'tipo' then v_tipo else x.tipo end,
      titulo = case when t ? 'titulo' then v_titulo else x.titulo end,
      descricao = case when t ? 'descricao' then left(nullif(btrim(t ->> 'descricao'), ''), 5000) else x.descricao end,
      vence_em = case when t ? 'vence_em' then public.nx_crm_ts(t, 'vence_em') else x.vence_em end,
      dono_id = case when t ? 'dono_id' then v_dono else x.dono_id end,
      negocio_id = case when t ? 'negocio_id' then v_negocio else x.negocio_id end,
      contato_id = case when t ? 'contato_id' then v_contato
                        when t ? 'negocio_id' and v_negocio is not null and x.contato_id is null then l.contato_id
                        else x.contato_id end,
      atualizado_em = now()
    where x.id = v_id and x.cliente_id = p_cliente
    returning * into r;
    if r.id is null then raise exception 'tarefa_nao_encontrada' using errcode = '22023'; end if;
  end if;
  return (public.nx_crm_tarefas_json(p_cliente, array[r.id])::jsonb -> 0)::json;
end $$;

create or replace function public.nx_tarefa_concluir(p_token text, p_cliente uuid, p_id bigint, p_concluida boolean default true)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente'); v_id bigint;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if not public.nx_crm_tarefa_ok(p_cliente, v, p_id) then raise exception 'tarefa_nao_encontrada' using errcode = '22023'; end if;
  update public.nx_tarefas set
    concluida_em = case when coalesce(p_concluida, true) then coalesce(concluida_em, now()) end,
    atualizado_em = now()
  where id = p_id and cliente_id = p_cliente returning id into v_id;
  if v_id is null then raise exception 'tarefa_nao_encontrada' using errcode = '22023'; end if;
  return (public.nx_crm_tarefas_json(p_cliente, array[v_id])::jsonb -> 0)::json;
end $$;

create or replace function public.nx_tarefa_excluir(p_token text, p_cliente uuid, p_id bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente'); v_id bigint;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if not public.nx_crm_tarefa_ok(p_cliente, v, p_id) then raise exception 'tarefa_nao_encontrada' using errcode = '22023'; end if;
  delete from public.nx_tarefas where id = p_id and cliente_id = p_cliente returning id into v_id;
  if v_id is null then raise exception 'tarefa_nao_encontrada' using errcode = '22023'; end if;
  return json_build_object('ok', true);
end $$;

-- ------------------------------------------------------------ notas (só o autor ou admin edita/exclui)
create or replace function public.nx_nota_salvar(p_token text, p_cliente uuid, p_nota jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  t jsonb := coalesce(p_nota, '{}'::jsonb);
  v_id bigint := public.nx_crm_int8(t, 'id');
  r public.nx_notas; l public.nx_leads; v_texto text; v_contato bigint; v_negocio bigint;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if jsonb_typeof(t) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'nota'; end if;
  if t ? 'texto' then
    v_texto := left(nullif(btrim(t ->> 'texto'), ''), 5000);
    if v_texto is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'texto'; end if;
  end if;
  if t ? 'fixada' and jsonb_typeof(t -> 'fixada') <> 'boolean' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'fixada';
  end if;
  if v_id is null then
    if v_texto is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'texto'; end if;
    if nullif(t ->> 'negocio_id', '') is not null then
      v_negocio := public.nx_crm_int8(t, 'negocio_id');
      select * into l from public.nx_leads where id = v_negocio and cliente_id = p_cliente;
      if l.id is null or (public.nx_crm_restrito(v) and l.dono_id is not null and l.dono_id <> v.conta_id) then
        raise exception 'negocio_nao_encontrado' using errcode = '22023';
      end if;
    end if;
    if nullif(t ->> 'contato_id', '') is not null then
      v_contato := public.nx_crm_int8(t, 'contato_id');
      if not exists (select 1 from public.nx_contatos k where k.id = v_contato and k.cliente_id = p_cliente
                       and (not public.nx_crm_restrito(v) or k.dono_id is null or k.dono_id = v.conta_id)) then
        raise exception 'contato_nao_encontrado' using errcode = '22023';
      end if;
    end if;
    v_contato := coalesce(v_contato, l.contato_id);
    if v_contato is null and v_negocio is null then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'contato_id';
    end if;
    insert into public.nx_notas (cliente_id, contato_id, negocio_id, autor_id, texto, fixada)
    values (p_cliente, v_contato, v_negocio, v.conta_id, v_texto, coalesce((t ->> 'fixada')::boolean, false))
    returning * into r;
  else
    select * into r from public.nx_notas where id = v_id and cliente_id = p_cliente for update;
    if r.id is null then raise exception 'nota_nao_encontrada' using errcode = '22023'; end if;
    if r.autor_id is distinct from v.conta_id and public.nx_rank(v.papel) < 3 then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
    update public.nx_notas x set
      texto = coalesce(v_texto, x.texto),
      editado_em = case when v_texto is not null and v_texto is distinct from x.texto then now() else x.editado_em end,
      fixada = case when t ? 'fixada' then (t ->> 'fixada')::boolean else x.fixada end
    where x.id = r.id;
  end if;
  return (public.nx_crm_notas_json(p_cliente, array[r.id], v)::jsonb -> 0)::json;
end $$;

create or replace function public.nx_nota_excluir(p_token text, p_cliente uuid, p_id bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente'); r public.nx_notas;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  select * into r from public.nx_notas where id = p_id and cliente_id = p_cliente for update;
  if r.id is null then raise exception 'nota_nao_encontrada' using errcode = '22023'; end if;
  if r.autor_id is distinct from v.conta_id and public.nx_rank(v.papel) < 3 then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  delete from public.nx_notas where id = r.id;
  return json_build_object('ok', true);
end $$;

-- ------------------------------------------------------------ etiqueta (criar: atendente · editar: supervisor)
create or replace function public.nx_etiqueta_salvar(p_token text, p_cliente uuid, p_etiqueta jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  t jsonb := coalesce(p_etiqueta, '{}'::jsonb);
  v_id uuid := public.nx_crm_uuid(t, 'id');
  v_nome text := left(nullif(btrim(t ->> 'nome'), ''), 40);
  v_cor text := nullif(btrim(t ->> 'cor'), '');
  r public.nx_etiquetas;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if v_cor is not null and v_cor !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'cor';
  end if;
  if v_id is null then
    if v_nome is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'nome'; end if;
    select * into r from public.nx_etiquetas where cliente_id = p_cliente and lower(nome) = lower(v_nome);
    if r.id is null then
      insert into public.nx_etiquetas (cliente_id, nome, cor) values (p_cliente, v_nome, coalesce(upper(v_cor), '#6FA3CF'))
      returning * into r;
    end if;
  else
    if public.nx_rank(v.papel) < 2 then raise exception 'sem_permissao' using errcode = '42501'; end if;
    select * into r from public.nx_etiquetas where id = v_id and cliente_id = p_cliente for update;
    if r.id is null then raise exception 'etiqueta_nao_encontrada' using errcode = '22023'; end if;
    if v_nome is not null and exists (select 1 from public.nx_etiquetas e where e.cliente_id = p_cliente
                                        and lower(e.nome) = lower(v_nome) and e.id <> r.id) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'nome_em_uso';
    end if;
    update public.nx_etiquetas set nome = coalesce(v_nome, nome), cor = coalesce(upper(v_cor), cor)
     where id = r.id returning * into r;
  end if;
  return json_build_object('id', r.id, 'nome', r.nome, 'cor', r.cor);
end $$;

-- ------------------------------------------------------------
-- Permissões: internas só service_role; painel anon/authenticated/service_role
-- ------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.nx_crm_uuid(jsonb,text)', 'public.nx_crm_int8(jsonb,text)', 'public.nx_crm_num(jsonb,text)',
    'public.nx_crm_data(jsonb,text)', 'public.nx_crm_ts(jsonb,text)', 'public.nx_crm_uuids(jsonb,text)',
    'public.nx_crm_dono_ok(uuid,uuid)', 'public.nx_crm_restrito(public.nx_ctx_t)',
    'public.nx_crm_etiquetas_ok(uuid,uuid[])', 'public.nx_crm_filtro_campo(text,jsonb)',
    'public.nx_crm_filtro_negocios(uuid,public.nx_ctx_t,jsonb,boolean)',
    'public.nx_crm_filtro_contatos(uuid,public.nx_ctx_t,jsonb)',
    'public.nx_crm_cards(uuid,bigint[],public.nx_ctx_t)', 'public.nx_crm_tarefas_json(uuid,bigint[])',
    'public.nx_crm_tarefa_ok(uuid,public.nx_ctx_t,bigint)',
    'public.nx_crm_notas_json(uuid,bigint[],public.nx_ctx_t)',
    'public.nx_crm_tempo(uuid,public.nx_ctx_t,bigint,bigint)',
    'public.nx_crm_negocio_json(uuid,bigint,public.nx_ctx_t)', 'public.nx_crm_contato_json(uuid,bigint)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'public.nx_crm_base(text,uuid)',
    'public.nx_negocios_kanban(text,uuid,uuid,jsonb,integer)',
    'public.nx_negocios_coluna(text,uuid,uuid,jsonb,integer)',
    'public.nx_negocio_ver(text,uuid,bigint)',
    'public.nx_negocio_salvar(text,uuid,jsonb)',
    'public.nx_negocio_mover(text,uuid,bigint,uuid,double precision,jsonb)',
    'public.nx_negocio_excluir(text,uuid,bigint)',
    'public.nx_contatos_listar(text,uuid,jsonb,integer,integer,text)',
    'public.nx_contato_ver(text,uuid,bigint)',
    'public.nx_contato_salvar(text,uuid,jsonb)',
    'public.nx_contato_excluir(text,uuid,bigint,text)',
    'public.nx_tarefa_salvar(text,uuid,jsonb)',
    'public.nx_tarefa_concluir(text,uuid,bigint,boolean)',
    'public.nx_tarefa_excluir(text,uuid,bigint)',
    'public.nx_nota_salvar(text,uuid,jsonb)',
    'public.nx_nota_excluir(text,uuid,bigint)',
    'public.nx_etiqueta_salvar(text,uuid,jsonb)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
end $$;
