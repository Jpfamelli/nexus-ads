-- ============================================================
-- ÓRBITA — testes/e2e/sql-b/b06_religar_conversas.sql · EB-3009 · caso 12 (nova espera)
-- Numa rodada de desenvolvimento do script o canal de teste foi apagado (nx_canal_excluir deixa canal_id = null nas conversas)
-- e recriado; aqui as 4 conversas do teste voltam a apontar para o canal atual do cliente 'eb-3009-clinica', para a nova
-- mensagem do cliente A cair na MESMA conversa. Só dados de teste deste cliente.
-- {{CANAL}} = id do canal atual; {{CONVERSAS}} = ids das conversas (números separados por vírgula).
-- ============================================================
update public.nx_conversas cv set canal_id = '{{CANAL}}'::uuid
 where cv.id in ({{CONVERSAS}})
   and cv.cliente_id = (select id from public.nx_clientes where slug = 'eb-3009-clinica')
   and cv.canal_id is distinct from '{{CANAL}}'::uuid
returning cv.id, cv.status, cv.aguardando;
