-- ============================================================
-- ÓRBITA — 20261013c_operacao_indices.sql · plano «1000+ melhorias» de 13/10/2026 · frente srv, lote srv-2, migração c
-- Operação, índices e saúde. ADITIVA e idempotente: tabelas/colunas/índices com if not exists; funções existentes com
-- create or replace na MESMA assinatura (cópia da definição EM VIGOR, citada em cada bloco, + o marcado «plano 1000»); funções
-- novas só para a service_role (nx_saude e nx_envios_pausar: RPC de plataforma, anon + nx_exigir_gestor/nx_super). Nenhum dado de
-- produção muda: a única linha nova é a de nx_operacao (tabela nova). Depende da 20261013a/b (nx_taxa_usar, nx_ia_reservar).
--   SV-063 a ação 'relatorio' na cota de IA (nx_ia_uso/nx_ia_reservas + nx_ia_reservar sem conta, sem limite por minuto)
--   SV-274 nx_config.modelo_ia_automacao (vazio = o padrão único; o João grava quando quiser)
--   SV-232 nx_config.wa_equipe (número(s) da equipe da Nexus para o aviso de operação; vazio = sem aviso)
--   SV-195 nx_integracoes.ultimo_sync_parcial (leitura parcial não avança ultimo_sync)
--   SV-116 nx_conversas.primeira_entrada_em (gravada pelo gatilho a partir de ultima_entrada_em; preenchida aos poucos pela faxina)
--   SV-150 pausa geral de envios: nx_clientes.envios_pausados + nx_operacao (plataforma) respeitadas por nx_fila_pegar e
--          nx_auto_ia_pegar; nx_envios_pausar (só plataforma, com auditoria)
--   SV-112/113/115/119/120/146 índices (abas da lista, não lidas do pulso, telefone, campanha do anúncio, execuções, FKs de contas)
--   SV-109 nx_rastreio_registrar sem o DELETE por clique (a faxina limpa > 45 dias em lotes)
--   SV-122 nx_trava_pegar sem a faxina no caminho quente + índice por prazo (a faxina limpa as vencidas)
--   SV-124 nx_saas_faxina em lotes de 10.000 (até 50 por tabela por rodada) + rastreio, travas, execuções > 60 dias,
--          net._http_response > 3 dias e o preenchimento de primeira_entrada_em (a faxina antiga «nx-faxina» só existia comentada)
--   SV-081 nx_metricas_renomear (o mapa de nomes numa chamada) · SV-080 nx_metricas_zerar_ausentes (linhas que a plataforma
--          deixou de devolver na janela lida por inteiro)
--   SV-197 nx_relatorio_chamar (um disparo do nx-relatorio por cliente apto) e os crons dos relatórios passam a chamá-la
--   SV-125 crons declarados: os que faltarem são criados (relatórios diário/mensal); os que existem mantêm a agenda
--   SV-126 nx_saude (plataforma) / nx_saude_dados (service_role): última execução de cada tarefa, falhas de cron e do pg_net em
--          24 h, fila atrasada, mídia presa, IA adiada, pausas — e a lista de problemas em português
-- Smoke: supabase/testes/28_operacao_indices.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colunas e tabela nova
-- ------------------------------------------------------------
alter table public.nx_config add column if not exists modelo_ia_automacao text;
alter table public.nx_config add column if not exists wa_equipe text;
alter table public.nx_integracoes add column if not exists ultimo_sync_parcial timestamptz;
alter table public.nx_conversas add column if not exists primeira_entrada_em timestamptz;
alter table public.nx_clientes add column if not exists envios_pausados boolean not null default false;

-- pausa geral da plataforma (uma linha só, id = 1)
create table if not exists public.nx_operacao (
  id int primary key default 1 check (id = 1),
  envios_pausados boolean not null default false,
  motivo text check (char_length(motivo) <= 300),
  por uuid references public.nx_contas(id) on delete set null,
  em timestamptz
);
insert into public.nx_operacao (id) values (1) on conflict (id) do nothing;
alter table public.nx_operacao enable row level security;
revoke all on table public.nx_operacao from public, anon, authenticated;
grant select, insert, update on table public.nx_operacao to service_role;

-- SV-063: a ação 'relatorio' entra no uso e nas reservas de IA (a mesma troca da 20261001a, que trouxe 'automacao')
do $$
declare r record; t text;
begin
  foreach t in array array['nx_ia_uso', 'nx_ia_reservas'] loop
    for r in select c.conname from pg_constraint c
              where c.conrelid = ('public.' || t)::regclass and c.contype = 'c'
                and pg_get_constraintdef(c.oid) like '%sugerir%'
                and pg_get_constraintdef(c.oid) not like '%relatorio%' loop
      execute format('alter table public.%I drop constraint %I', t, r.conname);   -- lint:permitido troca do check por um mais largo
    end loop;
    if not exists (select 1 from pg_constraint c
                    where c.conrelid = ('public.' || t)::regclass and c.conname = t || '_acao_check3') then
      execute format('alter table public.%I add constraint %I check (acao in (%L, %L, %L, %L))',
                     t, t || '_acao_check3', 'sugerir', 'resumir', 'automacao', 'relatorio');
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 2. Índices
-- ------------------------------------------------------------
-- SV-112: a lista de conversas ordenada por (ultima_msg_em, id) — índice inteiro (não parcial): o filtro da aba é um CASE, que o
-- planejador não usa para escolher índice parcial; a aba «Aguardando» tem o seu, parcial, com o predicado literal
create index if not exists nx_conversas_lista_ordem on public.nx_conversas (cliente_id, ultima_msg_em desc, id desc);
create index if not exists nx_conversas_aguardando on public.nx_conversas (cliente_id, ultima_entrada_em)
  where status = 'aberta' and aguardando and not oculta;
-- SV-113: contador de não lidas do pulso (~15 s por aba aberta)
create index if not exists nx_conversas_nao_lidas on public.nx_conversas (cliente_id) include (departamento_id, atribuida_a)
  where nao_lidas > 0 and not oculta and status in ('aberta', 'pendente');
