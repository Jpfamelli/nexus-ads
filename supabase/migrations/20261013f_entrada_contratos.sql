-- ============================================================
-- ÓRBITA — 20261013f_entrada_contratos.sql · plano «1000+ melhorias» de 13/10/2026 · frente srv, lote srv-3, migração f
-- Entrada de leads (formulário, WhatsApp) e contratos que as telas leem por detecção. ADITIVA e idempotente: create or replace na
-- MESMA assinatura (definição EM VIGOR citada em cada bloco + o marcado «plano 1000»), sobrecargas NOVAS que não casam com as
-- chamadas atuais, campos NOVOS nas respostas (nenhum some — exceto «conversas» no delta do nx_cv_mensagens, ver SV-139).
-- Depende da 20261013e (nada dela é usado aqui; a ordem é só a do nome).
--   nx_lead_entrada: utm_medium, utm_content, utm_term, gclid, fbclid e aceite_privacidade do formulário; SV-137 a mesma
--          classificação do rastreio (nx_rastreio_plataforma) vira origem/plataforma/campanha do negócio e do contato vazios
--   SV-136 formulário, WhatsApp (nx_wa_entrada) e lead do webhook (nx_lead_webhook) travam pela MESMA chave (cliente + nx_tel_chave):
--          formulário e WhatsApp da mesma pessoa no mesmo instante viram UM negócio
--   SV-254 lock_timeout de 5 s nas três (trava presa vira erro e a Meta/o fluxo tentam de novo)
--   SV-198 nx_wa_entrada: contato BLOQUEADO que insiste não tem nome/wa_id/ultimo_contato_em atualizados
--   SV-228 nx_lead_webhook: telefone vazio → errcode 22023 com hint 'telefone'
--   nx_auto_base.canais[].provedor · nx_usuarios_listar.convites[].departamentos ·
--   nx_automacao_execucoes[].contato_nome / negocio_titulo
--   nx_negocio_mover com p_req (idempotência 24 h, padrão 20261002c): SOBRECARGA NOVA com p_req sem default ANTES dos opcionais
--   SV-139 nx_cv_mensagens: a lista de atendimentos («conversas») só na 1ª página — o delta e a página anterior não a levam
--   SV-114 nx_canais.estado_desde (gravado pelo nx_canal_historico_gravar) e o nx_pulso sem subconsulta por canal quando preenchido
--   SV-117 nx_dados_colunas(p_token, p_cliente, p_dias): o nx_dados com as métricas como arrays por campo (> 50% menor)
-- Smoke: supabase/testes/31_entrada_contratos.sql
-- ============================================================

alter table public.nx_canais add column if not exists estado_desde timestamptz;   -- SV-114: quando o estado atual começou

-- ------------------------------------------------------------
-- 1. nx_lead_entrada — cópia de 20261013b_seguranca_dados
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

-- ------------------------------------------------------------
-- 2. SV-198/SV-254 nx_wa_entrada — cópia de 20261008a_entrada_lead_rastreio
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
  -- plano 1000 (SV-254): esperar a trava consultiva no máximo 5 s (uma entrega presa não segura as outras até o statement_timeout;
  -- o erro faz a Meta / o fluxo tentarem de novo). set_config local = só nesta transação (a RPC).
  perform set_config('lock_timeout', '5s', true);
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
  elsif not coalesce(ct.bloqueado, false) then
    -- plano 1000 (SV-198): contato BLOQUEADO que insiste não ganha «último contato agora» nem nome/wa_id novos (ele só grava a
    -- mensagem na conversa oculta, abaixo)
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
-- 3. SV-136/SV-228/SV-254 nx_lead_webhook — cópia de 20261008a_entrada_lead_rastreio
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
  -- plano 1000 (SV-228): com errcode e hint como as outras RPCs (o PostgREST devolvia 400 com uma palavra solta)
  if v_tel is null then raise exception 'telefone_invalido' using errcode = '22023', hint = 'telefone'; end if;
  v_var := array(select distinct v from unnest(coalesce(p_variantes, '{}'::text[]) || v_tel) as v where coalesce(v, '') <> '');

  -- plano 1000 (SV-254): esperar a trava consultiva no máximo 5 s (uma entrega presa não segura as outras até o statement_timeout;
  -- o erro faz a Meta / o fluxo tentarem de novo). set_config local = só nesta transação (a RPC).
  perform set_config('lock_timeout', '5s', true);
  -- plano 1000 (SV-136): a MESMA chave do nx_wa_entrada e do formulário (cliente + nx_tel_chave); sem chave, a menor variante (como antes)
  perform pg_advisory_xact_lock(hashtextextended(p_cliente::text || ':'
    || coalesce(public.nx_tel_chave(public.nx_tel_normalizar(v_tel, true)), (select min(v) from unnest(v_var) as v)), 0));

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

