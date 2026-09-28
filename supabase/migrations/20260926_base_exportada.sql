-- ============================================================
-- NEXUS ADS — 20260926_base_exportada.sql
-- Retrato do esquema do banco (projeto dtjznipitihnwmcgpzqh) ANTES do SaaS
-- Órbita, exportado em 28/09/2026 por leitura do catálogo
-- (pg_get_functiondef, pg_get_constraintdef, pg_get_indexdef, cron.job).
--
-- Corresponde às migrações já aplicadas no banco:
--   20260927040936 nx_esquema_base · 20260927041039 nx_rpcs ·
--   20260927041053 nx_agenda · 20260928001829 nx_melhorias_entrega_trava_lead
--   (esta última = supabase/migrations/20260927_melhorias.sql)
--
-- ATENÇÃO: este arquivo existe para recriar o banco do ZERO (projeto novo)
-- e para documentar o ponto de partida. NÃO aplicar no banco atual depois
-- das migrações 20260928a/b: as funções abaixo são as versões ANTIGAS
-- (sem nx_ctx) e o create or replace voltaria o comportamento de antes.
-- Ordem para um projeto novo: este arquivo → 20260927_melhorias.sql →
-- 20260928a_saas_base.sql → 20260928b_saas_acesso.sql → c..h.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create extension if not exists supabase_vault with schema vault;

-- ------------------------------------------------------------
-- Tabelas
-- ------------------------------------------------------------
create table if not exists public.nx_config (
  id integer default 1 not null,
  cron_token text default encode(extensions.gen_random_bytes(24), 'hex'::text) not null,
  codigo_gestor text default upper(encode(extensions.gen_random_bytes(4), 'hex'::text)) not null,
  funcoes_url text,
  painel_url text,
  wa_access_token text,
  wa_phone_number_id text,
  wa_template text,
  wa_verify_token text default encode(extensions.gen_random_bytes(12), 'hex'::text) not null,
  meta_app_secret text,
  anthropic_api_key text,
  modelo_ia text default 'claude-opus-5'::text not null,
  google_api_versao text,
  atualizado_em timestamp with time zone default now() not null,
  constraint nx_config_pkey PRIMARY KEY (id),
  constraint nx_config_id_check CHECK ((id = 1))
);
insert into public.nx_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.nx_clientes (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  nome text not null,
  ativo boolean default true not null,
  cfg jsonb default '{}'::jsonb not null,
  wa_phone_number_id text,
  criado_em timestamp with time zone default now() not null,
  constraint nx_clientes_slug_key UNIQUE (slug),
  constraint nx_clientes_wa_phone_number_id_key UNIQUE (wa_phone_number_id),
  constraint nx_clientes_pkey PRIMARY KEY (id),
  constraint nx_clientes_slug_check CHECK ((slug ~ '^[a-z0-9-]{2,40}$'::text))
);

create table if not exists public.nx_contas (
  id uuid default gen_random_uuid() not null,
  email text not null,
  nome text not null,
  senha_hash text not null,
  papel text default 'clinica'::text not null,
  aprovado boolean default false not null,
  criado_em timestamp with time zone default now() not null,
  constraint nx_contas_email_key UNIQUE (email),
  constraint nx_contas_pkey PRIMARY KEY (id),
  constraint nx_contas_papel_check CHECK ((papel = ANY (ARRAY['gestor'::text, 'clinica'::text])))
);

create table if not exists public.nx_sessoes (
  token_hash text not null,
  conta_id uuid not null,
  expira_em timestamp with time zone not null,
  criado_em timestamp with time zone default now() not null,
  constraint nx_sessoes_pkey PRIMARY KEY (token_hash),
  constraint nx_sessoes_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.nx_contas(id) ON DELETE CASCADE
);

create table if not exists public.nx_acessos (
  conta_id uuid not null,
  cliente_id uuid not null,
  constraint nx_acessos_pkey PRIMARY KEY (conta_id, cliente_id),
  constraint nx_acessos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.nx_clientes(id) ON DELETE CASCADE,
  constraint nx_acessos_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.nx_contas(id) ON DELETE CASCADE
);

