-- ============================================================
-- ÓRBITA (SaaS da Nexus) — 20260928c_plataforma_b.sql · frente F3
-- Complemento P0-B do arquivo c (ESPEC v1.1 §5.2): marca da org e tema
-- da empresa (com validação §4.2.1 → marca_invalida/hint), revendas,
-- planos, domínios, notificações (sino) e plano e uso.
-- Mesmas regras do arquivo c: plpgsql, security definer, search_path = '',
-- revoke/grant explícitos, idempotente, nada de dado existente alterado.
-- ============================================================

-- ------------------------------------------------------------
-- Validação da marca (org) / tema (cliente) — interna.
-- Devolve a marca LIMPA (só chaves aceitas, textos aparados, cores em
-- maiúsculas, vazios removidos); erro 'marca_invalida' com hint = campo.
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
                            else array['produto', 'logo', 'logo_claro', 'favicon', 'cores', 'login_titulo', 'login_texto', 'suporte_wa', 'assinatura'] end;
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
    end if;
    r := r || jsonb_build_object(k, v);
  end loop;
  return r;
end $$;

-- item de org (lista do Admin → Revendas)
create or replace function public.nx_org_item(p_org uuid)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return (select json_build_object(
            'id', o.id, 'slug', o.slug, 'nome', o.nome, 'tipo', o.tipo, 'status', o.status, 'marca', o.marca, 'limites', o.limites,
            'criado_em', o.criado_em,
            'empresas', (select count(*) from public.nx_clientes x where x.org_id = o.id),
            'usuarios', (select count(*) from public.nx_acessos a join public.nx_clientes x on x.id = a.cliente_id where x.org_id = o.id),
            'canais', (select count(*) from public.nx_canais k join public.nx_clientes x on x.id = k.cliente_id where x.org_id = o.id),
            'gestores', (select count(*) from public.nx_contas g where g.org_id = o.id and g.papel = 'gestor'))
          from public.nx_orgs o where o.id = p_org);
end $$;

