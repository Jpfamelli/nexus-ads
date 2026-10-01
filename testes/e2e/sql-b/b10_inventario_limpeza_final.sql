-- ============================================================
-- ÓRBITA — testes/e2e/sql-b/b10_inventario_limpeza_final.sql · item 17 (limpeza final) · SOMENTE LEITURA
-- Lista o que sobra nos tenants de teste para a limpeza final da liberação (nada é apagado aqui).
-- Não lê nx_config nem o conteúdo do Vault (só conta secrets e mostra ids de canais).
-- ============================================================
-- 1) tenants e contas de teste (sem e-mail de pessoa real: só o que for de teste)
select 'cliente' as tipo, c.slug as chave, c.nome as detalhe, c.status as extra, c.id::text as id
  from public.nx_clientes c where c.slug <> 'kamiguchi' order by c.criado_em;
select 'conta_de_teste' as tipo, c.nome as chave, c.papel as detalhe,
       (select string_agg(cl.slug || ':' || a.papel, ',') from public.nx_acessos a join public.nx_clientes cl on cl.id = a.cliente_id where a.conta_id = c.id) as acessos,
       (select count(*) from public.nx_sessoes s where s.conta_id = c.id) as sessoes,
       (select string_agg(to_char(s.expira_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), ', ') from public.nx_sessoes s where s.conta_id = c.id) as expira,
       c.id::text as id
  from public.nx_contas c
 where c.papel = 'clinica' or c.org_id <> (select id from public.nx_orgs where tipo = 'plataforma')
 order by c.criado_em;
-- 2) o que sobra DENTRO de teste-e2e (contagem por tabela; só as > 0)
select t.table_name as tabela,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I where cliente_id = %L', t.table_name, (select id from public.nx_clientes where slug = 'teste-e2e')), false, true, '')))[1]::text::int as linhas
  from (select distinct c.table_name from information_schema.columns c
          join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
         where c.table_schema = 'public' and c.column_name = 'cliente_id') t
 order by linhas desc, 1;
-- 3) os itens soltos conhecidos (ids) e o que está preso por prefixo de teste
select 'lead' as tipo, l.id::text as id, left(coalesce(l.titulo, l.nome, ''), 40) as rotulo from public.nx_leads l where l.cliente_id = (select id from public.nx_clientes where slug = 'teste-e2e')
union all select 'contato', k.id::text, left(k.nome, 40) from public.nx_contatos k where k.cliente_id = (select id from public.nx_clientes where slug = 'teste-e2e')
union all select 'canal', k.id::text, left(k.nome, 40) || ' (' || k.provedor || ')' from public.nx_canais k where k.cliente_id = (select id from public.nx_clientes where slug = 'teste-e2e')
union all select 'convite', v.id::text, v.papel || ' · expira ' || to_char(v.expira_em at time zone 'America/Sao_Paulo', 'DD/MM') || coalesce(' · usado', '') from public.nx_convites v where v.cliente_id = (select id from public.nx_clientes where slug = 'teste-e2e');
-- 4) qualquer menção a prefixos de teste em QUALQUER tenant (texto/jsonb das tabelas nx_*, menos nx_config)
create or replace function pg_temp.varredura_prefixos() returns table (tabela text, coluna text, linhas bigint)
language plpgsql as $f$
declare r record; n bigint;
begin
  for r in
    select c.table_name::text t, c.column_name::text col
      from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.table_name like 'nx\_%' escape '\'
       and c.data_type in ('text', 'character varying', 'jsonb', 'json', 'ARRAY') and c.table_name <> 'nx_config'
  loop
    execute format('select count(*) from public.%I where %I::text ilike any (array[%L, %L, %L, %L, %L])', r.t, r.col, '%E2E-3009%', '%QA-3009%', '%META-3009%', '%FIX-3009%', '%EB-3009%') into n;
    if n > 0 then tabela := r.t; coluna := r.col; linhas := n; return next; end if;
  end loop;
end $f$;
select * from pg_temp.varredura_prefixos() order by linhas desc;
-- 5) totais de conferência
select 'vault.secrets (so contagem)' as item, count(*)::text as valor from vault.secrets
union all select 'nx_sessoes', count(*)::text from public.nx_sessoes
union all select 'nx_orgs', count(*)::text from public.nx_orgs
union all select 'storage.objects no bucket nx-midia', count(*)::text from storage.objects where bucket_id = 'nx-midia'
union all select 'nx_midia_lixo pendente', count(*)::text from public.nx_midia_lixo where apagado_em is null
union all select 'nx_eventos pendentes', count(*)::text from public.nx_eventos where processado_em is null;
