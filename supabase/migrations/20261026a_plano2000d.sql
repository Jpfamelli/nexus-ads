-- ============================================================
-- ÓRBITA — 20261026a_plano2000d.sql (plano «2000d», frente srv · segurança, concorrência, limites do plano, teste, IA e envios)
-- Migração ADITIVA e IDEMPOTENTE, construída SOBRE a 20261022a: colunas/índices/tabelas com if not exists, funções com
-- create or replace a partir da definição EM VIGOR (anotada em cada bloco). Nada de drop de coluna, tabela ou dado.
-- As telas que dependem dela: Conversas, CRM, Início, Configurações (Automações, Marca, Equipe) e a área da plataforma.
--
--   Segurança/contas: DS-128 e-mail repetido não é revelado · DS-129 código pelo resumo · DS-130 senhas mais usadas recusadas
--     (nx_senha_validar → senha_fraca) · DS-131 bcrypt atual (login regrava o custo antigo) · DS-135 convite só para o e-mail
--     convidado · DS-151 teto do jsonb vindo do painel · DS-153 auditoria imutável (faxina só com nx.faxina) · DS-156 admins
--     avisados quando o suporte entra · DS-346 quem perde o acesso perde as preferências · DS-273 empresa parada por cobrança:
--     o admin ainda lê e exporta
--   Concorrência: DS-001/DS-125/DS-315 nx_cv_atribuir_v2 com o dono que a tela viu (409 dono_mudou; hint = nome do dono atual) +
--     a sobrecarga do contrato da tela (p_dono_esperado, p_conferir_dono) · DS-002 «Pegar a próxima» · DS-003 etiquetas da
--     conversa por diferença · DS-051/DR-014 etiquetas de negócios em lote por diferença · DS-022 atribuida_em em todo caminho
--   Destinatários válidos: DS-124 rodízio pula conta/acesso suspenso e ausente · DS-127 aviso não vai para conta suspensa
--   Limites do plano e teste (14 dias): DS-280 módulos efetivos = cliente ∩ plano · DS-281 departamentos, respostas prontas e envios
--     automáticos contam no limite · DS-282 limite de contatos em todo caminho · DS-276 marcos do teste saem uma vez cada ·
--     DS-277/DU-241 prorrogar o teste uma vez · DS-303 «hoje» em São Paulo · DU-215 dias_teste da revenda
--   IA: DS-169/DS-188 nx_ia_reservar com ações novas (simular, reescrever, traduzir, transcrever) e tetos diários
--   Envios em massa: DS-173 opt-out/bloqueado sai da fila · DU-041 automação «só daqui para frente» · DU-042/DU-043/DU-044/AX-059/
--     DS-350/DU-383/DS-331 nx_auto_envio_guarda em toda mensagem automática · DU-101 mensagens automáticas de hoje × teto
--   Telas: DS-009/DC-021/DA-161/DR-334 preferências da pessoa no servidor · DS-080/DR-218/DR-261 metas do mês · DS-069/DR-174/
--     DS-165 pedidos do titular (LGPD) · DU-145/DU-147/DU-152/DU-153/DU-202/DU-214/DU-445/DU-140/UC-006 chaves novas da marca ·
--     DA-009/DA-025/DA-093/DA-187/DA-346/DA-402 chaves novas da configuração (nx_cfg_validar)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colunas, tabelas novas e índices (tudo com if not exists; nenhum dado existente muda)
-- ------------------------------------------------------------
-- DS-124 / DR-222 / DU-128: «ausente até» por pessoa (o rodízio pula quem está ausente)
alter table public.nx_contas add column if not exists ausente_ate timestamptz;
-- DS-022: quando a conversa ganhou o dono atual (preenchido por gatilho quando atribuida_a muda)
alter table public.nx_conversas add column if not exists atribuida_em timestamptz;
-- DS-273 / UCB-092: por que o cliente está parado ('cobranca' deixa o admin só ler e exportar)
alter table public.nx_clientes add column if not exists motivo_status text;
-- DS-276: marcos do aviso de fim de teste já dados (não depende de o cron rodar no dia exato)
alter table public.nx_clientes add column if not exists teste_avisos jsonb not null default '{}'::jsonb;
-- DS-277 / DU-241: a prorrogação do teste é uma só (sem override)
alter table public.nx_clientes add column if not exists teste_prorrogado_em timestamptz;
-- DU-213 / DU-214 / DU-217 / DS-274: dados do cadastro de teste (WhatsApp de quem testa, aceite, tipo escolhido)
alter table public.nx_clientes add column if not exists cadastro jsonb not null default '{}'::jsonb;
-- UCB-089: quando o teste virou cliente
alter table public.nx_clientes add column if not exists convertido_em timestamptz;
-- DU-041: «só daqui para frente» — quem já estava na situação quando a automação foi ligada não recebe
alter table public.nx_automacoes add column if not exists ignorar_antes timestamptz;
-- DU-383: o disjuntor desligou a automação (motivo e quando)
alter table public.nx_automacoes add column if not exists pausada_motivo text;
alter table public.nx_automacoes add column if not exists pausada_em timestamptz;
-- DS-062 / DR-120: tarefa que se repete (a próxima nasce ao concluir) e de qual veio
alter table public.nx_tarefas add column if not exists repetir text;
alter table public.nx_tarefas add column if not exists origem_id bigint;

-- DS-169: as ações novas de IA (simular, reescrever, traduzir, transcrever) entram no uso e nas reservas — a mesma troca da 20261013c
do $$
declare r record; t text;
begin
  foreach t in array array['nx_ia_uso', 'nx_ia_reservas'] loop
    for r in select c.conname from pg_constraint c
              where c.conrelid = ('public.' || t)::regclass and c.contype = 'c'
                and pg_get_constraintdef(c.oid) like '%sugerir%'
                and pg_get_constraintdef(c.oid) not like '%traduzir%' loop
      execute format('alter table public.%I drop constraint %I', t, r.conname);   -- lint:permitido troca do check por um mais largo
    end loop;
    if not exists (select 1 from pg_constraint c
                    where c.conrelid = ('public.' || t)::regclass and c.conname = t || '_acao_check4') then
      execute format('alter table public.%I add constraint %I check (acao in (%L, %L, %L, %L, %L, %L, %L, %L))',
                     t, t || '_acao_check4', 'sugerir', 'resumir', 'automacao', 'relatorio', 'simular', 'reescrever', 'traduzir', 'transcrever');
    end if;
  end loop;
end $$;

-- DS-275: plano «teste» com limites próprios (só se não existir; o gestor pode mudar depois pelo Admin → Planos)
insert into public.nx_planos (id, nome, preco_mensal, limites, modulos, ordem, ativo)
values ('teste', 'Teste grátis', null,
        '{"usuarios":2,"canais":1,"funis":2,"automacoes":5,"contatos":500,"ia_mes":100,"departamentos":2,"respostas":30,"envios_dia":100}'::jsonb,
        '{crm,conversas,relatorios,automacoes}', 0, false)
on conflict (id) do nothing;

-- DS-009 / DC-021 / DA-161 / DR-334: preferências da pessoa por empresa (lista branca de chaves; RLS sem política)
create table if not exists public.nx_conta_pref (
  conta_id uuid not null references public.nx_contas(id) on delete cascade,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  chave text not null check (chave ~ '^[a-z][a-z0-9_]{1,39}$'),
  valor jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (conta_id, cliente_id, chave)
);
alter table public.nx_conta_pref enable row level security;

-- DS-069 / DR-174 / DS-165: pedidos do titular (LGPD) — só o resumo do contato (hash), nunca o telefone
create table if not exists public.nx_lgpd_pedidos (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  contato_hash text,
  tipo text not null check (tipo in ('acesso', 'exclusao', 'anonimizacao', 'correcao', 'portabilidade')),
  pedido_em timestamptz not null default now(),
  executado_em timestamptz,
  executado_por uuid references public.nx_contas(id) on delete set null,
  protocolo text not null default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10))
);
create index if not exists nx_lgpd_pedidos_cliente on public.nx_lgpd_pedidos (cliente_id, pedido_em desc);
alter table public.nx_lgpd_pedidos enable row level security;

-- DS-080 / DR-218 / DR-261: metas do mês (por pessoa; conta nula = a empresa)
create table if not exists public.nx_metas (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  conta_id uuid references public.nx_contas(id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  valor numeric(14,2) check (valor is null or valor >= 0),
  leads int check (leads is null or leads >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.nx_contas(id) on delete set null
);
create unique index if not exists nx_metas_chave on public.nx_metas (cliente_id, coalesce(conta_id, '00000000-0000-0000-0000-000000000000'::uuid), mes);
alter table public.nx_metas enable row level security;

-- índices das RPCs novas (DS-002 fila sem dono, DS-215 tarefas concluídas, DS-177 faxina das idempotências)
create index if not exists nx_conversas_sem_dono_fila on public.nx_conversas (cliente_id, ultima_entrada_em)
  where atribuida_a is null and status in ('aberta', 'pendente') and not oculta;
create index if not exists nx_tarefas_concluidas on public.nx_tarefas (cliente_id, concluida_em desc) where concluida_em is not null;
create index if not exists nx_requisicoes_criado on public.nx_requisicoes (criado_em);
-- DU-042: a trava de envio em massa conta a fila da empresa (origem automação) no dia; por contato já existe nx_fila_contato
create index if not exists nx_envios_fila_auto_cliente on public.nx_envios_fila (cliente_id, criado_em desc) where origem = 'automacao';

-- ------------------------------------------------------------
-- 2. Auxiliares internas (antes das cópias que as usam)
-- ------------------------------------------------------------
-- plano 2000d · DS-303: «hoje» sempre em São Paulo (teste, cobrança, metas); o servidor roda em UTC
create or replace function public.nx_hoje_sp()
returns date
language sql stable
security definer
set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- plano 2000d · DS-151: teto do tamanho de um jsonb vindo do painel (filtro, preferência…): acima → dados_invalidos (hint = campo)
create or replace function public.nx_json_teto(p jsonb, p_bytes int, p_campo text default 'json')
returns void
language plpgsql immutable
security definer
set search_path = ''
as $$
begin
  if p is not null and octet_length(p::text) > coalesce(p_bytes, 16384) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = coalesce(p_campo, 'json');
  end if;
end $$;

-- plano 2000d · DS-124 / DS-125 / DS-127: a pessoa pode receber conversa/aviso NESTA empresa? (conta aprovada, conta e acesso não
-- suspensos). p_ausente = true também pula quem marcou «ausente até» (rodízio e próxima da fila).
create or replace function public.nx_conta_disponivel(p_conta uuid, p_cliente uuid, p_ausente boolean default false)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
                  where a.conta_id = p_conta and a.cliente_id = p_cliente and k.aprovado
                    and a.suspenso_em is null and k.suspenso_em is null
                    and (not coalesce(p_ausente, false) or k.ausente_ate is null or k.ausente_ate <= now()))
$$;

-- plano 2000d · DS-131: custo do bcrypt das senhas novas e regravadas (o login regrava em silêncio quem ainda está com custo menor)
create or replace function public.nx_bcrypt_custo()
returns int
language sql immutable
security definer
set search_path = ''
as $$ select 12 $$;

-- plano 2000d · DS-130: as senhas mais usadas (vazadas aos milhões) são recusadas no servidor, não só no aparelho. Lista curta e
-- fixa (comparada sem maiúsculas, sem espaços nas pontas); a regra completa do aparelho continua (senhaFraca em login.js).
create or replace function public.nx_senha_comum(p_senha text)
returns boolean
language sql immutable
security definer
set search_path = ''
as $$
  select lower(btrim(coalesce(p_senha, ''))) = any (array[
    '12345678', '123456789', '1234567890', '12345678910', '87654321', '11111111', '00000000', '12341234', '11223344', '123123123',
    'password', 'password1', 'password123', 'senha123', 'senha1234', 'senhasenha', 'mudar123', 'trocar123', 'qwerty123', 'qwertyuiop',
    'abc12345', 'abcd1234', 'a1b2c3d4', '1q2w3e4r', '1qaz2wsx', 'asdf1234', 'zaq12wsx', 'iloveyou', 'admin123', 'administrador',
    'brasil123', 'flamengo', 'flamengo123', 'corinthians', 'palmeiras', 'saopaulo', 'vasco123', 'gremio123', 'internacional', 'cruzeiro',
    'santos123', 'botafogo', 'princesa', 'jesus123', 'deusefiel', 'amor1234', 'teamo123', 'meuamor', 'gabriel123', 'lucas123',
    'matheus123', 'mariana123', 'juliana123', 'fernanda', 'camila123', 'welcome1', 'sunshine', 'princess', 'football', 'baseball',
    'starwars', 'whatever', 'trustno1', 'superman', 'batman123', 'master123', 'dragon123', 'monkey123', 'letmein1', 'changeme'])
$$;

-- plano 2000d · DS-022: quando a conversa ganhou o dono atual — vale para todo caminho (atribuir, rodízio, próxima da fila, automação)
create or replace function public.nx_tg_conversa_atribuida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.atribuida_a is distinct from old.atribuida_a then
    new.atribuida_em := case when new.atribuida_a is null then null else now() end;
  end if;
  return new;
end $$;
drop trigger if exists nx_conversas_atribuida_em on public.nx_conversas;   -- lint:permitido gatilho recriado (idempotente), nada de dado
create trigger nx_conversas_atribuida_em before update of atribuida_a on public.nx_conversas
  for each row execute function public.nx_tg_conversa_atribuida();

-- plano 2000d · DS-346: a pessoa que perde o acesso a uma empresa perde também as preferências guardadas nela
create or replace function public.nx_tg_acesso_removido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.nx_conta_pref p where p.conta_id = old.conta_id and p.cliente_id = old.cliente_id;
  return old;
end $$;
drop trigger if exists nx_acessos_removido on public.nx_acessos;   -- lint:permitido gatilho recriado (idempotente)
create trigger nx_acessos_removido after delete on public.nx_acessos
  for each row execute function public.nx_tg_acesso_removido();

-- plano 2000d · DS-173: contato que pediu para sair (opt-out) ou foi bloqueado não recebe o que já estava na fila de automação/lista
create or replace function public.nx_tg_contato_saiu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.optin_marketing is false and old.optin_marketing is distinct from false)
     or (coalesce(new.bloqueado, false) and not coalesce(old.bloqueado, false)) then
    update public.nx_envios_fila f
       set status = 'cancelado', processado_em = now(),
           erro = case when coalesce(new.bloqueado, false) then 'contato bloqueado' else 'contato pediu para não receber' end
     where f.contato_id = new.id and f.status = 'pendente' and f.origem in ('automacao', 'lista');
  end if;
  return new;
end $$;
drop trigger if exists nx_contatos_saiu on public.nx_contatos;   -- lint:permitido gatilho recriado (idempotente)
create trigger nx_contatos_saiu after update of optin_marketing, bloqueado on public.nx_contatos
  for each row execute function public.nx_tg_contato_saiu();

-- plano 2000d · DS-282: o limite de contatos vale para TODO caminho (webhook, formulário, importação, automação). Os caminhos manuais
-- e a importação já recusam no limite exato (nx_exigir_limite; a importação confere o total UMA vez antes de gravar).
-- plano 2000d · REV-M2: este gatilho NUNCA recusa — a entrada automática (WhatsApp, webhook, formulário, lead do anúncio) entra
--   mesmo acima do limite (lead não se perde); o que fica é o AVISO aos admins + a marca «limite_contatos_excedido» na auditoria,
--   1× por mês. Sem count(*) por linha: dentro da importação (nx.lote = '1', já conferida no começo) não conta nada, e depois
--   do aviso do mês também não (o exists do aviso vem antes da contagem).
create or replace function public.nx_tg_contatos_limite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_lim int; v_uso int; v_mes timestamptz := date_trunc('month', now());
begin
  if coalesce(current_setting('nx.lote', true), '') = '1' then return null; end if;   -- plano 2000d · REV-M2
  for r in select n.cliente_id, count(*)::int as novos from novos n group by n.cliente_id loop
    v_lim := public.nx_limite(r.cliente_id, 'contatos');
    if v_lim is null then continue; end if;
    if exists (select 1 from public.nx_notificacoes x
                where x.cliente_id = r.cliente_id and x.tipo = 'sistema'
                  and x.titulo = 'Limite de contatos do plano atingido' and x.criado_em >= v_mes) then
      continue;   -- já avisado neste mês: nada a contar
    end if;
    v_uso := public.nx_uso(r.cliente_id, 'contatos');
    if v_uso > v_lim then
      perform public.nx_notificar(r.cliente_id, null, 'sistema', 'Limite de contatos do plano atingido',
        'Os contatos novos do WhatsApp, do site e dos anúncios continuam entrando (nenhum lead se perde), mas criar e importar '
        || 'contatos à mão fica bloqueado. Aumente o plano para liberar.',
        '#/config/plano');
      perform public.nx_auditar((select c.org_id from public.nx_clientes c where c.id = r.cliente_id), r.cliente_id, null,
                                'limite_contatos_excedido', jsonb_build_object('limite', v_lim, 'uso', v_uso));
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists nx_contatos_limite on public.nx_contatos;   -- lint:permitido gatilho recriado (idempotente)
create trigger nx_contatos_limite after insert on public.nx_contatos
  referencing new table as novos for each statement execute function public.nx_tg_contatos_limite();

