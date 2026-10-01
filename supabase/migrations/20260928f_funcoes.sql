-- ============================================================
-- ÓRBITA — supabase/migrations/20260928f_funcoes.sql · frente F2
-- Internas das Edge Functions (ESPEC §5.5) + nx_disparar ampliado (§4.11).
-- TODAS internas: só service_role (as Edge Functions); nada para anon.
-- Regra de isolamento (A2): toda interna que recebe id vindo do corpo de
-- uma requisição recebe também p_cliente (e p_ctx quando há usuário) e
-- confere que o id é desse cliente (e visível, para conversa). Senão:
-- *_nao_encontrad[oa] — a Edge Function responde 404 ANTES de chamar
-- Graph, Storage ou Anthropic.
-- Erros: '42501' = acesso, '22023' = dados (o PostgREST devolve message/hint).
-- Idempotente: só create or replace. Depende do arquivo a (F1).
-- nx_cv_distribuir é da F5 (arquivo e): chamada só se já existir.
-- ============================================================

-- ------------------------------------------------------------
-- utilitárias locais (prefixo nx_wa_: donas da F2)
-- ------------------------------------------------------------

-- resumo curto de uma mensagem para a lista de conversas (≤ 140)
create or replace function public.nx_wa_resumo(p_tipo text, p_corpo text)
returns text
language plpgsql immutable
security definer
set search_path = ''
as $$
declare
  v_rot text := case p_tipo
    when 'imagem' then 'Foto' when 'audio' then 'Áudio' when 'video' then 'Vídeo'
    when 'documento' then 'Documento' when 'sticker' then 'Figurinha' when 'localizacao' then 'Localização'
    when 'contato' then 'Contato' when 'template' then 'Modelo' when 'desconhecido' then 'Mensagem'
    else null end;
  v_c text := nullif(btrim(regexp_replace(coalesce(p_corpo, ''), '\s+', ' ', 'g')), '');
begin
  if p_tipo in ('imagem', 'audio', 'video', 'documento', 'sticker') then
    return left(v_rot || coalesce(': ' || v_c, ''), 140);
  end if;
  return left(coalesce(v_c, v_rot, ''), 140);
end $$;

-- mensagem no formato `Mensagem` de §5.1. Usa a montadora da F5 (nx_cv_json_msg, arquivo e)
-- quando existe — o painel recebe da nx-enviar EXATAMENTE o mesmo item do nx_cv_mensagens
-- (o mesclarDelta deduplica por id); sem ela, o mesmo formato montado aqui.
create or replace function public.nx_wa_msg_json(p_id bigint)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_m public.nx_mensagens;
begin
  if to_regprocedure('public.nx_cv_json_msg(public.nx_mensagens)') is not null then
    select * into v_m from public.nx_mensagens where id = p_id;
    if v_m.id is null then return null; end if;
    return public.nx_cv_json_msg(v_m)::json;
  end if;
  return (
    select json_build_object(
      'id', m.id, 'conversa_id', m.conversa_id, 'direcao', m.direcao, 'tipo', m.tipo, 'wamid', m.wamid, 'corpo', m.corpo,
      'midia', m.midia, 'status', m.status, 'erro', m.erro,
      'enviado_por', case when k.id is not null then json_build_object('id', k.id, 'nome', k.nome) end,
      'origem', m.origem,
      'responde_a', (select json_build_object('id', r.id, 'direcao', r.direcao,
                                              'resumo', public.nx_wa_resumo(r.tipo, r.corpo))
                       from public.nx_mensagens r
                      where m.responde_a_wamid is not null and r.wamid = m.responde_a_wamid
                        and r.cliente_id = m.cliente_id and r.contato_id = m.contato_id
                      limit 1),
      'reacao', m.reacao, 'template', m.template, 'referral', m.referral,
      'criado_em', m.criado_em, 'atualizado_em', m.atualizado_em)
      from public.nx_mensagens m left join public.nx_contas k on k.id = m.enviado_por
     where m.id = p_id);
end $$;

-- ------------------------------------------------------------
-- Canais
-- ------------------------------------------------------------

