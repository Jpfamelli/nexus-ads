-- ============================================================
-- ÓRBITA — WhatsApp via CodeWords no modelo "aparelho" + API do agente
-- 20260929a_codewords.sql · ADITIVO e idempotente (if not exists / create or replace)
--
-- Modelo (o mesmo que já funciona na IndyCar, com o cérebro no Órbita):
--   * o WhatsApp do cliente é um APARELHO pareado no whatsapp_device_manager do
--     CodeWords (chave cwk- do cliente, guardada no Vault, uma por canal);
--   * o aparelho entrega as mensagens recebidas a UM destino (subscribe):
--       rota 'fluxo'  → o fluxo de IA do cliente ("<service_id>/webhook"), que chama a
--                       "API do agente" do Órbita (nx-codewords?ch=<segredo>);
--       rota 'direta' → a própria URL do canal no nx-codewords (sem IA);
--   * o Órbita grava tudo no CRM/Conversas, decide se a IA responde (IA 24h, pausa
--     por conversa, limite anti-loop) e entrega o contexto e as instruções prontas;
--   * a equipe responde pelo painel (nx-enviar → proxy do aparelho) e uma
--     sincronização de 2 em 2 min (pg_cron → nx-codewords) traz o que faltar.
-- Segredos: chave cwk- e segredo da URL só no Vault; o banco guarda o SHA-256 do
-- segredo da URL. Nada aqui chama a rede. Agenda (horarios/agendar/remarcar/cancelar)
-- é da etapa seguinte: nx_agenda_livres_ia, nx_agenda_marcar_ia, nx_agenda_desmarcar_ia.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colunas novas (todas com default ou nulas)
-- ------------------------------------------------------------
alter table public.nx_canais
  add column if not exists provedor text not null default 'meta',
  add column if not exists codewords_numero text,              -- E.164 (+5512999990000)
  add column if not exists codewords_phone_id text,            -- phone_id do aparelho no device manager
  add column if not exists codewords_service_id text,          -- fluxo de IA do cliente (opcional)
  add column if not exists codewords_rota text not null default 'fluxo',
  add column if not exists codewords_api_segredo uuid,         -- vault.secrets (chave cwk-)
  add column if not exists codewords_hook_segredo uuid,        -- vault.secrets (segredo da URL do canal)
  add column if not exists codewords_hook_hash text,           -- sha256 hex do segredo da URL
  add column if not exists ia_ligada boolean not null default true,     -- "IA 24h" do canal
  add column if not exists ia_volta_horas int not null default 6,       -- 0 = só volta manual
  add column if not exists codewords_conectado boolean,
  add column if not exists codewords_numero_conferido boolean,
  add column if not exists codewords_conferido_em timestamptz,
  add column if not exists codewords_estado text,              -- status cru do aparelho (logged_in…)
  add column if not exists codewords_inscricao text,           -- destino atual do aparelho, sem segredo
  add column if not exists codewords_forma jsonb,              -- SÓ nomes de campos do último payload desconhecido
  add column if not exists codewords_forma_em timestamptz,
  add column if not exists codewords_sync_em timestamptz,
  add column if not exists codewords_sync_erro text,
  add column if not exists codewords_sync_falhas int not null default 0;

