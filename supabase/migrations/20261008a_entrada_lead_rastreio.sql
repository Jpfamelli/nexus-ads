-- ============================================================
-- ÓRBITA — 20261008a_entrada_lead_rastreio.sql · plano «100+ melhorias» de 08/10/2026 · frente S-B (banco), migração a
-- Entrada de mensagem, lead do webhook e rastreio do site. ADITIVA e idempotente: create or replace, if not exists,
-- do $$ … $$ com checagem; nenhuma assinatura de função existente muda; nenhum dado de produção é alterado (o único
-- backfill é da coluna DERIVADA nx_contatos.tel_chave, idempotente e sem fundir contatos).
--
-- Por quê (mapa C/A/B, decisões de produto 1 e 2 do plano):
--   S-B1 [C1][C3][C4][A6] nx_lead_webhook v2 — negócio ABERTO do contato (qualquer idade) é o mesmo negócio; último negócio
--        FECHADO → nasce um novo (decisão 1); nome do negócio = nome do contato no CRM, senão o apelido do WhatsApp (decisão 2);
--        a conversa aberta passa a apontar para o negócio novo; nx_atribuicao_completar(p_cliente) preenche campanha_ext
--        (lead/contato) a partir de anuncio_ext quando a métrica do anúncio aparece (antes: nula para sempre).
--   S-B2 [C2][A6][A13][A20][A21][A22] nx_rastreio_atribuir aceita canal Meta Cloud (provedor in codewords, meta) e resolve o alvo
--        pelo contato + negócio aberto; grava nx_rastreio.resultado {aplicado, motivo, em, negocio_id, plataforma, origem};
--        sem negócio guarda telefone + pendente = true e o gatilho nx_tg_rastreio_pendente aplica quando o negócio nasce
--        (30 dias); classificação: fbclid/utm_source instagram sem medium pago → organico/meta, mediums pagos ampliados;
--        nx_rastreio_registrar com limites 120/min e 1 000/h e modo teste (p_dados->>'teste' = '1' não grava);
--        nx_rastreio_listar(p_token, p_cliente, p_dias) para o painel «Rastreio do site» (sem o código).
--   S-B3 [B7] nx_wa_entrada grava criado_em = horário original (até 7 dias atrás, nunca no futuro); [C10] reação não cria nem
--        toca o contato; [C113] opt-out gera mensagem de sistema com status 'sistema'; [B3] wa_id só é trocado por um mais
--        completo; [C9] nx_tg_negocio_antes: marco sem estágio escolhe o estágio do TIPO certo; [C8] nx_lead_entrada respeita
--        o limite de contatos do plano (silencioso para o site, aviso único ao admin).
--   S-B4 [C11] faixa de horário que cruza a meia-noite (22:00–02:00) em nx_horario_aberto/nx_proximo_horario.
--   S-B5 [C6][C7] nx_tel_chave só tira o 9 de CELULAR (dígito seguinte 6–9: fixo 12 3333-4444 ≠ celular 12 93333-4444);
--        nx_tel_normalizar só dá o 55 a 10–11 dígitos com DDD válido (e 11 dígitos com o 9); backfill idempotente de tel_chave.
--   S-B6 [C5] nx_lead_salvar valida id/datas/valor/etapa/plataforma/telefone com dados_invalidos + hint.
--   S-B10 tabela nx_versao_banco (cada migração desta rodada grava o nome; nx_app_sessao devolve em `migracao`).
-- Smoke: supabase/testes/19_entrada_lead_rastreio.sql (begin … rollback; termina em 'OK_19_…'). Falha antes desta migração.
-- Erros em português: errcode 22023 + hint. Toda função: security definer + set search_path = ''.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Versão do banco — a última migração aplicada (lida por nx_app_sessao/nx_sessao em «migracao»)
-- ------------------------------------------------------------
create table if not exists public.nx_versao_banco (
  nome text primary key,
  aplicada_em timestamptz not null default now()
);
alter table public.nx_versao_banco enable row level security;
revoke all on table public.nx_versao_banco from public, anon, authenticated;
grant select, insert, update on table public.nx_versao_banco to service_role;

-- ------------------------------------------------------------
-- 1. Telefone (S-B5): DDD válido, 9 só de celular, backfill idempotente
-- ------------------------------------------------------------
-- DDDs em uso no Brasil (Anatel): 11–19, 21, 22, 24, 27, 28, 31–35, 37, 38, 41–49, 51, 53–55, 61–69, 71, 73–75, 77, 79, 81–89, 91–99
create or replace function public.nx_ddd_valido(p text)
returns boolean
language sql immutable
security definer
set search_path = ''
as $$
  select coalesce(p, '') ~ '^(1[1-9]|2[124789]|3[1-578]|4[1-9]|5[13-5]|6[1-9]|7[13-579]|8[1-9]|9[1-9])$'
$$;

-- só dígitos. p_com_ddi (número do from/wa_id do WhatsApp, que já traz o DDI) ou «+»: 8–15 dígitos como está.
-- Digitado/importado: zero de tronco fora; 10–11 dígitos SÓ ganham 55 quando parecem brasileiros (DDD válido; com 11 dígitos o
-- 3º é o 9 do celular; com 10 o 3º é 2–9). «1 212 555 1234» (EUA sem «+») → null: a RPC responde dados_invalidos|telefone.
create or replace function public.nx_tel_normalizar(p text, p_com_ddi boolean default false)
returns text
language plpgsql immutable
security definer
set search_path = ''
as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); v_mais boolean := btrim(coalesce(p, '')) like '+%';
begin
  if coalesce(p_com_ddi, false) or v_mais then
    return case when length(d) between 8 and 15 then d end;
  end if;
  -- zero de tronco (DDD nunca começa com 0): 012997773031 → 12997773031
  if left(d, 1) = '0' and length(d) in (11, 12) and substr(d, 2, 1) <> '0' then d := substr(d, 2); end if;
  if length(d) between 10 and 11 then
    if public.nx_ddd_valido(left(d, 2))
       and ((length(d) = 11 and substr(d, 3, 1) = '9') or (length(d) = 10 and substr(d, 3, 1) between '2' and '9')) then
      return '55' || d;
    end if;
    return null;   -- 10–11 dígitos que não são um número brasileiro: só com «+»
  end if;
  if length(d) between 12 and 15 then return d; end if;
  return null;
end $$;

-- chave de deduplicação: 55 + DDD + 9 + 8 dígitos e 55 + DDD + 8 dígitos são a mesma pessoa SÓ quando o 9 é o do celular
-- (dígito seguinte 6–9): 5512998303030 e 551298303030 → 1298303030; o fixo 551233334444 e o 5512933334444 ficam separados.
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
    if length(s) = 11 and substr(s, 3, 1) = '9' and substr(s, 4, 1) between '6' and '9' then
      s := substr(s, 1, 2) || substr(s, 4);
    end if;
    return s;
  end if;
  return p;
end $$;

