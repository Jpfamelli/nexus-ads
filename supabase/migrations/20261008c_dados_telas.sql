-- ============================================================
-- ÓRBITA — 20261008c_dados_telas.sql · plano «100+ melhorias» de 08/10/2026 · frente S-B (banco), migração c
-- Dados que as telas da onda 2 consomem (contratos 4, 5, 6 e 7) e a fila de decisões da IA. ADITIVA e idempotente: create or
-- replace, if not exists, do $$ … $$ com checagem; nenhuma assinatura existente muda nem sai (nada de drop function); nenhum dado
-- de produção é alterado. nx_ia_registrar_reserva ganha uma SOBRECARGA de 8 argumentos sem default (custo_usd, stop_reason, ms
-- no fim) ao lado da de 5, que fica como está: sem default as duas não se confundem no PostgREST (PGRST203 só aparece quando
-- um mesmo conjunto de chaves casa com as duas). A de 8 é a que comum.js registrarUsoIA já faz (e cai para 5 no banco antigo).
--
-- Por quê (mapa E, contratos 4–7 do plano):
--   S-B14 [E169] nx_auto_ia_pedidos ganha o estado 'adiado' (espera por PLATAFORMA — chave, cota, sem tempo — sem gastar tentativa
--         e fora do corte de 2 h); nx_auto_ia_falhar (MESMA assinatura: p_pedido, p_erro, p_tentar, p_em, p_conta): p_tentar com
--         p_conta = false e p_em ≥ 300 s → 'adiado' até proximo_em (a coluna já existia com esse papel: nada de coluna repetida);
--         esperas curtas (ritmo da cota, rodada sem tempo) continuam 'pendente' como antes; o adiamento avisa os admins 1×/24 h;
--         nx_auto_ia_pegar entrega 'adiado' vencido; nx_auto_ia_chamar não mata adiados, não despacha sem chave da IA e mede o
--         corte de 2 h da criação ou de quando o pedido ACORDOU do adiamento (coluna nova acordou_em, gravada pelo pegar). [E172][E177] nx_ia_uso.custo_usd/stop_reason/ms via nx_ia_registrar_reserva;
--         nx_ia_uso_dia(p_token, p_cliente, p_dias) e nx_automacao_execucoes_dia(p_token, p_cliente, p_automacao, p_dias).
--   S-B15 contrato 4: nx_inicio ganha funil_mes {leads, conversas, agendados, ganhos} (negócios que ENTRARAM no mês — funil padrão/Ads
--         — e, deles, quantos têm conversa, consulta marcada e ganho), series_14d {aguardando, consultas, valor_aberto, leads}
--         (14 inteiros, mais antigo primeiro: conversas abertas no dia, consultas do dia, valor previsto em aberto no fim do dia,
--         negócios do dia), conversas.respondidas_no_prazo_pct (1ª resposta ≤ 15 min nas conversas abertas há 7 dias),
--         conversas.aguardando_lista (≤ 5, a mais antiga primeiro) e canais[].provedor/estado/desde/sync_em.
--         contrato 5: nx_dados.leads[].hora_conversa (0–23 em São Paulo da 1ª mensagem recebida; null sem conversa) e
--         nx_dados.cliente.vertical (pedido da frente P).
--         contrato 6: nx_agenda_marcar_core grava campos.encaixe (e limpa a presença ao (re)marcar); nx_agenda_dia devolve
--         encaixe, dono_nome e presenca; nx_agenda_presenca(p_token, p_cliente, p_negocio, p_estado) → {ok, presenca, estagio_id}.
-- Smoke: supabase/testes/21_dados_telas.sql (begin … rollback; termina em 'OK_21_…'). Falha antes desta migração.
-- Erros em português: errcode 22023 + hint. Toda função: security definer + set search_path = ''.
-- ============================================================

-- ------------------------------------------------------------
-- 1. S-B14 [E169] fila de decisões da IA: estado 'adiado'
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in select c.conname from pg_constraint c
            where c.conrelid = 'public.nx_auto_ia_pedidos'::regclass and c.contype = 'c'
              and pg_get_constraintdef(c.oid) like '%''processando''%' and pg_get_constraintdef(c.oid) not like '%''adiado''%' loop
    execute format('alter table public.nx_auto_ia_pedidos drop constraint %I', r.conname);
  end loop;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.nx_auto_ia_pedidos'::regclass and c.conname = 'nx_auto_ia_pedidos_status_check') then
    alter table public.nx_auto_ia_pedidos add constraint nx_auto_ia_pedidos_status_check
      check (status in ('pendente', 'processando', 'adiado', 'aplicado', 'erro', 'cancelado')) not valid;   -- superconjunto do anterior
  end if;
end $$;
create index if not exists nx_auto_ia_adiados on public.nx_auto_ia_pedidos (proximo_em, id) where status = 'adiado';
-- quando o pedido saiu de «adiado» pela última vez (nx_auto_ia_pegar): o corte de 2 h de nx_auto_ia_chamar conta daqui
alter table public.nx_auto_ia_pedidos add column if not exists acordou_em timestamptz;

-- aviso único (24 h por cliente) aos admins quando a IA fica em pausa por plataforma
create or replace function public.nx_auto_ia_avisar_pausa(p_cliente uuid, p_motivo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.nx_notificacoes n
              where n.cliente_id = p_cliente and n.tipo = 'sistema' and n.titulo = 'IA pausada temporariamente'
                and n.criado_em > now() - interval '24 hours') then
    return false;
  end if;
  perform public.nx_notificar(p_cliente, null, 'sistema', 'IA pausada temporariamente',
    left('As decisões automáticas esperam a IA voltar: ' || coalesce(nullif(btrim(p_motivo), ''), 'indisponível') || '. Nada foi perdido.', 500),
    '#/automacoes');
  return true;
end $$;

-- nx_auto_ia_falhar: cópia de 20261001a + 'adiado'. MESMA assinatura e MESMOS retornos (+ adiado/proximo_em).
--   p_tentar = true e p_conta = false e p_em ≥ 300 s  → 'adiado' (plataforma: chave, cota do mês, 401/403…): sem gastar tentativa,
--                                                        fora do corte de 2 h, aviso 1×/24 h
--   p_tentar = true (demais casos, com tentativas)      → 'pendente' daqui a p_em segundos (como antes)
--   senão                                                → 'erro' e a sequência para (como antes)
create or replace function public.nx_auto_ia_falhar(p_pedido bigint, p_erro text, p_tentar boolean default false,
                                                    p_em int default 120, p_conta boolean default true)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.nx_auto_ia_pedidos; v_erro text := left(coalesce(nullif(btrim(p_erro), ''), 'a IA não respondeu'), 400);
  v_adiar boolean; v_prox timestamptz;
