-- ============================================================
-- ÓRBITA — testes/e2e/sql-b/b09_limpeza_org_eb3009.sql · EB-3009 · LIMPEZA FINAL da fixture do item 14 (e dos itens 8, 11 e 12)
-- Service role (MCP execute_sql). Só mexe na revenda 'eb-3009', nos clientes DELA e nas contas DELA.
-- Ordem (as FKs a partir de nx_clientes são todas ON DELETE CASCADE; só nx_auditoria e nx_midia_lixo não têm FK):
--   1) segredos do Vault dos canais que sobrarem (normalmente o script já apagou por nx_canal_excluir)
--   2) nx_auditoria / nx_midia_lixo (sem FK)   3) sessões   4) clientes (cascata)   5) contas   6) a revenda (cascata: domínios, convites)
-- NÃO lê nx_config nem o conteúdo do Vault: só apaga por id e conta.
-- ============================================================
do $$
declare v_org uuid; v_cli uuid[]; v_contas uuid[]; v_vault uuid[]; n_aud int; n_cli int; n_ct int;
begin
  select id into v_org from public.nx_orgs where slug = 'eb-3009';
  if v_org is null then raise notice 'EB3009_LIMPEZA org ja removida'; return; end if;
  select coalesce(array_agg(id), '{}') into v_cli from public.nx_clientes where org_id = v_org;
  select coalesce(array_agg(id), '{}') into v_contas from public.nx_contas where org_id = v_org;
  select coalesce(array_agg(x), '{}') into v_vault from (
    select unnest(array[k.token_segredo, k.app_secret_segredo, k.codewords_api_segredo, k.codewords_hook_segredo]) as x
      from public.nx_canais k where k.cliente_id = any(v_cli)) s where x is not null;
  delete from vault.secrets where id = any(v_vault);
  delete from public.nx_auditoria where org_id = v_org or cliente_id = any(v_cli) or conta_id = any(v_contas);
  get diagnostics n_aud = row_count;
  delete from public.nx_midia_lixo where cliente_id = any(v_cli);
  delete from public.nx_sessoes where conta_id = any(v_contas);
  delete from public.nx_clientes where id = any(v_cli);
  get diagnostics n_cli = row_count;
  delete from public.nx_contas where id = any(v_contas);
  get diagnostics n_ct = row_count;
  delete from public.nx_orgs where id = v_org;
  -- o ciclo horário (nx-ciclo :07) grava o slug de TODOS os clientes ativos/teste em nx_execucoes.resumo (tabela sem cliente_id):
  -- tira só a entrada do cliente de teste do histórico (as linhas de ciclo e os outros clientes ficam como estão)
  update public.nx_execucoes e
     set resumo = jsonb_set(e.resumo, '{clientes}', coalesce((select jsonb_agg(x) from jsonb_array_elements(e.resumo -> 'clientes') x where x ->> 'cliente' not like 'eb-3009%'), '[]'::jsonb))
   where jsonb_typeof(e.resumo -> 'clientes') = 'array' and e.resumo::text like '%eb-3009%';
  raise notice 'EB3009_LIMPEZA clientes=% contas=% auditoria=% vault_sobrando=%', n_cli, n_ct, n_aud, coalesce(cardinality(v_vault), 0);
end $$;
