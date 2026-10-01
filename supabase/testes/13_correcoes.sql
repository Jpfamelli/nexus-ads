-- ============================================================
-- ÓRBITA — supabase/testes/13_correcoes.sql
-- Smoke do arquivo 20261001b_correcoes.sql (rodada de testes de 01/10/2026, 10 lentes).
-- Roda pelo execute_sql DEPOIS de todas as migrações (a…h, 29a, 29b, 30c–e, 20261001a e 20261001b).
-- TUDO em begin … rollback: nada fica no banco. Cada caso roda no próprio sub-bloco: um caso que falha (ou lança)
-- é anotado e os outros continuam; no fim, se algum falhou, a execução termina em exceção
-- 'FALHOU (n): caso 1 | caso 2 …' (lista TODOS). Sem falha, termina em rollback silencioso.
-- Chaves e números sintéticos; nada chama o CodeWords/Meta/Anthropic.
-- Antes da 20261001b este arquivo falha nos casos novos (é o teste que "falharia antes").
-- ============================================================
begin;

create temp table t13_falhas (caso text);

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
  if not coalesce(p, false) then insert into t13_falhas values (p_caso); end if;
end $f$;

create or replace function pg_temp.falha(p_caso text) returns void language plpgsql as $f$
begin
  insert into t13_falhas values (p_caso);
end $f$;

-- o cron de produção (a cada 15 s) pode estar com a trava do motor: tenta de novo
create or replace function pg_temp.lote(p_max int default 100) returns json language plpgsql as $f$
declare j json;
begin
  for i in 1 .. 40 loop
    j := public.nx_auto_lote(p_max);
    if coalesce((j ->> 'ocupado')::boolean, false) is false then return j; end if;
    perform pg_sleep(0.25);
  end loop;
  raise exception 'motor ocupado por 10 s';
end $f$;

-- roda UMA automação (já salva) para um alvo, como o motor (sem esperar o evento)
create or replace function pg_temp.rodar(p_auto uuid, p_ref jsonb, p_chave text, p_evento bigint default null) returns text language plpgsql as $f$
declare a public.nx_automacoes;
begin
  select * into a from public.nx_automacoes where id = p_auto;
  return public.nx_auto_rodar(a, p_ref, p_chave, p_evento, 0, p_evento is null);
end $f$;

-- detalhe da execução de uma chave
create or replace function pg_temp.det(p_auto uuid, p_chave text) returns text language sql as $f$
  select coalesce(x.detalhe, '') || ' [' || x.ok::text || '/' || coalesce(x.estado, '-') || ']'
    from public.nx_auto_execucoes x where x.automacao_id = p_auto and x.chave = p_chave
$f$;

do $t$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  cA uuid; cB uuid; cC uuid; k_adm uuid; k_at uuid; k_admB uuid; k_ger uuid;
  tA text := 'tok-13-adm-' || sfx; tAt text := 'tok-13-at-' || sfx; tB text := 'tok-13-admb-' || sfx; tG text := 'tok-13-ger-' || sfx;
  chave_teste text := 'cwk-teste-sintetica-' || md5(random()::text);
  j json; jb jsonb; e text; n int; x boolean; s text; r json;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_qua date; kCW uuid; f_pac uuid; s_nova uuid; s_agend uuid; s_fechou uuid; dep_rec uuid; org_p uuid;
  ct1 bigint; ct2 bigint; ct3 bigint; ct4 bigint; ct5 bigint; ctB bigint; ctC bigint;
  l1 bigint; l2 bigint; l3 bigint; l4 bigint; l5 bigint; l6 bigint; lB bigint;
  cv1 bigint; cv2 bigint; cv3 bigint; cv4 bigint;
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; a5 uuid; a6 uuid; a7 uuid; a8 uuid; a9 uuid;
  rr text; ev bigint; ped bigint; v_lote uuid; fi bigint; u0 int; ccv bigint;
