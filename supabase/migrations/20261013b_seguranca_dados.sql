-- ============================================================
-- ÓRBITA — 20261013b_seguranca_dados.sql · plano «1000+ melhorias» de 13/10/2026 · frente srv, lote srv-1, migração b
-- Segurança e dados. ADITIVA e idempotente: create or replace na MESMA assinatura (cópia da definição em vigor, citada em cada
-- bloco, + o marcado «plano 1000»); funções novas: nx_crm_tempo de 5 argumentos (sobrecarga interna), nx_crm_tempo_pagina
-- (RPC do painel) e nx_midia_visiveis (só service_role); um índice. Nenhum dado de produção muda. Depende da 20261013a (nx_taxa_usar).
--
--   SV-189 nx_login_ip: cf-connecting-ip (posto pela Cloudflare, o cliente não forja) antes do 1º x-forwarded-for
--   SV-127 nx_ctx: cliente PAUSADO (nx_clientes.ativo = false) barra a escrita da equipe (cliente_pausado, 22023); leitura segue
--   SV-188 nx_ia_reservar: gestor da org do cliente e super (que entram pelo nx_ctx sem nx_acessos) também reservam a IA
--   SV-107 nx_lead_entrada: contato com negócio ABERTO → só a nota (decisão 1 do plano 100), sem negócio/aviso em dobro
--   SV-108 nx_lead_entrada (5/h por IP) e nx_rastreio_registrar (60/min por IP) — a chave do site é pública: qualquer um
--          esgotava o limite do cliente (os limites por cliente ficam como estão: 30/h e 120/min · 1.000/h, que os smokes 07/11/19 fixam)
--   SV-111 nx_cv_listar: p_filtro.antes_id desempata a página por (ultima_msg_em, id) — conversas com o mesmo horário na
--          fronteira sumiam
--   SV-135 nx_crm_tempo: notas FIXADAS sempre na linha do tempo; sobrecarga com p_antes e nx_crm_tempo_pagina para paginar
--   SV-058 nx_midia_visiveis: o «ver mídia» só assina paths de conversas visíveis à conta (departamento/atribuição)
-- Smoke: supabase/testes/27_seguranca_dados.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. SV-189 nx_login_ip — cópia de 20261008b_operacao_seguranca.sql
-- ------------------------------------------------------------
create or replace function public.nx_login_ip()
returns text
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_h text := nullif(current_setting('request.headers', true), ''); v text;
begin
  if v_h is null then return null; end if;
  begin
    -- plano 1000 (SV-189): o IP que a Cloudflare põe (cf-connecting-ip) vale antes do x-forwarded-for, cujo 1º valor o próprio
    -- cliente manda (trocando-o a cada tentativa, o limite de falhas por IP nunca disparava). Sem ele, o de sempre.
    v := nullif(btrim(coalesce(v_h::json ->> 'cf-connecting-ip', '')), '');
    if v is null then v := nullif(btrim(split_part(coalesce(v_h::json ->> 'x-forwarded-for', ''), ',', 1)), ''); end if;
  exception when others then
    return null;
  end;
  return left(v, 64);
end $$;

-- ------------------------------------------------------------
-- 2. SV-127 nx_ctx — cópia de 20260928a_saas_base.sql
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
-- 3. SV-188 nx_ia_reservar — cópia de 20261001a_automacoes_ia.sql
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
begin
  if p_cliente is null or p_acao is null or p_acao not in ('sugerir', 'resumir', 'automacao')
     or (p_conta is null and p_acao <> 'automacao') then
    return json_build_object('ok', false, 'erro', 'dados_invalidos');
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
  else
    select count(*)::int into v_minuto from public.nx_ia_uso u
     where u.cliente_id = p_cliente and u.acao = 'automacao' and u.criado_em > v_agora - interval '1 minute';
    v_minuto := v_minuto + (select count(*)::int from public.nx_ia_reservas r
      where r.cliente_id = p_cliente and r.acao = 'automacao' and r.criado_em > v_agora - interval '1 minute' and r.expira_em > v_agora);
    if v_minuto >= 30 then
      return json_build_object('ok', false, 'erro', 'muitos_pedidos');
    end if;
  end if;

  insert into public.nx_ia_reservas(cliente_id, conta_id, acao, criado_em, expira_em)
  values (p_cliente, p_conta, p_acao, v_agora, v_agora + interval '5 minutes')
  returning id into v_id;
  return json_build_object('ok', true, 'reserva_id', v_id);
end $$;

