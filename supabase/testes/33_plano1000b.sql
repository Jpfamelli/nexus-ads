-- ============================================================
-- ÓRBITA — supabase/testes/33_plano1000b.sql · smoke de 20261015a_plano1000b.sql (plano 1000b, frente srv)
--   CB-005/CB-269 DDD 29 · UB-212 atualizado_por · UB-211 edicao_desatualizada · UB-217 mensagens_30d · UB-213/214 busca, desde
--   e filtradas · UB-216 campanha/plataforma · UB-219 tarefa_vencida filtrada · AB-007/009/121 rastreio (evento, confirmação,
--   contagens, ttclid/msclkid/utm_id) · RB-256 concluídas por período · CB-209 origem · CB-205/CB-272 empate na divisa da página ·
--   CB-206/207 busca nas mensagens · CB-208 marcar não lida · CB-203/CB-271 nx_cv_base por papel · CB-211 agenda · UB-223 marca
--   anterior · B-002/B-024/B-029 colunas e índices · permissões
-- Roda em begin … rollback; termina em raise exception 'OK_33_PLANO1000B — …'.
-- ============================================================
begin;
create or replace function pg_temp.ok(p boolean, p_caso text) returns void language plpgsql as $f$
begin
  if not coalesce(p, false) then raise exception 'FALHOU: %', p_caso; end if;
end $f$;
create or replace function pg_temp.erro(p_sql text) returns text language plpgsql as $f$
declare m text; h text; s text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics m = message_text, h = pg_exception_hint, s = returned_sqlstate;
  return m || coalesce('|' || nullif(h, ''), '') || '|' || s;
end $f$;

do $t$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  org_p uuid; cA uuid; k_adm uuid; k_at uuid; kM uuid; dep uuid; aut uuid; aut_tv uuid; a public.nx_automacoes;
  t_adm text := 'tok-33-adm-' || sfx;
  t_at text := 'tok-33-at-' || sfx;
  ch text := encode(extensions.gen_random_bytes(24), 'hex');
  ctA bigint; ctS bigint; ctC bigint; cv1 bigint; cv2 bigint; cv3 bigint; cvAt bigint; cvS bigint; l1 bigint; l2 bigint;
  m1 bigint; m2 bigint; tf1 bigint; tf2 bigint; v_ts timestamptz := now() - interval '5 minutes';
  j json; jb jsonb; jb2 jsonb; n int; v_cod text; v_txt text;
