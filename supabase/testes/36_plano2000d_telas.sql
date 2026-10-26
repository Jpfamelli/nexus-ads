-- ============================================================
-- ÓRBITA — supabase/testes/36_plano2000d_telas.sql · smoke de 20261026b_plano2000d_telas.sql (plano 2000d, srv · telas)
--   Início: DS-083/IC-001/DR-270 anúncios · RC-219/DR-218/DR-220/DR-352/DR-353 equipe · RC-339/DS-086/DR-407 esfriando ·
--     RC-338 aniversariantes · DR-328 vendas de anúncio · RC-325 desde o início · RC-187/DR-253 · DR-246 · DR-348 · RC-210 · RC-212
--   Onboarding: DR-263 / DR-334 · Agenda: DS-044 · DC-414/415 · DC-328/394 · DC-412/413 · CC-246 · CC-190 · DS-049
--   Conversas: DS-005 · DS-006 · DS-094 · CRM: DR-033 · DS-050 · DS-062 · DS-097
-- Datas relativas a hoje em São Paulo (não depende da hora do dia). Roda em begin … rollback; termina em raise exception 'OK_36_…'.
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

do $t$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_dia date; v_ts timestamptz;
  org_p uuid; cA uuid; k_adm uuid; k_at uuid; k_res uuid; kM uuid; f1 uuid; f2 uuid; e1 uuid; e2 uuid; e_g uuid;
  t_adm text := 'tok-36-adm-' || sfx; t_at text := 'tok-36-at-' || sfx; t_res text := 'tok-36-res-' || sfx;
  ct bigint; ct2 bigint; ct3 bigint; cv1 bigint; cv2 bigint; cv3 bigint; l1 bigint; l2 bigint; l3 bigint; l4 bigint; l5 bigint;
  tf bigint; tf2 bigint; j json; jb jsonb; jb2 jsonb; n int;
