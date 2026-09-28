-- ============================================================
-- ÓRBITA (SaaS da Nexus) — 20260928a_saas_base.sql · frente F1
-- Banco-base de TODOS os módulos (ESPEC v1.1 §4.1–§4.10 e §4.12):
--   extensões e bucket · plataforma e acesso · CRM · Conversas ·
--   automações e fila · sementes · utilitárias · nx_ctx · gatilhos ·
--   backfill.
--
-- Regras: só ACRESCENTA (nenhuma tabela/coluna/função existente some ou
-- muda de nome); idempotente (pode rodar de novo sem erro nem efeito);
-- toda tabela nova com RLS ligado, SEM política e sem acesso para
-- anon/authenticated (só as RPCs security definer e a service_role).
-- As mudanças nas RPCs antigas ficam no arquivo b (20260928b_saas_acesso.sql).
-- ============================================================

-- ------------------------------------------------------------
-- 4.1 Extensões e bucket
-- ------------------------------------------------------------
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

insert into storage.buckets (id, name, public, file_size_limit)
values ('nx-midia', 'nx-midia', false, 16777216) on conflict (id) do nothing;
-- sem políticas em storage.objects: só a service_role (Edge Functions) lê/grava.

-- ------------------------------------------------------------
-- 4.2 Plataforma e acesso
-- ------------------------------------------------------------
create table if not exists public.nx_orgs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  nome text not null check (char_length(nome) between 2 and 80),
  tipo text not null check (tipo in ('plataforma','revenda')),
  marca jsonb not null default '{}'::jsonb,
  limites jsonb not null default '{}'::jsonb,
  status text not null default 'ativo' check (status in ('ativo','suspenso')),
  criado_em timestamptz not null default now()
);
create unique index if not exists nx_orgs_uma_plataforma on public.nx_orgs ((true)) where tipo = 'plataforma';

create table if not exists public.nx_planos (
  id text primary key check (id ~ '^[a-z0-9_]{2,30}$'),
  nome text not null,
  preco_mensal numeric(10,2),
  limites jsonb not null default '{}'::jsonb,
  modulos text[] not null default '{}',
  ordem int not null default 0,
  ativo boolean not null default true
);

alter table public.nx_clientes
  add column if not exists org_id uuid references public.nx_orgs(id),
  add column if not exists plano text references public.nx_planos(id),
  add column if not exists status text not null default 'ativo'
      check (status in ('ativo','teste','suspenso','cancelado')),
  add column if not exists teste_ate date,
  add column if not exists limites jsonb not null default '{}'::jsonb,
  add column if not exists modulos text[] not null default '{crm,conversas,relatorios,ads,automacoes,marca}',
  add column if not exists vertical text not null default 'odonto'
      check (vertical in ('odonto','oficina','loja','generico')),
  add column if not exists tema jsonb not null default '{}'::jsonb,
  add column if not exists entrada_chave text unique;
create index if not exists nx_clientes_org on public.nx_clientes(org_id);

