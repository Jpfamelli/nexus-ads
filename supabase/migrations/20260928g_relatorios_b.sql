-- ============================================================
-- ÓRBITA — 20260928g_relatorios_b.sql · frente F6 (complemento do arquivo g, §5.6 — P1)
-- Formulário do site → contato + negócio (URL com chave):
--   · nx_entrada_chave (admin): mostra / gera / rotaciona nx_clientes.entrada_chave (24 bytes hex);
--   · nx_lead_entrada (ANON): recebe o formulário do site do cliente.
-- Regras de ouro: plpgsql, security definer, search_path = '', nomes
-- qualificados, idempotente (create or replace), revoke + grant explícito.
-- nx_lead_entrada NÃO revela nada: chave errada, cliente suspenso/cancelado/
-- teste vencido ou sem o módulo CRM → {ok:true} sem gravar. Os dados são
-- conferidos ANTES de olhar a chave (o erro dados_invalidos não diz se a chave
-- existe). Máx. 30 entradas por hora por cliente (limite_taxa), com trava
-- por cliente para duas chamadas simultâneas não passarem juntas do limite.
-- O negócio nasce no funil padrão com origem 'site' (o gatilho §4.9 completa
-- etapa, nome e telefone; 'site' nunca herda atribuição de anúncio).
-- ============================================================

-- ------------------------------------------------------------
-- nx_entrada_chave — admin do cliente
-- ------------------------------------------------------------
create or replace function public.nx_entrada_chave(p_token text, p_cliente uuid, p_gerar boolean default false)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  v_chave text;
begin
  if coalesce(p_gerar, false) then
    v_chave := encode(extensions.gen_random_bytes(24), 'hex');
    update public.nx_clientes set entrada_chave = v_chave where id = p_cliente;
    perform public.nx_auditar((select c.org_id from public.nx_clientes c where c.id = p_cliente), p_cliente, v.conta_id,
                              'entrada_chave_gerada', '{}'::jsonb);
  else
    select c.entrada_chave into v_chave from public.nx_clientes c where c.id = p_cliente;
  end if;
  return json_build_object('chave', v_chave);
end $$;
revoke all on function public.nx_entrada_chave(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.nx_entrada_chave(text, uuid, boolean) to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- nx_lead_entrada — formulário do site (anon, com a chave do cliente)
-- p_dados: {nome, telefone?, email?, mensagem?, servico?, utm_source?, utm_campaign?}
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
revoke all on function public.nx_lead_entrada(text, jsonb) from public, anon, authenticated;
grant execute on function public.nx_lead_entrada(text, jsonb) to anon, authenticated, service_role;
