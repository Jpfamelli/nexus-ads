-- ============================================================
-- ÓRBITA — supabase/testes/15_conversas_client_ref_onboarding.sql · frente D · plano de 01/10/2026 (M36 + M32)
-- Smoke de 20261002d_conversas_client_ref_onboarding.sql:
--   M36  nx_mensagens.client_ref com índice único parcial: o mesmo ref em OUTRA saída é recusado; null repete à vontade;
--        o ref vale por cliente; nx_cv_ref_ver devolve a mensagem gravada (e erro para o ref de OUTRA conversa);
--        nx_cv_ref_marcar grava uma vez e devolve false na corrida; formato inválido é dados_invalidos|client_ref.
--        RESERVA antes do envio (nx_envio_refs): nx_cv_ref_reservar devolve novo → em_andamento (2º pedido com o 1º em voo) →
--        gravada (depois do marcar) ou antiga (150 s sem mensagem); nx_cv_ref_liberar solta só a reserva SEM mensagem;
--        a reserva vale por cliente; saída antiga só com nx_mensagens.client_ref também conta como gravada; faxina de 7 dias.
--   M32  nx_onboarding_estado: tenant NOVO = 0 de 11; tenant PRONTO = 11 de 11 (100 %); cada item muda sozinho quando o dado nasce;
--        9 obrigatórios (script do site e anúncios são opcionais); só admin lê (atendente recebe sem_acesso); cliente B não enxerga
--        os dados de A; nunca devolve segredo; cliente ANTIGO com o funil do modelo intacto não aparece como "funil ajustado".
-- Roda em begin … rollback. O bloco principal SEMPRE termina em exceção:
--   'OK_15_CLIENT_REF_ONBOARDING …' = todos os casos passaram · 'FALHOU: <caso>' = falha
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
  sfx text := substr(md5(random()::text), 1, 8);
  cA uuid; cB uuid; k_ad uuid; k_at uuid; k_adb uuid; k_col uuid;
  tAd text := 'tok-15-ad-' || sfx; tAt text := 'tok-15-at-' || sfx; tB text := 'tok-15-adb-' || sfx;
  ct bigint; ctb bigint; cv bigint; cvb bigint; cw uuid; dep uuid; m1 bigint; m2 bigint; m3 bigint; m4 bigint; mb bigint;
  j json; r text; ref1 text := 'orbita:' || sfx || '-0001'; ref2 text := 'orbita:' || sfx || '-0002';
  ref3 text := 'orbita:' || sfx || '-0003'; ref4 text := 'orbita:' || sfx || '-0004'; ref5 text := 'orbita:' || sfx || '-0005';
  it jsonb;
  v_org uuid;