create table if not exists public.nx_dominios (
  host text primary key check (host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' and host = lower(host)),
  org_id uuid not null references public.nx_orgs(id) on delete cascade,
  cliente_id uuid references public.nx_clientes(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente','ativo')),
  criado_em timestamptz not null default now(),
  ativado_em timestamptz
);
create index if not exists nx_dominios_org on public.nx_dominios(org_id);
create index if not exists nx_dominios_cliente on public.nx_dominios(cliente_id);

alter table public.nx_contas
  add column if not exists org_id uuid references public.nx_orgs(id),
  add column if not exists telefone text,
  add column if not exists ultimo_acesso timestamptz,
  add column if not exists trocar_senha boolean not null default false;
create index if not exists nx_contas_org on public.nx_contas(org_id);

alter table public.nx_acessos
  add column if not exists papel text not null default 'admin'
      check (papel in ('admin','supervisor','atendente','leitura')),
  add column if not exists departamentos uuid[] not null default '{}',
  add column if not exists ver_todas boolean not null default true,
  add column if not exists recebe_conversas boolean not null default true,
  add column if not exists ultima_atribuicao_em timestamptz,
  add column if not exists criado_em timestamptz not null default now();
create index if not exists nx_acessos_cliente on public.nx_acessos(cliente_id);

alter table public.nx_config
  add column if not exists saas_url text;

create table if not exists public.nx_convites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  org_id uuid not null references public.nx_orgs(id) on delete cascade,
  cliente_id uuid references public.nx_clientes(id) on delete cascade,
  papel text not null check (papel in ('gestor','admin','supervisor','atendente','leitura')),
  departamentos uuid[] not null default '{}',
  email text, nome text,
  criado_por uuid references public.nx_contas(id) on delete set null,
  expira_em timestamptz not null,
  usado_em timestamptz, usado_por uuid references public.nx_contas(id) on delete set null,
  revogado boolean not null default false,
  tentativas int not null default 0,
  criado_em timestamptz not null default now(),
  check ((papel = 'gestor') = (cliente_id is null))
);
create index if not exists nx_convites_cliente on public.nx_convites(cliente_id);
create index if not exists nx_convites_org on public.nx_convites(org_id);

create table if not exists public.nx_senha_links (
  token_hash text primary key,
  conta_id uuid not null references public.nx_contas(id) on delete cascade,
  criado_por uuid references public.nx_contas(id) on delete set null,
  expira_em timestamptz not null,
  usado_em timestamptz
);
create index if not exists nx_senha_links_conta on public.nx_senha_links(conta_id);

create table if not exists public.nx_auditoria (
  id bigint generated always as identity primary key,
  org_id uuid, cliente_id uuid, conta_id uuid,
  acao text not null, dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists nx_auditoria_cliente on public.nx_auditoria(cliente_id, criado_em desc);
create index if not exists nx_auditoria_suporte on public.nx_auditoria(conta_id, cliente_id, criado_em desc)
  where acao = 'suporte_entrou';

create table if not exists public.nx_midia_lixo (
  id bigint generated always as identity primary key,
  cliente_id uuid not null,
  path text not null check (path ~ '^[0-9a-f-]{36}/'),
  criado_em timestamptz not null default now(),
  apagado_em timestamptz, erro text
);
create index if not exists nx_midia_lixo_pend on public.nx_midia_lixo(id) where apagado_em is null;

create table if not exists public.nx_notificacoes (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  conta_id uuid not null references public.nx_contas(id) on delete cascade,
  tipo text not null check (tipo in ('atribuida','sem_resposta','tarefa','sla_etapa','automacao',
                                     'lead_anuncio','mencao','sistema')),
  titulo text not null check (char_length(titulo) <= 120),
  corpo text check (char_length(corpo) <= 500),
  link text check (link is null or link ~ '^#/'),
  lida_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists nx_notificacoes_conta on public.nx_notificacoes(cliente_id, conta_id, criado_em desc);
-- o nx_pulso conta as não lidas a cada 3 s: índice parcial só com elas
create index if not exists nx_notificacoes_nao_lidas on public.nx_notificacoes(cliente_id, conta_id) where lida_em is null;
create index if not exists nx_notificacoes_conta_fk on public.nx_notificacoes(conta_id);

create table if not exists public.nx_pulsos (
  cliente_id uuid primary key references public.nx_clientes(id) on delete cascade,
  v bigint not null default 0,
  em timestamptz not null default now()
);

create table if not exists public.nx_seq (
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  nome text not null, v bigint not null default 0,
  primary key (cliente_id, nome)
);

create table if not exists public.nx_ia_uso (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  conta_id uuid references public.nx_contas(id) on delete set null,
  acao text not null check (acao in ('sugerir','resumir')),
  modelo text, tokens_in int, tokens_out int, ok boolean not null,
  criado_em timestamptz not null default now()
);
create index if not exists nx_ia_uso_cliente on public.nx_ia_uso(cliente_id, criado_em);

-- ------------------------------------------------------------
-- 4.3 CRM
-- ------------------------------------------------------------
create table if not exists public.nx_empresas (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 160),
  documento text, site text, telefone text, email text, cidade text,
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  obs text check (char_length(obs) <= 5000),
  campos jsonb not null default '{}'::jsonb,
  busca text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists nx_empresas_cli on public.nx_empresas(cliente_id, nome);
create index if not exists nx_empresas_busca on public.nx_empresas using gin (busca extensions.gin_trgm_ops);

create table if not exists public.nx_contatos (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  nome text check (char_length(nome) <= 160),
  telefone text check (telefone ~ '^[0-9]{8,15}$'),
  tel_chave text,
  wa_id text,
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  documento text, nascimento date, cidade text,
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  empresa_id bigint references public.nx_empresas(id) on delete set null,
  origem text not null default 'whatsapp'
      check (origem in ('anuncio','whatsapp','indicacao','organico','manual','site','importacao')),
  plataforma text check (plataforma in ('meta','google')),
  campanha_ext text, anuncio_ext text, ctwa_clid text,
  dono_id uuid references public.nx_contas(id) on delete set null,
  etiquetas uuid[] not null default '{}',
  campos jsonb not null default '{}'::jsonb,
  obs text check (char_length(obs) <= 5000),
  optin_marketing boolean, optin_em timestamptz, optin_origem text,
  bloqueado boolean not null default false,
  busca text not null default '',
  ultimo_contato_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists nx_contatos_tel on public.nx_contatos(cliente_id, tel_chave) where tel_chave is not null;
create index if not exists nx_contatos_cli on public.nx_contatos(cliente_id, criado_em desc);
create index if not exists nx_contatos_busca on public.nx_contatos using gin (busca extensions.gin_trgm_ops);
create index if not exists nx_contatos_etq on public.nx_contatos using gin (etiquetas);
create index if not exists nx_contatos_empresa on public.nx_contatos(empresa_id);
create index if not exists nx_contatos_dono on public.nx_contatos(dono_id);
-- nx_contato_por_tel procura primeiro pelo wa_id exato (webhook): índice próprio
create index if not exists nx_contatos_wa on public.nx_contatos(cliente_id, wa_id) where wa_id is not null;

create table if not exists public.nx_funis (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 60),
  ordem int not null default 0,
  padrao boolean not null default false,
  conta_no_ads boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists nx_funis_padrao on public.nx_funis(cliente_id) where padrao;
create index if not exists nx_funis_cli on public.nx_funis(cliente_id, ordem);

create table if not exists public.nx_estagios (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  funil_id uuid not null references public.nx_funis(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 40),
  cor text not null default '#6FA3CF' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  ordem int not null,
  tipo text not null default 'aberto' check (tipo in ('aberto','ganho','perdido')),
  marco text check (marco in ('nova','agendada','orcamento','fechou','nao_fechou','faltou','perdida')),
  probabilidade int not null default 10 check (probabilidade between 0 and 100),
  sla_horas int check (sla_horas between 1 and 2160),
  criado_em timestamptz not null default now(),
  constraint nx_estagios_marco_tipo check (
    marco is null
    or (marco = 'fechou' and tipo = 'ganho')
    or (marco in ('nao_fechou','perdida') and tipo = 'perdido')
    or (marco in ('nova','agendada','orcamento','faltou') and tipo = 'aberto'))
);
create index if not exists nx_estagios_funil on public.nx_estagios(funil_id, ordem);
create index if not exists nx_estagios_cli on public.nx_estagios(cliente_id);

create table if not exists public.nx_motivos_perda (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 60),
  exige_texto boolean not null default false,
  ordem int not null default 0, ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists nx_motivos_cli on public.nx_motivos_perda(cliente_id, ordem);

create table if not exists public.nx_campos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  entidade text not null check (entidade in ('contato','negocio','empresa')),
  chave text not null check (chave ~ '^[a-z][a-z0-9_]{1,39}$'),
  rotulo text not null check (char_length(rotulo) between 1 and 60),
  tipo text not null check (tipo in ('texto','texto_longo','numero','moeda','data','opcao','multi',
                                     'sim_nao','telefone','email','url')),
  opcoes text[] not null default '{}',
  obrigatorio boolean not null default false,
  funil_id uuid references public.nx_funis(id) on delete cascade,
  ordem int not null default 0, ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (cliente_id, entidade, chave)
);
create index if not exists nx_campos_funil on public.nx_campos(funil_id);

create table if not exists public.nx_etiquetas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 40),
  cor text not null default '#6FA3CF' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  criado_em timestamptz not null default now()
);
create unique index if not exists nx_etiquetas_nome on public.nx_etiquetas(cliente_id, lower(nome));

-- NEGÓCIO = nx_leads (colunas novas; as antigas continuam iguais)
alter table public.nx_leads
  add column if not exists contato_id bigint references public.nx_contatos(id) on delete set null,
  add column if not exists funil_id uuid references public.nx_funis(id) on delete set null,
  add column if not exists estagio_id uuid references public.nx_estagios(id) on delete set null,
  add column if not exists titulo text check (char_length(titulo) <= 120),
  add column if not exists status text not null default 'aberto' check (status in ('aberto','ganho','perdido')),
  add column if not exists valor_previsto numeric(12,2) check (valor_previsto >= 0),
  add column if not exists dono_id uuid references public.nx_contas(id) on delete set null,
  add column if not exists previsao_fechamento date,
  add column if not exists motivo_perda_id uuid references public.nx_motivos_perda(id) on delete set null,
  add column if not exists motivo_perda_txt text check (char_length(motivo_perda_txt) <= 500),
  add column if not exists fechado_em timestamptz,
  add column if not exists estagio_em timestamptz not null default now(),
  add column if not exists ordem double precision,
  add column if not exists etiquetas uuid[] not null default '{}',
  add column if not exists campos jsonb not null default '{}'::jsonb,
  add column if not exists consulta_em timestamptz;
create index if not exists nx_leads_kanban on public.nx_leads(cliente_id, funil_id, estagio_id, ordem);
create index if not exists nx_leads_consulta on public.nx_leads(cliente_id, consulta_em) where status = 'aberto' and consulta_em is not null;
-- nx_leads_tel (cliente_id, telefone) da espec: JÁ existe com o nome nx_leads_cliente_tel
-- (esquema base) — não duplicar o mesmo índice.
create index if not exists nx_leads_contato on public.nx_leads(contato_id);
create index if not exists nx_leads_status on public.nx_leads(cliente_id, status, fechado_em);
create index if not exists nx_leads_dono on public.nx_leads(dono_id);
create index if not exists nx_leads_etq on public.nx_leads using gin (etiquetas);

create table if not exists public.nx_tarefas (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  tipo text not null default 'tarefa' check (tipo in ('tarefa','ligacao','reuniao','visita','whatsapp','email')),
  titulo text not null check (char_length(titulo) between 1 and 160),
  descricao text check (char_length(descricao) <= 5000),
  vence_em timestamptz, concluida_em timestamptz,
  dono_id uuid references public.nx_contas(id) on delete set null,
  contato_id bigint references public.nx_contatos(id) on delete cascade,
  negocio_id bigint references public.nx_leads(id) on delete cascade,
  criado_por uuid references public.nx_contas(id) on delete set null,
  automacao_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists nx_tarefas_abertas on public.nx_tarefas(cliente_id, dono_id, vence_em) where concluida_em is null;
create index if not exists nx_tarefas_negocio on public.nx_tarefas(negocio_id);
create index if not exists nx_tarefas_contato on public.nx_tarefas(contato_id);

create table if not exists public.nx_notas (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  contato_id bigint references public.nx_contatos(id) on delete cascade,
  negocio_id bigint references public.nx_leads(id) on delete cascade,
  autor_id uuid references public.nx_contas(id) on delete set null,
  texto text not null check (char_length(texto) between 1 and 5000),
  fixada boolean not null default false,
  criado_em timestamptz not null default now(), editado_em timestamptz,
  check (contato_id is not null or negocio_id is not null)
);
create index if not exists nx_notas_contato on public.nx_notas(contato_id, criado_em desc);
create index if not exists nx_notas_negocio on public.nx_notas(negocio_id, criado_em desc);

create table if not exists public.nx_visoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  conta_id uuid references public.nx_contas(id) on delete cascade,
  tela text not null check (tela in ('contatos','negocios','conversas','empresas')),
  nome text not null check (char_length(nome) between 1 and 40),
  filtro jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists nx_visoes_cli on public.nx_visoes(cliente_id, tela);

create table if not exists public.nx_importacoes (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  conta_id uuid references public.nx_contas(id) on delete set null,
  arquivo text, total int not null default 0, criados int not null default 0,
  atualizados int not null default 0, ignorados int not null default 0,
  erros jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists nx_importacoes_cli on public.nx_importacoes(cliente_id, criado_em desc);

-- ------------------------------------------------------------
-- 4.4 Conversas
-- ------------------------------------------------------------
create table if not exists public.nx_departamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 40),
  cor text not null default '#6FA3CF' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  padrao boolean not null default false,
  distribuicao text not null default 'manual' check (distribuicao in ('manual','rodizio')),
  manter_atendente boolean not null default true,
  horario jsonb,
  msg_fora_horario text check (char_length(msg_fora_horario) <= 1000),
  ordem int not null default 0, ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists nx_departamentos_padrao on public.nx_departamentos(cliente_id) where padrao;
create index if not exists nx_departamentos_cli on public.nx_departamentos(cliente_id, ordem);

create table if not exists public.nx_canais (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  tipo text not null default 'whatsapp_cloud' check (tipo in ('whatsapp_cloud')),
  nome text not null check (char_length(nome) between 1 and 40),
  phone_number_id text unique,
  waba_id text,
  numero_exibicao text,
  token_segredo uuid,
  app_secret_segredo uuid,
  verify_token text not null default encode(extensions.gen_random_bytes(18), 'hex'),
  chave_publica text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  departamento_id uuid references public.nx_departamentos(id) on delete set null,
  coexistencia boolean not null default false,
  status text not null default 'pendente' check (status in ('pendente','ativo','erro')),
  app_inscrito boolean,
  ultimo_erro text, qualidade text, verificado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists nx_canais_cli on public.nx_canais(cliente_id);

create table if not exists public.nx_conversas (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  canal_id uuid references public.nx_canais(id) on delete set null,
  contato_id bigint not null references public.nx_contatos(id) on delete cascade,
  departamento_id uuid references public.nx_departamentos(id) on delete set null,
  atribuida_a uuid references public.nx_contas(id) on delete set null,
  negocio_id bigint references public.nx_leads(id) on delete set null,
  protocolo text not null,
  status text not null default 'aberta' check (status in ('aberta','pendente','resolvida')),
  aguardando boolean not null default true,
  oculta boolean not null default false,
  nao_lidas int not null default 0,
  etiquetas uuid[] not null default '{}',
  ultima_msg_em timestamptz not null default now(),
  ultima_msg_resumo text check (char_length(ultima_msg_resumo) <= 140),
  ultima_msg_dir text check (ultima_msg_dir in ('in','out')),
  ultima_entrada_em timestamptz,
  aberta_em timestamptz not null default now(),
  primeira_resposta_em timestamptz,
  resolvida_em timestamptz,
  resolvida_por uuid references public.nx_contas(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists nx_conversas_uma_aberta on public.nx_conversas(cliente_id, canal_id, contato_id) where status <> 'resolvida';
create index if not exists nx_conversas_lista on public.nx_conversas(cliente_id, status, ultima_msg_em desc);
create index if not exists nx_conversas_periodo on public.nx_conversas(cliente_id, aberta_em);
create index if not exists nx_conversas_dono on public.nx_conversas(cliente_id, atribuida_a, status);
create index if not exists nx_conversas_contato on public.nx_conversas(contato_id, aberta_em desc);
create index if not exists nx_conversas_etq on public.nx_conversas using gin (etiquetas);
create index if not exists nx_conversas_negocio on public.nx_conversas(negocio_id) where negocio_id is not null;

create table if not exists public.nx_mensagens (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  conversa_id bigint not null references public.nx_conversas(id) on delete cascade,
  contato_id bigint not null references public.nx_contatos(id) on delete cascade,
  canal_id uuid references public.nx_canais(id) on delete set null,
  direcao text not null check (direcao in ('in','out')),
  tipo text not null check (tipo in ('texto','imagem','audio','video','documento','sticker','localizacao',
                                     'contato','interativo','template','nota','sistema','desconhecido')),
  corpo text check (char_length(corpo) <= 4096),
  midia jsonb,
  wamid text unique,
  responde_a_wamid text,
  reacao text,
  status text not null check (status in ('recebida','pendente','enviada','entregue','lida','falhou')),
  erro text,
  enviado_por uuid references public.nx_contas(id) on delete set null,
  origem text check (origem in ('painel','automacao','fora_horario','agendada','ia')),
  template jsonb, referral jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists nx_mensagens_conversa on public.nx_mensagens(conversa_id, id);
create index if not exists nx_mensagens_contato on public.nx_mensagens(contato_id, id desc);
create index if not exists nx_mensagens_delta on public.nx_mensagens(contato_id, atualizado_em);
create index if not exists nx_mensagens_periodo on public.nx_mensagens(cliente_id, criado_em);
create index if not exists nx_mensagens_canal_wamid on public.nx_mensagens(canal_id, wamid);
create index if not exists nx_mensagens_busca on public.nx_mensagens using gin (lower(corpo) extensions.gin_trgm_ops)
  where tipo in ('texto','nota');

create table if not exists public.nx_respostas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  atalho text not null check (atalho ~ '^[a-z0-9_-]{1,30}$'),
  titulo text not null check (char_length(titulo) between 1 and 60),
  corpo text not null check (char_length(corpo) between 1 and 4096),
  departamento_id uuid references public.nx_departamentos(id) on delete set null,
  usos int not null default 0, ordem int not null default 0, ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (cliente_id, atalho)
);

create table if not exists public.nx_templates (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  canal_id uuid not null references public.nx_canais(id) on delete cascade,
  nome text not null, idioma text not null,
  categoria text, status text, componentes jsonb not null default '[]'::jsonb,
  corpo text, num_parametros int not null default 0,
  sincronizado_em timestamptz not null default now(),
  unique (canal_id, nome, idioma)
);
create index if not exists nx_templates_cli on public.nx_templates(cliente_id);

create table if not exists public.nx_historico (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  contato_id bigint references public.nx_contatos(id) on delete cascade,
  negocio_id bigint references public.nx_leads(id) on delete cascade,
  conversa_id bigint references public.nx_conversas(id) on delete cascade,
  tipo text not null,
  dados jsonb not null default '{}'::jsonb,
  autor_id uuid references public.nx_contas(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists nx_historico_contato on public.nx_historico(contato_id, criado_em desc);
create index if not exists nx_historico_negocio on public.nx_historico(negocio_id, criado_em desc);
create index if not exists nx_historico_conversa on public.nx_historico(conversa_id) where conversa_id is not null;

-- ------------------------------------------------------------
-- 4.5 Automações e fila (o MOTOR é da frente F7)
-- ------------------------------------------------------------
create table if not exists public.nx_automacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 80),
  ativo boolean not null default false,
  gatilho text not null check (gatilho in ('conversa_nova','mensagem_recebida','negocio_criado','negocio_estagio',
      'negocio_ganho','negocio_perdido','etiqueta_adicionada','sem_resposta','tempo_no_estagio','tarefa_vencida',
      'antes_da_data')),
  config jsonb not null default '{}'::jsonb,
  condicoes jsonb not null default '[]'::jsonb,
  acoes jsonb not null default '[]'::jsonb,
  respeitar_horario boolean not null default false,
  execucoes int not null default 0, erros int not null default 0, ultima_execucao_em timestamptz,
  criado_por uuid references public.nx_contas(id) on delete set null,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index if not exists nx_automacoes_ativas on public.nx_automacoes(cliente_id, gatilho) where ativo;

create table if not exists public.nx_eventos (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  tipo text not null,
  ref jsonb not null default '{}'::jsonb,
  origem_automacao uuid, profundidade int not null default 0,
  criado_em timestamptz not null default now(), processado_em timestamptz
);
create index if not exists nx_eventos_pendentes on public.nx_eventos(criado_em) where processado_em is null;
create index if not exists nx_eventos_cli on public.nx_eventos(cliente_id, criado_em);

create table if not exists public.nx_auto_execucoes (
  id bigint generated always as identity primary key,
  automacao_id uuid not null references public.nx_automacoes(id) on delete cascade,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  evento_id bigint, chave text not null,
  ok boolean not null, detalhe text check (char_length(detalhe) <= 1000),
  criado_em timestamptz not null default now(),
  unique (automacao_id, chave)
);
create index if not exists nx_auto_execucoes_cli on public.nx_auto_execucoes(cliente_id, criado_em desc);

create table if not exists public.nx_envios_fila (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  conversa_id bigint references public.nx_conversas(id) on delete cascade,
  contato_id bigint references public.nx_contatos(id) on delete cascade,
  canal_id uuid references public.nx_canais(id) on delete set null,
  tipo text not null check (tipo in ('texto','template')),
  texto text check (char_length(texto) <= 4096),
  template jsonb,
  origem text not null check (origem in ('automacao','fora_horario','agendada','lista')),
  automacao_id uuid references public.nx_automacoes(id) on delete set null,
  criado_por uuid references public.nx_contas(id) on delete set null,
  enviar_em timestamptz not null default now(),
  status text not null default 'pendente'
      check (status in ('pendente','enviando','enviado','falhou','pulado','cancelado')),
  tentativas int not null default 0, erro text, mensagem_id bigint,
  criado_em timestamptz not null default now(), processado_em timestamptz
);
create index if not exists nx_fila_pendentes on public.nx_envios_fila(enviar_em) where status = 'pendente';
create index if not exists nx_fila_contato on public.nx_envios_fila(contato_id, criado_em desc);
create index if not exists nx_fila_conversa on public.nx_envios_fila(conversa_id);

-- ------------------------------------------------------------
-- Tabelas novas: RLS ligado, sem política, nada para anon/authenticated
-- ------------------------------------------------------------
do $$
declare t text; s record;
begin
  foreach t in array array[
    'nx_orgs','nx_planos','nx_dominios','nx_convites','nx_senha_links','nx_auditoria','nx_midia_lixo',
    'nx_notificacoes','nx_pulsos','nx_seq','nx_ia_uso',
    'nx_empresas','nx_contatos','nx_funis','nx_estagios','nx_motivos_perda','nx_campos','nx_etiquetas',
    'nx_tarefas','nx_notas','nx_visoes','nx_importacoes',
    'nx_departamentos','nx_canais','nx_conversas','nx_mensagens','nx_respostas','nx_templates','nx_historico',
    'nx_automacoes','nx_eventos','nx_auto_execucoes','nx_envios_fila'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
    for s in select pg_get_serial_sequence('public.' || t, a.attname) as seq
               from pg_attribute a
              where a.attrelid = ('public.' || t)::regclass and a.attidentity <> '' and not a.attisdropped loop
      if s.seq is not null then
        execute format('revoke all on sequence %s from public, anon, authenticated', s.seq);
        execute format('grant usage, select on sequence %s to service_role', s.seq);
      end if;
    end loop;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4.6 Sementes
-- ------------------------------------------------------------
insert into public.nx_orgs (slug, nome, tipo, marca) values ('nexus', 'Nexus', 'plataforma',
  '{"produto":"Órbita","cores":{"primaria":"#B0761F","secundaria":"#6FA3CF","fundo":"#07090C"},
    "login_titulo":"Anúncio, conversa e venda na mesma órbita.",
    "login_texto":"Entre com o e-mail e a senha que a Nexus cadastrou para você.",
    "assinatura":"Equipe Nexus"}'::jsonb)
on conflict (slug) do nothing;

insert into public.nx_planos (id, nome, preco_mensal, limites, modulos, ordem) values
 ('essencial','Essencial',297,'{"usuarios":3,"canais":1,"funis":2,"automacoes":5,"contatos":5000,"ia_mes":300}','{crm,conversas,relatorios}',1),
 ('profissional','Profissional',597,'{"usuarios":8,"canais":2,"funis":10,"automacoes":20,"contatos":50000,"ia_mes":1500}','{crm,conversas,relatorios,ads,automacoes}',2),
 ('completo','Completo',997,'{"usuarios":25,"canais":5,"funis":null,"automacoes":80,"contatos":200000,"ia_mes":5000}','{crm,conversas,relatorios,ads,automacoes,marca}',3),
 ('interno','Interno Nexus',null,'{}','{crm,conversas,relatorios,ads,automacoes,marca}',9)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 4.10 Tipo do contexto de autorização
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'public' and t.typname = 'nx_ctx_t') then
    create type public.nx_ctx_t as (conta_id uuid, org_id uuid, nome text, papel text, super boolean,
                                    departamentos uuid[], ver_todas boolean);
  end if;
end $$;

-- ------------------------------------------------------------
-- 4.7 Funções utilitárias (internas: só service_role, salvo nx_pulso)
-- Erros: '42501' = acesso, '22023' = dados (o PostgREST devolve message e hint).
-- ------------------------------------------------------------

-- leitura 0 · atendente 1 · supervisor 2 · admin 3 · gestor 4 · super 5 · outro → erro
create or replace function public.nx_rank(p text)
returns int
language plpgsql immutable
security definer
set search_path = ''
as $$
begin
  case p
    when 'leitura' then return 0;
    when 'atendente' then return 1;
    when 'supervisor' then return 2;
    when 'admin' then return 3;
    when 'gestor' then return 4;
    when 'super' then return 5;
    else raise exception 'dados_invalidos' using errcode = '22023', hint = 'papel';
  end case;
end $$;

create or replace function public.nx_org_plataforma()
returns uuid
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return (select o.id from public.nx_orgs o where o.tipo = 'plataforma' limit 1);
end $$;

-- só dígitos. p_com_ddi (número do from/wa_id do WhatsApp, que já traz o DDI):
-- 8–15 dígitos como está. Digitado/importado: 10–11 → prefixa 55; 12–15 como está.
create or replace function public.nx_tel_normalizar(p text, p_com_ddi boolean default false)
returns text
language plpgsql immutable
security definer
set search_path = ''
as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if coalesce(p_com_ddi, false) then
    return case when length(d) between 8 and 15 then d end;
  end if;
  if length(d) between 10 and 11 then return '55' || d; end if;
  if length(d) between 12 and 15 then return d; end if;
  return null;
end $$;

-- chave de deduplicação: 55 + DDD + 9 + 8 dígitos e 55 + DDD + 8 dígitos são a
-- mesma pessoa (5512998303030 e 551298303030 → 1298303030). Nunca acrescenta 55.
create or replace function public.nx_tel_chave(p text)
returns text
language plpgsql immutable
security definer
set search_path = ''
as $$
declare s text;
begin
  if p is null then return null; end if;
  if length(p) between 12 and 13 and left(p, 2) = '55' then
    s := substr(p, 3);
    if length(s) = 11 and substr(s, 3, 1) = '9' then
      s := substr(s, 1, 2) || substr(s, 4);
    end if;
    return s;
  end if;
  return p;
end $$;

create or replace function public.nx_contato_por_tel(p_cliente uuid, p_tel text)
returns bigint
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  d text := nullif(regexp_replace(coalesce(p_tel, ''), '\D', '', 'g'), '');
  v_chave text;
begin
  if p_cliente is null or d is null then return null; end if;
  select k.id into v_id from public.nx_contatos k
   where k.cliente_id = p_cliente and k.wa_id = d order by k.id limit 1;
  if v_id is not null then return v_id; end if;
  v_chave := public.nx_tel_chave(public.nx_tel_normalizar(d));
  if v_chave is null then return null; end if;
  select k.id into v_id from public.nx_contatos k
   where k.cliente_id = p_cliente and k.tel_chave = v_chave limit 1;
  return v_id;
end $$;

create or replace function public.nx_cfg_publico(p_cfg jsonb, p_papel text, p_para text)
returns jsonb
language plpgsql immutable
security definer
set search_path = ''
as $$
begin
  if p_cfg is null then return null; end if;
  if p_papel in ('gestor', 'super') then return p_cfg; end if;
  if p_para = 'dados' then return p_cfg - array['waGestor', 'waCliente']; end if;
  return p_cfg - array['fee', 'waGestor', 'waCliente', 'assinatura', 'regrasOff'];
end $$;

create or replace function public.nx_link_base(p_cliente uuid)
returns text
language plpgsql stable
security definer
set search_path = ''
as $$
declare v text;
begin
  select 'https://' || d.host || '/app/' into v
    from public.nx_dominios d
   where d.cliente_id = p_cliente and d.status = 'ativo'
   order by d.ativado_em nulls last, d.criado_em limit 1;
  if v is not null then return v; end if;
  select 'https://' || d.host || '/app/' into v
    from public.nx_dominios d join public.nx_clientes c on c.org_id = d.org_id
   where c.id = p_cliente and d.cliente_id is null and d.status = 'ativo'
   order by d.criado_em limit 1;
  if v is not null then return v; end if;
  return (select nullif(btrim(x.saas_url), '') from public.nx_config x where x.id = 1);
end $$;

-- "quem mexe em quem" (§3.4)
create or replace function public.nx_conta_no_escopo(p_quem public.nx_contas, p_alvo uuid, p_cliente uuid)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
declare alvo public.nx_contas;
begin
  if p_quem.id is null or p_alvo is null then return false; end if;
  -- super
  if p_quem.papel = 'gestor'
     and exists (select 1 from public.nx_orgs o where o.id = p_quem.org_id and o.tipo = 'plataforma') then
    return true;
  end if;
  select * into alvo from public.nx_contas where id = p_alvo;
  if alvo.id is null then return false; end if;
  -- alvo gestor: só ele mesmo (gestor da mesma org)
  if alvo.papel = 'gestor' then
    return p_quem.papel = 'gestor' and alvo.org_id = p_quem.org_id and alvo.id = p_quem.id;
  end if;
  -- chamador gestor de revenda: alvo da mesma org e todos os acessos em clientes da org
  if p_quem.papel = 'gestor' then
    return alvo.org_id = p_quem.org_id
       and not exists (select 1 from public.nx_acessos a join public.nx_clientes c on c.id = a.cliente_id
                        where a.conta_id = alvo.id and c.org_id is distinct from p_quem.org_id);
  end if;
  -- chamador admin do p_cliente: alvo 'clinica' COM acesso ao p_cliente e com TODOS os acessos em
  -- clientes onde o chamador é admin. (Sem a 1ª condição, conta SEM acesso nenhum — de outra org,
  -- pendente, ou que perdeu os acessos — passaria no "todos" vazio, e o admin poderia gerar link de
  -- senha para ela: tomada de conta.)
  if exists (select 1 from public.nx_acessos a
              where a.conta_id = p_quem.id and a.cliente_id = p_cliente and a.papel = 'admin') then
    return alvo.papel = 'clinica'
       and exists (select 1 from public.nx_acessos t where t.conta_id = alvo.id and t.cliente_id = p_cliente)
       and not exists (select 1 from public.nx_acessos a
                        where a.conta_id = alvo.id
                          and not exists (select 1 from public.nx_acessos b
                                           where b.conta_id = p_quem.id and b.cliente_id = a.cliente_id
                                             and b.papel = 'admin'));
  end if;
  return false;
end $$;

create or replace function public.nx_exigir_modulo(p_cliente uuid, p_modulo text)
returns void
language plpgsql stable
security definer
set search_path = ''
as $$
declare v text[];
begin
  select c.modulos into v from public.nx_clientes c where c.id = p_cliente;
  if not found then raise exception 'cliente_nao_encontrado' using errcode = '22023'; end if;
  if not (p_modulo = any(coalesce(v, '{}'::text[]))) then
    raise exception 'modulo_desligado' using errcode = '42501', hint = p_modulo;
  end if;
end $$;

-- limite efetivo: nx_clientes.limites se tiver a chave, senão o do plano. null = ilimitado.
create or replace function public.nx_limite(p_cliente uuid, p_chave text)
returns int
language plpgsql stable
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  select case when c.limites ? p_chave then c.limites -> p_chave else p.limites -> p_chave end into v
    from public.nx_clientes c left join public.nx_planos p on p.id = c.plano
   where c.id = p_cliente;
  if v is null or jsonb_typeof(v) <> 'number' then return null; end if;
  return floor((v #>> '{}')::numeric)::int;
end $$;

create or replace function public.nx_uso(p_cliente uuid, p_chave text)
returns int
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  case p_chave
    when 'usuarios' then
      return (select count(*) from public.nx_acessos a where a.cliente_id = p_cliente)
           + (select count(*) from public.nx_convites v
               where v.cliente_id = p_cliente and v.usado_em is null and not v.revogado
                 and v.expira_em > now() and v.tentativas < 5);
    when 'canais' then
      return (select count(*) from public.nx_canais k where k.cliente_id = p_cliente);
    when 'funis' then
      return (select count(*) from public.nx_funis f where f.cliente_id = p_cliente and f.ativo);
    when 'automacoes' then
      return (select count(*) from public.nx_automacoes a where a.cliente_id = p_cliente);
    when 'contatos' then
      return (select count(*) from public.nx_contatos k where k.cliente_id = p_cliente);
    when 'ia_mes' then
      return (select count(*) from public.nx_ia_uso u
               where u.cliente_id = p_cliente and u.ok
                 and u.criado_em >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'));
    when 'empresas' then
      return (select count(*) from public.nx_clientes x
               where x.org_id = (select c.org_id from public.nx_clientes c where c.id = p_cliente));
    else
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'chave';
  end case;
end $$;

-- limite somado da revenda (empresas, usuarios, canais). A org plataforma não tem limite.
-- Para criar cliente: chamar ANTES do insert com p_novos = 1 (o cliente ainda não existe).
create or replace function public.nx_exigir_limite_org(p_org uuid, p_chave text, p_novos int default 1)
returns void
language plpgsql stable
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
  v_uso := case p_chave
    when 'empresas' then (select count(*) from public.nx_clientes c where c.org_id = p_org)
    when 'canais' then (select count(*) from public.nx_canais k join public.nx_clientes c on c.id = k.cliente_id
                          where c.org_id = p_org)
    when 'usuarios' then (select count(*) from public.nx_acessos a join public.nx_clientes c on c.id = a.cliente_id
                            where c.org_id = p_org)
                       + (select count(*) from public.nx_convites v
                            where v.org_id = p_org and v.usado_em is null and not v.revogado
                              and v.expira_em > now() and v.tentativas < 5)
  end;
  if v_uso + coalesce(p_novos, 1) > v_lim then
    raise exception 'limite_plano' using errcode = '22023', hint = 'org_' || p_chave || ':' || v_lim;
  end if;
end $$;

create or replace function public.nx_exigir_limite(p_cliente uuid, p_chave text, p_novos int default 1)
returns void
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_lim int;
begin
  if p_chave <> 'empresas' then
    v_lim := public.nx_limite(p_cliente, p_chave);
    if v_lim is not null and public.nx_uso(p_cliente, p_chave) + coalesce(p_novos, 1) > v_lim then
      raise exception 'limite_plano' using errcode = '22023', hint = p_chave || ':' || v_lim;
    end if;
  end if;
  if p_chave in ('usuarios', 'canais', 'empresas') then
    perform public.nx_exigir_limite_org((select c.org_id from public.nx_clientes c where c.id = p_cliente),
                                        p_chave, p_novos);
  end if;
end $$;

-- pulso (D5). Em lote (nx.lote = '1') só anota o cliente; o fim do lote bate uma vez.
-- Fora de lote, bate no MÁXIMO uma vez por transação e cliente (nx.pulso_tx): quem
-- lê o pulso só enxerga o commit, então 1 batida por transação basta — e evita
-- regravar a mesma linha quente N vezes (20.000 mensagens: 9,9 s → 1,3 s).
create or replace function public.nx_pulso_bater(p_cliente uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_lista text; v_tx text;
begin
  if p_cliente is null then return; end if;
  if current_setting('nx.lote', true) = '1' then
    v_lista := coalesce(current_setting('nx.lote_clientes', true), '');
    if v_lista = '' then
      perform set_config('nx.lote_clientes', p_cliente::text, true);
    elsif position(p_cliente::text in v_lista) = 0 then
      perform set_config('nx.lote_clientes', v_lista || ',' || p_cliente::text, true);
    end if;
    return;
  end if;
  v_tx := coalesce(current_setting('nx.pulso_tx', true), '');
  if position(p_cliente::text in v_tx) > 0 then return; end if;
  insert into public.nx_pulsos as p (cliente_id, v, em) values (p_cliente, 1, now())
  on conflict (cliente_id) do update set v = p.v + 1, em = now();
  perform set_config('nx.pulso_tx', v_tx || ',' || p_cliente::text, true);
end $$;

create or replace function public.nx_pulso_lote_fim()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_lista text := coalesce(current_setting('nx.lote_clientes', true), ''); v_cli text;
begin
  if v_lista <> '' then
    foreach v_cli in array string_to_array(v_lista, ',') loop
      if v_cli <> '' then
        insert into public.nx_pulsos as p (cliente_id, v, em) values (v_cli::uuid, 1, now())
        on conflict (cliente_id) do update set v = p.v + 1, em = now();
      end if;
    end loop;
  end if;
  perform set_config('nx.lote_clientes', '', true);
end $$;

create or replace function public.nx_proximo(p_cliente uuid, p_nome text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_n bigint;
begin
  insert into public.nx_seq as s (cliente_id, nome, v) values (p_cliente, p_nome, 1)
  on conflict (cliente_id, nome) do update set v = s.v + 1
  returning s.v into v_n;
  return v_n;
end $$;

create or replace function public.nx_protocolo(p_cliente uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  return to_char(now() at time zone 'America/Sao_Paulo', 'YYYY') || '-'
      || lpad(public.nx_proximo(p_cliente, 'protocolo')::text, 6, '0');
end $$;

-- horário (§3.8): {"0":[],"1":[["08:00","12:00"],["13:30","18:00"]],…}; null = 24 h
create or replace function public.nx_horario_aberto(p_horario jsonb, p_quando timestamptz)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_local timestamp; v_dia jsonb;
begin
  if p_horario is null or jsonb_typeof(p_horario) = 'null' then return true; end if;
  v_local := coalesce(p_quando, now()) at time zone 'America/Sao_Paulo';
  v_dia := p_horario -> (extract(dow from v_local)::int)::text;
  if v_dia is null or jsonb_typeof(v_dia) <> 'array' then return false; end if;
  return exists (
    select 1 from jsonb_array_elements(v_dia) f
     where jsonb_typeof(f) = 'array'
       and v_local::time >= (f ->> 0)::time and v_local::time < (f ->> 1)::time);
end $$;

create or replace function public.nx_proximo_horario(p_horario jsonb, p_quando timestamptz)
returns timestamptz
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_quando timestamptz := coalesce(p_quando, now()); v_local timestamp; d date; v_dia jsonb; v_ini timestamptz;
begin
  if p_horario is null or jsonb_typeof(p_horario) = 'null' then return v_quando; end if;
  if public.nx_horario_aberto(p_horario, v_quando) then return v_quando; end if;
  v_local := v_quando at time zone 'America/Sao_Paulo';
  for i in 0..7 loop
    d := v_local::date + i;
    v_dia := p_horario -> (extract(dow from d)::int)::text;
    continue when v_dia is null or jsonb_typeof(v_dia) <> 'array';
    select min((d + (f ->> 0)::time) at time zone 'America/Sao_Paulo') into v_ini
      from jsonb_array_elements(v_dia) f
     where jsonb_typeof(f) = 'array'
       and ((d + (f ->> 0)::time) at time zone 'America/Sao_Paulo') > v_quando;
    if v_ini is not null then return v_ini; end if;
  end loop;
  return null;
end $$;

-- Vault (D8)
create or replace function public.nx_segredo_gravar(p_id uuid, p_valor text, p_nome text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v uuid;
begin
  if p_id is null then
    if p_nome is not null then
      select s.id into v from vault.secrets s where s.name = p_nome limit 1;
      if v is not null then
        perform vault.update_secret(v, p_valor);
        return v;
      end if;
    end if;
    return vault.create_secret(p_valor, p_nome);
  end if;
  perform vault.update_secret(p_id, p_valor);
  return p_id;
end $$;

create or replace function public.nx_segredo_ler(p_id uuid)
returns text
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if p_id is null then return null; end if;
  return (select s.decrypted_secret from vault.decrypted_secrets s where s.id = p_id);
end $$;

create or replace function public.nx_historico_add(p_cliente uuid, p_tipo text, p_contato bigint, p_negocio bigint,
                                                   p_conversa bigint, p_dados jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.nx_historico (cliente_id, contato_id, negocio_id, conversa_id, tipo, dados, autor_id)
  values (p_cliente, p_contato, p_negocio, p_conversa, p_tipo, coalesce(p_dados, '{}'::jsonb),
          nullif(current_setting('nx.conta', true), '')::uuid);
end $$;

-- p_conta null ⇒ uma linha para cada admin/supervisor do cliente + gestores da org do cliente
create or replace function public.nx_notificar(p_cliente uuid, p_conta uuid, p_tipo text, p_titulo text,
                                               p_corpo text default null, p_link text default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int := 0;
  v_link text := case when p_link ~ '^#/' then left(p_link, 500) end;
  v_titulo text := left(coalesce(p_titulo, ''), 120);
  v_corpo text := left(p_corpo, 500);
begin
  if p_conta is not null then
    -- só para conta que enxerga esse cliente (acesso, gestor da org ou super): título e corpo
    -- levam dado do cliente e não podem cair na caixa de conta de outra empresa. Senão → 0.
    insert into public.nx_notificacoes (cliente_id, conta_id, tipo, titulo, corpo, link)
    select p_cliente, k.id, p_tipo, v_titulo, v_corpo, v_link
      from public.nx_contas k
     where k.id = p_conta
       and (exists (select 1 from public.nx_acessos a where a.conta_id = k.id and a.cliente_id = p_cliente)
            or (k.papel = 'gestor'
                and exists (select 1 from public.nx_clientes c where c.id = p_cliente and c.org_id = k.org_id))
            or (k.papel = 'gestor'
                and exists (select 1 from public.nx_orgs o where o.id = k.org_id and o.tipo = 'plataforma')));
    get diagnostics v_n = row_count;
    return v_n;
  end if;
  insert into public.nx_notificacoes (cliente_id, conta_id, tipo, titulo, corpo, link)
  select p_cliente, x.id, p_tipo, v_titulo, v_corpo, v_link
    from (select a.conta_id as id
            from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
           where a.cliente_id = p_cliente and a.papel in ('admin', 'supervisor') and k.aprovado
          union
          select k.id
            from public.nx_contas k join public.nx_clientes c on c.id = p_cliente
           where k.papel = 'gestor' and k.org_id = c.org_id and k.aprovado) x;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.nx_auditar(p_org uuid, p_cliente uuid, p_conta uuid, p_acao text,
                                             p_dados jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.nx_auditoria (org_id, cliente_id, conta_id, acao, dados)
  values (p_org, p_cliente, p_conta, p_acao, coalesce(p_dados, '{}'::jsonb));
end $$;

-- ------------------------------------------------------------
-- 4.10 nx_ctx — o ponto único de autorização
-- ------------------------------------------------------------
create or replace function public.nx_ctx(p_token text, p_cliente uuid, p_min text default 'atendente')
returns public.nx_ctx_t
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.nx_contas := public.nx_conta_do_token(p_token);   -- sessao_invalida / conta_pendente
  v_min text := coalesce(p_min, 'atendente');
  v_super boolean;
  v_cli public.nx_clientes;
  a public.nx_acessos;
  v_papel text;
  r public.nx_ctx_t;
begin
  v_super := c.papel = 'gestor'
             and exists (select 1 from public.nx_orgs o where o.id = c.org_id and o.tipo = 'plataforma');
  if p_cliente is not null then
    select * into v_cli from public.nx_clientes where id = p_cliente;
  end if;
  if v_cli.id is null then
    raise exception 'cliente_nao_encontrado' using errcode = '22023';
  end if;
  select * into a from public.nx_acessos where conta_id = c.id and cliente_id = p_cliente;

  if v_super then
    v_papel := 'super';
  elsif c.papel = 'gestor' and v_cli.org_id = c.org_id then
    v_papel := 'gestor';
  elsif a.conta_id is not null then
    v_papel := a.papel;
  else
    raise exception 'sem_acesso' using errcode = '42501';
  end if;

  if public.nx_rank(v_papel) < 4 then
    if v_cli.status in ('suspenso', 'cancelado') then
      raise exception 'conta_suspensa' using errcode = '42501';
    end if;
    if v_cli.status = 'teste' and v_cli.teste_ate < (now() at time zone 'America/Sao_Paulo')::date
       and v_min <> 'leitura' then
      raise exception 'teste_expirado' using errcode = '42501';
    end if;
    if exists (select 1 from public.nx_orgs o where o.id = v_cli.org_id and o.status = 'suspenso') then
      raise exception 'conta_suspensa' using errcode = '42501';
    end if;
  end if;

  if public.nx_rank(v_papel) < public.nx_rank(v_min) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  perform set_config('nx.conta', c.id::text, true);
  perform set_config('nx.cliente', p_cliente::text, true);

  -- auditoria de suporte (no servidor): gestor/super sem acesso próprio → 1 linha por hora.
  -- Em transação SOMENTE LEITURA (o PostgREST roda RPC stable/immutable assim, e GET sempre) o
  -- insert daria 'cannot execute INSERT in a read-only transaction' e derrubaria a RPC: aí a
  -- linha fica para a próxima chamada de escrita (RPCs de painel são volatile por padrão).
  if v_papel in ('gestor', 'super') and a.conta_id is null
     and coalesce(current_setting('transaction_read_only', true), 'off') <> 'on'
     and not exists (select 1 from public.nx_auditoria x
                      where x.acao = 'suporte_entrou' and x.conta_id = c.id and x.cliente_id = p_cliente
                        and x.criado_em > now() - interval '1 hour') then
    perform public.nx_auditar(v_cli.org_id, p_cliente, c.id, 'suporte_entrou', jsonb_build_object('papel', v_papel));
  end if;

  r := row(c.id, c.org_id, c.nome, v_papel, v_super,
           coalesce(a.departamentos, '{}'::uuid[]), coalesce(a.ver_todas, true))::public.nx_ctx_t;
  return r;
end $$;

-- para as Edge Functions: o mesmo contexto em JSON
create or replace function public.nx_fn_ctx(p_token text, p_cliente uuid, p_min text default 'atendente')
returns json
language plpgsql
security definer
set search_path = ''
as $$
begin
  return row_to_json(public.nx_ctx(p_token, p_cliente, p_min));
end $$;

-- Visibilidade de conversa (§5.4) — ÚNICA implementação.
-- admin/gestor/super: tudo. supervisor: departamentos dele (vazio = todos).
-- atendente/leitura: atribuídas a si + sem dono dos seus departamentos; todas dos
-- seus departamentos se ver_todas. oculta só para supervisor+.
-- Conversa sem departamento (departamento apagado) conta como "de todos".
-- Forma para WHERE de listas (copiar com o comentário "-- regra nx_cv_visivel"),
-- com v = nx_ctx_t e cv = nx_conversas:
--   cv.cliente_id = p_cliente
--   and (not cv.oculta or public.nx_rank(v.papel) >= 2)
--   and ( public.nx_rank(v.papel) >= 3
--      or cv.atribuida_a = v.conta_id
--      or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
--            or cv.departamento_id = any(v.departamentos))
--           and (public.nx_rank(v.papel) = 2 or cv.atribuida_a is null or v.ver_todas) ) )
-- Defesa extra: o p_ctx precisa ser DESTE p_cliente (o nx_ctx_t não carrega o cliente). Um ctx
-- calculado para outro cliente (ex.: admin em A, atendente em B) nunca abre conversa de B: papel,
-- departamentos e ver_todas têm de bater com o que o nx_ctx daria para p_cliente.
create or replace function public.nx_cv_visivel(p_ctx public.nx_ctx_t, p_cliente uuid, p_conversa bigint)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
declare cv record; v_rank int; v_dep boolean; k public.nx_contas;
begin
  if p_ctx is null or p_ctx.papel is null or p_ctx.conta_id is null or p_cliente is null or p_conversa is null then
    return false;
  end if;
  select x.cliente_id, x.departamento_id, x.atribuida_a, x.oculta into cv
    from public.nx_conversas x where x.id = p_conversa;
  if not found then return false; end if;
  if cv.cliente_id is distinct from p_cliente then return false; end if;
  -- o ctx é deste cliente?
  select * into k from public.nx_contas where id = p_ctx.conta_id;
  if k.id is null then return false; end if;
  if p_ctx.papel = 'super' then
    if not (k.papel = 'gestor'
            and exists (select 1 from public.nx_orgs o where o.id = k.org_id and o.tipo = 'plataforma')) then
      return false;
    end if;
  elsif p_ctx.papel = 'gestor' then
    if not (k.papel = 'gestor'
            and exists (select 1 from public.nx_clientes x where x.id = p_cliente and x.org_id = k.org_id)) then
      return false;
    end if;
  elsif not exists (select 1 from public.nx_acessos t
                     where t.conta_id = k.id and t.cliente_id = p_cliente and t.papel = p_ctx.papel
                       and t.departamentos = coalesce(p_ctx.departamentos, '{}'::uuid[])
                       and t.ver_todas = coalesce(p_ctx.ver_todas, true)) then
    return false;
  end if;
  v_rank := public.nx_rank(p_ctx.papel);
  if cv.oculta and v_rank < 2 then return false; end if;
  if v_rank >= 3 then return true; end if;
  if cv.atribuida_a is not null and cv.atribuida_a = p_ctx.conta_id then return true; end if;
  v_dep := coalesce(cardinality(p_ctx.departamentos), 0) = 0
           or cv.departamento_id is null
           or cv.departamento_id = any(p_ctx.departamentos);
  if not v_dep then return false; end if;
  if v_rank = 2 then return true; end if;
  return cv.atribuida_a is null or coalesce(p_ctx.ver_todas, true);
end $$;

-- pulso do painel (§4.7): uma leitura por chave primária + não lidas da conta
create or replace function public.nx_pulso(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
begin
  return json_build_object(
    'v', coalesce((select p.v from public.nx_pulsos p where p.cliente_id = p_cliente), 0),
    'notif', (select count(*) from public.nx_notificacoes n
               where n.cliente_id = p_cliente and n.conta_id = v.conta_id and n.lida_em is null),
    'agora', now());
end $$;

-- ------------------------------------------------------------
-- Apêndice A — modelos por vertical. Idempotente: funis só se o cliente não
-- tiver nenhum; o resto por nome/atalho (nunca duplica, nunca apaga).
-- ------------------------------------------------------------
create or replace function public.nx_aplicar_modelo(p_cliente uuid, p_vertical text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vert text := case when p_vertical in ('odonto', 'oficina', 'loja', 'generico') then p_vertical else 'generico' end;
  m jsonb;
  f jsonb; e jsonb; d jsonb;
  k int; i int; n_aberto int;
  v_funil uuid; v_tipo text; v_marco text; v_cor text; v_prob int;
  cores_marco constant jsonb := '{"nova":"#6FA3CF","agendada":"#8FB8DD","orcamento":"#E5B35C","faltou":"#C9BFAF",
                                  "fechou":"#7FD1A5","nao_fechou":"#F08A74","perdida":"#9D9486"}';
  prob_marco constant jsonb := '{"nova":10,"agendada":30,"orcamento":50,"faltou":10,"fechou":100,"nao_fechou":0,"perdida":0}';
  cores_aberto constant text[] := array['#6FA3CF', '#8FB8DD', '#E5B35C'];
  cores_etq constant text[] := array['#6FA3CF', '#E5B35C', '#7FD1A5', '#B39DDB', '#8FB8DD', '#E07A9A', '#C9BFAF', '#9D9486', '#5FB3A8'];
  v_horario_odonto constant jsonb := '{"0":[],"1":[["08:00","18:00"]],"2":[["08:00","18:00"]],"3":[["08:00","18:00"]],
                                      "4":[["08:00","18:00"]],"5":[["08:00","18:00"]],"6":[["08:00","12:00"]]}';
begin
  if not exists (select 1 from public.nx_clientes where id = p_cliente) then
    raise exception 'cliente_nao_encontrado' using errcode = '22023';
  end if;

  m := case v_vert
  when 'odonto' then $j${
    "funis": [
      {"nome": "Pacientes", "padrao": true, "ads": true, "etapas": [
        ["Nova conversa", "aberto", "nova", 10], ["Avaliação agendada", "aberto", "agendada", 30],
        ["Avaliou / orçamento", "aberto", "orcamento", 50], ["Faltou", "aberto", "faltou", 10],
        ["Fechou tratamento", "ganho", "fechou", 100], ["Não fechou", "perdido", "nao_fechou", 0],
        ["Perdido", "perdido", "perdida", 0]]},
      {"nome": "Pós-tratamento", "etapas": [
        ["Em tratamento", "aberto", null, 60], ["Concluído", "aberto", null, 80],
        ["Retorno agendado", "aberto", null, 90], ["Indicou alguém", "ganho", null, 100],
        ["Sem retorno", "perdido", null, 0]]}],
    "etiquetas": ["Avaliação", "Implante", "Ortodontia", "Clareamento", "Prótese", "Urgência", "Retorno", "Convênio", "Reclamação"],
    "respostas": [
      ["ola", "Saudação", "Olá, {primeiro_nome}! Aqui é {atendente}, da {empresa}. Como posso ajudar?"],
      ["avaliacao", "Avaliação", "A avaliação é o primeiro passo: o(a) dentista examina e explica as opções com calma. Qual o melhor dia para você: {dia 1} ou {dia 2}?"],
      ["endereco", "Endereço", "Nosso endereço é …"],
      ["horarios", "Horários", "Atendemos de segunda a sexta, das … às …"],
      ["confirmar", "Confirmar consulta", "Confirmando sua consulta amanhã às … Posso contar com você?"],
      ["lembrete", "Lembrete", "Passando para lembrar da sua consulta …"],
      ["pos", "Pós-procedimento", "Como você está depois do procedimento? Qualquer desconforto, é só chamar."],
      ["avaliar", "Pedir avaliação", "Sua opinião ajuda muito: pode nos avaliar no Google? …"]],
    "motivos": ["Preço", "Sem retorno do paciente", "Escolheu outra clínica", "Sem interesse agora", "Convênio não aceito", "Distância/horário"],
    "departamentos": [
      {"nome": "Recepção", "padrao": true, "distribuicao": "rodizio", "horario": "odonto",
       "msg": "Olá! Nosso atendimento é de segunda a sexta, das 8h às 18h, e sábado até 12h. Já registramos sua mensagem e respondemos assim que abrirmos."},
      {"nome": "Comercial"}]
  }$j$::jsonb
  when 'oficina' then $j${
    "funis": [
      {"nome": "Orçamentos", "padrao": true, "ads": true, "etapas": [
        ["Nova conversa", "aberto", "nova"], ["Visita agendada", "aberto", "agendada"],
        ["Orçamento enviado", "aberto", "orcamento"], ["Não veio", "aberto", "faltou"],
        ["Aprovado / serviço feito", "ganho", "fechou"], ["Recusou", "perdido", "nao_fechou"],
        ["Perdido", "perdido", "perdida"]]},
      {"nome": "Pós-venda", "etapas": [
        ["Entregue", "aberto", null, 60], ["Revisão em 6 meses", "aberto", null, 80],
        ["Voltou", "ganho", null, 100], ["Não voltou", "perdido", null, 0]]}],
    "etiquetas": ["Revisão", "Freio", "Suspensão", "Motor", "Elétrica", "Ar-condicionado", "Pneus", "Garantia", "Reclamação"],
    "respostas": [
      ["ola", "Saudação", "Olá, {primeiro_nome}! Aqui é {atendente}, da {empresa}. Como posso ajudar com o seu carro?"],
      ["orcamento", "Orçamento", "Para montar o orçamento, me passe o modelo, o ano do carro e o que está acontecendo. Se puder, mande uma foto ou um vídeo."],
      ["pronto", "Carro pronto", "Seu carro está pronto para retirar … Atendemos até as …"],
      ["garantia", "Garantia", "O serviço tem garantia de … Qualquer coisa fora do normal, é só chamar que a gente verifica."],
      ["revisao", "Revisão", "Já está na hora da revisão do seu carro. Quer agendar? Temos horário em {dia 1} ou {dia 2}."],
      ["endereco", "Endereço", "Nosso endereço é …"],
      ["horarios", "Horários", "Atendemos de segunda a sexta, das … às …"],
      ["avaliar", "Pedir avaliação", "Sua opinião ajuda muito: pode nos avaliar no Google? …"]],
    "motivos": ["Preço", "Prazo", "Fez em outro lugar", "Sem retorno", "Desistiu do conserto"],
    "departamentos": [{"nome": "Atendimento", "padrao": true}, {"nome": "Oficina"}]
  }$j$::jsonb
  when 'loja' then $j${
    "funis": [
      {"nome": "Vendas", "padrao": true, "ads": true, "etapas": [
        ["Novo contato", "aberto", "nova"], ["Em atendimento", "aberto", "agendada"],
        ["Proposta enviada", "aberto", "orcamento"], ["Sumiu", "aberto", "faltou"],
        ["Vendido", "ganho", "fechou"], ["Não comprou", "perdido", "nao_fechou"],
        ["Perdido", "perdido", "perdida"]]},
      {"nome": "Pós-venda", "etapas": [
        ["Entregue", "aberto", null, 60], ["Recompra", "ganho", null, 100], ["Inativo", "perdido", null, 0]]}],
    "etiquetas": ["Novo cliente", "Recompra", "Troca", "Entrega", "Reclamação"],
    "respostas": [
      ["ola", "Saudação", "Olá, {primeiro_nome}! Aqui é {atendente}, da {empresa}. Como posso ajudar?"],
      ["catalogo", "Catálogo", "Aqui está o nosso catálogo: … Quer que eu separe algum modelo para você?"],
      ["entrega", "Entrega", "Entregamos em … O prazo é de … e o frete fica em …"],
      ["pagamento", "Pagamento", "Aceitamos Pix, cartão de crédito (em até …x) e débito."],
      ["troca", "Troca", "Você pode trocar em até … dias, com a etiqueta e a nota. É só trazer na loja ou chamar aqui."],
      ["endereco", "Endereço", "Nosso endereço é …"],
      ["avaliar", "Pedir avaliação", "Sua opinião ajuda muito: pode nos avaliar no Google? …"]],
    "motivos": ["Preço", "Sem estoque", "Frete", "Comprou em outro lugar", "Sem retorno"],
    "departamentos": [{"nome": "Vendas", "padrao": true}, {"nome": "Pós-venda"}]
  }$j$::jsonb
  else $j${
    "funis": [
      {"nome": "Vendas", "padrao": true, "ads": true, "etapas": [
        ["Novo", "aberto", "nova"], ["Qualificado", "aberto", "agendada"], ["Proposta", "aberto", "orcamento"],
        ["Sem resposta", "aberto", "faltou"], ["Ganho", "ganho", "fechou"], ["Perdido", "perdido", "nao_fechou"],
        ["Descartado", "perdido", "perdida"]]}],
    "etiquetas": ["Quente", "Frio", "Retorno", "Reclamação"],
    "respostas": [
      ["ola", "Saudação", "Olá, {primeiro_nome}! Aqui é {atendente}, da {empresa}. Como posso ajudar?"],
      ["proposta", "Proposta", "Segue a proposta que conversamos: … Fico à disposição para qualquer dúvida."],
      ["retorno", "Retorno", "Olá, {primeiro_nome}! Passando para saber se conseguiu ver a proposta. Posso ajudar em algo?"]],
    "motivos": ["Preço", "Sem retorno", "Concorrente", "Sem interesse"],
    "departamentos": [{"nome": "Atendimento", "padrao": true}]
  }$j$::jsonb
  end;

  -- funis e etapas: só se o cliente ainda não tem nenhum funil
  if not exists (select 1 from public.nx_funis where cliente_id = p_cliente) then
    for f, k in select x.value, x.ordinality from jsonb_array_elements(m -> 'funis') with ordinality x loop
      insert into public.nx_funis (cliente_id, nome, ordem, padrao, conta_no_ads)
      values (p_cliente, f ->> 'nome', k - 1, coalesce((f ->> 'padrao')::boolean, false),
              coalesce((f ->> 'ads')::boolean, false))
      returning id into v_funil;
      n_aberto := 0;
      for e, i in select x.value, x.ordinality from jsonb_array_elements(f -> 'etapas') with ordinality x loop
        v_tipo := e ->> 1;
        v_marco := e ->> 2;
        if v_marco is not null then
          v_cor := cores_marco ->> v_marco;
        elsif v_tipo = 'ganho' then
          v_cor := '#7FD1A5';
        elsif v_tipo = 'perdido' then
          v_cor := '#F08A74';
        else
          n_aberto := n_aberto + 1;
          v_cor := cores_aberto[((n_aberto - 1) % 3) + 1];
        end if;
        v_prob := coalesce((e ->> 3)::int, (prob_marco ->> v_marco)::int,
                           case v_tipo when 'ganho' then 100 when 'perdido' then 0 else 50 end);
        insert into public.nx_estagios (cliente_id, funil_id, nome, cor, ordem, tipo, marco, probabilidade)
        values (p_cliente, v_funil, e ->> 0, v_cor, i, v_tipo, v_marco, v_prob);
      end loop;
    end loop;
  end if;

  -- etiquetas (nome único por cliente, sem diferenciar maiúsculas)
  insert into public.nx_etiquetas (cliente_id, nome, cor)
  select p_cliente, x.value,
         case when x.value = 'Reclamação' then '#F08A74'
              else cores_etq[((x.ordinality::int - 1) % array_length(cores_etq, 1)) + 1] end
    from jsonb_array_elements_text(m -> 'etiquetas') with ordinality x
  on conflict do nothing;

  -- respostas rápidas (atalho único por cliente)
  insert into public.nx_respostas (cliente_id, atalho, titulo, corpo, ordem)
  select p_cliente, x.value ->> 0, x.value ->> 1, x.value ->> 2, x.ordinality
    from jsonb_array_elements(m -> 'respostas') with ordinality x
  on conflict (cliente_id, atalho) do nothing;

  -- motivos de perda (por nome)
  insert into public.nx_motivos_perda (cliente_id, nome, ordem)
  select p_cliente, x.value, x.ordinality
    from jsonb_array_elements_text(m -> 'motivos') with ordinality x
   where not exists (select 1 from public.nx_motivos_perda y
                      where y.cliente_id = p_cliente and lower(y.nome) = lower(x.value));

  -- departamentos (por nome; só um padrão)
  for d, k in select x.value, x.ordinality from jsonb_array_elements(m -> 'departamentos') with ordinality x loop
    if not exists (select 1 from public.nx_departamentos y
                    where y.cliente_id = p_cliente and lower(y.nome) = lower(d ->> 'nome')) then
      insert into public.nx_departamentos (cliente_id, nome, padrao, distribuicao, horario, msg_fora_horario, ordem)
      values (p_cliente, d ->> 'nome',
              coalesce((d ->> 'padrao')::boolean, false)
                and not exists (select 1 from public.nx_departamentos z where z.cliente_id = p_cliente and z.padrao),
              coalesce(d ->> 'distribuicao', 'manual'),
              case when d ->> 'horario' = 'odonto' then v_horario_odonto end,
              d ->> 'msg', k - 1);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4.8 / 4.9 Gatilhos
-- ------------------------------------------------------------
create or replace function public.nx_tg_cliente_antes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare o public.nx_orgs;
begin
  new.org_id := coalesce(new.org_id, public.nx_org_plataforma());
  if new.plano is null then
    select * into o from public.nx_orgs where id = new.org_id;
    new.plano := case when o.tipo = 'plataforma' then 'interno'
                      else coalesce(nullif(o.limites ->> 'plano_padrao', ''), 'essencial') end;
  end if;
  return new;
end $$;

create or replace function public.nx_tg_cliente_novo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.nx_pulsos (cliente_id) values (new.id) on conflict (cliente_id) do nothing;
  perform public.nx_aplicar_modelo(new.id, new.vertical);
  return null;
end $$;

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
    insert into public.nx_canais (cliente_id, nome, phone_number_id, status, departamento_id)
    values (new.id, 'WhatsApp principal', new.wa_phone_number_id, 'pendente',
            (select d.id from public.nx_departamentos d where d.cliente_id = new.id and d.padrao limit 1));
  end if;
  return null;
end $$;

create or replace function public.nx_tg_cliente_apagar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.nx_midia_lixo (cliente_id, path) values (old.id, old.id::text || '/');
  return old;
end $$;

create or replace function public.nx_tg_conta_antes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.org_id := coalesce(new.org_id, public.nx_org_plataforma());
  return new;
end $$;

create or replace function public.nx_tg_contato_antes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- contato nunca muda de empresa (isolamento: nenhuma RPC com bug leva dado de um cliente a outro)
  if tg_op = 'UPDATE' and new.cliente_id is distinct from old.cliente_id then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'cliente_id';
  end if;
  new.nome := left(new.nome, 160);
  new.obs := left(new.obs, 5000);
  if new.telefone is not null then
    new.telefone := public.nx_tel_normalizar(
      new.telefone,
      new.wa_id is not null and regexp_replace(new.telefone, '\D', '', 'g') = new.wa_id);
  end if;
  new.tel_chave := public.nx_tel_chave(new.telefone);
  new.busca := lower(extensions.unaccent('extensions.unaccent'::regdictionary,
                 coalesce(new.nome, '') || ' ' || coalesce(new.email, '') || ' ' ||
                 coalesce(new.telefone, '') || ' ' || coalesce(new.documento, '')));
  new.atualizado_em := now();
  return new;
end $$;

create or replace function public.nx_tg_contato_depois()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.nome is distinct from old.nome or new.telefone is distinct from old.telefone then
    update public.nx_leads l set
      nome = case when new.nome is distinct from old.nome then new.nome else l.nome end,
      telefone = case when new.telefone is distinct from old.telefone then new.telefone else l.telefone end
    where l.contato_id = new.id and l.status = 'aberto';
  end if;
  return null;
end $$;

create or replace function public.nx_tg_empresa_antes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.busca := lower(extensions.unaccent('extensions.unaccent'::regdictionary,
                 coalesce(new.nome, '') || ' ' || coalesce(new.documento, '') || ' ' ||
                 coalesce(new.email, '') || ' ' || coalesce(new.telefone, '') || ' ' || coalesce(new.cidade, '')));
  new.atualizado_em := now();
  return new;
end $$;

-- §4.9 — etapa ↔ marco, contato, herança de atribuição, trava do Ads, consulta_em.
-- ÚNICA implementação dessas regras (F4 e F7 só traduzem os erros).
create or replace function public.nx_tg_negocio_antes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.nx_estagios;
  ct public.nx_contatos;
  v_funil uuid;
  v_ads_antigo boolean;
  v_ads_novo boolean;
begin
  if current_setting('nx.backfill', true) = '1' then return new; end if;

  if tg_op = 'INSERT' then
    -- 1. contato
    if new.contato_id is null and new.telefone is not null then
      new.contato_id := public.nx_contato_por_tel(new.cliente_id, new.telefone);
      if new.contato_id is null then
        if public.nx_tel_normalizar(new.telefone) is not null then
          insert into public.nx_contatos as k (cliente_id, nome, telefone, origem, plataforma, campanha_ext, anuncio_ext, ctwa_clid)
          values (new.cliente_id, new.nome, new.telefone,
                  case when new.origem in ('anuncio','whatsapp','indicacao','organico','manual','site') then new.origem else 'manual' end,
                  new.plataforma, new.campanha_ext, new.anuncio_ext, new.ctwa_clid)
          on conflict (cliente_id, tel_chave) where tel_chave is not null
          do update set nome = coalesce(k.nome, excluded.nome),
                        plataforma = coalesce(k.plataforma, excluded.plataforma),
                        campanha_ext = coalesce(k.campanha_ext, excluded.campanha_ext),
                        anuncio_ext = coalesce(k.anuncio_ext, excluded.anuncio_ext),
                        ctwa_clid = coalesce(k.ctwa_clid, excluded.ctwa_clid)
          returning k.id into new.contato_id;
        end if;
      else
        -- achou: só preenche a atribuição vazia (1º toque nunca é sobrescrito)
        update public.nx_contatos k set
          plataforma = coalesce(k.plataforma, new.plataforma),
          campanha_ext = coalesce(k.campanha_ext, new.campanha_ext),
          anuncio_ext = coalesce(k.anuncio_ext, new.anuncio_ext),
          ctwa_clid = coalesce(k.ctwa_clid, new.ctwa_clid)
        where k.id = new.contato_id
          and ((k.plataforma is null and new.plataforma is not null)
            or (k.campanha_ext is null and new.campanha_ext is not null)
            or (k.anuncio_ext is null and new.anuncio_ext is not null)
            or (k.ctwa_clid is null and new.ctwa_clid is not null));
      end if;
    end if;

    -- 2. nome/telefone vindos do contato (e o contato tem de ser do mesmo cliente)
    if new.contato_id is not null then
      select * into ct from public.nx_contatos where id = new.contato_id;
      if ct.id is null or ct.cliente_id <> new.cliente_id then
        raise exception 'contato_nao_encontrado' using errcode = '22023';
      end if;
      new.nome := coalesce(new.nome, ct.nome);
      new.telefone := coalesce(new.telefone, ct.telefone);
    end if;

    -- 3. etapa
    if new.estagio_id is not null then
      select * into e from public.nx_estagios where id = new.estagio_id and cliente_id = new.cliente_id;
      if e.id is null then raise exception 'estagio_invalido' using errcode = '22023'; end if;
    else
      if new.funil_id is not null then
        select f.id into v_funil from public.nx_funis f where f.id = new.funil_id and f.cliente_id = new.cliente_id;
        if v_funil is null then raise exception 'funil_invalido' using errcode = '22023', hint = 'nao_encontrado'; end if;
      else
        select f.id into v_funil from public.nx_funis f where f.cliente_id = new.cliente_id and f.padrao limit 1;
      end if;
      if v_funil is not null then
        select * into e from public.nx_estagios where funil_id = v_funil and marco = new.etapa order by ordem limit 1;
        if e.id is null then
          select * into e from public.nx_estagios where funil_id = v_funil and tipo = 'aberto' order by ordem limit 1;
        end if;
      end if;
    end if;

    -- 4. funil/etapa/status
    if e.id is not null then
      new.funil_id := e.funil_id;
      new.estagio_id := e.id;
      if e.marco is not null then new.etapa := e.marco; end if;
      new.status := e.tipo;
    else
      new.status := case new.etapa when 'fechou' then 'ganho' when 'nao_fechou' then 'perdido'
                                   when 'perdida' then 'perdido' else 'aberto' end;
    end if;

    -- 5. herança de atribuição (só negócio 'manual' num funil do Ads, 1× a cada 30 dias)
    if new.origem = 'manual' and new.plataforma is null and new.contato_id is not null and new.funil_id is not null then
      select * into ct from public.nx_contatos where id = new.contato_id;
      if ct.plataforma is not null
         and exists (select 1 from public.nx_funis f where f.id = new.funil_id and f.conta_no_ads)
         and not exists (select 1 from public.nx_leads l
                          where l.contato_id = new.contato_id and l.funil_id = new.funil_id
                            and l.criado_em > now() - interval '30 days') then
        new.origem := 'anuncio';
        new.plataforma := ct.plataforma;
        new.campanha_ext := ct.campanha_ext;
        new.anuncio_ext := ct.anuncio_ext;
        new.ctwa_clid := ct.ctwa_clid;
      end if;
    end if;

    -- 6. consulta
    if new.consulta_em is not null then
      new.data_consulta := (new.consulta_em at time zone 'America/Sao_Paulo')::date;
    end if;

    -- 7. carimbos
    new.estagio_em := now();
    if new.status <> 'aberto' then new.fechado_em := coalesce(new.fechado_em, now()); end if;

    -- 8. ordem (mais novo no topo)
    new.ordem := coalesce(new.ordem, -extract(epoch from clock_timestamp()));
    return new;
  end if;

  -- UPDATE
  -- negócio nunca muda de empresa (isolamento)
  if new.cliente_id is distinct from old.cliente_id then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'cliente_id';
  end if;
  -- 0. contato trocado: completa nome/telefone vazios (mesmo cliente)
  if new.contato_id is not null and new.contato_id is distinct from old.contato_id then
    select * into ct from public.nx_contatos where id = new.contato_id;
    if ct.id is null or ct.cliente_id <> new.cliente_id then
      raise exception 'contato_nao_encontrado' using errcode = '22023';
    end if;
    new.nome := coalesce(new.nome, ct.nome);
    new.telefone := coalesce(new.telefone, ct.telefone);
  end if;

  if new.estagio_id is not null and new.estagio_id is distinct from old.estagio_id then
    -- a. etapa nova (pode trocar de funil, sujeito à trava do Ads)
    select * into e from public.nx_estagios where id = new.estagio_id and cliente_id = new.cliente_id;
    if e.id is null then raise exception 'estagio_invalido' using errcode = '22023'; end if;
    if old.funil_id is not null and e.funil_id <> old.funil_id then
      select f.conta_no_ads into v_ads_antigo from public.nx_funis f where f.id = old.funil_id;
      if coalesce(v_ads_antigo, false) then
        if old.status <> 'aberto' then
          raise exception 'funil_invalido' using errcode = '22023', hint = 'fechado_no_ads';
        end if;
        select f.conta_no_ads into v_ads_novo from public.nx_funis f where f.id = e.funil_id;
        if not coalesce(v_ads_novo, false) then
          raise exception 'funil_invalido' using errcode = '22023', hint = 'sai_do_ads';
        end if;
      end if;
    end if;
    new.funil_id := e.funil_id;
    if e.marco is not null then new.etapa := e.marco; end if;
    new.status := e.tipo;
    new.estagio_em := now();
  elsif new.funil_id is not null and new.funil_id is distinct from old.funil_id then
    -- c. funil mudou sem a etapa: trava do Ads e, em qualquer caso, erro (andam juntos)
    if old.funil_id is not null then
      select f.conta_no_ads into v_ads_antigo from public.nx_funis f where f.id = old.funil_id;
      if coalesce(v_ads_antigo, false) then
        if old.status <> 'aberto' then
          raise exception 'funil_invalido' using errcode = '22023', hint = 'fechado_no_ads';
        end if;
        select f.conta_no_ads into v_ads_novo from public.nx_funis f where f.id = new.funil_id;
        if not coalesce(v_ads_novo, false) then
          raise exception 'funil_invalido' using errcode = '22023', hint = 'sai_do_ads';
        end if;
      end if;
    end if;
    raise exception 'estagio_invalido' using errcode = '22023', hint = 'funil_sem_etapa';
  elsif new.etapa is distinct from old.etapa then
    -- b. etapa (marco) mudou pelo painel clássico / nx_lead_salvar / webhook
    if new.funil_id is not null then
      select * into e from public.nx_estagios where funil_id = new.funil_id and marco = new.etapa order by ordem limit 1;
    end if;
    if e.id is not null then
      new.estagio_id := e.id;
      new.status := e.tipo;
      new.estagio_em := now();
    else
      new.status := case new.etapa when 'fechou' then 'ganho' when 'nao_fechou' then 'perdido'
                                   when 'perdida' then 'perdido' else 'aberto' end;
    end if;
  end if;

  -- d. consulta
  if new.consulta_em is distinct from old.consulta_em and new.consulta_em is not null then
    new.data_consulta := (new.consulta_em at time zone 'America/Sao_Paulo')::date;
  end if;

  -- e. status
  if new.status is distinct from old.status then
    if new.status = 'aberto' then
      new.fechado_em := null;
      new.motivo_perda_id := null;
      new.motivo_perda_txt := null;
    else
      new.fechado_em := now();
    end if;
  end if;
  return new;
end $$;

create or replace function public.nx_tg_negocio_depois()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_hist boolean := coalesce(current_setting('nx.sem_historico', true), '') <> '1';
begin
  if current_setting('nx.backfill', true) = '1' then return null; end if;
  if tg_op = 'INSERT' then
    if v_hist then
      perform public.nx_historico_add(new.cliente_id, 'negocio_criado', new.contato_id, new.id, null,
        jsonb_build_object('funil', new.funil_id, 'estagio', new.estagio_id, 'titulo', new.titulo, 'origem', new.origem));
    end if;
    -- liga a conversa aberta ao negócio que o webhook acabou de criar no funil padrão
    if new.contato_id is not null
       and exists (select 1 from public.nx_funis f where f.id = new.funil_id and f.padrao) then
      update public.nx_conversas cv set negocio_id = new.id
       where cv.contato_id = new.contato_id and cv.cliente_id = new.cliente_id
         and cv.status <> 'resolvida' and cv.negocio_id is null;
    end if;
    return null;
  end if;

  if not v_hist then return null; end if;
  if new.estagio_id is distinct from old.estagio_id and new.estagio_id is not null then
    perform public.nx_historico_add(new.cliente_id, 'estagio', new.contato_id, new.id, null,
      jsonb_build_object('de', old.estagio_id, 'para', new.estagio_id,
                         'de_nome', (select s.nome from public.nx_estagios s where s.id = old.estagio_id),
                         'para_nome', (select s.nome from public.nx_estagios s where s.id = new.estagio_id)));
  end if;
  if new.status is distinct from old.status then
    if new.status = 'ganho' then
      perform public.nx_historico_add(new.cliente_id, 'ganho', new.contato_id, new.id, null,
        jsonb_build_object('valor', new.valor));
    elsif new.status = 'perdido' then
      perform public.nx_historico_add(new.cliente_id, 'perdido', new.contato_id, new.id, null,
        jsonb_build_object('motivo', new.motivo_perda_id, 'texto', new.motivo_perda_txt));
    else
      perform public.nx_historico_add(new.cliente_id, 'reaberto', new.contato_id, new.id, null, '{}'::jsonb);
    end if;
  end if;
  if new.dono_id is distinct from old.dono_id then
    perform public.nx_historico_add(new.cliente_id, 'dono', new.contato_id, new.id, null,
      jsonb_build_object('de', old.dono_id, 'para', new.dono_id));
  end if;
  return null;
end $$;

create or replace function public.nx_tg_conversa_depois()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.nx_pulso_bater(new.cliente_id);
  if coalesce(current_setting('nx.sem_historico', true), '') = '1' then return null; end if;
  if tg_op = 'INSERT' then
    perform public.nx_historico_add(new.cliente_id, 'conversa_aberta', new.contato_id, new.negocio_id, new.id,
      jsonb_build_object('protocolo', new.protocolo, 'canal', new.canal_id));
    return null;
  end if;
  if new.status = 'resolvida' and old.status is distinct from 'resolvida' then
    perform public.nx_historico_add(new.cliente_id, 'conversa_resolvida', new.contato_id, new.negocio_id, new.id,
      jsonb_build_object('protocolo', new.protocolo));
  end if;
  if new.atribuida_a is distinct from old.atribuida_a then
    perform public.nx_historico_add(new.cliente_id, 'atribuida', new.contato_id, new.negocio_id, new.id,
      jsonb_build_object('de', old.atribuida_a, 'para', new.atribuida_a));
  end if;
  return null;
end $$;

create or replace function public.nx_tg_mensagem_antes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

create or replace function public.nx_tg_pulso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.nx_pulso_bater(new.cliente_id);
  return null;
end $$;

-- os gatilhos (drop if exists + create = idempotente). Nomes com prefixo de
-- ordem onde a ordem importa: o modelo (departamento padrão) antes do canal.
drop trigger if exists nx_cliente_antes on public.nx_clientes;
create trigger nx_cliente_antes before insert on public.nx_clientes
  for each row execute function public.nx_tg_cliente_antes();
drop trigger if exists nx_cliente_a_novo on public.nx_clientes;
create trigger nx_cliente_a_novo after insert on public.nx_clientes
  for each row execute function public.nx_tg_cliente_novo();
drop trigger if exists nx_cliente_b_canal on public.nx_clientes;
create trigger nx_cliente_b_canal after insert or update of wa_phone_number_id on public.nx_clientes
  for each row execute function public.nx_tg_cliente_canal();
drop trigger if exists nx_cliente_apagar on public.nx_clientes;
create trigger nx_cliente_apagar before delete on public.nx_clientes
  for each row execute function public.nx_tg_cliente_apagar();

drop trigger if exists nx_conta_antes on public.nx_contas;
create trigger nx_conta_antes before insert on public.nx_contas
  for each row execute function public.nx_tg_conta_antes();

drop trigger if exists nx_contato_antes on public.nx_contatos;
create trigger nx_contato_antes before insert or update on public.nx_contatos
  for each row execute function public.nx_tg_contato_antes();
drop trigger if exists nx_contato_depois on public.nx_contatos;
create trigger nx_contato_depois after update of nome, telefone on public.nx_contatos
  for each row execute function public.nx_tg_contato_depois();

drop trigger if exists nx_empresa_antes on public.nx_empresas;
create trigger nx_empresa_antes before insert or update on public.nx_empresas
  for each row execute function public.nx_tg_empresa_antes();

drop trigger if exists nx_negocio_antes on public.nx_leads;
create trigger nx_negocio_antes before insert or update on public.nx_leads
  for each row execute function public.nx_tg_negocio_antes();
drop trigger if exists nx_negocio_depois on public.nx_leads;
create trigger nx_negocio_depois after insert or update on public.nx_leads
  for each row execute function public.nx_tg_negocio_depois();

drop trigger if exists nx_conversa_depois on public.nx_conversas;
create trigger nx_conversa_depois after insert or update on public.nx_conversas
  for each row execute function public.nx_tg_conversa_depois();

drop trigger if exists nx_mensagem_antes on public.nx_mensagens;
create trigger nx_mensagem_antes before update on public.nx_mensagens
  for each row execute function public.nx_tg_mensagem_antes();
drop trigger if exists nx_mensagem_depois on public.nx_mensagens;
create trigger nx_mensagem_depois after insert or update on public.nx_mensagens
  for each row execute function public.nx_tg_pulso();

drop trigger if exists nx_notif_depois on public.nx_notificacoes;
create trigger nx_notif_depois after insert on public.nx_notificacoes
  for each row execute function public.nx_tg_pulso();

-- ------------------------------------------------------------
-- Permissões das funções deste arquivo
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'nx_rank','nx_org_plataforma','nx_tel_normalizar','nx_tel_chave','nx_contato_por_tel','nx_cfg_publico',
         'nx_link_base','nx_conta_no_escopo','nx_exigir_modulo','nx_limite','nx_uso','nx_exigir_limite_org',
         'nx_exigir_limite','nx_pulso_bater','nx_pulso_lote_fim','nx_proximo','nx_protocolo','nx_horario_aberto',
         'nx_proximo_horario','nx_segredo_gravar','nx_segredo_ler','nx_historico_add','nx_notificar','nx_auditar',
         'nx_ctx','nx_fn_ctx','nx_cv_visivel','nx_pulso','nx_aplicar_modelo',
         'nx_tg_cliente_antes','nx_tg_cliente_novo','nx_tg_cliente_canal','nx_tg_cliente_apagar','nx_tg_conta_antes',
         'nx_tg_contato_antes','nx_tg_contato_depois','nx_tg_empresa_antes','nx_tg_negocio_antes',
         'nx_tg_negocio_depois','nx_tg_conversa_depois','nx_tg_mensagem_antes','nx_tg_pulso')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    if r.proname = 'nx_pulso' then
      execute format('grant execute on function %s to anon, authenticated, service_role', r.fn);
    elsif r.proname not like 'nx\_tg\_%' then
      execute format('grant execute on function %s to service_role', r.fn);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4.12 Backfill (um bloco só = uma transação; gatilhos de negócio pulam)
-- ------------------------------------------------------------
do $$
declare v_plat uuid; r record;
begin
  perform set_config('nx.backfill', '1', true);
  v_plat := public.nx_org_plataforma();

  -- 1. org e plano
  update public.nx_contas set org_id = v_plat where org_id is null;
  update public.nx_clientes set org_id = coalesce(org_id, v_plat), plano = coalesce(plano, 'interno')
   where org_id is null or plano is null;

  -- 2. pulso de cada cliente
  insert into public.nx_pulsos (cliente_id) select c.id from public.nx_clientes c on conflict (cliente_id) do nothing;

  -- 3. modelo para cliente sem funil
  for r in select c.id, c.vertical from public.nx_clientes c
            where not exists (select 1 from public.nx_funis f where f.cliente_id = c.id) loop
    perform public.nx_aplicar_modelo(r.id, r.vertical);
  end loop;

  -- 4. negócios → funil padrão + etapa pelo marco
  update public.nx_leads l set
    funil_id = f.id,
    estagio_id = (select s.id from public.nx_estagios s where s.funil_id = f.id and s.marco = l.etapa order by s.ordem limit 1),
    status = case l.etapa when 'fechou' then 'ganho' when 'nao_fechou' then 'perdido' when 'perdida' then 'perdido' else 'aberto' end,
    estagio_em = l.atualizado_em,
    -- data da consulta ao meio-dia de SP (agrupa no mesmo dia em qualquer fuso de leitura)
    fechado_em = case when l.etapa in ('fechou', 'nao_fechou', 'perdida')
                      then coalesce((l.data_consulta + time '12:00') at time zone 'America/Sao_Paulo', l.atualizado_em) end,
    ordem = -extract(epoch from l.criado_em)
  from public.nx_funis f
  where f.cliente_id = l.cliente_id and f.padrao and l.funil_id is null;

  -- 5. contatos: um por (cliente, tel_chave); nome do lead mais recente, atribuição
  --    e origem do mais antigo, criado_em = o menor
  insert into public.nx_contatos (cliente_id, nome, telefone, origem, plataforma, campanha_ext, anuncio_ext, ctwa_clid, criado_em)
  select g.cliente_id, g.nome, g.telefone,
         case when g.origem in ('anuncio','whatsapp','indicacao','organico','manual','site') then g.origem else 'manual' end,
         g.plataforma, g.campanha_ext, g.anuncio_ext, g.ctwa_clid, g.criado_em
    from (
      select b.cliente_id, b.chave,
             (array_agg(b.nome order by b.criado_em desc, b.id desc) filter (where b.nome is not null))[1] as nome,
             (array_agg(b.tel_n order by b.criado_em desc, b.id desc))[1] as telefone,
             (array_agg(b.origem order by b.criado_em, b.id))[1] as origem,
             (array_agg(b.plataforma order by b.criado_em, b.id) filter (where b.plataforma is not null))[1] as plataforma,
             (array_agg(b.campanha_ext order by b.criado_em, b.id) filter (where b.plataforma is not null))[1] as campanha_ext,
             (array_agg(b.anuncio_ext order by b.criado_em, b.id) filter (where b.plataforma is not null))[1] as anuncio_ext,
             (array_agg(b.ctwa_clid order by b.criado_em, b.id) filter (where b.plataforma is not null))[1] as ctwa_clid,
             min(b.criado_em) as criado_em
        from (select l.*, public.nx_tel_normalizar(l.telefone) as tel_n,
                     public.nx_tel_chave(public.nx_tel_normalizar(l.telefone)) as chave
                from public.nx_leads l
               where l.telefone is not null and l.contato_id is null) b
       where b.chave is not null
       group by b.cliente_id, b.chave) g
  on conflict (cliente_id, tel_chave) where tel_chave is not null do nothing;

  update public.nx_leads l set contato_id = k.id
    from public.nx_contatos k
   where l.contato_id is null and l.telefone is not null
     and k.cliente_id = l.cliente_id
     and k.tel_chave = public.nx_tel_chave(public.nx_tel_normalizar(l.telefone));

  -- 6. canais para cliente com wa_phone_number_id
  insert into public.nx_canais (cliente_id, nome, phone_number_id, status, departamento_id)
  select c.id, 'WhatsApp principal', c.wa_phone_number_id, 'pendente',
         (select d.id from public.nx_departamentos d where d.cliente_id = c.id and d.padrao limit 1)
    from public.nx_clientes c
   where c.wa_phone_number_id is not null
     and not exists (select 1 from public.nx_canais k where k.phone_number_id = c.wa_phone_number_id);

  perform set_config('nx.backfill', '0', true);
end $$;

-- depois do backfill: org_id e plano obrigatórios (os gatilhos BEFORE INSERT preenchem)
alter table public.nx_clientes alter column org_id set not null;
alter table public.nx_clientes alter column plano set not null;
alter table public.nx_contas alter column org_id set not null;

-- ------------------------------------------------------------
-- Índices de chave estrangeira que pesam em exclusão em cascata / set null
-- e em consultas por etapa/período (acrescentados depois da 1ª aplicação;
-- get_advisors "unindexed_foreign_keys"). Idempotentes.
-- ------------------------------------------------------------
create index if not exists nx_leads_estagio on public.nx_leads(estagio_id) where estagio_id is not null;
create index if not exists nx_leads_funil on public.nx_leads(funil_id) where funil_id is not null;
create index if not exists nx_conversas_canal on public.nx_conversas(canal_id) where canal_id is not null;
create index if not exists nx_conversas_depto on public.nx_conversas(departamento_id) where departamento_id is not null;
create index if not exists nx_historico_cli on public.nx_historico(cliente_id, criado_em);
create index if not exists nx_notas_cli on public.nx_notas(cliente_id);
create index if not exists nx_fila_cli on public.nx_envios_fila(cliente_id, criado_em desc);
create index if not exists nx_sessoes_conta on public.nx_sessoes(conta_id);

notify pgrst, 'reload schema';