begin
  select * into r from public.nx_auto_ia_pedidos q where q.id = p_pedido for update;
  if r.id is null or r.status not in ('pendente', 'processando', 'adiado') then
    return json_build_object('ok', false, 'erro', 'pedido_encerrado');
  end if;
  v_adiar := coalesce(p_tentar, false) and not coalesce(p_conta, true) and coalesce(p_em, 120) >= 300;
  if coalesce(p_tentar, false) and (v_adiar or r.tentativas < 3 or not coalesce(p_conta, true)) then
    v_prox := now() + make_interval(secs => least(greatest(coalesce(p_em, 120), 5), 21600));
    update public.nx_auto_ia_pedidos set status = case when v_adiar then 'adiado' else 'pendente' end, pego_em = null, despachado_em = null,
           proximo_em = v_prox,
           tentativas = case when coalesce(p_conta, true) then tentativas else greatest(tentativas - 1, 0) end,
           detalhe = left(v_erro, 500)
     where id = r.id;
    if v_adiar then perform public.nx_auto_ia_avisar_pausa(r.cliente_id, v_erro); end if;
    return json_build_object('ok', true, 'tentar_de_novo', true, 'adiado', v_adiar, 'proximo_em', v_prox);
  end if;
  update public.nx_auto_ia_pedidos set status = 'erro', pego_em = null, concluido_em = now(), detalhe = left(v_erro, 500) where id = r.id;
  perform public.nx_auto_ia_encerrar(r.id, false, 'IA: ' || v_erro);
  return json_build_object('ok', true, 'tentar_de_novo', false);
end $$;

-- nx_auto_ia_pegar: cópia de 20261001b (bloco 14) + 'adiado' vencido também é entregue (e marca acordou_em)
create or replace function public.nx_auto_ia_pegar(p_pedido bigint default null, p_max int default 5)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare r public.nx_auto_ia_pedidos; v_out jsonb := '[]'::jsonb; v_lim int := least(greatest(coalesce(p_max, 5), 1), 20);
begin
  -- preso há mais de 10 min: volta para a fila (até 3 tentativas)
  for r in select * from public.nx_auto_ia_pedidos q
            where q.status = 'processando' and q.pego_em < now() - interval '10 minutes' for update skip locked loop
    perform public.nx_auto_ia_falhar(r.id, 'a IA não respondeu a tempo', true, 60, true);
  end loop;
  -- pedido de sequência que não espera mais (cancelada ou automação desligada) não gasta cota
  update public.nx_auto_ia_pedidos q set status = 'cancelado', concluido_em = now(), detalhe = 'a sequência foi cancelada'
   where q.status in ('pendente', 'adiado')
     and not exists (select 1 from public.nx_auto_sequencias s where s.pedido_id = q.id and s.status = 'aguardando_ia');
  for r in select * from public.nx_auto_ia_pedidos q
            where q.status in ('pendente', 'adiado') and q.proximo_em <= now() and (p_pedido is null or q.id = p_pedido)
            order by q.id limit v_lim for update skip locked loop
    if not public.nx_auto_cliente_apto(r.cliente_id) then
      -- cliente suspenso, sem o módulo, teste vencido ou organização suspensa: não gasta cota nem muda dado
      update public.nx_auto_ia_pedidos set status = 'cancelado', concluido_em = now(), detalhe = 'a automação está bloqueada neste cliente'
       where id = r.id;
      with c as (update public.nx_auto_sequencias set status = 'cancelada', motivo = 'a automação está bloqueada neste cliente',
                        pedido_id = null, atualizado_em = now()
                  where pedido_id = r.id and status = 'aguardando_ia' returning automacao_id, chave)
      update public.nx_auto_execucoes x set estado = 'cancelada', atualizado_em = now(),
             detalhe = left(coalesce(x.detalhe, '') || ' · cancelada: a automação está bloqueada neste cliente', 1000)
        from c where x.automacao_id = c.automacao_id and x.chave = c.chave;
      continue;
    end if;
    update public.nx_auto_ia_pedidos set status = 'processando', pego_em = now(), tentativas = tentativas + 1,
           acordou_em = case when r.status = 'adiado' then now() else acordou_em end
     where id = r.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', r.id, 'cliente_id', r.cliente_id, 'tarefa', r.tarefa, 'instrucao', r.instrucao, 'tentativas', r.tentativas + 1,
      'contexto', public.nx_auto_ia_contexto(r)));
  end loop;
  return v_out::json;
end $$;

-- nx_auto_ia_chamar: cópia de 20261001a + (a) 'adiado' fica fora do corte de 2 h (pendente/processando velhos morrem como antes);
-- (b) sem chave da IA configurada nada é despachado (os pedidos esperam); (c) adiado vencido também é despachado
create or replace function public.nx_auto_ia_chamar()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_n int;
begin
  -- o corte de 2 h conta da criação OU de quando o pedido acordou de um adiamento (acordou_em): um pedido que ficou 'adiado'
  -- por horas e acordou (processando/pendente de novo) não pode morrer no minuto seguinte, no meio da decisão.
  for r in select q.id from public.nx_auto_ia_pedidos q
            where q.status in ('pendente', 'processando') and coalesce(q.acordou_em, q.criado_em) < now() - interval '2 hours'
            for update skip locked loop
    perform public.nx_auto_ia_falhar(r.id, 'a IA não respondeu em 2 horas', false);
  end loop;
  if not exists (select 1 from public.nx_config x where x.id = 1 and nullif(btrim(coalesce(x.anthropic_api_key, '')), '') is not null) then
    return 0;
  end if;
  update public.nx_auto_ia_pedidos set despachado_em = now()
   where status in ('pendente', 'adiado') and proximo_em <= now() and (despachado_em is null or despachado_em < now() - interval '90 seconds');
  get diagnostics v_n = row_count;
  if v_n > 0 then
    begin
      perform public.nx_disparar('nx-ia', jsonb_build_object('acao', 'automacao_decidir', 'max', 10));
    exception when others then
      -- sem funcoes_url (ou função fora do ar): os pedidos esperam a próxima tentativa
      raise warning 'nx_auto_ia_chamar: %', sqlerrm;
    end;
  end if;
  return v_n;