-- ------------------------------------------------------------
-- 4. nx_auto_base.canais[].provedor — cópia de 20261001a_automacoes_ia
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
        from public.nx_campos c where c.cliente_id = p_cliente and c.entidade = 'negocio' and c.ativo), '[]'::json));
end $$;

-- ------------------------------------------------------------
-- 5. nx_usuarios_listar.convites[].departamentos — cópia de 20260928c_plataforma
-- ------------------------------------------------------------

create or replace function public.nx_usuarios_listar(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); c public.nx_contas;
begin
  select * into c from public.nx_contas where id = v.conta_id;
  return json_build_object(
    'usuarios', coalesce((
      select json_agg(json_build_object(
               'conta_id', k.id, 'nome', k.nome, 'email', k.email, 'telefone', k.telefone, 'papel', a.papel,
               'departamentos', a.departamentos, 'ver_todas', a.ver_todas, 'recebe_conversas', a.recebe_conversas,
               'aprovado', k.aprovado, 'ultimo_acesso', k.ultimo_acesso,
               'editavel', public.nx_conta_no_escopo(c, k.id, p_cliente) and k.id <> c.id,
               'eu', k.id = c.id, 'gestor', k.papel = 'gestor')
             order by (a.papel = 'admin') desc, lower(k.nome))
        from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
       where a.cliente_id = p_cliente), '[]'::json),
    'convites', coalesce((
      -- plano 1000: os departamentos do convite (a tela mostra onde a pessoa vai atender antes de aceitar)
      select json_agg(json_build_object('id', cv.id, 'papel', cv.papel, 'email', cv.email, 'nome', cv.nome,
                                        'expira_em', cv.expira_em, 'criado_em', cv.criado_em, 'departamentos', cv.departamentos) order by cv.criado_em desc)
        from public.nx_convites cv
       where cv.cliente_id = p_cliente and cv.usado_em is null and not cv.revogado
         and cv.expira_em > now() and cv.tentativas < 5), '[]'::json),
    'departamentos', coalesce((
      select json_agg(json_build_object('id', d.id, 'nome', d.nome, 'cor', d.cor) order by d.ordem, d.nome)
        from public.nx_departamentos d where d.cliente_id = p_cliente and d.ativo), '[]'::json),
    'eu', json_build_object('id', c.id, 'papel', v.papel),
    'limite', public.nx_limite(p_cliente, 'usuarios'),
    'uso', public.nx_uso(p_cliente, 'usuarios'));
end $$;

-- ------------------------------------------------------------
-- 6. nx_automacao_execucoes[].contato_nome / negocio_titulo — cópia de 20261001a_automacoes_ia
-- ------------------------------------------------------------

