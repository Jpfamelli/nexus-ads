-- ============================================================
-- ÓRBITA — supabase/testes/11_agenda_rastreio.sql · agenda da IA + rastreio de campanha
-- Smoke do arquivo 20260929b_agenda_rastreio.sql (depende de 20260929a_codewords.sql):
--   AGENDA: configuração (admin-only, validada), horários livres (horário do departamento,
--   almoço, capacidade, antecedência, bloqueios, duração por serviço, 12 no máximo / 4 por dia),
--   marcar/remarcar/cancelar pela IA e pelo painel (horario_ocupado além da capacidade,
--   fora_do_horario, antecedencia, passado, ja_agendada, encaixe), fuso America/Sao_Paulo,
--   visão restrita, agenda do dia e isolamento entre clientes.
--   RASTREIO: código curto (anon, chave errada não revela, limite de taxa), atribuição na 1ª
--   mensagem (google/meta/site, nome da campanha vindo de nx_metricas_dia, gclid), anúncio
--   existente nunca sobrescrito, "origem" da IA respeita anúncio, código de outro cliente/telefone
--   e expirado, permissões.
-- A corrida real (duas transações ao mesmo tempo) é serializada pelo advisory lock por cliente
-- dentro de nx_agenda_marcar_core; aqui a ocupação é provada em sequência.
-- Roda em begin … rollback. O bloco principal SEMPRE termina em exceção:
--   'OK_11_AGENDA_RASTREIO …' = todos os casos passaram · 'FALHOU: <caso>' = falha
-- Chaves e números são sintéticos; nada chama o CodeWords.
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

-- negócio aberto do telefone
create or replace function pg_temp.neg(p_cli uuid, p_tel text) returns bigint language sql as $f$
  select l.id from public.nx_leads l where l.cliente_id = p_cli and l.telefone = p_tel order by l.id desc limit 1
$f$;

do $t$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  cA uuid; cB uuid; k_adm uuid; k_at uuid; k_admb uuid; kA uuid; j json; r json; jb jsonb;
  chave_teste text := 'cwk-teste-sintetica-' || md5(random()::text);
  tA text := 'tok-ag-adm-' || sfx; tAt text := 'tok-ag-at-' || sfx; tB text := 'tok-ag-admb-' || sfx;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_qua date; v_dom date; v_sab date; v_ts timestamptz;
  t1 text := '5512988880011'; t2 text := '5512988880012'; t3 text := '5512988880013'; t4 text := '5512988880014';
  t5 text := '5512988880015'; tB1 text := '5512977770021';
  n1 bigint; n2 bigint; n3 bigint; n4 bigint; n5 bigint; nB bigint; n int; l public.nx_leads; jb_card jsonb;
  bq bigint; bq2 bigint;
  chave text; c1 text; c2 text; c3 text; c4 text; c5 text; c6 text; c7 text; c8 text;
  tg text := '5512966660031'; tg2 text := '5512966660032'; tm text := '5512966660033'; tf text := '5512966660034';
  ts text := '5512966660035'; tfb text := '5512966660036'; tn text := '5512966660037'; tx text := '5512966660038';
  te text := '5512966660039';
