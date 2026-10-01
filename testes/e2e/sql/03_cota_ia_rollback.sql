-- ============================================================
-- ÓRBITA — testes/e2e/sql/03_cota_ia_rollback.sql · E2E-3009 · caso 8 (cota/reserva da IA, 20260930c)
-- Só SQL, tudo em transação que termina em exceção (ROLLBACK). NÃO chama a IA (nem nx-ia nem Anthropic):
-- testa apenas nx_ia_reservar / nx_ia_registrar_reserva / nx_uso('ia_mes') / limites.
-- Usa a conta real do teste-e2e (admin) e, dentro da transação, baixa o limite mensal do teste-e2e para 3.
-- Saída: 'E2E3009_COTA_OK n casos' ou 'FALHOU: <caso>'.
-- ============================================================
begin;

create or replace function pg_temp.ok(p boolean, p_caso text) returns void language plpgsql as $f$
begin
  if not coalesce(p, false) then raise exception 'FALHOU: %', p_caso; end if;
end $f$;

do $t$
declare
  cA uuid; kam uuid; contaA uuid; contaK uuid; r json; r2 json; r3 json; r4 json; id1 uuid; id2 uuid; id3 uuid; i int; n int := 0; u0 int; e text;
  sfx text := substr(md5(random()::text), 1, 8);