-- Só o webhook usa: pela chave pública da URL (?c=) ou pelo phone_number_id
-- de um evento JÁ autenticado com o segredo global.
create or replace function public.nx_wa_canal(p_phone_number_id text default null, p_chave text default null)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
declare k public.nx_canais; v_slug text;
begin
  if nullif(btrim(coalesce(p_chave, '')), '') is not null then
    select * into k from public.nx_canais where chave_publica = btrim(p_chave);
  elsif nullif(btrim(coalesce(p_phone_number_id, '')), '') is not null then
    select * into k from public.nx_canais where phone_number_id = btrim(p_phone_number_id);
  end if;
  if k.id is null then return null; end if;
  select c.slug into v_slug from public.nx_clientes c where c.id = k.cliente_id;
  return json_build_object(
    'canal_id', k.id, 'cliente_id', k.cliente_id, 'cliente_slug', v_slug,
    'phone_number_id', k.phone_number_id, 'waba_id', k.waba_id, 'verify_token', k.verify_token,
    'app_secret', public.nx_segredo_ler(k.app_secret_segredo),
    'tem_token', k.token_segredo is not null, 'status', k.status);
end $$;

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
    'app_secret', public.nx_segredo_ler(k.app_secret_segredo));
end $$;

-- resultado do teste do número (§6.3): ativo ⇔ número respondeu E app inscrito na WABA
create or replace function public.nx_canal_verificado(p_canal uuid, p_cliente uuid, p_ok boolean, p_numero text,
                                                      p_qualidade text, p_inscrito boolean, p_erro text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare k public.nx_canais;
begin
  update public.nx_canais set
    numero_exibicao = coalesce(nullif(left(btrim(coalesce(p_numero, '')), 40), ''), numero_exibicao),
    qualidade = case when coalesce(p_ok, false) then left(p_qualidade, 40) else qualidade end,
    app_inscrito = case when coalesce(p_ok, false) then p_inscrito else app_inscrito end,
    verificado_em = now(),
    ultimo_erro = case when coalesce(p_ok, false) and coalesce(p_inscrito, false) then null
                       else left(coalesce(nullif(btrim(coalesce(p_erro, '')), ''), 'falhou'), 500) end,
    status = case when coalesce(p_ok, false) and coalesce(p_inscrito, false) then 'ativo'
                  when coalesce(p_ok, false) then 'pendente' else 'erro' end
  where id = p_canal and cliente_id = p_cliente
  returning * into k;
  if k.id is null then
    raise exception 'canal_nao_encontrado' using errcode = '22023';
  end if;
  return json_build_object('id', k.id, 'nome', k.nome, 'status', k.status, 'app_inscrito', k.app_inscrito,
                           'numero_exibicao', k.numero_exibicao, 'qualidade', k.qualidade,
                           'verificado_em', k.verificado_em, 'ultimo_erro', k.ultimo_erro);
end $$;

-- ------------------------------------------------------------
-- Entrada de mensagem (webhook) — §5.5 nx_wa_entrada
-- p_msg = normalizarMensagem (§6.2): {wamid, wa_id, nome, tipo, corpo, midia, responde_a_wamid,
--         referral, reacao:{wamid, emoji}, em}
-- Nunca lança erro por tamanho: todo texto externo é cortado antes de gravar.
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
  v_chave text;
  v_ad boolean; v_anuncio text; v_campanha text; v_clid text;
  ct public.nx_contatos;
  cv public.nx_conversas;
  v_dep public.nx_departamentos;
  v_dep_id uuid;
  v_id bigint; v_ex record;
  v_nova boolean := false; v_optout boolean := false; v_pend boolean := false;
  v_midia jsonb; v_fila bigint; v_norm text; v_txt text; v_resumo text;
  v_reacao_msg bigint; v_reacao_cv bigint;
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
      wa_id = v_wa,
      ultimo_contato_em = now(),
      plataforma = case when plataforma is null and v_ad then 'meta' else plataforma end,
      campanha_ext = case when plataforma is null and v_ad then v_campanha else campanha_ext end,
      anuncio_ext = case when plataforma is null and v_ad then v_anuncio else anuncio_ext end,
      ctwa_clid = case when plataforma is null and v_ad then v_clid else ctwa_clid end
    where id = ct.id
    returning * into ct;
  end if;

  -- (2) reação: só grava o emoji na mensagem alvo (do mesmo cliente E da conversa com
  -- ESTE contato — ninguém reage a mensagem da conversa de outra pessoa) e sai
  if jsonb_typeof(v_msg -> 'reacao') = 'object' then
    update public.nx_mensagens m
       set reacao = nullif(left(coalesce(v_msg -> 'reacao' ->> 'emoji', ''), 16), '')
     where m.wamid = nullif(left(coalesce(v_msg -> 'reacao' ->> 'wamid', ''), 256), '')
       and m.cliente_id = v_cli and m.contato_id = ct.id
    returning m.id, m.conversa_id into v_reacao_msg, v_reacao_cv;
    return json_build_object('mensagem_id', v_reacao_msg, 'conversa_id', v_reacao_cv, 'contato_id', ct.id,
                             'nova_conversa', false, 'duplicada', false, 'bloqueado', ct.bloqueado,
                             'optout', false, 'midia_pendente', false, 'fila_id', null, 'reacao', true);
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
                                     wamid, responde_a_wamid, status, referral)
    values (v_cli, cv.id, ct.id, p_canal, 'in', v_tipo, v_corpo, v_midia, v_wamid, v_resp, 'recebida', v_ref)
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
                                   wamid, responde_a_wamid, status, referral)
  values (v_cli, cv.id, ct.id, p_canal, 'in', v_tipo, v_corpo, v_midia, v_wamid, v_resp, 'recebida', v_ref)
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
        insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status)
        values (v_cli, cv.id, ct.id, p_canal, 'out', 'sistema',
                'Contato pediu para não receber mensagens de marketing', 'enviada');
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
-- Recibos de entrega dos números dos clientes — §5.5 nx_wa_status
-- Só mensagens DAQUELE canal e do cliente dele; sem regressão.
-- ------------------------------------------------------------
create or replace function public.nx_wa_status(p_canal uuid, p_statuses jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cli uuid; s jsonb; v_novo text; m record; v_erro text;
  v_at int := 0; v_fa int := 0; v_ig int := 0;
  v_rank_novo int; v_rank_atual int;
begin
  select k.cliente_id into v_cli from public.nx_canais k where k.id = p_canal;
  if v_cli is null then
    raise exception 'canal_nao_encontrado' using errcode = '22023';
  end if;
  if jsonb_typeof(p_statuses) is distinct from 'array' then
    return json_build_object('atualizados', 0, 'falhas', 0, 'ignorados', 0);
  end if;
  for s in select x from jsonb_array_elements(p_statuses) x loop
    v_novo := case s ->> 'status' when 'sent' then 'enviada' when 'delivered' then 'entregue'
                                  when 'read' then 'lida' when 'failed' then 'falhou' end;
    if v_novo is null or nullif(s ->> 'id', '') is null then v_ig := v_ig + 1; continue; end if;
    select x.id, x.status into m from public.nx_mensagens x
     where x.wamid = left(s ->> 'id', 256) and x.canal_id = p_canal and x.cliente_id = v_cli and x.direcao = 'out'
     for update;
    if not found then v_ig := v_ig + 1; continue; end if;
    if v_novo = 'falhou' then
      if m.status in ('entregue', 'lida', 'falhou') then v_ig := v_ig + 1; continue; end if;
      v_erro := left(coalesce(nullif(btrim(coalesce(s ->> 'erro_texto', '')), ''),
                              'WhatsApp não entregou (código ' || coalesce(s -> 'errors' -> 0 ->> 'code', '?') || '): '
                              || coalesce(nullif(s -> 'errors' -> 0 ->> 'title', ''), 'falhou')), 500);
      update public.nx_mensagens set status = 'falhou', erro = v_erro where id = m.id;
      v_fa := v_fa + 1;
    else
      v_rank_novo := case v_novo when 'enviada' then 1 when 'entregue' then 2 when 'lida' then 3 end;
      v_rank_atual := case m.status when 'pendente' then 0 when 'enviada' then 1 when 'falhou' then 1
                                    when 'entregue' then 2 when 'lida' then 3 else 9 end;
      if v_rank_novo <= v_rank_atual then v_ig := v_ig + 1; continue; end if;
      update public.nx_mensagens
         set status = v_novo, erro = case when m.status = 'falhou' then null else erro end
       where id = m.id;
      v_at := v_at + 1;
    end if;
  end loop;
  return json_build_object('atualizados', v_at, 'falhas', v_fa, 'ignorados', v_ig);
end $$;

-- mídia recebida baixada (ou não) em segundo plano pelo webhook
create or replace function public.nx_wa_midia_ok(p_mensagem bigint, p_cliente uuid, p_path text, p_tamanho int,
                                                 p_erro text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint; v_ok boolean := nullif(btrim(coalesce(p_erro, '')), '') is null;
begin
  if v_ok and (p_path is null or left(p_path, 37) <> p_cliente::text || '/' or p_path ~ '\.\.') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'path';
  end if;
  update public.nx_mensagens set midia = coalesce(midia, '{}'::jsonb) || case when v_ok
      then jsonb_build_object('estado', 'ok', 'path', p_path, 'tamanho', p_tamanho)
      else jsonb_build_object('estado', 'falhou', 'erro', left(p_erro, 300)) end
   where id = p_mensagem and cliente_id = p_cliente
  returning id into v_id;
  if v_id is null then
    raise exception 'mensagem_nao_encontrada' using errcode = '22023';
  end if;
  return json_build_object('ok', true, 'estado', case when v_ok then 'ok' else 'falhou' end);
end $$;

-- ------------------------------------------------------------
-- Saída (painel, fila, sistema) — §5.5 nx_cv_saida
-- ------------------------------------------------------------
create or replace function public.nx_cv_saida(p_conta uuid, p_cliente uuid, p_conversa bigint, p_msg jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  cv public.nx_conversas;
  v_msg jsonb := coalesce(p_msg, '{}'::jsonb);
  v_tipo text := coalesce(nullif(v_msg ->> 'tipo', ''), 'texto');
  v_status text := coalesce(nullif(v_msg ->> 'status', ''), 'enviada');
  v_corpo text := left(v_msg ->> 'corpo', 4096);
  v_wamid text := nullif(left(btrim(coalesce(v_msg ->> 'wamid', '')), 256), '');
  v_resp text := nullif(left(btrim(coalesce(v_msg ->> 'responde_a_wamid', '')), 256), '');
  v_origem text := nullif(v_msg ->> 'origem', '');
  v_id bigint;
begin
  select * into cv from public.nx_conversas where id = p_conversa and cliente_id = p_cliente for update;
  if cv.id is null then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  if v_tipo not in ('texto', 'imagem', 'audio', 'video', 'documento', 'sticker', 'localizacao', 'contato',
                    'interativo', 'template') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'tipo';
  end if;
  if v_status not in ('pendente', 'enviada', 'entregue', 'lida', 'falhou') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'status';
  end if;
  if v_origem = 'lista' then v_origem := 'automacao'; end if;
  if v_origem is not null and v_origem not in ('painel', 'automacao', 'fora_horario', 'agendada', 'ia') then
    v_origem := null;
  end if;
  v_origem := coalesce(v_origem, case when p_conta is not null then 'painel' end);
  -- citação só de mensagem do MESMO contato neste cliente
  if v_resp is not null and not exists (select 1 from public.nx_mensagens r
                                          where r.wamid = v_resp and r.cliente_id = p_cliente
                                            and r.contato_id = cv.contato_id) then
    v_resp := null;
  end if;

  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, midia, wamid,
                                   responde_a_wamid, status, erro, enviado_por, origem, template)
  values (p_cliente, cv.id, cv.contato_id, cv.canal_id, 'out', v_tipo, v_corpo,
          case when jsonb_typeof(v_msg -> 'midia') = 'object' then v_msg -> 'midia' end,
          v_wamid, v_resp, v_status, left(v_msg ->> 'erro', 500), p_conta, v_origem,
          case when jsonb_typeof(v_msg -> 'template') = 'object' then v_msg -> 'template' end)
  on conflict (wamid) do nothing
  returning id into v_id;
  if v_id is null then
    -- mesmo wamid já gravado (repetição): devolve o que está lá, se for deste cliente
    select m.id into v_id from public.nx_mensagens m where m.wamid = v_wamid and m.cliente_id = p_cliente;
    if v_id is null then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'wamid';
    end if;
    return public.nx_wa_msg_json(v_id);
  end if;

  -- Resposta HUMANA tira de "aguardando" e marca a 1ª resposta. Mensagem automática
  -- (fora do horário, automação) não: o cliente continua esperando uma pessoa.
  update public.nx_conversas set
    ultima_msg_em = now(),
    ultima_msg_resumo = public.nx_wa_resumo(v_tipo, v_corpo),
    ultima_msg_dir = 'out',
    aguardando = case when p_conta is not null and v_status <> 'falhou' then false else aguardando end,
    primeira_resposta_em = case when p_conta is not null and v_status <> 'falhou'
                                then coalesce(primeira_resposta_em, now()) else primeira_resposta_em end,
    atualizado_em = now()
  where id = cv.id;
  update public.nx_contatos set ultimo_contato_em = now() where id = cv.contato_id;
  return public.nx_wa_msg_json(v_id);
end $$;

-- contexto de envio do painel: conversa do cliente E visível ao usuário (A2)
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
                                                              'tem_token', k.token_segredo is not null) end,
    'janela_aberta', coalesce(cv.ultima_entrada_em > now() - interval '24 hours', false),
    'ultimo_wamid_in', (select m.wamid from public.nx_mensagens m
                         where m.conversa_id = cv.id and m.direcao = 'in' and m.wamid is not null
                         order by m.id desc limit 1),
    'cfg_cv', jsonb_build_object('recibo_leitura', true, 'assinatura', false)
              || case when jsonb_typeof(c.cfg -> 'cv') = 'object' then c.cfg -> 'cv' else '{}'::jsonb end,
    'atendente_nome', (select x.nome from public.nx_contas x where x.id = v.conta_id),
    'empresa', c.nome);