end $$;

-- ------------------------------------------------------------
-- 2. S-B14 [E172][E177] uso da IA: custo, stop_reason, latência (contrato 7)
-- ------------------------------------------------------------
alter table public.nx_ia_uso
  add column if not exists custo_usd numeric(12, 6) check (custo_usd is null or custo_usd >= 0),
  add column if not exists stop_reason text check (stop_reason is null or char_length(stop_reason) <= 40),
  add column if not exists ms int check (ms is null or ms >= 0);

-- Sobrecarga NOVA de 8 argumentos, TODOS obrigatórios (padrão de nx_cv_nota com p_req, 20261002c): a de 5 argumentos (20260930c)
-- continua intocada. Sem default não há ambiguidade no PostgREST — 5 chaves só casam com a de 5, 8 chaves só com a de 8 — e nada
-- é removido do banco (comum.js registrarUsoIA sempre manda as 8 chaves, com null no que não sabe, e cai para 5 no banco antigo).
create or replace function public.nx_ia_registrar_reserva(p_reserva uuid, p_modelo text, p_in int, p_out int, p_ok boolean,
                                                          p_custo_usd numeric, p_stop_reason text, p_ms int)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.nx_ia_reservas;
begin
  if p_reserva is null then return json_build_object('ok', false, 'erro', 'dados_invalidos'); end if;
  select * into r from public.nx_ia_reservas where id = p_reserva for update;
  if not found then
    return json_build_object('ok', exists(select 1 from public.nx_ia_uso u where u.reserva_id = p_reserva));
  end if;
  insert into public.nx_ia_uso(reserva_id, cliente_id, conta_id, acao, modelo, tokens_in, tokens_out, ok, custo_usd, stop_reason, ms)
  values (r.id, r.cliente_id, r.conta_id, r.acao, left(p_modelo, 80), p_in, p_out, coalesce(p_ok, false),
          case when p_custo_usd >= 0 then round(p_custo_usd, 6) end, left(nullif(btrim(coalesce(p_stop_reason, '')), ''), 40),
          case when p_ms >= 0 then p_ms end)
  on conflict (reserva_id) where reserva_id is not null do nothing;
  delete from public.nx_ia_reservas where id = r.id;
  return json_build_object('ok', true);
end $$;

-- Uso de IA por dia (admin+ do cliente; o Admin da plataforma vê pelo super): [{dia, chamadas, tokens_in, tokens_out, custo_usd}],
-- um item por dia dos últimos p_dias (≤ 90), mais antigo primeiro, dias sem uso com zeros.
create or replace function public.nx_ia_uso_dia(p_token text, p_cliente uuid, p_dias int default 14)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  v_dias int := least(greatest(coalesce(p_dias, 14), 1), 90);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini timestamptz;
begin
  v_ini := (v_hoje - (v_dias - 1))::timestamp at time zone 'America/Sao_Paulo';
  return coalesce((
    select json_agg(json_build_object('dia', to_char(d.dia, 'YYYY-MM-DD'), 'chamadas', coalesce(u.chamadas, 0),
                                      'tokens_in', coalesce(u.tin, 0), 'tokens_out', coalesce(u.tout, 0),
                                      'custo_usd', coalesce(u.custo, 0)) order by d.dia)
      from (select (v_hoje - (v_dias - 1) + g) as dia from generate_series(0, v_dias - 1) g) d
      left join (select (x.criado_em at time zone 'America/Sao_Paulo')::date as dia, count(*)::int as chamadas,
                        sum(coalesce(x.tokens_in, 0))::bigint as tin, sum(coalesce(x.tokens_out, 0))::bigint as tout,
                        round(sum(coalesce(x.custo_usd, 0)), 4) as custo
                   from public.nx_ia_uso x
                  where x.cliente_id = p_cliente and x.criado_em >= v_ini
                  group by 1) u on u.dia = d.dia), '[]'::json);
end $$;

-- Execuções de uma automação por dia (supervisor+): [{dia, ok, erro}] — a MESMA lista de nx_automacao_execucoes (sem os
-- «Condições não atendidas»), agrupada por dia em São Paulo; p_dias ≤ 60; mais antigo primeiro; dias sem execução com zeros.
create or replace function public.nx_automacao_execucoes_dia(p_token text, p_cliente uuid, p_automacao uuid, p_dias int default 14)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'supervisor');
  v_dias int := least(greatest(coalesce(p_dias, 14), 1), 60);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini timestamptz;
begin
  perform public.nx_exigir_modulo(p_cliente, 'automacoes');
  if not exists (select 1 from public.nx_automacoes a where a.id = p_automacao and a.cliente_id = p_cliente) then
    raise exception 'automacao_nao_encontrada' using errcode = '22023';
  end if;
  v_ini := (v_hoje - (v_dias - 1))::timestamp at time zone 'America/Sao_Paulo';
  return coalesce((
    select json_agg(json_build_object('dia', to_char(d.dia, 'YYYY-MM-DD'), 'ok', coalesce(e.n_ok, 0), 'erro', coalesce(e.n_erro, 0)) order by d.dia)
      from (select (v_hoje - (v_dias - 1) + g) as dia from generate_series(0, v_dias - 1) g) d
      left join (select (x.criado_em at time zone 'America/Sao_Paulo')::date as dia,
                        count(*) filter (where x.ok)::int as n_ok, count(*) filter (where not x.ok)::int as n_erro
                   from public.nx_auto_execucoes x
                  where x.automacao_id = p_automacao and x.cliente_id = p_cliente and x.criado_em >= v_ini
                    and not (x.ok and x.detalhe = 'Condições não atendidas — nada feito.')
                  group by 1) e on e.dia = d.dia), '[]'::json);
end $$;