-- ------------------------------------------------------------
-- 4. SV-107 + SV-108 nx_lead_entrada — cópia de 20261008a_entrada_lead_rastreio.sql
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

  -- 5) plano 1000 (SV-107): contato com negócio ABERTO → o envio vira só nota nele (decisão 1 do plano 100; duplo clique ou
  --    reenvio do formulário criavam 2 negócios e 2 avisos). Sem negócio aberto: negócio novo no funil padrão (o gatilho acha a
  --    etapa 'nova' e completa nome/telefone)
  select l.id into v_neg from public.nx_leads l
   where l.cliente_id = cli.id and l.contato_id = v_contato and l.status = 'aberto'
   order by l.criado_em desc, l.id desc limit 1;
  if v_neg is null then
    select f.id into v_funil from public.nx_funis f where f.cliente_id = cli.id and f.padrao and f.ativo limit 1;
    insert into public.nx_leads (cliente_id, nome, telefone, contato_id, origem, servico, obs, funil_id, etapa)
    values (cli.id, v_nome, v_tel, v_contato, 'site', v_serv,
            left(concat_ws(' · ', 'Formulário do site',
                           case when v_utm_s is not null then 'utm_source=' || v_utm_s end,
                           case when v_utm_c is not null then 'utm_campaign=' || v_utm_c end), 5000),
            v_funil, 'nova')
    returning id into v_neg;
    v_novo := true;
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
-- 5. SV-108 nx_rastreio_registrar — cópia de 20261008a_entrada_lead_rastreio.sql
-- ------------------------------------------------------------
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
  v_ip text;
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

  -- plano 1000 (SV-108): 60 por minuto por IP (a chave do site é pública: qualquer um esgotava o limite do cliente)
  v_ip := public.nx_login_ip();
  if v_ip is not null and not (public.nx_taxa_usar('rastreio:' || v_ip, 60, 60) ->> 'ok')::boolean then
    raise exception 'limite_taxa' using errcode = '22023';
  end if;
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