create or replace function public.nx_automacao_execucoes(p_token text, p_cliente uuid, p_id uuid, p_limite int default 50)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'supervisor');
begin
  perform public.nx_exigir_modulo(p_cliente, 'automacoes');
  if not exists (select 1 from public.nx_automacoes a where a.id = p_id and a.cliente_id = p_cliente) then
    raise exception 'automacao_nao_encontrada' using errcode = '22023';
  end if;
  return coalesce((
    select json_agg(json_build_object('criado_em', s.criado_em, 'ok', s.ok, 'detalhe', s.detalhe, 'chave', s.chave, 'link', s.link,
                                      'estado', s.estado, 'passo', s.passo, 'total_passos', s.total_passos,
                                      'continua_em', s.continua_em, 'atualizado_em', s.atualizado_em,
                                      'contato_nome', s.contato_nome, 'negocio_titulo', s.negocio_titulo)
                    order by s.criado_em desc, s.id desc)
      from (select x.id, x.criado_em, x.ok, x.detalhe, x.chave, x.estado, x.passo, x.total_passos, x.atualizado_em,
                   coalesce(ln.titulo, ln.nome) as negocio_titulo, kc.nome as contato_nome,
                   case when q.status = 'esperando' then q.continuar_em end as continua_em,
                   case split_part(x.chave, ':', 1)
                     when 'sr' then '#/conversas/' || split_part(x.chave, ':', 2)
                     when 'te' then '#/crm/negocio/' || split_part(x.chave, ':', 2)
                     when 'ad' then '#/crm/negocio/' || split_part(x.chave, ':', 2)
                     when 'ap' then '#/crm/negocio/' || split_part(x.chave, ':', 2)
                     when 'ag' then '#/crm/negocio/' || split_part(x.chave, ':', 2)
                     when 'tv' then '#/tarefas'
                     when 'ev' then case
                       when e.ref ? 'negocio_id' and e.tipo like 'negocio_%' then '#/crm/negocio/' || (e.ref ->> 'negocio_id')
                       when e.ref ? 'conversa_id' then '#/conversas/' || (e.ref ->> 'conversa_id')
                       when e.ref ? 'contato_id' then '#/contatos/' || (e.ref ->> 'contato_id') end
                   end as link
              from public.nx_auto_execucoes x
              left join public.nx_eventos e on e.id = x.evento_id and e.cliente_id = x.cliente_id
              left join public.nx_auto_sequencias q on q.automacao_id = x.automacao_id and q.chave = x.chave
              -- plano 1000: quem a execução tocou (contato e negócio), pela chave ou pelo evento — a lista diz «Ana · Implante»
              left join lateral (select
                  case when split_part(x.chave, ':', 1) in ('te', 'ad', 'ap', 'ag') and split_part(x.chave, ':', 2) ~ '^\d{1,18}$' then split_part(x.chave, ':', 2)::bigint
                       when e.ref ->> 'negocio_id' ~ '^\d{1,18}$' then (e.ref ->> 'negocio_id')::bigint end as neg_id,
                  case when split_part(x.chave, ':', 1) = 'sr' and split_part(x.chave, ':', 2) ~ '^\d{1,18}$' then split_part(x.chave, ':', 2)::bigint
                       when e.ref ->> 'conversa_id' ~ '^\d{1,18}$' then (e.ref ->> 'conversa_id')::bigint end as cv_id,
                  case when e.ref ->> 'contato_id' ~ '^\d{1,18}$' then (e.ref ->> 'contato_id')::bigint end as ct_id) ids on true
              left join public.nx_leads ln on ln.id = ids.neg_id and ln.cliente_id = x.cliente_id
              left join public.nx_conversas cx on cx.id = ids.cv_id and cx.cliente_id = x.cliente_id
              left join public.nx_contatos kc on kc.id = coalesce(ids.ct_id, ln.contato_id, cx.contato_id) and kc.cliente_id = x.cliente_id
             where x.automacao_id = p_id and x.cliente_id = p_cliente
               and not (x.ok and x.detalhe = 'Condições não atendidas — nada feito.')
             order by x.criado_em desc, x.id desc
             limit least(greatest(coalesce(p_limite, 50), 1), 200)) s), '[]'::json);
end $$;

