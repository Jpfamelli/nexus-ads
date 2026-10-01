-- ============================================================
-- ÓRBITA (SaaS da Nexus) — 20260928c_plataforma.sql · frente F3
-- RPCs de plataforma, marca, sessão leve, usuários, convites e senha
-- (ESPEC v1.1 §5.2 — parte P0-A). O complemento P0-B (org, tema,
-- domínios, planos, notificações, uso) fica em 20260928c_plataforma_b.sql.
--
-- Regras: plpgsql, security definer, search_path = '', nomes
-- qualificados; revoke + grant explícitos no fim; idempotente
-- (create or replace). Erros: message = código do Apêndice B,
-- errcode 42501 (acesso) / 22023 (dados), hint quando indicado.
-- Todas as RPCs de painel são VOLATILE (o nx_ctx grava auditoria).
-- Não mexe em nx_config nem em segredos; não altera dado existente.
-- ============================================================

-- ------------------------------------------------------------
-- Ajudantes internos (só service_role)
-- ------------------------------------------------------------

-- base dos links de uma ORG (convite de gestor): domínio ativo da org sem cliente → saas_url → null
create or replace function public.nx_link_base_org(p_org uuid)
returns text
language plpgsql stable
security definer
set search_path = ''
as $$
declare v text;
begin
  select 'https://' || d.host || '/app/' into v
    from public.nx_dominios d
   where d.org_id = p_org and d.cliente_id is null and d.status = 'ativo'
   order by d.criado_em limit 1;
  if v is not null then return v; end if;
  return (select nullif(btrim(x.saas_url), '') from public.nx_config x where x.id = 1);
end $$;

-- marca que pode sair sem login (nunca id, e-mail, limite): só as chaves públicas
create or replace function public.nx_marca_publica_de(p jsonb)
returns jsonb
language plpgsql immutable
security definer
set search_path = ''
as $$
begin
  if p is null or jsonb_typeof(p) <> 'object' then return '{}'::jsonb; end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'produto', p -> 'produto', 'logo', p -> 'logo', 'logo_claro', p -> 'logo_claro', 'favicon', p -> 'favicon',
    'cores', p -> 'cores', 'login_titulo', p -> 'login_titulo', 'login_texto', p -> 'login_texto',
    'suporte_wa', p -> 'suporte_wa'));
end $$;

-- hash curto do tema do cliente (inclui a marca do painel clássico usada como reserva)
create or replace function public.nx_tema_hash(p_tema jsonb, p_cfg jsonb)
returns text
language plpgsql immutable
security definer
set search_path = ''
as $$
begin
  return left(md5(coalesce(p_tema, '{}'::jsonb)::text || '|' || coalesce(p_cfg ->> 'corMarca', '') || '|'
                  || coalesce(p_cfg ->> 'logoUrl', '')), 10);
end $$;

-- item do Admin → Clientes (uso × limite)
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