end $$;

-- P1 (ação reenviar): mensagem de texto que falhou, do cliente e de conversa visível
create or replace function public.nx_cv_msg_reenvio(p_ctx jsonb, p_cliente uuid, p_mensagem bigint)
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
   where id = p_mensagem and cliente_id = p_cliente and direcao = 'out' and tipo = 'texto' and status = 'falhou';
  if m.id is null or not public.nx_cv_visivel(v, p_cliente, m.conversa_id) then
    raise exception 'mensagem_nao_encontrada' using errcode = '22023';
  end if;
  return json_build_object('conversa_id', m.conversa_id, 'corpo', m.corpo, 'responde_a_wamid', m.responde_a_wamid);
end $$;

-- ------------------------------------------------------------
-- Fila de envios (automações, fora do horário, agendadas) — §5.5
-- Sem p_ids: pendentes vencidas. Com p_ids: SÓ esses e só se ainda pendentes.
-- skip locked + marcação 'enviando': webhook e cron nunca pegam o mesmo item.
-- ------------------------------------------------------------
create or replace function public.nx_fila_pegar(p_limite int default 20, p_ids bigint[] default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v_ids bigint[]; v_lim int := greatest(1, least(coalesce(p_limite, 20), 100)); v json;
begin
  if p_ids is null then
    select array_agg(s.id) into v_ids from (
      select f.id from public.nx_envios_fila f
       where f.status = 'pendente' and f.enviar_em <= now()
       order by f.enviar_em, f.id
       limit v_lim
       for update skip locked) s;
  else
    select array_agg(s.id) into v_ids from (
      select f.id from public.nx_envios_fila f
       where f.id = any(p_ids) and f.status = 'pendente'
       order by f.id
       limit v_lim
       for update skip locked) s;
  end if;
  if v_ids is null then return '[]'::json; end if;

  update public.nx_envios_fila set status = 'enviando', tentativas = tentativas + 1 where id = any(v_ids);

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
    ) order by f.id), '[]'::json)
    into v
    from public.nx_envios_fila f
    left join public.nx_conversas cv on cv.id = f.conversa_id and cv.cliente_id = f.cliente_id
    left join public.nx_contatos ct on ct.id = coalesce(f.contato_id, cv.contato_id) and ct.cliente_id = f.cliente_id
   where f.id = any(v_ids);
  return v;