-- SV-115: busca por número na lista de conversas («telefone like '%dígitos%'»)
create index if not exists nx_contatos_tel_trgm on public.nx_contatos using gin (telefone extensions.gin_trgm_ops);
-- SV-119: campanha de um anúncio (webhook, CodeWords, nx_wa_entrada, nx_atribuicao_completar)
create index if not exists nx_metricas_anuncio on public.nx_metricas_dia (cliente_id, anuncio_ext, data desc)
  where nivel = 'anuncio' and plataforma = 'meta';
-- SV-120: últimas execuções de uma tarefa (Admin, «Fazer agora», nx_saude)
create index if not exists nx_execucoes_tarefa on public.nx_execucoes (tarefa, inicio desc);
-- SV-122: faxina das travas vencidas
create index if not exists nx_travas_ate on public.nx_travas (ate);
-- SV-109: faxina do rastreio por data
create index if not exists nx_rastreio_criado on public.nx_rastreio (criado_em);
-- SV-146: FKs para nx_contas sem índice (excluir/limpar uma conta varria as tabelas grandes)
create index if not exists nx_mensagens_enviado_por on public.nx_mensagens (enviado_por) where enviado_por is not null;
create index if not exists nx_historico_autor on public.nx_historico (autor_id) where autor_id is not null;
create index if not exists nx_conversas_atribuida on public.nx_conversas (atribuida_a) where atribuida_a is not null;
create index if not exists nx_conversas_resolvida_por on public.nx_conversas (resolvida_por) where resolvida_por is not null;
create index if not exists nx_conversas_ia_pausada_conta on public.nx_conversas (ia_pausada_conta) where ia_pausada_conta is not null;
create index if not exists nx_notas_autor on public.nx_notas (autor_id) where autor_id is not null;
create index if not exists nx_tarefas_dono on public.nx_tarefas (dono_id) where dono_id is not null;
create index if not exists nx_tarefas_criado_por on public.nx_tarefas (criado_por) where criado_por is not null;

-- ------------------------------------------------------------
-- 3. SV-116 primeira mensagem recebida da conversa (hora_conversa do nx_dados sem subconsulta por lead)
-- ------------------------------------------------------------
-- a 1ª entrada é o menor ultima_entrada_em que a conversa já teve (least: mensagem recuperada fora de ordem pelo CodeWords)
create or replace function public.nx_conversa_primeira_entrada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ultima_entrada_em is not null
     and (tg_op = 'INSERT' or new.ultima_entrada_em is distinct from old.ultima_entrada_em) then
    new.primeira_entrada_em := least(coalesce(new.primeira_entrada_em, new.ultima_entrada_em), new.ultima_entrada_em);
  end if;
  return new;
end $$;
drop trigger if exists nx_conversa_primeira_entrada on public.nx_conversas;   -- lint:permitido recria o gatilho novo (idempotência)
create trigger nx_conversa_primeira_entrada before insert or update of ultima_entrada_em on public.nx_conversas
  for each row execute function public.nx_conversa_primeira_entrada();

-- preenche as conversas antigas aos poucos (a faxina chama; p_lote por rodada). Só grava em quem tem mensagem recebida.
create or replace function public.nx_conversas_primeira_preencher(p_lote int default 5000)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  with alvo as (
    select cv.id from public.nx_conversas cv
     where cv.primeira_entrada_em is null and cv.ultima_entrada_em is not null
     order by cv.id
     limit greatest(1, least(coalesce(p_lote, 5000), 50000))
     for update skip locked)
  update public.nx_conversas cv
     set primeira_entrada_em = coalesce((select min(m.criado_em) from public.nx_mensagens m
                                          where m.conversa_id = cv.id and m.direcao = 'in' and m.tipo <> 'sistema'),
                                        cv.ultima_entrada_em)
    from alvo where cv.id = alvo.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ------------------------------------------------------------
