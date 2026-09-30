-- ============================================================
-- ÓRBITA — 20260929c_cards_origem
-- Acrescenta atribuição nominal e UTMs seguros aos cards do CRM e à agenda.
-- Preserva assinaturas, filtros, permissões e todas as chaves de resposta existentes.
-- ============================================================

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
      'campanha_ext', l.campanha_ext, 'anuncio_ext', l.anuncio_ext,
      'campanha_nome', coalesce(
        (select m.campanha_nome from public.nx_metricas_dia m
          where m.cliente_id = p_cliente and m.plataforma = l.plataforma
            and l.campanha_ext is not null and m.campanha_ext = l.campanha_ext
            and m.campanha_nome is not null
          order by m.data desc limit 1), nullif(l.rastreio ->> 'utm_campaign', '')),
      'anuncio_nome', coalesce(
        (select m.anuncio_nome from public.nx_metricas_dia m
          where m.cliente_id = p_cliente and m.plataforma = l.plataforma
            and l.anuncio_ext is not null and m.anuncio_ext = l.anuncio_ext
            and m.anuncio_nome is not null
          order by m.data desc limit 1), nullif(l.rastreio ->> 'utm_content', '')),
      'rastreio', case when l.rastreio is null then null else jsonb_strip_nulls(jsonb_build_object(
        'utm_source', l.rastreio ->> 'utm_source', 'utm_medium', l.rastreio ->> 'utm_medium',
        'utm_campaign', l.rastreio ->> 'utm_campaign', 'utm_content', l.rastreio ->> 'utm_content',
        'utm_term', l.rastreio ->> 'utm_term', 'pagina', l.rastreio ->> 'pagina')) end,
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

revoke all on function public.nx_crm_cards(uuid, bigint[], public.nx_ctx_t) from public, anon, authenticated;
grant execute on function public.nx_crm_cards(uuid, bigint[], public.nx_ctx_t) to service_role;

create or replace function public.nx_agenda_dia(p_token text, p_cliente uuid, p_data date default null, p_dias int default 1)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  cfg jsonb; v_de date := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
  v_dias int := least(greatest(coalesce(p_dias, 1), 1), 31); v_ini timestamptz; v_fim timestamptz; r jsonb;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  cfg := public.nx_agenda_cfg(p_cliente);
  v_ini := v_de::timestamp at time zone 'America/Sao_Paulo';
  v_fim := (v_de + v_dias)::timestamp at time zone 'America/Sao_Paulo';
  select coalesce(jsonb_agg(jsonb_build_object(
      'negocio_id', l.id, 'contato_id', l.contato_id, 'nome', coalesce(k.nome, l.nome), 'telefone', coalesce(k.telefone, l.telefone),
      'inicio', public.nx_agenda_iso(l.consulta_em), 'rotulo', public.nx_agenda_rotulo(l.consulta_em),
      'fim', public.nx_agenda_iso(l.consulta_em + make_interval(mins => public.nx_agenda_dur(cfg, l.servico))),
      'servico', l.servico, 'status', l.status, 'etapa', s.nome, 'marco', s.marco, 'dono_id', l.dono_id, 'titulo', l.titulo,
      'origem', l.origem, 'plataforma', l.plataforma, 'campanha_ext', l.campanha_ext, 'anuncio_ext', l.anuncio_ext,
      'campanha_nome', coalesce(
        (select m.campanha_nome from public.nx_metricas_dia m
          where m.cliente_id = p_cliente and m.plataforma = l.plataforma
            and l.campanha_ext is not null and m.campanha_ext = l.campanha_ext
            and m.campanha_nome is not null
          order by m.data desc limit 1), nullif(l.rastreio ->> 'utm_campaign', '')),
      'anuncio_nome', coalesce(
        (select m.anuncio_nome from public.nx_metricas_dia m
          where m.cliente_id = p_cliente and m.plataforma = l.plataforma
            and l.anuncio_ext is not null and m.anuncio_ext = l.anuncio_ext
            and m.anuncio_nome is not null
          order by m.data desc limit 1), nullif(l.rastreio ->> 'utm_content', '')),
      'rastreio', case when l.rastreio is null then null else jsonb_strip_nulls(jsonb_build_object(
        'utm_source', l.rastreio ->> 'utm_source', 'utm_medium', l.rastreio ->> 'utm_medium',
        'utm_campaign', l.rastreio ->> 'utm_campaign', 'utm_content', l.rastreio ->> 'utm_content',
        'utm_term', l.rastreio ->> 'utm_term', 'pagina', l.rastreio ->> 'pagina')) end)
    order by l.consulta_em, l.id), '[]'::jsonb) into r
    from public.nx_leads l
    left join public.nx_contatos k on k.id = l.contato_id
    left join public.nx_estagios s on s.id = l.estagio_id
   where l.cliente_id = p_cliente and l.status in ('aberto', 'ganho')
     and l.consulta_em >= v_ini and l.consulta_em < v_fim
     and (not public.nx_crm_restrito(v) or l.dono_id is null or l.dono_id = v.conta_id);
  return json_build_object('data', v_de, 'dias', v_dias, 'fuso', 'America/Sao_Paulo', 'config', cfg, 'consultas', r,
    'bloqueios', public.nx_agenda_bloqueios_json(p_cliente, v_ini, v_fim));
end $$;

revoke all on function public.nx_agenda_dia(text, uuid, date, integer) from public, anon, authenticated;
grant execute on function public.nx_agenda_dia(text, uuid, date, integer) to anon, authenticated, service_role;
