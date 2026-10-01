-- ============================================================
-- ÓRBITA — Agenda da IA + rastreio de campanha (site → WhatsApp → CRM)
-- 20260929b_agenda_rastreio.sql · ADITIVO e idempotente (if not exists / create or replace)
-- Depende de 20260929a_codewords.sql (nx_codewords_alvo, nx_codewords_dados, nx_codewords_origem).
--
-- 1. AGENDA (por cliente). As consultas SÃO os negócios (nx_leads) com consulta_em e status
--    'aberto' — não existe tabela paralela de agendamento. Novas: nx_agenda_config (duração,
--    capacidade, antecedência, janela, horário, almoço) e nx_agenda_bloqueios (datas/horas
--    fechadas). Tudo em America/Sao_Paulo.
--    · IA (service_role): nx_agenda_livres_ia · nx_agenda_marcar_ia · nx_agenda_desmarcar_ia
--    · Painel (token via nx_ctx): nx_agenda_config_ver/_salvar · nx_agenda_bloqueio_salvar/_excluir ·
--      nx_agenda_dia · nx_agenda_livres · nx_agenda_marcar · nx_agenda_desmarcar
--    · Marcar e desmarcar têm UMA implementação (nx_agenda_marcar_core / _desmarcar_core), sob
--      trava por cliente (advisory lock): duas conversas no mesmo horário além da capacidade →
--      a segunda recebe 'horario_ocupado'.
--    Sem horário configurado: o do departamento padrão; sem ele, seg–sex 08:00–18:00.
-- 2. RASTREIO. nx_rastreio_registrar (ANON, chave pública do cliente, limite de taxa) guarda
--    utm/gclid/fbclid da visita e devolve um código curto para a mensagem do WhatsApp;
--    nx_rastreio_atribuir (service_role) transforma o código, na 1ª mensagem, em atribuição do
--    negócio (plataforma, campanha, anúncio, gclid). Nunca sobrescreve atribuição de anúncio.
-- Nada aqui chama a rede nem guarda segredo.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colunas e tabelas novas
-- ------------------------------------------------------------
alter table public.nx_leads
  add column if not exists gclid text,
  add column if not exists rastreio jsonb;

