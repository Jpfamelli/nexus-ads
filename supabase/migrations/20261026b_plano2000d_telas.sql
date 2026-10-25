-- ============================================================
-- ÓRBITA — 20261026b_plano2000d_telas.sql (plano «2000d», frente srv · campos e RPCs que as telas já pedem)
-- Migração ADITIVA e IDEMPOTENTE, aplicada DEPOIS da 20261026a: colunas/índices com if not exists, funções com create or replace a
-- partir da definição EM VIGOR (anotada em cada bloco). Nenhuma assinatura existente muda; as RPCs novas são do painel (p_token).
--
--   Início (nx_inicio): DS-083/IC-001/DR-248/DR-249/DR-270 anúncios (gasto, receita, leads por plataforma; supervisor+) ·
--     RC-219/DR-218/DR-220/DR-352/DR-353 equipe (meta, leads, ganhos de hoje, tarefas de hoje, tpr) · RC-339/DS-086/DR-407 esfriando ·
--     RC-338 aniversariantes · DR-328 últimas vendas de anúncio · RC-325/DR-290 desde o início · RC-218 funil do mês passado ·
--     RC-187/DR-253 prazo_min e «no prazo» do mês · DR-246 leads_anuncio · DR-302 ontem até agora · RC-233 Meta × Google ·
--     DR-348 indicação · DR-402 dias até a venda · RC-212 admin_nome · RC-210 versao
--   Onboarding: DR-263 contatos_importados · DR-334 dispensado_ate + nx_onboarding_dispensar
--   Agenda: DS-044/DC-340 nx_agenda_obs_salvar · DC-414/CC-254 «chegou» · DC-415 presença com quem/quando · DC-328/DC-394 marcado_em/
--     marcado_por_nome · DC-412 primeira_vez · DC-413 aniversario_hoje · CC-246 ultima_nota · CC-190 ocupados · DS-049/DC-397 366 dias
--   Conversas: DS-005/DC-011 nx_cv_status_lote · DS-006/DC-012 nx_cv_marcar_lida_lote · DS-094 nx_pulso.nao_lidas_total
--   CRM: DR-033/DS-053 nx_negocios_buscar_funis · DS-050/DC-416 nx_buscar com presença · DS-062/DR-120 tarefas que se repetem ·
--     DS-097 aviso de tarefa atribuída por outra pessoa
-- ============================================================

-- ------------------------------------------------------------
-- 1. Estrutura (aditiva; nenhum dado existente muda)
-- ------------------------------------------------------------
-- DR-334: dispensar o checklist de primeiro acesso vale para a empresa em todo aparelho (até a data escolhida)
alter table public.nx_clientes add column if not exists onboarding_dispensado_ate timestamptz;

-- DS-049 / DC-397: a agenda aceita marcar até 366 dias à frente (antes 180) — troca o CHECK por um mais largo
do $$
declare r record;
begin
  for r in select c.conname from pg_constraint c
            where c.conrelid = 'public.nx_agenda_config'::regclass and c.contype = 'c'
              and pg_get_constraintdef(c.oid) like '%dias_a_frente%' and pg_get_constraintdef(c.oid) like '%180%' loop
    execute format('alter table public.nx_agenda_config drop constraint %I', r.conname);   -- lint:permitido troca do check por um mais largo
  end loop;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.nx_agenda_config'::regclass and c.conname = 'nx_agenda_config_dias_a_frente_366') then
    alter table public.nx_agenda_config add constraint nx_agenda_config_dias_a_frente_366 check (dias_a_frente between 1 and 366);
  end if;
end $$;

-- DS-062: a tarefa que se repete aponta para a de origem (a próxima nasce uma vez só)
create unique index if not exists nx_tarefas_origem_unica on public.nx_tarefas (origem_id) where origem_id is not null;
-- DS-086 / RC-339 (esfriando) e DS-097: tarefas abertas por negócio
create index if not exists nx_tarefas_negocio_abertas on public.nx_tarefas (negocio_id, vence_em) where concluida_em is null;

-- ------------------------------------------------------------
-- 2. RPCs novas das telas (todas do painel: p_token → nx_ctx; anon + service_role no fim)
-- ------------------------------------------------------------