begin
  -- ---------------------------------------------------------- fixtures
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-13-a-' || sfx, 'Clínica 13 A', 'odonto') returning id into cA;
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-13-b-' || sfx, 'Clínica 13 B', 'odonto') returning id into cB;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-13-adm-' || sfx || '@teste.local', 'Ana Admin 13', 'x', 'clinica', true) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-13-at-' || sfx || '@teste.local', 'Beto Atende 13', 'x', 'clinica', true) returning id into k_at;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-13-admb-' || sfx || '@teste.local', 'Dora Admin B 13', 'x', 'clinica', true) returning id into k_admB;
  select id into org_p from public.nx_orgs where tipo = 'plataforma' limit 1;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('teste-13-ger-' || sfx || '@teste.local', 'Gina Gestora 13', 'x', 'gestor', true, org_p) returning id into k_ger;
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas, departamentos, recebe_conversas) values
    (k_adm, cA, 'admin', true, '{}', false), (k_at, cA, 'atendente', false, '{}', false), (k_admB, cB, 'admin', true, '{}', false);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash(tA), k_adm, now() + interval '1 hour'), (public.nx_hash(tAt), k_at, now() + interval '1 hour'),
    (public.nx_hash(tB), k_admB, now() + interval '1 hour'), (public.nx_hash(tG), k_ger, now() + interval '1 hour');

  select id into f_pac from public.nx_funis where cliente_id = cA and padrao;
  select id into s_nova from public.nx_estagios where funil_id = f_pac and marco = 'nova';
  select id into s_agend from public.nx_estagios where funil_id = f_pac and marco = 'agendada';
  select id into s_fechou from public.nx_estagios where funil_id = f_pac and marco = 'fechou';
  select id into dep_rec from public.nx_departamentos where cliente_id = cA and padrao;

  j := public.nx_codewords_canal_salvar(tA, cA, jsonb_build_object('nome', 'WhatsApp 13', 'numero', '+5512991230013', 'codewords_api_key', chave_teste));
  kCW := (j -> 'canal' ->> 'id')::uuid;
  update public.nx_canais set codewords_phone_id = 'ph-13-' || sfx where id = kCW;   -- aparelho «pareado»

  v_qua := hoje + 3; while extract(dow from v_qua) <> 3 loop v_qua := v_qua + 1; end loop;

  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Ana Um', '12991310001') returning id into ct1;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Beto Dois', '12991310002') returning id into ct2;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Carla Três', '12991310003') returning id into ct3;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Duda Quatro', '12991310004') returning id into ct4;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cB, 'Bruna do B', '12991310099') returning id into ctB;

  -- ============================================================ 1. nx_cv_ver devolve o provedor (alta)
  begin
    cv1 := public.nx_auto_abrir_conversa(cA, ct1, kCW, null, 'T13');
    j := public.nx_cv_ver(tA, cA, cv1);
    perform pg_temp.ok(j -> 'conversa' -> 'canal' ->> 'provedor' = 'codewords', 'nx_cv_ver: canal.provedor = codewords (' || (j -> 'conversa' ->> 'canal') || ')');
    perform pg_temp.ok((j -> 'conversa' -> 'canal' ->> 'ia_ligada') is not null and (j -> 'conversa' -> 'canal' ->> 'tem_token')::boolean,
                       'nx_cv_ver: canal.ia_ligada e tem_token do CodeWords');
  exception when others then perform pg_temp.falha('nx_cv_ver: ' || sqlerrm); end;

  -- ============================================================ 2. nx_auto_config_ok
  begin
    perform pg_temp.ok(public.nx_auto_config_ok('mensagem_recebida', '{}'::jsonb, '{"texto":"oi"}'::jsonb) is true, 'config_ok: mensagem_recebida sem palavras = toda mensagem');
    perform pg_temp.ok(public.nx_auto_config_ok('mensagem_recebida', jsonb_build_object('canal_id', kCW), jsonb_build_object('texto', 'oi', 'canal_id', kCW)) is true, 'config_ok: só canal, canal igual');
    perform pg_temp.ok(public.nx_auto_config_ok('mensagem_recebida', jsonb_build_object('canal_id', kCW), jsonb_build_object('texto', 'oi', 'canal_id', gen_random_uuid())) is false, 'config_ok: só canal, outro canal');
    perform pg_temp.ok(public.nx_auto_config_ok('mensagem_recebida', '{"palavras":[]}'::jsonb, '{"texto":"oi"}'::jsonb) is true, 'config_ok: palavras vazias');
    perform pg_temp.ok(public.nx_auto_config_ok('mensagem_recebida', '{"palavras":["implante"]}'::jsonb, '{"texto":"quanto custa o implante?"}'::jsonb) is true
                   and public.nx_auto_config_ok('mensagem_recebida', '{"palavras":["implante"]}'::jsonb, '{"texto":"oi"}'::jsonb) is false, 'config_ok: palavras continuam filtrando');
    -- filtro configurado + atributo ausente no evento = NÃO casa (antes devolvia NULL e o lote tratava como casa)
    perform pg_temp.ok(public.nx_auto_config_ok('conversa_nova', jsonb_build_object('departamento_id', dep_rec), '{"conversa_id":1}'::jsonb) is false, 'config_ok: departamento filtrado, conversa sem departamento = false (não NULL)');
    perform pg_temp.ok(public.nx_auto_config_ok('negocio_criado', jsonb_build_object('funil_id', f_pac), '{"negocio_id":1}'::jsonb) is false, 'config_ok: funil filtrado, negócio sem funil = false');
    perform pg_temp.ok(public.nx_auto_config_ok('negocio_estagio', jsonb_build_object('estagio_id', s_agend), '{"negocio_id":1}'::jsonb) is false, 'config_ok: etapa filtrada, evento sem etapa = false');
    perform pg_temp.ok(public.nx_auto_config_ok('etiqueta_adicionada', jsonb_build_object('etiqueta_id', gen_random_uuid()), '{"conversa_id":1}'::jsonb) is false, 'config_ok: etiqueta filtrada, evento sem etiqueta = false');
    -- motor real: mensagem recebida sem palavras roda
    j := public.nx_automacao_salvar(tA, cA, jsonb_build_object('nome', 'T13 toda mensagem', 'gatilho', 'mensagem_recebida', 'ativo', true,
      'acoes', '[{"tipo":"nota","texto":"T13 mensagem vista"}]'::jsonb));
    a1 := (j ->> 'id')::uuid;
    insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status)
    values (cA, cv1, ct1, kCW, 'in', 'texto', 'quanto custa o implante?', 'recebida');
    perform pg_temp.lote(100);
    perform pg_temp.ok((select execucoes from public.nx_automacoes where id = a1) = 1, 'motor: mensagem_recebida SEM palavras executou (' || (select execucoes from public.nx_automacoes where id = a1) || ')');
    update public.nx_automacoes set ativo = false where id = a1;
  exception when others then perform pg_temp.falha('config_ok: ' || sqlerrm); end;

  -- ============================================================ 3. ganho automático respeita o campo obrigatório
  begin
    insert into public.nx_campos (cliente_id, entidade, chave, rotulo, tipo, obrigatorio) values (cA, 'negocio', 't13_convenio', 'T13 Convênio', 'texto', true);
    j := public.nx_automacao_salvar(tA, cA, jsonb_build_object('nome', 'T13 fechar sozinho', 'gatilho', 'negocio_criado', 'ativo', false,
      'acoes', jsonb_build_array(jsonb_build_object('tipo', 'mover_estagio', 'estagio_id', s_fechou))));
    a2 := (j ->> 'id')::uuid;
    insert into public.nx_leads (cliente_id, contato_id, funil_id, valor_previsto, origem) values (cA, ct2, f_pac, 1234.56, 'whatsapp') returning id into l1;
    rr := pg_temp.rodar(a2, jsonb_build_object('negocio_id', l1), 't13:fechar:1');
    perform pg_temp.ok(rr = 'erro' and (select status from public.nx_leads where id = l1) = 'aberto'
                   and pg_temp.det(a2, 't13:fechar:1') like '%campo obrigatório%t13_convenio%', 'mover_estagio ganho com campo obrigatório vazio: erro e negócio aberto (' || rr || ' · ' || coalesce(pg_temp.det(a2, 't13:fechar:1'), '?') || ')');
    perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_mover(%L,%L,%s,%L)', tA, cA, l1, s_fechou)) = 'campo_obrigatorio|t13_convenio', 'o mover manual continua recusando');
    update public.nx_leads set campos = jsonb_build_object('t13_convenio', 'Unimed') where id = l1;
    rr := pg_temp.rodar(a2, jsonb_build_object('negocio_id', l1), 't13:fechar:2');
    perform pg_temp.ok(rr = 'ok' and (select status from public.nx_leads where id = l1) = 'ganho', 'com o campo preenchido a automação fecha o negócio (' || rr || ')');
    -- [] conta como vazio (campo multi obrigatório)
    insert into public.nx_campos (cliente_id, entidade, chave, rotulo, tipo, obrigatorio, opcoes) values (cA, 'negocio', 't13_multi', 'T13 Multi', 'multi', true, array['a', 'b']);
    insert into public.nx_leads (cliente_id, contato_id, funil_id, valor_previsto, origem, campos) values (cA, ct3, f_pac, 100, 'whatsapp', '{"t13_convenio":"x"}') returning id into l2;
    perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_mover(%L,%L,%s,%L,null,%L)', tA, cA, l2, s_fechou, '{"campos":{"t13_multi":[]}}')) = 'campo_obrigatorio|t13_multi', 'campo multi obrigatório com [] não passa');
    perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_mover(%L,%L,%s,%L,null,%L)', tA, cA, l2, s_fechou, '{"campos":{"t13_multi":["a"]}}')) = 'ok', 'campo multi obrigatório com [a] passa');
    update public.nx_campos set ativo = false where cliente_id = cA and chave in ('t13_convenio', 't13_multi');
  exception when others then perform pg_temp.falha('campo obrigatório: ' || sqlerrm); end;

  -- ============================================================ 4. campo_atualizar valida pelo tipo
  begin
    insert into public.nx_campos (cliente_id, entidade, chave, rotulo, tipo) values
      (cA, 'negocio', 't13_valor', 'T13 Valor', 'moeda'), (cA, 'negocio', 't13_link', 'T13 Link', 'url'),
      (cA, 'negocio', 't13_data', 'T13 Data', 'data'), (cA, 'negocio', 't13_num', 'T13 Num', 'numero');
    insert into public.nx_leads (cliente_id, contato_id, funil_id, valor_previsto, origem) values (cA, ct4, f_pac, 1234.56, 'whatsapp') returning id into l3;
    j := public.nx_automacao_salvar(tA, cA, jsonb_build_object('nome', 'T13 campo valor', 'gatilho', 'negocio_criado', 'ativo', false,
      'acoes', '[{"tipo":"campo_atualizar","campo":"t13_valor","valor":"{valor}"}]'::jsonb));
    a3 := (j ->> 'id')::uuid;
    rr := pg_temp.rodar(a3, jsonb_build_object('negocio_id', l3), 't13:valor:1');
    perform pg_temp.ok(rr = 'ok' and (select (campos ->> 't13_valor')::numeric from public.nx_leads where id = l3) = 1234.56, '{valor} «R$ 1.234,56» vira número no campo moeda (' || rr || ' · ' || coalesce(pg_temp.det(a3, 't13:valor:1'), '?') || ')');
    j := public.nx_automacao_salvar(tA, cA, jsonb_build_object('nome', 'T13 campo milhar', 'gatilho', 'negocio_criado', 'ativo', false,
      'acoes', '[{"tipo":"campo_atualizar","campo":"t13_num","valor":"1.500,50"}]'::jsonb));
    a4 := (j ->> 'id')::uuid;
    rr := pg_temp.rodar(a4, jsonb_build_object('negocio_id', l3), 't13:num:1');
    perform pg_temp.ok(rr = 'ok' and (select (campos ->> 't13_num')::numeric from public.nx_leads where id = l3) = 1500.50, '«1.500,50» vira 1500,5 (' || rr || ')');
    j := public.nx_automacao_salvar(tA, cA, jsonb_build_object('nome', 'T13 campo link', 'gatilho', 'negocio_criado', 'ativo', false,
      'acoes', '[{"tipo":"campo_atualizar","campo":"t13_link","valor":"javascript:alert(1)"}]'::jsonb));
    a5 := (j ->> 'id')::uuid;
    rr := pg_temp.rodar(a5, jsonb_build_object('negocio_id', l3), 't13:link:1');
    perform pg_temp.ok(rr = 'erro' and not (select campos ? 't13_link' from public.nx_leads where id = l3), 'link javascript: é recusado (' || rr || ')');
    j := public.nx_automacao_salvar(tA, cA, jsonb_build_object('nome', 'T13 campo data', 'gatilho', 'negocio_criado', 'ativo', false,
      'acoes', '[{"tipo":"campo_atualizar","campo":"t13_data","valor":"2026-13-45"}]'::jsonb));
    a6 := (j ->> 'id')::uuid;
    rr := pg_temp.rodar(a6, jsonb_build_object('negocio_id', l3), 't13:data:1');
    perform pg_temp.ok(rr = 'erro' and not (select campos ? 't13_data' from public.nx_leads where id = l3), 'data inexistente é recusada (' || rr || ')');
    update public.nx_automacoes set acoes = '[{"tipo":"campo_atualizar","campo":"t13_data","valor":"31/02/2026"}]'::jsonb where id = a6;
    rr := pg_temp.rodar(a6, jsonb_build_object('negocio_id', l3), 't13:data:2');
    perform pg_temp.ok(rr = 'erro' and not (select campos ? 't13_data' from public.nx_leads where id = l3), '31/02/2026 é recusado (' || rr || ')');
    update public.nx_automacoes set acoes = '[{"tipo":"campo_atualizar","campo":"t13_data","valor":"05/10/2026"}]'::jsonb where id = a6;
    rr := pg_temp.rodar(a6, jsonb_build_object('negocio_id', l3), 't13:data:3');
    perform pg_temp.ok(rr = 'ok' and (select campos ->> 't13_data' from public.nx_leads where id = l3) = '2026-10-05', 'data válida DD/MM/AAAA vira AAAA-MM-DD (' || rr || ')');
  exception when others then perform pg_temp.falha('campo_atualizar: ' || sqlerrm); end;

  -- ============================================================ 5. conversa resolvida: a mensagem não abre atendimento novo
  begin
    insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Eva Cinco', '12991310005') returning id into ct5;
    j := public.nx_automacao_salvar(tA, cA, jsonb_build_object('nome', 'T13 pesquisa ao resolver', 'gatilho', 'conversa_resolvida', 'ativo', true,
      'acoes', '[{"tipo":"enviar_mensagem","texto":"Como foi seu atendimento, {primeiro_nome}?"}]'::jsonb));
    a7 := (j ->> 'id')::uuid;
    cv2 := public.nx_auto_abrir_conversa(cA, ct5, kCW, null, 'T13');
    perform public.nx_cv_status(tA, cA, cv2, 'resolvida');
    perform pg_temp.lote(100);
    perform pg_temp.ok((select count(*) from public.nx_conversas where cliente_id = cA and contato_id = ct5) = 1,
      'conversa_resolvida + mensagem: NENHUM atendimento novo (' || (select count(*) from public.nx_conversas where cliente_id = cA and contato_id = ct5) || ' conversas)');
    perform pg_temp.ok(exists (select 1 from public.nx_envios_fila f where f.automacao_id = a7 and f.conversa_id = cv2 and f.texto like 'Como foi seu atendimento, Eva?'),
      'a pesquisa entra na fila NA conversa resolvida');
    update public.nx_automacoes set ativo = false where id = a7;
    -- follow-up de «conversa nova» processado depois de a equipe resolver: não reabre
    insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Fábio Seis', '12991310006') returning id into ct4;
    j := public.nx_automacao_salvar(tA, cA, jsonb_build_object('nome', 'T13 boas-vindas', 'gatilho', 'conversa_nova', 'ativo', true,
      'acoes', '[{"tipo":"enviar_mensagem","texto":"Olá, {primeiro_nome}!"}]'::jsonb));
    a8 := (j ->> 'id')::uuid;
    cv3 := public.nx_auto_abrir_conversa(cA, ct4, kCW, null, 'T13');
    perform public.nx_cv_status(tA, cA, cv3, 'resolvida');
    perform pg_temp.lote(100);
    perform pg_temp.ok((select count(*) from public.nx_conversas where cliente_id = cA and contato_id = ct4) = 1
                   and not exists (select 1 from public.nx_envios_fila f where f.automacao_id = a8),
                   'follow-up atrasado de conversa_nova NÃO reabre a conversa resolvida');
    perform pg_temp.ok(exists (select 1 from public.nx_auto_execucoes x where x.automacao_id = a8 and x.detalhe like '%a conversa já foi resolvida%'),
                   'o motivo fica na execução (' || coalesce((select string_agg(detalhe, ' / ') from public.nx_auto_execucoes where automacao_id = a8), '-') || ')');
    update public.nx_automacoes set ativo = false where id = a8;
  exception when others then perform pg_temp.falha('conversa resolvida: ' || sqlerrm); end;

  -- ============================================================ 6. mensagem com variável em branco é pulada
  begin
    j := public.nx_automacao_salvar(tA, cA, jsonb_build_object('nome', 'T13 confirmação', 'gatilho', 'negocio_criado', 'ativo', false,
      'acoes', '[{"tipo":"enviar_mensagem","texto":"Sua consulta está confirmada para {data_consulta}, às {hora_consulta}."}]'::jsonb));
    a9 := (j ->> 'id')::uuid;
    insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Gil Sete', '12991310007') returning id into ct1;
    insert into public.nx_leads (cliente_id, contato_id, funil_id, origem) values (cA, ct1, f_pac, 'whatsapp') returning id into l4;
    rr := pg_temp.rodar(a9, jsonb_build_object('negocio_id', l4), 't13:conf:1');
    perform pg_temp.ok(pg_temp.det(a9, 't13:conf:1') like '%pulada (a data da consulta não está marcada)%'
                   and not exists (select 1 from public.nx_envios_fila f where f.automacao_id = a9),
                   'sem consulta marcada: mensagem pulada com motivo (' || coalesce(pg_temp.det(a9, 't13:conf:1'), '?') || ')');
    update public.nx_leads set consulta_em = (v_qua + time '14:00') at time zone 'America/Sao_Paulo' where id = l4;
    rr := pg_temp.rodar(a9, jsonb_build_object('negocio_id', l4), 't13:conf:2');
    perform pg_temp.ok(exists (select 1 from public.nx_envios_fila f where f.automacao_id = a9
                                and f.texto = 'Sua consulta está confirmada para ' || to_char(v_qua, 'DD/MM') || ', às 14:00.'),
                   'com consulta marcada: sai com data e hora (' || coalesce((select string_agg(texto, ' / ') from public.nx_envios_fila where automacao_id = a9), '-') || ')');
  exception when others then perform pg_temp.falha('variável em branco: ' || sqlerrm); end;

  -- ============================================================ 7. tempo_no_estagio não repete depois de 60 dias
  begin
    j := public.nx_automacao_salvar(tA, cA, jsonb_build_object('nome', 'T13 parado', 'gatilho', 'tempo_no_estagio', 'ativo', false,
      'config', jsonb_build_object('estagio_id', s_nova, 'horas', 1), 'acoes', '[{"tipo":"nota","texto":"T13 parado"}]'::jsonb));
    a1 := (j ->> 'id')::uuid;
    insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Hugo Oito', '12991310008') returning id into ct2;
    insert into public.nx_leads (cliente_id, contato_id, funil_id, estagio_id, origem) values (cA, ct2, f_pac, s_nova, 'whatsapp') returning id into l5;
    update public.nx_leads set estagio_em = now() - interval '2 hours' where id = l5;
    select count(*) into n from public.nx_auto_alvos_tempo((select a from public.nx_automacoes a where a.id = a1), 10);
    perform pg_temp.ok(n = 1, 'tempo_no_estagio: parado há 2 h (prazo 1 h) é alvo (' || n || ')');
    update public.nx_leads set estagio_em = now() - interval '70 days' where id = l5;
    select count(*) into n from public.nx_auto_alvos_tempo((select a from public.nx_automacoes a where a.id = a1), 10);
    perform pg_temp.ok(n = 0, 'tempo_no_estagio: parado há 70 dias NÃO volta a casar (a chave de dedupe é apagada aos 60) (' || n || ')');
  exception when others then perform pg_temp.falha('tempo_no_estagio: ' || sqlerrm); end;

  -- ============================================================ 8. parar / contadores / resposta antes da sequência
  begin
    j := public.nx_automacao_salvar(tA, cA, jsonb_build_object('nome', 'T13 nota parar nota', 'gatilho', 'negocio_criado', 'ativo', false,
      'acoes', '[{"tipo":"nota","texto":"a"},{"tipo":"parar"},{"tipo":"nota","texto":"b"}]'::jsonb));
    a2 := (j ->> 'id')::uuid;
    rr := pg_temp.rodar(a2, jsonb_build_object('negocio_id', l5), 't13:parar:1');
    perform pg_temp.ok((select estado = 'parada' and passo = 2 and total_passos = 3 from public.nx_auto_execucoes where automacao_id = a2 and chave = 't13:parar:1'),
      'parada: «2 de 3» (o parar está no passo 2) (' || (select passo || '/' || total_passos from public.nx_auto_execucoes where automacao_id = a2 and chave = 't13:parar:1') || ')');
    -- a resposta do cliente entre o gatilho e o início da sequência cancela
    j := public.nx_automacao_salvar(tA, cA, jsonb_build_object('nome', 'T13 espera e nota', 'gatilho', 'negocio_criado', 'ativo', true,
      'acoes', '[{"tipo":"esperar","minutos":60,"cancelar_se_cliente_responder":true},{"tipo":"nota","texto":"ficou alguma dúvida?"}]'::jsonb));
    a3 := (j ->> 'id')::uuid;
    insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Iara Nove', '12991310009') returning id into ct3;
    insert into public.nx_leads (cliente_id, contato_id, funil_id, origem) values (cA, ct3, f_pac, 'whatsapp') returning id into l6;
    cv4 := public.nx_auto_abrir_conversa(cA, ct3, kCW, l6, 'T13');
    insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status, criado_em)
    values (cA, cv4, ct3, kCW, 'in', 'texto', 'ok, obrigada', 'recebida', now() + interval '2 seconds');
    perform pg_temp.lote(100);
    perform pg_temp.ok(exists (select 1 from public.nx_auto_execucoes x where x.automacao_id = a3 and x.estado = 'cancelada' and x.detalhe like 'Iara Nove:%o cliente respondeu%'),
      'resposta ENTRE o gatilho e a sequência cancela a espera (' || coalesce((select string_agg(estado, ',') from public.nx_auto_execucoes where automacao_id = a3), '-') || ')');
    update public.nx_automacoes set ativo = false where id = a3;
  exception when others then perform pg_temp.falha('parar/sequência: ' || sqlerrm); end;

  -- ============================================================ 9. IA: cliente bloqueado e contato de outro cliente
  begin
    j := public.nx_automacao_salvar(tA, cA, jsonb_build_object('nome', 'T13 IA resumo', 'gatilho', 'negocio_criado', 'ativo', true,
      'acoes', '[{"tipo":"ia_decidir","tarefa":"resumir_nota"}]'::jsonb));
    a4 := (j ->> 'id')::uuid;
    -- pedido pendente + sequência esperando a IA
    insert into public.nx_auto_ia_pedidos (cliente_id, automacao_id, tarefa, alvo, status)
    values (cA, a4, 'resumir_nota', jsonb_build_object('negocio_id', l5, 'contato_id', ct2), 'pendente') returning id into ped;
    insert into public.nx_auto_execucoes (automacao_id, cliente_id, chave, ok, detalhe, estado, passo, total_passos)
    values (a4, cA, 't13:ia:1', true, 'x: IA pedida', 'aguardando_ia', 1, 1);
    insert into public.nx_auto_sequencias (automacao_id, cliente_id, chave, contato_id, alvo, acoes, passo, status, pedido_id)
    select a4, cA, 't13:ia:1', ct2, jsonb_build_object('negocio_id', l5, 'contato_id', ct2), acoes, 1, 'aguardando_ia', ped from public.nx_automacoes where id = a4;
    update public.nx_clientes set status = 'suspenso' where id = cA;
    j := public.nx_auto_ia_pegar(ped, 5);
    perform pg_temp.ok(json_array_length(j) = 0 and (select status from public.nx_auto_ia_pedidos where id = ped) = 'cancelado'
                   and (select status from public.nx_auto_sequencias where chave = 't13:ia:1' and automacao_id = a4) = 'cancelada',
      'cliente suspenso: o pedido da IA é cancelado sem gastar cota (' || j::text || ')');
    update public.nx_clientes set status = 'ativo' where id = cA;
    update public.nx_automacoes set ativo = false where id = a4;
    -- resumo com contato de OUTRO cliente é recusado
    update public.nx_automacoes set ativo = true where id = a4;
    insert into public.nx_auto_ia_pedidos (cliente_id, automacao_id, tarefa, alvo, status, tentativas, pego_em)
    values (cA, a4, 'resumir_nota', jsonb_build_object('negocio_id', l5, 'contato_id', ctB), 'processando', 1, now()) returning id into ped;
    insert into public.nx_auto_execucoes (automacao_id, cliente_id, chave, ok, detalhe, estado, passo, total_passos)
    values (a4, cA, 't13:ia:2', true, 'x: IA pedida', 'aguardando_ia', 1, 1);
    insert into public.nx_auto_sequencias (automacao_id, cliente_id, chave, contato_id, alvo, acoes, passo, status, pedido_id)
    select a4, cA, 't13:ia:2', ctB, jsonb_build_object('negocio_id', l5, 'contato_id', ctB), acoes, 1, 'aguardando_ia', ped from public.nx_automacoes where id = a4;
    j := public.nx_auto_ia_resolver(ped, '{"texto":"resumo"}'::jsonb);
    perform pg_temp.ok((j ->> 'ok')::boolean is false and not exists (select 1 from public.nx_notas where cliente_id = cA and contato_id = ctB),
      'resumo com contato de outro cliente: recusado e sem nota cruzada (' || j::text || ')');
    update public.nx_automacoes set ativo = false where id = a4;
  exception when others then perform pg_temp.falha('IA: ' || sqlerrm); end;

  -- ============================================================ 10. tarefa só para quem tem acesso ao cliente
  begin
    insert into public.nx_automacoes (cliente_id, nome, gatilho, acoes, ativo)
    values (cA, 'T13 tarefa para estranho', 'negocio_criado',
            jsonb_build_array(jsonb_build_object('tipo', 'criar_tarefa', 'titulo', 'T13 tarefa', 'dono', k_admB, 'vence_em_horas', 2)), false) returning id into a5;
    rr := pg_temp.rodar(a5, jsonb_build_object('negocio_id', l5), 't13:tarefa:1');
    perform pg_temp.ok(rr = 'ok' and exists (select 1 from public.nx_tarefas t where t.automacao_id = a5 and t.dono_id is null and t.cliente_id = cA),
      'criar_tarefa com dono sem acesso ao cliente vira tarefa sem responsável (' || rr || ' · ' || coalesce(pg_temp.det(a5, 't13:tarefa:1'), '?') || ')');
    update public.nx_automacoes set acoes = jsonb_build_array(jsonb_build_object('tipo', 'criar_tarefa', 'titulo', 'T13 tarefa 2', 'dono', k_adm, 'vence_em_horas', 2)) where id = a5;
    rr := pg_temp.rodar(a5, jsonb_build_object('negocio_id', l5), 't13:tarefa:2');
    perform pg_temp.ok(exists (select 1 from public.nx_tarefas t where t.automacao_id = a5 and t.dono_id = k_adm and t.titulo = 'T13 tarefa 2'), 'com acesso, a tarefa continua indo para a pessoa');
  exception when others then perform pg_temp.falha('criar_tarefa: ' || sqlerrm); end;

  -- ============================================================ 11. normalizar: listas enormes e automação que não faz nada
  begin
    e := pg_temp.erro(format('select public.nx_automacao_salvar(%L,%L,%L)', tA, cA, '{"nome":"x","gatilho":"negocio_criado","acoes":[{"tipo":"parar"}]}'));
    perform pg_temp.ok(e = 'automacao_invalida|acrescente pelo menos um passo que faça algo, além de esperar ou parar', 'só «parar» é recusado: ' || e);
    e := pg_temp.erro(format('select public.nx_automacao_salvar(%L,%L,%L)', tA, cA, '{"nome":"x","gatilho":"negocio_criado","acoes":[{"tipo":"esperar","minutos":5},{"tipo":"parar"}]}'));
    perform pg_temp.ok(e = 'automacao_invalida|acrescente pelo menos um passo que faça algo, além de esperar ou parar', '«esperar» + «parar» é recusado: ' || e);
    e := pg_temp.erro(format('select public.nx_automacao_salvar(%L,%L,%L)', tA, cA,
      (select jsonb_build_object('nome', 'x', 'gatilho', 'mensagem_recebida', 'config', jsonb_build_object('palavras', jsonb_agg('p' || g)),
                                 'acoes', '[{"tipo":"nota","texto":"a"}]'::jsonb)::text from generate_series(1, 150000) g)));
    perform pg_temp.ok(e = 'automacao_invalida|use até 20 palavras', '150 mil palavras: recusado na hora: ' || left(e, 80));
    e := pg_temp.erro(format('select public.nx_automacao_salvar(%L,%L,%L)', tA, cA,
      (select jsonb_build_object('nome', 'x', 'gatilho', 'agendado', 'config', jsonb_build_object('horario', '09:00', 'dias_semana', jsonb_agg(g % 7)),
                                 'acoes', '[{"tipo":"nota","texto":"a"}]'::jsonb)::text from generate_series(1, 150000) g)));
    perform pg_temp.ok(e like 'automacao_invalida|%', '150 mil dias da semana: recusado: ' || left(e, 80));
  exception when others then perform pg_temp.falha('normalizar: ' || sqlerrm); end;

  -- ============================================================ 12. CRM: telefone, busca, contato embutido, data da consulta
  begin
    perform pg_temp.ok(public.nx_tel_normalizar('(012) 99777-3031') = '5512997773031' and public.nx_tel_normalizar('0 12 99777-3030') = '5512997773030'
                   and public.nx_tel_normalizar('012 9777-3030') = '551297773030', 'telefone: zero de tronco sai e entra o 55');
    perform pg_temp.ok(public.nx_tel_normalizar('+1 415 555 2671') = '14155552671' and public.nx_tel_normalizar('+55 12 99777-3030') = '5512997773030'
                   and public.nx_tel_normalizar('12 99777-3030') = '5512997773030', 'telefone: «+» é DDI informado; sem «+» continua com 55');
    insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Dupla', '5512997773030');
    e := pg_temp.erro(format('select public.nx_contato_salvar(%L,%L,%L)', tA, cA, '{"nome":"Outro","telefone":"0 12 99777-3030"}'));
    perform pg_temp.ok(e like 'telefone_em_uso%', 'telefone com zero de tronco deduplica com o contato existente: ' || e);
    -- busca do kanban sem o 9º dígito
    insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Nove Dígito', '5512970000002') returning id into ct4;
    insert into public.nx_leads (cliente_id, contato_id, funil_id, estagio_id, origem) values (cA, ct4, f_pac, s_nova, 'whatsapp');
    j := public.nx_negocios_kanban(tA, cA, f_pac, jsonb_build_object('busca', '12 7000 0002'));
    perform pg_temp.ok((j::jsonb -> 'colunas' -> 0 ->> 'total')::int = 1, 'kanban: busca sem o 9 acha o contato gravado com o 9 (' || (j::jsonb -> 'colunas' -> 0 ->> 'total') || ')');
    j := public.nx_negocios_kanban(tA, cA, f_pac, jsonb_build_object('busca', '12 9 7000 0002'));
    perform pg_temp.ok((j::jsonb -> 'colunas' -> 0 ->> 'total')::int = 1, 'kanban: busca com o 9 continua achando');
    -- contato embutido sem responsável
    j := public.nx_negocio_salvar(tA, cA, jsonb_build_object('contato', jsonb_build_object('nome', 'Sem Dono', 'telefone', '12991310010'),
      'dono_id', null, 'titulo', 'T13 sem dono'));
    perform pg_temp.ok((j::jsonb -> 'negocio' ->> 'dono_id') is null and (select dono_id from public.nx_contatos where cliente_id = cA and telefone = '5512991310010') is null,
      '«Sem responsável»: o contato embutido também fica sem dono (' || (select coalesce(dono_id::text, 'nulo') from public.nx_contatos where cliente_id = cA and telefone = '5512991310010') || ')');
    j := public.nx_negocio_salvar(tA, cA, jsonb_build_object('contato', jsonb_build_object('nome', 'Com Dono', 'telefone', '12991310011'), 'titulo', 'T13 com dono'));
    perform pg_temp.ok((select dono_id from public.nx_contatos where cliente_id = cA and telefone = '5512991310011') = k_adm, 'sem a chave dono_id: o contato fica com quem criou');
    -- nx_crm_ts: data pura é meia-noite de São Paulo
    perform pg_temp.ok(public.nx_crm_ts('{"t":"2026-10-06"}'::jsonb, 't') = '2026-10-06 03:00:00+00'::timestamptz
                   and public.nx_crm_ts('{"t":"2026-10-06T10:00"}'::jsonb, 't') = '2026-10-06 13:00:00+00'::timestamptz
                   and public.nx_crm_ts('{"t":"2026-10-06T10:00:00Z"}'::jsonb, 't') = '2026-10-06 10:00:00+00'::timestamptz
                   and public.nx_crm_ts('{"t":"2026-10-06T10:00:00-03:00"}'::jsonb, 't') = '2026-10-06 13:00:00+00'::timestamptz, 'nx_crm_ts: data pura = 00:00 SP; com hora/fuso continua igual');
  exception when others then perform pg_temp.falha('CRM: ' || sqlerrm); end;

  -- ============================================================ 13. agenda: consulta do CRM fora da agenda avisa; apagar a hora; ganho ocupa
  begin
    insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Agenda Um', '12991320001') returning id into ct1;
    insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Agenda Dois', '12991320002') returning id into ct2;
    insert into public.nx_leads (cliente_id, contato_id, funil_id, origem) values (cA, ct1, f_pac, 'whatsapp') returning id into l1;
    insert into public.nx_leads (cliente_id, contato_id, funil_id, origem) values (cA, ct2, f_pac, 'whatsapp') returning id into l2;
    -- livre e dentro do expediente: sem aviso
    j := public.nx_negocio_mover(tA, cA, l1, s_agend, null, jsonb_build_object('consulta_em', to_char(v_qua, 'YYYY-MM-DD') || 'T10:00'));
    perform pg_temp.ok((j::jsonb ->> 'aviso_agenda') is null and not exists (select 1 from public.nx_notas where negocio_id = l1 and texto like 'Atenção: consulta%'),
      'consulta livre dentro do expediente: sem aviso (' || coalesce(j::jsonb ->> 'aviso_agenda', 'nulo') || ')');
    -- mesmo horário, outro negócio: ocupado
    j := public.nx_negocio_mover(tA, cA, l2, s_agend, null, jsonb_build_object('consulta_em', to_char(v_qua, 'YYYY-MM-DD') || 'T10:00'));
    perform pg_temp.ok(j::jsonb ->> 'aviso_agenda' = 'horario_ocupado' and exists (select 1 from public.nx_notas where negocio_id = l2 and texto like 'Atenção: consulta marcada pelo CRM%ocupado%'),
      'mesmo horário já ocupado: aviso + nota (' || coalesce(j::jsonb ->> 'aviso_agenda', 'nulo') || ')');
    -- fora do expediente (salvar)
    j := public.nx_negocio_salvar(tA, cA, jsonb_build_object('id', l2, 'consulta_em', to_char(v_qua, 'YYYY-MM-DD') || 'T22:30'));
    perform pg_temp.ok(j::jsonb ->> 'aviso_agenda' = 'fora_do_horario', 'salvar às 22:30: fora_do_horario (' || coalesce(j::jsonb ->> 'aviso_agenda', 'nulo') || ')');
    -- passado
    j := public.nx_negocio_salvar(tA, cA, jsonb_build_object('id', l2, 'consulta_em', to_char(hoje - 2, 'YYYY-MM-DD') || 'T10:00'));
    perform pg_temp.ok(j::jsonb ->> 'aviso_agenda' = 'passado', 'salvar no passado: aviso passado (' || coalesce(j::jsonb ->> 'aviso_agenda', 'nulo') || ')');
    -- apagar a «Data e hora» apaga a data da consulta (negócio aberto)
    perform pg_temp.ok((select data_consulta from public.nx_leads where id = l1) = v_qua, 'a data da consulta acompanha a hora');
    j := public.nx_negocio_salvar(tA, cA, jsonb_build_object('id', l1, 'consulta_em', null));
    perform pg_temp.ok((select consulta_em is null and data_consulta is null from public.nx_leads where id = l1), 'consulta_em = null apaga a data da consulta também');
    -- ganho com consulta futura ocupa o horário
    perform public.nx_negocio_salvar(tA, cA, jsonb_build_object('id', l1, 'consulta_em', to_char(v_qua, 'YYYY-MM-DD') || 'T15:00'));
    perform pg_temp.ok(public.nx_agenda_checar(cA, ((v_qua + time '15:00') at time zone 'America/Sao_Paulo'), null, l1, false) is null
                   and public.nx_agenda_checar(cA, ((v_qua + time '15:00') at time zone 'America/Sao_Paulo'), null, l2, false) = 'horario_ocupado', 'aberto às 15:00: ocupa o horário (ou o próprio negócio o libera)');
    perform public.nx_negocio_mover(tA, cA, l1, s_fechou, null, '{"valor":500}'::jsonb);
    perform pg_temp.ok((select status from public.nx_leads where id = l1) = 'ganho'
                   and public.nx_agenda_checar(cA, ((v_qua + time '15:00') at time zone 'America/Sao_Paulo'), null, l2, false) = 'horario_ocupado',
      'negócio GANHO com consulta futura continua ocupando o horário (' || coalesce(public.nx_agenda_checar(cA, ((v_qua + time '15:00') at time zone 'America/Sao_Paulo'), null, l2, false), 'livre') || ')');
    -- livres: duração do serviço do negócio quando o pedido não diz o serviço
    perform public.nx_agenda_config_salvar(tA, cA, '{"duracao_min":30,"capacidade":1,"antecedencia_horas":2,"dias_a_frente":30,"duracoes":{"Limpeza":60}}');
    update public.nx_leads set servico = 'Limpeza' where id = l2;
    j := public.nx_agenda_livres(tA, cA, v_qua, 1, null, l2);
    perform pg_temp.ok((j::jsonb ->> 'duracao_min')::int = 60 and (j::jsonb ->> 'truncado')::boolean is false, 'livres: sem serviço no pedido vale o do negócio (60 min) (' || (j::jsonb ->> 'duracao_min') || ')');
    -- hint do início inválido
    perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_marcar(%L,%L,%s,%L)', tA, cA, l2, 'lixo')) = 'dados_invalidos|inicio', 'início inválido: hint «inicio»');
  exception when others then perform pg_temp.falha('agenda: ' || sqlerrm); end;

  -- ============================================================ 14. nx_dados: teste vencido lê; erro_envio dos alertas
  begin
    update public.nx_clientes set status = 'teste', teste_ate = hoje - 2 where id = cA;
    insert into public.nx_alertas (cliente_id, chave, regra, severidade, mensagem, referencia, erro_envio)
    values (cA, 't13-chave', 'r13', 'info', 'T13', hoje, 'nenhum número de destino cadastrado');
    j := public.nx_dados(tA, cA);
    perform pg_temp.ok(j::jsonb -> 'alertas' -> 0 ->> 'erro_envio' = 'nenhum número de destino cadastrado', 'nx_dados: alertas trazem o erro_envio');
    perform pg_temp.ok(pg_temp.erro(format('select public.nx_dados(%L,%L)', tAt, cA)) = 'sem_permissao', 'atendente continua sem ler o Ads (sem_permissao)');
    update public.nx_clientes set status = 'ativo', teste_ate = null where id = cA;
  exception when others then perform pg_temp.falha('nx_dados: ' || sqlerrm); end;

  -- ============================================================ 15. fila: lote devolvido; envio incerto deixa rastro
  begin
    insert into public.nx_envios_fila (cliente_id, conversa_id, contato_id, canal_id, tipo, texto, origem, enviar_em)
    values (cA, cv1, ct1, kCW, 'texto', 'T13 fila 1', 'automacao', now() - interval '1 minute') returning id into fi;
    v_lote := gen_random_uuid();
    perform set_config('request.headers', jsonb_build_object('x-fila-lote', v_lote)::text, true);   -- o que o PostgREST entrega
    j := public.nx_fila_pegar(100, array[fi]);
    perform set_config('request.headers', '', true);
    perform pg_temp.ok(json_array_length(j) = 1 and (select f.status = 'enviando' and f.lote = v_lote and f.tentativas = 1 from public.nx_envios_fila f where f.id = fi), 'nx_fila_pegar: marca o lote do cabeçalho x-fila-lote');
    n := public.nx_fila_devolver_lote(v_lote);
    perform pg_temp.ok(n = 1 and (select status = 'pendente' and tentativas = 0 and pego_em is null from public.nx_envios_fila where id = fi), 'nx_fila_devolver_lote: volta para a fila sem gastar tentativa (' || n || ')');
    n := public.nx_fila_devolver_lote(v_lote);
    perform pg_temp.ok(n = 0, 'devolver duas vezes não mexe em nada');
    -- envio incerto: vira falhou E deixa mensagem de sistema na conversa
    update public.nx_envios_fila set status = 'enviando' where id = fi;
    update public.nx_envios_fila set pego_em = now() - interval '20 minutes' where id = fi;
    perform public.nx_fila_chamar();
    perform pg_temp.ok((select status from public.nx_envios_fila where id = fi) = 'falhou'
                   and exists (select 1 from public.nx_mensagens m where m.conversa_id = cv1 and m.tipo = 'sistema' and m.corpo like '%envio confirmado%'),
      'STATUS INCERTO: falhou na fila e ganha mensagem de sistema na conversa');
  exception when others then perform pg_temp.falha('fila: ' || sqlerrm); end;

  -- ============================================================ 16. limites do plano
  begin
    -- (a) canal pelo wa_phone_number_id respeita o limite de canais
    insert into public.nx_clientes (slug, nome, vertical) values ('teste-13-c-' || sfx, 'Clínica 13 C', 'odonto') returning id into cC;
    update public.nx_clientes set limites = '{"canais":1}'::jsonb where id = cC;
    insert into public.nx_canais (cliente_id, nome, provedor, phone_number_id, status) values (cC, 'Já existe', 'meta', 't13-pid-' || sfx, 'pendente');
    e := pg_temp.erro(format('update public.nx_clientes set wa_phone_number_id = %L where id = %L', 't13-outro-' || sfx, cC));
    perform pg_temp.ok(e like 'limite_plano%', 'wa_phone_number_id estoura o limite de canais: ' || e);
    -- (b) contato criado pelo lead conta no limite de contatos
    select count(*) into n from public.nx_contatos where cliente_id = cA;
    update public.nx_clientes set limites = jsonb_build_object('contatos', n) where id = cA;
    e := pg_temp.erro(format('select public.nx_lead_salvar(%L,%L,%L)', tA, cA, '{"nome":"Novo","telefone":"12977770099","origem":"manual"}'));
    perform pg_temp.ok(e like 'limite_plano%', 'nx_lead_salvar com telefone novo estoura o limite de contatos: ' || e);
    update public.nx_clientes set limites = '{}'::jsonb where id in (cA, cC);
    u0 := public.nx_uso_org((select org_id from public.nx_clientes where id = cA), 'usuarios');
    -- (c) uso da revenda = o que o limite conta (convite de gestor não ocupa vaga; convite de cliente ocupa)
    insert into public.nx_convites (token_hash, org_id, cliente_id, papel, expira_em)
    values (public.nx_hash('t13-conv-g-' || sfx), (select org_id from public.nx_clientes where id = cA), null, 'gestor', now() + interval '1 day');
    perform pg_temp.ok(public.nx_uso_org((select org_id from public.nx_clientes where id = cA), 'usuarios') = u0, 'nx_uso_org: convite de gestor NÃO conta como usuário');
    insert into public.nx_convites (token_hash, org_id, cliente_id, papel, expira_em)
    values (public.nx_hash('t13-conv-c-' || sfx), (select org_id from public.nx_clientes where id = cA), cA, 'atendente', now() + interval '1 day');
    perform pg_temp.ok(public.nx_uso_org((select org_id from public.nx_clientes where id = cA), 'usuarios') = u0 + 1, 'nx_uso_org: convite de cliente conta como usuário');
  exception when others then perform pg_temp.falha('limites: ' || sqlerrm); end;

  -- ============================================================ 17. convites, contas, domínios, cfg, login
  begin
    -- revogar duas vezes
    select id into a1 from public.nx_convites where cliente_id = cA and papel = 'atendente' order by criado_em desc limit 1;
    e := pg_temp.erro(format('select public.nx_convite_revogar(%L,%L,%L)', tA, cA, a1));
    perform pg_temp.ok(e = 'ok', 'revogar convite: primeira vez ok (' || e || ')');
    e := pg_temp.erro(format('select public.nx_convite_revogar(%L,%L,%L)', tA, cA, a1));
    perform pg_temp.ok(e = 'dados_invalidos|convite', 'revogar de novo: dados_invalidos|convite (' || e || ')');
    perform pg_temp.ok((select count(*) from public.nx_auditoria where cliente_id = cA and acao = 'convite_revogado') = 1, 'uma só linha de auditoria da revogação');
    -- domínio com rótulo de 64
    e := pg_temp.erro(format('select public.nx_dominio_salvar(%L,%L)', tG, repeat('a', 64) || '.t13-rotulo.example.com'));
    perform pg_temp.ok(e = 'dominio_invalido', 'domínio com rótulo de 64 caracteres: ' || e);
    e := pg_temp.erro(format('select public.nx_dominio_salvar(%L,%L)', tG, repeat('a', 63) || '.t13-rotulo.example.com'));
    perform pg_temp.ok(e = 'ok', 'domínio com rótulo de 63 caracteres passa: ' || e);
    -- nx_conta_definir audita
    perform public.nx_conta_definir(tG, k_at, true, 'clinica', array[cA]);
    perform pg_temp.ok(exists (select 1 from public.nx_auditoria where acao = 'conta_definida' and (dados ->> 'conta')::uuid = k_at), 'nx_conta_definir grava auditoria');
    -- cfg do cliente validado no servidor
    e := pg_temp.erro(format('select public.nx_cliente_salvar(%L,%L)', tG, jsonb_build_object('id', cA, 'cfg', jsonb_build_object('regrasOff', 5))::text));
    perform pg_temp.ok(e = 'dados_invalidos|regrasOff', 'cfg.regrasOff como número é recusado: ' || e);
    e := pg_temp.erro(format('select public.nx_cliente_salvar(%L,%L)', tG, jsonb_build_object('id', cA, 'cfg', jsonb_build_object('cpaAlvo', -5))::text));
    perform pg_temp.ok(e = 'dados_invalidos|cpaAlvo', 'cfg.cpaAlvo negativo é recusado: ' || e);
    e := pg_temp.erro(format('select public.nx_cliente_salvar(%L,%L)', tG, jsonb_build_object('id', cA, 'cfg', jsonb_build_object('ticket', jsonb_build_object('Limpeza', 'abc')))::text));
    perform pg_temp.ok(e = 'dados_invalidos|ticket', 'cfg.ticket com texto é recusado: ' || e);
    e := pg_temp.erro(format('select public.nx_cliente_salvar(%L,%L)', tG, jsonb_build_object('id', cA, 'cfg', jsonb_build_object('cpaAlvo', 18.5, 'orcamento', 2000,
      'ticket', jsonb_build_object('Limpeza', 250), 'regrasOff', jsonb_build_array('x'), 'waGestor', jsonb_build_array('5512999998888')))::text));
    perform pg_temp.ok(e = 'ok', 'cfg correto continua salvando: ' || e);
    -- login: e-mail inexistente e senha errada dão o mesmo erro; senha certa entra
    update public.nx_contas set senha_hash = extensions.crypt('senha-13-teste', extensions.gen_salt('bf', 10)) where id = k_adm;
    e := pg_temp.erro(format('select public.nx_entrar(%L,%L)', 'teste-13-adm-' || sfx || '@teste.local', 'errada'));
    perform pg_temp.ok(e = 'credenciais_invalidas', 'senha errada: credenciais_invalidas');
    e := pg_temp.erro(format('select public.nx_entrar(%L,%L)', 'nao-existe-13-' || sfx || '@teste.local', 'qualquer'));
    perform pg_temp.ok(e = 'credenciais_invalidas', 'e-mail inexistente: o mesmo erro');
    e := pg_temp.erro(format('select public.nx_entrar(%L,%L)', 'teste-13-adm-' || sfx || '@teste.local', 'senha-13-teste'));
    perform pg_temp.ok(e = 'ok', 'senha certa entra: ' || e);
  exception when others then perform pg_temp.falha('contas/cfg/login: ' || sqlerrm); end;

  -- ============================================================ 18. permissões das funções novas
  begin
    perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_fila_devolver_lote(uuid)', 'execute')
                   and not has_function_privilege('authenticated', 'public.nx_fila_devolver_lote(uuid)', 'execute')
                   and has_function_privilege('service_role', 'public.nx_fila_devolver_lote(uuid)', 'execute')
                   and not has_function_privilege('anon', 'public.nx_crm_vazio(jsonb)', 'execute')
                   and not has_function_privilege('anon', 'public.nx_uso_org(uuid,text)', 'execute')
                   and not has_function_privilege('anon', 'public.nx_auto_variavel_vazia(text,jsonb)', 'execute')
                   and not has_function_privilege('anon', 'public.nx_crm_aviso_agenda(uuid,bigint,uuid)', 'execute')
                   and not has_function_privilege('anon', 'public.nx_cfg_validar(jsonb)', 'execute'),
      'funções novas só service_role');
    perform pg_temp.ok((select schedule from cron.job where jobname = 'nx-automacoes') is not null
                   and (select command from cron.job where jobname = 'nx-automacoes') like '%nx_auto_lote(100)%', 'cron nx-automacoes com 100 por rodada');
  exception when others then perform pg_temp.falha('permissões: ' || sqlerrm); end;

  select count(*) into n from t13_falhas;
  if n > 0 then
    raise exception 'FALHOU (%): %', n, (select string_agg(caso, ' | ' order by caso) from t13_falhas);
  end if;
end $t$;

rollback;