create table if not exists public.nx_agenda_config (
  cliente_id uuid primary key references public.nx_clientes(id) on delete cascade,
  duracao_min int not null default 30 check (duracao_min between 5 and 480),
  duracoes jsonb not null default '{}'::jsonb,            -- {"limpeza": 45}  (serviço em minúsculas)
  capacidade int not null default 1 check (capacidade between 1 and 50),
  antecedencia_horas int not null default 2 check (antecedencia_horas between 0 and 720),
  dias_a_frente int not null default 30 check (dias_a_frente between 1 and 180),
  passo_min int check (passo_min between 5 and 480),      -- null = igual à duração
  horario jsonb,                                          -- null = horário do departamento padrão
  intervalos jsonb not null default '[]'::jsonb,          -- [["12:00","13:30"]] todos os dias (almoço)
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.nx_agenda_config enable row level security;
revoke all on table public.nx_agenda_config from public, anon, authenticated;
grant all on table public.nx_agenda_config to service_role;

create table if not exists public.nx_agenda_bloqueios (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  inicio timestamptz not null,
  fim timestamptz not null,
  motivo text check (char_length(motivo) <= 120),
  criado_por uuid references public.nx_contas(id) on delete set null,
  criado_em timestamptz not null default now(),
  check (fim > inicio)
);
create index if not exists nx_agenda_bloqueios_cli on public.nx_agenda_bloqueios(cliente_id, inicio);
alter table public.nx_agenda_bloqueios enable row level security;
revoke all on table public.nx_agenda_bloqueios from public, anon, authenticated;
grant all on table public.nx_agenda_bloqueios to service_role;

create table if not exists public.nx_rastreio (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  codigo text not null check (codigo ~ '^[A-HJKMNP-Z2-9]{5}$'),
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  gclid text, gbraid text, wbraid text, fbclid text,
  pagina text,
  criado_em timestamptz not null default now(),
  usado_em timestamptz,
  telefone text,                                          -- quem mandou a mensagem com o código
  negocio_id bigint references public.nx_leads(id) on delete set null,
  unique (cliente_id, codigo)
);
create index if not exists nx_rastreio_recente on public.nx_rastreio(cliente_id, criado_em desc);
create index if not exists nx_rastreio_negocio on public.nx_rastreio(negocio_id) where negocio_id is not null;
alter table public.nx_rastreio enable row level security;
revoke all on table public.nx_rastreio from public, anon, authenticated;
grant all on table public.nx_rastreio to service_role;

-- ------------------------------------------------------------
-- 2. Auxiliares da agenda (internas)
-- ------------------------------------------------------------
create or replace function public.nx_agenda_rotulo(p_ts timestamptz)
returns text
language sql stable
set search_path = ''
as $$
  select (array['dom','seg','ter','qua','qui','sex','sáb'])[extract(dow from p_ts at time zone 'America/Sao_Paulo')::int + 1]
         || ' ' || to_char(p_ts at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
$$;

create or replace function public.nx_agenda_iso(p_ts timestamptz)
returns text
language sql stable
set search_path = ''
as $$
  select to_char(p_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
$$;

-- lista de faixas [["08:00","12:00"],["13:30","18:00"]]: horas válidas, início < fim, até 6 faixas
create or replace function public.nx_agenda_faixas_ok(p_faixas jsonb)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare f jsonb;
begin
  if p_faixas is null or jsonb_typeof(p_faixas) <> 'array' or jsonb_array_length(p_faixas) > 6 then return false; end if;
  for f in select value from jsonb_array_elements(p_faixas) loop
    if jsonb_typeof(f) <> 'array' or jsonb_array_length(f) <> 2
       or jsonb_typeof(f -> 0) <> 'string' or jsonb_typeof(f -> 1) <> 'string' then return false; end if;
    if (f ->> 0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (f ->> 1) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
    if (f ->> 0)::time >= (f ->> 1)::time then return false; end if;
  end loop;
  return true;
end $$;

-- horário semanal {"0":[],"1":[["08:00","18:00"]],…}: chaves 0–6 (0 = domingo)
create or replace function public.nx_agenda_horario_ok(p_horario jsonb)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare k text;
begin
  if p_horario is null or jsonb_typeof(p_horario) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(p_horario) loop
    if k !~ '^[0-6]$' or not public.nx_agenda_faixas_ok(p_horario -> k) then return false; end if;
  end loop;
  return true;
end $$;

-- configuração efetiva do cliente (linha ausente = padrões)
create or replace function public.nx_agenda_cfg(p_cliente uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  c public.nx_agenda_config; v_h jsonb; v_fonte text;
  v_padrao constant jsonb := '{"0":[],"1":[["08:00","18:00"]],"2":[["08:00","18:00"]],"3":[["08:00","18:00"]],
                               "4":[["08:00","18:00"]],"5":[["08:00","18:00"]],"6":[]}';
begin
  select * into c from public.nx_agenda_config where cliente_id = p_cliente;
  if c.horario is not null and public.nx_agenda_horario_ok(c.horario) then
    v_h := c.horario; v_fonte := 'agenda';
  else
    select d.horario into v_h from public.nx_departamentos d
     where d.cliente_id = p_cliente and d.ativo and d.padrao limit 1;
    if v_h is not null and public.nx_agenda_horario_ok(v_h) then v_fonte := 'departamento';
    else v_h := v_padrao; v_fonte := 'padrao'; end if;
  end if;
  return jsonb_build_object(
    'duracao_min', coalesce(c.duracao_min, 30), 'duracoes', coalesce(c.duracoes, '{}'::jsonb),
    'capacidade', coalesce(c.capacidade, 1), 'antecedencia_horas', coalesce(c.antecedencia_horas, 2),
    'dias_a_frente', coalesce(c.dias_a_frente, 30), 'passo_min', c.passo_min,
    'horario', v_h, 'horario_fonte', v_fonte, 'intervalos', coalesce(c.intervalos, '[]'::jsonb));
end $$;

-- duração (min) de um serviço: a do serviço, senão a padrão
create or replace function public.nx_agenda_dur(p_cfg jsonb, p_servico text)
returns int
language sql immutable
set search_path = ''
as $$
  select coalesce(nullif((p_cfg -> 'duracoes' ->> lower(btrim(coalesce(p_servico, ''))))::int, 0), (p_cfg ->> 'duracao_min')::int)
$$;

-- horários candidatos (dentro do horário, fora de almoço/bloqueio, respeitando antecedência e janela) com a ocupação
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
           where l.cliente_id = p_cliente and l.status = 'aberto' and l.consulta_em is not null
             and l.id is distinct from p_excluir
             and l.consulta_em < k.ini_ts + make_interval(mins => v_dur)
             and l.consulta_em + make_interval(mins => public.nx_agenda_dur(cfg, l.servico)) > k.ini_ts),
         v_cap
    from c2 k
   order by k.ini_ts;
end $$;

-- este horário pode ser marcado? null = sim; senão o código do erro
-- (dados_invalidos | passado | antecedencia | fora_do_horario | horario_ocupado). Encaixe só barra passado.
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
   where l.cliente_id = p_cliente and l.status = 'aberto' and l.consulta_em is not null
     and l.id is distinct from p_excluir
     and l.consulta_em < p_inicio + make_interval(mins => v_dur)
     and l.consulta_em + make_interval(mins => public.nx_agenda_dur(cfg, l.servico)) > p_inicio;
  if v_n >= (cfg ->> 'capacidade')::int then return 'horario_ocupado'; end if;
  return null;
end $$;

-- os próximos horários livres a partir de p_inicio (para sugerir quando o pedido falha)
create or replace function public.nx_agenda_sugestoes(p_cliente uuid, p_inicio timestamptz, p_servico text,
                                                      p_excluir bigint default null, p_n int default 4)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_de date := greatest(coalesce((p_inicio at time zone 'America/Sao_Paulo')::date, v_hoje), v_hoje);
  r jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('inicio', public.nx_agenda_iso(s.t_inicio), 'rotulo', public.nx_agenda_rotulo(s.t_inicio))
                            order by s.t_inicio), '[]'::jsonb) into r
    from (select t_inicio from public.nx_agenda_slots(p_cliente, v_de, 14, p_servico, p_excluir)
           where t_ocupados < t_cap and t_inicio >= coalesce(p_inicio, now())
           order by t_inicio limit greatest(coalesce(p_n, 4), 1)) s;
  if jsonb_array_length(r) = 0 and v_de > v_hoje then
    select coalesce(jsonb_agg(jsonb_build_object('inicio', public.nx_agenda_iso(s.t_inicio), 'rotulo', public.nx_agenda_rotulo(s.t_inicio))
                              order by s.t_inicio), '[]'::jsonb) into r
      from (select t_inicio from public.nx_agenda_slots(p_cliente, v_hoje, 14, p_servico, p_excluir)
             where t_ocupados < t_cap order by t_inicio limit greatest(coalesce(p_n, 4), 1)) s;
  end if;
  return r;
end $$;

-- o negócio da consulta: o aberto do contato com consulta futura; senão o preferido (aberto)
create or replace function public.nx_agenda_negocio_do_contato(p_cliente uuid, p_contato bigint, p_preferido bigint)
returns bigint
language plpgsql stable
security definer
set search_path = ''
as $$
declare v bigint;
begin
  select l.id into v from public.nx_leads l
   where l.cliente_id = p_cliente and l.contato_id = p_contato and l.status = 'aberto' and l.consulta_em > now()
   order by l.consulta_em, l.id limit 1;
  if v is null and p_preferido is not null then
    select l.id into v from public.nx_leads l where l.id = p_preferido and l.cliente_id = p_cliente and l.status = 'aberto';
  end if;
  return v;
end $$;

-- ------------------------------------------------------------
-- 3. Marcar / desmarcar (uma implementação só; IA e painel chamam estas)
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
                                     'servico', v_serv, 'duracao_min', v_dur));
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
                                   'servico', v_serv, 'duracao_min', v_dur),
    'anterior', case when v_fut then jsonb_build_object('inicio', public.nx_agenda_iso(v_ant), 'rotulo', public.nx_agenda_rotulo(v_ant)) end,
    'etapa', e.nome);
