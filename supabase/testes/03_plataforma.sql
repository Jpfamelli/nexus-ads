-- ============================================================
-- ÓRBITA — supabase/testes/03_plataforma.sql · frente F3
-- Smoke do arquivo c (20260928c_plataforma.sql, §5.2 parte P0-A):
-- convite (criar, ver, aceitar, vencido, 5 senhas erradas, gestor só
-- para conta nova, conta existente só ganha acesso), tomada de conta
-- (link de senha), último admin, papel próprio, plano interno/limites
-- só super, plano_padrao, limite somado da revenda, marca pública
-- (host/org/padrão, nunca id), sessão leve < 50 KB com 200 clientes,
-- link com o domínio ativo, senha (redefinir/trocar), perfil, grants.
-- P0-B (20260928c_plataforma_b.sql): validação da marca/tema (§4.2.1),
-- revendas (nx_org_salvar), tema da empresa, domínios, planos, sino
-- (notificações) e plano e uso. Precisa dos DOIS arquivos aplicados.
-- Roda pelo execute_sql. TUDO em begin … e termina em exceção
-- ('VERDE 03_plataforma …' = passou; 'FALHOU: <caso>' = quebrou):
-- nada fica no banco.
-- ============================================================
begin;

create or replace function pg_temp.erro(p_sql text) returns text language plpgsql as $f$
declare m text; h text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics m = message_text, h = pg_exception_hint;
  return m || coalesce('|' || nullif(h, ''), '');
end $f$;

create or replace function pg_temp.ok(p boolean, p_caso text) returns void language plpgsql as $f$
begin
  if not coalesce(p, false) then raise exception 'FALHOU: %', p_caso; end if;
end $f$;

do $t$
declare
  v_plat uuid := public.nx_org_plataforma();
  v_rev uuid; cA uuid; cB uuid; cR uuid; cR2 uuid;
  k_super uuid; k_admA uuid; k_admAB uuid; k_atA uuid; k_gr uuid; k_revcli uuid; k_novo uuid;
  j json; jb jsonb; r text; t0 timestamptz; ms int; n int; v_tok text; v_tok2 text; v_link text;
  kc public.nx_contas;
  casos int := 0;
