-- ============================================================
-- ÓRBITA (SaaS da Nexus) — 20260928b_saas_acesso.sql · frente F1
-- Mudanças nas RPCs EXISTENTES (ESPEC v1.1 §4.11), todas passando pelo
-- nx_ctx / nx_pode novos. O formato de resposta de cada uma fica igual
-- (só chaves novas podem aparecer); a única exceção são as chaves
-- sensíveis de cfg tiradas para papéis abaixo de gestor (§3.4).
-- nx_disparar e comum.js são da frente F2 (arquivo f) — não mexer aqui.
-- Idempotente (create or replace + revoke/grant explícitos).
-- Com uma org só (Nexus) e o João como gestor dela, o painel clássico
-- continua idêntico para ele.
-- ============================================================

-- ------------------------------------------------------------
-- Ajudantes internos (só service_role)
-- ------------------------------------------------------------
-- super = conta gestor da org 'plataforma' (a Nexus)
create or replace function public.nx_super(p_conta public.nx_contas)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return coalesce(p_conta.papel = 'gestor'
         and exists (select 1 from public.nx_orgs o where o.id = p_conta.org_id and o.tipo = 'plataforma'), false);
end $$;

-- papel efetivo da conta no cliente (§4.10 passo 4): super | gestor | papel do acesso | null (sem acesso)
create or replace function public.nx_papel_em(p_conta public.nx_contas, p_cliente uuid)
returns text
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if p_conta.id is null or p_cliente is null then return null; end if;
  if public.nx_super(p_conta) then return 'super'; end if;
  if p_conta.papel = 'gestor'
     and exists (select 1 from public.nx_clientes x where x.id = p_cliente and x.org_id = p_conta.org_id) then
    return 'gestor';
  end if;
  return (select a.papel from public.nx_acessos a where a.conta_id = p_conta.id and a.cliente_id = p_cliente);
end $$;