-- Backfill idempotente da coluna derivada: só linhas cuja chave mudou com a regra nova; nunca funde dois contatos
-- (colisão com outro contato do mesmo cliente é pulada e contada). Pode rodar de novo a qualquer momento.
create or replace function public.nx_tel_chave_backfill(p_cliente uuid default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_n int := 0; v_pulados int := 0; v_nova text;
begin
  for r in
    select k.id, k.cliente_id, k.telefone from public.nx_contatos k
     where k.telefone is not null and (p_cliente is null or k.cliente_id = p_cliente)
       and k.tel_chave is distinct from public.nx_tel_chave(k.telefone)
  loop
    v_nova := public.nx_tel_chave(r.telefone);
    if v_nova is not null and exists (select 1 from public.nx_contatos o
                                       where o.cliente_id = r.cliente_id and o.tel_chave = v_nova and o.id <> r.id) then
      v_pulados := v_pulados + 1;
      continue;
    end if;
    update public.nx_contatos set tel_chave = v_nova where id = r.id;   -- o gatilho recalcula pela mesma regra
    v_n := v_n + 1;
  end loop;
  return json_build_object('recalculados', v_n, 'pulados', v_pulados);
end $$;

do $$
declare j json;
begin
  j := public.nx_tel_chave_backfill(null);
  raise notice 'nx_tel_chave_backfill: %', j::text;
end $$;

-- ------------------------------------------------------------
-- 2. Horário que cruza a meia-noite (S-B4)
-- ------------------------------------------------------------
-- horário (§3.8): {"0":[],"1":[["08:00","12:00"],["13:30","18:00"]],…}; null = 24 h.
-- Faixa com fim <= início cruza a meia-noite (["22:00","02:00"]): vale de 22:00 até 23:59 do dia e de 00:00 até 02:00 do
-- dia SEGUINTE (a parte da madrugada é lida no dia anterior). ["00:00","00:00"] = o dia inteiro.
create or replace function public.nx_horario_aberto(p_horario jsonb, p_quando timestamptz)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_local timestamp; v_dia jsonb; v_ontem jsonb; t time;
begin
  if p_horario is null or jsonb_typeof(p_horario) = 'null' then return true; end if;
  v_local := coalesce(p_quando, now()) at time zone 'America/Sao_Paulo';
  t := v_local::time;
  v_dia := p_horario -> (extract(dow from v_local)::int)::text;
  v_ontem := p_horario -> (extract(dow from v_local - interval '1 day')::int)::text;
  if v_dia is not null and jsonb_typeof(v_dia) = 'array' and exists (
       select 1 from jsonb_array_elements(v_dia) f
        where jsonb_typeof(f) = 'array'
          and ((f ->> 1)::time > (f ->> 0)::time and t >= (f ->> 0)::time and t < (f ->> 1)::time
            or (f ->> 1)::time <= (f ->> 0)::time and t >= (f ->> 0)::time)) then
    return true;
  end if;
  -- madrugada de uma faixa que começou ontem
  return v_ontem is not null and jsonb_typeof(v_ontem) = 'array' and exists (
       select 1 from jsonb_array_elements(v_ontem) f
        where jsonb_typeof(f) = 'array' and (f ->> 1)::time <= (f ->> 0)::time and t < (f ->> 1)::time);
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

-- ------------------------------------------------------------
-- 3. nx_lead_salvar (S-B6): validações com hint, como nx_negocio_salvar (corpo de 20261001b + validações)
-- ------------------------------------------------------------
create or replace function public.nx_lead_salvar(p_token text, p_cliente uuid, p_lead jsonb)
 returns json
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  d jsonb := case when jsonb_typeof(p_lead) = 'object' then p_lead else '{}'::jsonb end;
  v_id bigint := public.nx_crm_int8(d, 'id');
  v_tel text := nullif(regexp_replace(coalesce(d->>'telefone', ''), '\D', '', 'g'), '');
  v_etapa text := nullif(d->>'etapa', '');
  v_plat text := nullif(d->>'plataforma', '');
  v_dconv date := public.nx_crm_data(d, 'data_conversa');
  v_dag date := public.nx_crm_data(d, 'data_agenda');
  v_dcons date := public.nx_crm_data(d, 'data_consulta');
  v_valor numeric := public.nx_crm_num(d, 'valor');
  r public.nx_leads;
begin
  if jsonb_typeof(p_lead) is distinct from 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'lead'; end if;
  if v_etapa is not null and v_etapa not in ('nova', 'agendada', 'orcamento', 'fechou', 'nao_fechou', 'faltou', 'perdida') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'etapa';
  end if;
  if v_plat is not null and v_plat not in ('meta', 'google') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'plataforma';
  end if;
  -- telefone: 8–15 dígitos; 10–11 dígitos sem «+» só se forem um número brasileiro (DDD válido, 9 do celular)
  if v_tel is not null and (length(v_tel) not between 8 and 15
                            or (length(v_tel) between 10 and 11 and public.nx_tel_normalizar(d->>'telefone') is null)) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'telefone';
  end if;
  if d ? 'nome' and char_length(coalesce(trim(d->>'nome'), '')) > 160 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'nome';
  end if;
  if v_id is null then
    -- o contato que o gatilho do negócio cria também conta no limite de contatos do plano
    if v_tel is not null and public.nx_tel_normalizar(d->>'telefone') is not null
       and public.nx_contato_por_tel(p_cliente, d->>'telefone') is null then
      perform public.nx_exigir_limite(p_cliente, 'contatos', 1);
    end if;
    insert into public.nx_leads (cliente_id, nome, telefone, origem, plataforma, campanha_ext, servico, etapa,
                                 data_conversa, data_agenda, data_consulta, valor, obs)
    values (p_cliente,
            nullif(trim(d->>'nome'), ''),
            v_tel,
            coalesce(nullif(d->>'origem', ''), 'manual'),
            v_plat,
            nullif(d->>'campanha_ext', ''),
            nullif(d->>'servico', ''),
            coalesce(v_etapa, 'nova'),
            coalesce(v_dconv, (now() at time zone 'America/Sao_Paulo')::date),
            v_dag,
            v_dcons,
            v_valor,
            nullif(d->>'obs', ''))
    returning * into r;
  else
    update public.nx_leads set
      nome          = case when d ? 'nome' then nullif(trim(d->>'nome'), '') else nome end,
      telefone      = case when d ? 'telefone' then v_tel else telefone end,
      origem        = case when d ? 'origem' then coalesce(nullif(d->>'origem', ''), origem) else origem end,
      plataforma    = case when d ? 'plataforma' then v_plat else plataforma end,
      campanha_ext  = case when d ? 'campanha_ext' then nullif(d->>'campanha_ext', '') else campanha_ext end,
      servico       = case when d ? 'servico' then nullif(d->>'servico', '') else servico end,
      etapa         = case when d ? 'etapa' then coalesce(v_etapa, etapa) else etapa end,
      data_agenda   = case when d ? 'data_agenda' then v_dag else data_agenda end,
      data_consulta = case when d ? 'data_consulta' then v_dcons else data_consulta end,
      valor         = case when d ? 'valor' then v_valor else valor end,
      obs           = case when d ? 'obs' then nullif(d->>'obs', '') else obs end,
      atualizado_em = now()
    where id = v_id and cliente_id = p_cliente
    returning * into r;
    if r.id is null then raise exception 'lead_nao_encontrado'; end if;
  end if;
  return row_to_json(r);
end $function$;

-- ------------------------------------------------------------
-- 4. nx_mensagens.status ganha 'sistema' (mensagem de sistema nunca foi enviada a ninguém: não conta como entrega)
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in select c.conname from pg_constraint c
            where c.conrelid = 'public.nx_mensagens'::regclass and c.contype = 'c'
              and pg_get_constraintdef(c.oid) like '%''recebida''%' and pg_get_constraintdef(c.oid) not like '%''sistema''%' loop
    execute format('alter table public.nx_mensagens drop constraint %I', r.conname);
  end loop;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.nx_mensagens'::regclass and c.conname = 'nx_mensagens_status_check') then
    alter table public.nx_mensagens add constraint nx_mensagens_status_check
      check (status in ('recebida', 'pendente', 'enviada', 'entregue', 'lida', 'falhou', 'sistema'));
  end if;
end $$;

-- ------------------------------------------------------------
-- 5. nx_wa_entrada (S-B3): cópia de 20260928f_funcoes.sql + criado_em original, reação sem tocar o contato,
--    wa_id só por um mais completo, opt-out com status 'sistema'
-- ------------------------------------------------------------
create or replace function public.nx_wa_entrada(p_canal uuid, p_msg jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.nx_canais;
  v_cli uuid;
  v_cli_nome text;
  v_msg jsonb := coalesce(p_msg, '{}'::jsonb);
  v_wa text := left(regexp_replace(coalesce(v_msg ->> 'wa_id', ''), '\D', '', 'g'), 20);
  v_nome text := nullif(left(btrim(regexp_replace(coalesce(v_msg ->> 'nome', ''), '\s+', ' ', 'g')), 160), '');
  v_tipo text := coalesce(v_msg ->> 'tipo', 'desconhecido');
  v_corpo text := left(v_msg ->> 'corpo', 4096);
  v_wamid text := nullif(left(btrim(coalesce(v_msg ->> 'wamid', '')), 256), '');
  v_resp text := nullif(left(btrim(coalesce(v_msg ->> 'responde_a_wamid', '')), 256), '');
  v_ref jsonb := case when jsonb_typeof(v_msg -> 'referral') = 'object' then v_msg -> 'referral' end;
  v_em timestamptz := now();
  v_criado timestamptz := now();
  v_chave text;
  v_ad boolean; v_anuncio text; v_campanha text; v_clid text;
  ct public.nx_contatos;
  cv public.nx_conversas;
  v_dep public.nx_departamentos;
  v_dep_id uuid;
  v_id bigint; v_ex record;
  v_nova boolean := false; v_optout boolean := false; v_pend boolean := false;
  v_midia jsonb; v_fila bigint; v_norm text; v_txt text; v_resumo text;
  v_reacao_msg bigint; v_reacao_cv bigint; v_reacao_bloq boolean;
begin
  select * into k from public.nx_canais where id = p_canal;
  if k.id is null then
    raise exception 'canal_nao_encontrado' using errcode = '22023';
  end if;
  v_cli := k.cliente_id;
  if length(v_wa) not between 8 and 15 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'wa_id';
  end if;
  -- data impossível (2026-02-31…) não derruba a gravação: fica now()
  if (v_msg ->> 'em') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$'
     and pg_input_is_valid(v_msg ->> 'em', 'timestamptz') then
    v_em := least((v_msg ->> 'em')::timestamptz, now());
  end if;
  -- a bolha fica no horário em que o cliente ESCREVEU (reentrega tardia e sincronização do aparelho em ordem no chat);
  -- data velha demais (> 7 dias) ou inválida: now()
  v_criado := case when v_em >= now() - interval '7 days' then v_em else now() end;
  if v_tipo not in ('texto', 'imagem', 'audio', 'video', 'documento', 'sticker', 'localizacao', 'contato',
                    'interativo', 'desconhecido') then
    v_tipo := 'desconhecido';
  end if;

  -- trava por cliente + telefone: duas entregas da mesma pessoa ao mesmo tempo viram UM contato/conversa
  v_chave := public.nx_tel_chave(public.nx_tel_normalizar(v_wa, true));
  perform pg_advisory_xact_lock(hashtextextended(v_cli::text || ':' || coalesce(v_chave, v_wa), 0));

  -- idempotente por wamid (a Meta reentrega): nada muda na 2ª vez
  if v_wamid is not null and jsonb_typeof(v_msg -> 'reacao') is distinct from 'object' then
    select m.id, m.conversa_id, m.contato_id, m.cliente_id into v_ex from public.nx_mensagens m where m.wamid = v_wamid;
    if found then
      return json_build_object(
        'mensagem_id', case when v_ex.cliente_id = v_cli then v_ex.id end,
        'conversa_id', case when v_ex.cliente_id = v_cli then v_ex.conversa_id end,
        'contato_id', case when v_ex.cliente_id = v_cli then v_ex.contato_id end,
        'nova_conversa', false, 'duplicada', true, 'bloqueado', false, 'optout', false,
        'midia_pendente', false, 'fila_id', null);
    end if;
  end if;

  -- (0) reação: ANTES de tocar o contato — só grava o emoji na mensagem alvo (do mesmo cliente E da conversa com
  -- ESTE contato) e sai; não cria contato, não muda nome/wa_id/ultimo_contato_em
  if jsonb_typeof(v_msg -> 'reacao') = 'object' then
    v_id := public.nx_contato_por_tel(v_cli, v_wa);
    if v_id is null then
      return json_build_object('mensagem_id', null, 'conversa_id', null, 'contato_id', null,
                               'nova_conversa', false, 'duplicada', false, 'bloqueado', false,
                               'optout', false, 'midia_pendente', false, 'fila_id', null, 'reacao', true);
    end if;
    select c.bloqueado into v_reacao_bloq from public.nx_contatos c where c.id = v_id;
    update public.nx_mensagens m
       set reacao = nullif(left(coalesce(v_msg -> 'reacao' ->> 'emoji', ''), 16), '')
     where m.wamid = nullif(left(coalesce(v_msg -> 'reacao' ->> 'wamid', ''), 256), '')
       and m.cliente_id = v_cli and m.contato_id = v_id
    returning m.id, m.conversa_id into v_reacao_msg, v_reacao_cv;
    return json_build_object('mensagem_id', v_reacao_msg, 'conversa_id', v_reacao_cv, 'contato_id', v_id,
                             'nova_conversa', false, 'duplicada', false, 'bloqueado', coalesce(v_reacao_bloq, false),
                             'optout', false, 'midia_pendente', false, 'fila_id', null, 'reacao', true);
  end if;

  -- atribuição do anúncio (1º toque)
  v_ad := v_ref is not null and v_ref ->> 'source_type' = 'ad';
  v_anuncio := nullif(left(btrim(coalesce(v_ref ->> 'source_id', '')), 100), '');
  v_clid := nullif(left(btrim(coalesce(v_ref ->> 'ctwa_clid', '')), 500), '');
  if v_ad and v_anuncio is not null then
    select m.campanha_ext into v_campanha from public.nx_metricas_dia m
     where m.cliente_id = v_cli and m.plataforma = 'meta' and m.nivel = 'anuncio' and m.anuncio_ext = v_anuncio
     order by m.data desc limit 1;
  end if;

  -- (1) contato pelo wa_id exato (depois pela chave do telefone)
  v_id := public.nx_contato_por_tel(v_cli, v_wa);
  if v_id is not null then
    select * into ct from public.nx_contatos where id = v_id and cliente_id = v_cli;
  end if;
  v_id := null;
  if ct.id is null then
    insert into public.nx_contatos as x (cliente_id, nome, telefone, wa_id, origem, plataforma, campanha_ext,
                                         anuncio_ext, ctwa_clid, ultimo_contato_em)
    values (v_cli, v_nome, v_wa, v_wa, case when v_ad then 'anuncio' else 'whatsapp' end,
            case when v_ad then 'meta' end, case when v_ad then v_campanha end,
            case when v_ad then v_anuncio end, case when v_ad then v_clid end, now())
    on conflict (cliente_id, tel_chave) where tel_chave is not null
    do update set wa_id = excluded.wa_id, nome = coalesce(x.nome, excluded.nome), ultimo_contato_em = now()
    returning * into ct;
  else
    update public.nx_contatos set
      nome = coalesce(nome, v_nome),
      -- o from do WhatsApp manda (com ou sem o 9), mas um número SEM DDI (< 12 dígitos, fluxo mal configurado) nunca
      -- substitui um wa_id mais completo: senão as respostas sairiam para um número que não existe
      wa_id = case when wa_id is null or length(v_wa) >= 12 or length(v_wa) >= length(wa_id) then v_wa else wa_id end,
      ultimo_contato_em = now(),
      plataforma = case when plataforma is null and v_ad then 'meta' else plataforma end,
      campanha_ext = case when plataforma is null and v_ad then v_campanha else campanha_ext end,
      anuncio_ext = case when plataforma is null and v_ad then v_anuncio else anuncio_ext end,
      ctwa_clid = case when plataforma is null and v_ad then v_clid else ctwa_clid end
    where id = ct.id
    returning * into ct;
  end if;

  v_resumo := public.nx_wa_resumo(v_tipo, v_corpo);
  if v_tipo in ('imagem', 'audio', 'video', 'documento', 'sticker') and jsonb_typeof(v_msg -> 'midia') = 'object' then
    v_pend := nullif(v_msg -> 'midia' ->> 'media_id', '') is not null and k.token_segredo is not null
              and not ct.bloqueado;
    v_midia := jsonb_strip_nulls(jsonb_build_object(
      'media_id', left(v_msg -> 'midia' ->> 'media_id', 128),
      'mime', left(v_msg -> 'midia' ->> 'mime', 100),
      'sha256', left(v_msg -> 'midia' ->> 'sha256', 128),
      'nome', left(v_msg -> 'midia' ->> 'nome', 200),
      'estado', case when v_pend then 'baixando' else 'indisponivel' end));
  end if;

  -- (3) contato bloqueado: grava na ÚLTIMA conversa dele neste canal, sem mexer em nada
  if ct.bloqueado then
    select * into cv from public.nx_conversas
     where cliente_id = v_cli and contato_id = ct.id and canal_id = p_canal
     order by id desc limit 1;
    if cv.id is null then
      insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, protocolo, status,
                                       aguardando, oculta, nao_lidas, ultima_msg_em, ultima_msg_resumo,
                                       ultima_msg_dir, ultima_entrada_em, resolvida_em)
      values (v_cli, p_canal, ct.id, k.departamento_id, public.nx_protocolo(v_cli), 'resolvida',
              false, true, 0, now(), v_resumo, 'in', v_em, now())
      returning * into cv;
    end if;
    insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, midia,
                                     wamid, responde_a_wamid, status, referral, criado_em)
    values (v_cli, cv.id, ct.id, p_canal, 'in', v_tipo, v_corpo, v_midia, v_wamid, v_resp, 'recebida', v_ref, v_criado)
    on conflict (wamid) do nothing
    returning id into v_id;
    return json_build_object('mensagem_id', v_id, 'conversa_id', cv.id, 'contato_id', ct.id,
                             'nova_conversa', false, 'duplicada', v_id is null, 'bloqueado', true,
                             'optout', false, 'midia_pendente', false, 'fila_id', null);
  end if;

  -- (4) conversa aberta/pendente do contato neste canal; senão cria
  select * into cv from public.nx_conversas
   where cliente_id = v_cli and canal_id = p_canal and contato_id = ct.id and status <> 'resolvida'
   order by id desc limit 1;
  if cv.id is null then
    select d.id into v_dep_id from public.nx_departamentos d
     where d.id = k.departamento_id and d.cliente_id = v_cli and d.ativo;
    if v_dep_id is null then
      select d.id into v_dep_id from public.nx_departamentos d where d.cliente_id = v_cli and d.padrao limit 1;
    end if;
    insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, protocolo, status,
                                     aguardando, ultima_entrada_em, ultima_msg_em)
    values (v_cli, p_canal, ct.id, v_dep_id, public.nx_protocolo(v_cli), 'aberta', true, v_em, now())
    returning * into cv;
    v_nova := true;
    -- distribuição (F5). Um erro na distribuição nunca derruba a mensagem.
    if to_regprocedure('public.nx_cv_distribuir(bigint)') is not null then
      begin
        perform public.nx_cv_distribuir(cv.id);
      exception when others then
        raise warning 'nx_wa_entrada: nx_cv_distribuir(%) falhou: %', cv.id, sqlerrm;
      end;
    end if;
  end if;

  -- (5) mensagem
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, midia,
                                   wamid, responde_a_wamid, status, referral, criado_em)
  values (v_cli, cv.id, ct.id, p_canal, 'in', v_tipo, v_corpo, v_midia, v_wamid, v_resp, 'recebida', v_ref, v_criado)
  on conflict (wamid) do nothing
  returning id into v_id;
  if v_id is null then
    return json_build_object('mensagem_id', null, 'conversa_id', cv.id, 'contato_id', ct.id,
                             'nova_conversa', v_nova, 'duplicada', true, 'bloqueado', false, 'optout', false,
                             'midia_pendente', false, 'fila_id', null);
  end if;

  -- (6) conversa: cliente falou por último
  update public.nx_conversas set
    ultima_msg_em = now(),
    ultima_msg_resumo = v_resumo,
    ultima_msg_dir = 'in',
    ultima_entrada_em = greatest(coalesce(ultima_entrada_em, v_em), v_em),
    aguardando = true,
    nao_lidas = nao_lidas + 1,
    status = case when status = 'pendente' then 'aberta' else status end,
    negocio_id = coalesce(negocio_id, (
      select l.id from public.nx_leads l join public.nx_funis f on f.id = l.funil_id and f.padrao
       where l.contato_id = ct.id and l.cliente_id = v_cli and l.status = 'aberto'
       order by l.criado_em desc limit 1)),
    atualizado_em = now()
  where id = cv.id
  returning * into cv;

  -- (7) descadastro (opt-out): só a palavra, sem acento/caixa/pontuação, até 20 caracteres
  if v_tipo = 'texto' and char_length(btrim(coalesce(v_corpo, ''))) between 1 and 20 then
    v_norm := regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, btrim(v_corpo))),
                             '[^a-z]', '', 'g');
    if v_norm in ('sair', 'parar', 'pare', 'stop', 'cancelar', 'descadastrar') then
      v_optout := true;
      if ct.optin_marketing is distinct from false then
        update public.nx_contatos
           set optin_marketing = false, optin_em = now(), optin_origem = 'whatsapp: pediu para sair'
         where id = ct.id;
        -- mensagem de SISTEMA: ninguém a enviou, então o status é 'sistema' (não entra em contagem de entrega)
        insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status)
        values (v_cli, cv.id, ct.id, p_canal, 'out', 'sistema',
                'Contato pediu para não receber mensagens de marketing', 'sistema');
      end if;
    end if;
  end if;

  -- (8) conversa nova fora do horário do departamento: 1 aviso por contato a cada 12 h
  if v_nova and cv.departamento_id is not null then
    select * into v_dep from public.nx_departamentos where id = cv.departamento_id;
    if nullif(btrim(coalesce(v_dep.msg_fora_horario, '')), '') is not null
       and v_dep.horario is not null and jsonb_typeof(v_dep.horario) = 'object'
       and not public.nx_horario_aberto(v_dep.horario, now())
       and not exists (select 1 from public.nx_envios_fila f
                        where f.cliente_id = v_cli and f.contato_id = ct.id and f.origem = 'fora_horario'
                          and f.criado_em > now() - interval '12 hours') then
      select c.nome into v_cli_nome from public.nx_clientes c where c.id = v_cli;
      v_txt := v_dep.msg_fora_horario;
      v_txt := replace(v_txt, '{primeiro_nome}', coalesce(split_part(btrim(coalesce(ct.nome, '')), ' ', 1), ''));
      v_txt := replace(v_txt, '{nome}', coalesce(ct.nome, ''));
      v_txt := replace(v_txt, '{empresa}', coalesce(v_cli_nome, ''));
      v_txt := replace(v_txt, '{protocolo}', coalesce(cv.protocolo, ''));
      v_txt := replace(v_txt, '{atendente}', '');
      insert into public.nx_envios_fila (cliente_id, conversa_id, contato_id, canal_id, tipo, texto, origem, enviar_em)
      values (v_cli, cv.id, ct.id, p_canal, 'texto', left(btrim(v_txt), 4096), 'fora_horario', now())
      returning id into v_fila;
    end if;
  end if;

  -- (9) lead de anúncio em conversa nova → avisa admins/supervisores/gestores
  if v_nova and v_ad then
    perform public.nx_notificar(v_cli, null, 'lead_anuncio',
      left('Lead do anúncio: ' || coalesce(ct.nome, ct.telefone, 'contato novo'), 120),
      left(v_resumo, 500), '#/conversas/' || cv.id);
  end if;

  return json_build_object('mensagem_id', v_id, 'conversa_id', cv.id, 'contato_id', ct.id,
                           'nova_conversa', v_nova, 'duplicada', false, 'bloqueado', false,
                           'optout', v_optout, 'midia_pendente', v_pend, 'fila_id', v_fila);