-- ------------------------------------------------------------
-- 7. nx_negocio_mover com p_req — SOBRECARGA NOVA (padrão 20261002c / nx_cv_nota de 5 argumentos): 7 argumentos SEM default (quem
--    manda p_req manda também p_ordem e p_extra, null/{} se não tiver); a chamada de 4–6 argumentos só casa com a de 20261001b.
--    A mesma (cliente, p_req) em 24 h devolve o MESMO resultado sem mover de novo (duplo toque, reenvio da fila offline).
-- ------------------------------------------------------------
create or replace function public.nx_negocio_mover(p_token text, p_cliente uuid, p_id bigint, p_estagio uuid,
                                                   p_ordem double precision, p_extra jsonb, p_req uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  ant jsonb; r json;
begin
  if p_req is null then return public.nx_negocio_mover(p_token, p_cliente, p_id, p_estagio, p_ordem, coalesce(p_extra, '{}'::jsonb)); end if;
  ant := public.nx_req_usar(p_cliente, p_req, 'nx_negocio_mover');
  if ant is not null then return ant::json; end if;
  r := public.nx_negocio_mover(p_token, p_cliente, p_id, p_estagio, p_ordem, coalesce(p_extra, '{}'::jsonb));
  perform public.nx_req_guardar(p_cliente, p_req, 'nx_negocio_mover', r::jsonb);
  return r;
end $$;

-- ------------------------------------------------------------
-- 8. SV-139 nx_cv_mensagens — cópia de 20260928e_conversas
-- ------------------------------------------------------------

create or replace function public.nx_cv_mensagens(p_token text, p_cliente uuid, p_conversa bigint,
                                                  p_antes_id bigint default null, p_desde timestamptz default null,
                                                  p_depois_id bigint default null, p_limite int default 50)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  v_contato bigint;
  v_ocultas bigint[];
  v_lim int := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_delta boolean := p_desde is not null or p_depois_id is not null;
  v_itens jsonb; v_n int; v_max bigint;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  select cv.contato_id into v_contato from public.nx_conversas cv where cv.id = p_conversa;
  if public.nx_rank(v.papel) < 2 then
    select array_agg(x.id) into v_ocultas from public.nx_conversas x
     where x.cliente_id = p_cliente and x.contato_id = v_contato and x.oculta;
  end if;
  v_ocultas := coalesce(v_ocultas, '{}'::bigint[]);

  if v_delta then
    with sel as (
      select m.id from public.nx_mensagens m
       where m.contato_id = v_contato and m.cliente_id = p_cliente
         and not (m.conversa_id = any(v_ocultas))
         and ( (p_depois_id is not null and m.id > p_depois_id)
            or (p_desde is not null and m.atualizado_em > p_desde - interval '30 seconds') )
       order by m.id
       limit 201
    ), num as (select s.id, row_number() over (order by s.id) rn from sel s)
    select coalesce(jsonb_agg(public.nx_cv_json_msg(m) order by m.id) filter (where n.rn <= 200), '[]'::jsonb),
           count(*), max(m.id) filter (where n.rn <= 200)
      into v_itens, v_n, v_max
      from num n join public.nx_mensagens m on m.id = n.id;
    v_n := case when v_n > 200 then 1 else 0 end;
  else
    with sel as (
      select m.id from public.nx_mensagens m
       where m.contato_id = v_contato and m.cliente_id = p_cliente
         and not (m.conversa_id = any(v_ocultas))
         and (p_antes_id is null or m.id < p_antes_id)
       order by m.id desc
       limit v_lim + 1
    ), num as (select s.id, row_number() over (order by s.id desc) rn from sel s)
    select coalesce(jsonb_agg(public.nx_cv_json_msg(m) order by m.id) filter (where n.rn <= v_lim), '[]'::jsonb),
           count(*), max(m.id) filter (where n.rn <= v_lim)
      into v_itens, v_n, v_max
      from num n join public.nx_mensagens m on m.id = n.id;
    v_n := case when v_n > v_lim then 1 else 0 end;
  end if;

  -- plano 1000 (SV-139): a lista de atendimentos do contato SÓ na 1ª página (sem p_antes_id, p_depois_id e p_desde) — o delta de
  -- poucos segundos e a página anterior não a recalculam (a tela guarda a da 1ª página: «r.conversas || o que já tinha»)
  return (jsonb_build_object(
    'itens', v_itens,
    'tem_mais', v_n = 1,
    'agora', clock_timestamp(),
    'ultimo_id', greatest(coalesce(v_max, p_depois_id), p_depois_id))
    || case when v_delta or p_antes_id is not null then '{}'::jsonb
            else jsonb_build_object('conversas', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'protocolo', x.protocolo,
                             'aberta_em', x.aberta_em, 'resolvida_em', x.resolvida_em, 'status', x.status,
                             'canal_id', x.canal_id) order by x.id)
                             from public.nx_conversas x
                            where x.cliente_id = p_cliente and x.contato_id = v_contato
                              and not (x.id = any(v_ocultas))), '[]'::jsonb)) end)::json;
