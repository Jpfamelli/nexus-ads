-- ============================================================
-- ÓRBITA — testes/e2e/sql-b/b11_limpeza_tenant_liberacao.sql · item 17 · LIMPEZA FINAL DE UM TENANT DE TESTE (service role)
-- NÃO RODE ISTO POR ENGANO: apaga o cliente {{SLUG}} e TUDO dele (cascata: contatos, negócios, conversas, mensagens, canais,
-- automações, funis, métricas, notificações, eventos, reservas de IA, convites…), as contas de teste que só têm acesso a ele,
-- as sessões delas, a trilha de auditoria dele (sem FK) e os segredos do Vault dos canais dele.
-- Uso previsto: a LIBERAÇÃO roda com {{SLUG}} = 'teste-e2e' (e 'meta-3009', se ele ainda existir). Já foi exercitado de verdade
-- com {{SLUG}} = 'eb-3009-clinica' nesta rodada (E2E-B) e a conferência depois dele deu 0 linha.
-- Segurança embutida: só apaga conta com papel 'clinica' (nunca gestor/super) cujos acessos estejam TODOS neste tenant;
-- recusa-se a rodar contra 'kamiguchi'; não lê nx_config nem o conteúdo do Vault (apaga por id).
-- Histórico do ciclo: nx_execucoes.resumo (sem cliente_id) guarda o slug de cada cliente em cada ciclo horário; as linhas antigas que
-- citam o tenant apagado são histórico e podem ficar. Para zerar a menção (como o b09 fez com 'eb-3009'), o UPDATE está no final deste arquivo.
-- Fora do SQL: arquivos do Storage (bucket nx-midia, pasta <id do cliente>/) — hoje 0 objetos; se houver, apagar pela API do Storage.
-- ============================================================
do $$
declare v_cli uuid; v_contas uuid[]; v_vault uuid[]; n_aud int := 0; n_ct int := 0; n_cli int := 0; n_ses int := 0; n_cv int := 0;
begin
  if '{{SLUG}}' = 'kamiguchi' then raise exception 'RECUSADO: kamiguchi é o cliente real'; end if;
  select id into v_cli from public.nx_clientes where slug = '{{SLUG}}';
  if v_cli is null then raise notice 'LIMPEZA_TENANT {{SLUG}}: já removido'; return; end if;
  select coalesce(array_agg(c.id), '{}') into v_contas from public.nx_contas c
   where c.papel = 'clinica'
     and exists (select 1 from public.nx_acessos a where a.conta_id = c.id and a.cliente_id = v_cli)
     and not exists (select 1 from public.nx_acessos a where a.conta_id = c.id and a.cliente_id <> v_cli);
  select coalesce(array_agg(x), '{}') into v_vault from (
    select unnest(array[k.token_segredo, k.app_secret_segredo, k.codewords_api_segredo, k.codewords_hook_segredo]) as x
      from public.nx_canais k where k.cliente_id = v_cli) s where x is not null;
  select count(*) into n_cv from public.nx_contatos where cliente_id = v_cli;
  delete from vault.secrets where id = any(v_vault);
  delete from public.nx_auditoria where cliente_id = v_cli or conta_id = any(v_contas);
  get diagnostics n_aud = row_count;
  delete from public.nx_midia_lixo where cliente_id = v_cli;
  delete from public.nx_sessoes where conta_id = any(v_contas);
  get diagnostics n_ses = row_count;
  delete from public.nx_clientes where id = v_cli;
  get diagnostics n_cli = row_count;
  delete from public.nx_contas where id = any(v_contas);
  get diagnostics n_ct = row_count;
  raise notice 'LIMPEZA_TENANT {{SLUG}}: cliente=% contatos_que_iam_junto=% contas=% sessoes=% auditoria=% vault_apagados=%', n_cli, n_cv, n_ct, n_ses, n_aud, cardinality(v_vault);
end $$;

-- Histórico do ciclo horário (nx_execucoes.resumo): tira só a entrada de {{SLUG}} das linhas de ciclo (nada mais é alterado).
update public.nx_execucoes e
   set resumo = jsonb_set(e.resumo, '{clientes}', coalesce((select jsonb_agg(x) from jsonb_array_elements(e.resumo -> 'clientes') x where x ->> 'cliente' <> '{{SLUG}}'), '[]'::jsonb))
 where jsonb_typeof(e.resumo -> 'clientes') = 'array' and e.resumo::text like '%"{{SLUG}}"%';
