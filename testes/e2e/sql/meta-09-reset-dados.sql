-- ============================================================
-- ÓRBITA — testes/e2e/sql/meta-09-reset-dados.sql
-- SÓ para desenvolver o E2E do canal Meta (orbita-e2e-meta.mjs): apaga os DADOS do cliente
-- de teste 'meta-3009' (conversas, mensagens, contatos, negócios, notificações, fila) e
-- deixa o cliente, as contas, as sessões, os departamentos, os funis e as métricas.
-- Só mexe no cliente com slug 'meta-3009'. Canais: apague antes pela RPC nx_canal_excluir.
-- ============================================================
do $$
declare v uuid;
begin
  select id into v from public.nx_clientes where slug = 'meta-3009';
  if v is null then raise exception 'cliente meta-3009 não existe'; end if;
  delete from public.nx_envios_fila where cliente_id = v;
  delete from public.nx_notificacoes where cliente_id = v;
  delete from public.nx_historico where cliente_id = v;
  delete from public.nx_eventos where cliente_id = v;
  delete from public.nx_conversas where cliente_id = v;   -- mensagens em cascata
  delete from public.nx_leads where cliente_id = v;
  delete from public.nx_contatos where cliente_id = v;
  delete from public.nx_respostas where cliente_id = v;
  delete from public.nx_templates where cliente_id = v;
end $$;
