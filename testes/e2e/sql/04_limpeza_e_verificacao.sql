-- ============================================================
-- ÓRBITA — testes/e2e/sql/04_limpeza_e_verificacao.sql · E2E-3009 · LIMPEZA FINAL (service role)
-- Roda DEPOIS do orbita-e2e.mjs (que já apagou pela API: canal + segredos via nx_canal_excluir, contatos/negócios,
-- tarefas, notas, etiqueta, automação). Aqui: o que a API não alcança + varredura + conferência.
-- Só mexe em linhas do teste-e2e que carregam o prefixo E2E-3009 / telefone 5512993009xxx / campanhas E2E-3009-*
-- e na sessão temporária do teste. NÃO toca em nx_config, Vault (além do que nx_canal_excluir já apagou) nem em kamiguchi.
-- Troque :inicio pelo horário de início da rodada se for reaproveitar (aqui: 2026-09-30 20:10 UTC).
-- ============================================================
-- 1) o que sobra depois da API
delete from public.nx_notificacoes n using public.nx_clientes c
 where c.slug = 'teste-e2e' and n.cliente_id = c.id and (n.titulo like '%E2E-3009%' or coalesce(n.corpo, '') like '%E2E-3009%');
delete from public.nx_eventos e using public.nx_clientes c
 where c.slug = 'teste-e2e' and e.cliente_id = c.id and e.criado_em >= timestamptz '2026-09-30 20:10:00+00';
delete from public.nx_rastreio r using public.nx_clientes c
 where c.slug = 'teste-e2e' and r.cliente_id = c.id and (r.utm_campaign like 'E2E-3009%' or r.gclid like 'E2E3009%');
delete from public.nx_metricas_dia m using public.nx_clientes c
 where c.slug = 'teste-e2e' and m.cliente_id = c.id and m.campanha_ext like 'E2E-3009-%';
delete from public.nx_alertas a using public.nx_clientes c
 where c.slug = 'teste-e2e' and a.cliente_id = c.id and a.criado_em >= timestamptz '2026-09-30 20:10:00+00';
-- trilha de auditoria gerada pelo canal de teste (configurado/conectado/excluído) — só as linhas deste teste
delete from public.nx_auditoria a using public.nx_clientes c
 where c.slug = 'teste-e2e' and a.cliente_id = c.id and a.criado_em >= timestamptz '2026-09-30 20:10:00+00'
   and a.acao in ('codewords_conectado', 'codewords_configurado', 'canal_excluido')
   and (a.dados ->> 'numero' = '+5512993009900' or a.dados ->> 'canal' in (select a2.dados ->> 'canal' from public.nx_auditoria a2 where a2.dados ->> 'numero' = '+5512993009900'));
-- configuração da IA do teste-e2e: volta a não ter a chave 'ia' (estado inicial: cfg sem 'ia')
update public.nx_clientes set cfg = coalesce(cfg, '{}'::jsonb) - 'ia' where slug = 'teste-e2e' and cfg ? 'ia';
-- fila/itens de envio que sobraram para conversas/canais apagados
delete from public.nx_envios_fila f using public.nx_clientes c
 where c.slug = 'teste-e2e' and f.cliente_id = c.id and (f.texto like '%E2E-3009%' or f.criado_em >= timestamptz '2026-09-30 20:10:00+00');
-- sessão temporária (troque o marcador pelo sha256 do token, calculado no scratchpad; o hash real nao fica no repositorio)
delete from public.nx_sessoes where token_hash = '<SHA256_DA_SESSAO_DO_TESTE>';

-- 2) conferência: 0 linha com o prefixo e contagens do teste-e2e iguais às de antes
select 'contatos' t, count(*) n from public.nx_contatos where cliente_id = (select id from public.nx_clientes where slug = 'teste-e2e') and (telefone like '5512993009%' or nome like 'E2E-3009%' or telefone in ('178190287962245', '120363025246125486'))
union all select 'leads', count(*) from public.nx_leads where cliente_id = (select id from public.nx_clientes where slug = 'teste-e2e') and (telefone like '5512993009%' or titulo like 'E2E-3009%' or nome like 'E2E-3009%')
union all select 'mensagens', count(*) from public.nx_mensagens where corpo like '%E2E-3009%'
union all select 'notas', count(*) from public.nx_notas where texto like '%E2E-3009%'
union all select 'tarefas', count(*) from public.nx_tarefas where titulo like '%E2E-3009%'
union all select 'notificacoes', count(*) from public.nx_notificacoes where titulo like '%E2E-3009%' or coalesce(corpo, '') like '%E2E-3009%'
union all select 'etiquetas', count(*) from public.nx_etiquetas where nome like 'E2E-3009%'
union all select 'automacoes', count(*) from public.nx_automacoes where nome like 'E2E-3009%'
union all select 'canais', count(*) from public.nx_canais where nome like 'E2E-3009%' or codewords_numero like '+5512993009%'
union all select 'rastreio', count(*) from public.nx_rastreio where utm_campaign like 'E2E-3009%'
union all select 'metricas', count(*) from public.nx_metricas_dia where campanha_ext like 'E2E-3009-%' or campanha_nome like 'E2E-3009%'
union all select 'fila', count(*) from public.nx_envios_fila where texto like '%E2E-3009%'
union all select 'orgs_e_clientes_fixture', (select count(*) from public.nx_orgs where slug like 'e2e3009-%') + (select count(*) from public.nx_clientes where slug like 'e2e3009-%')
union all select 'contas_fixture', count(*) from public.nx_contas where email like 'e2e3009-%'
union all select 'vault_secrets (antes: 2)', count(*) from vault.secrets
union all select 'sessoes do teste', count(*) from public.nx_sessoes where token_hash = '<SHA256_DA_SESSAO_DO_TESTE>'
union all select 'nx_ia_reservas/uso do teste', (select count(*) from public.nx_ia_reservas r join public.nx_clientes c on c.id = r.cliente_id where c.slug = 'teste-e2e') + (select count(*) from public.nx_ia_uso u join public.nx_clientes c on c.id = u.cliente_id where c.slug = 'teste-e2e')
union all select 'cfg.ia do teste-e2e', case when (select cfg ? 'ia' from public.nx_clientes where slug = 'teste-e2e') then 1 else 0 end;