end $$;

create or replace function public.nx_agenda_desmarcar_core(p_cliente uuid, p_negocio bigint, p_motivo text, p_quem text,
                                                           p_conta uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.nx_leads; atual public.nx_estagios; nova public.nx_estagios;
  v_ia boolean := coalesce(p_quem, '') = 'ia';
  v_mot text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 500);
begin
  perform pg_advisory_xact_lock(hashtextextended('nx_agenda:' || p_cliente::text, 0));
  select * into l from public.nx_leads where id = p_negocio and cliente_id = p_cliente and status = 'aberto' for update;
  if l.id is null or l.consulta_em is null then return jsonb_build_object('ok', false, 'erro', 'consulta_nao_encontrada'); end if;
  select * into atual from public.nx_estagios where id = l.estagio_id and cliente_id = p_cliente;
  if atual.marco = 'agendada' then
    select * into nova from public.nx_estagios s
     where s.cliente_id = p_cliente and s.funil_id = l.funil_id and s.marco = 'nova' order by s.ordem limit 1;
  end if;
  update public.nx_leads x set
    consulta_em = null, data_consulta = null,
    estagio_id = coalesce(nova.id, x.estagio_id),
    ordem = case when nova.id is not null then -extract(epoch from clock_timestamp()) else x.ordem end,
    atualizado_em = now()
  where x.id = l.id;
  insert into public.nx_notas (cliente_id, contato_id, negocio_id, autor_id, texto)
  values (p_cliente, l.contato_id, l.id, case when v_ia then null else p_conta end,
          left(case when v_ia then 'IA: ' else '' end || 'Consulta de ' || public.nx_agenda_rotulo(l.consulta_em) || ' cancelada'
               || coalesce(': ' || v_mot, '.'), 5000));
  if v_ia then
    perform public.nx_notificar(p_cliente, null, 'sistema',
      left('Consulta cancelada pela IA: ' || coalesce((select k.nome from public.nx_contatos k where k.id = l.contato_id), l.nome, 'contato'), 120),
      public.nx_agenda_rotulo(l.consulta_em) || coalesce(' · ' || v_mot, ''), '#/crm/negocio/' || l.id);
  end if;
  return jsonb_build_object('ok', true, 'negocio_id', l.id, 'contato_id', l.contato_id,
    'cancelada', jsonb_build_object('inicio', public.nx_agenda_iso(l.consulta_em), 'rotulo', public.nx_agenda_rotulo(l.consulta_em),
                                    'servico', l.servico),
    'etapa', coalesce(nova.nome, atual.nome), 'voltou_para_nova', nova.id is not null);
end $$;

-- ------------------------------------------------------------
-- 4. API do agente (service_role): horários livres, marcar/remarcar, cancelar
-- ------------------------------------------------------------
create or replace function public.nx_agenda_livres_ia(p_canal uuid, p_telefone text default null, p_servico text default null,
                                                      p_a_partir date default null, p_dias int default 7)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  k public.nx_canais; a jsonb; v_excluir bigint; cfg jsonb; r jsonb;
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
  -- livres, no máximo 4 por dia (dá variedade de dias) e 12 no total (os mais próximos)
  select coalesce(jsonb_agg(jsonb_build_object('inicio', public.nx_agenda_iso(y.t_inicio), 'rotulo', public.nx_agenda_rotulo(y.t_inicio))
                            order by y.t_inicio), '[]'::jsonb) into r
    from (select z.t_inicio
            from (select s.t_inicio,
                         row_number() over (partition by (s.t_inicio at time zone 'America/Sao_Paulo')::date order by s.t_inicio) as n_dia
                    from public.nx_agenda_slots(k.cliente_id, v_de, v_dias, p_servico, v_excluir) s
                   where s.t_ocupados < s.t_cap) z
           where z.n_dia <= 4 order by z.t_inicio limit 12) y;
  return json_build_object('ok', true, 'fuso', 'America/Sao_Paulo',
    'duracao_min', public.nx_agenda_dur(cfg, p_servico), 'horarios', r);
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

