-- ============================================================
-- ÓRBITA — supabase/testes/21_dados_telas.sql · smoke de 20261008c_dados_telas.sql (plano 100, frente S-B)
--   S-B14 IA: 'adiado' (p_tentar + p_conta=false + p_em ≥ 300) sem gastar tentativa, proximo_em, aviso único aos admins; espera curta
--         continua 'pendente'; pegar não entrega antes da hora e entrega depois; chamar não mata adiado nem o que acabou de acordar,
--         mata pendente velho (contado da última espera) e não despacha sem chave da IA; nx_ia_registrar_reserva com 8 (sobrecarga
--         nova, sem default) e com 5 argumentos (a antiga continua); nx_ia_uso_dia; nx_automacao_execucoes_dia (soma a lista, ordem, erros)
--   S-B15 nx_inicio: funil_mes, series_14d (4 × 14 inteiros, mais antigo primeiro), respondidas_no_prazo_pct, aguardando_lista
--         (≤ 5, {id, nome, espera_min, canal}), canais[].provedor/estado/desde/sync_em; visibilidade do atendente
--         nx_dados.leads[].hora_conversa (hora SP da 1ª mensagem; null sem conversa) e nx_dados.cliente.vertical
--         agenda: marcar com encaixe grava campos.encaixe e limpa presença; nx_agenda_dia com encaixe/dono_nome/presenca;
--         nx_agenda_presenca compareceu/faltou (etapa «faltou»)/limpar, erros (presenca, sem_consulta, negocio_nao_encontrado,
--         atendente restrito), histórico
-- Roda em begin … rollback. O bloco principal SEMPRE termina em exceção:
--   'OK_21_DADOS_TELAS …' = todos os casos passaram · 'FALHOU: <caso>' = falha
-- Antes da 20261008c este arquivo falha (estado, colunas, funções e campos novos).
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
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date::timestamp)::date;
  cA uuid; k_adm uuid; k_at uuid; t_adm text := 'tok-21-adm-' || sfx; t_at text := 'tok-21-at-' || sfx;
  f uuid; e_nova uuid; e_ag uuid; e_falt uuid; kM uuid; kC uuid; ct bigint; ct2 bigint; cv bigint; cv2 bigint;
  l1 bigint; l2 bigint; l3 bigint; l4 bigint; l5 bigint; a_id uuid; ped bigint; res uuid; res2 uuid;
  j json; jb jsonb; e text; n int; v_ts timestamptz; v_est uuid;
  tel text := '5512998' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  amanha_10 timestamptz := ((hoje + 1)::timestamp + time '10:00') at time zone 'America/Sao_Paulo';
  hoje_09 timestamptz := (hoje::timestamp + time '09:00') at time zone 'America/Sao_Paulo';
