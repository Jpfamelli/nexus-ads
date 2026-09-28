-- ============================================================
-- NEXUS ADS — 20260927_melhorias.sql
-- A) Entrega do WhatsApp: wamid de cada envio + entregue_em (o webhook
--    do número da Nexus confirma a entrega ou avisa a falha).
-- B) Lead duplicado em webhooks paralelos: nx_lead_webhook com trava
--    por cliente + telefone (pg_advisory_xact_lock).
-- C) Execução sobreposta (cron + botão): nx_travas + nx_trava_pegar/soltar.
-- D) Aviso de integração quebrada: só código (regra 'integracao' em
--    nx_alertas, sem mudança de esquema).
--
-- Idempotente: pode rodar de novo sem erro nem efeito colateral.
-- Tudo novo é só para a service_role (Edge Functions); o painel continua
-- falando só por nx_dados e pelas RPCs de sempre.
-- ============================================================

-- ------------------------------------------------------------
-- A) wamids e confirmação de entrega
-- ------------------------------------------------------------
alter table public.nx_alertas
  add column if not exists wa_ids text[] not null default '{}',
  add column if not exists wa_ids_template text[] not null default '{}',
  add column if not exists entregue_em timestamptz;

alter table public.nx_relatorios
  add column if not exists wa_ids text[] not null default '{}',
  add column if not exists wa_ids_template text[] not null default '{}',
  add column if not exists entregue_em timestamptz;

comment on column public.nx_alertas.wa_ids is 'wamid de cada texto enviado (um por destino que a API aceitou)';
comment on column public.nx_alertas.wa_ids_template is 'wamid de cada envio por template (fora da janela de 24h) — nunca é reenviado';
comment on column public.nx_alertas.entregue_em is 'primeiro recibo delivered/read do webhook do número da Nexus';
comment on column public.nx_relatorios.wa_ids is 'wamid de cada texto enviado (um por destino que a API aceitou)';
comment on column public.nx_relatorios.wa_ids_template is 'wamid de cada envio por template (fora da janela de 24h) — nunca é reenviado';
comment on column public.nx_relatorios.entregue_em is 'primeiro recibo delivered/read do webhook do número da Nexus';

-- o webhook acha o envio pelo wamid: or=(wa_ids.cs.{…},wa_ids_template.cs.{…})
create index if not exists nx_alertas_wa_ids on public.nx_alertas using gin (wa_ids);
create index if not exists nx_alertas_wa_ids_template on public.nx_alertas using gin (wa_ids_template);
create index if not exists nx_relatorios_wa_ids on public.nx_relatorios using gin (wa_ids);
create index if not exists nx_relatorios_wa_ids_template on public.nx_relatorios using gin (wa_ids_template);