create or replace function public.nx_agenda_desmarcar_ia(p_canal uuid, p_telefone text, p_motivo text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare k public.nx_canais; a jsonb; v_neg bigint;
begin
  select * into k from public.nx_canais where id = p_canal and provedor = 'codewords';
  if k.id is null then raise exception 'canal_nao_encontrado' using errcode = '22023'; end if;
  a := public.nx_codewords_alvo(p_canal, p_telefone);
  if (a ->> 'contato_id') is null then return json_build_object('ok', false, 'erro', 'consulta_nao_encontrada'); end if;
  v_neg := public.nx_agenda_negocio_do_contato(k.cliente_id, (a ->> 'contato_id')::bigint, null);
  if v_neg is null then return json_build_object('ok', false, 'erro', 'consulta_nao_encontrada'); end if;
  return public.nx_agenda_desmarcar_core(k.cliente_id, v_neg, p_motivo, 'ia', null)::json;
end $$;

-- ------------------------------------------------------------
-- 5. Painel da agenda (token → nx_ctx)
-- ------------------------------------------------------------
create or replace function public.nx_agenda_bloqueios_json(p_cliente uuid, p_de timestamptz, p_ate timestamptz)
returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'inicio', public.nx_agenda_iso(b.inicio), 'fim', public.nx_agenda_iso(b.fim),
                                                'motivo', b.motivo) order by b.inicio, b.id), '[]'::jsonb)
    from public.nx_agenda_bloqueios b
   where b.cliente_id = p_cliente and b.fim > p_de and (p_ate is null or b.inicio < p_ate)
$$;