begin
  select id into cA from public.nx_clientes where slug = 'teste-e2e';
  select id into kam from public.nx_clientes where slug = 'kamiguchi';
  select c.id into contaA from public.nx_contas c join public.nx_acessos a on a.conta_id = c.id and a.cliente_id = cA and a.papel = 'admin' limit 1;
  perform pg_temp.ok(cA is not null and kam is not null and contaA is not null, 'pré-condição');
  u0 := public.nx_uso(cA, 'ia_mes');
  perform pg_temp.ok((select count(*) from public.nx_ia_reservas where cliente_id = cA) = 0, 'sem reservas pendentes antes do teste'); n := n + 1;

  -- ACL: só service_role
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_ia_reservar(uuid,uuid,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.nx_ia_reservar(uuid,uuid,text)', 'execute')
    and has_function_privilege('service_role', 'public.nx_ia_reservar(uuid,uuid,text)', 'execute')
    and not has_function_privilege('anon', 'public.nx_ia_registrar_reserva(uuid,text,int,int,boolean)', 'execute')
    and not has_table_privilege('anon', 'public.nx_ia_reservas', 'select') and not has_table_privilege('authenticated', 'public.nx_ia_reservas', 'select'), 'ACL: reservar/registrar só service_role; tabela fechada'); n := n + 1;

  -- limite do mês = 3 (só nesta transação)
  update public.nx_clientes set limites = coalesce(limites, '{}'::jsonb) || '{"ia_mes":3}'::jsonb where id = cA;
  perform pg_temp.ok(public.nx_limite(cA, 'ia_mes') = 3, 'limite do mês ajustado para 3 dentro da transação'); n := n + 1;

  -- entradas inválidas
  perform pg_temp.ok((public.nx_ia_reservar(cA, contaA, 'desenhar') ->> 'erro') = 'dados_invalidos', 'ação inválida → dados_invalidos'); n := n + 1;
  perform pg_temp.ok((public.nx_ia_reservar(null, contaA, 'sugerir') ->> 'erro') = 'dados_invalidos', 'cliente nulo → dados_invalidos'); n := n + 1;
  perform pg_temp.ok((public.nx_ia_reservar(cA, gen_random_uuid(), 'sugerir') ->> 'erro') = 'sem_acesso', 'conta sem acesso ao cliente → sem_acesso (nada reservado)'); n := n + 1;
  perform pg_temp.ok((select count(*) from public.nx_ia_reservas where cliente_id = cA) = 0, 'recusas não deixam reserva'); n := n + 1;

  -- reserva atômica: 3 cabem (uso atual + reservas < limite), a 4ª é recusada por ia_cota
  perform pg_temp.ok(u0 = 0, format('uso do mês do teste-e2e começa em 0 (está em %s)', u0));
  r := public.nx_ia_reservar(cA, contaA, 'sugerir'); id1 := (r ->> 'reserva_id')::uuid;
  r2 := public.nx_ia_reservar(cA, contaA, 'resumir'); id2 := (r2 ->> 'reserva_id')::uuid;
  r3 := public.nx_ia_reservar(cA, contaA, 'sugerir'); id3 := (r3 ->> 'reserva_id')::uuid;
  perform pg_temp.ok((r ->> 'ok')::boolean and (r2 ->> 'ok')::boolean and (r3 ->> 'ok')::boolean and id1 is not null and id1 <> id2 and id2 <> id3, '3 reservas de 3 cabem, com ids distintos'); n := n + 1;
  r4 := public.nx_ia_reservar(cA, contaA, 'sugerir');
  perform pg_temp.ok(not (r4 ->> 'ok')::boolean and r4 ->> 'erro' = 'ia_cota', 'a 4ª reserva → ia_cota (reservas ainda não usadas contam contra o teto)'); n := n + 1;
  perform pg_temp.ok((select count(*) from public.nx_ia_reservas where cliente_id = cA) = 3, 'exatamente 3 reservas gravadas (a recusada não grava)'); n := n + 1;
  perform pg_temp.ok(public.nx_uso(cA, 'ia_mes') = 0, 'reserva não é uso: nx_uso continua 0 até registrar'); n := n + 1;

  -- registrar: a tentativa conta mesmo quando falhou (proteção de custo); idempotente por reserva
  perform pg_temp.ok((public.nx_ia_registrar_reserva(id1, 'modelo-teste-e2e', 10, 5, false) ->> 'ok')::boolean, 'registrar reserva 1 (tentativa FALHADA ok=false)'); n := n + 1;
  perform pg_temp.ok(public.nx_uso(cA, 'ia_mes') = 1, 'tentativa falhada conta no uso mensal (nx_uso = 1)'); n := n + 1;
  perform pg_temp.ok((public.nx_ia_registrar_reserva(id1, 'modelo-teste-e2e', 10, 5, false) ->> 'ok')::boolean and public.nx_uso(cA, 'ia_mes') = 1, 'registrar a MESMA reserva de novo é idempotente (continua 1)'); n := n + 1;
  perform pg_temp.ok((select count(*) from public.nx_ia_reservas where id = id1) = 0 and (select count(*) from public.nx_ia_uso where reserva_id = id1) = 1, 'reserva vira exatamente 1 linha de uso'); n := n + 1;
  perform pg_temp.ok(not (public.nx_ia_registrar_reserva(gen_random_uuid(), 'x', 1, 1, true) ->> 'ok')::boolean, 'registrar reserva inexistente → ok:false, sem criar uso'); n := n + 1;
  perform pg_temp.ok((public.nx_ia_registrar_reserva(null, 'x', 1, 1, true) ->> 'erro') = 'dados_invalidos', 'registrar sem reserva → dados_invalidos'); n := n + 1;
  -- uso 1 + reservas 2 = 3 = limite → recusa; registrar as duas (uma ok, uma falha) → uso 3
  perform pg_temp.ok((public.nx_ia_reservar(cA, contaA, 'sugerir') ->> 'erro') = 'ia_cota', 'uso 1 + 2 reservadas = teto → ia_cota'); n := n + 1;
  perform public.nx_ia_registrar_reserva(id2, 'modelo-teste-e2e', 10, 5, true);
  perform public.nx_ia_registrar_reserva(id3, 'modelo-teste-e2e', 10, 5, false);
  perform pg_temp.ok(public.nx_uso(cA, 'ia_mes') = 3, 'contagem de tentativas: 1 falhada + 1 ok + 1 falhada = 3 (toda tentativa conta)'); n := n + 1;
  perform pg_temp.ok((public.nx_ia_reservar(cA, contaA, 'sugerir') ->> 'erro') = 'ia_cota', 'cota esgotada (3/3) → ia_cota'); n := n + 1;
  perform pg_temp.ok((select count(*) from public.nx_ia_uso where cliente_id = cA and ok) = 1 and (select count(*) from public.nx_ia_uso where cliente_id = cA and not ok) = 2, 'uso guarda ok/falha por tentativa (1 ok, 2 falhas)'); n := n + 1;

  -- reserva que expira (chamada que não voltou) libera a vaga sozinha na próxima reserva
  update public.nx_clientes set limites = limites || '{"ia_mes":4}'::jsonb where id = cA;
  r := public.nx_ia_reservar(cA, contaA, 'sugerir'); id1 := (r ->> 'reserva_id')::uuid;
  perform pg_temp.ok((r ->> 'ok')::boolean, 'limite 4: a 4ª cabe'); n := n + 1;
  perform pg_temp.ok((public.nx_ia_reservar(cA, contaA, 'sugerir') ->> 'erro') = 'ia_cota', 'sem folga com a reserva ativa'); n := n + 1;
  update public.nx_ia_reservas set expira_em = now() - interval '1 second' where id = id1;
  r := public.nx_ia_reservar(cA, contaA, 'sugerir');
  perform pg_temp.ok((r ->> 'ok')::boolean and (select count(*) from public.nx_ia_reservas where id = id1) = 0, 'reserva expirada é apagada e a vaga volta'); n := n + 1;
  delete from public.nx_ia_reservas where cliente_id = cA;

  -- limite por minuto: 20 por conta (uso registrado + reservas do último minuto)
  delete from public.nx_ia_uso where cliente_id = cA;
  update public.nx_clientes set limites = limites || '{"ia_mes":500}'::jsonb where id = cA;
  for i in 1..20 loop
    r := public.nx_ia_reservar(cA, contaA, 'sugerir');
    if not (r ->> 'ok')::boolean then raise exception 'FALHOU: reserva % de 20 por minuto recusada: %', i, r; end if;
  end loop;
  perform pg_temp.ok((public.nx_ia_reservar(cA, contaA, 'sugerir') ->> 'erro') = 'muitos_pedidos', '21ª reserva no mesmo minuto da mesma conta → muitos_pedidos'); n := n + 1;
  -- outra conta do MESMO cliente não é atingida pelo limite da primeira
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('e2e3009-cota-' || sfx || '@exemplo.invalid', 'E2E-3009 Cota', 'x', 'clinica', true) returning id into contaK;
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas, departamentos, recebe_conversas) values (contaK, cA, 'atendente', false, '{}', false);
  perform pg_temp.ok((public.nx_ia_reservar(cA, contaK, 'sugerir') ->> 'ok')::boolean, 'o limite por minuto é por CONTA (colega continua podendo)'); n := n + 1;
  -- as 20 viram uso registrado: o limite por minuto também olha nx_ia_uso
  update public.nx_ia_reservas set criado_em = now() - interval '2 minutes', expira_em = now() + interval '3 minutes' where conta_id = contaA and cliente_id = cA;
  perform pg_temp.ok((public.nx_ia_reservar(cA, contaA, 'sugerir') ->> 'ok')::boolean, 'reservas com mais de 1 minuto deixam de contar no limite por minuto'); n := n + 1;
  insert into public.nx_ia_uso (cliente_id, conta_id, acao, modelo, tokens_in, tokens_out, ok) select cA, contaA, 'sugerir', 'm', 1, 1, true from generate_series(1, 20);
  perform pg_temp.ok((public.nx_ia_reservar(cA, contaA, 'sugerir') ->> 'erro') = 'muitos_pedidos', 'uso registrado no último minuto também conta para o limite por minuto'); n := n + 1;

  -- isolamento: a cota de um cliente não consome a do outro
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas, departamentos, recebe_conversas) values (contaK, kam, 'atendente', false, '{}', false);
  perform pg_temp.ok((public.nx_ia_reservar(kam, contaK, 'sugerir') ->> 'ok')::boolean, 'cliente kamiguchi (dentro da transação) reserva normalmente'); n := n + 1;
  perform pg_temp.ok((public.nx_ia_reservar(kam, contaA, 'sugerir') ->> 'erro') = 'sem_acesso', 'conta do teste-e2e NÃO reserva cota do kamiguchi (sem_acesso)'); n := n + 1;
  perform pg_temp.ok(public.nx_uso(kam, 'ia_mes') = 0 and (select count(*) from public.nx_ia_reservas where cliente_id = kam) = 1, 'reserva do kamiguchi só existe na transação e é só 1'); n := n + 1;

  -- a trava: a mesma chave de advisory lock que a função usa (para o teste de concorrência em 2 sessões)
  perform pg_temp.ok(exists (select 1 from pg_proc where proname = 'nx_ia_reservar' and prosrc like '%pg_advisory_xact_lock%nx-ia-reservas%'), 'a função serializa por empresa com advisory lock (nx-ia-reservas + cliente)'); n := n + 1;

  raise exception 'E2E3009_COTA_OK % casos', n;
end $t$;

rollback;