-- ------------------------------------------------------------
-- 6. SV-111 nx_cv_listar — cópia de 20260928e_conversas.sql
-- ------------------------------------------------------------
create or replace function public.nx_cv_listar(p_token text, p_cliente uuid, p_filtro jsonb default '{}'::jsonb,
                                               p_limite int default 50, p_antes timestamptz default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  f jsonb := coalesce(p_filtro, '{}'::jsonb);
  v_rank int;
  v_aba text := coalesce(nullif(f ->> 'aba', ''), 'abertas');
  v_lim int := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_dep uuid; v_canal uuid; v_at text; v_at_id uuid; v_etq uuid[]; v_nl boolean; v_antes_id bigint;
  v_q text; v_qn text; v_dig text; v_busca boolean;
  v_itens jsonb; v_n int; v_cont json;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  v_rank := public.nx_rank(v.papel);
  if v_aba not in ('minhas', 'sem_dono', 'aguardando', 'abertas', 'pendentes', 'resolvidas', 'ocultas') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'aba';
  end if;
  if v_aba = 'ocultas' and v_rank < 2 then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  begin
    v_dep := nullif(f ->> 'departamento_id', '')::uuid;
    v_canal := nullif(f ->> 'canal_id', '')::uuid;
    v_at := nullif(f ->> 'atendente', '');
    if v_at is not null and v_at not in ('eu', 'sem') then v_at_id := v_at::uuid; end if;
    if jsonb_typeof(f -> 'etiquetas') = 'array' and jsonb_array_length(f -> 'etiquetas') > 0 then
      select array_agg(x::uuid) into v_etq from jsonb_array_elements_text(f -> 'etiquetas') x;
    end if;
    v_nl := coalesce(nullif(f ->> 'nao_lidas', '')::boolean, false);
    -- plano 1000 (SV-111): id do último item da página anterior (desempate de quem tem o mesmo ultima_msg_em)
    v_antes_id := nullif(f ->> 'antes_id', '')::bigint;
  exception when invalid_text_representation then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'filtro';
  end;
  v_q := left(btrim(coalesce(f ->> 'busca', '')), 80);
  v_busca := char_length(v_q) >= 2;
  if v_busca then
    v_qn := replace(replace(replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, v_q)),
                    '\', '\\'), '%', '\%'), '_', '\_');
    v_dig := regexp_replace(v_q, '\D', '', 'g');
  end if;

  with base as (
    select cv.id,
           row_number() over (order by
             case when v_aba = 'aguardando' and not v_busca then cv.ultima_entrada_em end asc nulls last,
             cv.ultima_msg_em desc, cv.id desc) as rn
      from public.nx_conversas cv
     where cv.cliente_id = p_cliente
       -- regra nx_cv_visivel
       and (not cv.oculta or v_rank >= 2)
       and ( v_rank >= 3
          or cv.atribuida_a = v.conta_id
          or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                or cv.departamento_id = any(v.departamentos))
               and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )
       -- aba (com busca: procura em todos os atendimentos, menos os ocultos)
       and ( case
               when v_aba = 'ocultas' then cv.oculta
               when v_busca then not cv.oculta
               when v_aba = 'minhas' then not cv.oculta and cv.status in ('aberta', 'pendente') and cv.atribuida_a = v.conta_id
               when v_aba = 'sem_dono' then not cv.oculta and cv.status in ('aberta', 'pendente') and cv.atribuida_a is null
               when v_aba = 'aguardando' then not cv.oculta and cv.status = 'aberta' and cv.aguardando
               when v_aba = 'abertas' then not cv.oculta and cv.status = 'aberta'
               when v_aba = 'pendentes' then not cv.oculta and cv.status = 'pendente'
               when v_aba = 'resolvidas' then not cv.oculta and cv.status = 'resolvida'
                                              and cv.resolvida_em > now() - interval '30 days'
             end )
       and (v_dep is null or cv.departamento_id = v_dep)
       and (v_canal is null or cv.canal_id = v_canal)
       and (v_at is null
            or (v_at = 'eu' and cv.atribuida_a = v.conta_id)
            or (v_at = 'sem' and cv.atribuida_a is null)
            or (v_at_id is not null and cv.atribuida_a = v_at_id))
       and (v_etq is null or cv.etiquetas && v_etq)
       and (not v_nl or cv.nao_lidas > 0)
       and (not v_busca
            or cv.protocolo ilike '%' || v_qn || '%'
            or cv.contato_id in (select k.id from public.nx_contatos k
                                  where k.cliente_id = p_cliente
                                    and (k.busca like '%' || v_qn || '%'
                                         or (char_length(v_dig) >= 4 and k.telefone like '%' || v_dig || '%'))))
       and (p_antes is null
            or (v_aba = 'aguardando' and not v_busca and cv.ultima_entrada_em > p_antes)
            or ((v_aba <> 'aguardando' or v_busca)
                and (case when v_antes_id is null then cv.ultima_msg_em < p_antes
                          else (cv.ultima_msg_em, cv.id) < (p_antes, v_antes_id) end)))
     order by rn
     limit v_lim + 1
  )
  select coalesce(jsonb_agg(public.nx_cv_json_item(c) order by b.rn) filter (where b.rn <= v_lim), '[]'::jsonb),
         count(*)
    into v_itens, v_n
    from base b join public.nx_conversas c on c.id = b.id;

  -- contagens das abas (só visibilidade; ignoram filtros e busca — alimentam o menu e o título)
  select json_build_object(
           'minhas', count(*) filter (where cv.atribuida_a = v.conta_id),
           'sem_dono', count(*) filter (where cv.atribuida_a is null),
           'aguardando', count(*) filter (where cv.status = 'aberta' and cv.aguardando),
           'abertas', count(*) filter (where cv.status = 'aberta'),
           'pendentes', count(*) filter (where cv.status = 'pendente'),
           'nao_lidas', count(*) filter (where cv.nao_lidas > 0))
    into v_cont
    from public.nx_conversas cv
   where cv.cliente_id = p_cliente and cv.status in ('aberta', 'pendente') and not cv.oculta
     -- regra nx_cv_visivel
     and ( v_rank >= 3
        or cv.atribuida_a = v.conta_id
        or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
              or cv.departamento_id = any(v.departamentos))
             and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) );

  return json_build_object('itens', v_itens, 'tem_mais', v_n > v_lim, 'contagens', v_cont,
                           'aba', v_aba, 'busca', v_busca);
end $$;

