-- Smoke da 20261009c_admin_ativo_canais: «Cliente ativo» pelo Admin (só plataforma, booleano, auditado) e canais no item do
-- Admin → Clientes. Roda em transação e desfaz tudo; termina em raise exception 'OK_24_…'.
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
do $t$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  org_p uuid; org_r uuid; cA uuid; cR uuid; k_sup uuid; k_gr uuid; kM uuid; kC uuid;
  t_sup text := 'tok-24-sup-' || sfx; t_gr text := 'tok-24-gr-' || sfx;
  j json;
begin
  select id into org_p from public.nx_orgs where tipo = 'plataforma' limit 1;
  perform pg_temp.ok(org_p is not null, 'fixture: org da plataforma');
  insert into public.nx_planos (id, nome, limites, modulos, ordem)
  values ('p24_' || sfx, 'P24', '{}'::jsonb, '{crm,conversas,relatorios,ads,automacoes,marca}', 999);
  insert into public.nx_orgs (slug, nome, tipo, limites)
  values ('rev-24-' || sfx, 'Revenda 24', 'revenda', jsonb_build_object('plano_padrao', 'p24_' || sfx)) returning id into org_r;
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status) values ('t24-a-' || sfx, 'Teste 24 A', org_p, 'interno', 'odonto', 'ativo') returning id into cA;
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status) values ('t24-r-' || sfx, 'Teste 24 R', org_r, 'p24_' || sfx, 'oficina', 'ativo') returning id into cR;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t24-sup-' || sfx || '@teste.local', 'Super 24', 'x', 'gestor', true, org_p) returning id into k_sup;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t24-gr-' || sfx || '@teste.local', 'Gestor Revenda 24', 'x', 'gestor', true, org_r) returning id into k_gr;
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash(t_sup), k_sup, now() + interval '1 hour'), (public.nx_hash(t_gr), k_gr, now() + interval '1 hour');
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor) values (cA, 'Meta 24', 'pn-24-' || sfx, 'meta') returning id into kM;
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor, codewords_api_segredo, codewords_phone_id, codewords_numero, codewords_rota, codewords_conectado)
    values (cA, 'Aparelho 24', null, 'codewords', gen_random_uuid(), 'ph-24-' || sfx, '+5512998240000', 'direta', false) returning id into kC;

  -- 1. ativo
  j := public.nx_cliente_admin_salvar(t_sup, jsonb_build_object('id', cA, 'ativo', false));
  perform pg_temp.ok((j ->> 'ativo')::boolean is false and (select not ativo from public.nx_clientes where id = cA), 'plataforma pausa a empresa (antes: a chave era ignorada)');
  perform pg_temp.ok(exists (select 1 from public.nx_auditoria a where a.cliente_id = cA and a.acao = 'cliente_alterado'
                               and a.dados -> 'ativo' = '[true, false]'::jsonb), 'auditado com antes/depois');
  j := public.nx_cliente_admin_salvar(t_sup, jsonb_build_object('id', cA, 'nome', 'Teste 24 A2'));
  perform pg_temp.ok((select not ativo and nome = 'Teste 24 A2' from public.nx_clientes where id = cA), 'sem a chave «ativo» nada muda nela');
  j := public.nx_cliente_admin_salvar(t_sup, jsonb_build_object('id', cA, 'ativo', true));
  perform pg_temp.ok((select ativo from public.nx_clientes where id = cA), 'religar');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cliente_admin_salvar(%L,%L)', t_sup, jsonb_build_object('id', cA, 'ativo', 'nao'))) = 'dados_invalidos|ativo',
    'texto no lugar de booleano é recusado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cliente_admin_salvar(%L,%L)', t_gr, jsonb_build_object('id', cR, 'ativo', false))) like 'so_plataforma%',
    'revenda não pausa empresa');
  perform pg_temp.ok((select ativo from public.nx_clientes where id = cR), 'e nada mudou');
  j := public.nx_cliente_admin_salvar(t_gr, jsonb_build_object('id', cR, 'nome', 'Teste 24 R2'));
  perform pg_temp.ok((select nome = 'Teste 24 R2' and ativo from public.nx_clientes where id = cR), 'a revenda continua salvando o resto');

  -- 2. canais no item
  j := public.nx_cliente_admin_item(cA);
  perform pg_temp.ok(json_array_length(j -> 'canais') = 2, 'dois números ' || (j -> 'canais')::text);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'canais') x where (x ->> 'id')::uuid = kC and x ->> 'estado' = 'desconectado' and x ->> 'provedor' = 'codewords'),
    'aparelho desconectado com provedor');
  perform pg_temp.ok(json_array_length(public.nx_cliente_admin_item(cR) -> 'canais') = 0, 'empresa sem número: lista vazia');
  perform pg_temp.ok((j::jsonb ? 'uso') and (j::jsonb ? 'limites') and (j::jsonb ? 'comercial'), 'as chaves de antes continuam');
  perform pg_temp.ok(not has_function_privilege('authenticated', 'public.nx_cliente_admin_salvar(text,jsonb)', 'execute')
                 and has_function_privilege('anon', 'public.nx_cliente_admin_salvar(text,jsonb)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_cliente_admin_item(uuid)', 'execute'), 'permissões preservadas');
  perform pg_temp.ok(exists (select 1 from public.nx_versao_banco where nome = '20261009c_admin_ativo_canais'), 'versão registrada');
  raise exception 'OK_24_ADMIN_ATIVO_CANAIS — pausar/religar só pela plataforma (auditado), validação, canais no Admin → Clientes';
end $t$;
rollback;