-- ------------------------------------------------------------
-- 3. S-B15 contrato 4: nx_inicio — cópia de 20260928g + funil_mes, series_14d, respondidas_no_prazo_pct, aguardando_lista, canais
-- ------------------------------------------------------------
create or replace function public.nx_inicio(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  v_rank int := public.nx_rank(v.papel);
  v_todos boolean := v_rank >= 2 or coalesce(v.ver_todas, true);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_amanha timestamptz := ((v_hoje + 1)::timestamp at time zone 'America/Sao_Paulo');
  v_mes date := date_trunc('month', v_hoje::timestamp)::date;
  v_ini_mes timestamptz := (v_mes::timestamp at time zone 'America/Sao_Paulo');
  v_mes_ant date := (v_mes - interval '1 month')::date;
  v_ini_mes_ant timestamptz := (v_mes_ant::timestamp at time zone 'America/Sao_Paulo');
  -- "mês passado até hoje": o mesmo dia do mês (ou o último dia do mês passado, se for menor)
  v_ant_parcial timestamptz := (least(v_mes_ant + (v_hoje - v_mes) + 1, v_mes)::timestamp at time zone 'America/Sao_Paulo');
  v_ini_hoje timestamptz := (v_hoje::timestamp at time zone 'America/Sao_Paulo');
  v_ini14 timestamptz := ((v_hoje - 13)::timestamp at time zone 'America/Sao_Paulo');
  j_cv json; j_tf json; j_prox json; j_ng json; j_ld json; j_cn json; v_notif int;
  v_prazo int; j_ag json; j_funil json; j_s_ag json; j_s_cs json; j_s_va json; j_s_ld json;
begin
  -- conversas (abertas/pendentes) visíveis para quem pediu. As contagens são as MESMAS dos
  -- contadores das abas de Conversas (nx_cv_listar → contagens): cada número do Início leva à
  -- aba com o mesmo número. Ocultas (contato bloqueado) ficam fora, como nas abas; "sem dono" e
  -- "minhas" contam abertas + pendentes (como as abas Sem dono e Minhas).
  select json_build_object(
           'abertas', count(*) filter (where cv.status = 'aberta'),
           'aguardando', count(*) filter (where cv.status = 'aberta' and cv.aguardando),
           'sem_dono', count(*) filter (where cv.atribuida_a is null),
           'minhas', count(*) filter (where cv.atribuida_a = v.conta_id),
           'pendentes', count(*) filter (where cv.status = 'pendente'),
           'espera_mais_antiga_min', floor(extract(epoch from now() - min(coalesce(cv.ultima_entrada_em, cv.aberta_em))
                                     filter (where cv.status = 'aberta' and cv.aguardando)) / 60)::int)
    into j_cv
    from public.nx_conversas cv
   where cv.status in ('aberta', 'pendente')
     and not cv.oculta
     -- regra nx_cv_visivel
     and cv.cliente_id = p_cliente
     and ( v_rank >= 3
        or cv.atribuida_a = v.conta_id
        or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
              or cv.departamento_id = any(v.departamentos))
             and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) );

  -- contrato 4: 1ª resposta em até 15 min (conversas visíveis abertas nos últimos 7 dias); sem conversa → null
  select round(100.0 * count(*) filter (where cv.primeira_resposta_em is not null
                                          and cv.primeira_resposta_em <= cv.aberta_em + interval '15 minutes') / nullif(count(*), 0))::int
    into v_prazo
    from public.nx_conversas cv
   where cv.cliente_id = p_cliente and not cv.oculta and cv.aberta_em >= now() - interval '7 days'
     and ( v_rank >= 3
        or cv.atribuida_a = v.conta_id
        or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
              or cv.departamento_id = any(v.departamentos))
             and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) );

  -- contrato 4: quem espera agora (≤ 5, a espera mais longa primeiro); canal = provedor do número
  select coalesce(json_agg(json_build_object('id', x.id, 'nome', x.nome, 'espera_min', x.espera_min, 'canal', x.canal)
                           order by x.espera_min desc, x.id), '[]'::json)
    into j_ag
    from (select cv.id, coalesce(k.nome, k.telefone) as nome,
                 floor(extract(epoch from now() - coalesce(cv.ultima_entrada_em, cv.aberta_em)) / 60)::int as espera_min,
                 coalesce(ch.provedor, 'meta') as canal
            from public.nx_conversas cv
            left join public.nx_contatos k on k.id = cv.contato_id and k.cliente_id = p_cliente
            left join public.nx_canais ch on ch.id = cv.canal_id
           where cv.cliente_id = p_cliente and cv.status = 'aberta' and cv.aguardando and not cv.oculta
             and ( v_rank >= 3
                or cv.atribuida_a = v.conta_id
                or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                      or cv.departamento_id = any(v.departamentos))
                     and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )
           order by coalesce(cv.ultima_entrada_em, cv.aberta_em), cv.id
           limit 5) x;

  -- tarefas da pessoa ainda abertas — a MESMA regra da tela Tarefas (nx_tarefas_listar, "Minhas"):
  -- só as dela (tarefa sem dono ou de colega não aparece: atendente não vê tarefa alheia);
  -- "hoje" = vence no dia de hoje (SP), "atrasadas" = já venceu — iguais aos contadores das abas.
  select json_build_object(
           'hoje', count(*) filter (where t.vence_em >= v_ini_hoje and t.vence_em < v_amanha),
           'atrasadas', count(*) filter (where t.vence_em < now()),
           'abertas', count(*))
    into j_tf
    from public.nx_tarefas t
   where t.cliente_id = p_cliente and t.concluida_em is null
     and t.dono_id = v.conta_id;
  select coalesce(json_agg(x order by x.vence_em nulls last, x.id), '[]'::json)
    into j_prox
    from (select t.id, t.titulo, t.tipo, t.vence_em, (t.vence_em < now()) as atrasada,
                 c.nome as contato_nome, t.contato_id, t.negocio_id
            from public.nx_tarefas t
            left join public.nx_contatos c on c.id = t.contato_id and c.cliente_id = p_cliente
           where t.cliente_id = p_cliente and t.concluida_em is null
             and t.dono_id = v.conta_id
           order by t.vence_em nulls last, t.id
           limit 5) x;

  -- negócios: abertos agora + fechados no mês e no mês anterior (por fechado_em, nunca por criado_em)
  select json_build_object(
           'abertos', count(*) filter (where l.status = 'aberto'),
           'valor_aberto', coalesce(sum(coalesce(l.valor_previsto, 0)) filter (where l.status = 'aberto'), 0),
           'previsao_ponderada', round(coalesce(sum(coalesce(l.valor_previsto, 0) * coalesce(e.probabilidade, 0) / 100.0)
                                         filter (where l.status = 'aberto'), 0), 2),
           'ganhos_mes', count(*) filter (where l.status = 'ganho' and l.fechado_em >= v_ini_mes),
           'receita_mes', coalesce(sum(coalesce(l.valor, l.valor_previsto, 0)) filter (where l.status = 'ganho' and l.fechado_em >= v_ini_mes), 0),
           'ganhos_mes_anterior', count(*) filter (where l.status = 'ganho' and l.fechado_em >= v_ini_mes_ant and l.fechado_em < v_ini_mes),
           'receita_mes_anterior', coalesce(sum(coalesce(l.valor, l.valor_previsto, 0))
                                     filter (where l.status = 'ganho' and l.fechado_em >= v_ini_mes_ant and l.fechado_em < v_ini_mes), 0),
           'receita_mes_anterior_parcial', coalesce(sum(coalesce(l.valor, l.valor_previsto, 0))
                                     filter (where l.status = 'ganho' and l.fechado_em >= v_ini_mes_ant and l.fechado_em < v_ant_parcial), 0),
           'dia_do_mes', (v_hoje - v_mes) + 1)
    into j_ng
    from public.nx_leads l
    left join public.nx_estagios e on e.id = l.estagio_id
   where l.cliente_id = p_cliente
     and (l.status = 'aberto' or (l.status = 'ganho' and l.fechado_em >= v_ini_mes_ant))
     and (v_todos or l.dono_id = v.conta_id or l.dono_id is null);

  -- leads = negócios que ENTRARAM pelo funil padrão ou por um funil do Ads (pós-venda não é lead)
  select json_build_object(
           'hoje', count(*) filter (where l.data_conversa = v_hoje),
           'hoje_anuncio', count(*) filter (where l.data_conversa = v_hoje and (l.origem = 'anuncio' or l.plataforma is not null)),
           'semana', count(*),
           'semana_anuncio', count(*) filter (where l.origem = 'anuncio' or l.plataforma is not null))
    into j_ld
    from public.nx_leads l
   where l.cliente_id = p_cliente and l.data_conversa > v_hoje - 7 and l.data_conversa <= v_hoje
     and (l.funil_id is null or exists (select 1 from public.nx_funis f where f.id = l.funil_id and (f.padrao or f.conta_no_ads)))
     and (v_todos or l.dono_id = v.conta_id or l.dono_id is null);

  -- contrato 4: funil do mês até hoje = os negócios que ENTRARAM no mês (mesmo filtro de leads) e, deles, quantos têm conversa,
  -- consulta marcada e ganho — um retrato da coorte do mês, não contagens soltas
  select json_build_object(
           'leads', count(*),
           'conversas', count(*) filter (where exists (select 1 from public.nx_conversas cv
                                                       where cv.cliente_id = p_cliente
                                                         and (cv.negocio_id = l.id
                                                              or (l.contato_id is not null and cv.contato_id = l.contato_id and cv.aberta_em >= v_ini_mes)))),
           'agendados', count(*) filter (where l.consulta_em is not null or l.data_agenda is not null or l.etapa in ('agendada', 'faltou')),
           'ganhos', count(*) filter (where l.status = 'ganho'))
    into j_funil
    from public.nx_leads l
   where l.cliente_id = p_cliente and l.data_conversa >= v_mes and l.data_conversa <= v_hoje
     and (l.funil_id is null or exists (select 1 from public.nx_funis f where f.id = l.funil_id and (f.padrao or f.conta_no_ads)))
     and (v_todos or l.dono_id = v.conta_id or l.dono_id is null);

  -- contrato 4: séries de 14 dias (mais antigo primeiro), inteiros
  --   aguardando = conversas visíveis abertas no dia · consultas = consultas do dia · valor_aberto = valor previsto em aberto no
  --   fim do dia (negócios criados até ali e ainda abertos naquele momento) · leads = negócios do dia (mesmo filtro de leads)
  with dias as (select (v_hoje - 13 + g) as d from generate_series(0, 13) g)
  select json_agg(coalesce(a.n, 0)::int order by dd.d) into j_s_ag
    from dias dd
    left join (select (cv.aberta_em at time zone 'America/Sao_Paulo')::date as d, count(*) as n
                 from public.nx_conversas cv
                where cv.cliente_id = p_cliente and not cv.oculta and cv.aberta_em >= v_ini14
                  and ( v_rank >= 3
                     or cv.atribuida_a = v.conta_id
                     or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                           or cv.departamento_id = any(v.departamentos))
                          and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )
                group by 1) a on a.d = dd.d;
  with dias as (select (v_hoje - 13 + g) as d from generate_series(0, 13) g)
  select json_agg(coalesce(a.n, 0)::int order by dd.d) into j_s_cs
    from dias dd
    left join (select (l.consulta_em at time zone 'America/Sao_Paulo')::date as d, count(*) as n
                 from public.nx_leads l
                where l.cliente_id = p_cliente and l.status in ('aberto', 'ganho') and l.consulta_em >= v_ini14
                  and l.consulta_em < v_amanha
                  and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)
                group by 1) a on a.d = dd.d;
  with dias as (select (v_hoje - 13 + g) as d from generate_series(0, 13) g)
  select json_agg(round(coalesce((
           select sum(coalesce(l.valor_previsto, 0)) from public.nx_leads l
            where l.cliente_id = p_cliente
              and l.criado_em < ((dd.d + 1)::timestamp at time zone 'America/Sao_Paulo')
              and (l.status = 'aberto' or l.fechado_em >= ((dd.d + 1)::timestamp at time zone 'America/Sao_Paulo'))
              and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)), 0))::bigint order by dd.d)
    into j_s_va
    from dias dd;
  with dias as (select (v_hoje - 13 + g) as d from generate_series(0, 13) g)
  select json_agg(coalesce(a.n, 0)::int order by dd.d) into j_s_ld
    from dias dd
    left join (select l.data_conversa as d, count(*) as n
                 from public.nx_leads l
                where l.cliente_id = p_cliente and l.data_conversa > v_hoje - 14 and l.data_conversa <= v_hoje
                  and (l.funil_id is null or exists (select 1 from public.nx_funis f where f.id = l.funil_id and (f.padrao or f.conta_no_ads)))
                  and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)
                group by 1) a on a.d = dd.d;

  -- números de WhatsApp (saúde): nunca devolve segredo. contrato 4: + provedor, estado, desde, sync_em
  select coalesce(json_agg(json_build_object(
           'id', k.id, 'nome', k.nome, 'numero_exibicao', k.numero_exibicao, 'status', k.status,
           'ultimo_erro', k.ultimo_erro, 'app_inscrito', k.app_inscrito, 'verificado_em', k.verificado_em,
           'ultima_entrada_em', (select max(cv.ultima_entrada_em) from public.nx_conversas cv
                                  where cv.canal_id = k.id and cv.cliente_id = p_cliente),
           'provedor', coalesce(k.provedor, 'meta'),
           'estado', public.nx_canal_estado(k),
           'desde', coalesce((select h.em from public.nx_canal_historico h where h.canal_id = k.id order by h.em desc, h.id desc limit 1),
                             k.codewords_conferido_em, k.verificado_em, k.criado_em),
           'sync_em', k.codewords_sync_em)
           order by k.criado_em), '[]'::json)
    into j_cn
    from public.nx_canais k
   where k.cliente_id = p_cliente;

  select count(*) into v_notif
    from public.nx_notificacoes n
   where n.cliente_id = p_cliente and n.conta_id = v.conta_id and n.lida_em is null;

  return json_build_object(
    'hoje', v_hoje, 'agora', now(),
    'conversas', (j_cv::jsonb || jsonb_build_object('respondidas_no_prazo_pct', v_prazo, 'aguardando_lista', j_ag::jsonb))::json,
    'tarefas', (j_tf::jsonb || jsonb_build_object('proximas', j_prox))::json,
    'negocios', j_ng,
    'leads', j_ld,
    'funil_mes', j_funil,
    'series_14d', json_build_object('aguardando', j_s_ag, 'consultas', j_s_cs, 'valor_aberto', j_s_va, 'leads', j_s_ld),
    'canais', j_cn,
    'notificacoes_nao_lidas', v_notif);
