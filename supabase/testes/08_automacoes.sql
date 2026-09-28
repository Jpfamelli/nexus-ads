-- ============================================================
-- ÓRBITA — supabase/testes/08_automacoes.sql · frente F7
-- Smoke do arquivo h (20260928h_automacoes.sql): RPCs do painel
-- (papel, módulo, limite, validação, isolamento), gatilhos de evento,
-- motor nx_auto_lote (dedupe, anti-laço, profundidade 3, erro isolado,
-- condições, horário, lote de 25 < 2 s, backlog de 60 em 3 chamadas),
-- gatilhos de tempo (sem_resposta, tempo_no_estagio, tarefa_vencida,
-- antes_da_data com remarcação), opt-out, SLA, fila e faxina, e o
-- teste de tempo com 5.000 contatos, 5.000 negócios e 20.000 mensagens.
-- Roda pelo execute_sql DEPOIS do arquivo a (F1) — e do e (F5) para o
-- caso do rodízio. TUDO em begin … rollback: nada fica no banco.
-- Falha = exceção 'FALHOU: <caso>'.
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

-- o cron de produção (a cada 15 s) pode estar com a trava do motor: tenta de novo
create or replace function pg_temp.lote(p_max int default 25) returns json language plpgsql as $f$
declare j json;
begin
  for i in 1 .. 40 loop
    j := public.nx_auto_lote(p_max);
    if coalesce((j ->> 'ocupado')::boolean, false) is false then return j; end if;
    perform pg_sleep(0.25);
  end loop;
  raise exception 'FALHOU: motor ocupado por 10 s';
end $f$;

do $t$
declare
  cA uuid; cB uuid; k_adm uuid; k_at uuid; k_sup uuid; k_le uuid; k_admB uuid;
  f_pac uuid; s_nova uuid; s_agend uuid; s_orc uuid; s_fechou uuid; s_b uuid; dep_rec uuid;
  can uuid; tpl uuid; tpl_mkt uuid; e1 uuid; e2 uuid; e3 uuid; e5 uuid; e_orc uuid;
  j json; jb jsonb; e text; n int; t0 timestamptz; ms numeric;
  a_orc uuid; a_self uuid; a_p uuid; a_q uuid; a_err uuid; a_ok uuid; a_sr uuid; a_hor uuid; a_lote uuid;
  a_lemb uuid; a_mkt uuid; a_te uuid; a_tv uuid; a_preco uuid; a_b uuid; a_rasc uuid;
  ct1 bigint; ct2 bigint; ct3 bigint; ct4 bigint; ct5 bigint; l1 bigint; l2 bigint; l3 bigint; l4 bigint; l5 bigint;
  cv1 bigint; cv2 bigint; cv3 bigint; cvo bigint; tf1 bigint; fl1 bigint; fl2 bigint;
  v_local timestamp; v_ini text; v_fim text; v_hor jsonb; v_esperado timestamptz;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  -- revisão (justiça entre clientes, alerta só da agência, data_agenda)
  cS uuid; k_super uuid; a_al uuid; a_x uuid; a_y uuid; a_ja uuid; a_jb uuid; a_mv uuid;
  fB uuid; canB uuid; depB uuid; fS uuid; sS uuid; ctB bigint; cvB bigint; lB bigint; lS bigint; lM bigint;