create or replace function public.nx_agenda_config_ver(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  return json_build_object('config', public.nx_agenda_cfg(p_cliente), 'fuso', 'America/Sao_Paulo',
    'bloqueios', public.nx_agenda_bloqueios_json(p_cliente, now(), null));
end $$;

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
    if v_dias is null or v_dias not between 1 and 180 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'dias_a_frente'; end if;
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

-- bloqueio: {id?, data, data_fim?, das?, ate?, motivo?} — sem das/ate = dia(s) inteiro(s)
create or replace function public.nx_agenda_bloqueio_salvar(p_token text, p_cliente uuid, p_bloqueio jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  n jsonb := coalesce(p_bloqueio, '{}'::jsonb);
  v_id bigint; v_data date; v_fim date; v_das time; v_ate time; v_ini timestamptz; v_f timestamptz;
  v_mot text := left(nullif(btrim(regexp_replace(coalesce(n ->> 'motivo', ''), '[[:cntrl:]]+', ' ', 'g')), ''), 120);
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if jsonb_typeof(n) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'bloqueio'; end if;
  v_id := public.nx_crm_int8(n, 'id');
  v_data := public.nx_crm_data(n, 'data');
  if v_data is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'data'; end if;
  v_fim := coalesce(public.nx_crm_data(n, 'data_fim'), v_data);
  if v_fim < v_data or v_fim > v_data + 366 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'data_fim'; end if;
  if nullif(btrim(coalesce(n ->> 'das', '')), '') is not null or nullif(btrim(coalesce(n ->> 'ate', '')), '') is not null then
    if coalesce(n ->> 'das', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(n ->> 'ate', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'das';
    end if;
    v_das := (n ->> 'das')::time; v_ate := (n ->> 'ate')::time;
    if v_das >= v_ate then raise exception 'dados_invalidos' using errcode = '22023', hint = 'ate'; end if;
    v_ini := (v_data + v_das) at time zone 'America/Sao_Paulo';
    v_f := (v_data + v_ate) at time zone 'America/Sao_Paulo';
  else
    v_ini := v_data::timestamp at time zone 'America/Sao_Paulo';
    v_f := (v_fim + 1)::timestamp at time zone 'America/Sao_Paulo';
  end if;
  if v_id is null then
    if (select count(*) from public.nx_agenda_bloqueios b where b.cliente_id = p_cliente and b.fim > now()) >= 500 then
      raise exception 'limite_atingido' using errcode = '54000', hint = 'bloqueios';
    end if;
    insert into public.nx_agenda_bloqueios (cliente_id, inicio, fim, motivo, criado_por)
    values (p_cliente, v_ini, v_f, v_mot, v.conta_id) returning id into v_id;
  else
    update public.nx_agenda_bloqueios set inicio = v_ini, fim = v_f, motivo = v_mot
     where id = v_id and cliente_id = p_cliente returning id into v_id;
    if v_id is null then raise exception 'bloqueio_nao_encontrado' using errcode = '22023'; end if;
  end if;
  return json_build_object('ok', true, 'id', v_id, 'bloqueios', public.nx_agenda_bloqueios_json(p_cliente, now(), null));
end $$;

create or replace function public.nx_agenda_bloqueio_excluir(p_token text, p_cliente uuid, p_id bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); v_id bigint;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  delete from public.nx_agenda_bloqueios where id = p_id and cliente_id = p_cliente returning id into v_id;
  if v_id is null then raise exception 'bloqueio_nao_encontrado' using errcode = '22023'; end if;
  return json_build_object('ok', true, 'bloqueios', public.nx_agenda_bloqueios_json(p_cliente, now(), null));
end $$;

-- agenda do dia ou da semana (até 31 dias): consultas (abertas e ganhas) + bloqueios + config
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
      'servico', l.servico, 'status', l.status, 'etapa', s.nome, 'marco', s.marco, 'dono_id', l.dono_id, 'titulo', l.titulo)
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

-- horários da janela com a ocupação (livre = ocupados < capacidade); até 14 dias
create or replace function public.nx_agenda_livres(p_token text, p_cliente uuid, p_a_partir date default null,
                                                   p_dias int default 7, p_servico text default null, p_negocio bigint default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  cfg jsonb; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; r jsonb;
  v_de date; v_dias int := least(greatest(coalesce(p_dias, 7), 1), 14);
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  cfg := public.nx_agenda_cfg(p_cliente);
  v_de := greatest(coalesce(p_a_partir, v_hoje), v_hoje);
  select coalesce(jsonb_agg(jsonb_build_object('inicio', public.nx_agenda_iso(s.t_inicio), 'rotulo', public.nx_agenda_rotulo(s.t_inicio),
                                               'ocupados', s.t_ocupados, 'capacidade', s.t_cap, 'livre', s.t_ocupados < s.t_cap)
                            order by s.t_inicio), '[]'::jsonb) into r
    from (select * from public.nx_agenda_slots(p_cliente, v_de, v_dias, p_servico, p_negocio) order by t_inicio limit 500) s;
  return json_build_object('fuso', 'America/Sao_Paulo', 'duracao_min', public.nx_agenda_dur(cfg, p_servico), 'horarios', r);
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
  l public.nx_leads; v_ini timestamptz := public.nx_crm_ts(jsonb_build_object('t', p_inicio), 't');
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if v_ini is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'inicio'; end if;
  select * into l from public.nx_leads where id = p_negocio and cliente_id = p_cliente;
  if l.id is null or (public.nx_crm_restrito(v) and l.dono_id is not null and l.dono_id <> v.conta_id) then
    raise exception 'negocio_nao_encontrado' using errcode = '22023';
  end if;
  return public.nx_agenda_marcar_core(p_cliente, p_negocio, v_ini, p_servico, true, coalesce(p_encaixe, false), 'painel',
                                      p_observacao, v.conta_id)::json;
end $$;

create or replace function public.nx_agenda_desmarcar(p_token text, p_cliente uuid, p_negocio bigint, p_motivo text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente'); l public.nx_leads;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  select * into l from public.nx_leads where id = p_negocio and cliente_id = p_cliente;
  if l.id is null or (public.nx_crm_restrito(v) and l.dono_id is not null and l.dono_id <> v.conta_id) then
    raise exception 'negocio_nao_encontrado' using errcode = '22023';
  end if;
  return public.nx_agenda_desmarcar_core(p_cliente, p_negocio, p_motivo, 'painel', v.conta_id)::json;
end $$;

-- ------------------------------------------------------------
-- 6. Rastreio: código curto (ANON) e atribuição na 1ª mensagem (service_role)
-- ------------------------------------------------------------
-- 5 caracteres sem I, L, O, 0 e 1 (31^5 ≈ 28 milhões por cliente)
create or replace function public.nx_rastreio_codigo_novo()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_alf constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea := extensions.gen_random_bytes(5); s text := '';
begin
  for i in 0..4 loop s := s || substr(v_alf, 1 + (get_byte(b, i) % 31), 1); end loop;
  return s;
end $$;

create or replace function public.nx_rastreio_txt(p_d jsonb, p_chave text, p_max int, p_id boolean default false)
returns text
language sql immutable
set search_path = ''
as $$
  select nullif(btrim(left(
    case when p_id then regexp_replace(coalesce(p_d ->> p_chave, ''), '[^A-Za-z0-9_.~-]+', '', 'g')
         else regexp_replace(coalesce(p_d ->> p_chave, ''), '[[:cntrl:]]+', ' ', 'g') end, p_max)), '')
$$;

-- p_dados: {utm_source, utm_medium, utm_campaign, utm_content, utm_term, gclid, gbraid, wbraid, fbclid, pagina}
-- Chave errada / cliente inativo → devolve um código qualquer SEM gravar (não revela nada).
-- Limite: 30 por minuto e 300 por hora por cliente (limite_taxa).
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
  if v_min >= 30 or v_hora >= 300 then raise exception 'limite_taxa' using errcode = '54000'; end if;
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

-- Código achado no texto da 1ª mensagem → atribuição do negócio do contato.
-- Nunca sobrescreve anúncio (plataforma, anúncio, gclid ou origem 'anuncio'); código de outro telefone é ignorado.
create or replace function public.nx_rastreio_atribuir(p_canal uuid, p_telefone text, p_codigo text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.nx_canais; a jsonb; r public.nx_rastreio; l public.nx_leads;
  v_cod text := upper(btrim(coalesce(p_codigo, '')));
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_src text; v_med text; v_camp_raw text; v_anu_raw text;
  v_paid boolean; v_plat text; v_orig text; v_camp text; v_anu text; v_camp_nome text; v_rast jsonb;
  v_meta_src constant text[] := array['facebook', 'fb', 'instagram', 'ig', 'meta', 'facebook_ads', 'meta_ads', 'fb_ads'];
  v_google_src constant text[] := array['google', 'adwords', 'googleads', 'google_ads', 'google-ads', 'gads'];
begin
  select * into k from public.nx_canais where id = p_canal and provedor = 'codewords';
  if k.id is null then raise exception 'canal_nao_encontrado' using errcode = '22023'; end if;
  if v_cod !~ '^[A-HJKMNP-Z2-9]{5}$' then return json_build_object('ok', true, 'aplicado', false, 'motivo', 'codigo_invalido'); end if;
  if length(v_tel) not between 8 and 15 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'telefone'; end if;
  select * into r from public.nx_rastreio x
   where x.cliente_id = k.cliente_id and x.codigo = v_cod and x.criado_em > now() - interval '30 days' for update;
  if r.id is null then return json_build_object('ok', true, 'aplicado', false, 'motivo', 'codigo_desconhecido'); end if;
  -- o código vale para UM telefone (o final do número ignora o 9 e o DDI)
  if r.telefone is not null and right(r.telefone, 8) <> right(v_tel, 8) then
    return json_build_object('ok', true, 'aplicado', false, 'motivo', 'codigo_ja_usado');
  end if;
  a := public.nx_codewords_alvo(p_canal, v_tel);
  if (a ->> 'negocio_id') is null then return json_build_object('ok', true, 'aplicado', false, 'motivo', 'sem_negocio'); end if;
  select * into l from public.nx_leads where id = (a ->> 'negocio_id')::bigint and cliente_id = k.cliente_id for update;
  update public.nx_rastreio set usado_em = coalesce(usado_em, now()), telefone = v_tel, negocio_id = l.id where id = r.id;
  -- o mesmo código repetido pelo mesmo telefone (a fila do fluxo reenvia): já está aplicado
  if l.rastreio ->> 'codigo' = r.codigo then
    return json_build_object('ok', true, 'aplicado', true, 'repetido', true, 'negocio_id', l.id, 'origem', l.origem, 'plataforma', l.plataforma,
      'campanha_ext', l.campanha_ext, 'anuncio_ext', l.anuncio_ext, 'gclid', l.gclid is not null);
  end if;
  if l.plataforma is not null or nullif(l.anuncio_ext, '') is not null or l.gclid is not null or l.origem = 'anuncio' then
    return json_build_object('ok', true, 'aplicado', false, 'motivo', 'ja_tem_anuncio', 'negocio_id', l.id);
  end if;
  if l.origem not in ('whatsapp', 'site') then
    return json_build_object('ok', true, 'aplicado', false, 'motivo', 'origem_definida', 'negocio_id', l.id);
  end if;

  v_src := lower(coalesce(r.utm_source, '')); v_med := lower(coalesce(r.utm_medium, ''));
  v_camp_raw := r.utm_campaign; v_anu_raw := r.utm_content;
  v_paid := v_med in ('cpc', 'ppc', 'paid', 'paidsocial', 'paid_social', 'paid-social', 'display', 'cpm', 'ads', 'ad');
  v_plat := case
    when r.gclid is not null or r.gbraid is not null or r.wbraid is not null then 'google'
    when v_src = any(v_google_src) and (v_paid or v_camp_raw is not null) then 'google'
    when (v_src = any(v_meta_src) or r.fbclid is not null) and (v_paid or (v_camp_raw is not null and v_src = any(v_meta_src))) then 'meta'
  end;
  v_orig := case when v_plat is not null or v_paid then 'anuncio'
                 when v_med in ('organic', 'organico', 'orgânico', 'seo') then 'organico'
                 else 'site' end;

  if v_plat is not null then
    if v_camp_raw is not null then
      select m.campanha_ext, m.campanha_nome into v_camp, v_camp_nome from public.nx_metricas_dia m
       where m.cliente_id = k.cliente_id and m.plataforma = v_plat
         and (m.campanha_ext = v_camp_raw or lower(m.campanha_nome) = lower(v_camp_raw))
       order by (m.campanha_ext = v_camp_raw) desc, m.data desc limit 1;
      v_camp := coalesce(v_camp, left(v_camp_raw, 100));
    end if;
    if v_anu_raw is not null then
      select m.anuncio_ext into v_anu from public.nx_metricas_dia m
       where m.cliente_id = k.cliente_id and m.plataforma = v_plat and m.nivel = 'anuncio' and m.anuncio_ext <> ''
         and (m.anuncio_ext = v_anu_raw or lower(m.anuncio_nome) = lower(v_anu_raw))
         and (v_camp is null or m.campanha_ext = v_camp)
       order by (m.anuncio_ext = v_anu_raw) desc, m.data desc limit 1;
      v_anu := coalesce(v_anu, left(v_anu_raw, 100));
    end if;
  end if;

  v_rast := jsonb_strip_nulls(jsonb_build_object('codigo', r.codigo, 'utm_source', r.utm_source, 'utm_medium', r.utm_medium,
    'utm_campaign', r.utm_campaign, 'utm_content', r.utm_content, 'utm_term', r.utm_term, 'gbraid', r.gbraid, 'wbraid', r.wbraid,
    'fbclid', r.fbclid, 'pagina', r.pagina, 'clique_em', r.criado_em));
  update public.nx_leads x set origem = v_orig, plataforma = v_plat, campanha_ext = coalesce(v_camp, x.campanha_ext),
    anuncio_ext = coalesce(v_anu, x.anuncio_ext), gclid = coalesce(r.gclid, x.gclid), rastreio = v_rast, atualizado_em = now()
  where x.id = l.id;
  -- contato: 1º toque (só preenche o vazio; a origem padrão 'whatsapp' vira a real)
  update public.nx_contatos c set
    origem = case when c.origem = 'whatsapp' then v_orig else c.origem end,
    plataforma = coalesce(c.plataforma, v_plat), campanha_ext = coalesce(c.campanha_ext, v_camp),
    anuncio_ext = coalesce(c.anuncio_ext, v_anu)
  where c.id = l.contato_id and c.cliente_id = k.cliente_id;
  return json_build_object('ok', true, 'aplicado', true, 'negocio_id', l.id, 'origem', v_orig, 'plataforma', v_plat,
    'campanha_ext', v_camp, 'campanha_nome', v_camp_nome, 'anuncio_ext', v_anu, 'gclid', r.gclid is not null);
end $$;

-- ------------------------------------------------------------
-- 7. Contexto da IA e "origem" (substituem as versões de 20260929a): a origem do negócio
--    passa a mostrar também o rastreio do site; a IA não sobrescreve anúncio nem gclid.
-- ------------------------------------------------------------
create or replace function public.nx_codewords_dados(p_canal uuid, p_telefone text)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  k public.nx_canais; c public.nx_clientes; a jsonb; ct public.nx_contatos; cv public.nx_conversas;
  l public.nx_leads; e public.nx_estagios; v_hist jsonb := '[]'::jsonb; v_dep jsonb; v_prim boolean := true;
begin
  select * into k from public.nx_canais where id = p_canal and provedor = 'codewords';
  if k.id is null then raise exception 'canal_nao_encontrado' using errcode = '22023'; end if;
  a := public.nx_codewords_alvo(p_canal, p_telefone);
  select * into c from public.nx_clientes where id = k.cliente_id;
  if (a ->> 'contato_id') is not null then
    select * into ct from public.nx_contatos where id = (a ->> 'contato_id')::bigint and cliente_id = k.cliente_id;
  end if;
  if (a ->> 'conversa_id') is not null then
    select * into cv from public.nx_conversas where id = (a ->> 'conversa_id')::bigint and cliente_id = k.cliente_id;
  end if;
  if (a ->> 'negocio_id') is not null then
    select * into l from public.nx_leads where id = (a ->> 'negocio_id')::bigint and cliente_id = k.cliente_id;
    select * into e from public.nx_estagios where id = l.estagio_id and cliente_id = k.cliente_id;
  end if;
  -- horário do departamento do canal (ou o padrão): a IA usa quando o texto de horários está vazio
  select d.horario into v_dep from public.nx_departamentos d
   where d.cliente_id = k.cliente_id and d.ativo and (d.id = k.departamento_id or d.padrao)
   order by (d.id = k.departamento_id) desc limit 1;
  if ct.id is not null then
    v_prim := (select count(*) from (select 1 from public.nx_mensagens m
                 where m.contato_id = ct.id and m.cliente_id = k.cliente_id and m.direcao = 'in' limit 2) z) <= 1;
    -- últimas 20 mensagens do contato (sem notas internas e avisos do sistema), da mais antiga para a mais nova
    select coalesce(jsonb_agg(h.j order by h.id), '[]'::jsonb) into v_hist from (
      select m.id, jsonb_build_object('dir', m.direcao, 'origem', m.origem, 'humano', m.enviado_por is not null,
               'tipo', m.tipo, 'texto', left(coalesce(m.corpo, ''), 1500), 'midia_nome', m.midia ->> 'nome',
               'em', m.criado_em) as j
        from public.nx_mensagens m
       where m.contato_id = ct.id and m.cliente_id = k.cliente_id and m.tipo not in ('nota', 'sistema')
       order by m.id desc limit 20) h;
  end if;
  return json_build_object(
    'agora', now(),
    'empresa', jsonb_build_object('nome', c.nome, 'vertical', c.vertical,
      'ia', case when jsonb_typeof(c.cfg -> 'ia') = 'object' then c.cfg -> 'ia' else '{}'::jsonb end,
      'horario_departamento', v_dep),
    'canal', jsonb_build_object('id', k.id, 'numero', k.codewords_numero, 'ia_ligada', k.ia_ligada),
    'contato', jsonb_build_object('id', ct.id, 'nome', ct.nome,
      'telefone', coalesce(ct.wa_id, ct.telefone, a ->> 'telefone'), 'primeira_vez', v_prim,
      'bloqueado', coalesce(ct.bloqueado, false), 'optin_marketing', ct.optin_marketing),
    'conversa', case when cv.id is not null then jsonb_build_object('id', cv.id, 'protocolo', cv.protocolo,
      'status', cv.status, 'ia_pausada', coalesce(cv.ia_pausada_ate > now(), false)) end,
    'negocio', case when l.id is not null then jsonb_build_object('id', l.id, 'titulo', l.titulo,
      'etapa', e.nome, 'marco', e.marco, 'status', l.status, 'consulta_em', l.consulta_em, 'servico', l.servico,
      'origem', l.origem, 'plataforma', l.plataforma, 'campanha_ext', l.campanha_ext, 'anuncio_ext', l.anuncio_ext,
      'gclid', l.gclid is not null,
      'rastreio', case when l.rastreio is not null then jsonb_strip_nulls(jsonb_build_object(
        'utm_source', l.rastreio ->> 'utm_source', 'utm_medium', l.rastreio ->> 'utm_medium',
        'utm_campaign', l.rastreio ->> 'utm_campaign', 'pagina', l.rastreio ->> 'pagina')) end,
      'campanha_nome', (select m.campanha_nome from public.nx_metricas_dia m
                         where m.cliente_id = k.cliente_id and m.plataforma = l.plataforma
                           and m.campanha_ext = l.campanha_ext and m.campanha_nome is not null
                         order by m.data desc limit 1),
      'anuncio_nome', (select m.anuncio_nome from public.nx_metricas_dia m
                        where m.cliente_id = k.cliente_id and m.plataforma = l.plataforma
                          and l.anuncio_ext is not null and m.anuncio_ext = l.anuncio_ext and m.anuncio_nome is not null
                        order by m.data desc limit 1)) end,
    'historico', v_hist);
end $$;

create or replace function public.nx_codewords_origem(p_canal uuid, p_telefone text, p_origem text, p_detalhe text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare a jsonb; l public.nx_leads; v_canon text; v_rot text;
        v_det text := left(nullif(btrim(coalesce(p_detalhe, '')), ''), 200);
begin
  if p_origem is null or p_origem not in ('google', 'instagram', 'facebook', 'indicacao', 'site', 'outro') then
    return json_build_object('ok', false, 'erro', 'origem_invalida');
  end if;
  a := public.nx_codewords_alvo(p_canal, p_telefone);
  if (a ->> 'contato_id') is null then return json_build_object('ok', false, 'erro', 'contato_nao_encontrado'); end if;
  v_canon := case p_origem when 'indicacao' then 'indicacao' when 'site' then 'site' else 'organico' end;
  v_rot := case p_origem when 'google' then 'Google' when 'instagram' then 'Instagram' when 'facebook' then 'Facebook'
                         when 'indicacao' then 'Indicação' when 'site' then 'Site' else 'Outro' end;
  if (a ->> 'negocio_id') is not null then
    select * into l from public.nx_leads where id = (a ->> 'negocio_id')::bigint and cliente_id = (a ->> 'cliente_id')::uuid
     for update;
    -- atribuição de anúncio (CTWA, utm/gclid do site) vale mais do que o que o cliente conta
    if l.plataforma is not null or nullif(l.anuncio_ext, '') is not null or l.gclid is not null or l.origem = 'anuncio' then
      return json_build_object('ok', true, 'aplicado', false, 'motivo', 'ja_tem_anuncio');
    end if;
    update public.nx_leads set origem = v_canon, atualizado_em = now() where id = l.id;
  end if;
  update public.nx_contatos set origem = v_canon
   where id = (a ->> 'contato_id')::bigint and cliente_id = (a ->> 'cliente_id')::uuid
     and plataforma is null and origem = 'whatsapp';
  insert into public.nx_notas (cliente_id, contato_id, negocio_id, texto)
  values ((a ->> 'cliente_id')::uuid, (a ->> 'contato_id')::bigint, l.id,
          'Origem contada à IA: ' || v_rot || coalesce(' — ' || v_det, ''));
  return json_build_object('ok', true, 'aplicado', true, 'origem', v_canon, 'negocio_id', l.id);
end $$;

-- ------------------------------------------------------------
-- 8. Permissões: painel → anon/authenticated/service_role (token vai no corpo); rastreio_registrar → anon;
--    o resto só service_role
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'nx_agenda_rotulo', 'nx_agenda_iso', 'nx_agenda_faixas_ok', 'nx_agenda_horario_ok', 'nx_agenda_cfg', 'nx_agenda_dur',
         'nx_agenda_slots', 'nx_agenda_checar', 'nx_agenda_sugestoes', 'nx_agenda_negocio_do_contato',
         'nx_agenda_marcar_core', 'nx_agenda_desmarcar_core', 'nx_agenda_livres_ia', 'nx_agenda_marcar_ia',
         'nx_agenda_desmarcar_ia', 'nx_agenda_bloqueios_json', 'nx_rastreio_codigo_novo', 'nx_rastreio_txt',
         'nx_rastreio_atribuir', 'nx_codewords_dados', 'nx_codewords_origem',
         'nx_agenda_config_ver', 'nx_agenda_config_salvar', 'nx_agenda_bloqueio_salvar', 'nx_agenda_bloqueio_excluir',
         'nx_agenda_dia', 'nx_agenda_livres', 'nx_agenda_marcar', 'nx_agenda_desmarcar', 'nx_rastreio_registrar')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    if r.proname in ('nx_agenda_config_ver', 'nx_agenda_config_salvar', 'nx_agenda_bloqueio_salvar', 'nx_agenda_bloqueio_excluir',
                     'nx_agenda_dia', 'nx_agenda_livres', 'nx_agenda_marcar', 'nx_agenda_desmarcar', 'nx_rastreio_registrar') then
      execute format('grant execute on function %s to anon, authenticated, service_role', r.fn);
    else
      execute format('grant execute on function %s to service_role', r.fn);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