-- plano 2000d · DR-334: «Dispensar» o checklist vale para a empresa (todo aparelho) até p_ate; null = mostrar de novo.
-- O front só chama quando nx_onboarding_estado traz a chave dispensado_ate.
create or replace function public.nx_onboarding_dispensar(p_token text, p_cliente uuid, p_ate timestamptz default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  v_ate timestamptz := p_ate;
begin
  if v_ate is not null and v_ate <= now() then v_ate := null; end if;
  if v_ate is not null then v_ate := least(v_ate, now() + interval '366 days'); end if;
  update public.nx_clientes set onboarding_dispensado_ate = v_ate where id = p_cliente;
  return json_build_object('ok', true, 'dispensado_ate', v_ate);
end $$;

-- plano 2000d · DS-044 / DC-340: editar a observação da consulta depois de marcar. p_inicio = o horário que a tela mostrava
-- (se a consulta mudou de horário no meio, recusa com hint consulta_mudou em vez de pôr a observação na consulta errada).
-- Texto vazio apaga. A troca fica no histórico do negócio.
create or replace function public.nx_agenda_obs_salvar(p_token text, p_cliente uuid, p_negocio bigint, p_inicio text, p_texto text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  l public.nx_leads; v_ini timestamptz; v_txt text := left(nullif(btrim(coalesce(p_texto, '')), ''), 1000);
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if nullif(btrim(coalesce(p_inicio, '')), '') is not null then
    begin
      v_ini := p_inicio::timestamptz;
    exception when others then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'inicio';
    end;
  end if;
  select * into l from public.nx_leads x where x.id = p_negocio and x.cliente_id = p_cliente for update;
  if l.id is null or (public.nx_crm_restrito(v) and l.dono_id is not null and l.dono_id <> v.conta_id) then
    raise exception 'negocio_nao_encontrado' using errcode = '22023';
  end if;
  if l.consulta_em is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'sem_consulta'; end if;
  if v_ini is not null and date_trunc('minute', v_ini) <> date_trunc('minute', l.consulta_em) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'consulta_mudou';
  end if;
  if (l.campos ->> 'agenda_obs') is not distinct from v_txt then
    return json_build_object('ok', true, 'obs', v_txt, 'mudou', false);
  end if;
  update public.nx_leads x set
    campos = case when v_txt is null then coalesce(x.campos, '{}'::jsonb) - 'agenda_obs'
                  else coalesce(x.campos, '{}'::jsonb) || jsonb_build_object('agenda_obs', v_txt) end,
    atualizado_em = now()
  where x.id = l.id;
  perform public.nx_historico_add(p_cliente, 'agenda_obs', l.contato_id, l.id, null,
    jsonb_build_object('de', l.campos ->> 'agenda_obs', 'para', v_txt, 'consulta_em', l.consulta_em));
  return json_build_object('ok', true, 'obs', v_txt, 'mudou', true);
end $$;

-- plano 2000d · DR-033 / DS-053: a busca do kanban não achou nada NESTE funil — quantos negócios abertos casam em cada funil.
-- Mesma regra de texto do nx_buscar (título/nome/contato sem acento; telefone pelos dígitos) e a mesma restrição do atendente.
create or replace function public.nx_negocios_buscar_funis(p_token text, p_cliente uuid, p_busca text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  q text := left(btrim(coalesce(p_busca, '')), 80);
  d text; qn text; pl text; tel boolean := false; restr boolean := public.nx_crm_restrito(v); r json;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if char_length(q) < 2 then return json_build_object('funis', '[]'::json); end if;
  d := regexp_replace(q, '\D', '', 'g');
  tel := q ~ '^[0-9\s().+-]+$' and length(d) >= 4;
  qn := replace(replace(replace(public.nx_crm_norm(q), '\', '\\'), '%', '\%'), '_', '\_');
  pl := '%' || qn || '%';
  select coalesce(json_agg(json_build_object('funil_id', x.funil_id, 'nome', x.nome, 'n', x.n) order by x.ordem, x.nome), '[]'::json)
    into r
    from (select f.id as funil_id, f.nome, f.ordem, count(*) as n
            from public.nx_leads l
            join public.nx_funis f on f.id = l.funil_id and f.cliente_id = p_cliente and f.ativo
            left join public.nx_contatos k on k.id = l.contato_id
           where l.cliente_id = p_cliente and l.status = 'aberto'
             and (not restr or l.dono_id is null or l.dono_id = v.conta_id)
             and (case when tel then (coalesce(l.telefone, '') like '%' || d || '%' or coalesce(k.telefone, '') like '%' || d || '%')
                       else public.nx_crm_norm(coalesce(l.titulo, '') || ' ' || coalesce(l.nome, '') || ' ' || coalesce(k.nome, '')) like pl end)
           group by f.id, f.nome, f.ordem) x;
  return json_build_object('funis', r);
end $$;

-- plano 2000d · DS-005 / DC-011: resolver (ou deixar pendente) várias conversas numa transação. Para cada uma: some quem a pessoa
-- não vê; se o cliente escreveu depois do que a tela viu (p_entrada_antes {id: iso}), NÃO resolve e volta em «escreveram».
-- A mesma mensagem de sistema do nx_cv_status. Até 200 por chamada.
create or replace function public.nx_cv_status_lote(p_token text, p_cliente uuid, p_ids bigint[], p_status text,
                                                    p_entrada_antes jsonb default '{}'::jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  v_eu text := coalesce(nullif(v.nome, ''), 'Alguém');
  cv public.nx_conversas; i bigint; v_antes timestamptz; v_ok bigint[] := '{}'; v_esc jsonb := '[]'::jsonb;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if p_status is null or p_status not in ('resolvida', 'pendente') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'status';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then return json_build_object('resolvidas', '[]'::json, 'escreveram', '[]'::json); end if;
  if cardinality(p_ids) > 200 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'ids'; end if;
  if p_entrada_antes is not null and jsonb_typeof(p_entrada_antes) <> 'object' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'entrada_antes';
  end if;
  for i in select distinct x from unnest(p_ids) x where x is not null order by 1 loop
    continue when not public.nx_cv_visivel(v, p_cliente, i);
    select * into cv from public.nx_conversas where id = i and cliente_id = p_cliente for update;
    continue when cv.id is null;
    if cv.status = p_status then v_ok := v_ok || cv.id; continue; end if;
    continue when cv.status = 'resolvida';   -- pendente de uma resolvida = reabrir: só pela tela da conversa (nx_cv_status)
    v_antes := null;
    if p_entrada_antes ? i::text and nullif(p_entrada_antes ->> i::text, '') is not null then
      begin v_antes := (p_entrada_antes ->> i::text)::timestamptz; exception when others then v_antes := null; end;
    end if;
    if v_antes is not null and cv.ultima_entrada_em > v_antes + interval '1 second' then
      v_esc := v_esc || jsonb_build_object('id', cv.id,
        'nome', (select coalesce(k.nome, k.telefone) from public.nx_contatos k where k.id = cv.contato_id));
      continue;
    end if;
    if p_status = 'resolvida' then
      update public.nx_conversas
         set status = 'resolvida', resolvida_em = now(), resolvida_por = v.conta_id,
             aguardando = false, nao_lidas = 0, atualizado_em = now()
       where id = cv.id;
      perform public.nx_cv_sistema(cv.id, 'Atendimento ' || cv.protocolo || ' resolvido por ' || v_eu, v.conta_id);
    else
      update public.nx_conversas set status = 'pendente', atualizado_em = now() where id = cv.id;
      perform public.nx_cv_sistema(cv.id, v_eu || ' marcou como pendente', v.conta_id);
    end if;
    v_ok := v_ok || cv.id;
  end loop;
  return json_build_object('resolvidas', to_json(v_ok), 'escreveram', v_esc::json);
end $$;

-- plano 2000d · DS-006 / DC-012: marcar várias conversas como lidas num pedido (a mesma regra do nx_cv_marcar_lida: leitura e
-- conversa de colega não zeram — voltam em «ignoradas»). Até 200.
create or replace function public.nx_cv_marcar_lida_lote(p_token text, p_cliente uuid, p_conversas bigint[])
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  i bigint; v_dono uuid; v_ok bigint[] := '{}'; v_ign bigint[] := '{}';
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if p_conversas is null or cardinality(p_conversas) = 0 then return json_build_object('marcadas', '[]'::json, 'ignoradas', '[]'::json); end if;
  if cardinality(p_conversas) > 200 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'conversas'; end if;
  for i in select distinct x from unnest(p_conversas) x where x is not null order by 1 loop
    continue when not public.nx_cv_visivel(v, p_cliente, i);
    select cv.atribuida_a into v_dono from public.nx_conversas cv where cv.id = i and cv.cliente_id = p_cliente;
    if v.papel = 'leitura' or (v_dono is not null and v_dono is distinct from v.conta_id) then v_ign := v_ign || i; continue; end if;
    update public.nx_conversas set nao_lidas = 0, atualizado_em = now()
     where id = i and cliente_id = p_cliente and nao_lidas <> 0;
    v_ok := v_ok || i;
  end loop;
  return json_build_object('marcadas', to_json(v_ok), 'ignoradas', to_json(v_ign));
end $$;

-- plano 2000d · DS-062 / DR-120: a tarefa se repete (diaria, semanal, mensal; null = não repete). Ao concluir, a próxima nasce
-- uma vez só (gatilho nx_tg_tarefa_repetir), com o mesmo dono, contato, negócio e horário, no próximo período.
create or replace function public.nx_tarefa_repetir(p_token text, p_cliente uuid, p_id bigint, p_repetir text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente'); v_rep text := nullif(lower(btrim(coalesce(p_repetir, ''))), '');
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if v_rep is not null and v_rep not in ('diaria', 'semanal', 'mensal') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'repetir';
  end if;
  if not public.nx_crm_tarefa_ok(p_cliente, v, p_id) then raise exception 'tarefa_nao_encontrada' using errcode = '22023'; end if;
  update public.nx_tarefas set repetir = v_rep, atualizado_em = now() where id = p_id and cliente_id = p_cliente;
  return (public.nx_crm_tarefas_json(p_cliente, array[p_id])::jsonb -> 0)::json;
end $$;

create or replace function public.nx_tg_tarefa_repetir()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_passo interval;
begin
  if new.repetir is null or old.concluida_em is not null or new.concluida_em is null then return new; end if;
  v_passo := case new.repetir when 'diaria' then interval '1 day' when 'semanal' then interval '7 days' when 'mensal' then interval '1 month' end;
  if v_passo is null then return new; end if;
  insert into public.nx_tarefas (cliente_id, tipo, titulo, descricao, vence_em, dono_id, contato_id, negocio_id, criado_por,
                                 automacao_id, repetir, origem_id)
  values (new.cliente_id, new.tipo, new.titulo, new.descricao,
          -- o próximo período depois de hoje (concluir atrasada não cria outra já vencida)
          case when new.vence_em is null then null
               else new.vence_em + v_passo * greatest(1, ceil(extract(epoch from (now() - new.vence_em)) / extract(epoch from v_passo))::int) end,
          new.dono_id, new.contato_id, new.negocio_id, new.criado_por, new.automacao_id, new.repetir, new.id)
  on conflict (origem_id) where origem_id is not null do nothing;
  return new;
end $$;
drop trigger if exists nx_tg_tarefa_repetir on public.nx_tarefas;   -- lint:permitido recriar o gatilho (idempotente)
create trigger nx_tg_tarefa_repetir after update of concluida_em on public.nx_tarefas
  for each row execute function public.nx_tg_tarefa_repetir();

-- plano 2000d · DS-097: quem recebe uma tarefa de OUTRA pessoa ganha um aviso no sino (não avisa quem cria para si, nem o robô)
create or replace function public.nx_tg_tarefa_atribuida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_autor text := nullif(current_setting('nx.conta', true), ''); v_nome text;
begin
  if new.dono_id is null or new.concluida_em is not null or v_autor is null or new.dono_id::text = v_autor then return new; end if;
  if tg_op = 'UPDATE' and old.dono_id is not distinct from new.dono_id then return new; end if;
  if new.origem_id is not null then return new; end if;   -- a repetição da tarefa não é atribuição nova
  select k.nome into v_nome from public.nx_contas k where k.id::text = v_autor;
  perform public.nx_notificar(new.cliente_id, new.dono_id, 'tarefa',
    left('Nova tarefa para você: ' || new.titulo, 120),
    left(coalesce('De ' || v_nome, '') || coalesce(case when v_nome is not null then ' · ' else '' end
         || 'vence ' || to_char(new.vence_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), ''), 200),
    case when new.negocio_id is not null then '#/crm/negocio/' || new.negocio_id else '#/crm/tarefas' end);
  return new;
end $$;
drop trigger if exists nx_tg_tarefa_atribuida on public.nx_tarefas;   -- lint:permitido recriar o gatilho (idempotente)
create trigger nx_tg_tarefa_atribuida after insert or update of dono_id on public.nx_tarefas
  for each row execute function public.nx_tg_tarefa_atribuida();

-- plano 2000d · DS-306: toda mudança de plano ou de status da empresa fica na auditoria — pela tela, pelo cron do teste ou à mão
-- (antes só o caminho do nx_cliente_salvar auditava). Quem fez = a conta da sessão (nx.conta) ou «sistema».
create or replace function public.nx_tg_cliente_plano_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.plano is not distinct from new.plano and old.status is not distinct from new.status then return new; end if;
  insert into public.nx_auditoria (org_id, cliente_id, conta_id, acao, dados)
  values (new.org_id, new.id, nullif(current_setting('nx.conta', true), '')::uuid, 'plano_status',
          jsonb_build_object('de', jsonb_build_object('plano', old.plano, 'status', old.status),
                             'para', jsonb_build_object('plano', new.plano, 'status', new.status),
                             'motivo', new.motivo_status,
                             'por', case when nullif(current_setting('nx.conta', true), '') is null then 'sistema' else 'conta' end));
  return new;
end $$;
drop trigger if exists nx_tg_cliente_plano_status on public.nx_clientes;   -- lint:permitido recriar o gatilho (idempotente)
create trigger nx_tg_cliente_plano_status after update of plano, status on public.nx_clientes
  for each row execute function public.nx_tg_cliente_plano_status();

-- plano 2000d · DS-010 / DC-024: mensagem nova em QUALQUER conversa visível à pessoa desde p_desde (no máximo 24 h atrás) — o aviso
-- sonoro/da área de trabalho não depende da aba aberta. Até 20, a mais recente primeiro; «agora» = o próximo p_desde.
create or replace function public.nx_cv_novidades(p_token text, p_cliente uuid, p_desde timestamptz)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  v_rank int := public.nx_rank(v.papel);
  v_desde timestamptz := greatest(coalesce(p_desde, now()), now() - interval '24 hours');
  v_agora timestamptz := clock_timestamp();
  r json;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  select coalesce(json_agg(json_build_object('id', x.id, 'nome', x.nome, 'ultima_entrada_em', x.ultima_entrada_em,
                                             'atribuida_a', x.atribuida_a, 'nao_lidas', x.nao_lidas, 'status', x.status)
                           order by x.ultima_entrada_em desc, x.id desc), '[]'::json)
    into r
    from (select cv.id, coalesce(k.nome, k.telefone) as nome, cv.ultima_entrada_em, cv.atribuida_a, cv.nao_lidas, cv.status
            from public.nx_conversas cv
            left join public.nx_contatos k on k.id = cv.contato_id and k.cliente_id = p_cliente
           where cv.cliente_id = p_cliente and cv.ultima_entrada_em > v_desde and cv.ultima_entrada_em <= v_agora
             and cv.status in ('aberta', 'pendente') and not cv.oculta
             -- regra nx_cv_visivel
             and ( v_rank >= 3
                or cv.atribuida_a = v.conta_id
                or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                      or cv.departamento_id = any(v.departamentos))
                     and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )
           order by cv.ultima_entrada_em desc, cv.id desc
           limit 20) x;
  return json_build_object('itens', r, 'agora', v_agora);
end $$;

-- plano 2000d · DS-011 / DC-027: abrir o histórico EM VOLTA de uma mensagem antiga (resultado da busca): metade antes, ela e metade
-- depois, com tem_mais (antes) e tem_mais_depois. Sobrecarga com p_em_torno_de e p_limite OBRIGATÓRIOS (5 parâmetros sem default):
-- pelo PostgREST só casa quem manda p_em_torno_de; em SQL posicional, as chamadas de hoje (3, 4, 6 e 7 argumentos) não a enxergam.
create or replace function public.nx_cv_mensagens(p_token text, p_cliente uuid, p_conversa bigint, p_em_torno_de bigint, p_limite int)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  v_contato bigint; v_ocultas bigint[];
  v_lim int := least(greatest(coalesce(p_limite, 50), 2), 200);
  v_meio int; v_antes jsonb; v_depois jsonb; v_na int; v_nd int;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  if p_em_torno_de is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'em_torno_de'; end if;
  select cv.contato_id into v_contato from public.nx_conversas cv where cv.id = p_conversa;
  if public.nx_rank(v.papel) < 2 then
    select array_agg(x.id) into v_ocultas from public.nx_conversas x
     where x.cliente_id = p_cliente and x.contato_id = v_contato and x.oculta;
  end if;
  v_ocultas := coalesce(v_ocultas, '{}'::bigint[]);
  v_meio := v_lim / 2;
  -- antes (mais novas primeiro, até metade + 1 para saber se há mais)
  with sel as (
    select m.id from public.nx_mensagens m
     where m.contato_id = v_contato and m.cliente_id = p_cliente and not (m.conversa_id = any(v_ocultas)) and m.id < p_em_torno_de
     order by m.id desc limit v_meio + 1
  ), num as (select s.id, row_number() over (order by s.id desc) rn from sel s)
  select coalesce(jsonb_agg(public.nx_cv_json_msg(m) order by m.id) filter (where n.rn <= v_meio), '[]'::jsonb), count(*)
    into v_antes, v_na
    from num n join public.nx_mensagens m on m.id = n.id;
  -- a própria e as de depois
  with sel as (
    select m.id from public.nx_mensagens m
     where m.contato_id = v_contato and m.cliente_id = p_cliente and not (m.conversa_id = any(v_ocultas)) and m.id >= p_em_torno_de
     order by m.id limit v_lim - v_meio + 1
  ), num as (select s.id, row_number() over (order by s.id) rn from sel s)
  select coalesce(jsonb_agg(public.nx_cv_json_msg(m) order by m.id) filter (where n.rn <= v_lim - v_meio), '[]'::jsonb), count(*)
    into v_depois, v_nd
    from num n join public.nx_mensagens m on m.id = n.id;
  return json_build_object('itens', v_antes || v_depois, 'tem_mais', v_na > v_meio, 'tem_mais_depois', v_nd > v_lim - v_meio,
                           'em_torno_de', p_em_torno_de, 'agora', clock_timestamp());
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-083 / DS-086 / RC-187 / RC-210 / RC-212 / RC-218 / RC-219 / RC-233 / RC-325 / RC-338 / RC-339 / IC-001 / DR-218 / DR-220 / DR-246 / DR-248 / DR-249 / DR-253 / DR-270 / DR-290 / DR-302 / DR-328 / DR-348 / DR-352 / DR-353 / DR-402 / DR-407 nx_inicio: o que as telas do Início já pedem
--   (cópia da definição em vigor: 20261022a_plano1500c.sql)
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
  v_ini14 timestamptz := ((v_hoje - 13)::timestamp at time zone 'America/Sao_Paulo');
  j_cv json; j_tf json; j_prox json; j_ng json; j_ld json; j_cn json; v_notif int;
  v_prazo int; j_ag json; j_funil json; j_s_ag json; j_s_cs json; j_s_va json; j_s_ld json; j_sem_data json;
  -- plano 2000d · as partes novas
  v_prazo_mes int; j_funil_ant jsonb; j_ads jsonb; j_equipe jsonb; j_esfr jsonb; j_aniv jsonb; j_vendas_ads jsonb; j_desde jsonb;
  v_prim date; v_admin_nome text; r jsonb;
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

  -- contrato 4: 1ª resposta em até 15 min (conversas visíveis abertas nos últimos 7 dias); sem conversa → null
  select round(100.0 * count(*) filter (where cv.primeira_resposta_em is not null
                                          and cv.primeira_resposta_em <= cv.aberta_em + interval '15 minutes') / nullif(count(*), 0))::int
    into v_prazo
    from public.nx_conversas cv
   where cv.cliente_id = p_cliente and not cv.oculta and cv.aberta_em >= now() - interval '7 days'
     and ( v_rank >= 3
        or cv.atribuida_a = v.conta_id
        or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
              or cv.departamento_id = any(v.departamentos))
             and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) );

  -- contrato 4: quem espera agora (≤ 5, a espera mais longa primeiro); canal = provedor do número
  select coalesce(json_agg(json_build_object('id', x.id, 'nome', x.nome, 'espera_min', x.espera_min, 'canal', x.canal,
                                             'atribuida_id', x.atribuida_a, 'atribuida_nome', x.atribuida_nome,   -- plano 1500c · SC-008
                                             'contato_id', x.contato_id)   -- plano 1500c · RC-228
                           order by x.espera_min desc, x.id), '[]'::json)
    into j_ag
    from (select cv.id, coalesce(k.nome, k.telefone) as nome,
                 floor(extract(epoch from now() - coalesce(cv.ultima_entrada_em, cv.aberta_em)) / 60)::int as espera_min,
                 coalesce(ch.provedor, 'meta') as canal,
                 cv.atribuida_a, ac.nome as atribuida_nome, cv.contato_id   -- plano 1500c · SC-008 / RC-228
            from public.nx_conversas cv
            left join public.nx_contatos k on k.id = cv.contato_id and k.cliente_id = p_cliente
            left join public.nx_canais ch on ch.id = cv.canal_id
            left join public.nx_contas ac on ac.id = cv.atribuida_a   -- plano 1500c · SC-008
           where cv.cliente_id = p_cliente and cv.status = 'aberta' and cv.aguardando and not cv.oculta
             and ( v_rank >= 3
                or cv.atribuida_a = v.conta_id
                or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                      or cv.departamento_id = any(v.departamentos))
                     and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )
           order by coalesce(cv.ultima_entrada_em, cv.aberta_em), cv.id
           limit 5) x;

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
           'dia_do_mes', (v_hoje - v_mes) + 1,
           -- plano 2000d · DS-083 / DR-248: sempre presente (0 sem venda de anúncio) para o cartão não cair na receita total
           'receita_anuncio_mes', coalesce(sum(coalesce(l.valor, l.valor_previsto, 0)) filter (where l.status = 'ganho' and l.fechado_em >= v_ini_mes
                                                     and (l.origem = 'anuncio' or l.plataforma is not null)), 0),
           'ganhos_anuncio_mes', count(*) filter (where l.status = 'ganho' and l.fechado_em >= v_ini_mes and (l.origem = 'anuncio' or l.plataforma is not null)),
           'receita_anuncio_30d', coalesce(sum(coalesce(l.valor, l.valor_previsto, 0)) filter (where l.status = 'ganho' and l.fechado_em >= now() - interval '30 days'
                                                     and (l.origem = 'anuncio' or l.plataforma is not null)), 0),   -- DR-249
           -- plano 2000d · DR-348: vendas por indicação
           'ganhos_indicacao_mes', count(*) filter (where l.status = 'ganho' and l.fechado_em >= v_ini_mes and l.origem = 'indicacao'),
           'receita_indicacao_mes', coalesce(sum(coalesce(l.valor, l.valor_previsto, 0)) filter (where l.status = 'ganho' and l.fechado_em >= v_ini_mes and l.origem = 'indicacao'), 0),
           -- plano 2000d · DR-402: média de dias do lead à venda nas vendas do mês
           'dias_ate_ganho', round(avg(extract(epoch from l.fechado_em - l.criado_em) / 86400.0) filter (where l.status = 'ganho' and l.fechado_em >= v_ini_mes), 1))
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
           'semana_anuncio', count(*) filter (where l.origem = 'anuncio' or l.plataforma is not null),
           'semana_meta', count(*) filter (where l.plataforma = 'meta'),       -- plano 2000d · RC-233
           'semana_google', count(*) filter (where l.plataforma = 'google'),
           'ontem_ate_agora', count(*) filter (where l.data_conversa = v_hoje - 1 and l.criado_em <= now() - interval '1 day'))   -- plano 2000d · DR-302
    into j_ld
    from public.nx_leads l
   where l.cliente_id = p_cliente and l.data_conversa > v_hoje - 7 and l.data_conversa <= v_hoje
     and (l.funil_id is null or exists (select 1 from public.nx_funis f where f.id = l.funil_id and (f.padrao or f.conta_no_ads)))
     and (v_todos or l.dono_id = v.conta_id or l.dono_id is null);

  -- contrato 4: funil do mês até hoje = os negócios que ENTRARAM no mês (mesmo filtro de leads) e, deles, quantos têm conversa,
  -- consulta marcada e ganho — um retrato da coorte do mês, não contagens soltas
  select json_build_object(
           'leads', count(*),
           'leads_anuncio', count(*) filter (where l.origem = 'anuncio' or l.plataforma is not null),   -- plano 2000d · DR-246
           'conversas', count(*) filter (where exists (select 1 from public.nx_conversas cv
                                                       where cv.cliente_id = p_cliente
                                                         and (cv.negocio_id = l.id
                                                              or (l.contato_id is not null and cv.contato_id = l.contato_id and cv.aberta_em >= v_ini_mes)))),
           'agendados', count(*) filter (where l.consulta_em is not null or l.data_agenda is not null or l.etapa in ('agendada', 'faltou')),
           'ganhos', count(*) filter (where l.status = 'ganho'))
    into j_funil
    from public.nx_leads l
   where l.cliente_id = p_cliente and l.data_conversa >= v_mes and l.data_conversa <= v_hoje
     and (l.funil_id is null or exists (select 1 from public.nx_funis f where f.id = l.funil_id and (f.padrao or f.conta_no_ads)))
     and (v_todos or l.dono_id = v.conta_id or l.dono_id is null);

  -- contrato 4: séries de 14 dias (mais antigo primeiro), inteiros
  --   aguardando = conversas visíveis abertas no dia · consultas = consultas do dia · valor_aberto = valor previsto em aberto no
  --   fim do dia (negócios criados até ali e ainda abertos naquele momento) · leads = negócios do dia (mesmo filtro de leads)
  with dias as (select (v_hoje - 13 + g) as d from generate_series(0, 13) g)
  select json_agg(coalesce(a.n, 0)::int order by dd.d) into j_s_ag
    from dias dd
    left join (select (cv.aberta_em at time zone 'America/Sao_Paulo')::date as d, count(*) as n
                 from public.nx_conversas cv
                where cv.cliente_id = p_cliente and not cv.oculta and cv.aberta_em >= v_ini14
                  and ( v_rank >= 3
                     or cv.atribuida_a = v.conta_id
                     or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                           or cv.departamento_id = any(v.departamentos))
                          and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )
                group by 1) a on a.d = dd.d;
  with dias as (select (v_hoje - 13 + g) as d from generate_series(0, 13) g)
  select json_agg(coalesce(a.n, 0)::int order by dd.d) into j_s_cs
    from dias dd
    left join (select (l.consulta_em at time zone 'America/Sao_Paulo')::date as d, count(*) as n
                 from public.nx_leads l
                where l.cliente_id = p_cliente and l.status in ('aberto', 'ganho') and l.consulta_em >= v_ini14
                  and l.consulta_em < v_amanha
                  and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)
                group by 1) a on a.d = dd.d;
  with dias as (select (v_hoje - 13 + g) as d from generate_series(0, 13) g)
  select json_agg(round(coalesce((
           select sum(coalesce(l.valor_previsto, 0)) from public.nx_leads l
            where l.cliente_id = p_cliente
              and l.criado_em < ((dd.d + 1)::timestamp at time zone 'America/Sao_Paulo')
              and (l.status = 'aberto' or l.fechado_em >= ((dd.d + 1)::timestamp at time zone 'America/Sao_Paulo'))
              and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)), 0))::bigint order by dd.d)
    into j_s_va
    from dias dd;
  with dias as (select (v_hoje - 13 + g) as d from generate_series(0, 13) g)
  select json_agg(coalesce(a.n, 0)::int order by dd.d) into j_s_ld
    from dias dd
    left join (select l.data_conversa as d, count(*) as n
                 from public.nx_leads l
                where l.cliente_id = p_cliente and l.data_conversa > v_hoje - 14 and l.data_conversa <= v_hoje
                  and (l.funil_id is null or exists (select 1 from public.nx_funis f where f.id = l.funil_id and (f.padrao or f.conta_no_ads)))
                  and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)
                group by 1) a on a.d = dd.d;

  -- plano 1000 (CR-217): agendados sem data — negócio aberto numa etapa aberta de marco «agendada» e sem consulta_em
  select json_build_object(
           'total', count(*),
           'itens', coalesce(json_agg(json_build_object('id', x.id, 'titulo', x.titulo, 'contato_nome', x.contato_nome,
                                                        'estagio_nome', x.estagio_nome, 'desde', x.desde)
                                      order by x.desde nulls last, x.id) filter (where x.rn <= 5), '[]'::json))
    into j_sem_data
    from (select l.id, l.titulo, coalesce(k.nome, l.nome) as contato_nome, e.nome as estagio_nome,
                 coalesce(l.estagio_em, l.criado_em) as desde,
                 row_number() over (order by coalesce(l.estagio_em, l.criado_em) nulls last, l.id) as rn
            from public.nx_leads l
            join public.nx_estagios e on e.id = l.estagio_id
            left join public.nx_contatos k on k.id = l.contato_id and k.cliente_id = p_cliente
           where l.cliente_id = p_cliente and l.status = 'aberto' and e.tipo = 'aberto' and e.marco = 'agendada'
             and l.consulta_em is null
             and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)) x;

  -- números de WhatsApp (saúde): nunca devolve segredo. contrato 4: + provedor, estado, desde, sync_em
  select coalesce(json_agg(json_build_object(
           'id', k.id, 'nome', k.nome, 'numero_exibicao', k.numero_exibicao, 'status', k.status,
           'ultimo_erro', k.ultimo_erro, 'app_inscrito', k.app_inscrito, 'verificado_em', k.verificado_em,
           'ultima_entrada_em', (select max(cv.ultima_entrada_em) from public.nx_conversas cv
                                  where cv.canal_id = k.id and cv.cliente_id = p_cliente),
           'provedor', coalesce(k.provedor, 'meta'),
           'estado', public.nx_canal_estado(k),
           'desde', coalesce((select h.em from public.nx_canal_historico h where h.canal_id = k.id order by h.em desc, h.id desc limit 1),
                             k.codewords_conferido_em, k.verificado_em, k.criado_em),
           'sync_em', k.codewords_sync_em)
           order by k.criado_em), '[]'::json)
    into j_cn
    from public.nx_canais k
   where k.cliente_id = p_cliente;

  select count(*) into v_notif
    from public.nx_notificacoes n
   where n.cliente_id = p_cliente and n.conta_id = v.conta_id and n.lida_em is null;

  -- plano 2000d · RC-187 / RC-301 / DR-253: o prazo de resposta que o servidor usa (15 min) e o «no prazo» do MÊS
  select round(100.0 * count(*) filter (where cv.primeira_resposta_em is not null
                                          and cv.primeira_resposta_em <= cv.aberta_em + interval '15 minutes') / nullif(count(*), 0))::int
    into v_prazo_mes
    from public.nx_conversas cv
   where cv.cliente_id = p_cliente and not cv.oculta and cv.aberta_em >= v_ini_mes
     and ( v_rank >= 3
        or cv.atribuida_a = v.conta_id
        or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
              or cv.departamento_id = any(v.departamentos))
             and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) );

  -- plano 2000d · RC-218: o funil do mês passado (a mesma coorte do funil_mes, no mês anterior inteiro)
  select jsonb_build_object(
           'leads', count(*),
           'leads_anuncio', count(*) filter (where l.origem = 'anuncio' or l.plataforma is not null),
           'conversas', count(*) filter (where exists (select 1 from public.nx_conversas cv
                                                       where cv.cliente_id = p_cliente
                                                         and (cv.negocio_id = l.id
                                                              or (l.contato_id is not null and cv.contato_id = l.contato_id
                                                                  and cv.aberta_em >= v_ini_mes_ant and cv.aberta_em < v_ini_mes)))),
           'agendados', count(*) filter (where l.consulta_em is not null or l.data_agenda is not null or l.etapa in ('agendada', 'faltou')),
           'ganhos', count(*) filter (where l.status = 'ganho'))
    into j_funil_ant
    from public.nx_leads l
   where l.cliente_id = p_cliente and l.data_conversa >= v_mes_ant and l.data_conversa < v_mes
     and (l.funil_id is null or exists (select 1 from public.nx_funis f where f.id = l.funil_id and (f.padrao or f.conta_no_ads)))
     and (v_todos or l.dono_id = v.conta_id or l.dono_id is null);

  -- plano 2000d · DS-083 / IC-001 / DR-249 / DR-270: gasto e retorno dos anúncios (supervisor+; o atendente não vê o gasto)
  if v_rank >= 2 then
    select jsonb_build_object(
             'meta', jsonb_build_object('gasto', coalesce(sum(m.gasto) filter (where m.plataforma = 'meta' and m.data >= v_mes), 0)),
             'google', jsonb_build_object('gasto', coalesce(sum(m.gasto) filter (where m.plataforma = 'google' and m.data >= v_mes), 0)),
             'mes', coalesce(sum(m.gasto) filter (where m.data >= v_mes), 0),
             '30d', coalesce(sum(m.gasto) filter (where m.data > v_hoje - 30), 0))
      into j_ads
      from public.nx_metricas_dia m
     where m.cliente_id = p_cliente and m.nivel = 'campanha' and m.data > least(v_mes, v_hoje - 30) - 1 and m.data <= v_hoje;
    select j_ads || jsonb_build_object(
             'meta', (j_ads -> 'meta') || jsonb_build_object(
                'receita', coalesce(sum(coalesce(l.valor, l.valor_previsto, 0)) filter (where l.plataforma = 'meta' and l.status = 'ganho' and l.fechado_em >= v_ini_mes), 0),
                'leads', count(*) filter (where l.plataforma = 'meta' and l.data_conversa >= v_mes)),
             'google', (j_ads -> 'google') || jsonb_build_object(
                'receita', coalesce(sum(coalesce(l.valor, l.valor_previsto, 0)) filter (where l.plataforma = 'google' and l.status = 'ganho' and l.fechado_em >= v_ini_mes), 0),
                'leads', count(*) filter (where l.plataforma = 'google' and l.data_conversa >= v_mes)))
      into j_ads
      from public.nx_leads l
     where l.cliente_id = p_cliente and l.plataforma is not null
       and (l.data_conversa >= v_mes or (l.status = 'ganho' and l.fechado_em >= v_ini_mes));
  end if;

  -- plano 2000d · RC-219 / DR-218 / DR-220 / DR-352 / DR-353 / DR-261: a equipe no mês (admin vê todos; os outros, a própria linha)
  select coalesce(jsonb_agg(jsonb_build_object(
           'conta_id', x.id, 'nome', x.nome, 'ganhos', x.ganhos, 'valor', x.valor, 'leads', x.leads,
           'ganhos_hoje', x.ganhos_hoje, 'valor_hoje', x.valor_hoje, 'tarefas_hoje', x.tarefas_hoje,
           'tpr_media_min', x.tpr, 'meta', x.meta) order by x.valor desc, x.ganhos desc, x.nome), '[]'::jsonb)
    into j_equipe
    from (select k.id, k.nome,
                 (select count(*) from public.nx_leads l where l.cliente_id = p_cliente and l.dono_id = k.id and l.status = 'ganho' and l.fechado_em >= v_ini_mes) as ganhos,
                 (select coalesce(sum(coalesce(l.valor, l.valor_previsto, 0)), 0) from public.nx_leads l
                   where l.cliente_id = p_cliente and l.dono_id = k.id and l.status = 'ganho' and l.fechado_em >= v_ini_mes) as valor,
                 (select count(*) from public.nx_leads l where l.cliente_id = p_cliente and l.dono_id = k.id
                     and l.data_conversa >= v_mes and l.data_conversa <= v_hoje
                     and (l.funil_id is null or exists (select 1 from public.nx_funis f where f.id = l.funil_id and (f.padrao or f.conta_no_ads)))) as leads,
                 (select count(*) from public.nx_leads l where l.cliente_id = p_cliente and l.dono_id = k.id and l.status = 'ganho' and l.fechado_em >= v_ini_hoje) as ganhos_hoje,
                 (select coalesce(sum(coalesce(l.valor, l.valor_previsto, 0)), 0) from public.nx_leads l
                   where l.cliente_id = p_cliente and l.dono_id = k.id and l.status = 'ganho' and l.fechado_em >= v_ini_hoje) as valor_hoje,
                 (select count(*) from public.nx_tarefas t where t.cliente_id = p_cliente and t.dono_id = k.id and t.concluida_em is null
                     and t.vence_em >= v_ini_hoje and t.vence_em < v_amanha) as tarefas_hoje,
                 (select round(avg(extract(epoch from cv.primeira_resposta_em - cv.aberta_em) / 60))::int from public.nx_conversas cv
                   where cv.cliente_id = p_cliente and cv.atribuida_a = k.id and cv.aberta_em >= v_ini_mes and cv.primeira_resposta_em is not null) as tpr,
                 (select mt.valor from public.nx_metas mt where mt.cliente_id = p_cliente and mt.conta_id = k.id and mt.mes = v_mes) as meta
            from public.nx_acessos a
            join public.nx_contas k on k.id = a.conta_id
           where a.cliente_id = p_cliente and a.suspenso_em is null and k.suspenso_em is null
             and a.papel in ('atendente', 'supervisor', 'admin')
             and (v_rank >= 3 or k.id = v.conta_id)) x;

  -- plano 2000d · RC-339 / DS-086 / DR-407: esfriando = negócio aberto sem mensagem, mudança de etapa nem tarefa há 7+ dias
  -- (e sem tarefa futura marcada). Valor em risco no total; dono e contato em cada item (filtro «meus» na tela).
  select jsonb_build_object('total', count(*), 'valor_total', coalesce(sum(x.valor), 0),
           'itens', coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'titulo', x.titulo, 'contato_nome', x.contato_nome,
                      'contato_id', x.contato_id, 'estagio_nome', x.estagio_nome, 'parado_dias', x.parado_dias, 'valor', x.valor,
                      'dono_id', x.dono_id) order by x.parado_dias desc, x.id) filter (where x.rn <= 5), '[]'::jsonb))
    into j_esfr
    from (select y.*, row_number() over (order by y.parado_dias desc, y.id) as rn
            from (select l.id, coalesce(l.titulo, l.nome) as titulo, coalesce(k.nome, l.nome) as contato_nome, l.contato_id,
                         e.nome as estagio_nome, l.dono_id, coalesce(l.valor_previsto, l.valor, 0) as valor,
                         (v_hoje - (greatest(l.estagio_em, l.criado_em,
                            (select max(cv.ultima_msg_em) from public.nx_conversas cv where cv.cliente_id = p_cliente and cv.contato_id = l.contato_id),
                            (select max(coalesce(t.concluida_em, t.criado_em)) from public.nx_tarefas t where t.negocio_id = l.id))
                           at time zone 'America/Sao_Paulo')::date) as parado_dias
                    from public.nx_leads l
                    join public.nx_estagios e on e.id = l.estagio_id and e.tipo = 'aberto'
                    left join public.nx_contatos k on k.id = l.contato_id and k.cliente_id = p_cliente
                   where l.cliente_id = p_cliente and l.status = 'aberto' and l.estagio_em < now() - interval '7 days'
                     and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)
                     and not exists (select 1 from public.nx_tarefas t where t.negocio_id = l.id and t.concluida_em is null
                                                                         and t.vence_em >= now())) y
           where y.parado_dias >= 7) x;

  -- plano 2000d · RC-338: aniversariantes de hoje (São Paulo), com a conversa mais recente para o «Parabenizar»
  select coalesce(jsonb_agg(jsonb_build_object('contato_id', x.id, 'nome', x.nome, 'conversa_id', x.conversa_id) order by x.nome), '[]'::jsonb)
    into j_aniv
    from (select k.id, k.nome,
                 (select cv.id from public.nx_conversas cv where cv.cliente_id = p_cliente and cv.contato_id = k.id
                   order by cv.ultima_msg_em desc nulls last, cv.id desc limit 1) as conversa_id
            from public.nx_contatos k
           where k.cliente_id = p_cliente and k.nascimento is not null
             and extract(month from k.nascimento) = extract(month from v_hoje) and extract(day from k.nascimento) = extract(day from v_hoje)
             and (not public.nx_crm_restrito(v) or k.dono_id is null or k.dono_id = v.conta_id)
           order by k.nome limit 20) x;

  -- plano 2000d · DR-328: as últimas vendas que vieram de anúncio (com nome)
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'contato_nome', x.contato_nome, 'servico', x.servico, 'valor', x.valor,
                                               'plataforma', x.plataforma, 'ganho_em', x.fechado_em) order by x.fechado_em desc, x.id desc), '[]'::jsonb)
    into j_vendas_ads
    from (select l.id, coalesce(k.nome, l.nome) as contato_nome, l.servico, coalesce(l.valor, l.valor_previsto, 0) as valor,
                 l.plataforma, l.fechado_em
            from public.nx_leads l
            left join public.nx_contatos k on k.id = l.contato_id and k.cliente_id = p_cliente
           where l.cliente_id = p_cliente and l.status = 'ganho' and l.fechado_em is not null
             and (l.origem = 'anuncio' or l.plataforma is not null)
             and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)
           order by l.fechado_em desc, l.id desc limit 5) x;

  -- plano 2000d · RC-325 / DR-290: desde o início — o primeiro mês com lead, o mês fechado mais recente e o atual
  select min(l.data_conversa) into v_prim
    from public.nx_leads l
   where l.cliente_id = p_cliente
     and (l.funil_id is null or exists (select 1 from public.nx_funis f where f.id = l.funil_id and (f.padrao or f.conta_no_ads)));
  if v_prim is not null then
    select jsonb_object_agg(z.chave, z.dados) into j_desde
      from (select m.chave, jsonb_build_object(
                     'mes', to_char(m.ini, 'YYYY-MM'),
                     'leads', (select count(*) from public.nx_leads l where l.cliente_id = p_cliente
                                 and l.data_conversa >= m.ini and l.data_conversa < (m.ini + interval '1 month')::date
                                 and (l.funil_id is null or exists (select 1 from public.nx_funis f where f.id = l.funil_id and (f.padrao or f.conta_no_ads)))
                                 and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)),
                     'receita', (select coalesce(sum(coalesce(l.valor, l.valor_previsto, 0)), 0) from public.nx_leads l where l.cliente_id = p_cliente
                                   and l.status = 'ganho' and l.fechado_em >= (m.ini::timestamp at time zone 'America/Sao_Paulo')
                                   and l.fechado_em < ((m.ini + interval '1 month')::timestamp at time zone 'America/Sao_Paulo')
                                   and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)),
                     'tpr_media_min', (select round(avg(extract(epoch from cv.primeira_resposta_em - cv.aberta_em) / 60))::int
                                         from public.nx_conversas cv where cv.cliente_id = p_cliente and cv.primeira_resposta_em is not null
                                          and cv.aberta_em >= (m.ini::timestamp at time zone 'America/Sao_Paulo')
                                          and cv.aberta_em < ((m.ini + interval '1 month')::timestamp at time zone 'America/Sao_Paulo'))) as dados
              from (values ('primeiro', date_trunc('month', v_prim::timestamp)::date),
                           ('ultimo_fechado', v_mes_ant),
                           ('atual', v_mes)) m(chave, ini)) z;
    j_desde := j_desde || jsonb_build_object('desde', v_prim);
  end if;

  -- plano 2000d · RC-212: quem administra a conta (a quem avisar quando o número cai)
  select k.nome into v_admin_nome
    from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
   where a.cliente_id = p_cliente and a.papel = 'admin' and a.suspenso_em is null and k.suspenso_em is null and k.aprovado
   order by k.nome limit 1;

  r := jsonb_build_object(
    'hoje', v_hoje, 'agora', now(),
    'conversas', j_cv::jsonb || jsonb_build_object('respondidas_no_prazo_pct', v_prazo, 'aguardando_lista', j_ag::jsonb,
                                                   'prazo_min', 15, 'respondidas_no_prazo_mes_pct', v_prazo_mes),   -- plano 2000d · RC-187 / DR-253
    'tarefas', j_tf::jsonb || jsonb_build_object('proximas', j_prox::jsonb),
    'negocios', j_ng::jsonb,
    'leads', j_ld::jsonb,
    'funil_mes', j_funil::jsonb,
    'funil_mes_anterior', j_funil_ant,   -- plano 2000d · RC-218
    'series_14d', jsonb_build_object('aguardando', j_s_ag::jsonb, 'consultas', j_s_cs::jsonb, 'valor_aberto', j_s_va::jsonb, 'leads', j_s_ld::jsonb),
    'canais', j_cn::jsonb,
    'notificacoes_nao_lidas', v_notif,
    'agendados_sem_data', j_sem_data::jsonb,
    -- plano 2000d · as chaves novas das telas (ausentes = a tela esconde o cartão, como antes)
    'equipe', j_equipe, 'esfriando', j_esfr, 'aniversariantes', j_aniv, 'ultimas_vendas_anuncio', j_vendas_ads,
    'desde_inicio', j_desde, 'admin_nome', v_admin_nome);
  if j_ads is not null then
    r := r || jsonb_build_object('gasto_anuncios_mes', j_ads -> 'mes', 'gasto_anuncios_30d', j_ads -> '30d',
                                 'anuncios', jsonb_build_object('meta', j_ads -> 'meta', 'google', j_ads -> 'google'));
  end if;
  -- plano 2000d · RC-210: carimbo que só muda quando os dados mudam (o Início não redesenha à toa a cada pulso)
  r := r || jsonb_build_object('versao', left(md5((r - 'agora')::text), 12));
  return r::json;
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DR-263 / DR-334 nx_onboarding_estado: passo «contatos importados» (opcional) e dispensado_ate da empresa
--   (cópia da definição em vigor: 20261002d_conversas_client_ref_onboarding.sql)
-- ------------------------------------------------------------
create or replace function public.nx_onboarding_estado(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  f_chave boolean; f_pareado boolean; f_receb boolean; f_ia boolean; f_msg boolean; f_dep boolean; f_agenda boolean;
  f_site boolean; f_colega boolean; f_funil boolean; f_ads boolean;
  v_ult_site timestamptz; v_canal uuid; v_vert text; v_mod_funis int; v_mod_est int; v_funil_base timestamptz;
  f_import boolean; v_disp timestamptz;   -- plano 2000d · DR-263 / DR-334
  v_itens jsonb; v_total int := 12; v_feitos int; v_obrig int := 9; v_obrig_feitos int; v_pct int;
begin
  -- 1-4: os números do cliente (CodeWords: aparelho; Meta: token e app inscrito). Só "existe/não existe", nunca o valor.
  select coalesce(bool_or((coalesce(k.provedor, 'meta') = 'codewords' and k.codewords_api_segredo is not null)
                          or (coalesce(k.provedor, 'meta') <> 'codewords' and k.token_segredo is not null)), false),
         coalesce(bool_or((coalesce(k.provedor, 'meta') = 'codewords' and k.codewords_conectado is true)
                          or (coalesce(k.provedor, 'meta') <> 'codewords' and k.status = 'ativo')), false),
         coalesce(bool_or((coalesce(k.provedor, 'meta') = 'codewords' and k.codewords_numero_conferido is true)
                          or (coalesce(k.provedor, 'meta') <> 'codewords' and k.app_inscrito is true)), false),
         coalesce(bool_or((coalesce(k.provedor, 'meta') = 'codewords' and k.codewords_rota = 'direta')
                          or (coalesce(k.provedor, 'meta') = 'codewords' and k.codewords_rota = 'fluxo' and k.codewords_service_id is not null and k.ia_ligada is true
                              and k.codewords_numero_conferido is true)
                          or (coalesce(k.provedor, 'meta') <> 'codewords' and k.status = 'ativo')), false)
    into f_chave, f_pareado, f_receb, f_ia
    from public.nx_canais k where k.cliente_id = p_cliente;
  -- o canal que ainda pede ação (para o "Fazer agora" abrir o assistente certo): o 1º que não está pronto, senão o 1º
  select k.id into v_canal from public.nx_canais k where k.cliente_id = p_cliente
   order by (case when coalesce(k.provedor, 'meta') = 'codewords' then coalesce(k.codewords_numero_conferido, false) else coalesce(k.app_inscrito, false) end), k.criado_em
   limit 1;

  -- 5: já saiu mensagem de verdade numa conversa — notas internas e avisos do sistema não contam. O teste do assistente do número
  --    (nx-codewords, enviar_teste) ainda NÃO conta: ele não grava mensagem nem deixa marca própria no canal; fica para quando houver.
  f_msg := exists (select 1 from public.nx_mensagens m
                    where m.cliente_id = p_cliente and m.direcao = 'out' and m.tipo not in ('nota', 'sistema')
                      and m.status in ('enviada', 'entregue', 'lida'));
  -- 6: departamento ativo com horário definido (horario nulo = "24 horas", ou seja, nunca configurado). O modelo odonto já traz o horário da Recepção.
  f_dep := exists (select 1 from public.nx_departamentos d where d.cliente_id = p_cliente and d.ativo and d.horario is not null);
  -- 7: a agenda tem horário próprio ou herda o do departamento (a fonte "padrao" é o que vale sem configurar)
  f_agenda := coalesce(public.nx_agenda_cfg(p_cliente) ->> 'horario_fonte', 'padrao') <> 'padrao';
  -- 8 (opcional: nem toda empresa tem site): o script do site gravou visitas e alguma delas virou contato (usado_em)
  select max(r.usado_em) into v_ult_site from public.nx_rastreio r where r.cliente_id = p_cliente and r.usado_em is not null;
  f_site := v_ult_site is not null;
  -- 9: tem mais alguém além de quem configura (acesso ou convite ainda válido)
  f_colega := (select count(*) from public.nx_acessos a where a.cliente_id = p_cliente)
            + (select count(*) from public.nx_convites c where c.cliente_id = p_cliente and c.usado_em is null and not c.revogado
                                                          and c.expira_em > now() and c.tentativas < 5) >= 2;
  -- 10: o funil saiu do modelo da vertical (nx_aplicar_modelo semeia 2 funis e 12/11/10 etapas em odonto/oficina/loja, 1 funil e 7 etapas no genérico):
  --     outro número de funis ativos ou de etapas, ou qualquer funil/etapa criado mais de 1 hora depois do PRIMEIRO funil do cliente.
  --     A referência é o primeiro funil, não a criação do cliente: nas empresas antigas o modelo foi semeado meses depois do cadastro
  --     (migração 20260928a) e o passo apareceria como feito sem ninguém ter mexido. Só renomear não é detectável (o botão "Já está
  --     bom" da tela marca localmente).
  select coalesce(nullif(c.vertical, ''), 'generico') into v_vert from public.nx_clientes c where c.id = p_cliente;
  v_mod_funis := case when v_vert in ('odonto', 'oficina', 'loja') then 2 else 1 end;
  v_mod_est := case v_vert when 'odonto' then 12 when 'oficina' then 11 when 'loja' then 10 else 7 end;
  select min(f.criado_em) into v_funil_base from public.nx_funis f where f.cliente_id = p_cliente;
  f_funil := coalesce((select count(*) from public.nx_funis f where f.cliente_id = p_cliente and f.ativo) <> v_mod_funis
          or (select count(*) from public.nx_estagios e where e.cliente_id = p_cliente) <> v_mod_est
          or exists (select 1 from public.nx_funis f
                      where f.cliente_id = p_cliente and f.criado_em > v_funil_base + interval '1 hour')
          or exists (select 1 from public.nx_estagios e
                      where e.cliente_id = p_cliente and e.criado_em > v_funil_base + interval '1 hour'), false);
  -- 11 (opcional): Meta ou Google ligados (só se a credencial existe, nunca o conteúdo)
  f_ads := exists (select 1 from public.nx_integracoes i where i.cliente_id = p_cliente and i.ativo and i.cred is not null and i.cred <> '{}'::jsonb);

  -- plano 2000d · DR-263: alguma importação de contatos criou contato (passo opcional: nem toda empresa tem lista antiga)
  f_import := exists (select 1 from public.nx_importacoes i where i.cliente_id = p_cliente and i.criados > 0);
  select c.onboarding_dispensado_ate into v_disp from public.nx_clientes c where c.id = p_cliente;
  if v_disp <= now() then v_disp := null; end if;
  v_itens := jsonb_build_array(
    jsonb_build_object('id', 'chave_codewords', 'rotulo', 'Chave do WhatsApp salva', 'feito', f_chave, 'opcional', false, 'canal_id', v_canal),
    jsonb_build_object('id', 'aparelho_pareado', 'rotulo', 'Aparelho pareado', 'feito', f_pareado, 'opcional', false, 'canal_id', v_canal),
    jsonb_build_object('id', 'recebimento', 'rotulo', 'Recebimento conferido', 'feito', f_receb, 'opcional', false, 'canal_id', v_canal),
    jsonb_build_object('id', 'ia_ou_direto', 'rotulo', 'IA validada ou receber direto', 'feito', f_ia, 'opcional', false, 'canal_id', v_canal),
    jsonb_build_object('id', 'mensagem_teste', 'rotulo', 'Mensagem de teste enviada', 'feito', f_msg, 'opcional', false, 'canal_id', v_canal),
    jsonb_build_object('id', 'departamento_horario', 'rotulo', 'Departamento com horário', 'feito', f_dep, 'opcional', false),
    jsonb_build_object('id', 'agenda_faixas', 'rotulo', 'Faixas da agenda', 'feito', f_agenda, 'opcional', false),
    jsonb_build_object('id', 'script_site', 'rotulo', 'Script do site com contato recebido', 'feito', f_site, 'opcional', true, 'ultimo_em', v_ult_site),
    jsonb_build_object('id', 'colega_convidado', 'rotulo', 'Colega convidado', 'feito', f_colega, 'opcional', false),
    jsonb_build_object('id', 'funil_ajustado', 'rotulo', 'Funil ajustado', 'feito', f_funil, 'opcional', false),
    jsonb_build_object('id', 'anuncios_ligados', 'rotulo', 'Anúncios ligados', 'feito', f_ads, 'opcional', true),
    jsonb_build_object('id', 'contatos_importados', 'rotulo', 'Contatos importados', 'feito', f_import, 'opcional', true));

  select count(*) filter (where (x ->> 'feito')::boolean),
         count(*) filter (where (x ->> 'feito')::boolean and not (x ->> 'opcional')::boolean)
    into v_feitos, v_obrig_feitos
    from jsonb_array_elements(v_itens) x;
  v_pct := round(v_obrig_feitos * 100.0 / v_obrig);
  return json_build_object('total', v_total, 'feitos', v_feitos, 'obrigatorios', v_obrig, 'obrigatorios_feitos', v_obrig_feitos,
                           'pct', v_pct, 'completo', v_obrig_feitos = v_obrig, 'itens', v_itens,
                           'dispensado_ate', v_disp);   -- plano 2000d · DR-334
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DC-328 / DC-394 / DC-415 nx_agenda_marcar_core: quando foi marcada; a presença (e quando/por quem) é da consulta anterior
--   (cópia da definição em vigor: 20261022a_plano1500c.sql)
-- ------------------------------------------------------------
create or replace function public.nx_agenda_marcar_core(p_cliente uuid, p_negocio bigint, p_inicio timestamptz, p_servico text,
                                                        p_remarcar boolean, p_encaixe boolean, p_quem text,
                                                        p_obs text default null, p_conta uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.nx_leads; e public.nx_estagios; cfg jsonb := public.nx_agenda_cfg(p_cliente);
  v_ini timestamptz := date_trunc('minute', p_inicio);
  v_serv text; v_erro text; v_dur int; v_ant timestamptz; v_fut boolean; v_txt text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ia boolean := coalesce(p_quem, '') = 'ia';
  v_obs text := left(nullif(btrim(coalesce(p_obs, '')), ''), 1000);
begin
  -- uma agenda por cliente: quem chega depois enxerga o que o primeiro gravou
  perform pg_advisory_xact_lock(hashtextextended('nx_agenda:' || p_cliente::text, 0));
  select * into l from public.nx_leads where id = p_negocio and cliente_id = p_cliente and status = 'aberto' for update;
  if l.id is null then return jsonb_build_object('ok', false, 'erro', 'negocio_nao_encontrado'); end if;
  v_serv := coalesce(left(nullif(btrim(coalesce(p_servico, '')), ''), 120), l.servico);
  v_dur := public.nx_agenda_dur(cfg, v_serv);
  v_ant := l.consulta_em;
  v_fut := v_ant is not null and v_ant > now();

  if v_fut and v_ini = date_trunc('minute', v_ant) and coalesce(v_serv, '') = coalesce(l.servico, '') then
    return jsonb_build_object('ok', true, 'negocio_id', l.id, 'contato_id', l.contato_id, 'mudou', false, 'remarcada', false,
      'consulta', jsonb_build_object('inicio', public.nx_agenda_iso(v_ant), 'rotulo', public.nx_agenda_rotulo(v_ant),
                                     'servico', v_serv, 'duracao_min', v_dur, 'encaixe', coalesce((l.campos ->> 'encaixe')::boolean, false)));
  end if;
  if v_fut and not coalesce(p_remarcar, false) then
    return jsonb_build_object('ok', false, 'erro', 'ja_agendada', 'negocio_id', l.id,
      'consulta', jsonb_build_object('inicio', public.nx_agenda_iso(v_ant), 'rotulo', public.nx_agenda_rotulo(v_ant), 'servico', l.servico));
  end if;

  v_erro := public.nx_agenda_checar(p_cliente, v_ini, v_serv, l.id, coalesce(p_encaixe, false));
  if v_erro is not null then
    return jsonb_build_object('ok', false, 'erro', v_erro)
        || case when v_erro <> 'dados_invalidos'
                then jsonb_build_object('sugestoes', public.nx_agenda_sugestoes(p_cliente, v_ini, v_serv, l.id, 4))
                else '{}'::jsonb end;
  end if;

  -- mesma regra do nx_negocio_mover para a etapa "agendada" (marco): etapa do funil do negócio + datas
  select * into e from public.nx_estagios s
   where s.cliente_id = p_cliente and s.funil_id = l.funil_id and s.marco = 'agendada' order by s.ordem limit 1;
  update public.nx_leads x set
    consulta_em = v_ini,
    servico = v_serv,
    data_agenda = coalesce(x.data_agenda, v_hoje),
    estagio_id = coalesce(e.id, x.estagio_id),
    ordem = case when e.id is not null and e.id is distinct from x.estagio_id then -extract(epoch from clock_timestamp()) else x.ordem end,
    -- contrato 6: o encaixe fica gravado; a presença era da consulta anterior
    campos = (coalesce(x.campos, '{}'::jsonb) - 'presenca' - 'agenda_obs' - 'marcado_por' - 'confirmada_em' - 'marcado_em' - 'presenca_em' - 'presenca_por' - 'chegou_em') || jsonb_build_object('encaixe', coalesce(p_encaixe, false))
             -- plano 1500c · CC-245 / CC-324: a observação desta marcação e quem marcou (a de antes sai junto com a presença)
             || jsonb_strip_nulls(jsonb_build_object('agenda_obs', v_obs, 'marcado_por', case when v_ia then 'ia' else p_conta::text end,
                                                 'marcado_em', now())),   -- plano 2000d · DC-328 / DC-394
    atualizado_em = now()
  where x.id = l.id;   -- o gatilho da F1 aplica etapa↔marco, status e data_consulta (São Paulo)

  v_txt := case when v_fut then 'Consulta remarcada de ' || public.nx_agenda_rotulo(v_ant) || ' para ' || public.nx_agenda_rotulo(v_ini)
                else 'Consulta marcada para ' || public.nx_agenda_rotulo(v_ini) end
        || coalesce(' (' || v_serv || ')', '') || case when coalesce(p_encaixe, false) then ' [encaixe]' else '' end
        || coalesce('. ' || v_obs, '');
  insert into public.nx_notas (cliente_id, contato_id, negocio_id, autor_id, texto)
  values (p_cliente, l.contato_id, l.id, case when v_ia then null else p_conta end,
          left(case when v_ia then 'IA: ' else '' end || v_txt, 5000));
  if v_ia then
    perform public.nx_notificar(p_cliente, null, 'sistema',
      left((case when v_fut then 'Consulta remarcada pela IA: ' else 'Consulta marcada pela IA: ' end)
           || coalesce((select k.nome from public.nx_contatos k where k.id = l.contato_id), l.nome, 'contato'), 120),
      public.nx_agenda_rotulo(v_ini) || coalesce(' · ' || v_serv, ''), '#/crm/negocio/' || l.id);
  end if;
  return jsonb_build_object('ok', true, 'negocio_id', l.id, 'contato_id', l.contato_id, 'mudou', true, 'remarcada', v_fut,
    'consulta', jsonb_build_object('inicio', public.nx_agenda_iso(v_ini), 'rotulo', public.nx_agenda_rotulo(v_ini),
                                   'servico', v_serv, 'duracao_min', v_dur, 'encaixe', coalesce(p_encaixe, false)),
    'anterior', case when v_fut then jsonb_build_object('inicio', public.nx_agenda_iso(v_ant), 'rotulo', public.nx_agenda_rotulo(v_ant)) end,
    'etapa', e.nome);
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DC-414 / CC-254 / DC-415 nx_agenda_presenca: estado «chegou» (sala de espera) e quem/quando marcou
--   (cópia da definição em vigor: 20261008c_dados_telas.sql)
-- ------------------------------------------------------------
create or replace function public.nx_agenda_presenca(p_token text, p_cliente uuid, p_negocio bigint, p_estado text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  l public.nx_leads; e public.nx_estagios;
  v_estado text := lower(btrim(coalesce(p_estado, '')));
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if v_estado not in ('compareceu', 'faltou', 'chegou', 'limpar') then   -- plano 2000d · DC-414
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'presenca';
  end if;
  select * into l from public.nx_leads x where x.id = p_negocio and x.cliente_id = p_cliente for update;
  if l.id is null or (public.nx_crm_restrito(v) and l.dono_id is not null and l.dono_id <> v.conta_id) then
    raise exception 'negocio_nao_encontrado' using errcode = '22023';
  end if;
  if v_estado <> 'limpar' and l.consulta_em is null then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'sem_consulta';
  end if;
  if v_estado = 'faltou' and l.funil_id is not null then
    select * into e from public.nx_estagios s
     where s.cliente_id = p_cliente and s.funil_id = l.funil_id and s.marco = 'faltou' order by s.ordem limit 1;
  end if;
  update public.nx_leads x set
    -- plano 2000d · DC-414 / DC-415: quando e quem marcou; «chegou» guarda a hora de chegada (fica quando vira «compareceu»)
    campos = case when v_estado = 'limpar' then coalesce(x.campos, '{}'::jsonb) - 'presenca' - 'presenca_em' - 'presenca_por' - 'chegou_em'
                  else coalesce(x.campos, '{}'::jsonb) || jsonb_build_object('presenca', v_estado, 'presenca_em', now(), 'presenca_por', v.conta_id)
                       || case when v_estado = 'chegou' then jsonb_build_object('chegou_em', case when nullif(x.campos ->> 'chegou_em', '') is not null
                                                                                       then x.campos -> 'chegou_em' else to_jsonb(now()) end)
                               when v_estado = 'faltou' then jsonb_build_object('chegou_em', null) else '{}'::jsonb end end,
    estagio_id = coalesce(e.id, x.estagio_id),
    ordem = case when e.id is not null and e.id is distinct from x.estagio_id then -extract(epoch from clock_timestamp()) else x.ordem end,
    atualizado_em = now()
  where x.id = l.id
  returning * into l;
  perform public.nx_historico_add(p_cliente, 'presenca', l.contato_id, l.id, null,
    jsonb_build_object('presenca', case when v_estado = 'limpar' then null else v_estado end, 'consulta_em', l.consulta_em,
                       'estagio_id', case when e.id is not null then e.id end));
  return json_build_object('ok', true, 'presenca', l.campos ->> 'presenca', 'estagio_id', l.estagio_id);
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-046 / CC-190 / CC-246 / DC-328 / DC-394 / DC-412 / DC-413 / DC-414 / DC-415 nx_agenda_dia: campos novos por consulta e os horários ocupados
--   (cópia da definição em vigor: 20261022a_plano1500c.sql)
-- ------------------------------------------------------------
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
  with base as (
    select l.* from public.nx_leads l
     where l.cliente_id = p_cliente and l.status in ('aberto', 'ganho')
       and l.consulta_em >= v_ini and l.consulta_em < v_fim
       and (not public.nx_crm_restrito(v) or l.dono_id is null or l.dono_id = v.conta_id)
  ), camp as (
    select c.plataforma, c.campanha_ext,
           (select m.campanha_nome from public.nx_metricas_dia m
             where m.cliente_id = p_cliente and m.plataforma = c.plataforma and m.campanha_ext = c.campanha_ext
               and m.campanha_nome is not null
             order by m.data desc limit 1) as nome
      from (select distinct b.plataforma, b.campanha_ext from base b where b.campanha_ext is not null) c
  ), anun as (
    select a.plataforma, a.anuncio_ext,
           (select m.anuncio_nome from public.nx_metricas_dia m
             where m.cliente_id = p_cliente and m.plataforma = a.plataforma and m.anuncio_ext = a.anuncio_ext
               and m.anuncio_nome is not null
             order by m.data desc limit 1) as nome
      from (select distinct b.plataforma, b.anuncio_ext from base b where b.anuncio_ext is not null) a
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'negocio_id', l.id, 'contato_id', l.contato_id, 'nome', coalesce(k.nome, l.nome), 'telefone', coalesce(k.telefone, l.telefone),
      'inicio', public.nx_agenda_iso(l.consulta_em), 'rotulo', public.nx_agenda_rotulo(l.consulta_em),
      'fim', public.nx_agenda_iso(l.consulta_em + make_interval(mins => public.nx_agenda_dur(cfg, l.servico))),
      'servico', l.servico, 'status', l.status, 'etapa', s.nome, 'marco', s.marco, 'dono_id', l.dono_id, 'titulo', l.titulo,
      'dono_nome', (select a.nome from public.nx_contas a where a.id = l.dono_id),
      'encaixe', coalesce((l.campos ->> 'encaixe')::boolean, false),
      'presenca', case when l.campos ->> 'presenca' in ('compareceu', 'faltou', 'chegou') then l.campos ->> 'presenca' end,   -- plano 2000d · DC-414
      'obs', l.campos ->> 'agenda_obs', 'marcado_por', l.campos ->> 'marcado_por',   -- plano 1500c · CC-245 / CC-324
      'confirmada_em', l.campos ->> 'confirmada_em',   -- plano 1500c · CC-239 / CC-240
      'confirmacao', case when l.campos ? 'confirmada_em' then 'confirmada' else 'pendente' end,   -- plano 1500c · RC-202
      -- plano 2000d · DC-328 / DC-394 / DC-415 / DC-414: quem e quando marcou; presença com hora e autor; chegada
      'marcado_em', nullif(l.campos ->> 'marcado_em', ''),
      'marcado_por_nome', case when l.campos ->> 'marcado_por' = 'ia' then 'IA'
                               else (select a.nome from public.nx_contas a where a.id::text = l.campos ->> 'marcado_por') end,
      'presenca_em', nullif(l.campos ->> 'presenca_em', ''),
      'presenca_por_nome', (select a.nome from public.nx_contas a where a.id::text = l.campos ->> 'presenca_por'),
      'chegou_em', nullif(l.campos ->> 'chegou_em', ''),
      -- plano 2000d · DC-412: primeira vez = o contato nunca teve venda nem consulta com presença em outro negócio
      'primeira_vez', l.contato_id is not null and not exists (select 1 from public.nx_leads o
                        where o.cliente_id = p_cliente and o.contato_id = l.contato_id and o.id <> l.id
                          and (o.status = 'ganho' or o.campos ->> 'presenca' in ('compareceu', 'chegou'))),
      -- plano 2000d · DC-413: faz aniversário no dia da consulta
      'aniversario_hoje', k.nascimento is not null
                          and to_char(k.nascimento, 'MM-DD') = to_char(l.consulta_em at time zone 'America/Sao_Paulo', 'MM-DD'),
      -- plano 1500c · CC-246 (pendência): a última nota do negócio, curta (o detalhe só lê a ficha quando falta)
      'ultima_nota', (select left(n.texto, 140) from public.nx_notas n where n.negocio_id = l.id and n.cliente_id = p_cliente
                       order by n.id desc limit 1),
      'origem', l.origem, 'plataforma', l.plataforma, 'campanha_ext', l.campanha_ext, 'anuncio_ext', l.anuncio_ext,
      'campanha_nome', coalesce(cp.nome, nullif(l.rastreio ->> 'utm_campaign', '')),
      'anuncio_nome', coalesce(an.nome, nullif(l.rastreio ->> 'utm_content', '')),
      'rastreio', case when l.rastreio is null then null else jsonb_strip_nulls(jsonb_build_object(
        'utm_source', l.rastreio ->> 'utm_source', 'utm_medium', l.rastreio ->> 'utm_medium',
        'utm_campaign', l.rastreio ->> 'utm_campaign', 'utm_content', l.rastreio ->> 'utm_content',
        'utm_term', l.rastreio ->> 'utm_term', 'pagina', l.rastreio ->> 'pagina')) end)
    order by l.consulta_em, l.id), '[]'::jsonb) into r
    from base l
    left join public.nx_contatos k on k.id = l.contato_id
    left join public.nx_estagios s on s.id = l.estagio_id
    left join camp cp on cp.plataforma = l.plataforma and cp.campanha_ext = l.campanha_ext
    left join anun an on an.plataforma = l.plataforma and an.anuncio_ext = l.anuncio_ext;
  return json_build_object('data', v_de, 'dias', v_dias, 'fuso', 'America/Sao_Paulo', 'config', cfg, 'consultas', r,
    'bloqueios', public.nx_agenda_bloqueios_json(p_cliente, v_ini, v_fim),
    -- plano 1500c · CC-190 (pendência): os horários ocupados de TODOS (sem nome) — o atendente restrito vê o lotado de verdade
    'ocupados', (select coalesce(jsonb_agg(jsonb_build_object('inicio', public.nx_agenda_iso(o.consulta_em),
                                   'fim', public.nx_agenda_iso(o.consulta_em + make_interval(mins => public.nx_agenda_dur(cfg, o.servico))))
                                 order by o.consulta_em), '[]'::jsonb)
                   from public.nx_leads o
                  where o.cliente_id = p_cliente and o.status in ('aberto', 'ganho')
                    and o.consulta_em >= v_ini and o.consulta_em < v_fim));
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-049 / DC-397 nx_agenda_config_salvar: até 366 dias à frente
--   (cópia da definição em vigor: 20260929b_agenda_rastreio.sql)
-- ------------------------------------------------------------
create or replace function public.nx_agenda_config_salvar(p_token text, p_cliente uuid, p_cfg jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  n jsonb := coalesce(p_cfg, '{}'::jsonb);
  c public.nx_agenda_config; k text; x jsonb;
  v_dur int; v_cap int; v_ant int; v_dias int; v_passo int; v_h jsonb; v_int jsonb; v_duracoes jsonb;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if jsonb_typeof(n) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'config'; end if;
  select * into c from public.nx_agenda_config where cliente_id = p_cliente;
  v_dur := coalesce(c.duracao_min, 30); v_cap := coalesce(c.capacidade, 1); v_ant := coalesce(c.antecedencia_horas, 2);
  v_dias := coalesce(c.dias_a_frente, 30); v_passo := c.passo_min; v_h := c.horario;
  v_int := coalesce(c.intervalos, '[]'::jsonb); v_duracoes := coalesce(c.duracoes, '{}'::jsonb);

  if n ? 'duracao_min' then
    v_dur := public.nx_crm_int8(n, 'duracao_min');
    if v_dur is null or v_dur not between 5 and 480 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'duracao_min'; end if;
  end if;
  if n ? 'capacidade' then
    v_cap := public.nx_crm_int8(n, 'capacidade');
    if v_cap is null or v_cap not between 1 and 50 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'capacidade'; end if;
  end if;
  if n ? 'antecedencia_horas' then
    v_ant := public.nx_crm_int8(n, 'antecedencia_horas');
    if v_ant is null or v_ant not between 0 and 720 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'antecedencia_horas'; end if;
  end if;
  if n ? 'dias_a_frente' then
    v_dias := public.nx_crm_int8(n, 'dias_a_frente');
    if v_dias is null or v_dias not between 1 and 366 then   -- plano 2000d · DS-049
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'dias_a_frente'; end if;
  end if;
  if n ? 'passo_min' then
    v_passo := public.nx_crm_int8(n, 'passo_min');
    if v_passo is not null and v_passo not between 5 and 480 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'passo_min'; end if;
  end if;
  if n ? 'horario' then
    if jsonb_typeof(n -> 'horario') = 'null' then v_h := null;
    elsif public.nx_agenda_horario_ok(n -> 'horario') then v_h := n -> 'horario';
    else raise exception 'dados_invalidos' using errcode = '22023', hint = 'horario'; end if;
  end if;
  if n ? 'intervalos' then
    if not public.nx_agenda_faixas_ok(n -> 'intervalos') then raise exception 'dados_invalidos' using errcode = '22023', hint = 'intervalos'; end if;
    v_int := n -> 'intervalos';
  end if;
  if n ? 'duracoes' then
    if jsonb_typeof(n -> 'duracoes') <> 'object' or (select count(*) from jsonb_object_keys(n -> 'duracoes')) > 30 then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'duracoes';
    end if;
    v_duracoes := '{}'::jsonb;
    for k, x in select key, value from jsonb_each(n -> 'duracoes') loop
      if char_length(btrim(k)) not between 1 and 60 or jsonb_typeof(x) <> 'number'
         or (x #>> '{}') !~ '^[0-9]{1,3}$' or (x #>> '{}')::int not between 5 and 480 then
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'duracoes';
      end if;
      v_duracoes := v_duracoes || jsonb_build_object(lower(btrim(k)), (x #>> '{}')::int);
    end loop;
  end if;

  insert into public.nx_agenda_config as t (cliente_id, duracao_min, duracoes, capacidade, antecedencia_horas, dias_a_frente,
                                           passo_min, horario, intervalos, atualizado_em)
  values (p_cliente, v_dur, v_duracoes, v_cap, v_ant, v_dias, v_passo, v_h, v_int, now())
  on conflict (cliente_id) do update set
    duracao_min = excluded.duracao_min, duracoes = excluded.duracoes, capacidade = excluded.capacidade,
    antecedencia_horas = excluded.antecedencia_horas, dias_a_frente = excluded.dias_a_frente,
    passo_min = excluded.passo_min, horario = excluded.horario, intervalos = excluded.intervalos, atualizado_em = now();
  perform public.nx_auditar((select cl.org_id from public.nx_clientes cl where cl.id = p_cliente), p_cliente, v.conta_id,
                            'agenda_config_salva', '{}'::jsonb);
  return json_build_object('config', public.nx_agenda_cfg(p_cliente), 'fuso', 'America/Sao_Paulo',
    'bloqueios', public.nx_agenda_bloqueios_json(p_cliente, now(), null));
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-094 nx_pulso: o total de mensagens não lidas (o número do ícone), além das conversas com não lidas
--   (cópia da definição em vigor: 20261022a_plano1500c.sql)
-- ------------------------------------------------------------
create or replace function public.nx_pulso(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura'); v_rank int := public.nx_rank(v.papel);
begin
  return json_build_object(
    'v', coalesce((select p.v from public.nx_pulsos p where p.cliente_id = p_cliente), 0),
    'notif', (select count(*) from public.nx_notificacoes n
               where n.cliente_id = p_cliente and n.conta_id = v.conta_id and n.lida_em is null),
    'nao_lidas', (select count(*) from public.nx_conversas cv
                   where cv.cliente_id = p_cliente and cv.status in ('aberta', 'pendente') and not cv.oculta and cv.nao_lidas > 0
                     -- regra nx_cv_visivel
                     and ( v_rank >= 3
                        or cv.atribuida_a = v.conta_id
                        or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                              or cv.departamento_id = any(v.departamentos))
                             and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )),
    -- plano 2000d · DS-094: soma das não lidas nas conversas que a pessoa vê (a mesma regra de nao_lidas)
    'nao_lidas_total', (select coalesce(sum(cv.nao_lidas), 0) from public.nx_conversas cv
                   where cv.cliente_id = p_cliente and cv.status in ('aberta', 'pendente') and not cv.oculta and cv.nao_lidas > 0
                     and ( v_rank >= 3
                        or cv.atribuida_a = v.conta_id
                        or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                              or cv.departamento_id = any(v.departamentos))
                             and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )),
    'canais', coalesce((select json_agg(json_build_object(
                          'id', k.id, 'nome', k.nome, 'estado', public.nx_canal_estado(k),
                          -- plano 1000 (SV-114): a coluna quando preenchida (o coalesce só consulta o histórico sem ela)
                          'desde', coalesce(k.estado_desde, (select h.em from public.nx_canal_historico h where h.canal_id = k.id order by h.em desc, h.id desc limit 1)))
                          order by k.criado_em, k.id)
                         from public.nx_canais k where k.cliente_id = p_cliente), '[]'::json),
    -- plano 1500c · UCC-018 (índice nx_conversas_entrada)
    'ultima_msg_em', (select cv.ultima_entrada_em from public.nx_conversas cv
                       where cv.cliente_id = p_cliente and cv.ultima_entrada_em is not null
                       order by cv.ultima_entrada_em desc limit 1),
    -- plano 1500c · UCC-019
    'cliente', (select json_build_object('status', x.status, 'teste_ate', x.teste_ate) from public.nx_clientes x where x.id = p_cliente),
    'agora', now());
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-050 / DC-416 nx_buscar: presença da consulta de cada negócio
--   (cópia da definição em vigor: 20261022a_plano1500c.sql)
-- ------------------------------------------------------------
create or replace function public.nx_buscar(p_token text, p_cliente uuid, p_q text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  q text := left(btrim(coalesce(p_q, '')), 80);
  d text; dk text; qn text; pl text; pc text; pp text; tel boolean := false;
  r_ct json; r_ng json; r_cv json; restr boolean := public.nx_crm_restrito(v);
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if char_length(q) < 2 then
    return json_build_object('contatos', '[]'::json, 'negocios', '[]'::json, 'conversas', '[]'::json);
  end if;
  d := regexp_replace(q, '\D', '', 'g');
  if q ~ '^[0-9\s().+-]+$' and length(d) >= 4 then
    tel := true;
    dk := coalesce(public.nx_tel_chave(public.nx_tel_normalizar(d)), d);
  end if;
  qn := replace(replace(replace(public.nx_crm_norm(q), '\', '\\'), '%', '\%'), '_', '\_');
  pl := '%' || qn || '%';       -- contém
  pc := qn || '%';              -- começo
  pp := '% ' || qn || '%';      -- início de palavra

  -- contatos
  select coalesce(json_agg(json_build_object('id', x.id, 'nome', x.nome, 'telefone', x.telefone) order by x.rk, x.nm, x.id), '[]'::json)
    into r_ct
    from (select k.id, k.nome, k.telefone, lower(coalesce(k.nome, '')) nm,
                 case when tel then 0
                      when k.busca like pc then 0 when k.busca like pp then 1 else 2 end rk
            from public.nx_contatos k
           where k.cliente_id = p_cliente
             and (not restr or k.dono_id is null or k.dono_id = v.conta_id)
             and (case when tel then (k.telefone like '%' || d || '%' or k.tel_chave like '%' || dk || '%')
                       else k.busca like pl end)
           order by rk, nm, k.id limit 8) x;

  -- negócios (título ou nome)
  select coalesce(json_agg(json_build_object('id', x.id, 'titulo', x.titulo, 'contato_nome', x.contato_nome,
                                             'estagio_nome', x.estagio_nome, 'status', x.status,
                                             'contato_telefone', x.contato_telefone, 'consulta_em', x.consulta_em,
                                             'presenca', x.presenca)   -- plano 2000d · DS-050   -- plano 1500c · CC-197 / CC-267
                           order by x.rk, x.ab desc, x.criado_em desc), '[]'::json)
    into r_ng
    from (select l.id, coalesce(l.titulo, l.nome) titulo, coalesce(k.nome, l.nome) contato_nome, e.nome estagio_nome,
                 l.status, (l.status = 'aberto') ab, l.criado_em, coalesce(k.telefone, l.telefone) contato_telefone, l.consulta_em, l.campos ->> 'presenca' presenca,   -- plano 1500c
                 case when tel then 0
                      when public.nx_crm_norm(coalesce(l.titulo, l.nome)) like pc then 0
                      when public.nx_crm_norm(coalesce(l.titulo, '') || ' ' || coalesce(l.nome, '')) like pp then 1 else 2 end rk
            from public.nx_leads l
            left join public.nx_contatos k on k.id = l.contato_id
            left join public.nx_estagios e on e.id = l.estagio_id
           where l.cliente_id = p_cliente
             and (not restr or l.dono_id is null or l.dono_id = v.conta_id)
             and (case when tel then (l.telefone like '%' || d || '%' or l.telefone like '%' || dk || '%')
                       else public.nx_crm_norm(coalesce(l.titulo, '') || ' ' || coalesce(l.nome, '')) like pl end)
           order by rk, (l.status = 'aberto') desc, l.criado_em desc limit 8) x;

  -- conversas visíveis (contato ou protocolo)
  select coalesce(json_agg(json_build_object('id', x.id, 'contato_nome', x.contato_nome, 'protocolo', x.protocolo,
                                             'status', x.status, 'telefone', x.telefone)
                           order by x.rk, x.ult desc nulls last), '[]'::json)
    into r_cv
    from (select cv.id, coalesce(k.nome, k.telefone) contato_nome, k.telefone, cv.protocolo, cv.status, cv.ultima_msg_em ult,
                 case when cv.protocolo is not null and lower(cv.protocolo) like lower(q) || '%' then 0
                      when k.busca like pc then 0 when k.busca like pp then 1 else 2 end rk
            from public.nx_conversas cv
            join public.nx_contatos k on k.id = cv.contato_id
           where cv.cliente_id = p_cliente
             and ( (tel and (k.telefone like '%' || d || '%' or k.tel_chave like '%' || dk || '%'))
                or (not tel and k.busca like pl)
                or (cv.protocolo is not null and cv.protocolo like '%' || replace(replace(q, '%', ''), '_', '') || '%') )
             -- regra nx_cv_visivel
             and (not cv.oculta or public.nx_rank(v.papel) >= 2)
             and ( public.nx_rank(v.papel) >= 3
                or cv.atribuida_a = v.conta_id
                or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                      or cv.departamento_id = any(v.departamentos))
                     and (public.nx_rank(v.papel) = 2 or cv.atribuida_a is null or v.ver_todas) ) )
           order by rk, cv.ultima_msg_em desc nulls last limit 8) x;

  return json_build_object('contatos', r_ct, 'negocios', r_ng, 'conversas', r_cv);
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-004 / DC-007 nx_contato_salvar: versao_esperada (o atualizado_em que a tela leu) — outra pessoa salvou antes → versao_antiga (hint = o nome atual)
--   (cópia da definição em vigor: 20261001b_correcoes.sql)
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
  v_versao timestamptz;   -- plano 2000d · DS-004
  origens constant text[] := array['anuncio','whatsapp','indicacao','organico','manual','site','importacao'];
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if jsonb_typeof(c) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'contato'; end if;
  if v_id is not null then
    select * into k from public.nx_contatos where id = v_id and cliente_id = p_cliente for update;
    if k.id is null or (public.nx_crm_restrito(v) and k.dono_id is not null and k.dono_id <> v.conta_id) then
      raise exception 'contato_nao_encontrado' using errcode = '22023';
    end if;
    -- plano 2000d · DS-004 / DC-007: a tela manda a versão que leu; se mudou no meio, quem decide é a pessoa (a tela pergunta)
    if nullif(btrim(coalesce(c ->> 'versao_esperada', '')), '') is not null then
      begin
        v_versao := (c ->> 'versao_esperada')::timestamptz;
      exception when others then
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'versao_esperada';
      end;
      if abs(extract(epoch from (k.atualizado_em - v_versao))) > 0.001 then
        raise exception 'versao_antiga' using errcode = '22023', hint = coalesce(k.nome, '');
      end if;
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
-- plano 2000d · DS-090 nx_negocio_salvar: versao_esperada (o atualizado_em que a tela leu) — outra pessoa salvou antes → versao_antiga (hint = o título atual)
--   (cópia da definição em vigor: 20261001b_correcoes.sql)
-- ------------------------------------------------------------
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
  v_versao timestamptz;   -- plano 2000d · DS-090
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
  -- plano 2000d · DS-090: a tela manda a versão que leu (opcional); mudou no meio → a pessoa decide (409 versao_antiga)
  if nullif(btrim(coalesce(n ->> 'versao_esperada', '')), '') is not null then
    begin
      v_versao := (n ->> 'versao_esperada')::timestamptz;
    exception when others then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'versao_esperada';
    end;
    if abs(extract(epoch from (l.atualizado_em - v_versao))) > 0.001 then
      raise exception 'versao_antiga' using errcode = '22023', hint = coalesce(l.titulo, l.nome, '');
    end if;
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
    campos = case when n ? 'campos' then jsonb_strip_nulls(x.campos || coalesce(case when jsonb_typeof(n -> 'campos') = 'object' then (n -> 'campos') - array['presenca', 'presenca_em', 'presenca_por', 'chegou_em', 'agenda_obs', 'marcado_por',
                                                                       'marcado_em', 'confirmada_em', 'encaixe'] end, '{}'::jsonb))   -- plano 2000d · DS-321
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
-- plano 2000d · DS-007 / DC-077 nx_cv_listar: p_filtro.ids (as fixadas fora da página) · DS-008: cursor do «Aguardando» com desempate por id
--   (cópia da definição em vigor: 20261015a_plano1000b.sql)
-- ------------------------------------------------------------
create or replace function public.nx_cv_listar(p_token text, p_cliente uuid, p_filtro jsonb default '{}'::jsonb,
                                               p_limite int default 50, p_antes timestamptz default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  f jsonb := coalesce(p_filtro, '{}'::jsonb);
  v_rank int;
  v_aba text := coalesce(nullif(f ->> 'aba', ''), 'abertas');
  v_lim int := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_dep uuid; v_canal uuid; v_at text; v_at_id uuid; v_etq uuid[]; v_nl boolean; v_antes_id bigint; v_origem text;
  v_q text; v_qn text; v_dig text; v_busca boolean;
  v_ids bigint[]; v_itens jsonb; v_n int; v_cont json;
  v_so_ids bigint[];   -- plano 2000d · DS-007
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  v_rank := public.nx_rank(v.papel);
  if v_aba not in ('minhas', 'sem_dono', 'aguardando', 'abertas', 'pendentes', 'resolvidas', 'ocultas') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'aba';
  end if;
  if v_aba = 'ocultas' and v_rank < 2 then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  begin
    v_dep := nullif(f ->> 'departamento_id', '')::uuid;
    v_canal := nullif(f ->> 'canal_id', '')::uuid;
    v_at := nullif(f ->> 'atendente', '');
    if v_at is not null and v_at not in ('eu', 'sem') then v_at_id := v_at::uuid; end if;
    if jsonb_typeof(f -> 'etiquetas') = 'array' and jsonb_array_length(f -> 'etiquetas') > 0 then
      select array_agg(x::uuid) into v_etq from jsonb_array_elements_text(f -> 'etiquetas') x;
    end if;
    v_nl := coalesce(nullif(f ->> 'nao_lidas', '')::boolean, false);
    -- plano 1000 (SV-111): id do último item da página anterior (desempate de quem tem o mesmo ultima_msg_em)
    v_antes_id := nullif(f ->> 'antes_id', '')::bigint;
    v_origem := nullif(f ->> 'origem', '');   -- plano 1000b · CB-209
    -- plano 2000d · DS-007: só estas conversas (até 100), em qualquer aba — a tela completa as fixadas que não vieram na página
    if jsonb_typeof(f -> 'ids') = 'array' then
      if jsonb_array_length(f -> 'ids') > 100 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'ids'; end if;
      select coalesce(array_agg(x::bigint), '{}') into v_so_ids from jsonb_array_elements_text(f -> 'ids') x;
    end if;
  exception when invalid_text_representation then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'filtro';
  end;
  -- plano 1000b · CB-209: a origem do contato (anúncio, site, orgânico…), os mesmos valores de nx_contatos.origem
  if v_origem is not null and v_origem not in ('anuncio', 'whatsapp', 'indicacao', 'organico', 'manual', 'site', 'importacao') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'origem';
  end if;
  v_q := left(btrim(coalesce(f ->> 'busca', '')), 80);
  v_busca := char_length(v_q) >= 2;
  if v_busca then
    v_qn := replace(replace(replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, v_q)),
                    '\', '\\'), '%', '\%'), '_', '\_');
    v_dig := regexp_replace(v_q, '\D', '', 'g');
  end if;

  if v_so_ids is not null then
    v_ids := array(
      select cv.id from public.nx_conversas cv
       where cv.cliente_id = p_cliente and cv.id = any(v_so_ids)
         and (not cv.oculta or v_rank >= 2)
         -- regra nx_cv_visivel
         and ( v_rank >= 3
            or cv.atribuida_a = v.conta_id
            or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                  or cv.departamento_id = any(v.departamentos))
                 and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )
       order by cv.ultima_msg_em desc, cv.id desc
       limit v_lim + 1);
  elsif v_aba = 'aguardando' and not v_busca then
    -- plano 1000 (SV-110): «Aguardando» — quem espera há mais tempo primeiro, predicado literal (índice parcial)
    v_ids := array(
      select cv.id from public.nx_conversas cv
       where cv.cliente_id = p_cliente and cv.status = 'aberta' and cv.aguardando and not cv.oculta
         -- regra nx_cv_visivel
         and ( v_rank >= 3
            or cv.atribuida_a = v.conta_id
            or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                  or cv.departamento_id = any(v.departamentos))
                 and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )
         and (v_dep is null or cv.departamento_id = v_dep)
         and (v_canal is null or cv.canal_id = v_canal)
         and (v_at is null
              or (v_at = 'eu' and cv.atribuida_a = v.conta_id)
              or (v_at = 'sem' and cv.atribuida_a is null)
              or (v_at_id is not null and cv.atribuida_a = v_at_id))
         and (v_etq is null or cv.etiquetas && v_etq)
         and (not v_nl or cv.nao_lidas > 0)
         and (v_origem is null or exists (select 1 from public.nx_contatos ko
                                           where ko.id = cv.contato_id and ko.cliente_id = p_cliente and ko.origem = v_origem))
         -- plano 2000d · DS-008: com p_filtro.antes_id, quem chegou no MESMO instante da última linha não é pulado
         and (p_antes is null
              or (case when v_antes_id is null then cv.ultima_entrada_em > p_antes
                       else (cv.ultima_entrada_em, cv.id) > (p_antes, v_antes_id) end))
       order by cv.ultima_entrada_em asc nulls last, cv.id asc
       limit v_lim + 1);
  else
    v_ids := array(
      select cv.id from public.nx_conversas cv
       where cv.cliente_id = p_cliente
         -- regra nx_cv_visivel
         and (not cv.oculta or v_rank >= 2)
         and ( v_rank >= 3
            or cv.atribuida_a = v.conta_id
            or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                  or cv.departamento_id = any(v.departamentos))
                 and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )
         -- aba (com busca: procura em todos os atendimentos, menos os ocultos)
         and ( case
                 when v_aba = 'ocultas' then cv.oculta
                 when v_busca then not cv.oculta
                 when v_aba = 'minhas' then not cv.oculta and cv.status in ('aberta', 'pendente') and cv.atribuida_a = v.conta_id
                 when v_aba = 'sem_dono' then not cv.oculta and cv.status in ('aberta', 'pendente') and cv.atribuida_a is null
                 when v_aba = 'abertas' then not cv.oculta and cv.status = 'aberta'
                 when v_aba = 'pendentes' then not cv.oculta and cv.status = 'pendente'
                 when v_aba = 'resolvidas' then not cv.oculta and cv.status = 'resolvida'
                                                and cv.resolvida_em > now() - interval '30 days'
                 else false
               end )
         and (v_dep is null or cv.departamento_id = v_dep)
         and (v_canal is null or cv.canal_id = v_canal)
         and (v_at is null
              or (v_at = 'eu' and cv.atribuida_a = v.conta_id)
              or (v_at = 'sem' and cv.atribuida_a is null)
              or (v_at_id is not null and cv.atribuida_a = v_at_id))
         and (v_etq is null or cv.etiquetas && v_etq)
         and (not v_nl or cv.nao_lidas > 0)
         and (v_origem is null or exists (select 1 from public.nx_contatos ko
                                           where ko.id = cv.contato_id and ko.cliente_id = p_cliente and ko.origem = v_origem))
         and (not v_busca
              or cv.protocolo ilike '%' || v_qn || '%'
              or cv.contato_id in (select k.id from public.nx_contatos k
                                    where k.cliente_id = p_cliente
                                      and (k.busca like '%' || v_qn || '%'
                                           or (char_length(v_dig) >= 4 and k.telefone like '%' || v_dig || '%'))))
         and (p_antes is null
              or (case when v_antes_id is null then cv.ultima_msg_em < p_antes
                       else (cv.ultima_msg_em, cv.id) < (p_antes, v_antes_id) end))
       order by cv.ultima_msg_em desc, cv.id desc
       limit v_lim + 1);
  end if;
  v_n := coalesce(cardinality(v_ids), 0);
  select coalesce(jsonb_agg(public.nx_cv_json_item(c) order by x.o), '[]'::jsonb)
    into v_itens
    from unnest(v_ids[1:v_lim]) with ordinality x(id, o)
    join public.nx_conversas c on c.id = x.id;

  -- contagens das abas (só visibilidade; ignoram filtros e busca — alimentam o menu e o título)
  select json_build_object(
           'minhas', count(*) filter (where cv.atribuida_a = v.conta_id),
           'sem_dono', count(*) filter (where cv.atribuida_a is null),
           'aguardando', count(*) filter (where cv.status = 'aberta' and cv.aguardando),
           'abertas', count(*) filter (where cv.status = 'aberta'),
           'pendentes', count(*) filter (where cv.status = 'pendente'),
           'nao_lidas', count(*) filter (where cv.nao_lidas > 0))
    into v_cont
    from public.nx_conversas cv
   where cv.cliente_id = p_cliente and cv.status in ('aberta', 'pendente') and not cv.oculta
     -- regra nx_cv_visivel
     and ( v_rank >= 3
        or cv.atribuida_a = v.conta_id
        or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
              or cv.departamento_id = any(v.departamentos))
             and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) );

  return json_build_object('itens', v_itens, 'tem_mais', v_n > v_lim, 'contagens', v_cont,
                           'aba', v_aba, 'busca', v_busca);
end $$;

-- ------------------------------------------------------------
-- plano 1500c · CC-050 (pendência) nx_cv_ver: contato.consultas — as próximas 3 e a última, com a presença (a lateral mostra quando vier)
--   (cópia da definição em vigor: 20261001b_correcoes.sql)
-- ------------------------------------------------------------
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
    -- plano 2000d · CC-050: consultas do contato (o atendente restrito só as dos negócios que vê)
    'contato', (to_jsonb(k) - 'busca' - 'tel_chave') || jsonb_build_object('consultas', coalesce((
      select jsonb_agg(jsonb_build_object('negocio_id', y.id, 'inicio', public.nx_agenda_iso(y.consulta_em), 'servico', y.servico,
                                          'presenca', y.presenca, 'futura', y.consulta_em >= now()) order by y.consulta_em)
        from ((select l.id, l.consulta_em, l.servico, l.campos ->> 'presenca' as presenca from public.nx_leads l
                where l.cliente_id = p_cliente and l.contato_id = k.id and l.status in ('aberto', 'ganho') and l.consulta_em >= now()
                  and (v.papel not in ('atendente', 'leitura') or v.ver_todas or l.dono_id = v.conta_id or l.dono_id is null)
                order by l.consulta_em limit 3)
              union all
              (select l.id, l.consulta_em, l.servico, l.campos ->> 'presenca' from public.nx_leads l
                where l.cliente_id = p_cliente and l.contato_id = k.id and l.consulta_em < now()
                  and (v.papel not in ('atendente', 'leitura') or v.ver_todas or l.dono_id = v.conta_id or l.dono_id is null)
                order by l.consulta_em desc limit 1)) y), '[]'::jsonb)),
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
-- plano 2000d · DS-021 nx_cv_contexto_envio: o nome do dono atual (o nx-enviar responde 409 dono_mudou com ele)
--   (cópia da definição em vigor: 20260929a_codewords.sql)
-- ------------------------------------------------------------
create or replace function public.nx_cv_contexto_envio(p_ctx jsonb, p_cliente uuid, p_conversa bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := jsonb_populate_record(null::public.nx_ctx_t, coalesce(p_ctx, '{}'::jsonb));
  cv public.nx_conversas; ct public.nx_contatos; k public.nx_canais; c public.nx_clientes;
begin
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  select * into cv from public.nx_conversas where id = p_conversa and cliente_id = p_cliente;
  select * into ct from public.nx_contatos where id = cv.contato_id and cliente_id = p_cliente;
  select * into k from public.nx_canais where id = cv.canal_id and cliente_id = p_cliente;
  select * into c from public.nx_clientes where id = p_cliente;
  return json_build_object(
    'conversa', json_build_object('id', cv.id, 'status', cv.status, 'canal_id', cv.canal_id,
                                  'contato_id', cv.contato_id, 'protocolo', cv.protocolo,
                                  'departamento_id', cv.departamento_id, 'atribuida_a', cv.atribuida_a,
                                  'atribuida_nome', (select x.nome from public.nx_contas x where x.id = cv.atribuida_a),   -- plano 2000d · DS-021
                                  'ultima_entrada_em', cv.ultima_entrada_em,
                                  'janela_ate', cv.ultima_entrada_em + interval '24 hours'),
    'contato', json_build_object('id', ct.id, 'wa_id', ct.wa_id, 'telefone', ct.telefone, 'nome', ct.nome,
                                 'optin_marketing', ct.optin_marketing, 'bloqueado', ct.bloqueado),
    'canal_id', cv.canal_id,
    'canal', case when k.id is not null then json_build_object('id', k.id, 'nome', k.nome, 'status', k.status,
                                                              'tem_token', case when k.provedor = 'codewords'
                                                                then k.codewords_api_segredo is not null and k.codewords_phone_id is not null
                                                                else k.token_segredo is not null end,
                                                              'provedor', k.provedor) end,
    'janela_aberta', coalesce(cv.ultima_entrada_em > now() - interval '24 hours', false),
    'ultimo_wamid_in', (select m.wamid from public.nx_mensagens m
                         where m.conversa_id = cv.id and m.direcao = 'in' and m.wamid is not null
                         order by m.id desc limit 1),
    'cfg_cv', jsonb_build_object('recibo_leitura', true, 'assinatura', false)
              || case when jsonb_typeof(c.cfg -> 'cv') = 'object' then c.cfg -> 'cv' else '{}'::jsonb end,
    'atendente_nome', (select x.nome from public.nx_contas x where x.id = v.conta_id),
    'empresa', c.nome);
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-062 nx_crm_tarefas_json: repetir e de qual tarefa veio
--   (cópia da definição em vigor: 20260928d_crm.sql)
-- ------------------------------------------------------------
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
      'automacao', t.automacao_id is not null,
      'repetir', t.repetir, 'origem_id', t.origem_id   -- plano 2000d · DS-062
    ) order by x.o)
    from unnest(p_ids) with ordinality x(id, o)
    join public.nx_tarefas t on t.id = x.id and t.cliente_id = p_cliente
    left join public.nx_contas d on d.id = t.dono_id
    left join public.nx_contatos k on k.id = t.contato_id
    left join public.nx_leads l on l.id = t.negocio_id), '[]'::json);