end $$;

-- ------------------------------------------------------------
-- 9. SV-114 nx_canal_historico_gravar — cópia de 20261008b_operacao_seguranca
-- ------------------------------------------------------------

create or replace function public.nx_canal_historico_gravar(p_canal uuid, p_cliente uuid, p_antes text, p_depois text, p_detalhe text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_nome text; v_tem boolean; v_tipo text;
begin
  if p_depois is null then return false; end if;
  v_tem := exists (select 1 from public.nx_canal_historico h where h.canal_id = p_canal);
  if v_tem and p_depois is not distinct from p_antes then return false; end if;
  insert into public.nx_canal_historico (cliente_id, canal_id, estado, detalhe)
  values (p_cliente, p_canal, p_depois, left(nullif(btrim(coalesce(p_detalhe, '')), ''), 500));
  -- plano 1000 (SV-114): o começo do estado atual fica no próprio canal (o nx_pulso, a cada 15 s por aba, não varre o histórico)
  update public.nx_canais set estado_desde = now() where id = p_canal;
  select k.nome into v_nome from public.nx_canais k where k.id = p_canal;
  if v_tem and p_antes = 'conectado' and p_depois = 'desconectado' then
    v_tipo := 'canal_caiu';
    perform public.nx_notificar(p_cliente, null, 'canal_caiu', left(coalesce(v_nome, 'Número') || ': número desconectado', 120),
      'O aparelho perdeu a conexão com o WhatsApp. Pareie ou reconecte pelo celular.', '#/config/numeros');
  elsif v_tem and p_antes = 'desconectado' and p_depois = 'conectado' then
    v_tipo := 'canal_voltou';
    perform public.nx_notificar(p_cliente, null, 'canal_voltou', left(coalesce(v_nome, 'Número') || ': número voltou', 120),
      'O aparelho reconectou e já recebe mensagens.', '#/config/numeros');
  end if;
  if v_tipo is not null then
    -- as linhas que o nx_notificar acabou de criar (mesma transação = mesmo now(); dados ainda nulo) ganham o canal
    update public.nx_notificacoes n set dados = jsonb_build_object('canal_id', p_canal, 'canal_nome', v_nome, 'estado', p_depois)
     where n.cliente_id = p_cliente and n.tipo = v_tipo and n.criado_em = now() and n.dados is null;
  end if;
  begin
    perform public.nx_pulso_bater(p_cliente);
  exception when others then null;
  end;
  return true;
end $$;

-- ------------------------------------------------------------
-- 9. SV-114 nx_pulso — cópia de 20261009b_pulso_canais_origem
-- ------------------------------------------------------------

create or replace function public.nx_pulso(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura'); v_rank int := public.nx_rank(v.papel);
begin
  return json_build_object(
    'v', coalesce((select p.v from public.nx_pulsos p where p.cliente_id = p_cliente), 0),
    'notif', (select count(*) from public.nx_notificacoes n
               where n.cliente_id = p_cliente and n.conta_id = v.conta_id and n.lida_em is null),
    'nao_lidas', (select count(*) from public.nx_conversas cv
                   where cv.cliente_id = p_cliente and cv.status in ('aberta', 'pendente') and not cv.oculta and cv.nao_lidas > 0
                     -- regra nx_cv_visivel
                     and ( v_rank >= 3
                        or cv.atribuida_a = v.conta_id
                        or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                              or cv.departamento_id = any(v.departamentos))
                             and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )),
    'canais', coalesce((select json_agg(json_build_object(
                          'id', k.id, 'nome', k.nome, 'estado', public.nx_canal_estado(k),
                          -- plano 1000 (SV-114): a coluna quando preenchida (o coalesce só consulta o histórico sem ela)
                          'desde', coalesce(k.estado_desde, (select h.em from public.nx_canal_historico h where h.canal_id = k.id order by h.em desc, h.id desc limit 1)))
                          order by k.criado_em, k.id)
                         from public.nx_canais k where k.cliente_id = p_cliente), '[]'::json),
    'agora', now());
end $$;

-- preenche estado_desde dos canais antigos pelo histórico (o integrador roda uma vez: select public.nx_canais_estado_desde_preencher();)
create or replace function public.nx_canais_estado_desde_preencher()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  update public.nx_canais k
     set estado_desde = (select max(h.em) from public.nx_canal_historico h where h.canal_id = k.id)
   where k.estado_desde is null and exists (select 1 from public.nx_canal_historico h where h.canal_id = k.id);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ------------------------------------------------------------
-- 10. SV-117 nx_dados_colunas(p_token, p_cliente, p_dias default 130) — RPC NOVA (nome próprio: uma sobrecarga do nx_dados confundiria
--     quem procura «a» definição pelo nome): a MESMA resposta do nx_dados com «metricas» em colunas —
--     {formato:'colunas', n, campos:{p:[…], d:[…], …}} (os mesmos números, sem as 13 chaves repetidas por linha). Autenticação e
--     janela: as do nx_dados (é ele que roda por baixo). O painel adota por detecção (404 → nx_dados).
-- ------------------------------------------------------------
create or replace function public.nx_dados_colunas(p_token text, p_cliente uuid, p_dias integer default 130)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare j jsonb := public.nx_dados(p_token, p_cliente, p_dias)::jsonb; m jsonb;
begin
  m := coalesce(j -> 'metricas', '[]'::jsonb);
  return (j || jsonb_build_object('metricas', jsonb_build_object('formato', 'colunas', 'n', jsonb_array_length(m),
    'campos', coalesce((select jsonb_object_agg(ks.k, (select coalesce(jsonb_agg(t.x -> ks.k order by t.o), '[]'::jsonb)
                                                         from jsonb_array_elements(m) with ordinality t(x, o)))
                          from (select distinct jsonb_object_keys(y) k from jsonb_array_elements(m) y) ks), '{}'::jsonb))))::json;
end $$;

-- ------------------------------------------------------------
-- 11. Permissões: cópias mantêm as da origem; nx_negocio_mover (p_req) e nx_dados_colunas são RPCs do painel com p_token
--     (anon, como as de origem); nx_canais_estado_desde_preencher só service_role.
-- ------------------------------------------------------------
do $$
begin
  revoke all on function public.nx_negocio_mover(text, uuid, bigint, uuid, double precision, jsonb, uuid) from public, authenticated;
  grant execute on function public.nx_negocio_mover(text, uuid, bigint, uuid, double precision, jsonb, uuid) to anon, service_role;
  revoke all on function public.nx_dados_colunas(text, uuid, integer) from public, authenticated;
  grant execute on function public.nx_dados_colunas(text, uuid, integer) to anon, service_role;
  revoke all on function public.nx_canais_estado_desde_preencher() from public, anon, authenticated;
  grant execute on function public.nx_canais_estado_desde_preencher() to service_role;
  raise notice 'nx_revogar_authenticated: % funções', public.nx_revogar_authenticated();
end $$;

insert into public.nx_versao_banco (nome) values ('20261013f_entrada_contratos')
on conflict (nome) do update set aplicada_em = now();

notify pgrst, 'reload schema';
