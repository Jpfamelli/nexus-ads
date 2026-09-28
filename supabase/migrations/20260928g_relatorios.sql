-- ============================================================
-- ÓRBITA — 20260928g_relatorios.sql · frente F6 (arquivo g, §5.6)
-- Início (nx_inicio) e Relatórios (nx_rel_vendas, nx_rel_atendimento).
-- Regras de ouro: plpgsql, security definer, search_path = '', nomes
-- qualificados, idempotente (create or replace), revoke + grant explícito.
-- Tempo (regra 11): período ≤ 366 dias (periodo_grande); agregações sempre
-- com cliente_id = p_cliente; datas agrupadas no fuso America/Sao_Paulo;
-- percentis só sobre as conversas do período. Nada aqui escreve em tabela
-- (a única escrita possível é a auditoria de suporte do próprio nx_ctx).
-- Visibilidade:
--   · negócios: atendente/leitura com ver_todas = false só enxergam os seus
--     e os sem dono (§5.1) — vale para TODOS os números de vendas;
--   · conversas: a regra nx_cv_visivel na forma WHERE (copiada do arquivo a);
--     conversas ocultas (contato bloqueado) ficam fora dos relatórios.
-- Revisão (F6): os números do Início são os MESMOS dos contadores das telas de
-- destino — conversas = nx_cv_listar.contagens (ocultas fora; sem dono/minhas =
-- abertas + pendentes); tarefas = nx_tarefas_listar "Minhas" (só as da pessoa;
-- "hoje" = o dia inteiro em SP). Aplicado de novo com o mesmo nome (idempotente).
-- ============================================================

