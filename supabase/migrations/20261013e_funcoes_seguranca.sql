-- ============================================================
-- ÓRBITA — 20261013e_funcoes_seguranca.sql · plano «1000+ melhorias» de 13/10/2026 · frente srv, lote srv-3, migração e
-- O banco das funções novas (nx-midia, nx-whatsapp, nx-codewords, nx-enviar, nx-ia, nx-ciclo) e a segurança de sessão/login.
-- ADITIVA e idempotente: colunas/tabela com if not exists, funções NOVAS com permissões explícitas, cópias na MESMA assinatura
-- (definição EM VIGOR citada em cada bloco + o marcado «plano 1000»). Nenhum dado de produção muda na aplicação.
-- As funções toleram o banco SEM esta migração (detecção por 404 / funcaoAusente) — a ordem de publicação é livre.
--   SV-057 nx_midia_apagada: mensagens do cliente com o arquivo apagado ficam midia.estado = 'apagada' (sem path)
--   SV-056 nx_midia_referenciadas: quais uploads de out/ viraram mensagem (a faxina de órfãos apaga só o resto)
--   SV-006 nx_canal_qualidade + nx_canais.meta_qualidade: queda de qualidade/limite/conta do número Meta, aviso 1×/dia/evento
--   SV-012 nx_canal_contar + nx_canais.meta_contadores: contadores do dia por número Meta (mensagens, duplicadas, recibos, 503…)
--   SV-268/SV-208 nx_codewords_canal(p_chave, p_tipo): teto por minuto separado (mensagem × resto) e «suspenso» na resposta
--   SV-049 nx_cv_msg_reenvio_v2: «Reenviar» também mídia (arquivo ainda no Storage) e modelo
--   SV-067 nx_ia_cache (+ ler/gravar): o mesmo resumo sem mensagem nova volta do cache (30 min) sem gastar cota
--   SV-071 nx_ia_custo_alto + nx_config.ia_aviso_custo_usd: clientes cujo custo de IA de um dia passou do teto
--   SV-230 nx_auditar executável pela service_role (as funções auditam testar conexão, parear, inscrever, enviar teste)
--   SV-073 nx_config_salvar: modelo_ia só claude-* (o resto → dados_invalidos); grava ia_aviso_custo_usd
--   SV-140/SV-242 nx_disparar: só chama https://<ref>.supabase.co/functions/v1 (o cron_token não vai a outro domínio) e o
--          pg_net espera 155 s (a função pode rodar 150 s: o falso «timeout» sumia da saúde)
--   SV-123 nx_saas_faxina: reservas de IA vencidas > 7 d, contadores por minuto > 2 h/2 d, cache de IA > 1 d
--   SV-118 índice nx_leads(cliente_id, etapa) parcial para a janela do nx_dados/carregarModelo
--   SV-128 nx_sessoes_encerrar(p_token, p_todas): «Sair de todos os aparelhos» (a troca/redefinição de senha já derruba)
--   SV-129/SV-238/SV-239 nx_entrar: no máximo 20 sessões por conta; bloqueio por (conta, IP) com 10 falhas e por conta só com
--          50 (de vários IPs; aviso à própria conta); login certo zera as falhas da conta
-- Smoke: supabase/testes/30_funcoes_seguranca.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colunas e tabela novas
-- ------------------------------------------------------------
alter table public.nx_canais
  add column if not exists meta_contadores jsonb not null default '{}'::jsonb,   -- {dia, mensagens, duplicadas, recibos, …, anterior}
  add column if not exists meta_qualidade jsonb;                                  -- {tipo, evento, detalhe, em} do último aviso da Meta
alter table public.nx_config add column if not exists ia_aviso_custo_usd numeric(10, 2);   -- vazio = US$ 10 por cliente por dia

create table if not exists public.nx_ia_cache (
  chave text primary key check (char_length(chave) <= 200),
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  texto text not null check (char_length(texto) <= 4096),
  criado_em timestamptz not null default now()
);
create index if not exists nx_ia_cache_criado on public.nx_ia_cache (criado_em);
alter table public.nx_ia_cache enable row level security;
revoke all on table public.nx_ia_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.nx_ia_cache to service_role;

-- SV-118: «etapa in ('nova','agendada')» em OR com as datas (nx_dados e carregarModelo) — sem ele o OR varre o cliente inteiro
create index if not exists nx_leads_cli_etapa on public.nx_leads (cliente_id, etapa) where etapa in ('nova', 'agendada');

