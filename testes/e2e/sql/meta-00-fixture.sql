-- ============================================================
-- ÓRBITA — testes/e2e/sql/meta-00-fixture.sql
-- Cliente de TESTE 'meta-3009' (org da plataforma) para o E2E do canal Meta (orbita-e2e-meta.mjs).
-- Cria: o cliente (vertical odonto → funis, etapas, departamentos Recepção/Comercial, etc. pelo gatilho),
-- 2 contas de teste (admin e atendente com ver_todas = false) e 1 sessão de 2 h para cada uma.
-- Só o HASH (sha256) do token entra aqui; o token aleatório fica num arquivo do scratchpad.
-- Placeholders: {{HASH_ADMIN}} e {{HASH_ATENDENTE}} (sha256 hex de cada token).
-- NADA de senha real: senha_hash = 'x' (a conta não consegue entrar por login).
-- Desfazer: meta-04-limpeza.sql.
-- ============================================================
do $$
declare v_cli uuid; k_adm uuid; k_at uuid;
begin
  if exists (select 1 from public.nx_clientes where slug = 'meta-3009') then raise exception 'ja existe meta-3009'; end if;
  insert into public.nx_clientes (slug, nome, vertical, status, plano, teste_ate)
  values ('meta-3009', 'META-3009 Cliente de teste (Meta)', 'odonto', 'teste', 'profissional', current_date + 3)
  returning id into v_cli;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado)
  values ('meta3009-admin@example.invalid', 'META-3009 Admin', 'x', 'clinica', true) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado)
  values ('meta3009-atendente@example.invalid', 'META-3009 Atendente', 'x', 'clinica', true) returning id into k_at;
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas, recebe_conversas) values (k_adm, v_cli, 'admin', true, true);
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas, recebe_conversas) values (k_at, v_cli, 'atendente', false, true);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    ('{{HASH_ADMIN}}', k_adm, now() + interval '2 hours'),
    ('{{HASH_ATENDENTE}}', k_at, now() + interval '2 hours');
end $$;
-- ids para o ids.json do script
select jsonb_build_object(
  'cliente', (select id from public.nx_clientes where slug = 'meta-3009'),
  'admin', (select id from public.nx_contas where email = 'meta3009-admin@example.invalid'),
  'atendente', (select id from public.nx_contas where email = 'meta3009-atendente@example.invalid'),
  'dep_recepcao', (select d.id from public.nx_departamentos d join public.nx_clientes c on c.id = d.cliente_id where c.slug = 'meta-3009' and d.nome = 'Recepção'),
  'dep_comercial', (select d.id from public.nx_departamentos d join public.nx_clientes c on c.id = d.cliente_id where c.slug = 'meta-3009' and d.nome = 'Comercial')) ids;