-- ------------------------------------------------------------
-- plano 2000d · REV-M2 nx_lead_entrada: o formulário do site não perde o lead quando o plano de contatos está cheio
--   (cópia da definição em vigor: 20261015a_plano1000b.sql — mesma assinatura e respostas; só sai o descarte por limite)
-- ------------------------------------------------------------
create or replace function public.nx_lead_entrada(p_chave text, p_dados jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  -- texto externo: sem caracteres de controle, aparado e cortado
  v_nome text := nullif(btrim(left(regexp_replace(coalesce(d->>'nome', ''), '[[:cntrl:]]+', ' ', 'g'), 160)), '');
  v_tel_bruto text := left(coalesce(d->>'telefone', ''), 40);
  v_tel text;
  v_email text := lower(nullif(btrim(left(coalesce(d->>'email', ''), 160)), ''));
  v_msg text := nullif(btrim(left(regexp_replace(coalesce(d->>'mensagem', ''), '[^[:print:][:space:]]+', '', 'g'), 2000)), '');
  v_serv text := nullif(btrim(left(regexp_replace(coalesce(d->>'servico', ''), '[[:cntrl:]]+', ' ', 'g'), 80)), '');
  v_utm_s text := nullif(btrim(left(regexp_replace(coalesce(d->>'utm_source', ''), '[[:cntrl:]]+', ' ', 'g'), 80)), '');
  v_utm_c text := nullif(btrim(left(regexp_replace(coalesce(d->>'utm_campaign', ''), '[[:cntrl:]]+', ' ', 'g'), 120)), '');
  -- plano 1000: o resto do rastreio que o formulário do site manda e o aceite da política de privacidade
  v_utm_m text := nullif(btrim(left(regexp_replace(coalesce(d->>'utm_medium', ''), '[[:cntrl:]]+', ' ', 'g'), 80)), '');
  v_utm_ct text := nullif(btrim(left(regexp_replace(coalesce(d->>'utm_content', ''), '[[:cntrl:]]+', ' ', 'g'), 120)), '');
  v_utm_t text := nullif(btrim(left(regexp_replace(coalesce(d->>'utm_term', ''), '[[:cntrl:]]+', ' ', 'g'), 120)), '');
  v_gclid text := nullif(left(regexp_replace(coalesce(d->>'gclid', ''), '[^A-Za-z0-9._-]+', '', 'g'), 200), '');
  v_fbclid text := nullif(left(regexp_replace(coalesce(d->>'fbclid', ''), '[^A-Za-z0-9._-]+', '', 'g'), 200), '');
  -- plano 1000b · AB-121: o rastreio.v2 também guarda utm_id (id da campanha), ttclid (TikTok) e msclkid (Microsoft Ads)
  v_utm_id text := nullif(btrim(left(regexp_replace(coalesce(d->>'utm_id', ''), '[[:cntrl:]]+', ' ', 'g'), 100)), '');
  v_ttclid text := nullif(left(regexp_replace(coalesce(d->>'ttclid', ''), '[^A-Za-z0-9._-]+', '', 'g'), 200), '');
  v_msclkid text := nullif(left(regexp_replace(coalesce(d->>'msclkid', ''), '[^A-Za-z0-9._-]+', '', 'g'), 200), '');
  v_aceite boolean := case when lower(coalesce(d->>'aceite_privacidade', '')) in ('true', '1', 'sim', 'on', 'yes') then true end;
  rr public.nx_rastreio; cls jsonb; v_plat text; v_orig text := 'site'; v_camp text; v_rast jsonb;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  cli public.nx_clientes;
  v_contato bigint;
  v_funil uuid;
  v_neg bigint;
  v_n int;
  v_ip text;
  v_novo boolean := false;
begin
  -- 1) os dados primeiro (o erro não depende da chave)
  if nullif(regexp_replace(v_tel_bruto, '\D', '', 'g'), '') is not null then
    v_tel := public.nx_tel_normalizar(v_tel_bruto, false);
    if v_tel is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'telefone'; end if;
  end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'email';
  end if;
  if v_nome is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'nome'; end if;
  if v_tel is null and v_email is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'telefone'; end if;

  -- 2) a chave: qualquer problema → ok sem gravar (não revela)
  if p_chave is null or p_chave !~ '^[0-9a-f]{48}$' then return json_build_object('ok', true); end if;
  select * into cli from public.nx_clientes c where c.entrada_chave = p_chave;
  if cli.id is null
     or not coalesce(cli.ativo, true)
     or coalesce(cli.status, 'ativo') not in ('ativo', 'teste')
     or (cli.status = 'teste' and cli.teste_ate is not null and cli.teste_ate < v_hoje)
     or not ('crm' = any(coalesce(cli.modulos, '{}'::text[])))
     or exists (select 1 from public.nx_orgs o where o.id = cli.org_id and o.status in ('suspenso', 'cancelado')) then
    return json_build_object('ok', true);
  end if;

  -- 3) limite por IP (plano 1000, SV-108: 5 formulários por hora — a chave é pública e qualquer um esgotava o limite do
  --    cliente) e de 30 por hora por cliente (trava por cliente: chamadas simultâneas esperam a vez)
  v_ip := public.nx_login_ip();
  if v_ip is not null and not (public.nx_taxa_usar('form:' || v_ip, 5, 3600) ->> 'ok')::boolean then
    raise exception 'limite_taxa' using errcode = '54000';
  end if;
  -- plano 1000 (SV-254): esperar a trava consultiva no máximo 5 s (uma entrega presa não segura as outras até o statement_timeout;
  -- o erro faz a Meta / o fluxo tentarem de novo). set_config local = só nesta transação (a RPC).
  perform set_config('lock_timeout', '5s', true);
  perform pg_advisory_xact_lock(hashtextextended('nx_lead_entrada:' || cli.id::text, 0));
  -- plano 1000 (SV-136): a MESMA trava do nx_wa_entrada e do nx_lead_webhook (cliente + chave do telefone) — formulário e WhatsApp
  -- da mesma pessoa no mesmo instante esperam a vez e viram UM negócio
  if v_tel is not null then
    perform pg_advisory_xact_lock(hashtextextended(cli.id::text || ':' || coalesce(public.nx_tel_chave(v_tel), v_tel), 0));
  end if;
  select count(*) into v_n
    from public.nx_leads l
   where l.cliente_id = cli.id and l.data_conversa >= v_hoje - 1
     and l.origem = 'site' and l.criado_em > now() - interval '1 hour';
  if v_n >= 30 then raise exception 'limite_taxa' using errcode = '54000'; end if;

  -- 4) contato: telefone → e-mail → novo
  if v_tel is not null then v_contato := public.nx_contato_por_tel(cli.id, v_tel); end if;
  if v_contato is null and v_email is not null then
    select k.id into v_contato from public.nx_contatos k
     where k.cliente_id = cli.id and lower(k.email) = v_email order by k.id limit 1;
  end if;
  if v_contato is null then
    -- plano 2000d · REV-M2: plano cheio NÃO descarta o lead do formulário (antes o site recebia {ok:true} e nada era gravado).
    -- O contato entra; o gatilho nx_contatos_limite avisa os admins e marca «limite_contatos_excedido» na auditoria (1×/mês).
    insert into public.nx_contatos (cliente_id, nome, telefone, email, origem)
    values (cli.id, v_nome, v_tel, v_email, 'site')
    on conflict (cliente_id, tel_chave) where tel_chave is not null
    do update set nome = coalesce(public.nx_contatos.nome, excluded.nome),
                  email = coalesce(public.nx_contatos.email, excluded.email)
    returning id into v_contato;
  else
    -- contato existente: só preenche o que estiver vazio (formulário anônimo nunca sobrescreve)
    update public.nx_contatos k
       set nome = coalesce(k.nome, v_nome), email = coalesce(k.email, v_email),
           telefone = coalesce(k.telefone, v_tel)
     where k.id = v_contato
       and (k.nome is null or (k.email is null and v_email is not null) or (k.telefone is null and v_tel is not null));
  end if;

  -- 5) plano 1000 (SV-107): contato com negócio ABERTO → o envio vira só nota nele (decisão 1 do plano 100; duplo clique ou
  --    reenvio do formulário criavam 2 negócios e 2 avisos). Sem negócio aberto: negócio novo no funil padrão (o gatilho acha a
  --    etapa 'nova' e completa nome/telefone)
  select l.id into v_neg from public.nx_leads l
   where l.cliente_id = cli.id and l.contato_id = v_contato and l.status = 'aberto'
   order by l.criado_em desc, l.id desc limit 1;
  if v_neg is null then
    -- plano 1000 (SV-137): a MESMA classificação do rastreio do site (nx_rastreio_plataforma): utm_source/medium, gclid, fbclid →
    -- plataforma e origem (anúncio × orgânico × site); utm_campaign que casa com campanha conhecida é anúncio (como no aplicar)
    rr.utm_source := v_utm_s; rr.utm_medium := v_utm_m; rr.utm_campaign := v_utm_c; rr.utm_content := v_utm_ct; rr.utm_term := v_utm_t;
    rr.gclid := v_gclid; rr.fbclid := v_fbclid;
    rr.utm_id := v_utm_id; rr.ttclid := v_ttclid; rr.msclkid := v_msclkid;   -- plano 1000b · AB-121
    cls := public.nx_rastreio_plataforma(rr);
    v_plat := cls ->> 'plataforma'; v_orig := coalesce(cls ->> 'origem', 'site');
    if v_plat is not null and v_utm_c is not null then
      select m.campanha_ext into v_camp from public.nx_metricas_dia m
       where m.cliente_id = cli.id and m.plataforma = v_plat and (m.campanha_ext = v_utm_c or lower(m.campanha_nome) = lower(v_utm_c))
       order by (m.campanha_ext = v_utm_c) desc, m.data desc limit 1;
      if v_camp is not null then v_orig := 'anuncio'; end if;
      v_camp := coalesce(v_camp, left(v_utm_c, 100));
    end if;
    v_rast := jsonb_strip_nulls(jsonb_build_object('via', 'formulario', 'utm_source', v_utm_s, 'utm_medium', v_utm_m, 'utm_campaign', v_utm_c,
      'utm_content', v_utm_ct, 'utm_term', v_utm_t, 'fbclid', v_fbclid, 'aceite_privacidade', v_aceite,
      'utm_id', v_utm_id, 'ttclid', v_ttclid, 'msclkid', v_msclkid,
      'aceite_em', case when v_aceite then now() end, 'clique_em', now()));
    select f.id into v_funil from public.nx_funis f where f.cliente_id = cli.id and f.padrao and f.ativo limit 1;
    insert into public.nx_leads (cliente_id, nome, telefone, contato_id, origem, plataforma, campanha_ext, gclid, rastreio, servico, obs, funil_id, etapa)
    values (cli.id, v_nome, v_tel, v_contato, v_orig, v_plat, v_camp, v_gclid, v_rast, v_serv,
            left(concat_ws(' · ', 'Formulário do site',
                           case when v_utm_s is not null then 'utm_source=' || v_utm_s end,
                           case when v_utm_m is not null then 'utm_medium=' || v_utm_m end,
                           case when v_utm_c is not null then 'utm_campaign=' || v_utm_c end,
                           case when v_utm_ct is not null then 'utm_content=' || v_utm_ct end,
                           case when v_utm_t is not null then 'utm_term=' || v_utm_t end,
                           case when v_gclid is not null then 'gclid' end,
                           case when v_fbclid is not null then 'fbclid' end,
                           case when v_utm_id is not null then 'utm_id=' || v_utm_id end,
                           case when v_ttclid is not null then 'ttclid' end,
                           case when v_msclkid is not null then 'msclkid' end,
                           case when v_aceite then 'aceitou a política de privacidade' end), 5000),
            v_funil, 'nova')
    returning id into v_neg;
    v_novo := true;
    -- contato: 1º toque (só preenche o vazio; a origem padrão vira a real), como o nx_rastreio_aplicar
    if v_plat is not null or v_orig <> 'site' then
      update public.nx_contatos k set
        origem = case when k.origem in ('whatsapp', 'site') then v_orig else k.origem end,
        plataforma = coalesce(k.plataforma, v_plat), campanha_ext = coalesce(k.campanha_ext, v_camp)
      where k.id = v_contato and k.cliente_id = cli.id and k.plataforma is null;
    end if;
  end if;

  -- 6) mensagem vira nota (no negócio que já existia: sempre uma nota, para o envio repetido deixar rastro); avisa os admins
  --    (negócio que já existia: no máximo um aviso a cada 30 min)
  if v_msg is not null or not v_novo then
    insert into public.nx_notas (cliente_id, contato_id, negocio_id, texto)
    values (cli.id, v_contato, v_neg, left(case when v_msg is not null then 'Mensagem enviada pelo formulário do site: ' || v_msg
                                                else 'Formulário do site enviado de novo' end, 5000));
  end if;
  if v_novo or not exists (select 1 from public.nx_notificacoes n
                            where n.cliente_id = cli.id and n.link = '#/crm/negocio/' || v_neg and n.criado_em > now() - interval '30 minutes') then
    perform public.nx_notificar(cli.id, null, 'sistema',
                                left(case when v_novo then 'Novo contato pelo site: ' else 'Contato do site escreveu de novo: ' end || v_nome, 120),
                                left(concat_ws(' · ', v_serv, v_msg), 500), '#/crm/negocio/' || v_neg);
  end if;
  return json_build_object('ok', true);
end $$;