-- Anotação atômica do webhook de status (vários recibos do mesmo envio podem
-- chegar ao mesmo tempo): entregue_em só na primeira vez, template novo sem
-- repetir, erro acrescentado sem duplicar. Devolve quantas linhas mudaram.
create or replace function public.nx_wa_anotar(
  p_tabela text,
  p_ids bigint[],
  p_entregue_em timestamptz default null,
  p_wa_id_template text default null,
  p_erro text default null
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer := 0;
  v_tpl text := nullif(btrim(p_wa_id_template), '');
  v_erro text := nullif(btrim(p_erro), '');
begin
  if p_tabela = 'nx_alertas' then
    update public.nx_alertas set
      entregue_em = coalesce(entregue_em, p_entregue_em),
      wa_ids_template = case when v_tpl is null or v_tpl = any(wa_ids_template) then wa_ids_template
                             else array_append(wa_ids_template, v_tpl) end,
      erro_envio = case when v_erro is null or strpos(coalesce(erro_envio, ''), v_erro) > 0 then erro_envio
                        else left(concat_ws(' · ', erro_envio, v_erro), 1000) end
    where id = any(p_ids);
  elsif p_tabela = 'nx_relatorios' then
    update public.nx_relatorios set
      entregue_em = coalesce(entregue_em, p_entregue_em),
      wa_ids_template = case when v_tpl is null or v_tpl = any(wa_ids_template) then wa_ids_template
                             else array_append(wa_ids_template, v_tpl) end,
      erro = case when v_erro is null or strpos(coalesce(erro, ''), v_erro) > 0 then erro
                  else left(concat_ws(' · ', erro, v_erro), 1000) end
    where id = any(p_ids);
  else
    raise exception 'tabela_invalida';
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.nx_wa_anotar(text, bigint[], timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.nx_wa_anotar(text, bigint[], timestamptz, text, text) to service_role;

-- nx_dados: a MESMA função que está no banco (pg_get_functiondef de 27/09/2026);
-- a única diferença é o campo entregue_em em alertas[] e em relatorios[].
-- create or replace mantém dono e permissões (anon/authenticated continuam podendo chamar).
create or replace function public.nx_dados(p_token text, p_cliente uuid, p_dias integer default 130)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare c public.nx_contas := public.nx_conta_do_token(p_token); v_de date;
begin
  if not public.nx_pode(c, p_cliente) then raise exception 'sem_acesso' using errcode = '42501'; end if;
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
end $function$;

-- ------------------------------------------------------------
-- B) Lead do webhook sem duplicar
-- ------------------------------------------------------------
-- Mesma lógica que o webhook.js fazia em três idas ao banco (procura →
-- decide → grava), agora numa transação só, serializada por cliente +
-- telefone. A chave da trava é a MENOR variante do número: "5512977776666" e
-- "551277776666" (sem o 9) são a mesma pessoa e caem na mesma trava.
-- Devolve 'existente' | 'atribuido' | 'criado'.
create or replace function public.nx_lead_webhook(
  p_cliente uuid,
  p_telefone text,
  p_variantes text[],
  p_nome text,
  p_atr jsonb,
  p_hoje date,
  p_dias integer default 30
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tel text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_var text[];
  v_lead record;
  v_anuncio text := nullif(p_atr ->> 'anuncio_ext', '');
  v_plat text := nullif(p_atr ->> 'plataforma', '');
begin
  if p_cliente is null or p_hoje is null then raise exception 'parametros_invalidos'; end if;
  if v_tel is null then raise exception 'telefone_invalido'; end if;
  v_var := array(select distinct v from unnest(coalesce(p_variantes, '{}'::text[]) || v_tel) as v where coalesce(v, '') <> '');

  perform pg_advisory_xact_lock(hashtextextended(p_cliente::text || ':' || (select min(v) from unnest(v_var) as v), 0));

  select l.id, l.anuncio_ext into v_lead
    from public.nx_leads l
   where l.cliente_id = p_cliente
     and l.telefone = any(v_var)
     and l.data_conversa >= p_hoje - coalesce(p_dias, 30)
   order by l.data_conversa desc, l.id desc
   limit 1;

  if found then
    -- já conversou nos últimos p_dias: só completa a atribuição que faltava
    if v_anuncio is null or nullif(v_lead.anuncio_ext, '') is not null then return 'existente'; end if;
    update public.nx_leads set
      anuncio_ext = v_anuncio,
      ctwa_clid = nullif(p_atr ->> 'ctwa_clid', ''),
      campanha_ext = coalesce(nullif(p_atr ->> 'campanha_ext', ''), campanha_ext),
      plataforma = coalesce(v_plat, plataforma),
      origem = case when v_plat is not null then coalesce(nullif(p_atr ->> 'origem', ''), origem) else origem end,
      atualizado_em = now()
    where id = v_lead.id;
    return 'atribuido';
  end if;

  insert into public.nx_leads (cliente_id, telefone, nome, origem, plataforma, campanha_ext, anuncio_ext, ctwa_clid, data_conversa, etapa)
  values (p_cliente, v_tel, nullif(btrim(p_nome), ''), coalesce(nullif(p_atr ->> 'origem', ''), 'whatsapp'), v_plat,
          nullif(p_atr ->> 'campanha_ext', ''), v_anuncio, nullif(p_atr ->> 'ctwa_clid', ''), p_hoje, 'nova');
  return 'criado';
end $$;

revoke all on function public.nx_lead_webhook(uuid, text, text[], text, jsonb, date, integer) from public, anon, authenticated;
grant execute on function public.nx_lead_webhook(uuid, text, text[], text, jsonb, date, integer) to service_role;

-- ------------------------------------------------------------
-- C) Trava de execução (nx-ciclo:<cliente>, nx-relatorio:<tipo>:<cliente>, wa-reenvio:<wamid>)
-- ------------------------------------------------------------
-- Uma linha por trava, com prazo: se a função morrer sem soltar (corte de
-- 150 s da Edge Function), a trava vence sozinha em `ate`.
create table if not exists public.nx_travas (
  nome text primary key,
  ate timestamptz not null,
  dono text
);
alter table public.nx_travas enable row level security;
revoke all on table public.nx_travas from public, anon, authenticated;
grant select, insert, update, delete on table public.nx_travas to service_role;

-- true só para quem pegou: livre, ou a anterior já venceu.
create or replace function public.nx_trava_pegar(p_nome text, p_segundos integer, p_dono text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  if coalesce(btrim(p_nome), '') = '' then raise exception 'trava_sem_nome'; end if;
  -- faxina: travas vencidas há mais de um dia não servem para mais nada
  delete from public.nx_travas where ate < now() - interval '1 day';
  insert into public.nx_travas as t (nome, ate, dono)
  values (p_nome, now() + make_interval(secs => greatest(1, least(coalesce(p_segundos, 60), 2592000))), p_dono)
  on conflict (nome) do update set ate = excluded.ate, dono = excluded.dono
   where t.ate < now();
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

-- Solta só se ainda for do mesmo dono (quem perdeu a trava por prazo não
-- apaga a de quem pegou depois).
create or replace function public.nx_trava_soltar(p_nome text, p_dono text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  delete from public.nx_travas where nome = p_nome and dono is not distinct from p_dono;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

revoke all on function public.nx_trava_pegar(text, integer, text) from public, anon, authenticated;
revoke all on function public.nx_trava_soltar(text, text) from public, anon, authenticated;
grant execute on function public.nx_trava_pegar(text, integer, text) to service_role;
grant execute on function public.nx_trava_soltar(text, text) to service_role;

-- PostgREST passa a enxergar as colunas e funções novas na hora
notify pgrst, 'reload schema';