end $$;

-- ------------------------------------------------------------
-- 4. S-B15 contrato 5: nx_dados — cópia de 20261001b (bloco 19) + leads[].hora_conversa + cliente.vertical
-- ------------------------------------------------------------
create or replace function public.nx_dados(p_token text, p_cliente uuid, p_dias integer default 130)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura'); v_de date;
begin
  -- teste vencido bloqueia só ESCRITA (ESPEC §4.10): o nx_ctx deixa passar a leitura, o papel de admin é conferido aqui
  if public.nx_rank(v.papel) < public.nx_rank('admin') then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if v.papel not in ('gestor', 'super') then perform public.nx_exigir_modulo(p_cliente, 'ads'); end if;
  v_de := (now() at time zone 'America/Sao_Paulo')::date - least(greatest(coalesce(p_dias, 130), 7), 400);
  return json_build_object(
    'hoje', (now() at time zone 'America/Sao_Paulo')::date,
    -- + vertical (pedido da frente P: o núcleo escolhe o vocabulário dos textos por vertical; sem o campo fica o de sempre)
    'cliente', (select json_build_object('id', id, 'slug', slug, 'nome', nome, 'vertical', vertical, 'cfg', public.nx_cfg_publico(cfg, v.papel, 'dados')) from public.nx_clientes where id = p_cliente),
    'metricas', coalesce((
      select json_agg(json_build_object('p', plataforma, 'd', data, 'n', nivel, 'c', campanha_ext, 'cn', campanha_nome,
             'a', anuncio_ext, 'an', anuncio_nome, 'imp', impressoes, 'alc', alcance, 'freq', frequencia,
             'cli', cliques, 'g', gasto, 'conv', conversoes))
        from public.nx_metricas_dia where cliente_id = p_cliente and data >= v_de), '[]'::json),
    'leads', coalesce((
      select json_agg(row_to_json(l) order by l.data_conversa)
        from (select x.id, x.nome, x.telefone, x.origem, x.plataforma, x.campanha_ext, x.anuncio_ext, x.servico, x.etapa,
                     x.data_conversa, x.data_agenda, x.data_consulta, x.valor, x.obs,
                     -- contrato 5: hora (0–23, São Paulo) da 1ª mensagem recebida da conversa do negócio (ou da conversa do
                     -- contato aberta no dia da conversa); null quando não houve mensagem (negócio digitado à mão)
                     (select extract(hour from (min(m.criado_em) at time zone 'America/Sao_Paulo'))::int
                        from public.nx_mensagens m
                        join public.nx_conversas cv on cv.id = m.conversa_id
                       where cv.cliente_id = x.cliente_id and m.direcao = 'in' and m.tipo <> 'sistema'
                         and (cv.negocio_id = x.id
                              or (x.contato_id is not null and cv.contato_id = x.contato_id
                                  and (cv.aberta_em at time zone 'America/Sao_Paulo')::date = x.data_conversa))) as hora_conversa
                from public.nx_leads x
               where x.cliente_id = p_cliente and (x.data_conversa >= v_de or x.data_consulta >= v_de or x.etapa in ('nova', 'agendada'))
                 and (x.funil_id is null or exists (select 1 from public.nx_funis f where f.id = x.funil_id and f.conta_no_ads))) l), '[]'::json),
    'alertas', coalesce((
      select json_agg(row_to_json(a) order by a.criado_em desc)
        from (select regra, chave, severidade, mensagem, acao, referencia, criado_em, enviado_em, entregue_em, erro_envio
                from public.nx_alertas where cliente_id = p_cliente and criado_em > now() - interval '15 days') a), '[]'::json),
    'relatorios', coalesce((
      select json_agg(row_to_json(r) order by r.referencia desc)
        from (select tipo, referencia, texto, leitura_ia, enviado_em, erro, entregue_em
                from public.nx_relatorios where cliente_id = p_cliente order by referencia desc limit 20) r), '[]'::json),
    'integracoes', coalesce((
      select json_agg(json_build_object('canal', canal, 'ativo', ativo, 'ultimo_sync', ultimo_sync, 'status', status))
        from public.nx_integracoes where cliente_id = p_cliente), '[]'::json));