-- ------------------------------------------------------------
-- nx_marca_publica (anon, sem token): host ativo → org (+cliente); senão ?org; senão plataforma
-- ------------------------------------------------------------
create or replace function public.nx_marca_publica(p_host text, p_org text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host text := lower(split_part(btrim(coalesce(p_host, '')), ':', 1));
  d public.nx_dominios;
  o public.nx_orgs;
  x public.nx_clientes;
begin
  if v_host <> '' then
    select * into d from public.nx_dominios where host = v_host and status = 'ativo';
  end if;
  if d.host is not null then
    select * into o from public.nx_orgs where id = d.org_id;
    if d.cliente_id is not null then select * into x from public.nx_clientes where id = d.cliente_id; end if;
  end if;
  if o.id is null and nullif(btrim(coalesce(p_org, '')), '') is not null then
    select * into o from public.nx_orgs where slug = lower(btrim(p_org));
  end if;
  if o.id is null then
    select * into o from public.nx_orgs where tipo = 'plataforma' limit 1;
  end if;
  return json_build_object(
    'org', case when o.id is null then null else json_build_object('slug', o.slug, 'nome', o.nome) end,
    'marca', public.nx_marca_publica_de(o.marca),
    'cliente', case when x.id is null then null
                    else json_build_object('slug', x.slug, 'nome', x.nome,
                                           'tema', jsonb_strip_nulls(jsonb_build_object('logo', x.tema -> 'logo',
                                                     'logo_claro', x.tema -> 'logo_claro', 'cores', x.tema -> 'cores'))) end);
end $$;

-- ------------------------------------------------------------
-- nx_app_sessao: sessão LEVE do app novo (sem cfg, logo ou tema; < 50 KB com 200 clientes).
-- Para caber, cada cliente leva só o que foge do padrão (o shell completa — app.js carregarSessao):
--   chaves nulas/falsas saem (json_strip_nulls); status 'ativo' sai; modulos só quando diferem dos
--   módulos do plano (a tabela plano → módulos vai UMA vez em modulos_plano); link_base só quando vem
--   de domínio próprio (o padrão, saas_url, vai uma vez em link_base_padrao); 'proprio' = gestor/super
--   COM acesso próprio no cliente (sem ele, o shell mostra a faixa de suporte).
-- ------------------------------------------------------------
create or replace function public.nx_app_sessao(p_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.nx_contas := public.nx_conta_do_token(p_token);
  v_super boolean;
  o public.nx_orgs;
  v_padrao text;
begin
  update public.nx_contas set ultimo_acesso = now() where id = c.id;
  v_super := public.nx_super(c);
  select * into o from public.nx_orgs where id = c.org_id;
  select nullif(btrim(x.saas_url), '') into v_padrao from public.nx_config x where x.id = 1;
  return json_build_object(
    'conta', json_build_object('id', c.id, 'nome', c.nome, 'email', c.email, 'papel', c.papel, 'org_id', c.org_id,
                               'super', v_super, 'telefone', c.telefone, 'trocar_senha', c.trocar_senha),
    'org', case when o.id is null then null
                else json_build_object('id', o.id, 'slug', o.slug, 'nome', o.nome, 'tipo', o.tipo,
                                       'marca', o.marca - 'logo' - 'logo_claro' - 'favicon',
                                       -- assinatura curta das imagens (que não vêm aqui): troca de logo derruba o cache do navegador
                                       'img_hash', left(md5(coalesce(o.marca ->> 'logo', '') || '|' || coalesce(o.marca ->> 'logo_claro', '')
                                                            || '|' || coalesce(o.marca ->> 'favicon', '')), 10)) end,
    'link_base_padrao', v_padrao,
    'modulos_plano', (select json_object_agg(pp.id, pp.modulos) from public.nx_planos pp),
    'clientes', coalesce((
      select json_agg(json_strip_nulls(json_build_object(
               'id', x.id, 'slug', x.slug, 'nome', x.nome, 'status', nullif(x.status, 'ativo'), 'teste_ate', x.teste_ate,
               'plano', x.plano,
               'modulos', case when pl.modulos is null or not (x.modulos @> pl.modulos and x.modulos <@ pl.modulos)
                               then x.modulos end,
               'vertical', x.vertical, 'papel', p.papel,
               'tem_tema', case when x.tema <> '{}'::jsonb or x.cfg ? 'corMarca' or x.cfg ? 'logoUrl' then true end,
               'tema_hash', case when x.tema <> '{}'::jsonb or x.cfg ? 'corMarca' or x.cfg ? 'logoUrl'
                                 then public.nx_tema_hash(x.tema, x.cfg) end,
               'link_base', nullif(public.nx_link_base(x.id), v_padrao),
               'proprio', case when p.papel in ('gestor', 'super') and a.conta_id is not null then true end,
               'org_nome', case when v_super and x.org_id is distinct from c.org_id then xo.nome end))
             order by x.nome)
        from public.nx_clientes x
        cross join lateral (select public.nx_papel_em(c, x.id) as papel) p
        left join public.nx_acessos a on a.conta_id = c.id and a.cliente_id = x.id
        left join public.nx_orgs xo on xo.id = x.org_id
        left join public.nx_planos pl on pl.id = x.plano
       where p.papel is not null), '[]'::json));
end $$;

-- ------------------------------------------------------------
-- nx_cliente_tema (leitura): tema + marca do painel clássico como reserva + hash
-- ------------------------------------------------------------
create or replace function public.nx_cliente_tema(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura'); x public.nx_clientes;
begin
  select * into x from public.nx_clientes where id = p_cliente;
  return json_build_object(
    'tema', x.tema,
    'marca_cliente', json_build_object('corMarca', x.cfg ->> 'corMarca', 'logoUrl', x.cfg ->> 'logoUrl'),
    'atualizado', public.nx_tema_hash(x.tema, x.cfg));
end $$;

-- ------------------------------------------------------------
-- Usuários e convites da empresa (admin)
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
      select json_agg(json_build_object('id', cv.id, 'papel', cv.papel, 'email', cv.email, 'nome', cv.nome,
                                        'expira_em', cv.expira_em, 'criado_em', cv.criado_em) order by cv.criado_em desc)
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

create or replace function public.nx_usuario_salvar(p_token text, p_cliente uuid, p_usuario jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  c public.nx_contas;
  v_alvo uuid;
  a public.nx_acessos;
  v_papel text;
  v_deps uuid[];
  v_ver boolean;
  v_rec boolean;
  j jsonb := coalesce(p_usuario, '{}'::jsonb);
begin
  select * into c from public.nx_contas where id = v.conta_id;
  begin
    v_alvo := nullif(j ->> 'conta_id', '')::uuid;
  exception when others then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'conta_id';
  end;
  if v_alvo is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'conta_id'; end if;
  -- papel próprio: erro claro antes do escopo
  if v_alvo = c.id and j ? 'papel' and (j ->> 'papel') is distinct from
       (select x.papel from public.nx_acessos x where x.conta_id = c.id and x.cliente_id = p_cliente) then
    raise exception 'nao_pode_alterar_a_si' using errcode = '42501';
  end if;
  if not public.nx_conta_no_escopo(c, v_alvo, p_cliente) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select * into a from public.nx_acessos where conta_id = v_alvo and cliente_id = p_cliente for update;
  if a.conta_id is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'conta_id'; end if;

  v_papel := coalesce(nullif(j ->> 'papel', ''), a.papel);
  if v_papel not in ('admin', 'supervisor', 'atendente', 'leitura') then
    raise exception 'papel_invalido' using errcode = '22023';
  end if;
  if a.papel = 'admin' and v_papel <> 'admin'
     and not exists (select 1 from public.nx_acessos x
                      where x.cliente_id = p_cliente and x.papel = 'admin' and x.conta_id <> v_alvo) then
    raise exception 'ultimo_admin' using errcode = '22023';
  end if;

  if j ? 'departamentos' then
    if jsonb_typeof(j -> 'departamentos') <> 'array' then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamentos';
    end if;
    begin
      select coalesce(array_agg(distinct e::uuid), '{}'::uuid[]) into v_deps
        from jsonb_array_elements_text(j -> 'departamentos') e;
    exception when others then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamentos';
    end;
    if exists (select 1 from unnest(v_deps) dd
                where not exists (select 1 from public.nx_departamentos d where d.id = dd and d.cliente_id = p_cliente)) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamentos';
    end if;
  else
    v_deps := a.departamentos;
  end if;
  v_ver := case when jsonb_typeof(j -> 'ver_todas') = 'boolean' then (j ->> 'ver_todas')::boolean else a.ver_todas end;
  v_rec := case when jsonb_typeof(j -> 'recebe_conversas') = 'boolean' then (j ->> 'recebe_conversas')::boolean else a.recebe_conversas end;

  update public.nx_acessos
     set papel = v_papel, departamentos = v_deps, ver_todas = v_ver, recebe_conversas = v_rec
   where conta_id = v_alvo and cliente_id = p_cliente;
  if v_papel <> a.papel then
    perform public.nx_auditar((select x.org_id from public.nx_clientes x where x.id = p_cliente), p_cliente, c.id, 'papel',
                              jsonb_build_object('conta', v_alvo, 'de', a.papel, 'para', v_papel));
  end if;
  return public.nx_usuarios_listar(p_token, p_cliente);
end $$;

create or replace function public.nx_usuario_remover(p_token text, p_cliente uuid, p_conta uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); c public.nx_contas; a public.nx_acessos;
begin
  select * into c from public.nx_contas where id = v.conta_id;
  if p_conta is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'conta_id'; end if;
  if p_conta = c.id then raise exception 'nao_pode_alterar_a_si' using errcode = '42501'; end if;
  if not public.nx_conta_no_escopo(c, p_conta, p_cliente) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select * into a from public.nx_acessos where conta_id = p_conta and cliente_id = p_cliente for update;
  if a.conta_id is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'conta_id'; end if;
  if a.papel = 'admin' and not exists (select 1 from public.nx_acessos x
                                        where x.cliente_id = p_cliente and x.papel = 'admin' and x.conta_id <> p_conta) then
    raise exception 'ultimo_admin' using errcode = '22023';
  end if;
  delete from public.nx_acessos where conta_id = p_conta and cliente_id = p_cliente;
  perform public.nx_auditar((select x.org_id from public.nx_clientes x where x.id = p_cliente), p_cliente, c.id,
                            'acesso_removido', jsonb_build_object('conta', p_conta, 'papel', a.papel));
  return public.nx_usuarios_listar(p_token, p_cliente);
end $$;

-- ------------------------------------------------------------
-- Convites (link, sem e-mail)
-- ------------------------------------------------------------
create or replace function public.nx_convite_criar(p_token text, p_cliente uuid, p_dados jsonb, p_org uuid default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.nx_contas := public.nx_conta_do_token(p_token);
  j jsonb := coalesce(p_dados, '{}'::jsonb);
  v_papel text := nullif(j ->> 'papel', '');
  v_dias int;
  v_org uuid;
  v_deps uuid[] := '{}'::uuid[];
  v_email text := nullif(lower(btrim(coalesce(j ->> 'email', ''))), '');
  v_nome text := nullif(btrim(coalesce(j ->> 'nome', '')), '');
  v_token text;
  v_id uuid;
  v_exp timestamptz;
  v_base text;
  v public.nx_ctx_t;
begin
  begin
    v_dias := coalesce(nullif(j ->> 'dias', '')::int, 7);
  exception when others then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'dias';
  end;
  if v_dias < 1 or v_dias > 30 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'dias'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido' using errcode = '22023'; end if;
  if v_nome is not null and char_length(v_nome) > 80 then raise exception 'nome_invalido' using errcode = '22023'; end if;

  if p_cliente is null then
    -- convite de GESTOR da org: só quem é gestor daquela org; outra org só o super
    if v_papel is distinct from 'gestor' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'papel'; end if;
    v_org := coalesce(p_org, c.org_id);
    if not public.nx_super(c) and (c.papel <> 'gestor' or v_org is distinct from c.org_id) then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
    if not exists (select 1 from public.nx_orgs o where o.id = v_org) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'org';
    end if;
  else
    if v_papel is null or v_papel not in ('admin', 'supervisor', 'atendente', 'leitura') then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'papel';
    end if;
    v := public.nx_ctx(p_token, p_cliente, 'admin');     -- sem_acesso / sem_permissao / conta_suspensa
    select x.org_id into v_org from public.nx_clientes x where x.id = p_cliente;
    if j ? 'departamentos' and jsonb_typeof(j -> 'departamentos') = 'array' then
      begin
        select coalesce(array_agg(distinct e::uuid), '{}'::uuid[]) into v_deps
          from jsonb_array_elements_text(j -> 'departamentos') e;
      exception when others then
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamentos';
      end;
      if exists (select 1 from unnest(v_deps) dd
                  where not exists (select 1 from public.nx_departamentos d where d.id = dd and d.cliente_id = p_cliente)) then
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamentos';
      end if;
    end if;
    perform public.nx_exigir_limite(p_cliente, 'usuarios', 1);   -- cliente e soma da revenda
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_exp := now() + make_interval(days => v_dias);
  insert into public.nx_convites (token_hash, org_id, cliente_id, papel, departamentos, email, nome, criado_por, expira_em)
  values (public.nx_hash(v_token), v_org, p_cliente, v_papel, v_deps, v_email, v_nome, c.id, v_exp)
  returning id into v_id;

  v_base := case when p_cliente is not null then public.nx_link_base(p_cliente) else public.nx_link_base_org(v_org) end;
  perform public.nx_auditar(v_org, p_cliente, c.id, 'convite_criado', jsonb_build_object('convite', v_id, 'papel', v_papel));
  return json_build_object('id', v_id, 'token', v_token, 'expira_em', v_exp,
                           'link', coalesce(v_base, '') || '#/convite/' || v_token);
end $$;

create or replace function public.nx_convite_revogar(p_token text, p_cliente uuid, p_convite uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare c public.nx_contas := public.nx_conta_do_token(p_token); v public.nx_ctx_t; cv public.nx_convites;
begin
  if p_cliente is not null then
    v := public.nx_ctx(p_token, p_cliente, 'admin');
    update public.nx_convites set revogado = true
     where id = p_convite and cliente_id = p_cliente and usado_em is null
    returning * into cv;
  else
    -- convite de gestor: gestor da própria org; super qualquer
    select * into cv from public.nx_convites where id = p_convite and cliente_id is null and usado_em is null;
    if cv.id is not null and not (public.nx_super(c) or (c.papel = 'gestor' and cv.org_id = c.org_id)) then
      cv := null;
    end if;
    if cv.id is not null then update public.nx_convites set revogado = true where id = cv.id; end if;
  end if;
  if cv.id is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'convite'; end if;
  perform public.nx_auditar(cv.org_id, cv.cliente_id, c.id, 'convite_revogado', jsonb_build_object('convite', cv.id));
  return json_build_object('ok', true);
end $$;

-- anon: o que o convite oferece. Nunca diz se o e-mail já tem conta.
create or replace function public.nx_convite_ver(p_convite text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare cv public.nx_convites; o public.nx_orgs; x public.nx_clientes;
begin
  if p_convite is null or p_convite !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'convite_invalido' using errcode = '22023';
  end if;
  select * into cv from public.nx_convites where token_hash = public.nx_hash(lower(p_convite));
  if cv.id is null or cv.usado_em is not null or cv.revogado or cv.expira_em <= now() or cv.tentativas >= 5 then
    raise exception 'convite_invalido' using errcode = '22023';
  end if;
  select * into o from public.nx_orgs where id = cv.org_id;
  if cv.cliente_id is not null then select * into x from public.nx_clientes where id = cv.cliente_id; end if;
  return json_build_object(
    'org', json_build_object('nome', o.nome, 'marca', public.nx_marca_publica_de(o.marca)),
    'cliente', case when x.id is null then null else json_build_object('nome', x.nome) end,
    'papel', cv.papel, 'email', cv.email, 'nome', cv.nome);
end $$;

-- anon: aceita o convite. ÚNICA RPC com erro por retorno ({ok:false, erro}) — a senha errada precisa
-- gravar tentativas + 1, e uma exceção desfaria o contador.
create or replace function public.nx_convite_aceitar(p_convite text, p_nome text, p_email text, p_senha text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  cv public.nx_convites;
  k public.nx_contas;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_nome text := btrim(coalesce(p_nome, ''));
  v_token text;
begin
  if p_convite is null or p_convite !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'convite_invalido' using errcode = '22023';
  end if;
  select * into cv from public.nx_convites where token_hash = public.nx_hash(lower(p_convite)) for update;
  if cv.id is null or cv.usado_em is not null or cv.revogado or cv.expira_em <= now() or cv.tentativas >= 5 then
    raise exception 'convite_invalido' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido' using errcode = '22023'; end if;

  select * into k from public.nx_contas where email = v_email;
  if k.id is null then
    -- conta NOVA, já aprovada, na org do convite
    if char_length(v_nome) < 2 or char_length(v_nome) > 80 then raise exception 'nome_invalido' using errcode = '22023'; end if;
    if length(coalesce(p_senha, '')) < 8 then raise exception 'senha_curta' using errcode = '22023'; end if;
    insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id)
    values (v_email, v_nome, extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
            case when cv.papel = 'gestor' then 'gestor' else 'clinica' end, true, cv.org_id)
    returning * into k;
    if cv.cliente_id is not null then
      insert into public.nx_acessos (conta_id, cliente_id, papel, departamentos)
      values (k.id, cv.cliente_id, cv.papel, cv.departamentos)
      on conflict (conta_id, cliente_id) do nothing;
    end if;
  else
    -- conta EXISTENTE: nunca vira gestor por convite; nunca muda org, papel, nome ou senha
    if cv.papel = 'gestor' then
      raise exception 'convite_invalido' using errcode = '22023', hint = 'conta_existente';
    end if;
    if k.senha_hash <> extensions.crypt(coalesce(p_senha, ''), k.senha_hash) then
      perform pg_sleep(0.4);
      update public.nx_convites set tentativas = tentativas + 1 where id = cv.id;
      return json_build_object('ok', false, 'erro', 'credenciais_invalidas');
    end if;
    if not k.aprovado then raise exception 'conta_pendente' using errcode = '28000'; end if;
    insert into public.nx_acessos (conta_id, cliente_id, papel, departamentos)
    values (k.id, cv.cliente_id, cv.papel, cv.departamentos)
    on conflict (conta_id, cliente_id) do nothing;
  end if;

  update public.nx_convites set usado_em = now(), usado_por = k.id where id = cv.id;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(v_token), k.id, now() + interval '30 days');
  delete from public.nx_sessoes where expira_em < now();
  perform public.nx_auditar(cv.org_id, cv.cliente_id, k.id, 'convite_aceito', jsonb_build_object('convite', cv.id, 'papel', cv.papel));
  return json_build_object('ok', true, 'token', v_token, 'nome', k.nome, 'papel', k.papel, 'cliente_id', cv.cliente_id);
end $$;

-- ------------------------------------------------------------
-- Senha: link gerado pelo admin (sem e-mail), redefinir, trocar, sair de todas, perfil
-- ------------------------------------------------------------
create or replace function public.nx_senha_link_criar(p_token text, p_cliente uuid, p_conta uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); c public.nx_contas; v_token text; v_exp timestamptz;
begin
  select * into c from public.nx_contas where id = v.conta_id;
  if p_conta is null or p_conta = c.id then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if not public.nx_conta_no_escopo(c, p_conta, p_cliente) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if not exists (select 1 from public.nx_contas k where k.id = p_conta) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'conta';
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_exp := now() + interval '24 hours';
  insert into public.nx_senha_links (token_hash, conta_id, criado_por, expira_em)
  values (public.nx_hash(v_token), p_conta, c.id, v_exp);
  perform public.nx_auditar((select x.org_id from public.nx_clientes x where x.id = p_cliente), p_cliente, c.id,
                            'senha_link', jsonb_build_object('conta', p_conta));
  return json_build_object('token', v_token, 'expira_em', v_exp,
                           'link', coalesce(public.nx_link_base(p_cliente), '') || '#/senha/' || v_token);
end $$;

create or replace function public.nx_senha_redefinir(p_link text, p_senha text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare l public.nx_senha_links; k public.nx_contas;
begin
  if p_link is null or p_link !~ '^[0-9a-fA-F]{64}$' then raise exception 'link_invalido' using errcode = '22023'; end if;
  select * into l from public.nx_senha_links where token_hash = public.nx_hash(lower(p_link)) for update;
  if l.token_hash is null or l.usado_em is not null or l.expira_em <= now() then
    raise exception 'link_invalido' using errcode = '22023';
  end if;
  if length(coalesce(p_senha, '')) < 8 then raise exception 'senha_curta' using errcode = '22023'; end if;
  update public.nx_contas set senha_hash = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)), trocar_senha = false
   where id = l.conta_id returning * into k;
  delete from public.nx_sessoes where conta_id = l.conta_id;
  update public.nx_senha_links set usado_em = now() where conta_id = l.conta_id and usado_em is null;
  perform public.nx_auditar(k.org_id, null, k.id, 'senha_redefinida', '{}'::jsonb);
  return json_build_object('ok', true);
end $$;

create or replace function public.nx_senha_trocar(p_token text, p_atual text, p_nova text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare c public.nx_contas := public.nx_conta_do_token(p_token);
begin
  if c.senha_hash <> extensions.crypt(coalesce(p_atual, ''), c.senha_hash) then
    perform pg_sleep(0.4);
    raise exception 'credenciais_invalidas' using errcode = '28000';
  end if;
  if length(coalesce(p_nova, '')) < 8 then raise exception 'senha_curta' using errcode = '22023'; end if;
  update public.nx_contas set senha_hash = extensions.crypt(p_nova, extensions.gen_salt('bf', 10)), trocar_senha = false
   where id = c.id;
  -- as outras sessões caem; esta continua
  delete from public.nx_sessoes where conta_id = c.id and token_hash <> public.nx_hash(p_token);
  return json_build_object('ok', true);
end $$;

create or replace function public.nx_sair_todas(p_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare c public.nx_contas := public.nx_conta_do_token(p_token);
begin
  delete from public.nx_sessoes where conta_id = c.id;
  return json_build_object('ok', true);
end $$;

create or replace function public.nx_perfil_salvar(p_token text, p_dados jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.nx_contas := public.nx_conta_do_token(p_token);
  j jsonb := coalesce(p_dados, '{}'::jsonb);
  v_nome text := c.nome;
  v_tel text := c.telefone;
begin
  if j ? 'nome' then
    v_nome := btrim(coalesce(j ->> 'nome', ''));
    if char_length(v_nome) < 2 or char_length(v_nome) > 80 then raise exception 'nome_invalido' using errcode = '22023'; end if;
  end if;
  if j ? 'telefone' then
    v_tel := nullif(regexp_replace(coalesce(j ->> 'telefone', ''), '\D', '', 'g'), '');
    if v_tel is not null then
      v_tel := public.nx_tel_normalizar(v_tel, false);
      if v_tel is null then raise exception 'telefone_invalido' using errcode = '22023'; end if;
    end if;
  end if;
  update public.nx_contas set nome = v_nome, telefone = v_tel where id = c.id returning * into c;
  return json_build_object('id', c.id, 'nome', c.nome, 'email', c.email, 'papel', c.papel, 'telefone', c.telefone);
end $$;

-- ------------------------------------------------------------
-- Admin (gestor/super): planos, orgs, clientes
-- ------------------------------------------------------------
create or replace function public.nx_planos_listar(p_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare c public.nx_contas := public.nx_exigir_gestor(p_token); v_super boolean := public.nx_super(c);
begin
  return coalesce((
    select json_agg(json_build_object('id', p.id, 'nome', p.nome, 'preco_mensal', p.preco_mensal, 'limites', p.limites,
                                      'modulos', p.modulos, 'ativo', p.ativo, 'ordem', p.ordem) order by p.ordem, p.id)
      from public.nx_planos p
     where v_super or (p.ativo and p.id <> 'interno')), '[]'::json);
end $$;

create or replace function public.nx_orgs_listar(p_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare c public.nx_contas := public.nx_exigir_gestor(p_token); v_super boolean := public.nx_super(c);
begin
  return coalesce((
    select json_agg(json_build_object(
             'id', o.id, 'slug', o.slug, 'nome', o.nome, 'tipo', o.tipo, 'status', o.status, 'marca', o.marca, 'limites', o.limites,
             'empresas', (select count(*) from public.nx_clientes x where x.org_id = o.id),
             'usuarios', (select count(*) from public.nx_acessos a join public.nx_clientes x on x.id = a.cliente_id where x.org_id = o.id),
             'canais', (select count(*) from public.nx_canais k join public.nx_clientes x on x.id = k.cliente_id where x.org_id = o.id))
           order by (o.tipo = 'plataforma') desc, o.nome)
      from public.nx_orgs o
     where v_super or o.id = c.org_id), '[]'::json);
end $$;

create or replace function public.nx_clientes_admin(p_token text, p_filtro jsonb default '{}'::jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.nx_contas := public.nx_exigir_gestor(p_token);
  v_super boolean := public.nx_super(c);
  j jsonb := coalesce(p_filtro, '{}'::jsonb);
  v_busca text := nullif(lower(extensions.unaccent(btrim(coalesce(j ->> 'busca', '')))), '');
  v_status text := nullif(j ->> 'status', '');
  v_org uuid;
  v_id uuid;
begin
  begin
    v_org := case when v_super then nullif(j ->> 'org_id', '')::uuid end;
    v_id := nullif(j ->> 'id', '')::uuid;
  exception when others then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'filtro';
  end;
  if v_status is not null and v_status not in ('ativo', 'teste', 'suspenso', 'cancelado') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'status';
  end if;
  return coalesce((
    select json_agg(public.nx_cliente_admin_item(s.id) order by s.nome)
      from (select x.id, x.nome from public.nx_clientes x
             where (v_super or x.org_id = c.org_id)
               and (v_org is null or x.org_id = v_org)
               and (v_status is null or x.status = v_status)
               and (v_id is null or x.id = v_id)
               and (v_busca is null or lower(extensions.unaccent(x.nome || ' ' || x.slug)) like '%' || v_busca || '%')
             order by x.nome limit 500) s), '[]'::json);
end $$;

-- criar/editar cliente pelo Admin. Não-super: plano ativo ≠ interno, módulos ⊂ plano, sem limites/org alheia.
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
    -- gestor só na PRÓPRIA org. (O nx_pode aceitaria também um acesso comum da conta nesse cliente:
    -- um gestor de revenda convidado como atendente num cliente da Nexus poderia suspendê-lo.)
    if not v_super and x.org_id is distinct from c.org_id then raise exception 'sem_acesso' using errcode = '42501'; end if;
  end if;

  -- org: não-super só a própria
  if v_org is null then v_org := coalesce(x.org_id, c.org_id); end if;
  if v_org is distinct from coalesce(x.org_id, c.org_id) and not v_super then
    raise exception 'so_plataforma' using errcode = '42501';
  end if;
  select * into o from public.nx_orgs where id = v_org;
  if o.id is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'org_id'; end if;

  -- limites extras: só o super
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

  -- plano
  v_plano := coalesce(nullif(j ->> 'plano', ''), x.plano,
                      case when o.tipo = 'plataforma' then 'interno' else coalesce(nullif(o.limites ->> 'plano_padrao', ''), 'essencial') end);
  select * into p from public.nx_planos where id = v_plano;
  if p.id is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'plano'; end if;
  if not v_super and v_plano is distinct from x.plano then
    if v_plano = 'interno' then raise exception 'so_plataforma' using errcode = '42501'; end if;
    if not p.ativo then raise exception 'dados_invalidos' using errcode = '22023', hint = 'plano'; end if;
  end if;

  -- módulos: padrão = do plano; crm e conversas sempre juntos; não-super só dentro do plano
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
  -- não-super não LIGA módulo fora do plano; o que a plataforma já ligou no cliente (mesmo plano) pode ficar
  -- (senão o gestor não conseguia nem renomear um cliente com módulo extra dado pelo super)
  if not v_super and exists (select 1 from unnest(v_mod) m
                              where not (m = any(p.modulos))
                                and not (v_plano is not distinct from x.plano and m = any(coalesce(x.modulos, '{}'::text[])))) then
    raise exception 'so_plataforma' using errcode = '42501';
  end if;

  -- dados
  v_nome := coalesce(nullif(btrim(coalesce(j ->> 'nome', '')), ''), x.nome);
  if v_nome is null or char_length(v_nome) < 2 or char_length(v_nome) > 80 then raise exception 'nome_invalido' using errcode = '22023'; end if;
  v_slug := coalesce(nullif(lower(btrim(coalesce(j ->> 'slug', ''))), ''), x.slug);
  if v_slug is null or v_slug !~ '^[a-z0-9-]{2,40}$' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'slug'; end if;
  if exists (select 1 from public.nx_clientes y where y.slug = v_slug and y.id is distinct from v_id) then
    raise exception 'slug_em_uso' using errcode = '22023';
  end if;
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

  if x.id is null then
    perform public.nx_exigir_limite_org(v_org, 'empresas', 1);
    insert into public.nx_clientes (slug, nome, org_id, plano, modulos, vertical, status, teste_ate, limites)
    values (v_slug, v_nome, v_org, v_plano, v_mod, v_vert, v_status, v_teste, v_lim)
    returning * into x;
    perform public.nx_auditar(v_org, x.id, c.id, 'cliente_criado',
                              jsonb_build_object('plano', v_plano, 'status', v_status, 'vertical', v_vert));
  else
    if v_org is distinct from x.org_id then perform public.nx_exigir_limite_org(v_org, 'empresas', 1); end if;
    if v_plano is distinct from x.plano then v_mudou := v_mudou || jsonb_build_object('plano', jsonb_build_array(x.plano, v_plano)); end if;
    if v_status is distinct from x.status then v_mudou := v_mudou || jsonb_build_object('status', jsonb_build_array(x.status, v_status)); end if;
    if v_mod is distinct from x.modulos then v_mudou := v_mudou || jsonb_build_object('modulos', to_jsonb(v_mod)); end if;
    if v_lim is distinct from x.limites then v_mudou := v_mudou || jsonb_build_object('limites', v_lim); end if;
    if v_org is distinct from x.org_id then v_mudou := v_mudou || jsonb_build_object('org', v_org); end if;
    update public.nx_clientes
       set nome = v_nome, slug = v_slug, org_id = v_org, plano = v_plano, modulos = v_mod, vertical = v_vert,
           status = v_status, teste_ate = v_teste, limites = v_lim
     where id = x.id;
    if v_mudou <> '{}'::jsonb then
      perform public.nx_auditar(v_org, x.id, c.id, 'cliente_alterado', v_mudou);
    end if;
  end if;
  return public.nx_cliente_admin_item(x.id);
end $$;

-- ------------------------------------------------------------
-- Permissões (regra 5)
-- ------------------------------------------------------------
do $$
declare f text;
begin
  -- painel (chave pública)
  foreach f in array array[
    'public.nx_marca_publica(text,text)', 'public.nx_app_sessao(text)', 'public.nx_cliente_tema(text,uuid)',
    'public.nx_usuarios_listar(text,uuid)', 'public.nx_usuario_salvar(text,uuid,jsonb)', 'public.nx_usuario_remover(text,uuid,uuid)',
    'public.nx_convite_criar(text,uuid,jsonb,uuid)', 'public.nx_convite_revogar(text,uuid,uuid)', 'public.nx_convite_ver(text)',
    'public.nx_convite_aceitar(text,text,text,text)', 'public.nx_senha_link_criar(text,uuid,uuid)',
    'public.nx_senha_redefinir(text,text)', 'public.nx_senha_trocar(text,text,text)', 'public.nx_sair_todas(text)',
    'public.nx_perfil_salvar(text,jsonb)', 'public.nx_planos_listar(text)', 'public.nx_orgs_listar(text)',
    'public.nx_clientes_admin(text,jsonb)', 'public.nx_cliente_admin_salvar(text,jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
  -- internas
  foreach f in array array[
    'public.nx_link_base_org(uuid)', 'public.nx_marca_publica_de(jsonb)', 'public.nx_tema_hash(jsonb,jsonb)',
    'public.nx_cliente_admin_item(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