end $$;

-- ------------------------------------------------------------
-- 4. Permissões. As cópias de mesma assinatura mantêm as da origem. RPCs novas do painel (p_token → nx_ctx): anon + service_role.
--    Gatilhos: só service_role.
-- ------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.nx_onboarding_dispensar(text, uuid, timestamptz)',
    'public.nx_agenda_obs_salvar(text, uuid, bigint, text, text)',
    'public.nx_negocios_buscar_funis(text, uuid, text)',
    'public.nx_cv_status_lote(text, uuid, bigint[], text, jsonb)',
    'public.nx_cv_marcar_lida_lote(text, uuid, bigint[])',
    'public.nx_tarefa_repetir(text, uuid, bigint, text)',
    'public.nx_cv_novidades(text, uuid, timestamptz)',
    'public.nx_cv_mensagens(text, uuid, bigint, bigint, integer)'] loop
    execute format('revoke all on function %s from public, authenticated', f);
    execute format('grant execute on function %s to anon, service_role', f);
  end loop;
  foreach f in array array[
    'public.nx_tg_tarefa_repetir()',
    'public.nx_tg_tarefa_atribuida()',
    'public.nx_tg_cliente_plano_status()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  raise notice 'nx_revogar_authenticated: % funções', public.nx_revogar_authenticated();
end $$;

insert into public.nx_versao_banco (nome) values ('20261026b_plano2000d_telas')
on conflict (nome) do update set aplicada_em = now();

notify pgrst, 'reload schema';