-- ------------------------------------------------------------
-- nx_org_salvar: super cria revenda, muda limites/status/slug; gestor edita nome e marca da própria
-- ------------------------------------------------------------
create or replace function public.nx_org_salvar(p_token text, p_org jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.nx_contas := public.nx_exigir_gestor(p_token);
  v_super boolean := public.nx_super(c);
  j jsonb := coalesce(p_org, '{}'::jsonb);
  v_id uuid;
  o public.nx_orgs;
  v_slug text;
  v_nome text;
  v_marca jsonb;
  v_lim jsonb;
  v_status text;
  k text;
begin
  begin
    v_id := nullif(j ->> 'id', '')::uuid;
  exception when others then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'id';
  end;
  if v_id is not null then
    select * into o from public.nx_orgs where id = v_id for update;
    if o.id is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'id'; end if;
    if not v_super and o.id is distinct from c.org_id then raise exception 'sem_permissao' using errcode = '42501'; end if;
  elsif not v_super then
    raise exception 'so_plataforma' using errcode = '42501';
  end if;

  -- o que só o super mexe
  if not v_super and ((j ? 'limites' and (j -> 'limites') is distinct from o.limites)
                      or (j ? 'status' and (j ->> 'status') is distinct from o.status)
                      or (j ? 'slug' and lower(btrim(j ->> 'slug')) is distinct from o.slug)
                      or (j ? 'tipo' and (j ->> 'tipo') is distinct from o.tipo)) then
    raise exception 'so_plataforma' using errcode = '42501';
  end if;

  v_nome := coalesce(nullif(btrim(coalesce(j ->> 'nome', '')), ''), o.nome);
  if v_nome is null or char_length(v_nome) < 2 or char_length(v_nome) > 80 then raise exception 'nome_invalido' using errcode = '22023'; end if;
  v_slug := coalesce(nullif(lower(btrim(coalesce(j ->> 'slug', ''))), ''), o.slug);
  if v_slug is null or v_slug !~ '^[a-z0-9-]{2,40}$' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'slug'; end if;
  if exists (select 1 from public.nx_orgs x where x.slug = v_slug and x.id is distinct from v_id) then
    raise exception 'slug_em_uso' using errcode = '22023';
  end if;
  v_marca := case when j ? 'marca' then public.nx_marca_validar(j -> 'marca', false) else coalesce(o.marca, '{}'::jsonb) end;
  v_status := coalesce(nullif(j ->> 'status', ''), o.status, 'ativo');
  if v_status not in ('ativo', 'suspenso') or (o.tipo = 'plataforma' and v_status <> 'ativo') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'status';
  end if;
  if v_id is null and coalesce(nullif(j ->> 'tipo', ''), 'revenda') <> 'revenda' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'tipo';
  end if;

  if j ? 'limites' then
    v_lim := '{}'::jsonb;
    if jsonb_typeof(j -> 'limites') not in ('object', 'null') then raise exception 'dados_invalidos' using errcode = '22023', hint = 'limites'; end if;
    for k in select jsonb_object_keys(coalesce(nullif(j -> 'limites', 'null'::jsonb), '{}'::jsonb)) loop
      if k in ('empresas', 'usuarios', 'canais') then
        if jsonb_typeof(j -> 'limites' -> k) = 'null' then continue; end if;
        if jsonb_typeof(j -> 'limites' -> k) <> 'number' or (j -> 'limites' ->> k)::numeric < 0
           or (j -> 'limites' ->> k)::numeric > 1000000000
           or (j -> 'limites' ->> k)::numeric <> floor((j -> 'limites' ->> k)::numeric) then
          raise exception 'dados_invalidos' using errcode = '22023', hint = 'limites.' || k;
        end if;
        v_lim := v_lim || jsonb_build_object(k, (j -> 'limites' ->> k)::int);
      elsif k = 'plano_padrao' then
        if jsonb_typeof(j -> 'limites' -> k) = 'null' or coalesce(j -> 'limites' ->> k, '') = '' then continue; end if;
        if (j -> 'limites' ->> k) = 'interno'
           or not exists (select 1 from public.nx_planos p where p.id = (j -> 'limites' ->> k) and p.ativo) then
          raise exception 'dados_invalidos' using errcode = '22023', hint = 'plano_padrao';
        end if;
        v_lim := v_lim || jsonb_build_object(k, j -> 'limites' ->> k);
      else
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'limites.' || k;
      end if;
    end loop;
  else
    v_lim := coalesce(o.limites, '{}'::jsonb);
  end if;

  if v_id is null then
    insert into public.nx_orgs (slug, nome, tipo, marca, limites, status)
    values (v_slug, v_nome, 'revenda', v_marca, v_lim, v_status)
    returning * into o;
    perform public.nx_auditar(o.id, null, c.id, 'org_criada', jsonb_build_object('slug', v_slug, 'limites', v_lim));
  else
    if v_marca is distinct from o.marca then
      perform public.nx_auditar(o.id, null, c.id, 'marca', jsonb_build_object('chaves', (select jsonb_agg(x) from jsonb_object_keys(v_marca) x)));
    end if;
    if v_lim is distinct from o.limites or v_status is distinct from o.status or v_slug is distinct from o.slug then
      perform public.nx_auditar(o.id, null, c.id, 'org_alterada',
                                jsonb_build_object('limites', v_lim, 'status', v_status, 'slug', v_slug));
    end if;
    update public.nx_orgs set nome = v_nome, slug = v_slug, marca = v_marca, limites = v_lim, status = v_status
     where id = o.id;
  end if;
  return public.nx_org_item(o.id);
end $$;

-- ------------------------------------------------------------
-- nx_tema_salvar: admin (cliente com módulo marca) ou gestor/super
-- ------------------------------------------------------------
create or replace function public.nx_tema_salvar(p_token text, p_cliente uuid, p_tema jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); t jsonb;
begin
  if v.papel not in ('gestor', 'super') then perform public.nx_exigir_modulo(p_cliente, 'marca'); end if;
  t := public.nx_marca_validar(p_tema, true);
  update public.nx_clientes set tema = t where id = p_cliente;
  perform public.nx_auditar((select x.org_id from public.nx_clientes x where x.id = p_cliente), p_cliente, v.conta_id, 'tema',
                            jsonb_build_object('chaves', (select jsonb_agg(x) from jsonb_object_keys(t) x)));
  return json_build_object('tema', t, 'atualizado', public.nx_tema_hash(t, (select x.cfg from public.nx_clientes x where x.id = p_cliente)));
end $$;

-- ------------------------------------------------------------
-- Domínios (cadastro + instruções de DNS; ativação manual pela plataforma)
-- ------------------------------------------------------------
create or replace function public.nx_dominios_listar(p_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.nx_contas := public.nx_exigir_gestor(p_token);
  v_super boolean := public.nx_super(c);
  v_alvo text := (select substring(nullif(btrim(x.saas_url), '') from '^https?://([^/:]+)') from public.nx_config x where x.id = 1);
begin
  return coalesce((
    select json_agg(json_build_object(
             'host', d.host, 'status', d.status, 'criado_em', d.criado_em, 'ativado_em', d.ativado_em,
             'org', json_build_object('id', o.id, 'nome', o.nome, 'slug', o.slug),
             'cliente', case when x.id is null then null else json_build_object('id', x.id, 'nome', x.nome) end,
             'dns', json_build_object('tipo', 'CNAME', 'nome', d.host, 'valor', v_alvo))
           order by d.status desc, d.criado_em desc)
      from public.nx_dominios d
      join public.nx_orgs o on o.id = d.org_id
      left join public.nx_clientes x on x.id = d.cliente_id
     where v_super or d.org_id = c.org_id), '[]'::json);
end $$;

create or replace function public.nx_dominio_salvar(p_token text, p_host text, p_cliente uuid default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.nx_contas := public.nx_exigir_gestor(p_token);
  v_super boolean := public.nx_super(c);
  v_host text := lower(btrim(coalesce(p_host, '')));
  v_org uuid;
  v_alvo text := (select lower(substring(nullif(btrim(x.saas_url), '') from '^https?://([^/:]+)')) from public.nx_config x where x.id = 1);
begin
  -- aceita quem colou com protocolo ou barra no fim
  v_host := regexp_replace(regexp_replace(v_host, '^https?://', ''), '/.*$', '');
  if v_host !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' or char_length(v_host) > 253
     or v_host = v_alvo or v_host ~ '(^|\.)(netlify\.app|github\.io|supabase\.co)$' then
    raise exception 'dominio_invalido' using errcode = '22023';
  end if;
  if p_cliente is not null then
    -- gestor só em cliente da PRÓPRIA org (o nx_pode aceitaria um acesso comum da conta num cliente de outra org)
    select x.org_id into v_org from public.nx_clientes x where x.id = p_cliente;
    if v_org is null or (not v_super and v_org is distinct from c.org_id) then
      raise exception 'sem_acesso' using errcode = '42501';
    end if;
  else
    v_org := c.org_id;
  end if;
  if exists (select 1 from public.nx_dominios d where d.host = v_host) then
    raise exception 'dominio_em_uso' using errcode = '22023';
  end if;
  insert into public.nx_dominios (host, org_id, cliente_id, status) values (v_host, v_org, p_cliente, 'pendente');
  perform public.nx_auditar(v_org, p_cliente, c.id, 'dominio', jsonb_build_object('host', v_host, 'acao', 'criado'));
  return public.nx_dominios_listar(p_token);
end $$;

create or replace function public.nx_dominio_status(p_token text, p_host text, p_ativo boolean)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare c public.nx_contas := public.nx_exigir_gestor(p_token); d public.nx_dominios;
begin
  if not public.nx_super(c) then raise exception 'so_plataforma' using errcode = '42501'; end if;
  update public.nx_dominios
     set status = case when coalesce(p_ativo, false) then 'ativo' else 'pendente' end,
         ativado_em = case when coalesce(p_ativo, false) then now() end
   where host = lower(btrim(coalesce(p_host, '')))
  returning * into d;
  if d.host is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'host'; end if;
  perform public.nx_auditar(d.org_id, d.cliente_id, c.id, 'dominio', jsonb_build_object('host', d.host, 'acao', d.status));
  return public.nx_dominios_listar(p_token);
end $$;

create or replace function public.nx_dominio_remover(p_token text, p_host text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare c public.nx_contas := public.nx_exigir_gestor(p_token); d public.nx_dominios;
begin
  select * into d from public.nx_dominios where host = lower(btrim(coalesce(p_host, '')));
  if d.host is null or (not public.nx_super(c) and d.org_id is distinct from c.org_id) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'host';
  end if;
  delete from public.nx_dominios where host = d.host;
  perform public.nx_auditar(d.org_id, d.cliente_id, c.id, 'dominio', jsonb_build_object('host', d.host, 'acao', 'removido'));
  return json_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- Planos (tabela) — só o super
-- ------------------------------------------------------------
create or replace function public.nx_plano_salvar(p_token text, p_plano jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.nx_contas := public.nx_exigir_gestor(p_token);
  j jsonb := coalesce(p_plano, '{}'::jsonb);
  v_id text := lower(btrim(coalesce(j ->> 'id', '')));
  p public.nx_planos;
  v_lim jsonb := '{}'::jsonb;
  v_mod text[];
  k text;
  v_preco numeric;
begin
  if not public.nx_super(c) then raise exception 'so_plataforma' using errcode = '42501'; end if;
  if v_id !~ '^[a-z0-9_]{2,30}$' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'id'; end if;
  select * into p from public.nx_planos where id = v_id;
  if j ? 'limites' then
    if jsonb_typeof(j -> 'limites') <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'limites'; end if;
    for k in select jsonb_object_keys(j -> 'limites') loop
      if k not in ('usuarios', 'canais', 'funis', 'automacoes', 'contatos', 'ia_mes') then
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'limites.' || k;
      end if;
      if jsonb_typeof(j -> 'limites' -> k) = 'null' then v_lim := v_lim || jsonb_build_object(k, null); continue; end if;
      if jsonb_typeof(j -> 'limites' -> k) <> 'number' or (j -> 'limites' ->> k)::numeric < 0
         or (j -> 'limites' ->> k)::numeric > 1000000000
         or (j -> 'limites' ->> k)::numeric <> floor((j -> 'limites' ->> k)::numeric) then
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'limites.' || k;
      end if;
      v_lim := v_lim || jsonb_build_object(k, (j -> 'limites' ->> k)::int);
    end loop;
  else
    v_lim := coalesce(p.limites, '{}'::jsonb);
  end if;
  if j ? 'modulos' then
    if jsonb_typeof(j -> 'modulos') <> 'array' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'modulos'; end if;
    select coalesce(array_agg(distinct m order by m), '{}'::text[]) into v_mod from jsonb_array_elements_text(j -> 'modulos') m;
    if exists (select 1 from unnest(v_mod) m where m not in ('crm', 'conversas', 'relatorios', 'ads', 'automacoes', 'marca')) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'modulos';
    end if;
    if ('crm' = any(v_mod)) <> ('conversas' = any(v_mod)) then
      select array_agg(distinct m order by m) into v_mod from unnest(v_mod || array['crm', 'conversas']) m;
    end if;
  else
    v_mod := coalesce(p.modulos, '{crm,conversas,relatorios}'::text[]);
  end if;
  begin
    v_preco := case when j ? 'preco_mensal' then nullif(j ->> 'preco_mensal', '')::numeric else p.preco_mensal end;
  exception when others then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'preco_mensal';
  end;
  if v_preco is not null and (v_preco < 0 or v_preco >= 100000000) then raise exception 'dados_invalidos' using errcode = '22023', hint = 'preco_mensal'; end if;
  -- ordem: inteiro de 0 a 9999 (1.5 ou 1e12 davam erro cru de conversão)
  if j ? 'ordem' and jsonb_typeof(j -> 'ordem') <> 'null'
     and (jsonb_typeof(j -> 'ordem') <> 'number' or (j ->> 'ordem')::numeric < 0 or (j ->> 'ordem')::numeric > 9999
          or (j ->> 'ordem')::numeric <> floor((j ->> 'ordem')::numeric)) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'ordem';
  end if;
  if coalesce(nullif(btrim(coalesce(j ->> 'nome', '')), ''), p.nome) is null
     or char_length(coalesce(nullif(btrim(coalesce(j ->> 'nome', '')), ''), p.nome)) not between 2 and 40 then
    raise exception 'nome_invalido' using errcode = '22023';
  end if;
  insert into public.nx_planos (id, nome, preco_mensal, limites, modulos, ordem, ativo)
  values (v_id, coalesce(nullif(btrim(coalesce(j ->> 'nome', '')), ''), p.nome), v_preco, v_lim, v_mod,
          coalesce(case when jsonb_typeof(j -> 'ordem') = 'number' then (j ->> 'ordem')::int end, p.ordem, 0),
          coalesce(case when jsonb_typeof(j -> 'ativo') = 'boolean' then (j ->> 'ativo')::boolean end, p.ativo, true))
  on conflict (id) do update
     set nome = excluded.nome, preco_mensal = excluded.preco_mensal, limites = excluded.limites,
         modulos = excluded.modulos, ordem = excluded.ordem, ativo = excluded.ativo
  returning * into p;
  perform public.nx_auditar(c.org_id, null, c.id, 'plano', jsonb_build_object('id', p.id));
  return json_build_object('id', p.id, 'nome', p.nome, 'preco_mensal', p.preco_mensal, 'limites', p.limites,
                           'modulos', p.modulos, 'ativo', p.ativo, 'ordem', p.ordem);
end $$;

-- ------------------------------------------------------------
-- Notificações (sino) — só as da própria conta no cliente
-- ------------------------------------------------------------
create or replace function public.nx_notificacoes_listar(p_token text, p_cliente uuid, p_limite int default 30)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
begin
  return json_build_object(
    'itens', coalesce((
      select json_agg(json_build_object('id', n.id, 'tipo', n.tipo, 'titulo', n.titulo, 'corpo', n.corpo, 'link', n.link,
                                        'lida_em', n.lida_em, 'criado_em', n.criado_em) order by n.criado_em desc, n.id desc)
        from (select * from public.nx_notificacoes n
               where n.cliente_id = p_cliente and n.conta_id = v.conta_id
               order by n.criado_em desc, n.id desc
               limit least(greatest(coalesce(p_limite, 30), 1), 100)) n), '[]'::json),
    'nao_lidas', (select count(*) from public.nx_notificacoes n
                   where n.cliente_id = p_cliente and n.conta_id = v.conta_id and n.lida_em is null));
end $$;

create or replace function public.nx_notificacoes_marcar(p_token text, p_cliente uuid, p_ids bigint[] default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
begin
  update public.nx_notificacoes n set lida_em = now()
   where n.cliente_id = p_cliente and n.conta_id = v.conta_id and n.lida_em is null
     and (p_ids is null or n.id = any(p_ids));
  return json_build_object('nao_lidas', (select count(*) from public.nx_notificacoes n
                                          where n.cliente_id = p_cliente and n.conta_id = v.conta_id and n.lida_em is null));
end $$;

-- ------------------------------------------------------------
-- Plano e uso (admin): uso × limite; org só para gestor/super de revenda; mídia no Storage
-- ------------------------------------------------------------
create or replace function public.nx_uso_plano(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  x public.nx_clientes;
  o public.nx_orgs;
  p public.nx_planos;
  v_mb numeric;
begin
  select * into x from public.nx_clientes where id = p_cliente;
  select * into o from public.nx_orgs where id = x.org_id;
  select * into p from public.nx_planos where id = x.plano;
  select round(coalesce(sum((s.metadata ->> 'size')::bigint), 0) / 1048576.0, 1) into v_mb
    from storage.objects s where s.bucket_id = 'nx-midia' and s.name like p_cliente::text || '/%';
  return json_build_object(
    -- white-label: o preço de tabela da plataforma não aparece para a equipe do cliente de uma REVENDA
    -- (a agência cobra o preço dela); gestor/super e clientes diretos da plataforma veem
    'plano', json_build_object('id', p.id, 'nome', p.nome,
                               'preco_mensal', case when o.tipo = 'plataforma' or v.papel in ('gestor', 'super') then p.preco_mensal end),
    'status', x.status, 'teste_ate', x.teste_ate, 'modulos', x.modulos,
    'uso', json_build_object('usuarios', public.nx_uso(x.id, 'usuarios'), 'canais', public.nx_uso(x.id, 'canais'),
                             'funis', public.nx_uso(x.id, 'funis'), 'automacoes', public.nx_uso(x.id, 'automacoes'),
                             'contatos', (select count(*) from (select 1 from public.nx_contatos k where k.cliente_id = x.id limit 200001) s),
                             'ia_mes', public.nx_uso(x.id, 'ia_mes')),
    'limites', json_build_object('usuarios', public.nx_limite(x.id, 'usuarios'), 'canais', public.nx_limite(x.id, 'canais'),
                                 'funis', public.nx_limite(x.id, 'funis'), 'automacoes', public.nx_limite(x.id, 'automacoes'),
                                 'contatos', public.nx_limite(x.id, 'contatos'), 'ia_mes', public.nx_limite(x.id, 'ia_mes')),
    'org', case when o.tipo = 'revenda' and v.papel in ('gestor', 'super') then json_build_object(
             'uso', json_build_object(
               'empresas', (select count(*) from public.nx_clientes y where y.org_id = o.id),
               'usuarios', (select count(*) from public.nx_acessos a join public.nx_clientes y on y.id = a.cliente_id where y.org_id = o.id),
               'canais', (select count(*) from public.nx_canais k join public.nx_clientes y on y.id = k.cliente_id where y.org_id = o.id)),
             'limites', o.limites) end,
    'storage_mb', v_mb);
end $$;

-- ------------------------------------------------------------
-- Permissões (regra 5)
-- ------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.nx_org_salvar(text,jsonb)', 'public.nx_tema_salvar(text,uuid,jsonb)', 'public.nx_dominios_listar(text)',
    'public.nx_dominio_salvar(text,text,uuid)', 'public.nx_dominio_status(text,text,boolean)', 'public.nx_dominio_remover(text,text)',
    'public.nx_plano_salvar(text,jsonb)', 'public.nx_notificacoes_listar(text,uuid,integer)',
    'public.nx_notificacoes_marcar(text,uuid,bigint[])', 'public.nx_uso_plano(text,uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
  foreach f in array array['public.nx_marca_validar(jsonb,boolean)', 'public.nx_org_item(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