end $$;

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
  update public.nx_envios_fila set
    status = p_status,
    erro = left(nullif(btrim(coalesce(p_erro, '')), ''), 500),
    mensagem_id = coalesce(p_mensagem, mensagem_id),
    processado_em = case when p_status = 'pendente' then null else now() end
  where id = p_id;
  get diagnostics v_n = row_count;
  return json_build_object('ok', v_n = 1);
end $$;

-- ------------------------------------------------------------
-- Modelos (templates) da WABA
-- ------------------------------------------------------------
create or replace function public.nx_templates_gravar(p_canal uuid, p_cliente uuid, p_lista jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare t jsonb; v_corpo text; v_num int; v_n int := 0; v_nome text; v_idioma text; v_nomes text[];
        v_ini timestamptz := clock_timestamp();
begin
  if not exists (select 1 from public.nx_canais k where k.id = p_canal and k.cliente_id = p_cliente) then
    raise exception 'canal_nao_encontrado' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lista) is distinct from 'array' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'lista';
  end if;
  for t in select x from jsonb_array_elements(p_lista) x loop
    v_nome := nullif(left(btrim(coalesce(t ->> 'name', t ->> 'nome', '')), 512), '');
    v_idioma := nullif(left(btrim(coalesce(t ->> 'language', t ->> 'idioma', '')), 20), '');
    continue when v_nome is null or v_idioma is null;
    select c ->> 'text' into v_corpo
      from jsonb_array_elements(case when jsonb_typeof(t -> 'components') = 'array' then t -> 'components'
                                     else '[]'::jsonb end) c
     where upper(c ->> 'type') = 'BODY' limit 1;
    -- parâmetros: {{1}} {{2}} … (posicionais) ou {{nome}} (nomeados, contados sem repetir)
    select array_agg(distinct m[1]) into v_nomes
      from regexp_matches(coalesce(v_corpo, ''), '\{\{\s*([A-Za-z0-9_]+)\s*\}\}', 'g') m;
    v_num := coalesce((select max(x::int) from unnest(v_nomes) x where x ~ '^\d{1,3}$'), 0);
    if v_num = 0 then v_num := coalesce(cardinality(v_nomes), 0); end if;
    insert into public.nx_templates as x (cliente_id, canal_id, nome, idioma, categoria, status, componentes, corpo,
                                          num_parametros, sincronizado_em)
    values (p_cliente, p_canal, v_nome, v_idioma, left(t ->> 'category', 40), left(t ->> 'status', 40),
            case when jsonb_typeof(t -> 'components') = 'array' then t -> 'components' else '[]'::jsonb end,
            left(v_corpo, 4096), v_num, clock_timestamp())
    on conflict (canal_id, nome, idioma) do update set
      categoria = excluded.categoria, status = excluded.status, componentes = excluded.componentes,
      corpo = excluded.corpo, num_parametros = excluded.num_parametros, sincronizado_em = clock_timestamp();
    v_n := v_n + 1;
  end loop;
  -- lista completa (a função busca até 5 páginas de 100): o que sumiu da WABA não é mais oferecido
  if jsonb_array_length(p_lista) < 500 then
    update public.nx_templates set status = 'DELETED'
     where canal_id = p_canal and cliente_id = p_cliente and sincronizado_em < v_ini
       and status is distinct from 'DELETED';
  end if;
  return json_build_object('total', v_n);