create table if not exists public.nx_integracoes (
  id uuid default gen_random_uuid() not null,
  cliente_id uuid not null,
  canal text not null,
  ativo boolean default true not null,
  cred jsonb default '{}'::jsonb not null,
  ultimo_sync timestamp with time zone,
  status text,
  constraint nx_integracoes_cliente_id_canal_key UNIQUE (cliente_id, canal),
  constraint nx_integracoes_pkey PRIMARY KEY (id),
  constraint nx_integracoes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.nx_clientes(id) ON DELETE CASCADE,
  constraint nx_integracoes_canal_check CHECK ((canal = ANY (ARRAY['meta'::text, 'google'::text])))
);

create table if not exists public.nx_metricas_dia (
  cliente_id uuid not null,
  plataforma text not null,
  data date not null,
  nivel text not null,
  campanha_ext text not null,
  campanha_nome text,
  anuncio_ext text default ''::text not null,
  anuncio_nome text,
  impressoes bigint default 0 not null,
  alcance bigint default 0 not null,
  frequencia numeric default 0 not null,
  cliques bigint default 0 not null,
  gasto numeric(12,2) default 0 not null,
  conversoes numeric default 0 not null,
  valor_conversao numeric(12,2) default 0 not null,
  atualizado_em timestamp with time zone default now() not null,
  constraint nx_metricas_dia_pkey PRIMARY KEY (cliente_id, plataforma, nivel, data, campanha_ext, anuncio_ext),
  constraint nx_metricas_dia_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.nx_clientes(id) ON DELETE CASCADE,
  constraint nx_metricas_dia_nivel_check CHECK ((nivel = ANY (ARRAY['campanha'::text, 'anuncio'::text]))),
  constraint nx_metricas_dia_plataforma_check CHECK ((plataforma = ANY (ARRAY['meta'::text, 'google'::text])))
);

create table if not exists public.nx_leads (
  id bigint generated always as identity not null,
  cliente_id uuid not null,
  telefone text,
  nome text,
  origem text default 'whatsapp'::text not null,
  plataforma text,
  campanha_ext text,
  anuncio_ext text,
  ctwa_clid text,
  servico text,
  etapa text default 'nova'::text not null,
  data_conversa date default ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date not null,
  data_agenda date,
  data_consulta date,
  valor numeric(12,2),
  obs text,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  constraint nx_leads_pkey PRIMARY KEY (id),
  constraint nx_leads_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.nx_clientes(id) ON DELETE CASCADE,
  constraint nx_leads_etapa_check CHECK ((etapa = ANY (ARRAY['nova'::text, 'agendada'::text, 'orcamento'::text, 'fechou'::text, 'nao_fechou'::text, 'faltou'::text, 'perdida'::text]))),
  constraint nx_leads_plataforma_check CHECK ((plataforma = ANY (ARRAY['meta'::text, 'google'::text])))
);

create table if not exists public.nx_alertas (
  id bigint generated always as identity not null,
  cliente_id uuid not null,
  chave text not null,
  regra text not null,
  severidade text not null,
  mensagem text not null,
  acao text,
  valor numeric,
  referencia date not null,
  criado_em timestamp with time zone default now() not null,
  enviado_em timestamp with time zone,
  erro_envio text,
  wa_ids text[] default '{}'::text[] not null,
  wa_ids_template text[] default '{}'::text[] not null,
  entregue_em timestamp with time zone,
  constraint nx_alertas_pkey PRIMARY KEY (id),
  constraint nx_alertas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.nx_clientes(id) ON DELETE CASCADE,
  constraint nx_alertas_severidade_check CHECK ((severidade = ANY (ARRAY['critico'::text, 'alerta'::text, 'info'::text])))
);