-- ------------------------------------------------------------
-- nx_inicio — a central da operação (T3)
-- ------------------------------------------------------------
create or replace function public.nx_inicio(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  v_rank int := public.nx_rank(v.papel);
  v_todos boolean := v_rank >= 2 or coalesce(v.ver_todas, true);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_amanha timestamptz := ((v_hoje + 1)::timestamp at time zone 'America/Sao_Paulo');
  v_mes date := date_trunc('month', v_hoje::timestamp)::date;
  v_ini_mes timestamptz := (v_mes::timestamp at time zone 'America/Sao_Paulo');
  v_mes_ant date := (v_mes - interval '1 month')::date;
  v_ini_mes_ant timestamptz := (v_mes_ant::timestamp at time zone 'America/Sao_Paulo');
  -- "mês passado até hoje": o mesmo dia do mês (ou o último dia do mês passado, se for menor)
  v_ant_parcial timestamptz := (least(v_mes_ant + (v_hoje - v_mes) + 1, v_mes)::timestamp at time zone 'America/Sao_Paulo');
  v_ini_hoje timestamptz := (v_hoje::timestamp at time zone 'America/Sao_Paulo');
  j_cv json; j_tf json; j_prox json; j_ng json; j_ld json; j_cn json; v_notif int;
begin
  -- conversas (abertas/pendentes) visíveis para quem pediu. As contagens são as MESMAS dos
  -- contadores das abas de Conversas (nx_cv_listar → contagens): cada número do Início leva à
  -- aba com o mesmo número. Ocultas (contato bloqueado) ficam fora, como nas abas; "sem dono" e
  -- "minhas" contam abertas + pendentes (como as abas Sem dono e Minhas).
  select json_build_object(
           'abertas', count(*) filter (where cv.status = 'aberta'),
           'aguardando', count(*) filter (where cv.status = 'aberta' and cv.aguardando),
           'sem_dono', count(*) filter (where cv.atribuida_a is null),
           'minhas', count(*) filter (where cv.atribuida_a = v.conta_id),
           'pendentes', count(*) filter (where cv.status = 'pendente'),
           'espera_mais_antiga_min', floor(extract(epoch from now() - min(coalesce(cv.ultima_entrada_em, cv.aberta_em))
                                     filter (where cv.status = 'aberta' and cv.aguardando)) / 60)::int)
    into j_cv
    from public.nx_conversas cv
   where cv.status in ('aberta', 'pendente')
     and not cv.oculta
     -- regra nx_cv_visivel
     and cv.cliente_id = p_cliente
     and ( v_rank >= 3
        or cv.atribuida_a = v.conta_id
        or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
              or cv.departamento_id = any(v.departamentos))
             and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) );

  -- tarefas da pessoa ainda abertas — a MESMA regra da tela Tarefas (nx_tarefas_listar, "Minhas"):
  -- só as dela (tarefa sem dono ou de colega não aparece: atendente não vê tarefa alheia);
  -- "hoje" = vence no dia de hoje (SP), "atrasadas" = já venceu — iguais aos contadores das abas.
  select json_build_object(
           'hoje', count(*) filter (where t.vence_em >= v_ini_hoje and t.vence_em < v_amanha),
           'atrasadas', count(*) filter (where t.vence_em < now()),
           'abertas', count(*))
    into j_tf
    from public.nx_tarefas t
   where t.cliente_id = p_cliente and t.concluida_em is null
     and t.dono_id = v.conta_id;
  select coalesce(json_agg(x order by x.vence_em nulls last, x.id), '[]'::json)
    into j_prox
    from (select t.id, t.titulo, t.tipo, t.vence_em, (t.vence_em < now()) as atrasada,
                 c.nome as contato_nome, t.contato_id, t.negocio_id
            from public.nx_tarefas t
            left join public.nx_contatos c on c.id = t.contato_id and c.cliente_id = p_cliente
           where t.cliente_id = p_cliente and t.concluida_em is null
             and t.dono_id = v.conta_id
           order by t.vence_em nulls last, t.id
           limit 5) x;

  -- negócios: abertos agora + fechados no mês e no mês anterior (por fechado_em, nunca por criado_em)
  select json_build_object(
           'abertos', count(*) filter (where l.status = 'aberto'),
           'valor_aberto', coalesce(sum(coalesce(l.valor_previsto, 0)) filter (where l.status = 'aberto'), 0),
           'previsao_ponderada', round(coalesce(sum(coalesce(l.valor_previsto, 0) * coalesce(e.probabilidade, 0) / 100.0)
                                         filter (where l.status = 'aberto'), 0), 2),
           'ganhos_mes', count(*) filter (where l.status = 'ganho' and l.fechado_em >= v_ini_mes),
           'receita_mes', coalesce(sum(coalesce(l.valor, l.valor_previsto, 0)) filter (where l.status = 'ganho' and l.fechado_em >= v_ini_mes), 0),
           'ganhos_mes_anterior', count(*) filter (where l.status = 'ganho' and l.fechado_em >= v_ini_mes_ant and l.fechado_em < v_ini_mes),
           'receita_mes_anterior', coalesce(sum(coalesce(l.valor, l.valor_previsto, 0))
                                     filter (where l.status = 'ganho' and l.fechado_em >= v_ini_mes_ant and l.fechado_em < v_ini_mes), 0),
           'receita_mes_anterior_parcial', coalesce(sum(coalesce(l.valor, l.valor_previsto, 0))
                                     filter (where l.status = 'ganho' and l.fechado_em >= v_ini_mes_ant and l.fechado_em < v_ant_parcial), 0),
           'dia_do_mes', (v_hoje - v_mes) + 1)
    into j_ng
    from public.nx_leads l
    left join public.nx_estagios e on e.id = l.estagio_id
   where l.cliente_id = p_cliente
     and (l.status = 'aberto' or (l.status = 'ganho' and l.fechado_em >= v_ini_mes_ant))
     and (v_todos or l.dono_id = v.conta_id or l.dono_id is null);

  -- leads = negócios que ENTRARAM pelo funil padrão ou por um funil do Ads (pós-venda não é lead)
  select json_build_object(
           'hoje', count(*) filter (where l.data_conversa = v_hoje),
           'hoje_anuncio', count(*) filter (where l.data_conversa = v_hoje and (l.origem = 'anuncio' or l.plataforma is not null)),
           'semana', count(*),
           'semana_anuncio', count(*) filter (where l.origem = 'anuncio' or l.plataforma is not null))
    into j_ld
    from public.nx_leads l
   where l.cliente_id = p_cliente and l.data_conversa > v_hoje - 7 and l.data_conversa <= v_hoje
     and (l.funil_id is null or exists (select 1 from public.nx_funis f where f.id = l.funil_id and (f.padrao or f.conta_no_ads)))
     and (v_todos or l.dono_id = v.conta_id or l.dono_id is null);

  -- números de WhatsApp (saúde): nunca devolve segredo
  select coalesce(json_agg(json_build_object(
           'id', k.id, 'nome', k.nome, 'numero_exibicao', k.numero_exibicao, 'status', k.status,
           'ultimo_erro', k.ultimo_erro, 'app_inscrito', k.app_inscrito, 'verificado_em', k.verificado_em,
           'ultima_entrada_em', (select max(cv.ultima_entrada_em) from public.nx_conversas cv
                                  where cv.canal_id = k.id and cv.cliente_id = p_cliente))
           order by k.criado_em), '[]'::json)
    into j_cn
    from public.nx_canais k
   where k.cliente_id = p_cliente;

  select count(*) into v_notif
    from public.nx_notificacoes n
   where n.cliente_id = p_cliente and n.conta_id = v.conta_id and n.lida_em is null;

  return json_build_object(
    'hoje', v_hoje, 'agora', now(),
    'conversas', j_cv,
    'tarefas', (j_tf::jsonb || jsonb_build_object('proximas', j_prox))::json,
    'negocios', j_ng,
    'leads', j_ld,
    'canais', j_cn,
    'notificacoes_nao_lidas', v_notif);
end $$;
revoke all on function public.nx_inicio(text, uuid) from public, anon, authenticated;
grant execute on function public.nx_inicio(text, uuid) to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- nx_rel_vendas — T13 Vendas
-- criados por criado_em; ganhos/perdidos/receita por fechado_em;
-- conversão = ganhos ÷ (ganhos + perdidos); período anterior = mesmo tamanho logo antes.
-- ------------------------------------------------------------
create or replace function public.nx_rel_vendas(p_token text, p_cliente uuid, p_de date, p_ate date, p_funil uuid default null)
returns json
language plpgsql
security definer
set search_path = ''
set enable_nestloop = off   -- relatório agrega o período inteiro de UM cliente: hash join sempre (com estatística velha, depois de uma importação grande, o nested loop virava 30 s)
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  v_rank int := public.nx_rank(v.papel);
  v_todos boolean := v_rank >= 2 or coalesce(v.ver_todas, true);
  v_n int; v_ade date; v_aate date;
  v_ini timestamptz; v_fim timestamptz; v_aini timestamptz;
  v_funil uuid; v_funil_nome text;
  j_kpis json; j_kant json; j_abertos json; j_funil json; j_origem json; j_dono json; j_motivos json;
  j_parados json; j_serie json; j_funis json;
