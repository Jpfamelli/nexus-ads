-- ============================================================
-- ÓRBITA — supabase/testes/09_isolamento.sql · F8
-- Isolamento entre clientes, negação de acesso direto às tabelas,
-- RPCs internas e ausência de credenciais nas respostas do painel.
-- Rodar pelo execute_sql no projeto nexus-ads. Tudo termina em ROLLBACK.
-- Falha = exceção 'FALHOU: <caso>'. Dados e credenciais abaixo são fictícios.
-- ============================================================
begin;

create or replace function pg_temp.ok(p boolean, p_caso text) returns void language plpgsql as $f$
begin
  if not coalesce(p, false) then raise exception 'FALHOU: %', p_caso; end if;
end $f$;

create or replace function pg_temp.erro(p_sql text) returns text language plpgsql as $f$
declare m text; h text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics m = message_text, h = pg_exception_hint;
  return m || coalesce('|' || nullif(h, ''), '');
end $f$;

do $teste$
declare
  sufixo text := substr(md5(txid_current()::text), 1, 10);
  token_a text;
  token_b text;
  token_super text;
  cli_a uuid;
  cli_b uuid;
  conta_a uuid;
  conta_b uuid;
  conta_super uuid;
  contato_b bigint;
  negocio_b bigint;
  tabela text;
  rls_ok boolean;
  j jsonb;
  e text;
begin
  token_a := 'tok-f8-a-' || sufixo;
  token_b := 'tok-f8-b-' || sufixo;
  token_super := 'tok-f8-super-' || sufixo;

  -- Duas empresas distintas e sessões exclusivamente de teste.
  insert into public.nx_clientes (slug, nome, vertical)
  values ('teste-f8-a-' || sufixo, 'Teste isolamento A', 'odonto') returning id into cli_a;
  insert into public.nx_clientes (slug, nome, vertical)
  values ('teste-f8-b-' || sufixo, 'Teste isolamento B', 'oficina') returning id into cli_b;

  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado)
  values ('f8-a-' || sufixo || '@teste.local', 'Admin isolamento A', 'hash-falso-f8', 'clinica', true) returning id into conta_a;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado)
  values ('f8-b-' || sufixo || '@teste.local', 'Admin isolamento B', 'hash-falso-f8', 'clinica', true) returning id into conta_b;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado)
  values ('f8-super-' || sufixo || '@teste.local', 'Super isolamento', 'hash-falso-f8', 'gestor', true) returning id into conta_super;

  insert into public.nx_acessos (conta_id, cliente_id, papel)
  values (conta_a, cli_a, 'admin'), (conta_b, cli_b, 'admin');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em)
  values (public.nx_hash(token_a), conta_a, now() + interval '1 hour'),
         (public.nx_hash(token_b), conta_b, now() + interval '1 hour'),
         (public.nx_hash(token_super), conta_super, now() + interval '1 hour');

  -- Os clientes enxergam apenas a própria empresa, inclusive nos módulos novos.
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ctx(%L,%L,%L)', token_a, cli_b, 'leitura')) = 'sem_acesso',
    'nx_ctx impede A de entrar em B');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_crm_base(%L,%L)', token_a, cli_b)) = 'sem_acesso',
    'CRM: A não lê a base de B');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contatos_listar(%L,%L)', token_a, cli_b)) = 'sem_acesso',
    'CRM: A não lista contatos de B');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_listar(%L,%L)', token_a, cli_b)) = 'sem_acesso',
    'Conversas: A não lista conversas de B');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_rel_vendas(%L,%L,%L,%L)', token_a, cli_b, current_date, current_date)) = 'sem_acesso',
    'Relatórios: A não lê vendas de B');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_automacoes_listar(%L,%L)', token_a, cli_b)) = 'sem_acesso',
    'Automações: A não lista regras de B');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cliente_tema(%L,%L)', token_a, cli_b)) = 'sem_acesso',
    'White-label: A não lê a marca de B');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_integracoes_status(%L,%L)', token_a, cli_b)) = 'sem_acesso',
    'Integrações: A não lê o status de B');

  -- IDs válidos de B continuam invisíveis quando enviados junto com o cliente A.
  insert into public.nx_contatos (cliente_id, nome, telefone, origem)
  values (cli_b, 'Contato privado B', '5512' || lpad((txid_current() % 100000000)::text, 8, '0'), 'manual')
  returning id into contato_b;
  insert into public.nx_leads (cliente_id, contato_id, titulo)
  values (cli_b, contato_b, 'Negócio privado B') returning id into negocio_b;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contato_ver(%L,%L,%L)', token_a, cli_a, contato_b)) = 'contato_nao_encontrado',
    'CRM: ID de contato de B não revela dados a A');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_ver(%L,%L,%L)', token_a, cli_a, negocio_b)) = 'negocio_nao_encontrado',
    'CRM: ID de negócio de B não revela dados a A');

  -- O navegador usa apenas RPCs. Tabelas com dados de cliente não são legíveis diretamente.
  foreach tabela in array array[
    'nx_clientes', 'nx_contas', 'nx_acessos', 'nx_sessoes', 'nx_integracoes',
    'nx_contatos', 'nx_leads', 'nx_conversas', 'nx_mensagens', 'nx_metricas_dia'
  ] loop
    perform pg_temp.ok(
      not has_table_privilege('anon', 'public.' || tabela, 'select')
      and not has_table_privilege('authenticated', 'public.' || tabela, 'select'),
      'sem SELECT direto em public.' || tabela
    );
  end loop;
  select coalesce(bool_and(c.relrowsecurity), false) into rls_ok
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and c.relname = any(array[
       'nx_clientes', 'nx_contas', 'nx_acessos', 'nx_sessoes', 'nx_integracoes',
       'nx_contatos', 'nx_leads', 'nx_conversas', 'nx_mensagens', 'nx_metricas_dia'
     ]);
  perform pg_temp.ok(rls_ok, 'RLS habilitada nas tabelas centrais');

  -- Funções de contexto e envio interno não são RPCs públicas.
  perform pg_temp.ok(
    not has_function_privilege('anon', 'public.nx_ctx(text,uuid,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.nx_ctx(text,uuid,text)', 'execute')
    and not has_function_privilege('anon', 'public.nx_disparar(text,jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.nx_disparar(text,jsonb)', 'execute'),
    'nx_ctx e nx_disparar não são executáveis pelo navegador'
  );
  e := pg_temp.erro(format('select public.nx_executar(%L,%L,%L)', token_super, 'nx-enviar', '{}'));
  perform pg_temp.ok(e = 'funcao_invalida', 'painel não dispara nx-enviar via nx_executar: ' || e);

  -- A resposta de integração informa quais campos existem, nunca os valores secretos.
  insert into public.nx_integracoes (cliente_id, canal, ativo, cred)
  values (cli_a, 'meta', true, '{"access_token":"F8_FAKE_TOKEN_DO_TESTE","app_secret":"F8_FAKE_SECRET_DO_TESTE"}'::jsonb);
  j := public.nx_integracoes_status(token_a, cli_a)::jsonb;
  perform pg_temp.ok(j::text like '%access_token%' and j::text like '%app_secret%'
                     and j::text not like '%F8_FAKE_TOKEN_DO_TESTE%'
                     and j::text not like '%F8_FAKE_SECRET_DO_TESTE%',
    'status mostra nomes dos campos sem devolver credenciais');

  raise exception 'OK 09_isolamento — 2 clientes isolados, 8 RPCs de leitura, 10 tabelas, RLS e credenciais';
end $teste$;

rollback;
