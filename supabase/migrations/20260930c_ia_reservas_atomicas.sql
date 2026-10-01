-- Órbita — reservas atômicas de cota da IA.
-- Migração aditiva: serializa decisões de cota por empresa, sem tocar nx_config.
begin;

create table if not exists public.nx_ia_reservas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  conta_id uuid not null references public.nx_contas(id) on delete cascade,
  acao text not null check (acao in ('sugerir','resumir')),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '5 minutes')
);
create index if not exists nx_ia_reservas_cliente_criado
  on public.nx_ia_reservas(cliente_id, criado_em);
create index if not exists nx_ia_reservas_expira
  on public.nx_ia_reservas(cliente_id, expira_em);
alter table public.nx_ia_reservas enable row level security;
revoke all on table public.nx_ia_reservas from public, anon, authenticated;
grant all on table public.nx_ia_reservas to service_role;

alter table public.nx_ia_uso add column if not exists reserva_id uuid;
create unique index if not exists nx_ia_uso_reserva_unica
  on public.nx_ia_uso(reserva_id) where reserva_id is not null;

-- A cota é por chamada à IA, inclusive recusas/falhas depois de iniciar o provedor:
-- protege custo e mantém o número exibido pelo plano alinhado à trava atômica.
create or replace function public.nx_uso(p_cliente uuid, p_chave text)
returns int
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  case p_chave
    when 'usuarios' then
      return (select count(*) from public.nx_acessos a where a.cliente_id = p_cliente)
           + (select count(*) from public.nx_convites v
               where v.cliente_id = p_cliente and v.usado_em is null and not v.revogado
                 and v.expira_em > now() and v.tentativas < 5);
    when 'canais' then
      return (select count(*) from public.nx_canais k where k.cliente_id = p_cliente);
    when 'funis' then
      return (select count(*) from public.nx_funis f where f.cliente_id = p_cliente and f.ativo);
    when 'automacoes' then
      return (select count(*) from public.nx_automacoes a where a.cliente_id = p_cliente);
    when 'contatos' then
      return (select count(*) from public.nx_contatos k where k.cliente_id = p_cliente);
    when 'ia_mes' then
      return (select count(*) from public.nx_ia_uso u
               where u.cliente_id = p_cliente
                 and u.criado_em >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'));
    when 'empresas' then
      return (select count(*) from public.nx_clientes x
               where x.org_id = (select c.org_id from public.nx_clientes c where c.id = p_cliente));
    else
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'chave';
  end case;
end $$;

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
  if p_cliente is null or p_conta is null or p_acao is null or p_acao not in ('sugerir','resumir') then
    return json_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  if not exists (select 1 from public.nx_acessos a where a.cliente_id = p_cliente and a.conta_id = p_conta) then
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

  select count(*)::int into v_minuto from public.nx_ia_uso u
   where u.cliente_id = p_cliente and u.conta_id = p_conta and u.criado_em > v_agora - interval '1 minute';
  v_minuto := v_minuto + (select count(*)::int from public.nx_ia_reservas r
    where r.cliente_id = p_cliente and r.conta_id = p_conta and r.criado_em > v_agora - interval '1 minute' and r.expira_em > v_agora);
  if v_minuto >= 20 then
    return json_build_object('ok', false, 'erro', 'muitos_pedidos');
  end if;

  insert into public.nx_ia_reservas(cliente_id, conta_id, acao, criado_em, expira_em)
  values (p_cliente, p_conta, p_acao, v_agora, v_agora + interval '5 minutes')
  returning id into v_id;
  return json_build_object('ok', true, 'reserva_id', v_id);
end $$;

create or replace function public.nx_ia_registrar_reserva(p_reserva uuid, p_modelo text, p_in int, p_out int, p_ok boolean)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.nx_ia_reservas;
begin
  if p_reserva is null then return json_build_object('ok', false, 'erro', 'dados_invalidos'); end if;
  select * into r from public.nx_ia_reservas where id = p_reserva for update;
  if not found then
    return json_build_object('ok', exists(select 1 from public.nx_ia_uso u where u.reserva_id = p_reserva));
  end if;
  insert into public.nx_ia_uso(reserva_id, cliente_id, conta_id, acao, modelo, tokens_in, tokens_out, ok)
  values (r.id, r.cliente_id, r.conta_id, r.acao, left(p_modelo, 80), p_in, p_out, coalesce(p_ok, false))
  on conflict (reserva_id) where reserva_id is not null do nothing;
  delete from public.nx_ia_reservas where id = r.id;
  return json_build_object('ok', true);
end $$;

revoke all on function public.nx_ia_reservar(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.nx_ia_registrar_reserva(uuid, text, int, int, boolean) from public, anon, authenticated;
grant execute on function public.nx_ia_reservar(uuid, uuid, text) to service_role;
grant execute on function public.nx_ia_registrar_reserva(uuid, text, int, int, boolean) to service_role;

notify pgrst, 'reload schema';
commit;