begin
  if v.papel not in ('gestor', 'super') then perform public.nx_exigir_modulo(p_cliente, 'relatorios'); end if;
  if p_de is null or p_ate is null or p_ate < p_de then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'periodo';
  end if;
  if p_ate - p_de > 366 then raise exception 'periodo_grande' using errcode = '22023'; end if;
  if p_funil is not null and not exists (select 1 from public.nx_funis f where f.id = p_funil and f.cliente_id = p_cliente) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'p_funil';   -- funil de outro cliente = inexistente
  end if;

  v_n := p_ate - p_de + 1; v_ade := p_de - v_n; v_aate := p_de - 1;
  v_ini := (p_de::timestamp at time zone 'America/Sao_Paulo');
  v_fim := ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo');
  v_aini := (v_ade::timestamp at time zone 'America/Sao_Paulo');
  select f.id, f.nome into v_funil, v_funil_nome
    from public.nx_funis f
   where f.cliente_id = p_cliente and (f.id = p_funil or (p_funil is null and f.ativo))
   order by (f.id = p_funil) desc nulls last, f.padrao desc, f.ordem
   limit 1;

  select coalesce(json_agg(json_build_object('id', f.id, 'nome', f.nome, 'padrao', f.padrao, 'conta_no_ads', f.conta_no_ads)
                           order by f.padrao desc, f.ordem, f.nome), '[]'::json)
    into j_funis
    from public.nx_funis f where f.cliente_id = p_cliente and f.ativo;

  -- KPIs do período e do anterior (uma passada)
  with b as (
    select l.status, l.criado_em, l.fechado_em,
           coalesce(l.valor, l.valor_previsto, 0) as vfinal, coalesce(l.valor_previsto, l.valor, 0) as vprev
      from public.nx_leads l
     where l.cliente_id = p_cliente
       and (p_funil is null or l.funil_id = p_funil)
       and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)
       and (l.criado_em >= v_aini or l.fechado_em >= v_aini)
  ), k as (
    select
      count(*) filter (where criado_em >= v_ini and criado_em < v_fim) as criados,
      count(*) filter (where status = 'ganho' and fechado_em >= v_ini and fechado_em < v_fim) as ganhos,
      coalesce(sum(vfinal) filter (where status = 'ganho' and fechado_em >= v_ini and fechado_em < v_fim), 0) as receita,
      count(*) filter (where status = 'perdido' and fechado_em >= v_ini and fechado_em < v_fim) as perdidos,
      coalesce(sum(vprev) filter (where status = 'perdido' and fechado_em >= v_ini and fechado_em < v_fim), 0) as valor_perdido,
      avg(extract(epoch from fechado_em - criado_em) / 86400.0) filter (where status = 'ganho' and fechado_em >= v_ini and fechado_em < v_fim) as ciclo,
      count(*) filter (where criado_em >= v_aini and criado_em < v_ini) as a_criados,
      count(*) filter (where status = 'ganho' and fechado_em >= v_aini and fechado_em < v_ini) as a_ganhos,
      coalesce(sum(vfinal) filter (where status = 'ganho' and fechado_em >= v_aini and fechado_em < v_ini), 0) as a_receita,
      count(*) filter (where status = 'perdido' and fechado_em >= v_aini and fechado_em < v_ini) as a_perdidos,
      coalesce(sum(vprev) filter (where status = 'perdido' and fechado_em >= v_aini and fechado_em < v_ini), 0) as a_valor_perdido,
      avg(extract(epoch from fechado_em - criado_em) / 86400.0) filter (where status = 'ganho' and fechado_em >= v_aini and fechado_em < v_ini) as a_ciclo
    from b
  )
  select json_build_object('criados', criados, 'ganhos', ganhos, 'receita', receita, 'perdidos', perdidos, 'valor_perdido', valor_perdido,
           'ticket_medio', case when ganhos > 0 then round(receita / ganhos, 2) end,
           'conversao_pct', case when ganhos + perdidos > 0 then round(ganhos * 100.0 / (ganhos + perdidos), 1) end,
           'ciclo_medio_dias', round(ciclo::numeric, 1)),
         json_build_object('criados', a_criados, 'ganhos', a_ganhos, 'receita', a_receita, 'perdidos', a_perdidos, 'valor_perdido', a_valor_perdido,
           'ticket_medio', case when a_ganhos > 0 then round(a_receita / a_ganhos, 2) end,
           'conversao_pct', case when a_ganhos + a_perdidos > 0 then round(a_ganhos * 100.0 / (a_ganhos + a_perdidos), 1) end,
           'ciclo_medio_dias', round(a_ciclo::numeric, 1),
           'abertos', null, 'valor_aberto', null, 'previsao_ponderada', null)
    into j_kpis, j_kant
    from k;

  -- carteira aberta agora (não tem "período anterior")
  select json_build_object(
           'abertos', count(*),
           'valor_aberto', coalesce(sum(coalesce(l.valor_previsto, 0)), 0),
           'previsao_ponderada', round(coalesce(sum(coalesce(l.valor_previsto, 0) * coalesce(e.probabilidade, 0) / 100.0), 0), 2))
    into j_abertos
    from public.nx_leads l
    left join public.nx_estagios e on e.id = l.estagio_id
   where l.cliente_id = p_cliente and l.status = 'aberto'
     and (p_funil is null or l.funil_id = p_funil)
     and (v_todos or l.dono_id = v.conta_id or l.dono_id is null);
  j_kpis := (j_kpis::jsonb || j_abertos::jsonb)::json;

  -- funil por etapa (do funil escolhido; sem escolha, o padrão)
  with est as (
    select e.id, e.nome, e.cor, e.tipo, e.ordem, e.marco from public.nx_estagios e where e.funil_id = v_funil and e.cliente_id = p_cliente
  ), vis as (   -- negócios do funil que a pessoa enxerga
    select l.id, l.estagio_id, l.status, l.estagio_em, l.fechado_em,
           coalesce(l.valor, l.valor_previsto, 0) as vfinal, coalesce(l.valor_previsto, 0) as vprev
      from public.nx_leads l
     where l.cliente_id = p_cliente and l.funil_id = v_funil
       and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)
  ), ent as (   -- entradas em cada etapa no período: histórico de etapa + criados nela (+ quem não tem histórico)
    -- (junta com nx_leads pela chave primária — nunca CTE × CTE: o plano fica linear mesmo com estatística velha)
    select distinct on (x.estagio_id, x.negocio_id) x.estagio_id, x.negocio_id, x.em, l.estagio_id as atual
      from (
        select (h.dados ->> 'para')::uuid as estagio_id, h.negocio_id, h.criado_em as em
          from public.nx_historico h
         where h.cliente_id = p_cliente and h.tipo = 'estagio' and h.criado_em >= v_ini and h.criado_em < v_fim
        union all
        select (h.dados ->> 'estagio')::uuid, h.negocio_id, h.criado_em
          from public.nx_historico h
         where h.cliente_id = p_cliente and h.tipo = 'negocio_criado' and h.criado_em >= v_ini and h.criado_em < v_fim
        union all
        select l2.estagio_id, l2.id, l2.estagio_em
          from public.nx_leads l2
         where l2.cliente_id = p_cliente and l2.funil_id = v_funil and l2.estagio_em >= v_ini and l2.estagio_em < v_fim
      ) x
      join public.nx_leads l on l.id = x.negocio_id and l.cliente_id = p_cliente and l.funil_id = v_funil
                            and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)
      join est on est.id = x.estagio_id
     order by x.estagio_id, x.negocio_id, x.em
  ), avanc as (   -- quem, depois de entrar, foi para uma etapa adiante (que não seja de perda nem "faltou")
    select ent.estagio_id, ent.negocio_id
      from ent
      join est s on s.id = ent.estagio_id
      join public.nx_historico h2 on h2.negocio_id = ent.negocio_id and h2.cliente_id = p_cliente and h2.tipo = 'estagio' and h2.criado_em >= ent.em
      join est t on t.id = (h2.dados ->> 'para')::uuid
     where t.ordem > s.ordem and t.tipo <> 'perdido' and coalesce(t.marco, '') <> 'faltou'
    union all
    select ent.estagio_id, ent.negocio_id
      from ent join est s on s.id = ent.estagio_id join est t on t.id = ent.atual
     where t.ordem > s.ordem and t.tipo <> 'perdido' and coalesce(t.marco, '') <> 'faltou'
  ), conv as (   -- um GROUP BY só (sem juntar CTE com CTE)
    select y.estagio_id,
           count(distinct y.negocio_id) as passaram,
           count(distinct y.negocio_id) filter (where y.avancou) as avancaram
      from (select ent.estagio_id, ent.negocio_id, false as avancou from ent
            union all
            select avanc.estagio_id, avanc.negocio_id, true from avanc) y
     group by y.estagio_id
  ), atual as (
    select vis.estagio_id,
           count(*) filter (where vis.status = 'aberto') as qa,
           coalesce(sum(vis.vprev) filter (where vis.status = 'aberto'), 0) as va,
           count(*) filter (where vis.status <> 'aberto' and vis.fechado_em >= v_ini and vis.fechado_em < v_fim) as qf,
           coalesce(sum(vis.vfinal) filter (where vis.status <> 'aberto' and vis.fechado_em >= v_ini and vis.fechado_em < v_fim), 0) as vf
      from vis group by vis.estagio_id
  )
  select coalesce(json_agg(json_build_object(
           'estagio_id', est.id, 'nome', est.nome, 'cor', est.cor, 'tipo', est.tipo,
           'qtd_atual', case when est.tipo = 'aberto' then coalesce(atual.qa, 0) else coalesce(atual.qf, 0) end,
           'valor_atual', case when est.tipo = 'aberto' then coalesce(atual.va, 0) else coalesce(atual.vf, 0) end,
           'passaram', coalesce(conv.passaram, 0),
           'avancaram', coalesce(conv.avancaram, 0),
           'conversao_proxima_pct', case when est.tipo <> 'aberto' or coalesce(conv.passaram, 0) = 0 then null
                                         else round(conv.avancaram * 100.0 / conv.passaram, 1) end)
           order by est.ordem), '[]'::json)
    into j_funil
    from est left join conv on conv.estagio_id = est.id left join atual on atual.estagio_id = est.id;

  -- base do período para origem, responsável e motivos
  with b as (
    select l.status, l.criado_em, l.fechado_em, l.origem, l.plataforma, l.dono_id, l.motivo_perda_id,
           coalesce(l.valor, l.valor_previsto, 0) as vfinal, coalesce(l.valor_previsto, l.valor, 0) as vprev,
           (l.criado_em >= v_ini and l.criado_em < v_fim) as criado_p,
           (l.fechado_em >= v_ini and l.fechado_em < v_fim) as fechado_p
      from public.nx_leads l
     where l.cliente_id = p_cliente
       and (p_funil is null or l.funil_id = p_funil)
       and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)
       and (l.status = 'aberto' or l.criado_em >= v_ini or l.fechado_em >= v_ini)
  ), o as (
    select coalesce(b.origem, 'manual') as origem, b.plataforma,
           count(*) filter (where criado_p) as criados,
           count(*) filter (where status = 'ganho' and fechado_p) as ganhos,
           count(*) filter (where status = 'perdido' and fechado_p) as perdidos,
           coalesce(sum(vfinal) filter (where status = 'ganho' and fechado_p), 0) as receita
      from b group by 1, 2
  ), d as (
    select b.dono_id,
           count(*) filter (where criado_p) as criados,
           count(*) filter (where status = 'ganho' and fechado_p) as ganhos,
           coalesce(sum(vfinal) filter (where status = 'ganho' and fechado_p), 0) as receita,
           count(*) filter (where status = 'aberto') as abertos
      from b group by 1
  ), m as (
    select b.motivo_perda_id, count(*) as qtd, coalesce(sum(vprev), 0) as valor
      from b where status = 'perdido' and fechado_p group by 1
  )
  select
    (select coalesce(json_agg(json_build_object('origem', o.origem, 'plataforma', o.plataforma, 'criados', o.criados, 'ganhos', o.ganhos,
              'perdidos', o.perdidos, 'receita', o.receita,
              'conversao_pct', case when o.ganhos + o.perdidos > 0 then round(o.ganhos * 100.0 / (o.ganhos + o.perdidos), 1) end)
              order by o.criados desc, o.receita desc), '[]'::json)
       from o where o.criados + o.ganhos + o.perdidos > 0),
    (select coalesce(json_agg(json_build_object('conta_id', d.dono_id, 'nome', coalesce(c.nome, case when d.dono_id is null then 'Sem responsável' else 'Conta removida' end),
              'criados', d.criados, 'ganhos', d.ganhos, 'receita', d.receita,
              'ticket_medio', case when d.ganhos > 0 then round(d.receita / d.ganhos, 2) end, 'abertos', d.abertos)
              order by d.receita desc, d.ganhos desc, d.criados desc), '[]'::json)
       from d left join public.nx_contas c on c.id = d.dono_id
      where d.criados + d.ganhos + d.abertos > 0),
    (select coalesce(json_agg(json_build_object('motivo_id', m.motivo_perda_id,
              'nome', coalesce(mp.nome, 'Sem motivo informado'), 'qtd', m.qtd, 'valor', m.valor)
              order by m.qtd desc, m.valor desc), '[]'::json)
       from m left join public.nx_motivos_perda mp on mp.id = m.motivo_perda_id and mp.cliente_id = p_cliente)
    into j_origem, j_dono, j_motivos;

  -- parados: abertos há mais de 7 dias na mesma etapa (funil escolhido)
  select coalesce(json_agg(json_build_object('estagio_id', x.id, 'nome', x.nome, 'cor', x.cor, 'qtd', x.qtd) order by x.ordem), '[]'::json)
    into j_parados
    from (select e.id, e.nome, e.cor, e.ordem, count(*) as qtd
            from public.nx_leads l join public.nx_estagios e on e.id = l.estagio_id
           where l.cliente_id = p_cliente and l.funil_id = v_funil and l.status = 'aberto'
             and l.estagio_em < now() - interval '7 days'
             and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)
           group by e.id, e.nome, e.cor, e.ordem) x;

  -- série diária (dias do fuso SP, com zeros)
  with dias as (select generate_series(p_de, p_ate, interval '1 day')::date as d),
  cr as (
    select (l.criado_em at time zone 'America/Sao_Paulo')::date as d, count(*) as n
      from public.nx_leads l
     where l.cliente_id = p_cliente and l.criado_em >= v_ini and l.criado_em < v_fim
       and (p_funil is null or l.funil_id = p_funil)
       and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)
     group by 1
  ), gn as (
    select (l.fechado_em at time zone 'America/Sao_Paulo')::date as d, count(*) as n, sum(coalesce(l.valor, l.valor_previsto, 0)) as r
      from public.nx_leads l
     where l.cliente_id = p_cliente and l.status = 'ganho' and l.fechado_em >= v_ini and l.fechado_em < v_fim
       and (p_funil is null or l.funil_id = p_funil)
       and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)
     group by 1
  )
  select json_agg(json_build_object('d', dias.d, 'criados', coalesce(cr.n, 0), 'ganhos', coalesce(gn.n, 0), 'receita', coalesce(gn.r, 0)) order by dias.d)
    into j_serie
    from dias left join cr on cr.d = dias.d left join gn on gn.d = dias.d;

  return json_build_object(
    'periodo', json_build_object('de', p_de, 'ate', p_ate),
    'anterior', json_build_object('de', v_ade, 'ate', v_aate),
    'funil_ref', case when v_funil is null then null else json_build_object('id', v_funil, 'nome', v_funil_nome) end,
    'funis', j_funis,
    'kpis', j_kpis, 'kpis_anterior', j_kant,
    'funil', j_funil, 'por_origem', j_origem, 'por_dono', j_dono, 'motivos_perda', j_motivos,
    'parados', j_parados, 'serie', coalesce(j_serie, '[]'::json));