-- plano 2000d · DS-153: a auditoria só cresce — update/delete recusados, salvo a retenção explícita (set local nx.faxina = 'on')
create or replace function public.nx_tg_auditoria_imutavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('nx.faxina', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'auditoria_imutavel' using errcode = '42501';
end $$;
drop trigger if exists nx_auditoria_imutavel on public.nx_auditoria;   -- lint:permitido gatilho recriado (idempotente)
create trigger nx_auditoria_imutavel before update or delete on public.nx_auditoria
  for each row execute function public.nx_tg_auditoria_imutavel();
-- plano 2000d · REV-M3: busca por data na auditoria (relatórios/consultas por período; a auditoria NÃO tem retenção — decisão 6)
create index if not exists nx_auditoria_criado on public.nx_auditoria (criado_em);

-- ------------------------------------------------------------
-- 3. Envio em massa seguro (automações): uma regra só, chamada antes de pôr mensagem na fila
-- ------------------------------------------------------------
-- plano 2000d · DU-042 / DU-043 / DU-044 / AX-059 / DS-350 / DU-383 / DS-331: devolve o motivo para NÃO enfileirar (ou null).
--   • teto diário de mensagens automáticas da empresa (limite «envios_dia» do plano ou cfg.automacoes.teto_dia), com
--     aviso aos admins em 80% e 100% (1× por dia cada);
--   • gatilhos que não respondem ao cliente (tempo, CRM, agendados): quem pediu para não receber (opt-out) ou tem a etiqueta
--     «Não enviar» fica de fora; intervalo mínimo entre automações diferentes ao mesmo contato (cfg.automacoes.intervalo_contato_h)
--     e no máximo N por contato em 24 h (cfg.automacoes.max_msgs_contato_dia);
--   • disjuntor: a automação com 20+ envios nas últimas 2 h e metade ou mais falhando é desligada sozinha e os admins avisados.
-- Responder a quem acabou de escrever (mensagem recebida, conversa nova) não passa pelo opt-out nem pelos intervalos.
-- plano 2000d · REV-M1: teto, intervalo e máximo por contato são OPT-IN — sem o limite do plano nem a chave na configuração da
--   empresa valem 0 (desligado): lembretes e confirmações de consulta de quem já usa não podem calar de um dia para o outro.
--   Os gatilhos de agenda (agendado = confirmação, antes_da_data = lembrete) nunca caem no intervalo entre automações.
--   Intervalo e máximo por contato contam pela HORA PREVISTA de envio (enviar_em; p_quando = a desta mensagem), não pela
--   entrada na fila: o lembrete enfileirado ontem para daqui a 3 h não «ocupa» o contato agora.
create or replace function public.nx_auto_envio_guarda(p_auto public.nx_automacoes, p_contato bigint, p_optout boolean default true,
                                                       p_quando timestamptz default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb; v_teto int; v_hoje int; v_ini timestamptz; v_int numeric; v_max int; v_n int; v_falhas int;
  v_reativo boolean := p_auto.gatilho in ('mensagem_recebida', 'conversa_nova');
  v_agenda boolean := p_auto.gatilho in ('agendado', 'antes_da_data');   -- plano 2000d · REV-M1: confirmação e lembrete
  v_quando timestamptz := greatest(coalesce(p_quando, now()), now());     -- plano 2000d · REV-M1: hora prevista do envio
  k public.nx_contatos;
begin
  if p_auto.id is null then return null; end if;
  select coalesce(c.cfg -> 'automacoes', '{}'::jsonb) into v_cfg from public.nx_clientes c where c.id = p_auto.cliente_id;
  v_cfg := case when jsonb_typeof(v_cfg) = 'object' then v_cfg else '{}'::jsonb end;

  -- disjuntor (DU-383)
  select count(*) filter (where f.status in ('enviado', 'falhou')), count(*) filter (where f.status = 'falhou')
    into v_n, v_falhas
    from public.nx_envios_fila f
   where f.automacao_id = p_auto.id and f.criado_em > now() - interval '2 hours';
  if v_n >= 20 and v_falhas * 2 >= v_n then
    update public.nx_automacoes set ativo = false, pausada_motivo = 'disjuntor', pausada_em = now()
     where id = p_auto.id and ativo;
    if found then
      perform public.nx_notificar(p_auto.cliente_id, null, 'sistema', left('Automação desligada: «' || p_auto.nome || '»', 120),
        v_falhas || ' de ' || v_n || ' mensagens falharam nas últimas 2 horas. Confira o número e o texto antes de religar.',
        '#/automacoes/' || p_auto.id);
    end if;
    return 'automação desligada pelo disjuntor (muitas falhas)';
  end if;

  -- teto diário da empresa (DU-042)
  -- plano 2000d · REV-M1: sem limite no plano nem cfg.automacoes.teto_dia → 0 = sem teto (nada de 300 por padrão)
  v_teto := coalesce(public.nx_limite(p_auto.cliente_id, 'envios_dia'),
                     case when (v_cfg ->> 'teto_dia') ~ '^[0-9]{1,6}$' then (v_cfg ->> 'teto_dia')::int end, 0);
  v_ini := (public.nx_hoje_sp()::timestamp at time zone 'America/Sao_Paulo');
  v_hoje := 0;
  if v_teto > 0 then
    select count(*)::int into v_hoje from public.nx_envios_fila f
     where f.cliente_id = p_auto.cliente_id and f.origem = 'automacao' and f.criado_em >= v_ini and f.status <> 'cancelado';
  end if;
  if v_teto > 0 and v_hoje >= v_teto then
    if not exists (select 1 from public.nx_notificacoes x where x.cliente_id = p_auto.cliente_id and x.tipo = 'sistema'
                     and x.titulo = 'Teto diário de mensagens automáticas atingido' and x.criado_em >= v_ini) then
      perform public.nx_notificar(p_auto.cliente_id, null, 'sistema', 'Teto diário de mensagens automáticas atingido',
        'Hoje já saíram ' || v_hoje || ' mensagens automáticas (o teto é ' || v_teto || '). As próximas ficam de fora até amanhã.',
        '#/automacoes');
    end if;
    return 'teto diário de mensagens automáticas da empresa atingido (' || v_teto || ')';
  end if;
  if v_teto > 0 and (v_hoje + 1) * 100 >= v_teto * 80
     and not exists (select 1 from public.nx_notificacoes x where x.cliente_id = p_auto.cliente_id and x.tipo = 'sistema'
                       and x.titulo = '80% do teto diário de mensagens automáticas' and x.criado_em >= v_ini) then
    perform public.nx_notificar(p_auto.cliente_id, null, 'sistema', '80% do teto diário de mensagens automáticas',
      (v_hoje + 1) || ' de ' || v_teto || ' mensagens automáticas hoje.', '#/automacoes');
  end if;

  if v_reativo or p_contato is null then return null; end if;
  select * into k from public.nx_contatos where id = p_contato;
  -- opt-out e etiqueta «Não enviar» (DU-044 / AX-059)
  if coalesce(p_optout, true) and k.optin_marketing is false then return 'contato pediu para não receber'; end if;
  if exists (select 1 from public.nx_etiquetas e
              where e.id = any(coalesce(k.etiquetas, '{}'::uuid[])) and e.cliente_id = p_auto.cliente_id
                and public.nx_crm_norm(e.nome) in ('nao enviar', 'nao enviar mensagens', 'nao enviar mensagem')) then
    return 'contato com a etiqueta «Não enviar»';
  end if;
  -- intervalo mínimo entre automações diferentes (DU-043) — plano 2000d · REV-M1: opt-in (sem a chave = 0 = desligado), os
  -- gatilhos de agenda nunca caem nele e a distância é medida entre as horas PREVISTAS de envio (enviar_em), nos dois sentidos
  v_int := case when (v_cfg ->> 'intervalo_contato_h') ~ '^[0-9]{1,3}(\.[0-9]+)?$' then (v_cfg ->> 'intervalo_contato_h')::numeric else 0 end;
  if v_int > 0 and not v_agenda
     and exists (select 1 from public.nx_envios_fila f
                  where f.contato_id = p_contato and f.origem = 'automacao' and f.automacao_id is distinct from p_auto.id
                    and f.status in ('pendente', 'enviando', 'enviado')
                    and coalesce(f.enviar_em, f.criado_em) > v_quando - make_interval(secs => (v_int * 3600)::int)
                    and coalesce(f.enviar_em, f.criado_em) < v_quando + make_interval(secs => (v_int * 3600)::int)) then
    return 'mensagem automática recente para este contato';
  end if;
  -- no máximo N por contato em 24 h (DS-350) — plano 2000d · REV-M1: opt-in (sem a chave = 0), pela hora prevista de envio
  v_max := case when (v_cfg ->> 'max_msgs_contato_dia') ~ '^[0-9]{1,3}$' then (v_cfg ->> 'max_msgs_contato_dia')::int else 0 end;
  if v_max > 0 and (select count(*) from public.nx_envios_fila f
                     where f.contato_id = p_contato and f.origem = 'automacao' and f.status in ('pendente', 'enviando', 'enviado')
                       and coalesce(f.enviar_em, f.criado_em) > v_quando - interval '24 hours'
                       and coalesce(f.enviar_em, f.criado_em) < v_quando + interval '24 hours') >= v_max then
    return 'limite de mensagens automáticas por contato no dia';
  end if;
  return null;
end $$;

-- ------------------------------------------------------------
-- 4. RPCs NOVAS do painel (p_token → nx_ctx; anon + service_role) e públicas
-- ------------------------------------------------------------

-- plano 2000d · DS-001 / DS-125 / DS-315: atribuir/transferir com o dono que a tela viu. Duas pessoas clicando «Assumir» ao mesmo
-- tempo: a 2ª recebe dono_mudou (hint = o nome de quem ficou) em vez de tomar a conversa da 1ª. Destino suspenso (conta
-- ou acesso) é recusado como conta inválida. p_manter_dono: mudar de departamento sem tirar o dono quando ele atende o novo.
-- A nx_cv_atribuir de sempre (mesma assinatura) passa a chamar esta com p_conferir = false.
create or replace function public.nx_cv_atribuir_v2(p_token text, p_cliente uuid, p_conversa bigint,
                                                    p_conta uuid default null, p_departamento uuid default null,
                                                    p_dono_esperado uuid default null, p_conferir boolean default true,
                                                    p_manter_dono boolean default false)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  cv public.nx_conversas;
  d public.nx_departamentos;
  v_novo uuid;
  v_dep uuid;
  v_eu text := coalesce(nullif(v.nome, ''), 'Alguém');
  v_de text; v_para text; v_txt text; v_contato text;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  select * into cv from public.nx_conversas where id = p_conversa for update;
  -- DS-001: quem a tela viu como dono não é mais o dono → conflito (a tela pergunta antes de tomar)
  if coalesce(p_conferir, true) and cv.atribuida_a is distinct from p_dono_esperado then
    -- a tela (conversas.js nomeDoErroDono) mostra o hint como o nome de quem ficou; sem dono agora → vazio («Outra pessoa»)
    raise exception 'dono_mudou' using errcode = '22023',
      hint = coalesce((select k.nome from public.nx_contas k where k.id = cv.atribuida_a), '');
  end if;

  if p_departamento is not null then
    select * into d from public.nx_departamentos where id = p_departamento and cliente_id = p_cliente and ativo;
    if d.id is null then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
    end if;
  end if;
  if p_conta is not null and p_conta <> v.conta_id then
    -- só quem tem acesso ativo de atendimento neste cliente recebe conversa — DS-125: e não está suspenso
    if not exists (select 1 from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
                    where a.conta_id = p_conta and a.cliente_id = p_cliente
                      and a.papel in ('atendente', 'supervisor', 'admin') and k.aprovado
                      and a.suspenso_em is null and k.suspenso_em is null) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'conta';
    end if;
  end if;

  v_novo := p_conta;
  v_dep := coalesce(p_departamento, cv.departamento_id);
  -- DS-315: trocar só o departamento mantém o dono quando ele atende o departamento novo
  if coalesce(p_manter_dono, false) and p_conta is null and p_departamento is not null and cv.atribuida_a is not null
     and exists (select 1 from public.nx_acessos a where a.conta_id = cv.atribuida_a and a.cliente_id = p_cliente
                    and a.suspenso_em is null
                    and (cardinality(a.departamentos) = 0 or v_dep = any(a.departamentos) or public.nx_rank(a.papel) >= 2)) then
    v_novo := cv.atribuida_a;
  end if;
  if v_novo is not distinct from cv.atribuida_a and v_dep is not distinct from cv.departamento_id then
    return public.nx_cv_json_item(cv)::json;   -- nada mudou
  end if;

  update public.nx_conversas
     set atribuida_a = v_novo, departamento_id = v_dep, atualizado_em = now()
   where id = cv.id;

  if v_novo is not null and v_novo is distinct from cv.atribuida_a then
    update public.nx_acessos set ultima_atribuicao_em = now()
     where conta_id = v_novo and cliente_id = p_cliente;
  end if;

  select k.nome into v_de from public.nx_contas k where k.id = cv.atribuida_a;
  select k.nome into v_para from public.nx_contas k where k.id = v_novo;
  if v_novo is distinct from cv.atribuida_a then
    if v_novo = v.conta_id and cv.atribuida_a is null then
      v_txt := v_eu || ' assumiu';
    elsif v_novo is not null and cv.atribuida_a is not null then
      v_txt := 'Transferida de ' || coalesce(v_de, 'atendente') || ' para ' || coalesce(v_para, 'atendente');
    elsif v_novo is not null then
      v_txt := 'Atribuída a ' || coalesce(v_para, 'atendente') || ' por ' || v_eu;
    elsif p_departamento is null then
      v_txt := v_eu || ' devolveu para a fila';
    end if;
  end if;
  if v_dep is distinct from cv.departamento_id then
    v_txt := coalesce(v_txt || ' · ', '') || 'Movida para ' || d.nome;
  end if;
  if v_txt is not null then
    perform public.nx_cv_sistema(cv.id, v_txt, v.conta_id);
  end if;

  if v_novo is not null and v_novo <> v.conta_id and v_novo is distinct from cv.atribuida_a then
    select coalesce(nullif(k.nome, ''), k.telefone, 'contato') into v_contato
      from public.nx_contatos k where k.id = cv.contato_id;
    perform public.nx_notificar(p_cliente, v_novo, 'atribuida',
                                left(v_eu || ' passou a conversa com ' || coalesce(v_contato, 'contato') || ' para você', 120),
                                'Protocolo ' || cv.protocolo, '#/conversas/' || cv.id);
  end if;

  select * into cv from public.nx_conversas where id = p_conversa;
  return public.nx_cv_json_item(cv)::json;
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-125: nx_cv_atribuir (mesma assinatura da 20260928e) delega à v2 sem conferir o dono — o corpo de antes é o da v2
--   (cópia da definição em vigor: 20260928e_conversas.sql, movida para nx_cv_atribuir_v2 com a checagem de suspensão)
-- ------------------------------------------------------------
create or replace function public.nx_cv_atribuir(p_token text, p_cliente uuid, p_conversa bigint,
                                                 p_conta uuid default null, p_departamento uuid default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.nx_cv_atribuir_v2(p_token, p_cliente, p_conversa, p_conta, p_departamento, null, false, false);
end $$;

-- plano 2000d · DS-001 / DC-001…DC-009: o contrato que a tela de Conversas JÁ usa — nx_cv_atribuir com p_dono_esperado +
-- p_conferir_dono (conversas.js atribuirConferindo, que sempre manda p_conta; sem a função ela cai na de sempre). Os 6 primeiros SEM
-- default: no PostgREST (parâmetros por nome) quem chama sem p_dono_esperado/p_conferir_dono só casa com a de 5 parâmetros e quem
-- manda só casa com esta (sem PGRST203); em SQL posicional, nenhuma chamada de até 5 argumentos (as de hoje) vê esta.
create or replace function public.nx_cv_atribuir(p_token text, p_cliente uuid, p_conversa bigint, p_conta uuid,
                                                 p_dono_esperado uuid, p_conferir_dono boolean,
                                                 p_departamento uuid default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.nx_cv_atribuir_v2(p_token, p_cliente, p_conversa, p_conta, p_departamento, p_dono_esperado,
                                  coalesce(p_conferir_dono, true), false);
end $$;

-- plano 2000d · DS-002: «Pegar a próxima» — a conversa sem dono mais antiga (pela entrada do cliente) que a pessoa enxerga, numa
-- transação só e com FOR UPDATE SKIP LOCKED: duas pessoas clicando juntas recebem conversas DIFERENTES. Devolve o item da lista ou
-- {"conversa": null} quando a fila está vazia.
create or replace function public.nx_cv_pegar_proxima(p_token text, p_cliente uuid, p_filtro jsonb default '{}'::jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  f jsonb := case when jsonb_typeof(p_filtro) = 'object' then p_filtro else '{}'::jsonb end;
  v_dep uuid; cv public.nx_conversas;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  perform public.nx_json_teto(p_filtro, 4096, 'filtro');
  begin
    v_dep := nullif(f ->> 'departamento_id', '')::uuid;
  exception when others then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento_id';
  end;
  select x.* into cv
    from public.nx_conversas x
   where x.cliente_id = p_cliente and x.atribuida_a is null and x.status in ('aberta', 'pendente') and not x.oculta
     and (v_dep is null or x.departamento_id = v_dep)
     and (public.nx_rank(v.papel) >= 3 or coalesce(cardinality(v.departamentos), 0) = 0
          or x.departamento_id is null or x.departamento_id = any(v.departamentos))
   order by x.ultima_entrada_em asc nulls last, x.id
   limit 1
   for update of x skip locked;
  if cv.id is null then return json_build_object('conversa', null); end if;
  update public.nx_conversas set atribuida_a = v.conta_id, atualizado_em = now() where id = cv.id returning * into cv;
  update public.nx_acessos set ultima_atribuicao_em = now() where conta_id = v.conta_id and cliente_id = p_cliente;
  perform public.nx_cv_sistema(cv.id, coalesce(nullif(v.nome, ''), 'Alguém') || ' assumiu', v.conta_id);
  return json_build_object('conversa', public.nx_cv_json_item(cv));
end $$;

-- plano 2000d · DS-003: etiquetas da conversa por DIFERENÇA (acrescentar/tirar) na linha travada — a etiqueta que um colega pôs depois
-- do último pulso não some. Mesmas regras da nx_cv_etiquetas (do cliente, até 30).
create or replace function public.nx_cv_etiquetas_mudar(p_token text, p_cliente uuid, p_conversa bigint,
                                                        p_acrescentar uuid[] default '{}', p_tirar uuid[] default '{}')
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  cv public.nx_conversas; v_ids uuid[];
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_acrescentar, '{}')) > 30 or cardinality(coalesce(p_tirar, '{}')) > 30 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'etiquetas';
  end if;
  if exists (select 1 from unnest(coalesce(p_acrescentar, '{}'::uuid[])) x
              where x is not null and not exists (select 1 from public.nx_etiquetas e where e.id = x and e.cliente_id = p_cliente)) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'etiquetas';
  end if;
  select * into cv from public.nx_conversas where id = p_conversa and cliente_id = p_cliente for update;
  select coalesce(array_agg(distinct x order by x), '{}'::uuid[]) into v_ids
    from unnest(coalesce(cv.etiquetas, '{}'::uuid[]) || coalesce(p_acrescentar, '{}'::uuid[])) x
   where x is not null and not (x = any(coalesce(p_tirar, '{}'::uuid[])));
  if cardinality(v_ids) > 30 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'etiquetas'; end if;
  if v_ids is distinct from (select coalesce(array_agg(distinct x order by x), '{}'::uuid[]) from unnest(coalesce(cv.etiquetas, '{}'::uuid[])) x) then
    update public.nx_conversas set etiquetas = v_ids, atualizado_em = now() where id = cv.id returning * into cv;
  end if;
  return public.nx_cv_json_item(cv)::json;
end $$;

-- plano 2000d · DS-051 / DR-014: etiquetar/tirar etiqueta de vários negócios por DIFERENÇA, um a um na mesma transação (cada linha
-- travada; o que outra pessoa pôs fica). Até 500 ids. Resposta {ok:[ids], falhas:[{id, codigo}]} — o kanban já usa assim.
create or replace function public.nx_negocios_etiquetar_lote(p_token text, p_cliente uuid, p_ids bigint[],
                                                             p_adicionar uuid[] default '{}', p_remover uuid[] default '{}')
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  v_rest boolean := public.nx_crm_restrito(v);
  v_id bigint; l public.nx_leads; v_novas uuid[]; v_ok bigint[] := '{}'; v_falhas jsonb := '[]'::jsonb;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'ids';
  end if;
  if cardinality(coalesce(p_adicionar, '{}')) + cardinality(coalesce(p_remover, '{}')) = 0
     or cardinality(coalesce(p_adicionar, '{}')) > 30 or cardinality(coalesce(p_remover, '{}')) > 30 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'etiquetas';
  end if;
  if exists (select 1 from unnest(coalesce(p_adicionar, '{}'::uuid[])) x
              where x is null or not exists (select 1 from public.nx_etiquetas e where e.id = x and e.cliente_id = p_cliente)) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'etiquetas';
  end if;
  for v_id in select distinct x from unnest(p_ids) x where x is not null order by 1 loop
    select * into l from public.nx_leads x where x.id = v_id and x.cliente_id = p_cliente for update;
    if l.id is null or (v_rest and l.dono_id is not null and l.dono_id <> v.conta_id) then
      v_falhas := v_falhas || jsonb_build_array(jsonb_build_object('id', v_id, 'codigo', 'negocio_nao_encontrado'));
      continue;
    end if;
    select coalesce(array_agg(distinct x order by x), '{}'::uuid[]) into v_novas
      from unnest(coalesce(l.etiquetas, '{}'::uuid[]) || coalesce(p_adicionar, '{}'::uuid[])) x
     where x is not null and not (x = any(coalesce(p_remover, '{}'::uuid[])));
    if cardinality(v_novas) > 30 then
      v_falhas := v_falhas || jsonb_build_array(jsonb_build_object('id', v_id, 'codigo', 'etiquetas'));
      continue;
    end if;
    if v_novas is distinct from (select coalesce(array_agg(distinct x order by x), '{}'::uuid[]) from unnest(coalesce(l.etiquetas, '{}'::uuid[])) x) then
      update public.nx_leads set etiquetas = v_novas, atualizado_em = now() where id = l.id;
      perform public.nx_historico_add(p_cliente, 'etiquetas', l.contato_id, l.id, null,
        jsonb_build_object('adicionadas', to_jsonb(coalesce(p_adicionar, '{}'::uuid[])), 'removidas', to_jsonb(coalesce(p_remover, '{}'::uuid[])), 'lote', true));
    end if;
    v_ok := v_ok || v_id;
  end loop;
  return json_build_object('ok', to_json(v_ok), 'falhas', v_falhas);
end $$;

-- plano 2000d · DS-009 / DC-021 / DA-161 / DR-334: preferências da pessoa nesta empresa, guardadas no servidor (valem em qualquer
-- aparelho). Lista branca de chaves; até 16 KB por chave; p_versao (o atualizado_em lido) recusa a gravação velha com versao_antiga.
create or replace function public.nx_conta_pref_ler(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
begin
  return coalesce((select json_object_agg(p.chave, json_build_object('valor', p.valor, 'atualizado_em', p.atualizado_em))
                     from public.nx_conta_pref p where p.conta_id = v.conta_id and p.cliente_id = p_cliente), '{}'::json);
end $$;

create or replace function public.nx_conta_pref_salvar(p_token text, p_cliente uuid, p_chave text, p_valor jsonb,
                                                       p_versao timestamptz default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura'); p public.nx_conta_pref;
begin
  if p_chave is null or p_chave not in ('conversas', 'crm_colunas', 'crm_visoes', 'ads_colunas', 'onboarding', 'inicio', 'agenda',
                                        'automacoes', 'relatorios', 'importacao_mapa', 'tour', 'avisos') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'chave';
  end if;
  perform public.nx_json_teto(p_valor, 16384, 'valor');
  select * into p from public.nx_conta_pref x where x.conta_id = v.conta_id and x.cliente_id = p_cliente and x.chave = p_chave for update;
  if p_versao is not null and p.chave is not null and p.atualizado_em > p_versao + interval '1 millisecond' then
    raise exception 'versao_antiga' using errcode = '22023', hint = json_build_object('em', p.atualizado_em)::text;
  end if;
  if p_valor is null or jsonb_typeof(p_valor) = 'null' then
    delete from public.nx_conta_pref x where x.conta_id = v.conta_id and x.cliente_id = p_cliente and x.chave = p_chave;
    return json_build_object('ok', true, 'chave', p_chave, 'apagada', true);
  end if;
  insert into public.nx_conta_pref (conta_id, cliente_id, chave, valor, atualizado_em)
  values (v.conta_id, p_cliente, p_chave, p_valor, clock_timestamp())
  on conflict (conta_id, cliente_id, chave) do update set valor = excluded.valor, atualizado_em = excluded.atualizado_em
  returning * into p;
  return json_build_object('ok', true, 'chave', p.chave, 'atualizado_em', p.atualizado_em);
end $$;

-- plano 2000d · DS-080 / DR-218 / DR-261: meta do mês (valor e/ou leads) da empresa (conta nula) ou de uma pessoa. Supervisor ou acima.
-- p_meta = {mes:'AAAA-MM', conta_id?, valor?, leads?}; valor e leads nulos apagam a meta.
create or replace function public.nx_meta_salvar(p_token text, p_cliente uuid, p_meta jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'supervisor');
  j jsonb := case when jsonb_typeof(p_meta) = 'object' then p_meta else '{}'::jsonb end;
  v_mes date; v_conta uuid; v_valor numeric; v_leads int; m public.nx_metas;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if coalesce(j ->> 'mes', '') !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'mes'; end if;
  v_mes := (j ->> 'mes' || '-01')::date;
  begin
    v_conta := nullif(j ->> 'conta_id', '')::uuid;
    v_valor := case when jsonb_typeof(j -> 'valor') = 'number' then (j ->> 'valor')::numeric end;
    v_leads := case when jsonb_typeof(j -> 'leads') = 'number' then (j ->> 'leads')::numeric::int end;
  exception when others then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'meta';
  end;
  if v_valor < 0 or v_valor > 1000000000 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'valor'; end if;
  if v_leads < 0 or v_leads > 1000000 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'leads'; end if;
  if v_conta is not null and not exists (select 1 from public.nx_acessos a where a.conta_id = v_conta and a.cliente_id = p_cliente) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'conta_id';
  end if;
  if v_valor is null and v_leads is null then
    delete from public.nx_metas x where x.cliente_id = p_cliente and x.mes = v_mes and x.conta_id is not distinct from v_conta;
    return json_build_object('ok', true, 'apagada', true);
  end if;
  update public.nx_metas x set valor = v_valor, leads = v_leads, atualizado_em = now(), atualizado_por = v.conta_id
   where x.cliente_id = p_cliente and x.mes = v_mes and x.conta_id is not distinct from v_conta
  returning * into m;
  if m.id is null then
    insert into public.nx_metas (cliente_id, conta_id, mes, valor, leads, atualizado_por)
    values (p_cliente, v_conta, v_mes, v_valor, v_leads, v.conta_id) returning * into m;
  end if;
  return json_build_object('ok', true, 'mes', to_char(m.mes, 'YYYY-MM'), 'conta_id', m.conta_id, 'valor', m.valor, 'leads', m.leads);
end $$;

-- plano 2000d · DS-069 / DR-174: excluir o contato A PEDIDO DO TITULAR deixa o registro do pedido (LGPD: só o resumo do telefone,
-- tipo, quem e quando — nunca o dado). Assinatura nova SEM default no p_motivo (a de 4 parâmetros continua igual; o PostgREST não
-- confunde as duas). Outros motivos ('duplicado', 'erro'…) só excluem.
create or replace function public.nx_contato_excluir(p_token text, p_cliente uuid, p_id bigint, p_confirmacao text, p_motivo text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); v_tel text; r json; v_prot text;
begin
  select k.tel_chave into v_tel from public.nx_contatos k where k.id = p_id and k.cliente_id = p_cliente;
  r := public.nx_contato_excluir(p_token, p_cliente, p_id, p_confirmacao);
  if lower(btrim(coalesce(p_motivo, ''))) = 'titular' then
    insert into public.nx_lgpd_pedidos (cliente_id, contato_hash, tipo, executado_em, executado_por)
    values (p_cliente, case when v_tel is not null then public.nx_hash(p_cliente::text || ':' || v_tel) end, 'exclusao', now(), v.conta_id)
    returning protocolo into v_prot;
    perform public.nx_auditar((select c.org_id from public.nx_clientes c where c.id = p_cliente), p_cliente, v.conta_id,
                              'titular_exclusao', jsonb_build_object('protocolo', v_prot));
    return (r::jsonb || jsonb_build_object('protocolo', v_prot))::json;
  end if;
  return r;
end $$;

-- plano 2000d · DS-069 / DS-165: pedidos do titular registrados (só admin) — protocolo, tipo, quando e se já foi feito
create or replace function public.nx_lgpd_pedidos_listar(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
begin
  return coalesce((select json_agg(json_build_object('protocolo', p.protocolo, 'tipo', p.tipo, 'pedido_em', p.pedido_em,
                                                     'executado_em', p.executado_em,
                                                     'executado_por_nome', (select k.nome from public.nx_contas k where k.id = p.executado_por))
                                   order by p.pedido_em desc)
                     from (select * from public.nx_lgpd_pedidos x where x.cliente_id = p_cliente order by x.pedido_em desc limit 200) p), '[]'::json);
end $$;

-- ------------------------------------------------------------
-- 5. Teste grátis de 14 dias pelo próprio site (DS-274 / UC-001 / DU-213 / DU-214 / DU-217 / DU-230 / DS-297 / DS-128)
-- ------------------------------------------------------------
-- Só para a org (revenda ou plataforma) que ligou marca.teste_aberto. Cria a empresa em teste (plano «teste», prazo da revenda em
-- limites.dias_teste, padrão 14), o modelo da vertical, a conta administradora e a sessão. Limites: 3 por dia por IP e por e-mail,
-- o teto global de cadastros (50/h) e testes ativos por org (limites.testes_ativos; padrão 5 na revenda, 200 na plataforma).
-- E-mail que já tem conta: a resposta é a MESMA de sucesso sem token (não revela quem tem conta) — a tela manda conferir o e-mail.
create or replace function public.nx_teste_criar(p_org_slug text, p_empresa text, p_vertical text, p_nome text, p_email text,
                                                 p_senha text, p_telefone text default null, p_aceite_em text default null,
                                                 p_tipo text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_emp text := btrim(coalesce(p_empresa, ''));
  v_nome text := btrim(coalesce(p_nome, ''));
  v_vert text := case when p_vertical in ('odonto', 'oficina', 'loja', 'generico') then p_vertical else 'generico' end;
  v_ip text := public.nx_login_ip();
  v_tel text := nullif(regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g'), '');
  o public.nx_orgs; v_min int; v_dias int; v_max int; v_slug text; v_cli uuid; k public.nx_contas; s json; v_ate date;
begin
  if char_length(v_emp) < 2 or char_length(v_emp) > 80 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'empresa'; end if;
  if char_length(v_nome) < 2 or char_length(v_nome) > 80 then raise exception 'nome_invalido' using errcode = '22023'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then raise exception 'email_invalido' using errcode = '22023'; end if;
  if v_tel is not null and v_tel !~ '^[0-9]{10,15}$' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'telefone'; end if;
  perform public.nx_senha_validar(p_senha);
  select * into o from public.nx_orgs x
   where x.slug = lower(btrim(coalesce(nullif(p_org_slug, ''), (select y.slug from public.nx_orgs y where y.tipo = 'plataforma' limit 1))));
  if o.id is null or coalesce(o.marca ->> 'teste_aberto', 'false') <> 'true' or o.status in ('suspenso', 'cancelado') then
    raise exception 'teste_fechado' using errcode = '42501';
  end if;
  -- limites (DU-230): IP e e-mail 3/dia; global de cadastros 50/h
  if v_ip is not null then
    v_min := public.nx_login_bloqueio('teste:' || v_ip, 3, interval '1 day');
    if v_min > 0 then raise exception 'muitas_tentativas' using errcode = '22023', hint = v_min::text; end if;
  end if;
  v_min := greatest(public.nx_login_bloqueio('teste_email:' || public.nx_hash(v_email), 3, interval '1 day'),
                    public.nx_login_bloqueio('cadastro:global', 50, interval '1 hour'));
  if v_min > 0 then raise exception 'muitas_tentativas' using errcode = '22023', hint = v_min::text; end if;
  -- plano 2000d · REV-M4: a tentativa conta no IP e no e-mail; o teto global só conta o teste CRIADO (lá embaixo)
  perform public.nx_login_falha_registrar(array_remove(array['teste_email:' || public.nx_hash(v_email),
                                                             case when v_ip is not null then 'teste:' || v_ip end], null));
  perform pg_advisory_xact_lock(hashtext('nx_teste_criar:' || o.id::text));
  -- DS-297: testes ativos por org
  v_max := coalesce(case when (o.limites ->> 'testes_ativos') ~ '^[0-9]{1,5}$' then (o.limites ->> 'testes_ativos')::int end,
                    case when o.tipo = 'plataforma' then 200 else 5 end);
  if (select count(*) from public.nx_clientes c where c.org_id = o.id and c.status = 'teste' and c.teste_ate >= public.nx_hoje_sp()) >= v_max then
    raise exception 'limite_testes' using errcode = '22023';
  end if;
  -- DS-128: e-mail já cadastrado → mesma resposta, sem token e sem criar nada
  if exists (select 1 from public.nx_contas x where x.email = v_email) then
    perform pg_sleep(0.3);
    return json_build_object('ok', true, 'confirmar_email', true);
  end if;
  v_dias := least(greatest(coalesce(case when (o.limites ->> 'dias_teste') ~ '^[0-9]{1,2}$' then (o.limites ->> 'dias_teste')::int end, 14), 1), 60);
  v_ate := public.nx_hoje_sp() + v_dias;
  v_slug := left(trim(both '-' from regexp_replace(public.nx_crm_norm(v_emp), '[^a-z0-9]+', '-', 'g')), 30);
  if char_length(v_slug) < 2 then v_slug := 'empresa'; end if;
  v_slug := v_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  insert into public.nx_clientes (slug, nome, org_id, vertical, status, plano, teste_ate, modulos, cadastro)
  values (v_slug, v_emp, o.id, v_vert, 'teste', 'teste', v_ate,
          coalesce((select p.modulos from public.nx_planos p where p.id = 'teste'), '{crm,conversas,relatorios,automacoes}'::text[]),
          jsonb_strip_nulls(jsonb_build_object('telefone', v_tel, 'aceite_em', left(nullif(btrim(coalesce(p_aceite_em, '')), ''), 40),
                                               'tipo', left(nullif(btrim(coalesce(p_tipo, '')), ''), 30), 'origem', 'site',
                                               'ip', case when v_ip is not null then left(public.nx_hash(v_ip), 12) end)))
  returning id into v_cli;
  perform public.nx_aplicar_modelo(v_cli, v_vert);
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id)
  values (v_email, v_nome, extensions.crypt(p_senha, extensions.gen_salt('bf', public.nx_bcrypt_custo())), 'clinica', true, o.id)
  returning * into k;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k.id, v_cli, 'admin');
  s := public.nx_sessao_criar(k.id);
  perform public.nx_auditar(o.id, v_cli, k.id, 'teste_criado', jsonb_build_object('vertical', v_vert, 'dias', v_dias));
  perform public.nx_login_falha_registrar(array['cadastro:global']);   -- plano 2000d · REV-M4: só o cadastro efetivo
  return json_build_object('ok', true, 'token', s ->> 'token', 'expira_em', s -> 'expira_em', 'cliente_id', v_cli,
                           'teste_ate', v_ate, 'nome', k.nome, 'papel', k.papel);
end $$;

-- plano 2000d · DS-277 / DU-241: prorrogar o teste UMA vez (1 a 30 dias), pela plataforma ou pelo gestor da revenda; auditado e
-- avisado no sino da empresa.
create or replace function public.nx_teste_prorrogar(p_token text, p_cliente uuid, p_dias int default 7)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura'); x public.nx_clientes; v_ate date;
begin
  if v.papel not in ('gestor', 'super') then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if p_dias is null or p_dias < 1 or p_dias > 30 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'dias'; end if;
  select * into x from public.nx_clientes c where c.id = p_cliente for update;
  if x.status <> 'teste' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'nao_esta_em_teste'; end if;
  if x.teste_prorrogado_em is not null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'ja_prorrogado'; end if;
  v_ate := greatest(coalesce(x.teste_ate, public.nx_hoje_sp()), public.nx_hoje_sp()) + p_dias;
  update public.nx_clientes set teste_ate = v_ate, teste_prorrogado_em = now(), teste_avisos = '{}'::jsonb where id = x.id;
  perform public.nx_auditar(x.org_id, x.id, v.conta_id, 'teste_prorrogado', jsonb_build_object('de', x.teste_ate, 'para', v_ate, 'dias', p_dias));
  perform public.nx_notificar(x.id, null, 'sistema', 'O teste foi prorrogado',
                              'Agora o teste vai até ' || to_char(v_ate, 'DD/MM') || '.', '#/config/plano');
  return json_build_object('ok', true, 'teste_ate', v_ate);
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-124 nx_cv_distribuir: o rodízio e o «mesmo atendente de antes» pulam conta/acesso suspenso e quem está ausente
--   (cópia da definição em vigor: 20260928e_conversas.sql)
-- ------------------------------------------------------------
create or replace function public.nx_cv_distribuir(p_conversa bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cv public.nx_conversas;
  d public.nx_departamentos;
  v_conta uuid;
  v_como text;
  v_nome text;
  v_contato text;
begin
  select * into cv from public.nx_conversas where id = p_conversa for update;
  if cv.id is null then return null; end if;
  if cv.atribuida_a is not null then return cv.atribuida_a; end if;
  if cv.status = 'resolvida' or cv.oculta then return null; end if;

  select * into d from public.nx_departamentos
   where id = cv.departamento_id and cliente_id = cv.cliente_id;
  if d.id is null then
    select * into d from public.nx_departamentos where cliente_id = cv.cliente_id and padrao limit 1;
  end if;
  if d.id is null then return null; end if;

  -- uma distribuição por vez por cliente (a contagem de abertas enxerga a anterior já gravada)
  perform pg_advisory_xact_lock(hashtextextended('nx-rodizio:' || cv.cliente_id::text, 0));

  if d.manter_atendente then
    select x.atribuida_a into v_conta
      from public.nx_conversas x
      join public.nx_acessos a on a.conta_id = x.atribuida_a and a.cliente_id = x.cliente_id
      join public.nx_contas k on k.id = a.conta_id
     where x.cliente_id = cv.cliente_id and x.contato_id = cv.contato_id and x.id <> cv.id
       and x.atribuida_a is not null
       and a.recebe_conversas and a.papel in ('atendente', 'supervisor', 'admin') and k.aprovado
       and a.suspenso_em is null and k.suspenso_em is null and (k.ausente_ate is null or k.ausente_ate <= now())   -- plano 2000d · DS-124
     order by x.aberta_em desc, x.id desc
     limit 1;
    if v_conta is not null then v_como := 'mesmo atendente de antes'; end if;
  end if;

  if v_conta is null and d.distribuicao = 'rodizio' then
    select a.conta_id into v_conta
      from public.nx_acessos a
      join public.nx_contas k on k.id = a.conta_id
     where a.cliente_id = cv.cliente_id and a.recebe_conversas
       and a.papel in ('atendente', 'supervisor', 'admin') and k.aprovado
       and (cardinality(a.departamentos) = 0 or d.id = any(a.departamentos))
       and a.suspenso_em is null and k.suspenso_em is null and (k.ausente_ate is null or k.ausente_ate <= now())   -- plano 2000d · DS-124
     order by (select count(*) from public.nx_conversas x
                where x.cliente_id = cv.cliente_id and x.atribuida_a = a.conta_id
                  and x.status in ('aberta', 'pendente')),
              a.ultima_atribuicao_em asc nulls first, a.criado_em, a.conta_id
     limit 1;
    if v_conta is not null then v_como := 'rodízio de ' || d.nome; end if;
  end if;

  if v_conta is null then return null; end if;

  update public.nx_conversas set atribuida_a = v_conta, atualizado_em = now() where id = cv.id;
  update public.nx_acessos set ultima_atribuicao_em = now()
   where conta_id = v_conta and cliente_id = cv.cliente_id;
  select k.nome into v_nome from public.nx_contas k where k.id = v_conta;
  select coalesce(nullif(k.nome, ''), k.telefone, 'contato') into v_contato
    from public.nx_contatos k where k.id = cv.contato_id;
  perform public.nx_cv_sistema(cv.id, 'Atribuída a ' || coalesce(v_nome, 'atendente') || ' (' || v_como || ')', null);
  perform public.nx_notificar(cv.cliente_id, v_conta, 'atribuida',
                              left('Nova conversa com ' || coalesce(v_contato, 'contato'), 120),
                              'Protocolo ' || cv.protocolo, '#/conversas/' || cv.id);
  return v_conta;
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-127 nx_notificar: conta suspensa (ou com o acesso a esta empresa suspenso) não recebe aviso
--   (cópia da definição em vigor: 20260928a_saas_base.sql)
-- ------------------------------------------------------------
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
     where k.id = p_conta and k.suspenso_em is null   -- plano 2000d · DS-127
       and not exists (select 1 from public.nx_acessos s where s.conta_id = k.id and s.cliente_id = p_cliente and s.suspenso_em is not null)
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
             and a.suspenso_em is null and k.suspenso_em is null   -- plano 2000d · DS-127
          union
          select k.id
            from public.nx_contas k join public.nx_clientes c on c.id = p_cliente
           where k.papel = 'gestor' and k.org_id = c.org_id and k.aprovado and k.suspenso_em is null) x;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-128 / DS-129 / DS-131 nx_criar_conta: e-mail repetido não é revelado; código comparado pelo resumo; bcrypt atual
--   (cópia da definição em vigor: 20261022a_plano1500c.sql)
-- ------------------------------------------------------------
create or replace function public.nx_criar_conta(p_email text, p_senha text, p_nome text, p_codigo text default null::text)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text := lower(trim(coalesce(p_email, ''))); v_primeira boolean; v_codigo text;
  v_ip text := public.nx_login_ip(); v_min int;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido'; end if;
  perform public.nx_senha_validar(p_senha);   -- plano 1500c · SC-010
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'nome_invalido'; end if;
  if v_ip is not null then
    v_min := public.nx_login_bloqueio('cadastro:' || v_ip, 5, interval '1 hour');
    if v_min > 0 then raise exception 'muitas_tentativas' using errcode = '22023', hint = v_min::text; end if;
  end if;
  -- plano 1500c · SC-018: um robô com muitos IPs criava contas sem fim (cada uma pendente de aprovação, enchendo a fila do gestor)
  v_min := public.nx_login_bloqueio('cadastro:global', 50, interval '1 hour');
  if v_min > 0 then raise exception 'muitas_tentativas' using errcode = '22023', hint = v_min::text; end if;
  perform pg_advisory_xact_lock(hashtext('nx_criar_conta'));
  select not exists (select 1 from public.nx_contas) into v_primeira;
  if exists (select 1 from public.nx_contas where email = v_email) then
    -- plano 2000d · DS-128: e-mail já cadastrado → a MESMA resposta de um cadastro novo pendente; quem tenta não descobre se o
    -- e-mail tem conta. A tentativa conta no limite do IP e deixa só o resumo do e-mail.
    -- plano 2000d · REV-M4: NÃO conta no teto global (só cadastro criado conta lá; senão um anônimo repetindo um e-mail trava
    -- o cadastro de todo mundo por 1 h)
    perform public.nx_login_falha_registrar(array_remove(array['cadastro_repetido:' || left(public.nx_hash(v_email), 16),
                                                               case when v_ip is not null then 'cadastro:' || v_ip end], null));
    perform pg_sleep(0.3);
    return json_build_object('ok', true, 'papel', 'clinica', 'aprovado', false);
  end if;
  if v_primeira then
    -- a PRIMEIRA conta vira gestor, mas só com o código de ativação: quem achar a URL antes do dono não vira dono
    select codigo_gestor into v_codigo from public.nx_config where id = 1;
    -- plano 2000d · DS-129: comparado pelo resumo (o tempo não entrega quantas letras acertou)
    if v_codigo is null or public.nx_hash(upper(trim(coalesce(p_codigo, '')))) <> public.nx_hash(v_codigo) then raise exception 'codigo_invalido'; end if;
  end if;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado)
  values (v_email, trim(p_nome), extensions.crypt(p_senha, extensions.gen_salt('bf', public.nx_bcrypt_custo()))   -- plano 2000d · DS-131
         ,
          case when v_primeira then 'gestor' else 'clinica' end, v_primeira);
  -- o cadastro que deu certo conta no limite do IP (a transação commita)
  perform public.nx_login_falha_registrar(array_remove(array['cadastro:global', case when v_ip is not null then 'cadastro:' || v_ip end], null));   -- plano 1500c · SC-018
  return json_build_object('ok', true, 'papel', case when v_primeira then 'gestor' else 'clinica' end, 'aprovado', v_primeira);
end $function$;

-- ------------------------------------------------------------
-- plano 2000d · DS-135 / DS-131 nx_convite_aceitar: convite feito para um e-mail só vale para esse e-mail; bcrypt atual
--   (cópia da definição em vigor: 20261022a_plano1500c.sql)
-- ------------------------------------------------------------
create or replace function public.nx_convite_aceitar(p_convite text, p_nome text, p_email text, p_senha text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  cv public.nx_convites;
  k public.nx_contas;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_nome text := btrim(coalesce(p_nome, ''));
  v_token text;
  s json;   -- plano 1500c
begin
  if p_convite is null or p_convite !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'convite_invalido' using errcode = '22023';
  end if;
  select * into cv from public.nx_convites where token_hash = public.nx_hash(lower(p_convite)) for update;
  if cv.id is null or cv.usado_em is not null or cv.revogado or cv.expira_em <= now() or cv.tentativas >= 5 then
    raise exception 'convite_invalido' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido' using errcode = '22023'; end if;

  -- plano 2000d · DS-135: o link vazado (ou repassado) não serve para outro e-mail criar conta na empresa
  if nullif(btrim(coalesce(cv.email, '')), '') is not null and lower(btrim(cv.email)) <> v_email then
    raise exception 'convite_outro_email' using errcode = '22023';
  end if;
  select * into k from public.nx_contas where email = v_email;
  if k.id is null then
    -- conta NOVA, já aprovada, na org do convite
    if char_length(v_nome) < 2 or char_length(v_nome) > 80 then raise exception 'nome_invalido' using errcode = '22023'; end if;
    perform public.nx_senha_validar(p_senha);   -- plano 1500c · SC-010
    insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id)
    values (v_email, v_nome, extensions.crypt(p_senha, extensions.gen_salt('bf', public.nx_bcrypt_custo())),
            case when cv.papel = 'gestor' then 'gestor' else 'clinica' end, true, cv.org_id)
    returning * into k;
    if cv.cliente_id is not null then
      insert into public.nx_acessos (conta_id, cliente_id, papel, departamentos)
      values (k.id, cv.cliente_id, cv.papel, cv.departamentos)
      on conflict (conta_id, cliente_id) do nothing;
    end if;
  else
    -- conta EXISTENTE: nunca vira gestor por convite; nunca muda org, papel, nome ou senha
    if cv.papel = 'gestor' then
      raise exception 'convite_invalido' using errcode = '22023', hint = 'conta_existente';
    end if;
    if k.senha_hash <> extensions.crypt(coalesce(p_senha, ''), k.senha_hash) then
      perform pg_sleep(0.4);
      update public.nx_convites set tentativas = tentativas + 1 where id = cv.id;
      return json_build_object('ok', false, 'erro', 'credenciais_invalidas');
    end if;
    if not k.aprovado then raise exception 'conta_pendente' using errcode = '28000'; end if;
    if k.suspenso_em is not null then raise exception 'conta_suspensa' using errcode = '28000'; end if;   -- plano 1500c · SC-004
    insert into public.nx_acessos (conta_id, cliente_id, papel, departamentos)
    values (k.id, cv.cliente_id, cv.papel, cv.departamentos)
    on conflict (conta_id, cliente_id) do nothing;
  end if;

  update public.nx_convites set usado_em = now(), usado_por = k.id where id = cv.id;
  -- plano 1500c · SC-016: a sessão nasce no nx_sessao_criar (a faxina diária apaga as vencidas; o delete de TODAS aqui travava a tabela)
  s := public.nx_sessao_criar(k.id);
  v_token := s ->> 'token';
  perform public.nx_auditar(cv.org_id, cv.cliente_id, k.id, 'convite_aceito', jsonb_build_object('convite', cv.id, 'papel', cv.papel));
  return json_build_object('ok', true, 'token', v_token, 'nome', k.nome, 'papel', k.papel, 'cliente_id', cv.cliente_id,
                           'expira_em', s -> 'expira_em');
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-130 nx_senha_validar: as senhas mais usadas são recusadas (senha_fraca)
--   (cópia da definição em vigor: 20261022a_plano1500c.sql)
-- ------------------------------------------------------------
create or replace function public.nx_senha_validar(p_senha text)
returns void
language plpgsql immutable
security definer
set search_path = ''
as $$
begin
  if char_length(btrim(coalesce(p_senha, ''))) < 8 then raise exception 'senha_curta' using errcode = '22023'; end if;
  if octet_length(p_senha) > 72 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'senha_longa'; end if;
  if public.nx_senha_comum(p_senha) then raise exception 'senha_fraca' using errcode = '22023'; end if;   -- plano 2000d · DS-130
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-131 nx_entrar: senha certa com bcrypt de custo antigo é regravada com o custo atual
--   (cópia da definição em vigor: 20261022a_plano1500c.sql)
-- ------------------------------------------------------------
create or replace function public.nx_entrar(p_email text, p_senha text)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
declare
  c public.nx_contas; v_token text;
  s json;   -- plano 1500c: a sessão criada (nx_sessao_criar)
  v_email text := lower(trim(coalesce(p_email, '')));
  v_ip text := public.nx_login_ip();
  v_rest boolean := nullif(current_setting('request.headers', true), '') is not null;   -- chamada pelo PostgREST?
  v_min int;
begin
  -- 1. bloqueio ANTES de qualquer custo (bcrypt/pg_sleep). Plano 1000 (SV-238): 10 falhas em 15 min por (conta, IP) ou por IP;
  --    por CONTA só com 50 (de vários IPs) — antes 10 senhas erradas de qualquer lugar trancavam o dono da clínica para fora.
  --    Sem IP (chamada por SQL): por conta com 10, como antes.
  v_min := greatest(public.nx_login_bloqueio('conta:' || v_email, case when v_ip is null then 10 else 50 end, interval '15 minutes'),
                    case when v_ip is null then 0
                         else greatest(public.nx_login_bloqueio('ip:' || v_ip, 10, interval '15 minutes'),
                                       public.nx_login_bloqueio('contaip:' || v_email || '|' || v_ip, 10, interval '15 minutes')) end);
  if v_min > 0 then
    raise exception 'muitas_tentativas' using errcode = '22023', hint = v_min::text;
  end if;

  select * into c from public.nx_contas where email = v_email;
  -- e-mail inexistente também paga uma verificação bcrypt (mesmo custo das contas), senão o tempo entrega quais e-mails existem
  if c.id is null then perform extensions.crypt(coalesce(p_senha, ''), extensions.gen_salt('bf', 10)); end if;
  if c.id is null or c.senha_hash <> extensions.crypt(coalesce(p_senha, ''), c.senha_hash) then
    perform pg_sleep(0.4);
    if v_rest then
      -- 2. a falha fica gravada (a transação commita) e o front recebe exatamente o que receberia de um raise
      perform public.nx_login_falha_registrar(array_remove(array['conta:' || v_email, case when v_ip is not null then 'ip:' || v_ip end,
                                                                   case when v_ip is not null then 'contaip:' || v_email || '|' || v_ip end], null));
      -- plano 1000 (SV-238): o limite alto por conta disparou → a própria conta é avisada (uma vez por dia)
      if c.id is not null and public.nx_login_bloqueio('conta:' || v_email, 50, interval '15 minutes') > 0
         and not exists (select 1 from public.nx_notificacoes n where n.conta_id = c.id and n.titulo = 'Muitas tentativas de entrar na sua conta'
                                                                    and n.criado_em > now() - interval '1 day') then
        perform public.nx_notificar(a.cliente_id, c.id, 'sistema', 'Muitas tentativas de entrar na sua conta',
                  'Houve 50 senhas erradas em 15 minutos, de vários lugares. Se não foi você, troque a senha em Minha conta.', '#/conta')
           from (select x.cliente_id from public.nx_acessos x where x.conta_id = c.id order by x.cliente_id limit 1) a;
      end if;
      perform set_config('response.status', '400', true);
      -- plano 1500c · UCB-047: quantas tentativas restam antes do bloqueio (pela chave mais apertada: conta+IP; sem IP, a conta)
      return json_build_object('code', 'P0001', 'message', 'credenciais_invalidas', 'details', null,
        'hint', 'restam:' || greatest(0, 10 - (select count(*)::int from public.nx_login_falhas f
                                                where f.chave = case when v_ip is null then 'conta:' || v_email
                                                                     else 'contaip:' || v_email || '|' || v_ip end
                                                  and f.em > now() - interval '15 minutes')));
    end if;
    raise exception 'credenciais_invalidas';
  end if;
  if not c.aprovado then raise exception 'conta_pendente'; end if;
  if c.suspenso_em is not null then raise exception 'conta_suspensa' using errcode = '28000'; end if;   -- plano 1500c · SC-004
  -- plano 2000d · DS-131: a senha já conferida é regravada com o custo atual do bcrypt (transparente para a pessoa)
  if c.senha_hash ~ '^\$2[abxy]?\$[0-9]{2}\$' and substr(c.senha_hash, 5, 2)::int < public.nx_bcrypt_custo() then
    update public.nx_contas set senha_hash = extensions.crypt(p_senha, extensions.gen_salt('bf', public.nx_bcrypt_custo())) where id = c.id;
  end if;
  -- plano 1000 (SV-239): login certo zera as falhas desta conta (as do IP ficam: outra conta não «limpa» um IP que tenta senhas)
  delete from public.nx_login_falhas where chave = 'conta:' || v_email or (v_ip is not null and chave = 'contaip:' || v_email || '|' || v_ip);
  -- plano 1500c · SC-020: a sessão nasce no nx_sessao_criar (navegador + o teto de 20 por conta do SV-129)
  s := public.nx_sessao_criar(c.id);
  v_token := s ->> 'token';
  -- plano 1500c · SC-019: a entrada fica na auditoria (só um resumo do IP, nunca o IP)
  perform public.nx_auditar(c.org_id, null, c.id, 'entrou',
                            jsonb_build_object('ip', case when v_ip is not null then left(public.nx_hash(v_ip), 12) end));
  -- plano 1500c · UCC-030: até quando o token vale
  return json_build_object('token', v_token, 'nome', c.nome, 'papel', c.papel, 'expira_em', s -> 'expira_em');
end $function$;

-- ------------------------------------------------------------
-- plano 2000d · DS-169 / DS-188 nx_ia_reservar: ações novas (simular, reescrever, traduzir, transcrever), teto diário do simular e teto diário opcional
--   (cópia da definição em vigor: 20261022a_plano1500c.sql)
-- ------------------------------------------------------------
create or replace function public.nx_ia_reservar(p_cliente uuid, p_conta uuid, p_acao text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agora timestamptz := clock_timestamp();
  v_inicio_mes timestamptz;
  v_limite int;
  v_usadas int;
  v_reservadas int;
  v_minuto int;
  v_id uuid;
  v_lim_dia int; v_ini_dia timestamptz; v_dia_n int;   -- plano 2000d · DS-169 / DS-188
begin
  -- plano 1000 (SV-063): + 'relatorio' (leitura de IA do relatório diário/mensal, pelo cron, sem pessoa)
  if p_cliente is null or p_acao is null or p_acao not in ('sugerir', 'resumir', 'automacao', 'relatorio', 'simular', 'reescrever', 'traduzir', 'transcrever')   -- plano 2000d · DS-169

     or (p_conta is null and p_acao not in ('automacao', 'relatorio')) then
    return json_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  -- plano 1500c · SC-099 (LGPD): a empresa desligou o envio das conversas à IA (coluna da plataforma ou cfg.ia.desligada do painel)
  if exists (select 1 from public.nx_clientes c
              where c.id = p_cliente and (c.ia_desligada or coalesce(c.cfg -> 'ia' ->> 'desligada', '') = 'true')) then
    return json_build_object('ok', false, 'erro', 'ia_desligada');
  end if;
  if p_conta is not null
     and not exists (select 1 from public.nx_acessos a where a.cliente_id = p_cliente and a.conta_id = p_conta)
     -- plano 1000 (SV-188): gestor da org do cliente e super entram pelo nx_ctx SEM nx_acessos — «Sugerir», «Resumir» e «Criar
     -- automação com IA» sempre falhavam para a equipe da Nexus (a mesma regra do nx_ctx)
     and not exists (select 1 from public.nx_contas k join public.nx_clientes c on c.id = p_cliente
                      where k.id = p_conta and k.papel = 'gestor'
                        and (k.org_id = c.org_id
                             or exists (select 1 from public.nx_orgs o where o.id = k.org_id and o.tipo = 'plataforma'))) then
    return json_build_object('ok', false, 'erro', 'sem_acesso');
  end if;

  -- Um bloqueio por empresa protege simultaneamente o teto mensal e o limite por atendente.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('nx-ia-reservas'), pg_catalog.hashtext(p_cliente::text));
  delete from public.nx_ia_reservas where cliente_id = p_cliente and expira_em <= v_agora;

  v_inicio_mes := date_trunc('month', v_agora at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_limite := public.nx_limite(p_cliente, 'ia_mes');
  v_usadas := public.nx_uso(p_cliente, 'ia_mes');
  select count(*)::int into v_reservadas from public.nx_ia_reservas r
   where r.cliente_id = p_cliente and r.criado_em >= v_inicio_mes and r.expira_em > v_agora;
  if v_limite is not null and v_usadas + v_reservadas >= v_limite then
    perform public.nx_ia_franquia_avisar(p_cliente, 100, v_inicio_mes);   -- plano 1500c · SC-095
    return json_build_object('ok', false, 'erro', 'ia_cota');
  end if;

  if p_conta is not null then
    select count(*)::int into v_minuto from public.nx_ia_uso u
     where u.cliente_id = p_cliente and u.conta_id = p_conta and u.criado_em > v_agora - interval '1 minute';
    v_minuto := v_minuto + (select count(*)::int from public.nx_ia_reservas r
      where r.cliente_id = p_cliente and r.conta_id = p_conta and r.criado_em > v_agora - interval '1 minute' and r.expira_em > v_agora);
    if v_minuto >= 20 then
      return json_build_object('ok', false, 'erro', 'muitos_pedidos');
    end if;
  elsif p_acao = 'automacao' then
    select count(*)::int into v_minuto from public.nx_ia_uso u
     where u.cliente_id = p_cliente and u.acao = 'automacao' and u.criado_em > v_agora - interval '1 minute';
    v_minuto := v_minuto + (select count(*)::int from public.nx_ia_reservas r
      where r.cliente_id = p_cliente and r.acao = 'automacao' and r.criado_em > v_agora - interval '1 minute' and r.expira_em > v_agora);
    if v_minuto >= 30 then
      return json_build_object('ok', false, 'erro', 'muitos_pedidos');
    end if;
  end if;

  -- plano 2000d · DS-169: «Testar o assistente» (simular) tem teto próprio por dia (limite ia_simular_dia; padrão 30) — não come a
  -- franquia de quem atende. DS-188: teto diário geral só quando o plano/cliente define ia_dia.
  v_ini_dia := ((v_agora at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo');
  if p_acao = 'simular' then
    v_lim_dia := coalesce(public.nx_limite(p_cliente, 'ia_simular_dia'), 30);
    select (select count(*)::int from public.nx_ia_uso u where u.cliente_id = p_cliente and u.acao = 'simular' and u.criado_em >= v_ini_dia)
         + (select count(*)::int from public.nx_ia_reservas r where r.cliente_id = p_cliente and r.acao = 'simular' and r.criado_em >= v_ini_dia and r.expira_em > v_agora)
      into v_dia_n;
    if v_dia_n >= v_lim_dia then return json_build_object('ok', false, 'erro', 'limite_dia'); end if;
  end if;
  v_lim_dia := public.nx_limite(p_cliente, 'ia_dia');
  if v_lim_dia is not null then
    select (select count(*)::int from public.nx_ia_uso u where u.cliente_id = p_cliente and u.criado_em >= v_ini_dia)
         + (select count(*)::int from public.nx_ia_reservas r where r.cliente_id = p_cliente and r.criado_em >= v_ini_dia and r.expira_em > v_agora)
      into v_dia_n;
    if v_dia_n >= v_lim_dia then return json_build_object('ok', false, 'erro', 'limite_dia'); end if;
  end if;

  insert into public.nx_ia_reservas(cliente_id, conta_id, acao, criado_em, expira_em)
  values (p_cliente, p_conta, p_acao, v_agora, v_agora + interval '5 minutes')
  returning id into v_id;
  -- plano 1500c · SC-095: passou de 80% com esta reserva → os admins ficam sabendo antes de acabar
  if coalesce(v_limite, 0) > 0 and (v_usadas + v_reservadas + 1) * 100 >= v_limite * 80 then
    perform public.nx_ia_franquia_avisar(p_cliente, case when v_usadas + v_reservadas + 1 >= v_limite then 100 else 80 end, v_inicio_mes);
  end if;
  return json_build_object('ok', true, 'reserva_id', v_id);
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-156 nx_suporte_entrar: os admins da empresa ficam sabendo que o suporte entrou e por quê (LGPD: transparência)
--   (cópia da definição em vigor: 20261022a_plano1500c.sql)
-- ------------------------------------------------------------
create or replace function public.nx_suporte_entrar(p_token text, p_cliente uuid, p_motivo text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
begin
  if v.papel not in ('gestor', 'super') then raise exception 'sem_permissao' using errcode = '42501'; end if;
  -- plano 2000d · DS-156: um aviso por admin (no máximo 1 a cada 2 h por pessoa da equipe de suporte)
  if not exists (select 1 from public.nx_auditoria x where x.acao = 'suporte_motivo' and x.conta_id = v.conta_id and x.cliente_id = p_cliente
                    and x.criado_em > now() - interval '2 hours') then
    perform public.nx_notificar(p_cliente, a.conta_id, 'sistema', 'A equipe de suporte entrou na sua conta',
                                left(coalesce('Motivo: ' || nullif(btrim(coalesce(p_motivo, '')), ''), 'Sem motivo informado.') || ' Quem: ' || coalesce(v.nome, 'suporte') || '.', 500),
                                '#/config/equipe')
       from public.nx_acessos a where a.cliente_id = p_cliente and a.papel = 'admin' and a.suspenso_em is null and a.conta_id <> v.conta_id;
  end if;
  perform public.nx_auditar((select c.org_id from public.nx_clientes c where c.id = p_cliente), p_cliente, v.conta_id, 'suporte_motivo',
                            jsonb_build_object('papel', v.papel, 'motivo', left(nullif(btrim(coalesce(p_motivo, '')), ''), 200)));
  return json_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-280 nx_exigir_modulo: módulos efetivos = cliente ∩ plano (para empresas novas e em teste; as de antes ficam como estão)
--   (cópia da definição em vigor: 20260928a_saas_base.sql)
-- ------------------------------------------------------------
create or replace function public.nx_exigir_modulo(p_cliente uuid, p_modulo text)
returns void
language plpgsql stable
security definer
set search_path = ''
as $$
declare v text[]; c public.nx_clientes; v_plano text[];
begin
  select * into c from public.nx_clientes x where x.id = p_cliente;
  if c.id is null then raise exception 'cliente_nao_encontrado' using errcode = '22023'; end if;
  v := c.modulos;
  -- plano 2000d · DS-280: o plano também manda (plano «essencial» não liga Anúncios só porque a lista do cliente tem). Só para
  -- empresa em teste ou criada a partir desta versão — as que já existiam (e a configuração que a plataforma fez nelas) não mudam.
  if c.plano is not null and c.plano <> 'interno' and (c.status = 'teste' or c.plano = 'teste' or c.criado_em >= timestamptz '2026-10-26 00:00:00-03') then
    select p.modulos into v_plano from public.nx_planos p where p.id = c.plano;
    if cardinality(coalesce(v_plano, '{}'::text[])) > 0 and not (p_modulo = any(v_plano)) then
      raise exception 'modulo_desligado' using errcode = '42501', hint = p_modulo;
    end if;
  end if;
  if not (p_modulo = any(coalesce(v, '{}'::text[]))) then
    raise exception 'modulo_desligado' using errcode = '42501', hint = p_modulo;
  end if;
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-281 nx_uso: departamentos, respostas prontas e envios automáticos do dia também têm contagem (para os limites do plano)
--   (cópia da definição em vigor: 20260930c_ia_reservas_atomicas.sql)
-- ------------------------------------------------------------
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
               where u.cliente_id = p_cliente
                 and u.criado_em >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'));
    when 'empresas' then
      return (select count(*) from public.nx_clientes x
               where x.org_id = (select c.org_id from public.nx_clientes c where c.id = p_cliente));
    -- plano 2000d · DS-281
    when 'departamentos' then
      return (select count(*) from public.nx_departamentos d where d.cliente_id = p_cliente and d.ativo);
    when 'respostas' then
      return (select count(*) from public.nx_respostas r where r.cliente_id = p_cliente);
    when 'envios_dia' then
      return (select count(*) from public.nx_envios_fila f
               where f.cliente_id = p_cliente and f.origem = 'automacao' and f.status <> 'cancelado'
                 and f.criado_em >= (((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo'));
    else
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'chave';
  end case;
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-281 nx_departamento_salvar: departamento NOVO confere o limite do plano
--   (cópia da definição em vigor: 20261022a_plano1500c.sql)
-- ------------------------------------------------------------
create or replace function public.nx_departamento_salvar(p_token text, p_cliente uuid, p_departamento jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  r jsonb := coalesce(p_departamento, '{}'::jsonb);
  x public.nx_departamentos;
  v_id uuid;
  v_nome text; v_cor text; v_padrao boolean; v_dist text; v_manter boolean; v_hor jsonb; v_msg text;
  v_ordem int; v_ativo boolean;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if jsonb_typeof(r) <> 'object' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
  end if;
  begin
    v_id := nullif(r ->> 'id', '')::uuid;
    v_ordem := nullif(r ->> 'ordem', '')::int;
    v_padrao := nullif(r ->> 'padrao', '')::boolean;
    v_manter := nullif(r ->> 'manter_atendente', '')::boolean;
    v_ativo := nullif(r ->> 'ativo', '')::boolean;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
  end;
  if v_id is not null then
    select * into x from public.nx_departamentos where id = v_id and cliente_id = p_cliente for update;
    if x.id is null then
      raise exception 'departamento_nao_encontrado' using errcode = '22023';
    end if;
  elsif (select count(*) from public.nx_departamentos where cliente_id = p_cliente) >= 30 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'maximo';
  end if;

  v_nome := btrim(coalesce(r ->> 'nome', x.nome, ''));
  if char_length(v_nome) < 1 or char_length(v_nome) > 40 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'nome';
  end if;
  if exists (select 1 from public.nx_departamentos o
              where o.cliente_id = p_cliente and lower(o.nome) = lower(v_nome) and o.id is distinct from v_id) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'nome_repetido';
  end if;
  v_cor := coalesce(nullif(btrim(r ->> 'cor'), ''), x.cor, '#6FA3CF');
  if v_cor !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'cor';
  end if;
  v_cor := upper(v_cor);
  v_dist := coalesce(nullif(btrim(r ->> 'distribuicao'), ''), x.distribuicao, 'manual');
  if v_dist not in ('manual', 'rodizio') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'distribuicao';
  end if;
  v_padrao := coalesce(v_padrao, x.padrao, false);
  v_manter := coalesce(v_manter, x.manter_atendente, true);
  v_ativo := coalesce(v_ativo, x.ativo, true);
  v_ordem := coalesce(v_ordem, x.ordem,
                      (select coalesce(max(o.ordem), -1) + 1 from public.nx_departamentos o where o.cliente_id = p_cliente));
  if r ? 'horario' then v_hor := public.nx_cv_horario_normalizar(r -> 'horario'); else v_hor := x.horario; end if;
  if r ? 'msg_fora_horario' then v_msg := nullif(btrim(coalesce(r ->> 'msg_fora_horario', '')), '');
  else v_msg := x.msg_fora_horario; end if;
  if char_length(v_msg) > 1000 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'msg_fora_horario';
  end if;

  -- um só padrão: o padrão atual não deixa de ser padrão sem outro no lugar, nem fica inativo
  if x.id is not null and x.padrao and not v_padrao then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'padrao';
  end if;
  if v_padrao and not v_ativo then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'padrao_inativo';
  end if;
  if v_padrao then
    update public.nx_departamentos set padrao = false
     where cliente_id = p_cliente and padrao and id is distinct from v_id;
  end if;

  if v_id is null then
    perform public.nx_exigir_limite(p_cliente, 'departamentos');   -- plano 2000d · DS-281
    insert into public.nx_departamentos (cliente_id, nome, cor, padrao, distribuicao, manter_atendente, horario,
                                         msg_fora_horario, ordem, ativo)
    values (p_cliente, v_nome, v_cor, v_padrao, v_dist, v_manter, v_hor, v_msg, v_ordem, v_ativo)
    returning * into x;
  else
    update public.nx_departamentos
       set nome = v_nome, cor = v_cor, padrao = v_padrao, distribuicao = v_dist, manter_atendente = v_manter,
           horario = v_hor, msg_fora_horario = v_msg, ordem = v_ordem, ativo = v_ativo
     where id = v_id
    returning * into x;
  end if;
  -- plano 1500c · CC-027: só as chaves enviadas mudam; o CHECK da tabela garante 1..1440 e atenção < atraso < crítico
  if r ? 'sla_aten' or r ? 'sla_atraso' or r ? 'sla_critico' then
    begin
      update public.nx_departamentos d
         set sla_aten = coalesce((r ->> 'sla_aten')::int, d.sla_aten),
             sla_atraso = coalesce((r ->> 'sla_atraso')::int, d.sla_atraso),
             sla_critico = coalesce((r ->> 'sla_critico')::int, d.sla_critico)
       where d.id = x.id
      returning * into x;
    exception when others then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'sla';
    end;
  end if;
  perform public.nx_pulso_bater(p_cliente);
  return public.nx_cv_json_dep(x)::json;
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-281 nx_resposta_salvar: resposta pronta NOVA confere o limite do plano
--   (cópia da definição em vigor: 20260928e_conversas.sql)
-- ------------------------------------------------------------
create or replace function public.nx_resposta_salvar(p_token text, p_cliente uuid, p_resposta jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'supervisor');
  r jsonb := coalesce(p_resposta, '{}'::jsonb);
  x public.nx_respostas;
  v_id uuid;
  v_atalho text; v_titulo text; v_corpo text; v_dep uuid; v_ordem int; v_ativo boolean;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  begin
    v_id := nullif(r ->> 'id', '')::uuid;
    v_dep := nullif(r ->> 'departamento_id', '')::uuid;
    v_ordem := coalesce(nullif(r ->> 'ordem', '')::int, 0);
    v_ativo := coalesce(nullif(r ->> 'ativo', '')::boolean, true);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'resposta';
  end;
  if v_id is not null then
    select * into x from public.nx_respostas where id = v_id and cliente_id = p_cliente for update;
    if x.id is null then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'id';
    end if;
  end if;
  v_atalho := lower(regexp_replace(btrim(coalesce(r ->> 'atalho', x.atalho, '')), '^/+', ''));
  if v_atalho !~ '^[a-z0-9_-]{1,30}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'atalho';
  end if;
  v_titulo := btrim(coalesce(r ->> 'titulo', x.titulo, ''));
  if char_length(v_titulo) < 1 or char_length(v_titulo) > 60 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'titulo';
  end if;
  v_corpo := btrim(coalesce(r ->> 'corpo', x.corpo, ''));
  if char_length(v_corpo) < 1 or char_length(v_corpo) > 4096 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'corpo';
  end if;
  if not (r ? 'departamento_id') then v_dep := x.departamento_id; end if;
  if v_dep is not null and not exists (select 1 from public.nx_departamentos d where d.id = v_dep and d.cliente_id = p_cliente) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
  end if;
  if not (r ? 'ordem') and x.id is not null then v_ordem := x.ordem; end if;
  if not (r ? 'ativo') and x.id is not null then v_ativo := x.ativo; end if;
  if exists (select 1 from public.nx_respostas o
              where o.cliente_id = p_cliente and o.atalho = v_atalho and o.id is distinct from v_id) then
    raise exception 'atalho_em_uso' using errcode = '22023', hint = 'atalho';
  end if;

  if v_id is null then
    perform public.nx_exigir_limite(p_cliente, 'respostas');   -- plano 2000d · DS-281
    insert into public.nx_respostas (cliente_id, atalho, titulo, corpo, departamento_id, ordem, ativo)
    values (p_cliente, v_atalho, v_titulo, v_corpo, v_dep, v_ordem, v_ativo)
    returning * into x;
  else
    update public.nx_respostas
       set atalho = v_atalho, titulo = v_titulo, corpo = v_corpo, departamento_id = v_dep,
           ordem = v_ordem, ativo = v_ativo
     where id = v_id
    returning * into x;
  end if;
  return json_build_object('id', x.id, 'atalho', x.atalho, 'titulo', x.titulo, 'corpo', x.corpo,
                           'departamento_id', x.departamento_id, 'ordem', x.ordem, 'ativo', x.ativo,
                           'usos', x.usos);
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DU-042 / DU-043 / DU-044 / AX-059 / DS-350 / DU-383 nx_auto_passos: toda mensagem e todo modelo passam pela nx_auto_envio_guarda
--   (cópia da definição em vigor: 20261001b_correcoes.sql)
-- ------------------------------------------------------------
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
  v_guarda text;   -- plano 2000d
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
          v_guarda := public.nx_auto_envio_guarda(p_auto, v_ct, true, v_quando);   -- plano 2000d · REV-M1: pela hora prevista
          if v_ue is null or v_quando >= v_ue + interval '24 hours' then
            v_det := v_det || case when v_optin is false then 'mensagem: pulada (contato pediu para não receber)'
                                   else 'mensagem: pulada (fora da janela de 24 h)' end;
          elsif v_guarda is not null then
            v_det := v_det || ('mensagem: pulada (' || v_guarda || ')');
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
        -- plano 2000d: opt-out só barra modelo de MARKETING (lembrete de consulta continua); o resto da guarda vale para todos
        -- plano 2000d · REV-M1: pela hora prevista (horário da conversa do alvo ou o padrão da empresa)
        elsif public.nx_auto_envio_guarda(p_auto, v_ct, upper(coalesce(t.categoria, '')) = 'MARKETING',
                                          public.nx_auto_quando(v_c, v_cv, p_auto.respeitar_horario)) is not null then
          v_det := v_det || ('modelo: pulado (' || public.nx_auto_envio_guarda(p_auto, v_ct, upper(coalesce(t.categoria, '')) = 'MARKETING',
                                          public.nx_auto_quando(v_c, v_cv, p_auto.respeitar_horario)) || ')');
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
-- plano 2000d · DU-041 nx_auto_alvos_tempo: «só daqui para frente» — quem já estava na situação quando a automação foi ligada fica de fora
--   (cópia da definição em vigor: 20261015a_plano1000b.sql)
-- ------------------------------------------------------------
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
  v_tt text; v_dono_tv uuid;   -- plano 1000b · UB-219
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
         and (p_auto.ignorar_antes is null or cv.ultima_entrada_em + make_interval(mins => v_min) >= p_auto.ignorar_antes)   -- plano 2000d · DU-041
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
         and (p_auto.ignorar_antes is null or l.estagio_em + make_interval(hours => v_h) >= p_auto.ignorar_antes)   -- plano 2000d · DU-041
         and not exists (select 1 from public.nx_auto_execucoes x
                          where x.automacao_id = p_auto.id
                            and x.chave = 'te:' || l.id || ':' || l.estagio_id || ':' || floor(extract(epoch from l.estagio_em))::bigint)
       order by l.estagio_em
       limit p_lim;
  when 'tarefa_vencida' then
    v_tt := nullif(btrim(coalesce(c ->> 'tipo_tarefa', '')), '');
    v_dono_tv := public.nx_auto_uuid(c ->> 'dono_id');
    return query
      select 'tv:' || t.id, jsonb_build_object('tarefa_id', t.id, 'negocio_id', t.negocio_id, 'contato_id', t.contato_id)
        from public.nx_tarefas t
       where t.cliente_id = p_auto.cliente_id and t.concluida_em is null
         and t.vence_em < now() and t.vence_em > now() - interval '7 days'
         and (p_auto.ignorar_antes is null or t.vence_em >= p_auto.ignorar_antes)   -- plano 2000d · DU-041
         and (v_tt is null or t.tipo = v_tt) and (v_dono_tv is null or t.dono_id = v_dono_tv)   -- plano 1000b · UB-219
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
-- plano 2000d · DU-041 nx_auto_normalizar: guarda config.so_novos («só daqui para frente»)
--   (cópia da definição em vigor: 20261015a_plano1000b.sql)
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
      -- plano 1000b · UB-219: filtros opcionais «só deste tipo» e «só desta pessoa»
      if coalesce(btrim(c ->> 'tipo_tarefa'), '') <> ''
         and c ->> 'tipo_tarefa' not in ('tarefa', 'ligacao', 'reuniao', 'visita', 'whatsapp', 'email') then
        perform public.nx_auto_falha('escolha o tipo de tarefa em «Quando»');
      end if;
      nc := jsonb_strip_nulls(jsonb_build_object(
        'tipo_tarefa', nullif(btrim(coalesce(c ->> 'tipo_tarefa', '')), ''),
        'dono_id', public.nx_auto_id(p_cliente, 'conta', c ->> 'dono_id', 'a pessoa escolhida em «Quando» não tem mais acesso')));
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
      when v_campo = 'campanha' then 'campanha'       -- plano 1000b · UB-216
      when v_campo = 'plataforma' then 'plataforma'   -- plano 1000b · UB-216
      when v_campo ~ '^contato\.[a-z][a-z0-9_]{0,39}$' then 'campo'
    end;
    if v_tipo is null then perform public.nx_auto_falha(p || ': escolha o campo'); end if;
    if v_op not in ('igual', 'diferente', 'contem', 'nao_contem', 'maior', 'menor', 'vazio', 'preenchido') then
      perform public.nx_auto_falha(p || ': escolha a comparação');
    end if;
    if v_op in ('maior', 'menor') and v_tipo not in ('numero', 'campo') then
      perform public.nx_auto_falha(p || ': «maior» e «menor» valem só para valor e campos');
    end if;
    -- plano 1000b · UB-216: campanha é «contém / não contém» (o nome, o id ou o utm_campaign); plataforma é «é / não é»
    if v_tipo = 'campanha' and v_op in ('igual', 'diferente') then
      perform public.nx_auto_falha(p || ': para a campanha use «contém» ou «não contém»');
    end if;
    if v_tipo = 'plataforma' and v_op in ('contem', 'nao_contem') then
      perform public.nx_auto_falha(p || ': para a plataforma use «é» ou «não é»');
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
        if v_tipo = 'plataforma' then
          v_txt := lower(v_txt);
          if v_txt not in ('meta', 'google') then perform public.nx_auto_falha(p || ': escolha a plataforma (Meta ou Google)'); end if;
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
  -- plano 2000d · DU-041: «só daqui para frente» (vale nos gatilhos de tempo; a data é gravada ao ligar)
  if coalesce(c ->> 'so_novos', 'false') = 'true' then nc := coalesce(nc, '{}'::jsonb) || jsonb_build_object('so_novos', true); end if;
  return jsonb_build_object('nome', v_nome, 'gatilho', v_gat, 'config', nc, 'condicoes', nconds, 'acoes', nacoes,
                            'respeitar_horario', coalesce(a ->> 'respeitar_horario', 'false') = 'true');
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DU-041 / DU-383 nx_automacao_ativar: ligar grava ignorar_antes («só daqui para frente») e limpa a pausa do disjuntor
--   (cópia da definição em vigor: 20261015a_plano1000b.sql)
-- ------------------------------------------------------------
create or replace function public.nx_automacao_ativar(p_token text, p_cliente uuid, p_id uuid, p_ativo boolean)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  a public.nx_automacoes; n jsonb;
begin
  perform public.nx_exigir_modulo(p_cliente, 'automacoes');
  select * into a from public.nx_automacoes x where x.id = p_id and x.cliente_id = p_cliente for update;
  if a.id is null then raise exception 'automacao_nao_encontrada' using errcode = '22023'; end if;
  if coalesce(p_ativo, false) then
    -- ligar confere tudo de novo (etapa apagada, modelo ainda não aprovado…)
    n := public.nx_auto_normalizar(p_cliente, jsonb_build_object('nome', a.nome, 'gatilho', a.gatilho, 'config', a.config,
           'condicoes', a.condicoes, 'acoes', a.acoes, 'respeitar_horario', a.respeitar_horario), true);
    update public.nx_automacoes set ativo = true, config = n -> 'config', condicoes = n -> 'condicoes', acoes = n -> 'acoes',
                                    -- plano 2000d · DU-041 / DU-383
                                    ignorar_antes = case when coalesce(n -> 'config' ->> 'so_novos', 'false') = 'true'
                                                         then case when a.ativo then coalesce(a.ignorar_antes, now()) else now() end end,
                                    pausada_motivo = null, pausada_em = null,
                                    atualizado_em = now(), atualizado_por = v.conta_id
     where id = a.id returning * into a;
  else
    update public.nx_automacoes set ativo = false, atualizado_em = now(), atualizado_por = v.conta_id where id = a.id returning * into a;
  end if;
  return public.nx_auto_item(a)::json;
end $$;

-- ------------------------------------------------------------
-- plano 2000d nx_auto_base: recursos do servidor (o editor só oferece o que vier) e as mensagens automáticas de hoje × teto (DU-101)
--   (cópia da definição em vigor: 20261013f_entrada_contratos.sql)
-- ------------------------------------------------------------
create or replace function public.nx_auto_base(p_cliente uuid)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return json_build_object(
    'funis', coalesce((select json_agg(json_build_object('id', f.id, 'nome', f.nome, 'padrao', f.padrao, 'ativo', f.ativo,
                 'conta_no_ads', f.conta_no_ads,
                 'estagios', coalesce((select json_agg(json_build_object('id', s.id, 'nome', s.nome, 'cor', s.cor, 'tipo', s.tipo,
                                                                        'marco', s.marco) order by s.ordem)
                                         from public.nx_estagios s where s.funil_id = f.id), '[]'::json))
                 order by f.ordem, f.criado_em)
        from public.nx_funis f where f.cliente_id = p_cliente), '[]'::json),
    'etiquetas', coalesce((select json_agg(json_build_object('id', t.id, 'nome', t.nome, 'cor', t.cor) order by lower(t.nome))
        from public.nx_etiquetas t where t.cliente_id = p_cliente), '[]'::json),
    'usuarios', coalesce((select json_agg(json_build_object('id', k.id, 'nome', k.nome, 'papel', a.papel) order by lower(k.nome))
        from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
       where a.cliente_id = p_cliente and k.aprovado), '[]'::json),
    'departamentos', coalesce((select json_agg(json_build_object('id', d.id, 'nome', d.nome, 'cor', d.cor, 'padrao', d.padrao)
                                               order by d.ordem, d.nome)
        from public.nx_departamentos d where d.cliente_id = p_cliente and d.ativo), '[]'::json),
    -- plano 1000: provedor (meta | codewords) — a tela de automações sabe que o aparelho não manda modelo
    'canais', coalesce((select json_agg(json_build_object('id', k.id, 'nome', k.nome, 'numero_exibicao', k.numero_exibicao,
                                                          'status', k.status, 'provedor', k.provedor) order by k.criado_em)
        from public.nx_canais k where k.cliente_id = p_cliente), '[]'::json),
    'templates', coalesce((select json_agg(json_build_object('id', t.id, 'canal_id', t.canal_id, 'nome', t.nome, 'idioma', t.idioma,
                 'categoria', t.categoria, 'status', t.status, 'corpo', left(t.corpo, 1024), 'num_parametros', t.num_parametros)
                 order by t.nome, t.idioma)
        from public.nx_templates t where t.cliente_id = p_cliente), '[]'::json),
    'campos', coalesce((select json_agg(json_build_object('chave', c.chave, 'rotulo', c.rotulo, 'tipo', c.tipo) order by c.ordem, c.rotulo)
        from public.nx_campos c where c.cliente_id = p_cliente and c.entidade = 'contato' and c.ativo), '[]'::json),
    'campos_negocio', coalesce((select json_agg(json_build_object('chave', c.chave, 'rotulo', c.rotulo, 'tipo', c.tipo) order by c.ordem, c.rotulo)
        from public.nx_campos c where c.cliente_id = p_cliente and c.entidade = 'negocio' and c.ativo), '[]'::json),
    -- plano 2000d: o que este servidor já sabe fazer (auto-logica.recursoServidor)
    'recursos', json_build_array('so_novos', 'teto_envios_dia', 'intervalo_contato', 'max_por_contato_dia', 'disjuntor',
                                 'optout_texto', 'etiqueta_nao_enviar'),
    -- plano 2000d · DU-042 / DU-101: mensagens automáticas de hoje e o teto da empresa
    'mensagens_hoje', public.nx_uso(p_cliente, 'envios_dia'),
    -- plano 2000d · REV-M1: null = sem teto (opt-in; antes caía em 300)
    'teto_envios_dia', nullif(coalesce(public.nx_limite(p_cliente, 'envios_dia'),
                                (select case when (c.cfg -> 'automacoes' ->> 'teto_dia') ~ '^[0-9]{1,6}$' then (c.cfg -> 'automacoes' ->> 'teto_dia')::int end
                                   from public.nx_clientes c where c.id = p_cliente), 0), 0));
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-273 nx_ctx: empresa parada por cobrança — o admin ainda lê e exporta (envios, IA e edição continuam bloqueados)
--   (cópia da definição em vigor: 20261022a_plano1500c.sql)
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
    -- plano 1500c · SC-004: o usuário continua cadastrado (histórico, atribuições), mas não entra nesta empresa
    if a.suspenso_em is not null then raise exception 'sem_acesso' using errcode = '42501', hint = 'suspenso'; end if;
  else
    raise exception 'sem_acesso' using errcode = '42501';
  end if;

  if public.nx_rank(v_papel) < 4 then
    if v_cli.status in ('suspenso', 'cancelado')
       -- plano 2000d · DS-273
       and not (v_cli.status = 'suspenso' and coalesce(v_cli.motivo_status, '') = 'cobranca' and v_min = 'leitura' and v_papel = 'admin') then
      raise exception 'conta_suspensa' using errcode = '42501';
    end if;
    if v_cli.status = 'teste' and v_cli.teste_ate < (now() at time zone 'America/Sao_Paulo')::date
       and v_min <> 'leitura' then
      raise exception 'teste_expirado' using errcode = '42501';
    end if;
    if exists (select 1 from public.nx_orgs o where o.id = v_cli.org_id and o.status = 'suspenso') then
      raise exception 'conta_suspensa' using errcode = '42501';
    end if;
    -- plano 1000 (SV-127): cliente PAUSADO pela plataforma (nx_clientes.ativo = false): a equipe com a tela aberta (ou um token)
    -- continuava enviando e salvando; agora só lê (como teste_expirado). errcode 22023, como no nx_app_sessao (frente A).
    if not coalesce(v_cli.ativo, true) and v_min <> 'leitura' then
      raise exception 'cliente_pausado' using errcode = '22023';
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

-- ------------------------------------------------------------
-- plano 2000d · DS-276 nx_teste_avisar: o maior marco pendente (3 dias / último dia) sai uma vez cada, mesmo se o cron falhou no dia
--   (cópia da definição em vigor: 20261022a_plano1500c.sql)
-- ------------------------------------------------------------
create or replace function public.nx_teste_avisar()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare c record; v_n int := 0; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_tit text;
begin
  for c in
    select x.id, x.nome, x.teste_ate, x.teste_avisos from public.nx_clientes x
     where x.status = 'teste' and coalesce(x.ativo, true) and x.teste_ate between v_hoje and v_hoje + 3   -- plano 2000d · DS-276
       and not exists (select 1 from public.nx_orgs o where o.id = x.org_id and o.status in ('suspenso', 'cancelado'))
  loop
    v_tit := case when c.teste_ate = v_hoje then 'O teste termina hoje'
                  when c.teste_ate = v_hoje + 1 then 'O teste termina amanhã'
                  else 'O teste termina em ' || (c.teste_ate - v_hoje) || ' dias' end;
    -- plano 2000d · DS-276: cada marco uma vez (d3 = até 3 dias; d0 = o último dia)
    if coalesce(c.teste_avisos, '{}'::jsonb) ? (case when c.teste_ate = v_hoje then 'd0' else 'd3' end) then continue; end if;
    if exists (select 1 from public.nx_notificacoes n
                where n.cliente_id = c.id and n.tipo = 'sistema' and n.titulo = v_tit and n.criado_em > now() - interval '5 days') then
      continue;
    end if;
    v_n := v_n + public.nx_notificar(c.id, null, 'sistema', v_tit,
      'Depois do último dia (' || to_char(c.teste_ate, 'DD/MM') || '), a conta fica só para leitura até a assinatura. Veja os planos.',
      '#/config/plano');
    update public.nx_clientes x
       set teste_avisos = coalesce(x.teste_avisos, '{}'::jsonb) || jsonb_build_object('d3', now())
                          || case when c.teste_ate = v_hoje then jsonb_build_object('d0', now()) else '{}'::jsonb end
     where x.id = c.id;
  end loop;
  return v_n;
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DU-145 / DU-147 / DU-152 / DU-153 / DU-202 / DU-215 / DU-445 / DU-140 / UC-006 nx_marca_validar: chaves novas da marca
--   (cópia da definição em vigor: 20260928c_plataforma_b.sql)
-- ------------------------------------------------------------
create or replace function public.nx_marca_validar(p jsonb, p_so_tema boolean default false)
returns jsonb
language plpgsql immutable
security definer
set search_path = ''
as $$
declare
  r jsonb := '{}'::jsonb;
  k text;
  v text;
  cores jsonb := '{}'::jsonb;
  permitidas text[] := case when p_so_tema then array['logo', 'logo_claro', 'cores']
                            else array['produto', 'logo', 'logo_claro', 'favicon', 'cores', 'login_titulo', 'login_texto', 'suporte_wa', 'assinatura',
                                       -- plano 2000d
                                       'suporte_email', 'site', 'termos_url', 'privacidade_url', 'email_remetente', 'email_rodape',
                                       'icone_app', 'teste_aberto', 'dias_teste', 'boas_vindas_titulo', 'boas_vindas', 'contato_agencia',
                                       'nome_curto', 'inatividade_min', 'retencao_dias'] end;
begin
  if p is null or jsonb_typeof(p) = 'null' then return '{}'::jsonb; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'marca_invalida' using errcode = '22023', hint = 'marca'; end if;
  for k in select jsonb_object_keys(p) loop
    if not (k = any(permitidas)) then raise exception 'marca_invalida' using errcode = '22023', hint = k; end if;
    if jsonb_typeof(p -> k) = 'null' then continue; end if;
    if k = 'cores' then
      if jsonb_typeof(p -> 'cores') <> 'object' then raise exception 'marca_invalida' using errcode = '22023', hint = 'cores'; end if;
      for v in select jsonb_object_keys(p -> 'cores') loop
        if v not in ('primaria', 'secundaria', 'fundo') then raise exception 'marca_invalida' using errcode = '22023', hint = 'cores.' || v; end if;
        if jsonb_typeof(p -> 'cores' -> v) = 'null' then continue; end if;
        if coalesce(p -> 'cores' ->> v, '') !~ '^#[0-9A-Fa-f]{6}$' then
          raise exception 'marca_invalida' using errcode = '22023', hint = 'cores.' || v;
        end if;
        cores := cores || jsonb_build_object(v, upper(p -> 'cores' ->> v));
      end loop;
      if cores <> '{}'::jsonb then r := r || jsonb_build_object('cores', cores); end if;
      continue;
    end if;
    -- plano 2000d: as chaves que não são texto
    if k = 'teste_aberto' then
      if jsonb_typeof(p -> k) <> 'boolean' then raise exception 'marca_invalida' using errcode = '22023', hint = k; end if;
      if (p ->> k)::boolean then r := r || jsonb_build_object(k, true); end if;
      continue;
    end if;
    if k in ('dias_teste', 'inatividade_min', 'retencao_dias') then
      if jsonb_typeof(p -> k) <> 'number' or (p ->> k) !~ '^[0-9]{1,4}$'
         or (p ->> k)::int not between (case k when 'dias_teste' then 1 when 'retencao_dias' then 30 else 0 end)
                                       and (case k when 'dias_teste' then 60 when 'retencao_dias' then 3650 else 1440 end) then
        raise exception 'marca_invalida' using errcode = '22023', hint = k;
      end if;
      r := r || jsonb_build_object(k, (p ->> k)::int);
      continue;
    end if;
    if jsonb_typeof(p -> k) <> 'string' then raise exception 'marca_invalida' using errcode = '22023', hint = k; end if;
    v := btrim(p ->> k);
    if v = '' then continue; end if;
    if k in ('logo', 'logo_claro', 'favicon') then
      if v ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' then
        if char_length(v) > (case when k = 'favicon' then 30000 else 80000 end) then
          raise exception 'marca_invalida' using errcode = '22023', hint = k;
        end if;
      elsif not (v ~* '^https://[^\s"''<>]+$' and v !~* '\.svg([?#]|$)' and char_length(v) <= 500) then
        raise exception 'marca_invalida' using errcode = '22023', hint = k;
      end if;
    elsif k = 'produto' then
      if char_length(v) < 2 or char_length(v) > 40 then raise exception 'marca_invalida' using errcode = '22023', hint = k; end if;
    elsif k = 'login_titulo' then
      if char_length(v) > 80 then raise exception 'marca_invalida' using errcode = '22023', hint = k; end if;
    elsif k = 'login_texto' then
      if char_length(v) > 200 then raise exception 'marca_invalida' using errcode = '22023', hint = k; end if;
    elsif k = 'assinatura' then
      if char_length(v) > 60 then raise exception 'marca_invalida' using errcode = '22023', hint = k; end if;
    elsif k = 'suporte_wa' then
      v := regexp_replace(v, '\D', '', 'g');
      if v !~ '^\d{10,15}$' then raise exception 'marca_invalida' using errcode = '22023', hint = k; end if;
    -- plano 2000d
    elsif k in ('suporte_email', 'email_remetente') then
      if v !~* '^[^@\s"<>]+@[^@\s"<>]+\.[a-z]{2,}$' or char_length(v) > 120 then raise exception 'marca_invalida' using errcode = '22023', hint = k; end if;
    elsif k in ('site', 'termos_url', 'privacidade_url') then
      if not (v ~* '^https://[^\s"''<>]+$' and char_length(v) <= 300) then raise exception 'marca_invalida' using errcode = '22023', hint = k; end if;
    elsif k = 'icone_app' then
      if not ((v ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' and char_length(v) <= 165000)
              or (v ~* '^https://[^\s"''<>]+\.png([?#][^\s"''<>]*)?$' and char_length(v) <= 500)) then
        raise exception 'marca_invalida' using errcode = '22023', hint = k;
      end if;
    elsif k in ('email_rodape', 'boas_vindas') then
      if char_length(v) > 500 then raise exception 'marca_invalida' using errcode = '22023', hint = k; end if;
    elsif k in ('boas_vindas_titulo', 'contato_agencia') then
      if char_length(v) > 120 then raise exception 'marca_invalida' using errcode = '22023', hint = k; end if;
    elsif k = 'nome_curto' then
      if char_length(v) < 2 or char_length(v) > 12 then raise exception 'marca_invalida' using errcode = '22023', hint = k; end if;
    end if;
    r := r || jsonb_build_object(k, v);
  end loop;
  return r;
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DU-145 / DU-147 / DU-152 / DU-153 / DU-202 / DU-214 / DU-445 / UC-006 nx_marca_publica_de: as chaves públicas novas (o remetente e o rodapé de e-mail não saem)
--   (cópia da definição em vigor: 20260928c_plataforma.sql)
-- ------------------------------------------------------------
create or replace function public.nx_marca_publica_de(p jsonb)
returns jsonb
language plpgsql immutable
security definer
set search_path = ''
as $$
begin
  if p is null or jsonb_typeof(p) <> 'object' then return '{}'::jsonb; end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'produto', p -> 'produto', 'logo', p -> 'logo', 'logo_claro', p -> 'logo_claro', 'favicon', p -> 'favicon',
    'cores', p -> 'cores', 'login_titulo', p -> 'login_titulo', 'login_texto', p -> 'login_texto',
    'suporte_wa', p -> 'suporte_wa',
    -- plano 2000d
    'suporte_email', p -> 'suporte_email', 'site', p -> 'site', 'termos_url', p -> 'termos_url', 'privacidade_url', p -> 'privacidade_url',
    'icone_app', p -> 'icone_app', 'teste_aberto', p -> 'teste_aberto', 'dias_teste', p -> 'dias_teste',
    'boas_vindas_titulo', p -> 'boas_vindas_titulo', 'boas_vindas', p -> 'boas_vindas', 'contato_agencia', p -> 'contato_agencia',
    'nome_curto', p -> 'nome_curto', 'inatividade_min', p -> 'inatividade_min', 'retencao_dias', p -> 'retencao_dias'));
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DU-215 nx_marca_publica: dias_teste vem também dos limites da org (o prazo real do teste da revenda)
--   (cópia da definição em vigor: 20260928c_plataforma.sql)
-- ------------------------------------------------------------
create or replace function public.nx_marca_publica(p_host text, p_org text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host text := lower(split_part(btrim(coalesce(p_host, '')), ':', 1));
  d public.nx_dominios;
  o public.nx_orgs;
  x public.nx_clientes;
begin
  if v_host <> '' then
    select * into d from public.nx_dominios where host = v_host and status = 'ativo';
  end if;
  if d.host is not null then
    select * into o from public.nx_orgs where id = d.org_id;
    if d.cliente_id is not null then select * into x from public.nx_clientes where id = d.cliente_id; end if;
  end if;
  if o.id is null and nullif(btrim(coalesce(p_org, '')), '') is not null then
    select * into o from public.nx_orgs where slug = lower(btrim(p_org));
  end if;
  if o.id is null then
    select * into o from public.nx_orgs where tipo = 'plataforma' limit 1;
  end if;
  return json_build_object(
    'org', case when o.id is null then null else json_build_object('slug', o.slug, 'nome', o.nome) end,
    'marca', public.nx_marca_publica_de(o.marca)
             || jsonb_strip_nulls(jsonb_build_object('dias_teste', case when (o.limites ->> 'dias_teste') ~ '^[0-9]{1,2}$' then (o.limites ->> 'dias_teste')::int end)),   -- plano 2000d · DU-215
    'cliente', case when x.id is null then null
                    else json_build_object('slug', x.slug, 'nome', x.nome,
                                           'tema', jsonb_strip_nulls(jsonb_build_object('logo', x.tema -> 'logo',
                                                     'logo_claro', x.tema -> 'logo_claro', 'cores', x.tema -> 'cores'))) end);
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DU-042/043 / DS-350 / DA-187 / DA-009 / DA-025 / DA-346 / DA-093 / DA-402 nx_cfg_validar: chaves novas da configuração
--   (cópia da definição em vigor: 20261022a_plano1500c.sql)
-- ------------------------------------------------------------
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
  -- plano 1500c · AC-063: dias da semana fechados (0 = domingo … 6 = sábado)
  v := p -> 'diasFechados';
  if v is not null and jsonb_typeof(v) <> 'null' then
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 7
       or exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'number' or (e #>> '{}') !~ '^[0-6]$') then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'diasFechados';
    end if;
  end if;
  -- plano 1500c · AC-262: nome e cidade da agência na folha do relatório
  foreach k in array array['agenciaNome', 'agenciaCidade'] loop
    v := p -> k;
    if v is null or jsonb_typeof(v) = 'null' then continue; end if;
    if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 80 then
      raise exception 'dados_invalidos' using errcode = '22023', hint = k;
    end if;
  end loop;
  -- plano 1500c · AC-055: relatório semanal (opt-in)
  v := p -> 'relSemanal';
  if v is not null and jsonb_typeof(v) not in ('null', 'boolean') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'relSemanal';
  end if;
  -- plano 2000d · DU-042 / DU-043 / DS-350: travas do envio automático
  v := p -> 'automacoes';
  if v is not null and jsonb_typeof(v) <> 'null' then
    if jsonb_typeof(v) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'automacoes'; end if;
    if (v ? 'teto_dia' and jsonb_typeof(v -> 'teto_dia') <> 'null' and (jsonb_typeof(v -> 'teto_dia') <> 'number' or (v ->> 'teto_dia') !~ '^[0-9]{1,4}$' or (v ->> 'teto_dia')::int > 5000))
       or (v ? 'intervalo_contato_h' and jsonb_typeof(v -> 'intervalo_contato_h') <> 'null' and (jsonb_typeof(v -> 'intervalo_contato_h') <> 'number' or (v ->> 'intervalo_contato_h') !~ '^[0-9]{1,3}(\.[0-9]+)?$' or (v ->> 'intervalo_contato_h')::numeric > 168))
       or (v ? 'max_msgs_contato_dia' and jsonb_typeof(v -> 'max_msgs_contato_dia') <> 'null' and (jsonb_typeof(v -> 'max_msgs_contato_dia') <> 'number' or (v ->> 'max_msgs_contato_dia') !~ '^[0-9]{1,2}$' or (v ->> 'max_msgs_contato_dia')::int > 50)) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'automacoes';
    end if;
  end if;
  -- plano 2000d · DA-187: dias da semana do relatório diário (0 = domingo … 6 = sábado)
  v := p -> 'relDias';
  if v is not null and jsonb_typeof(v) <> 'null' then
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 7
       or exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'number' or (e #>> '{}') !~ '^[0-6]$') then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'relDias';
    end if;
  end if;
  -- plano 2000d · DA-009: pausar nos dias fechados
  v := p -> 'pausaDiasFechados';
  if v is not null and jsonb_typeof(v) not in ('null', 'boolean') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'pausaDiasFechados';
  end if;
  -- plano 2000d · DA-025: tolerância da regra R1 do radar (10–100)
  v := p -> 'radar' -> 'toleranciaR1';
  if jsonb_typeof(p -> 'radar') not in ('object', 'null') and p ? 'radar' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'radar';
  end if;
  if v is not null and jsonb_typeof(v) <> 'null' and (jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric not between 10 and 100) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'radar.toleranciaR1';
  end if;
  -- plano 2000d · DA-346: silêncio dos alertas {de, ate} (horas 0–23)
  v := p -> 'silencio';
  if v is not null and jsonb_typeof(v) <> 'null' then
    if jsonb_typeof(v) <> 'object' or jsonb_typeof(v -> 'de') <> 'number' or jsonb_typeof(v -> 'ate') <> 'number'
       or (v ->> 'de') !~ '^([0-9]|1[0-9]|2[0-3])$' or (v ->> 'ate') !~ '^([0-9]|1[0-9]|2[0-3])$' then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'silencio';
    end if;
  end if;
  -- plano 2000d · DA-093: hora do relatório diário (HH:MM, São Paulo); DA-402: data de renovação do contrato
  v := p -> 'horaRelatorio';
  if v is not null and jsonb_typeof(v) <> 'null' and (jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'horaRelatorio';
  end if;
  v := p -> 'renovacaoEm';
  if v is not null and jsonb_typeof(v) <> 'null' and (jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'renovacaoEm';
  end if;
end $$;

-- ------------------------------------------------------------
-- plano 2000d · DS-069 nx_titular_exportar: o pedido de ACESSO do titular fica registrado (protocolo), sem o dado
--   (cópia da definição em vigor: 20261022a_plano1500c.sql)
-- ------------------------------------------------------------
create or replace function public.nx_titular_exportar(p_token text, p_cliente uuid, p_contato bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); v_id bigint;
begin
  select k.id into v_id from public.nx_contatos k where k.id = p_contato and k.cliente_id = p_cliente;
  if v_id is null then raise exception 'contato_nao_encontrado' using errcode = '22023'; end if;
  perform public.nx_auditar((select c.org_id from public.nx_clientes c where c.id = p_cliente), p_cliente, v.conta_id,
                            'titular_exportado', jsonb_build_object('contato', v_id));
  insert into public.nx_lgpd_pedidos (cliente_id, contato_hash, tipo, executado_em, executado_por)   -- plano 2000d · DS-069
  select p_cliente, case when k.tel_chave is not null then public.nx_hash(p_cliente::text || ':' || k.tel_chave) end, 'acesso', now(), v.conta_id
    from public.nx_contatos k where k.id = v_id;
  return json_build_object(
    'gerado_em', now(),
    'empresa', (select c.nome from public.nx_clientes c where c.id = p_cliente),
    'contato', public.nx_crm_contato_json(p_cliente, v_id),
    'negocios', coalesce((select json_agg(json_build_object('id', l.id, 'titulo', l.titulo, 'servico', l.servico, 'status', l.status,
                                                            'valor', l.valor, 'origem', l.origem, 'consulta_em', l.consulta_em,
                                                            'campos', l.campos, 'obs', l.obs, 'criado_em', l.criado_em,
                                                            'fechado_em', l.fechado_em) order by l.criado_em)
                            from public.nx_leads l where l.contato_id = v_id and l.cliente_id = p_cliente), '[]'::json),
    'conversas', coalesce((select json_agg(json_build_object('id', cv.id, 'status', cv.status, 'aberta_em', cv.aberta_em)
                                           order by cv.aberta_em)
                             from public.nx_conversas cv where cv.contato_id = v_id and cv.cliente_id = p_cliente), '[]'::json),
    'mensagens', coalesce((select json_agg(json_build_object('conversa_id', m.conversa_id, 'direcao', m.direcao, 'tipo', m.tipo,
                                                             'texto', m.corpo, 'em', m.criado_em) order by m.id)
                             from (select * from public.nx_mensagens m
                                    where m.contato_id = v_id and m.cliente_id = p_cliente and m.tipo not in ('nota', 'sistema')
                                    order by m.id desc limit 5000) m), '[]'::json));
end $$;

-- ------------------------------------------------------------
-- 7. Permissões. As cópias de mesma assinatura mantêm as da origem. RPCs novas do painel (p_token → nx_ctx): anon + service_role.
--    Pública sem token (nx_teste_criar, com limites próprios): anon + service_role. Internas e gatilhos: só service_role.
-- ------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.nx_cv_atribuir_v2(text, uuid, bigint, uuid, uuid, uuid, boolean, boolean)',
    'public.nx_cv_atribuir(text, uuid, bigint, uuid, uuid, boolean, uuid)',
    'public.nx_cv_pegar_proxima(text, uuid, jsonb)',
    'public.nx_cv_etiquetas_mudar(text, uuid, bigint, uuid[], uuid[])',
    'public.nx_negocios_etiquetar_lote(text, uuid, bigint[], uuid[], uuid[])',
    'public.nx_conta_pref_ler(text, uuid)',
    'public.nx_conta_pref_salvar(text, uuid, text, jsonb, timestamptz)',
    'public.nx_meta_salvar(text, uuid, jsonb)',
    'public.nx_contato_excluir(text, uuid, bigint, text, text)',
    'public.nx_lgpd_pedidos_listar(text, uuid)',
    'public.nx_teste_prorrogar(text, uuid, integer)',
    'public.nx_teste_criar(text, text, text, text, text, text, text, text, text)'] loop
    execute format('revoke all on function %s from public, authenticated', f);
    execute format('grant execute on function %s to anon, service_role', f);
  end loop;
  foreach f in array array[
    'public.nx_hoje_sp()',
    'public.nx_json_teto(jsonb, integer, text)',
    'public.nx_conta_disponivel(uuid, uuid, boolean)',
    'public.nx_bcrypt_custo()',
    'public.nx_senha_comum(text)',
    'public.nx_tg_conversa_atribuida()',
    'public.nx_tg_acesso_removido()',
    'public.nx_tg_contato_saiu()',
    'public.nx_tg_contatos_limite()',
    'public.nx_tg_auditoria_imutavel()',
    'public.nx_auto_envio_guarda(public.nx_automacoes, bigint, boolean, timestamp with time zone)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  -- DS-338 / DS-339: tabelas novas com RLS ligado, sem política e sem grant (só as funções security definer leem/gravam)
  revoke all on table public.nx_conta_pref, public.nx_lgpd_pedidos, public.nx_metas from public, anon, authenticated;
  raise notice 'nx_revogar_authenticated: % funções', public.nx_revogar_authenticated();
end $$;

insert into public.nx_versao_banco (nome) values ('20261026a_plano2000d')
on conflict (nome) do update set aplicada_em = now();

notify pgrst, 'reload schema';