-- 4. SV-063 nx_ia_reservar — cópia de 20261013b_seguranca_dados.sql + a ação 'relatorio' (sem conta, como 'automacao', sem o
--    limite por minuto: o relatório é um por cliente e por dia)
-- ------------------------------------------------------------
create or replace function public.nx_ia_reservar(p_cliente uuid, p_conta uuid, p_acao text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agora timestamptz := clock_timestamp();
  v_inicio_mes timestamptz;
  v_limite int;
  v_usadas int;
  v_reservadas int;
  v_minuto int;
  v_id uuid;
begin
  -- plano 1000 (SV-063): + 'relatorio' (leitura de IA do relatório diário/mensal, pelo cron, sem pessoa)
  if p_cliente is null or p_acao is null or p_acao not in ('sugerir', 'resumir', 'automacao', 'relatorio')
     or (p_conta is null and p_acao not in ('automacao', 'relatorio')) then
    return json_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  if p_conta is not null
     and not exists (select 1 from public.nx_acessos a where a.cliente_id = p_cliente and a.conta_id = p_conta)
     -- plano 1000 (SV-188): gestor da org do cliente e super entram pelo nx_ctx SEM nx_acessos — «Sugerir», «Resumir» e «Criar
     -- automação com IA» sempre falhavam para a equipe da Nexus (a mesma regra do nx_ctx)
     and not exists (select 1 from public.nx_contas k join public.nx_clientes c on c.id = p_cliente
                      where k.id = p_conta and k.papel = 'gestor'
                        and (k.org_id = c.org_id
                             or exists (select 1 from public.nx_orgs o where o.id = k.org_id and o.tipo = 'plataforma'))) then
    return json_build_object('ok', false, 'erro', 'sem_acesso');
  end if;

  -- Um bloqueio por empresa protege simultaneamente o teto mensal e o limite por atendente.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('nx-ia-reservas'), pg_catalog.hashtext(p_cliente::text));
  delete from public.nx_ia_reservas where cliente_id = p_cliente and expira_em <= v_agora;

  v_inicio_mes := date_trunc('month', v_agora at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_limite := public.nx_limite(p_cliente, 'ia_mes');
  v_usadas := public.nx_uso(p_cliente, 'ia_mes');
  select count(*)::int into v_reservadas from public.nx_ia_reservas r
   where r.cliente_id = p_cliente and r.criado_em >= v_inicio_mes and r.expira_em > v_agora;
  if v_limite is not null and v_usadas + v_reservadas >= v_limite then
    return json_build_object('ok', false, 'erro', 'ia_cota');
  end if;

  if p_conta is not null then
    select count(*)::int into v_minuto from public.nx_ia_uso u
     where u.cliente_id = p_cliente and u.conta_id = p_conta and u.criado_em > v_agora - interval '1 minute';
    v_minuto := v_minuto + (select count(*)::int from public.nx_ia_reservas r
      where r.cliente_id = p_cliente and r.conta_id = p_conta and r.criado_em > v_agora - interval '1 minute' and r.expira_em > v_agora);
    if v_minuto >= 20 then
      return json_build_object('ok', false, 'erro', 'muitos_pedidos');
    end if;
  elsif p_acao = 'automacao' then
    select count(*)::int into v_minuto from public.nx_ia_uso u
     where u.cliente_id = p_cliente and u.acao = 'automacao' and u.criado_em > v_agora - interval '1 minute';
    v_minuto := v_minuto + (select count(*)::int from public.nx_ia_reservas r
      where r.cliente_id = p_cliente and r.acao = 'automacao' and r.criado_em > v_agora - interval '1 minute' and r.expira_em > v_agora);
    if v_minuto >= 30 then
      return json_build_object('ok', false, 'erro', 'muitos_pedidos');
    end if;
  end if;

  insert into public.nx_ia_reservas(cliente_id, conta_id, acao, criado_em, expira_em)
  values (p_cliente, p_conta, p_acao, v_agora, v_agora + interval '5 minutes')
  returning id into v_id;
  return json_build_object('ok', true, 'reserva_id', v_id);
end $$;

-- ------------------------------------------------------------
-- 5. SV-109 nx_rastreio_registrar — cópia de 20261013b_seguranca_dados.sql SEM o «delete … > 45 days» (cada clique do site pagava
--    um DELETE dentro da trava do cliente); a limpeza passa para a nx_saas_faxina (uma vez por dia, em lotes)
-- ------------------------------------------------------------
create or replace function public.nx_rastreio_registrar(p_chave text, p_dados jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  cli public.nx_clientes; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_min int; v_hora int; v_id bigint; v_cod text; v_pagina text;
  v_teste boolean := coalesce(d ->> 'teste', '') in ('1', 'true');
  v_ip text;
begin
  if p_chave is null or p_chave !~ '^[0-9a-f]{48}$' then return json_build_object('ok', true, 'codigo', public.nx_rastreio_codigo_novo()); end if;
  select * into cli from public.nx_clientes c where c.entrada_chave = p_chave;
  if cli.id is null
     or not coalesce(cli.ativo, true)
     or coalesce(cli.status, 'ativo') not in ('ativo', 'teste')
     or (cli.status = 'teste' and cli.teste_ate is not null and cli.teste_ate < v_hoje)
     or not ('crm' = any(coalesce(cli.modulos, '{}'::text[])))
     or exists (select 1 from public.nx_orgs o where o.id = cli.org_id and o.status in ('suspenso', 'cancelado')) then
    return json_build_object('ok', true, 'codigo', public.nx_rastreio_codigo_novo());
  end if;
  -- botão «Testar» do painel: prova que a chave e o cliente estão certos SEM gravar nem gastar o limite
  if v_teste then return json_build_object('ok', true, 'codigo', public.nx_rastreio_codigo_novo(), 'teste', true); end if;

  -- plano 1000 (SV-108): 60 por minuto por IP (a chave do site é pública: qualquer um esgotava o limite do cliente)
  v_ip := public.nx_login_ip();
  if v_ip is not null and not (public.nx_taxa_usar('rastreio:' || v_ip, 60, 60) ->> 'ok')::boolean then
    raise exception 'limite_taxa' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nx_rastreio:' || cli.id::text, 0));
  select count(*) filter (where r.criado_em > now() - interval '1 minute')::int, count(*)::int into v_min, v_hora
    from public.nx_rastreio r where r.cliente_id = cli.id and r.criado_em > now() - interval '1 hour';
  if v_min >= 120 or v_hora >= 1000 then raise exception 'limite_taxa' using errcode = '22023'; end if;
  -- plano 1000 (SV-109): sem o DELETE dos > 45 dias aqui — a nx_saas_faxina limpa uma vez por dia, em lotes

  -- página: só endereço (sem ? nem #), http(s)
  v_pagina := public.nx_rastreio_txt(jsonb_build_object('p', split_part(split_part(coalesce(d ->> 'pagina', ''), '#', 1), '?', 1)), 'p', 300);
  if v_pagina is not null and v_pagina !~* '^https?://' then v_pagina := null; end if;

  for i in 1..6 loop
    v_id := null;
    v_cod := public.nx_rastreio_codigo_novo();
    insert into public.nx_rastreio (cliente_id, codigo, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
                                    gclid, gbraid, wbraid, fbclid, pagina)
    values (cli.id, v_cod,
            public.nx_rastreio_txt(d, 'utm_source', 100), public.nx_rastreio_txt(d, 'utm_medium', 100),
            public.nx_rastreio_txt(d, 'utm_campaign', 150), public.nx_rastreio_txt(d, 'utm_content', 150),
            public.nx_rastreio_txt(d, 'utm_term', 150),
            public.nx_rastreio_txt(d, 'gclid', 250, true), public.nx_rastreio_txt(d, 'gbraid', 250, true),
            public.nx_rastreio_txt(d, 'wbraid', 250, true), public.nx_rastreio_txt(d, 'fbclid', 250, true), v_pagina)
    on conflict (cliente_id, codigo) do nothing
    returning id into v_id;
    exit when v_id is not null;
  end loop;
  if v_id is null then raise exception 'falha_temporaria' using errcode = '54000'; end if;
  return json_build_object('ok', true, 'codigo', v_cod);
end $$;

-- ------------------------------------------------------------
-- 6. SV-122 nx_trava_pegar — cópia de 20260927_melhorias.sql SEM o DELETE das vencidas (uma varredura de exclusão por mensagem
--    do CodeWords e por recibo reenviado); a faxina diária limpa as vencidas há mais de 1 dia (índice nx_travas_ate)
-- ------------------------------------------------------------
create or replace function public.nx_trava_pegar(p_nome text, p_segundos integer, p_dono text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  if coalesce(btrim(p_nome), '') = '' then raise exception 'trava_sem_nome'; end if;
  -- plano 1000 (SV-122): a faxina das vencidas saiu daqui (nx_saas_faxina)
  insert into public.nx_travas as t (nome, ate, dono)
  values (p_nome, now() + make_interval(secs => greatest(1, least(coalesce(p_segundos, 60), 2592000))), p_dono)
  on conflict (nome) do update set ate = excluded.ate, dono = excluded.dono
   where t.ate < now();
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

-- ------------------------------------------------------------
-- 7. SV-124 nx_saas_faxina — cópia de 20261008b_operacao_seguranca.sql com os DELETEs grandes em lotes de 10.000 (até 50 lotes por
--    tabela por rodada: nada de uma transação com centenas de milhares de linhas) + rastreio > 45 dias (SV-109), travas vencidas
--    há > 1 dia (SV-122), execuções > 60 dias e net._http_response > 3 dias (o que a antiga «nx-faxina», só comentada na 20260926,
--    fazia) e o preenchimento de nx_conversas.primeira_entrada_em (SV-116). As chaves de antes continuam na resposta.
-- ------------------------------------------------------------
create or replace function public.nx_saas_faxina_lotes(p_tabela text, p_onde text, p_lote int default 10000, p_max_lotes int default 50)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_total int := 0; v_n int;
begin
  -- só as tabelas da faxina (o nome e o filtro vêm do código abaixo, nunca de fora)
  if p_tabela not in ('nx_eventos', 'nx_envios_fila', 'nx_notificacoes', 'nx_auto_execucoes', 'nx_rastreio', 'nx_travas', 'nx_execucoes') then
    raise exception 'tabela_invalida';
  end if;
  for i in 1..greatest(1, least(coalesce(p_max_lotes, 50), 200)) loop
    execute format('delete from public.%I where ctid in (select ctid from public.%I where %s limit %s)',
                   p_tabela, p_tabela, p_onde, greatest(1, least(coalesce(p_lote, 10000), 50000)));
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    exit when v_n < greatest(1, least(coalesce(p_lote, 10000), 50000));
  end loop;
  return v_total;
end $$;

create or replace function public.nx_saas_faxina()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_ev int; n_ex int; n_no int; n_fi int; n_cv int; n_sl int; n_ml int; n_etq int := 0; v_n int; v_lim int := 5000;
  n_ses int; n_req int; n_refs int; n_cwp int; n_login int;
  n_ras int; n_trv int; n_exe int; n_http int := null; n_pri int;
begin
  -- plano 1000 (SV-124): os quatro maiores em lotes
  n_ev := public.nx_saas_faxina_lotes('nx_eventos', $w$processado_em is not null and processado_em < now() - interval '7 days'$w$);
  n_ex := public.nx_saas_faxina_lotes('nx_auto_execucoes', $w$criado_em < now() - interval '60 days'$w$);
  -- notificações LIDAS há mais de 90 dias (as não lidas ficam)
  n_no := public.nx_saas_faxina_lotes('nx_notificacoes', $w$lida_em is not null and criado_em < now() - interval '90 days'$w$);
  n_fi := public.nx_saas_faxina_lotes('nx_envios_fila',
            $w$status in ('enviado', 'falhou', 'pulado', 'cancelado') and coalesce(processado_em, criado_em) < now() - interval '30 days'$w$);
  delete from public.nx_convites where expira_em < now() - interval '30 days';
  get diagnostics n_cv = row_count;
  delete from public.nx_senha_links where expira_em < now() - interval '30 days';
  get diagnostics n_sl = row_count;
  delete from public.nx_midia_lixo where apagado_em is not null and apagado_em < now() - interval '30 days';
  get diagnostics n_ml = row_count;
  -- transitórios novos: sessão vencida há mais de 1 dia, chaves de idempotência (24 h) > 7 d, refs de envio > 7 d,
  -- recibos pendentes do CodeWords vencidos, falhas de login > 1 d
  delete from public.nx_sessoes where expira_em < now() - interval '1 day';
  get diagnostics n_ses = row_count;
  delete from public.nx_requisicoes where criado_em < now() - interval '7 days';
  get diagnostics n_req = row_count;
  delete from public.nx_envio_refs where criado_em < now() - interval '7 days';
  get diagnostics n_refs = row_count;
  delete from public.nx_codewords_status_pendentes where expira_em < now();
  get diagnostics n_cwp = row_count;
  delete from public.nx_login_falhas where em < now() - interval '1 day';
  get diagnostics n_login = row_count;
  -- plano 1000: o que saiu do caminho quente (SV-109 rastreio, SV-122 travas) e o que só a faxina comentada fazia
  n_ras := public.nx_saas_faxina_lotes('nx_rastreio', $w$criado_em < now() - interval '45 days'$w$);
  n_trv := public.nx_saas_faxina_lotes('nx_travas', $w$ate < now() - interval '1 day'$w$);
  n_exe := public.nx_saas_faxina_lotes('nx_execucoes', $w$inicio < now() - interval '60 days'$w$);
  begin
    execute $q$delete from net._http_response where created < now() - interval '3 days'$q$;
    get diagnostics n_http = row_count;
  exception when others then n_http := null;   -- sem pg_net (ambiente local) ou sem permissão: segue
  end;
  -- SV-116: preenche a 1ª entrada das conversas antigas aos poucos
  n_pri := public.nx_conversas_primeira_preencher(20000);

  -- ids de etiqueta órfãos (etiqueta excluída) — até 5.000 linhas no total
  with orf as (
    select k.id from public.nx_contatos k
     where k.etiquetas <> '{}'
       and exists (select 1 from unnest(k.etiquetas) z where not exists (select 1 from public.nx_etiquetas t where t.id = z))
     limit v_lim)
  update public.nx_contatos k
     set etiquetas = array(select z from unnest(k.etiquetas) z where exists (select 1 from public.nx_etiquetas t where t.id = z))
    from orf where k.id = orf.id;
  get diagnostics v_n = row_count; n_etq := n_etq + v_n; v_lim := greatest(v_lim - v_n, 0);
  if v_lim > 0 then
    with orf as (
      select l.id from public.nx_leads l
       where l.etiquetas <> '{}'
         and exists (select 1 from unnest(l.etiquetas) z where not exists (select 1 from public.nx_etiquetas t where t.id = z))
       limit v_lim)
    update public.nx_leads l
       set etiquetas = array(select z from unnest(l.etiquetas) z where exists (select 1 from public.nx_etiquetas t where t.id = z))
      from orf where l.id = orf.id;
    get diagnostics v_n = row_count; n_etq := n_etq + v_n; v_lim := greatest(v_lim - v_n, 0);
  end if;
  if v_lim > 0 then
    with orf as (
      select cv.id from public.nx_conversas cv
       where cv.etiquetas <> '{}'
         and exists (select 1 from unnest(cv.etiquetas) z where not exists (select 1 from public.nx_etiquetas t where t.id = z))
       limit v_lim)
    update public.nx_conversas cv
       set etiquetas = array(select z from unnest(cv.etiquetas) z where exists (select 1 from public.nx_etiquetas t where t.id = z))
      from orf where cv.id = orf.id;
    get diagnostics v_n = row_count; n_etq := n_etq + v_n;
  end if;

  -- histórico do pg_cron de TODOS os jobs (o de 15 s gera ~5.800 linhas/dia; o do CodeWords, a cada 2 min, ~720)
  begin
    delete from cron.job_run_details where end_time < now() - interval '3 days';
  exception when others then null;
  end;

  return json_build_object('eventos', n_ev, 'execucoes', n_ex, 'notificacoes', n_no, 'fila', n_fi, 'convites', n_cv,
                           'senha_links', n_sl, 'midia_lixo', n_ml, 'etiquetas_orfas', n_etq,
                           'sessoes', n_ses, 'requisicoes', n_req, 'envio_refs', n_refs, 'codewords_status_pendentes', n_cwp,
                           'login_falhas', n_login,
                           'rastreio', n_ras, 'travas', n_trv, 'execucoes_tarefas', n_exe, 'http_respostas', n_http,
                           'primeira_entrada', n_pri);
end $$;

-- ------------------------------------------------------------
-- 8. SV-081 nomes antigos numa chamada só · SV-080 métricas que sumiram da API (só service_role; o nx-ciclo chama)
-- ------------------------------------------------------------
-- p_itens: [{tipo: 'campanha'|'anuncio', plataforma, ext, nome}] — reescreve o nome nos dias ANTERIORES a p_antes
create or replace function public.nx_metricas_renomear(p_cliente uuid, p_antes date, p_itens jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_c int := 0; v_a int := 0;
begin
  if p_cliente is null or p_antes is null or jsonb_typeof(p_itens) <> 'array' then return 0; end if;
  update public.nx_metricas_dia m set campanha_nome = x.nome
    from (select distinct on (i.plataforma, i.ext) i.plataforma, i.ext, left(i.nome, 300) as nome
            from jsonb_to_recordset(p_itens) as i(tipo text, plataforma text, ext text, nome text)
           where i.tipo = 'campanha' and i.ext is not null and nullif(btrim(i.nome), '') is not null) x
   where m.cliente_id = p_cliente and m.plataforma = x.plataforma and m.campanha_ext = x.ext
     and m.data < p_antes and m.campanha_nome is distinct from x.nome;
  get diagnostics v_c = row_count;
  update public.nx_metricas_dia m set anuncio_nome = x.nome
    from (select distinct on (i.plataforma, i.ext) i.plataforma, i.ext, left(i.nome, 300) as nome
            from jsonb_to_recordset(p_itens) as i(tipo text, plataforma text, ext text, nome text)
           where i.tipo = 'anuncio' and nullif(i.ext, '') is not null and nullif(btrim(i.nome), '') is not null) x
   where m.cliente_id = p_cliente and m.plataforma = x.plataforma and m.nivel = 'anuncio' and m.anuncio_ext = x.ext
     and m.data < p_antes and m.anuncio_nome is distinct from x.nome;
  get diagnostics v_a = row_count;
  return v_c + v_a;
end $$;

-- p_chaves: [{nivel, data, campanha_ext, anuncio_ext}] que VIERAM na leitura completa de [p_de, p_ate]; as linhas da janela que
-- não vieram ficam com os números zerados (o nome e a linha continuam — o histórico de nomes não se perde)
create or replace function public.nx_metricas_zerar_ausentes(p_cliente uuid, p_plataforma text, p_de date, p_ate date, p_chaves jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  if p_cliente is null or p_plataforma is null or p_de is null or p_ate is null or p_de > p_ate
     or jsonb_typeof(p_chaves) <> 'array' or jsonb_array_length(p_chaves) = 0 then
    return 0;   -- leitura vazia nunca zera a janela (resposta vazia por engano apagaria os números)
  end if;
  update public.nx_metricas_dia m
     set impressoes = 0, alcance = 0, frequencia = 0, cliques = 0, gasto = 0, conversoes = 0, valor_conversao = 0, atualizado_em = now()
   where m.cliente_id = p_cliente and m.plataforma = p_plataforma and m.data between p_de and p_ate
     and (m.impressoes <> 0 or m.alcance <> 0 or m.cliques <> 0 or m.gasto <> 0 or m.conversoes <> 0 or m.valor_conversao <> 0)
     and not exists (select 1 from jsonb_to_recordset(p_chaves) as k(nivel text, data date, campanha_ext text, anuncio_ext text)
                      where k.nivel = m.nivel and k.data = m.data and k.campanha_ext = m.campanha_ext
                        and coalesce(k.anuncio_ext, '') = m.anuncio_ext);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ------------------------------------------------------------
-- 9. SV-150 pausa geral de envios automáticos — nx_fila_pegar (cópia de 20261013a_operacao_fila_codewords.sql) e
--    nx_auto_ia_pegar (cópia de 20261008c_dados_telas.sql): com a plataforma pausada nada sai; cliente pausado fica parado
--    (nada é cancelado nem gasta tentativa: volta a sair quando a pausa sai)
-- ------------------------------------------------------------
create or replace function public.nx_envios_pausado(p_cliente uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select coalesce((select o.envios_pausados from public.nx_operacao o where o.id = 1), false)
      or coalesce((select c.envios_pausados from public.nx_clientes c where c.id = p_cliente), false);
$$;

create or replace function public.nx_fila_pegar(p_limite int default 20, p_ids bigint[] default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v_ids bigint[]; v_lim int := greatest(1, least(coalesce(p_limite, 20), 100)); v json; v_lote uuid; v_cand bigint[]; v_fora uuid[];
begin
  -- plano 1000 (SV-150): pausa geral da plataforma — nada sai (os itens esperam, sem gastar tentativa)
  if coalesce((select o.envios_pausados from public.nx_operacao o where o.id = 1), false) then return '[]'::json; end if;
  -- plano 1000 (SV-207): item de cliente que não pode mais enviar (suspenso, cancelado, teste vencido, revenda suspensa, sem o
  -- módulo de conversas) é CANCELADO com o motivo — antes saía depois da suspensão (agendada, lista, fora do horário)
  select array_agg(x.cliente_id) into v_fora
    from (select distinct f.cliente_id from public.nx_envios_fila f
           where f.status = 'pendente' and (case when p_ids is null then f.enviar_em <= now() else f.id = any(p_ids) end)) x
   where not public.nx_auto_cliente_apto(x.cliente_id, 'conversas');
  if v_fora is not null then
    update public.nx_envios_fila f set status = 'cancelado', processado_em = now(),
           erro = 'Cancelado: o cliente está suspenso, com o teste vencido ou sem o módulo de conversas.'
     where f.id in (select f2.id from public.nx_envios_fila f2
                     where f2.status = 'pendente' and f2.cliente_id = any(v_fora)
                       and (case when p_ids is null then f2.enviar_em <= now() else f2.id = any(p_ids) end)
                     for update skip locked);
  end if;

  if p_ids is null then
    -- plano 1000 (SV-042): revezamento — o 1º item de cada cliente, depois o 2º de cada um… (a ordem global por enviar_em
    -- deixava um cliente com 2.000 itens de uma lista na frente de todos os outros por horas)
    v_cand := array(
      select x.id from (
        select f.id, f.enviar_em, row_number() over (partition by f.cliente_id order by f.enviar_em, f.id) as rn
          from public.nx_envios_fila f
         where f.status = 'pendente' and f.enviar_em <= now()
           -- plano 1000 (SV-150): cliente com os envios pausados fica parado
           and not exists (select 1 from public.nx_clientes c where c.id = f.cliente_id and c.envios_pausados)) x
       order by x.rn, x.enviar_em, x.id
       limit v_lim * 2);
    select array_agg(s.id order by array_position(v_cand, s.id)) into v_ids from (
      select f.id from public.nx_envios_fila f
       where f.id = any(v_cand) and f.status = 'pendente' and f.enviar_em <= now()
       for update skip locked) s;
    if v_ids is not null and cardinality(v_ids) > v_lim then v_ids := v_ids[1:v_lim]; end if;
  else
    select array_agg(s.id) into v_ids from (
      select f.id from public.nx_envios_fila f
       where f.id = any(p_ids) and f.status = 'pendente'
         and not exists (select 1 from public.nx_clientes c where c.id = f.cliente_id and c.envios_pausados)
       order by f.id
       limit v_lim
       for update skip locked) s;
  end if;
  if v_ids is null then return '[]'::json; end if;

  -- lote do processo que pegou (cabeçalho x-fila-lote): se a resposta se perder, a nx-enviar devolve o lote
  begin
    v_lote := nullif(current_setting('request.headers', true)::json ->> 'x-fila-lote', '')::uuid;
  exception when others then v_lote := null;
  end;
  update public.nx_envios_fila set status = 'enviando', tentativas = tentativas + 1, lote = v_lote where id = any(v_ids);

  select coalesce(json_agg(json_build_object(
      'id', f.id, 'cliente_id', f.cliente_id, 'conversa_id', f.conversa_id,
      'contato_id', coalesce(f.contato_id, cv.contato_id), 'canal_id', coalesce(f.canal_id, cv.canal_id),
      'tipo', f.tipo, 'texto', f.texto, 'template', f.template, 'origem', f.origem,
      'automacao_id', f.automacao_id, 'criado_por', f.criado_por, 'enviar_em', f.enviar_em,
      'tentativas', f.tentativas,
      'conversa', case when cv.id is not null then json_build_object('id', cv.id, 'status', cv.status,
                                                                   'ultima_entrada_em', cv.ultima_entrada_em) end,
      'janela_aberta', coalesce(cv.ultima_entrada_em > now() - interval '24 hours', false),
      'contato', case when ct.id is not null then json_build_object('id', ct.id, 'wa_id', ct.wa_id,
                   'telefone', ct.telefone, 'nome', ct.nome, 'optin_marketing', ct.optin_marketing,
                   'bloqueado', ct.bloqueado) end,
      'modelo', (select json_build_object('id', t.id, 'nome', t.nome, 'idioma', t.idioma, 'categoria', t.categoria,
                                          'status', t.status, 'corpo', t.corpo, 'num_parametros', t.num_parametros,
                                          'componentes', t.componentes)
                   from public.nx_templates t
                  where f.tipo = 'template' and t.cliente_id = f.cliente_id
                    and t.canal_id = coalesce(f.canal_id, cv.canal_id)
                    and (case when coalesce(f.template ->> 'template_id', f.template ->> 'id', '')
                                   ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                              then t.id = coalesce(f.template ->> 'template_id', f.template ->> 'id')::uuid
                              else t.nome = f.template ->> 'nome'
                                   and t.idioma = coalesce(nullif(f.template ->> 'idioma', ''), t.idioma) end)
                  order by (t.status = 'APPROVED') desc, t.sincronizado_em desc
                  limit 1)
    ) order by array_position(v_ids, f.id)), '[]'::json)
    into v
    from public.nx_envios_fila f
    left join public.nx_conversas cv on cv.id = f.conversa_id and cv.cliente_id = f.cliente_id
    left join public.nx_contatos ct on ct.id = coalesce(f.contato_id, cv.contato_id) and ct.cliente_id = f.cliente_id
   where f.id = any(v_ids);
  return v;
end $$;

create or replace function public.nx_auto_ia_pegar(p_pedido bigint default null, p_max int default 5)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare r public.nx_auto_ia_pedidos; v_out jsonb := '[]'::jsonb; v_lim int := least(greatest(coalesce(p_max, 5), 1), 20);
begin
  -- plano 1000 (SV-150): pausa geral da plataforma — nenhuma decisão de IA (os pedidos esperam)
  if coalesce((select o.envios_pausados from public.nx_operacao o where o.id = 1), false) then return '[]'::json; end if;
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
              -- plano 1000 (SV-150): cliente com os envios pausados fica parado
              and not exists (select 1 from public.nx_clientes c where c.id = q.cliente_id and c.envios_pausados)
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

-- liga/desliga a pausa (só a plataforma): p_cliente null = a plataforma inteira. Auditoria em nx_auditoria.
create or replace function public.nx_envios_pausar(p_token text, p_cliente uuid, p_pausar boolean, p_motivo text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare c public.nx_contas := public.nx_exigir_gestor(p_token); v_motivo text := nullif(btrim(left(coalesce(p_motivo, ''), 300)), '');
begin
  if not public.nx_super(c) then raise exception 'so_plataforma' using errcode = '42501'; end if;
  if p_pausar is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'pausar'; end if;
  if p_cliente is null then
    update public.nx_operacao set envios_pausados = p_pausar, motivo = v_motivo, por = c.id, em = now() where id = 1;
  else
    update public.nx_clientes set envios_pausados = p_pausar where id = p_cliente;
    if not found then raise exception 'cliente_nao_encontrado' using errcode = '22023'; end if;
  end if;
  perform public.nx_auditar(c.org_id, p_cliente, c.id, case when p_pausar then 'envios_pausados' else 'envios_retomados' end,
                            jsonb_build_object('motivo', v_motivo, 'escopo', case when p_cliente is null then 'plataforma' else 'cliente' end));
  return json_build_object('ok', true, 'pausado', p_pausar, 'escopo', case when p_cliente is null then 'plataforma' else 'cliente' end);
end $$;

-- ------------------------------------------------------------
-- 10. SV-197 relatório por cliente (o cron do dia cabia em 150 s só com poucos clientes) — a trava por tipo e cliente já existe
-- ------------------------------------------------------------
create or replace function public.nx_relatorio_chamar(p_tipo text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare c record; v_n int := 0; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_tipo not in ('diario', 'mensal') then raise exception 'dados_invalidos' using errcode = '22023', hint = 'tipo'; end if;
  for c in
    select x.id from public.nx_clientes x
     where x.ativo and x.status in ('ativo', 'teste')
       and (x.status <> 'teste' or x.teste_ate is null or x.teste_ate >= v_hoje)
       and not exists (select 1 from public.nx_orgs o where o.id = x.org_id and o.status in ('suspenso', 'cancelado'))
     order by x.nome, x.id
  loop
    begin
      perform public.nx_disparar('nx-relatorio', jsonb_build_object('tipo', p_tipo, 'cliente', c.id));
      v_n := v_n + 1;
    exception when others then
      raise warning 'nx_relatorio_chamar: %', sqlerrm;   -- sem funcoes_url: a segunda chance do cron tenta de novo
      exit;
    end;
  end loop;
  return v_n;
end $$;

-- ------------------------------------------------------------
-- 11. SV-126 saúde da operação numa chamada só
-- ------------------------------------------------------------
-- prazo esperado entre execuções boas de cada tarefa registrada em nx_execucoes (passou disso = atrasada)
create or replace function public.nx_saude_dados()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tarefas json; v_cron int := null; v_http int := null; v_fila int; v_midia int; v_ia int; v_pausa boolean; v_pausados int;
  v_prob text[] := '{}'; r record;
begin
  select coalesce(json_agg(json_build_object('tarefa', t.tarefa, 'ultima_ok', t.ultima_ok, 'ultima_falha', t.ultima_falha,
                                             'prazo_h', t.prazo_h, 'atrasada', t.atrasada) order by t.tarefa), '[]'::json)
    into v_tarefas
    from (select p.tarefa, p.prazo_h,
                 (select max(e.inicio) from public.nx_execucoes e where e.tarefa = p.tarefa and e.ok) as ultima_ok,
                 (select max(e.inicio) from public.nx_execucoes e where e.tarefa = p.tarefa and e.ok is not true
                     and e.inicio > now() - interval '24 hours') as ultima_falha,
                 coalesce((select max(e.inicio) from public.nx_execucoes e where e.tarefa = p.tarefa and e.ok), '-infinity'::timestamptz)
                   < now() - make_interval(hours => p.prazo_h) as atrasada
            from (values ('nx-ciclo', 3), ('nx-relatorio', 26)) p(tarefa, prazo_h)) t;
  for r in select x ->> 'tarefa' as tarefa, (x ->> 'prazo_h')::int as prazo_h from json_array_elements(v_tarefas) x
            where (x ->> 'atrasada')::boolean loop
    v_prob := v_prob || format('%s sem execução boa há mais de %s h', r.tarefa, r.prazo_h);
  end loop;
  begin
    execute $q$select count(*)::int from cron.job_run_details where status = 'failed' and end_time > now() - interval '24 hours'$q$ into v_cron;
  exception when others then v_cron := null;
  end;
  begin
    execute $q$select count(*)::int from net._http_response where created > now() - interval '24 hours'
                 and (status_code is null or status_code >= 300)$q$ into v_http;
  exception when others then v_http := null;
  end;
  select count(*)::int into v_fila from public.nx_envios_fila f where f.status = 'pendente' and f.enviar_em < now() - interval '30 minutes';
  select count(*)::int into v_midia from public.nx_mensagens m
   where m.direcao = 'in' and (m.midia ->> 'estado') = 'baixando'
     and m.criado_em < now() - interval '30 minutes' and m.criado_em > now() - interval '7 days';
  select count(*)::int into v_ia from public.nx_auto_ia_pedidos q where q.status = 'adiado';
  select coalesce((select o.envios_pausados from public.nx_operacao o where o.id = 1), false) into v_pausa;
  select count(*)::int into v_pausados from public.nx_clientes c where c.envios_pausados;
  if coalesce(v_cron, 0) > 0 then v_prob := v_prob || format('%s execuções do cron falharam em 24 h', v_cron); end if;
  if coalesce(v_http, 0) > 20 then v_prob := v_prob || format('%s chamadas às funções sem resposta boa em 24 h', v_http); end if;
  if v_fila > 0 then v_prob := v_prob || format('%s mensagens na fila atrasadas há mais de 30 min', v_fila); end if;
  if v_midia > 0 then v_prob := v_prob || format('%s mídias recebidas presas em «baixando»', v_midia); end if;
  if v_ia > 0 then v_prob := v_prob || format('%s decisões de IA adiadas (chave ou cota)', v_ia); end if;
  if v_pausa then v_prob := v_prob || 'envios automáticos PAUSADOS na plataforma'::text; end if;
  return json_build_object('em', now(), 'tarefas', v_tarefas, 'cron_falhas_24h', v_cron, 'http_falhas_24h', v_http,
                           'fila_atrasada', v_fila, 'midia_presa', v_midia, 'ia_adiada', v_ia,
                           'envios_pausados', v_pausa, 'clientes_pausados', v_pausados, 'problemas', to_json(v_prob));
end $$;

create or replace function public.nx_saude(p_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare c public.nx_contas := public.nx_exigir_gestor(p_token);
begin
  if not public.nx_super(c) then raise exception 'so_plataforma' using errcode = '42501'; end if;
  return public.nx_saude_dados();
end $$;

-- ------------------------------------------------------------
-- 12. Permissões: internas só da service_role; RPCs de plataforma pela chave pública (anon) com nx_exigir_gestor + nx_super
-- ------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.nx_conversa_primeira_entrada()', 'public.nx_conversas_primeira_preencher(int)',
    'public.nx_saas_faxina_lotes(text,text,int,int)', 'public.nx_saas_faxina()',
    'public.nx_metricas_renomear(uuid,date,jsonb)', 'public.nx_metricas_zerar_ausentes(uuid,text,date,date,jsonb)',
    'public.nx_envios_pausado(uuid)', 'public.nx_relatorio_chamar(text)', 'public.nx_saude_dados()',
    'public.nx_ia_reservar(uuid,uuid,text)', 'public.nx_fila_pegar(int,bigint[])', 'public.nx_auto_ia_pegar(bigint,int)',
    'public.nx_trava_pegar(text,integer,text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['public.nx_saude(text)', 'public.nx_envios_pausar(text,uuid,boolean,text)'] loop
    execute format('revoke all on function %s from public, authenticated', f);
    execute format('grant execute on function %s to anon, service_role', f);
  end loop;
  -- nx_rastreio_registrar continua pública (o site chama com a chave pública): create or replace não mexe nas permissões
end $$;
do $$
begin
  raise notice 'nx_revogar_authenticated: % funções', public.nx_revogar_authenticated();
end $$;

-- ------------------------------------------------------------
-- 13. Agenda (idempotente). SV-197: os crons dos relatórios chamam nx_relatorio_chamar (um disparo por cliente), mantendo a
--     agenda de cada um. SV-125: o que faltar é criado (num banco restaurado/novo os relatórios só existiam comentados).
-- ------------------------------------------------------------
do $$
declare j record; v_agenda text; x record;
begin
  for x in select * from (values
             ('nx-relatorio-diario', '0 11 * * *', 'diario'), ('nx-relatorio-diario-2', '0 13 * * *', 'diario'),
             ('nx-relatorio-mensal', '0 12 1 * *', 'mensal'), ('nx-relatorio-mensal-2', '0 15 1 * *', 'mensal'),
             ('nx-relatorio-mensal-3', '0 12 2 * *', 'mensal')) v(nome, agenda, tipo) loop
    v_agenda := null;
    for j in select jobid, schedule from cron.job where jobname = x.nome loop
      v_agenda := j.schedule;
      perform cron.unschedule(j.jobid);
    end loop;
    perform cron.schedule(x.nome, coalesce(v_agenda, x.agenda), format('select public.nx_relatorio_chamar(%L)', x.tipo));
  end loop;
  -- os outros jobs do repositório: só cria o que não existe (agenda e comando de quem existe ficam como estão)
  for x in select * from (values
             ('nx-ciclo', '7 * * * *', 'select public.nx_ciclo_chamar()'),
             ('nx-fila', '* * * * *', 'select public.nx_fila_chamar()'),
             ('nx-faxina-saas', '40 6 * * *', 'select public.nx_saas_faxina()'),
             ('nx-faxina-auto', '50 6 * * *', 'select public.nx_auto_faxina()'),
             ('nx-codewords-sync', '*/2 * * * *', 'select public.nx_codewords_sync_chamar()'),
             ('nx-automacoes', '15 seconds', 'select public.nx_auto_lote(100)')) v(nome, agenda, cmd) loop
    if not exists (select 1 from cron.job where jobname = x.nome) then
      perform cron.schedule(x.nome, x.agenda, x.cmd);
    end if;
  end loop;
end $$;

insert into public.nx_versao_banco (nome) values ('20261013c_operacao_indices')
on conflict (nome) do update set aplicada_em = now();

notify pgrst, 'reload schema';
