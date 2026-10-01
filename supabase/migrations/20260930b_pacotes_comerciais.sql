-- Oferta comercial separada do plano técnico do Órbita.
-- Aditiva e idempotente; valores monetários ficam como centavos inteiros no snapshot do cliente.
alter table public.nx_clientes
  add column if not exists comercial jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nx_clientes_comercial_objeto' and conrelid = 'public.nx_clientes'::regclass) then
    alter table public.nx_clientes add constraint nx_clientes_comercial_objeto
      check (jsonb_typeof(comercial) = 'object' and octet_length(comercial::text) <= 24000);
  end if;
end $$;

-- Item do Admin → Clientes continua interno; inclui apenas o resumo comercial do cliente autorizado.
create or replace function public.nx_cliente_admin_item(p_cliente uuid)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
declare r json;
begin
  select json_build_object(
    'id', x.id, 'slug', x.slug, 'nome', x.nome,
    'org', json_build_object('id', o.id, 'slug', o.slug, 'nome', o.nome, 'tipo', o.tipo),
    'status', x.status, 'teste_ate', x.teste_ate, 'plano', x.plano, 'modulos', x.modulos, 'vertical', x.vertical,
    'comercial', x.comercial,
    'criado_em', x.criado_em, 'ativo', x.ativo,
    'uso', json_build_object(
      'usuarios', public.nx_uso(x.id, 'usuarios'),
      'canais', public.nx_uso(x.id, 'canais'),
      'funis', public.nx_uso(x.id, 'funis'),
      'automacoes', public.nx_uso(x.id, 'automacoes'),
      'contatos', (select count(*) from (select 1 from public.nx_contatos k where k.cliente_id = x.id limit 200001) s),
      'ia_mes', public.nx_uso(x.id, 'ia_mes')),
    'limites', json_build_object(
      'usuarios', public.nx_limite(x.id, 'usuarios'), 'canais', public.nx_limite(x.id, 'canais'),
      'funis', public.nx_limite(x.id, 'funis'), 'automacoes', public.nx_limite(x.id, 'automacoes'),
      'contatos', public.nx_limite(x.id, 'contatos'), 'ia_mes', public.nx_limite(x.id, 'ia_mes')),
    'limites_extra', x.limites)
  into r
  from public.nx_clientes x join public.nx_orgs o on o.id = x.org_id
  where x.id = p_cliente;
  return r;
end $$;