-- ------------------------------------------------------------
-- 7. SV-135 nx_crm_tempo — cópia de 20260928d_crm.sql (4 argumentos, a que nx_negocio_ver/nx_contato_ver usam) + sobrecarga com p_antes
-- ------------------------------------------------------------
create or replace function public.nx_crm_tempo(p_cliente uuid, v public.nx_ctx_t, p_contato bigint, p_negocio bigint)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return coalesce((
    select json_agg(json_build_object('fonte', t.fonte, 'id', t.id, 'tipo', t.tipo, 'em', t.em,
                                      'autor', case when a.id is null then null else json_build_object('id', a.id, 'nome', a.nome) end,
                                      'dados', t.dados, 'negocio_id', t.negocio_id, 'conversa_id', t.conversa_id)
                    order by t.em desc, t.id desc)
    from (
      select * from (
      (select 'historico'::text as fonte, h.id, h.tipo, h.criado_em as em, h.autor_id, h.dados,
              h.negocio_id, h.conversa_id
         from public.nx_historico h
        where h.cliente_id = p_cliente
          and ((p_negocio is not null and h.negocio_id = p_negocio)
            or (p_negocio is null and h.contato_id = p_contato))
          and (h.conversa_id is null or exists (
                select 1 from public.nx_conversas cv where cv.id = h.conversa_id
                   -- regra nx_cv_visivel
                   and cv.cliente_id = p_cliente
                   and (not cv.oculta or public.nx_rank(v.papel) >= 2)
                   and ( public.nx_rank(v.papel) >= 3
                      or cv.atribuida_a = v.conta_id
                      or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                            or cv.departamento_id = any(v.departamentos))
                           and (public.nx_rank(v.papel) = 2 or cv.atribuida_a is null or v.ver_todas) ) )))
        order by h.criado_em desc limit 80)
      union all
      (select 'nota', n.id, 'nota', n.criado_em, n.autor_id,
              jsonb_build_object('texto', n.texto, 'fixada', n.fixada), n.negocio_id, null::bigint
         from public.nx_notas n
        where n.cliente_id = p_cliente
          and ((p_negocio is not null and n.negocio_id = p_negocio)
            or (p_negocio is null and n.contato_id = p_contato))
        order by n.fixada desc, n.criado_em desc limit 80)
      union all
      (select 'tarefa', t.id, case when t.concluida_em is null then 'tarefa' else 'tarefa_concluida' end,
              coalesce(t.concluida_em, t.criado_em), t.criado_por,
              jsonb_build_object('titulo', t.titulo, 'tipo', t.tipo, 'vence_em', t.vence_em, 'concluida_em', t.concluida_em),
              t.negocio_id, null::bigint
         from public.nx_tarefas t
        where t.cliente_id = p_cliente
          and ((p_negocio is not null and t.negocio_id = p_negocio)
            or (p_negocio is null and t.contato_id = p_contato))
        order by t.criado_em desc limit 80)
      -- plano 1000 (SV-135): nota FIXADA nunca sai da linha do tempo (o histórico de automação empurrava as notas para fora do
      -- corte de 80); o resto continua do mais novo para o mais antigo
      ) u
      order by (u.fonte = 'nota' and coalesce((u.dados ->> 'fixada')::boolean, false)) desc, u.em desc limit 80
    ) t
    left join public.nx_contas a on a.id = t.autor_id), '[]'::json);
end $$;

create or replace function public.nx_crm_tempo(p_cliente uuid, v public.nx_ctx_t, p_contato bigint, p_negocio bigint, p_antes timestamptz)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return coalesce((
    select json_agg(json_build_object('fonte', t.fonte, 'id', t.id, 'tipo', t.tipo, 'em', t.em,
                                      'autor', case when a.id is null then null else json_build_object('id', a.id, 'nome', a.nome) end,
                                      'dados', t.dados, 'negocio_id', t.negocio_id, 'conversa_id', t.conversa_id)
                    order by t.em desc, t.id desc)
    from (
      (select 'historico'::text as fonte, h.id, h.tipo, h.criado_em as em, h.autor_id, h.dados,
              h.negocio_id, h.conversa_id
         from public.nx_historico h
        where h.cliente_id = p_cliente
          and ((p_negocio is not null and h.negocio_id = p_negocio)
            or (p_negocio is null and h.contato_id = p_contato))
          and (h.conversa_id is null or exists (
                select 1 from public.nx_conversas cv where cv.id = h.conversa_id
                   -- regra nx_cv_visivel
                   and cv.cliente_id = p_cliente
                   and (not cv.oculta or public.nx_rank(v.papel) >= 2)
                   and ( public.nx_rank(v.papel) >= 3
                      or cv.atribuida_a = v.conta_id
                      or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                            or cv.departamento_id = any(v.departamentos))
                           and (public.nx_rank(v.papel) = 2 or cv.atribuida_a is null or v.ver_todas) ) )))
          and (p_antes is null or h.criado_em < p_antes)
        order by h.criado_em desc limit 80)
      union all
      (select 'nota', n.id, 'nota', n.criado_em, n.autor_id,
              jsonb_build_object('texto', n.texto, 'fixada', n.fixada), n.negocio_id, null::bigint
         from public.nx_notas n
        where n.cliente_id = p_cliente
          and ((p_negocio is not null and n.negocio_id = p_negocio)
            or (p_negocio is null and n.contato_id = p_contato))
          and (p_antes is null or n.criado_em < p_antes)
        order by n.criado_em desc limit 80)
      union all
      (select 'tarefa', t.id, case when t.concluida_em is null then 'tarefa' else 'tarefa_concluida' end,
              coalesce(t.concluida_em, t.criado_em), t.criado_por,
              jsonb_build_object('titulo', t.titulo, 'tipo', t.tipo, 'vence_em', t.vence_em, 'concluida_em', t.concluida_em),
              t.negocio_id, null::bigint
         from public.nx_tarefas t
        where t.cliente_id = p_cliente
          and ((p_negocio is not null and t.negocio_id = p_negocio)
            or (p_negocio is null and t.contato_id = p_contato))
          and (p_antes is null or coalesce(t.concluida_em, t.criado_em) < p_antes)
        order by t.criado_em desc limit 80)
      order by 4 desc limit 80
    ) t
    left join public.nx_contas a on a.id = t.autor_id), '[]'::json);
