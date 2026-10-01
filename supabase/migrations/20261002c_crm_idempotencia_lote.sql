-- ============================================================
-- ÓRBITA — 20261002c_crm_idempotencia_lote.sql · frente C (CRM e Agenda) · plano de melhorias de 01/10/2026
--
-- M25  Criar duas vezes sem querer não cria dois: chave de idempotência `p_req` (uuid) em
--      nx_negocio_salvar (criação), nx_contato_salvar (criação), nx_tarefa_salvar (criação) e nx_agenda_marcar.
--      A mesma (cliente, p_req) repetida em até 24 h devolve o MESMO resultado e não grava nada de novo.
--      O cliente gera o uuid por intenção (api.js `{req: true}`) e o reenvia no «Salvar de novo» depois de um erro ambíguo
--      (prazo estourado depois de o servidor já ter aplicado).
--
-- ADITIVA e idempotente (create … if not exists / create or replace), nada de drop e nenhuma linha de negócio alterada:
--   · tabela nx_requisicoes (RLS ligada e fechada; só as funções abaixo escrevem nela);
--   · funções NOVAS de 4 (e 8) argumentos com o MESMO nome das RPCs de hoje. As de 3 (e 7) argumentos continuam como estão: uma chamada
--     sem `p_req` cai nelas, uma chamada com `p_req` só casa com as novas (o p_req não tem default de propósito — com default as duas
--     assinaturas aceitariam a mesma chamada e o Postgres/PostgREST recusaria por ambiguidade; em nx_agenda_marcar o p_req vem ANTES dos
--     argumentos com default, porque o Postgres não deixa um parâmetro sem default depois de um com default);
--   · quem repete a chave passa pela MESMA autenticação (nx_ctx) antes de ver qualquer resultado guardado, e a chave vale por cliente.
-- Erros não são guardados (a transação desfaz tudo): repetir depois de um erro executa de novo. Só o que foi APLICADO fica guardado
-- (nx_agenda_marcar só guarda {ok:true}; «horario_ocupado» etc. podem dar certo na próxima).
--
-- Testes: supabase/testes/14_crm_idempotencia_lote.sql (begin … rollback; termina em exceção «OK_14…»).
-- Publicação: só com o ok do João e a trava da Ponte (AGENTS.md). NÃO aplicada.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabela das chaves (24 h)
-- ------------------------------------------------------------
create table if not exists public.nx_requisicoes (
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  req        uuid not null,
  rpc        text not null,
  resultado  jsonb,
  criado_em  timestamptz not null default now(),
  primary key (cliente_id, req)
);
create index if not exists nx_requisicoes_criado_idx on public.nx_requisicoes (criado_em);
alter table public.nx_requisicoes enable row level security;
revoke all on table public.nx_requisicoes from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. Ajudantes (só service_role: quem chama é uma das RPCs abaixo, já autenticada)
-- ------------------------------------------------------------
-- Resultado guardado para (cliente, req) ainda válido (24 h) ou null. Serializa quem chega junto com a mesma chave
-- (o 2º espera o 1º terminar e então enxerga o resultado dele). Chave vencida é limpa aqui.
create or replace function public.nx_req_usar(p_cliente uuid, p_req uuid, p_rpc text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare r public.nx_requisicoes;
begin
  perform pg_advisory_xact_lock(hashtextextended('nx_req:' || p_cliente::text || ':' || p_req::text, 0));
  select * into r from public.nx_requisicoes where cliente_id = p_cliente and req = p_req;
  if r.req is null then return null; end if;
  if r.criado_em < now() - interval '24 hours' then
    delete from public.nx_requisicoes where cliente_id = p_cliente and req = p_req;
    return null;
  end if;
  -- a mesma chave usada por OUTRA operação é erro do cliente, não um resultado para devolver
  if r.rpc is distinct from p_rpc then raise exception 'dados_invalidos' using errcode = '22023', hint = 'req'; end if;
  return r.resultado;
end $$;

create or replace function public.nx_req_guardar(p_cliente uuid, p_req uuid, p_rpc text, p_resultado jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.nx_requisicoes (cliente_id, req, rpc, resultado) values (p_cliente, p_req, p_rpc, p_resultado)
  on conflict (cliente_id, req) do nothing;
  -- faxina barata e limitada: chaves com mais de 3 dias saem (nunca dado de negócio)
  delete from public.nx_requisicoes x where x.ctid in (
    select y.ctid from public.nx_requisicoes y where y.criado_em < now() - interval '3 days' limit 50);
end $$;

revoke all on function public.nx_req_usar(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.nx_req_guardar(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.nx_req_usar(uuid, uuid, text) to service_role;
grant execute on function public.nx_req_guardar(uuid, uuid, text, jsonb) to service_role;

-- ------------------------------------------------------------
-- 3. As RPCs com p_req
-- ------------------------------------------------------------
-- Oportunidade: só a CRIAÇÃO (sem id) guarda a chave; editar (com id) já é idempotente.
create or replace function public.nx_negocio_salvar(p_token text, p_cliente uuid, p_negocio jsonb, p_req uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  ant jsonb; r json;
begin
  if p_req is null or (jsonb_typeof(coalesce(p_negocio, '{}'::jsonb)) = 'object' and public.nx_crm_int8(coalesce(p_negocio, '{}'::jsonb), 'id') is not null) then
    return public.nx_negocio_salvar(p_token, p_cliente, p_negocio);
  end if;
  ant := public.nx_req_usar(p_cliente, p_req, 'nx_negocio_salvar');
  if ant is not null then return ant::json; end if;
  r := public.nx_negocio_salvar(p_token, p_cliente, p_negocio);
  perform public.nx_req_guardar(p_cliente, p_req, 'nx_negocio_salvar', r::jsonb);
  return r;
end $$;

-- Contato: só a criação.
create or replace function public.nx_contato_salvar(p_token text, p_cliente uuid, p_contato jsonb, p_req uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  ant jsonb; r json;
begin
  if p_req is null or (jsonb_typeof(coalesce(p_contato, '{}'::jsonb)) = 'object' and public.nx_crm_int8(coalesce(p_contato, '{}'::jsonb), 'id') is not null) then
    return public.nx_contato_salvar(p_token, p_cliente, p_contato);
  end if;
  ant := public.nx_req_usar(p_cliente, p_req, 'nx_contato_salvar');
  if ant is not null then return ant::json; end if;
  r := public.nx_contato_salvar(p_token, p_cliente, p_contato);
  perform public.nx_req_guardar(p_cliente, p_req, 'nx_contato_salvar', r::jsonb);
  return r;
end $$;

-- Tarefa: só a criação.
create or replace function public.nx_tarefa_salvar(p_token text, p_cliente uuid, p_tarefa jsonb, p_req uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  ant jsonb; r json;
begin
  if p_req is null or (jsonb_typeof(coalesce(p_tarefa, '{}'::jsonb)) = 'object' and public.nx_crm_int8(coalesce(p_tarefa, '{}'::jsonb), 'id') is not null) then
    return public.nx_tarefa_salvar(p_token, p_cliente, p_tarefa);
  end if;
  ant := public.nx_req_usar(p_cliente, p_req, 'nx_tarefa_salvar');
  if ant is not null then return ant::json; end if;
  r := public.nx_tarefa_salvar(p_token, p_cliente, p_tarefa);
  perform public.nx_req_guardar(p_cliente, p_req, 'nx_tarefa_salvar', r::jsonb);
  return r;
end $$;

-- Consulta: marcar/remarcar. Só o que deu certo ({ok:true}) fica guardado; recusa («horario_ocupado», «ja_agendada»…) não.
create or replace function public.nx_agenda_marcar(p_token text, p_cliente uuid, p_negocio bigint, p_inicio text, p_req uuid,
                                                   p_servico text default null, p_encaixe boolean default false, p_observacao text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  ant jsonb; r json;
begin
  if p_req is null then
    return public.nx_agenda_marcar(p_token, p_cliente, p_negocio, p_inicio, p_servico, p_encaixe, p_observacao);
  end if;
  ant := public.nx_req_usar(p_cliente, p_req, 'nx_agenda_marcar');
  if ant is not null then return ant::json; end if;
  r := public.nx_agenda_marcar(p_token, p_cliente, p_negocio, p_inicio, p_servico, p_encaixe, p_observacao);
  if coalesce((r::jsonb ->> 'ok')::boolean, false) then
    perform public.nx_req_guardar(p_cliente, p_req, 'nx_agenda_marcar', r::jsonb);
  end if;
  return r;
end $$;

-- Mesma liberação das RPCs de 3 e 7 argumentos (o painel chama com a chave pública; a autenticação é o p_token dentro).
revoke all on function public.nx_negocio_salvar(text, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.nx_contato_salvar(text, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.nx_tarefa_salvar(text, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.nx_agenda_marcar(text, uuid, bigint, text, uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.nx_negocio_salvar(text, uuid, jsonb, uuid) to anon, authenticated, service_role;
grant execute on function public.nx_contato_salvar(text, uuid, jsonb, uuid) to anon, authenticated, service_role;
grant execute on function public.nx_tarefa_salvar(text, uuid, jsonb, uuid) to anon, authenticated, service_role;
grant execute on function public.nx_agenda_marcar(text, uuid, bigint, text, uuid, text, boolean, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