end $$;

create or replace function public.nx_template_ver(p_cliente uuid, p_template uuid, p_canal uuid)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
declare t public.nx_templates;
begin
  select * into t from public.nx_templates
   where id = p_template and cliente_id = p_cliente and canal_id = p_canal and status = 'APPROVED';
  if t.id is null then
    raise exception 'template_invalido' using errcode = '22023';
  end if;
  return json_build_object('id', t.id, 'nome', t.nome, 'idioma', t.idioma, 'categoria', t.categoria,
                           'corpo', t.corpo, 'num_parametros', t.num_parametros, 'componentes', t.componentes);
end $$;

-- ------------------------------------------------------------
-- IA (nx-ia) — contexto, cota, registro
-- ------------------------------------------------------------
create or replace function public.nx_ia_contexto(p_ctx jsonb, p_cliente uuid, p_conversa bigint, p_limite int default 30)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := jsonb_populate_record(null::public.nx_ctx_t, coalesce(p_ctx, '{}'::jsonb));
  cv public.nx_conversas; c public.nx_clientes; r record;
  v_itens jsonb[] := '{}'; v_tam int := 0; v_txt text; v_quem text; v_contato text;
  v_ocultas bigint[] := '{}';
begin
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  select * into cv from public.nx_conversas where id = p_conversa and cliente_id = p_cliente;
  select * into c from public.nx_clientes where id = p_cliente;
  select k.nome into v_contato from public.nx_contatos k where k.id = cv.contato_id and k.cliente_id = p_cliente;
  -- mesma regra do nx_cv_mensagens (F5): conversa OCULTA só para supervisor+; abaixo disso,
  -- as mensagens dela não entram no histórico que vai para a IA
  if public.nx_rank(v.papel) < 2 then
    select coalesce(array_agg(x.id), '{}'::bigint[]) into v_ocultas from public.nx_conversas x
     where x.cliente_id = p_cliente and x.contato_id = cv.contato_id and x.oculta;
  end if;
  -- histórico contínuo do contato (mais novas primeiro, até 12 KB); notas internas e
  -- mensagens de sistema NÃO entram
  for r in
    select m.direcao, m.tipo, m.corpo, m.criado_em, m.origem, x.nome as autor
      from public.nx_mensagens m left join public.nx_contas x on x.id = m.enviado_por
     where m.contato_id = cv.contato_id and m.cliente_id = p_cliente and m.tipo not in ('nota', 'sistema')
       and not (m.conversa_id = any(v_ocultas))
     order by m.id desc
     limit greatest(1, least(coalesce(p_limite, 30), 100))
  loop
    v_txt := left(case when r.tipo = 'texto' then coalesce(r.corpo, '')
                       else '[' || public.nx_wa_resumo(r.tipo, null) || ']' || coalesce(' ' || nullif(r.corpo, ''), '') end,
                  1500);
    v_quem := case when r.direcao = 'in' then 'cliente'
                   else coalesce(nullif(split_part(coalesce(r.autor, ''), ' ', 1), ''),
                                 case when r.origem = 'automacao' then 'automação' else 'equipe' end) end;
    exit when v_tam + octet_length(v_txt) > 12000;
    v_tam := v_tam + octet_length(v_txt);
    v_itens := array_prepend(jsonb_build_object('dir', r.direcao, 'quem', v_quem, 'texto', v_txt, 'em', r.criado_em),
                             v_itens);
  end loop;
  return json_build_object(
    'empresa', c.nome, 'vertical', c.vertical,
    'org_assinatura', (select o.marca ->> 'assinatura' from public.nx_orgs o where o.id = c.org_id),
    'ia', case when jsonb_typeof(c.cfg -> 'ia') = 'object' then c.cfg -> 'ia' else '{}'::jsonb end,
    'contato_nome', v_contato,
    'atendente_nome', (select x.nome from public.nx_contas x where x.id = v.conta_id),
    'conversa_id', cv.id,
    'mensagens', to_jsonb(v_itens));