alter table public.nx_conversas
  add column if not exists ia_pausada_ate timestamptz,         -- 'infinity' = só volta quando devolverem
  add column if not exists ia_pausada_por text,
  add column if not exists ia_pausada_conta uuid references public.nx_contas(id) on delete set null,
  add column if not exists ia_limite_em timestamptz;           -- último aviso de limite anti-loop

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nx_canais_provedor_ck') then
    alter table public.nx_canais add constraint nx_canais_provedor_ck check (provedor in ('meta', 'codewords'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nx_canais_cw_campos_ck') then
    alter table public.nx_canais add constraint nx_canais_cw_campos_ck check (
      (codewords_numero is null or codewords_numero ~ '^\+[1-9][0-9]{7,14}$')
      and (codewords_phone_id is null or codewords_phone_id ~ '^[A-Za-z0-9._:@-]{1,120}$')
      and (codewords_service_id is null or codewords_service_id ~ '^[A-Za-z0-9_-]{1,120}$')
      and codewords_rota in ('fluxo', 'direta')
      and ia_volta_horas between 0 and 168
      and (codewords_estado is null or char_length(codewords_estado) <= 60)
      and (codewords_inscricao is null or char_length(codewords_inscricao) <= 300)
      and (codewords_sync_erro is null or char_length(codewords_sync_erro) <= 500));
  end if;
  -- canal CodeWords nunca carrega credencial da Meta (defesa: nx_canal_salvar não o edita)
  if not exists (select 1 from pg_constraint where conname = 'nx_canais_cw_sem_meta_ck') then
    alter table public.nx_canais add constraint nx_canais_cw_sem_meta_ck check (
      provedor <> 'codewords' or (phone_number_id is null and token_segredo is null and app_secret_segredo is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nx_conversas_ia_por_ck') then
    alter table public.nx_conversas add constraint nx_conversas_ia_por_ck check (
      ia_pausada_por is null or ia_pausada_por in ('painel', 'celular', 'humano', 'manual'));
  end if;
end $$;

create unique index if not exists nx_canais_cw_hook on public.nx_canais(codewords_hook_hash)
  where codewords_hook_hash is not null;
create unique index if not exists nx_canais_cw_numero on public.nx_canais(codewords_numero)
  where provedor = 'codewords' and codewords_numero is not null;
-- sincronização: conversas com atividade recente por canal
create index if not exists nx_conversas_canal_recente on public.nx_conversas(canal_id, ultima_msg_em desc)
  where canal_id is not null;

-- ------------------------------------------------------------
-- 2. Tabelas internas (RLS ligado, sem política; só service_role)
-- ------------------------------------------------------------
-- Recibo que chega antes do eco da saída: fica guardado até a mensagem existir.
create table if not exists public.nx_codewords_status_pendentes (
  canal_id uuid not null references public.nx_canais(id) on delete cascade,
  provider_id text not null check (provider_id ~ '^[A-Za-z0-9._:=+/@-]{1,160}$'),
  status text not null check (status in ('sent', 'delivered', 'read', 'failed')),
  erro text check (char_length(erro) <= 500),
  expira_em timestamptz not null default (now() + interval '7 days'),
  primary key (canal_id, provider_id)
);
create index if not exists nx_codewords_status_expira on public.nx_codewords_status_pendentes(expira_em);
alter table public.nx_codewords_status_pendentes enable row level security;
revoke all on table public.nx_codewords_status_pendentes from public, anon, authenticated;
grant all on table public.nx_codewords_status_pendentes to service_role;

-- Limite de taxa da API do agente, por canal e minuto.
create table if not exists public.nx_codewords_taxa (
  canal_id uuid not null references public.nx_canais(id) on delete cascade,
  minuto timestamptz not null,
  n int not null default 0,
  primary key (canal_id, minuto)
);
alter table public.nx_codewords_taxa enable row level security;
revoke all on table public.nx_codewords_taxa from public, anon, authenticated;
grant all on table public.nx_codewords_taxa to service_role;

-- ------------------------------------------------------------
-- 3. Utilitários
-- ------------------------------------------------------------
-- Telefone do canal em E.164. Sem '+' e com 10–11 dígitos = número brasileiro sem DDI.
create or replace function public.nx_codewords_e164(p text)
returns text
language plpgsql immutable
security definer
set search_path = ''
as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if btrim(coalesce(p, '')) !~ '^\+' and length(d) between 10 and 11 then d := '55' || d; end if;
  if length(d) between 8 and 15 and left(d, 1) <> '0' then return '+' || d; end if;
  return null;
end $$;

-- URL da API do agente deste canal (tem o segredo: só admin e service_role enxergam).
create or replace function public.nx_codewords_url(k public.nx_canais)
returns text
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_base text; v_seg text;
begin
  if k.id is null or k.codewords_hook_segredo is null then return null; end if;
  v_seg := public.nx_segredo_ler(k.codewords_hook_segredo);
  if v_seg is null then return null; end if;
  select rtrim(coalesce(nullif(btrim(x.funcoes_url), ''), 'https://dtjznipitihnwmcgpzqh.supabase.co/functions/v1'), '/')
    into v_base from public.nx_config x where x.id = 1;
  return coalesce(v_base, 'https://dtjznipitihnwmcgpzqh.supabase.co/functions/v1') || '/nx-codewords?ch=' || v_seg;
end $$;

-- Canal para o painel (nunca devolve chave). CodeWords ganha o bloco 'codewords'.
create or replace function public.nx_canal_json(k public.nx_canais)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_base text; v_proprio boolean; v_cw boolean;
begin
  if k.id is null then return null; end if;
  select rtrim(coalesce(nullif(btrim(x.funcoes_url), ''), 'https://dtjznipitihnwmcgpzqh.supabase.co/functions/v1'), '/')
    into v_base from public.nx_config x where x.id = 1;
  v_base := coalesce(v_base, 'https://dtjznipitihnwmcgpzqh.supabase.co/functions/v1');
  v_proprio := k.app_secret_segredo is not null;
  v_cw := coalesce(k.provedor, 'meta') = 'codewords';
  return jsonb_build_object(
    'id', k.id, 'nome', k.nome, 'phone_number_id', k.phone_number_id, 'waba_id', k.waba_id,
    'numero_exibicao', k.numero_exibicao, 'status', k.status, 'app_inscrito', k.app_inscrito,
    'coexistencia', k.coexistencia,
    'tem_token', case when v_cw then k.codewords_api_segredo is not null and k.codewords_phone_id is not null
                      else k.token_segredo is not null end,
    'tem_app_secret', v_proprio, 'departamento_id', k.departamento_id,
    'qualidade', k.qualidade, 'ultimo_erro', k.ultimo_erro, 'verificado_em', k.verificado_em,
    'criado_em', k.criado_em, 'provedor', coalesce(k.provedor, 'meta'),
    'codewords', case when v_cw then jsonb_build_object(
        'numero', k.codewords_numero, 'phone_id', k.codewords_phone_id, 'service_id', k.codewords_service_id,
        'rota', k.codewords_rota, 'tem_api_key', k.codewords_api_segredo is not null,
        'conectado', k.codewords_conectado, 'numero_conferido', k.codewords_numero_conferido,
        'conferido_em', k.codewords_conferido_em, 'estado', k.codewords_estado,
        'inscricao', k.codewords_inscricao,
        'ia_ligada', k.ia_ligada, 'ia_volta_horas', k.ia_volta_horas,
        'sync', jsonb_build_object('em', k.codewords_sync_em, 'erro', k.codewords_sync_erro,
                                   'falhas', k.codewords_sync_falhas),
        'forma_desconhecida', k.codewords_forma, 'forma_em', k.codewords_forma_em) end,
    'webhook', case
      when v_cw then jsonb_build_object('modo', 'codewords', 'url', public.nx_codewords_url(k),
        'verify_token', null, 'campo', 'API do agente (POST JSON)',
        'texto', 'URL secreta deste canal: o fluxo de IA do CodeWords chama esta API. Trate como senha.')
      when v_proprio then jsonb_build_object('modo', 'proprio', 'url', v_base || '/nx-whatsapp?c=' || k.chave_publica,
        'verify_token', k.verify_token, 'campo', 'messages')
      else jsonb_build_object('modo', 'nexus', 'url', v_base || '/nx-whatsapp', 'verify_token', null,
        'campo', 'messages',
        'texto', 'O webhook deste número é o do aplicativo da plataforma. Peça ao suporte para inscrever o app na WABA.')
    end);
end $$;

-- Canal CodeWords do contato (automação de texto): o da conversa mais recente dele,
-- se for CodeWords; contato sem conversa nenhuma → o único canal CodeWords pareado do cliente.
create or replace function public.nx_codewords_canal_contato(p_cliente uuid, p_contato bigint)
returns uuid
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_canal uuid; v_prov text; v_tem boolean;
begin
  select cv.canal_id, k.provedor into v_canal, v_prov
    from public.nx_conversas cv left join public.nx_canais k on k.id = cv.canal_id and k.cliente_id = cv.cliente_id
   where cv.cliente_id = p_cliente and cv.contato_id = p_contato
   order by cv.ultima_msg_em desc, cv.id desc limit 1;
  v_tem := found;
  if v_tem then
    return case when v_prov = 'codewords' then v_canal end;
  end if;
  if (select count(*) from public.nx_canais k
       where k.cliente_id = p_cliente and k.provedor = 'codewords' and k.codewords_phone_id is not null) = 1 then
    select k.id into v_canal from public.nx_canais k
     where k.cliente_id = p_cliente and k.provedor = 'codewords' and k.codewords_phone_id is not null;
    return v_canal;
  end if;
  return null;
end $$;

-- Contato, conversa (deste canal) e negócio aberto de um telefone, sempre no cliente DO CANAL.
create or replace function public.nx_codewords_alvo(p_canal uuid, p_telefone text)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  k public.nx_canais; d text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_ct bigint; v_cv bigint; v_cv_neg bigint; v_neg bigint;
begin
  select * into k from public.nx_canais where id = p_canal and provedor = 'codewords';
  if k.id is null then raise exception 'canal_nao_encontrado' using errcode = '22023'; end if;
  if length(d) not between 8 and 15 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'telefone';
  end if;
  v_ct := public.nx_contato_por_tel(k.cliente_id, d);
  if v_ct is not null then
    select cv.id, cv.negocio_id into v_cv, v_cv_neg from public.nx_conversas cv
     where cv.cliente_id = k.cliente_id and cv.canal_id = k.id and cv.contato_id = v_ct
     order by (cv.status <> 'resolvida') desc, cv.ultima_msg_em desc, cv.id desc limit 1;
    select l.id into v_neg from public.nx_leads l left join public.nx_funis f on f.id = l.funil_id
     where l.cliente_id = k.cliente_id and l.contato_id = v_ct and l.status = 'aberto'
     order by (l.id = v_cv_neg) desc nulls last, coalesce(f.padrao, false) desc, l.criado_em desc, l.id desc
     limit 1;
  end if;
  return jsonb_build_object('cliente_id', k.cliente_id, 'canal_id', k.id, 'telefone', d,
                            'contato_id', v_ct, 'conversa_id', v_cv, 'negocio_id', v_neg);
end $$;

-- ------------------------------------------------------------
-- 4. Pausa da IA por conversa
--    Pausa sozinha quando a equipe responde (painel ou celular) e volta sozinha
--    ia_volta_horas depois da ÚLTIMA mensagem humana (0 = só quando devolverem).
-- ------------------------------------------------------------
create or replace function public.nx_codewords_pausar(p_conversa bigint, p_por text, p_conta uuid default null,
                                                      p_ate timestamptz default null, p_desde timestamptz default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  cv public.nx_conversas; k public.nx_canais; v_ate timestamptz; v_ativa boolean; v_nome text; v_novo timestamptz;
begin
  if p_por is null or p_por not in ('painel', 'celular', 'humano', 'manual') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'por';
  end if;
  select * into cv from public.nx_conversas where id = p_conversa for update;
  if cv.id is null then return null; end if;
  select * into k from public.nx_canais where id = cv.canal_id and cliente_id = cv.cliente_id;
  if k.id is null or k.provedor <> 'codewords' then return null; end if;   -- só o canal CodeWords tem a IA do aparelho
  v_ate := coalesce(p_ate, case when k.ia_volta_horas = 0 then 'infinity'::timestamptz
                                else coalesce(p_desde, now()) + make_interval(hours => k.ia_volta_horas) end);
  if v_ate <= now() then return cv.ia_pausada_ate; end if;                 -- mensagem velha (sincronização): já teria voltado
  v_ativa := coalesce(cv.ia_pausada_ate > now(), false);
  update public.nx_conversas set
    ia_pausada_ate = case when v_ativa then greatest(ia_pausada_ate, v_ate) else v_ate end,
    ia_pausada_por = case when not v_ativa or v_ate >= ia_pausada_ate then p_por else ia_pausada_por end,
    ia_pausada_conta = case when not v_ativa or v_ate >= ia_pausada_ate then p_conta else ia_pausada_conta end
  where id = cv.id
  returning ia_pausada_ate into v_novo;
  -- aviso no chat só quando a IA estava respondendo (sem uma linha por mensagem humana)
  if not v_ativa and k.ia_ligada and k.codewords_rota = 'fluxo' then
    select nullif(split_part(btrim(coalesce(x.nome, '')), ' ', 1), '') into v_nome from public.nx_contas x where x.id = p_conta;
    perform public.nx_cv_sistema(cv.id, case p_por
        when 'painel' then 'IA pausada: ' || coalesce(v_nome, 'a equipe') || ' respondeu pelo Órbita'
        when 'celular' then 'IA pausada: alguém respondeu pelo celular do WhatsApp'
        when 'humano' then 'IA pausada: a IA chamou a equipe'
        else 'IA pausada: ' || coalesce(v_nome, 'a equipe') || ' assumiu a conversa' end
      || case when v_novo = 'infinity'::timestamptz then ' (volta quando alguém devolver para a IA)'
              when p_ate is not null then ' (volta às ' || to_char(v_novo at time zone 'America/Sao_Paulo', 'HH24:MI DD/MM') || ')'
              else ' (volta sozinha após ' || k.ia_volta_horas || ' h sem mensagem da equipe)' end,
      p_conta);
  end if;
  return v_novo;
end $$;

-- Estado da IA numa conversa (formato das RPCs do painel).
create or replace function public.nx_cv_ia_json(p_conversa bigint)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
declare cv public.nx_conversas; k public.nx_canais; v_n int; v_nome text; v_ativa boolean;
begin
  select * into cv from public.nx_conversas where id = p_conversa;
  if cv.id is null then return null; end if;
  select * into k from public.nx_canais where id = cv.canal_id and cliente_id = cv.cliente_id;
  select count(*) into v_n from (select 1 from public.nx_mensagens m
    where m.conversa_id = cv.id and m.direcao = 'out' and m.origem = 'ia'
      and m.criado_em > now() - interval '10 minutes' limit 50) x;
  v_ativa := coalesce(cv.ia_pausada_ate > now(), false);
  if v_ativa then select x.nome into v_nome from public.nx_contas x where x.id = cv.ia_pausada_conta; end if;
  return json_build_object(
    'conversa_id', cv.id,
    'disponivel', coalesce(k.provedor = 'codewords' and k.codewords_rota = 'fluxo', false),
    'ia_ligada', coalesce(k.provedor = 'codewords' and k.ia_ligada, false),
    'pausada', v_ativa,
    'pausada_ate', case when v_ativa and cv.ia_pausada_ate <> 'infinity'::timestamptz then cv.ia_pausada_ate end,
    'so_manual', v_ativa and cv.ia_pausada_ate = 'infinity'::timestamptz,
    'pausada_por', case when v_ativa then cv.ia_pausada_por end,
    'pausada_por_nome', v_nome,
    'volta_horas', case when k.provedor = 'codewords' then k.ia_volta_horas end,
    'respostas_10min', v_n, 'limite_10min', 8,
    'respondendo', coalesce(k.provedor = 'codewords' and k.codewords_rota = 'fluxo' and k.ia_ligada and not v_ativa, false));
end $$;

-- Painel: estado da IA na conversa (leitura).
create or replace function public.nx_cv_ia_estado(p_token text, p_cliente uuid, p_conversa bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  return public.nx_cv_ia_json(p_conversa);
end $$;

-- Painel: "Assumir" (pausa a IA). p_horas nulo = regra do canal; 0 = só volta manual; 1..168 = horas.
create or replace function public.nx_cv_ia_pausar(p_token text, p_cliente uuid, p_conversa bigint, p_horas int default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente'); k public.nx_canais; v_ate timestamptz;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  if p_horas is not null and p_horas not between 0 and 168 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'horas';
  end if;
  select k2.* into k from public.nx_conversas cv join public.nx_canais k2 on k2.id = cv.canal_id and k2.cliente_id = cv.cliente_id
   where cv.id = p_conversa and cv.cliente_id = p_cliente;
  if k.id is null or k.provedor <> 'codewords' then
    raise exception 'ia_indisponivel' using errcode = '22023', hint = 'canal';
  end if;
  v_ate := case when p_horas = 0 then 'infinity'::timestamptz
                when p_horas is not null then now() + make_interval(hours => p_horas) end;
  perform public.nx_codewords_pausar(p_conversa, 'manual', v.conta_id, v_ate);
  return public.nx_cv_ia_json(p_conversa);
end $$;

-- Painel: "Devolver para a IA".
create or replace function public.nx_cv_ia_devolver(p_token text, p_cliente uuid, p_conversa bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente'); cv public.nx_conversas; k public.nx_canais;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  select * into cv from public.nx_conversas where id = p_conversa and cliente_id = p_cliente for update;
  select * into k from public.nx_canais where id = cv.canal_id and cliente_id = p_cliente;
  if k.id is null or k.provedor <> 'codewords' then
    raise exception 'ia_indisponivel' using errcode = '22023', hint = 'canal';
  end if;
  update public.nx_conversas set ia_pausada_ate = null, ia_pausada_por = null, ia_pausada_conta = null, ia_limite_em = null
   where id = cv.id;
  if coalesce(cv.ia_pausada_ate > now(), false) then
    perform public.nx_cv_sistema(cv.id, coalesce(nullif(split_part(btrim(coalesce(v.nome, '')), ' ', 1), ''), 'A equipe')
                                        || ' devolveu a conversa para a IA', v.conta_id);
  end if;
  return public.nx_cv_ia_json(p_conversa);
end $$;

-- Interna (nx-enviar): atendente respondeu pelo painel num canal CodeWords → pausa a IA.
create or replace function public.nx_cv_ia_pausa_auto(p_cliente uuid, p_conversa bigint, p_por text, p_conta uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.nx_conversas where id = p_conversa and cliente_id = p_cliente) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  perform public.nx_codewords_pausar(p_conversa, coalesce(p_por, 'painel'), p_conta);
  return public.nx_cv_ia_json(p_conversa);
end $$;

-- ------------------------------------------------------------
-- 5. Painel: cadastro do canal CodeWords (admin)
--    {id?, nome, numero (E.164), codewords_api_key? (só escrita), codewords_service_id?,
--     rota 'fluxo'|'direta', ia_ligada, ia_volta_horas, departamento_id, rotacionar_url?}
-- ------------------------------------------------------------
create or replace function public.nx_codewords_canal_salvar(p_token text, p_cliente uuid, p_canal jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  c jsonb := coalesce(p_canal, '{}'::jsonb);
  k public.nx_canais;
  v_id uuid; v_novo boolean; v_nome text; v_num text; v_bruto text; v_service text; v_key text; v_dep uuid;
  v_rota text; v_ia boolean; v_volta int; v_rot boolean := false; v_hook text; v_org uuid;
  v_mudou_num boolean := false; v_mudou_key boolean := false;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if jsonb_typeof(c) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'canal'; end if;
  begin
    v_id := nullif(c ->> 'id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'canal_nao_encontrado' using errcode = '22023';
  end;
  v_novo := v_id is null;
  if not v_novo then
    select * into k from public.nx_canais where id = v_id and cliente_id = p_cliente and provedor = 'codewords' for update;
    if k.id is null then raise exception 'canal_nao_encontrado' using errcode = '22023'; end if;
  end if;

  v_nome := case when c ? 'nome' then btrim(coalesce(c ->> 'nome', '')) else coalesce(k.nome, 'WhatsApp (CodeWords)') end;
  if char_length(v_nome) not between 1 and 40 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'nome';
  end if;
  -- número do aparelho em E.164 ('numero_exibicao' = nome antigo do campo na tela)
  v_bruto := coalesce(c ->> 'numero', c ->> 'numero_exibicao');
  v_num := case when v_bruto is not null then public.nx_codewords_e164(v_bruto) else k.codewords_numero end;
  if v_num is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'numero'; end if;
  v_mudou_num := not v_novo and v_num is distinct from k.codewords_numero;
  -- fluxo de IA (opcional; vazio limpa)
  if c ? 'codewords_service_id' or c ? 'service_id' then
    v_service := nullif(btrim(coalesce(c ->> 'codewords_service_id', c ->> 'service_id', '')), '');
    if v_service is not null and v_service !~ '^[A-Za-z0-9_-]{1,120}$' then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'codewords_service_id';
    end if;
  else
    v_service := k.codewords_service_id;
  end if;
  -- chave reutilizável cwk- (só escrita; vazio mantém). cwotk- é de uso único e não serve.
  v_key := nullif(btrim(coalesce(c ->> 'codewords_api_key', c ->> 'api_key', '')), '');
  if v_key is not null and (char_length(v_key) not between 20 and 500 or v_key !~ '^cwk-[A-Za-z0-9_-]+$') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'codewords_api_key';
  end if;
  if v_novo and v_key is null then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'codewords_api_key';
  end if;
  v_mudou_key := not v_novo and v_key is not null;
  v_rota := case when c ? 'rota' then c ->> 'rota' else coalesce(k.codewords_rota, 'fluxo') end;
  if v_rota is null or v_rota not in ('fluxo', 'direta') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'rota';
  end if;
  begin
    v_ia := case when c ? 'ia_ligada' then (c ->> 'ia_ligada')::boolean else coalesce(k.ia_ligada, true) end;
  exception when invalid_text_representation then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'ia_ligada';
  end;
  begin
    v_volta := case when c ? 'ia_volta_horas' then (c ->> 'ia_volta_horas')::int else coalesce(k.ia_volta_horas, 6) end;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'ia_volta_horas';
  end;
  if v_ia is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'ia_ligada'; end if;
  if v_volta is null or v_volta not between 0 and 168 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'ia_volta_horas';
  end if;
  begin
    v_rot := coalesce((c ->> 'rotacionar_url')::boolean, (c ->> 'rotacionar_webhook')::boolean, false);
  exception when invalid_text_representation then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'rotacionar_url';
  end;
  if c ? 'departamento_id' then
    begin
      v_dep := nullif(c ->> 'departamento_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
    end;
    if v_dep is not null and not exists (select 1 from public.nx_departamentos d
                                          where d.id = v_dep and d.cliente_id = p_cliente) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
    end if;
  else
    v_dep := k.departamento_id;
  end if;
  if v_dep is null then
    select d.id into v_dep from public.nx_departamentos d where d.cliente_id = p_cliente and d.padrao limit 1;
  end if;
  -- um aparelho = um canal (de qualquer cliente)
  if exists (select 1 from public.nx_canais x
              where x.provedor = 'codewords' and x.codewords_numero = v_num and x.id is distinct from v_id) then
    raise exception 'numero_em_uso' using errcode = '22023', hint = 'numero';
  end if;

  if v_novo then
    perform public.nx_exigir_limite(p_cliente, 'canais', 1);
    insert into public.nx_canais (cliente_id, tipo, provedor, nome, numero_exibicao, departamento_id, status, app_inscrito,
                                  codewords_numero, codewords_service_id, codewords_rota, ia_ligada, ia_volta_horas)
    values (p_cliente, 'whatsapp_cloud', 'codewords', v_nome, v_num, v_dep, 'pendente', null,
            v_num, v_service, v_rota, v_ia, v_volta)
    returning * into k;
  else
    update public.nx_canais set
      nome = v_nome, numero_exibicao = case when v_mudou_num then v_num else numero_exibicao end,
      departamento_id = v_dep, codewords_numero = v_num, codewords_service_id = v_service,
      codewords_rota = v_rota, ia_ligada = v_ia, ia_volta_horas = v_volta,
      -- número ou chave novos: o aparelho precisa ser conferido de novo
      codewords_phone_id = case when v_mudou_num then null else codewords_phone_id end,
      codewords_conectado = case when v_mudou_num or v_mudou_key then null else codewords_conectado end,
      codewords_numero_conferido = case when v_mudou_num or v_mudou_key then null else codewords_numero_conferido end,
      codewords_conferido_em = case when v_mudou_num or v_mudou_key then null else codewords_conferido_em end,
      codewords_estado = case when v_mudou_num then null else codewords_estado end,
      codewords_inscricao = case when v_mudou_num then null else codewords_inscricao end,
      status = case when v_mudou_num or v_mudou_key then 'pendente' else status end,
      ultimo_erro = case when v_mudou_num or v_mudou_key then null else ultimo_erro end
    where id = k.id
    returning * into k;
  end if;
  if v_key is not null then
    update public.nx_canais
       set codewords_api_segredo = public.nx_segredo_gravar(k.codewords_api_segredo, v_key, 'nx-cw-api-' || k.id::text)
     where id = k.id returning * into k;
  end if;
  if k.codewords_hook_segredo is null or v_rot then
    v_hook := encode(extensions.gen_random_bytes(32), 'hex');
    update public.nx_canais set
      codewords_hook_segredo = public.nx_segredo_gravar(k.codewords_hook_segredo, v_hook, 'nx-cw-url-' || k.id::text),
      codewords_hook_hash = encode(extensions.digest(v_hook, 'sha256'), 'hex'),
      -- rota direta: o aparelho ainda aponta para a URL antiga até "Receber aqui" de novo
      status = case when v_rot and codewords_rota = 'direta' then 'pendente' else status end,
      ultimo_erro = case when v_rot and codewords_rota = 'direta'
                         then 'URL do canal trocada: use "Receber aqui" de novo para o aparelho mandar para a URL nova.'
                         else ultimo_erro end
     where id = k.id returning * into k;
  end if;

  select c2.org_id into v_org from public.nx_clientes c2 where c2.id = p_cliente;
  perform public.nx_auditar(v_org, p_cliente, v.conta_id, case when v_novo then 'codewords_conectado' else 'codewords_configurado' end,
    jsonb_build_object('canal', k.id, 'numero', k.codewords_numero, 'rota', k.codewords_rota,
                       'api_key_atualizada', v_key is not null, 'url_nova', v_hook is not null));
  return json_build_object('canal', public.nx_canal_json(k) - 'webhook', 'webhook', public.nx_canal_json(k) -> 'webhook',
                           'webhook_url', public.nx_codewords_url(k), 'url_nova', v_hook is not null);
end $$;

-- ------------------------------------------------------------
-- 6. Internas da API do agente (só service_role). O canal SEMPRE vem do segredo da URL
--    (nx_codewords_canal); nada aceita cliente vindo do corpo.
-- ------------------------------------------------------------

-- Segredo da URL → canal. Conta o uso por minuto (limite de taxa do canal).
create or replace function public.nx_codewords_canal(p_chave text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare k public.nx_canais; v_min timestamptz := date_trunc('minute', now()); v_n int;
begin
  if p_chave is null or p_chave !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into k from public.nx_canais
   where codewords_hook_hash = encode(extensions.digest(p_chave, 'sha256'), 'hex') and provedor = 'codewords';
  if k.id is null then return null; end if;
  insert into public.nx_codewords_taxa as t (canal_id, minuto, n) values (k.id, v_min, 1)
  on conflict (canal_id, minuto) do update set n = t.n + 1
  returning t.n into v_n;
  if v_n = 1 then
    delete from public.nx_codewords_taxa where canal_id = k.id and minuto < v_min - interval '1 hour';
  end if;
  return json_build_object('canal_id', k.id, 'cliente_id', k.cliente_id, 'nome', k.nome,
    'numero', k.codewords_numero, 'rota', k.codewords_rota, 'ia_ligada', k.ia_ligada, 'status', k.status,
    'uso_minuto', v_n, 'excedido', v_n > 240);
end $$;

-- Resultado das ações do painel e da sincronização (conectado, número conferido, erro…).
create or replace function public.nx_codewords_situacao(p_canal uuid, p_cliente uuid, p_dados jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare k public.nx_canais; d jsonb := coalesce(p_dados, '{}'::jsonb); v_phone text; v_sync boolean; v_ok boolean;
begin
  select * into k from public.nx_canais where id = p_canal and cliente_id = p_cliente and provedor = 'codewords' for update;
  if k.id is null then raise exception 'canal_nao_encontrado' using errcode = '22023'; end if;
  if jsonb_typeof(d) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023'; end if;
  v_phone := nullif(btrim(coalesce(d ->> 'phone_id', '')), '');
  if v_phone is not null and v_phone !~ '^[A-Za-z0-9._:@-]{1,120}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'phone_id';
  end if;
  begin
    v_sync := (d ->> 'sync_ok')::boolean;
  exception when invalid_text_representation then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'sync_ok';
  end;
  update public.nx_canais set
    codewords_conectado = case when d ? 'conectado' then (d ->> 'conectado')::boolean else codewords_conectado end,
    codewords_numero_conferido = case when d ? 'numero_conferido' then (d ->> 'numero_conferido')::boolean
                                      else codewords_numero_conferido end,
    codewords_conferido_em = case when d ? 'numero_conferido' or d ? 'conectado' then now() else codewords_conferido_em end,
    codewords_phone_id = case when d ? 'phone_id' then v_phone else codewords_phone_id end,
    codewords_estado = case when d ? 'estado' then left(nullif(btrim(coalesce(d ->> 'estado', '')), ''), 60) else codewords_estado end,
    codewords_inscricao = case when d ? 'inscricao' then left(nullif(btrim(coalesce(d ->> 'inscricao', '')), ''), 300)
                               else codewords_inscricao end,
    codewords_rota = case when d ->> 'rota' in ('fluxo', 'direta') then d ->> 'rota' else codewords_rota end,
    ultimo_erro = case when d ? 'erro' then left(nullif(btrim(coalesce(d ->> 'erro', '')), ''), 500) else ultimo_erro end,
    verificado_em = case when d ? 'conectado' then now() else verificado_em end,
    codewords_sync_em = case when v_sync is not null or d ? 'sync_erro' then now() else codewords_sync_em end,
    codewords_sync_falhas = case when v_sync then 0 when d ? 'sync_erro' then codewords_sync_falhas + 1 else codewords_sync_falhas end,
    -- o aviso só acende depois de 2 rodadas ruins seguidas (uma piscada do CodeWords não é defeito)
    codewords_sync_erro = case when v_sync then null
                               when d ? 'sync_erro' and codewords_sync_falhas + 1 >= 2 then left(coalesce(d ->> 'sync_erro', 'falhou'), 500)
                               else codewords_sync_erro end
  where id = k.id
  returning * into k;
  v_ok := coalesce(k.codewords_conectado, false) and coalesce(k.codewords_numero_conferido, false);
  update public.nx_canais set status = case
      when v_ok then 'ativo'
      when k.codewords_conectado is false or k.codewords_numero_conferido is false then 'erro'
      else 'pendente' end
   where id = k.id returning * into k;
  return (public.nx_canal_json(k) - 'webhook')::json;
end $$;

-- Payload desconhecido: guarda SÓ os nomes dos campos (nunca valores) para descobrir o formato.
create or replace function public.nx_codewords_forma(p_canal uuid, p_forma jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  if jsonb_typeof(p_forma) is distinct from 'array' then return; end if;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v from (
    select left(e, 80) as x from jsonb_array_elements_text(p_forma) e
     where e ~ '^[A-Za-z0-9_.\[\]-]{1,80}$' and e !~ '[0-9]{6,}' limit 60) s;   -- telefone/id como chave de mapa não é "forma"
  update public.nx_canais set codewords_forma = v, codewords_forma_em = now()
   where id = p_canal and provedor = 'codewords';
end $$;

-- Aplica um recibo que chegou antes da mensagem (quando ela passa a existir).
create or replace function public.nx_codewords_status_aplicar(p_canal uuid, p_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_st text; v_erro text;
begin
  select status, erro into v_st, v_erro from public.nx_codewords_status_pendentes
   where canal_id = p_canal and provider_id = p_id and expira_em > clock_timestamp();
  if v_st is null then return; end if;
  perform public.nx_wa_status(p_canal, jsonb_build_array(jsonb_build_object(
    'id', 'cw:' || p_canal::text || ':' || p_id, 'status', v_st, 'erro_texto', v_erro)));
  delete from public.nx_codewords_status_pendentes where canal_id = p_canal and provider_id = p_id;
end $$;

-- Recibo (sent/delivered/read/failed). Antes da mensagem existir, fica pendente (7 dias),
-- sem regredir: lida > entregue > enviada; falha não desfaz entregue/lida.
create or replace function public.nx_codewords_status(p_canal uuid, p_id text, p_status text, p_erro text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v_cli uuid; v_msg bigint; v_st text; v_r json;
begin
  if p_id is null or p_id !~ '^[A-Za-z0-9._:=+/@-]{1,160}$' or coalesce(p_status, '') not in ('sent', 'delivered', 'read', 'failed') then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  select cliente_id into v_cli from public.nx_canais where id = p_canal and provedor = 'codewords';
  if v_cli is null then raise exception 'canal_nao_encontrado' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nx-cw:' || p_canal::text || ':' || p_id, 0));
  delete from public.nx_codewords_status_pendentes where canal_id = p_canal and expira_em <= clock_timestamp();
  select id into v_msg from public.nx_mensagens
   where wamid = 'cw:' || p_canal::text || ':' || p_id and canal_id = p_canal and cliente_id = v_cli and direcao = 'out';
  if v_msg is not null then
    v_r := public.nx_wa_status(p_canal, jsonb_build_array(jsonb_build_object(
      'id', 'cw:' || p_canal::text || ':' || p_id, 'status', p_status,
      'erro_texto', case when p_status = 'failed' then left(coalesce(nullif(btrim(p_erro), ''), 'o WhatsApp não entregou'), 500) end)));
    return json_build_object('ok', true, 'pendente', false, 'resultado', v_r);
  end if;
  insert into public.nx_codewords_status_pendentes as p (canal_id, provider_id, status, erro, expira_em)
  values (p_canal, p_id, p_status, case when p_status = 'failed' then left(p_erro, 500) end, clock_timestamp() + interval '7 days')
  on conflict (canal_id, provider_id) do update set
    status = case
      when p.status = 'read' or excluded.status = 'read' then 'read'
      when p.status = 'delivered' or excluded.status = 'delivered' then 'delivered'
      when p.status = 'failed' or excluded.status = 'failed' then 'failed'
      else 'sent' end,
    erro = case
      when p.status in ('delivered', 'read') or excluded.status in ('delivered', 'read') then null
      when excluded.status = 'failed' then excluded.erro
      else p.erro end,
    expira_em = excluded.expira_em
  returning p.status into v_st;
  return json_build_object('ok', true, 'pendente', true, 'status', v_st);
end $$;

-- Dados crus do contexto da IA (o texto e os rótulos são montados na Edge Function).
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

-- Depois de gravar uma ENTRADA: a IA deve responder? (IA 24h, bloqueio, pausa e limite anti-loop)
create or replace function public.nx_codewords_decidir(p_canal uuid, p_conversa bigint, p_fila bigint default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare k public.nx_canais; cv public.nx_conversas; ct public.nx_contatos; v_n int; v_motivo text;
begin
  select * into k from public.nx_canais where id = p_canal and provedor = 'codewords';
  if k.id is null then raise exception 'canal_nao_encontrado' using errcode = '22023'; end if;
  select * into cv from public.nx_conversas
   where id = p_conversa and cliente_id = k.cliente_id and canal_id = k.id for update;
  if cv.id is null then raise exception 'conversa_nao_encontrada' using errcode = '22023'; end if;
  select * into ct from public.nx_contatos where id = cv.contato_id and cliente_id = k.cliente_id;
  if not k.ia_ligada or k.codewords_rota <> 'fluxo' then
    v_motivo := 'ia_desligada';
  elsif coalesce(ct.bloqueado, false) or cv.oculta then
    v_motivo := 'bloqueado';
  elsif cv.ia_pausada_ate > now() then
    v_motivo := 'pausada';
  else
    select count(*) into v_n from (select 1 from public.nx_mensagens m
      where m.conversa_id = cv.id and m.direcao = 'out' and m.origem = 'ia'
        and m.criado_em > now() - interval '10 minutes' limit 8) x;
    if v_n >= 8 then
      v_motivo := 'limite';
      -- avisa a equipe uma vez a cada 10 min por conversa
      if cv.ia_limite_em is null or cv.ia_limite_em < now() - interval '10 minutes' then
        update public.nx_conversas set ia_limite_em = now(), aguardando = true where id = cv.id;
        perform public.nx_cv_sistema(cv.id, 'IA segurada: 8 respostas em 10 minutos nesta conversa. A equipe foi avisada.');
        perform public.nx_notificar(k.cliente_id, null, 'sistema',
          left('IA segurada na conversa com ' || coalesce(ct.nome, ct.telefone, 'um contato'), 120),
          'A IA respondeu 8 vezes em 10 minutos e parou para evitar repetição. Confira a conversa.',
          '#/conversas/' || cv.id);
      end if;
    end if;
  end if;
  if v_motivo is not null then
    return json_build_object('responder', false, 'motivo', v_motivo);
  end if;
  -- a IA 24h responde: o aviso de "fora do horário" do departamento não sai junto
  if p_fila is not null then
    update public.nx_envios_fila set status = 'pulado', erro = 'a IA 24h responde este canal', processado_em = now()
     where id = p_fila and cliente_id = k.cliente_id and status = 'pendente' and origem = 'fora_horario';
  end if;
  return json_build_object('responder', true,
                           'dados', public.nx_codewords_dados(k.id, coalesce(ct.wa_id, ct.telefone)));
end $$;

-- SAÍDA vista pelo aparelho/fluxo: IA (autor 'ia'), pessoa no celular (autor 'celular') ou
-- desconhecido. Nunca cria contato nem conversa. Eco do painel não duplica; gêmea é adotada.
create or replace function public.nx_codewords_saida(p_canal uuid, p_msg jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.nx_canais; m jsonb := coalesce(p_msg, '{}'::jsonb);
  v_tel text := left(regexp_replace(coalesce(m ->> 'telefone', ''), '\D', '', 'g'), 20);
  v_id text := btrim(coalesce(m ->> 'id', ''));
  v_texto text := nullif(left(m ->> 'texto', 4096), '');
  v_tipo text := coalesce(nullif(m ->> 'tipo', ''), 'texto');
  v_autor text := nullif(m ->> 'autor', '');
  v_em timestamptz := now();
  v_wamid text; v_ex public.nx_mensagens; v_tw public.nx_mensagens; v_ct bigint; cv public.nx_conversas;
  v_msg bigint; v_motivo text; v_eco boolean;
begin
  select * into k from public.nx_canais where id = p_canal and provedor = 'codewords';
  if k.id is null then raise exception 'canal_nao_encontrado' using errcode = '22023'; end if;
  if length(v_tel) not between 8 and 15 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'telefone'; end if;
  if v_id !~ '^[A-Za-z0-9._:=+/@-]{1,160}$' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'message_id'; end if;
  if v_tipo not in ('texto', 'imagem', 'audio', 'video', 'documento', 'sticker', 'localizacao', 'contato') then v_tipo := 'texto'; end if;
  if v_tipo = 'texto' and btrim(coalesce(v_texto, '')) = '' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'texto';
  end if;
  if v_autor is not null and v_autor not in ('ia', 'celular') then v_autor := null; end if;
  -- rota direta: não há IA no caminho; a saída do aparelho que não é eco do painel é gente no celular
  v_autor := coalesce(v_autor, case when k.codewords_rota = 'direta' then 'celular' end);
  if (m ->> 'em') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$'
     and pg_input_is_valid(m ->> 'em', 'timestamptz') then
    v_em := least((m ->> 'em')::timestamptz, now());
  end if;
  v_wamid := 'cw:' || k.id::text || ':' || v_id;
  perform pg_advisory_xact_lock(hashtextextended('nx-cw:' || k.id::text || ':' || v_id, 0));

  -- (1) mesma mensagem já gravada (mesmo id do aparelho/fluxo)
  select * into v_ex from public.nx_mensagens where wamid = v_wamid;
  if v_ex.id is not null then
    if v_ex.cliente_id <> k.cliente_id then raise exception 'dados_invalidos' using errcode = '22023'; end if;
    v_eco := v_ex.direcao = 'out' and (v_ex.enviado_por is not null or v_ex.origem in ('painel', 'automacao', 'fora_horario', 'agendada'));
    if v_ex.direcao = 'out' and not v_eco and v_ex.origem is null then
      if v_autor = 'ia' then
        update public.nx_mensagens set origem = 'ia' where id = v_ex.id;
      elsif v_autor = 'celular' then
        perform public.nx_codewords_pausar(v_ex.conversa_id, 'celular', null, null, v_em);
      end if;
    end if;
    perform public.nx_codewords_status_aplicar(k.id, v_id);
    return json_build_object('ok', true, 'conversa_id', v_ex.conversa_id, 'mensagem_id', v_ex.id,
                             'registrada', false, 'motivo', case when v_eco then 'eco' else 'duplicada' end);
  end if;

  -- (2) contato e conversa DESTE canal
  v_ct := public.nx_contato_por_tel(k.cliente_id, v_tel);
  if v_ct is not null then
    select * into cv from public.nx_conversas x
     where x.cliente_id = k.cliente_id and x.canal_id = k.id and x.contato_id = v_ct
     order by (x.status <> 'resolvida') desc, x.ultima_msg_em desc, x.id desc limit 1
     for update;
  end if;
  if cv.id is null then
    return json_build_object('ok', true, 'conversa_id', null, 'registrada', false, 'motivo', 'saida',
                             'ignorado', 'sem_conversa');
  end if;

  -- (3) gêmea: a mesma saída gravada sem o id do aparelho (painel com confirmação pendente, IA
  --     informada sem message_id): mesma direção, mesmo texto, ±5 min → adota em vez de duplicar
  if v_texto is not null then
    select * into v_tw from public.nx_mensagens x
     where x.conversa_id = cv.id and x.cliente_id = k.cliente_id and x.direcao = 'out'
       and x.tipo not in ('nota', 'sistema')
       and (x.wamid is null or x.wamid like 'cw:' || k.id::text || ':orbita-%')
       and btrim(coalesce(x.corpo, '')) = btrim(v_texto)
       and x.criado_em between v_em - interval '5 minutes' and v_em + interval '5 minutes'
     order by x.id desc limit 1
     for update;
  end if;
  if v_tw.id is not null then
    v_eco := v_tw.enviado_por is not null or v_tw.origem in ('painel', 'automacao', 'fora_horario', 'agendada');
    update public.nx_mensagens set
      wamid = case when v_id like 'orbita-%' then wamid else v_wamid end,   -- id real substitui o provisório
      status = case when status in ('pendente', 'falhou') then 'enviada' else status end,
      erro = case when status in ('pendente', 'falhou') then null else erro end,
      origem = case when origem is null and v_autor = 'ia' then 'ia' else origem end
    where id = v_tw.id;
    if v_autor = 'celular' and not v_eco and v_tw.origem is null then
      perform public.nx_codewords_pausar(cv.id, 'celular', null, null, v_em);
    end if;
    if v_id not like 'orbita-%' then perform public.nx_codewords_status_aplicar(k.id, v_id); end if;
    return json_build_object('ok', true, 'conversa_id', cv.id, 'mensagem_id', v_tw.id, 'registrada', false,
                             'motivo', case when v_eco then 'eco' else 'duplicada' end);
  end if;

  -- (4) grava (IA conta no limite anti-loop pela hora de gravação)
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, midia,
                                   wamid, status, origem, criado_em)
  values (k.cliente_id, cv.id, cv.contato_id, k.id, 'out', v_tipo, v_texto,
          case when v_tipo in ('imagem', 'audio', 'video', 'documento', 'sticker')
               then jsonb_strip_nulls(jsonb_build_object('estado', 'indisponivel', 'nome', left(m ->> 'midia_nome', 200))) end,
          v_wamid, 'enviada', case when v_autor = 'ia' then 'ia' end,
          case when v_autor = 'ia' then now() else v_em end)
  returning id into v_msg;
  update public.nx_conversas set
    ultima_msg_em = greatest(ultima_msg_em, v_em),
    ultima_msg_resumo = case when v_em >= ultima_msg_em then public.nx_wa_resumo(v_tipo, v_texto) else ultima_msg_resumo end,
    ultima_msg_dir = case when v_em >= ultima_msg_em then 'out' else ultima_msg_dir end,
    aguardando = case when v_em >= coalesce(ultima_entrada_em, '-infinity'::timestamptz) then false else aguardando end,
    primeira_resposta_em = case when v_autor = 'celular' then coalesce(primeira_resposta_em, v_em) else primeira_resposta_em end,
    atualizado_em = now()
  where id = cv.id;
  update public.nx_contatos set ultimo_contato_em = now() where id = cv.contato_id;
  if v_autor = 'celular' then
    perform public.nx_codewords_pausar(cv.id, 'celular', null, null, v_em);
  end if;
  perform public.nx_codewords_status_aplicar(k.id, v_id);
  return json_build_object('ok', true, 'conversa_id', cv.id, 'mensagem_id', v_msg, 'registrada', true, 'motivo', 'saida');
end $$;

-- A IA pede uma pessoa: pausa a IA na conversa, deixa em "Aguardando" e avisa a equipe.
create or replace function public.nx_codewords_humano(p_canal uuid, p_telefone text, p_motivo text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare a jsonb := public.nx_codewords_alvo(p_canal, p_telefone); cv public.nx_conversas; ct public.nx_contatos;
        v_mot text := left(nullif(btrim(regexp_replace(coalesce(p_motivo, ''), '\s+', ' ', 'g')), ''), 300);
        v_ate timestamptz; v_n int;
begin
  if (a ->> 'conversa_id') is null then
    return json_build_object('ok', false, 'erro', 'conversa_nao_encontrada');
  end if;
  select * into cv from public.nx_conversas where id = (a ->> 'conversa_id')::bigint and cliente_id = (a ->> 'cliente_id')::uuid;
  select * into ct from public.nx_contatos where id = cv.contato_id;
  v_ate := public.nx_codewords_pausar(cv.id, 'humano', null);
  update public.nx_conversas set aguardando = true, atualizado_em = now() where id = cv.id;
  perform public.nx_cv_sistema(cv.id, 'A IA chamou a equipe' || coalesce(': ' || v_mot, '.'));
  v_n := 0;
  if cv.atribuida_a is not null then
    v_n := public.nx_notificar(cv.cliente_id, cv.atribuida_a, 'sistema',
      left('A IA pediu ajuda com ' || coalesce(ct.nome, ct.telefone, 'um contato'), 120), v_mot, '#/conversas/' || cv.id);
  end if;
  if v_n = 0 then
    perform public.nx_notificar(cv.cliente_id, null, 'sistema',
      left('A IA pediu ajuda com ' || coalesce(ct.nome, ct.telefone, 'um contato'), 120), v_mot, '#/conversas/' || cv.id);
  end if;
  return json_build_object('ok', true, 'conversa_id', cv.id,
    'pausada_ate', case when v_ate = 'infinity'::timestamptz then null else v_ate end,
    'so_manual', v_ate = 'infinity'::timestamptz);
end $$;

-- Nota da IA (resumo) no negócio aberto do contato (ou no contato).
create or replace function public.nx_codewords_nota(p_canal uuid, p_telefone text, p_texto text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare a jsonb := public.nx_codewords_alvo(p_canal, p_telefone); v_txt text := btrim(coalesce(p_texto, '')); v_id bigint;
begin
  if char_length(v_txt) not between 1 and 2000 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'texto';
  end if;
  if (a ->> 'contato_id') is null then
    return json_build_object('ok', false, 'erro', 'contato_nao_encontrado');
  end if;
  insert into public.nx_notas (cliente_id, contato_id, negocio_id, autor_id, texto)
  values ((a ->> 'cliente_id')::uuid, (a ->> 'contato_id')::bigint, (a ->> 'negocio_id')::bigint, null, 'IA: ' || v_txt)
  returning id into v_id;
  return json_build_object('ok', true, 'nota_id', v_id, 'negocio_id', (a ->> 'negocio_id')::bigint);
end $$;

-- A IA só move para 'orcamento' ou 'perdida' (nunca 'fechou'; 'agendada' só pelo agendar).
create or replace function public.nx_codewords_etapa(p_canal uuid, p_telefone text, p_etapa text, p_motivo text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare a jsonb; l public.nx_leads; e public.nx_estagios;
        v_mot text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 480);
begin
  if p_etapa is null or p_etapa not in ('orcamento', 'perdida') then
    return json_build_object('ok', false, 'erro', 'etapa_invalida');
  end if;
  a := public.nx_codewords_alvo(p_canal, p_telefone);
  if (a ->> 'negocio_id') is null then
    return json_build_object('ok', false, 'erro', 'negocio_nao_encontrado');
  end if;
  select * into l from public.nx_leads where id = (a ->> 'negocio_id')::bigint and cliente_id = (a ->> 'cliente_id')::uuid
   for update;
  if l.status <> 'aberto' then return json_build_object('ok', false, 'erro', 'negocio_fechado'); end if;
  select * into e from public.nx_estagios s
   where s.cliente_id = l.cliente_id and s.funil_id = l.funil_id and s.marco = p_etapa order by s.ordem limit 1;
  if e.id is null then return json_build_object('ok', false, 'erro', 'etapa_indisponivel'); end if;
  if l.estagio_id = e.id then
    return json_build_object('ok', true, 'negocio_id', l.id, 'etapa', e.nome, 'mudou', false);
  end if;
  update public.nx_leads set
    estagio_id = e.id, ordem = -extract(epoch from clock_timestamp()),
    motivo_perda_txt = case when e.tipo = 'perdido' then left('IA: ' || coalesce(v_mot, 'sem motivo informado'), 500)
                            else motivo_perda_txt end,
    atualizado_em = now()
  where id = l.id;   -- o gatilho da F1 aplica etapa↔marco, status e fechado_em
  if v_mot is not null and e.tipo <> 'perdido' then
    insert into public.nx_notas (cliente_id, contato_id, negocio_id, texto)
    values (l.cliente_id, l.contato_id, l.id, left('IA moveu para «' || e.nome || '»: ' || v_mot, 5000));
  end if;
  return json_build_object('ok', true, 'negocio_id', l.id, 'etapa', e.nome, 'mudou', true);
end $$;

-- Origem que o cliente contou à IA. Só preenche se o negócio ainda não tem atribuição de anúncio.
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
    if l.plataforma is not null or l.anuncio_ext is not null or l.origem = 'anuncio' then
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
-- 7. Sincronização em segundo plano (pg_cron de 2 em 2 min → nx-codewords)
--    Só canais CodeWords pareados e só conversas com atividade nas últimas 2 h.
-- ------------------------------------------------------------
create or replace function public.nx_codewords_sync_alvos(p_limite int default 30)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return coalesce((select json_agg(json_build_object('canal_id', x.canal_id, 'cliente_id', x.cliente_id,
                                                     'conversa_id', x.conversa_id, 'telefone', x.telefone)
                                   order by x.ultima_msg_em desc)
    from (select k.id as canal_id, k.cliente_id, cv.id as conversa_id, coalesce(ct.wa_id, ct.telefone) as telefone,
                 cv.ultima_msg_em
            from public.nx_canais k
            join public.nx_conversas cv on cv.canal_id = k.id and cv.cliente_id = k.cliente_id
            join public.nx_contatos ct on ct.id = cv.contato_id and ct.cliente_id = k.cliente_id
            join public.nx_clientes c on c.id = k.cliente_id
           where k.provedor = 'codewords' and k.codewords_phone_id is not null and k.codewords_api_segredo is not null
             and k.codewords_conectado is distinct from false and k.codewords_numero_conferido is distinct from false
             and c.status in ('ativo', 'teste')
             and cv.ultima_msg_em > now() - interval '2 hours' and not cv.oculta and not ct.bloqueado
           order by cv.ultima_msg_em desc
           limit greatest(1, least(coalesce(p_limite, 30), 100))) x), '[]'::json);
end $$;

-- Grava o que faltar de UMA conversa vista no aparelho (/proxy/chat/{jid}/messages).
-- p_itens: [{id, texto, tipo, midia_nome, de_mim, em}] (até 50). Idempotente pelo id.
create or replace function public.nx_codewords_sync_gravar(p_canal uuid, p_conversa bigint, p_itens jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.nx_canais; cv public.nx_conversas; ct public.nx_contatos; it jsonb; v_id text; v_wamid text; v_txt text;
  v_tipo text; v_em timestamptz; v_tw public.nx_mensagens; r json; v_msg bigint;
  v_ja int := 0; v_ad int := 0; v_in int := 0; v_out int := 0; v_rec int := 0; v_ign int := 0; v_leads jsonb := '[]'::jsonb;
begin
  select * into k from public.nx_canais where id = p_canal and provedor = 'codewords';
  if k.id is null then raise exception 'canal_nao_encontrado' using errcode = '22023'; end if;
  select * into cv from public.nx_conversas where id = p_conversa and cliente_id = k.cliente_id and canal_id = k.id;
  if cv.id is null then raise exception 'conversa_nao_encontrada' using errcode = '22023'; end if;
  select * into ct from public.nx_contatos where id = cv.contato_id and cliente_id = k.cliente_id;
  if jsonb_typeof(p_itens) is distinct from 'array' then raise exception 'dados_invalidos' using errcode = '22023'; end if;
  for it in select x from jsonb_array_elements(p_itens) x
            order by case when (x ->> 'em') ~ '^\d{4}-\d{2}-\d{2}T' and pg_input_is_valid(x ->> 'em', 'timestamptz')
                          then (x ->> 'em')::timestamptz end nulls last
            limit 50 loop
    v_id := btrim(coalesce(it ->> 'id', ''));
    v_txt := nullif(left(it ->> 'texto', 4096), '');
    v_tipo := coalesce(nullif(it ->> 'tipo', ''), 'texto');
    if v_tipo not in ('texto', 'imagem', 'audio', 'video', 'documento', 'sticker', 'localizacao', 'contato') then v_tipo := 'texto'; end if;
    if v_id !~ '^[A-Za-z0-9._:=+/@-]{1,160}$' or (v_tipo = 'texto' and btrim(coalesce(v_txt, '')) = '')
       or not coalesce((it ->> 'em') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$'
                       and pg_input_is_valid(it ->> 'em', 'timestamptz'), false) then
      v_ign := v_ign + 1; continue;           -- data inválida gravaria 1970 e bagunçaria o chat
    end if;
    v_em := least((it ->> 'em')::timestamptz, now());
    v_wamid := 'cw:' || k.id::text || ':' || v_id;
    perform pg_advisory_xact_lock(hashtextextended('nx-cw:' || k.id::text || ':' || v_id, 0));
    if exists (select 1 from public.nx_mensagens where wamid = v_wamid) then v_ja := v_ja + 1; continue; end if;
    v_tw := null;
    if v_txt is not null then
      select * into v_tw from public.nx_mensagens x
       where x.conversa_id = cv.id and x.cliente_id = k.cliente_id
         and x.direcao = case when coalesce((it ->> 'de_mim')::boolean, false) then 'out' else 'in' end
         and x.tipo not in ('nota', 'sistema')
         and (x.wamid is null or x.wamid like 'cw:' || k.id::text || ':orbita-%')
         and btrim(coalesce(x.corpo, '')) = btrim(v_txt)
         and x.criado_em between v_em - interval '5 minutes' and v_em + interval '5 minutes'
       order by x.id desc limit 1 for update;
    end if;
    if v_tw.id is not null then                 -- gêmea: adota o id do aparelho
      update public.nx_mensagens set wamid = v_wamid,
        status = case when direcao = 'out' and status in ('pendente', 'falhou') then 'enviada' else status end,
        erro = case when direcao = 'out' and status in ('pendente', 'falhou') then null else erro end
      where id = v_tw.id;
      perform public.nx_codewords_status_aplicar(k.id, v_id);
      v_ad := v_ad + 1; continue;
    end if;
    if not coalesce((it ->> 'de_mim')::boolean, false) then
      r := public.nx_wa_entrada(k.id, jsonb_strip_nulls(jsonb_build_object(
             'wamid', v_wamid, 'wa_id', coalesce(ct.wa_id, ct.telefone), 'tipo', v_tipo, 'corpo', v_txt,
             'em', to_char(v_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
             'midia', case when v_tipo in ('imagem', 'audio', 'video', 'documento', 'sticker')
                           then jsonb_strip_nulls(jsonb_build_object('nome', left(it ->> 'midia_nome', 200))) end)));
      if coalesce((r ->> 'duplicada')::boolean, false) then v_ja := v_ja + 1; continue; end if;
      v_in := v_in + 1;
      if coalesce((r ->> 'nova_conversa')::boolean, false) then v_leads := v_leads || to_jsonb(coalesce(ct.wa_id, ct.telefone)); end if;
    else
      -- saída que ninguém informou: espera 90 s (o fluxo informa as respostas da IA logo depois de enviar)
      if v_em > now() - interval '90 seconds' then v_rec := v_rec + 1; continue; end if;
      insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, midia,
                                       wamid, status, origem, criado_em)
      values (k.cliente_id, cv.id, cv.contato_id, k.id, 'out', v_tipo, v_txt,
              case when v_tipo in ('imagem', 'audio', 'video', 'documento', 'sticker')
                   then jsonb_strip_nulls(jsonb_build_object('estado', 'indisponivel', 'nome', left(it ->> 'midia_nome', 200))) end,
              v_wamid, 'enviada', null, v_em)
      returning id into v_msg;
      update public.nx_conversas set
        ultima_msg_em = greatest(ultima_msg_em, v_em),
        ultima_msg_resumo = case when v_em >= ultima_msg_em then public.nx_wa_resumo(v_tipo, v_txt) else ultima_msg_resumo end,
        ultima_msg_dir = case when v_em >= ultima_msg_em then 'out' else ultima_msg_dir end,
        aguardando = case when v_em >= coalesce(ultima_entrada_em, '-infinity'::timestamptz) then false else aguardando end,
        primeira_resposta_em = coalesce(primeira_resposta_em, v_em),
        atualizado_em = now()
      where id = cv.id;
      -- feita no celular (não veio do painel nem foi informada pela IA): pausa a IA
      perform public.nx_codewords_pausar(cv.id, 'celular', null, null, v_em);
      perform public.nx_codewords_status_aplicar(k.id, v_id);
      v_out := v_out + 1;
    end if;
  end loop;
  return json_build_object('ja_tinha', v_ja, 'adotadas', v_ad, 'entradas', v_in, 'saidas', v_out,
                           'recentes', v_rec, 'ignoradas', v_ign, 'leads', v_leads);
end $$;

-- pg_cron (2 em 2 min): só chama a função quando há conversa CodeWords ativa nas últimas 2 h.
create or replace function public.nx_codewords_sync_chamar()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.nx_canais k
               join public.nx_conversas cv on cv.canal_id = k.id and cv.cliente_id = k.cliente_id
              where k.provedor = 'codewords' and k.codewords_phone_id is not null
                and k.codewords_conectado is distinct from false
                and cv.ultima_msg_em > now() - interval '2 hours') then
    begin
      perform public.nx_disparar('nx-codewords', '{"sincronizar":true}'::jsonb);
    exception when others then
      raise warning 'nx_codewords_sync_chamar: %', sqlerrm;   -- sem funcoes_url/função: tenta na próxima rodada
    end;
  end if;
end $$;

-- ============================================================
-- 8. Funções existentes redefinidas (cópia fiel do que está no banco + a mudança descrita)
-- ============================================================
-- ------------------------------------------------------------
-- nx_wa_canal: cópia de 20260928f_funcoes.sql (igual ao banco) + só canais Meta (o CodeWords tem URL própria)
-- ------------------------------------------------------------
create or replace function public.nx_wa_canal(p_phone_number_id text default null, p_chave text default null)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
declare k public.nx_canais; v_slug text;
begin
  if nullif(btrim(coalesce(p_chave, '')), '') is not null then
    select * into k from public.nx_canais where chave_publica = btrim(p_chave) and provedor = 'meta';
  elsif nullif(btrim(coalesce(p_phone_number_id, '')), '') is not null then
    select * into k from public.nx_canais where phone_number_id = btrim(p_phone_number_id) and provedor = 'meta';
  end if;
  if k.id is null then return null; end if;
  select c.slug into v_slug from public.nx_clientes c where c.id = k.cliente_id;
  return json_build_object(
    'canal_id', k.id, 'cliente_id', k.cliente_id, 'cliente_slug', v_slug,
    'phone_number_id', k.phone_number_id, 'waba_id', k.waba_id, 'verify_token', k.verify_token,
    'app_secret', public.nx_segredo_ler(k.app_secret_segredo),
    'tem_token', k.token_segredo is not null, 'status', k.status);
end $$;

-- ------------------------------------------------------------
-- nx_canal_credencial: cópia de 20260928f_funcoes.sql (igual ao banco) + provedor e credenciais do aparelho CodeWords (só service_role)
-- ------------------------------------------------------------
create or replace function public.nx_canal_credencial(p_canal uuid, p_cliente uuid)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
declare k public.nx_canais;
begin
  select * into k from public.nx_canais where id = p_canal and cliente_id = p_cliente;
  if k.id is null then
    raise exception 'canal_nao_encontrado' using errcode = '22023';
  end if;
  return json_build_object(
    'canal_id', k.id, 'cliente_id', k.cliente_id, 'nome', k.nome,
    'phone_number_id', k.phone_number_id, 'waba_id', k.waba_id,
    'token', public.nx_segredo_ler(k.token_segredo),
    'app_secret', public.nx_segredo_ler(k.app_secret_segredo),
    'provedor', k.provedor, 'codewords_numero', k.codewords_numero, 'codewords_phone_id', k.codewords_phone_id,
    'codewords_service_id', k.codewords_service_id, 'codewords_rota', k.codewords_rota,
    'codewords_api_key', public.nx_segredo_ler(k.codewords_api_segredo),
    'codewords_url', public.nx_codewords_url(k),
    'codewords_numero_conferido', k.codewords_numero_conferido, 'codewords_conferido_em', k.codewords_conferido_em,
    'ia_ligada', k.ia_ligada, 'ia_volta_horas', k.ia_volta_horas);
end $$;

-- ------------------------------------------------------------
-- nx_canal_salvar: cópia de 20260928e_conversas.sql (igual ao banco) + canal CodeWords não é editado por aqui (é nx_codewords_canal_salvar)
-- ------------------------------------------------------------
create or replace function public.nx_canal_salvar(p_token text, p_cliente uuid, p_canal jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  c jsonb := coalesce(p_canal, '{}'::jsonb);
  k public.nx_canais;
  v_id uuid;
  v_novo boolean;
  v_nome text; v_pid text; v_waba text; v_num text; v_dep uuid; v_coex boolean;
  v_tok text; v_sec text;
  v_old_pid text; v_old_waba text;
  v_mudou boolean := false;
  v_org uuid;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  begin
    v_id := nullif(c ->> 'id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'canal_nao_encontrado' using errcode = '22023';
  end;
  v_novo := v_id is null;
  if not v_novo then
    select * into k from public.nx_canais where id = v_id and cliente_id = p_cliente and provedor = 'meta' for update;
    if k.id is null then
      raise exception 'canal_nao_encontrado' using errcode = '22023';
    end if;
  end if;
  v_old_pid := k.phone_number_id; v_old_waba := k.waba_id;

  v_nome := case when c ? 'nome' then btrim(coalesce(c ->> 'nome', '')) else k.nome end;
  if v_nome is null or char_length(v_nome) < 1 or char_length(v_nome) > 40 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'nome';
  end if;
  v_pid := case when c ? 'phone_number_id' then nullif(regexp_replace(coalesce(c ->> 'phone_number_id', ''), '\s', '', 'g'), '')
                else k.phone_number_id end;
  if v_pid is null or v_pid !~ '^[0-9]{5,30}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'phone_number_id';
  end if;
  v_waba := case when c ? 'waba_id' then nullif(regexp_replace(coalesce(c ->> 'waba_id', ''), '\s', '', 'g'), '')
                 else k.waba_id end;
  if v_waba is null or v_waba !~ '^[0-9]{5,30}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'waba_id';
  end if;
  v_num := case when c ? 'numero_exibicao' then nullif(left(btrim(coalesce(c ->> 'numero_exibicao', '')), 30), '')
                else k.numero_exibicao end;
  if c ? 'departamento_id' then
    begin
      v_dep := nullif(c ->> 'departamento_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
    end;
    if v_dep is not null and not exists (select 1 from public.nx_departamentos d
                                          where d.id = v_dep and d.cliente_id = p_cliente) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
    end if;
  else
    v_dep := k.departamento_id;
  end if;
  if v_dep is null then
    select d.id into v_dep from public.nx_departamentos d where d.cliente_id = p_cliente and d.padrao limit 1;
  end if;
  begin
    v_coex := case when c ? 'coexistencia' then coalesce((c ->> 'coexistencia')::boolean, false)
                   else coalesce(k.coexistencia, false) end;
  exception when invalid_text_representation then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'coexistencia';
  end;
  v_tok := nullif(btrim(coalesce(c ->> 'token', '')), '');
  v_sec := nullif(btrim(coalesce(c ->> 'app_secret', '')), '');
  if v_tok is not null and (char_length(v_tok) < 20 or char_length(v_tok) > 1000 or v_tok ~ '\s') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'token';
  end if;
  if v_sec is not null and v_sec !~ '^[0-9A-Za-z]{16,128}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'app_secret';
  end if;

  -- número de outro canal (de qualquer cliente) ou de outro cliente pelo caminho antigo
  if exists (select 1 from public.nx_canais x where x.phone_number_id = v_pid and x.id is distinct from v_id)
     or exists (select 1 from public.nx_clientes x where x.wa_phone_number_id = v_pid and x.id <> p_cliente) then
    raise exception 'numero_em_uso' using errcode = '22023', hint = 'phone_number_id';
  end if;

  -- ordem obrigatória (§5.4): desliga o gatilho do cliente → grava o canal → só então o cliente
  perform set_config('nx.sem_gatilho_canal', '1', true);
  if v_novo then
    perform public.nx_exigir_limite(p_cliente, 'canais', 1);
    insert into public.nx_canais (cliente_id, nome, phone_number_id, waba_id, numero_exibicao, departamento_id,
                                  coexistencia, status, app_inscrito)
    values (p_cliente, v_nome, v_pid, v_waba, v_num, v_dep, v_coex, 'pendente', null)
    returning * into k;
    v_mudou := true;
  else
    v_mudou := v_pid is distinct from v_old_pid or v_waba is distinct from v_old_waba or v_tok is not null
               or v_sec is not null;
    update public.nx_canais
       set nome = v_nome, phone_number_id = v_pid, waba_id = v_waba, numero_exibicao = v_num,
           departamento_id = v_dep, coexistencia = v_coex,
           status = case when v_mudou then 'pendente' else status end,
           app_inscrito = case when v_mudou then null else app_inscrito end
     where id = k.id
    returning * into k;
  end if;
  if v_tok is not null then
    update public.nx_canais
       set token_segredo = public.nx_segredo_gravar(k.token_segredo, v_tok, 'nx-canal-token-' || k.id::text)
     where id = k.id returning * into k;
  end if;
  if v_sec is not null then
    update public.nx_canais
       set app_secret_segredo = public.nx_segredo_gravar(k.app_secret_segredo, v_sec, 'nx-canal-app-' || k.id::text)
     where id = k.id returning * into k;
  end if;
  update public.nx_clientes set wa_phone_number_id = v_pid
   where id = p_cliente
     and (wa_phone_number_id is null or (v_old_pid is not null and wa_phone_number_id = v_old_pid));
  perform set_config('nx.sem_gatilho_canal', '', true);

  select c2.org_id into v_org from public.nx_clientes c2 where c2.id = p_cliente;
  perform public.nx_auditar(v_org, p_cliente, v.conta_id, case when v_novo then 'canal_criado' else 'canal_alterado' end,
                            jsonb_build_object('canal', k.id, 'phone_number_id', k.phone_number_id,
                                               'token', v_tok is not null, 'app_secret', v_sec is not null));
  return json_build_object('canal', public.nx_canal_json(k) - 'webhook',
                           'webhook', public.nx_canal_json(k) -> 'webhook');
end $$;

-- ------------------------------------------------------------
-- nx_canal_excluir: cópia de 20260928e_conversas.sql (igual ao banco) + apaga também a chave cwk- e o segredo da URL do canal CodeWords
-- ------------------------------------------------------------
create or replace function public.nx_canal_excluir(p_token text, p_cliente uuid, p_id uuid, p_confirmacao text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  k public.nx_canais;
  v_org uuid;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  select * into k from public.nx_canais where id = p_id and cliente_id = p_cliente for update;
  if k.id is null then
    raise exception 'canal_nao_encontrado' using errcode = '22023';
  end if;
  if coalesce(lower(btrim(p_confirmacao)), '') <> 'excluir' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'confirmacao';
  end if;
  delete from public.nx_canais where id = k.id;
  delete from vault.secrets s
   where s.id in (k.token_segredo, k.app_secret_segredo, k.codewords_api_segredo, k.codewords_hook_segredo);
  perform set_config('nx.sem_gatilho_canal', '1', true);
  update public.nx_clientes set wa_phone_number_id = null
   where id = p_cliente and wa_phone_number_id = k.phone_number_id;
  perform set_config('nx.sem_gatilho_canal', '', true);
  select c.org_id into v_org from public.nx_clientes c where c.id = p_cliente;
  perform public.nx_auditar(v_org, p_cliente, v.conta_id, 'canal_excluido',
                            jsonb_build_object('canal', k.id, 'phone_number_id', k.phone_number_id,
                                               'provedor', k.provedor));
  return json_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- nx_cv_base: cópia de 20260928e_conversas_b.sql (igual ao banco) + provedor/IA do canal e os campos novos da IA
-- ------------------------------------------------------------
create or replace function public.nx_cv_base(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  v_cfg jsonb;
  v_iacfg jsonb;
  v_ia boolean;
  v_config json;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  select coalesce(c.cfg -> 'cv', '{}'::jsonb),
         case when jsonb_typeof(c.cfg -> 'ia') = 'object' then c.cfg -> 'ia' else '{}'::jsonb end
    into v_cfg, v_iacfg
    from public.nx_clientes c where c.id = p_cliente;
  select coalesce(nullif(btrim(x.anthropic_api_key), ''), '') <> '' into v_ia from public.nx_config x where x.id = 1;
  if public.nx_rank(v.papel) >= 3 then
    v_config := json_build_object(
      'departamentos', coalesce((select json_agg(public.nx_cv_json_dep(d) order by d.ordem, d.nome)
                                   from public.nx_departamentos d where d.cliente_id = p_cliente), '[]'::json),
      'ia', json_build_object(
              'sobre', coalesce(v_iacfg ->> 'sobre', ''), 'servicos', coalesce(v_iacfg ->> 'servicos', ''),
              'horarios', coalesce(v_iacfg ->> 'horarios', ''), 'regras', coalesce(v_iacfg ->> 'regras', ''),
              'proibido', coalesce(v_iacfg ->> 'proibido', ''),
              'tom', case when v_iacfg ->> 'tom' = 'formal' then 'formal' else 'proximo' end,
              'assistente_nome', coalesce(v_iacfg ->> 'assistente_nome', ''),
              'endereco', coalesce(v_iacfg ->> 'endereco', ''),
              'boas_vindas', coalesce(v_iacfg ->> 'boas_vindas', '')));
  end if;
  return json_build_object(
    'eu', json_build_object('id', v.conta_id, 'nome', v.nome, 'papel', v.papel,
                            'departamentos', to_json(v.departamentos), 'ver_todas', v.ver_todas),
    'canais', coalesce((select json_agg(json_build_object(
                 'id', k.id, 'nome', k.nome, 'numero_exibicao', k.numero_exibicao, 'status', k.status,
                 'coexistencia', k.coexistencia,
                 'tem_token', case when k.provedor = 'codewords'
                                   then k.codewords_api_segredo is not null and k.codewords_phone_id is not null
                                   else k.token_segredo is not null end,
                 'provedor', k.provedor,
                 'ia_ligada', case when k.provedor = 'codewords' then k.ia_ligada end,
                 'ia_rota', case when k.provedor = 'codewords' then k.codewords_rota end,
                 'departamento_id', k.departamento_id, 'app_inscrito', k.app_inscrito,
                 'ultimo_erro', k.ultimo_erro) order by k.criado_em)
               from public.nx_canais k where k.cliente_id = p_cliente), '[]'::json),
    'departamentos', coalesce((select json_agg(json_build_object(
                 'id', d.id, 'nome', d.nome, 'cor', d.cor, 'padrao', d.padrao,
                 'distribuicao', d.distribuicao, 'ativo', d.ativo) order by d.ordem, d.nome)
               from public.nx_departamentos d where d.cliente_id = p_cliente and d.ativo), '[]'::json),
    'respostas', coalesce((select json_agg(json_build_object(
                 'id', r.id, 'atalho', r.atalho, 'titulo', r.titulo, 'corpo', r.corpo,
                 'departamento_id', r.departamento_id, 'usos', r.usos, 'ordem', r.ordem, 'ativo', r.ativo)
                 order by r.ordem, r.atalho)
               from public.nx_respostas r where r.cliente_id = p_cliente), '[]'::json),
    'etiquetas', coalesce((select json_agg(json_build_object('id', e.id, 'nome', e.nome, 'cor', e.cor)
                 order by lower(e.nome))
               from public.nx_etiquetas e where e.cliente_id = p_cliente), '[]'::json),
    'usuarios', coalesce((select json_agg(json_build_object(
                 'id', k.id, 'nome', k.nome, 'papel', a.papel, 'departamentos', to_json(a.departamentos),
                 'recebe_conversas', a.recebe_conversas, 'aprovado', k.aprovado) order by k.nome)
               from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
              where a.cliente_id = p_cliente), '[]'::json),
    'templates', coalesce((select json_agg(json_build_object(
                 'id', t.id, 'canal_id', t.canal_id, 'nome', t.nome, 'idioma', t.idioma,
                 'categoria', t.categoria, 'status', t.status, 'corpo', t.corpo,
                 'num_parametros', t.num_parametros) order by t.nome, t.idioma)
               from public.nx_templates t where t.cliente_id = p_cliente), '[]'::json),
    'cfg', json_build_object(
                 'recibo_leitura', coalesce((v_cfg ->> 'recibo_leitura')::boolean, true),
                 'assinatura', coalesce((v_cfg ->> 'assinatura')::boolean, false)),
    'ia', json_build_object('ligada', coalesce(v_ia, false),
                            'cota', json_build_object('usadas', public.nx_uso(p_cliente, 'ia_mes'),
                                                      'limite', public.nx_limite(p_cliente, 'ia_mes'))),
    'config', v_config);
end $$;

-- ------------------------------------------------------------
-- nx_cv_contexto_envio: cópia de 20260928f_funcoes.sql (igual ao banco) + provedor do canal (CodeWords não tem janela de 24 h nem token Meta)
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
-- nx_ia_config_salvar: cópia de 20260928e_conversas_b.sql (igual ao banco) + assistente_nome (≤ 40), endereco (≤ 300) e boas_vindas (≤ 500)
-- ------------------------------------------------------------
create or replace function public.nx_ia_config_salvar(p_token text, p_cliente uuid, p_ia jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  r jsonb := coalesce(p_ia, '{}'::jsonb);
  atual jsonb;
  novo jsonb;
  k text;
  v_soma int;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if jsonb_typeof(r) <> 'object' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'ia';
  end if;
  select case when jsonb_typeof(c.cfg -> 'ia') = 'object' then c.cfg -> 'ia' else '{}'::jsonb end
    into atual from public.nx_clientes c where c.id = p_cliente for update;
  novo := atual;
  foreach k in array array['sobre', 'servicos', 'horarios', 'regras', 'proibido'] loop
    if r ? k then
      if jsonb_typeof(r -> k) not in ('string', 'null') then
        raise exception 'dados_invalidos' using errcode = '22023', hint = k;
      end if;
      novo := novo || jsonb_build_object(k, btrim(coalesce(r ->> k, '')));
    end if;
  end loop;
  foreach k in array array['assistente_nome', 'endereco', 'boas_vindas'] loop
    if r ? k then
      if jsonb_typeof(r -> k) not in ('string', 'null')
         or char_length(btrim(coalesce(r ->> k, ''))) > (case k when 'assistente_nome' then 40 when 'endereco' then 300 else 500 end) then
        raise exception 'dados_invalidos' using errcode = '22023', hint = k;
      end if;
      novo := novo || jsonb_build_object(k, btrim(coalesce(r ->> k, '')));
    end if;
  end loop;
  if r ? 'tom' then
    if coalesce(r ->> 'tom', '') not in ('formal', 'proximo') then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'tom';
    end if;
    novo := novo || jsonb_build_object('tom', r ->> 'tom');
  end if;
  v_soma := coalesce(char_length(novo ->> 'sobre'), 0) + coalesce(char_length(novo ->> 'servicos'), 0)
          + coalesce(char_length(novo ->> 'horarios'), 0) + coalesce(char_length(novo ->> 'regras'), 0)
          + coalesce(char_length(novo ->> 'proibido'), 0);
  if v_soma > 15000 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'tamanho';
  end if;
  update public.nx_clientes set cfg = jsonb_set(coalesce(cfg, '{}'::jsonb), '{ia}', novo, true)
   where id = p_cliente;
  return json_build_object(
    'sobre', coalesce(novo ->> 'sobre', ''), 'servicos', coalesce(novo ->> 'servicos', ''),
    'horarios', coalesce(novo ->> 'horarios', ''), 'regras', coalesce(novo ->> 'regras', ''),
    'proibido', coalesce(novo ->> 'proibido', ''),
    'tom', case when novo ->> 'tom' = 'formal' then 'formal' else 'proximo' end,
    'assistente_nome', coalesce(novo ->> 'assistente_nome', ''), 'endereco', coalesce(novo ->> 'endereco', ''),
    'boas_vindas', coalesce(novo ->> 'boas_vindas', ''),
    'caracteres', v_soma);
end $$;

-- ------------------------------------------------------------
-- nx_disparar: cópia de 20260928f_funcoes.sql (igual ao banco) + 'nx-codewords' (sincronização de 2 em 2 min)
-- ------------------------------------------------------------
create or replace function public.nx_disparar(p_funcao text, p_corpo jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare cfg public.nx_config; v_id bigint;
begin
  if p_funcao is null or p_funcao not in ('nx-ciclo', 'nx-relatorio', 'nx-enviar', 'nx-codewords') then
    raise exception 'funcao_invalida';
  end if;
  select * into cfg from public.nx_config where id = 1;
  if cfg.funcoes_url is null then raise exception 'funcoes_url_nao_configurada'; end if;
  select net.http_post(
    url := cfg.funcoes_url || '/' || p_funcao,
    body := coalesce(p_corpo, '{}'::jsonb),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-nx-cron', cfg.cron_token),
    timeout_milliseconds := 120000
  ) into v_id;
  return v_id;
end $$;

-- ------------------------------------------------------------
-- nx_auto_acoes: cópia de 20260928h_automacoes.sql (igual ao banco) + enviar_mensagem (texto) também por canal CodeWords, sem janela de 24 h
-- ------------------------------------------------------------
create or replace function public.nx_auto_acoes(p_auto public.nx_automacoes, p_alvo jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c uuid := p_auto.cliente_id;
  v_alvo jsonb := coalesce(p_alvo, '{}'::jsonb);
  v_d jsonb; ac jsonb; i int := 0; v_tipo text; v_det text[] := '{}';
  v_neg bigint; v_ct bigint; v_cv bigint; v_conta uuid; v_id uuid; v_n int; v_quando timestamptz;
  v_txt text; v_titulo text; v_link text; v_ntipo text; v_nome text; v_funil uuid; v_novo bigint;
  v_pars jsonb; v_par text; v_raw text; v_ue timestamptz; v_canal uuid; v_fila bigint; v_optin boolean;
  e public.nx_estagios; t public.nx_templates;
  v_msg text; v_hint text; v_st text;
  v_conversa_primeiro boolean := p_auto.gatilho in ('conversa_nova', 'mensagem_recebida', 'sem_resposta');
begin
  for ac in select value from jsonb_array_elements(coalesce(p_auto.acoes, '[]'::jsonb)) loop
    i := i + 1;
    v_tipo := ac ->> 'tipo';
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
        if v_conta is not null and not exists (select 1 from public.nx_contas k where k.id = v_conta) then v_conta := null; end if;
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
          select * into e from public.nx_estagios s where s.id = public.nx_auto_uuid(ac ->> 'estagio_id') and s.cliente_id = v_c;
          if e.id is null then raise exception 'estagio_invalido' using errcode = '22023', hint = 'nao_encontrado'; end if;
          if (v_d #>> '{negocio,estagio_id}')::uuid = e.id then
            v_det := v_det || ('já estava em «' || e.nome || '»');
          else
            if e.tipo = 'ganho' and coalesce((v_d #>> '{negocio,valor}')::numeric, (v_d #>> '{negocio,valor_previsto}')::numeric) is null then
              raise exception 'valor_obrigatorio' using errcode = '22023';
            end if;
            -- mesmas datas que o CRM (nx_negocio_mover) e o painel clássico gravam: "agendada" carimba
            -- data_agenda (hoje, se vazia) e "fechou" carimba data_consulta — senão o nucleo.js conta o
            -- agendamento no dia da conversa e os números mudam conforme quem moveu
            update public.nx_leads l set
              estagio_id = e.id,
              ordem = -extract(epoch from clock_timestamp()),
              valor = case when e.tipo = 'ganho' then coalesce(l.valor, l.valor_previsto) else l.valor end,
              data_agenda = case when e.marco = 'agendada' then coalesce(l.data_agenda, (now() at time zone 'America/Sao_Paulo')::date) else l.data_agenda end,
              data_consulta = case when e.marco = 'fechou' then coalesce(l.data_consulta, (now() at time zone 'America/Sao_Paulo')::date) else l.data_consulta end,
              motivo_perda_txt = case when e.tipo = 'perdido' then coalesce(l.motivo_perda_txt, left('Automação «' || p_auto.nome || '»', 500)) else l.motivo_perda_txt end
             where l.id = v_neg and l.cliente_id = v_c;
            v_det := v_det || ('movido para «' || e.nome || '»');
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
        -- canal CodeWords (aparelho, 20260929a_codewords.sql): sem conversa aberta, abre uma no canal
        -- CodeWords do contato; lá não existe janela de 24 h nem modelo da Meta
        if v_ct is not null and v_canal is null and not coalesce((v_d #>> '{contato,bloqueado}')::boolean, false) then
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
        elsif v_cv is null or v_canal is null then
          v_det := v_det || 'mensagem: pulada (sem conversa aberta)'::text;
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

      -- -------------------------------------------------- notificar
      when 'notificar' then
        v_conta := case ac ->> 'para'
          when 'responsavel' then coalesce((v_d #>> '{negocio,dono_id}')::uuid, (v_d #>> '{conversa,atribuida_a}')::uuid, (v_d #>> '{contato,dono_id}')::uuid)
          when 'admins' then null
          else public.nx_auto_uuid(ac ->> 'para') end;
        v_ntipo := case p_auto.gatilho when 'sem_resposta' then 'sem_resposta' when 'tarefa_vencida' then 'tarefa' else 'automacao' end;
        v_link := case
          when v_conversa_primeiro and v_cv is not null then '#/conversas/' || v_cv
          when v_neg is not null then '#/crm/negocio/' || v_neg
          when v_cv is not null then '#/conversas/' || v_cv
          when v_ct is not null then '#/contatos/' || v_ct
          when p_auto.gatilho = 'tarefa_vencida' then '#/tarefas' end;
        v_titulo := left(coalesce(nullif(btrim(public.nx_auto_texto(ac ->> 'titulo', v_d)), ''), p_auto.nome), 120);
        v_txt := nullif(left(btrim(public.nx_auto_texto(ac ->> 'texto', v_d)), 500), '');
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
        -- execuções ok desta automação na última hora que não pularam o alerta (o detalhe pode vir cortado)
        if (select count(*) from public.nx_auto_execucoes x
             where x.automacao_id = p_auto.id and x.criado_em > now() - interval '1 hour' and x.ok
               and x.detalhe not like '%alerta: pulado%' and x.detalhe <> 'Condições não atendidas — nada feito.') >= 20 then
          v_det := v_det || 'alerta: pulado (limite de 20 por hora desta automação)'::text;
        else
          v_txt := left(btrim(public.nx_auto_texto(ac ->> 'texto', v_d)), 1000);
          perform public.nx_disparar('nx-enviar', jsonb_build_object('alerta', jsonb_build_object('cliente', v_c, 'texto', v_txt)));
          v_det := v_det || 'alerta pedido ao WhatsApp do gestor'::text;
        end if;

      else
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'ação desconhecida';
      end case;
    exception when others then
      get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint, v_st = returned_sqlstate;
      raise exception using message = v_msg, hint = coalesce(v_hint, ''), detail = 'acao:' || i || ':' || coalesce(v_tipo, '?'), errcode = v_st;
    end;
  end loop;
  return array_to_string(v_det, ' · ');
end $$;

-- ------------------------------------------------------------
-- 9. Permissões: painel → anon/authenticated/service_role; o resto só service_role
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'nx_codewords_canal_salvar', 'nx_cv_ia_estado', 'nx_cv_ia_pausar', 'nx_cv_ia_devolver',
         'nx_canal_salvar', 'nx_canal_excluir', 'nx_cv_base', 'nx_ia_config_salvar',
         'nx_codewords_e164', 'nx_codewords_url', 'nx_canal_json', 'nx_codewords_canal_contato', 'nx_codewords_alvo',
         'nx_codewords_pausar', 'nx_cv_ia_json', 'nx_cv_ia_pausa_auto', 'nx_codewords_canal', 'nx_codewords_situacao',
         'nx_codewords_forma', 'nx_codewords_status_aplicar', 'nx_codewords_status', 'nx_codewords_dados',
         'nx_codewords_decidir', 'nx_codewords_saida', 'nx_codewords_humano', 'nx_codewords_nota',
         'nx_codewords_etapa', 'nx_codewords_origem', 'nx_codewords_sync_alvos', 'nx_codewords_sync_gravar',
         'nx_codewords_sync_chamar', 'nx_wa_canal', 'nx_canal_credencial', 'nx_cv_contexto_envio',
         'nx_disparar', 'nx_auto_acoes')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    if r.proname in ('nx_codewords_canal_salvar', 'nx_cv_ia_estado', 'nx_cv_ia_pausar', 'nx_cv_ia_devolver',
                     'nx_canal_salvar', 'nx_canal_excluir', 'nx_cv_base', 'nx_ia_config_salvar') then
      execute format('grant execute on function %s to anon, authenticated, service_role', r.fn);
    else
      execute format('grant execute on function %s to service_role', r.fn);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 10. Agendamento (idempotente): sincronização de 2 em 2 minutos
-- ------------------------------------------------------------
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'nx-codewords-sync' loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('nx-codewords-sync', '*/2 * * * *', 'select public.nx_codewords_sync_chamar()');
end $$;

notify pgrst, 'reload schema';