begin
  -- ---------------------------------------------------------- fixtures: dois clientes, cada um com seu admin; A tem também um atendente
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-15-a-' || sfx, 'Teste 15 A', 'generico') returning id into cA;
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-15-b-' || sfx, 'Teste 15 B', 'generico') returning id into cB;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-15-ad-' || sfx || '@teste.local', 'Ana Admin', 'x', 'clinica', true) returning id into k_ad;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-15-at-' || sfx || '@teste.local', 'Beto Atende', 'x', 'clinica', true) returning id into k_at;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-15-adb-' || sfx || '@teste.local', 'Dora B', 'x', 'clinica', true) returning id into k_adb;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-15-col-' || sfx || '@teste.local', 'Caio Colega', 'x', 'clinica', true) returning id into k_col;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_ad, cA, 'admin'), (k_at, cA, 'atendente'), (k_adb, cB, 'admin');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash(tAd), k_ad, now() + interval '1 hour'), (public.nx_hash(tAt), k_at, now() + interval '1 hour'),
    (public.nx_hash(tB), k_adb, now() + interval '1 hour');
  -- o acesso do atendente conta como "colega": tira para provar o 9 sozinho
  delete from public.nx_acessos where conta_id = k_at;

  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id) values (cA, 'Mariana Teste', '5512998301501', '5512998301501') returning id into ct;
  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id) values (cB, 'Rafael Teste', '5512998301502', '5512998301502') returning id into ctb;
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor) values (cA, 'Canal A', 'pn-15-' || sfx, 'meta') returning id into cw;
  -- (o canal de A é da Meta, sem token: ainda não conta como chave)
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo) values (cA, cw, ct, '2026-15' || sfx) returning id into cv;
  insert into public.nx_conversas (cliente_id, contato_id, protocolo) values (cB, ctb, '2026-15b' || sfx) returning id into cvb;

  -- ---------------------------------------------------------- M36 · client_ref
  perform pg_temp.ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'nx_mensagens' and column_name = 'client_ref'), 'coluna client_ref');
  perform pg_temp.ok(exists (select 1 from pg_indexes where indexname = 'nx_mensagens_client_ref_uq' and indexdef ilike '%unique%' and indexdef ilike '%where%'), 'índice único parcial');

  perform pg_temp.ok(public.nx_cv_ref_ver(cA, cv, ref1) is null, 'ref novo: ainda não há mensagem');
  j := public.nx_cv_saida(k_ad, cA, cv, jsonb_build_object('tipo', 'texto', 'corpo', 'Olá!', 'status', 'enviada', 'wamid', 'wamid.15.' || sfx || '.1'));
  m1 := (j ->> 'id')::bigint;
  perform pg_temp.ok(public.nx_cv_ref_marcar(cA, m1, ref1), 'marcar grava o ref na saída recém-criada');
  perform pg_temp.ok(public.nx_cv_ref_marcar(cA, m1, ref1) = false, 'marcar de novo não regrava (já tem ref)');
  j := public.nx_cv_ref_ver(cA, cv, ref1);
  perform pg_temp.ok(j is not null and (j ->> 'id')::bigint = m1, 'o mesmo ref devolve a MESMA mensagem (e a tela não envia outra)');
  perform pg_temp.ok(j ->> 'corpo' = 'Olá!', 'a mensagem devolvida é a que já estava gravada');

  -- corrida: outra saída tentando o MESMO ref perde (o índice único segura) — e a mensagem original continua a única com o ref
  j := public.nx_cv_saida(k_ad, cA, cv, jsonb_build_object('tipo', 'texto', 'corpo', 'Olá! (duplicada)', 'status', 'enviada', 'wamid', 'wamid.15.' || sfx || '.2'));
  m2 := (j ->> 'id')::bigint;
  perform pg_temp.ok(public.nx_cv_ref_marcar(cA, m2, ref1) = false, 'ref que já existe: a segunda saída não leva o ref (corrida perdida)');
  perform pg_temp.ok((select count(*) from public.nx_mensagens where cliente_id = cA and client_ref = ref1) = 1, 'só uma mensagem com o ref');
  perform pg_temp.ok(pg_temp.erro(format('update public.nx_mensagens set client_ref = %L where id = %s', ref1, m2)) like '%nx_mensagens_client_ref_uq%',
    'o banco recusa o ref repetido no mesmo cliente (índice único)');

  -- sem ref: quantas saídas quiser (null não colide)
  j := public.nx_cv_saida(k_ad, cA, cv, jsonb_build_object('tipo', 'texto', 'corpo', 'sem ref 1', 'status', 'enviada', 'wamid', 'wamid.15.' || sfx || '.3'));
  j := public.nx_cv_saida(k_ad, cA, cv, jsonb_build_object('tipo', 'texto', 'corpo', 'sem ref 2', 'status', 'enviada', 'wamid', 'wamid.15.' || sfx || '.4'));
  perform pg_temp.ok((select count(*) from public.nx_mensagens where cliente_id = cA and client_ref is null and direcao = 'out') >= 3, 'client_ref nulo não colide');

  -- o ref vale por cliente: o MESMO texto de ref em B é outra intenção
  perform pg_temp.ok(public.nx_cv_ref_ver(cB, cvb, ref1) is null, 'B não vê o ref de A');
  j := public.nx_cv_saida(k_adb, cB, cvb, jsonb_build_object('tipo', 'texto', 'corpo', 'do B', 'status', 'enviada', 'wamid', 'wamid.15.' || sfx || '.b'));
  mb := (j ->> 'id')::bigint;
  perform pg_temp.ok(public.nx_cv_ref_marcar(cB, mb, ref1), 'o mesmo ref em OUTRO cliente é aceito (vale por cliente)');
  perform pg_temp.ok(public.nx_cv_ref_marcar(cA, mb, ref2) = false, 'marcar com o cliente errado não toca na mensagem de outro cliente');
  perform pg_temp.ok((select client_ref from public.nx_mensagens where id = mb) = ref1, 'a mensagem de B continua com o ref de B');

  -- o ref de OUTRA conversa é erro do cliente
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ref_ver(%L,%s,%L)', cA, cv + 100000, ref1)) = 'dados_invalidos|client_ref',
    'ref já usado em outra conversa → dados_invalidos|client_ref');
  -- formato
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ref_ver(%L,%s,%L)', cA, cv, 'curto')) = 'dados_invalidos|client_ref', 'ref curto demais');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ref_ver(%L,%s,%L)', cA, cv, 'tem espaco e ;')) = 'dados_invalidos|client_ref', 'ref com espaço/;');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ref_marcar(%L,%s,%L)', cA, m1, repeat('a', 81))) = 'dados_invalidos|client_ref', 'ref com 81 caracteres');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ref_ver(%L,%s,NULL)', cA, cv)) = 'dados_invalidos|client_ref', 'ref nulo');
  -- só saída ('out') leva ref
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, direcao, tipo, corpo, wamid, status)
    values (cA, cv, ct, 'in', 'texto', 'entrada', 'wamid.15.' || sfx || '.in', 'recebida') returning id into m3;
  perform pg_temp.ok(public.nx_cv_ref_marcar(cA, m3, ref2) = false, 'mensagem de ENTRADA nunca leva client_ref');
  -- as funções novas são só do servidor (service_role): o painel não chama
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_cv_ref_ver(uuid,bigint,text)', 'execute')
                 and not has_function_privilege('authenticated', 'public.nx_cv_ref_marcar(uuid,bigint,text)', 'execute')
                 and has_function_privilege('service_role', 'public.nx_cv_ref_ver(uuid,bigint,text)', 'execute'), 'ref_ver/marcar só para service_role');

  -- ---------------------------------------------------------- M36 · reserva do ref ANTES do envio (nx_envio_refs)
  -- 1º pedido: é o dono da reserva e pode enviar; 2º pedido com o 1º ainda em voo: espera, não envia
  perform pg_temp.ok(public.nx_cv_ref_reservar(cA, cv, ref3) ->> 'estado' = 'novo', 'reservar: o 1º pedido reserva (novo)');
  perform pg_temp.ok((select mensagem_id is null and conversa_id = cv from public.nx_envio_refs where cliente_id = cA and client_ref = ref3), 'a reserva nasce sem mensagem');
  perform pg_temp.ok(public.nx_cv_ref_reservar(cA, cv, ref3) ->> 'estado' = 'em_andamento', 'reservar: o 2º pedido com o 1º em voo = em_andamento');
  perform pg_temp.ok((select count(*) from public.nx_envio_refs where cliente_id = cA and client_ref = ref3) = 1, 'uma só reserva por (cliente, ref)');
  -- a reserva vale por cliente: o mesmo ref em B é outra intenção
  perform pg_temp.ok(public.nx_cv_ref_reservar(cB, cvb, ref3) ->> 'estado' = 'novo', 'reservar: o mesmo ref em OUTRO cliente é novo');
  -- reserva feita em OUTRA conversa é erro do cliente (mesmo sem mensagem ainda)
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ref_reservar(%L,%s,%L)', cA, cv + 100000, ref3)) = 'dados_invalidos|client_ref',
    'reservar: ref reservado em outra conversa → dados_invalidos|client_ref');
  -- liberar (erro antes do canal: nada saiu): apaga só a reserva sem mensagem e só a do próprio cliente
  perform pg_temp.ok(public.nx_cv_ref_liberar(cA, ref3), 'liberar solta a reserva sem mensagem');
  perform pg_temp.ok(public.nx_cv_ref_liberar(cA, ref3) = false, 'liberar de novo: não há mais o que soltar');
  perform pg_temp.ok((select count(*) from public.nx_envio_refs where cliente_id = cB and client_ref = ref3) = 1, 'liberar de A não toca na reserva de B');
  perform pg_temp.ok(public.nx_cv_ref_reservar(cA, cv, ref3) ->> 'estado' = 'novo', 'depois de liberar, o mesmo ref pode enviar (novo)');
  -- marcar aponta a reserva para a saída; daí em diante o ref devolve a mensagem e a reserva não é mais liberada
  j := public.nx_cv_saida(k_ad, cA, cv, jsonb_build_object('tipo', 'texto', 'corpo', 'Com reserva', 'status', 'enviada', 'wamid', 'wamid.15.' || sfx || '.5'));
  m4 := (j ->> 'id')::bigint;
  perform pg_temp.ok(public.nx_cv_ref_marcar(cA, m4, ref3), 'marcar grava o ref na saída reservada');
  perform pg_temp.ok((select mensagem_id from public.nx_envio_refs where cliente_id = cA and client_ref = ref3) = m4, 'marcar preenche mensagem_id da reserva');
  perform pg_temp.ok((select mensagem_id is null from public.nx_envio_refs where cliente_id = cB and client_ref = ref3), 'marcar de A não toca na reserva de B');
  j := public.nx_cv_ref_reservar(cA, cv, ref3);
  perform pg_temp.ok(j ->> 'estado' = 'gravada' and (j -> 'mensagem' ->> 'id')::bigint = m4 and j -> 'mensagem' ->> 'corpo' = 'Com reserva',
    'reservar: ref com saída gravada devolve a MESMA mensagem (gravada)');
  perform pg_temp.ok(public.nx_cv_ref_liberar(cA, ref3) = false, 'liberar nunca apaga reserva COM mensagem');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ref_reservar(%L,%s,%L)', cA, cv + 100000, ref3)) = 'dados_invalidos|client_ref',
    'reservar: ref já gravado em outra conversa → dados_invalidos|client_ref');
  -- compatibilidade: saída que só tem nx_mensagens.client_ref (sem linha de reserva) também é "gravada"
  perform pg_temp.ok(not exists (select 1 from public.nx_envio_refs where cliente_id = cA and client_ref = ref1), 'ref1 não tem reserva (foi marcado direto)');
  j := public.nx_cv_ref_reservar(cA, cv, ref1);
  perform pg_temp.ok(j ->> 'estado' = 'gravada' and (j -> 'mensagem' ->> 'id')::bigint = m1, 'reservar: mensagem que já leva o ref conta como gravada');
  perform pg_temp.ok(not exists (select 1 from public.nx_envio_refs where cliente_id = cA and client_ref = ref1), 'e não cria reserva para o que já foi gravado');
  -- reserva sem mensagem: até 150 s está em andamento; depois disso é "antiga" (pode ter saído; nunca reenvia)
  perform pg_temp.ok(public.nx_cv_ref_reservar(cA, cv, ref4) ->> 'estado' = 'novo', 'ref4: novo');
  update public.nx_envio_refs set criado_em = now() - interval '149 seconds' where cliente_id = cA and client_ref = ref4;
  perform pg_temp.ok(public.nx_cv_ref_reservar(cA, cv, ref4) ->> 'estado' = 'em_andamento', 'reserva de 149 s sem mensagem: ainda em andamento');
  update public.nx_envio_refs set criado_em = now() - interval '151 seconds' where cliente_id = cA and client_ref = ref4;
  perform pg_temp.ok(public.nx_cv_ref_reservar(cA, cv, ref4) ->> 'estado' = 'antiga', 'reserva de 151 s sem mensagem: antiga');
  perform pg_temp.ok(public.nx_cv_ref_reservar(cA, cv, ref4) ->> 'estado' = 'antiga', 'antiga não vira novo sozinha (nunca reenvia)');
  -- a reserva aponta a saída mesmo quando a mensagem não pôde levar o ref (já tinha outro): a repetição devolve a mensagem
  perform pg_temp.ok(public.nx_cv_ref_marcar(cA, m4, ref4) = false, 'mensagem que já tem ref não troca de ref');
  j := public.nx_cv_ref_reservar(cA, cv, ref4);
  perform pg_temp.ok(j ->> 'estado' = 'gravada' and (j -> 'mensagem' ->> 'id')::bigint = m4, 'mas a reserva passa a apontar a saída (gravada)');
  -- a reserva nunca aponta mensagem de entrada, de outro cliente ou de outra conversa
  perform pg_temp.ok(public.nx_cv_ref_reservar(cA, cv, ref5) ->> 'estado' = 'novo', 'ref5: novo');
  perform pg_temp.ok(public.nx_cv_ref_marcar(cA, m3, ref5) = false and public.nx_cv_ref_marcar(cA, mb, ref5) = false
                 and (select mensagem_id is null from public.nx_envio_refs where cliente_id = cA and client_ref = ref5),
    'marcar com mensagem de entrada ou de outro cliente não preenche a reserva');
  -- faxina: reserva com mais de 7 dias sai na próxima chamada (a do próprio pedido nunca)
  update public.nx_envio_refs set criado_em = now() - interval '8 days' where cliente_id = cA and client_ref in (ref4, ref5);
  perform pg_temp.ok(public.nx_cv_ref_reservar(cA, cv, ref5) ->> 'estado' = 'antiga', 'a reserva do próprio pedido não é varrida (continua antiga)');
  perform pg_temp.ok(not exists (select 1 from public.nx_envio_refs where cliente_id = cA and client_ref = ref4), 'faxina: reserva de outro ref com mais de 7 dias saiu');
  perform pg_temp.ok(exists (select 1 from public.nx_envio_refs where cliente_id = cA and client_ref = ref3), 'faxina: reserva recente fica');
  -- formato e permissões
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ref_reservar(%L,%s,%L)', cA, cv, 'curto')) = 'dados_invalidos|client_ref', 'reservar: ref curto demais');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ref_reservar(%L,%s,NULL)', cA, cv)) = 'dados_invalidos|client_ref', 'reservar: ref nulo');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ref_liberar(%L,%L)', cA, 'tem espaco e ;')) = 'dados_invalidos|client_ref', 'liberar: ref inválido');
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_cv_ref_reservar(uuid,bigint,text)', 'execute')
                 and not has_function_privilege('authenticated', 'public.nx_cv_ref_reservar(uuid,bigint,text)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_cv_ref_liberar(uuid,text)', 'execute')
                 and not has_function_privilege('authenticated', 'public.nx_cv_ref_liberar(uuid,text)', 'execute')
                 and has_function_privilege('service_role', 'public.nx_cv_ref_reservar(uuid,bigint,text)', 'execute')
                 and has_function_privilege('service_role', 'public.nx_cv_ref_liberar(uuid,text)', 'execute'), 'reservar/liberar só para service_role');
  perform pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.nx_envio_refs'::regclass)
                 and not has_table_privilege('anon', 'public.nx_envio_refs', 'select')
                 and not has_table_privilege('authenticated', 'public.nx_envio_refs', 'select, insert, update, delete'), 'nx_envio_refs: RLS ligada e fechada para o painel');

  -- ---------------------------------------------------------- M32 · tenant NOVO: 0 de 11
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((j ->> 'total')::int = 11, 'são 11 itens');
  perform pg_temp.ok((j ->> 'obrigatorios')::int = 9, '9 obrigatórios (script do site e anúncios são opcionais)');
  -- A já tem 1 mensagem enviada (fixtures do M36): o item 5 já vale; o resto está zerado
  perform pg_temp.ok((j ->> 'feitos')::int = 1 and (j ->> 'completo')::boolean = false, 'tenant novo + 1 mensagem enviada = 1 de 11 ' || j::text);
  perform pg_temp.ok(not (select bool_or((x ->> 'feito')::boolean) from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' <> 'mensagem_teste'),
    'tenant novo: nenhum outro item pronto');
  j := public.nx_onboarding_estado(tB, cB);
  perform pg_temp.ok((j ->> 'feitos')::int = 1 and (j ->> 'obrigatorios_feitos')::int = 1 and (j ->> 'pct')::int = 11, 'cliente B (1 mensagem de B): 1 de 11, 1 de 9 obrigatórios = 11 %');
  -- limpa o único item "feito" para provar o 0/11 de verdade
  delete from public.nx_mensagens where cliente_id = cA and direcao = 'out';
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((j ->> 'feitos')::int = 0 and (j ->> 'pct')::int = 0 and (j ->> 'completo')::boolean = false, 'tenant NOVO: 0 de 11, 0 %');
  perform pg_temp.ok(jsonb_array_length((j::jsonb) -> 'itens') = 11
    and (select array_agg(x ->> 'id') from jsonb_array_elements((j::jsonb) -> 'itens') x)
      = array['chave_codewords','aparelho_pareado','recebimento','ia_ou_direto','mensagem_teste','departamento_horario','agenda_faixas','script_site','colega_convidado','funil_ajustado','anuncios_ligados'],
    'a ordem dos 11 itens é a recomendada');
  perform pg_temp.ok((select (x ->> 'opcional')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'anuncios_ligados'), 'anúncios é opcional');
  perform pg_temp.ok((select (x ->> 'opcional')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'script_site'), 'script do site é opcional (nem toda empresa tem site)');
  perform pg_temp.ok((select count(*) from jsonb_array_elements((j::jsonb) -> 'itens') x where not (x ->> 'opcional')::boolean) = (j ->> 'obrigatorios')::int,
    'obrigatorios bate com a quantidade de itens não opcionais');

  -- ---------------------------------------------------------- M32 · permissão e isolamento
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_onboarding_estado(%L,%L)', tAt, cA)) like 'sem_acesso%' or pg_temp.erro(format('select public.nx_onboarding_estado(%L,%L)', tAt, cA)) <> 'ok',
    'atendente não lê o checklist (só admin)');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_onboarding_estado(%L,%L)', tB, cA)) <> 'ok', 'token de B não lê o cliente A');

  -- ---------------------------------------------------------- M32 · cada item nasce sozinho
  -- 1 chave: canal CodeWords com a chave guardada no cofre (aqui só o uuid do segredo; o valor nunca é lido)
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor, codewords_api_segredo, codewords_phone_id, codewords_numero)
    values (cA, 'Aparelho', null, 'codewords', gen_random_uuid(), 'ph-15-' || sfx, '+5512998301000') returning id into cw;
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((select (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'chave_codewords'), '1 · chave salva');
  perform pg_temp.ok((select not (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'aparelho_pareado'), '2 · ainda sem aparelho pareado');
  perform pg_temp.ok((select x ->> 'canal_id' from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'aparelho_pareado') = (select id::text from public.nx_canais where cliente_id = cA order by criado_em limit 1), 'o item aponta o primeiro canal que ainda pede ação');
  -- 2 pareado, 3 recebimento, 4 rota direta
  update public.nx_canais set codewords_conectado = true where id = cw;
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((select (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'aparelho_pareado'), '2 · aparelho pareado');
  update public.nx_canais set codewords_numero_conferido = true where id = cw;
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((select (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'recebimento'), '3 · recebimento conferido');
  perform pg_temp.ok((select not (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'ia_ou_direto'), '4 · ainda sem destino escolhido');
  update public.nx_canais set codewords_rota = 'direta' where id = cw;
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((select (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'ia_ou_direto'), '4 · receber direto escolhido');
  update public.nx_canais set codewords_rota = 'fluxo', ia_ligada = false, codewords_service_id = 'svc-15' where id = cw;
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((select not (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'ia_ou_direto'), '4 · fluxo com a IA desligada não vale');
  update public.nx_canais set ia_ligada = true where id = cw;
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((select (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'ia_ou_direto'), '4 · fluxo com service id + IA ligada + número conferido');
  -- 5 mensagem: nota interna e entrada não contam; saída enviada conta
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, direcao, tipo, corpo, status)
    values (cA, cv, ct, 'out', 'nota', 'só equipe', 'enviada');
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((select not (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'mensagem_teste'), '5 · nota interna não é mensagem enviada');
  perform public.nx_cv_saida(k_ad, cA, cv, jsonb_build_object('tipo', 'texto', 'corpo', 'Teste do Órbita', 'status', 'enviada', 'wamid', 'wamid.15.' || sfx || '.t'));
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((select (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'mensagem_teste'), '5 · mensagem enviada');
  -- 6 departamento com horário
  update public.nx_departamentos set horario = null where cliente_id = cA;
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((select not (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'departamento_horario'), '6 · horário nulo (24 h) = ainda não configurado');
  insert into public.nx_departamentos (cliente_id, nome, padrao, horario) values (cA, 'Recepção 15', not exists (select 1 from public.nx_departamentos where cliente_id = cA and padrao),
    '{"0":[],"1":[["08:00","18:00"]],"2":[["08:00","18:00"]],"3":[["08:00","18:00"]],"4":[["08:00","18:00"]],"5":[["08:00","18:00"]],"6":[]}'::jsonb) returning id into dep;
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((select (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'departamento_horario'), '6 · departamento com horário');
  -- 7 agenda: o departamento padrão com horário já a configura (fonte "departamento"); só o padrão do sistema não vale
  perform pg_temp.ok((select (x ->> 'feito')::boolean = (public.nx_agenda_cfg(cA) ->> 'horario_fonte' <> 'padrao') from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'agenda_faixas'),
    '7 · agenda: fonte diferente de "padrao"');
  insert into public.nx_agenda_config (cliente_id, horario) values (cA, '{"0":[],"1":[["09:00","17:00"]],"2":[],"3":[],"4":[],"5":[],"6":[]}'::jsonb)
    on conflict (cliente_id) do update set horario = excluded.horario;
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((select (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'agenda_faixas'), '7 · faixas da agenda');
  -- 8 script do site: visita registrada só conta quando virou contato
  insert into public.nx_rastreio (cliente_id, codigo, utm_source) values (cA, '23456', 'google');
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((select not (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'script_site'), '8 · visita sem contato ainda não vale');
  update public.nx_rastreio set usado_em = now(), telefone = '5512998301501' where cliente_id = cA and codigo = '23456';
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((select (x ->> 'feito')::boolean and (x ->> 'ultimo_em') is not null from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'script_site'), '8 · site com contato recebido (e a data do último)');
  perform pg_temp.ok((j ->> 'obrigatorios_feitos')::int = (j ->> 'feitos')::int - 1, '8 · o script do site conta no total, não nos obrigatórios');
  -- 9 colega: acesso novo OU convite válido
  perform pg_temp.ok((select not (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'colega_convidado'), '9 · só o admin: ninguém convidado');
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_col, cA, 'atendente');
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((select (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'colega_convidado'), '9 · colega com acesso');
  delete from public.nx_acessos where conta_id = k_col;
  v_org := (select org_id from public.nx_clientes where id = cA);
  if v_org is null then insert into public.nx_orgs (slug, nome, tipo) values ('org-15-' || sfx, 'Org 15', 'revenda') returning id into v_org; end if;
  insert into public.nx_convites (token_hash, org_id, cliente_id, papel, expira_em)
    values (public.nx_hash('conv-15-' || sfx), v_org, cA, 'atendente', now() + interval '3 days');
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((select (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'colega_convidado'), '9 · convite válido conta');
  -- 10 funil: sai do modelo quando muda o número de funis/etapas (genérico: 1 funil, 7 etapas)
  perform pg_temp.ok((select not (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'funil_ajustado'), '10 · funil do modelo ainda não conta');
  insert into public.nx_funis (cliente_id, nome, ordem) values (cA, 'Pós-tratamento 15', 99);
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((select (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'funil_ajustado'), '10 · funil ajustado');
  -- 11 anúncios (opcional)
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((j ->> 'obrigatorios_feitos')::int = 9 and (j ->> 'completo')::boolean and (j ->> 'pct')::int = 100 and (j ->> 'feitos')::int = 10,
    'tenant pronto SEM anúncios: 9 de 9 obrigatórios = 100 % (completo), 10 de 11 no total');
  insert into public.nx_integracoes (cliente_id, canal, ativo, cred) values (cA, 'meta', true, '{"token":"segredo-que-nunca-deve-aparecer"}'::jsonb);
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((j ->> 'feitos')::int = 11 and (j ->> 'total')::int = 11 and (j ->> 'pct')::int = 100, 'tenant PRONTO: 11 de 11, 100 %');
  perform pg_temp.ok(position('segredo-que-nunca' in j::text) = 0, 'nunca devolve segredo (só existe/não existe)');
  perform pg_temp.ok(position(cw::text || '-' in j::text) = 0 and position('cwk-' in j::text) = 0, 'sem chave nem token na resposta');
  -- empresa sem site: sem o contato do script o checklist continua completo (o item é opcional)
  update public.nx_rastreio set usado_em = null where cliente_id = cA;
  j := public.nx_onboarding_estado(tAd, cA);
  perform pg_temp.ok((select not (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'script_site')
                 and (j ->> 'completo')::boolean and (j ->> 'pct')::int = 100 and (j ->> 'obrigatorios_feitos')::int = 9 and (j ->> 'feitos')::int = 10,
    'sem script do site: 9 de 9 obrigatórios, continua 100 % (completo)');
  -- isolamento: o que A configurou não aparece para B
  j := public.nx_onboarding_estado(tB, cB);
  perform pg_temp.ok((j ->> 'feitos')::int = 1, 'B continua com só a mensagem dele (nada de A vaza)');

  -- vertical odonto: o modelo semeia a Recepção com horário e dois funis — itens 6 e 7 já vêm prontos, o 10 só quando muda
  declare cOd uuid; kOd uuid; tOd text := 'tok-15-od-' || sfx;
  begin
    insert into public.nx_clientes (slug, nome, vertical) values ('teste-15-o-' || sfx, 'Teste 15 Odonto', 'odonto') returning id into cOd;
    insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-15-od-' || sfx || '@teste.local', 'Olga', 'x', 'clinica', true) returning id into kOd;
    insert into public.nx_acessos (conta_id, cliente_id, papel) values (kOd, cOd, 'admin');
    insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(tOd), kOd, now() + interval '1 hour');
    j := public.nx_onboarding_estado(tOd, cOd);
    perform pg_temp.ok((select (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'departamento_horario'), 'odonto: a Recepção do modelo já tem horário');
    perform pg_temp.ok((select not (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'funil_ajustado'), 'odonto: 2 funis e 12 etapas = modelo, ainda não ajustado');
    perform pg_temp.ok((j ->> 'feitos')::int = 2, 'odonto novo: 2 de 11 (horário da recepção e agenda herdando dele)');
    insert into public.nx_estagios (cliente_id, funil_id, nome, ordem, tipo) values (cOd, (select id from public.nx_funis where cliente_id = cOd and padrao), 'Etapa nova 15', 99, 'aberto');
    j := public.nx_onboarding_estado(tOd, cOd);
    perform pg_temp.ok((select (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'funil_ajustado'), 'odonto: etapa a mais = funil ajustado');
  end;

  -- cliente ANTIGO (cadastrado há 30 dias) com o modelo intacto: o funil foi semeado bem depois do cadastro, mas ninguém mexeu nele.
  -- A referência é o PRIMEIRO funil do cliente, não a data do cadastro: o passo não pode aparecer como feito.
  declare cAn uuid; kAn uuid; tAn text := 'tok-15-an-' || sfx;
  begin
    insert into public.nx_clientes (slug, nome, vertical, criado_em) values ('teste-15-n-' || sfx, 'Teste 15 Antigo', 'odonto', now() - interval '30 days') returning id into cAn;
    insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-15-an-' || sfx || '@teste.local', 'Nair', 'x', 'clinica', true) returning id into kAn;
    insert into public.nx_acessos (conta_id, cliente_id, papel) values (kAn, cAn, 'admin');
    insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(tAn), kAn, now() + interval '1 hour');
    perform pg_temp.ok((select min(f.criado_em) from public.nx_funis f where f.cliente_id = cAn) > (select criado_em + interval '1 hour' from public.nx_clientes where id = cAn),
      'cliente antigo: o modelo foi semeado mais de 1 hora depois do cadastro (o caso das empresas que já existiam)');
    j := public.nx_onboarding_estado(tAn, cAn);
    perform pg_temp.ok((select not (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'funil_ajustado'),
      'cliente antigo com o modelo intacto: funil_ajustado = false');
    -- etapa criada mais de 1 hora depois do primeiro funil (mesma quantidade de etapas): aí sim alguém mexeu
    update public.nx_estagios set criado_em = now() + interval '2 hours'
     where id = (select e.id from public.nx_estagios e where e.cliente_id = cAn order by e.id limit 1);
    j := public.nx_onboarding_estado(tAn, cAn);
    perform pg_temp.ok((select (x ->> 'feito')::boolean from jsonb_array_elements((j::jsonb) -> 'itens') x where x ->> 'id' = 'funil_ajustado'),
      'cliente antigo: etapa criada depois do modelo = funil ajustado');
  end;

  raise exception 'OK_15_CLIENT_REF_ONBOARDING — todos os casos passaram';
end $t$;
rollback;