end $$;

-- ------------------------------------------------------------
-- 6. nx_tg_negocio_antes (S-B3 [C9]): cópia de 20260928a_saas_base.sql + ramo (b): marco sem estágio no funil escolhe
--    o 1º estágio do TIPO que a etapa pede quando o estágio atual é de outro tipo (status e coluna do Kanban não divergem)
-- ------------------------------------------------------------
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
  v_tipo text;
  v_tipo_atual text;
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
    if e.id is null then
      -- marco sem estágio no funil: se o estágio atual é de OUTRO tipo (aberto × ganho × perdido), vai para o 1º estágio
      -- do tipo que a etapa pede — nunca mais «status ganho numa coluna aberta»; do mesmo tipo, fica onde está
      v_tipo := case new.etapa when 'fechou' then 'ganho' when 'nao_fechou' then 'perdido'
                               when 'perdida' then 'perdido' else 'aberto' end;
      select s.tipo into v_tipo_atual from public.nx_estagios s where s.id = new.estagio_id;
      if new.funil_id is not null and v_tipo_atual is distinct from v_tipo then
        select * into e from public.nx_estagios where funil_id = new.funil_id and tipo = v_tipo order by ordem limit 1;
      end if;
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

-- ------------------------------------------------------------
-- 7. nx_lead_entrada (S-B3 [C8]): cópia de 20260928g_relatorios_b.sql + limite de contatos do plano
--    (o formulário anônimo nunca vê o erro: {ok:true} sem gravar; o admin recebe UM aviso por dia)
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
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  cli public.nx_clientes;
  v_contato bigint;
  v_funil uuid;
  v_neg bigint;
  v_n int;
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

  -- 3) limite de 30 por hora por cliente (trava por cliente: chamadas simultâneas esperam a vez)
  perform pg_advisory_xact_lock(hashtextextended('nx_lead_entrada:' || cli.id::text, 0));
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
    -- contato NOVO conta no limite de contatos do plano (único caminho que não contava). Plano cheio: o site recebe {ok:true}
    -- sem gravar (formulário anônimo não vê o erro) e os admins recebem um aviso por dia.
    begin
      perform public.nx_exigir_limite(cli.id, 'contatos', 1);
    exception when others then
      if sqlerrm <> 'limite_plano' then raise; end if;
      if not exists (select 1 from public.nx_notificacoes n
                      where n.cliente_id = cli.id and n.tipo = 'sistema'
                        and n.titulo = 'Limite de contatos do plano atingido' and n.criado_em > now() - interval '24 hours') then
        perform public.nx_notificar(cli.id, null, 'sistema', 'Limite de contatos do plano atingido',
          left('Um contato do formulário do site não foi gravado (' || v_nome || '). Libere espaço ou aumente o plano.', 500),
          '#/config');
      end if;
      return json_build_object('ok', true);
    end;
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

  -- 5) negócio no funil padrão (o gatilho acha a etapa 'nova' e completa nome/telefone)
  select f.id into v_funil from public.nx_funis f where f.cliente_id = cli.id and f.padrao and f.ativo limit 1;
  insert into public.nx_leads (cliente_id, nome, telefone, contato_id, origem, servico, obs, funil_id, etapa)
  values (cli.id, v_nome, v_tel, v_contato, 'site', v_serv,
          left(concat_ws(' · ', 'Formulário do site',
                         case when v_utm_s is not null then 'utm_source=' || v_utm_s end,
                         case when v_utm_c is not null then 'utm_campaign=' || v_utm_c end), 5000),
          v_funil, 'nova')
  returning id into v_neg;

  -- 6) mensagem vira nota; avisa os admins
  if v_msg is not null then
    insert into public.nx_notas (cliente_id, contato_id, negocio_id, texto)
    values (cli.id, v_contato, v_neg, left('Mensagem enviada pelo formulário do site: ' || v_msg, 5000));
  end if;
  perform public.nx_notificar(cli.id, null, 'sistema', left('Novo contato pelo site: ' || v_nome, 120),
                              left(concat_ws(' · ', v_serv, v_msg), 500), '#/crm/negocio/' || v_neg);
  return json_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- 8. nx_lead_webhook v2 (S-B1) — MESMA assinatura. Devolve 'existente' | 'atribuido' | 'criado'.