begin
  -- ---------------------------------------------------------- fixtures
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-21-' || sfx, 'Teste 21', 'odonto') returning id into cA;
  select id into f from public.nx_funis where cliente_id = cA and padrao limit 1;
  update public.nx_funis set conta_no_ads = true where id = f;
  select id into e_nova from public.nx_estagios where cliente_id = cA and funil_id = f and marco = 'nova' limit 1;
  select id into e_ag from public.nx_estagios where cliente_id = cA and funil_id = f and marco = 'agendada' limit 1;
  select id into e_falt from public.nx_estagios where cliente_id = cA and funil_id = f and marco = 'faltou' limit 1;
  if e_falt is null then
    insert into public.nx_estagios (cliente_id, funil_id, nome, ordem, tipo, marco) values (cA, f, 'Faltou 21', 90, 'aberto', 'faltou') returning id into e_falt;
  end if;
  perform pg_temp.ok(f is not null and e_nova is not null and e_ag is not null, 'fixture: funil padrão com nova/agendada');
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-21-adm-' || sfx || '@teste.local', 'Admin 21', 'x', 'clinica', true) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-21-at-' || sfx || '@teste.local', 'Atendente 21', 'x', 'clinica', true) returning id into k_at;
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas) values (k_adm, cA, 'admin', true), (k_at, cA, 'atendente', false);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(t_adm), k_adm, now() + interval '1 hour'), (public.nx_hash(t_at), k_at, now() + interval '1 hour');
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor) values (cA, 'Meta 21', 'pn-21-' || sfx, 'meta') returning id into kM;
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor, codewords_api_segredo, codewords_phone_id, codewords_numero, codewords_conectado, codewords_rota, codewords_sync_em)
    values (cA, 'Aparelho 21', null, 'codewords', gen_random_uuid(), 'ph-21-' || sfx, '+5512998210000', true, 'direta', now() - interval '2 minutes') returning id into kC;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Contato A 21', tel) returning id into ct;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Contato B 21', '5512997' || right(tel, 6)) returning id into ct2;
  -- negócios de hoje (coorte do mês): l1 com conversa, l2 com consulta amanhã, l3 ganho, l5 com consulta hoje; l4 de 20 dias atrás
  insert into public.nx_leads (cliente_id, contato_id, funil_id, estagio_id, titulo, nome, telefone, status, etapa, data_conversa, valor_previsto, origem)
    values (cA, ct, f, e_nova, 'L1 21', 'Contato A 21', tel, 'aberto', 'nova', hoje, 1000, 'whatsapp') returning id into l1;
  insert into public.nx_leads (cliente_id, contato_id, funil_id, estagio_id, titulo, nome, status, etapa, data_conversa, valor_previsto, consulta_em, data_agenda, dono_id)
    values (cA, ct2, f, e_ag, 'L2 21', 'Contato B 21', 'aberto', 'agendada', hoje, 500, amanha_10, hoje, k_adm) returning id into l2;
  insert into public.nx_leads (cliente_id, funil_id, estagio_id, titulo, nome, status, etapa, data_conversa, valor, fechado_em)
    values (cA, f, e_nova, 'L3 21', 'Ganho 21', 'aberto', 'nova', hoje, 900, null) returning id into l3;
  update public.nx_leads set etapa = 'fechou' where id = l3;
  perform pg_temp.ok((select status from public.nx_leads where id = l3) = 'ganho', 'fixture: l3 ganho');
  insert into public.nx_leads (cliente_id, funil_id, estagio_id, titulo, nome, status, etapa, data_conversa, valor_previsto, criado_em)
    values (cA, f, e_nova, 'L4 21', 'Antigo 21', 'aberto', 'nova', hoje - 20, 200, now() - interval '20 days') returning id into l4;
  insert into public.nx_leads (cliente_id, funil_id, estagio_id, titulo, nome, status, etapa, data_conversa, consulta_em, dono_id)
    values (cA, f, e_ag, 'L5 21', 'Consulta hoje 21', 'aberto', 'agendada', hoje, hoje_09, k_adm) returning id into l5;
  -- conversas: cv (contato A, aguardando há 20 min, respondida em 5 min, aberta ontem, ligada a l1), cv2 (contato B, respondida em 40 min, há 2 dias, do admin)
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, nao_lidas, negocio_id, aberta_em, primeira_resposta_em, ultima_entrada_em, ultima_msg_em)
    values (cA, kM, ct, '2026-21a' || sfx, 'aberta', true, 1, l1, now() - interval '1 day', now() - interval '1 day' + interval '5 minutes', now() - interval '20 minutes', now() - interval '20 minutes') returning id into cv;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, nao_lidas, atribuida_a, aberta_em, primeira_resposta_em, ultima_entrada_em, ultima_msg_em)
    values (cA, kM, ct2, '2026-21b' || sfx, 'aberta', false, 0, k_adm, now() - interval '2 days', now() - interval '2 days' + interval '40 minutes', now() - interval '2 days', now() - interval '2 days') returning id into cv2;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, wamid, status, criado_em)
    values (cA, cv, ct, kM, 'in', 'texto', 'oi 21', 'w21a' || sfx, 'recebida', (hoje::timestamp + time '14:37') at time zone 'America/Sao_Paulo');
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, wamid, status, criado_em)
    values (cA, cv, ct, kM, 'in', 'texto', 'de novo 21', 'w21b' || sfx, 'recebida', (hoje::timestamp + time '16:02') at time zone 'America/Sao_Paulo');

  -- ---------------------------------------------------------- versão
  perform pg_temp.ok(exists (select 1 from public.nx_versao_banco where nome = '20261008c_dados_telas'), 'nx_versao_banco registra a migração c');
  perform pg_temp.ok(public.nx_versao_atual() >= '20261008c_dados_telas', 'nx_versao_atual é a c (ou mais nova)');

  -- ---------------------------------------------------------- S-B15 contrato 4: nx_inicio
  j := public.nx_inicio(t_adm, cA);
  perform pg_temp.ok((j -> 'conversas' ->> 'aguardando')::int = 1 and (j -> 'conversas' ->> 'abertas')::int = 2, 'contagens de conversas como antes');
  perform pg_temp.ok((j -> 'conversas' ->> 'respondidas_no_prazo_pct')::int = 50, 'respondidas no prazo: 1 de 2 (5 min sim, 40 min não) = 50%');
  perform pg_temp.ok(json_array_length(j -> 'conversas' -> 'aguardando_lista') = 1
                 and (j -> 'conversas' -> 'aguardando_lista' -> 0 ->> 'id')::bigint = cv
                 and (j -> 'conversas' -> 'aguardando_lista' -> 0 ->> 'nome') = 'Contato A 21'
                 and (j -> 'conversas' -> 'aguardando_lista' -> 0 ->> 'espera_min')::int between 19 and 21
                 and (j -> 'conversas' -> 'aguardando_lista' -> 0 ->> 'canal') = 'meta', 'aguardando_lista: {id, nome, espera_min, canal} ' || (j -> 'conversas' -> 'aguardando_lista')::text);
  perform pg_temp.ok((j -> 'conversas' -> 'aguardando_lista' -> 0 ->> 'espera_min')::int = (j -> 'conversas' ->> 'espera_mais_antiga_min')::int, 'a espera da lista é a espera mais antiga');
  perform pg_temp.ok((j -> 'funil_mes' ->> 'leads')::int >= 4 and (j -> 'funil_mes' ->> 'conversas')::int >= 1
                 and (j -> 'funil_mes' ->> 'agendados')::int >= 2 and (j -> 'funil_mes' ->> 'ganhos')::int >= 1
                 and (j -> 'funil_mes' ->> 'leads')::int >= (j -> 'funil_mes' ->> 'agendados')::int
                 and (j -> 'funil_mes' ->> 'leads')::int >= (j -> 'funil_mes' ->> 'ganhos')::int, 'funil_mes: coorte do mês ' || (j -> 'funil_mes')::text);
  perform pg_temp.ok((j -> 'funil_mes' ->> 'leads')::int = (select count(*) from public.nx_leads l where l.cliente_id = cA and l.data_conversa >= v_mes and l.data_conversa <= hoje),
    'funil_mes.leads = negócios que entraram no mês');
  foreach e in array array['aguardando', 'consultas', 'valor_aberto', 'leads'] loop
    perform pg_temp.ok(json_array_length(j -> 'series_14d' -> e) = 14, 'series_14d.' || e || ' tem 14 pontos');
    perform pg_temp.ok(not exists (select 1 from json_array_elements_text(j -> 'series_14d' -> e) p where p !~ '^\d+$'), 'series_14d.' || e || ' só inteiros');
  end loop;
  perform pg_temp.ok((j -> 'series_14d' -> 'leads' ->> 13)::int = 4 and (j -> 'series_14d' -> 'leads' ->> 0)::int = 0, 'leads por dia: 4 hoje, 0 há 13 dias');
  perform pg_temp.ok((j -> 'series_14d' -> 'aguardando' ->> 12)::int = 1 and (j -> 'series_14d' -> 'aguardando' ->> 11)::int = 1 and (j -> 'series_14d' -> 'aguardando' ->> 13)::int = 0,
    'conversas abertas por dia: ontem 1, anteontem 1, hoje 0 ' || (j -> 'series_14d' -> 'aguardando')::text);
  perform pg_temp.ok((j -> 'series_14d' -> 'consultas' ->> 13)::int = 1 and (j -> 'series_14d' -> 'consultas' ->> 12)::int = 0, 'consultas por dia: 1 hoje (a de amanhã fica fora)');
  perform pg_temp.ok((j -> 'series_14d' -> 'valor_aberto' ->> 13)::int = 1700 and (j -> 'series_14d' -> 'valor_aberto' ->> 0)::int = 200,
    'valor em aberto: hoje 1000+500+200 (o ganho sai), há 13 dias só o antigo ' || (j -> 'series_14d' -> 'valor_aberto')::text);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'canais') c where (c ->> 'id')::uuid = kC and (c ->> 'provedor') = 'codewords' and (c ->> 'estado') = 'conectado'
                               and (c ->> 'sync_em') is not null and (c ->> 'desde') is not null), 'canais[]: aparelho conectado com sync_em e desde');
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'canais') c where (c ->> 'id')::uuid = kM and (c ->> 'provedor') = 'meta' and (c ->> 'estado') = 'desconhecido'
                               and (c::jsonb ? 'numero_exibicao') and (c::jsonb ? 'app_inscrito')), 'canais[]: Meta pendente = desconhecido, chaves antigas continuam');
  update public.nx_canais set status = 'ativo' where id = kM;
  perform pg_temp.ok(exists (select 1 from json_array_elements(public.nx_inicio(t_adm, cA) -> 'canais') c where (c ->> 'id')::uuid = kM and (c ->> 'estado') = 'conectado'), 'Meta ativo = conectado');
  -- atendente sem ver_todas: só o que enxerga (cv sem dono sim; cv2 do admin não)
  j := public.nx_inicio(t_at, cA);
  perform pg_temp.ok((j -> 'conversas' ->> 'respondidas_no_prazo_pct')::int = 100 and json_array_length(j -> 'conversas' -> 'aguardando_lista') = 1, 'atendente: percentual e lista só das conversas visíveis');
  perform pg_temp.ok((j -> 'series_14d' -> 'valor_aberto' ->> 13)::int = 1200, 'atendente: valor em aberto só dos negócios sem dono/dele (1000+200)');

  -- ---------------------------------------------------------- S-B15 contrato 5: nx_dados.hora_conversa
  j := public.nx_dados(t_adm, cA, 30);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'leads') x where (x ->> 'id')::bigint = l1 and (x ->> 'hora_conversa')::int = 14), 'l1: hora da 1ª mensagem recebida = 14 (SP)');
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'leads') x where (x ->> 'id')::bigint = l2 and (x ->> 'hora_conversa') is null), 'l2 sem conversa: hora_conversa null');
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'leads') x where (x ->> 'id')::bigint = l1 and (x::jsonb ? 'data_conversa') and (x::jsonb ? 'valor') and (x::jsonb ? 'obs')), 'as chaves antigas continuam');
  perform pg_temp.ok((j -> 'cliente' ->> 'vertical') = 'odonto' and (j -> 'cliente' ->> 'id')::uuid = cA and (j -> 'cliente')::jsonb ? 'cfg', 'nx_dados.cliente.vertical (pedido da frente P)');

  -- ---------------------------------------------------------- S-B15 contrato 6: agenda
  -- l2 já tem consulta amanhã às 10:00: remarca para as 11:00 como encaixe (a mesma hora cairia no atalho «nada mudou»)
  j := public.nx_agenda_marcar(t_adm, cA, l2, to_char((amanha_10 + interval '1 hour') at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI'), null, true, 'encaixe 21');
  perform pg_temp.ok((j ->> 'ok')::boolean and (j ->> 'mudou')::boolean and (j -> 'consulta' ->> 'encaixe')::boolean, 'remarcar com encaixe devolve consulta.encaixe ' || j::text);
  perform pg_temp.ok((select (campos ->> 'encaixe')::boolean from public.nx_leads where id = l2), 'campos.encaixe gravado');
  j := public.nx_agenda_dia(t_adm, cA, hoje + 1, 1);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'consultas') c where (c ->> 'negocio_id')::bigint = l2 and (c ->> 'encaixe')::boolean and (c ->> 'dono_nome') = 'Admin 21' and (c ->> 'presenca') is null),
    'nx_agenda_dia: encaixe=true, dono_nome, presenca nula ' || (j -> 'consultas')::text);
  j := public.nx_agenda_dia(t_adm, cA, hoje, 1);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'consultas') c where (c ->> 'negocio_id')::bigint = l5 and (c ->> 'encaixe')::boolean is false and (c::jsonb ? 'dono_nome')),
    'consulta gravada à mão: encaixe=false (chave sempre presente)');
  -- presença
  j := public.nx_agenda_presenca(t_adm, cA, l5, 'compareceu');
  perform pg_temp.ok(j::jsonb = jsonb_build_object('ok', true, 'presenca', 'compareceu', 'estagio_id', e_ag), 'compareceu: {ok, presenca, estagio_id} e a etapa não muda ' || j::text);
  perform pg_temp.ok((select campos ->> 'presenca' from public.nx_leads where id = l5) = 'compareceu', 'campos.presenca gravado');
  perform pg_temp.ok(exists (select 1 from json_array_elements(public.nx_agenda_dia(t_adm, cA, hoje, 1) -> 'consultas') c where (c ->> 'negocio_id')::bigint = l5 and (c ->> 'presenca') = 'compareceu'), 'nx_agenda_dia mostra a presença');
  j := public.nx_agenda_presenca(t_adm, cA, l5, 'faltou');
  perform pg_temp.ok((j ->> 'presenca') = 'faltou' and (j ->> 'estagio_id')::uuid = e_falt, 'faltou: vai para o estágio de marco «faltou»');
  perform pg_temp.ok((select etapa = 'faltou' and status = 'aberto' and estagio_id = e_falt from public.nx_leads where id = l5), 'o gatilho aplicou etapa/status');
  j := public.nx_agenda_presenca(t_adm, cA, l5, 'limpar');
  perform pg_temp.ok((j ->> 'presenca') is null and (j ->> 'estagio_id')::uuid = e_falt and (select not (campos ? 'presenca') from public.nx_leads where id = l5), 'limpar: só tira a marca (a etapa fica para o Desfazer da tela)');
  perform pg_temp.ok((select count(*) from public.nx_historico h where h.negocio_id = l5 and h.tipo = 'presenca') = 3, 'três linhas de histórico');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_presenca(%L,%L,%s,%L)', t_adm, cA, l5, 'talvez')) = 'dados_invalidos|presenca', 'estado desconhecido → dados_invalidos|presenca');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_presenca(%L,%L,%s,%L)', t_adm, cA, l1, 'faltou')) = 'dados_invalidos|sem_consulta', 'negócio sem consulta → dados_invalidos|sem_consulta');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_presenca(%L,%L,%s,%L)', t_adm, cA, 0, 'faltou')) = 'negocio_nao_encontrado', 'negócio inexistente → negocio_nao_encontrado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_agenda_presenca(%L,%L,%s,%L)', t_at, cA, l5, 'compareceu')) = 'negocio_nao_encontrado', 'atendente restrito não mexe no negócio de outro dono');
  -- (re)marcar limpa a presença da consulta anterior
  perform public.nx_agenda_presenca(t_adm, cA, l5, 'compareceu');
  j := public.nx_agenda_marcar(t_adm, cA, l5, to_char((amanha_10 + interval '2 hours') at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI'), null, true, null);
  perform pg_temp.ok((j ->> 'ok')::boolean and (select not (campos ? 'presenca') and (campos ->> 'encaixe')::boolean from public.nx_leads where id = l5), 'remarcar limpa a presença e grava o encaixe');

  -- ---------------------------------------------------------- S-B14 IA: adiado
  insert into public.nx_automacoes (cliente_id, nome, gatilho, criado_por, acoes) values (cA, 'Auto 21', 'conversa_nova', k_adm, '[{"tipo":"ia_decidir"}]'::jsonb) returning id into a_id;
  insert into public.nx_auto_ia_pedidos (cliente_id, automacao_id, tarefa, alvo, status, tentativas, pego_em)
  values (cA, a_id, 'classificar_etapa', jsonb_build_object('negocio_id', l1, 'contato_id', ct), 'processando', 1, now()) returning id into ped;
  insert into public.nx_auto_execucoes (automacao_id, cliente_id, chave, ok, detalhe, estado, passo, total_passos)
  values (a_id, cA, 'teste:21:' || sfx, true, 'x: IA pedida', 'aguardando_ia', 1, 1);
  insert into public.nx_auto_sequencias (automacao_id, cliente_id, chave, contato_id, alvo, acoes, passo, status, pedido_id)
  values (a_id, cA, 'teste:21:' || sfx, ct, jsonb_build_object('negocio_id', l1, 'contato_id', ct), '[{"tipo":"ia_decidir"}]'::jsonb, 1, 'aguardando_ia', ped);
  n := (select count(*) from public.nx_notificacoes x where x.cliente_id = cA and x.titulo = 'IA pausada temporariamente');
  j := public.nx_auto_ia_falhar(ped, 'a chave da IA é inválida', true, 1800, false);
  perform pg_temp.ok((j ->> 'tentar_de_novo')::boolean and (j ->> 'adiado')::boolean and (j ->> 'proximo_em') is not null, 'plataforma: tentar_de_novo + adiado ' || j::text);
  perform pg_temp.ok((select status = 'adiado' and tentativas = 0 and pego_em is null and detalhe = 'a chave da IA é inválida'
                        and proximo_em between now() + interval '29 minutes' and now() + interval '31 minutes' from public.nx_auto_ia_pedidos where id = ped),
    'pedido adiado por 30 min sem gastar tentativa');
  perform pg_temp.ok((select count(*) from public.nx_notificacoes x where x.cliente_id = cA and x.conta_id = k_adm and x.titulo = 'IA pausada temporariamente' and x.link = '#/automacoes') = 1, 'admin avisado uma vez');
  -- conta também os gestores/super da plataforma, que recebem a mesma notificação (em produção existem): mede a diferença
  n := (select count(*) from public.nx_notificacoes x where x.cliente_id = cA and x.titulo = 'IA pausada temporariamente');
  perform pg_temp.ok((select status from public.nx_auto_sequencias s where s.pedido_id = ped) = 'aguardando_ia', 'a sequência continua esperando a IA (nada morreu)');
  perform pg_temp.ok(json_array_length(public.nx_auto_ia_pegar(ped, 5)) = 0, 'antes da hora o adiado não é entregue');
  update public.nx_auto_ia_pedidos set proximo_em = now() - interval '1 second' where id = ped;
  j := public.nx_auto_ia_pegar(ped, 5);
  perform pg_temp.ok(json_array_length(j) = 1 and (select status = 'processando' and tentativas = 1 from public.nx_auto_ia_pedidos where id = ped), 'na hora o adiado é entregue (1ª tentativa de verdade)');
  j := public.nx_auto_ia_falhar(ped, 'cota do mês esgotada', true, 1800, false);
  perform pg_temp.ok((select count(*) from public.nx_notificacoes x where x.cliente_id = cA and x.titulo = 'IA pausada temporariamente') = n, 'segundo adiamento em 24 h não avisa de novo');
  update public.nx_auto_ia_pedidos set proximo_em = now() - interval '1 second' where id = ped;
  perform public.nx_auto_ia_pegar(ped, 5);
  j := public.nx_auto_ia_falhar(ped, 'ritmo da cota', true, 60, false);
  perform pg_temp.ok((j ->> 'adiado')::boolean is false and (select status = 'pendente' and tentativas = 0 from public.nx_auto_ia_pedidos where id = ped), 'espera curta (60 s) continua pendente sem gastar tentativa');
  -- chamar: adiado velho não morre; pendente velho (contado da última espera) morre; sem chave da IA nada é despachado
  update public.nx_auto_ia_pedidos set status = 'adiado', criado_em = now() - interval '3 hours', proximo_em = now() - interval '3 hours' where id = ped;
  update public.nx_config set anthropic_api_key = null where id = 1;
  n := public.nx_auto_ia_chamar();
  perform pg_temp.ok(n = 0 and (select status = 'adiado' and despachado_em is null from public.nx_auto_ia_pedidos where id = ped), 'adiado há 3 h sobrevive ao corte de 2 h; sem chave não despacha');
  update public.nx_config set anthropic_api_key = 'FAKE-21-' || sfx where id = 1;
  n := public.nx_auto_ia_chamar();
  perform pg_temp.ok(n >= 1 and (select despachado_em is not null from public.nx_auto_ia_pedidos where id = ped), 'com chave o adiado vencido é despachado');
  -- o adiado (criado há 3 h) acorda pelo pegar → processando com acordou_em: o corte de 2 h conta daí, não morre no meio da decisão
  j := public.nx_auto_ia_pegar(ped, 5);
  perform pg_temp.ok(json_array_length(j) = 1 and (select status = 'processando' and acordou_em > now() - interval '1 minute' from public.nx_auto_ia_pedidos where id = ped),
    'pegar um adiado marca acordou_em');
  perform public.nx_auto_ia_chamar();
  perform pg_temp.ok((select status = 'processando' from public.nx_auto_ia_pedidos where id = ped), 'adiado que acordou há 1 min (criado há 3 h) não morre no corte de 2 h');
  perform public.nx_auto_ia_falhar(ped, 'a IA demorou', true, 60, true);
  perform public.nx_auto_ia_chamar();
  perform pg_temp.ok((select status = 'pendente' from public.nx_auto_ia_pedidos where id = ped), 'e se voltar a pendente (espera curta) também não');
  update public.nx_auto_ia_pedidos set acordou_em = now() - interval '2 hours 1 minute' where id = ped;
  perform public.nx_auto_ia_chamar();
  perform pg_temp.ok((select status = 'erro' and detalhe = 'a IA não respondeu em 2 horas' from public.nx_auto_ia_pedidos where id = ped), 'pendente esquecido há 2 h (desde que acordou) vira erro (como antes)');
  perform pg_temp.ok((select status from public.nx_auto_sequencias s where s.automacao_id = a_id) = 'erro', 'e a sequência para');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_auto_ia_falhar(%s,%L,true,1800,false)', ped, 'x')) = 'ok' and (public.nx_auto_ia_falhar(ped, 'x', true, 1800, false) ->> 'erro') = 'pedido_encerrado', 'pedido encerrado não volta');

  -- ---------------------------------------------------------- S-B14 uso da IA: registrar_reserva (8 e 5 argumentos), nx_ia_uso_dia
  perform pg_temp.ok(to_regprocedure('public.nx_ia_registrar_reserva(uuid,text,integer,integer,boolean)') is not null
                 and to_regprocedure('public.nx_ia_registrar_reserva(uuid,text,integer,integer,boolean,numeric,text,integer)') is not null, 'a de 5 argumentos continua e a de 8 existe (nada foi removido)');
  perform pg_temp.ok((select p.pronargdefaults from pg_proc p where p.oid = to_regprocedure('public.nx_ia_registrar_reserva(uuid,text,integer,integer,boolean,numeric,text,integer)')) = 0
                 and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname = 'nx_ia_registrar_reserva' and p.pronargdefaults > 0) = 0,
    'nenhuma sobrecarga com default: 5 chaves só casam com a de 5 e 8 só com a de 8 (sem PGRST203)');
  res := (public.nx_ia_reservar(cA, k_adm, 'sugerir') ->> 'reserva_id')::uuid;
  perform pg_temp.ok(res is not null, 'fixture: reserva');
  j := public.nx_ia_registrar_reserva(res, 'claude-opus-5-5', 1000, 200, true, 0.0123, 'end_turn', 850);
  perform pg_temp.ok((j ->> 'ok')::boolean and (select custo_usd = 0.0123 and stop_reason = 'end_turn' and ms = 850 and tokens_in = 1000 and ok from public.nx_ia_uso where reserva_id = res), 'uso registrado com custo/stop_reason/ms');
  res2 := (public.nx_ia_reservar(cA, k_adm, 'resumir') ->> 'reserva_id')::uuid;
  j := public.nx_ia_registrar_reserva(res2, 'claude-opus-5-5', 10, 5, true);
  perform pg_temp.ok((j ->> 'ok')::boolean and (select custo_usd is null and stop_reason is null and ms is null from public.nx_ia_uso where reserva_id = res2), 'a chamada de 5 argumentos continua valendo (assinatura antiga)');
  perform pg_temp.ok((public.nx_ia_registrar_reserva(res2, 'm', 1, 1, true) ->> 'ok')::boolean, 'registrar de novo a mesma reserva é idempotente');
  j := public.nx_ia_uso_dia(t_adm, cA, 14);
  perform pg_temp.ok(json_array_length(j) = 14 and (j -> 0 ->> 'dia') = to_char(hoje - 13, 'YYYY-MM-DD') and (j -> 13 ->> 'dia') = to_char(hoje, 'YYYY-MM-DD'), 'nx_ia_uso_dia: 14 dias, mais antigo primeiro');
  perform pg_temp.ok((j -> 13 ->> 'chamadas')::int = 2 and (j -> 13 ->> 'tokens_in')::int = 1010 and (j -> 13 ->> 'tokens_out')::int = 205 and (j -> 13 ->> 'custo_usd')::numeric = 0.0123, 'hoje: 2 chamadas, tokens somados, custo ' || (j -> 13)::text);
  perform pg_temp.ok((j -> 0 ->> 'chamadas')::int = 0 and (j -> 0 ->> 'custo_usd')::numeric = 0, 'dia sem uso vem com zeros');
  perform pg_temp.ok((select array_agg(k order by o) from json_object_keys(j -> 0) with ordinality z(k, o)) = array['dia', 'chamadas', 'tokens_in', 'tokens_out', 'custo_usd'], 'chaves na ordem do contrato');
  perform pg_temp.ok(json_array_length(public.nx_ia_uso_dia(t_adm, cA, 500)) = 90, 'p_dias limitado a 90');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ia_uso_dia(%L,%L,14)', t_at, cA)) like 'sem_permissao%', 'atendente não vê o uso');

  -- ---------------------------------------------------------- S-B14 execuções por dia
  insert into public.nx_auto_execucoes (automacao_id, cliente_id, chave, ok, detalhe, criado_em) values
    (a_id, cA, 'd21:a:' || sfx, true, 'Tarefa criada', now()), (a_id, cA, 'd21:b:' || sfx, true, 'Tarefa criada', now()),
    (a_id, cA, 'd21:c:' || sfx, false, 'codewords_sem_aparelho', now()),
    (a_id, cA, 'd21:d:' || sfx, true, 'Condições não atendidas — nada feito.', now()),
    (a_id, cA, 'd21:e:' || sfx, true, 'Mensagem enviada', now() - interval '3 days');
  j := public.nx_automacao_execucoes_dia(t_adm, cA, a_id, 14);
  perform pg_temp.ok(json_array_length(j) = 14 and (j -> 0 ->> 'dia') < (j -> 13 ->> 'dia') and (j -> 13 ->> 'dia') = to_char(hoje, 'YYYY-MM-DD'), '14 dias, mais antigo primeiro');
  perform pg_temp.ok((select array_agg(k order by o) from json_object_keys(j -> 0) with ordinality z(k, o)) = array['dia', 'ok', 'erro'], 'chaves {dia, ok, erro}');
  -- hoje: 2 «Tarefa criada» ok (a «nada feito» fica fora); erros = codewords_sem_aparelho + a execução da IA que falhou no bloco S-B14 acima
  perform pg_temp.ok((j -> 13 ->> 'erro')::int = 2 and (j -> 13 ->> 'ok')::int = 2 and (j -> 10 ->> 'ok')::int = 1, 'hoje 2 ok (a «nada feito» fica fora) + 2 erros; há 3 dias 1 ok ' || j::text);
  perform pg_temp.ok((select sum((x ->> 'ok')::int + (x ->> 'erro')::int) from json_array_elements(j) x) = json_array_length(public.nx_automacao_execucoes(t_adm, cA, a_id, 200)), 'a série soma a lista de nx_automacao_execucoes');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_automacao_execucoes_dia(%L,%L,%L,14)', t_adm, cA, gen_random_uuid())) = 'automacao_nao_encontrada', 'automação inexistente → automacao_nao_encontrada');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_automacao_execucoes_dia(%L,%L,%L,14)', t_at, cA, a_id)) like 'sem_permissao%', 'atendente não vê execuções');

  -- ---------------------------------------------------------- permissões
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_agenda_presenca(text,uuid,bigint,text)', 'execute')
                 and has_function_privilege('anon', 'public.nx_ia_uso_dia(text,uuid,integer)', 'execute')
                 and has_function_privilege('anon', 'public.nx_automacao_execucoes_dia(text,uuid,uuid,integer)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_ia_registrar_reserva(uuid,text,integer,integer,boolean,numeric,text,integer)', 'execute')
                 and has_function_privilege('service_role', 'public.nx_ia_registrar_reserva(uuid,text,integer,integer,boolean,numeric,text,integer)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_ia_registrar_reserva(uuid,text,integer,integer,boolean)', 'execute')
                 and has_function_privilege('service_role', 'public.nx_ia_registrar_reserva(uuid,text,integer,integer,boolean)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_auto_ia_avisar_pausa(uuid,text)', 'execute'), 'painel anon; internas só service_role');
  perform pg_temp.ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname like 'nx\_%' escape '\' and p.prokind = 'f'
                         and has_function_privilege('authenticated', p.oid, 'execute')) = 0, 'nenhuma nx_* executável por authenticated (depois da c)');

  raise exception 'OK_21_DADOS_TELAS — nx_inicio (funil, séries, prazo, fila de espera, canais), nx_dados.hora_conversa, agenda (encaixe, dono_nome, presença), IA adiada, uso da IA por dia e execuções por dia';
end $t$;

rollback;