-- Mantém a política da RPC original e valida/guarda os dados de oferta no mesmo commit do cliente.
create or replace function public.nx_cliente_admin_salvar(p_token text, p_cliente jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.nx_contas := public.nx_exigir_gestor(p_token);
  v_super boolean := public.nx_super(c);
  j jsonb := coalesce(p_cliente, '{}'::jsonb);
  v_id uuid;
  x public.nx_clientes;
  o public.nx_orgs;
  p public.nx_planos;
  v_org uuid;
  v_nome text;
  v_slug text;
  v_vert text;
  v_status text;
  v_teste date;
  v_plano text;
  v_mod text[];
  v_lim jsonb;
  v_comercial_in jsonb;
  v_comercial jsonb;
  v_pacote text;
  v_segmento text;
  v_especificacoes text;
  v_preco_centavos int;
  v_integracao_centavos int;
  k text;
  v_mudou jsonb := '{}'::jsonb;
begin
  begin
    v_id := nullif(j ->> 'id', '')::uuid;
    v_org := nullif(j ->> 'org_id', '')::uuid;
  exception when others then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'id';
  end;
  if v_id is not null then
    select * into x from public.nx_clientes where id = v_id for update;
    if x.id is null then raise exception 'cliente_nao_encontrado' using errcode = '22023'; end if;
    if not v_super and x.org_id is distinct from c.org_id then raise exception 'sem_acesso' using errcode = '42501'; end if;
  end if;

  if v_org is null then v_org := coalesce(x.org_id, c.org_id); end if;
  if v_org is distinct from coalesce(x.org_id, c.org_id) and not v_super then
    raise exception 'so_plataforma' using errcode = '42501';
  end if;
  select * into o from public.nx_orgs where id = v_org;
  if o.id is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'org_id'; end if;

  if j ? 'limites' and not v_super then raise exception 'so_plataforma' using errcode = '42501'; end if;
  if j ? 'limites' then
    v_lim := coalesce(j -> 'limites', '{}'::jsonb);
    if jsonb_typeof(v_lim) = 'null' then v_lim := '{}'::jsonb; end if;
    if jsonb_typeof(v_lim) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'limites'; end if;
    for k in select jsonb_object_keys(v_lim) loop
      if k not in ('usuarios', 'canais', 'funis', 'automacoes', 'contatos', 'ia_mes')
         or not (jsonb_typeof(v_lim -> k) = 'null'
                 or (jsonb_typeof(v_lim -> k) = 'number' and (v_lim ->> k)::numeric >= 0 and (v_lim ->> k)::numeric <= 1000000000
                     and (v_lim ->> k)::numeric = floor((v_lim ->> k)::numeric))) then
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'limites';
      end if;
    end loop;
  else
    v_lim := coalesce(x.limites, '{}'::jsonb);
  end if;

  v_plano := coalesce(nullif(j ->> 'plano', ''), x.plano,
                      case when o.tipo = 'plataforma' then 'interno' else coalesce(nullif(o.limites ->> 'plano_padrao', ''), 'essencial') end);
  select * into p from public.nx_planos where id = v_plano;
  if p.id is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'plano'; end if;
  if not v_super and v_plano is distinct from x.plano then
    if v_plano = 'interno' then raise exception 'so_plataforma' using errcode = '42501'; end if;
    if not p.ativo then raise exception 'dados_invalidos' using errcode = '22023', hint = 'plano'; end if;
  end if;

  if j ? 'modulos' then
    if jsonb_typeof(j -> 'modulos') <> 'array' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'modulos'; end if;
    select coalesce(array_agg(distinct m order by m), '{}'::text[]) into v_mod from jsonb_array_elements_text(j -> 'modulos') m;
    if exists (select 1 from unnest(v_mod) m where m not in ('crm', 'conversas', 'relatorios', 'ads', 'automacoes', 'marca')) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'modulos';
    end if;
  elsif x.id is null or v_plano is distinct from x.plano then
    v_mod := p.modulos;
  else
    v_mod := x.modulos;
  end if;
  if ('crm' = any(v_mod)) <> ('conversas' = any(v_mod)) then
    select array_agg(distinct m order by m) into v_mod from unnest(v_mod || array['crm', 'conversas']) m;
  end if;
  if not v_super and exists (select 1 from unnest(v_mod) m
                              where not (m = any(p.modulos))
                                and not (v_plano is not distinct from x.plano and m = any(coalesce(x.modulos, '{}'::text[])))) then
    raise exception 'so_plataforma' using errcode = '42501';
  end if;

  v_nome := coalesce(nullif(btrim(coalesce(j ->> 'nome', '')), ''), x.nome);
  if v_nome is null or char_length(v_nome) < 2 or char_length(v_nome) > 80 then raise exception 'nome_invalido' using errcode = '22023'; end if;
  v_slug := coalesce(nullif(lower(btrim(coalesce(j ->> 'slug', ''))), ''), x.slug);
  if v_slug is null or v_slug !~ '^[a-z0-9-]{2,40}$' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'slug'; end if;
  if exists (select 1 from public.nx_clientes y where y.slug = v_slug and y.id is distinct from v_id) then raise exception 'slug_em_uso' using errcode = '22023'; end if;
  v_vert := coalesce(nullif(j ->> 'vertical', ''), x.vertical, 'generico');
  if v_vert not in ('odonto', 'oficina', 'loja', 'generico') then raise exception 'dados_invalidos' using errcode = '22023', hint = 'vertical'; end if;
  v_status := coalesce(nullif(j ->> 'status', ''), x.status, 'ativo');
  if v_status not in ('ativo', 'teste', 'suspenso', 'cancelado') then raise exception 'dados_invalidos' using errcode = '22023', hint = 'status'; end if;
  begin
    v_teste := case when j ? 'teste_ate' then nullif(j ->> 'teste_ate', '')::date else x.teste_ate end;
  exception when others then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'teste_ate';
  end;
  if v_status = 'teste' and v_teste is null then v_teste := (now() at time zone 'America/Sao_Paulo')::date + 14; end if;

  if j ? 'comercial' and jsonb_typeof(j -> 'comercial') <> 'object' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'comercial';
  end if;
  if j ? 'comercial' then
    v_comercial_in := j -> 'comercial';
    v_pacote := nullif(btrim(coalesce(v_comercial_in ->> 'pacote', '')), '');
    v_segmento := btrim(coalesce(v_comercial_in ->> 'segmento', ''));
    v_especificacoes := btrim(coalesce(v_comercial_in ->> 'especificacoes', ''));
  else
    v_comercial_in := coalesce(x.comercial, '{}'::jsonb);
    v_pacote := nullif(btrim(coalesce(v_comercial_in ->> 'pacote', '')), '');
    v_segmento := coalesce(v_comercial_in ->> 'segmento', '');
    v_especificacoes := coalesce(v_comercial_in ->> 'especificacoes', '');
  end if;
  if v_pacote is not null and v_pacote not in ('essencial', 'profissional', 'ultra') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'comercial';
  end if;
  if char_length(v_segmento) > 120 or char_length(v_especificacoes) > 5000 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'comercial';
  end if;
  if v_pacote is not null and v_pacote = (x.comercial ->> 'pacote') then
    -- Regravar observações do cliente não troca silenciosamente um preço já combinado.
    v_preco_centavos := nullif(x.comercial ->> 'mensal_centavos', '')::int;
    v_integracao_centavos := nullif(x.comercial ->> 'integracao_centavos', '')::int;
  else
    v_preco_centavos := case v_pacote when 'essencial' then 129478 when 'profissional' then 187253 when 'ultra' then 228734 else null end;
    v_integracao_centavos := case v_pacote when 'essencial' then 88945 when 'profissional' then 119289 when 'ultra' then 134457 else null end;
  end if;
  v_comercial := jsonb_strip_nulls(jsonb_build_object(
    'pacote', v_pacote, 'mensal_centavos', v_preco_centavos, 'integracao_centavos', v_integracao_centavos,
    'segmento', v_segmento, 'especificacoes', v_especificacoes));

  if x.id is null then
    perform public.nx_exigir_limite_org(v_org, 'empresas', 1);
    insert into public.nx_clientes (slug, nome, org_id, plano, modulos, vertical, status, teste_ate, limites, comercial)
    values (v_slug, v_nome, v_org, v_plano, v_mod, v_vert, v_status, v_teste, v_lim, v_comercial)
    returning * into x;
    perform public.nx_auditar(v_org, x.id, c.id, 'cliente_criado',
      jsonb_build_object('plano', v_plano, 'status', v_status, 'vertical', v_vert, 'pacote_comercial', v_pacote));
  else
    if v_org is distinct from x.org_id then perform public.nx_exigir_limite_org(v_org, 'empresas', 1); end if;
    if v_plano is distinct from x.plano then v_mudou := v_mudou || jsonb_build_object('plano', jsonb_build_array(x.plano, v_plano)); end if;
    if v_status is distinct from x.status then v_mudou := v_mudou || jsonb_build_object('status', jsonb_build_array(x.status, v_status)); end if;
    if v_mod is distinct from x.modulos then v_mudou := v_mudou || jsonb_build_object('modulos', to_jsonb(v_mod)); end if;
    if v_lim is distinct from x.limites then v_mudou := v_mudou || jsonb_build_object('limites', v_lim); end if;
    if v_org is distinct from x.org_id then v_mudou := v_mudou || jsonb_build_object('org', v_org); end if;
    if v_comercial is distinct from coalesce(x.comercial, '{}'::jsonb) then
      v_mudou := v_mudou || jsonb_build_object('pacote_comercial', jsonb_build_object('pacote', v_pacote, 'especificacoes_atualizadas', true));
    end if;
    update public.nx_clientes
       set nome = v_nome, slug = v_slug, org_id = v_org, plano = v_plano, modulos = v_mod, vertical = v_vert,
           status = v_status, teste_ate = v_teste, limites = v_lim, comercial = v_comercial
     where id = x.id
     returning * into x;
    if v_mudou <> '{}'::jsonb then perform public.nx_auditar(v_org, x.id, c.id, 'cliente_alterado', v_mudou); end if;
  end if;
  return public.nx_cliente_admin_item(x.id);
end $$;

revoke all on function public.nx_cliente_admin_salvar(text,jsonb) from public, anon, authenticated;
grant execute on function public.nx_cliente_admin_salvar(text,jsonb) to anon, authenticated, service_role;
revoke all on function public.nx_cliente_admin_item(uuid) from public, anon, authenticated;
grant execute on function public.nx_cliente_admin_item(uuid) to service_role;

notify pgrst, 'reload schema';
