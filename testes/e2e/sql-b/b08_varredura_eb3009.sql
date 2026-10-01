-- ============================================================
-- ÓRBITA — testes/e2e/sql-b/b08_varredura_eb3009.sql · EB-3009 · varredura de resíduos (somente leitura)
-- Conta, em TODAS as colunas texto/jsonb das tabelas nx_* (schema public, menos nx_config), as linhas que mencionam
-- 'EB-3009', 'eb3009' ou os telefones fictícios do teste (5511930090xxx do CSV, 5511930099xxx das conversas e as chaves
-- de dedupe 1130090xxx/1130099xxx); devolve só o que tiver > 0, mais os totais de conferência.
-- Não lê nx_config, nem o conteúdo do Vault (só conta secrets). Roda antes (baseline) e depois (prova de limpeza).
-- ============================================================
create or replace function pg_temp.varredura() returns table (tabela text, coluna text, linhas bigint)
language plpgsql as $f$
declare r record; n bigint;
begin
  for r in
    select c.table_name::text t, c.column_name::text col, c.data_type
      from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.table_name like 'nx\_%' escape '\'
       and c.data_type in ('text', 'character varying', 'jsonb', 'json', 'ARRAY')
       and c.table_name <> 'nx_config'
  loop
    execute format('select count(*) from public.%I where %I::text ilike any (array[%L, %L, %L, %L, %L, %L])',
                   r.t, r.col, '%EB-3009%', '%eb3009%', '%5511930090%', '%5511930099%', '%1130090%', '%1130099%') into n;
    if n > 0 then tabela := r.t; coluna := r.col; linhas := n; return next; end if;
  end loop;
end $f$;

select 'RESIDUO' as tipo, tabela, coluna, linhas::text as valor from pg_temp.varredura()
union all select 'TOTAL', 'nx_orgs (slug eb-3009*)', '', (select count(*) from public.nx_orgs where slug like 'eb-3009%')::text
union all select 'TOTAL', 'nx_clientes (slug eb-3009*)', '', (select count(*) from public.nx_clientes where slug like 'eb-3009%')::text
union all select 'TOTAL', 'nx_contas (email eb3009-*)', '', (select count(*) from public.nx_contas where email like 'eb3009-%')::text
union all select 'TOTAL', 'nx_sessoes (total)', '', (select count(*) from public.nx_sessoes)::text
union all select 'TOTAL', 'vault.secrets (so contagem)', '', (select count(*) from vault.secrets)::text
union all select 'TOTAL', 'nx_orgs (total)', '', (select count(*) from public.nx_orgs)::text
union all select 'TOTAL', 'nx_clientes (total)', '', (select count(*) from public.nx_clientes)::text
union all select 'TOTAL', 'nx_contas (total)', '', (select count(*) from public.nx_contas)::text
union all select 'TOTAL', 'nx_eventos pendentes (todos os clientes)', '', (select count(*) from public.nx_eventos where processado_em is null)::text
union all select 'TOTAL', 'nx_ia_reservas (total)', '', (select count(*) from public.nx_ia_reservas)::text
union all select 'TOTAL', 'nx_ia_uso (total)', '', (select count(*) from public.nx_ia_uso)::text;
