-- ============================================================
-- ÓRBITA — testes/e2e/sql-b/b02_fixture_cliente_admin.sql · EB-3009 · conta administradora do cliente de teste
-- Roda DEPOIS de a gestora ter criado o cliente 'eb-3009-clinica' pela RPC nx_cliente_admin_salvar.
-- Cria SÓ: 1 conta clínica de teste (sem senha), o acesso de admin nesse cliente e 1 sessão de 2 h.
-- {{HASH_ADMIN}} = sha256 (hex) do token aleatório do script. recebe_conversas = false (sem rodízio/avisos de atribuição).
-- ============================================================
with cl as (select id, org_id from public.nx_clientes where slug = 'eb-3009-clinica'),
c as (
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id)
  select 'eb3009-admin@exemplo.invalid', 'EB-3009 Admin Clínica', 'sem-senha', 'clinica', true, cl.org_id from cl
  returning id),
a as (
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas, departamentos, recebe_conversas)
  select c.id, cl.id, 'admin', true, '{}', false from c, cl
  returning conta_id),
s as (
  insert into public.nx_sessoes (token_hash, conta_id, expira_em)
  select '{{HASH_ADMIN}}', c.id, now() + interval '2 hours' from c
  returning conta_id)
select (select id from c) as admin_id, (select id from cl) as cliente_id,
       (select count(*) from a) as acessos, (select count(*) from s) as sessoes;