end $$;
revoke all on function public.nx_rel_vendas(text, uuid, date, date, uuid) from public, anon, authenticated;
grant execute on function public.nx_rel_vendas(text, uuid, date, date, uuid) to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- nx_rel_atendimento — T13 Atendimento
-- tpr = primeira_resposta_em − aberta_em das conversas ABERTAS no período (mediana:
-- percentile_cont(0.5)); mapa de calor = mensagens recebidas por dia da semana × hora (SP).
-- ------------------------------------------------------------
create or replace function public.nx_rel_atendimento(p_token text, p_cliente uuid, p_de date, p_ate date, p_departamento uuid default null)
returns json
language plpgsql
security definer
set search_path = ''
set enable_nestloop = off   -- relatório agrega o período inteiro de UM cliente: hash join sempre (com estatística velha, depois de uma importação grande, o nested loop virava 30 s)
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  v_rank int := public.nx_rank(v.papel);
  v_n int; v_ade date; v_aate date;
  v_ini timestamptz; v_fim timestamptz; v_aini timestamptz;
  j_kpis json; j_kant json; j_msgs json; j_atend json; j_dep json; j_can json; j_calor json; j_serie json; j_deps json;
begin
  if v.papel not in ('gestor', 'super') then perform public.nx_exigir_modulo(p_cliente, 'relatorios'); end if;
  if p_de is null or p_ate is null or p_ate < p_de then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'periodo';
  end if;
  if p_ate - p_de > 366 then raise exception 'periodo_grande' using errcode = '22023'; end if;
  if p_departamento is not null and not exists (select 1 from public.nx_departamentos d where d.id = p_departamento and d.cliente_id = p_cliente) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'p_departamento';
  end if;

  v_n := p_ate - p_de + 1; v_ade := p_de - v_n; v_aate := p_de - 1;
  v_ini := (p_de::timestamp at time zone 'America/Sao_Paulo');
  v_fim := ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo');
  v_aini := (v_ade::timestamp at time zone 'America/Sao_Paulo');

  select coalesce(json_agg(json_build_object('id', d.id, 'nome', d.nome, 'cor', d.cor) order by d.ordem, d.nome), '[]'::json)
    into j_deps from public.nx_departamentos d where d.cliente_id = p_cliente and d.ativo;

  -- conversas do período (e do anterior) que a pessoa enxerga
  with cvs as (
    select cv.id, cv.status, cv.aguardando, cv.aberta_em, cv.primeira_resposta_em, cv.resolvida_em,
           extract(epoch from cv.primeira_resposta_em - cv.aberta_em) / 60.0 as tpr,
           extract(epoch from cv.resolvida_em - cv.aberta_em) / 3600.0 as res_h
      from public.nx_conversas cv
     where (p_departamento is null or cv.departamento_id = p_departamento)
       and (cv.aberta_em >= v_aini or cv.resolvida_em >= v_aini or cv.status <> 'resolvida')
       and not cv.oculta
       -- regra nx_cv_visivel
       and cv.cliente_id = p_cliente
       and ( v_rank >= 3
          or cv.atribuida_a = v.conta_id
          or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                or cv.departamento_id = any(v.departamentos))
               and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )
  )
  select
    json_build_object(
      'novas', count(*) filter (where aberta_em >= v_ini and aberta_em < v_fim),
      'resolvidas', count(*) filter (where resolvida_em >= v_ini and resolvida_em < v_fim),
      'abertas_agora', count(*) filter (where status = 'aberta'),
      'aguardando_agora', count(*) filter (where status = 'aberta' and aguardando),
      'tpr_mediana_min', round((percentile_cont(0.5) within group (order by tpr) filter (where aberta_em >= v_ini and aberta_em < v_fim and tpr is not null))::numeric, 1),
      'tpr_media_min', round((avg(tpr) filter (where aberta_em >= v_ini and aberta_em < v_fim))::numeric, 1),
      'resolucao_mediana_h', round((percentile_cont(0.5) within group (order by res_h) filter (where resolvida_em >= v_ini and resolvida_em < v_fim and res_h is not null))::numeric, 1),
      'sem_resposta', count(*) filter (where aberta_em >= v_ini and aberta_em < v_fim and primeira_resposta_em is null)),
    json_build_object(
      'novas', count(*) filter (where aberta_em >= v_aini and aberta_em < v_ini),
      'resolvidas', count(*) filter (where resolvida_em >= v_aini and resolvida_em < v_ini),
      'abertas_agora', null, 'aguardando_agora', null,
      'tpr_mediana_min', round((percentile_cont(0.5) within group (order by tpr) filter (where aberta_em >= v_aini and aberta_em < v_ini and tpr is not null))::numeric, 1),
      'tpr_media_min', round((avg(tpr) filter (where aberta_em >= v_aini and aberta_em < v_ini))::numeric, 1),
      'resolucao_mediana_h', round((percentile_cont(0.5) within group (order by res_h) filter (where resolvida_em >= v_aini and resolvida_em < v_ini and res_h is not null))::numeric, 1),
      'sem_resposta', count(*) filter (where aberta_em >= v_aini and aberta_em < v_ini and primeira_resposta_em is null))
    into j_kpis, j_kant
    from cvs;

  -- mensagens (sem notas internas e sem mensagens de sistema) das conversas visíveis
  with ms as (
    select m.direcao, m.criado_em, m.enviado_por, m.canal_id
      from public.nx_mensagens m
      join public.nx_conversas cv on cv.id = m.conversa_id
     where m.cliente_id = p_cliente and m.criado_em >= v_aini and m.criado_em < v_fim
       and m.tipo not in ('nota', 'sistema')
       and (p_departamento is null or cv.departamento_id = p_departamento)
       and not cv.oculta
       -- regra nx_cv_visivel
       and cv.cliente_id = p_cliente
       and ( v_rank >= 3
          or cv.atribuida_a = v.conta_id
          or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                or cv.departamento_id = any(v.departamentos))
               and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )
  ), cal as (
    select extract(dow from ms.criado_em at time zone 'America/Sao_Paulo')::int as dow,
           extract(hour from ms.criado_em at time zone 'America/Sao_Paulo')::int as hora, count(*) as qtd
      from ms where ms.direcao = 'in' and ms.criado_em >= v_ini
     group by 1, 2
  ), ag as (
    select count(*) filter (where direcao = 'in' and criado_em >= v_ini) as msgs_in,
           count(*) filter (where direcao = 'out' and criado_em >= v_ini) as msgs_out,
           count(*) filter (where direcao = 'in' and criado_em < v_ini) as a_msgs_in,
           count(*) filter (where direcao = 'out' and criado_em < v_ini) as a_msgs_out
      from ms
  ), pa as (   -- mensagens enviadas por pessoa (período)
    select ms.enviado_por as conta_id, count(*) as msgs_out from ms
     where ms.direcao = 'out' and ms.criado_em >= v_ini and ms.enviado_por is not null group by 1
  ), pc as (   -- por número
    select ms.canal_id, count(*) filter (where direcao = 'in') as msgs_in, count(*) filter (where direcao = 'out') as msgs_out
      from ms where ms.criado_em >= v_ini group by 1
  )
  select json_build_object('ag', (select row_to_json(ag) from ag),
                           'pa', (select coalesce(json_agg(pa), '[]'::json) from pa),
                           'pc', (select coalesce(json_agg(pc), '[]'::json) from pc)),
         (select coalesce(json_agg(json_build_object('dow', cal.dow, 'hora', cal.hora, 'qtd', cal.qtd) order by cal.dow, cal.hora), '[]'::json) from cal)
    into j_msgs, j_calor;

  j_kpis := (j_kpis::jsonb || jsonb_build_object('msgs_in', coalesce((j_msgs -> 'ag' ->> 'msgs_in')::int, 0),
                                                 'msgs_out', coalesce((j_msgs -> 'ag' ->> 'msgs_out')::int, 0)))::json;
  j_kant := (j_kant::jsonb || jsonb_build_object('msgs_in', coalesce((j_msgs -> 'ag' ->> 'a_msgs_in')::int, 0),
                                                 'msgs_out', coalesce((j_msgs -> 'ag' ->> 'a_msgs_out')::int, 0)))::json;

  -- por atendente, por departamento, por número (período)
  with cvs as (
    select cv.id, cv.atribuida_a, cv.resolvida_por, cv.departamento_id, cv.canal_id, cv.status, cv.aguardando,
           cv.aberta_em, cv.resolvida_em, extract(epoch from cv.primeira_resposta_em - cv.aberta_em) / 60.0 as tpr,
           (cv.aberta_em >= v_ini and cv.aberta_em < v_fim) as nova_p,
           (cv.resolvida_em >= v_ini and cv.resolvida_em < v_fim) as resolvida_p
      from public.nx_conversas cv
     where (p_departamento is null or cv.departamento_id = p_departamento)
       and (cv.aberta_em >= v_ini or cv.resolvida_em >= v_ini or cv.status <> 'resolvida')
       and not cv.oculta
       -- regra nx_cv_visivel
       and cv.cliente_id = p_cliente
       and ( v_rank >= 3
          or cv.atribuida_a = v.conta_id
          or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                or cv.departamento_id = any(v.departamentos))
               and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )
  ), pessoas as (
    select x.conta_id from (
      select cvs.atribuida_a as conta_id from cvs where cvs.nova_p and cvs.atribuida_a is not null
      union select cvs.resolvida_por from cvs where cvs.resolvida_p and cvs.resolvida_por is not null
      union select (e ->> 'conta_id')::uuid from json_array_elements(j_msgs -> 'pa') e) x
    where x.conta_id is not null
  ), porp as (
    select p.conta_id, k.nome,
           (select count(*) from cvs where cvs.nova_p and cvs.atribuida_a = p.conta_id) as conversas,
           (select count(*) from cvs where cvs.resolvida_p and cvs.resolvida_por = p.conta_id) as resolvidas,
           (select round((percentile_cont(0.5) within group (order by cvs.tpr))::numeric, 1) from cvs
             where cvs.nova_p and cvs.atribuida_a = p.conta_id and cvs.tpr is not null) as tpr_mediana_min,
           coalesce((select (e ->> 'msgs_out')::int from json_array_elements(j_msgs -> 'pa') e where (e ->> 'conta_id')::uuid = p.conta_id), 0) as msgs_out
      from pessoas p left join public.nx_contas k on k.id = p.conta_id
  ), pord as (
    select cvs.departamento_id,
           count(*) filter (where nova_p) as novas, count(*) filter (where resolvida_p) as resolvidas,
           count(*) filter (where status = 'aberta') as abertas_agora,
           round((percentile_cont(0.5) within group (order by tpr) filter (where nova_p and tpr is not null))::numeric, 1) as tpr_mediana_min
      from cvs group by 1
  ), porc as (
    select cvs.canal_id, count(*) filter (where nova_p) as novas from cvs group by 1
  )
  select
    (select coalesce(json_agg(json_build_object('conta_id', porp.conta_id, 'nome', coalesce(porp.nome, 'Conta removida'),
              'conversas', porp.conversas, 'resolvidas', porp.resolvidas, 'tpr_mediana_min', porp.tpr_mediana_min, 'msgs_out', porp.msgs_out)
              order by porp.conversas desc, porp.resolvidas desc, porp.msgs_out desc), '[]'::json) from porp),
    (select coalesce(json_agg(json_build_object('departamento_id', pord.departamento_id,
              'nome', coalesce(d.nome, 'Sem departamento'), 'cor', d.cor,
              'novas', pord.novas, 'resolvidas', pord.resolvidas, 'abertas_agora', pord.abertas_agora, 'tpr_mediana_min', pord.tpr_mediana_min)
              order by pord.novas desc), '[]'::json)
       from pord left join public.nx_departamentos d on d.id = pord.departamento_id and d.cliente_id = p_cliente
      where pord.novas + pord.resolvidas + pord.abertas_agora > 0),
    (select coalesce(json_agg(json_build_object('canal_id', x.canal_id, 'nome', coalesce(k.nome, 'Número removido'),
              'numero_exibicao', k.numero_exibicao, 'novas', x.novas, 'msgs_in', x.msgs_in, 'msgs_out', x.msgs_out)
              order by x.novas desc, x.msgs_in desc), '[]'::json)
       from (select y.canal_id, sum(y.novas)::int as novas, sum(y.msgs_in)::int as msgs_in, sum(y.msgs_out)::int as msgs_out
               from (select porc.canal_id, porc.novas, 0 as msgs_in, 0 as msgs_out from porc
                     union all
                     select (e ->> 'canal_id')::uuid, 0, (e ->> 'msgs_in')::int, (e ->> 'msgs_out')::int
                       from json_array_elements(j_msgs -> 'pc') e) y
              group by y.canal_id) x
       left join public.nx_canais k on k.id = x.canal_id and k.cliente_id = p_cliente
      where x.novas + x.msgs_in + x.msgs_out > 0)
    into j_atend, j_dep, j_can;

  -- série diária: novas × resolvidas
  with dias as (select generate_series(p_de, p_ate, interval '1 day')::date as d),
  cvs as (
    select cv.aberta_em, cv.resolvida_em
      from public.nx_conversas cv
     where (p_departamento is null or cv.departamento_id = p_departamento)
       and ((cv.aberta_em >= v_ini and cv.aberta_em < v_fim) or (cv.resolvida_em >= v_ini and cv.resolvida_em < v_fim))
       and not cv.oculta
       -- regra nx_cv_visivel
       and cv.cliente_id = p_cliente
       and ( v_rank >= 3
          or cv.atribuida_a = v.conta_id
          or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                or cv.departamento_id = any(v.departamentos))
               and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )
  ), nv as (
    select (aberta_em at time zone 'America/Sao_Paulo')::date as d, count(*) as n from cvs where aberta_em >= v_ini and aberta_em < v_fim group by 1
  ), rs as (
    select (resolvida_em at time zone 'America/Sao_Paulo')::date as d, count(*) as n from cvs where resolvida_em >= v_ini and resolvida_em < v_fim group by 1
  )
  select json_agg(json_build_object('d', dias.d, 'novas', coalesce(nv.n, 0), 'resolvidas', coalesce(rs.n, 0)) order by dias.d)
    into j_serie
    from dias left join nv on nv.d = dias.d left join rs on rs.d = dias.d;

  return json_build_object(
    'periodo', json_build_object('de', p_de, 'ate', p_ate),
    'anterior', json_build_object('de', v_ade, 'ate', v_aate),
    'departamentos', j_deps,
    'kpis', j_kpis, 'kpis_anterior', j_kant,
    'por_atendente', j_atend, 'por_departamento', j_dep, 'por_canal', j_can,
    'mapa_calor', j_calor, 'serie', coalesce(j_serie, '[]'::json));
end $$;
revoke all on function public.nx_rel_atendimento(text, uuid, date, date, uuid) from public, anon, authenticated;
grant execute on function public.nx_rel_atendimento(text, uuid, date, date, uuid) to anon, authenticated, service_role;