end $$;

-- cota de IA do mês (fuso SP) e ritmo da conta no último minuto
create or replace function public.nx_ia_cota(p_cliente uuid, p_conta uuid default null)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return json_build_object(
    'usadas', public.nx_uso(p_cliente, 'ia_mes'),
    'limite', public.nx_limite(p_cliente, 'ia_mes'),
    'conta_minuto', case when p_conta is null then 0 else
      (select count(*) from public.nx_ia_uso u
        where u.cliente_id = p_cliente and u.conta_id = p_conta and u.criado_em > now() - interval '1 minute') end);
end $$;

create or replace function public.nx_ia_registrar(p_cliente uuid, p_conta uuid, p_acao text, p_modelo text,
                                                  p_in int, p_out int, p_ok boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.nx_ia_uso (cliente_id, conta_id, acao, modelo, tokens_in, tokens_out, ok)
  values (p_cliente, p_conta, case when p_acao = 'resumir' then 'resumir' else 'sugerir' end,
          left(p_modelo, 80), p_in, p_out, coalesce(p_ok, false));
end $$;

-- ------------------------------------------------------------
-- Faxina de mídia (Storage) — a nx-enviar (modo cron) apaga
-- ------------------------------------------------------------
create or replace function public.nx_midia_lixo_pegar(p_limite int default 100)
returns json
language plpgsql
security definer
set search_path = ''
as $$
begin
  return coalesce((
    select json_agg(json_build_object('id', s.id, 'cliente_id', s.cliente_id, 'path', s.path) order by s.id)
      from (select l.id, l.cliente_id, l.path from public.nx_midia_lixo l
             where l.apagado_em is null and l.erro is null
             order by l.id
             limit greatest(1, least(coalesce(p_limite, 100), 500))
             for update skip locked) s), '[]'::json);
end $$;

create or replace function public.nx_midia_lixo_concluir(p_ids bigint[], p_erro text default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  if nullif(btrim(coalesce(p_erro, '')), '') is null then
    update public.nx_midia_lixo set apagado_em = now(), erro = null where id = any(p_ids) and apagado_em is null;
  else
    update public.nx_midia_lixo set erro = left(p_erro, 500) where id = any(p_ids) and apagado_em is null;
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- P1 (alerta_whatsapp das automações): destinos do gestor DESSE cliente
create or replace function public.nx_alerta_destinos(p_cliente uuid)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
declare v jsonb; v_lista text[];
begin
  select c.cfg -> 'waGestor' into v from public.nx_clientes c where c.id = p_cliente;
  if not found then
    raise exception 'cliente_nao_encontrado' using errcode = '22023';
  end if;
  if jsonb_typeof(v) = 'array' then
    select array_agg(d) into v_lista from (
      select regexp_replace(x, '\D', '', 'g') d from jsonb_array_elements_text(v) x) s where d <> '';
  elsif jsonb_typeof(v) = 'string' then
    select array_agg(d) into v_lista from (
      select regexp_replace(x, '\D', '', 'g') d from regexp_split_to_table(v #>> '{}', '[,;\n]+') x) s where d <> '';
  end if;
  return json_build_object('destinos', coalesce(to_json(v_lista), '[]'::json));
end $$;

-- ------------------------------------------------------------
-- nx_disparar (§4.11): lista passa a incluir nx-enviar. Continua SÓ
-- service_role/postgres (o painel chega aqui só pelo nx_executar, que
-- tem lista própria: nx-ciclo e nx-relatorio).
-- ------------------------------------------------------------
create or replace function public.nx_disparar(p_funcao text, p_corpo jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare cfg public.nx_config; v_id bigint;
begin
  if p_funcao is null or p_funcao not in ('nx-ciclo', 'nx-relatorio', 'nx-enviar') then
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
-- Permissões: tudo deste arquivo é interno (só service_role)
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'nx_wa_resumo', 'nx_wa_msg_json', 'nx_wa_canal', 'nx_canal_credencial', 'nx_canal_verificado',
         'nx_wa_entrada', 'nx_wa_status', 'nx_wa_midia_ok', 'nx_cv_saida', 'nx_cv_contexto_envio',
         'nx_cv_msg_reenvio', 'nx_fila_pegar', 'nx_fila_concluir', 'nx_templates_gravar', 'nx_template_ver',
         'nx_ia_contexto', 'nx_ia_cota', 'nx_ia_registrar', 'nx_midia_lixo_pegar', 'nx_midia_lixo_concluir',
         'nx_alerta_destinos', 'nx_disparar')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    execute format('grant execute on function %s to service_role', r.fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
