-- ============================================================
-- ÓRBITA — testes/e2e/sql/meta-04-limpeza.sql
-- Limpeza final do E2E do canal Meta. ANTES: `orbita-e2e-meta.mjs --fase=limpar` (nx_canal_excluir nos dois canais:
-- apaga os segredos do Vault). Depois rode os blocos [A] e [B]. Só toca o cliente 'meta-3009', as duas contas
-- 'meta3009-*@example.invalid' e as duas sessões de teste. Placeholders: {{HASH_ADMIN}}, {{HASH_ATENDENTE}}, {{NET_IDS}}.
-- ============================================================

-- [A] apaga -----------------------------------------------------------------------------------------
do $$
declare v uuid;
begin
  select id into v from public.nx_clientes where slug = 'meta-3009';
  -- sessões de teste (pelo hash exato) e quaisquer outras das contas de teste
  delete from public.nx_sessoes where token_hash in ('{{HASH_ADMIN}}', '{{HASH_ATENDENTE}}')
     or conta_id in (select id from public.nx_contas where email like 'meta3009-%@example.invalid');
  if v is not null then
    -- segredos de canal que sobraram (se nx_canal_excluir não tiver rodado)
    delete from vault.secrets s using public.nx_canais k
     where k.cliente_id = v and s.id in (k.token_segredo, k.app_secret_segredo, k.codewords_api_segredo, k.codewords_hook_segredo);
    delete from public.nx_clientes where id = v;            -- cascata: conversas, mensagens, contatos, negócios, métricas, notificações, fila, canais…
    delete from public.nx_auditoria where cliente_id = v;   -- sem FK
    delete from public.nx_midia_lixo where cliente_id = v;  -- o gatilho de exclusão do cliente enfileira a pasta do Storage
  end if;
  delete from public.nx_contas where email like 'meta3009-%@example.invalid';
  -- respostas do pg_net das chamadas do nx_disparar feitas pelo meta-03
  begin
    delete from net._http_response where id = any (string_to_array('{{NET_IDS}}', ',')::bigint[]);
  exception when others then null;
  end;
end $$;

-- [B] confere: tudo tem de dar 0 -------------------------------------------------------------------
select jsonb_build_object(
  'cliente', (select count(*) from public.nx_clientes where slug = 'meta-3009'),
  'contas', (select count(*) from public.nx_contas where email like 'meta3009-%'),
  'sessoes_do_teste', (select count(*) from public.nx_sessoes where token_hash in ('{{HASH_ADMIN}}', '{{HASH_ATENDENTE}}')),
  'canais_meta3009', (select count(*) from public.nx_canais where nome like 'META-3009%'),
  'vault_de_canais_meta3009', (select count(*) from vault.secrets s where s.name like 'nx-canal-%' and not exists (select 1 from public.nx_canais k where s.id in (k.token_segredo, k.app_secret_segredo))),
  'contatos', (select count(*) from public.nx_contatos where telefone like '55129930080%'),
  'mensagens', (select count(*) from public.nx_mensagens where wamid like 'wamid.META3009-%' or corpo like 'META-3009%'),
  'leads', (select count(*) from public.nx_leads where telefone like '55129930080%' or nome like 'META-3009%'),
  'metricas', (select count(*) from public.nx_metricas_dia where campanha_ext like 'META-3009%'),
  'notificacoes', (select count(*) from public.nx_notificacoes where titulo like '%META-3009%'),
  'fila', (select count(*) from public.nx_envios_fila where texto like 'META-3009%'),
  'templates', (select count(*) from public.nx_templates where nome like 'meta3009_%'),
  'respostas', (select count(*) from public.nx_respostas where titulo like 'META-3009%'),
  'midia_lixo', (select count(*) from public.nx_midia_lixo where cliente_id = '01577472-a7de-46fe-af63-528f85f5375b'),
  'storage_objetos', (select count(*) from storage.objects where name like '01577472-a7de-46fe-af63-528f85f5375b/%'),
  'auditoria', (select count(*) from public.nx_auditoria where cliente_id = '01577472-a7de-46fe-af63-528f85f5375b'),
  'wa_outros_clientes', (select jsonb_agg(jsonb_build_object('slug', slug, 'wa', wa_phone_number_id) order by slug) from public.nx_clientes where slug in ('kamiguchi', 'teste-e2e')),
  'vault_total', (select count(*) from vault.secrets)) as limpeza;
