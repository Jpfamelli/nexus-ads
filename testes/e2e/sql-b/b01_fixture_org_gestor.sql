-- ============================================================
-- ÓRBITA — testes/e2e/sql-b/b01_fixture_org_gestor.sql · EB-3009 · fixture do item 14 (white-label como gestor)
-- Roda como service role (MCP execute_sql). Cria SÓ: 1 revenda de teste 'eb-3009', 1 conta gestora de teste
-- (SEM senha: senha_hash inválido de propósito, ninguém consegue entrar por e-mail/senha) e 1 sessão de 2 h.
-- {{HASH_GESTOR}} = sha256 (hex) do token aleatório gerado pelo script; o token em si fica só no scratchpad.
-- Limites da revenda: 1 empresa (prova o limite da revenda), 8 usuários, 3 canais; plano padrão 'completo'.
-- Não toca em nx_config, Vault, kamiguchi nem na org Nexus.
-- ============================================================
with o as (
  insert into public.nx_orgs (slug, nome, tipo, limites)
  values ('eb-3009', 'EB-3009 Revenda Teste', 'revenda',
          '{"empresas":1,"usuarios":8,"canais":3,"plano_padrao":"completo"}'::jsonb)
  returning id),
c as (
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id)
  select 'eb3009-gestora@exemplo.invalid', 'EB-3009 Gestora Teste', 'sem-senha', 'gestor', true, o.id from o
  returning id),
s as (
  insert into public.nx_sessoes (token_hash, conta_id, expira_em)
  select '{{HASH_GESTOR}}', c.id, now() + interval '2 hours' from c
  returning conta_id)
select (select id from o) as org_id, (select id from c) as gestor_id, (select count(*) from s) as sessoes;