--    Regras: (1) negócio ABERTO do contato (funil padrão primeiro), qualquer idade → mesmo negócio; (2) sem negócio aberto
--    (nunca teve, ou o último está fechado) → nasce um novo; nome = nome do contato no CRM, senão o apelido; a conversa aberta
--    passa a apontar para o negócio novo. p_dias fica na assinatura por compatibilidade (a janela deixou de decidir).
-- ------------------------------------------------------------
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
  v_var1 text;
  v_lead record;
  v_ct public.nx_contatos;
  v_ct_id bigint;
  v_anuncio text := nullif(p_atr ->> 'anuncio_ext', '');
  v_plat text := nullif(p_atr ->> 'plataforma', '');
  v_camp text := nullif(p_atr ->> 'campanha_ext', '');
  v_novo bigint;
begin
  if p_cliente is null or p_hoje is null then raise exception 'parametros_invalidos'; end if;
  if v_tel is null then raise exception 'telefone_invalido'; end if;
  v_var := array(select distinct v from unnest(coalesce(p_variantes, '{}'::text[]) || v_tel) as v where coalesce(v, '') <> '');

  perform pg_advisory_xact_lock(hashtextextended(p_cliente::text || ':' || (select min(v) from unnest(v_var) as v), 0));

  -- 1. o contato (wa_id exato, depois a chave do telefone — as variantes com e sem o 9 caem na mesma chave)
  foreach v_var1 in array v_var loop
    v_ct_id := public.nx_contato_por_tel(p_cliente, v_var1);
    exit when v_ct_id is not null;
  end loop;
  if v_ct_id is not null then
    select * into v_ct from public.nx_contatos where id = v_ct_id and cliente_id = p_cliente;
  end if;

  -- 2. negócio ABERTO do contato (qualquer idade; funil padrão primeiro) ou, sem contato, pelo telefone
  select l.id, l.anuncio_ext into v_lead
    from public.nx_leads l
    left join public.nx_funis f on f.id = l.funil_id
   where l.cliente_id = p_cliente and l.status = 'aberto'
     and ((v_ct.id is not null and l.contato_id = v_ct.id) or l.telefone = any(v_var))
   order by coalesce(f.padrao, false) desc, l.criado_em desc, l.id desc
   limit 1;

  if found then
    -- já está no funil: só completa a atribuição que faltava
    if v_anuncio is null or nullif(v_lead.anuncio_ext, '') is not null then return 'existente'; end if;
    update public.nx_leads set
      anuncio_ext = v_anuncio,
      ctwa_clid = nullif(p_atr ->> 'ctwa_clid', ''),
      campanha_ext = coalesce(v_camp, campanha_ext),
      plataforma = coalesce(v_plat, plataforma),
      origem = case when v_plat is not null then coalesce(nullif(p_atr ->> 'origem', ''), origem) else origem end,
      atualizado_em = now()
    where id = v_lead.id;
    return 'atribuido';
  end if;

  -- 3. sem negócio aberto (nunca teve, ou o último está fechado): nasce um novo (decisão 1)
  -- campanha que o ciclo já conhece (anúncio novo pode não ter métrica ainda: nx_atribuicao_completar completa depois)
  if v_camp is null and v_anuncio is not null and v_plat is not null then
    select m.campanha_ext into v_camp from public.nx_metricas_dia m
     where m.cliente_id = p_cliente and m.plataforma = v_plat and m.nivel = 'anuncio' and m.anuncio_ext = v_anuncio
     order by m.data desc limit 1;
  end if;
  insert into public.nx_leads (cliente_id, contato_id, telefone, nome, origem, plataforma, campanha_ext, anuncio_ext, ctwa_clid,
                               data_conversa, etapa)
  values (p_cliente, v_ct.id, v_tel,
          coalesce(nullif(btrim(coalesce(v_ct.nome, '')), ''), nullif(btrim(coalesce(p_nome, '')), '')),   -- decisão 2
          coalesce(nullif(p_atr ->> 'origem', ''), 'whatsapp'), v_plat, v_camp, v_anuncio, nullif(p_atr ->> 'ctwa_clid', ''),
          p_hoje, 'nova')
  returning id into v_novo;
  if v_ct.id is not null then
    -- 1º toque do contato: só preenche a atribuição vazia (como o gatilho faz quando resolve o contato sozinho)
    update public.nx_contatos k set
      plataforma = coalesce(k.plataforma, v_plat), campanha_ext = coalesce(k.campanha_ext, v_camp),
      anuncio_ext = coalesce(k.anuncio_ext, v_anuncio), ctwa_clid = coalesce(k.ctwa_clid, nullif(p_atr ->> 'ctwa_clid', ''))
     where k.id = v_ct.id
       and ((k.plataforma is null and v_plat is not null) or (k.campanha_ext is null and v_camp is not null)
         or (k.anuncio_ext is null and v_anuncio is not null) or (k.ctwa_clid is null and nullif(p_atr ->> 'ctwa_clid', '') is not null));
    -- a conversa aberta do contato aponta para o negócio novo (nx_wa_entrada pode ter deixado o fechado no negocio_id)
    update public.nx_conversas cv set negocio_id = v_novo, atualizado_em = now()
     where cv.cliente_id = p_cliente and cv.contato_id = v_ct.id and cv.status <> 'resolvida'
       and (cv.negocio_id is null
            or exists (select 1 from public.nx_leads o where o.id = cv.negocio_id and o.status <> 'aberto'));
  end if;
  return 'criado';