begin
  -- ---------------------------------------------------------- fixtures
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-ag-a-' || sfx, 'Teste Agenda A', 'odonto') returning id into cA;
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-ag-b-' || sfx, 'Teste Agenda B', 'odonto') returning id into cB;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-ag-adm-' || sfx || '@teste.local', 'Ana Admin', 'x', 'clinica', true) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-ag-at-' || sfx || '@teste.local', 'Beto Atende', 'x', 'clinica', true) returning id into k_at;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-ag-admb-' || sfx || '@teste.local', 'Dora Admin B', 'x', 'clinica', true) returning id into k_admb;
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas, departamentos, recebe_conversas) values
    (k_adm, cA, 'admin', true, '{}', false), (k_at, cA, 'atendente', false, '{}', false), (k_admb, cB, 'admin', true, '{}', false);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash(tA), k_adm, now() + interval '1 hour'), (public.nx_hash(tAt), k_at, now() + interval '1 hour'),
    (public.nx_hash(tB), k_admb, now() + interval '1 hour');
  j := public.nx_codewords_canal_salvar(tA, cA, jsonb_build_object('nome', 'WhatsApp A', 'numero', '+5512991230001', 'codewords_api_key', chave_teste));
  kA := (j -> 'canal' ->> 'id')::uuid;

  -- datas de teste: uma quarta-feira, um domingo e um sábado a partir de hoje + 3
  v_qua := v_hoje + 3; while extract(dow from v_qua) <> 3 loop v_qua := v_qua + 1; end loop;
  v_dom := v_hoje + 3; while extract(dow from v_dom) <> 0 loop v_dom := v_dom + 1; end loop;
  v_sab := v_hoje + 3; while extract(dow from v_sab) <> 6 loop v_sab := v_sab + 1; end loop;

  -- ---------------------------------------------------------- 0. rótulos e fuso
  perform pg_temp.ok(public.nx_agenda_rotulo('2026-10-07 12:00:00+00'::timestamptz) = 'qua 07/10 às 09:00', 'rótulo em São Paulo (12:00Z = 09:00, quarta)');
  perform pg_temp.ok(public.nx_agenda_iso('2026-10-07 09:00:00-03'::timestamptz) = '2026-10-07T12:00:00Z', 'ISO em UTC');
  perform pg_temp.ok(public.nx_agenda_rotulo('2026-10-08 01:30:00+00'::timestamptz) = 'qua 07/10 às 22:30', 'virada de dia: 01:30Z ainda é quarta 22:30 em SP');

  -- ---------------------------------------------------------- 1. configuração
  j := public.nx_agenda_config_ver(tAt, cA);
  perform pg_temp.ok(j -> 'config' ->> 'horario_fonte' = 'departamento' and (j -> 'config' ->> 'duracao_min')::int = 30
    and (j -> 'config' ->> 'capacidade')::int = 1 and (j -> 'config' ->> 'antecedencia_horas')::int = 2
    and (j -> 'config' ->> 'dias_a_frente')::int = 30 and j ->> 'fuso' = 'America/Sao_Paulo'
    and j -> 'config' -> 'horario' -> '1' -> 0 ->> 0 = '08:00', 'padrões: horário do departamento, 30 min, 1 por vez, 2 h, 30 dias');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_config_salvar(%L,%L,%L)', tAt, cA, '{"capacidade":2}')) = 'sem_permissao', 'atendente não configura a agenda');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_config_ver(%L,%L)', tB, cA)) = 'sem_acesso', 'admin de B não lê a config de A');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_config_salvar(%L,%L,%L)', tA, cA, '{"duracao_min":3}')) = 'dados_invalidos|duracao_min', 'duração fora de 5..480');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_config_salvar(%L,%L,%L)', tA, cA, '{"capacidade":0}')) = 'dados_invalidos|capacidade', 'capacidade mínima 1');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_config_salvar(%L,%L,%L)', tA, cA, '{"antecedencia_horas":9999}')) = 'dados_invalidos|antecedencia_horas', 'antecedência até 720 h');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_config_salvar(%L,%L,%L)', tA, cA, '{"dias_a_frente":0}')) = 'dados_invalidos|dias_a_frente', 'janela mínima 1 dia');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_config_salvar(%L,%L,%L)', tA, cA, '{"horario":{"1":[["18:00","08:00"]]}}')) = 'dados_invalidos|horario', 'horário com início depois do fim');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_config_salvar(%L,%L,%L)', tA, cA, '{"horario":{"9":[]}}')) = 'dados_invalidos|horario', 'dia da semana fora de 0..6');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_config_salvar(%L,%L,%L)', tA, cA, '{"intervalos":[["25:00","26:00"]]}')) = 'dados_invalidos|intervalos', 'intervalo com hora inválida');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_config_salvar(%L,%L,%L)', tA, cA, '{"duracoes":{"limpeza":2}}')) = 'dados_invalidos|duracoes', 'duração de serviço fora de 5..480');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_config_salvar(%L,%L,%L)', tA, cA, '["x"]')) = 'dados_invalidos|config', 'config precisa ser objeto');
  j := public.nx_agenda_config_salvar(tA, cA, '{"duracao_min":30,"capacidade":1,"antecedencia_horas":2,"dias_a_frente":30,
      "intervalos":[["12:00","13:30"]],"duracoes":{"Limpeza":60}}');
  perform pg_temp.ok(j -> 'config' -> 'duracoes' ->> 'limpeza' = '60' and j -> 'config' -> 'intervalos' -> 0 ->> 1 = '13:30', 'config salva (serviço em minúsculas)');

  -- negócios de teste (o gatilho cria contato e etapa 'nova')
  perform public.nx_lead_webhook(cA, t1, array[t1], 'Paula Um', null, v_hoje, 30);
  perform public.nx_lead_webhook(cA, t2, array[t2], 'Bia Dois', null, v_hoje, 30);
  perform public.nx_lead_webhook(cA, t3, array[t3], 'Caio Três', null, v_hoje, 30);
  perform public.nx_lead_webhook(cA, t4, array[t4], 'Duda Quatro', null, v_hoje, 30);
  perform public.nx_lead_webhook(cA, t5, array[t5], 'Edu Cinco', null, v_hoje, 30);
  perform public.nx_lead_webhook(cB, tB1, array[tB1], 'Bruna do B', null, v_hoje, 30);
  n1 := pg_temp.neg(cA, t1); n2 := pg_temp.neg(cA, t2); n3 := pg_temp.neg(cA, t3); n4 := pg_temp.neg(cA, t4); n5 := pg_temp.neg(cA, t5);
  nB := pg_temp.neg(cB, tB1);
  perform pg_temp.ok(n1 is not null and n5 is not null and nB is not null, 'negócios criados');

  -- ---------------------------------------------------------- 2. horários livres (painel)
  j := public.nx_agenda_livres(tAt, cA, v_qua, 1);
  jb := j::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb -> 'horarios') = 17, 'quarta 08–18 com almoço 12:00–13:30: 8 de manhã + 9 à tarde = 17');
  perform pg_temp.ok(jb -> 'horarios' -> 0 ->> 'inicio' = public.nx_agenda_iso((v_qua + time '08:00') at time zone 'America/Sao_Paulo')
    and jb -> 'horarios' -> 0 ->> 'rotulo' like '%às 08:00'
    and jb -> 'horarios' -> 16 ->> 'inicio' = public.nx_agenda_iso((v_qua + time '17:30') at time zone 'America/Sao_Paulo'), 'primeiro 08:00, último 17:30 (SP)');
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(jb -> 'horarios') h
    where (h ->> 'rotulo') ~ 'às (12:00|12:30|13:00)$'), 'almoço não é oferecido (13:00 terminaria às 13:30, dentro do almoço)');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(jb -> 'horarios') h where (h ->> 'rotulo') like '%às 11:30')
    and exists (select 1 from jsonb_array_elements(jb -> 'horarios') h where (h ->> 'rotulo') like '%às 13:30'), '11:30 e 13:30 cabem');
  perform pg_temp.ok((select bool_and((h ->> 'capacidade')::int = 1 and (h ->> 'ocupados')::int = 0 and (h ->> 'livre')::boolean)
                        from jsonb_array_elements(jb -> 'horarios') h), 'nada ocupado ainda');
  perform pg_temp.ok(jsonb_array_length((public.nx_agenda_livres(tAt, cA, v_qua, 1, 'Limpeza')::jsonb) -> 'horarios') = 8,
    'serviço de 60 min: passo de 60 (08–11 e 13:30–16:30 = 8)');
  perform pg_temp.ok(jsonb_array_length((public.nx_agenda_livres(tAt, cA, v_dom, 1)::jsonb) -> 'horarios') = 0, 'domingo fechado');
  perform pg_temp.ok(jsonb_array_length((public.nx_agenda_livres(tAt, cA, v_sab, 1)::jsonb) -> 'horarios') = 8, 'sábado 08:00–12:00: 8 horários de 30 min');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_livres(%L,%L,%L,1)', tB, cA, v_qua)) = 'sem_acesso', 'livres de outro cliente');
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements((public.nx_agenda_livres(tAt, cA, v_hoje - 5, 1)::jsonb) -> 'horarios') h
    where (h ->> 'inicio')::timestamptz < now() + interval '2 hours'), 'passado e antecedência: nada antes de agora + 2 h é oferecido');

  -- IA: até 4 por dia e 12 no total; fuso no contrato
  j := public.nx_agenda_livres_ia(kA, t1, null, v_qua, 1);
  perform pg_temp.ok((j ->> 'ok')::boolean and j ->> 'fuso' = 'America/Sao_Paulo' and json_array_length(j -> 'horarios') = 4
    and j -> 'horarios' -> 0 ->> 'rotulo' like '%às 08:00', 'IA: 1 dia = 4 horários (08:00, 08:30, 09:00, 09:30)');
  j := public.nx_agenda_livres_ia(kA, null, null, v_qua, 14);
  perform pg_temp.ok(json_array_length(j -> 'horarios') = 12, 'IA: no máximo 12 horários');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_livres_ia(%L,%L)', gen_random_uuid(), t1)) = 'canal_nao_encontrado', 'canal inexistente');

  -- ---------------------------------------------------------- 3. marcar pela IA
  v_ts := (v_qua + time '09:00') at time zone 'America/Sao_Paulo';
  r := public.nx_agenda_marcar_ia(kA, t1, v_ts, 'Avaliação', null, 'primeira consulta', false);
  perform pg_temp.ok((r ->> 'ok')::boolean and r -> 'consulta' ->> 'inicio' = public.nx_agenda_iso(v_ts) and r -> 'consulta' ->> 'rotulo' like '%às 09:00'
    and r -> 'consulta' ->> 'servico' = 'Avaliação' and (r ->> 'negocio_id')::bigint = n1 and not (r ->> 'remarcada')::boolean, 'IA marca 09:00');
  select * into l from public.nx_leads where id = n1;
  perform pg_temp.ok(l.consulta_em = v_ts and l.status = 'aberto' and l.data_consulta = v_qua and l.servico = 'Avaliação' and l.data_agenda is not null
    and (select marco from public.nx_estagios where id = l.estagio_id) = 'agendada', 'negócio na etapa "agendada", data_consulta em SP');
  perform pg_temp.ok(exists (select 1 from public.nx_notas where negocio_id = n1 and texto like 'IA: Consulta marcada para % às 09:00 (Avaliação). primeira consulta'), 'nota da IA registra a consulta');
  perform pg_temp.ok(exists (select 1 from public.nx_notificacoes where cliente_id = cA and titulo like 'Consulta marcada pela IA:%'), 'equipe é avisada');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_marcar_ia(%L,%L,null)', kA, t1)) = 'dados_invalidos|inicio', 'início nulo');

  -- capacidade 1: o mesmo horário e os que se sobrepõem → horario_ocupado (com sugestões que não repetem o pedido)
  r := public.nx_agenda_marcar_ia(kA, t2, v_ts, null, null, null, false);
  perform pg_temp.ok(not (r ->> 'ok')::boolean and r ->> 'erro' = 'horario_ocupado' and json_array_length(r -> 'sugestoes') between 1 and 4
    and not exists (select 1 from json_array_elements(r -> 'sugestoes') s where s ->> 'inicio' = public.nx_agenda_iso(v_ts)), 'segunda conversa no mesmo horário → horario_ocupado + sugestões');
  perform pg_temp.ok((public.nx_agenda_marcar_ia(kA, t2, v_ts + interval '15 minutes', null, null, null, false) ->> 'erro') = 'horario_ocupado', '09:15 sobrepõe 09:00–09:30');
  perform pg_temp.ok(not exists (select 1 from public.nx_leads where id = n2 and consulta_em is not null), 'quem levou horario_ocupado não ficou marcado');
  perform pg_temp.ok(((public.nx_agenda_livres(tAt, cA, v_qua, 1)::jsonb) -> 'horarios' -> 2 ->> 'livre')::boolean is false
    and ((public.nx_agenda_livres(tAt, cA, v_qua, 1)::jsonb) -> 'horarios' -> 2 ->> 'ocupados') = '1', 'painel mostra 09:00 ocupado (1/1)');
  perform pg_temp.ok(not exists (select 1 from json_array_elements(public.nx_agenda_livres_ia(kA, t2, null, v_qua, 1) -> 'horarios') h
    where h ->> 'inicio' = public.nx_agenda_iso(v_ts)), 'IA não oferece mais o horário ocupado');
  -- 09:30 começa quando a outra termina: cabe
  r := public.nx_agenda_marcar_ia(kA, t2, v_ts + interval '30 minutes', 'Limpeza', 'Bia Dois', null, false);
  perform pg_temp.ok((r ->> 'ok')::boolean and (r -> 'consulta' ->> 'duracao_min')::int = 60, '09:30 cabe (limpeza de 60 min)');
  -- limpeza 09:30–10:30 ocupa o slot 10:00 também
  perform pg_temp.ok((public.nx_agenda_marcar_ia(kA, t3, v_ts + interval '60 minutes', null, null, null, false) ->> 'erro') = 'horario_ocupado',
    'duração por serviço: 10:00 cai dentro da limpeza de 09:30–10:30');

  -- capacidade 2
  perform public.nx_agenda_config_salvar(tA, cA, '{"capacidade":2}');
  r := public.nx_agenda_marcar_ia(kA, t3, v_ts, null, null, null, false);
  perform pg_temp.ok((r ->> 'ok')::boolean, 'capacidade 2: segundo paciente às 09:00');
  r := public.nx_agenda_marcar_ia(kA, t4, v_ts, null, null, null, false);
  perform pg_temp.ok(r ->> 'erro' = 'horario_ocupado', 'capacidade 2: terceiro paciente às 09:00 → horario_ocupado');

  -- erros de horário
  r := public.nx_agenda_marcar_ia(kA, t4, ((v_hoje - 1) + time '10:00') at time zone 'America/Sao_Paulo', null, null, null, false);
  perform pg_temp.ok(r ->> 'erro' = 'passado', 'ontem → passado');
  r := public.nx_agenda_marcar_ia(kA, t4, now() + interval '1 hour', null, null, null, false);
  perform pg_temp.ok(r ->> 'erro' = 'antecedencia', 'daqui a 1 h com antecedência de 2 h → antecedencia');
  perform pg_temp.ok((public.nx_agenda_marcar_ia(kA, t4, (v_dom + time '10:00') at time zone 'America/Sao_Paulo', null, null, null, false) ->> 'erro') = 'fora_do_horario', 'domingo → fora_do_horario');
  perform pg_temp.ok((public.nx_agenda_marcar_ia(kA, t4, (v_qua + time '12:00') at time zone 'America/Sao_Paulo', null, null, null, false) ->> 'erro') = 'fora_do_horario', 'almoço → fora_do_horario');
  perform pg_temp.ok((public.nx_agenda_marcar_ia(kA, t4, (v_qua + time '07:30') at time zone 'America/Sao_Paulo', null, null, null, false) ->> 'erro') = 'fora_do_horario', 'antes de abrir → fora_do_horario');
  perform pg_temp.ok((public.nx_agenda_marcar_ia(kA, t4, (v_qua + time '17:45') at time zone 'America/Sao_Paulo', null, null, null, false) ->> 'erro') = 'fora_do_horario', 'terminaria depois de fechar → fora_do_horario');
  perform pg_temp.ok((public.nx_agenda_marcar_ia(kA, t4, (v_sab + time '11:45') at time zone 'America/Sao_Paulo', null, null, null, false) ->> 'erro') = 'fora_do_horario', 'sábado 11:45 terminaria às 12:15');
  perform pg_temp.ok((public.nx_agenda_marcar_ia(kA, t4, ((v_hoje + 40) + time '10:00') at time zone 'America/Sao_Paulo', null, null, null, false) ->> 'erro') = 'fora_do_horario', 'além de 30 dias → fora_do_horario');
  perform pg_temp.ok(json_array_length(public.nx_agenda_marcar_ia(kA, t4, (v_dom + time '10:00') at time zone 'America/Sao_Paulo', null, null, null, false) -> 'sugestoes') > 0, 'erro de horário devolve sugestões');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_marcar_ia(%L,%L,%L)', kA, '5512900000000', now() + interval '3 days')) = 'ok'
    and (public.nx_agenda_marcar_ia(kA, '5512900000000', now() + interval '3 days') ->> 'erro') = 'contato_nao_encontrado', 'telefone sem contato → contato_nao_encontrado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_marcar_ia(%L,%L,%L)', kA, '123', now() + interval '3 days')) = 'dados_invalidos|telefone', 'telefone inválido');

  -- já agendada / remarcar
  r := public.nx_agenda_marcar_ia(kA, t1, v_ts + interval '30 minutes', null, null, null, false);
  perform pg_temp.ok(r ->> 'erro' = 'ja_agendada' and r -> 'consulta' ->> 'inicio' = public.nx_agenda_iso(v_ts), 'agendar de novo com consulta futura → ja_agendada');
  r := public.nx_agenda_marcar_ia(kA, t1, (v_qua + time '14:00') at time zone 'America/Sao_Paulo', null, null, 'pediu à tarde', true);
  perform pg_temp.ok((r ->> 'ok')::boolean and (r ->> 'remarcada')::boolean and r -> 'anterior' ->> 'inicio' = public.nx_agenda_iso(v_ts)
    and r -> 'consulta' ->> 'rotulo' like '%às 14:00', 'remarcar 09:00 → 14:00');
  select * into l from public.nx_leads where id = n1;
  perform pg_temp.ok(l.consulta_em = (v_qua + time '14:00') at time zone 'America/Sao_Paulo' and l.data_consulta = v_qua and l.status = 'aberto', 'consulta atualizada');
  perform pg_temp.ok(exists (select 1 from public.nx_notas where negocio_id = n1 and texto like 'IA: Consulta remarcada de % às 09:00 para % às 14:00%'), 'nota de remarcação');
  r := public.nx_agenda_marcar_ia(kA, t1, (v_qua + time '14:00') at time zone 'America/Sao_Paulo', null, null, null, true);
  perform pg_temp.ok((r ->> 'ok')::boolean and not (r ->> 'mudou')::boolean, 'remarcar para o mesmo horário não muda nada');
  -- o 09:00 liberou uma vaga (só t3 ficou): agora t4 cabe
  perform pg_temp.ok(((public.nx_agenda_marcar_ia(kA, t4, v_ts, null, null, null, false)) ->> 'ok')::boolean, 'horário liberado pela remarcação volta a ser oferecido');

  -- ---------------------------------------------------------- 4. cancelar pela IA
  r := public.nx_agenda_desmarcar_ia(kA, t3, 'desistiu');
  perform pg_temp.ok((r ->> 'ok')::boolean and r -> 'cancelada' ->> 'inicio' = public.nx_agenda_iso(v_ts) and (r ->> 'voltou_para_nova')::boolean, 'IA cancela');
  select * into l from public.nx_leads where id = n3;
  perform pg_temp.ok(l.consulta_em is null and l.data_consulta is null and l.status = 'aberto'
    and (select marco from public.nx_estagios where id = l.estagio_id) = 'nova', 'cancelada: sem data, volta para "nova", segue aberto');
  perform pg_temp.ok(exists (select 1 from public.nx_notas where negocio_id = n3 and texto like 'IA: Consulta de % às 09:00 cancelada: desistiu'), 'nota de cancelamento');
  perform pg_temp.ok((public.nx_agenda_desmarcar_ia(kA, t3, null) ->> 'erro') = 'consulta_nao_encontrada', 'cancelar sem consulta');
  perform pg_temp.ok((public.nx_agenda_desmarcar_ia(kA, '5512900000000', null) ->> 'erro') = 'consulta_nao_encontrada', 'cancelar contato inexistente');

  -- ---------------------------------------------------------- 5. bloqueios
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_bloqueio_salvar(%L,%L,%L)', tAt, cA, jsonb_build_object('data', v_qua))) = 'sem_permissao', 'atendente não bloqueia');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_bloqueio_salvar(%L,%L,%L)', tA, cA, '{}')) = 'dados_invalidos|data', 'bloqueio sem data');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_bloqueio_salvar(%L,%L,%L)', tA, cA, jsonb_build_object('data', v_qua, 'das', '14:00'))) = 'dados_invalidos|das', 'só "das" sem "ate"');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_bloqueio_salvar(%L,%L,%L)', tA, cA, jsonb_build_object('data', v_qua, 'das', '15:00', 'ate', '14:00'))) = 'dados_invalidos|ate', 'fim antes do início');
  j := public.nx_agenda_bloqueio_salvar(tA, cA, jsonb_build_object('data', v_qua, 'das', '14:00', 'ate', '15:00', 'motivo', 'Reunião'));
  bq := (j ->> 'id')::bigint;
  jb := (public.nx_agenda_livres(tAt, cA, v_qua, 1)::jsonb) -> 'horarios';
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(jb) h where (h ->> 'rotulo') ~ 'às (14:00|14:30)$')
    and exists (select 1 from jsonb_array_elements(jb) h where (h ->> 'rotulo') like '%às 13:30')
    and exists (select 1 from jsonb_array_elements(jb) h where (h ->> 'rotulo') like '%às 15:00'), 'bloqueio 14:00–15:00 tira 14:00 e 14:30; 13:30 e 15:00 continuam');
  perform pg_temp.ok((public.nx_agenda_marcar_ia(kA, t5, (v_qua + time '14:00') at time zone 'America/Sao_Paulo', null, null, null, false) ->> 'erro') = 'fora_do_horario', 'marcar em horário bloqueado → fora_do_horario');
  j := public.nx_agenda_bloqueio_salvar(tA, cA, jsonb_build_object('data', v_qua + 7, 'motivo', 'Feriado'));
  bq2 := (j ->> 'id')::bigint;
  perform pg_temp.ok(jsonb_array_length((public.nx_agenda_livres(tAt, cA, v_qua + 7, 1)::jsonb) -> 'horarios') = 0, 'dia inteiro bloqueado: nenhum horário');
  j := public.nx_agenda_bloqueio_salvar(tA, cA, jsonb_build_object('id', bq2, 'data', v_qua + 7, 'data_fim', v_qua + 8, 'motivo', 'Feriado prolongado'));
  perform pg_temp.ok((j ->> 'id')::bigint = bq2 and (select fim - inicio from public.nx_agenda_bloqueios where id = bq2) = interval '2 days', 'bloqueio editado para dois dias');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_bloqueio_excluir(%L,%L,%s)', tB, cB, bq)) = 'bloqueio_nao_encontrado', 'admin de B não apaga bloqueio de A');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_bloqueio_excluir(%L,%L,%s)', tB, cA, bq)) = 'sem_acesso', 'admin de B fora de A');
  perform public.nx_agenda_bloqueio_excluir(tA, cA, bq);
  perform public.nx_agenda_bloqueio_excluir(tA, cA, bq2);
  perform pg_temp.ok(jsonb_array_length((public.nx_agenda_livres(tAt, cA, v_qua + 7, 1)::jsonb) -> 'horarios') = 17, 'sem bloqueio o dia volta a ter 17 horários');
  perform pg_temp.ok(jsonb_array_length((public.nx_agenda_config_ver(tA, cA)::jsonb) -> 'bloqueios') = 0, 'lista de bloqueios vazia');

  -- horário próprio da agenda (e volta para o do departamento com null)
  j := public.nx_agenda_config_salvar(tA, cA, '{"horario":{"3":[["09:00","10:00"]]}}');
  perform pg_temp.ok(j -> 'config' ->> 'horario_fonte' = 'agenda'
    and jsonb_array_length((public.nx_agenda_livres(tAt, cA, v_qua, 1)::jsonb) -> 'horarios') = 2
    and jsonb_array_length((public.nx_agenda_livres(tAt, cA, v_qua + 1, 1)::jsonb) -> 'horarios') = 0, 'horário próprio: só quarta 09:00–10:00');
  j := public.nx_agenda_config_salvar(tA, cA, '{"horario":null,"passo_min":15}');
  perform pg_temp.ok(j -> 'config' ->> 'horario_fonte' = 'departamento'
    and jsonb_array_length((public.nx_agenda_livres(tAt, cA, v_qua, 1)::jsonb) -> 'horarios') > 30, 'horario null volta ao do departamento; passo de 15 min gera mais horários');
  perform public.nx_agenda_config_salvar(tA, cA, '{"passo_min":null,"capacidade":1}');

  -- ---------------------------------------------------------- 6. painel: marcar, remarcar, encaixe, fuso
  r := public.nx_agenda_marcar(tAt, cA, n5, to_char(v_qua, 'YYYY-MM-DD') || 'T15:00:00', 'Avaliação');
  perform pg_temp.ok((r ->> 'ok')::boolean and (select consulta_em from public.nx_leads where id = n5) = (v_qua + time '15:00') at time zone 'America/Sao_Paulo',
    'painel: horário sem fuso é lido como São Paulo');
  perform pg_temp.ok(exists (select 1 from public.nx_notas where negocio_id = n5 and autor_id = k_at and texto like 'Consulta marcada para % às 15:00 (Avaliação)'), 'nota do painel com o autor');
  r := public.nx_agenda_marcar(tAt, cA, n5, to_char(v_qua, 'YYYY-MM-DD') || 'T09:00:00-03:00');
  perform pg_temp.ok(r ->> 'erro' = 'horario_ocupado', 'painel respeita a capacidade (09:00 já tem 1 de 1)');
  r := public.nx_agenda_marcar(tAt, cA, n5, to_char(v_qua, 'YYYY-MM-DD') || 'T11:00:00-03:00');
  perform pg_temp.ok((r ->> 'ok')::boolean and (r ->> 'remarcada')::boolean and r -> 'anterior' ->> 'rotulo' like '%às 15:00', 'painel remarca 15:00 → 11:00');
  r := public.nx_agenda_marcar(tAt, cA, n2, to_char(v_qua, 'YYYY-MM-DD') || 'T22:30:00-03:00');
  perform pg_temp.ok(r ->> 'erro' = 'fora_do_horario', 'painel sem encaixe respeita o horário');
  r := public.nx_agenda_marcar(tAt, cA, n2, to_char(v_qua, 'YYYY-MM-DD') || 'T22:30:00-03:00', null, true);
  perform pg_temp.ok((r ->> 'ok')::boolean and (select data_consulta from public.nx_leads where id = n2) = v_qua
    and (select consulta_em from public.nx_leads where id = n2) = ((v_qua + 1)::timestamp + time '01:30') at time zone 'UTC', 'encaixe às 22:30 SP: data_consulta é a de São Paulo, não a do UTC');
  perform pg_temp.ok(exists (select 1 from public.nx_notas where negocio_id = n2 and texto like '%[encaixe]%'), 'encaixe fica registrado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_marcar(%L,%L,%s,%L)', tAt, cA, n5, 'amanhã')) = 'dados_invalidos|inicio', 'data inválida');
  perform pg_temp.ok((public.nx_agenda_marcar(tAt, cA, n5, to_char(v_hoje - 2, 'YYYY-MM-DD') || 'T10:00:00') ->> 'erro') = 'passado', 'painel: passado → passado');
  r := public.nx_agenda_marcar(tAt, cA, n5, to_char(v_hoje - 2, 'YYYY-MM-DD') || 'T10:00:00', null, true);
  perform pg_temp.ok(r ->> 'erro' = 'passado', 'encaixe no passado → passado');

  -- visão restrita (atendente sem ver_todas) e agenda do dia
  update public.nx_leads set dono_id = k_adm where id = n4;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_marcar(%L,%L,%s,%L)', tAt, cA, n4, to_char(v_qua, 'YYYY-MM-DD') || 'T16:00:00')) = 'negocio_nao_encontrado', 'atendente restrito não marca negócio do admin');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_desmarcar(%L,%L,%s)', tAt, cA, n4)) = 'negocio_nao_encontrado', 'atendente restrito não cancela negócio do admin');
  j := public.nx_agenda_dia(tA, cA, v_qua, 1);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'consultas') c where (c ->> 'negocio_id')::bigint = n4)
    and json_array_length(j -> 'consultas') >= 3, 'agenda do dia (admin) mostra tudo');
  j := public.nx_agenda_dia(tAt, cA, v_qua, 1);
  perform pg_temp.ok(not exists (select 1 from json_array_elements(j -> 'consultas') c where (c ->> 'negocio_id')::bigint = n4)
    and exists (select 1 from json_array_elements(j -> 'consultas') c where (c ->> 'negocio_id')::bigint = n5), 'agenda do dia (atendente restrito) esconde o negócio de outro dono');
  perform pg_temp.ok((select (c ->> 'fim')::timestamptz - (c ->> 'inicio')::timestamptz from json_array_elements(public.nx_agenda_dia(tA, cA, v_qua, 1) -> 'consultas') c
                       where (c ->> 'negocio_id')::bigint = n4) = interval '30 minutes', 'fim = início + duração');
  perform pg_temp.ok(json_array_length(public.nx_agenda_dia(tA, cA, v_qua, 7) -> 'consultas') >= json_array_length(public.nx_agenda_dia(tA, cA, v_qua, 1) -> 'consultas'), 'semana inclui o dia');
  perform pg_temp.ok(json_array_length(public.nx_agenda_dia(tB, cB, v_qua, 7) -> 'consultas') = 0, 'cliente B não vê consultas de A');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_dia(%L,%L,%L,1)', tB, cA, v_qua)) = 'sem_acesso', 'agenda de A com token de B');

  -- painel: desmarcar
  r := public.nx_agenda_desmarcar(tAt, cA, n5, 'paciente pediu');
  perform pg_temp.ok((r ->> 'ok')::boolean and (select consulta_em from public.nx_leads where id = n5) is null
    and exists (select 1 from public.nx_notas where negocio_id = n5 and autor_id = k_at and texto like 'Consulta de % cancelada: paciente pediu'), 'painel cancela e registra o autor');
  perform pg_temp.ok((public.nx_agenda_desmarcar(tAt, cA, n5) ->> 'erro') = 'consulta_nao_encontrada', 'cancelar de novo');

  -- ---------------------------------------------------------- 7. isolamento entre clientes
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_marcar(%L,%L,%s,%L)', tB, cB, n1, to_char(v_qua, 'YYYY-MM-DD') || 'T16:00:00')) = 'negocio_nao_encontrado', 'admin de B não marca negócio de A');
  perform pg_temp.ok((public.nx_agenda_marcar_ia(kA, tB1, now() + interval '3 days') ->> 'erro') = 'contato_nao_encontrado', 'IA do canal A não enxerga contato de B');
  r := public.nx_agenda_marcar(tB, cB, nB, to_char(v_qua, 'YYYY-MM-DD') || 'T09:00:00');
  perform pg_temp.ok((r ->> 'ok')::boolean, 'B marca 09:00 mesmo com A lotado: a agenda é por cliente');
  perform pg_temp.ok((select count(*) from public.nx_leads where cliente_id = cB and consulta_em is not null) = 1
    and (select consulta_em from public.nx_leads where id = nB) = (v_qua + time '09:00') at time zone 'America/Sao_Paulo', 'B tem só a própria consulta');

  -- ---------------------------------------------------------- 8. rastreio: código curto
  chave := (public.nx_entrada_chave(tA, cA, true) ->> 'chave');
  perform pg_temp.ok(chave ~ '^[0-9a-f]{48}$', 'chave pública do cliente');
  n := (select count(*) from public.nx_rastreio);
  r := public.nx_rastreio_registrar('0000000000000000000000000000000000000000000000ab', '{"utm_source":"google"}');
  perform pg_temp.ok(r ->> 'codigo' ~ '^[A-HJKMNP-Z2-9]{5}$' and (select count(*) from public.nx_rastreio) = n, 'chave errada: devolve código plausível e não grava (não revela)');
  r := public.nx_rastreio_registrar('curta', null);
  perform pg_temp.ok(r ->> 'codigo' ~ '^[A-HJKMNP-Z2-9]{5}$' and (select count(*) from public.nx_rastreio) = n, 'chave malformada e dados nulos: idem');
  update public.nx_clientes set status = 'suspenso' where id = cA;
  r := public.nx_rastreio_registrar(chave, '{"utm_source":"google"}');
  perform pg_temp.ok(r ->> 'codigo' ~ '^[A-HJKMNP-Z2-9]{5}$' and (select count(*) from public.nx_rastreio) = n, 'cliente suspenso: não grava');
  update public.nx_clientes set status = 'ativo' where id = cA;
  update public.nx_clientes set modulos = array['conversas'] where id = cA;
  r := public.nx_rastreio_registrar(chave, '{}');
  perform pg_temp.ok((select count(*) from public.nx_rastreio) = n, 'sem o módulo CRM: não grava');
  update public.nx_clientes set modulos = array['crm', 'conversas', 'relatorios', 'ads', 'automacoes', 'marca'] where id = cA;

  -- google: campanha e anúncio resolvidos pelo NOME em nx_metricas_dia
  insert into public.nx_metricas_dia (cliente_id, plataforma, data, nivel, campanha_ext, campanha_nome, anuncio_ext, anuncio_nome)
  values (cA, 'google', v_hoje, 'campanha', 'GC-1', 'Implante Taubaté', '', null),
         (cA, 'google', v_hoje, 'anuncio', 'GC-1', 'Implante Taubaté', 'AD-77', 'Video Sorriso'),
         (cA, 'meta', v_hoje, 'campanha', 'MC-9', 'Campanha Facial', '', null);
  r := public.nx_rastreio_registrar(chave, jsonb_build_object('utm_source', 'google', 'utm_medium', 'cpc', 'utm_campaign', 'Implante Taubaté',
         'utm_content', 'Video Sorriso', 'utm_term', 'implante', 'gclid', 'Cj0KCQ-abc_123 !', 'pagina', 'https://site.com/implante?utm_source=x&cpf=123#topo'));
  c1 := r ->> 'codigo';
  perform pg_temp.ok(c1 ~ '^[A-HJKMNP-Z2-9]{5}$' and not (c1 ~ '[ILO01]'), 'código de 5 caracteres sem I, L, O, 0, 1');
  perform pg_temp.ok((select gclid = 'Cj0KCQ-abc_123' and pagina = 'https://site.com/implante' and utm_term = 'implante' and utm_campaign = 'Implante Taubaté'
                        from public.nx_rastreio where cliente_id = cA and codigo = c1), 'guarda utm/gclid; gclid só com caracteres válidos; página sem ?query nem #');
  perform pg_temp.ok((select count(distinct (public.nx_rastreio_registrar(chave, '{}') ->> 'codigo')) from generate_series(1, 20)) = 20, 'códigos distintos');

  -- atribuição na 1ª mensagem (Google): nome da campanha vem de nx_metricas_dia
  perform public.nx_lead_webhook(cA, tg, array[tg], 'Gabi Google', null, v_hoje, 30);
  r := public.nx_rastreio_atribuir(kA, tg, c1);
  perform pg_temp.ok((r ->> 'aplicado')::boolean and r ->> 'plataforma' = 'google' and r ->> 'origem' = 'anuncio' and r ->> 'campanha_ext' = 'GC-1'
    and r ->> 'campanha_nome' = 'Implante Taubaté' and r ->> 'anuncio_ext' = 'AD-77' and (r ->> 'gclid')::boolean, 'atribuição Google: campanha e anúncio resolvidos');
  select * into l from public.nx_leads where id = pg_temp.neg(cA, tg);
  perform pg_temp.ok(l.origem = 'anuncio' and l.plataforma = 'google' and l.campanha_ext = 'GC-1' and l.anuncio_ext = 'AD-77' and l.gclid = 'Cj0KCQ-abc_123'
    and l.rastreio ->> 'utm_medium' = 'cpc' and l.rastreio ->> 'pagina' = 'https://site.com/implante' and l.rastreio ->> 'codigo' = c1, 'negócio com atribuição e rastreio');
  perform pg_temp.ok((select origem = 'anuncio' and plataforma = 'google' and campanha_ext = 'GC-1' from public.nx_contatos where id = l.contato_id), 'contato herda o 1º toque');
  perform pg_temp.ok((select usado_em is not null and telefone = tg and negocio_id = l.id from public.nx_rastreio where cliente_id = cA and codigo = c1), 'código marcado como usado');
  jb := public.nx_codewords_dados(kA, tg)::jsonb;
  perform pg_temp.ok(jb -> 'negocio' ->> 'campanha_nome' = 'Implante Taubaté' and jb -> 'negocio' ->> 'anuncio_nome' = 'Video Sorriso'
    and (jb -> 'negocio' ->> 'gclid')::boolean and jb -> 'negocio' -> 'rastreio' ->> 'utm_source' = 'google'
    and not (jb::text like '%Cj0KCQ%'), 'contexto da IA mostra a origem (e não vaza o gclid)');
  update public.nx_leads set consulta_em = ((v_qua + 20)::timestamp + time '10:00') at time zone 'America/Sao_Paulo',
    data_consulta = v_qua + 20 where id = l.id;
  j := public.nx_negocios_kanban(tA, cA, l.funil_id);
  select i into jb_card from jsonb_array_elements((j::jsonb) -> 'colunas') col
    cross join lateral jsonb_array_elements(col -> 'itens') i where (i ->> 'id')::bigint = l.id;
  perform pg_temp.ok(jb_card ->> 'campanha_ext' = 'GC-1' and jb_card ->> 'anuncio_ext' = 'AD-77'
    and jb_card ->> 'campanha_nome' = 'Implante Taubaté' and jb_card ->> 'anuncio_nome' = 'Video Sorriso'
    and jb_card -> 'rastreio' ->> 'utm_source' = 'google'
    and not (jb_card -> 'rastreio' ?| array['codigo','gclid','gbraid','wbraid','fbclid']), 'card CRM: ids e nomes de campanha/anúncio, UTMs permitidas sem códigos de clique');
  j := public.nx_agenda_dia(tA, cA, v_qua + 20, 1);
  select c::jsonb into jb_card from json_array_elements(j -> 'consultas') c where (c ->> 'negocio_id')::bigint = l.id;
  perform pg_temp.ok(jb_card ->> 'origem' = 'anuncio' and jb_card ->> 'plataforma' = 'google'
    and jb_card ->> 'campanha_ext' = 'GC-1' and jb_card ->> 'anuncio_ext' = 'AD-77'
    and jb_card ->> 'campanha_nome' = 'Implante Taubaté' and jb_card ->> 'anuncio_nome' = 'Video Sorriso'
    and jb_card -> 'rastreio' ->> 'utm_campaign' = 'Implante Taubaté'
    and not (jb_card -> 'rastreio' ?| array['codigo','gclid','gbraid','wbraid','fbclid']), 'agenda semanal/dia: origem, campanha, anúncio e UTMs seguras');
  r := public.nx_rastreio_atribuir(kA, tg, lower(c1));
  perform pg_temp.ok((r ->> 'aplicado')::boolean, 'mesmo telefone repetindo o código (minúsculo) é idempotente');
  perform public.nx_lead_webhook(cA, tg2, array[tg2], 'Outro Telefone', null, v_hoje, 30);
  r := public.nx_rastreio_atribuir(kA, tg2, c1);
  perform pg_temp.ok(not (r ->> 'aplicado')::boolean and r ->> 'motivo' = 'codigo_ja_usado', 'código de outro telefone é ignorado');
  perform pg_temp.ok((select plataforma is null and origem = 'whatsapp' from public.nx_leads where id = pg_temp.neg(cA, tg2)), 'o outro telefone continua sem atribuição');

  -- "origem" da IA não sobrescreve anúncio (gclid/plataforma)
  r := public.nx_codewords_origem(kA, tg, 'instagram', 'disse que viu no insta');
  perform pg_temp.ok((r ->> 'ok')::boolean and not (r ->> 'aplicado')::boolean and r ->> 'motivo' = 'ja_tem_anuncio', 'origem da IA respeita anúncio do rastreio');
  perform pg_temp.ok((select origem = 'anuncio' and plataforma = 'google' from public.nx_leads where id = pg_temp.neg(cA, tg)), 'atribuição intacta');

  -- CTWA (Meta) existente nunca é sobrescrito pelo código do site
  perform public.nx_lead_webhook(cA, tm, array[tm], 'Marta Meta', '{"origem":"anuncio","plataforma":"meta","anuncio_ext":"AD-CTWA","ctwa_clid":"clid1"}'::jsonb, v_hoje, 30);
  r := public.nx_rastreio_registrar(chave, '{"utm_source":"google","utm_medium":"cpc","utm_campaign":"Implante Taubaté","gclid":"XYZ123"}');
  c2 := r ->> 'codigo';
  r := public.nx_rastreio_atribuir(kA, tm, c2);
  perform pg_temp.ok(not (r ->> 'aplicado')::boolean and r ->> 'motivo' = 'ja_tem_anuncio', 'anúncio CTWA já existente: código ignorado');
  perform pg_temp.ok((select plataforma = 'meta' and anuncio_ext = 'AD-CTWA' and gclid is null and rastreio is null from public.nx_leads where id = pg_temp.neg(cA, tm)), 'CTWA intacto (sem gclid)');
  perform pg_temp.ok((public.nx_codewords_origem(kA, tm, 'google') ->> 'motivo') = 'ja_tem_anuncio', 'origem da IA também respeita o CTWA');

  -- Meta por UTM; nome da campanha vindo de nx_metricas_dia
  r := public.nx_rastreio_registrar(chave, '{"utm_source":"facebook","utm_medium":"paid","utm_campaign":"campanha facial","fbclid":"IwAR-abc"}');
  c3 := r ->> 'codigo';
  perform public.nx_lead_webhook(cA, tf, array[tf], 'Fabi Face', null, v_hoje, 30);
  r := public.nx_rastreio_atribuir(kA, tf, c3);
  perform pg_temp.ok((r ->> 'aplicado')::boolean and r ->> 'plataforma' = 'meta' and r ->> 'campanha_ext' = 'MC-9' and r ->> 'campanha_nome' = 'Campanha Facial' and r ->> 'origem' = 'anuncio',
    'Meta por utm_source=facebook + medium=paid; campanha achada pelo nome (sem diferenciar maiúsculas)');

  -- site sem parâmetros e origem contada pela cliente
  r := public.nx_rastreio_registrar(chave, '{"pagina":"https://site.com/contato"}');
  c4 := r ->> 'codigo';
  perform public.nx_lead_webhook(cA, ts, array[ts], 'Sara Site', null, v_hoje, 30);
  r := public.nx_rastreio_atribuir(kA, ts, c4);
  perform pg_temp.ok((r ->> 'aplicado')::boolean and r ->> 'origem' = 'site' and r ->> 'plataforma' is null and r ->> 'campanha_ext' is null, 'visita ao site sem utm: origem "site"');
  perform pg_temp.ok((select rastreio ->> 'pagina' = 'https://site.com/contato' and origem = 'site' and plataforma is null from public.nx_leads where id = pg_temp.neg(cA, ts)), 'página guardada no negócio');
  jb := public.nx_codewords_dados(kA, ts)::jsonb;
  perform pg_temp.ok(jb -> 'negocio' ->> 'origem' = 'site' and jb -> 'negocio' -> 'rastreio' ->> 'pagina' = 'https://site.com/contato', 'contexto da IA: veio do site');
  r := public.nx_codewords_origem(kA, ts, 'instagram');
  perform pg_temp.ok((r ->> 'aplicado')::boolean and (select origem = 'organico' from public.nx_leads where id = pg_temp.neg(cA, ts)), 'sem anúncio, o que a cliente conta vale');

  -- fbclid sozinho não é anúncio (link de post orgânico também leva fbclid)
  r := public.nx_rastreio_registrar(chave, '{"fbclid":"IwAR-orgânico"}');
  c5 := r ->> 'codigo';
  perform public.nx_lead_webhook(cA, tfb, array[tfb], 'Flávia Face', null, v_hoje, 30);
  r := public.nx_rastreio_atribuir(kA, tfb, c5);
  perform pg_temp.ok((r ->> 'aplicado')::boolean and r ->> 'origem' = 'site' and r ->> 'plataforma' is null
    and (select rastreio ->> 'fbclid' = 'IwAR-orgnico' from public.nx_leads where id = pg_temp.neg(cA, tfb)), 'fbclid sem utm nem campanha: não conta como anúncio, mas fica guardado');

  -- campanha que ainda não está nas métricas: guarda o texto da utm
  r := public.nx_rastreio_registrar(chave, '{"utm_source":"google","utm_medium":"cpc","utm_campaign":"Nova Campanha","utm_content":"criativo-x"}');
  c6 := r ->> 'codigo';
  perform public.nx_lead_webhook(cA, tn, array[tn], 'Nina Nova', null, v_hoje, 30);
  r := public.nx_rastreio_atribuir(kA, tn, c6);
  perform pg_temp.ok(r ->> 'plataforma' = 'google' and r ->> 'campanha_ext' = 'Nova Campanha' and r ->> 'anuncio_ext' = 'criativo-x' and r ->> 'campanha_nome' is null, 'sem métrica correspondente: fica o texto da utm');

  -- códigos que não valem
  perform public.nx_lead_webhook(cA, tx, array[tx], 'Xavier', null, v_hoje, 30);
  perform pg_temp.ok((public.nx_rastreio_atribuir(kA, tx, 'ABC') ->> 'motivo') = 'codigo_invalido', 'formato inválido');
  perform pg_temp.ok((public.nx_rastreio_atribuir(kA, tx, 'ZZZZZ') ->> 'motivo') = 'codigo_desconhecido', 'código que não existe');
  r := public.nx_rastreio_registrar(chave, '{"utm_source":"google","gclid":"G-EXP"}');
  c7 := r ->> 'codigo';
  update public.nx_rastreio set criado_em = now() - interval '31 days' where cliente_id = cA and codigo = c7;
  perform pg_temp.ok((public.nx_rastreio_atribuir(kA, tx, c7) ->> 'motivo') = 'codigo_desconhecido', 'código com mais de 30 dias expirou');
  -- código de outro cliente
  perform public.nx_entrada_chave(tB, cB, true);
  r := public.nx_rastreio_registrar((public.nx_entrada_chave(tB, cB, false) ->> 'chave'), '{"utm_source":"google","gclid":"G-B"}');
  c8 := r ->> 'codigo';
  perform pg_temp.ok((select count(*) from public.nx_rastreio where cliente_id = cB and codigo = c8) = 1, 'B registra o próprio código');
  perform pg_temp.ok((public.nx_rastreio_atribuir(kA, tx, c8) ->> 'motivo') = 'codigo_desconhecido', 'código de B não atribui negócio de A');
  -- negócio com origem definida à mão
  update public.nx_leads set origem = 'manual' where id = pg_temp.neg(cA, tx);
  r := public.nx_rastreio_registrar(chave, '{"utm_source":"google","gclid":"G-MAN"}');
  perform pg_temp.ok((public.nx_rastreio_atribuir(kA, tx, r ->> 'codigo') ->> 'motivo') = 'origem_definida', 'origem manual não é trocada');
  -- sem negócio: não marca o código como usado
  r := public.nx_rastreio_registrar(chave, '{"utm_source":"google","gclid":"G-SEM"}');
  perform pg_temp.ok((public.nx_rastreio_atribuir(kA, '5512955550000', r ->> 'codigo') ->> 'motivo') = 'sem_negocio'
    and (select usado_em is null from public.nx_rastreio where cliente_id = cA and codigo = r ->> 'codigo'), 'telefone sem negócio: código continua livre');

  -- limite de taxa: 30 por minuto por cliente
  delete from public.nx_rastreio where cliente_id = cA;
  for n in 1..30 loop r := public.nx_rastreio_registrar(chave, '{"utm_source":"x"}'); end loop;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_rastreio_registrar(%L,%L)', chave, '{"utm_source":"x"}')) = 'limite_taxa', 'mais de 30 por minuto → limite_taxa');
  perform pg_temp.ok(r ->> 'codigo' ~ '^[A-HJKMNP-Z2-9]{5}$', 'até o limite tudo passou');
  -- o limite de A não atrapalha B
  perform pg_temp.ok((public.nx_rastreio_registrar((public.nx_entrada_chave(tB, cB, false) ->> 'chave'), '{}') ->> 'codigo') ~ '^[A-HJKMNP-Z2-9]{5}$', 'limite é por cliente');
  -- purga de códigos velhos (45 dias) acontece no próprio registro
  delete from public.nx_rastreio where cliente_id = cB;
  insert into public.nx_rastreio (cliente_id, codigo, criado_em) values (cB, 'AAAAA', now() - interval '50 days');
  perform public.nx_rastreio_registrar((public.nx_entrada_chave(tB, cB, false) ->> 'chave'), '{}');
  perform pg_temp.ok(not exists (select 1 from public.nx_rastreio where cliente_id = cB and codigo = 'AAAAA'), 'códigos com mais de 45 dias são apagados');

  -- ---------------------------------------------------------- 9. permissões
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_rastreio_registrar(text,jsonb)', 'execute')
    and has_function_privilege('anon', 'public.nx_agenda_config_ver(text,uuid)', 'execute')
    and has_function_privilege('anon', 'public.nx_agenda_config_salvar(text,uuid,jsonb)', 'execute')
    and has_function_privilege('anon', 'public.nx_agenda_bloqueio_salvar(text,uuid,jsonb)', 'execute')
    and has_function_privilege('anon', 'public.nx_agenda_dia(text,uuid,date,integer)', 'execute')
    and has_function_privilege('anon', 'public.nx_agenda_livres(text,uuid,date,integer,text,bigint)', 'execute')
    and has_function_privilege('anon', 'public.nx_agenda_marcar(text,uuid,bigint,text,text,boolean,text)', 'execute')
    and has_function_privilege('anon', 'public.nx_agenda_desmarcar(text,uuid,bigint,text)', 'execute'), 'RPCs do painel e do rastreio liberadas (autenticam por token/chave)');
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_rastreio_atribuir(uuid,text,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.nx_agenda_livres_ia(uuid,text,text,date,integer)', 'execute')
    and not has_function_privilege('anon', 'public.nx_agenda_marcar_ia(uuid,text,timestamp with time zone,text,text,text,boolean)', 'execute')
    and not has_function_privilege('anon', 'public.nx_agenda_desmarcar_ia(uuid,text,text)', 'execute')
    and not has_function_privilege('anon', 'public.nx_agenda_marcar_core(uuid,bigint,timestamp with time zone,text,boolean,boolean,text,text,uuid)', 'execute')
    and not has_function_privilege('anon', 'public.nx_agenda_desmarcar_core(uuid,bigint,text,text,uuid)', 'execute')
    and not has_function_privilege('anon', 'public.nx_agenda_slots(uuid,date,integer,text,bigint)', 'execute')
    and not has_function_privilege('anon', 'public.nx_agenda_cfg(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.nx_codewords_dados(uuid,text)', 'execute'), 'internas e API do agente só para service_role');
  perform pg_temp.ok(has_function_privilege('service_role', 'public.nx_agenda_marcar_ia(uuid,text,timestamp with time zone,text,text,text,boolean)', 'execute')
    and has_function_privilege('service_role', 'public.nx_rastreio_atribuir(uuid,text,text)', 'execute'), 'service_role executa a API do agente');
  perform pg_temp.ok(not has_table_privilege('anon', 'public.nx_rastreio', 'select') and not has_table_privilege('anon', 'public.nx_agenda_config', 'select')
    and not has_table_privilege('authenticated', 'public.nx_agenda_bloqueios', 'select'), 'tabelas novas fechadas');

  raise exception 'OK_11_AGENDA_RASTREIO todos os casos passaram';
end $t$;

rollback;
