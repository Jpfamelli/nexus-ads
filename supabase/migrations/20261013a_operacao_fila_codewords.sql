-- ============================================================
-- ÓRBITA — 20261013a_operacao_fila_codewords.sql · plano «1000+ melhorias» de 13/10/2026 · frente srv, lote srv-1, migração a
-- Operação: fila de envios, aparelho do CodeWords, mídia recebida presa, cron por cliente, segunda chance dos relatórios,
-- modelos (templates) pela Meta, freio de ritmo. ADITIVA e idempotente: tabelas/colunas/índices com if not exists; funções
-- existentes com create or replace na MESMA assinatura (cópia da definição em vigor + o marcado «plano 1000»); funções novas
-- só para a service_role; nenhum dado de produção muda (os crons são reagendados pelo nome, como em 20260929a/20261001b).
--
--   SV-040 nx_fila_concluir só mexe em item 'enviando' (um concluir atrasado não ressuscita item já dado como STATUS INCERTO)
--   SV-042 nx_fila_pegar reveza entre clientes (row_number por cliente) — 2.000 itens de uma lista não atrasam os outros
--   SV-207 nx_fila_pegar cancela (erro claro) item de cliente não apto (suspenso, teste vencido, org suspensa, sem o módulo)
--   SV-026 nx_codewords_envio_vez (≥ 4 s entre envios, ≤ 30/min, ≤ 300/h por aparelho) + nx_fila_adiar (sem gastar tentativa)
--   SV-045 nx_taxa + nx_taxa_usar (contador por minuto, genérico, só service_role) — teto de avisos de automação por dia
--   SV-047 nx_envio_vez (30/min e 600/h por conta no nx-enviar)
--   SV-007 nx_midia_presas (mídia recebida presa em «baixando» entre 5 min e 7 dias) + índice parcial
--   SV-016 nx_codewords_sync_chamar dispara também quando há alvo do vigia (canal caído sem conversa recente)
--   SV-017/038 nx_codewords_vigia_alvos: canal caído COM conversa recente também entra; devolve ja_conectou, numero_conferido
--          e inscricao (o vigia avisa número trocado/destino errado e cala o pareamento abandonado)
--   SV-209 nx_codewords_sync_alvos reveza entre canais (uma conversa de cada canal por vez até o limite)
--   SV-024 nx_codewords_status_lote (recibo com N ids numa transação)
--   SV-041 índice parcial nx_mensagens_ambiguas (varredura de saídas Meta em dúvida)
--   SV-078 nx_ciclo_chamar (um disparo do nx-ciclo por cliente apto) e o cron 'nx-ciclo' passa a chamá-la
--   SV-092 crons de segunda chance: diário 13:00 UTC; mensal dia 1 15:00 UTC e dia 2 12:00 UTC (o «já enviado» evita dobrar)
--   SV-091 nx_relatorios.enviando_em (reserva antes do envio)
--   SV-084 nx_alertas.tentativas_envio (o radar reenvia o alerta que não saiu)
--   SV-005 nx_template_status (a Meta avisa aprovação/reprovação/pausa do modelo pelo webhook)
-- Smoke: supabase/testes/26_operacao_fila_codewords.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colunas e índices
-- ------------------------------------------------------------
alter table public.nx_relatorios add column if not exists enviando_em timestamptz;
alter table public.nx_alertas add column if not exists tentativas_envio int not null default 0;

create index if not exists nx_mensagens_ambiguas on public.nx_mensagens (criado_em)
  where direcao = 'out' and status = 'pendente' and wamid is null;
create index if not exists nx_mensagens_midia_baixando on public.nx_mensagens (criado_em)
  where direcao = 'in' and (midia ->> 'estado') = 'baixando';

