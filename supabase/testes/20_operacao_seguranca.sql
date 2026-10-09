-- ============================================================
-- ÓRBITA — supabase/testes/20_operacao_seguranca.sql · smoke de 20261008b_operacao_seguranca.sql (plano 100, frente S-B)
--   S-B16 nx_hash/nx_conta_do_token/nx_exigir_gestor com search_path vazio; índice nx_sessoes(expira_em)
--   S-B9  login: por SQL continua lançando credenciais_invalidas (sem gravar); pelo PostgREST (request.headers simulado) a falha
--         fica gravada e a resposta é o JSON de erro com response.status 400; 10 falhas em 15 min → muitas_tentativas com hint em
--         minutos (por conta e por IP); senha certa bloqueada; nada gravado enquanto bloqueado; bloqueio nunca passa de 15 min;
--         vencido o bloqueio a senha certa entra; nx_criar_conta 5/h por IP (sem IP não há limite); muitas_tentativas e
--         cliente_pausado com errcode 22023 (pedido da frente A)
--   S-B9/10 nx_sessao renova (< 20 dias → ~30), conta.super, migracao, clientes[].ativo; cliente_pausado para conta operacional só
--         com clientes pausados; super/gestor entram; nx_app_sessao com migracao e ativo
--   S-B7  nx_contas_listar.origem ('orbita' por convite/papel/departamento/visão; 'plataforma' senão) — pedido da frente P
--   S-B7  nx_conta_definir: acesso que continua mantém o papel; acesso novo com papel explícito (o da conta em outro cliente, senão
--         admin); delete limitado ao escopo; alvo com acesso fora da org → sem_permissao para gestor de revenda; auditoria
--   S-B8  nx_config_salvar: '' mantém, null explícito apaga, auditoria só com nomes; modelo_ia inválido; não-super → so_plataforma
--   S-B11 histórico do número (1ª leitura, caiu, repetido não duplica, voltou), notificações canal_caiu/canal_voltou com
--         dados.{canal_id, canal_nome, estado} (nx_notificacoes_listar devolve; pedido da frente A), pulso,
--         nx_canal_historico_listar (ordem, isolamento, papel), nx_codewords_vigia_alvos (20 min, conversa recente, caiu_em),
--         nx_codewords_contar + nx_canal_json.codewords.contadores
--   S-B12 fila: pegar (gatilho pego_em + lote do cabeçalho), devolver lote, concluir('pendente') com recuo 1/5/15/60 min
--   S-B13 nx_cv_nota com p_req: repetida não duplica; p_req nulo delega
--   S-B16 nx_pulso.nao_lidas por visibilidade; nx_saas_faxina só transitórios
--   S-F   nx_config.meta_api_versao; nx_mensagens.status 'sem_confirmacao'; nx_codewords_origem grava a plataforma (meta/google)
--         sem sobrescrever anúncio
--   S-B17 nenhuma nx_* executável por authenticated; anon continua nas RPCs do painel; RLS nas tabelas novas
-- Roda em begin … rollback. O bloco principal SEMPRE termina em exceção:
--   'OK_20_OPERACAO_SEGURANCA …' = todos os casos passaram · 'FALHOU: <caso>' = falha
-- Antes da 20261008b este arquivo falha (tabelas, colunas e funções novas). Demora ~8 s (pg_sleep(0.4) por senha errada).
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