-- ------------------------------------------------------------
-- nx_pode: continua language sql. super OU gestor da org do cliente OU acesso
-- ------------------------------------------------------------
create or replace function public.nx_pode(p_conta public.nx_contas, p_cliente uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(
       (p_conta.papel = 'gestor'
        and exists (select 1 from public.nx_orgs o where o.id = p_conta.org_id and o.tipo = 'plataforma'))
    or (p_conta.papel = 'gestor'
        and exists (select 1 from public.nx_clientes x where x.id = p_cliente and x.org_id = p_conta.org_id))
    or exists (select 1 from public.nx_acessos a where a.conta_id = p_conta.id and a.cliente_id = p_cliente),
    false)
$$;

-- ------------------------------------------------------------
-- nx_sessao: mesmo formato; cfg sem as chaves sensíveis abaixo de gestor;
-- atualiza ultimo_acesso
-- ------------------------------------------------------------
create or replace function public.nx_sessao(p_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
declare c public.nx_contas := public.nx_conta_do_token(p_token);
begin
  update public.nx_contas set ultimo_acesso = now() where id = c.id;
  return json_build_object(
    'conta', json_build_object('id', c.id, 'nome', c.nome, 'email', c.email, 'papel', c.papel),
    'clientes', coalesce((
      select json_agg(json_build_object('id', x.id, 'slug', x.slug, 'nome', x.nome, 'ativo', x.ativo,
                                        'cfg', public.nx_cfg_publico(x.cfg, public.nx_papel_em(c, x.id), 'sessao'))
                      order by x.nome)
        from public.nx_clientes x where public.nx_pode(c, x.id)), '[]'::json));
end $function$;

-- ------------------------------------------------------------
-- nx_dados: nx_ctx(admin) + módulo ads (abaixo de gestor); leads só de funil
-- que conta no Ads (ou sem funil); cfg sem waGestor/waCliente abaixo de gestor.
-- Resto igual ao texto de 20260927_melhorias.sql.
-- ------------------------------------------------------------
create or replace function public.nx_dados(p_token text, p_cliente uuid, p_dias integer default 130)
 returns json
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); v_de date;
begin
  if v.papel not in ('gestor', 'super') then perform public.nx_exigir_modulo(p_cliente, 'ads'); end if;
  v_de := (now() at time zone 'America/Sao_Paulo')::date - least(greatest(coalesce(p_dias, 130), 7), 400);
  return json_build_object(
    'hoje', (now() at time zone 'America/Sao_Paulo')::date,
    'cliente', (select json_build_object('id', id, 'slug', slug, 'nome', nome, 'cfg', public.nx_cfg_publico(cfg, v.papel, 'dados')) from public.nx_clientes where id = p_cliente),
    'metricas', coalesce((
      select json_agg(json_build_object('p', plataforma, 'd', data, 'n', nivel, 'c', campanha_ext, 'cn', campanha_nome,
             'a', anuncio_ext, 'an', anuncio_nome, 'imp', impressoes, 'alc', alcance, 'freq', frequencia,
             'cli', cliques, 'g', gasto, 'conv', conversoes))
        from public.nx_metricas_dia where cliente_id = p_cliente and data >= v_de), '[]'::json),
    'leads', coalesce((
      select json_agg(row_to_json(l) order by l.data_conversa)
        from (select id, nome, telefone, origem, plataforma, campanha_ext, anuncio_ext, servico, etapa,
                     data_conversa, data_agenda, data_consulta, valor, obs
                from public.nx_leads
               where cliente_id = p_cliente and (data_conversa >= v_de or data_consulta >= v_de or etapa in ('nova', 'agendada'))
                 and (nx_leads.funil_id is null or exists (select 1 from public.nx_funis f where f.id = nx_leads.funil_id and f.conta_no_ads))) l), '[]'::json),
    'alertas', coalesce((
      select json_agg(row_to_json(a) order by a.criado_em desc)
        from (select regra, chave, severidade, mensagem, acao, referencia, criado_em, enviado_em, entregue_em
                from public.nx_alertas where cliente_id = p_cliente and criado_em > now() - interval '15 days') a), '[]'::json),
    'relatorios', coalesce((
      select json_agg(row_to_json(r) order by r.referencia desc)
        from (select tipo, referencia, texto, leitura_ia, enviado_em, erro, entregue_em
                from public.nx_relatorios where cliente_id = p_cliente order by referencia desc limit 20) r), '[]'::json),
    'integracoes', coalesce((
      select json_agg(json_build_object('canal', canal, 'ativo', ativo, 'ultimo_sync', ultimo_sync, 'status', status))
        from public.nx_integracoes where cliente_id = p_cliente), '[]'::json));
end $function$;

-- ------------------------------------------------------------
-- nx_lead_salvar: nx_ctx(atendente) — leitura não escreve; suspenso/teste vencido
-- recusados. Corpo igual (o gatilho §4.9 completa funil, etapa e contato).
-- ------------------------------------------------------------
create or replace function public.nx_lead_salvar(p_token text, p_cliente uuid, p_lead jsonb)
 returns json
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  v_id bigint := nullif(p_lead->>'id', '')::bigint;
  r public.nx_leads;
begin
  if v_id is null then
    insert into public.nx_leads (cliente_id, nome, telefone, origem, plataforma, campanha_ext, servico, etapa,
                                 data_conversa, data_agenda, data_consulta, valor, obs)
    values (p_cliente,
            nullif(trim(p_lead->>'nome'), ''),
            nullif(regexp_replace(coalesce(p_lead->>'telefone', ''), '\D', '', 'g'), ''),
            coalesce(nullif(p_lead->>'origem', ''), 'manual'),
            nullif(p_lead->>'plataforma', ''),
            nullif(p_lead->>'campanha_ext', ''),
            nullif(p_lead->>'servico', ''),
            coalesce(nullif(p_lead->>'etapa', ''), 'nova'),
            coalesce(nullif(p_lead->>'data_conversa', '')::date, (now() at time zone 'America/Sao_Paulo')::date),
            nullif(p_lead->>'data_agenda', '')::date,
            nullif(p_lead->>'data_consulta', '')::date,
            nullif(p_lead->>'valor', '')::numeric,
            nullif(p_lead->>'obs', ''))
    returning * into r;
  else
    update public.nx_leads set
      nome          = case when p_lead ? 'nome' then nullif(trim(p_lead->>'nome'), '') else nome end,
      telefone      = case when p_lead ? 'telefone' then nullif(regexp_replace(coalesce(p_lead->>'telefone', ''), '\D', '', 'g'), '') else telefone end,
      origem        = case when p_lead ? 'origem' then coalesce(nullif(p_lead->>'origem', ''), origem) else origem end,
      plataforma    = case when p_lead ? 'plataforma' then nullif(p_lead->>'plataforma', '') else plataforma end,
      campanha_ext  = case when p_lead ? 'campanha_ext' then nullif(p_lead->>'campanha_ext', '') else campanha_ext end,
      servico       = case when p_lead ? 'servico' then nullif(p_lead->>'servico', '') else servico end,
      etapa         = case when p_lead ? 'etapa' then coalesce(nullif(p_lead->>'etapa', ''), etapa) else etapa end,
      data_agenda   = case when p_lead ? 'data_agenda' then nullif(p_lead->>'data_agenda', '')::date else data_agenda end,
      data_consulta = case when p_lead ? 'data_consulta' then nullif(p_lead->>'data_consulta', '')::date else data_consulta end,
      valor         = case when p_lead ? 'valor' then nullif(p_lead->>'valor', '')::numeric else valor end,
      obs           = case when p_lead ? 'obs' then nullif(p_lead->>'obs', '') else obs end,
      atualizado_em = now()
    where id = v_id and cliente_id = p_cliente
    returning * into r;
    if r.id is null then raise exception 'lead_nao_encontrado'; end if;
  end if;
  return row_to_json(r);
end $function$;

-- ------------------------------------------------------------
-- nx_integracoes_status: nx_ctx(admin) + módulo ads abaixo de gestor
-- ------------------------------------------------------------
create or replace function public.nx_integracoes_status(p_token text, p_cliente uuid)
 returns json
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
begin
  if v.papel not in ('gestor', 'super') then perform public.nx_exigir_modulo(p_cliente, 'ads'); end if;
  return coalesce((
    select json_agg(json_build_object(
      'canal', i.canal, 'ativo', i.ativo, 'ultimo_sync', i.ultimo_sync, 'status', i.status,
      'preenchidos', (select coalesce(json_agg(k.key), '[]'::json) from jsonb_each(i.cred) k where k.value <> '""'::jsonb)))
      from public.nx_integracoes i where i.cliente_id = p_cliente), '[]'::json);
end $function$;

-- ------------------------------------------------------------
-- nx_integracao_salvar: gestor (como hoje) + nx_pode no cliente
-- ------------------------------------------------------------
create or replace function public.nx_integracao_salvar(p_token text, p_cliente uuid, p_canal text, p_cred jsonb, p_ativo boolean default true)
 returns json
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare c public.nx_contas := public.nx_exigir_gestor(p_token); v_novo jsonb;
begin
  if not public.nx_pode(c, p_cliente) then raise exception 'sem_acesso' using errcode = '42501'; end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_novo
    from jsonb_each(coalesce(p_cred, '{}'::jsonb)) where value <> '""'::jsonb and value <> 'null'::jsonb;
  insert into public.nx_integracoes (cliente_id, canal, ativo, cred) values (p_cliente, p_canal, coalesce(p_ativo, true), v_novo)
  on conflict (cliente_id, canal) do update set cred = public.nx_integracoes.cred || excluded.cred, ativo = excluded.ativo;
  return public.nx_integracoes_status(p_token, p_cliente);
end $function$;

-- ------------------------------------------------------------
-- nx_cliente_salvar: existente → nx_pode; novo → org da conta (super pode
-- mandar org_id) e limite de empresas da revenda. cfg continua mesclado.
-- Cliente novo nasce com o plano da org (plataforma → interno; revenda →
-- plano_padrao ou essencial) e com os MÓDULOS DESSE PLANO (§3.6) — o default
-- da coluna (os 6 módulos) furaria o plano de quem cria pela revenda.
-- wa_phone_number_id que já é de outro cliente (nx_clientes ou nx_canais) →
-- numero_em_uso: o webhook antigo roteia por esse campo, e um número alheio
-- mandaria os leads daquele cliente para este.
-- ------------------------------------------------------------
create or replace function public.nx_cliente_salvar(p_token text, p_cliente jsonb)
 returns json
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare
  c public.nx_contas := public.nx_exigir_gestor(p_token);
  v_id uuid := nullif(p_cliente->>'id', '')::uuid;
  v_org uuid;
  o public.nx_orgs;
  v_plano text;
  v_mod text[];
  v_pid text := nullif(trim(coalesce(p_cliente->>'wa_phone_number_id', '')), '');
  r public.nx_clientes;
begin
  if v_id is not null and not public.nx_pode(c, v_id) then raise exception 'sem_acesso' using errcode = '42501'; end if;
  if p_cliente ? 'wa_phone_number_id' and v_pid is not null
     and (exists (select 1 from public.nx_canais k where k.phone_number_id = v_pid and k.cliente_id is distinct from v_id)
          or exists (select 1 from public.nx_clientes x where x.wa_phone_number_id = v_pid and x.id is distinct from v_id)) then
    raise exception 'numero_em_uso' using errcode = '22023';
  end if;
  if v_id is null then
    v_org := c.org_id;
    if public.nx_super(c) and nullif(p_cliente->>'org_id', '') is not null then
      begin
        v_org := (p_cliente->>'org_id')::uuid;
      exception when others then
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'org_id';
      end;
    end if;
    select * into o from public.nx_orgs where id = v_org;
    if o.id is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'org_id'; end if;
    v_plano := case when o.tipo = 'plataforma' then 'interno'
                    else coalesce(nullif(o.limites ->> 'plano_padrao', ''), 'essencial') end;
    select p.modulos into v_mod from public.nx_planos p where p.id = v_plano;
    if v_mod is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'plano'; end if;
    perform public.nx_exigir_limite_org(v_org, 'empresas', 1);
    insert into public.nx_clientes (slug, nome, cfg, wa_phone_number_id, org_id, plano, modulos)
    values (lower(trim(p_cliente->>'slug')), trim(p_cliente->>'nome'),
            coalesce(p_cliente->'cfg', '{}'::jsonb), v_pid, v_org, v_plano, v_mod)
    returning * into r;
  else
    update public.nx_clientes set
      nome = coalesce(nullif(trim(p_cliente->>'nome'), ''), nome),
      slug = coalesce(nullif(lower(trim(p_cliente->>'slug')), ''), slug),
      ativo = coalesce((p_cliente->>'ativo')::boolean, ativo),
      cfg = case when p_cliente ? 'cfg' then cfg || (p_cliente->'cfg') else cfg end,
      wa_phone_number_id = case when p_cliente ? 'wa_phone_number_id'
                                then nullif(trim(coalesce(p_cliente->>'wa_phone_number_id', '')), '') else wa_phone_number_id end
    where id = v_id returning * into r;
    if r.id is null then raise exception 'cliente_nao_encontrado'; end if;
  end if;
  return json_build_object('id', r.id, 'slug', r.slug, 'nome', r.nome, 'ativo', r.ativo, 'cfg', r.cfg, 'wa_phone_number_id', r.wa_phone_number_id);
end $function$;

-- ------------------------------------------------------------
-- nx_executar: lista PRÓPRIA (nx-ciclo, nx-relatorio), independente do
-- nx_disparar. Gestor + nx_pode com cliente; sem cliente (todos) só super.
-- O corpo é montado de novo só com cliente, tipo e forcar.
-- ------------------------------------------------------------
create or replace function public.nx_executar(p_token text, p_tarefa text, p_corpo jsonb default '{}'::jsonb)
 returns json
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare
  c public.nx_contas := public.nx_exigir_gestor(p_token);
  v_corpo jsonb := coalesce(p_corpo, '{}'::jsonb);
  v_cli uuid;
  v_id bigint;
begin
  if p_tarefa is null or p_tarefa not in ('nx-ciclo', 'nx-relatorio') then
    raise exception 'funcao_invalida' using errcode = '22023';
  end if;
  if nullif(v_corpo->>'cliente', '') is not null then
    begin
      v_cli := (v_corpo->>'cliente')::uuid;
    exception when others then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'cliente';
    end;
    if not public.nx_pode(c, v_cli) then raise exception 'sem_acesso' using errcode = '42501'; end if;
  elsif not public.nx_super(c) then
    raise exception 'so_plataforma' using errcode = '42501';
  end if;
  v_corpo := jsonb_strip_nulls(jsonb_build_object(
    'cliente', v_cli,
    'tipo', case when v_corpo->>'tipo' in ('diario', 'mensal') then v_corpo->>'tipo' end,
    'forcar', case when jsonb_typeof(v_corpo->'forcar') = 'boolean' then v_corpo->'forcar' end));
  v_id := public.nx_disparar(p_tarefa, v_corpo);
  return json_build_object('ok', true, 'pedido', v_id);
end $function$;

-- ------------------------------------------------------------
-- nx_contas_listar: não-super vê só contas da própria org e as que têm acesso
-- a clientes da org (e, delas, só os clientes da org)
-- ------------------------------------------------------------
create or replace function public.nx_contas_listar(p_token text)
 returns json
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare c public.nx_contas := public.nx_exigir_gestor(p_token); v_super boolean := public.nx_super(c);
begin
  return coalesce((
    select json_agg(json_build_object('id', x.id, 'nome', x.nome, 'email', x.email, 'papel', x.papel, 'aprovado', x.aprovado,
             'criado_em', x.criado_em,
             'clientes', coalesce((select json_agg(a.cliente_id) from public.nx_acessos a
                                    where a.conta_id = x.id
                                      and (v_super or exists (select 1 from public.nx_clientes k
                                                               where k.id = a.cliente_id and k.org_id = c.org_id))), '[]'::json))
             order by x.aprovado, x.criado_em desc)
      from public.nx_contas x
     where v_super
        or x.org_id = c.org_id
        or exists (select 1 from public.nx_acessos a join public.nx_clientes k on k.id = a.cliente_id
                    where a.conta_id = x.id and k.org_id = c.org_id)), '[]'::json);
end $function$;

-- ------------------------------------------------------------
-- nx_conta_definir: alvo fora de nx_conta_no_escopo → sem_permissao (exceto
-- super); papel 'gestor' só para conta da org do chamador; cada cliente precisa
-- de nx_pode; org_id nunca muda. Os acessos que continuam mantêm papel e
-- departamentos (antes: apagava e recriava todos — voltariam como admin).
-- Acesso NOVO dado por gestor de revenda passa pelo limite 'usuarios' (cliente
-- e soma da org, §3.5). p_papel nulo → papel_invalido (antes: erro cru 23502).
-- ------------------------------------------------------------
create or replace function public.nx_conta_definir(p_token text, p_conta uuid, p_aprovado boolean, p_papel text, p_clientes uuid[])
 returns json
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare
  c public.nx_contas := public.nx_exigir_gestor(p_token);
  v_super boolean := public.nx_super(c);
  alvo public.nx_contas;
  v_cli uuid;
begin
  if p_papel is null or p_papel not in ('gestor', 'clinica') then raise exception 'papel_invalido'; end if;
  if p_conta = c.id and (p_papel <> 'gestor' or p_aprovado is false) then raise exception 'nao_pode_rebaixar_a_si'; end if;
  select * into alvo from public.nx_contas where id = p_conta;
  if alvo.id is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'conta'; end if;
  if not v_super then
    if not public.nx_conta_no_escopo(c, p_conta, null) then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
    if p_papel = 'gestor' and alvo.org_id is distinct from c.org_id then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
  end if;
  foreach v_cli in array coalesce(p_clientes, '{}'::uuid[]) loop
    if not public.nx_pode(c, v_cli) then raise exception 'sem_acesso' using errcode = '42501'; end if;
  end loop;
  update public.nx_contas set aprovado = coalesce(p_aprovado, aprovado), papel = p_papel where id = p_conta;
  delete from public.nx_acessos where conta_id = p_conta and not (cliente_id = any(coalesce(p_clientes, '{}'::uuid[])));
  -- um a um: o limite 'usuarios' (cliente e soma da org) conta os que já entraram nesta chamada
  foreach v_cli in array coalesce(p_clientes, '{}'::uuid[]) loop
    if not exists (select 1 from public.nx_acessos a where a.conta_id = p_conta and a.cliente_id = v_cli) then
      if not v_super then perform public.nx_exigir_limite(v_cli, 'usuarios', 1); end if;
      insert into public.nx_acessos (conta_id, cliente_id) values (p_conta, v_cli) on conflict do nothing;
    end if;
  end loop;
  if p_aprovado is false then delete from public.nx_sessoes where conta_id = p_conta; end if;
  return public.nx_contas_listar(p_token);
end $function$;

-- ------------------------------------------------------------
-- nx_config_ver / nx_config_salvar: só super (so_plataforma). saas_url novo.
-- ------------------------------------------------------------
create or replace function public.nx_config_ver(p_token text)
 returns json
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare c public.nx_contas := public.nx_exigir_gestor(p_token); cfg public.nx_config;
begin
  if not public.nx_super(c) then raise exception 'so_plataforma' using errcode = '42501'; end if;
  select * into cfg from public.nx_config where id = 1;
  return json_build_object(
    'webhook_url', cfg.funcoes_url || '/nx-whatsapp',
    'wa_verify_token', cfg.wa_verify_token,
    'painel_url', cfg.painel_url,
    'modelo_ia', cfg.modelo_ia,
    'wa_template', cfg.wa_template,
    'wa_phone_number_id', cfg.wa_phone_number_id,
    'google_api_versao', cfg.google_api_versao,
    'tem_wa_token', cfg.wa_access_token is not null,
    'tem_app_secret', cfg.meta_app_secret is not null,
    'tem_ia', cfg.anthropic_api_key is not null,
    'saas_url', cfg.saas_url,
    'ultimas_execucoes', coalesce((
      select json_agg(row_to_json(e) order by e.inicio desc)
        from (select tarefa, inicio, fim, ok, resumo from public.nx_execucoes order by inicio desc limit 8) e), '[]'::json));
end $function$;

create or replace function public.nx_config_salvar(p_token text, p_cfg jsonb)
 returns json
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare c public.nx_contas := public.nx_exigir_gestor(p_token);
  f text := '';
begin
  if not public.nx_super(c) then raise exception 'so_plataforma' using errcode = '42501'; end if;
  update public.nx_config set
    wa_access_token    = coalesce(nullif(p_cfg->>'wa_access_token', ''), wa_access_token),
    wa_phone_number_id = case when p_cfg ? 'wa_phone_number_id' then nullif(p_cfg->>'wa_phone_number_id', '') else wa_phone_number_id end,
    wa_template        = case when p_cfg ? 'wa_template' then nullif(p_cfg->>'wa_template', '') else wa_template end,
    meta_app_secret    = coalesce(nullif(p_cfg->>'meta_app_secret', ''), meta_app_secret),
    anthropic_api_key  = coalesce(nullif(p_cfg->>'anthropic_api_key', ''), anthropic_api_key),
    modelo_ia          = coalesce(nullif(p_cfg->>'modelo_ia', ''), modelo_ia),
    painel_url         = case when p_cfg ? 'painel_url' then nullif(p_cfg->>'painel_url', '') else painel_url end,
    google_api_versao  = case when p_cfg ? 'google_api_versao' then nullif(p_cfg->>'google_api_versao', '') else google_api_versao end,
    saas_url           = case when p_cfg ? 'saas_url' then nullif(p_cfg->>'saas_url', '') else saas_url end,
    atualizado_em      = now()
  where id = 1;
  return public.nx_config_ver(p_token);
end $function$;

-- ------------------------------------------------------------
-- Permissões (regra 5: revoke + grant explícito depois de cada create or replace)
-- ------------------------------------------------------------
do $$
declare f text;
begin
  -- painel (chave pública)
  foreach f in array array[
    'public.nx_sessao(text)', 'public.nx_dados(text,uuid,integer)', 'public.nx_lead_salvar(text,uuid,jsonb)',
    'public.nx_integracoes_status(text,uuid)', 'public.nx_integracao_salvar(text,uuid,text,jsonb,boolean)',
    'public.nx_cliente_salvar(text,jsonb)', 'public.nx_executar(text,text,jsonb)', 'public.nx_contas_listar(text)',
    'public.nx_conta_definir(text,uuid,boolean,text,uuid[])', 'public.nx_config_ver(text)',
    'public.nx_config_salvar(text,jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
  -- internas
  foreach f in array array[
    'public.nx_pode(public.nx_contas,uuid)', 'public.nx_super(public.nx_contas)',
    'public.nx_papel_em(public.nx_contas,uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
