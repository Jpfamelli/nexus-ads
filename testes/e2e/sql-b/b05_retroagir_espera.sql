-- ============================================================
-- ÓRBITA — testes/e2e/sql-b/b05_retroagir_espera.sql · EB-3009 · caso 12 (sem resposta)
-- Volta a última entrada de UMA conversa do cliente de teste 'eb-3009-clinica' para 6 min atrás (a automação de
-- "sem resposta há 5 min" enxerga uma NOVA espera: a chave sr:<conversa>:<epoch> muda). Só o tenant de teste.
-- {{CONVERSA}} = id da conversa (número).
-- ============================================================
update public.nx_conversas cv set ultima_entrada_em = now() - interval '6 minutes'
 where cv.id = {{CONVERSA}}::bigint
   and cv.cliente_id = (select id from public.nx_clientes where slug = 'eb-3009-clinica')
returning cv.id, cv.aguardando, cv.status, cv.ultima_entrada_em;