-- SQLSTATE do erro (para conferir o errcode 22023 dos códigos que o front trata)
create or replace function pg_temp.estado(p_sql text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end $f$;

do $t$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  org_p uuid; org_r uuid; cA uuid; cB uuid; cR uuid; cR2 uuid;
  k_sup uuid; k_adm uuid; k_at uuid; k_gr uuid; k_cli uuid; k_x uuid; k_login uuid;
  t_sup text := 'tok-20-sup-' || sfx; t_adm text := 'tok-20-adm-' || sfx; t_at text := 'tok-20-at-' || sfx;
  t_gr text := 'tok-20-gr-' || sfx; t_ren text := 'tok-20-ren-' || sfx;
  email_l text := 'teste-20-login-' || sfx || '@teste.local';
  ip text := '203.0.113.' || (floor(random() * 200) + 1)::int;
  kC uuid; kM uuid; ct bigint; ct2 bigint; cv bigint; cv2 bigint; cv3 bigint; f bigint; v_lote uuid := gen_random_uuid();
  j json; jb jsonb; e text; n int; n0 int; v_ts timestamptz; v_v bigint; v_id bigint; v_id2 bigint;
  tel text := '5512998' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  req1 uuid := gen_random_uuid(); req2 uuid := gen_random_uuid();
begin
  -- ---------------------------------------------------------- fixtures: plataforma (cA, cB) e revenda (cR, cR2)
  select id into org_p from public.nx_orgs where tipo = 'plataforma' limit 1;
  perform pg_temp.ok(org_p is not null, 'fixture: org da plataforma');
  insert into public.nx_planos (id, nome, limites, modulos, ordem)
  values ('p20_' || sfx, 'P20', '{}'::jsonb, '{crm,conversas,relatorios,ads,automacoes,marca}', 999);
  insert into public.nx_orgs (slug, nome, tipo, limites)
  values ('rev-20-' || sfx, 'Revenda 20', 'revenda', jsonb_build_object('plano_padrao', 'p20_' || sfx)) returning id into org_r;
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status) values ('t20-a-' || sfx, 'Teste 20 A', org_p, 'interno', 'odonto', 'ativo') returning id into cA;
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status) values ('t20-b-' || sfx, 'Teste 20 B', org_p, 'interno', 'odonto', 'ativo') returning id into cB;
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status) values ('t20-r-' || sfx, 'Teste 20 R', org_r, 'p20_' || sfx, 'oficina', 'ativo') returning id into cR;
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status) values ('t20-r2-' || sfx, 'Teste 20 R2', org_r, 'p20_' || sfx, 'oficina', 'ativo') returning id into cR2;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t20-sup-' || sfx || '@teste.local', 'Super 20', 'x', 'gestor', true, org_p) returning id into k_sup;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t20-adm-' || sfx || '@teste.local', 'Admin 20', 'x', 'clinica', true, org_p) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t20-at-' || sfx || '@teste.local', 'Atendente 20', 'x', 'clinica', true, org_p) returning id into k_at;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t20-gr-' || sfx || '@teste.local', 'Gestor Revenda 20', 'x', 'gestor', true, org_r) returning id into k_gr;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t20-cli-' || sfx || '@teste.local', 'Conta Mista 20', 'x', 'clinica', true, org_r) returning id into k_cli;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t20-x-' || sfx || '@teste.local', 'Conta Revenda 20', 'x', 'clinica', true, org_r) returning id into k_x;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_adm, cA, 'admin'), (k_at, cA, 'atendente'),
         (k_cli, cR, 'atendente'), (k_cli, cA, 'admin'), (k_x, cR, 'atendente');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash(t_sup), k_sup, now() + interval '1 hour'), (public.nx_hash(t_adm), k_adm, now() + interval '1 hour'),
    (public.nx_hash(t_at), k_at, now() + interval '1 hour'), (public.nx_hash(t_gr), k_gr, now() + interval '1 hour'),
    (public.nx_hash(t_ren), k_adm, now() + interval '10 days');
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor) values (cA, 'Meta 20', 'pn-20-' || sfx, 'meta') returning id into kM;
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor, codewords_api_segredo, codewords_phone_id, codewords_numero, codewords_rota)
    values (cA, 'Aparelho 20', null, 'codewords', gen_random_uuid(), 'ph-20-' || sfx, '+5512998200000', 'direta') returning id into kC;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Contato 20', tel) returning id into ct;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Contato 20 B', '5512997' || right(tel, 6)) returning id into ct2;
  -- uma conversa aberta por contato e canal (índice nx_conversas_uma_aberta): a 2ª aberta é de outro contato
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, nao_lidas, atribuida_a, ultima_entrada_em, ultima_msg_em)
    values (cA, kM, ct, '2026-20a' || sfx, 'aberta', true, 2, k_at, now() - interval '5 minutes', now() - interval '5 minutes') returning id into cv;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, nao_lidas, atribuida_a, ultima_entrada_em, ultima_msg_em)
    values (cA, kM, ct2, '2026-20b' || sfx, 'aberta', true, 1, k_adm, now() - interval '3 minutes', now() - interval '3 minutes') returning id into cv2;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, nao_lidas, resolvida_em)
    values (cA, kM, ct, '2026-20c' || sfx, 'resolvida', false, 1, now()) returning id into cv3;

  -- ---------------------------------------------------------- versão
  perform pg_temp.ok(exists (select 1 from public.nx_versao_banco where nome = '20261008b_operacao_seguranca'), 'nx_versao_banco registra a migração b');
  perform pg_temp.ok(public.nx_versao_atual() >= '20261008b_operacao_seguranca', 'nx_versao_atual é a última migração');

  -- ---------------------------------------------------------- S-B16 [C110][C111]
  perform pg_temp.ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname in ('nx_hash', 'nx_conta_do_token', 'nx_exigir_gestor')
                         and array_to_string(p.proconfig, ',') = 'search_path=""') = 3, 'nx_hash, nx_conta_do_token e nx_exigir_gestor com search_path vazio');
  perform pg_temp.ok(public.nx_hash('abc') = encode(extensions.digest('abc', 'sha256'), 'hex'), 'nx_hash continua o mesmo sha256');
  perform pg_temp.ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'nx_sessoes' and indexname = 'nx_sessoes_expira'), 'índice nx_sessoes(expira_em)');

  -- ---------------------------------------------------------- S-B9 login
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id)
  values (email_l, 'Login 20', extensions.crypt('senha-20-ok', extensions.gen_salt('bf', 10)), 'clinica', true, org_p) returning id into k_login;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_login, cA, 'admin');
  -- por SQL (sem request.headers): lança como sempre e NÃO grava (contrato dos smokes 03/13 e do ensaio pelo MCP)
  perform set_config('request.headers', '', true);
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_entrar(%L,%L)', email_l, 'errada')) = 'credenciais_invalidas', 'por SQL: senha errada lança credenciais_invalidas');
  perform pg_temp.ok((select count(*) from public.nx_login_falhas where chave = 'conta:' || email_l) = 0, 'por SQL nada é gravado (a transação seria desfeita de qualquer jeito)');
  perform pg_temp.ok(public.nx_login_ip() is null, 'sem cabeçalho não há IP');
  -- pelo PostgREST (request.headers com x-forwarded-for): a falha é gravada e a resposta é o JSON de erro com status 400
  perform set_config('request.headers', json_build_object('x-forwarded-for', ip || ', 10.0.0.1')::text, true);
  perform pg_temp.ok(public.nx_login_ip() = ip, 'o IP é o 1º do x-forwarded-for');
  for i in 1..10 loop
    j := public.nx_entrar(email_l, 'errada');
    perform pg_temp.ok((j ->> 'message') = 'credenciais_invalidas' and (j ->> 'code') = 'P0001' and (j ->> 'hint') is null, 'falha ' || i || ' devolve o JSON de erro padrão');
    perform pg_temp.ok(current_setting('response.status', true) = '400', 'falha ' || i || ' com response.status 400');
  end loop;
  perform pg_temp.ok((select count(*) from public.nx_login_falhas where chave = 'conta:' || email_l) = 10, '10 falhas gravadas por conta');
  perform pg_temp.ok((select count(*) from public.nx_login_falhas where chave = 'ip:' || ip) = 10, '10 falhas gravadas por IP');
  e := pg_temp.erro(format('select public.nx_entrar(%L,%L)', email_l, 'errada'));
  perform pg_temp.ok(e like 'muitas_tentativas|%' and split_part(e, '|', 2)::int between 1 and 15, '11ª tentativa → muitas_tentativas com hint em minutos (1–15): ' || e);
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_entrar(%L,%L)', email_l, 'senha-20-ok')) like 'muitas_tentativas|%', 'a senha certa também fica bloqueada');
  perform pg_temp.ok(pg_temp.estado(format('select public.nx_entrar(%L,%L)', email_l, 'errada')) = '22023', 'muitas_tentativas sai com errcode 22023 (hint numérico em minutos)');
  perform pg_temp.ok((select count(*) from public.nx_login_falhas where chave = 'conta:' || email_l) = 10, 'enquanto bloqueado nada é gravado (o bloqueio não se renova sozinho)');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_entrar(%L,%L)', 'outro-20-' || sfx || '@teste.local', 'x')) like 'muitas_tentativas|%', 'outro e-mail do MESMO IP está bloqueado pelo IP');
  perform set_config('request.headers', json_build_object('x-forwarded-for', '198.51.100.7')::text, true);
  j := public.nx_entrar('outro-20-' || sfx || '@teste.local', 'x');
  perform pg_temp.ok((j ->> 'message') = 'credenciais_invalidas', 'outro IP: e-mail inexistente paga o mesmo erro (e é gravado)');
  perform pg_temp.ok((select count(*) from public.nx_login_falhas where chave = 'conta:outro-20-' || sfx || '@teste.local') = 1, 'e-mail inexistente também conta como falha da chave');
  -- bloqueio nunca passa de 15 min: com a mais antiga das 10 a 14 min atrás faltam no máximo 1 min
  insert into public.nx_login_falhas (chave, em) select 'conta:limite-20-' || sfx, now() - interval '14 minutes' from generate_series(1, 10);
  perform pg_temp.ok(public.nx_login_bloqueio('conta:limite-20-' || sfx, 10, interval '15 minutes') = 1, 'falta 1 min quando a mais antiga tem 14 min');
  perform pg_temp.ok(public.nx_login_bloqueio('conta:' || email_l, 10, interval '15 minutes') between 14 and 15, 'recém-bloqueado: 15 min (nunca mais)');
  perform pg_temp.ok(public.nx_login_bloqueio('conta:ninguem-20-' || sfx, 10, interval '15 minutes') = 0, 'chave sem falhas: livre');
  -- vencido o bloqueio (16 min) a senha certa entra; gestor segue a mesma regra (bloqueio ≤ 15 min)
  update public.nx_login_falhas set em = em - interval '16 minutes' where chave in ('conta:' || email_l, 'ip:' || ip);
  perform set_config('request.headers', json_build_object('x-forwarded-for', ip)::text, true);
  j := public.nx_entrar(email_l, 'senha-20-ok');
  perform pg_temp.ok(length(j ->> 'token') = 64 and (j ->> 'nome') = 'Login 20', 'vencido o bloqueio a senha certa entra');
  perform pg_temp.ok((select count(*) from public.nx_sessoes where conta_id = k_login) = 1, 'sessão criada');
  -- cadastro público: 5 por hora por IP; sem IP (SQL) não há limite
  for i in 1..5 loop
    j := public.nx_criar_conta('cad-20-' || i || '-' || sfx || '@teste.local', 'senha-longa-20', 'Cadastro 20');
    perform pg_temp.ok((j ->> 'ok')::boolean, 'cadastro ' || i || ' pelo IP passa');
  end loop;
  e := pg_temp.erro(format('select public.nx_criar_conta(%L,%L,%L)', 'cad-20-6-' || sfx || '@teste.local', 'senha-longa-20', 'Cadastro 20'));
  perform pg_temp.ok(e like 'muitas_tentativas|%' and split_part(e, '|', 2)::int between 1 and 60, '6º cadastro na hora → muitas_tentativas com minutos: ' || e);
  perform set_config('request.headers', '', true);
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_criar_conta(%L,%L,%L)', 'cad-20-7-' || sfx || '@teste.local', 'senha-longa-20', 'Cadastro 20')) = 'ok', 'sem IP (SQL/MCP) o cadastro não tem limite por IP');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_criar_conta(%L,%L,%L)', 'cad-20-1-' || sfx || '@teste.local', 'senha-longa-20', 'Cadastro 20')) = 'email_em_uso', 'e-mail repetido continua email_em_uso');

  -- ---------------------------------------------------------- S-B9 [H7] + S-B10: sessão, super, migracao, ativo, cliente_pausado
  j := public.nx_sessao(t_ren);
  perform pg_temp.ok((select expira_em from public.nx_sessoes where token_hash = public.nx_hash(t_ren)) > now() + interval '29 days', 'nx_sessao renova a sessão que vence em 10 dias');
  perform pg_temp.ok((select expira_em from public.nx_sessoes where token_hash = public.nx_hash(t_adm)) < now() + interval '2 hours'
                     and (select expira_em from public.nx_sessoes where token_hash = public.nx_hash(t_adm)) > now() + interval '50 minutes', 'a outra sessão da conta não foi tocada');
  perform pg_temp.ok((j -> 'conta' ->> 'super')::boolean is false and (j ->> 'migracao') = public.nx_versao_atual(), 'nx_sessao: super=false e migracao');
  perform pg_temp.ok((public.nx_sessao(t_sup) -> 'conta' ->> 'super')::boolean, 'nx_sessao: super=true para o gestor da plataforma');
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'clientes') x where (x ->> 'id')::uuid = cA and (x ->> 'ativo')::boolean), 'nx_sessao: clientes[].ativo');
  j := public.nx_app_sessao(t_adm);
  perform pg_temp.ok((j ->> 'migracao') = public.nx_versao_atual() and exists (select 1 from json_array_elements(j -> 'clientes') x where (x ->> 'id')::uuid = cA and (x ->> 'ativo')::boolean),
    'nx_app_sessao: migracao e clientes[].ativo = true');
  update public.nx_clientes set ativo = false where id = cA;
  e := pg_temp.erro(format('select public.nx_app_sessao(%L)', t_at));
  perform pg_temp.ok(e like 'cliente_pausado|%' and length(split_part(e, '|', 2)) > 10, 'conta operacional só com cliente pausado → cliente_pausado com hint: ' || e);
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_sessao(%L)', t_at)) like 'cliente_pausado|%', 'nx_sessao (clássico) também');
  perform pg_temp.ok(pg_temp.estado(format('select public.nx_app_sessao(%L)', t_at)) = '22023' and pg_temp.estado(format('select public.nx_sessao(%L)', t_at)) = '22023',
    'cliente_pausado sai com errcode 22023');
  j := public.nx_app_sessao(t_sup);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'clientes') x where (x ->> 'id')::uuid = cA and not (x ->> 'ativo')::boolean), 'super entra e vê ativo=false');
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_adm, cB, 'admin');
  j := public.nx_app_sessao(t_adm);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'clientes') x where (x ->> 'id')::uuid = cA and not (x ->> 'ativo')::boolean)
                 and exists (select 1 from json_array_elements(j -> 'clientes') x where (x ->> 'id')::uuid = cB and (x ->> 'ativo')::boolean), 'conta com outro cliente ativo entra e vê os dois estados');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_sessao(%L)', t_gr)) = 'ok', 'gestor de revenda nunca recebe cliente_pausado');
  update public.nx_clientes set ativo = true where id = cA;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_app_sessao(%L)', t_at)) = 'ok', 'religado: entra de novo');

  -- ---------------------------------------------------------- S-B7 nx_conta_definir
  j := public.nx_conta_definir(t_gr, k_x, true, 'clinica', array[cR]);
  perform pg_temp.ok((select papel from public.nx_acessos where conta_id = k_x and cliente_id = cR) = 'atendente', 'acesso que continua mantém o papel (não vira admin)');
  j := public.nx_conta_definir(t_gr, k_x, true, 'clinica', array[cR, cR2]);
  perform pg_temp.ok((select papel from public.nx_acessos where conta_id = k_x and cliente_id = cR2) = 'atendente', 'acesso novo herda o papel que a conta já tem em outro cliente (explícito)');
  j := public.nx_conta_definir(t_gr, k_x, true, 'clinica', '{}'::uuid[]);
  perform pg_temp.ok((select count(*) from public.nx_acessos where conta_id = k_x) = 0, 'lista vazia dentro do escopo remove os acessos da org');
  j := public.nx_conta_definir(t_gr, k_x, true, 'clinica', array[cR]);
  perform pg_temp.ok((select papel from public.nx_acessos where conta_id = k_x and cliente_id = cR) = 'admin', 'sem nenhum acesso o papel explícito é admin (o «Clínica» do clássico)');
  perform pg_temp.ok(exists (select 1 from public.nx_auditoria a where a.acao = 'conta_definida' and (a.dados ->> 'conta')::uuid = k_x
                               and a.dados ? 'removidos' and a.dados ? 'novos' and (a.dados ->> 'papel_acesso') = 'admin'), 'auditoria com removidos/novos/papel_acesso');
  -- conta com acesso em cliente de OUTRA org: o gestor da revenda nem chega ao delete (nx_conta_no_escopo); o super sim, e aí o escopo é tudo
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_conta_definir(%L,%L,true,%L,%L)', t_gr, k_cli, 'clinica', array[cR]::text)) like 'sem_permissao%', 'alvo com acesso fora da org → sem_permissao para a revenda');
  perform pg_temp.ok((select count(*) from public.nx_acessos where conta_id = k_cli) = 2, 'e nada foi apagado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_conta_definir(%L,%L,true,%L,%L)', t_gr, k_adm, 'clinica', array[cR]::text)) like 'sem_permissao%', 'conta de outra org → sem_permissao');
  j := public.nx_conta_definir(t_sup, k_cli, true, 'clinica', array[cR]);
  perform pg_temp.ok((select count(*) from public.nx_acessos where conta_id = k_cli) = 1 and (select papel from public.nx_acessos where conta_id = k_cli and cliente_id = cR) = 'atendente',
    'super: escopo total — o acesso fora da lista sai e o que fica mantém o papel');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_conta_definir(%L,%L,true,%L,%L)', t_adm, k_x, 'clinica', '{}')) like 'so_gestor%', 'conta clinica não define contas');
  -- nx_contas_listar.origem (P8): 'orbita' = usuário que o Órbita administra; 'plataforma' = gestor ou «clínica» do clássico
  jb := public.nx_contas_listar(t_sup)::jsonb;
  perform pg_temp.ok((select x ->> 'origem' from jsonb_array_elements(jb) x where (x ->> 'id')::uuid = k_sup) = 'plataforma', 'origem: gestor da Nexus = plataforma');
  perform pg_temp.ok((select x ->> 'origem' from jsonb_array_elements(jb) x where (x ->> 'id')::uuid = k_adm) = 'plataforma', 'origem: clínica do clássico (acesso admin, vê tudo) = plataforma');
  perform pg_temp.ok((select x ->> 'origem' from jsonb_array_elements(jb) x where (x ->> 'id')::uuid = k_at) = 'orbita', 'origem: atendente (papel que o clássico não conhece) = orbita');
  update public.nx_acessos set departamentos = array[gen_random_uuid()] where conta_id = k_x;
  perform pg_temp.ok((select x ->> 'origem' from jsonb_array_elements(public.nx_contas_listar(t_sup)::jsonb) x where (x ->> 'id')::uuid = k_x) = 'orbita', 'origem: admin com departamento = orbita');
  update public.nx_acessos set departamentos = '{}' where conta_id = k_x;
  insert into public.nx_convites (token_hash, org_id, cliente_id, papel, expira_em, usado_em, usado_por)
  values (public.nx_hash('conv-20-' || sfx), org_p, cA, 'admin', now() + interval '1 day', now(), k_adm);
  perform pg_temp.ok((select x ->> 'origem' from jsonb_array_elements(public.nx_contas_listar(t_sup)::jsonb) x where (x ->> 'id')::uuid = k_adm) = 'orbita', 'origem: conta que entrou por convite = orbita');
  perform pg_temp.ok((select count(*) from jsonb_array_elements(public.nx_contas_listar(t_gr)::jsonb) x where not (x ? 'origem')) = 0, 'origem em todas as linhas (revenda também)');

  -- ---------------------------------------------------------- S-B8 nx_config_salvar (valores FALSOS, só nesta transação)
  update public.nx_config set anthropic_api_key = 'FAKE-20-ia-' || sfx, wa_access_token = 'FAKE-20-wa-' || sfx, meta_app_secret = 'FAKE-20-ms-' || sfx where id = 1;
  j := public.nx_config_salvar(t_sup, '{"anthropic_api_key": "", "wa_access_token": ""}'::jsonb);
  perform pg_temp.ok((j ->> 'tem_ia')::boolean and (j ->> 'tem_wa_token')::boolean, 'string vazia mantém os segredos');
  j := public.nx_config_salvar(t_sup, '{"anthropic_api_key": null, "modelo_ia": "claude-opus-5-5"}'::jsonb);
  perform pg_temp.ok((j ->> 'tem_ia')::boolean is false and (j ->> 'tem_wa_token')::boolean and (j ->> 'tem_app_secret')::boolean and (j ->> 'modelo_ia') = 'claude-opus-5-5',
    'null explícito apaga SÓ a chave da IA');
  j := public.nx_config_salvar(t_sup, '{"wa_access_token": null, "meta_app_secret": null}'::jsonb);
  perform pg_temp.ok((j ->> 'tem_wa_token')::boolean is false and (j ->> 'tem_app_secret')::boolean is false, 'token do WhatsApp e app secret também apagam com null');
  perform pg_temp.ok(exists (select 1 from public.nx_auditoria a where a.acao = 'config_segredo_removido' and a.conta_id = k_sup
                               and a.dados -> 'apagadas' ? 'anthropic_api_key' and a.dados -> 'chaves' ? 'modelo_ia'), 'auditoria da remoção com os NOMES das chaves');
  perform pg_temp.ok(not exists (select 1 from public.nx_auditoria a where a.dados::text like '%FAKE-20-%'), 'nenhum valor de segredo na auditoria');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_config_salvar(%L,%L)', t_sup, '{"modelo_ia": "modelo inválido!"}')) = 'dados_invalidos|modelo_ia', 'modelo_ia com formato inválido é recusado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_config_salvar(%L,%L)', t_gr, '{"saas_url": "https://x.test"}')) like 'so_plataforma%', 'gestor de revenda → so_plataforma');

  -- ---------------------------------------------------------- S-B11 histórico, notificação, vigia, contadores
  -- nx_pulso_bater bate uma vez por transação (nx.pulso_tx): os inserts das fixtures já bateram; zera a marca para medir de novo
  perform set_config('nx.pulso_tx', '', true);
  v_v := (select p.v from public.nx_pulsos p where p.cliente_id = cA);
  n0 := (select count(*) from public.nx_notificacoes n where n.cliente_id = cA and n.tipo in ('canal_caiu', 'canal_voltou'));
  j := public.nx_codewords_situacao(kC, cA, '{"conectado": true, "numero_conferido": true, "estado": "logged_in"}'::jsonb);
  perform pg_temp.ok((select count(*) from public.nx_canal_historico h where h.canal_id = kC) = 1 and (select estado from public.nx_canal_historico h where h.canal_id = kC) = 'conectado',
    '1ª leitura grava o estado (para existir o «desde»)');
  perform pg_temp.ok((select count(*) from public.nx_notificacoes n where n.cliente_id = cA and n.tipo in ('canal_caiu', 'canal_voltou')) = n0, '1ª leitura não notifica');
  perform pg_temp.ok((j ->> 'estado') = 'conectado' and (j -> 'codewords' ->> 'conectado')::boolean, 'nx_canal_json traz estado derivado');
  j := public.nx_codewords_situacao(kC, cA, '{"conectado": false, "estado": "logged_out", "erro": "O WhatsApp deste número está desconectado"}'::jsonb);
  perform pg_temp.ok((select count(*) from public.nx_canal_historico h where h.canal_id = kC) = 2
                 and (select estado from public.nx_canal_historico h where h.canal_id = kC order by h.em desc, h.id desc limit 1) = 'desconectado'
                 and (select detalhe from public.nx_canal_historico h where h.canal_id = kC order by h.em desc, h.id desc limit 1) like 'logged_out · O WhatsApp%',
    'caiu: linha desconectado com detalhe');
  perform pg_temp.ok(exists (select 1 from public.nx_notificacoes n where n.cliente_id = cA and n.conta_id = k_adm and n.tipo = 'canal_caiu'
                               and n.titulo = 'Aparelho 20: número desconectado' and n.link = '#/config/numeros'), 'admin do cliente recebe canal_caiu');
  perform pg_temp.ok(not exists (select 1 from public.nx_notificacoes n where n.cliente_id = cA and n.conta_id = k_at and n.tipo = 'canal_caiu'), 'atendente não recebe');
  perform pg_temp.ok((select bool_and((n.dados ->> 'canal_id')::uuid = kC and n.dados ->> 'canal_nome' = 'Aparelho 20' and n.dados ->> 'estado' = 'desconectado')
                        from public.nx_notificacoes n where n.cliente_id = cA and n.tipo = 'canal_caiu'), 'canal_caiu leva dados.canal_id, dados.canal_nome e dados.estado');
  j := public.nx_notificacoes_listar(t_adm, cA, 10);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'itens') x where x ->> 'tipo' = 'canal_caiu' and (x -> 'dados' ->> 'canal_id')::uuid = kC
                               and x -> 'dados' ->> 'canal_nome' = 'Aparelho 20'), 'nx_notificacoes_listar devolve dados do canal ' || (j -> 'itens')::text);
  perform pg_temp.ok((select p.v from public.nx_pulsos p where p.cliente_id = cA) > v_v, 'o pulso do cliente bate quando o número cai');
  j := public.nx_codewords_situacao(kC, cA, '{"conectado": false, "estado": "logged_out"}'::jsonb);
  perform pg_temp.ok((select count(*) from public.nx_canal_historico h where h.canal_id = kC) = 2
                 and (select count(*) from public.nx_notificacoes n where n.cliente_id = cA and n.conta_id = k_adm and n.tipo = 'canal_caiu') = 1, 'mesmo estado de novo: nem linha nem notificação');
  j := public.nx_codewords_situacao(kC, cA, '{"sync_erro": "proxy caiu"}'::jsonb);
  perform pg_temp.ok((select count(*) from public.nx_canal_historico h where h.canal_id = kC) = 2, 'leitura sem «conectado» não mexe no histórico');
  j := public.nx_codewords_situacao(kC, cA, '{"conectado": true, "estado": "logged_in", "erro": null}'::jsonb);
  perform pg_temp.ok((select count(*) from public.nx_canal_historico h where h.canal_id = kC) = 3
                 and exists (select 1 from public.nx_notificacoes n where n.cliente_id = cA and n.conta_id = k_adm and n.tipo = 'canal_voltou' and n.titulo = 'Aparelho 20: número voltou'),
    'voltou: linha conectado + canal_voltou');
  perform pg_temp.ok((select bool_and((n.dados ->> 'canal_id')::uuid = kC and n.dados ->> 'canal_nome' = 'Aparelho 20' and n.dados ->> 'estado' = 'conectado')
                        from public.nx_notificacoes n where n.cliente_id = cA and n.tipo = 'canal_voltou'), 'canal_voltou leva o MESMO canal_id (o shell junta caiu × voltou)');
  perform pg_temp.ok(not exists (select 1 from public.nx_notificacoes n where n.cliente_id = cA and n.tipo in ('canal_caiu', 'canal_voltou') and n.dados is null), 'nenhuma notificação de canal sem dados');
  j := public.nx_canal_historico_listar(t_adm, cA, kC, 10);
  perform pg_temp.ok(json_array_length(j) = 3 and (j -> 0 ->> 'estado') = 'conectado' and (j -> 1 ->> 'estado') = 'desconectado' and (j -> 2 ->> 'estado') = 'conectado',
    'listagem mais recente primeiro');
  perform pg_temp.ok((j -> 0)::jsonb ? 'id' and (j -> 0)::jsonb ? 'canal_id' and (j -> 0)::jsonb ? 'detalhe' and (j -> 0)::jsonb ? 'em', 'itens com id/canal_id/estado/detalhe/em');
  perform pg_temp.ok(json_array_length(public.nx_canal_historico_listar(t_adm, cA, kC, 2)) = 2, 'p_limite respeitado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_canal_historico_listar(%L,%L,%L,10)', t_adm, cB, kC)) = 'canal_nao_encontrado', 'canal de outro cliente → canal_nao_encontrado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_canal_historico_listar(%L,%L,%L,10)', t_at, cA, kC)) like 'sem_permissao%', 'atendente não lê o histórico');
  -- vigia: conferência velha (> 20 min) e sem conversa recente → alvo; conferência recente → fora; conversa recente → fora
  update public.nx_canais set codewords_conferido_em = now() - interval '30 minutes' where id = kC;
  update public.nx_conversas set ultima_msg_em = now() - interval '3 hours' where cliente_id = cA;
  jb := public.nx_codewords_vigia_alvos(50)::jsonb;
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(jb) x where (x ->> 'canal_id')::uuid = kC and (x ->> 'conectado')::boolean and (x ->> 'caiu_em') is null and (x ->> 'cliente_id')::uuid = cA),
    'vigia: aparelho conferido há 30 min é alvo (conectado, sem caiu_em)');
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(jb) x where (x ->> 'canal_id')::uuid = kM), 'canal Meta nunca é alvo');
  j := public.nx_codewords_situacao(kC, cA, '{"conectado": false, "estado": "logged_out"}'::jsonb);
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.nx_codewords_vigia_alvos(50)::jsonb) x where (x ->> 'canal_id')::uuid = kC), 'acabou de ser conferido: fora');
  update public.nx_canais set codewords_conferido_em = now() - interval '25 minutes', codewords_aviso_em = now() - interval '2 hours' where id = kC;
  jb := public.nx_codewords_vigia_alvos(50)::jsonb;
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(jb) x where (x ->> 'canal_id')::uuid = kC and not (x ->> 'conectado')::boolean
                               and (x ->> 'caiu_em')::timestamptz > now() - interval '1 minute' and (x ->> 'codewords_aviso_em')::timestamptz < now() - interval '1 hour'),
    'caído: caiu_em = quando caiu e codewords_aviso_em = último aviso');
  update public.nx_conversas set ultima_msg_em = now() where id = cv;
  update public.nx_conversas set canal_id = kC where id = cv;
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.nx_codewords_vigia_alvos(50)::jsonb) x where (x ->> 'canal_id')::uuid = kC), 'com conversa recente a sync já confere: fora');
  update public.nx_conversas set canal_id = kM where id = cv;
  update public.nx_clientes set ativo = false where id = cA;
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.nx_codewords_vigia_alvos(50)::jsonb) x where (x ->> 'canal_id')::uuid = kC), 'cliente pausado: fora');
  update public.nx_clientes set ativo = true where id = cA;
  -- contadores
  perform public.nx_codewords_contar(kC, 'grupo'); perform public.nx_codewords_contar(kC, 'grupo');
  j := public.nx_codewords_contar(kC, 'http_413');
  perform pg_temp.ok((j -> 'contadores' ->> 'grupo')::int = 2 and (j -> 'contadores' ->> 'http_413')::int = 1 and (j -> 'contadores' ->> 'desde') is not null, 'contadores por canal ' || j::text);
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_contar(%L,%L)', kC, 'xpto')) = 'dados_invalidos|chave', 'chave desconhecida → dados_invalidos|chave');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_contar(%L,%L)', kM, 'eco')) = 'canal_nao_encontrado', 'canal Meta → canal_nao_encontrado');
  jb := (select public.nx_canal_json(k) from public.nx_canais k where k.id = kC);
  perform pg_temp.ok((jb -> 'codewords' -> 'contadores' ->> 'grupo')::int = 2 and (jb -> 'codewords') ? 'aviso_em', 'nx_canal_json.codewords traz contadores e aviso_em');

  -- ---------------------------------------------------------- S-B12 fila
  insert into public.nx_envios_fila (cliente_id, conversa_id, contato_id, canal_id, tipo, texto, origem, enviar_em)
  values (cA, cv, ct, kM, 'texto', 'oi 20', 'automacao', now() - interval '1 minute') returning id into f;
  perform set_config('request.headers', json_build_object('x-fila-lote', v_lote)::text, true);
  j := public.nx_fila_pegar(5, array[f]);
  perform pg_temp.ok(json_array_length(j) = 1 and (select status = 'enviando' and pego_em > now() - interval '1 minute' and lote = v_lote and tentativas = 1 from public.nx_envios_fila where id = f),
    'pegar: enviando, pego_em pelo gatilho, lote do cabeçalho, 1ª tentativa');
  n := public.nx_fila_devolver_lote(v_lote);   -- (chamada antes da leitura: numa só expressão o Postgres pode avaliar o subselect primeiro)
  perform pg_temp.ok(n = 1 and (select status = 'pendente' and pego_em is null and lote is null and tentativas = 0 from public.nx_envios_fila where id = f),
    'devolver lote: pendente, sem pego_em/lote, tentativa devolvida');
  j := public.nx_fila_pegar(5, array[f]);
  j := public.nx_fila_concluir(f, 'pendente', 'credencial indisponível', null);
  perform pg_temp.ok((j ->> 'ok')::boolean and (select status = 'pendente' and pego_em is null and lote is null and processado_em is null and erro = 'credencial indisponível'
                                                     and enviar_em between now() + interval '50 seconds' and now() + interval '70 seconds' from public.nx_envios_fila where id = f),
    'concluir(pendente) na 1ª tentativa: volta daqui a 1 min, sem lote/pego_em');
  update public.nx_envios_fila set tentativas = 2 where id = f;
  perform public.nx_fila_concluir(f, 'pendente', null, null);
  perform pg_temp.ok((select enviar_em between now() + interval '4 minutes' and now() + interval '6 minutes' from public.nx_envios_fila where id = f), '2ª tentativa: 5 min');
  update public.nx_envios_fila set tentativas = 3 where id = f;
  perform public.nx_fila_concluir(f, 'pendente', null, null);
  perform pg_temp.ok((select enviar_em between now() + interval '14 minutes' and now() + interval '16 minutes' from public.nx_envios_fila where id = f), '3ª tentativa: 15 min');
  update public.nx_envios_fila set tentativas = 4 where id = f;
  perform public.nx_fila_concluir(f, 'pendente', null, null);
  perform pg_temp.ok((select enviar_em between now() + interval '59 minutes' and now() + interval '61 minutes' from public.nx_envios_fila where id = f), '4ª em diante: 60 min');
  perform pg_temp.ok(json_array_length(public.nx_fila_pegar(5, array[f])) = 1, 'por id a fila entrega mesmo antes da hora (o reenvio manual continua possível)');
  j := public.nx_fila_concluir(f, 'enviado', null, null);
  perform pg_temp.ok((select status = 'enviado' and processado_em is not null from public.nx_envios_fila where id = f), 'concluir(enviado) carimba processado_em');
  perform pg_temp.ok(json_array_length(public.nx_fila_pegar(5, array[f])) = 0, 'item enviado não é pego de novo');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_fila_concluir(%s,%L,null,null)', f, 'xpto')) = 'dados_invalidos|status', 'status desconhecido → dados_invalidos|status');

  -- ---------------------------------------------------------- S-B13 nota com p_req
  perform set_config('request.headers', '', true);
  n0 := (select count(*) from public.nx_mensagens m where m.conversa_id = cv and m.tipo = 'nota');
  j := public.nx_cv_nota(t_adm, cA, cv, 'nota 20 repetida', req1);
  v_id := (j ->> 'id')::bigint;
  j := public.nx_cv_nota(t_adm, cA, cv, 'nota 20 repetida', req1);
  perform pg_temp.ok((j ->> 'id')::bigint = v_id and (select count(*) from public.nx_mensagens m where m.conversa_id = cv and m.tipo = 'nota') = n0 + 1, 'a mesma p_req devolve a MESMA nota, sem duplicar');
  j := public.nx_cv_nota(t_adm, cA, cv, 'nota 20 outra', req2);
  perform pg_temp.ok((j ->> 'id')::bigint <> v_id and (select count(*) from public.nx_mensagens m where m.conversa_id = cv and m.tipo = 'nota') = n0 + 2, 'outra p_req grava outra nota');
  j := public.nx_cv_nota(t_adm, cA, cv, 'nota 20 sem req', null);
  perform pg_temp.ok((select count(*) from public.nx_mensagens m where m.conversa_id = cv and m.tipo = 'nota') = n0 + 3, 'p_req nulo delega à função de 4 argumentos');
  perform pg_temp.ok(exists (select 1 from public.nx_requisicoes r where r.cliente_id = cA and r.req = req1 and r.rpc = 'nx_cv_nota'), 'chave guardada em nx_requisicoes');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_nota(%L,%L,%s,%L,%L)', t_adm, cA, cv, 'x', req1)) = 'ok', 'repetir com texto diferente devolve o resultado guardado (sem erro)');

  -- ---------------------------------------------------------- S-B16 nx_pulso.nao_lidas
  j := public.nx_pulso(t_adm, cA);
  perform pg_temp.ok((j ->> 'nao_lidas')::int = 2 and (j::jsonb ? 'v') and (j::jsonb ? 'notif') and (j::jsonb ? 'agora'), 'admin: 2 conversas não lidas (a resolvida fica fora) ' || j::text);
  update public.nx_acessos set ver_todas = false where conta_id = k_at and cliente_id = cA;
  perform pg_temp.ok((public.nx_pulso(t_at, cA) ->> 'nao_lidas')::int = 1, 'atendente sem ver_todas: só a sua');
  update public.nx_conversas set nao_lidas = 0 where id = cv;
  perform pg_temp.ok((public.nx_pulso(t_at, cA) ->> 'nao_lidas')::int = 0 and (public.nx_pulso(t_adm, cA) ->> 'nao_lidas')::int = 1, 'lida: sai da conta');

  -- ---------------------------------------------------------- S-B16 faxina de transitórios
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash('tok-20-exp-' || sfx), k_adm, now() - interval '2 days');
  insert into public.nx_requisicoes (cliente_id, req, rpc, resultado, criado_em) values (cA, gen_random_uuid(), 'nx_cv_nota', '{}', now() - interval '8 days');
  insert into public.nx_envio_refs (cliente_id, client_ref, conversa_id, criado_em) values (cA, 'ref-20-velha-' || sfx, cv, now() - interval '8 days');
  insert into public.nx_envio_refs (cliente_id, client_ref, conversa_id, criado_em) values (cA, 'ref-20-nova-' || sfx, cv, now() - interval '2 days');
  insert into public.nx_notificacoes (cliente_id, conta_id, tipo, titulo, lida_em, criado_em) values
    (cA, k_adm, 'sistema', 'velha lida 20', now() - interval '91 days', now() - interval '91 days'),
    (cA, k_adm, 'sistema', 'recente lida 20', now(), now() - interval '10 days'),
    (cA, k_adm, 'sistema', 'velha NAO lida 20', null, now() - interval '200 days');
  insert into public.nx_codewords_status_pendentes (canal_id, provider_id, status, expira_em) values (kC, 'p20-' || sfx, 'sent', now() - interval '1 hour');
  insert into public.nx_login_falhas (chave, em) values ('conta:velha-20-' || sfx, now() - interval '2 days');
  j := public.nx_saas_faxina();
  perform pg_temp.ok((j ->> 'sessoes')::int >= 1 and not exists (select 1 from public.nx_sessoes where token_hash = public.nx_hash('tok-20-exp-' || sfx)), 'sessão vencida some');
  perform pg_temp.ok(exists (select 1 from public.nx_sessoes where token_hash = public.nx_hash(t_adm)), 'sessão válida fica');
  perform pg_temp.ok((j ->> 'requisicoes')::int >= 1 and not exists (select 1 from public.nx_requisicoes r where r.cliente_id = cA and r.criado_em < now() - interval '7 days'), 'nx_requisicoes > 7 d some');
  perform pg_temp.ok(exists (select 1 from public.nx_requisicoes r where r.cliente_id = cA and r.req = req1), 'chave recente fica');
  perform pg_temp.ok((j ->> 'envio_refs')::int >= 1 and not exists (select 1 from public.nx_envio_refs where client_ref = 'ref-20-velha-' || sfx)
                 and exists (select 1 from public.nx_envio_refs where client_ref = 'ref-20-nova-' || sfx), 'nx_envio_refs > 7 d some; recente fica');
  perform pg_temp.ok(not exists (select 1 from public.nx_notificacoes n where n.titulo = 'velha lida 20')
                 and exists (select 1 from public.nx_notificacoes n where n.titulo = 'recente lida 20')
                 and exists (select 1 from public.nx_notificacoes n where n.titulo = 'velha NAO lida 20'), 'só notificação LIDA há > 90 d some');
  perform pg_temp.ok((j ->> 'codewords_status_pendentes')::int >= 1 and not exists (select 1 from public.nx_codewords_status_pendentes where provider_id = 'p20-' || sfx), 'recibo pendente vencido some');
  perform pg_temp.ok((j ->> 'login_falhas')::int >= 1 and not exists (select 1 from public.nx_login_falhas where chave = 'conta:velha-20-' || sfx)
                 and exists (select 1 from public.nx_login_falhas where chave = 'conta:' || email_l), 'falha de login > 1 d some; de hoje fica');
  perform pg_temp.ok((select count(*) from public.nx_mensagens m where m.conversa_id = cv) >= 3 and exists (select 1 from public.nx_auditoria a where a.acao = 'conta_definida'), 'mensagens e auditoria não são tocadas');

  -- ---------------------------------------------------------- pedidos da S-F: meta_api_versao, 'sem_confirmacao', origem com plataforma
  perform pg_temp.ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'nx_config' and column_name = 'meta_api_versao'),
    'nx_config.meta_api_versao existe');
  perform pg_temp.ok(pg_temp.erro('update public.nx_config set meta_api_versao = ''v23.0'' where id = 1') = 'ok', 'meta_api_versao aceita «v23.0»');
  perform pg_temp.ok(pg_temp.estado('update public.nx_config set meta_api_versao = ''23; drop'' where id = 1') = '23514', 'meta_api_versao fora do formato vN.N é recusada');
  perform pg_temp.ok(pg_temp.erro(format('insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status) values (%L, %s, %s, %L, %L, %L, %L, %L)',
                       cA, cv, ct, kM, 'out', 'texto', 'saída 20 sem confirmação', 'sem_confirmacao')) = 'ok', 'nx_mensagens aceita status sem_confirmacao');
  perform pg_temp.ok(pg_temp.estado(format('insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status) values (%L, %s, %s, %L, %L, %L, %L, %L)',
                       cA, cv, ct, kM, 'out', 'texto', 'saída 20 xpto', 'xpto')) = '23514', 'status desconhecido continua recusado');
  perform pg_temp.ok((select count(*) from pg_constraint c where c.conrelid = 'public.nx_mensagens'::regclass and c.contype = 'c'
                        and pg_get_constraintdef(c.oid) like '%''sistema''%' and pg_get_constraintdef(c.oid) like '%''sem_confirmacao''%') = 1
                 and (select count(*) from pg_constraint c where c.conrelid = 'public.nx_mensagens'::regclass and c.contype = 'c'
                        and pg_get_constraintdef(c.oid) like '%''recebida''%') = 1, 'um CHECK de status só, com sistema e sem_confirmacao');
  -- [A29] origem contada com plataforma (contato ct no aparelho kC; negócio aberto sem atribuição)
  insert into public.nx_leads (cliente_id, contato_id, titulo, nome, telefone, status, etapa, data_conversa, origem)
  values (cA, ct, 'Origem 20', 'Contato 20', tel, 'aberto', 'nova', (now() at time zone 'America/Sao_Paulo')::date, 'whatsapp') returning id into v_id2;
  update public.nx_contatos set origem = 'whatsapp', plataforma = null where id = ct;
  j := public.nx_codewords_origem(kC, tel, 'instagram', 'disse que viu no Instagram');
  perform pg_temp.ok((j ->> 'aplicado')::boolean and j ->> 'plataforma' = 'meta' and j ->> 'origem' = 'organico' and (j ->> 'negocio_id')::bigint = v_id2,
    'origem instagram: orgânico com plataforma meta ' || j::text);
  perform pg_temp.ok((select origem = 'organico' and plataforma = 'meta' and anuncio_ext is null from public.nx_leads where id = v_id2)
                 and (select origem = 'organico' and plataforma = 'meta' from public.nx_contatos where id = ct), 'negócio e contato gravam a plataforma');
  j := public.nx_codewords_origem(kC, tel, 'google', null);
  perform pg_temp.ok(not (j ->> 'aplicado')::boolean and j ->> 'motivo' = 'ja_tem_anuncio' and (select plataforma = 'meta' from public.nx_leads where id = v_id2),
    'com plataforma gravada, outra fonte contada não sobrescreve');
  update public.nx_leads set plataforma = null, origem = 'whatsapp' where id = v_id2;
  j := public.nx_codewords_origem(kC, tel, 'indicacao', null);
  perform pg_temp.ok((j ->> 'aplicado')::boolean and j ->> 'plataforma' is null and (select origem = 'indicacao' and plataforma is null from public.nx_leads where id = v_id2),
    'indicação: sem plataforma');
  update public.nx_leads set plataforma = 'meta', origem = 'anuncio', anuncio_ext = 'AD-20' where id = v_id2;
  j := public.nx_codewords_origem(kC, tel, 'google', null);
  perform pg_temp.ok(j ->> 'motivo' = 'ja_tem_anuncio' and (select plataforma = 'meta' and anuncio_ext = 'AD-20' and origem = 'anuncio' from public.nx_leads where id = v_id2),
    'anúncio (CTWA) nunca é sobrescrito pela origem contada');

  -- ---------------------------------------------------------- S-B17 permissões
  perform pg_temp.ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname like 'nx\_%' escape '\' and p.prokind = 'f'
                         and has_function_privilege('authenticated', p.oid, 'execute')) = 0, 'nenhuma nx_* executável por authenticated');
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_pulso(text,uuid)', 'execute')
                 and has_function_privilege('anon', 'public.nx_entrar(text,text)', 'execute')
                 and has_function_privilege('anon', 'public.nx_cv_nota(text,uuid,bigint,text,uuid)', 'execute')
                 and has_function_privilege('anon', 'public.nx_canal_historico_listar(text,uuid,uuid,integer)', 'execute')
                 and has_function_privilege('anon', 'public.nx_notificacoes_listar(text,uuid,integer)', 'execute')
                 and has_function_privilege('anon', 'public.nx_contas_listar(text)', 'execute'), 'anon continua nas RPCs do painel');
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_login_falha_registrar(text[])', 'execute')
                 and not has_function_privilege('anon', 'public.nx_codewords_contar(uuid,text)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_codewords_vigia_alvos(integer)', 'execute')
                 and has_function_privilege('service_role', 'public.nx_codewords_contar(uuid,text)', 'execute'), 'internas só service_role');
  perform pg_temp.ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'nx_login_falhas')
                 and (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'nx_canal_historico')
                 and not has_table_privilege('anon', 'public.nx_login_falhas', 'select') and not has_table_privilege('anon', 'public.nx_canal_historico', 'select'), 'tabelas novas com RLS e sem anon');

  raise exception 'OK_20_OPERACAO_SEGURANCA — login (bloqueio por conta/IP, PostgREST × SQL, cadastro), sessão/migracao/cliente_pausado, nx_conta_definir, nx_config_salvar, histórico/vigia/contadores do número, fila com recuo, nota com p_req, pulso, faxina, permissões';
end $t$;

rollback;