end $$;

-- campanha_ext a partir de anuncio_ext quando a métrica do anúncio já existe (leads das primeiras horas de um anúncio novo).
-- Idempotente (só linhas com campanha_ext nula); chamada pelo nx-ciclo depois de sincronizar as métricas. p_cliente nulo = todos.
create or replace function public.nx_atribuicao_completar(p_cliente uuid default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare n_leads int; n_contatos int;
begin
  perform set_config('nx.backfill', '1', true);   -- só preenche uma coluna de atribuição: sem histórico, sem eventos
  with m as (
    select distinct on (x.cliente_id, x.plataforma, x.anuncio_ext) x.cliente_id, x.plataforma, x.anuncio_ext, x.campanha_ext
      from public.nx_metricas_dia x
     where x.nivel = 'anuncio' and x.anuncio_ext <> '' and (p_cliente is null or x.cliente_id = p_cliente)
     order by x.cliente_id, x.plataforma, x.anuncio_ext, x.data desc)
  update public.nx_leads l set campanha_ext = m.campanha_ext
    from m
   where l.cliente_id = m.cliente_id and l.anuncio_ext = m.anuncio_ext and coalesce(l.plataforma, 'meta') = m.plataforma
     and l.campanha_ext is null and (p_cliente is null or l.cliente_id = p_cliente);
  get diagnostics n_leads = row_count;
  with m as (
    select distinct on (x.cliente_id, x.plataforma, x.anuncio_ext) x.cliente_id, x.plataforma, x.anuncio_ext, x.campanha_ext
      from public.nx_metricas_dia x
     where x.nivel = 'anuncio' and x.anuncio_ext <> '' and (p_cliente is null or x.cliente_id = p_cliente)
     order by x.cliente_id, x.plataforma, x.anuncio_ext, x.data desc)
  update public.nx_contatos k set campanha_ext = m.campanha_ext
    from m
   where k.cliente_id = m.cliente_id and k.anuncio_ext = m.anuncio_ext and coalesce(k.plataforma, 'meta') = m.plataforma
     and k.campanha_ext is null and (p_cliente is null or k.cliente_id = p_cliente);
  get diagnostics n_contatos = row_count;
  perform set_config('nx.backfill', '', true);
  return json_build_object('leads', n_leads, 'contatos', n_contatos);
end $$;

-- ------------------------------------------------------------
-- 9. Rastreio do site (S-B2)
-- ------------------------------------------------------------
alter table public.nx_rastreio
  add column if not exists resultado jsonb,                       -- {aplicado, motivo, em, negocio_id, plataforma, origem}
  add column if not exists pendente boolean not null default false; -- código válido que chegou sem negócio: o gatilho aplica depois
create index if not exists nx_rastreio_pendente on public.nx_rastreio(cliente_id, criado_em desc) where pendente;

-- classificação SEM consulta a tabela (serve à atribuição e à listagem): {plataforma, origem, pago}
--   gclid/gbraid/wbraid → google · utm_source google* (medium pago ou campanha) → google
--   utm_source meta/ig/facebook ou fbclid → meta; medium pago → anuncio; sem medium pago → organico (link da bio, post)
--   fora disso: medium pago → anuncio · medium organic/seo → organico · senão site
create or replace function public.nx_rastreio_plataforma(r public.nx_rastreio)
returns jsonb
language plpgsql immutable
security definer
set search_path = ''
as $$
declare
  v_src text := lower(coalesce(r.utm_source, '')); v_med text := lower(coalesce(r.utm_medium, ''));
  v_paid boolean; v_plat text; v_orig text;
  v_meta_src constant text[] := array['facebook', 'fb', 'instagram', 'ig', 'meta', 'facebook_ads', 'meta_ads', 'fb_ads', 'instagram_ads', 'ig_ads'];
  v_google_src constant text[] := array['google', 'adwords', 'googleads', 'google_ads', 'google-ads', 'gads', 'youtube'];
begin
  v_paid := v_med in ('cpc', 'ppc', 'paid', 'paidsocial', 'paid_social', 'paid-social', 'social_paid', 'social-paid', 'display',
                      'cpm', 'ads', 'ad', 'pmax', 'performance_max', 'video', 'remarketing', 'retargeting', 'cpv', 'cpa');
  v_plat := case
    when r.gclid is not null or r.gbraid is not null or r.wbraid is not null then 'google'
    when v_src = any(v_google_src) and (v_paid or r.utm_campaign is not null) then 'google'
    when v_src = any(v_meta_src) or r.fbclid is not null then 'meta'
  end;
  v_orig := case
    when v_plat = 'google' then 'anuncio'
    when v_plat = 'meta' and v_paid then 'anuncio'
    when v_plat = 'meta' then 'organico'
    when v_paid then 'anuncio'
    when v_med in ('organic', 'organico', 'orgânico', 'seo', 'social', 'bio') then 'organico'
    else 'site' end;
  return jsonb_build_object('plataforma', v_plat, 'origem', v_orig, 'pago', v_paid);
end $$;

-- Aplica o código p_rastreio ao negócio p_negocio (núcleo compartilhado por nx_rastreio_atribuir e pelo gatilho).
-- Nunca sobrescreve anúncio (plataforma, anúncio, gclid ou origem 'anuncio'); grava o resultado em nx_rastreio.resultado.
create or replace function public.nx_rastreio_aplicar(p_rastreio bigint, p_negocio bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.nx_rastreio; l public.nx_leads; cls jsonb;
  v_camp_raw text; v_anu_raw text; v_plat text; v_orig text; v_camp text; v_anu text; v_camp_nome text; v_rast jsonb;
begin
  select * into r from public.nx_rastreio where id = p_rastreio for update;
  if r.id is null then return json_build_object('ok', true, 'aplicado', false, 'motivo', 'codigo_desconhecido'); end if;
  select * into l from public.nx_leads where id = p_negocio and cliente_id = r.cliente_id for update;
  if l.id is null then return json_build_object('ok', true, 'aplicado', false, 'motivo', 'sem_negocio'); end if;

  update public.nx_rastreio set usado_em = coalesce(usado_em, now()),
         telefone = coalesce(telefone, nullif(regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g'), '')),
         negocio_id = l.id, pendente = false
   where id = r.id;
  -- o mesmo código repetido pelo mesmo telefone (a fila do fluxo reenvia): já está aplicado
  if l.rastreio ->> 'codigo' = r.codigo then
    return json_build_object('ok', true, 'aplicado', true, 'repetido', true, 'negocio_id', l.id, 'origem', l.origem, 'plataforma', l.plataforma,
      'campanha_ext', l.campanha_ext, 'anuncio_ext', l.anuncio_ext, 'gclid', l.gclid is not null);
  end if;
  if l.plataforma is not null or nullif(l.anuncio_ext, '') is not null or l.gclid is not null or l.origem = 'anuncio' then
    update public.nx_rastreio set resultado = jsonb_build_object('aplicado', false, 'motivo', 'ja_tem_anuncio', 'em', now(), 'negocio_id', l.id) where id = r.id;
    return json_build_object('ok', true, 'aplicado', false, 'motivo', 'ja_tem_anuncio', 'negocio_id', l.id);
  end if;
  if l.origem not in ('whatsapp', 'site') then
    update public.nx_rastreio set resultado = jsonb_build_object('aplicado', false, 'motivo', 'origem_definida', 'em', now(), 'negocio_id', l.id) where id = r.id;
    return json_build_object('ok', true, 'aplicado', false, 'motivo', 'origem_definida', 'negocio_id', l.id);
  end if;

  cls := public.nx_rastreio_plataforma(r);
  v_plat := cls ->> 'plataforma'; v_orig := cls ->> 'origem';
  v_camp_raw := r.utm_campaign; v_anu_raw := r.utm_content;
  if v_plat is not null then
    if v_camp_raw is not null then
      select m.campanha_ext, m.campanha_nome into v_camp, v_camp_nome from public.nx_metricas_dia m
       where m.cliente_id = r.cliente_id and m.plataforma = v_plat
         and (m.campanha_ext = v_camp_raw or lower(m.campanha_nome) = lower(v_camp_raw))
       order by (m.campanha_ext = v_camp_raw) desc, m.data desc limit 1;
      -- utm_campaign que casa com uma campanha conhecida é anúncio, mesmo sem utm_medium pago
      if v_camp is not null then v_orig := 'anuncio'; end if;
      v_camp := coalesce(v_camp, left(v_camp_raw, 100));
    end if;
    if v_anu_raw is not null then
      select m.anuncio_ext into v_anu from public.nx_metricas_dia m
       where m.cliente_id = r.cliente_id and m.plataforma = v_plat and m.nivel = 'anuncio' and m.anuncio_ext <> ''
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
  where c.id = l.contato_id and c.cliente_id = r.cliente_id;
  update public.nx_rastreio set resultado = jsonb_strip_nulls(jsonb_build_object('aplicado', true, 'motivo', 'aplicado', 'em', now(),
    'negocio_id', l.id, 'plataforma', v_plat, 'origem', v_orig, 'campanha_ext', v_camp)) where id = r.id;
  return json_build_object('ok', true, 'aplicado', true, 'negocio_id', l.id, 'origem', v_orig, 'plataforma', v_plat,
    'campanha_ext', v_camp, 'campanha_nome', v_camp_nome, 'anuncio_ext', v_anu, 'gclid', r.gclid is not null);
end $$;

-- Código achado no texto da 1ª mensagem → atribuição do negócio do contato. MESMA assinatura.
-- Aceita canal CodeWords E Meta Cloud; o alvo é o contato (wa_id/chave do telefone) + negócio ABERTO (funil padrão primeiro).
-- Sem negócio: guarda telefone + pendente (o gatilho aplica quando o negócio nascer, em até 30 dias).
create or replace function public.nx_rastreio_atribuir(p_canal uuid, p_telefone text, p_codigo text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.nx_canais; r public.nx_rastreio;
  v_cod text := upper(btrim(coalesce(p_codigo, '')));
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_ct bigint; v_neg bigint;
begin
  select * into k from public.nx_canais where id = p_canal and coalesce(provedor, 'meta') in ('codewords', 'meta');
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
  update public.nx_rastreio set telefone = v_tel where id = r.id;
  -- alvo: contato pelo telefone (wa_id exato, depois a chave) + negócio aberto mais recente (funil padrão primeiro)
  v_ct := public.nx_contato_por_tel(k.cliente_id, v_tel);
  if v_ct is not null then
    select l.id into v_neg from public.nx_leads l left join public.nx_funis f on f.id = l.funil_id
     where l.cliente_id = k.cliente_id and l.contato_id = v_ct and l.status = 'aberto'
     order by coalesce(f.padrao, false) desc, l.criado_em desc, l.id desc limit 1;
  end if;
  if v_neg is null then
    update public.nx_rastreio set pendente = true,
           resultado = jsonb_build_object('aplicado', false, 'motivo', 'sem_negocio', 'em', now(), 'pendente', true)
     where id = r.id;
    return json_build_object('ok', true, 'aplicado', false, 'motivo', 'sem_negocio', 'pendente', true);
  end if;
  return public.nx_rastreio_aplicar(r.id, v_neg);
end $$;

-- Gatilho: negócio que nasce para um telefone com código pendente (últimos 30 dias) recebe a atribuição do site.
create or replace function public.nx_tg_rastreio_pendente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare r public.nx_rastreio; v_tel text;
begin
  if current_setting('nx.backfill', true) = '1' then return null; end if;
  if new.status <> 'aberto' then return null; end if;
  v_tel := regexp_replace(coalesce(new.telefone, (select k.telefone from public.nx_contatos k where k.id = new.contato_id), ''), '\D', '', 'g');
  if length(v_tel) < 8 then return null; end if;
  select * into r from public.nx_rastreio x
   where x.cliente_id = new.cliente_id and x.pendente and x.telefone is not null
     and right(x.telefone, 8) = right(v_tel, 8) and x.criado_em > now() - interval '30 days'
   order by x.criado_em desc limit 1
   for update skip locked;
  if r.id is null then return null; end if;
  perform public.nx_rastreio_aplicar(r.id, new.id);
  return null;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.nx_leads'::regclass and t.tgname = 'nx_rastreio_pendente') then
    create trigger nx_rastreio_pendente after insert on public.nx_leads
      for each row execute function public.nx_tg_rastreio_pendente();
  end if;
end $$;

-- nx_rastreio_registrar: cópia de 20261001b_correcoes.sql + limites 120/min e 1 000/h + modo teste (não grava)
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
  v_teste boolean := coalesce(d ->> 'teste', '') in ('1', 'true');
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
  -- botão «Testar» do painel: prova que a chave e o cliente estão certos SEM gravar nem gastar o limite
  if v_teste then return json_build_object('ok', true, 'codigo', public.nx_rastreio_codigo_novo(), 'teste', true); end if;

  perform pg_advisory_xact_lock(hashtextextended('nx_rastreio:' || cli.id::text, 0));
  select count(*) filter (where r.criado_em > now() - interval '1 minute')::int, count(*)::int into v_min, v_hora
    from public.nx_rastreio r where r.cliente_id = cli.id and r.criado_em > now() - interval '1 hour';
  if v_min >= 120 or v_hora >= 1000 then raise exception 'limite_taxa' using errcode = '22023'; end if;
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

-- Painel «Rastreio do site» (admin+): últimos cliques (≤ 500), se casaram e por quê — SEM o código (ele é a chave da atribuição).
create or replace function public.nx_rastreio_listar(p_token text, p_cliente uuid, p_dias int default 30)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  v_dias int := least(greatest(coalesce(p_dias, 30), 1), 90);
  v_de timestamptz := now() - make_interval(days => least(greatest(coalesce(p_dias, 30), 1), 90));
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  return json_build_object(
    'dias', v_dias,
    'itens', coalesce((
      select json_agg(json_build_object(
          'em', r.criado_em, 'pagina', r.pagina,
          'utm_source', r.utm_source, 'utm_medium', r.utm_medium, 'utm_campaign', r.utm_campaign, 'utm_content', r.utm_content,
          'plataforma', coalesce(r.resultado ->> 'plataforma', public.nx_rastreio_plataforma(r) ->> 'plataforma'),
          'origem', coalesce(r.resultado ->> 'origem', public.nx_rastreio_plataforma(r) ->> 'origem'),
          'casou', coalesce((r.resultado ->> 'aplicado')::boolean, false),
          'motivo', case when r.pendente then 'pendente' else r.resultado ->> 'motivo' end,
          'usado_em', r.usado_em, 'negocio_id', r.negocio_id,
          'contato_nome', (select coalesce(k.nome, l.nome) from public.nx_leads l
                             left join public.nx_contatos k on k.id = l.contato_id
                            where l.id = r.negocio_id and l.cliente_id = p_cliente))
        order by r.criado_em desc)
        from (select * from public.nx_rastreio x where x.cliente_id = p_cliente and x.criado_em >= v_de
               order by x.criado_em desc limit 500) r), '[]'::json),
    'totais', (select json_build_object(
          'cliques', count(*),
          'casados', count(*) filter (where coalesce((x.resultado ->> 'aplicado')::boolean, false)),
          'usados', count(*) filter (where x.usado_em is not null),
          'pendentes', count(*) filter (where x.pendente))
        from public.nx_rastreio x where x.cliente_id = p_cliente and x.criado_em >= v_de));
end $$;

-- ------------------------------------------------------------
-- 10. Permissões (as funções reescritas mantêm as que já tinham; as novas: internas só service_role, painel anon + service_role)
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('nx_ddd_valido', 'nx_tel_chave_backfill', 'nx_atribuicao_completar', 'nx_rastreio_plataforma',
                         'nx_rastreio_aplicar', 'nx_tg_rastreio_pendente', 'nx_rastreio_listar')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    if r.proname = 'nx_rastreio_listar' then
      execute format('grant execute on function %s to anon, service_role', r.fn);
    else
      execute format('grant execute on function %s to service_role', r.fn);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 11. Versão
-- ------------------------------------------------------------
insert into public.nx_versao_banco (nome) values ('20261008a_entrada_lead_rastreio')
on conflict (nome) do update set aplicada_em = now();

notify pgrst, 'reload schema';