begin
  perform pg_temp.ok(exists (select 1 from public.nx_versao_banco where nome = '20261026b_plano2000d_telas'), 'versão 26b registrada');
  select id into org_p from public.nx_orgs where tipo = 'plataforma' limit 1;
  insert into public.nx_clientes (slug, nome, org_id, vertical, status) values ('t36-' || sfx, 'Teste 36', org_p, 'odonto', 'ativo') returning id into cA;
  update public.nx_clientes set modulos = array(select distinct unnest(coalesce(modulos, '{}'::text[]) || array['crm', 'conversas', 'ads'])) where id = cA;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t36-adm-' || sfx || '@teste.local', 'Alice Admin 36', 'x', 'clinica', true, org_p) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t36-at-' || sfx || '@teste.local', 'Ana Atende 36', 'x', 'clinica', true, org_p) returning id into k_at;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t36-res-' || sfx || '@teste.local', 'Rui Restrito 36', 'x', 'clinica', true, org_p) returning id into k_res;
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas) values (k_adm, cA, 'admin', true), (k_at, cA, 'atendente', true), (k_res, cA, 'atendente', false);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(t_adm), k_adm, now() + interval '1 hour'),
    (public.nx_hash(t_at), k_at, now() + interval '1 hour'), (public.nx_hash(t_res), k_res, now() + interval '1 hour');
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor) values (cA, 'Meta 36', 'pn-36-' || sfx, 'meta') returning id into kM;
  select id into f1 from public.nx_funis where cliente_id = cA and padrao;
  if f1 is null then insert into public.nx_funis (cliente_id, nome, ordem, padrao) values (cA, 'Vendas 36', 0, true) returning id into f1; end if;
  insert into public.nx_funis (cliente_id, nome, ordem) values (cA, 'Pós-venda 36', 1) returning id into f2;
  insert into public.nx_estagios (cliente_id, funil_id, nome, ordem) values (cA, f1, 'Novo', 0) returning id into e1;
  insert into public.nx_estagios (cliente_id, funil_id, nome, ordem) values (cA, f2, 'Retorno', 0) returning id into e2;
  select id into e_g from public.nx_estagios where funil_id = f1 and tipo = 'ganho' order by ordem limit 1;
  if e_g is null then insert into public.nx_estagios (cliente_id, funil_id, nome, ordem, tipo) values (cA, f1, 'Ganho', 9, 'ganho') returning id into e_g; end if;
  insert into public.nx_contatos (cliente_id, nome, telefone, nascimento) values (cA, 'Carla 36', '5512990036001', make_date(2000, extract(month from v_hoje)::int, extract(day from v_hoje)::int)) returning id into ct;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Davi 36', '5512990036002') returning id into ct2;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Elis 36', '5512990036003') returning id into ct3;

  -- ---------------------------------------------------------- Início
  -- negócio parado há 10 dias (esfriando), venda de anúncio hoje, venda por indicação, lead de anúncio do mês
  insert into public.nx_leads (cliente_id, nome, contato_id, titulo, status, funil_id, estagio_id, valor_previsto, dono_id)
  values (cA, 'Neg 36a', ct2, 'Implante 36', 'aberto', f1, e1, 1500, k_at) returning id into l1;
  update public.nx_leads set estagio_em = now() - interval '10 days', criado_em = now() - interval '10 days' where id = l1;
  insert into public.nx_leads (cliente_id, nome, contato_id, titulo, status, valor, plataforma, origem, fechado_em, dono_id, servico, funil_id, estagio_id)
  values (cA, 'Neg 36b', ct3, 'Clareamento 36', 'ganho', 800, 'meta', 'anuncio', now(), k_at, 'Clareamento', f1, e_g) returning id into l2;
  insert into public.nx_leads (cliente_id, nome, contato_id, titulo, status, valor, origem, fechado_em, funil_id, estagio_id)
  values (cA, 'Neg 36c', ct3, 'Limpeza 36', 'ganho', 200, 'indicacao', now(), f1, e_g) returning id into l3;
  insert into public.nx_metricas_dia (cliente_id, plataforma, data, nivel, campanha_ext, gasto) values (cA, 'meta', v_hoje, 'campanha', 'c36', 100);
  insert into public.nx_metas (cliente_id, conta_id, mes, valor) values (cA, k_at, v_mes, 5000);
  jb := public.nx_inicio(t_adm, cA)::jsonb;
  perform pg_temp.ok((jb -> 'conversas' ->> 'prazo_min')::int = 15 and jb -> 'conversas' ? 'respondidas_no_prazo_mes_pct', 'RC-187/DR-253: prazo e «no prazo» do mês');
  perform pg_temp.ok((jb -> 'negocios' ->> 'receita_anuncio_mes')::numeric = 800 and (jb -> 'negocios' ->> 'receita_indicacao_mes')::numeric = 200
                     and (jb -> 'negocios' ->> 'ganhos_indicacao_mes')::int = 1 and jb -> 'negocios' ? 'dias_ate_ganho', 'DS-083/DR-348/DR-402: receita por origem');
  perform pg_temp.ok((jb ->> 'gasto_anuncios_mes')::numeric = 100 and (jb -> 'anuncios' -> 'meta' ->> 'gasto')::numeric = 100
                     and (jb -> 'anuncios' -> 'meta' ->> 'receita')::numeric = 800 and (jb -> 'anuncios' -> 'google' ->> 'gasto')::numeric = 0,
                     'IC-001/DR-270: gasto e retorno por plataforma');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(jb -> 'equipe') x
                              where (x ->> 'conta_id')::uuid = k_at and (x ->> 'meta')::numeric = 5000 and (x ->> 'ganhos')::int = 1
                                and (x ->> 'ganhos_hoje')::int = 1 and (x ->> 'valor_hoje')::numeric = 800 and x ? 'tarefas_hoje' and x ? 'leads')
                     and jsonb_array_length(jb -> 'equipe') = 3, 'RC-219/DR-218/DR-352: equipe com meta e placar de hoje (admin vê todos)');
  perform pg_temp.ok((jb -> 'esfriando' ->> 'total')::int = 1 and (jb -> 'esfriando' ->> 'valor_total')::numeric = 1500
                     and (jb -> 'esfriando' -> 'itens' -> 0 ->> 'dono_id')::uuid = k_at and (jb -> 'esfriando' -> 'itens' -> 0 ->> 'parado_dias')::int >= 9,
                     'RC-339/DS-086/DR-407: esfriando com valor e dono');
  perform pg_temp.ok((jb -> 'aniversariantes' -> 0 ->> 'contato_id')::bigint = ct, 'RC-338: aniversariante de hoje');
  perform pg_temp.ok((jb -> 'ultimas_vendas_anuncio' -> 0 ->> 'id')::bigint = l2 and jsonb_array_length(jb -> 'ultimas_vendas_anuncio') = 1, 'DR-328: só a venda de anúncio');
  perform pg_temp.ok(jb -> 'desde_inicio' ? 'atual' and jb -> 'desde_inicio' ? 'ultimo_fechado' and jb ? 'funil_mes_anterior'
                     and jb -> 'funil_mes' ? 'leads_anuncio' and jb -> 'leads' ? 'ontem_ate_agora' and jb -> 'leads' ? 'semana_meta',
                     'RC-325/RC-218/DR-246/DR-302/RC-233: chaves novas');
  perform pg_temp.ok(jb ->> 'admin_nome' = 'Alice Admin 36', 'RC-212: quem administra');
  perform pg_temp.ok(jb ->> 'versao' = (public.nx_inicio(t_adm, cA)::jsonb ->> 'versao'), 'RC-210: versão estável sem mudança');
  insert into public.nx_tarefas (cliente_id, titulo, dono_id, vence_em) values (cA, 'Ligar 36', k_adm, now() + interval '2 days');
  perform pg_temp.ok(jb ->> 'versao' <> (public.nx_inicio(t_adm, cA)::jsonb ->> 'versao'), 'RC-210: versão muda com os dados');
  -- o esfriando some com tarefa futura marcada
  perform pg_temp.ok(((public.nx_inicio(t_adm, cA)::jsonb) -> 'esfriando' ->> 'total')::int = 1, 'esfriando antes da tarefa do negócio');
  insert into public.nx_tarefas (cliente_id, titulo, dono_id, negocio_id, vence_em) values (cA, 'Retomar 36', k_at, l1, now() + interval '1 day');
  perform pg_temp.ok(((public.nx_inicio(t_adm, cA)::jsonb) -> 'esfriando' ->> 'total')::int = 0, 'DS-086: tarefa futura tira do esfriando');
  -- atendente: sem gasto de anúncio; equipe só a própria linha
  jb := public.nx_inicio(t_at, cA)::jsonb;
  perform pg_temp.ok(not jb ? 'gasto_anuncios_mes' and not jb ? 'anuncios', 'atendente não vê o gasto dos anúncios');
  perform pg_temp.ok(jsonb_array_length(jb -> 'equipe') = 1 and (jb -> 'equipe' -> 0 ->> 'conta_id')::uuid = k_at, 'equipe: o atendente vê a própria linha');

  -- ---------------------------------------------------------- Onboarding (DR-263 / DR-334)
  jb := public.nx_onboarding_estado(t_adm, cA)::jsonb;
  perform pg_temp.ok(jb ? 'dispensado_ate' and jb ->> 'dispensado_ate' is null
                     and exists (select 1 from jsonb_array_elements(jb -> 'itens') x where x ->> 'id' = 'contatos_importados' and (x ->> 'opcional')::boolean)
                     and (jb ->> 'total')::int = 12, 'DR-263/DR-334: item novo e chave dispensado_ate');
  perform public.nx_onboarding_dispensar(t_adm, cA, now() + interval '7 days');
  perform pg_temp.ok((public.nx_onboarding_estado(t_adm, cA)::jsonb ->> 'dispensado_ate') is not null, 'DR-334: dispensado vale para a empresa');
  perform public.nx_onboarding_dispensar(t_adm, cA, null);
  perform pg_temp.ok((public.nx_onboarding_estado(t_adm, cA)::jsonb ->> 'dispensado_ate') is null, 'DR-334: null mostra de novo');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_onboarding_dispensar(%L, %L, null)', t_at, cA)) = 'sem_permissao', 'DR-334: só admin');

  -- ---------------------------------------------------------- Agenda
  v_dia := v_hoje + 3;
  v_ts := (v_dia + time '10:00')::timestamp at time zone 'America/Sao_Paulo';
  insert into public.nx_leads (cliente_id, nome, contato_id, titulo, status, funil_id, estagio_id, dono_id)
  values (cA, 'Neg 36d', ct, 'Consulta 36', 'aberto', f1, e1, k_adm) returning id into l4;
  update public.nx_leads set consulta_em = v_ts where id = l4;
  insert into public.nx_notas (cliente_id, negocio_id, autor_id, texto) values (cA, l4, k_adm, 'Traz os exames 36');
  -- DS-044: observação com o horário que a tela viu
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_obs_salvar(%L, %L, %s, %L, %L)', t_at, cA, l4,
                                         public.nx_agenda_iso(v_ts + interval '1 hour'), 'x')) = 'dados_invalidos|consulta_mudou', 'DS-044: horário mudou → recusa');
  perform public.nx_agenda_obs_salvar(t_at, cA, l4, public.nx_agenda_iso(v_ts), '  Prefere manhã  ');
  perform pg_temp.ok((select campos ->> 'agenda_obs' from public.nx_leads where id = l4) = 'Prefere manhã'
                     and exists (select 1 from public.nx_historico h where h.negocio_id = l4 and h.tipo = 'agenda_obs'), 'DS-044: observação salva e no histórico');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_obs_salvar(%L, %L, %s, null, %L)', t_res, cA, l4, 'y')) = 'negocio_nao_encontrado', 'DS-044: restrito não mexe em negócio alheio');
  -- DC-414 / DC-415: chegou → compareceu (a hora de chegada fica)
  perform public.nx_agenda_presenca(t_at, cA, l4, 'chegou');
  jb := public.nx_agenda_dia(t_adm, cA, v_dia, 1)::jsonb -> 'consultas' -> 0;
  perform pg_temp.ok(jb ->> 'presenca' = 'chegou' and jb ->> 'chegou_em' is not null and jb ->> 'presenca_por_nome' = 'Ana Atende 36'
                     and jb ->> 'presenca_em' is not null, 'DC-414/DC-415: chegou com quem e quando');
  perform public.nx_agenda_presenca(t_at, cA, l4, 'compareceu');
  jb2 := public.nx_agenda_dia(t_adm, cA, v_dia, 1)::jsonb -> 'consultas' -> 0;
  perform pg_temp.ok(jb2 ->> 'presenca' = 'compareceu' and jb2 ->> 'chegou_em' = jb ->> 'chegou_em', 'DC-414: compareceu mantém a chegada');
  perform pg_temp.ok((jb2 ->> 'primeira_vez')::boolean and (jb2 ->> 'aniversario_hoje')::boolean = (to_char(v_dia, 'MM-DD') = to_char(v_hoje, 'MM-DD'))
                     and jb2 ->> 'ultima_nota' = 'Traz os exames 36' and jb2 ->> 'obs' = 'Prefere manhã', 'DC-412/DC-413/CC-246: campos da consulta');
  perform public.nx_agenda_presenca(t_at, cA, l4, 'limpar');
  perform pg_temp.ok(not ((select campos from public.nx_leads where id = l4) ?| array['presenca', 'presenca_em', 'presenca_por', 'chegou_em']), 'limpar tira a presença inteira');
  -- CC-190: o restrito não vê a consulta do admin, mas vê o horário ocupado
  jb := public.nx_agenda_dia(t_res, cA, v_dia, 1)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb -> 'consultas') = 0 and jsonb_array_length(jb -> 'ocupados') = 1
                     and not (jb -> 'ocupados' -> 0 ? 'nome'), 'CC-190: ocupados sem nome para o restrito');
  -- DC-328 / DC-394: marcar (encaixe) grava quando e quem; a presença antiga sai
  update public.nx_leads set consulta_em = null, campos = coalesce(campos, '{}'::jsonb) || '{"presenca":"faltou","presenca_em":"x"}' where id = l4;
  jb := public.nx_agenda_marcar_core(cA, l4, v_ts, null, true, true, null, null, k_at);
  if coalesce((jb ->> 'ok')::boolean, false) then
    jb2 := public.nx_agenda_dia(t_adm, cA, v_dia, 1)::jsonb -> 'consultas' -> 0;
    perform pg_temp.ok(jb2 ->> 'marcado_em' is not null and jb2 ->> 'marcado_por_nome' = 'Ana Atende 36' and jb2 ->> 'presenca' is null
                       and not ((select campos from public.nx_leads where id = l4) ? 'presenca_em'), 'DC-328/DC-394: marcado_em e quem marcou');
  else
    raise exception 'FALHOU: marcar encaixe não deu ok: %', jb;
  end if;
  -- DS-049: 366 dias à frente
  perform public.nx_agenda_config_salvar(t_adm, cA, '{"dias_a_frente":366}'::jsonb);
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_config_salvar(%L, %L, %L)', t_adm, cA, '{"dias_a_frente":367}')) = 'dados_invalidos|dias_a_frente',
                     'DS-049: até 366');

  -- ---------------------------------------------------------- Conversas (DS-005 / DS-006 / DS-094)
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, ultima_entrada_em, nao_lidas)
  values (cA, kM, ct, 'p36a' || sfx, 'aberta', now() - interval '1 minute', 2) returning id into cv1;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, ultima_entrada_em, nao_lidas)
  values (cA, kM, ct2, 'p36b' || sfx, 'aberta', now() - interval '20 minutes', 3) returning id into cv2;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, ultima_entrada_em, nao_lidas, atribuida_a)
  values (cA, kM, ct3, 'p36c' || sfx, 'aberta', now() - interval '30 minutes', 4, k_adm) returning id into cv3;
  perform pg_temp.ok((public.nx_pulso(t_adm, cA)::jsonb ->> 'nao_lidas_total')::int = 9 and (public.nx_pulso(t_adm, cA)::jsonb ->> 'nao_lidas')::int = 3,
                     'DS-094: total de não lidas');
  jb := public.nx_cv_marcar_lida_lote(t_at, cA, array[cv2, cv3])::jsonb;
  perform pg_temp.ok(jb -> 'marcadas' = jsonb_build_array(cv2) and jb -> 'ignoradas' = jsonb_build_array(cv3)
                     and (select nao_lidas from public.nx_conversas where id = cv3) = 4 and (select nao_lidas from public.nx_conversas where id = cv2) = 0,
                     'DS-006: lote marca as minhas/sem dono; a do colega fica');
  jb := public.nx_cv_status_lote(t_at, cA, array[cv1, cv2], 'resolvida',
          jsonb_build_object(cv1::text, (now() - interval '10 minutes')::text, cv2::text, (now() - interval '20 minutes')::text))::jsonb;
  perform pg_temp.ok(jb -> 'resolvidas' = jsonb_build_array(cv2) and (jb -> 'escreveram' -> 0 ->> 'id')::bigint = cv1
                     and (select status from public.nx_conversas where id = cv1) = 'aberta'
                     and (select status from public.nx_conversas where id = cv2) = 'resolvida', 'DS-005: cliente escreveu depois → não resolve');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_status_lote(%L, %L, %L, %L)', t_at, cA, array[cv1]::text, 'aberta')) = 'dados_invalidos|status',
                     'DS-005: reabrir em lote não');
  -- CC-050: a conversa da Carla traz a consulta dela (l4, marcada daqui a 3 dias)
  jb := public.nx_cv_ver(t_adm, cA, cv1)::jsonb -> 'contato' -> 'consultas';
  perform pg_temp.ok(jsonb_array_length(jb) = 1 and (jb -> 0 ->> 'negocio_id')::bigint = l4 and (jb -> 0 ->> 'futura')::boolean, 'CC-050: consultas do contato na lateral');
  -- DS-010: novidades de qualquer aba desde p_desde (o restrito só as que vê)
  jb := public.nx_cv_novidades(t_adm, cA, now() - interval '25 minutes')::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb -> 'itens') = 1 and (jb -> 'itens' -> 0 ->> 'id')::bigint = cv1 and jb ? 'agora', 'DS-010: só a que chegou depois de p_desde');
  perform pg_temp.ok(jsonb_array_length(public.nx_cv_novidades(t_res, cA, now() - interval '1 hour')::jsonb -> 'itens') = 1,
                     'DS-010: restrito vê a sem dono (cv1), não a do colega (cv3)');
  -- DS-011: em volta de uma mensagem antiga
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status)
  select cA, cv1, ct, kM, 'in', 'texto', 'msg 36 ' || g, 'recebida' from generate_series(1, 30) g;
  select id into tf from public.nx_mensagens where conversa_id = cv1 and corpo = 'msg 36 10';
  jb := public.nx_cv_mensagens(p_token => t_adm, p_cliente => cA, p_conversa => cv1, p_em_torno_de => tf, p_limite => 10)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb -> 'itens') = 10 and (jb -> 'itens' -> 5 ->> 'id')::bigint = tf
                     and (jb ->> 'tem_mais')::boolean and (jb ->> 'tem_mais_depois')::boolean, 'DS-011: 5 antes, ela e 4 depois');
  perform pg_temp.ok(jsonb_array_length(public.nx_cv_mensagens(t_adm, cA, cv1)::jsonb -> 'itens') = 30, 'DS-011: a chamada de sempre continua igual');
  -- DS-007: só as conversas pedidas (a resolvida também), respeitando quem a pessoa vê
  jb := public.nx_cv_listar(t_at, cA, jsonb_build_object('ids', jsonb_build_array(cv2, cv3)), 10)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb -> 'itens') = 2 and (jb -> 'itens' -> 0 ->> 'id')::bigint in (cv2, cv3), 'DS-007: filtro por ids');
  perform pg_temp.ok(jsonb_array_length(public.nx_cv_listar(t_res, cA, jsonb_build_object('ids', jsonb_build_array(cv3)), 10)::jsonb -> 'itens') = 0,
                     'DS-007: restrito não recebe a do colega pelo id');
  -- DS-008: «Aguardando» com duas que chegaram no mesmo instante — a 2ª página (antes_id) traz a outra
  update public.nx_conversas set status = 'aberta', aguardando = true, ultima_entrada_em = now() - interval '3 minutes' where id in (cv1, cv2);
  jb := public.nx_cv_listar(t_adm, cA, '{"aba":"aguardando"}'::jsonb, 1)::jsonb;
  jb2 := public.nx_cv_listar(t_adm, cA, jsonb_build_object('aba', 'aguardando', 'antes_id', jb -> 'itens' -> 0 ->> 'id'), 1,
                             (select ultima_entrada_em from public.nx_conversas where id = (jb -> 'itens' -> 0 ->> 'id')::bigint))::jsonb;
  perform pg_temp.ok((jb2 -> 'itens' -> 0 ->> 'id')::bigint in (cv1, cv2) and (jb2 -> 'itens' -> 0 ->> 'id') <> (jb -> 'itens' -> 0 ->> 'id'),
                     'DS-008: o empate não some na 2ª página');

  -- ---------------------------------------------------------- DS-004 / DC-007: contato com a versão que a tela leu
  perform public.nx_contato_salvar(t_at, cA, jsonb_build_object('id', ct2, 'nome', 'Davi Novo 36',
            'versao_esperada', (select atualizado_em from public.nx_contatos where id = ct2)));
  perform pg_temp.ok((select nome from public.nx_contatos where id = ct2) = 'Davi Novo 36', 'DS-004: versão certa salva');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contato_salvar(%L, %L, %L::jsonb)', t_at, cA,
            jsonb_build_object('id', ct2, 'nome', 'Davi Velho', 'versao_esperada', now() - interval '1 minute'))) = 'versao_antiga|Davi Novo 36',
            'DS-004: versão velha → versao_antiga com o nome atual');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contato_salvar(%L, %L, %L::jsonb)', t_at, cA,
            jsonb_build_object('id', ct2, 'nome', 'Sem versão'))) = 'ok', 'DS-004: sem versão (tela antiga) salva como antes');

  -- DS-090: o mesmo no negócio
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_salvar(%L, %L, %L::jsonb)', t_adm, cA,
            jsonb_build_object('id', l1, 'titulo', 'Outro', 'versao_esperada', now() - interval '1 minute'))) = 'versao_antiga|Implante 36',
            'DS-090: negócio com versão velha → versao_antiga');
  perform public.nx_negocio_salvar(t_adm, cA, jsonb_build_object('id', l1, 'titulo', 'Implante 36b', 'versao_esperada', (select atualizado_em from public.nx_leads where id = l1)));
  perform pg_temp.ok((select titulo from public.nx_leads where id = l1) = 'Implante 36b', 'DS-090: versão certa salva');
  -- DS-321: o campo personalizado não mexe nas marcas da agenda
  update public.nx_leads set campos = coalesce(campos, '{}'::jsonb) || '{"agenda_obs":"manter","presenca":"compareceu"}' where id = l1;
  perform public.nx_negocio_salvar(t_adm, cA, jsonb_build_object('id', l1, 'campos', jsonb_build_object('convenio', 'Unimed', 'agenda_obs', null, 'presenca', 'faltou')));
  perform pg_temp.ok((select campos ->> 'agenda_obs' = 'manter' and campos ->> 'presenca' = 'compareceu' and campos ->> 'convenio' = 'Unimed'
                        from public.nx_leads where id = l1), 'DS-321: campos personalizados não apagam a agenda');

  -- ---------------------------------------------------------- CRM (DR-033 / DS-050 / DS-062 / DS-097)
  insert into public.nx_leads (cliente_id, nome, titulo, status, funil_id, estagio_id, dono_id)
  values (cA, 'Neg 36e', 'Implante pós 36', 'aberto', f2, e2, k_adm) returning id into l5;
  jb := public.nx_negocios_buscar_funis(t_adm, cA, 'implante')::jsonb -> 'funis';
  perform pg_temp.ok(jsonb_array_length(jb) = 2 and exists (select 1 from jsonb_array_elements(jb) x where (x ->> 'funil_id')::uuid = f2 and (x ->> 'n')::int = 1),
                     'DR-033: contagem por funil');
  jb := public.nx_negocios_buscar_funis(t_res, cA, 'implante')::jsonb -> 'funis';
  perform pg_temp.ok(jsonb_array_length(jb) = 0, 'DR-033: restrito não conta negócio alheio');
  perform pg_temp.ok((public.nx_buscar(t_adm, cA, 'Consulta 36')::jsonb -> 'negocios' -> 0) ? 'presenca', 'DS-050: busca com presença');
  -- DS-097: tarefa dada por outra pessoa avisa; a própria não
  perform set_config('nx.conta', k_adm::text, true);
  insert into public.nx_tarefas (cliente_id, titulo, dono_id, vence_em) values (cA, 'Confirmar 36', k_at, now() - interval '2 days') returning id into tf;
  insert into public.nx_tarefas (cliente_id, titulo, dono_id) values (cA, 'Minha 36', k_adm);
  perform pg_temp.ok(exists (select 1 from public.nx_notificacoes x where x.conta_id = k_at and x.tipo = 'tarefa' and x.titulo like '%Confirmar 36%')
                     and not exists (select 1 from public.nx_notificacoes x where x.conta_id = k_adm and x.titulo like '%Minha 36%'), 'DS-097: aviso só para quem recebe de outro');
  -- DS-062: repetir semanal; concluir cria a próxima uma vez só, no futuro
  j := public.nx_tarefa_repetir(t_adm, cA, tf, 'semanal');
  perform pg_temp.ok(j::jsonb ->> 'repetir' = 'semanal', 'DS-062: repetir gravado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_tarefa_repetir(%L, %L, %s, %L)', t_adm, cA, tf, 'anual')) = 'dados_invalidos|repetir', 'DS-062: só diaria/semanal/mensal');
  perform public.nx_tarefa_concluir(t_adm, cA, tf, true);
  select id into tf2 from public.nx_tarefas where origem_id = tf;
  perform pg_temp.ok(tf2 is not null and (select vence_em > now() and repetir = 'semanal' and dono_id = k_at and concluida_em is null from public.nx_tarefas where id = tf2),
                     'DS-062: a próxima nasce no futuro');
  perform public.nx_tarefa_concluir(t_adm, cA, tf, false);
  perform public.nx_tarefa_concluir(t_adm, cA, tf, true);
  perform pg_temp.ok((select count(*) from public.nx_tarefas where origem_id = tf) = 1, 'DS-062: reconcluir não duplica');
  -- DS-306: plano/status mudados por qualquer caminho ficam na auditoria (aqui: à mão, sem sessão → «sistema»)
  perform set_config('nx.conta', '', true);
  update public.nx_clientes set status = 'suspenso', motivo_status = 'cobranca' where id = cA;
  perform pg_temp.ok(exists (select 1 from public.nx_auditoria a where a.cliente_id = cA and a.acao = 'plano_status'
                              and a.dados -> 'de' ->> 'status' = 'ativo' and a.dados -> 'para' ->> 'status' = 'suspenso'
                              and a.dados ->> 'por' = 'sistema' and a.dados ->> 'motivo' = 'cobranca'), 'DS-306: mudança de status auditada');
  update public.nx_clientes set nome = 'Teste 36 renomeado' where id = cA;
  perform pg_temp.ok((select count(*) from public.nx_auditoria a where a.cliente_id = cA and a.acao = 'plano_status') = 1, 'DS-306: outras colunas não auditam');
  update public.nx_clientes set status = 'ativo', motivo_status = null where id = cA;
  -- DU-113 / DU-396: histórico de acessos e alterações recentes (só admin; nomes resolvidos; sem segredo)
  insert into public.nx_auditoria (cliente_id, conta_id, acao, dados) values
    (cA, k_adm, 'papel', jsonb_build_object('conta', k_at, 'de', 'atendente', 'para', 'supervisor')),
    (cA, k_adm, 'canal_alterado', jsonb_build_object('canal', 1, 'token', true)),
    (cA, k_adm, 'config_salva', '{"chaves":["tema"]}'::jsonb);
  jb := public.nx_auditoria_listar(t_adm, cA, 'equipe', 10)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb) = 1 and jb -> 0 ->> 'acao' = 'papel_trocado' and jb -> 0 ->> 'quem' = 'Alice Admin 36'
                     and jb -> 0 ->> 'alvo' = 'Ana Atende 36' and jb -> 0 -> 'detalhe' ->> 'para' = 'supervisor' and jb -> 0 ->> 'em' is not null,
                     'DU-113: equipe com quem/alvo/detalhe: ' || jb::text);
  jb := public.nx_auditoria_listar(t_adm, cA, 'config', 10)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb) >= 3 and not (jb::text like '%"token"%')
                     and exists (select 1 from jsonb_array_elements(jb) x where x ->> 'acao' = 'plano_status'),
                     'DU-396: config sem o booleano do token, com plano/status: ' || jb::text);
  -- plano 2000d · REV-M5: em «cliente_alterado» o admin da empresa (e o gestor da revenda) não vê limites, pacote comercial nem org;
  -- a plataforma vê tudo
  declare k_sup36 uuid; t_sup36 text := 'tok-36-sup-' || sfx;
  begin
    insert into public.nx_auditoria (org_id, cliente_id, conta_id, acao, dados) values (org_p, cA, k_adm, 'cliente_alterado',
      jsonb_build_object('status', jsonb_build_array('teste', 'ativo'), 'limites', '{"contatos":500}'::jsonb,
                         'pacote_comercial', '{"pacote":"ultra"}'::jsonb, 'org', org_p));
    jb := public.nx_auditoria_listar(t_adm, cA, 'config', 20)::jsonb;
    perform pg_temp.ok(exists (select 1 from jsonb_array_elements(jb) x where x ->> 'acao' = 'cliente_alterado'
                                 and x -> 'detalhe' ? 'status' and not (x -> 'detalhe' ?| array['limites', 'pacote_comercial', 'org', 'org_id'])),
                       'REV-M5: admin não vê os dados internos de cliente_alterado: ' || jb::text);
    insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t36-sup-' || sfx || '@teste.local', 'Super 36', 'x', 'gestor', true, org_p) returning id into k_sup36;
    insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(t_sup36), k_sup36, now() + interval '1 hour');
    jb := public.nx_auditoria_listar(t_sup36, cA, 'config', 20)::jsonb;
    perform pg_temp.ok(exists (select 1 from jsonb_array_elements(jb) x where x ->> 'acao' = 'cliente_alterado'
                                 and x -> 'detalhe' ?& array['limites', 'pacote_comercial', 'org']), 'REV-M5: a plataforma vê tudo');
  end;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_auditoria_listar(%L, %L, %L, 5)', t_at, cA, 'equipe')) = 'sem_permissao', 'DU-113: só admin');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_auditoria_listar(%L, %L, %L, 5)', t_adm, cA, 'tudo')) like 'tipo_invalido%', 'DU-113: tipo inválido');
  -- DS-037 / RC-315: quem bloqueou e quando; desbloquear limpa
  perform set_config('nx.conta', k_adm::text, true);
  update public.nx_contatos set bloqueado = true where id = ct3;
  perform pg_temp.ok((select bloqueado_por = k_adm and bloqueado_em is not null from public.nx_contatos where id = ct3), 'DS-037: bloqueio carimbado');
  perform pg_temp.ok((public.nx_crm_contato_json(cA, ct3) ->> 'bloqueado_por')::uuid = k_adm, 'DS-037: a ficha do contato leva bloqueado_por');
  update public.nx_contatos set bloqueado = false where id = ct3;
  perform pg_temp.ok((select bloqueado_por is null and bloqueado_em is null from public.nx_contatos where id = ct3), 'DS-037: desbloquear limpa');
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_cv_status_lote(text, uuid, bigint[], text, jsonb)', 'execute')
                     and not has_function_privilege('anon', 'public.nx_tg_tarefa_repetir()', 'execute'), 'permissões das novas');

  raise exception 'OK_36_PLANO2000D_TELAS — início, onboarding, agenda, conversas em lote e CRM';
end $t$;
rollback;