end $$;

-- Página seguinte da linha do tempo (o painel chama com o «em» do último item): {itens, tem_mais}. Mesmas regras de
-- visibilidade do nx_negocio_ver/nx_contato_ver (restrito só vê o que é dele).
create or replace function public.nx_crm_tempo_pagina(p_token text, p_cliente uuid, p_negocio bigint default null,
                                                      p_contato bigint default null, p_antes timestamptz default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  l public.nx_leads; k public.nx_contatos; j json;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if p_negocio is not null then
    select * into l from public.nx_leads where id = p_negocio and cliente_id = p_cliente;
    if l.id is null or (public.nx_crm_restrito(v) and l.dono_id is not null and l.dono_id <> v.conta_id) then
      raise exception 'negocio_nao_encontrado' using errcode = '22023';
    end if;
    j := public.nx_crm_tempo(p_cliente, v, l.contato_id, l.id, p_antes);
  elsif p_contato is not null then
    select * into k from public.nx_contatos where id = p_contato and cliente_id = p_cliente;
    if k.id is null or (public.nx_crm_restrito(v) and k.dono_id is not null and k.dono_id <> v.conta_id) then
      raise exception 'contato_nao_encontrado' using errcode = '22023';
    end if;
    j := public.nx_crm_tempo(p_cliente, v, k.id, null, p_antes);
  else
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  return json_build_object('itens', j, 'tem_mais', json_array_length(j) >= 80);
end $$;

-- ------------------------------------------------------------
-- 8. SV-058 nx_midia_visiveis: dos paths pedidos, os que a conta vê — mídia de mensagem em conversa visível (nx_cv_visivel) ou
--    upload do próprio cliente (pasta out/) que ainda não virou mensagem. O resto fica fora (a nx-midia não assina).
-- ------------------------------------------------------------
create index if not exists nx_mensagens_midia_path on public.nx_mensagens ((midia ->> 'path')) where (midia ->> 'path') is not null;

create or replace function public.nx_midia_visiveis(p_ctx jsonb, p_cliente uuid, p_paths text[])
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := jsonb_populate_record(null::public.nx_ctx_t, coalesce(p_ctx, '{}'::jsonb));
begin
  if p_cliente is null or p_paths is null or cardinality(p_paths) > 100 then raise exception 'dados_invalidos' using errcode = '22023'; end if;
  return coalesce((
    select json_agg(x.p order by x.p)
      from (select distinct p from unnest(p_paths) p
             where p like p_cliente::text || '/%'
               and (exists (select 1 from public.nx_mensagens m
                             where (m.midia ->> 'path') = p and m.cliente_id = p_cliente
                               and public.nx_cv_visivel(v, p_cliente, m.conversa_id))
                    or (p like p_cliente::text || '/out/%'
                        and not exists (select 1 from public.nx_mensagens m where (m.midia ->> 'path') = p and m.cliente_id = p_cliente)))) x), '[]'::json);
end $$;

-- ------------------------------------------------------------
-- 9. Permissões: as cópias mantêm as da origem (create or replace não mexe); as novas
-- ------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.nx_crm_tempo(uuid,public.nx_ctx_t,bigint,bigint,timestamptz)', 'public.nx_midia_visiveis(jsonb,uuid,text[])'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  -- RPC do painel: anon (chave pública) como as outras do CRM; authenticated nunca (plano 100, S-B17)
  revoke all on function public.nx_crm_tempo_pagina(text,uuid,bigint,bigint,timestamptz) from public, authenticated;
  grant execute on function public.nx_crm_tempo_pagina(text,uuid,bigint,bigint,timestamptz) to anon, service_role;
end $$;

insert into public.nx_versao_banco (nome) values ('20261013b_seguranca_dados')
on conflict (nome) do update set aplicada_em = now();

notify pgrst, 'reload schema';