-- ------------------------------------------------------------
-- 2. SV-057 mídia apagada pelo painel · SV-056 uploads referenciados (internas: só service_role)
-- ------------------------------------------------------------
create or replace function public.nx_midia_apagada(p_cliente uuid, p_paths text[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  if p_cliente is null or p_paths is null or cardinality(p_paths) > 100
     or exists (select 1 from unnest(p_paths) p where p is null or p not like p_cliente::text || '/%') then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  update public.nx_mensagens m
     set midia = (m.midia - 'path') || jsonb_build_object('estado', 'apagada', 'apagada_em', now()),
         atualizado_em = now()   -- o delta da conversa aberta leva a bolha nova
   where m.cliente_id = p_cliente and (m.midia ->> 'path') = any(p_paths);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.nx_midia_referenciadas(p_cliente uuid, p_paths text[])
returns json
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(json_agg(distinct m.midia ->> 'path'), '[]'::json)
    from public.nx_mensagens m
   where m.cliente_id = p_cliente and (m.midia ->> 'path') = any(coalesce(p_paths, '{}'::text[]))
     and cardinality(coalesce(p_paths, '{}'::text[])) <= 1000;
$$;

-- ------------------------------------------------------------
-- 3. SV-006 eventos do número Meta · SV-012 contadores por canal (internas: só service_role; o nx-whatsapp chama)
-- ------------------------------------------------------------
create or replace function public.nx_canal_qualidade(p_waba text, p_numero text, p_tipo text, p_evento text, p_detalhe text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev text := upper(btrim(coalesce(p_evento, '')));
  v_tipo text := case when p_tipo = 'conta' then 'conta' else 'qualidade' end;
  v_num text := nullif(regexp_replace(coalesce(p_numero, ''), '\D', '', 'g'), '');
  v_det text := left(nullif(btrim(coalesce(p_detalhe, '')), ''), 300);
  r record; v_n int := 0; v_av int := 0; v_tit text; v_txt text;
begin
  if nullif(btrim(coalesce(p_waba, '')), '') is null or v_ev !~ '^[A-Z_]{3,60}$' then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  v_tit := case v_ev when 'FLAGGED' then 'qualidade em queda (a Meta sinalizou o número)'
                     when 'UNFLAGGED' then 'qualidade normalizada'
                     when 'DOWNGRADE' then 'limite de conversas reduzido pela Meta'
                     when 'UPGRADE' then 'limite de conversas aumentado'
                     else case when v_tipo = 'conta' then 'a conta do WhatsApp mudou (' || lower(v_ev) || ')'
                               else 'qualidade mudou (' || lower(v_ev) || ')' end end;
  v_txt := case when v_ev in ('FLAGGED', 'DOWNGRADE') or v_ev like '%VIOLATION%' or v_ev like '%DISABLE%' or v_ev like '%BAN%'
                  then 'Risco de bloqueio: reduza envios em massa e confira modelos e reclamações no Gerenciador do WhatsApp.'
                else 'Aviso da Meta sobre o número.' end || coalesce(' Detalhe: ' || v_det || '.', '');
  for r in select k.id, k.cliente_id, k.nome, k.meta_qualidade from public.nx_canais k
            where k.waba_id = btrim(p_waba) and k.provedor = 'meta'
              and (v_num is null or k.numero_exibicao is null or regexp_replace(k.numero_exibicao, '\D', '', 'g') = v_num)
  loop
    v_n := v_n + 1;
    update public.nx_canais set meta_qualidade = jsonb_strip_nulls(jsonb_build_object('tipo', v_tipo, 'evento', v_ev, 'detalhe', v_det, 'em', now()))
     where id = r.id;
    -- aviso aos admins do cliente: uma vez por dia por evento (a Meta repete o mesmo evento)
    if r.meta_qualidade is null or (r.meta_qualidade ->> 'evento') is distinct from v_ev
       or (r.meta_qualidade ->> 'em')::timestamptz < now() - interval '1 day' then
      perform public.nx_notificar(r.cliente_id, null, 'sistema', left(coalesce(r.nome, 'Número') || ': ' || v_tit, 120), left(v_txt, 500), '#/config/numeros');
      v_av := v_av + 1;
    end if;
  end loop;
  return json_build_object('ok', true, 'canais', v_n, 'avisados', v_av);
end $$;

create or replace function public.nx_canal_contar(p_canal uuid, p_cont jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dia text := to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD');
  v jsonb; k text; n int;
begin
  if p_canal is null or jsonb_typeof(p_cont) is distinct from 'object' then raise exception 'dados_invalidos' using errcode = '22023'; end if;
  select coalesce(c.meta_contadores, '{}'::jsonb) into v from public.nx_canais c where c.id = p_canal and c.provedor = 'meta' for update;
  if not found then raise exception 'canal_nao_encontrado' using errcode = '22023'; end if;
  -- virou o dia (São Paulo): o dia anterior fica em «anterior» e a contagem recomeça
  if coalesce(v ->> 'dia', '') <> v_dia then
    v := jsonb_build_object('dia', v_dia) || case when v ? 'dia' then jsonb_build_object('anterior', v - 'anterior') else '{}'::jsonb end;
  end if;
  for k in select x from jsonb_object_keys(p_cont) x loop
    continue when k not in ('mensagens', 'duplicadas', 'recibos', 'bloqueados', 'reacoes', 'divergentes', 'retry_503');
    n := case when jsonb_typeof(p_cont -> k) = 'number' then least(greatest(floor((p_cont ->> k)::numeric)::int, 0), 100000) else 0 end;
    if n > 0 then v := v || jsonb_build_object(k, coalesce((v ->> k)::int, 0) + n); end if;
  end loop;
  update public.nx_canais set meta_contadores = v where id = p_canal;
  return json_build_object('ok', true, 'contadores', v);
end $$;

-- ------------------------------------------------------------
-- 4. SV-268/SV-208 nx_codewords_canal com o tipo da chamada — SOBRECARGA NOVA (p_chave, p_tipo), sem default; a de 1 argumento
--    (20260929a) continua para quem não manda o tipo. Mesma resposta + tipo + suspenso.
--    'mensagem': o teto de 240/min de sempre (nx_codewords_taxa) · o resto (recibos, contexto, horários, status): 1.200/min à parte
--    (nx_taxa 'cw-outros:<canal>') — recibo nunca mais consome a vez da mensagem real.
-- ------------------------------------------------------------
create or replace function public.nx_codewords_canal(p_chave text, p_tipo text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare k public.nx_canais; v_min timestamptz := date_trunc('minute', now()); v_n int; v_exc boolean; v_susp boolean;
  v_tipo text := case when p_tipo = 'mensagem' then 'mensagem' else 'outro' end;
begin
  if p_chave is null or p_chave !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into k from public.nx_canais
   where codewords_hook_hash = encode(extensions.digest(p_chave, 'sha256'), 'hex') and provedor = 'codewords';
  if k.id is null then return null; end if;
  if v_tipo = 'mensagem' then
    insert into public.nx_codewords_taxa as t (canal_id, minuto, n) values (k.id, v_min, 1)
    on conflict (canal_id, minuto) do update set n = t.n + 1
    returning t.n into v_n;
    if v_n = 1 then
      delete from public.nx_codewords_taxa where canal_id = k.id and minuto < v_min - interval '1 hour';
    end if;
    v_exc := v_n > 240;
  else
    perform public.nx_taxa_somar('cw-outros:' || k.id::text);
    v_n := public.nx_taxa_contar('cw-outros:' || k.id::text, 60);
    v_exc := v_n > 1200;
  end if;
  -- cliente suspenso/cancelado (ou organização parada): a mensagem é gravada, a IA do fluxo não responde
  select coalesce(c.status, 'ativo') in ('suspenso', 'cancelado') or not coalesce(c.ativo, true)
         or exists (select 1 from public.nx_orgs o where o.id = c.org_id and o.status in ('suspenso', 'cancelado'))
    into v_susp from public.nx_clientes c where c.id = k.cliente_id;
  return json_build_object('canal_id', k.id, 'cliente_id', k.cliente_id, 'nome', k.nome,
    'numero', k.codewords_numero, 'rota', k.codewords_rota, 'ia_ligada', k.ia_ligada, 'status', k.status,
    'uso_minuto', v_n, 'excedido', v_exc, 'tipo', v_tipo, 'suspenso', coalesce(v_susp, false));
end $$;

-- ------------------------------------------------------------
-- 5. SV-049 reenvio de mídia e modelo (interna: só service_role; o nx-enviar chama com o ctx do nx_fn_ctx)
-- ------------------------------------------------------------
create or replace function public.nx_cv_msg_reenvio_v2(p_ctx jsonb, p_cliente uuid, p_mensagem bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := jsonb_populate_record(null::public.nx_ctx_t, coalesce(p_ctx, '{}'::jsonb));
  m public.nx_mensagens;
begin
  select * into m from public.nx_mensagens
   where id = p_mensagem and cliente_id = p_cliente and direcao = 'out' and status = 'falhou'
     and tipo in ('texto', 'imagem', 'audio', 'video', 'documento', 'template');
  if m.id is null or not public.nx_cv_visivel(v, p_cliente, m.conversa_id)
     or (m.tipo in ('imagem', 'audio', 'video', 'documento') and nullif(m.midia ->> 'path', '') is null)
     or (m.tipo = 'template' and nullif(m.template ->> 'id', '') is null) then
    raise exception 'mensagem_nao_encontrada' using errcode = '22023';
  end if;
  return json_build_object('conversa_id', m.conversa_id, 'tipo', m.tipo, 'corpo', m.corpo, 'responde_a_wamid', m.responde_a_wamid,
    'midia', case when m.tipo in ('imagem', 'audio', 'video', 'documento') then m.midia end,
    'template', case when m.tipo = 'template' then m.template end);
end $$;

-- ------------------------------------------------------------
-- 6. SV-067 cache do resumo da IA · SV-071 custo de IA fora do normal (internas: só service_role)
-- ------------------------------------------------------------
create or replace function public.nx_ia_cache_ler(p_chave text)
returns text
language sql stable
security definer
set search_path = ''
as $$
  select c.texto from public.nx_ia_cache c where c.chave = p_chave and c.criado_em > now() - interval '30 minutes';
$$;

create or replace function public.nx_ia_cache_gravar(p_chave text, p_cliente uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(coalesce(p_chave, '')), '') is null or p_cliente is null or nullif(p_texto, '') is null then return; end if;
  insert into public.nx_ia_cache as c (chave, cliente_id, texto, criado_em) values (left(p_chave, 200), p_cliente, left(p_texto, 4096), now())
  on conflict (chave) do update set texto = excluded.texto, criado_em = now(), cliente_id = excluded.cliente_id;
end $$;

-- clientes cujo custo de IA do dia p_dia (São Paulo) passou de p_teto US$ — [{cliente_id, slug, nome, custo_usd, chamadas}]
create or replace function public.nx_ia_custo_alto(p_dia date, p_teto numeric)
returns json
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(json_agg(x order by x.custo_usd desc), '[]'::json)
    from (select u.cliente_id, c.slug, c.nome, round(sum(u.custo_usd), 2) as custo_usd, count(*)::int as chamadas
            from public.nx_ia_uso u join public.nx_clientes c on c.id = u.cliente_id
           where u.criado_em >= (p_dia::timestamp at time zone 'America/Sao_Paulo')
             and u.criado_em < ((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo')
           group by u.cliente_id, c.slug, c.nome
          having sum(u.custo_usd) > greatest(coalesce(p_teto, 10), 0)
           order by sum(u.custo_usd) desc
           limit 50) x;
$$;

-- ------------------------------------------------------------
-- 7. SV-073 nx_config_salvar — cópia de 20261008b_operacao_seguranca
-- ------------------------------------------------------------

create or replace function public.nx_config_salvar(p_token text, p_cfg jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
declare c public.nx_contas := public.nx_exigir_gestor(p_token);
  v_apagadas text[] := '{}'::text[]; v_chaves text[];
begin
  if not public.nx_super(c) then raise exception 'so_plataforma' using errcode = '42501'; end if;
  if jsonb_typeof(p_cfg) is distinct from 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'cfg'; end if;
  -- plano 1000 (SV-073): só modelos claude-* (um erro de digitação fazia TODA chamada de IA dar 404); as funções ainda caem no
  -- padrão quando o modelo não tem preço conhecido
  if nullif(p_cfg->>'modelo_ia', '') is not null and p_cfg->>'modelo_ia' !~ '^claude-[a-z0-9.-]{2,60}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'modelo_ia';
  end if;
  -- plano 1000 (SV-071): teto do aviso de custo de IA por cliente/dia (US$ 0,01–10.000; vazio = padrão das funções)
  if nullif(p_cfg->>'ia_aviso_custo_usd', '') is not null
     and (p_cfg->>'ia_aviso_custo_usd' !~ '^\d{1,5}(\.\d{1,2})?$' or (p_cfg->>'ia_aviso_custo_usd')::numeric <= 0
          or (p_cfg->>'ia_aviso_custo_usd')::numeric > 10000) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'ia_aviso_custo_usd';
  end if;
  -- segredo: null EXPLÍCITO ("anthropic_api_key": null) apaga; '' ou chave ausente mantém o atual; valor troca
  if jsonb_typeof(p_cfg->'anthropic_api_key') = 'null' then v_apagadas := array_append(v_apagadas, 'anthropic_api_key'); end if;
  if jsonb_typeof(p_cfg->'wa_access_token') = 'null' then v_apagadas := array_append(v_apagadas, 'wa_access_token'); end if;
  if jsonb_typeof(p_cfg->'meta_app_secret') = 'null' then v_apagadas := array_append(v_apagadas, 'meta_app_secret'); end if;
  update public.nx_config set
    wa_access_token    = case when jsonb_typeof(p_cfg->'wa_access_token') = 'null' then null
                              else coalesce(nullif(p_cfg->>'wa_access_token', ''), wa_access_token) end,
    wa_phone_number_id = case when p_cfg ? 'wa_phone_number_id' then nullif(p_cfg->>'wa_phone_number_id', '') else wa_phone_number_id end,
    wa_template        = case when p_cfg ? 'wa_template' then nullif(p_cfg->>'wa_template', '') else wa_template end,
    meta_app_secret    = case when jsonb_typeof(p_cfg->'meta_app_secret') = 'null' then null
                              else coalesce(nullif(p_cfg->>'meta_app_secret', ''), meta_app_secret) end,
    anthropic_api_key  = case when jsonb_typeof(p_cfg->'anthropic_api_key') = 'null' then null
                              else coalesce(nullif(p_cfg->>'anthropic_api_key', ''), anthropic_api_key) end,
    modelo_ia          = coalesce(nullif(p_cfg->>'modelo_ia', ''), modelo_ia),
    painel_url         = case when p_cfg ? 'painel_url' then nullif(p_cfg->>'painel_url', '') else painel_url end,
    google_api_versao  = case when p_cfg ? 'google_api_versao' then nullif(p_cfg->>'google_api_versao', '') else google_api_versao end,
    saas_url           = case when p_cfg ? 'saas_url' then nullif(p_cfg->>'saas_url', '') else saas_url end,
    ia_aviso_custo_usd = case when p_cfg ? 'ia_aviso_custo_usd' then nullif(p_cfg->>'ia_aviso_custo_usd', '')::numeric else ia_aviso_custo_usd end,
    atualizado_em      = now()
  where id = 1;
  select array_agg(k order by k) into v_chaves from jsonb_object_keys(p_cfg) k;
  perform public.nx_auditar(c.org_id, null, c.id, case when cardinality(v_apagadas) > 0 then 'config_segredo_removido' else 'config_salva' end,
    jsonb_build_object('chaves', to_jsonb(coalesce(v_chaves, '{}'::text[])), 'apagadas', to_jsonb(v_apagadas)));
  return public.nx_config_ver(p_token);
end $function$;

-- ------------------------------------------------------------
-- 8. SV-140/SV-242 nx_disparar — cópia de 20261001a_automacoes_ia
-- ------------------------------------------------------------

create or replace function public.nx_disparar(p_funcao text, p_corpo jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare cfg public.nx_config; v_id bigint;
begin
  if p_funcao is null or p_funcao not in ('nx-ciclo', 'nx-relatorio', 'nx-enviar', 'nx-codewords', 'nx-ia') then
    raise exception 'funcao_invalida';
  end if;
  select * into cfg from public.nx_config where id = 1;
  if cfg.funcoes_url is null then raise exception 'funcoes_url_nao_configurada'; end if;
  -- plano 1000 (SV-140): o cron_token vai no cabeçalho — só para as Edge Functions do próprio projeto (quem trocasse a URL
  -- receberia o token)
  if cfg.funcoes_url !~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/?$'
     and cfg.funcoes_url !~ '^https://[a-z0-9]{20}\.functions\.supabase\.co/?$' then
    raise exception 'funcoes_url_invalida';
  end if;
  select net.http_post(
    url := rtrim(cfg.funcoes_url, '/') || '/' || p_funcao,
    body := coalesce(p_corpo, '{}'::jsonb),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-nx-cron', cfg.cron_token),
    timeout_milliseconds := 155000   -- plano 1000 (SV-242): a função pode rodar até 150 s
  ) into v_id;
  return v_id;
end $$;

-- ------------------------------------------------------------
-- 9. SV-123 nx_saas_faxina_lotes — cópia de 20261013c_operacao_indices
-- ------------------------------------------------------------

create or replace function public.nx_saas_faxina_lotes(p_tabela text, p_onde text, p_lote int default 10000, p_max_lotes int default 50)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_total int := 0; v_n int;
begin
  -- só as tabelas da faxina (o nome e o filtro vêm do código abaixo, nunca de fora)
  -- plano 1000 (SV-123): + os transitórios que ficaram de fora
  if p_tabela not in ('nx_eventos', 'nx_envios_fila', 'nx_notificacoes', 'nx_auto_execucoes', 'nx_rastreio', 'nx_travas', 'nx_execucoes',
                      'nx_ia_reservas', 'nx_codewords_taxa', 'nx_taxa', 'nx_ia_cache') then
    raise exception 'tabela_invalida';
  end if;
  for i in 1..greatest(1, least(coalesce(p_max_lotes, 50), 200)) loop
    execute format('delete from public.%I where ctid in (select ctid from public.%I where %s limit %s)',
                   p_tabela, p_tabela, p_onde, greatest(1, least(coalesce(p_lote, 10000), 50000)));
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    exit when v_n < greatest(1, least(coalesce(p_lote, 10000), 50000));
  end loop;
  return v_total;
end $$;

-- ------------------------------------------------------------
-- 9. SV-123 nx_saas_faxina — cópia de 20261013c_operacao_indices
-- ------------------------------------------------------------

create or replace function public.nx_saas_faxina()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_ev int; n_ex int; n_no int; n_fi int; n_cv int; n_sl int; n_ml int; n_etq int := 0; v_n int; v_lim int := 5000;
  n_ses int; n_req int; n_refs int; n_cwp int; n_login int;
  n_ras int; n_trv int; n_exe int; n_http int := null; n_pri int;
  n_res int; n_cwt int; n_tax int; n_iac int;
begin
  -- plano 1000 (SV-124): os quatro maiores em lotes
  n_ev := public.nx_saas_faxina_lotes('nx_eventos', $w$processado_em is not null and processado_em < now() - interval '7 days'$w$);
  n_ex := public.nx_saas_faxina_lotes('nx_auto_execucoes', $w$criado_em < now() - interval '60 days'$w$);
  -- notificações LIDAS há mais de 90 dias (as não lidas ficam)
  n_no := public.nx_saas_faxina_lotes('nx_notificacoes', $w$lida_em is not null and criado_em < now() - interval '90 days'$w$);
  n_fi := public.nx_saas_faxina_lotes('nx_envios_fila',
            $w$status in ('enviado', 'falhou', 'pulado', 'cancelado') and coalesce(processado_em, criado_em) < now() - interval '30 days'$w$);
  delete from public.nx_convites where expira_em < now() - interval '30 days';
  get diagnostics n_cv = row_count;
  delete from public.nx_senha_links where expira_em < now() - interval '30 days';
  get diagnostics n_sl = row_count;
  delete from public.nx_midia_lixo where apagado_em is not null and apagado_em < now() - interval '30 days';
  get diagnostics n_ml = row_count;
  -- transitórios novos: sessão vencida há mais de 1 dia, chaves de idempotência (24 h) > 7 d, refs de envio > 7 d,
  -- recibos pendentes do CodeWords vencidos, falhas de login > 1 d
  delete from public.nx_sessoes where expira_em < now() - interval '1 day';
  get diagnostics n_ses = row_count;
  delete from public.nx_requisicoes where criado_em < now() - interval '7 days';
  get diagnostics n_req = row_count;
  delete from public.nx_envio_refs where criado_em < now() - interval '7 days';
  get diagnostics n_refs = row_count;
  delete from public.nx_codewords_status_pendentes where expira_em < now();
  get diagnostics n_cwp = row_count;
  delete from public.nx_login_falhas where em < now() - interval '1 day';
  get diagnostics n_login = row_count;
  -- plano 1000: o que saiu do caminho quente (SV-109 rastreio, SV-122 travas) e o que só a faxina comentada fazia
  n_ras := public.nx_saas_faxina_lotes('nx_rastreio', $w$criado_em < now() - interval '45 days'$w$);
  n_trv := public.nx_saas_faxina_lotes('nx_travas', $w$ate < now() - interval '1 day'$w$);
  n_exe := public.nx_saas_faxina_lotes('nx_execucoes', $w$inicio < now() - interval '60 days'$w$);
  begin
    execute $q$delete from net._http_response where created < now() - interval '3 days'$q$;
    get diagnostics n_http = row_count;
  exception when others then n_http := null;   -- sem pg_net (ambiente local) ou sem permissão: segue
  end;
  -- plano 1000 (SV-123): reservas de IA vencidas há > 7 d, contador por minuto do aparelho > 2 h, contadores nx_taxa > 2 d (as
  -- chaves por IP do rastreio não voltam) e o cache de resumo da IA > 1 d
  n_res := public.nx_saas_faxina_lotes('nx_ia_reservas', $w$expira_em < now() - interval '7 days'$w$);
  n_cwt := public.nx_saas_faxina_lotes('nx_codewords_taxa', $w$minuto < now() - interval '2 hours'$w$);
  n_tax := public.nx_saas_faxina_lotes('nx_taxa', $w$minuto < now() - interval '2 days'$w$);
  n_iac := public.nx_saas_faxina_lotes('nx_ia_cache', $w$criado_em < now() - interval '1 day'$w$);
  -- SV-116: preenche a 1ª entrada das conversas antigas aos poucos
  n_pri := public.nx_conversas_primeira_preencher(20000);

  -- ids de etiqueta órfãos (etiqueta excluída) — até 5.000 linhas no total
  with orf as (
    select k.id from public.nx_contatos k
     where k.etiquetas <> '{}'
       and exists (select 1 from unnest(k.etiquetas) z where not exists (select 1 from public.nx_etiquetas t where t.id = z))
     limit v_lim)
  update public.nx_contatos k
     set etiquetas = array(select z from unnest(k.etiquetas) z where exists (select 1 from public.nx_etiquetas t where t.id = z))
    from orf where k.id = orf.id;
  get diagnostics v_n = row_count; n_etq := n_etq + v_n; v_lim := greatest(v_lim - v_n, 0);
  if v_lim > 0 then
    with orf as (
      select l.id from public.nx_leads l
       where l.etiquetas <> '{}'
         and exists (select 1 from unnest(l.etiquetas) z where not exists (select 1 from public.nx_etiquetas t where t.id = z))
       limit v_lim)
    update public.nx_leads l
       set etiquetas = array(select z from unnest(l.etiquetas) z where exists (select 1 from public.nx_etiquetas t where t.id = z))
      from orf where l.id = orf.id;
    get diagnostics v_n = row_count; n_etq := n_etq + v_n; v_lim := greatest(v_lim - v_n, 0);
  end if;
  if v_lim > 0 then
    with orf as (
      select cv.id from public.nx_conversas cv
       where cv.etiquetas <> '{}'
         and exists (select 1 from unnest(cv.etiquetas) z where not exists (select 1 from public.nx_etiquetas t where t.id = z))
       limit v_lim)
    update public.nx_conversas cv
       set etiquetas = array(select z from unnest(cv.etiquetas) z where exists (select 1 from public.nx_etiquetas t where t.id = z))
      from orf where cv.id = orf.id;
    get diagnostics v_n = row_count; n_etq := n_etq + v_n;
  end if;

  -- histórico do pg_cron de TODOS os jobs (o de 15 s gera ~5.800 linhas/dia; o do CodeWords, a cada 2 min, ~720)
  begin
    delete from cron.job_run_details where end_time < now() - interval '3 days';
  exception when others then null;
  end;

  return json_build_object('eventos', n_ev, 'execucoes', n_ex, 'notificacoes', n_no, 'fila', n_fi, 'convites', n_cv,
                           'senha_links', n_sl, 'midia_lixo', n_ml, 'etiquetas_orfas', n_etq,
                           'sessoes', n_ses, 'requisicoes', n_req, 'envio_refs', n_refs, 'codewords_status_pendentes', n_cwp,
                           'login_falhas', n_login,
                           'rastreio', n_ras, 'travas', n_trv, 'execucoes_tarefas', n_exe, 'http_respostas', n_http,
                           'primeira_entrada', n_pri,
                           'ia_reservas', n_res, 'codewords_taxa', n_cwt, 'taxa', n_tax, 'ia_cache', n_iac);
end $$;

-- ------------------------------------------------------------
-- 10. SV-128 nx_sessoes_encerrar — «Sair de todos os aparelhos» (p_todas true: todas MENOS esta; false: só esta, como nx_sair).
--     RPC do painel por token de conta (nx_conta_do_token): anon executa, authenticated não.
-- ------------------------------------------------------------
create or replace function public.nx_sessoes_encerrar(p_token text, p_todas boolean default true)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare c public.nx_contas := public.nx_conta_do_token(p_token); v_n int;
begin
  if coalesce(p_todas, true) then
    delete from public.nx_sessoes where conta_id = c.id and token_hash <> public.nx_hash(p_token);
  else
    delete from public.nx_sessoes where token_hash = public.nx_hash(p_token);
  end if;
  get diagnostics v_n = row_count;
  perform public.nx_auditar(c.org_id, null, c.id, 'sessoes_encerradas', jsonb_build_object('todas', coalesce(p_todas, true), 'n', v_n));
  return json_build_object('ok', true, 'encerradas', v_n);
end $$;

-- ------------------------------------------------------------
-- 11. SV-129/SV-238/SV-239 nx_entrar — cópia de 20261008b_operacao_seguranca
-- ------------------------------------------------------------

create or replace function public.nx_entrar(p_email text, p_senha text)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
declare
  c public.nx_contas; v_token text;
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
      return json_build_object('code', 'P0001', 'message', 'credenciais_invalidas', 'details', null, 'hint', null);
    end if;
    raise exception 'credenciais_invalidas';
  end if;
  if not c.aprovado then raise exception 'conta_pendente'; end if;
  -- plano 1000 (SV-239): login certo zera as falhas desta conta (as do IP ficam: outra conta não «limpa» um IP que tenta senhas)
  delete from public.nx_login_falhas where chave = 'conta:' || v_email or (v_ip is not null and chave = 'contaip:' || v_email || '|' || v_ip);
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(v_token), c.id, now() + interval '30 days');
  -- plano 1000 (SV-129): no máximo 20 sessões por conta (login em laço criava linhas válidas por 30 dias sem fim) — saem as mais antigas
  delete from public.nx_sessoes s where s.conta_id = c.id and s.token_hash in (
    select y.token_hash from public.nx_sessoes y where y.conta_id = c.id
    order by (y.token_hash = public.nx_hash(v_token)) desc, y.criado_em desc, y.token_hash offset 20);
  return json_build_object('token', v_token, 'nome', c.nome, 'papel', c.papel);
end $function$;

-- ------------------------------------------------------------
-- 12. Permissões: as funções novas só para a service_role (a nx_sessoes_encerrar, do painel, também para anon); as cópias
--     mantêm as da origem. SV-230: nx_auditar explicitamente executável pela service_role (as funções auditam).
-- ------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.nx_midia_apagada(uuid,text[])', 'public.nx_midia_referenciadas(uuid,text[])',
                           'public.nx_canal_qualidade(text,text,text,text,text)', 'public.nx_canal_contar(uuid,jsonb)',
                           'public.nx_codewords_canal(text,text)', 'public.nx_cv_msg_reenvio_v2(jsonb,uuid,bigint)',
                           'public.nx_ia_cache_ler(text)', 'public.nx_ia_cache_gravar(text,uuid,text)', 'public.nx_ia_custo_alto(date,numeric)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  revoke all on function public.nx_sessoes_encerrar(text, boolean) from public, authenticated;
  grant execute on function public.nx_sessoes_encerrar(text, boolean) to anon, service_role;
  grant execute on function public.nx_auditar(uuid, uuid, uuid, text, jsonb) to service_role;
  raise notice 'nx_revogar_authenticated: % funções', public.nx_revogar_authenticated();
end $$;

insert into public.nx_versao_banco (nome) values ('20261013e_funcoes_seguranca')
on conflict (nome) do update set aplicada_em = now();

notify pgrst, 'reload schema';