begin
  -- ---------------- montagem ----------------
  insert into public.nx_orgs (slug, nome, tipo, marca, limites)
  values ('teste-rev-f3', 'Agência Teste F3', 'revenda',
          '{"produto":"Conecta","cores":{"primaria":"#2255CC","secundaria":"#22AA88","fundo":"#0A0F1A"},"login_titulo":"Entre na Conecta","suporte_wa":"5512999990000"}',
          '{"usuarios":3,"empresas":5,"plano_padrao":"profissional"}')
  returning id into v_rev;
  insert into public.nx_clientes (slug, nome, org_id, plano, modulos, vertical, status)
  values ('teste-f3-a', 'Clínica Teste F3 A', v_plat, 'interno', '{crm,conversas,relatorios,ads,automacoes,marca}', 'odonto', 'ativo') returning id into cA;
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical) values ('teste-f3-b', 'Oficina Teste F3 B', v_plat, 'interno', 'oficina') returning id into cB;
  insert into public.nx_clientes (slug, nome, org_id, plano, modulos, vertical) values ('teste-f3-r', 'Loja Teste F3 R', v_rev, 'essencial', '{crm,conversas,relatorios}', 'loja') returning id into cR;
  insert into public.nx_clientes (slug, nome, org_id, plano, modulos, vertical) values ('teste-f3-r2', 'Loja Teste F3 R2', v_rev, 'essencial', '{crm,conversas,relatorios}', 'loja') returning id into cR2;

  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values
    ('f3-super@teste.invalid', 'Super F3', extensions.crypt('senha-certa-1', extensions.gen_salt('bf', 4)), 'gestor', true, v_plat) returning id into k_super;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values
    ('f3-adma@teste.invalid', 'Admin A', extensions.crypt('senha-certa-1', extensions.gen_salt('bf', 4)), 'clinica', true, v_plat) returning id into k_admA;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values
    ('f3-admab@teste.invalid', 'Admin AB', extensions.crypt('senha-certa-1', extensions.gen_salt('bf', 4)), 'clinica', true, v_plat) returning id into k_admAB;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values
    ('f3-ata@teste.invalid', 'Atendente A', extensions.crypt('senha-certa-1', extensions.gen_salt('bf', 4)), 'clinica', true, v_plat) returning id into k_atA;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values
    ('f3-gr@teste.invalid', 'Gestor Revenda', extensions.crypt('senha-certa-1', extensions.gen_salt('bf', 4)), 'gestor', true, v_rev) returning id into k_gr;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values
    ('f3-revcli@teste.invalid', 'Usuária Revenda', extensions.crypt('senha-certa-1', extensions.gen_salt('bf', 4)), 'clinica', true, v_rev) returning id into k_revcli;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values
    (k_admA, cA, 'admin'), (k_admAB, cA, 'admin'), (k_admAB, cB, 'admin'), (k_atA, cA, 'atendente'), (k_revcli, cR, 'admin');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash('tok-f3-super'), k_super, now() + interval '1 day'),
    (public.nx_hash('tok-f3-adma'), k_admA, now() + interval '1 day'),
    (public.nx_hash('tok-f3-admab'), k_admAB, now() + interval '1 day'),
    (public.nx_hash('tok-f3-ata'), k_atA, now() + interval '1 day'),
    (public.nx_hash('tok-f3-ata-2'), k_atA, now() + interval '1 day'),
    (public.nx_hash('tok-f3-gr'), k_gr, now() + interval '1 day'),
    (public.nx_hash('tok-f3-revcli'), k_revcli, now() + interval '1 day');

  -- ---------------- marca pública ----------------
  j := public.nx_marca_publica('host-que-nao-existe.example', null);
  perform pg_temp.ok((j -> 'org' ->> 'slug') = (select slug from public.nx_orgs where id = v_plat), 'marca padrão = plataforma'); casos := casos + 1;
  j := public.nx_marca_publica('', 'teste-rev-f3');
  perform pg_temp.ok((j -> 'org' ->> 'slug') = 'teste-rev-f3' and (j -> 'marca' ->> 'produto') = 'Conecta', 'marca por ?org'); casos := casos + 1;
  insert into public.nx_dominios (host, org_id, cliente_id, status, ativado_em) values ('crm.teste-f3.com.br', v_rev, cR, 'ativo', now());
  insert into public.nx_dominios (host, org_id, status) values ('pendente.teste-f3.com.br', v_rev, 'pendente');
  j := public.nx_marca_publica('CRM.teste-f3.com.br:443', 'nexus');
  perform pg_temp.ok((j -> 'org' ->> 'slug') = 'teste-rev-f3' and (j -> 'cliente' ->> 'slug') = 'teste-f3-r', 'marca pelo host ativo (+cliente) vence ?org'); casos := casos + 1;
  j := public.nx_marca_publica('pendente.teste-f3.com.br', null);
  perform pg_temp.ok((j -> 'org' ->> 'slug') <> 'teste-rev-f3', 'domínio pendente não vale'); casos := casos + 1;
  r := public.nx_marca_publica('crm.teste-f3.com.br', null)::text;
  perform pg_temp.ok(r not like '%"id"%' and r not like '%@%' and r not like '%limites%' and r not like '%usuarios%', 'marca pública nunca devolve id, e-mail ou limite'); casos := casos + 1;

  -- ---------------- convite: criar, ver, aceitar (conta nova) ----------------
  j := public.nx_convite_criar('tok-f3-adma', cA, '{"papel":"atendente","nome":"Nova Pessoa","email":"F3-Nova@Teste.invalid","dias":3}', null);
  v_tok := j ->> 'token';
  perform pg_temp.ok(v_tok ~ '^[0-9a-f]{64}$' and (j ->> 'link') like '%#/convite/' || v_tok, 'convite criado com token e link'); casos := casos + 1;
  perform pg_temp.ok(not exists (select 1 from public.nx_convites where token_hash = v_tok), 'convite guarda só o hash'); casos := casos + 1;
  j := public.nx_convite_ver(v_tok);
  perform pg_temp.ok((j ->> 'papel') = 'atendente' and (j -> 'cliente' ->> 'nome') = 'Clínica Teste F3 A' and (j ->> 'email') = 'f3-nova@teste.invalid', 'convite_ver'); casos := casos + 1;
  perform pg_temp.ok(j::text not like '%"id"%', 'convite_ver sem id'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_convite_aceitar(%L, %L, %L, %L)', v_tok, 'Nova Pessoa', 'f3-nova@teste.invalid', 'curta'));
  perform pg_temp.ok(r = 'senha_curta', 'aceitar com senha curta → senha_curta (' || r || ')'); casos := casos + 1;
  j := public.nx_convite_aceitar(v_tok, 'Nova Pessoa', 'f3-nova@teste.invalid', 'senha-nova-123');
  perform pg_temp.ok((j ->> 'ok')::boolean and (j ->> 'token') is not null and (j ->> 'cliente_id')::uuid = cA, 'aceitar cria conta e sessão'); casos := casos + 1;
  select * into kc from public.nx_contas where email = 'f3-nova@teste.invalid';
  k_novo := kc.id;
  perform pg_temp.ok(kc.aprovado and kc.papel = 'clinica' and kc.org_id = v_plat, 'conta nova aprovada, clinica, org do convite'); casos := casos + 1;
  perform pg_temp.ok(exists (select 1 from public.nx_acessos where conta_id = k_novo and cliente_id = cA and papel = 'atendente'), 'acesso com o papel do convite'); casos := casos + 1;
  perform pg_temp.ok((public.nx_ctx(j ->> 'token', cA, 'atendente')).papel = 'atendente', 'token do aceite vale no nx_ctx'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_convite_ver(%L)', v_tok));
  perform pg_temp.ok(r = 'convite_invalido', 'convite usado → convite_invalido'); casos := casos + 1;

  -- vencido
  j := public.nx_convite_criar('tok-f3-adma', cA, '{"papel":"leitura"}', null);
  update public.nx_convites set expira_em = now() - interval '1 minute' where token_hash = public.nx_hash(j ->> 'token');
  r := pg_temp.erro(format('select public.nx_convite_ver(%L)', j ->> 'token'));
  perform pg_temp.ok(r = 'convite_invalido', 'convite vencido → convite_invalido'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_convite_aceitar(%L,%L,%L,%L)', j ->> 'token', 'X Y', 'f3-venc@teste.invalid', 'senha-nova-123'));
  perform pg_temp.ok(r = 'convite_invalido', 'aceitar vencido → convite_invalido'); casos := casos + 1;

  -- e-mail existente + senha errada (5×) → ok:false e tentativas; depois convite_invalido
  j := public.nx_convite_criar('tok-f3-adma', cA, '{"papel":"supervisor"}', null);
  v_tok2 := j ->> 'token';
  for i in 1..5 loop
    j := public.nx_convite_aceitar(v_tok2, 'Qualquer', 'f3-admab@teste.invalid', 'senha-errada');
    perform pg_temp.ok(j::jsonb = '{"ok":false,"erro":"credenciais_invalidas"}'::jsonb, 'senha errada → {ok:false, credenciais_invalidas} (#' || i || ')');
  end loop;
  perform pg_temp.ok((select tentativas from public.nx_convites where token_hash = public.nx_hash(v_tok2)) = 5, 'tentativas sobe a cada senha errada'); casos := casos + 2;
  r := pg_temp.erro(format('select public.nx_convite_aceitar(%L,%L,%L,%L)', v_tok2, 'Qualquer', 'f3-admab@teste.invalid', 'senha-certa-1'));
  perform pg_temp.ok(r = 'convite_invalido', '5 tentativas → convite_invalido mesmo com a senha certa'); casos := casos + 1;

  -- conta existente de OUTRA org aceitando convite de admin: só ganha o acesso
  j := public.nx_convite_criar('tok-f3-adma', cA, '{"papel":"admin"}', null);
  j := public.nx_convite_aceitar(j ->> 'token', 'Outro Nome', 'f3-revcli@teste.invalid', 'senha-certa-1');
  perform pg_temp.ok((j ->> 'ok')::boolean, 'conta existente aceita com a senha certa'); casos := casos + 1;
  select * into kc from public.nx_contas where id = k_revcli;
  perform pg_temp.ok(kc.org_id = v_rev and kc.papel = 'clinica' and kc.nome = 'Usuária Revenda'
                     and kc.senha_hash = extensions.crypt('senha-certa-1', kc.senha_hash), 'conta existente: org, papel, nome e senha intactos'); casos := casos + 1;
  perform pg_temp.ok(exists (select 1 from public.nx_acessos where conta_id = k_revcli and cliente_id = cA and papel = 'admin')
                     and exists (select 1 from public.nx_acessos where conta_id = k_revcli and cliente_id = cR and papel = 'admin'), 'só acrescentou o acesso'); casos := casos + 1;
  delete from public.nx_acessos where conta_id = k_revcli and cliente_id = cA;

  -- ---------------- convite de gestor ----------------
  r := pg_temp.erro(format('select public.nx_convite_criar(%L, %L::uuid, %L::jsonb, null)', 'tok-f3-adma', cA, '{"papel":"gestor"}'));
  perform pg_temp.ok(r like 'dados_invalidos%', 'admin: convite gestor com cliente → dados_invalidos (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_convite_criar(%L, null, %L::jsonb, null)', 'tok-f3-adma', '{"papel":"gestor"}'));
  perform pg_temp.ok(r = 'sem_permissao', 'admin: convite gestor da org → sem_permissao (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_convite_criar(%L, null, %L::jsonb, %L::uuid)', 'tok-f3-gr', '{"papel":"gestor"}', v_plat));
  perform pg_temp.ok(r = 'sem_permissao', 'gestor de revenda: convite gestor da plataforma → sem_permissao (' || r || ')'); casos := casos + 1;
  insert into public.nx_dominios (host, org_id, status) values ('app.teste-rev-f3.com.br', v_rev, 'ativo');
  j := public.nx_convite_criar('tok-f3-super', null, '{"papel":"gestor","dias":7}', v_rev);
  perform pg_temp.ok((j ->> 'link') like 'https://app.teste-rev-f3.com.br/app/#/convite/%', 'link do convite de gestor usa o domínio ativo da revenda (' || (j ->> 'link') || ')'); casos := casos + 1;
  v_tok := j ->> 'token';
  -- conta existente não vira gestor
  r := pg_temp.erro(format('select public.nx_convite_aceitar(%L,%L,%L,%L)', v_tok, 'X', 'f3-ata@teste.invalid', 'senha-certa-1'));
  perform pg_temp.ok(r = 'convite_invalido|conta_existente', 'conta existente + convite de gestor → convite_invalido/conta_existente (' || r || ')'); casos := casos + 1;
  select * into kc from public.nx_contas where id = k_atA;
  perform pg_temp.ok(kc.papel = 'clinica' and kc.org_id = v_plat, 'conta existente continua clinica da plataforma'); casos := casos + 1;
  j := public.nx_convite_aceitar(v_tok, 'Gestora Nova', 'f3-gestora@teste.invalid', 'senha-nova-123');
  select * into kc from public.nx_contas where email = 'f3-gestora@teste.invalid';
  perform pg_temp.ok(kc.papel = 'gestor' and kc.org_id = v_rev and not public.nx_super(kc), 'gestor nasce na REVENDA e não é super'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_ctx(%L, %L::uuid, %L)', j ->> 'token', cA, 'leitura'));
  perform pg_temp.ok(r = 'sem_acesso', 'gestor da revenda num cliente da Nexus → sem_acesso (' || r || ')'); casos := casos + 1;
  perform pg_temp.ok((public.nx_ctx(j ->> 'token', cR, 'admin')).papel = 'gestor', 'gestor da revenda vale como gestor no cliente dela'); casos := casos + 1;

  -- link do convite de cliente usa o domínio ativo do cliente
  j := public.nx_convite_criar('tok-f3-gr', cR, '{"papel":"atendente"}', null);
  perform pg_temp.ok((j ->> 'link') like 'https://crm.teste-f3.com.br/app/#/convite/%', 'link do convite usa o domínio ativo do cliente'); casos := casos + 1;

  -- ---------------- limite somado da revenda (usuarios: 3) ----------------
  -- cR: 1 acesso (revcli) + 1 convite (acima) = 2 ; cR2: +1 convite = 3 ; o 4º estoura na org
  perform public.nx_convite_criar('tok-f3-gr', cR2, '{"papel":"leitura"}', null);
  r := pg_temp.erro(format('select public.nx_convite_criar(%L, %L::uuid, %L::jsonb, null)', 'tok-f3-gr', cR2, '{"papel":"leitura"}'));
  perform pg_temp.ok(r = 'limite_plano|org_usuarios:3', '4º usuário na revenda → limite_plano org_usuarios:3 (' || r || ')'); casos := casos + 1;

  -- ---------------- tomada de conta (link de nova senha) ----------------
  r := pg_temp.erro(format('select public.nx_senha_link_criar(%L, %L::uuid, %L::uuid)', 'tok-f3-adma', cA, k_admAB));
  perform pg_temp.ok(r = 'sem_permissao', 'admin de A → link para admin de A e B → sem_permissao (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_senha_link_criar(%L, %L::uuid, %L::uuid)', 'tok-f3-adma', cA, k_super));
  perform pg_temp.ok(r = 'sem_permissao', 'admin de A → link para o super (suporte em A) → sem_permissao (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_senha_link_criar(%L, %L::uuid, %L::uuid)', 'tok-f3-adma', cA, k_gr));
  perform pg_temp.ok(r = 'sem_permissao', 'admin de A → link para gestor de outra org → sem_permissao'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_senha_link_criar(%L, %L::uuid, %L::uuid)', 'tok-f3-adma', cA, k_admA));
  perform pg_temp.ok(r = 'sem_permissao', 'link para a própria conta → sem_permissao'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_senha_link_criar(%L, %L::uuid, %L::uuid)', 'tok-f3-ata', cA, k_novo));
  perform pg_temp.ok(r = 'sem_permissao', 'atendente não gera link'); casos := casos + 1;
  j := public.nx_senha_link_criar('tok-f3-adma', cA, k_atA);
  v_link := j ->> 'token';
  perform pg_temp.ok(v_link ~ '^[0-9a-f]{64}$' and (j ->> 'link') like '%#/senha/' || v_link and (j ->> 'expira_em')::timestamptz > now() + interval '23 hours', 'admin → link para atendente só de A: ok (24 h)'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_senha_redefinir(%L, %L)', v_link, 'curta'));
  perform pg_temp.ok(r = 'senha_curta', 'redefinir curta → senha_curta'); casos := casos + 1;
  j := public.nx_senha_redefinir(v_link, 'senha-redefinida-1');
  perform pg_temp.ok((j ->> 'ok')::boolean and not exists (select 1 from public.nx_sessoes where conta_id = k_atA), 'redefinir troca a senha e derruba as sessões'); casos := casos + 1;
  perform pg_temp.ok((select senha_hash = extensions.crypt('senha-redefinida-1', senha_hash) from public.nx_contas where id = k_atA), 'senha nova gravada (bcrypt)'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_senha_redefinir(%L, %L)', v_link, 'outra-senha-9'));
  perform pg_temp.ok(r = 'link_invalido', 'link usado → link_invalido'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_senha_redefinir(%L, %L)', repeat('a', 64), 'outra-senha-9'));
  perform pg_temp.ok(r = 'link_invalido', 'link inexistente → link_invalido'); casos := casos + 1;
  -- gestor de revenda: só contas da própria org com acessos só na org, nunca outro gestor
  r := pg_temp.erro(format('select public.nx_senha_link_criar(%L, %L::uuid, %L::uuid)', 'tok-f3-gr', cR, k_revcli));
  perform pg_temp.ok(r = 'ok', 'gestor → link para conta da própria org: ok (' || r || ')'); casos := casos + 1;

  -- ---------------- trocar senha, sair de todas, perfil ----------------
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash('tok-f3-ata-3'), k_atA, now() + interval '1 day'), (public.nx_hash('tok-f3-ata-4'), k_atA, now() + interval '1 day');
  r := pg_temp.erro(format('select public.nx_senha_trocar(%L,%L,%L)', 'tok-f3-ata-3', 'errada', 'senha-trocada-1'));
  perform pg_temp.ok(r = 'credenciais_invalidas', 'trocar com a atual errada → credenciais_invalidas'); casos := casos + 1;
  update public.nx_contas set trocar_senha = true where id = k_atA;
  j := public.nx_senha_trocar('tok-f3-ata-3', 'senha-redefinida-1', 'senha-trocada-1');
  perform pg_temp.ok((select not trocar_senha from public.nx_contas where id = k_atA)
                     and exists (select 1 from public.nx_sessoes where token_hash = public.nx_hash('tok-f3-ata-3'))
                     and not exists (select 1 from public.nx_sessoes where token_hash = public.nx_hash('tok-f3-ata-4')), 'trocar: limpa trocar_senha, mantém esta sessão e derruba as outras'); casos := casos + 1;
  j := public.nx_perfil_salvar('tok-f3-ata-3', '{"nome":"  Ana Atendente ","telefone":"(12) 99830-3030"}');
  perform pg_temp.ok((j ->> 'nome') = 'Ana Atendente' and (j ->> 'telefone') = '5512998303030', 'perfil: nome aparado e telefone com 55'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_perfil_salvar(%L,%L::jsonb)', 'tok-f3-ata-3', '{"nome":"A"}'));
  perform pg_temp.ok(r = 'nome_invalido', 'perfil nome curto → nome_invalido'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_perfil_salvar(%L,%L::jsonb)', 'tok-f3-ata-3', '{"telefone":"123"}'));
  perform pg_temp.ok(r = 'telefone_invalido', 'perfil telefone inválido → telefone_invalido'); casos := casos + 1;
  perform public.nx_sair_todas('tok-f3-ata-3');
  perform pg_temp.ok(not exists (select 1 from public.nx_sessoes where conta_id = k_atA), 'sair de todas apaga todas as sessões'); casos := casos + 1;

  -- ---------------- usuários: listar, salvar, remover ----------------
  perform public.nx_convite_criar('tok-f3-adma', cA, '{"papel":"leitura","email":"f3-pend@teste.invalid"}', null);
  j := public.nx_usuarios_listar('tok-f3-adma', cA);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'usuarios') u where (u ->> 'conta_id')::uuid = k_admAB and not (u ->> 'editavel')::boolean)
                     and exists (select 1 from json_array_elements(j -> 'usuarios') u where (u ->> 'conta_id')::uuid = k_atA and (u ->> 'editavel')::boolean)
                     and exists (select 1 from json_array_elements(j -> 'usuarios') u where (u ->> 'conta_id')::uuid = k_admA and (u ->> 'eu')::boolean and not (u ->> 'editavel')::boolean),
                     'usuarios_listar: editavel pelo escopo; a própria linha não é editável'); casos := casos + 1;
  perform pg_temp.ok(json_array_length(j -> 'convites') >= 1 and json_array_length(j -> 'departamentos') >= 1, 'usuarios_listar traz convites pendentes e departamentos'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_usuarios_listar(%L, %L::uuid)', 'tok-f3-ata', cA));
  perform pg_temp.ok(r in ('sem_permissao', 'sessao_invalida'), 'atendente não lista usuários'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_usuario_salvar(%L, %L::uuid, %L::jsonb)', 'tok-f3-adma', cA, json_build_object('conta_id', k_admA, 'papel', 'atendente')));
  perform pg_temp.ok(r = 'nao_pode_alterar_a_si', 'mudar o próprio papel → nao_pode_alterar_a_si (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_usuario_salvar(%L, %L::uuid, %L::jsonb)', 'tok-f3-adma', cA, json_build_object('conta_id', k_admAB, 'papel', 'leitura')));
  perform pg_temp.ok(r = 'sem_permissao', 'admin mexendo em conta fora do escopo → sem_permissao'); casos := casos + 1;
  j := public.nx_usuario_salvar('tok-f3-adma', cA, json_build_object('conta_id', k_atA, 'papel', 'supervisor', 'ver_todas', false,
                                'departamentos', (select json_agg(d.id) from public.nx_departamentos d where d.cliente_id = cA))::jsonb);
  perform pg_temp.ok((select papel = 'supervisor' and not ver_todas and cardinality(departamentos) >= 1 from public.nx_acessos where conta_id = k_atA and cliente_id = cA), 'usuario_salvar muda só o acesso'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_usuario_salvar(%L, %L::uuid, %L::jsonb)', 'tok-f3-adma', cA,
                           json_build_object('conta_id', k_atA, 'departamentos', json_build_array((select d.id from public.nx_departamentos d where d.cliente_id = cB limit 1)))));
  perform pg_temp.ok(r = 'dados_invalidos|departamentos', 'departamento de outro cliente → dados_invalidos'); casos := casos + 1;
  -- último admin: super rebaixa admA (sobra admAB), depois tenta admAB
  perform public.nx_usuario_salvar('tok-f3-super', cA, json_build_object('conta_id', k_admA, 'papel', 'atendente')::jsonb);
  r := pg_temp.erro(format('select public.nx_usuario_salvar(%L, %L::uuid, %L::jsonb)', 'tok-f3-super', cA, json_build_object('conta_id', k_admAB, 'papel', 'leitura')));
  perform pg_temp.ok(r = 'ultimo_admin', 'rebaixar o último admin → ultimo_admin'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_usuario_remover(%L, %L::uuid, %L::uuid)', 'tok-f3-super', cA, k_admAB));
  perform pg_temp.ok(r = 'ultimo_admin', 'remover o último admin → ultimo_admin'); casos := casos + 1;
  j := public.nx_usuario_remover('tok-f3-super', cA, k_novo);
  perform pg_temp.ok(not exists (select 1 from public.nx_acessos where conta_id = k_novo and cliente_id = cA)
                     and exists (select 1 from public.nx_contas where id = k_novo), 'remover apaga o acesso, não a conta'); casos := casos + 1;
  -- revogar convite (id de outro cliente se comporta como inexistente)
  select id into v_tok from (select id::text from public.nx_convites where cliente_id = cR2 limit 1) s;
  r := pg_temp.erro(format('select public.nx_convite_revogar(%L, %L::uuid, %L::uuid)', 'tok-f3-super', cA, v_tok));
  perform pg_temp.ok(r = 'dados_invalidos|convite', 'revogar convite de outro cliente → dados_invalidos'); casos := casos + 1;
  j := public.nx_convite_revogar('tok-f3-gr', cR2, v_tok::uuid);
  perform pg_temp.ok((select revogado from public.nx_convites where id = v_tok::uuid), 'revogar convite'); casos := casos + 1;

  -- ---------------- admin: clientes, planos ----------------
  r := pg_temp.erro(format('select public.nx_cliente_admin_salvar(%L, %L::jsonb)', 'tok-f3-gr', '{"nome":"Loja Nova","slug":"teste-f3-r3","plano":"interno"}'));
  perform pg_temp.ok(r = 'so_plataforma', 'revenda criando cliente com plano interno → so_plataforma (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_cliente_admin_salvar(%L, %L::jsonb)', 'tok-f3-gr', '{"nome":"Loja Nova","slug":"teste-f3-r3","limites":{"usuarios":50}}'));
  perform pg_temp.ok(r = 'so_plataforma', 'revenda com limites → so_plataforma'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_cliente_admin_salvar(%L, %L::jsonb)', 'tok-f3-gr', json_build_object('nome', 'Loja Nova', 'slug', 'teste-f3-r3', 'org_id', v_plat)));
  perform pg_temp.ok(r = 'so_plataforma', 'revenda criando cliente em outra org → so_plataforma'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_cliente_admin_salvar(%L, %L::jsonb)', 'tok-f3-gr', '{"nome":"Loja Nova","slug":"teste-f3-r3","plano":"essencial","modulos":["crm","conversas","marca"]}'));
  perform pg_temp.ok(r = 'so_plataforma', 'revenda ligando módulo fora do plano → so_plataforma'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_cliente_admin_salvar(%L, %L::jsonb)', 'tok-f3-gr', '{"nome":"Loja Nova","slug":"teste-f3-a"}'));
  perform pg_temp.ok(r = 'slug_em_uso', 'slug repetido → slug_em_uso'); casos := casos + 1;
  j := public.nx_cliente_admin_salvar('tok-f3-gr', '{"nome":"Loja Nova F3","slug":"teste-f3-r3","vertical":"loja","status":"teste"}');
  perform pg_temp.ok((j ->> 'plano') = 'profissional' and (j -> 'org' ->> 'id')::uuid = v_rev
                     and (select modulos from public.nx_clientes where id = (j ->> 'id')::uuid) = (select modulos from public.nx_planos where id = 'profissional')
                     and (j ->> 'teste_ate')::date = (now() at time zone 'America/Sao_Paulo')::date + 14,
                     'cliente da revenda sem plano → plano_padrao, módulos do plano e 14 dias de teste'); casos := casos + 1;
  j := public.nx_cliente_admin_salvar('tok-f3-gr', json_build_object('id', j ->> 'id', 'comercial', jsonb_build_object(
    'pacote', 'essencial', 'segmento', 'Consultoria contábil', 'especificacoes', 'Atendimento e site.'))::jsonb);
  perform pg_temp.ok((j -> 'comercial' ->> 'mensal_centavos')::int = 129478
                     and (j -> 'comercial' ->> 'integracao_centavos')::int = 88945,
                     'pacote Essencial guarda R$ 1.294,78 e integração R$ 889,45'); casos := casos + 1;
  j := public.nx_cliente_admin_salvar('tok-f3-gr', json_build_object('id', j ->> 'id', 'comercial', jsonb_build_object(
    'pacote', 'profissional', 'segmento', 'Consultoria contábil', 'especificacoes', 'Captação regional; reunião semanal.',
    'mensal_centavos', 1, 'integracao_centavos', 1))::jsonb);
  perform pg_temp.ok((j -> 'comercial' ->> 'pacote') = 'profissional'
                     and (j -> 'comercial' ->> 'mensal_centavos')::int = 187253
                     and (j -> 'comercial' ->> 'integracao_centavos')::int = 119289
                     and (j -> 'comercial' ->> 'segmento') = 'Consultoria contábil'
                     and (j -> 'comercial' ->> 'especificacoes') = 'Captação regional; reunião semanal.',
                     'pacote Profissional guarda valores oficiais em centavos e texto livre; ignora preços forjados'); casos := casos + 1;
  j := public.nx_cliente_admin_salvar('tok-f3-gr', json_build_object('id', j ->> 'id', 'comercial', jsonb_build_object(
    'pacote', 'ultra', 'segmento', 'Ateliê artesanal', 'especificacoes', 'Catálogo próprio e implantação em fases.'))::jsonb);
  perform pg_temp.ok((j -> 'comercial' ->> 'mensal_centavos')::int = 228734
                     and (j -> 'comercial' ->> 'integracao_centavos')::int = 134457
                     and (public.nx_clientes_admin('tok-f3-gr', jsonb_build_object('id', j ->> 'id')::jsonb) -> 0 -> 'comercial' ->> 'pacote') = 'ultra',
                     'pacote Ultra mantém o snapshot no detalhe e na listagem do Admin'); casos := casos + 1;
  j := public.nx_cliente_admin_salvar('tok-f3-gr', json_build_object('id', j ->> 'id', 'comercial', jsonb_build_object(
    'pacote', 'ultra', 'segmento', 'Ateliê artesanal', 'especificacoes', 'Complemento de escopo.'))::jsonb);
  perform pg_temp.ok((j -> 'comercial' ->> 'mensal_centavos')::int = 228734
                     and (j -> 'comercial' ->> 'integracao_centavos')::int = 134457
                     and (j -> 'comercial' ->> 'especificacoes') = 'Complemento de escopo.',
                     'editar especificações preserva o preço comercial já registrado'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_cliente_admin_salvar(%L, %L::jsonb)', 'tok-f3-gr', json_build_object(
    'id', j ->> 'id', 'comercial', jsonb_build_object('pacote', 'inventado', 'segmento', '', 'especificacoes', ''))));
  perform pg_temp.ok(r = 'dados_invalidos|comercial'
                     and (select comercial ->> 'pacote' = 'ultra' from public.nx_clientes where id = (j ->> 'id')::uuid),
                     'pacote fora das três ofertas é recusado sem sobrescrever o cadastro'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_cliente_admin_salvar(%L, %L::jsonb)', 'tok-f3-gr', json_build_object(
    'id', j ->> 'id', 'comercial', jsonb_build_object('pacote', 'ultra', 'segmento', '', 'especificacoes', repeat('x', 5001)))));
  perform pg_temp.ok(r = 'dados_invalidos|comercial', 'especificações acima de 5.000 caracteres recusadas no servidor'); casos := casos + 1;
  perform pg_temp.ok(exists (select 1 from public.nx_funis f where f.cliente_id = (j ->> 'id')::uuid), 'criar aplica o modelo da vertical'); casos := casos + 1;
  j := public.nx_cliente_admin_salvar('tok-f3-gr', json_build_object('id', j ->> 'id', 'plano', 'essencial', 'status', 'ativo')::jsonb);
  perform pg_temp.ok((j ->> 'plano') = 'essencial' and (select modulos from public.nx_clientes where id = (j ->> 'id')::uuid) = (select modulos from public.nx_planos where id = 'essencial'), 'trocar de plano sem módulos → módulos do plano novo'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_cliente_admin_salvar(%L, %L::jsonb)', 'tok-f3-gr', json_build_object('id', cA, 'nome', 'Hack')));
  perform pg_temp.ok(r = 'sem_acesso', 'revenda editando cliente da Nexus → sem_acesso'); casos := casos + 1;
  -- (revisão) gestor de revenda que TAMBÉM tem acesso comum (leitura) num cliente da Nexus: continua sem poder
  -- editar/suspender esse cliente pelo Admin nem ligar domínio nele (o nx_pode aceitaria o acesso comum)
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_gr, cA, 'leitura');
  r := pg_temp.erro(format('select public.nx_cliente_admin_salvar(%L, %L::jsonb)', 'tok-f3-gr', json_build_object('id', cA, 'status', 'suspenso', 'nome', 'Hackeado')));
  perform pg_temp.ok(r = 'sem_acesso' and (select status = 'ativo' and nome = 'Clínica Teste F3 A' from public.nx_clientes where id = cA),
                     'gestor de revenda com acesso leitura num cliente da Nexus não o edita (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_cliente_admin_salvar(%L, %L::jsonb)', 'tok-f3-gr', json_build_object('id', gen_random_uuid(), 'nome', 'Fantasma')));
  perform pg_temp.ok(r = 'cliente_nao_encontrado', 'cliente inexistente → cliente_nao_encontrado (' || r || ')'); casos := casos + 1;
  delete from public.nx_acessos where conta_id = k_gr and cliente_id = cA;
  -- (revisão) super liga um módulo EXTRA (fora do plano) num cliente da revenda: o gestor continua editando esse cliente
  -- (o formulário devolve o módulo marcado), mas não liga outro módulo fora do plano
  perform public.nx_cliente_admin_salvar('tok-f3-super', json_build_object('id', cR2, 'modulos', json_build_array('crm', 'conversas', 'relatorios', 'marca'))::jsonb);
  j := public.nx_cliente_admin_salvar('tok-f3-gr', json_build_object('id', cR2, 'nome', 'Loja Teste F3 R2 Nova', 'plano', 'essencial',
         'modulos', json_build_array('crm', 'conversas', 'relatorios', 'marca'))::jsonb);
  perform pg_temp.ok((j ->> 'nome') = 'Loja Teste F3 R2 Nova' and (j -> 'modulos')::jsonb ? 'marca', 'gestor edita cliente com módulo extra dado pelo super (mantém o extra)'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_cliente_admin_salvar(%L, %L::jsonb)', 'tok-f3-gr', json_build_object('id', cR2, 'modulos', json_build_array('crm', 'conversas', 'relatorios', 'marca', 'ads'))));
  perform pg_temp.ok(r = 'so_plataforma', 'gestor não liga OUTRO módulo fora do plano (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_cliente_admin_salvar(%L, %L::jsonb)', 'tok-f3-super', json_build_object('id', cR, 'limites', json_build_object('usuarios', 1e12))));
  perform pg_temp.ok(r = 'dados_invalidos|limites', 'limite extra gigante recusado (senão o nx_limite quebraria o Admin) (' || r || ')'); casos := casos + 1;
  j := public.nx_cliente_admin_salvar('tok-f3-super', json_build_object('id', cR, 'limites', json_build_object('usuarios', 10))::jsonb);
  perform pg_temp.ok((j -> 'limites' ->> 'usuarios')::int = 10, 'super grava limite extra'); casos := casos + 1;
  j := public.nx_clientes_admin('tok-f3-gr', '{}');
  perform pg_temp.ok(json_array_length(j) >= 3 and not exists (select 1 from json_array_elements(j) e where (e -> 'org' ->> 'id')::uuid <> v_rev), 'clientes_admin da revenda só com clientes dela'); casos := casos + 1;
  j := public.nx_clientes_admin('tok-f3-super', json_build_object('busca', 'OFICINA teste f3')::jsonb);
  perform pg_temp.ok(json_array_length(j) = 1 and (j -> 0 ->> 'id')::uuid = cB, 'clientes_admin busca sem acento/caixa'); casos := casos + 1;
  j := public.nx_planos_listar('tok-f3-gr');
  perform pg_temp.ok(not exists (select 1 from json_array_elements(j) p where p ->> 'id' = 'interno'), 'planos do gestor de revenda sem interno'); casos := casos + 1;
  j := public.nx_planos_listar('tok-f3-super');
  perform pg_temp.ok(exists (select 1 from json_array_elements(j) p where p ->> 'id' = 'interno'), 'super vê o plano interno'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_planos_listar(%L)', 'tok-f3-adma'));
  perform pg_temp.ok(r = 'so_gestor', 'admin de cliente não lista planos'); casos := casos + 1;
  j := public.nx_orgs_listar('tok-f3-gr');
  perform pg_temp.ok(json_array_length(j) = 1 and (j -> 0 ->> 'id')::uuid = v_rev, 'orgs_listar: gestor só a sua'); casos := casos + 1;

  -- ---------------- tema e sessão leve ----------------
  update public.nx_clientes set cfg = cfg || '{"corMarca":"#145C66"}'::jsonb where id = cA;
  j := public.nx_cliente_tema('tok-f3-adma', cA);
  perform pg_temp.ok((j -> 'marca_cliente' ->> 'corMarca') = '#145C66' and length(j ->> 'atualizado') = 10, 'cliente_tema com reserva do painel e hash'); casos := casos + 1;
  jb := public.nx_app_sessao('tok-f3-adma')::jsonb;
  perform pg_temp.ok(jb::text not like '%"cfg"%' and jb::text not like '%"tema":%' and jb::text not like '%"logo"%', 'app_sessao sem cfg, tema ou logo'); casos := casos + 1;
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(jb -> 'clientes') c where (c ->> 'id')::uuid = cA and (c ->> 'papel') = 'atendente'
                             and (c ->> 'tem_tema')::boolean and (c ->> 'tema_hash') = (public.nx_cliente_tema('tok-f3-adma', cA) ->> 'atualizado')),
                     'app_sessao: papel efetivo e tema_hash = nx_cliente_tema.atualizado'); casos := casos + 1;
  perform pg_temp.ok(jsonb_array_length(jb -> 'clientes') = 1 and (jb -> 'conta' ->> 'super')::boolean = false, 'app_sessao: só clientes com acesso'); casos := casos + 1;
  jb := public.nx_app_sessao('tok-f3-gr')::jsonb;
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(jb -> 'clientes') c where (c ->> 'id')::uuid in (cA, cB))
                     and exists (select 1 from jsonb_array_elements(jb -> 'clientes') c where (c ->> 'id')::uuid = cR and (c ->> 'papel') = 'gestor' and not (c ? 'proprio')
                                 and (c ->> 'link_base') = 'https://crm.teste-f3.com.br/app/'
                                 and (c -> 'limites') is null and not (c ? 'status')
                                 and (c -> 'modulos') is null and (jb -> 'modulos_plano' -> 'essencial') is not null),
                     'app_sessao do gestor: só a org, papel gestor, sem acesso próprio (suporte), link_base do domínio, só o que foge do padrão'); casos := casos + 1;
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(public.nx_app_sessao('tok-f3-super')::jsonb -> 'clientes') c
                             where (c ->> 'id')::uuid = cR and (c ->> 'org_nome') = 'Agência Teste F3' and (c -> 'modulos') is null),
                     'app_sessao do super: org_nome de cliente de revenda'); casos := casos + 1;
  -- 200 clientes gerados: < 50 KB e rápido
  insert into public.nx_clientes (slug, nome, org_id, plano, modulos, vertical)
  select 'teste-f3-g' || g, 'Cliente gerado F3 número ' || g, v_plat, 'interno', '{crm,conversas,relatorios,ads,automacoes,marca}', 'odonto'
    from generate_series(1, 200) g;
  t0 := clock_timestamp();
  r := public.nx_app_sessao('tok-f3-super')::text;
  ms := extract(milliseconds from clock_timestamp() - t0)::int;
  n := (select jsonb_array_length(r::jsonb -> 'clientes'));
  perform pg_temp.ok(n >= 200, 'super vê os 200 gerados');
  perform pg_temp.ok(octet_length(r) < 50000, 'app_sessao com ' || n || ' clientes = ' || octet_length(r) || ' bytes (< 50 KB)'); casos := casos + 1;
  perform pg_temp.ok(ms < 1500, 'lento nx_app_sessao ' || ms || ' ms'); casos := casos + 1;
  t0 := clock_timestamp();
  j := public.nx_clientes_admin('tok-f3-super', '{}');
  ms := extract(milliseconds from clock_timestamp() - t0)::int;
  perform pg_temp.ok(ms < 2000, 'lento nx_clientes_admin ' || ms || ' ms'); casos := casos + 1;

  -- ================= P0-B (arquivo 20260928c_plataforma_b.sql) =================
  -- estado aqui: k_admA virou ATENDENTE em cA; k_admAB é admin de cA e cB; k_revcli admin de cR (sem módulo marca)

  -- ---------------- validação da marca / tema (§4.2.1) ----------------
  jb := public.nx_marca_validar('{"produto":"  Conecta  ","cores":{"primaria":"#2255cc"},"logo":"","suporte_wa":"(12) 99999-0000"}', false);
  perform pg_temp.ok(jb = '{"produto":"Conecta","cores":{"primaria":"#2255CC"},"suporte_wa":"12999990000"}'::jsonb, 'marca limpa: apara, maiúscula, tira vazio, só dígitos (' || jb::text || ')'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_marca_validar('{"cores":{"primaria":"#FFF"}}', false)$q$);
  perform pg_temp.ok(r = 'marca_invalida|cores.primaria', 'cor curta → marca_invalida|cores.primaria (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_marca_validar('{"logo":"https://cdn.exemplo.com/logo.svg"}', false)$q$);
  perform pg_temp.ok(r = 'marca_invalida|logo', 'logo SVG por URL recusado (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_marca_validar('{"logo":"data:image/svg+xml;base64,PHN2Zz4="}', false)$q$);
  perform pg_temp.ok(r = 'marca_invalida|logo', 'logo SVG em data: recusado (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_marca_validar('{"logo":"http://inseguro.com/a.png"}', false)$q$);
  perform pg_temp.ok(r = 'marca_invalida|logo', 'logo http:// recusado (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_marca_validar(%L::jsonb, false)', json_build_object('favicon', 'data:image/png;base64,' || repeat('A', 30001))));
  perform pg_temp.ok(r = 'marca_invalida|favicon', 'favicon > 30.000 recusado (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_marca_validar('{"produto":"Órbita"}', true)$q$);
  perform pg_temp.ok(r = 'marca_invalida|produto', 'tema do cliente só aceita logo/logo_claro/cores (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_marca_validar('{"cores":{"terciaria":"#000000"}}', false)$q$);
  perform pg_temp.ok(r = 'marca_invalida|cores.terciaria', 'cor desconhecida recusada (' || r || ')'); casos := casos + 1;

  -- ---------------- nx_org_salvar (revendas) ----------------
  j := public.nx_org_salvar('tok-f3-super', '{"slug":"teste-f3-nova","nome":"Nova Agência F3","marca":{"produto":"Nova"},"limites":{"empresas":2,"usuarios":10,"canais":2,"plano_padrao":"essencial"}}');
  perform pg_temp.ok((j ->> 'tipo') = 'revenda' and (j ->> 'empresas')::int = 0 and (j -> 'limites' ->> 'empresas')::int = 2
                     and (j -> 'marca' ->> 'produto') = 'Nova', 'super cria revenda com marca e limites'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_org_salvar('tok-f3-super', '{"slug":"teste-f3-nova","nome":"Outra"}')$q$);
  perform pg_temp.ok(r = 'slug_em_uso', 'slug repetido → slug_em_uso (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_org_salvar('tok-f3-super', '{"slug":"teste-f3-x","nome":"X Y","limites":{"contatos":5}}')$q$);
  perform pg_temp.ok(r = 'dados_invalidos|limites.contatos', 'limite de org só empresas/usuarios/canais (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_org_salvar('tok-f3-super', '{"slug":"teste-f3-x","nome":"X Y","limites":{"plano_padrao":"interno"}}')$q$);
  perform pg_temp.ok(r = 'dados_invalidos|plano_padrao', 'plano_padrao interno recusado (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_org_salvar(%L, %L::jsonb)', 'tok-f3-super', json_build_object('id', v_plat, 'status', 'suspenso')));
  perform pg_temp.ok(r = 'dados_invalidos|status', 'plataforma nunca é suspensa (' || r || ')'); casos := casos + 1;
  j := public.nx_org_salvar('tok-f3-gr', json_build_object('id', v_rev, 'nome', 'Agência Teste F3',
         'marca', json_build_object('produto', 'Conecta Dois', 'cores', json_build_object('primaria', '#ffff00', 'secundaria', '#22AA88', 'fundo', '#FFFFFF'),
                                    'login_titulo', 'Bem-vindo à Conecta'))::jsonb);
  perform pg_temp.ok((j -> 'marca' -> 'cores' ->> 'primaria') = '#FFFF00' and (j -> 'limites' ->> 'usuarios')::int = 3,
                     'gestor edita a marca da própria revenda (limites intactos)'); casos := casos + 1;
  j := public.nx_marca_publica('', 'teste-rev-f3');
  perform pg_temp.ok((j -> 'marca' ->> 'produto') = 'Conecta Dois' and (j -> 'marca' ->> 'login_titulo') = 'Bem-vindo à Conecta', 'marca nova aparece no login (?org)'); casos := casos + 1;
  perform pg_temp.ok(exists (select 1 from public.nx_auditoria where org_id = v_rev and acao = 'marca' and conta_id = k_gr), 'marca auditada'); casos := casos + 1;
  -- (revisão) a sessão leve traz img_hash da org (sem as imagens): trocar o logo muda o hash → o navegador relê
  r := public.nx_app_sessao('tok-f3-gr')::jsonb -> 'org' ->> 'img_hash';
  perform public.nx_org_salvar('tok-f3-gr', json_build_object('id', v_rev, 'marca',
            (select marca from public.nx_orgs where id = v_rev) || jsonb_build_object('logo', 'data:image/png;base64,iVBORw0KGgo='))::jsonb);
  perform pg_temp.ok(length(r) = 10 and (public.nx_app_sessao('tok-f3-gr')::jsonb -> 'org' ->> 'img_hash') <> r
                     and public.nx_app_sessao('tok-f3-gr')::text not like '%iVBORw0KGgo%', 'img_hash muda com o logo e a sessão continua sem imagem'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_org_salvar(%L, %L::jsonb)', 'tok-f3-gr', json_build_object('id', v_rev, 'limites', json_build_object('usuarios', 99))));
  perform pg_temp.ok(r = 'so_plataforma', 'gestor não mexe nos próprios limites (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_org_salvar(%L, %L::jsonb)', 'tok-f3-gr', json_build_object('id', v_rev, 'status', 'suspenso')));
  perform pg_temp.ok(r = 'so_plataforma', 'gestor não muda status (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_org_salvar('tok-f3-gr', '{"slug":"teste-f3-y","nome":"Sub revenda"}')$q$);
  perform pg_temp.ok(r = 'so_plataforma', 'gestor não cria revenda (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_org_salvar(%L, %L::jsonb)', 'tok-f3-gr', json_build_object('id', v_plat, 'nome', 'Hack')));
  perform pg_temp.ok(r = 'sem_permissao', 'gestor não edita outra org (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_org_salvar(%L, %L::jsonb)', 'tok-f3-admab', json_build_object('id', v_plat, 'nome', 'Hack')));
  perform pg_temp.ok(r = 'so_gestor', 'conta de empresa não edita org (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_org_salvar(%L, %L::jsonb)', 'tok-f3-gr', json_build_object('id', v_rev, 'marca', json_build_object('cores', json_build_object('fundo', 'preto')))));
  perform pg_temp.ok(r = 'marca_invalida|cores.fundo', 'marca inválida no salvar → hint do campo (' || r || ')'); casos := casos + 1;
  j := public.nx_orgs_listar('tok-f3-super');
  perform pg_temp.ok(exists (select 1 from json_array_elements(j) o where (o ->> 'slug') = 'teste-f3-nova'), 'orgs_listar do super traz a revenda nova'); casos := casos + 1;

  -- ---------------- nx_tema_salvar ----------------
  j := public.nx_tema_salvar('tok-f3-admab', cA, '{"cores":{"primaria":"#145c66","secundaria":"#C9A96E","fundo":"#0B1416"}}');
  perform pg_temp.ok((j -> 'tema' -> 'cores' ->> 'primaria') = '#145C66' and length(j ->> 'atualizado') = 10, 'admin (com módulo marca) salva o tema'); casos := casos + 1;
  perform pg_temp.ok((public.nx_cliente_tema('tok-f3-admab', cA) -> 'tema' -> 'cores' ->> 'fundo') = '#0B1416'
                     and (public.nx_cliente_tema('tok-f3-admab', cA) ->> 'atualizado') = (j ->> 'atualizado'), 'cliente_tema devolve o tema salvo e o mesmo hash'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_tema_salvar(%L, %L::uuid, %L::jsonb)', 'tok-f3-revcli', cR, '{"cores":{"primaria":"#112233"}}'));
  perform pg_temp.ok(r like 'modulo_desligado%', 'admin sem módulo marca → modulo_desligado (' || r || ')'); casos := casos + 1;
  j := public.nx_tema_salvar('tok-f3-gr', cR, '{"cores":{"primaria":"#112233"}}');
  perform pg_temp.ok((j -> 'tema' -> 'cores' ->> 'primaria') = '#112233', 'gestor define o tema mesmo sem o módulo'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_tema_salvar(%L, %L::uuid, %L::jsonb)', 'tok-f3-adma', cA, '{"cores":{"primaria":"#112233"}}'));
  perform pg_temp.ok(r = 'sem_permissao', 'atendente não mexe no tema (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_tema_salvar(%L, %L::uuid, %L::jsonb)', 'tok-f3-admab', cA, '{"produto":"X"}'));
  perform pg_temp.ok(r = 'marca_invalida|produto', 'tema com chave de org → marca_invalida (' || r || ')'); casos := casos + 1;
  j := public.nx_tema_salvar('tok-f3-gr', cR, '{}');
  perform pg_temp.ok((j -> 'tema')::text = '{}' and (select tema = '{}'::jsonb from public.nx_clientes where id = cR), 'tema vazio = volta para a marca da org'); casos := casos + 1;

  -- ---------------- domínios ----------------
  j := public.nx_dominio_salvar('tok-f3-gr', ' https://App.Agencia-F3.com.br/login ', null);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j) d where (d ->> 'host') = 'app.agencia-f3.com.br' and (d ->> 'status') = 'pendente'
                             and (d -> 'dns' ->> 'tipo') = 'CNAME' and (d -> 'dns' ->> 'nome') = 'app.agencia-f3.com.br'), 'domínio cadastrado pendente com instrução CNAME'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_dominio_salvar('tok-f3-gr', 'app.agencia-f3.com.br', null)$q$);
  perform pg_temp.ok(r = 'dominio_em_uso', 'domínio repetido → dominio_em_uso (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_dominio_salvar('tok-f3-gr', 'localhost', null)$q$);
  perform pg_temp.ok(r = 'dominio_invalido', 'localhost → dominio_invalido (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_dominio_salvar('tok-f3-gr', 'minha-agencia.netlify.app', null)$q$);
  perform pg_temp.ok(r = 'dominio_invalido', 'subdomínio netlify.app → dominio_invalido (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_dominio_salvar(%L, %L, %L::uuid)', 'tok-f3-gr', 'cli.agencia-f3.com.br', cA));
  perform pg_temp.ok(r = 'sem_acesso', 'gestor não liga domínio a cliente de outra org (' || r || ')'); casos := casos + 1;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_gr, cA, 'leitura');
  r := pg_temp.erro(format('select public.nx_dominio_salvar(%L, %L, %L::uuid)', 'tok-f3-gr', 'cli2.agencia-f3.com.br', cA));
  perform pg_temp.ok(r = 'sem_acesso' and not exists (select 1 from public.nx_dominios where host = 'cli2.agencia-f3.com.br'),
                     '(revisão) gestor com acesso comum num cliente da Nexus também não liga domínio nele (' || r || ')'); casos := casos + 1;
  delete from public.nx_acessos where conta_id = k_gr and cliente_id = cA;
  j := public.nx_dominio_salvar('tok-f3-gr', 'loja.agencia-f3.com.br', cR);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j) d where (d ->> 'host') = 'loja.agencia-f3.com.br' and (d -> 'cliente' ->> 'id')::uuid = cR), 'domínio de cliente da própria org'); casos := casos + 1;
  perform public.nx_dominio_salvar('tok-f3-super', 'crm.nexus-f3.com.br', null);
  j := public.nx_dominios_listar('tok-f3-gr');
  perform pg_temp.ok(not exists (select 1 from json_array_elements(j) d where (d -> 'org' ->> 'id')::uuid is distinct from v_rev), 'gestor só lista domínios da própria org'); casos := casos + 1;
  perform pg_temp.ok(exists (select 1 from json_array_elements(public.nx_dominios_listar('tok-f3-super')) d where (d ->> 'host') = 'crm.nexus-f3.com.br'), 'super lista todos'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_dominio_status('tok-f3-gr', 'app.agencia-f3.com.br', true)$q$);
  perform pg_temp.ok(r = 'so_plataforma', 'gestor não ativa domínio (' || r || ')'); casos := casos + 1;
  perform public.nx_dominio_status('tok-f3-super', 'app.agencia-f3.com.br', true);
  j := public.nx_marca_publica('app.agencia-f3.com.br', null);
  perform pg_temp.ok((j -> 'org' ->> 'slug') = 'teste-rev-f3' and (j -> 'marca' ->> 'produto') = 'Conecta Dois', 'domínio ativado resolve a marca da revenda'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_dominio_remover('tok-f3-gr', 'crm.nexus-f3.com.br')$q$);
  perform pg_temp.ok(r = 'dados_invalidos|host', 'gestor não remove domínio de outra org (' || r || ')'); casos := casos + 1;
  j := public.nx_dominio_remover('tok-f3-gr', 'loja.agencia-f3.com.br');
  perform pg_temp.ok((j ->> 'ok')::boolean and not exists (select 1 from public.nx_dominios where host = 'loja.agencia-f3.com.br'), 'gestor remove domínio da própria org'); casos := casos + 1;

  -- ---------------- planos ----------------
  j := public.nx_plano_salvar('tok-f3-super', '{"id":"teste_f3","nome":"Plano F3","preco_mensal":123.4,"limites":{"usuarios":2,"funis":null},"modulos":["crm","ads"],"ordem":7}');
  perform pg_temp.ok((j ->> 'id') = 'teste_f3' and (j -> 'modulos')::jsonb ? 'conversas' and (j -> 'limites' ->> 'usuarios')::int = 2
                     and (j ->> 'preco_mensal')::numeric = 123.4, 'super cria plano (crm liga conversas junto)'); casos := casos + 1;
  j := public.nx_plano_salvar('tok-f3-super', '{"id":"teste_f3","ativo":false}');
  perform pg_temp.ok((j ->> 'nome') = 'Plano F3' and not (j ->> 'ativo')::boolean and (j -> 'limites' ->> 'usuarios')::int = 2, 'editar plano mantém o que não veio'); casos := casos + 1;
  perform pg_temp.ok(not exists (select 1 from json_array_elements(public.nx_planos_listar('tok-f3-gr')) p where (p ->> 'id') = 'teste_f3'), 'plano inativo some para o gestor'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_plano_salvar('tok-f3-gr', '{"id":"teste_f3b","nome":"Pirata"}')$q$);
  perform pg_temp.ok(r = 'so_plataforma', 'gestor não cria plano (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_plano_salvar('tok-f3-super', '{"id":"teste_f3","limites":{"xyz":1}}')$q$);
  perform pg_temp.ok(r = 'dados_invalidos|limites.xyz', 'limite desconhecido no plano (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_plano_salvar('tok-f3-super', '{"id":"teste_f3","modulos":["crm","disco"]}')$q$);
  perform pg_temp.ok(r = 'dados_invalidos|modulos', 'módulo desconhecido no plano (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_plano_salvar('tok-f3-super', '{"id":"teste_f3","ordem":1.5}')$q$);
  perform pg_temp.ok(r = 'dados_invalidos|ordem', '(revisão) ordem quebrada → dados_invalidos|ordem, não erro cru (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_plano_salvar('tok-f3-super', '{"id":"teste_f3","limites":{"usuarios":1e12}}')$q$);
  perform pg_temp.ok(r = 'dados_invalidos|limites.usuarios', '(revisão) limite gigante no plano recusado (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro($q$select public.nx_plano_salvar('tok-f3-super', '{"id":"teste_f3","preco_mensal":1e12}')$q$);
  perform pg_temp.ok(r = 'dados_invalidos|preco_mensal', '(revisão) preço gigante recusado (' || r || ')'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_org_salvar(%L, %L::jsonb)', 'tok-f3-super', json_build_object('id', v_rev, 'limites', json_build_object('usuarios', 5e9))));
  perform pg_temp.ok(r = 'dados_invalidos|limites.usuarios', '(revisão) limite de revenda gigante recusado (' || r || ')'); casos := casos + 1;

  -- ---------------- notificações (sino) ----------------
  insert into public.nx_notificacoes (cliente_id, conta_id, tipo, titulo, corpo, link) values
    (cA, k_admAB, 'sistema', 'Primeira F3', 'corpo 1', '#/crm'),
    (cA, k_admAB, 'tarefa', 'Segunda F3', null, null),
    (cA, k_admA, 'atribuida', 'Da atendente F3', null, '#/conversas'),
    (cB, k_admAB, 'sistema', 'De outra empresa F3', null, null);
  j := public.nx_notificacoes_listar('tok-f3-admab', cA, 30);
  perform pg_temp.ok(json_array_length(j -> 'itens') = 2 and (j ->> 'nao_lidas')::int = 2 and (j -> 'itens' -> 0 ->> 'titulo') in ('Segunda F3', 'Primeira F3'),
                     'sino: só as da conta nesse cliente'); casos := casos + 1;
  perform pg_temp.ok(json_array_length(public.nx_notificacoes_listar('tok-f3-admab', cA, 1) -> 'itens') = 1, 'sino respeita p_limite'); casos := casos + 1;
  n := (select id from public.nx_notificacoes where conta_id = k_admAB and cliente_id = cA and titulo = 'Primeira F3');
  j := public.nx_notificacoes_marcar('tok-f3-adma', cA, array[n::bigint]);
  perform pg_temp.ok((j ->> 'nao_lidas')::int = 1 and (select lida_em is null from public.nx_notificacoes where id = n), 'marcar id de outra conta não mexe nele'); casos := casos + 1;
  j := public.nx_notificacoes_marcar('tok-f3-admab', cA, array[n::bigint]);
  perform pg_temp.ok((j ->> 'nao_lidas')::int = 1, 'marcar uma'); casos := casos + 1;
  j := public.nx_notificacoes_marcar('tok-f3-admab', cA, null);
  perform pg_temp.ok((j ->> 'nao_lidas')::int = 0 and (public.nx_notificacoes_listar('tok-f3-admab', cB, 30) ->> 'nao_lidas')::int = 1, 'marcar todas só nesse cliente'); casos := casos + 1;

  -- ---------------- plano e uso ----------------
  j := public.nx_uso_plano('tok-f3-admab', cA);
  perform pg_temp.ok((j -> 'plano' ->> 'id') = 'interno' and (j -> 'uso' ->> 'usuarios') is not null and (j -> 'uso') ::jsonb ?& array['canais','funis','automacoes','contatos','ia_mes']
                     and (j -> 'org')::text = 'null' and (j ->> 'storage_mb') is not null, 'uso_plano do admin (org nula na plataforma)'); casos := casos + 1;
  j := public.nx_uso_plano('tok-f3-gr', cR);
  perform pg_temp.ok((j -> 'org' -> 'uso' ->> 'empresas')::int >= 3 and (j -> 'org' -> 'limites' ->> 'usuarios')::int = 3 and (j -> 'limites' ->> 'usuarios')::int = 10,
                     'uso_plano do gestor traz a soma da revenda e o limite extra do cliente'); casos := casos + 1;
  perform pg_temp.ok((public.nx_uso_plano('tok-f3-revcli', cR) -> 'org')::text = 'null', 'admin da empresa não vê o uso da revenda'); casos := casos + 1;
  perform pg_temp.ok((public.nx_uso_plano('tok-f3-revcli', cR) -> 'plano' ->> 'preco_mensal') is null
                     and (public.nx_uso_plano('tok-f3-revcli', cR) -> 'plano' ->> 'nome') is not null
                     and (public.nx_uso_plano('tok-f3-gr', cR) -> 'plano' ->> 'preco_mensal') is not distinct from (select preco_mensal::text from public.nx_planos where id = (select plano from public.nx_clientes where id = cR)),
                     '(revisão) cliente de revenda não vê o preço de tabela da plataforma; o gestor vê'); casos := casos + 1;
  r := pg_temp.erro(format('select public.nx_uso_plano(%L, %L::uuid)', 'tok-f3-adma', cA));
  perform pg_temp.ok(r = 'sem_permissao', 'atendente não vê plano e uso (' || r || ')'); casos := casos + 1;

  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_org_salvar(text,jsonb)', 'execute')
                     and has_function_privilege('anon', 'public.nx_tema_salvar(text,uuid,jsonb)', 'execute')
                     and has_function_privilege('anon', 'public.nx_notificacoes_marcar(text,uuid,bigint[])', 'execute')
                     and has_function_privilege('anon', 'public.nx_uso_plano(text,uuid)', 'execute')
                     and not has_function_privilege('anon', 'public.nx_marca_validar(jsonb,boolean)', 'execute')
                     and not has_function_privilege('authenticated', 'public.nx_org_item(uuid)', 'execute'), 'grants P0-B'); casos := casos + 1;
  perform pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                                  where s.nspname = 'public' and p.proname in ('nx_org_salvar','nx_tema_salvar','nx_dominios_listar','nx_dominio_salvar',
                                        'nx_dominio_status','nx_dominio_remover','nx_plano_salvar','nx_notificacoes_listar','nx_notificacoes_marcar','nx_uso_plano')
                                    and (not p.prosecdef or p.provolatile <> 'v' or coalesce(array_to_string(p.proconfig, ','), '') <> 'search_path=""')),
                     'P0-B: security definer, volatile e search_path vazio'); casos := casos + 1;

  -- ---------------- grants ----------------
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_marca_publica(text,text)', 'execute')
                     and has_function_privilege('anon', 'public.nx_convite_aceitar(text,text,text,text)', 'execute')
                     and has_function_privilege('anon', 'public.nx_app_sessao(text)', 'execute')
                     and has_function_privilege('anon', 'public.nx_cliente_admin_salvar(text,jsonb)', 'execute'), 'RPCs de painel com grant para anon'); casos := casos + 1;
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_link_base_org(uuid)', 'execute')
                     and not has_function_privilege('anon', 'public.nx_cliente_admin_item(uuid)', 'execute')
                     and not has_function_privilege('anon', 'public.nx_marca_publica_de(jsonb)', 'execute')
                     and not has_function_privilege('authenticated', 'public.nx_tema_hash(jsonb,jsonb)', 'execute'), 'internas sem grant para anon/authenticated'); casos := casos + 1;
  perform pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                                  where s.nspname = 'public' and p.proname in ('nx_marca_publica','nx_app_sessao','nx_cliente_tema','nx_usuarios_listar',
                                        'nx_usuario_salvar','nx_usuario_remover','nx_convite_criar','nx_convite_revogar','nx_convite_ver','nx_convite_aceitar',
                                        'nx_senha_link_criar','nx_senha_redefinir','nx_senha_trocar','nx_sair_todas','nx_perfil_salvar','nx_planos_listar',
                                        'nx_orgs_listar','nx_clientes_admin','nx_cliente_admin_salvar')
                                    and (not p.prosecdef or p.provolatile <> 'v' or coalesce(array_to_string(p.proconfig, ','), '') <> 'search_path=""')),
                     'todas security definer, volatile e search_path vazio'); casos := casos + 1;

  raise exception 'VERDE 03_plataforma: % casos', casos;
end $t$;

rollback;