create table if not exists public.nx_relatorios (
  id bigint generated always as identity not null,
  cliente_id uuid not null,
  tipo text not null,
  referencia date not null,
  texto text not null,
  leitura_ia text,
  destinos text[] default '{}'::text[] not null,
  enviado_em timestamp with time zone,
  erro text,
  criado_em timestamp with time zone default now() not null,
  wa_ids text[] default '{}'::text[] not null,
  wa_ids_template text[] default '{}'::text[] not null,
  entregue_em timestamp with time zone,
  constraint nx_relatorios_cliente_id_tipo_referencia_key UNIQUE (cliente_id, tipo, referencia),
  constraint nx_relatorios_pkey PRIMARY KEY (id),
  constraint nx_relatorios_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.nx_clientes(id) ON DELETE CASCADE,
  constraint nx_relatorios_tipo_check CHECK ((tipo = ANY (ARRAY['diario'::text, 'mensal'::text])))
);

create table if not exists public.nx_execucoes (
  id bigint generated always as identity not null,
  tarefa text not null,
  inicio timestamp with time zone default now() not null,
  fim timestamp with time zone,
  ok boolean,
  resumo jsonb,
  constraint nx_execucoes_pkey PRIMARY KEY (id)
);

create table if not exists public.nx_travas (
  nome text not null,
  ate timestamp with time zone not null,
  dono text,
  constraint nx_travas_pkey PRIMARY KEY (nome)
);

-- ------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------
create index if not exists nx_alertas_cliente on public.nx_alertas using btree (cliente_id, criado_em desc);
create index if not exists nx_alertas_wa_ids on public.nx_alertas using gin (wa_ids);
create index if not exists nx_alertas_wa_ids_template on public.nx_alertas using gin (wa_ids_template);
create index if not exists nx_leads_cliente_data on public.nx_leads using btree (cliente_id, data_conversa);
create index if not exists nx_leads_cliente_tel on public.nx_leads using btree (cliente_id, telefone);
create index if not exists nx_metricas_cliente_data on public.nx_metricas_dia using btree (cliente_id, data);
create index if not exists nx_relatorios_wa_ids on public.nx_relatorios using gin (wa_ids);
create index if not exists nx_relatorios_wa_ids_template on public.nx_relatorios using gin (wa_ids_template);

