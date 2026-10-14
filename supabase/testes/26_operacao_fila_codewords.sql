-- ============================================================
-- ÓRBITA — supabase/testes/26_operacao_fila_codewords.sql · smoke de 20261013a_operacao_fila_codewords.sql (plano 1000, frente srv)
--   SV-040 concluir só em item 'enviando' · SV-042 revezamento por cliente · SV-207 cliente não apto cancelado
--   SV-026 ritmo do aparelho + nx_fila_adiar · SV-045/047 nx_taxa_usar e nx_envio_vez · SV-007 nx_midia_presas
--   SV-016/017/038 vigia (caído com conversa recente, ja_conectou) e sync_chamar · SV-209 revezamento de canais na sync
--   SV-024 status em lote · SV-005 nx_template_status · SV-078 nx_ciclo_chamar e o cron · SV-092 crons de segunda chance
--   SV-041 índice · SV-091/084 colunas · permissões só service_role
-- Roda em begin … rollback (os disparos do pg_net ficam na fila da transação e somem com ela); termina em
-- raise exception 'OK_26_…'. No banco real outras linhas de produção podem aparecer nas listas: as conferências olham só as
-- linhas criadas aqui (ou diferenças de contagem).
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
-- disparos do pg_net nesta transação (PGlite: net.http_chamadas; Supabase: net.http_request_queue)
create or replace function pg_temp.disparos(p_url text, p_corpo text default '%') returns int language plpgsql as $f$
declare n int;
begin
  if to_regclass('net.http_chamadas') is not null then
    execute 'select count(*)::int from net.http_chamadas where url like $1 and corpo::text like $2' into n using p_url, p_corpo;
  else
    execute 'select count(*)::int from net.http_request_queue where url like $1 and convert_from(body, ''UTF8'') like $2' into n using p_url, p_corpo;
  end if;
  return n;
end $f$;

do $t$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  org_p uuid; cA uuid; cB uuid; cS uuid; kM uuid; kC uuid; kC2 uuid; kC3 uuid; ct bigint; cv bigint;
  f1 bigint; fs bigint; fb1 bigint; fb2 bigint; m1 bigint; m2 bigint; m3 bigint;
  j json; jb jsonb; n int; n0 int; k_adm uuid; k_env uuid := gen_random_uuid();
  pre text := '55129' || lpad((floor(random() * 9000) + 1000)::text, 4, '0');