begin
  perform pg_temp.ok(exists (select 1 from public.nx_versao_banco where nome = '20261015a_plano1000b'), 'versão registrada');
  select id into org_p from public.nx_orgs where tipo = 'plataforma' limit 1;
  insert into public.nx_clientes (slug, nome, org_id, vertical, status, entrada_chave) values ('t33-' || sfx, 'Teste 33', org_p, 'odonto', 'ativo', ch) returning id into cA;
  update public.nx_clientes set modulos = array(select distinct unnest(coalesce(modulos, '{}'::text[]) || array['crm', 'conversas', 'automacoes', 'ads', 'marca'])),
                                cfg = coalesce(cfg, '{}'::jsonb) || '{"ia": {"assistente_nome": "Clara"}}'::jsonb
   where id = cA;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t33-adm-' || sfx || '@teste.local', 'Admin Trinta', 'x', 'clinica', true, org_p) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t33-at-' || sfx || '@teste.local', 'Atendente Trinta', 'x', 'clinica', true, org_p) returning id into k_at;
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas) values (k_adm, cA, 'admin', true), (k_at, cA, 'atendente', true);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(t_adm), k_adm, now() + interval '1 hour'),
                                                                          (public.nx_hash(t_at), k_at, now() + interval '1 hour');
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor) values (cA, 'Meta 33', 'pn-33-' || sfx, 'meta') returning id into kM;

  -- ---------------------------------------------------------- CB-005 / CB-269
  perform pg_temp.ok(not public.nx_ddd_valido('29'), 'DDD 29 não existe');
  perform pg_temp.ok(public.nx_ddd_valido('21') and public.nx_ddd_valido('22') and public.nx_ddd_valido('24') and public.nx_ddd_valido('27')
                 and public.nx_ddd_valido('28') and public.nx_ddd_valido('11') and public.nx_ddd_valido('99'), 'DDDs 21/22/24/27/28 (e 11, 99) valem');

  -- ---------------------------------------------------------- UB-212 / UB-211
  j := public.nx_automacao_salvar(t_adm, cA, '{"nome":"Auto 33","gatilho":"negocio_criado","acoes":[{"tipo":"nota","texto":"oi"}]}'::jsonb);
  aut := (j ->> 'id')::uuid;
  perform pg_temp.ok((j ->> 'atualizado_por')::uuid = k_adm and j ->> 'atualizado_por_nome' = 'Admin Trinta', 'UB-212: salvar devolve quem mudou');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_automacao_salvar(%L, %L, %L::jsonb, %L::timestamptz)', t_adm, cA,
           jsonb_build_object('id', aut, 'nome', 'Auto 33b', 'gatilho', 'negocio_criado', 'acoes', '[{"tipo":"nota","texto":"oi"}]'::jsonb),
           now() - interval '1 day')) like 'edicao_desatualizada|____-__-__T%Z|22023', 'UB-211: versão antiga → edicao_desatualizada (hint com a atual)');
  j := public.nx_automacao_salvar(t_adm, cA, jsonb_build_object('id', aut, 'nome', 'Auto 33c', 'gatilho', 'negocio_criado', 'acoes', '[{"tipo":"nota","texto":"oi"}]'::jsonb),
         (select atualizado_em from public.nx_automacoes where id = aut));
  perform pg_temp.ok(j ->> 'nome' = 'Auto 33c', 'UB-211: versão certa salva');
  j := public.nx_automacao_salvar(t_adm, cA, jsonb_build_object('id', aut, 'nome', 'Auto 33d', 'gatilho', 'negocio_criado', 'acoes', '[{"tipo":"nota","texto":"oi"}]'::jsonb));
  perform pg_temp.ok(j ->> 'nome' = 'Auto 33d', 'UB-211: sem p_atualizado_em salva como antes');
  update public.nx_automacoes set atualizado_por = null where id = aut;
  j := public.nx_automacao_ativar(t_adm, cA, aut, false);
  perform pg_temp.ok((j ->> 'atualizado_por')::uuid = k_adm, 'UB-212: ativar/desativar grava quem');

  -- ---------------------------------------------------------- UB-217 mensagens_30d
  insert into public.nx_envios_fila (cliente_id, tipo, texto, origem, automacao_id, status, criado_em)
    values (cA, 'texto', 'a', 'automacao', aut, 'enviado', now() - interval '1 day'), (cA, 'texto', 'b', 'automacao', aut, 'enviado', now() - interval '2 days'),
           (cA, 'texto', 'c', 'automacao', aut, 'falhou', now()), (cA, 'texto', 'd', 'automacao', aut, 'enviado', now() - interval '40 days');
  j := public.nx_automacoes_listar(t_adm, cA);
  perform pg_temp.ok((select (x ->> 'mensagens_30d')::int from json_array_elements(j -> 'itens') x where (x ->> 'id')::uuid = aut) = 2,
    'UB-217: mensagens_30d conta só as enviadas nos últimos 30 dias');

  -- ---------------------------------------------------------- UB-213 / UB-214
  insert into public.nx_contatos (cliente_id, nome, telefone, origem) values (cA, 'Bianca Trinta', '5512990033001', 'anuncio') returning id into ctA;
  insert into public.nx_leads (cliente_id, nome, contato_id, origem, plataforma, campanha_ext) values (cA, 'Implante Bianca', ctA, 'anuncio', 'meta', 'c33') returning id into l1;
  insert into public.nx_auto_execucoes (automacao_id, cliente_id, chave, ok, detalhe) values (aut, cA, 'te:' || l1, true, 'feito');
  insert into public.nx_auto_execucoes (automacao_id, cliente_id, chave, ok, detalhe) values (aut, cA, 'xx:filtrada', true, 'Condições não atendidas — nada feito.');
  insert into public.nx_auto_execucoes (automacao_id, cliente_id, chave, ok, detalhe, criado_em) values (aut, cA, 'xx:velha', true, 'feito', now() - interval '10 days');
  j := public.nx_automacao_execucoes(t_adm, cA, aut, 50);
  perform pg_temp.ok(json_array_length(j) = 2 and not exists (select 1 from json_array_elements(j) x where x ->> 'chave' = 'xx:filtrada'), 'UB-214: sem p_filtradas, como antes');
  j := public.nx_automacao_execucoes(t_adm, cA, aut, 50, null, null, true);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j) x where x ->> 'chave' = 'xx:filtrada' and x ->> 'estado' = 'filtrada'), 'UB-214: p_filtradas traz as filtradas (estado filtrada)');
  j := public.nx_automacao_execucoes(t_adm, cA, aut, 50, 'bian');
  perform pg_temp.ok(json_array_length(j) = 1 and (j -> 0 ->> 'chave') = 'te:' || l1, 'UB-213: busca pelo nome do contato');
  j := public.nx_automacao_execucoes(t_adm, cA, aut, 50, 'implante');
  perform pg_temp.ok(json_array_length(j) = 1, 'UB-213: busca pelo negócio');
  j := public.nx_automacao_execucoes(t_adm, cA, aut, 50, '%');
  perform pg_temp.ok(json_array_length(j) = 0, 'UB-213: % é literal, não curinga');
  j := public.nx_automacao_execucoes(t_adm, cA, aut, 50, null, now() - interval '1 day');
  perform pg_temp.ok(json_array_length(j) = 1, 'UB-213: p_desde corta a antiga');

  -- ---------------------------------------------------------- UB-216 campanha / plataforma
  insert into public.nx_metricas_dia (cliente_id, plataforma, nivel, data, campanha_ext, campanha_nome, anuncio_ext, impressoes, cliques, gasto, conversoes)
    values (cA, 'meta', 'campanha', current_date - 1, 'c33', 'Promo Implante 33', '', 100, 5, 10, 1);
  jb := public.nx_auto_normalizar(cA, '{"nome":"x","gatilho":"negocio_criado","condicoes":[{"campo":"campanha","op":"contem","valor":"implante"},{"campo":"plataforma","op":"igual","valor":"Meta"}],"acoes":[{"tipo":"nota","texto":"oi"}]}'::jsonb);
  perform pg_temp.ok(jb -> 'condicoes' -> 1 ->> 'valor' = 'meta' and jb -> 'condicoes' -> 0 ->> 'campo' = 'campanha', 'UB-216: normalizar aceita campanha e plataforma (minúscula)');
  perform pg_temp.ok(pg_temp.erro($q$select public.nx_auto_normalizar(gen_random_uuid(), '{"nome":"x","gatilho":"negocio_criado","condicoes":[{"campo":"plataforma","op":"igual","valor":"tiktok"}],"acoes":[{"tipo":"nota","texto":"oi"}]}'::jsonb)$q$)
                 like 'automacao_invalida|condição 1: escolha a plataforma%', 'UB-216: plataforma fora de Meta/Google recusada');
  perform pg_temp.ok(pg_temp.erro($q$select public.nx_auto_normalizar(gen_random_uuid(), '{"nome":"x","gatilho":"negocio_criado","condicoes":[{"campo":"campanha","op":"igual","valor":"a"}],"acoes":[{"tipo":"nota","texto":"oi"}]}'::jsonb)$q$)
                 like 'automacao_invalida|condição 1: para a campanha use%', 'UB-216: campanha só com contém/não contém');
  jb2 := public.nx_auto_dados(cA, jsonb_build_object('negocio_id', l1, 'contato_id', ctA));
  perform pg_temp.ok(public.nx_auto_condicoes(jb -> 'condicoes', jb2), 'UB-216: «campanha contém implante» (nome da métrica) e «plataforma é meta» passam');
  perform pg_temp.ok(not public.nx_auto_cond_ok('{"campo":"plataforma","op":"igual","valor":"google"}'::jsonb, jb2)
                 and public.nx_auto_cond_ok('{"campo":"campanha","op":"contem","valor":"c33"}'::jsonb, jb2)
                 and not public.nx_auto_cond_ok('{"campo":"campanha","op":"contem","valor":"clareamento"}'::jsonb, jb2)
                 and public.nx_auto_cond_ok('{"campo":"campanha","op":"vazio"}'::jsonb, '{}'::jsonb), 'UB-216: plataforma diferente, campanha pelo id, outra campanha, vazio');

  -- ---------------------------------------------------------- UB-219 tarefa_vencida com filtros
  jb := public.nx_auto_normalizar(cA, jsonb_build_object('nome', 'tv', 'gatilho', 'tarefa_vencida', 'config', jsonb_build_object('tipo_tarefa', 'ligacao', 'dono_id', k_adm),
          'acoes', '[{"tipo":"nota","texto":"oi"}]'::jsonb));
  perform pg_temp.ok(jb -> 'config' ->> 'tipo_tarefa' = 'ligacao' and (jb -> 'config' ->> 'dono_id')::uuid = k_adm, 'UB-219: config guarda tipo e pessoa');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_auto_normalizar(%L, %L::jsonb)', cA, '{"nome":"tv","gatilho":"tarefa_vencida","config":{"tipo_tarefa":"fax"},"acoes":[{"tipo":"nota","texto":"oi"}]}'))
                 like 'automacao_invalida|escolha o tipo de tarefa%', 'UB-219: tipo inválido recusado');
  perform pg_temp.ok((public.nx_auto_normalizar(cA, '{"nome":"tv","gatilho":"tarefa_vencida","acoes":[{"tipo":"nota","texto":"oi"}]}'::jsonb) -> 'config') = '{}'::jsonb,
    'UB-219: sem filtros, config vazia (como antes)');
  insert into public.nx_automacoes (cliente_id, nome, gatilho, config, acoes) values (cA, 'TV 33', 'tarefa_vencida', jb -> 'config', jb -> 'acoes') returning * into a;
  insert into public.nx_tarefas (cliente_id, tipo, titulo, vence_em, dono_id) values (cA, 'ligacao', 'ligar', now() - interval '1 hour', k_adm) returning id into tf1;
  insert into public.nx_tarefas (cliente_id, tipo, titulo, vence_em, dono_id) values (cA, 'whatsapp', 'zap', now() - interval '1 hour', k_adm);
  insert into public.nx_tarefas (cliente_id, tipo, titulo, vence_em, dono_id) values (cA, 'ligacao', 'outra pessoa', now() - interval '1 hour', k_at);
  perform pg_temp.ok((select array_agg(x.chave) from public.nx_auto_alvos_tempo(a, 50) x) = array['tv:' || tf1], 'UB-219: só a ligação vencida da pessoa escolhida');
  update public.nx_automacoes set config = '{}'::jsonb where id = a.id returning * into a;
  perform pg_temp.ok((select count(*) from public.nx_auto_alvos_tempo(a, 50) x) = 3, 'UB-219: sem filtro, as três (como antes)');

  -- ---------------------------------------------------------- AB-007/008/009/121 rastreio
  j := public.nx_rastreio_registrar(ch, '{"evento":"aquecimento","utm_source":"tiktok","utm_id":"cmp-33","ttclid":"TT.33_x","pagina":"https://clinica.test/implante"}'::jsonb);
  v_cod := j ->> 'codigo';
  perform pg_temp.ok((j ->> 'eventos')::boolean and v_cod ~ '^[A-HJKMNP-Z2-9]{5}$', 'AB-007: resposta com eventos:true');
  perform pg_temp.ok(exists (select 1 from public.nx_rastreio r where r.cliente_id = cA and r.codigo = v_cod and r.evento = 'aquecimento'
                              and r.ttclid = 'TT.33_x' and r.utm_id = 'cmp-33'), 'AB-007/AB-121: aquecimento gravado com ttclid e utm_id');
  perform pg_temp.ok((public.nx_rastreio_plataforma((select r from public.nx_rastreio r where r.cliente_id = cA and r.codigo = v_cod)) ->> 'origem') = 'anuncio',
    'AB-121: ttclid é clique de anúncio');
  j := public.nx_rastreio_registrar(ch, jsonb_build_object('evento', 'clique', 'confirmar', v_cod, 'pagina', 'https://clinica.test/implante'));
  perform pg_temp.ok(j ->> 'codigo' = v_cod and (j ->> 'confirmado')::boolean, 'AB-007: confirmação devolve o mesmo código');
  perform pg_temp.ok((select count(*) from public.nx_rastreio r where r.cliente_id = cA) = 1
                 and (select r.evento from public.nx_rastreio r where r.cliente_id = cA and r.codigo = v_cod) = 'clique', 'AB-007: a MESMA linha vira clique (nenhuma nova)');
  j := public.nx_rastreio_registrar(ch, jsonb_build_object('evento', 'clique', 'confirmar', v_cod));
  perform pg_temp.ok(not (j ->> 'confirmado')::boolean, 'AB-007: confirmar de novo não muda nada');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_rastreio_registrar(%L, %L::jsonb)', ch, '{"evento":"clique","confirmar":"ab;--"}')) = 'dados_invalidos|confirmar|22023',
    'AB-007: código de confirmação inválido');
  perform public.nx_rastreio_registrar(ch, '{"evento":"aquecimento"}'::jsonb);
  perform public.nx_rastreio_registrar(ch, '{"utm_source":"google"}'::jsonb);   -- site antigo (v1): sem evento
  j := public.nx_rastreio_listar(t_adm, cA, 30);
  perform pg_temp.ok((j -> 'totais' ->> 'cliques')::int = 2 and (j -> 'totais' ->> 'cliques_reais')::int = 2 and (j -> 'totais' ->> 'registros')::int = 3,
    'AB-009: cliques = clique + antigos; registros = todos');
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'itens') x where x ->> 'evento' = 'aquecimento'), 'AB-009: itens[].evento');
  j := public.nx_lead_entrada(ch, '{"nome":"Lia 33","telefone":"5512990033009","msclkid":"MS-33","utm_id":"u-33"}'::jsonb);
  perform pg_temp.ok(exists (select 1 from public.nx_leads l where l.cliente_id = cA and l.nome = 'Lia 33' and l.origem = 'anuncio'
                              and l.rastreio ->> 'msclkid' = 'MS-33' and l.rastreio ->> 'utm_id' = 'u-33' and l.obs like '%msclkid%'),
    'AB-121: formulário com msclkid/utm_id → anúncio, no rastreio e na observação');

  -- ---------------------------------------------------------- RB-256 concluídas por período
  insert into public.nx_tarefas (cliente_id, titulo, dono_id, concluida_em, negocio_id) values (cA, 'feita há 3 dias', k_adm, now() - interval '3 days', l1),
                                                                                          (cA, 'feita há 20 dias', k_adm, now() - interval '20 days', l1);
  jb := public.nx_tarefas_listar(t_adm, cA, '{"situacao":"concluidas"}')::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb -> 'itens') = 1 and (jb ->> 'concluidas_dias')::int = 7, 'RB-256: padrão 7 dias');
  perform pg_temp.ok(jsonb_array_length(public.nx_tarefas_listar(t_adm, cA, '{"situacao":"concluidas","concluidas_dias":30}')::jsonb -> 'itens') = 2, 'RB-256: 30 dias');
  perform pg_temp.ok(jsonb_array_length(public.nx_tarefas_listar(t_adm, cA, '{"situacao":"concluidas","concluidas_dias":0}')::jsonb -> 'itens') = 2, 'RB-256: 0 = todas');
  perform pg_temp.ok(jsonb_array_length(public.nx_tarefas_listar(t_adm, cA, jsonb_build_object('situacao', 'concluidas', 'negocio_id', l1))::jsonb -> 'itens') = 2,
    'RB-256: na gaveta do negócio, todas (como antes)');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_tarefas_listar(%L, %L, %L::jsonb)', t_adm, cA, '{"situacao":"concluidas","concluidas_dias":999}')) = 'dados_invalidos|concluidas_dias|22023',
    'RB-256: fora de 0–366 recusado');

  -- ---------------------------------------------------------- CB-209 origem · CB-205/CB-272 empate na divisa
  insert into public.nx_contatos (cliente_id, nome, telefone, origem) values (cA, 'Sara Site', '5512990033002', 'site') returning id into ctS;
  insert into public.nx_contatos (cliente_id, nome, telefone, origem) values (cA, 'Caio Trinta', '5512990033003', 'whatsapp') returning id into ctC;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, ultima_msg_em) values (cA, kM, ctA, 'p33a' || sfx, 'aberta', v_ts) returning id into cv1;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, ultima_msg_em) values (cA, kM, ctS, 'p33b' || sfx, 'aberta', v_ts) returning id into cv2;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, ultima_msg_em) values (cA, kM, ctC, 'p33c' || sfx, 'aberta', v_ts) returning id into cv3;
  jb := public.nx_cv_listar(t_adm, cA, '{"aba":"abertas","origem":"anuncio"}'::jsonb)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb -> 'itens') = 1 and (jb -> 'itens' -> 0 ->> 'id')::bigint = cv1, 'CB-209: filtro pela origem do contato');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_listar(%L, %L, %L::jsonb)', t_adm, cA, '{"origem":"tiktok"}')) = 'dados_invalidos|origem|22023', 'CB-209: origem inválida');
  jb := public.nx_cv_listar(t_adm, cA, '{"aba":"abertas"}'::jsonb, 2)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb -> 'itens') = 2 and (jb ->> 'tem_mais')::boolean, 'CB-272: página 1 com 2 de 3 (mesmo horário)');
  jb2 := public.nx_cv_listar(t_adm, cA, jsonb_build_object('aba', 'abertas', 'antes_id', jb -> 'itens' -> 1 ->> 'id'), 2, v_ts)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb2 -> 'itens') = 1 and not (jb2 ->> 'tem_mais')::boolean
                 and (jb2 -> 'itens' -> 0 ->> 'id')::bigint not in ((jb -> 'itens' -> 0 ->> 'id')::bigint, (jb -> 'itens' -> 1 ->> 'id')::bigint),
    'CB-205/CB-272: página 2 (p_antes + p_filtro.antes_id) traz a 3ª, sem repetir nem pular');

  -- ---------------------------------------------------------- CB-206/CB-207 busca nas mensagens
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status, origem, enviado_por)
    values (cA, cv1, ctA, kM, 'out', 'texto', 'orçamento trinta e três A', 'enviada', 'painel', k_adm) returning id into m1;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status, origem)
    values (cA, cv1, ctA, kM, 'out', 'texto', 'orçamento trinta e três B', 'enviada', 'ia') returning id into m2;
  j := public.nx_cv_buscar_msgs(t_adm, cA, 'trinta e três', 1);
  perform pg_temp.ok(json_array_length(j) = 1 and (j -> 0 ->> 'mensagem_id')::bigint = m2 and j -> 0 ->> 'origem' = 'ia', 'CB-206: origem na busca');
  j := public.nx_cv_buscar_msgs(t_adm, cA, 'trinta e três', 1, m2);
  perform pg_temp.ok(json_array_length(j) = 1 and (j -> 0 ->> 'mensagem_id')::bigint = m1 and j -> 0 ->> 'enviado_por_nome' = 'Admin Trinta'
                 and j -> 0 ->> 'origem' = 'painel', 'CB-207/CB-206: p_antes_id traz a anterior, com o nome de quem enviou');

  -- ---------------------------------------------------------- CB-208 marcar não lida
  j := public.nx_cv_marcar_nao_lida(t_at, cA, cv2);
  perform pg_temp.ok((j ->> 'nao_lidas')::int = 1 and (select nao_lidas from public.nx_conversas where id = cv2) = 1, 'CB-208: conversa sem dono → não lida');
  update public.nx_conversas set atribuida_a = k_at, nao_lidas = 3 where id = cv3;
  j := public.nx_cv_marcar_nao_lida(t_at, cA, cv3);
  perform pg_temp.ok((j ->> 'nao_lidas')::int = 3, 'CB-208: dono; já com 3 não lidas, fica 3');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_marcar_nao_lida(%L, %L, %s)', t_adm, cA, cv3)) = 'sem_permissao|42501', 'CB-208: conversa de colega → sem_permissao');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_marcar_nao_lida(%L, %L, %s)', t_adm, cA, -1)) = 'conversa_nao_encontrada|22023', 'CB-208: conversa inexistente');

  -- ---------------------------------------------------------- CB-203/CB-204/CB-271 nx_cv_base por papel
  insert into public.nx_departamentos (cliente_id, nome) values (cA, 'Recepção 33') returning id into dep;
  jb := public.nx_cv_base(t_at, cA)::jsonb;
  perform pg_temp.ok(jb ->> 'ia_assistente_nome' = 'Clara', 'CB-203: atendente recebe o nome do assistente');
  perform pg_temp.ok(jsonb_typeof(jb -> 'config') = 'null', 'CB-271: config continua só para admin');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(jb -> 'departamentos') x where (x ->> 'id')::uuid = dep and x ? 'horario'), 'CB-204: horários em departamentos[] para todos');
  perform pg_temp.ok(public.nx_cv_base(t_adm, cA)::jsonb -> 'config' -> 'ia' ->> 'assistente_nome' = 'Clara', 'CB-203: admin continua com o config');

  -- ---------------------------------------------------------- CB-211 agenda
  insert into public.nx_metricas_dia (cliente_id, plataforma, nivel, data, campanha_ext, campanha_nome, anuncio_ext, anuncio_nome, impressoes, cliques, gasto, conversoes)
    values (cA, 'meta', 'anuncio', current_date - 1, 'c33', 'Promo Implante 33', 'a33', 'Vídeo 33', 10, 1, 1, 0);
  update public.nx_leads set consulta_em = (current_date + 1)::timestamp at time zone 'America/Sao_Paulo' + interval '10 hours', anuncio_ext = 'a33' where id = l1;
  insert into public.nx_leads (cliente_id, nome, contato_id, origem, plataforma, campanha_ext, consulta_em, rastreio)
    values (cA, 'Outra 33', ctS, 'site', null, null, (current_date + 1)::timestamp at time zone 'America/Sao_Paulo' + interval '11 hours', '{"utm_campaign":"boca-a-boca"}'::jsonb) returning id into l2;
  jb := public.nx_agenda_dia(t_adm, cA, current_date + 1, 1)::jsonb;
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(jb -> 'consultas') x where (x ->> 'negocio_id')::bigint = l1
                              and x ->> 'campanha_nome' = 'Promo Implante 33' and x ->> 'anuncio_nome' = 'Vídeo 33' and x ->> 'dono_nome' is null),
    'CB-211: campanha e anúncio pelo nome da métrica');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(jb -> 'consultas') x where (x ->> 'negocio_id')::bigint = l2 and x ->> 'campanha_nome' = 'boca-a-boca'),
    'CB-211: sem campanha conhecida, o utm_campaign (como antes)');
  perform pg_temp.ok(pg_get_functiondef('public.nx_agenda_dia(text,uuid,date,integer)'::regprocedure) like '%camp as (%', 'CB-211: nome resolvido por campanha (CTE)');

  -- ---------------------------------------------------------- UB-223 marca anterior
  j := public.nx_tema_salvar(t_adm, cA, '{"cores":{"primaria":"#112233"}}'::jsonb);
  j := public.nx_tema_salvar(t_adm, cA, '{"cores":{"primaria":"#445566"}}'::jsonb);
  perform pg_temp.ok(j -> 'tema_anterior' -> 'cores' ->> 'primaria' = '#112233', 'UB-223: salvar devolve a marca anterior');
  j := public.nx_tema_salvar(t_adm, cA, '{"cores":{"primaria":"#445566"}}'::jsonb);
  perform pg_temp.ok(j -> 'tema_anterior' -> 'cores' ->> 'primaria' = '#112233', 'UB-223: salvar a mesma marca não apaga a anterior');
  perform pg_temp.ok(public.nx_cliente_tema(t_at, cA) -> 'tema_anterior' -> 'cores' ->> 'primaria' = '#112233', 'UB-223: nx_cliente_tema devolve a anterior');

  -- ---------------------------------------------------------- B-002/B-024/B-029 e permissões
  perform pg_temp.ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'nx_alertas' and column_name = 'enviando_em'),
    'B-002: nx_alertas.enviando_em');
  perform pg_temp.ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'nx_alertas_nao_enviados')
                 and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'nx_ia_uso_criado')
                 and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'nx_fila_automacao'), 'B-024/B-029/UB-217: índices');
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_automacao_salvar(text,uuid,jsonb,timestamptz)', 'execute')
                 and has_function_privilege('anon', 'public.nx_automacao_execucoes(text,uuid,uuid,integer,text,timestamptz,boolean)', 'execute')
                 and has_function_privilege('anon', 'public.nx_cv_buscar_msgs(text,uuid,text,integer,bigint)', 'execute')
                 and has_function_privilege('anon', 'public.nx_cv_marcar_nao_lida(text,uuid,bigint)', 'execute')
                 and not has_function_privilege('authenticated', 'public.nx_cv_marcar_nao_lida(text,uuid,bigint)', 'execute')
                 and not has_function_privilege('authenticated', 'public.nx_automacao_salvar(text,uuid,jsonb,timestamptz)', 'execute'),
    'permissões: anon executa as RPCs do painel; authenticated não');
  perform pg_temp.ok((select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                       where s.nspname = 'public' and p.proname in ('nx_automacao_salvar', 'nx_automacao_execucoes', 'nx_cv_buscar_msgs')) = 3,
    'sem sobrecarga: uma assinatura de cada');
  raise exception 'OK_33_PLANO1000B — automações, rastreio, tarefas, conversas, agenda, marca e radar';
end $t$;
rollback;