-- ------------------------------------------------------------
-- 2. Contador por minuto (SV-045, SV-047, SV-026) e ritmo do aparelho
-- ------------------------------------------------------------
create table if not exists public.nx_taxa (
  chave text not null check (char_length(chave) <= 200),
  minuto timestamptz not null,
  n int not null default 0,
  primary key (chave, minuto)
);
create index if not exists nx_taxa_minuto on public.nx_taxa (minuto);
create table if not exists public.nx_codewords_ritmo (
  canal_id uuid primary key references public.nx_canais(id) on delete cascade,
  ultimo_em timestamptz not null
);
do $$
declare t text;
begin
  foreach t in array array['nx_taxa', 'nx_codewords_ritmo'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;

-- soma da janela (interna)
create or replace function public.nx_taxa_contar(p_chave text, p_janela_s int)
returns int
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(sum(t.n), 0)::int from public.nx_taxa t
   where t.chave = p_chave and t.minuto > now() - make_interval(secs => greatest(1, coalesce(p_janela_s, 60)));
$$;

-- +1 no minuto atual e faxina da chave (interna)
create or replace function public.nx_taxa_somar(p_chave text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.nx_taxa as t (chave, minuto, n) values (p_chave, date_trunc('minute', now()), 1)
  on conflict (chave, minuto) do update set n = t.n + 1;
  delete from public.nx_taxa t where t.chave = p_chave and t.minuto < now() - interval '2 days';
  -- faxina geral de vez em quando (chaves por IP do rastreio não voltam a ser usadas)
  if random() < 0.01 then delete from public.nx_taxa t where t.minuto < now() - interval '2 days'; end if;
end $$;

-- Usa uma vez da cota «p_limite por p_janela_s segundos» da chave: {ok:true, n} ou {ok:false, n} (nada é somado).
create or replace function public.nx_taxa_usar(p_chave text, p_limite int, p_janela_s int)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  if nullif(btrim(coalesce(p_chave, '')), '') is null or char_length(p_chave) > 200 or coalesce(p_limite, 0) < 1 then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nx_taxa:' || p_chave, 0));
  v_n := public.nx_taxa_contar(p_chave, p_janela_s);
  if v_n >= p_limite then return json_build_object('ok', false, 'n', v_n); end if;
  perform public.nx_taxa_somar(p_chave);
  return json_build_object('ok', true, 'n', v_n + 1);
end $$;

-- SV-047: limite de envios por conta no nx-enviar (30 por minuto e 600 por hora)
create or replace function public.nx_envio_vez(p_conta uuid, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v_chave text; v_min int; v_hora int;
begin
  if p_conta is null or p_cliente is null then raise exception 'dados_invalidos' using errcode = '22023'; end if;
  v_chave := 'envio:' || p_conta::text;
  perform pg_advisory_xact_lock(hashtextextended('nx_taxa:' || v_chave, 0));
  v_min := public.nx_taxa_contar(v_chave, 60);
  v_hora := public.nx_taxa_contar(v_chave, 3600);
  if v_min >= 30 or v_hora >= 600 then
    return json_build_object('ok', false, 'erro', 'limite_taxa', 'minuto', v_min, 'hora', v_hora);
  end if;
  perform public.nx_taxa_somar(v_chave);
  return json_build_object('ok', true);
end $$;

-- SV-026: ritmo do aparelho (CodeWords). {ok:true} = pode enviar agora (a vez fica gravada); {ok:false, vez} = quando pode.
create or replace function public.nx_codewords_envio_vez(p_canal uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v_ult timestamptz; v_chave text := 'cw:' || p_canal::text; v_min int; v_hora int; v_vez timestamptz;
begin
  if not exists (select 1 from public.nx_canais k where k.id = p_canal and k.provedor = 'codewords') then
    raise exception 'canal_nao_encontrado' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nx_cw_ritmo:' || p_canal::text, 0));
  select r.ultimo_em into v_ult from public.nx_codewords_ritmo r where r.canal_id = p_canal;
  if v_ult is not null and v_ult > clock_timestamp() - interval '4 seconds' then
    return json_build_object('ok', false, 'vez', v_ult + interval '4 seconds', 'motivo', 'intervalo');
  end if;
  v_min := public.nx_taxa_contar(v_chave, 60);
  if v_min >= 30 then
    select min(t.minuto) + interval '61 seconds' into v_vez from public.nx_taxa t where t.chave = v_chave and t.minuto > now() - interval '60 seconds';
    return json_build_object('ok', false, 'vez', greatest(coalesce(v_vez, now() + interval '1 minute'), now() + interval '4 seconds'), 'motivo', 'minuto');
  end if;
  v_hora := public.nx_taxa_contar(v_chave, 3600);
  if v_hora >= 300 then
    select min(t.minuto) + interval '1 hour 1 minute' into v_vez from public.nx_taxa t where t.chave = v_chave and t.minuto > now() - interval '1 hour';
    return json_build_object('ok', false, 'vez', greatest(coalesce(v_vez, now() + interval '10 minutes'), now() + interval '4 seconds'), 'motivo', 'hora');
  end if;
  insert into public.nx_codewords_ritmo as r (canal_id, ultimo_em) values (p_canal, clock_timestamp())
  on conflict (canal_id) do update set ultimo_em = excluded.ultimo_em;
  perform public.nx_taxa_somar(v_chave);
  return json_build_object('ok', true);
end $$;

-- SV-026: devolve o item 'enviando' para a fila em p_ate SEM gastar a tentativa (o ritmo não é falha)
create or replace function public.nx_fila_adiar(p_id bigint, p_ate timestamptz)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  update public.nx_envios_fila f set
    status = 'pendente', enviar_em = greatest(coalesce(p_ate, now()), now()),
    tentativas = greatest(f.tentativas - 1, 0), pego_em = null, lote = null, processado_em = null
  where f.id = p_id and f.status = 'enviando';
  get diagnostics v_n = row_count;
  return json_build_object('ok', v_n = 1);
end $$;

-- ------------------------------------------------------------
-- 3. SV-040 nx_fila_concluir: cópia de 20261008b + «and status = 'enviando'» nos dois ramos
-- ------------------------------------------------------------
create or replace function public.nx_fila_concluir(p_id bigint, p_status text, p_erro text, p_mensagem bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  if p_status not in ('enviado', 'falhou', 'pulado', 'cancelado', 'pendente') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'status';
  end if;
  if p_status = 'pendente' then
    -- credencial indisponível / sem tempo: volta para a fila DEPOIS (antes voltava imediato, gastava tentativa a cada rodada
    -- do cron e mantinha lote/pego_em antigos, o que confundia a detecção de item preso)
    update public.nx_envios_fila f set
      status = 'pendente',
      erro = left(nullif(btrim(coalesce(p_erro, '')), ''), 500),
      mensagem_id = coalesce(p_mensagem, f.mensagem_id),
      processado_em = null, pego_em = null, lote = null,
      enviar_em = now() + case when f.tentativas <= 1 then interval '1 minute'
                               when f.tentativas = 2 then interval '5 minutes'
                               when f.tentativas = 3 then interval '15 minutes'
                               else interval '60 minutes' end
    where f.id = p_id and f.status = 'enviando';   -- plano 1000 (SV-040)
  else
    update public.nx_envios_fila set
      status = p_status,
      erro = left(nullif(btrim(coalesce(p_erro, '')), ''), 500),
      mensagem_id = coalesce(p_mensagem, mensagem_id),
      processado_em = now()
    where id = p_id and status = 'enviando';   -- plano 1000 (SV-040): item já 'falhou' (STATUS INCERTO) não volta para a fila
  end if;
  get diagnostics v_n = row_count;
  return case when v_n = 1 then json_build_object('ok', true) else json_build_object('ok', false, 'motivo', 'estado') end;
end $$;

-- ------------------------------------------------------------
-- 4. SV-042 + SV-207 nx_fila_pegar: cópia de 20261001b + revezamento por cliente + cancelamento de cliente não apto
-- ------------------------------------------------------------
create or replace function public.nx_fila_pegar(p_limite int default 20, p_ids bigint[] default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v_ids bigint[]; v_lim int := greatest(1, least(coalesce(p_limite, 20), 100)); v json; v_lote uuid; v_cand bigint[]; v_fora uuid[];
begin
  -- plano 1000 (SV-207): item de cliente que não pode mais enviar (suspenso, cancelado, teste vencido, revenda suspensa, sem o
  -- módulo de conversas) é CANCELADO com o motivo — antes saía depois da suspensão (agendada, lista, fora do horário)
  select array_agg(x.cliente_id) into v_fora
    from (select distinct f.cliente_id from public.nx_envios_fila f
           where f.status = 'pendente' and (case when p_ids is null then f.enviar_em <= now() else f.id = any(p_ids) end)) x
   where not public.nx_auto_cliente_apto(x.cliente_id, 'conversas');
  if v_fora is not null then
    update public.nx_envios_fila f set status = 'cancelado', processado_em = now(),
           erro = 'Cancelado: o cliente está suspenso, com o teste vencido ou sem o módulo de conversas.'
     where f.id in (select f2.id from public.nx_envios_fila f2
                     where f2.status = 'pendente' and f2.cliente_id = any(v_fora)
                       and (case when p_ids is null then f2.enviar_em <= now() else f2.id = any(p_ids) end)
                     for update skip locked);
  end if;

  if p_ids is null then
    -- plano 1000 (SV-042): revezamento — o 1º item de cada cliente, depois o 2º de cada um… (a ordem global por enviar_em
    -- deixava um cliente com 2.000 itens de uma lista na frente de todos os outros por horas)
    v_cand := array(
      select x.id from (
        select f.id, f.enviar_em, row_number() over (partition by f.cliente_id order by f.enviar_em, f.id) as rn
          from public.nx_envios_fila f
         where f.status = 'pendente' and f.enviar_em <= now()) x
       order by x.rn, x.enviar_em, x.id
       limit v_lim * 2);
    select array_agg(s.id order by array_position(v_cand, s.id)) into v_ids from (
      select f.id from public.nx_envios_fila f
       where f.id = any(v_cand) and f.status = 'pendente' and f.enviar_em <= now()
       for update skip locked) s;
    if v_ids is not null and cardinality(v_ids) > v_lim then v_ids := v_ids[1:v_lim]; end if;
  else
    select array_agg(s.id) into v_ids from (
      select f.id from public.nx_envios_fila f
       where f.id = any(p_ids) and f.status = 'pendente'
       order by f.id
       limit v_lim
       for update skip locked) s;
  end if;
  if v_ids is null then return '[]'::json; end if;

  -- lote do processo que pegou (cabeçalho x-fila-lote): se a resposta se perder, a nx-enviar devolve o lote
  begin
    v_lote := nullif(current_setting('request.headers', true)::json ->> 'x-fila-lote', '')::uuid;
  exception when others then v_lote := null;
  end;
  update public.nx_envios_fila set status = 'enviando', tentativas = tentativas + 1, lote = v_lote where id = any(v_ids);

  select coalesce(json_agg(json_build_object(
      'id', f.id, 'cliente_id', f.cliente_id, 'conversa_id', f.conversa_id,
      'contato_id', coalesce(f.contato_id, cv.contato_id), 'canal_id', coalesce(f.canal_id, cv.canal_id),
      'tipo', f.tipo, 'texto', f.texto, 'template', f.template, 'origem', f.origem,
      'automacao_id', f.automacao_id, 'criado_por', f.criado_por, 'enviar_em', f.enviar_em,
      'tentativas', f.tentativas,
      'conversa', case when cv.id is not null then json_build_object('id', cv.id, 'status', cv.status,
                                                                   'ultima_entrada_em', cv.ultima_entrada_em) end,
      'janela_aberta', coalesce(cv.ultima_entrada_em > now() - interval '24 hours', false),
      'contato', case when ct.id is not null then json_build_object('id', ct.id, 'wa_id', ct.wa_id,
                   'telefone', ct.telefone, 'nome', ct.nome, 'optin_marketing', ct.optin_marketing,
                   'bloqueado', ct.bloqueado) end,
      'modelo', (select json_build_object('id', t.id, 'nome', t.nome, 'idioma', t.idioma, 'categoria', t.categoria,
                                          'status', t.status, 'corpo', t.corpo, 'num_parametros', t.num_parametros,
                                          'componentes', t.componentes)
                   from public.nx_templates t
                  where f.tipo = 'template' and t.cliente_id = f.cliente_id
                    and t.canal_id = coalesce(f.canal_id, cv.canal_id)
                    and (case when coalesce(f.template ->> 'template_id', f.template ->> 'id', '')
                                   ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                              then t.id = coalesce(f.template ->> 'template_id', f.template ->> 'id')::uuid
                              else t.nome = f.template ->> 'nome'
                                   and t.idioma = coalesce(nullif(f.template ->> 'idioma', ''), t.idioma) end)
                  order by (t.status = 'APPROVED') desc, t.sincronizado_em desc
                  limit 1)
    ) order by array_position(v_ids, f.id)), '[]'::json)
    into v
    from public.nx_envios_fila f
    left join public.nx_conversas cv on cv.id = f.conversa_id and cv.cliente_id = f.cliente_id
    left join public.nx_contatos ct on ct.id = coalesce(f.contato_id, cv.contato_id) and ct.cliente_id = f.cliente_id
   where f.id = any(v_ids);
  return v;
end $$;

-- ------------------------------------------------------------
-- 5. SV-007 mídia recebida presa em «baixando» (o 2º plano do webhook morreu)
-- ------------------------------------------------------------
create or replace function public.nx_midia_presas(p_limite int default 10)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return coalesce((
    select json_agg(json_build_object('mensagem_id', x.id, 'canal_id', x.canal_id, 'cliente_id', x.cliente_id, 'midia', x.midia)
                    order by x.criado_em)
      from (select m.id, m.canal_id, m.cliente_id, m.midia, m.criado_em
              from public.nx_mensagens m
              join public.nx_canais k on k.id = m.canal_id and k.cliente_id = m.cliente_id and k.provedor = 'meta'
             where m.direcao = 'in' and (m.midia ->> 'estado') = 'baixando'
               and nullif(m.midia ->> 'media_id', '') is not null
               and m.criado_em between now() - interval '7 days' and now() - interval '5 minutes'
             order by m.criado_em
             limit greatest(1, least(coalesce(p_limite, 10), 50))) x), '[]'::json);
end $$;

-- ------------------------------------------------------------
-- 6. CodeWords: vigia, sincronização e recibos em lote
-- ------------------------------------------------------------
-- SV-016/017/038: cópia de 20261008b + canal CAÍDO com conversa recente também é alvo (a sincronização pula canal desconectado:
-- ninguém avisava) + ja_conectou (histórico 'conectado' ou alguma mensagem pelo canal), numero_conferido e inscricao
create or replace function public.nx_codewords_vigia_alvos(p_limite int default 20)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return coalesce((
    select json_agg(json_build_object(
             'canal_id', x.canal_id, 'cliente_id', x.cliente_id, 'conectado', x.conectado, 'conferido_em', x.conferido_em,
             'caiu_em', x.caiu_em, 'codewords_aviso_em', x.aviso_em,
             'ja_conectou', x.ja_conectou, 'numero_conferido', x.numero_conferido, 'inscricao', x.inscricao) order by x.conferido_em nulls first)
      from (select k.id as canal_id, k.cliente_id, k.codewords_conectado as conectado, k.codewords_conferido_em as conferido_em,
                   k.codewords_aviso_em as aviso_em, k.codewords_numero_conferido as numero_conferido, k.codewords_inscricao as inscricao,
                   case when k.codewords_conectado is false then
                     (select h.em from public.nx_canal_historico h where h.canal_id = k.id order by h.em desc, h.id desc limit 1) end as caiu_em,
                   (exists (select 1 from public.nx_canal_historico h where h.canal_id = k.id and h.estado = 'conectado')
                    or exists (select 1 from public.nx_mensagens m where m.canal_id = k.id and m.cliente_id = k.cliente_id)) as ja_conectou
              from public.nx_canais k
              join public.nx_clientes c on c.id = k.cliente_id
             where k.provedor = 'codewords' and k.codewords_phone_id is not null and k.codewords_api_segredo is not null
               and c.status in ('ativo', 'teste') and c.ativo
               and (k.codewords_conferido_em is null or k.codewords_conferido_em < now() - interval '20 minutes')
               and (k.codewords_conectado is false
                    or not exists (select 1 from public.nx_conversas cv
                                    where cv.canal_id = k.id and cv.cliente_id = k.cliente_id and cv.ultima_msg_em > now() - interval '2 hours'))
             order by k.codewords_conferido_em nulls first
             limit greatest(1, least(coalesce(p_limite, 20), 100))) x), '[]'::json);
end $$;

-- SV-016: cópia de 20260929a + dispara também quando há alvo do vigia (antes o cron só chamava a função com canal conectado E
-- conversa nas últimas 2 h — aparelho caído e ninguém conversando = vigia nunca rodava = gestor nunca avisado)
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
                and cv.ultima_msg_em > now() - interval '2 hours')
     or exists (select 1 from public.nx_canais k
                  join public.nx_clientes c on c.id = k.cliente_id
                 where k.provedor = 'codewords' and k.codewords_phone_id is not null and k.codewords_api_segredo is not null
                   and c.status in ('ativo', 'teste') and c.ativo
                   and (k.codewords_conferido_em is null or k.codewords_conferido_em < now() - interval '20 minutes')) then
    begin
      perform public.nx_disparar('nx-codewords', '{"sincronizar":true}'::jsonb);
    exception when others then
      raise warning 'nx_codewords_sync_chamar: %', sqlerrm;   -- sem funcoes_url/função: tenta na próxima rodada
    end;
  end if;
end $$;

-- SV-209: cópia de 20260929a + revezamento entre canais (a 1ª conversa de cada canal, depois a 2ª…): as conversas de um canal
-- movimentado não ocupam mais todas as vagas
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
    from (select y.* from (
            select k.id as canal_id, k.cliente_id, cv.id as conversa_id, coalesce(ct.wa_id, ct.telefone) as telefone,
                   cv.ultima_msg_em, row_number() over (partition by k.id order by cv.ultima_msg_em desc, cv.id desc) as rn
              from public.nx_canais k
              join public.nx_conversas cv on cv.canal_id = k.id and cv.cliente_id = k.cliente_id
              join public.nx_contatos ct on ct.id = cv.contato_id and ct.cliente_id = k.cliente_id
              join public.nx_clientes c on c.id = k.cliente_id
             where k.provedor = 'codewords' and k.codewords_phone_id is not null and k.codewords_api_segredo is not null
               and k.codewords_conectado is distinct from false and k.codewords_numero_conferido is distinct from false
               and c.status in ('ativo', 'teste')
               and cv.ultima_msg_em > now() - interval '2 hours' and not cv.oculta and not ct.bloqueado) y
           order by y.rn, y.ultima_msg_em desc
           limit greatest(1, least(coalesce(p_limite, 30), 100))) x), '[]'::json);
end $$;

-- SV-024: recibo do aparelho com vários ids numa transação (cada id pela nx_codewords_status de sempre)
create or replace function public.nx_codewords_status_lote(p_canal uuid, p_ids text[], p_status text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v_id text; v_n int := 0;
begin
  if p_ids is null or cardinality(p_ids) > 50 then raise exception 'dados_invalidos' using errcode = '22023'; end if;
  foreach v_id in array p_ids loop
    perform public.nx_codewords_status(p_canal, v_id, p_status, null);
    v_n := v_n + 1;
  end loop;
  return json_build_object('ok', true, 'n', v_n);
end $$;

-- ------------------------------------------------------------
-- 7. SV-005 status do modelo pela Meta (webhook message_template_status_update)
-- ------------------------------------------------------------
create or replace function public.nx_template_status(p_waba text, p_nome text, p_idioma text, p_status text, p_motivo text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v_status text := upper(btrim(coalesce(p_status, ''))); v_n int := 0; r record; v_txt text; v_grupos json;
begin
  if nullif(btrim(coalesce(p_waba, '')), '') is null or nullif(btrim(coalesce(p_nome, '')), '') is null or v_status !~ '^[A-Z_]{3,40}$' then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  -- (o update fica num SELECT … INTO: CTE que modifica dados não pode alimentar o cursor de um FOR)
  with mudou as (
    update public.nx_templates t set status = v_status, sincronizado_em = now()
     where t.canal_id in (select k.id from public.nx_canais k where k.waba_id = btrim(p_waba) and k.provedor = 'meta')
       and t.nome = btrim(p_nome) and (p_idioma is null or t.idioma = p_idioma)
       and t.status is distinct from v_status
    returning t.cliente_id, t.nome)
  select coalesce(json_agg(json_build_object('cliente_id', g.cliente_id, 'nome', g.nome, 'n', g.n)), '[]'::json) into v_grupos
    from (select m.cliente_id, min(m.nome) as nome, count(*)::int as n from mudou m group by m.cliente_id) g;
  for r in select * from json_to_recordset(v_grupos) as x(cliente_id uuid, nome text, n int)
  loop
    v_n := v_n + r.n;
    v_txt := case v_status when 'APPROVED' then 'foi aprovado pela Meta' when 'REJECTED' then 'foi reprovado pela Meta'
                           when 'PAUSED' then 'foi pausado pela Meta' when 'DISABLED' then 'foi desativado pela Meta'
                           else 'mudou para ' || v_status || ' na Meta' end;
    perform public.nx_notificar(r.cliente_id, null, 'sistema', left('Modelo «' || r.nome || '» ' || v_txt, 120),
      left(case when v_status = 'APPROVED' then 'O modelo já pode ser usado de novo.'
                else coalesce('Motivo informado: ' || nullif(btrim(p_motivo), '') || '. ', '')
                     || 'Envios com este modelo falham até ele voltar a ser aprovado.' end, 500),
      '#/config/numeros');
  end loop;
  return json_build_object('ok', true, 'atualizados', v_n);
end $$;

-- ------------------------------------------------------------
-- 8. SV-078 nx-ciclo por cliente: um disparo por cliente apto (a trava por cliente continua na função)
-- ------------------------------------------------------------
create or replace function public.nx_ciclo_chamar()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare c record; v_n int := 0; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  for c in
    select x.id from public.nx_clientes x
     where x.ativo and x.status in ('ativo', 'teste')
       and (x.status <> 'teste' or x.teste_ate is null or x.teste_ate >= v_hoje)
       and not exists (select 1 from public.nx_orgs o where o.id = x.org_id and o.status in ('suspenso', 'cancelado'))
     order by x.nome, x.id
  loop
    begin
      perform public.nx_disparar('nx-ciclo', jsonb_build_object('cliente', c.id));
      v_n := v_n + 1;
    exception when others then
      raise warning 'nx_ciclo_chamar: %', sqlerrm;   -- sem funcoes_url: tenta na próxima hora
      exit;
    end;
  end loop;
  return v_n;
end $$;

-- ------------------------------------------------------------
-- 9. Permissões: tudo novo é só da service_role (Edge Functions e cron)
-- ------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.nx_taxa_contar(text,int)', 'public.nx_taxa_somar(text)', 'public.nx_taxa_usar(text,int,int)',
    'public.nx_envio_vez(uuid,uuid)', 'public.nx_codewords_envio_vez(uuid)', 'public.nx_fila_adiar(bigint,timestamptz)',
    'public.nx_fila_concluir(bigint,text,text,bigint)', 'public.nx_fila_pegar(int,bigint[])', 'public.nx_midia_presas(int)',
    'public.nx_codewords_vigia_alvos(int)', 'public.nx_codewords_sync_chamar()', 'public.nx_codewords_sync_alvos(int)',
    'public.nx_codewords_status_lote(uuid,text[],text)', 'public.nx_template_status(text,text,text,text,text)',
    'public.nx_ciclo_chamar()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 10. Agenda (idempotente): o cron 'nx-ciclo' chama nx_ciclo_chamar (mesma hora); segunda chance dos relatórios
-- ------------------------------------------------------------
do $$
declare j record; v_agenda text;
begin
  for j in select jobid, schedule from cron.job where jobname = 'nx-ciclo' loop
    v_agenda := j.schedule;
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('nx-ciclo', coalesce(v_agenda, '7 * * * *'), 'select public.nx_ciclo_chamar()');

  for j in select jobid from cron.job where jobname in ('nx-relatorio-diario-2', 'nx-relatorio-mensal-2', 'nx-relatorio-mensal-3') loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('nx-relatorio-diario-2', '0 13 * * *', $c$select public.nx_disparar('nx-relatorio', '{"tipo":"diario"}'::jsonb)$c$);
  perform cron.schedule('nx-relatorio-mensal-2', '0 15 1 * *', $c$select public.nx_disparar('nx-relatorio', '{"tipo":"mensal"}'::jsonb)$c$);
  perform cron.schedule('nx-relatorio-mensal-3', '0 12 2 * *', $c$select public.nx_disparar('nx-relatorio', '{"tipo":"mensal"}'::jsonb)$c$);
end $$;

insert into public.nx_versao_banco (nome) values ('20261013a_operacao_fila_codewords')
on conflict (nome) do update set aplicada_em = now();

notify pgrst, 'reload schema';