begin
  select id into org_p from public.nx_orgs where tipo = 'plataforma' limit 1;
  perform pg_temp.ok(org_p is not null, 'fixture: org da plataforma');
  perform pg_temp.ok(exists (select 1 from public.nx_versao_banco where nome = '20261013a_operacao_fila_codewords'), 'versão registrada');
  -- plano 1000 (SV-140, 20261013e): o nx_disparar só chama https://<ref de 20>.supabase.co/functions/v1 — a URL de teste tem esse formato
  update public.nx_config set funcoes_url = coalesce(funcoes_url, 'https://abcdefghijklmnopqrst.supabase.co/functions/v1'),
                              cron_token = coalesce(cron_token, 'cron-26') where id = 1;
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status) values ('t26-a-' || sfx, 'Teste 26 A', org_p, 'interno', 'odonto', 'ativo') returning id into cA;
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status) values ('t26-b-' || sfx, 'Teste 26 B', org_p, 'interno', 'odonto', 'ativo') returning id into cB;
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status) values ('t26-s-' || sfx, 'Teste 26 S', org_p, 'interno', 'odonto', 'suspenso') returning id into cS;
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor, waba_id) values (cA, 'Meta 26', 'pn-26-' || sfx, 'meta', 'W26' || sfx) returning id into kM;
  insert into public.nx_canais (cliente_id, nome, provedor, codewords_api_segredo, codewords_phone_id, codewords_numero)
    values (cA, 'Aparelho 26', 'codewords', gen_random_uuid(), 'ph-26-' || sfx, '+5512998260000') returning id into kC;
  insert into public.nx_canais (cliente_id, nome, provedor, codewords_api_segredo, codewords_phone_id, codewords_numero)
    values (cB, 'Aparelho 26 B', 'codewords', gen_random_uuid(), 'ph-26b-' || sfx, '+5512998260001') returning id into kC2;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Contato 26', pre || '00001') returning id into ct;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, ultima_entrada_em, ultima_msg_em)
    values (cA, kM, ct, '2026-26a' || sfx, 'aberta', now() - interval '1 hour', now() - interval '1 hour') returning id into cv;

  -- ---------------------------------------------------------- SV-040 concluir só em 'enviando'
  insert into public.nx_envios_fila (cliente_id, tipo, texto, origem, enviar_em, status, tentativas)
    values (cA, 'texto', 'f26', 'automacao', now(), 'falhou', 1) returning id into f1;
  j := public.nx_fila_concluir(f1, 'pendente', null, null);
  perform pg_temp.ok(not (j ->> 'ok')::boolean and j ->> 'motivo' = 'estado' and (select status from public.nx_envios_fila where id = f1) = 'falhou',
    'item já «falhou» (STATUS INCERTO) + concluir(pendente) atrasado → continua falhou');
  update public.nx_envios_fila set status = 'enviando' where id = f1;
  j := public.nx_fila_concluir(f1, 'enviado', null, null);
  perform pg_temp.ok((j ->> 'ok')::boolean and (select status from public.nx_envios_fila where id = f1) = 'enviado', 'item enviando → concluído');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_fila_concluir(%s,%L,null,null)', f1, 'xpto')) = 'dados_invalidos|status', 'status desconhecido continua dados_invalidos');

  -- ---------------------------------------------------------- SV-042 revezamento + SV-207 cliente não apto
  insert into public.nx_envios_fila (cliente_id, tipo, texto, origem, enviar_em)
    select cA, 'texto', 'lista ' || g, 'lista', now() - interval '10 minutes' + g * interval '1 second' from generate_series(1, 50) g;
  insert into public.nx_envios_fila (cliente_id, tipo, texto, origem, enviar_em) values (cB, 'texto', 'b1', 'automacao', now() - interval '1 minute') returning id into fb1;
  insert into public.nx_envios_fila (cliente_id, tipo, texto, origem, enviar_em) values (cB, 'texto', 'b2', 'automacao', now() - interval '30 seconds') returning id into fb2;
  insert into public.nx_envios_fila (cliente_id, tipo, texto, origem, enviar_em) values (cS, 'texto', 's1', 'agendada', now() - interval '1 hour') returning id into fs;
  jb := public.nx_fila_pegar(20)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb) <= 20, 'respeita o limite');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(jb) x where (x ->> 'id')::bigint = fb1)
                 and exists (select 1 from jsonb_array_elements(jb) x where (x ->> 'id')::bigint = fb2),
    'cliente B (2 itens) entra no lote apesar dos 50 itens mais antigos do cliente A');
  perform pg_temp.ok((select count(*) from jsonb_array_elements(jb) x where (x ->> 'cliente_id')::uuid = cA) >= 1, 'o cliente A também entra');
  perform pg_temp.ok((select status = 'cancelado' and erro like 'Cancelado:%' and processado_em is not null from public.nx_envios_fila where id = fs)
                 and not exists (select 1 from jsonb_array_elements(jb) x where (x ->> 'id')::bigint = fs),
    'item de cliente suspenso → cancelado com o motivo, fora do lote');
  perform pg_temp.ok((select status from public.nx_envios_fila where id = fb1) = 'enviando', 'os pegos ficam enviando');

  -- ---------------------------------------------------------- SV-026 nx_fila_adiar
  update public.nx_envios_fila set tentativas = 3 where id = fb1;
  j := public.nx_fila_adiar(fb1, now() + interval '30 seconds');
  perform pg_temp.ok((j ->> 'ok')::boolean and (select status = 'pendente' and tentativas = 2 and lote is null and pego_em is null
                                                     and enviar_em between now() + interval '25 seconds' and now() + interval '35 seconds'
                                                from public.nx_envios_fila where id = fb1), 'adiar: pendente na hora pedida, tentativa devolvida');
  perform pg_temp.ok(not (public.nx_fila_adiar(fb1, now())::jsonb ->> 'ok')::boolean, 'adiar só mexe em item enviando');

  -- ---------------------------------------------------------- SV-026 ritmo do aparelho
  j := public.nx_codewords_envio_vez(kC);
  perform pg_temp.ok((j ->> 'ok')::boolean, '1º envio do aparelho: pode');
  j := public.nx_codewords_envio_vez(kC);
  perform pg_temp.ok(not (j ->> 'ok')::boolean and j ->> 'motivo' = 'intervalo' and (j ->> 'vez')::timestamptz > clock_timestamp(), '2º logo em seguida: espera os 4 s ' || j::text);
  update public.nx_codewords_ritmo set ultimo_em = clock_timestamp() - interval '10 seconds' where canal_id = kC;
  update public.nx_taxa set n = 30 where chave = 'cw:' || kC::text;
  j := public.nx_codewords_envio_vez(kC);
  perform pg_temp.ok(not (j ->> 'ok')::boolean and j ->> 'motivo' = 'minuto', '30 no minuto: espera o próximo minuto');
  update public.nx_taxa set n = 300, minuto = date_trunc('minute', now()) - interval '5 minutes' where chave = 'cw:' || kC::text;
  j := public.nx_codewords_envio_vez(kC);
  perform pg_temp.ok(not (j ->> 'ok')::boolean and j ->> 'motivo' = 'hora' and (j ->> 'vez')::timestamptz > now() + interval '50 minutes', '300 na hora: espera a hora');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_envio_vez(%L)', kM)) = 'canal_nao_encontrado', 'canal Meta não tem ritmo de aparelho');

  -- ---------------------------------------------------------- SV-045/047 contador
  perform pg_temp.ok((public.nx_taxa_usar('t26:' || sfx, 2, 3600)::jsonb ->> 'ok')::boolean
                 and (public.nx_taxa_usar('t26:' || sfx, 2, 3600)::jsonb ->> 'ok')::boolean
                 and not (public.nx_taxa_usar('t26:' || sfx, 2, 3600)::jsonb ->> 'ok')::boolean, 'nx_taxa_usar: 2 passam, o 3º não');
  n := 0;
  for i in 1..31 loop
    if (public.nx_envio_vez(gen_random_uuid(), cA)::jsonb ->> 'ok')::boolean then n := n + 1; end if;
  end loop;
  perform pg_temp.ok(n = 31, 'contas diferentes não dividem o limite');
  n := 0;
  for i in 1..31 loop
    j := public.nx_envio_vez(k_env, cA);
    if (j ->> 'ok')::boolean then n := n + 1; end if;
  end loop;
  perform pg_temp.ok(n = 30 and j ->> 'erro' = 'limite_taxa', '31º envio da MESMA conta no minuto → limite_taxa');

  -- ---------------------------------------------------------- SV-007 mídia presa
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, status, midia, criado_em)
    values (cA, cv, ct, kM, 'in', 'imagem', 'recebida', '{"media_id": "MID26a", "estado": "baixando"}', now() - interval '10 minutes') returning id into m1;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, status, midia, criado_em)
    values (cA, cv, ct, kM, 'in', 'imagem', 'recebida', '{"media_id": "MID26b", "estado": "baixando"}', now() - interval '2 minutes') returning id into m2;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, status, midia, criado_em)
    values (cA, cv, ct, kM, 'in', 'imagem', 'recebida', '{"media_id": "MID26c", "estado": "ok", "path": "x"}', now() - interval '10 minutes') returning id into m3;
  jb := public.nx_midia_presas(50)::jsonb;
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(jb) x where (x ->> 'mensagem_id')::bigint = m1 and (x ->> 'canal_id')::uuid = kM
                              and (x ->> 'cliente_id')::uuid = cA and x -> 'midia' ->> 'media_id' = 'MID26a'), 'baixando há 10 min → presa (com canal e media_id)');
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(jb) x where (x ->> 'mensagem_id')::bigint in (m2, m3)), 'há 2 min ou já ok → não');
  perform pg_temp.ok(jsonb_array_length(public.nx_midia_presas(1)::jsonb) <= 1, 'respeita o limite');

  -- ---------------------------------------------------------- SV-016/017/038 vigia e sync_chamar
  update public.nx_canais set codewords_conectado = false, codewords_conferido_em = now() - interval '30 minutes' where id = kC2;
  jb := public.nx_codewords_vigia_alvos(100)::jsonb;
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(jb) x where (x ->> 'canal_id')::uuid = kC2 and not (x ->> 'conectado')::boolean
                              and x ? 'ja_conectou' and not (x ->> 'ja_conectou')::boolean and x ? 'numero_conferido' and x ? 'inscricao'),
    'canal caído sem conversa: alvo, nunca conectou (sem histórico nem mensagem)');
  insert into public.nx_canal_historico (cliente_id, canal_id, estado) values (cB, kC2, 'conectado');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(public.nx_codewords_vigia_alvos(100)::jsonb) x where (x ->> 'canal_id')::uuid = kC2 and (x ->> 'ja_conectou')::boolean),
    'com histórico «conectado» → ja_conectou');
  n0 := pg_temp.disparos('%/nx-codewords', '%sincronizar%');
  perform public.nx_codewords_sync_chamar();
  perform pg_temp.ok(pg_temp.disparos('%/nx-codewords', '%sincronizar%') = n0 + 1, 'sync_chamar dispara com alvo do vigia (canal caído, ninguém conversando)');
  -- caído COM conversa recente também é alvo (a sync pula canal desconectado)
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cB, 'Contato 26 B', pre || '00002') returning id into ct;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, ultima_entrada_em, ultima_msg_em)
    values (cB, kC2, ct, '2026-26b' || sfx, 'aberta', now(), now());
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(public.nx_codewords_vigia_alvos(100)::jsonb) x where (x ->> 'canal_id')::uuid = kC2),
    'caído com conversa recente: alvo');
  update public.nx_canais set codewords_conectado = true, codewords_conferido_em = now() - interval '30 minutes' where id = kC2;
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.nx_codewords_vigia_alvos(100)::jsonb) x where (x ->> 'canal_id')::uuid = kC2),
    'conectado com conversa recente: a sync confere, fora do vigia (como antes)');

  -- ---------------------------------------------------------- SV-209 revezamento de canais na sync
  insert into public.nx_canais (cliente_id, nome, provedor, codewords_api_segredo, codewords_phone_id, codewords_numero)
    values (cA, 'Aparelho 26 C', 'codewords', gen_random_uuid(), 'ph-26c-' || sfx, '+5512998260002') returning id into kC3;
  with novos as (
    insert into public.nx_contatos (cliente_id, nome, telefone)
    select cA, 'Muitos ' || g, pre || lpad((100 + g)::text, 5, '0') from generate_series(1, 40) g returning id)
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, ultima_entrada_em, ultima_msg_em)
    select cA, kC, n2.id, '2026-26m' || sfx || n2.id, 'aberta', now() - interval '1 minute', now() - interval '1 minute' from novos n2;
  with novos as (
    insert into public.nx_contatos (cliente_id, nome, telefone)
    select cA, 'Poucos ' || g, pre || lpad((300 + g)::text, 5, '0') from generate_series(1, 3) g returning id)
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, ultima_entrada_em, ultima_msg_em)
    select cA, kC3, n2.id, '2026-26p' || sfx || n2.id, 'aberta', now() - interval '90 minutes', now() - interval '90 minutes' from novos n2;
  jb := public.nx_codewords_sync_alvos(30)::jsonb;
  perform pg_temp.ok(jsonb_array_length(jb) <= 30, 'limite da sync');
  perform pg_temp.ok((select count(*) from jsonb_array_elements(jb) x where (x ->> 'canal_id')::uuid = kC3) = 3,
    'as 3 conversas do canal pouco movimentado entram mesmo com 40 mais recentes no outro');

  -- ---------------------------------------------------------- SV-024 recibos em lote
  j := public.nx_codewords_status_lote(kC, array['ID26a', 'ID26b', 'ID26c'], 'delivered');
  perform pg_temp.ok((j ->> 'n')::int = 3 and (select count(*) from public.nx_codewords_status_pendentes where canal_id = kC and provider_id like 'ID26%') = 3,
    'lote: 3 recibos numa chamada (sem a saída gravada ainda → pendentes do canal)');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_status_lote(%L, array[%L], %L)', kC, 'id inválido!', 'read')) = 'dados_invalidos', 'id inválido → dados_invalidos');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_status_lote(%L, array[%L], %L)', kM, 'ID26x', 'read')) = 'canal_nao_encontrado', 'canal Meta → canal_nao_encontrado');


  -- ---------------------------------------------------------- SV-005 status do modelo
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t26-adm-' || sfx || '@teste.local', 'Admin 26', 'x', 'clinica', true, org_p) returning id into k_adm;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_adm, cA, 'admin');
  insert into public.nx_templates (cliente_id, canal_id, nome, idioma, categoria, status, corpo)
    values (cA, kM, 'lembrete_26', 'pt_BR', 'UTILITY', 'APPROVED', 'Oi {{1}}');
  j := public.nx_template_status('W26' || sfx, 'lembrete_26', 'pt_BR', 'rejected', 'INVALID_FORMAT');
  perform pg_temp.ok((j ->> 'atualizados')::int = 1 and (select status from public.nx_templates where canal_id = kM and nome = 'lembrete_26') = 'REJECTED',
    'REJECTED da Meta muda a linha do modelo');
  perform pg_temp.ok(exists (select 1 from public.nx_notificacoes where cliente_id = cA and conta_id = k_adm and titulo like 'Modelo «lembrete_26» foi reprovado%'
                               and corpo like '%INVALID_FORMAT%'), 'e avisa os admins do cliente com o motivo');
  j := public.nx_template_status('W26' || sfx, 'lembrete_26', 'pt_BR', 'REJECTED', null);
  perform pg_temp.ok((j ->> 'atualizados')::int = 0, 'o mesmo status de novo: nada muda (sem aviso repetido)');
  perform pg_temp.ok((public.nx_template_status('W-outra-' || sfx, 'lembrete_26', null, 'APPROVED')::jsonb ->> 'atualizados')::int = 0, 'outra WABA: nada');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_template_status(%L,%L,null,%L)', 'W26' || sfx, 'lembrete_26', 'x y')) = 'dados_invalidos', 'status estranho → dados_invalidos');

  -- ---------------------------------------------------------- SV-078 nx-ciclo por cliente
  n0 := pg_temp.disparos('%/nx-ciclo');
  n := public.nx_ciclo_chamar();
  perform pg_temp.ok(n >= 2 and pg_temp.disparos('%/nx-ciclo') = n0 + n, 'um disparo por cliente apto (' || n || ')');
  perform pg_temp.ok(pg_temp.disparos('%/nx-ciclo', '%' || cA::text || '%') = 1 and pg_temp.disparos('%/nx-ciclo', '%' || cB::text || '%') = 1,
    'clientes A e B, cada um com o seu {cliente}');
  perform pg_temp.ok(pg_temp.disparos('%/nx-ciclo', '%' || cS::text || '%') = 0, 'cliente suspenso fica de fora');
  perform pg_temp.ok(exists (select 1 from cron.job where jobname = 'nx-ciclo' and command like '%nx_ciclo_chamar%'), 'o cron nx-ciclo chama nx_ciclo_chamar');

  -- ---------------------------------------------------------- SV-092 segunda chance dos relatórios
  perform pg_temp.ok((select count(*) from cron.job where jobname = 'nx-relatorio-diario-2' and schedule = '0 13 * * *') = 1
                 and (select count(*) from cron.job where jobname = 'nx-relatorio-mensal-2' and schedule = '0 15 1 * *') = 1
                 and (select count(*) from cron.job where jobname = 'nx-relatorio-mensal-3' and schedule = '0 12 2 * *') = 1, 'crons de segunda chance');

  -- ---------------------------------------------------------- SV-041/091/084 estrutura e permissões
  perform pg_temp.ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'nx_mensagens_ambiguas')
                 and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'nx_mensagens_midia_baixando'), 'índices parciais');
  perform pg_temp.ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'nx_relatorios' and column_name = 'enviando_em')
                 and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'nx_alertas' and column_name = 'tentativas_envio'),
    'colunas enviando_em e tentativas_envio');
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_taxa_usar(text,integer,integer)', 'execute')
                 and not has_function_privilege('authenticated', 'public.nx_envio_vez(uuid,uuid)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_ciclo_chamar()', 'execute')
                 and not has_function_privilege('anon', 'public.nx_template_status(text,text,text,text,text)', 'execute')
                 and has_function_privilege('service_role', 'public.nx_codewords_envio_vez(uuid)', 'execute'), 'novas: só service_role');
  perform pg_temp.ok((select c.relrowsecurity from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace where n2.nspname = 'public' and c.relname = 'nx_taxa')
                 and (select c.relrowsecurity from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace where n2.nspname = 'public' and c.relname = 'nx_codewords_ritmo'),
    'RLS nas tabelas novas');
  raise exception 'OK_26_OPERACAO_FILA_CODEWORDS — fila (concluir/revezamento/cancelamento/adiar), ritmo do aparelho, contadores, mídia presa, vigia/sync, recibos em lote, modelos, ciclo por cliente, crons';
end $t$;
rollback;
