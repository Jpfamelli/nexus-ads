-- ============================================================
-- ÓRBITA — testes/e2e/sql-b/b12_limpeza_fina_teste_e2e.sql · item 17 · LIMPEZA FINA do tenant teste-e2e (MANTÉM o tenant e a Conta E2E)
-- Service role (MCP execute_sql). NÃO foi executado na rodada E2E-B (a liberação decide). Foi ensaiado em 30/09/2026 ~22:19 UTC num bloco que
-- termina em exceção (ROLLBACK): canal=1, Vault 2→0, historico=3, lead=1, contato=1, convites=3, sessoes=1, auditoria=15; nada ficou apagado.
-- Só toca linhas do teste-e2e; o que não for deste tenant (kamiguchi, outros clientes) nunca entra.
-- Para a remoção TOTAL do tenant (e da Conta E2E) use o b11 com {{SLUG}} = 'teste-e2e'.
-- ============================================================
do $$
declare v_cli uuid := (select id from public.nx_clientes where slug = 'teste-e2e'); k public.nx_canais;
begin
  if v_cli is null then raise exception 'teste-e2e não existe'; end if;
  -- 1) canal Meta falso 537e6a70… e os 2 segredos do Vault dele (o mesmo que nx_canal_excluir faz)
  select * into k from public.nx_canais where id = '537e6a70-5535-43ba-a6e3-04cd3bac36d3' and cliente_id = v_cli;
  if k.id is not null then
    delete from public.nx_canais where id = k.id;
    delete from vault.secrets where id in (k.token_segredo, k.app_secret_segredo, k.codewords_api_segredo, k.codewords_hook_segredo);
    perform set_config('nx.sem_gatilho_canal', '1', true);
    update public.nx_clientes set wa_phone_number_id = null where id = v_cli and wa_phone_number_id = k.phone_number_id;
    perform set_config('nx.sem_gatilho_canal', '', true);
  end if;
  -- 2) negócio 161333 ("Oportunidade sintética E2E", ganho R$ 1.000) e contato 176997 ("Contato Teste Órbita"), com a linha do tempo deles
  delete from public.nx_historico where cliente_id = v_cli and (negocio_id = 161333 or contato_id = 176997);
  delete from public.nx_leads where id = 161333 and cliente_id = v_cli;
  delete from public.nx_contatos where id = 176997 and cliente_id = v_cli;
  -- 3) os 3 convites que sobraram (2 abertos até 06/10 e 1 já usado na criação da Conta E2E)
  delete from public.nx_convites where cliente_id = v_cli;
  -- 4) a sessão de 30 dias (até 29/10) da Conta E2E Órbita (a conta continua; é só o token dela que deixa de valer)
  delete from public.nx_sessoes where conta_id = (select c.id from public.nx_contas c where c.nome = 'Conta E2E Órbita' and c.papel = 'clinica');
  -- 5) a trilha de auditoria dos testes (criação do cliente, 8 entradas como suporte, convites, canal, chave do formulário)
  delete from public.nx_auditoria where cliente_id = v_cli;
end $$;
-- conferência: deve dar 0 em tudo
select (select count(*) from public.nx_leads where id = 161333) as lead, (select count(*) from public.nx_contatos where id = 176997) as contato,
       (select count(*) from public.nx_canais where id = '537e6a70-5535-43ba-a6e3-04cd3bac36d3') as canal,
       (select count(*) from public.nx_convites where cliente_id = (select id from public.nx_clientes where slug = 'teste-e2e')) as convites,
       (select count(*) from vault.secrets) as vault_total_esperado_0;