-- ------------------------------------------------------------
-- RLS ligado e SEM política em todas: só as RPCs security definer
-- (e a service_role das Edge Functions) enxergam os dados.
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['nx_config','nx_clientes','nx_contas','nx_sessoes','nx_acessos','nx_integracoes',
                           'nx_metricas_dia','nx_leads','nx_alertas','nx_relatorios','nx_execucoes','nx_travas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete, truncate, references, trigger on table public.%I to service_role', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- Funções (texto de pg_get_functiondef em 28/09/2026)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nx_hash(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select encode(extensions.digest(coalesce(p, ''), 'sha256'), 'hex')
$function$;

CREATE OR REPLACE FUNCTION public.nx_conta_do_token(p_token text)
 RETURNS nx_contas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare c public.nx_contas;
begin
  select ct.* into c
    from public.nx_sessoes s join public.nx_contas ct on ct.id = s.conta_id
   where s.token_hash = public.nx_hash(p_token) and s.expira_em > now();
  if c.id is null then raise exception 'sessao_invalida' using errcode = '28000'; end if;
  if not c.aprovado then raise exception 'conta_pendente' using errcode = '28000'; end if;
  return c;
end $function$;

CREATE OR REPLACE FUNCTION public.nx_exigir_gestor(p_token text)
 RETURNS nx_contas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.nx_contas := public.nx_conta_do_token(p_token);
begin
  if c.papel <> 'gestor' then raise exception 'so_gestor' using errcode = '42501'; end if;
  return c;
end $function$;

CREATE OR REPLACE FUNCTION public.nx_pode(p_conta nx_contas, p_cliente uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p_conta.papel = 'gestor'
      or exists (select 1 from public.nx_acessos a where a.conta_id = p_conta.id and a.cliente_id = p_cliente)
$function$;

CREATE OR REPLACE FUNCTION public.nx_criar_conta(p_email text, p_senha text, p_nome text, p_codigo text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_primeira boolean; v_codigo text;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido'; end if;
  if length(coalesce(p_senha, '')) < 8 then raise exception 'senha_curta'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'nome_invalido'; end if;
  perform pg_advisory_xact_lock(hashtext('nx_criar_conta'));
  select not exists (select 1 from public.nx_contas) into v_primeira;
  if exists (select 1 from public.nx_contas where email = v_email) then raise exception 'email_em_uso'; end if;
  if v_primeira then
    -- a PRIMEIRA conta vira gestor, mas só com o código de ativação:
    -- quem achar a URL antes do dono não vira dono
    select codigo_gestor into v_codigo from public.nx_config where id = 1;
    if upper(trim(coalesce(p_codigo, ''))) <> v_codigo then raise exception 'codigo_invalido'; end if;
  end if;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado)
  values (v_email, trim(p_nome), crypt(p_senha, gen_salt('bf', 10)),
          case when v_primeira then 'gestor' else 'clinica' end, v_primeira);
  return json_build_object('ok', true, 'papel', case when v_primeira then 'gestor' else 'clinica' end, 'aprovado', v_primeira);
end $function$;

CREATE OR REPLACE FUNCTION public.nx_entrar(p_email text, p_senha text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare c public.nx_contas; v_token text;
begin
  select * into c from public.nx_contas where email = lower(trim(coalesce(p_email, '')));
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

CREATE OR REPLACE FUNCTION public.nx_sair(p_token text)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  delete from public.nx_sessoes where token_hash = public.nx_hash(p_token);
  select json_build_object('ok', true);
$function$;

CREATE OR REPLACE FUNCTION public.nx_sessao(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.nx_contas := public.nx_conta_do_token(p_token);
begin
  return json_build_object(
    'conta', json_build_object('id', c.id, 'nome', c.nome, 'email', c.email, 'papel', c.papel),
    'clientes', coalesce((
      select json_agg(json_build_object('id', x.id, 'slug', x.slug, 'nome', x.nome, 'ativo', x.ativo, 'cfg', x.cfg) order by x.nome)
        from public.nx_clientes x where public.nx_pode(c, x.id)), '[]'::json));
end $function$;

CREATE OR REPLACE FUNCTION public.nx_contas_listar(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.nx_contas := public.nx_exigir_gestor(p_token);
begin
  return coalesce((
    select json_agg(json_build_object('id', x.id, 'nome', x.nome, 'email', x.email, 'papel', x.papel, 'aprovado', x.aprovado,
             'criado_em', x.criado_em,
             'clientes', coalesce((select json_agg(a.cliente_id) from public.nx_acessos a where a.conta_id = x.id), '[]'::json))
             order by x.aprovado, x.criado_em desc)
      from public.nx_contas x), '[]'::json);
end $function$;

CREATE OR REPLACE FUNCTION public.nx_conta_definir(p_token text, p_conta uuid, p_aprovado boolean, p_papel text, p_clientes uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.nx_contas := public.nx_exigir_gestor(p_token);
begin
  if p_conta = c.id and (p_papel <> 'gestor' or p_aprovado is false) then raise exception 'nao_pode_rebaixar_a_si'; end if;
  if p_papel not in ('gestor', 'clinica') then raise exception 'papel_invalido'; end if;
  update public.nx_contas set aprovado = coalesce(p_aprovado, aprovado), papel = p_papel where id = p_conta;
  delete from public.nx_acessos where conta_id = p_conta;
  insert into public.nx_acessos (conta_id, cliente_id) select p_conta, unnest(coalesce(p_clientes, '{}'::uuid[])) on conflict do nothing;
  if p_aprovado is false then delete from public.nx_sessoes where conta_id = p_conta; end if;
  return public.nx_contas_listar(p_token);
end $function$;

CREATE OR REPLACE FUNCTION public.nx_cliente_salvar(p_token text, p_cliente jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.nx_contas := public.nx_exigir_gestor(p_token); v_id uuid := nullif(p_cliente->>'id', '')::uuid; r public.nx_clientes;
begin
  if v_id is null then
    insert into public.nx_clientes (slug, nome, cfg, wa_phone_number_id)
    values (lower(trim(p_cliente->>'slug')), trim(p_cliente->>'nome'),
            coalesce(p_cliente->'cfg', '{}'::jsonb), nullif(trim(coalesce(p_cliente->>'wa_phone_number_id', '')), ''))
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

CREATE OR REPLACE FUNCTION public.nx_config_ver(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.nx_contas := public.nx_exigir_gestor(p_token); cfg public.nx_config;
begin
  select * into cfg from public.nx_config where id = 1;
  return json_build_object(
    'webhook_url', cfg.funcoes_url || '/nx-whatsapp',
    'wa_verify_token', cfg.wa_verify_token,
    'painel_url', cfg.painel_url,
    'modelo_ia', cfg.modelo_ia,
    'wa_template', cfg.wa_template,
    'wa_phone_number_id', cfg.wa_phone_number_id,
    'google_api_versao', cfg.google_api_versao,
    'tem_wa_token', cfg.wa_access_token is not null,
    'tem_app_secret', cfg.meta_app_secret is not null,
    'tem_ia', cfg.anthropic_api_key is not null,
    'ultimas_execucoes', coalesce((
      select json_agg(row_to_json(e) order by e.inicio desc)
        from (select tarefa, inicio, fim, ok, resumo from public.nx_execucoes order by inicio desc limit 8) e), '[]'::json));
end $function$;

CREATE OR REPLACE FUNCTION public.nx_config_salvar(p_token text, p_cfg jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.nx_contas := public.nx_exigir_gestor(p_token);
  f text := '';
begin
  update public.nx_config set
    wa_access_token    = coalesce(nullif(p_cfg->>'wa_access_token', ''), wa_access_token),
    wa_phone_number_id = case when p_cfg ? 'wa_phone_number_id' then nullif(p_cfg->>'wa_phone_number_id', '') else wa_phone_number_id end,
    wa_template        = case when p_cfg ? 'wa_template' then nullif(p_cfg->>'wa_template', '') else wa_template end,
    meta_app_secret    = coalesce(nullif(p_cfg->>'meta_app_secret', ''), meta_app_secret),
    anthropic_api_key  = coalesce(nullif(p_cfg->>'anthropic_api_key', ''), anthropic_api_key),
    modelo_ia          = coalesce(nullif(p_cfg->>'modelo_ia', ''), modelo_ia),
    painel_url         = case when p_cfg ? 'painel_url' then nullif(p_cfg->>'painel_url', '') else painel_url end,
    google_api_versao  = case when p_cfg ? 'google_api_versao' then nullif(p_cfg->>'google_api_versao', '') else google_api_versao end,
    atualizado_em      = now()
  where id = 1;
  return public.nx_config_ver(p_token);
end $function$;

CREATE OR REPLACE FUNCTION public.nx_integracoes_status(p_token text, p_cliente uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.nx_contas := public.nx_conta_do_token(p_token);
begin
  if not public.nx_pode(c, p_cliente) then raise exception 'sem_acesso' using errcode = '42501'; end if;
  return coalesce((
    select json_agg(json_build_object(
      'canal', i.canal, 'ativo', i.ativo, 'ultimo_sync', i.ultimo_sync, 'status', i.status,
      'preenchidos', (select coalesce(json_agg(k.key), '[]'::json) from jsonb_each(i.cred) k where k.value <> '""'::jsonb)))
      from public.nx_integracoes i where i.cliente_id = p_cliente), '[]'::json);
end $function$;

CREATE OR REPLACE FUNCTION public.nx_integracao_salvar(p_token text, p_cliente uuid, p_canal text, p_cred jsonb, p_ativo boolean DEFAULT true)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.nx_contas := public.nx_exigir_gestor(p_token); v_novo jsonb;
begin
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_novo
    from jsonb_each(coalesce(p_cred, '{}'::jsonb)) where value <> '""'::jsonb and value <> 'null'::jsonb;
  insert into public.nx_integracoes (cliente_id, canal, ativo, cred) values (p_cliente, p_canal, coalesce(p_ativo, true), v_novo)
  on conflict (cliente_id, canal) do update set cred = public.nx_integracoes.cred || excluded.cred, ativo = excluded.ativo;
  return public.nx_integracoes_status(p_token, p_cliente);
end $function$;

CREATE OR REPLACE FUNCTION public.nx_lead_salvar(p_token text, p_cliente uuid, p_lead jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.nx_contas := public.nx_conta_do_token(p_token);
  v_id bigint := nullif(p_lead->>'id', '')::bigint;
  r public.nx_leads;
begin
  if not public.nx_pode(c, p_cliente) then raise exception 'sem_acesso' using errcode = '42501'; end if;
  if v_id is null then
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

CREATE OR REPLACE FUNCTION public.nx_disparar(p_funcao text, p_corpo jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare cfg public.nx_config; v_id bigint;
begin
  if p_funcao not in ('nx-ciclo', 'nx-relatorio') then raise exception 'funcao_invalida'; end if;
  select * into cfg from public.nx_config where id = 1;
  if cfg.funcoes_url is null then raise exception 'funcoes_url_nao_configurada'; end if;
  select net.http_post(
    url := cfg.funcoes_url || '/' || p_funcao,
    body := coalesce(p_corpo, '{}'::jsonb),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-nx-cron', cfg.cron_token),
    timeout_milliseconds := 120000
  ) into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.nx_executar(p_token text, p_tarefa text, p_corpo jsonb DEFAULT '{}'::jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.nx_contas := public.nx_exigir_gestor(p_token); v_id bigint;
begin
  v_id := public.nx_disparar(p_tarefa, coalesce(p_corpo, '{}'::jsonb));
  return json_build_object('ok', true, 'pedido', v_id);
end $function$;

-- nx_dados, nx_lead_webhook, nx_wa_anotar, nx_trava_pegar e nx_trava_soltar:
-- o texto no banco em 28/09/2026 é EXATAMENTE o de 20260927_melhorias.sql
-- (aplicar aquele arquivo depois deste).

-- ------------------------------------------------------------
-- Permissões das funções
-- ------------------------------------------------------------
do $$
declare f text;
begin
  -- painel (chave pública)
  foreach f in array array[
    'public.nx_criar_conta(text,text,text,text)', 'public.nx_entrar(text,text)', 'public.nx_sair(text)',
    'public.nx_sessao(text)', 'public.nx_contas_listar(text)', 'public.nx_conta_definir(text,uuid,boolean,text,uuid[])',
    'public.nx_cliente_salvar(text,jsonb)', 'public.nx_config_ver(text)', 'public.nx_config_salvar(text,jsonb)',
    'public.nx_integracoes_status(text,uuid)', 'public.nx_integracao_salvar(text,uuid,text,jsonb,boolean)',
    'public.nx_lead_salvar(text,uuid,jsonb)', 'public.nx_executar(text,text,jsonb)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
  -- internas (só Edge Functions / cron)
  foreach f in array array[
    'public.nx_hash(text)', 'public.nx_conta_do_token(text)', 'public.nx_exigir_gestor(text)',
    'public.nx_pode(public.nx_contas,uuid)', 'public.nx_disparar(text,jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ------------------------------------------------------------
-- Agenda (pg_cron) — como está no banco
-- ------------------------------------------------------------
-- select cron.schedule('nx-ciclo', '7 * * * *', $$select public.nx_disparar('nx-ciclo', '{}'::jsonb)$$);
-- select cron.schedule('nx-relatorio-diario', '0 11 * * *', $$select public.nx_disparar('nx-relatorio', '{"tipo":"diario"}'::jsonb)$$);
-- select cron.schedule('nx-relatorio-mensal', '0 12 1 * *', $$select public.nx_disparar('nx-relatorio', '{"tipo":"mensal"}'::jsonb)$$);
-- select cron.schedule('nx-faxina', '30 6 * * *', $$
--   delete from public.nx_sessoes where expira_em < now();
--   delete from public.nx_execucoes where inicio < now() - interval '60 days';
--   delete from net._http_response where created < now() - interval '3 days';
-- $$);
-- (comentado: num projeto novo, rodar depois de gravar nx_config.funcoes_url)