begin
  -- ---------------------------------------------------------- clientes, contas, sessões
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-f7-a', 'Clínica F7 A', 'odonto') returning id into cA;
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-f7-b', 'Clínica F7 B', 'odonto') returning id into cB;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f7-adm@teste.local', 'Admin F7', 'x', 'clinica', true) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f7-at@teste.local', 'Ana Atendente', 'x', 'clinica', true) returning id into k_at;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f7-sup@teste.local', 'Sup F7', 'x', 'clinica', true) returning id into k_sup;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f7-le@teste.local', 'Leitura F7', 'x', 'clinica', true) returning id into k_le;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f7-admb@teste.local', 'Admin F7 B', 'x', 'clinica', true) returning id into k_admB;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_adm, cA, 'admin'), (k_at, cA, 'atendente'),
    (k_sup, cA, 'supervisor'), (k_le, cA, 'leitura'), (k_admB, cB, 'admin');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash('tok-f7-adm'), k_adm, now() + interval '1 hour'), (public.nx_hash('tok-f7-at'), k_at, now() + interval '1 hour'),
    (public.nx_hash('tok-f7-sup'), k_sup, now() + interval '1 hour'), (public.nx_hash('tok-f7-le'), k_le, now() + interval '1 hour'),
    (public.nx_hash('tok-f7-admb'), k_admB, now() + interval '1 hour');

  select id into f_pac from public.nx_funis where cliente_id = cA and padrao;
  select id into s_nova from public.nx_estagios where funil_id = f_pac and marco = 'nova';
  select id into s_agend from public.nx_estagios where funil_id = f_pac and marco = 'agendada';
  select id into s_orc from public.nx_estagios where funil_id = f_pac and marco = 'orcamento';
  select id into s_fechou from public.nx_estagios where funil_id = f_pac and marco = 'fechou';
  select id into s_b from public.nx_estagios where cliente_id = cB and marco = 'orcamento';
  select id into dep_rec from public.nx_departamentos where cliente_id = cA and padrao;
  update public.nx_departamentos set horario = null where cliente_id = cA;   -- 24 h (determinístico)
  perform pg_temp.ok(f_pac is not null and s_orc is not null and s_b is not null and dep_rec is not null, 'modelo odonto aplicado');

  perform set_config('nx.sem_gatilho_canal', '1', true);
  insert into public.nx_canais (cliente_id, nome, phone_number_id, departamento_id, status)
  values (cA, 'Principal F7', 'teste-f7-pid-a', dep_rec, 'ativo') returning id into can;
  insert into public.nx_templates (cliente_id, canal_id, nome, idioma, categoria, status, corpo, num_parametros)
  values (cA, can, 'confirmacao_consulta', 'pt_BR', 'UTILITY', 'APPROVED',
          'Olá, {{1}}! Confirmando sua consulta em {{2}} às {{3}}. Responda SIM para confirmar.', 3) returning id into tpl;
  insert into public.nx_templates (cliente_id, canal_id, nome, idioma, categoria, status, corpo, num_parametros)
  values (cA, can, 'promo_f7', 'pt_BR', 'MARKETING', 'APPROVED', 'Oi {{1}}, temos novidade!', 1) returning id into tpl_mkt;
  insert into public.nx_etiquetas (cliente_id, nome) values (cA, 'F7 um') returning id into e1;
  insert into public.nx_etiquetas (cliente_id, nome) values (cA, 'F7 dois') returning id into e2;
  insert into public.nx_etiquetas (cliente_id, nome) values (cA, 'F7 três') returning id into e3;
  insert into public.nx_etiquetas (cliente_id, nome) values (cA, 'F7 cinco') returning id into e5;

  -- ---------------------------------------------------------- permissões
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_automacoes_listar(text,uuid)', 'execute')
                 and has_function_privilege('anon', 'public.nx_automacao_salvar(text,uuid,jsonb)', 'execute')
                 and has_function_privilege('anon', 'public.nx_automacao_ativar(text,uuid,uuid,boolean)', 'execute')
                 and has_function_privilege('anon', 'public.nx_automacao_excluir(text,uuid,uuid)', 'execute')
                 and has_function_privilege('anon', 'public.nx_automacao_execucoes(text,uuid,uuid,integer)', 'execute'),
                     'RPCs do painel abertas ao anon');
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_auto_lote(integer)', 'execute')
                 and not has_function_privilege('authenticated', 'public.nx_fila_chamar()', 'execute')
                 and not has_function_privilege('anon', 'public.nx_auto_normalizar(uuid,jsonb,boolean)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_saas_faxina()', 'execute')
                 and has_function_privilege('service_role', 'public.nx_auto_lote(integer)', 'execute'),
                     'motor, fila e faxina só service_role');
  perform pg_temp.ok((select count(*) from cron.job where jobname in ('nx-automacoes', 'nx-fila', 'nx-faxina-saas')) = 3,
                     'três jobs do pg_cron');
  perform pg_temp.ok(exists (select 1 from cron.job where jobname = 'nx-automacoes'
                              and command like '%nx_auto_lote%'), 'job nx-automacoes chama o motor');

  -- ---------------------------------------------------------- RPCs: papel e módulo
  j := public.nx_automacoes_listar('tok-f7-sup', cA);
  perform pg_temp.ok(json_array_length(j -> 'sistema') = 5 and json_array_length(j -> 'itens') = 0
                 and (j ->> 'pode_editar')::boolean = false and j ->> 'vertical' = 'odonto', 'listar do supervisor: 5 regras do sistema, sem itens, sem editar');
  perform pg_temp.ok(json_array_length(j #> '{base,funis}') = 2 and json_array_length(j #> '{base,templates}') = 2
                 and json_array_length(j #> '{base,usuarios}') = 4 and json_array_length(j #> '{base,canais}') = 1,
                     'listar traz a base do editor (funis, modelos, usuários, números)');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_automacoes_listar(%L,%L)', 'tok-f7-at', cA)) = 'sem_permissao', 'atendente não vê automações');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_automacoes_listar(%L,%L)', 'tok-f7-adm', cB)) = 'sem_acesso', 'admin de A não lista B');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_automacao_salvar(%L,%L,%L)', 'tok-f7-sup', cA,
    '{"nome":"x","gatilho":"tarefa_vencida","acoes":[{"tipo":"resolver_conversa"}]}')) = 'sem_permissao', 'supervisor não salva');
  update public.nx_clientes set modulos = array_remove(modulos, 'automacoes') where id = cA;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_automacoes_listar(%L,%L)', 'tok-f7-adm', cA)) = 'modulo_desligado|automacoes', 'módulo desligado');
  update public.nx_clientes set modulos = modulos || '{automacoes}' where id = cA;

  -- ---------------------------------------------------------- validação (mesmas frases do auto-logica)
  e := pg_temp.erro(format('select public.nx_automacao_salvar(%L,%L,%L)', 'tok-f7-adm', cA,
    '{"nome":"x","gatilho":"negocio_estagio","config":{},"acoes":[{"tipo":"resolver_conversa"}]}'));
  perform pg_temp.ok(e = 'automacao_invalida|escolha a etapa em «Quando»', 'gatilho sem config obrigatória: ' || e);
  e := pg_temp.erro(format('select public.nx_automacao_salvar(%L,%L,%L)', 'tok-f7-adm', cA,
    jsonb_build_object('nome', 'x', 'gatilho', 'tarefa_vencida', 'acoes',
      (select jsonb_agg('{"tipo":"resolver_conversa"}'::jsonb) from generate_series(1, 11)))));
  perform pg_temp.ok(e = 'automacao_invalida|use até 10 ações', '>10 ações: ' || e);
  e := pg_temp.erro(format('select public.nx_automacao_salvar(%L,%L,%L)', 'tok-f7-adm', cA,
    '{"nome":"x","gatilho":"tarefa_vencida","acoes":[{"tipo":"resolver_conversa"},{"tipo":"http"}]}'));
  perform pg_temp.ok(e = 'automacao_invalida|ação 2: tipo de ação desconhecido', 'ação desconhecida: ' || e);
  e := pg_temp.erro(format('select public.nx_automacao_salvar(%L,%L,%L)', 'tok-f7-adm', cA,
    '{"nome":"x","gatilho":"antes_da_data","config":{"campo":"consulta","horas":73},"acoes":[{"tipo":"resolver_conversa"}]}'));
  perform pg_temp.ok(e = 'automacao_invalida|a antecedência vai de 1 a 72 horas', 'antes_da_data horas 73: ' || e);
  e := pg_temp.erro(format('select public.nx_automacao_salvar(%L,%L,%L)', 'tok-f7-adm', cA,
    jsonb_build_object('nome', 'x', 'gatilho', 'negocio_estagio', 'config', jsonb_build_object('estagio_id', s_b),
                       'acoes', '[{"tipo":"resolver_conversa"}]'::jsonb)));
  perform pg_temp.ok(e = 'automacao_invalida|a etapa escolhida em «Quando» não existe mais', 'etapa de OUTRO cliente recusada: ' || e);
  e := pg_temp.erro(format('select public.nx_automacao_salvar(%L,%L,%L)', 'tok-f7-adm', cA,
    jsonb_build_object('nome', 'x', 'gatilho', 'tarefa_vencida', 'acoes', jsonb_build_array(
      jsonb_build_object('tipo', 'criar_tarefa', 'titulo', 't', 'dono', k_admB)))));
  perform pg_temp.ok(e = 'automacao_invalida|ação 1: escolha para quem é a tarefa', 'pessoa de OUTRO cliente recusada: ' || e);
  e := pg_temp.erro(format('select public.nx_automacao_salvar(%L,%L,%L)', 'tok-f7-adm', cA,
    '{"nome":"x","gatilho":"tarefa_vencida","condicoes":[{"campo":"texto","op":"maior","valor":"a"}],"acoes":[{"tipo":"resolver_conversa"}]}'));
  perform pg_temp.ok(e = 'automacao_invalida|condição 1: «maior» e «menor» valem só para valor e campos', 'condição inválida: ' || e);
  e := pg_temp.erro(format('select public.nx_automacao_salvar(%L,%L,%L)', 'tok-f7-adm', cA,
    jsonb_build_object('nome', 'x', 'gatilho', 'antes_da_data', 'ativo', true, 'config', '{"campo":"consulta","horas":24}'::jsonb,
      'acoes', jsonb_build_array(jsonb_build_object('tipo', 'enviar_template', 'template_id', tpl, 'parametros', '["{nome}"]'::jsonb)))));
  perform pg_temp.ok(e = 'automacao_invalida|ação 1: o modelo pede 3 parâmetros', 'parâmetros do modelo conferidos: ' || e);

  -- rascunho do lembrete sem modelo: salva desligado; ligar exige o modelo
  j := public.nx_automacao_salvar('tok-f7-adm', cA, '{"nome":"Lembrete rascunho","gatilho":"antes_da_data","ativo":false,
     "config":{"campo":"consulta","horas":24},"acoes":[{"tipo":"enviar_template","template_nome":"confirmacao_consulta",
     "parametros":["{primeiro_nome}","{data_consulta}","{hora_consulta}"]}]}');
  a_rasc := (j ->> 'id')::uuid;
  perform pg_temp.ok(a_rasc is not null and not (j ->> 'ativo')::boolean
                 and j #>> '{acoes,0,template_nome}' = 'confirmacao_consulta', 'lembrete salvo como rascunho desligado');
  e := pg_temp.erro(format('select public.nx_automacao_ativar(%L,%L,%L,true)', 'tok-f7-adm', cA, a_rasc));
  perform pg_temp.ok(e = 'automacao_invalida|ação 1: escolha o modelo aprovado', 'ligar sem modelo → automacao_invalida: ' || e);

  -- etiqueta por nome é achada/criada (modelo "preço → Orçamento")
  j := public.nx_automacao_salvar('tok-f7-adm', cA, '{"nome":"Perguntou preço","gatilho":"mensagem_recebida","ativo":true,
     "config":{"palavras":["preço","quanto custa"," "]},"acoes":[{"tipo":"etiquetar","etiqueta_nome":"Orçamento","alvo":"contato"}]}');
  a_preco := (j ->> 'id')::uuid;
  select id into e_orc from public.nx_etiquetas where cliente_id = cA and nome = 'Orçamento';
  perform pg_temp.ok(e_orc is not null and (j #>> '{acoes,0,etiqueta_id}')::uuid = e_orc
                 and jsonb_array_length((j -> 'config' -> 'palavras')::jsonb) = 2, 'etiqueta Orçamento criada e palavras limpas');

  -- isolamento: automação de B
  j := public.nx_automacao_salvar('tok-f7-admb', cB, '{"nome":"De B","gatilho":"tarefa_vencida","acoes":[{"tipo":"resolver_conversa"}]}');
  a_b := (j ->> 'id')::uuid;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_automacao_ativar(%L,%L,%L,true)', 'tok-f7-adm', cA, a_b)) = 'automacao_nao_encontrada', 'ativar id de B → não encontrada');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_automacao_excluir(%L,%L,%L)', 'tok-f7-adm', cA, a_b)) = 'automacao_nao_encontrada', 'excluir id de B → não encontrada');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_automacao_execucoes(%L,%L,%L)', 'tok-f7-adm', cA, a_b)) = 'automacao_nao_encontrada', 'execuções id de B → não encontrada');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_automacao_salvar(%L,%L,%L)', 'tok-f7-adm', cA,
    jsonb_build_object('id', a_b, 'nome', 'x', 'gatilho', 'tarefa_vencida', 'acoes', '[{"tipo":"resolver_conversa"}]'::jsonb))) = 'automacao_nao_encontrada',
    'salvar com id de B → não encontrada');
  perform pg_temp.ok((select nome from public.nx_automacoes where id = a_b) = 'De B', 'automação de B intacta');

  -- limite do plano
  update public.nx_clientes set limites = '{"automacoes":2}' where id = cA;
  e := pg_temp.erro(format('select public.nx_automacao_salvar(%L,%L,%L)', 'tok-f7-adm', cA, '{"nome":"x","gatilho":"tarefa_vencida","acoes":[{"tipo":"resolver_conversa"}]}'));
  perform pg_temp.ok(e = 'limite_plano|automacoes:2', 'limite de automações: ' || e);
  update public.nx_clientes set limites = '{}' where id = cA;
  -- os dois de apoio saem do caminho dos próximos testes
  update public.nx_automacoes set ativo = false where id in (a_preco, a_rasc);

  -- ---------------------------------------------------------- evento → ação executa UMA vez (dedupe)
  j := public.nx_automacao_salvar('tok-f7-adm', cA, jsonb_build_object('nome', 'Avaliou → orçamento', 'gatilho', 'negocio_estagio', 'ativo', true,
    'config', jsonb_build_object('estagio_id', s_orc),
    'acoes', '[{"tipo":"criar_tarefa","titulo":"Enviar orçamento para {primeiro_nome}","tipo_tarefa":"whatsapp","vence_em_horas":24,"dono":"responsavel"}]'::jsonb));
  a_orc := (j ->> 'id')::uuid;
  perform pg_temp.ok((j ->> 'ativo')::boolean and j #>> '{acoes,0,dono}' = 'responsavel', 'automação de orçamento salva e ligada');
  perform pg_temp.lote(200);   -- zera qualquer resto
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Maria Souza', '12991110001') returning id into ct1;
  insert into public.nx_leads (cliente_id, contato_id, funil_id, dono_id, origem) values (cA, ct1, f_pac, k_at, 'whatsapp') returning id into l1;
  update public.nx_leads set estagio_id = s_orc where id = l1;
  perform pg_temp.ok((select count(*) from public.nx_eventos where cliente_id = cA and tipo = 'negocio_estagio' and processado_em is null) = 2,
                     'dois eventos de etapa (entrou em Nova conversa ao criar e em Avaliou ao mover)');
  j := pg_temp.lote(25);
  perform pg_temp.ok((j ->> 'execucoes')::int >= 1, 'motor executou: ' || j::text);
  perform pg_temp.ok((select count(*) from public.nx_tarefas where negocio_id = l1 and automacao_id = a_orc) = 1, 'uma tarefa criada');
  perform pg_temp.ok((select titulo = 'Enviar orçamento para Maria' and tipo = 'whatsapp' and dono_id = k_at and contato_id = ct1
                        and vence_em between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute'
                        from public.nx_tarefas where negocio_id = l1 and automacao_id = a_orc), 'tarefa com variável, tipo, dono e prazo');
  perform pg_temp.ok((select execucoes = 1 and erros = 0 and ultima_execucao_em is not null from public.nx_automacoes where id = a_orc), 'contador de execuções');
  perform pg_temp.ok(exists (select 1 from public.nx_historico where negocio_id = l1 and tipo = 'automacao'), 'linha do tempo registra a automação');
  update public.nx_eventos set processado_em = null where cliente_id = cA and tipo = 'negocio_estagio';   -- força reprocessar
  perform pg_temp.lote(25);
  perform pg_temp.ok((select count(*) from public.nx_tarefas where negocio_id = l1 and automacao_id = a_orc) = 1, 'dedupe: reprocessar o evento não duplica');
  j := public.nx_automacao_execucoes('tok-f7-sup', cA, a_orc, 50);
  perform pg_temp.ok(json_array_length(j) = 1 and (j -> 0 ->> 'ok')::boolean and j -> 0 ->> 'link' = '#/crm/negocio/' || l1
                 and j -> 0 ->> 'detalhe' like 'Maria Souza: tarefa «Enviar orçamento para Maria» para Ana Atendente%', 'execuções com detalhe e link: ' || j::text);

  -- ---------------------------------------------------------- automação não dispara a si mesma
  update public.nx_automacoes set ativo = false where id = a_orc;
  j := public.nx_automacao_salvar('tok-f7-adm', cA, jsonb_build_object('nome', 'Laço consigo', 'gatilho', 'etiqueta_adicionada', 'ativo', true,
    'config', jsonb_build_object('etiqueta_id', e1),
    'acoes', jsonb_build_array(jsonb_build_object('tipo', 'etiquetar', 'etiqueta_id', e1, 'alvo', 'contato', 'remover', true),
                               jsonb_build_object('tipo', 'etiquetar', 'etiqueta_id', e1, 'alvo', 'contato'))));
  a_self := (j ->> 'id')::uuid;
  update public.nx_contatos set etiquetas = array[e1] where id = ct1;
  for i in 1 .. 4 loop perform pg_temp.lote(25); end loop;
  perform pg_temp.ok((select execucoes from public.nx_automacoes where id = a_self) = 1, 'automação não dispara a si mesma');
  perform pg_temp.ok(exists (select 1 from public.nx_eventos where cliente_id = cA and origem_automacao = a_self and processado_em is not null),
                     'evento gerado pela própria automação foi marcado e ignorado');
  update public.nx_automacoes set ativo = false where id = a_self;

  -- ---------------------------------------------------------- profundidade máxima 3 (P ↔ Q)
  j := public.nx_automacao_salvar('tok-f7-adm', cA, jsonb_build_object('nome', 'P', 'gatilho', 'etiqueta_adicionada', 'ativo', true,
    'config', jsonb_build_object('etiqueta_id', e2),
    'acoes', jsonb_build_array(jsonb_build_object('tipo', 'etiquetar', 'etiqueta_id', e3, 'alvo', 'contato', 'remover', true),
                               jsonb_build_object('tipo', 'etiquetar', 'etiqueta_id', e3, 'alvo', 'contato'))));
  a_p := (j ->> 'id')::uuid;
  j := public.nx_automacao_salvar('tok-f7-adm', cA, jsonb_build_object('nome', 'Q', 'gatilho', 'etiqueta_adicionada', 'ativo', true,
    'config', jsonb_build_object('etiqueta_id', e3),
    'acoes', jsonb_build_array(jsonb_build_object('tipo', 'etiquetar', 'etiqueta_id', e2, 'alvo', 'contato', 'remover', true),
                               jsonb_build_object('tipo', 'etiquetar', 'etiqueta_id', e2, 'alvo', 'contato'))));
  a_q := (j ->> 'id')::uuid;
  update public.nx_contatos set etiquetas = etiquetas || e2 where id = ct1;
  for i in 1 .. 6 loop perform pg_temp.lote(25); end loop;
  perform pg_temp.ok((select execucoes from public.nx_automacoes where id = a_p) = 2 and (select execucoes from public.nx_automacoes where id = a_q) = 1,
                     'profundidade 3: P, Q, P e para (' || (select execucoes from public.nx_automacoes where id = a_p) || '/' ||
                     (select execucoes from public.nx_automacoes where id = a_q) || ')');
  perform pg_temp.ok(not exists (select 1 from public.nx_eventos where cliente_id = cA and processado_em is null), 'backlog zerado');
  update public.nx_automacoes set ativo = false where id in (a_p, a_q);

  -- ---------------------------------------------------------- erro numa automação não impede as outras
  j := public.nx_automacao_salvar('tok-f7-adm', cA, jsonb_build_object('nome', 'Fecha sem valor', 'gatilho', 'negocio_estagio', 'ativo', true,
    'config', jsonb_build_object('estagio_id', s_agend),
    'acoes', jsonb_build_array(jsonb_build_object('tipo', 'criar_tarefa', 'titulo', 'antes do erro', 'dono', 'responsavel'),
                               jsonb_build_object('tipo', 'mover_estagio', 'estagio_id', s_fechou))));
  a_err := (j ->> 'id')::uuid;
  j := public.nx_automacao_salvar('tok-f7-adm', cA, jsonb_build_object('nome', 'Agendou → confirmar', 'gatilho', 'negocio_estagio', 'ativo', true,
    'config', jsonb_build_object('estagio_id', s_agend),
    'condicoes', '[{"campo":"origem","op":"igual","valor":"whatsapp"}]'::jsonb,
    'acoes', '[{"tipo":"criar_tarefa","titulo":"Confirmar {nome}","dono":"atendente"}]'::jsonb));
  a_ok := (j ->> 'id')::uuid;
  update public.nx_leads set estagio_id = s_agend where id = l1;
  perform pg_temp.lote(25);
  perform pg_temp.ok((select erros = 1 and execucoes = 0 from public.nx_automacoes where id = a_err), 'automação com erro contada');
  perform pg_temp.ok((select detalhe from public.nx_auto_execucoes where automacao_id = a_err) = 'Ação 2 (mover etapa): falta o valor para marcar como ganho.',
                     'detalhe do erro: ' || coalesce((select detalhe from public.nx_auto_execucoes where automacao_id = a_err), '∅'));
  perform pg_temp.ok(not exists (select 1 from public.nx_tarefas where titulo = 'antes do erro' and negocio_id = l1), 'automação com erro desfeita por inteiro');
  perform pg_temp.ok((select estagio_id from public.nx_leads where id = l1) = s_agend, 'negócio não foi movido');
  perform pg_temp.ok(exists (select 1 from public.nx_tarefas where negocio_id = l1 and automacao_id = a_ok and titulo = 'Confirmar Maria Souza'),
                     'a outra automação do mesmo evento rodou');
  -- condição que não vale: nada
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Pedro Anúncio', '12991110002') returning id into ct2;
  insert into public.nx_leads (cliente_id, contato_id, funil_id, dono_id, origem) values (cA, ct2, f_pac, k_at, 'anuncio') returning id into l2;
  update public.nx_leads set estagio_id = s_agend where id = l2;
  perform pg_temp.lote(25);
  perform pg_temp.ok(not exists (select 1 from public.nx_tarefas where negocio_id = l2 and automacao_id = a_ok), 'condição origem = whatsapp barrou o anúncio');
  perform pg_temp.ok((select erros from public.nx_automacoes where id = a_err) = 2, 'a 2ª execução com erro também registrada');
  update public.nx_automacoes set ativo = false where id in (a_err, a_ok);

  -- ---------------------------------------------------------- mensagem recebida (palavras sem acento/caixa) e conversa oculta
  update public.nx_automacoes set ativo = true where id = a_preco;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, protocolo, status, aguardando, ultima_entrada_em)
  values (cA, can, ct1, dep_rec, 'F7-000001', 'aberta', true, now()) returning id into cv1;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status)
  values (cA, cv1, ct1, can, 'in', 'texto', 'Oi! Qual o PRECO do clareamento?', 'recebida');
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status)
  values (cA, cv1, ct1, can, 'out', 'nota', 'preço interno', 'enviada');
  perform pg_temp.ok((select count(*) from public.nx_eventos where cliente_id = cA and tipo = 'mensagem_recebida' and processado_em is null) = 1,
                     'só a mensagem que chegou gera evento (nota não)');
  perform pg_temp.lote(25);
  perform pg_temp.ok(exists (select 1 from public.nx_contatos where id = ct1 and e_orc = any(etiquetas)), '"PRECO" casa com "preço": etiqueta Orçamento no contato');
  insert into public.nx_contatos (cliente_id, nome, telefone, bloqueado) values (cA, 'Bloqueado F7', '12991110003', true) returning id into ct3;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, oculta) values (cA, can, ct3, 'F7-000002', 'resolvida', true) returning id into cvo;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status)
  values (cA, cvo, ct3, can, 'in', 'texto', 'quanto custa?', 'recebida');
  perform pg_temp.ok(not exists (select 1 from public.nx_eventos where cliente_id = cA and tipo = 'mensagem_recebida' and ref ->> 'conversa_id' = cvo::text),
                     'conversa oculta (bloqueado) não gera evento');
  update public.nx_automacoes set ativo = false where id = a_preco;

  -- ---------------------------------------------------------- sem_resposta respeita a chave
  j := public.nx_automacao_salvar('tok-f7-adm', cA, '{"nome":"Sem resposta 15","gatilho":"sem_resposta","ativo":true,
     "config":{"minutos":15,"so_no_horario":true},"acoes":[{"tipo":"notificar","para":"responsavel","titulo":"{nome} esperando","texto":"Atendimento {protocolo}"}]}');
  a_sr := (j ->> 'id')::uuid;
  update public.nx_conversas set ultima_entrada_em = now() - interval '20 minutes', aguardando = true, atribuida_a = k_at where id = cv1;
  perform pg_temp.lote(25);
  perform pg_temp.ok((select count(*) from public.nx_notificacoes where cliente_id = cA and conta_id = k_at and tipo = 'sem_resposta'
                        and titulo = 'Maria Souza esperando' and corpo = 'Atendimento F7-000001' and link = '#/conversas/' || cv1) = 1,
                     'sem resposta: aviso para quem atende, com link da conversa');
  perform pg_temp.lote(25);
  perform pg_temp.ok((select execucoes from public.nx_automacoes where id = a_sr) = 1, 'sem resposta: mesma espera não avisa de novo');
  update public.nx_conversas set ultima_entrada_em = now() - interval '16 minutes' where id = cv1;   -- nova mensagem do cliente
  perform pg_temp.lote(25);
  perform pg_temp.ok((select execucoes from public.nx_automacoes where id = a_sr) = 2, 'sem resposta: nova espera avisa de novo');
  update public.nx_conversas set ultima_entrada_em = now() - interval '3 days' where id = cv1;
  perform pg_temp.lote(25);
  perform pg_temp.ok((select execucoes from public.nx_automacoes where id = a_sr) = 2, 'sem resposta: espera de dias atrás não dispara ao ligar');
  update public.nx_automacoes set ativo = false where id = a_sr;

  -- ---------------------------------------------------------- respeitar_horario agenda para a próxima abertura
  v_local := (now() at time zone 'America/Sao_Paulo') + interval '2 hours';
  v_ini := to_char(v_local, 'HH24:MI');
  v_fim := case when v_local::time > time '23:28' then '23:59' else to_char(v_local + interval '30 minutes', 'HH24:MI') end;
  v_hor := jsonb_build_object('0', '[]'::jsonb, '1', '[]'::jsonb, '2', '[]'::jsonb, '3', '[]'::jsonb, '4', '[]'::jsonb, '5', '[]'::jsonb, '6', '[]'::jsonb)
           || jsonb_build_object(extract(dow from v_local)::int::text, jsonb_build_array(jsonb_build_array(v_ini, v_fim)));
  update public.nx_departamentos set horario = v_hor where id = dep_rec;
  v_esperado := (v_local::date + v_ini::time) at time zone 'America/Sao_Paulo';
  j := public.nx_automacao_salvar('tok-f7-adm', cA, '{"nome":"Responde palavra","gatilho":"mensagem_recebida","ativo":true,"respeitar_horario":true,
     "config":{"palavras":["horario-f7"]},"acoes":[{"tipo":"enviar_mensagem","texto":"Oi {primeiro_nome}, já te respondemos."}]}');
  a_hor := (j ->> 'id')::uuid;
  update public.nx_conversas set ultima_entrada_em = now() - interval '1 hour' where id = cv1;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status)
  values (cA, cv1, ct1, can, 'in', 'texto', 'teste HORARIO-F7', 'recebida');
  perform pg_temp.lote(25);
  select id into fl1 from public.nx_envios_fila where automacao_id = a_hor;
  perform pg_temp.ok(fl1 is not null, 'mensagem enfileirada');
  perform pg_temp.ok((select enviar_em = v_esperado and tipo = 'texto' and texto = 'Oi Maria, já te respondemos.' and status = 'pendente'
                        and origem = 'automacao' and conversa_id = cv1 and canal_id = can from public.nx_envios_fila where id = fl1),
                     'respeitar horário: enviar_em = próxima abertura (' || (select enviar_em from public.nx_envios_fila where id = fl1)::text
                     || ' × ' || v_esperado::text || ')');
  update public.nx_departamentos set horario = null where id = dep_rec;
  -- fora da janela: pulada, sem fila
  update public.nx_conversas set ultima_entrada_em = now() - interval '25 hours' where id = cv1;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status)
  values (cA, cv1, ct1, can, 'in', 'texto', 'horario-f7 de novo', 'recebida');
  update public.nx_conversas set ultima_entrada_em = now() - interval '25 hours' where id = cv1;
  perform pg_temp.lote(25);
  perform pg_temp.ok((select count(*) from public.nx_envios_fila where automacao_id = a_hor) = 1
                 and exists (select 1 from public.nx_auto_execucoes where automacao_id = a_hor and detalhe like '%pulada (fora da janela de 24 h)%'),
                     'fora da janela: mensagem pulada com motivo');
  update public.nx_automacoes set ativo = false where id = a_hor;

  -- ---------------------------------------------------------- antes_da_data: um lembrete por data; remarcar gera outro; opt-out
  j := public.nx_automacao_salvar('tok-f7-adm', cA, jsonb_build_object('nome', 'Lembrete 24 h', 'gatilho', 'antes_da_data', 'ativo', true,
    'config', '{"campo":"consulta","horas":24}'::jsonb,
    'acoes', jsonb_build_array(jsonb_build_object('tipo', 'enviar_template', 'template_id', tpl,
      'parametros', '["{primeiro_nome}","{data_consulta}","{hora_consulta}"]'::jsonb))));
  a_lemb := (j ->> 'id')::uuid;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Joana Lembrete', '12991110004') returning id into ct4;
  insert into public.nx_leads (cliente_id, contato_id, funil_id, dono_id, origem, consulta_em)
  values (cA, ct4, f_pac, k_at, 'manual', now() + interval '20 hours') returning id into l4;
  perform pg_temp.lote(25);
  perform pg_temp.ok((select count(*) from public.nx_envios_fila where automacao_id = a_lemb) = 1, 'consulta em 20 h com horas = 24: UM item na fila');
  select * into jb from (select to_jsonb(f) from public.nx_envios_fila f where automacao_id = a_lemb) s(x);
  perform pg_temp.ok(jb ->> 'tipo' = 'template' and (jb #>> '{template,template_id}')::uuid = tpl and jb #>> '{template,nome}' = 'confirmacao_consulta'
                 and jb #>> '{template,parametros,0}' = 'Joana'
                 and jb #>> '{template,parametros,1}' = to_char((now() + interval '20 hours') at time zone 'America/Sao_Paulo', 'DD/MM')
                 and jb #>> '{template,parametros,2}' = to_char((now() + interval '20 hours') at time zone 'America/Sao_Paulo', 'HH24:MI')
                 and jb #>> '{template,corpo}' like 'Olá, Joana! Confirmando sua consulta em %', 'item do lembrete com modelo e parâmetros: ' || jb::text);
  cv2 := (jb ->> 'conversa_id')::bigint;
  perform pg_temp.ok((select contato_id = ct4 and canal_id = can and status = 'aberta' and not aguardando and atribuida_a is null
                        from public.nx_conversas where id = cv2)
                 and exists (select 1 from public.nx_mensagens where conversa_id = cv2 and tipo = 'sistema'
                              and corpo = 'Conversa iniciada pela automação «Lembrete 24 h»'), 'sem conversa: o motor abre uma (sem atribuir) com aviso de sistema');
  perform pg_temp.lote(25);
  perform pg_temp.ok((select count(*) from public.nx_envios_fila where automacao_id = a_lemb) = 1, 'a mesma data nunca duas vezes');
  update public.nx_leads set consulta_em = consulta_em + interval '1 hour' where id = l4;
  perform pg_temp.lote(25);
  perform pg_temp.ok((select count(*) from public.nx_envios_fila where automacao_id = a_lemb) = 2
                 and (select count(*) from public.nx_conversas where contato_id = ct4) = 1, 'remarcar gera outro lembrete (na mesma conversa)');
  -- opt-out: lembrete de UTILIDADE continua; modelo de MARKETING é pulado
  update public.nx_contatos set optin_marketing = false, optin_em = now(), optin_origem = 'teste' where id = ct4;
  update public.nx_leads set consulta_em = consulta_em + interval '1 hour' where id = l4;
  j := public.nx_automacao_salvar('tok-f7-adm', cA, jsonb_build_object('nome', 'Promo antes', 'gatilho', 'antes_da_data', 'ativo', true,
    'config', '{"campo":"consulta","horas":24}'::jsonb,
    'acoes', jsonb_build_array(jsonb_build_object('tipo', 'enviar_template', 'template_id', tpl_mkt, 'parametros', '["{primeiro_nome}"]'::jsonb))));
  a_mkt := (j ->> 'id')::uuid;
  perform pg_temp.lote(25);
  perform pg_temp.ok((select count(*) from public.nx_envios_fila where automacao_id = a_lemb) = 3, 'opt-out: lembrete (utilidade) continua saindo');
  perform pg_temp.ok(not exists (select 1 from public.nx_envios_fila where automacao_id = a_mkt)
                 and exists (select 1 from public.nx_auto_execucoes where automacao_id = a_mkt and ok
                              and detalhe like '%modelo: pulado (contato pediu para não receber)%'), 'opt-out: modelo de marketing pulado com motivo');
  -- consulta só com data (sem hora): erro honesto em vez de mensagem com buraco
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Sem Hora', '12991110005') returning id into ct5;
  j := public.nx_automacao_salvar('tok-f7-adm', cA, jsonb_build_object('nome', 'Lembrete 72 h', 'gatilho', 'antes_da_data', 'ativo', true,
    'config', '{"campo":"consulta","horas":72}'::jsonb,
    'acoes', jsonb_build_array(jsonb_build_object('tipo', 'enviar_template', 'template_id', tpl,
      'parametros', '["{primeiro_nome}","{data_consulta}","{hora_consulta}"]'::jsonb))));
  a_lote := (j ->> 'id')::uuid;
  insert into public.nx_leads (cliente_id, contato_id, funil_id, origem, data_consulta) values (cA, ct5, f_pac, 'manual', hoje + 2) returning id into l5;
  perform pg_temp.lote(25);
  perform pg_temp.ok(exists (select 1 from public.nx_auto_execucoes where automacao_id = a_lote and not ok
                              and detalhe = 'Ação 1 (enviar modelo): modelo inválido: a hora da consulta não está marcada.'),
                     'consulta sem hora: erro honesto (' || coalesce((select string_agg(detalhe, ' | ') from public.nx_auto_execucoes where automacao_id = a_lote), '∅') || ')');
  update public.nx_automacoes set ativo = false where id in (a_lemb, a_mkt, a_lote);

  -- ---------------------------------------------------------- tempo_no_estagio e tarefa_vencida
  j := public.nx_automacao_salvar('tok-f7-adm', cA, jsonb_build_object('nome', 'Parado 48 h', 'gatilho', 'tempo_no_estagio', 'ativo', true,
    'config', jsonb_build_object('estagio_id', s_agend, 'horas', 48),
    'acoes', '[{"tipo":"notificar","para":"admins","titulo":"{nome} parado em {etapa}"}]'::jsonb));
  a_te := (j ->> 'id')::uuid;
  update public.nx_leads set estagio_em = now() - interval '50 hours' where id = l2;
  perform pg_temp.lote(25);
  perform pg_temp.lote(25);
  perform pg_temp.ok((select execucoes from public.nx_automacoes where id = a_te) = 1
                 and exists (select 1 from public.nx_notificacoes where conta_id = k_adm and titulo = 'Pedro Anúncio parado em Avaliação agendada'),
                     'tempo na etapa: um aviso por entrada na etapa');
  j := public.nx_automacao_salvar('tok-f7-adm', cA, '{"nome":"Tarefa vencida","gatilho":"tarefa_vencida","ativo":true,
     "acoes":[{"tipo":"criar_tarefa","titulo":"Cobrar: tarefa atrasada","vence_em_horas":0,"dono":"responsavel"}]}');
  a_tv := (j ->> 'id')::uuid;
  insert into public.nx_tarefas (cliente_id, titulo, vence_em, dono_id, negocio_id, contato_id) values (cA, 'Ligar para Pedro', now() - interval '1 hour', k_at, l2, ct2)
  returning id into tf1;
  for i in 1 .. 3 loop perform pg_temp.lote(25); end loop;
  perform pg_temp.ok((select execucoes from public.nx_automacoes where id = a_tv) = 1
                 and (select count(*) from public.nx_tarefas where automacao_id = a_tv) = 1,
                     'tarefa vencida: uma execução, e a tarefa criada por ela (já vencida) não gera laço');
  update public.nx_automacoes set ativo = false where id in (a_te, a_tv);

  -- ---------------------------------------------------------- SLA da etapa (embutido no motor)
  update public.nx_estagios set sla_horas = 24 where id = s_agend;
  update public.nx_leads set estagio_em = now() - interval '30 hours' where id = l2;
  perform pg_temp.lote(25);
  perform pg_temp.lote(25);
  perform pg_temp.ok((select count(*) from public.nx_notificacoes where tipo = 'sla_etapa' and link = '#/crm/negocio/' || l2) = 1
                 and exists (select 1 from public.nx_notificacoes where tipo = 'sla_etapa' and conta_id = k_at and link = '#/crm/negocio/' || l2),
                     'SLA: um aviso para o dono por entrada na etapa');
  update public.nx_estagios set sla_horas = null where id = s_agend;

  -- ---------------------------------------------------------- fila: carimbo e devolução de envio travado
  insert into public.nx_envios_fila (cliente_id, conversa_id, contato_id, canal_id, tipo, texto, origem) values (cA, cv1, ct1, can, 'texto', 'a', 'automacao') returning id into fl1;
  insert into public.nx_envios_fila (cliente_id, conversa_id, contato_id, canal_id, tipo, texto, origem) values (cA, cv1, ct1, can, 'texto', 'b', 'automacao') returning id into fl2;
  update public.nx_envios_fila set status = 'enviando', tentativas = 1 where id = fl1;
  update public.nx_envios_fila set status = 'enviando', tentativas = 3 where id = fl2;
  perform pg_temp.ok((select pego_em is not null from public.nx_envios_fila where id = fl1), 'pego_em carimbado ao virar enviando');
  update public.nx_envios_fila set pego_em = now() - interval '11 minutes' where id in (fl1, fl2);
  perform public.nx_fila_chamar();
  perform pg_temp.ok((select status = 'pendente' and pego_em is null from public.nx_envios_fila where id = fl1), 'envio travado volta para a fila');
  perform pg_temp.ok((select status = 'falhou' and erro like '%3 tentativas%' from public.nx_envios_fila where id = fl2), 'depois de 3 tentativas: falhou');

  -- ---------------------------------------------------------- faxina
  insert into public.nx_eventos (cliente_id, tipo, criado_em, processado_em) values (cA, 'negocio_criado', now() - interval '9 days', now() - interval '8 days');
  update public.nx_contatos set etiquetas = etiquetas || gen_random_uuid() where id = ct2;
  j := public.nx_saas_faxina();
  perform pg_temp.ok((j ->> 'eventos')::int >= 1 and (j ->> 'etiquetas_orfas')::int >= 1, 'faxina: eventos velhos e etiquetas órfãs: ' || j::text);
  perform pg_temp.ok((select etiquetas = '{}' from public.nx_contatos where id = ct2), 'id de etiqueta órfão removido');

  -- ---------------------------------------------------------- rodízio (só se a F5 já estiver no banco)
  if to_regprocedure('public.nx_cv_distribuir(bigint)') is not null then
    update public.nx_departamentos set distribuicao = 'rodizio', manter_atendente = false where id = dep_rec;
    j := public.nx_automacao_salvar('tok-f7-adm', cA, '{"nome":"Rodízio","gatilho":"conversa_nova","ativo":true,"acoes":[{"tipo":"atribuir","modo":"rodizio"}]}');
    insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, protocolo, status) values (cA, can, ct2, dep_rec, 'F7-000003', 'aberta') returning id into cv3;
    perform pg_temp.lote(25);
    perform pg_temp.ok((select atribuida_a is not null from public.nx_conversas where id = cv3), 'ação atribuir por rodízio usa o nx_cv_distribuir');
    update public.nx_automacoes set ativo = false where id = (j ->> 'id')::uuid;
  end if;

  -- ---------------------------------------------------------- lote: 25 eventos (tarefa + etiqueta + fila) em UMA chamada < 2 s
  perform pg_temp.lote(200);
  update public.nx_automacoes set ativo = false where cliente_id = cA;
  j := public.nx_automacao_salvar('tok-f7-adm', cA, jsonb_build_object('nome', 'Lote', 'gatilho', 'negocio_criado', 'ativo', true,
    'config', jsonb_build_object('funil_id', f_pac),
    'acoes', jsonb_build_array(
      jsonb_build_object('tipo', 'criar_tarefa', 'titulo', 'Boas-vindas {primeiro_nome}', 'dono', 'responsavel'),
      jsonb_build_object('tipo', 'etiquetar', 'etiqueta_id', e5, 'alvo', 'contato'),
      jsonb_build_object('tipo', 'enviar_mensagem', 'texto', 'Olá {primeiro_nome}!'))));
  a_lote := (j ->> 'id')::uuid;
  with c as (
    insert into public.nx_contatos (cliente_id, nome, telefone)
    select cA, 'Lote ' || g, '1298' || lpad(g::text, 7, '0') from generate_series(1, 85) g returning id)
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, protocolo, status, aguardando, ultima_entrada_em)
  select cA, can, c.id, dep_rec, 'L-' || c.id, 'aberta', true, now() from c;
  insert into public.nx_leads (cliente_id, contato_id, funil_id, dono_id, origem)
  select cA, k.id, f_pac, k_at, 'whatsapp' from public.nx_contatos k where k.cliente_id = cA and k.nome in (select 'Lote ' || g from generate_series(1, 25) g);
  perform pg_temp.ok((select count(*) from public.nx_eventos where cliente_id = cA and processado_em is null) = 25, '25 eventos pendentes');
  t0 := clock_timestamp();
  j := pg_temp.lote(25);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  perform pg_temp.ok(ms < 2000, 'lento nx_auto_lote(25) ' || round(ms) || ' ms');
  perform pg_temp.ok((j ->> 'eventos')::int = 25 and (j ->> 'execucoes')::int = 25 and (j ->> 'erros')::int = 0,
                     '25 eventos → 25 execuções numa chamada: ' || j::text);
  perform pg_temp.ok((select count(*) from public.nx_tarefas where automacao_id = a_lote) = 25
                 and (select count(*) from public.nx_contatos where cliente_id = cA and e5 = any(etiquetas)) = 25
                 and (select count(*) from public.nx_envios_fila where automacao_id = a_lote and status = 'pendente') = 25,
                     'lote: 25 tarefas, 25 etiquetas, 25 mensagens na fila');
  -- 60 eventos: três chamadas zeram o backlog sem executar nada duas vezes
  insert into public.nx_leads (cliente_id, contato_id, funil_id, dono_id, origem)
  select cA, k.id, f_pac, k_at, 'whatsapp' from public.nx_contatos k where k.cliente_id = cA and k.nome in (select 'Lote ' || g from generate_series(26, 85) g);
  for i in 1 .. 3 loop j := pg_temp.lote(25); end loop;
  perform pg_temp.ok((j ->> 'restantes')::int = 0 and not exists (select 1 from public.nx_eventos where cliente_id = cA and processado_em is null),
                     '60 eventos: três chamadas zeram o backlog');
  perform pg_temp.ok((select count(*) from public.nx_tarefas where automacao_id = a_lote) = 85
                 and not exists (select 1 from public.nx_tarefas where automacao_id = a_lote group by negocio_id having count(*) > 1)
                 and (select execucoes from public.nx_automacoes where id = a_lote) = 85, 'nada executado duas vezes (85 negócios, 85 tarefas)');
  update public.nx_automacoes set ativo = false where id = a_lote;

  -- ---------------------------------------------------------- revisão: alerta no WhatsApp do gestor só pela agência, com teto
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id)
  values ('teste-f7-super@teste.local', 'Super F7', 'x', 'gestor', true, (select o.id from public.nx_orgs o where o.tipo = 'plataforma' limit 1))
  returning id into k_super;
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash('tok-f7-super'), k_super, now() + interval '1 hour');
  e := pg_temp.erro(format('select public.nx_automacao_salvar(%L,%L,%L)', 'tok-f7-adm', cA,
    '{"nome":"spam","gatilho":"mensagem_recebida","ativo":true,"acoes":[{"tipo":"resolver_conversa"},{"tipo":"alerta_whatsapp","texto":"oi"}]}'));
  perform pg_temp.ok(e = 'automacao_invalida|ação 2: o alerta no WhatsApp do gestor só pode ser configurado pela agência',
                     'admin da empresa não configura alerta no WhatsApp do gestor: ' || e);
  j := public.nx_automacao_salvar('tok-f7-super', cA, '{"nome":"Alerta da agência","gatilho":"mensagem_recebida","ativo":false,
     "config":{"palavras":["alerta-f7"]},"acoes":[{"tipo":"alerta_whatsapp","texto":"{nome} escreveu"}]}');
  a_al := (j ->> 'id')::uuid;
  perform pg_temp.ok(a_al is not null, 'agência (super) configura o alerta');
  e := pg_temp.erro(format('select public.nx_automacao_salvar(%L,%L,%L)', 'tok-f7-adm', cA,
    jsonb_build_object('id', a_al, 'nome', 'renomeado', 'gatilho', 'mensagem_recebida', 'acoes', j -> 'acoes')));
  perform pg_temp.ok(e like 'automacao_invalida|ação 1: o alerta%', 'admin não reescreve a automação de alerta da agência: ' || e);
  -- teto: 20 alertas por hora por automação (o 21º é pulado sem chamar a função)
  insert into public.nx_auto_execucoes (automacao_id, cliente_id, chave, ok, detalhe)
  select a_al, cA, 'rev:' || g, true, 'Maria Souza: alerta pedido ao WhatsApp do gestor' from generate_series(1, 20) g;
  perform public.nx_automacao_ativar('tok-f7-adm', cA, a_al, true);
  update public.nx_conversas set ultima_entrada_em = now(), status = 'aberta' where id = cv1;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status)
  values (cA, cv1, ct1, can, 'in', 'texto', 'teste ALERTA-F7', 'recebida');
  perform pg_temp.lote(25);
  perform pg_temp.ok(exists (select 1 from public.nx_auto_execucoes where automacao_id = a_al and ok and chave like 'ev:%'
                              and detalhe like '%alerta: pulado (limite de 20 por hora desta automação)%'),
                     'teto de 20 alertas por hora: ' || coalesce((select string_agg(detalhe, ' | ') from public.nx_auto_execucoes
                                                                   where automacao_id = a_al and chave like 'ev:%'), '∅'));
  update public.nx_automacoes set ativo = false where id = a_al;

  -- ---------------------------------------------------------- revisão: mover para "agendada" carimba data_agenda (como o CRM e o painel)
  j := public.nx_automacao_salvar('tok-f7-adm', cA, jsonb_build_object('nome', 'Criou → agendada', 'gatilho', 'negocio_criado', 'ativo', true,
    'config', jsonb_build_object('funil_id', f_pac), 'acoes', jsonb_build_array(jsonb_build_object('tipo', 'mover_estagio', 'estagio_id', s_agend))));
  a_mv := (j ->> 'id')::uuid;
  insert into public.nx_leads (cliente_id, contato_id, funil_id, origem) values (cA, ct2, f_pac, 'manual') returning id into lM;
  perform pg_temp.lote(25);
  perform pg_temp.ok((select estagio_id = s_agend and etapa = 'agendada' and data_agenda = hoje from public.nx_leads where id = lM),
                     'automação que move para agendada grava data_agenda = hoje (SP)');
  update public.nx_automacoes set ativo = false where id = a_mv;

  -- ---------------------------------------------------------- revisão: revezamento de EVENTOS entre clientes
  select id into fB from public.nx_funis where cliente_id = cB and padrao;
  j := public.nx_automacao_salvar('tok-f7-adm', cA, jsonb_build_object('nome', 'Justo A', 'gatilho', 'negocio_criado', 'ativo', true,
    'acoes', '[{"tipo":"criar_tarefa","titulo":"A {primeiro_nome}","dono":"responsavel"}]'::jsonb));
  a_ja := (j ->> 'id')::uuid;
  j := public.nx_automacao_salvar('tok-f7-admb', cB, jsonb_build_object('nome', 'Justo B', 'gatilho', 'negocio_criado', 'ativo', true,
    'acoes', '[{"tipo":"criar_tarefa","titulo":"B {primeiro_nome}","dono":"responsavel"}]'::jsonb));
  a_jb := (j ->> 'id')::uuid;
  with c as (insert into public.nx_contatos (cliente_id, nome, telefone)
             select cA, 'Justo ' || g, '1296' || lpad(g::text, 7, '0') from generate_series(1, 60) g returning id)
  insert into public.nx_leads (cliente_id, contato_id, funil_id, origem) select cA, c.id, f_pac, 'whatsapp' from c;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cB, 'Bruna B', '12995550001') returning id into ctB;
  insert into public.nx_leads (cliente_id, contato_id, funil_id, origem) values (cB, ctB, fB, 'whatsapp') returning id into lB;
  j := pg_temp.lote(25);
  perform pg_temp.ok(exists (select 1 from public.nx_tarefas where negocio_id = lB and automacao_id = a_jb),
                     'evento do cliente B não espera o backlog de 60 do cliente A: ' || j::text);
  perform pg_temp.ok((select count(*) from public.nx_tarefas where automacao_id = a_ja) = 24, 'o resto da rodada ficou com o A (24)');
  for i in 1 .. 3 loop perform pg_temp.lote(25); end loop;
  perform pg_temp.ok((select count(*) from public.nx_tarefas where automacao_id = a_ja) = 60
                 and not exists (select 1 from public.nx_eventos where processado_em is null and cliente_id in (cA, cB)),
                     'revezamento não perde nem repete evento (60 tarefas do A)');
  update public.nx_automacoes set ativo = false where id in (a_ja, a_jb);

  -- ---------------------------------------------------------- revisão: revezamento dos gatilhos de TEMPO entre clientes
  -- X (cliente A) tem 85 alvos que NÃO passam na condição e nunca rodou; Y (cliente B) tem 1 alvo e rodou há 1 min
  j := public.nx_automacao_salvar('tok-f7-adm', cA, jsonb_build_object('nome', 'X parado', 'gatilho', 'tempo_no_estagio', 'ativo', true,
    'config', jsonb_build_object('estagio_id', s_nova, 'horas', 1),
    'condicoes', '[{"campo":"origem","op":"igual","valor":"site"}]'::jsonb,
    'acoes', '[{"tipo":"notificar","para":"admins","titulo":"x"}]'::jsonb));
  a_x := (j ->> 'id')::uuid;
  update public.nx_leads set estagio_em = now() - interval '5 hours' where cliente_id = cA and estagio_id = s_nova and origem = 'whatsapp';
  select id into depB from public.nx_departamentos where cliente_id = cB and padrao;
  update public.nx_departamentos set horario = null where cliente_id = cB;
  insert into public.nx_canais (cliente_id, nome, phone_number_id, departamento_id, status)
  values (cB, 'Principal F7 B', 'teste-f7-pid-b', depB, 'ativo') returning id into canB;
  j := public.nx_automacao_salvar('tok-f7-admb', cB, '{"nome":"Y sem resposta","gatilho":"sem_resposta","ativo":true,
     "config":{"minutos":5},"acoes":[{"tipo":"notificar","para":"admins","titulo":"y esperando"}]}');
  a_y := (j ->> 'id')::uuid;
  update public.nx_automacoes set ultima_execucao_em = now() - interval '1 minute' where id = a_y;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, protocolo, status, aguardando, ultima_entrada_em)
  values (cB, canB, ctB, depB, 'F7-B-0001', 'aberta', true, now() - interval '10 minutes') returning id into cvB;
  perform pg_temp.ok((select count(*) from public.nx_leads where cliente_id = cA and estagio_id = s_nova and estagio_em < now() - interval '1 hour') > 25,
                     'X tem mais de 25 alvos');
  perform pg_temp.lote(25);
  perform pg_temp.lote(25);
  perform pg_temp.ok((select count(*) from public.nx_auto_execucoes where automacao_id = a_y) = 1
                 and exists (select 1 from public.nx_notificacoes where conta_id = k_admB and titulo = 'y esperando'),
                     'automação de tempo do cliente B roda na 2ª rodada mesmo com X (A) cheia de alvos que não passam: Y='
                     || (select count(*) from public.nx_auto_execucoes where automacao_id = a_y) || ' X='
                     || (select count(*) from public.nx_auto_execucoes where automacao_id = a_x));
  update public.nx_automacoes set ativo = false where id in (a_x, a_y);

  -- ---------------------------------------------------------- revisão: SLA — cliente suspenso não ocupa as vagas dos outros
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-f7-s', 'Clínica F7 S', 'odonto') returning id into cS;
  select id into fS from public.nx_funis where cliente_id = cS and padrao;
  select id into sS from public.nx_estagios where funil_id = fS and marco = 'agendada';
  update public.nx_estagios set sla_horas = 1 where id in (sS, s_orc);
  with c as (insert into public.nx_contatos (cliente_id, nome, telefone)
             select cS, 'Suspenso ' || g, '1295' || lpad(g::text, 7, '0') from generate_series(1, 30) g returning id)
  insert into public.nx_leads (cliente_id, contato_id, funil_id, estagio_id, origem) select cS, c.id, fS, sS, 'manual' from c;
  update public.nx_leads set estagio_em = now() - interval '5 hours' where cliente_id = cS;
  update public.nx_clientes set status = 'suspenso' where id = cS;
  insert into public.nx_leads (cliente_id, contato_id, funil_id, estagio_id, dono_id, origem) values (cA, ct3, f_pac, s_orc, k_at, 'manual') returning id into lS;
  update public.nx_leads set estagio_em = now() - interval '2 hours' where id = lS;
  perform pg_temp.lote(25);
  perform pg_temp.ok(exists (select 1 from public.nx_notificacoes where tipo = 'sla_etapa' and conta_id = k_at and link = '#/crm/negocio/' || lS),
                     'SLA do cliente ativo sai mesmo com 30 estouros de um cliente suspenso na frente');
  perform pg_temp.ok(not exists (select 1 from public.nx_notificacoes n join public.nx_leads l on n.link = '#/crm/negocio/' || l.id
                                  where n.tipo = 'sla_etapa' and l.cliente_id = cS), 'cliente suspenso não recebe aviso de SLA');
  update public.nx_estagios set sla_horas = null where id in (sS, s_orc);

  -- ---------------------------------------------------------- tempo com volume (§5.1): 5.000 contatos, 5.000 negócios, 20.000 mensagens
  perform set_config('nx.lote', '1', true);
  perform set_config('nx.sem_historico', '1', true);
  insert into public.nx_contatos (cliente_id, nome, telefone)
  select cA, 'Volume ' || g, '1197' || lpad(g::text, 7, '0') from generate_series(1, 5000) g;
  insert into public.nx_leads (cliente_id, contato_id, funil_id, estagio_id, dono_id, origem, consulta_em, estagio_em)
  select cA, k.id, f_pac, case when k.id % 3 = 0 then s_agend else s_nova end, k_at, 'whatsapp',
         case when k.id % 10 = 0 then now() + make_interval(hours => (k.id % 70)::int + 1) end,
         now() - make_interval(hours => (k.id % 100)::int)
    from public.nx_contatos k where k.cliente_id = cA and k.nome like 'Volume %';
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, protocolo, status, aguardando, ultima_entrada_em)
  select cA, can, k.id, dep_rec, 'V-' || k.id, 'aberta', true, now() - make_interval(mins => (k.id % 600)::int)
    from public.nx_contatos k where k.cliente_id = cA and k.nome like 'Volume %' and k.id % 2 = 0;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status)
  select cA, cv.id, cv.contato_id, can, 'in', 'texto', 'mensagem ' || g, 'recebida'
    from public.nx_conversas cv cross join generate_series(1, 8) g
   where cv.cliente_id = cA and cv.protocolo like 'V-%';
  perform set_config('nx.sem_historico', '', true);
  perform pg_temp.ok((select count(*) from public.nx_mensagens where cliente_id = cA) >= 20000, 'volume gerado');
  -- as automações de tempo ligadas ao mesmo tempo, sobre o volume
  update public.nx_automacoes set ativo = true where id in (a_sr, a_te, a_lemb);
  update public.nx_automacoes set ativo = true, config = jsonb_build_object('estagio_id', s_agend, 'horas', 1) where id = a_te;
  t0 := clock_timestamp();
  j := pg_temp.lote(25);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  perform pg_temp.ok(ms < 2000, 'lento nx_auto_lote(25) com volume ' || round(ms) || ' ms · ' || j::text);
  perform pg_temp.ok((j ->> 'tempo_alvos')::int between 1 and 25, 'gatilhos de tempo respeitam o teto de 25 alvos: ' || j::text);
  t0 := clock_timestamp();
  j := public.nx_automacoes_listar('tok-f7-adm', cA);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  perform pg_temp.ok(ms < 2000, 'lento nx_automacoes_listar ' || round(ms) || ' ms');
  t0 := clock_timestamp();
  j := public.nx_automacao_execucoes('tok-f7-adm', cA, a_lote, 50);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  perform pg_temp.ok(ms < 2000 and json_array_length(j) = 50, 'lento nx_automacao_execucoes ' || round(ms) || ' ms');

  -- ---------------------------------------------------------- excluir
  j := public.nx_automacao_excluir('tok-f7-adm', cA, a_self);
  perform pg_temp.ok((j ->> 'ok')::boolean and not exists (select 1 from public.nx_automacoes where id = a_self), 'excluir');

  raise notice 'OK 08_automacoes: todos os casos passaram';
end $t$;

rollback;