end $function$;

-- ------------------------------------------------------------
-- 5. S-B15 contrato 6: agenda — encaixe gravado, dono_nome, presença
-- ------------------------------------------------------------
-- nx_agenda_marcar_core: cópia de 20260929b + campos.encaixe (e a presença de uma consulta anterior é limpa ao (re)marcar).
-- MESMA assinatura; o retorno já trazia etapa/anterior.
create or replace function public.nx_agenda_marcar_core(p_cliente uuid, p_negocio bigint, p_inicio timestamptz, p_servico text,
                                                        p_remarcar boolean, p_encaixe boolean, p_quem text,
                                                        p_obs text default null, p_conta uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.nx_leads; e public.nx_estagios; cfg jsonb := public.nx_agenda_cfg(p_cliente);
  v_ini timestamptz := date_trunc('minute', p_inicio);
  v_serv text; v_erro text; v_dur int; v_ant timestamptz; v_fut boolean; v_txt text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ia boolean := coalesce(p_quem, '') = 'ia';
  v_obs text := left(nullif(btrim(coalesce(p_obs, '')), ''), 1000);
begin
  -- uma agenda por cliente: quem chega depois enxerga o que o primeiro gravou
  perform pg_advisory_xact_lock(hashtextextended('nx_agenda:' || p_cliente::text, 0));
  select * into l from public.nx_leads where id = p_negocio and cliente_id = p_cliente and status = 'aberto' for update;
  if l.id is null then return jsonb_build_object('ok', false, 'erro', 'negocio_nao_encontrado'); end if;
  v_serv := coalesce(left(nullif(btrim(coalesce(p_servico, '')), ''), 120), l.servico);
  v_dur := public.nx_agenda_dur(cfg, v_serv);
  v_ant := l.consulta_em;
  v_fut := v_ant is not null and v_ant > now();

  if v_fut and v_ini = date_trunc('minute', v_ant) and coalesce(v_serv, '') = coalesce(l.servico, '') then
    return jsonb_build_object('ok', true, 'negocio_id', l.id, 'contato_id', l.contato_id, 'mudou', false, 'remarcada', false,
      'consulta', jsonb_build_object('inicio', public.nx_agenda_iso(v_ant), 'rotulo', public.nx_agenda_rotulo(v_ant),
                                     'servico', v_serv, 'duracao_min', v_dur, 'encaixe', coalesce((l.campos ->> 'encaixe')::boolean, false)));
  end if;
  if v_fut and not coalesce(p_remarcar, false) then
    return jsonb_build_object('ok', false, 'erro', 'ja_agendada', 'negocio_id', l.id,
      'consulta', jsonb_build_object('inicio', public.nx_agenda_iso(v_ant), 'rotulo', public.nx_agenda_rotulo(v_ant), 'servico', l.servico));
  end if;

  v_erro := public.nx_agenda_checar(p_cliente, v_ini, v_serv, l.id, coalesce(p_encaixe, false));
  if v_erro is not null then
    return jsonb_build_object('ok', false, 'erro', v_erro)
        || case when v_erro <> 'dados_invalidos'
                then jsonb_build_object('sugestoes', public.nx_agenda_sugestoes(p_cliente, v_ini, v_serv, l.id, 4))
                else '{}'::jsonb end;
  end if;

  -- mesma regra do nx_negocio_mover para a etapa "agendada" (marco): etapa do funil do negócio + datas
  select * into e from public.nx_estagios s
   where s.cliente_id = p_cliente and s.funil_id = l.funil_id and s.marco = 'agendada' order by s.ordem limit 1;
  update public.nx_leads x set
    consulta_em = v_ini,
    servico = v_serv,
    data_agenda = coalesce(x.data_agenda, v_hoje),
    estagio_id = coalesce(e.id, x.estagio_id),
    ordem = case when e.id is not null and e.id is distinct from x.estagio_id then -extract(epoch from clock_timestamp()) else x.ordem end,
    -- contrato 6: o encaixe fica gravado; a presença era da consulta anterior
    campos = (coalesce(x.campos, '{}'::jsonb) - 'presenca') || jsonb_build_object('encaixe', coalesce(p_encaixe, false)),
    atualizado_em = now()
  where x.id = l.id;   -- o gatilho da F1 aplica etapa↔marco, status e data_consulta (São Paulo)

  v_txt := case when v_fut then 'Consulta remarcada de ' || public.nx_agenda_rotulo(v_ant) || ' para ' || public.nx_agenda_rotulo(v_ini)
                else 'Consulta marcada para ' || public.nx_agenda_rotulo(v_ini) end
        || coalesce(' (' || v_serv || ')', '') || case when coalesce(p_encaixe, false) then ' [encaixe]' else '' end
        || coalesce('. ' || v_obs, '');
  insert into public.nx_notas (cliente_id, contato_id, negocio_id, autor_id, texto)
  values (p_cliente, l.contato_id, l.id, case when v_ia then null else p_conta end,
          left(case when v_ia then 'IA: ' else '' end || v_txt, 5000));
  if v_ia then
    perform public.nx_notificar(p_cliente, null, 'sistema',
      left((case when v_fut then 'Consulta remarcada pela IA: ' else 'Consulta marcada pela IA: ' end)
           || coalesce((select k.nome from public.nx_contatos k where k.id = l.contato_id), l.nome, 'contato'), 120),
      public.nx_agenda_rotulo(v_ini) || coalesce(' · ' || v_serv, ''), '#/crm/negocio/' || l.id);
  end if;
  return jsonb_build_object('ok', true, 'negocio_id', l.id, 'contato_id', l.contato_id, 'mudou', true, 'remarcada', v_fut,
    'consulta', jsonb_build_object('inicio', public.nx_agenda_iso(v_ini), 'rotulo', public.nx_agenda_rotulo(v_ini),
                                   'servico', v_serv, 'duracao_min', v_dur, 'encaixe', coalesce(p_encaixe, false)),
    'anterior', case when v_fut then jsonb_build_object('inicio', public.nx_agenda_iso(v_ant), 'rotulo', public.nx_agenda_rotulo(v_ant)) end,
    'etapa', e.nome);
end $$;

-- nx_agenda_dia: cópia de 20260929c + encaixe, dono_nome e presenca em cada linha
create or replace function public.nx_agenda_dia(p_token text, p_cliente uuid, p_data date default null, p_dias int default 1)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  cfg jsonb; v_de date := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
  v_dias int := least(greatest(coalesce(p_dias, 1), 1), 31); v_ini timestamptz; v_fim timestamptz; r jsonb;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  cfg := public.nx_agenda_cfg(p_cliente);
  v_ini := v_de::timestamp at time zone 'America/Sao_Paulo';
  v_fim := (v_de + v_dias)::timestamp at time zone 'America/Sao_Paulo';
  select coalesce(jsonb_agg(jsonb_build_object(
      'negocio_id', l.id, 'contato_id', l.contato_id, 'nome', coalesce(k.nome, l.nome), 'telefone', coalesce(k.telefone, l.telefone),
      'inicio', public.nx_agenda_iso(l.consulta_em), 'rotulo', public.nx_agenda_rotulo(l.consulta_em),
      'fim', public.nx_agenda_iso(l.consulta_em + make_interval(mins => public.nx_agenda_dur(cfg, l.servico))),
      'servico', l.servico, 'status', l.status, 'etapa', s.nome, 'marco', s.marco, 'dono_id', l.dono_id, 'titulo', l.titulo,
      'dono_nome', (select a.nome from public.nx_contas a where a.id = l.dono_id),
      'encaixe', coalesce((l.campos ->> 'encaixe')::boolean, false),
      'presenca', case when l.campos ->> 'presenca' in ('compareceu', 'faltou') then l.campos ->> 'presenca' end,
      'origem', l.origem, 'plataforma', l.plataforma, 'campanha_ext', l.campanha_ext, 'anuncio_ext', l.anuncio_ext,
      'campanha_nome', coalesce(
        (select m.campanha_nome from public.nx_metricas_dia m
          where m.cliente_id = p_cliente and m.plataforma = l.plataforma
            and l.campanha_ext is not null and m.campanha_ext = l.campanha_ext
            and m.campanha_nome is not null
          order by m.data desc limit 1), nullif(l.rastreio ->> 'utm_campaign', '')),
      'anuncio_nome', coalesce(
        (select m.anuncio_nome from public.nx_metricas_dia m
          where m.cliente_id = p_cliente and m.plataforma = l.plataforma
            and l.anuncio_ext is not null and m.anuncio_ext = l.anuncio_ext
            and m.anuncio_nome is not null
          order by m.data desc limit 1), nullif(l.rastreio ->> 'utm_content', '')),
      'rastreio', case when l.rastreio is null then null else jsonb_strip_nulls(jsonb_build_object(
        'utm_source', l.rastreio ->> 'utm_source', 'utm_medium', l.rastreio ->> 'utm_medium',
        'utm_campaign', l.rastreio ->> 'utm_campaign', 'utm_content', l.rastreio ->> 'utm_content',
        'utm_term', l.rastreio ->> 'utm_term', 'pagina', l.rastreio ->> 'pagina')) end)
    order by l.consulta_em, l.id), '[]'::jsonb) into r
    from public.nx_leads l
    left join public.nx_contatos k on k.id = l.contato_id
    left join public.nx_estagios s on s.id = l.estagio_id
   where l.cliente_id = p_cliente and l.status in ('aberto', 'ganho')
     and l.consulta_em >= v_ini and l.consulta_em < v_fim
     and (not public.nx_crm_restrito(v) or l.dono_id is null or l.dono_id = v.conta_id);
  return json_build_object('data', v_de, 'dias', v_dias, 'fuso', 'America/Sao_Paulo', 'config', cfg, 'consultas', r,
    'bloqueios', public.nx_agenda_bloqueios_json(p_cliente, v_ini, v_fim));
end $$;

-- Presença da consulta (contrato 6): 'compareceu' | 'faltou' | 'limpar' → {ok, presenca, estagio_id}.
-- Grava nx_leads.campos.presenca; 'faltou' leva ao estágio de marco «faltou» do funil do negócio quando existe (o gatilho da F1
-- aplica etapa/status); 'limpar' só tira a marca (a etapa fica — o Desfazer da tela chama 'limpar').
create or replace function public.nx_agenda_presenca(p_token text, p_cliente uuid, p_negocio bigint, p_estado text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  l public.nx_leads; e public.nx_estagios;
  v_estado text := lower(btrim(coalesce(p_estado, '')));
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if v_estado not in ('compareceu', 'faltou', 'limpar') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'presenca';
  end if;
  select * into l from public.nx_leads x where x.id = p_negocio and x.cliente_id = p_cliente for update;
  if l.id is null or (public.nx_crm_restrito(v) and l.dono_id is not null and l.dono_id <> v.conta_id) then
    raise exception 'negocio_nao_encontrado' using errcode = '22023';
  end if;
  if v_estado <> 'limpar' and l.consulta_em is null then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'sem_consulta';
  end if;
  if v_estado = 'faltou' and l.funil_id is not null then
    select * into e from public.nx_estagios s
     where s.cliente_id = p_cliente and s.funil_id = l.funil_id and s.marco = 'faltou' order by s.ordem limit 1;
  end if;
  update public.nx_leads x set
    campos = case when v_estado = 'limpar' then coalesce(x.campos, '{}'::jsonb) - 'presenca'
                  else coalesce(x.campos, '{}'::jsonb) || jsonb_build_object('presenca', v_estado) end,
    estagio_id = coalesce(e.id, x.estagio_id),
    ordem = case when e.id is not null and e.id is distinct from x.estagio_id then -extract(epoch from clock_timestamp()) else x.ordem end,
    atualizado_em = now()
  where x.id = l.id
  returning * into l;
  perform public.nx_historico_add(p_cliente, 'presenca', l.contato_id, l.id, null,
    jsonb_build_object('presenca', case when v_estado = 'limpar' then null else v_estado end, 'consulta_em', l.consulta_em,
                       'estagio_id', case when e.id is not null then e.id end));
  return json_build_object('ok', true, 'presenca', l.campos ->> 'presenca', 'estagio_id', l.estagio_id);
end $$;

-- ------------------------------------------------------------
-- 6. Permissões (internas só service_role; painel anon + service_role) + nada para authenticated (S-B17)
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('nx_auto_ia_avisar_pausa', 'nx_ia_registrar_reserva', 'nx_ia_uso_dia', 'nx_automacao_execucoes_dia', 'nx_agenda_presenca')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    if r.proname in ('nx_ia_uso_dia', 'nx_automacao_execucoes_dia', 'nx_agenda_presenca') then
      execute format('grant execute on function %s to anon, service_role', r.fn);
    else
      execute format('grant execute on function %s to service_role', r.fn);
    end if;
  end loop;
  raise notice 'nx_revogar_authenticated: % funções', public.nx_revogar_authenticated();
end $$;

-- ------------------------------------------------------------
-- 7. Versão
-- ------------------------------------------------------------
insert into public.nx_versao_banco (nome) values ('20261008c_dados_telas')
on conflict (nome) do update set aplicada_em = now();

notify pgrst, 'reload schema';
