-- ============================================================
-- ÓRBITA — testes/e2e/sql-b/b03_dominio_ativar.sql · EB-3009 · simula o passo manual da Nexus (super) de ativar o domínio
-- A gestora só cadastra (status 'pendente'); quem ativa é o super, depois de pôr o alias no Netlify (ESPEC §2.2).
-- {{HOST}} = host de teste (TLD .invalid, nunca resolve na internet). Só mexe em domínio da revenda 'eb-3009'.
-- ============================================================
update public.nx_dominios d set status = 'ativo', ativado_em = now()
 where d.host = '{{HOST}}' and d.org_id = (select id from public.nx_orgs where slug = 'eb-3009')
returning d.host, d.status, (d.cliente_id is not null) as so_um_cliente;
