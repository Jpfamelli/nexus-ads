-- ============================================================
-- ÓRBITA (SaaS da Nexus) — 20261001a_automacoes_ia.sql
-- Automações com IA (PLANO-NOITE-20261001, "Contrato das Automações"):
--   gatilhos novos (agendado, apos_data, conversa_resolvida) ·
--   ações novas (mover_funil, atribuir por dono, etiqueta_adicionar/remover,
--   campo_atualizar, nota, notificar por departamento, esperar, parar,
--   ia_decidir) · sequências com espera (estado por alvo; a resposta do
--   cliente cancela) · pedidos para a IA (nx-ia → automacao_decidir) ·
--   simulação sem gravar (nx_auto_simular) · cota de IA "automacao".
--
-- Regras: só ACRESCENTA; idempotente (create or replace, if not exists,
-- drop trigger if exists + create, cron com unschedule antes); toda função
-- security definer + search_path ''; internas só service_role, painel
-- anon/authenticated/service_role. As funções do motor que já existiam
-- (nx_auto_normalizar, nx_auto_acoes, nx_auto_rodar, nx_auto_alvos_tempo,
-- nx_auto_config_ok, nx_auto_lote, nx_auto_erro_texto, nx_auto_item,
-- nx_automacoes_listar, nx_automacao_execucoes, nx_disparar, nx_ia_reservar)
-- são REESCRITAS aqui com o mesmo nome e a mesma assinatura: tudo o que
-- elas faziam continua igual (os smokes 08 e 10 seguem verdes).
-- Depende de 20260928h, 20260929a e 20260930c.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Esquema: constraints mais largas, colunas e tabelas novas
-- ------------------------------------------------------------

-- 1.1 gatilhos novos no CHECK de nx_automacoes (a constraint antiga é trocada por uma que é superconjunto)
do $$
declare r record;
begin
  for r in select c.conname from pg_constraint c
            where c.conrelid = 'public.nx_automacoes'::regclass and c.contype = 'c'
              and pg_get_constraintdef(c.oid) like '%conversa_nova%'
              and pg_get_constraintdef(c.oid) not like '%agendado%' loop
    execute format('alter table public.nx_automacoes drop constraint %I', r.conname);
  end loop;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.nx_automacoes'::regclass and c.conname = 'nx_automacoes_gatilho_check2') then
    alter table public.nx_automacoes add constraint nx_automacoes_gatilho_check2 check (gatilho in (
      'conversa_nova', 'mensagem_recebida', 'negocio_criado', 'negocio_estagio', 'negocio_ganho', 'negocio_perdido',
      'etiqueta_adicionada', 'sem_resposta', 'tempo_no_estagio', 'tarefa_vencida', 'antes_da_data',
      'agendado', 'apos_data', 'conversa_resolvida'));
  end if;
end $$;

-- 1.2 cota de IA: a ação "automacao" (montar e decidir) entra no uso e nas reservas;
--     decisões do motor não têm pessoa por trás (conta_id nulo)
do $$
declare r record; t text;
begin
  foreach t in array array['nx_ia_uso', 'nx_ia_reservas'] loop
    for r in select c.conname from pg_constraint c
              where c.conrelid = ('public.' || t)::regclass and c.contype = 'c'
                and pg_get_constraintdef(c.oid) like '%sugerir%'
                and pg_get_constraintdef(c.oid) not like '%automacao%' loop
      execute format('alter table public.%I drop constraint %I', t, r.conname);
    end loop;
    if not exists (select 1 from pg_constraint c
                    where c.conrelid = ('public.' || t)::regclass and c.conname = t || '_acao_check2') then
      execute format('alter table public.%I add constraint %I check (acao in (%L, %L, %L))',
                     t, t || '_acao_check2', 'sugerir', 'resumir', 'automacao');
    end if;
  end loop;
end $$;
alter table public.nx_ia_reservas alter column conta_id drop not null;

-- 1.3 execuções: estado, passo e total de passos (sequências com espera)
alter table public.nx_auto_execucoes
  add column if not exists estado text,
  add column if not exists passo int,
  add column if not exists total_passos int,
  add column if not exists atualizado_em timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.nx_auto_execucoes'::regclass and c.conname = 'nx_auto_execucoes_estado_check') then
    alter table public.nx_auto_execucoes add constraint nx_auto_execucoes_estado_check
      check (estado is null or estado in ('concluida', 'esperando', 'aguardando_ia', 'cancelada', 'parada', 'erro'));
  end if;
end $$;

-- 1.4 sequências: o estado de cada alvo que está no meio de uma automação com esperar / decisão da IA
create table if not exists public.nx_auto_sequencias (
  id bigint generated always as identity primary key,
  automacao_id uuid not null references public.nx_automacoes(id) on delete cascade,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  chave text not null,                                    -- a mesma chave da execução (dedupe)
  contato_id bigint,                                      -- para a resposta do cliente cancelar a espera
  alvo jsonb not null default '{}'::jsonb,
  acoes jsonb not null default '[]'::jsonb,               -- cópia das ações ao começar: editar a automação não muda quem já espera
  passo int not null default 0,                           -- próxima ação a rodar (0 = a primeira)
  continuar_em timestamptz,
  cancelar_se_responder boolean not null default true,
  pedido_id bigint,                                       -- decisão da IA em andamento (nx_auto_ia_pedidos)
  status text not null default 'esperando'
      check (status in ('esperando', 'aguardando_ia', 'concluida', 'cancelada', 'erro')),
  motivo text check (char_length(motivo) <= 300),
  profundidade int not null default 0,
  estagio_ref uuid,                                       -- etapa do negócio quando a sequência parou (negocio_estagio / tempo_no_estagio: sair dela cancela)
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (automacao_id, chave)
);
alter table public.nx_auto_sequencias add column if not exists estagio_ref uuid;
create index if not exists nx_auto_seq_vencidas on public.nx_auto_sequencias(continuar_em, id) where status = 'esperando';
create index if not exists nx_auto_seq_contato on public.nx_auto_sequencias(cliente_id, contato_id) where status = 'esperando';
create index if not exists nx_auto_seq_pedido on public.nx_auto_sequencias(pedido_id) where pedido_id is not null;
create index if not exists nx_auto_seq_cli on public.nx_auto_sequencias(cliente_id, criado_em desc);

-- 1.5 pedidos para a IA (ia_decidir): o motor enfileira, a nx-ia (automacao_decidir) responde
create table if not exists public.nx_auto_ia_pedidos (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  automacao_id uuid not null references public.nx_automacoes(id) on delete cascade,
  tarefa text not null check (tarefa in ('classificar_etapa', 'resumir_nota', 'pontuar_lead')),
  instrucao text check (char_length(instrucao) <= 500),
  alvo jsonb not null default '{}'::jsonb,                -- {negocio_id, contato_id, conversa_id}
  status text not null default 'pendente'
      check (status in ('pendente', 'processando', 'aplicado', 'erro', 'cancelado')),
  tentativas int not null default 0,
  proximo_em timestamptz not null default now(),          -- não tentar antes disso (espera entre tentativas)
  despachado_em timestamptz,                              -- última vez que o motor chamou a nx-ia por causa dele
  pego_em timestamptz,
  resultado jsonb,
  detalhe text check (char_length(detalhe) <= 500),       -- o que foi aplicado (ou o motivo do erro)
  modelo text, tokens_in int, tokens_out int,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);
create index if not exists nx_auto_ia_fila on public.nx_auto_ia_pedidos(proximo_em, id) where status = 'pendente';
create index if not exists nx_auto_ia_proc on public.nx_auto_ia_pedidos(pego_em) where status = 'processando';
create index if not exists nx_auto_ia_cli on public.nx_auto_ia_pedidos(cliente_id, status);

do $$
declare t text;
begin
  foreach t in array array['nx_auto_sequencias', 'nx_auto_ia_pedidos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
  grant usage, select on sequence public.nx_auto_sequencias_id_seq to service_role;
  grant usage, select on sequence public.nx_auto_ia_pedidos_id_seq to service_role;
end $$;

-- 1.6 o motor de tempo passa a olhar também as automações agendadas e "depois da data"
create index if not exists nx_automacoes_tempo2 on public.nx_automacoes(ultima_execucao_em nulls first)
  where ativo and gatilho in ('sem_resposta', 'tempo_no_estagio', 'tarefa_vencida', 'antes_da_data', 'agendado', 'apos_data');

-- ------------------------------------------------------------
-- 2. Utilitárias internas
-- ------------------------------------------------------------

-- 90 → "1 h 30 min"; 1440 → "1 dia"; 2880 → "2 dias"; 30 → "30 min"
create or replace function public.nx_auto_dur(p_min int)
returns text
language plpgsql immutable
security definer
set search_path = ''
as $$
declare n int := greatest(coalesce(p_min, 0), 0);
begin
  if n < 60 then return n || ' min'; end if;
  if n % 1440 = 0 then return case when n / 1440 = 1 then '1 dia' else (n / 1440) || ' dias' end; end if;
  if n % 60 = 0 then return (n / 60) || ' h'; end if;
  return (n / 60) || ' h ' || lpad((n % 60)::text, 2, '0') || ' min';
end $$;

-- move o negócio de etapa (e, se a etapa é de outro funil, de funil): os mesmos carimbos que o CRM
-- (nx_negocio_mover) e o painel clássico gravam. Quem muda funil/status é o gatilho da F1, que também
-- aplica a trava dos funis de anúncios (funil_invalido: fechado_no_ads / sai_do_ads).
create or replace function public.nx_auto_mover(p_cliente uuid, p_origem text, p_neg bigint, p_estagio uuid,
                                                p_motivo_perda text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare l public.nx_leads; e public.nx_estagios; v_funil text;
begin
  select * into l from public.nx_leads x where x.id = p_neg and x.cliente_id = p_cliente;
  if l.id is null then return 'mover: pulado (sem negócio)'; end if;
  select * into e from public.nx_estagios s where s.id = p_estagio and s.cliente_id = p_cliente;
  if e.id is null then raise exception 'estagio_invalido' using errcode = '22023', hint = 'nao_encontrado'; end if;
  if l.estagio_id = e.id then return 'já estava em «' || e.nome || '»'; end if;
  if e.tipo = 'ganho' and coalesce(l.valor, l.valor_previsto) is null then
    raise exception 'valor_obrigatorio' using errcode = '22023';
  end if;
  update public.nx_leads x set
    estagio_id = e.id,
    ordem = -extract(epoch from clock_timestamp()),
    valor = case when e.tipo = 'ganho' then coalesce(x.valor, x.valor_previsto) else x.valor end,
    data_agenda = case when e.marco = 'agendada' then coalesce(x.data_agenda, (now() at time zone 'America/Sao_Paulo')::date) else x.data_agenda end,
    data_consulta = case when e.marco = 'fechou' then coalesce(x.data_consulta, (now() at time zone 'America/Sao_Paulo')::date) else x.data_consulta end,
    motivo_perda_txt = case when e.tipo = 'perdido'
                            then coalesce(x.motivo_perda_txt, left(coalesce(p_motivo_perda, 'Automação «' || p_origem || '»'), 500))
                            else x.motivo_perda_txt end
   where x.id = l.id and x.cliente_id = p_cliente;
  if l.funil_id is distinct from e.funil_id then
    select f.nome into v_funil from public.nx_funis f where f.id = e.funil_id;
    return 'movido para «' || e.nome || '» no funil «' || coalesce(v_funil, '?') || '»';
  end if;
  return 'movido para «' || e.nome || '»';
end $$;

-- próxima pessoa do rodízio (quem recebeu há mais tempo), opcionalmente de um departamento. clock_timestamp():
-- várias atribuições na mesma rodada do motor precisam revezar, e now() é igual dentro da transação.
create or replace function public.nx_auto_proximo(p_cliente uuid, p_dep uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('nx-rodizio:' || p_cliente::text, 0));
  select a.conta_id into v
    from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
   where a.cliente_id = p_cliente and a.recebe_conversas and a.papel in ('atendente', 'supervisor', 'admin') and k.aprovado
     and (p_dep is null or cardinality(a.departamentos) = 0 or p_dep = any(a.departamentos))
   order by a.ultima_atribuicao_em asc nulls first, a.criado_em, a.conta_id
   limit 1;
  if v is not null then
    update public.nx_acessos set ultima_atribuicao_em = clock_timestamp() where conta_id = v and cliente_id = p_cliente;
  end if;
  return v;
end $$;

-- a base do editor (funis, etiquetas, pessoas, departamentos, números, modelos, campos): a mesma que o
-- nx_automacoes_listar devolve em "base" e que a IA recebe como opções fechadas
create or replace function public.nx_auto_base(p_cliente uuid)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return json_build_object(
    'funis', coalesce((select json_agg(json_build_object('id', f.id, 'nome', f.nome, 'padrao', f.padrao, 'ativo', f.ativo,
                 'conta_no_ads', f.conta_no_ads,
                 'estagios', coalesce((select json_agg(json_build_object('id', s.id, 'nome', s.nome, 'cor', s.cor, 'tipo', s.tipo,
                                                                        'marco', s.marco) order by s.ordem)
                                         from public.nx_estagios s where s.funil_id = f.id), '[]'::json))
                 order by f.ordem, f.criado_em)
        from public.nx_funis f where f.cliente_id = p_cliente), '[]'::json),
    'etiquetas', coalesce((select json_agg(json_build_object('id', t.id, 'nome', t.nome, 'cor', t.cor) order by lower(t.nome))
        from public.nx_etiquetas t where t.cliente_id = p_cliente), '[]'::json),
    'usuarios', coalesce((select json_agg(json_build_object('id', k.id, 'nome', k.nome, 'papel', a.papel) order by lower(k.nome))
        from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
       where a.cliente_id = p_cliente and k.aprovado), '[]'::json),
    'departamentos', coalesce((select json_agg(json_build_object('id', d.id, 'nome', d.nome, 'cor', d.cor, 'padrao', d.padrao)
                                               order by d.ordem, d.nome)
        from public.nx_departamentos d where d.cliente_id = p_cliente and d.ativo), '[]'::json),
    'canais', coalesce((select json_agg(json_build_object('id', k.id, 'nome', k.nome, 'numero_exibicao', k.numero_exibicao,
                                                          'status', k.status) order by k.criado_em)
        from public.nx_canais k where k.cliente_id = p_cliente), '[]'::json),
    'templates', coalesce((select json_agg(json_build_object('id', t.id, 'canal_id', t.canal_id, 'nome', t.nome, 'idioma', t.idioma,
                 'categoria', t.categoria, 'status', t.status, 'corpo', left(t.corpo, 1024), 'num_parametros', t.num_parametros)
                 order by t.nome, t.idioma)
        from public.nx_templates t where t.cliente_id = p_cliente), '[]'::json),
    'campos', coalesce((select json_agg(json_build_object('chave', c.chave, 'rotulo', c.rotulo, 'tipo', c.tipo) order by c.ordem, c.rotulo)
        from public.nx_campos c where c.cliente_id = p_cliente and c.entidade = 'contato' and c.ativo), '[]'::json),
    'campos_negocio', coalesce((select json_agg(json_build_object('chave', c.chave, 'rotulo', c.rotulo, 'tipo', c.tipo) order by c.ordem, c.rotulo)
        from public.nx_campos c where c.cliente_id = p_cliente and c.entidade = 'negocio' and c.ativo), '[]'::json));
end $$;

-- a IA da plataforma está configurada? (só o sim/não: a chave nunca sai do banco)
create or replace function public.nx_auto_ia_ligada()
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return exists (select 1 from public.nx_config c where c.id = 1 and nullif(btrim(coalesce(c.anthropic_api_key, '')), '') is not null);
end $$;

-- ------------------------------------------------------------
-- 3. Validação e normalização (§5.8) — as MESMAS frases do auto-logica.validar
--    (cópia de 20260928h + gatilhos agendado/apos_data/conversa_resolvida e as ações novas)
--    p_ligar = true exige também o modelo aprovado (enviar_template).
-- ------------------------------------------------------------
create or replace function public.nx_auto_normalizar(p_cliente uuid, p_auto jsonb, p_ligar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a jsonb := coalesce(p_auto, '{}'::jsonb);
  v_nome text := btrim(coalesce(a ->> 'nome', ''));
  v_gat text := a ->> 'gatilho';
  c jsonb := case when jsonb_typeof(a -> 'config') = 'object' then a -> 'config' else '{}'::jsonb end;
  nc jsonb;
  v_conds jsonb := coalesce(a -> 'condicoes', '[]'::jsonb);
  v_acoes jsonb := coalesce(a -> 'acoes', '[]'::jsonb);
  nconds jsonb := '[]'::jsonb;
  nacoes jsonb := '[]'::jsonb;
  x jsonb; y jsonb; w jsonb;
  i int; n int; v_id uuid; v_id2 uuid; v_txt text; v_txt2 text; v_campo text; v_op text; v_tipo text; p text;
  v_esperas int := 0; v_modo text;
  t public.nx_templates; e public.nx_estagios;
begin
  if v_nome = '' then perform public.nx_auto_falha('dê um nome à automação'); end if;
  if char_length(v_nome) > 80 then perform public.nx_auto_falha('o nome pode ter até 80 caracteres'); end if;
  if v_gat is null or v_gat not in ('conversa_nova', 'mensagem_recebida', 'negocio_criado', 'negocio_estagio',
      'negocio_ganho', 'negocio_perdido', 'etiqueta_adicionada', 'sem_resposta', 'tempo_no_estagio',
      'tarefa_vencida', 'antes_da_data', 'agendado', 'apos_data', 'conversa_resolvida') then
    perform public.nx_auto_falha('escolha o gatilho em «Quando»');
  end if;

  -- ---------------------------------------------------------- Quando (config)
  case v_gat
    when 'conversa_nova', 'conversa_resolvida' then
      nc := jsonb_strip_nulls(jsonb_build_object(
        'canal_id', public.nx_auto_id(p_cliente, 'canal', c ->> 'canal_id', 'o número escolhido em «Quando» não existe mais'),
        'departamento_id', public.nx_auto_id(p_cliente, 'departamento', c ->> 'departamento_id', 'o departamento escolhido em «Quando» não existe mais')));
    when 'mensagem_recebida' then
      if c ? 'palavras' and jsonb_typeof(c -> 'palavras') not in ('array', 'null') then
        perform public.nx_auto_falha('as palavras estão em formato inválido');
      end if;
      select coalesce(jsonb_agg(s.w), '[]'::jsonb) into w
        from (select btrim(z) as w
                from jsonb_array_elements_text(case when jsonb_typeof(c -> 'palavras') = 'array' then c -> 'palavras' else '[]'::jsonb end) z
               where btrim(z) <> '') s;
      if jsonb_array_length(w) > 20 then perform public.nx_auto_falha('use até 20 palavras'); end if;
      if exists (select 1 from jsonb_array_elements_text(w) z where char_length(z) > 60) then
        perform public.nx_auto_falha('cada palavra pode ter até 60 caracteres');
      end if;
      nc := jsonb_strip_nulls(jsonb_build_object(
        'palavras', case when jsonb_array_length(w) > 0 then w end,
        'canal_id', public.nx_auto_id(p_cliente, 'canal', c ->> 'canal_id', 'o número escolhido em «Quando» não existe mais')));
    when 'negocio_criado', 'negocio_ganho', 'negocio_perdido' then
      nc := jsonb_strip_nulls(jsonb_build_object(
        'funil_id', public.nx_auto_id(p_cliente, 'funil', c ->> 'funil_id', 'o funil escolhido em «Quando» não existe mais')));
    when 'negocio_estagio' then
      if coalesce(btrim(c ->> 'estagio_id'), '') = '' then perform public.nx_auto_falha('escolha a etapa em «Quando»'); end if;
      nc := jsonb_build_object('estagio_id',
        public.nx_auto_id(p_cliente, 'estagio', c ->> 'estagio_id', 'a etapa escolhida em «Quando» não existe mais'));
    when 'tempo_no_estagio' then
      if coalesce(btrim(c ->> 'estagio_id'), '') = '' then perform public.nx_auto_falha('escolha a etapa em «Quando»'); end if;
      v_id := public.nx_auto_id(p_cliente, 'estagio', c ->> 'estagio_id', 'a etapa escolhida em «Quando» não existe mais');
      n := public.nx_auto_int(c -> 'horas');
      if n is null or n not between 1 and 2160 then perform public.nx_auto_falha('o tempo na etapa vai de 1 a 2160 horas'); end if;
      nc := jsonb_build_object('estagio_id', v_id, 'horas', n);
    when 'etiqueta_adicionada' then
      if coalesce(btrim(c ->> 'etiqueta_id'), '') = '' then perform public.nx_auto_falha('escolha a etiqueta em «Quando»'); end if;
      nc := jsonb_build_object('etiqueta_id',
        public.nx_auto_id(p_cliente, 'etiqueta', c ->> 'etiqueta_id', 'a etiqueta escolhida em «Quando» não existe mais'));
    when 'sem_resposta' then
      n := public.nx_auto_int(c -> 'minutos');
      if n is null or n not between 5 and 1440 then perform public.nx_auto_falha('o tempo sem resposta vai de 5 a 1440 minutos'); end if;
      nc := jsonb_strip_nulls(jsonb_build_object('minutos', n,
        'departamento_id', public.nx_auto_id(p_cliente, 'departamento', c ->> 'departamento_id', 'o departamento escolhido em «Quando» não existe mais'),
        'so_no_horario', coalesce(c ->> 'so_no_horario', 'false') = 'true'));
    when 'tarefa_vencida' then
      nc := '{}'::jsonb;
    when 'antes_da_data' then
      if coalesce(c ->> 'campo', '') not in ('consulta', 'previsao_fechamento') then
        perform public.nx_auto_falha('escolha a data em «Quando»');
      end if;
      n := public.nx_auto_int(c -> 'horas');
      if n is null or n not between 1 and 72 then perform public.nx_auto_falha('a antecedência vai de 1 a 72 horas'); end if;
      nc := jsonb_strip_nulls(jsonb_build_object('campo', c ->> 'campo', 'horas', n,
        'funil_id', public.nx_auto_id(p_cliente, 'funil', c ->> 'funil_id', 'o funil escolhido em «Quando» não existe mais')));
    when 'apos_data' then
      if coalesce(c ->> 'campo', '') not in ('consulta', 'previsao_fechamento') then
        perform public.nx_auto_falha('escolha a data em «Quando»');
      end if;
      n := public.nx_auto_int(c -> 'horas');
      if n is null or n not between 1 and 720 then perform public.nx_auto_falha('o tempo depois da data vai de 1 a 720 horas'); end if;
      nc := jsonb_strip_nulls(jsonb_build_object('campo', c ->> 'campo', 'horas', n,
        'funil_id', public.nx_auto_id(p_cliente, 'funil', c ->> 'funil_id', 'o funil escolhido em «Quando» não existe mais')));
    when 'agendado' then
      if coalesce(c ->> 'horario', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        perform public.nx_auto_falha('escolha o horário em «Quando» (de 00:00 a 23:59)');
      end if;
      if c ? 'dias_semana' and jsonb_typeof(c -> 'dias_semana') not in ('array', 'null') then
        perform public.nx_auto_falha('os dias da semana estão em formato inválido');
      end if;
      if jsonb_typeof(c -> 'dias_semana') = 'array' then
        if exists (select 1 from jsonb_array_elements(c -> 'dias_semana') z
                    where public.nx_auto_int(z) is null or public.nx_auto_int(z) not between 0 and 6) then
          perform public.nx_auto_falha('os dias da semana vão de 0 (domingo) a 6 (sábado)');
        end if;
        select coalesce(jsonb_agg(s.d order by s.d), '[]'::jsonb) into w
          from (select distinct public.nx_auto_int(z) as d from jsonb_array_elements(c -> 'dias_semana') z) s;
        if jsonb_array_length(w) = 0 then perform public.nx_auto_falha('escolha pelo menos um dia da semana'); end if;
      else
        w := '[0,1,2,3,4,5,6]'::jsonb;     -- sem dias = todos os dias
      end if;
      v_id := public.nx_auto_id(p_cliente, 'funil', c ->> 'funil_id', 'o funil escolhido em «Quando» não existe mais');
      v_id2 := public.nx_auto_id(p_cliente, 'estagio', c ->> 'estagio_id', 'a etapa escolhida em «Quando» não existe mais');
      if v_id is not null and v_id2 is not null
         and not exists (select 1 from public.nx_estagios s where s.id = v_id2 and s.funil_id = v_id) then
        perform public.nx_auto_falha('a etapa escolhida em «Quando» não é desse funil');
      end if;
      nc := jsonb_strip_nulls(jsonb_build_object('horario', c ->> 'horario', 'dias_semana', w,
                                                 'funil_id', v_id, 'estagio_id', v_id2));
    else
      perform public.nx_auto_falha('escolha o gatilho em «Quando»');
  end case;

  -- ---------------------------------------------------------- Se (condições)
  if jsonb_typeof(v_conds) = 'null' then v_conds := '[]'::jsonb; end if;
  if jsonb_typeof(v_conds) <> 'array' then perform public.nx_auto_falha('as condições estão em formato inválido'); end if;
  if jsonb_array_length(v_conds) > 10 then perform public.nx_auto_falha('use até 10 condições'); end if;
  for i in 0 .. jsonb_array_length(v_conds) - 1 loop
    x := v_conds -> i;
    p := 'condição ' || (i + 1);
    if jsonb_typeof(x) <> 'object' then perform public.nx_auto_falha(p || ': escolha o campo'); end if;
    v_campo := coalesce(x ->> 'campo', '');
    v_op := coalesce(x ->> 'op', '');
    v_tipo := case
      when v_campo = 'origem' then 'origem'
      when v_campo = 'funil_id' then 'funil'
      when v_campo = 'estagio_id' then 'estagio'
      when v_campo = 'canal_id' then 'canal'
      when v_campo = 'departamento_id' then 'departamento'
      when v_campo = 'etiqueta' then 'etiqueta'
      when v_campo = 'texto' then 'texto'
      when v_campo = 'valor' then 'numero'
      when v_campo = 'dono_id' then 'conta'
      when v_campo ~ '^contato\.[a-z][a-z0-9_]{0,39}$' then 'campo'
    end;
    if v_tipo is null then perform public.nx_auto_falha(p || ': escolha o campo'); end if;
    if v_op not in ('igual', 'diferente', 'contem', 'nao_contem', 'maior', 'menor', 'vazio', 'preenchido') then
      perform public.nx_auto_falha(p || ': escolha a comparação');
    end if;
    if v_op in ('maior', 'menor') and v_tipo not in ('numero', 'campo') then
      perform public.nx_auto_falha(p || ': «maior» e «menor» valem só para valor e campos');
    end if;
    if v_op in ('vazio', 'preenchido') then
      y := jsonb_build_object('campo', v_campo, 'op', v_op);
    else
      v_txt := btrim(coalesce(x ->> 'valor', ''));
      if v_txt = '' then perform public.nx_auto_falha(p || ': preencha o valor'); end if;
      if v_tipo = 'numero' then
        if replace(v_txt, ',', '.') !~ '^-?[0-9]+(\.[0-9]+)?$' then
          perform public.nx_auto_falha(p || ': o valor precisa ser um número');
        end if;
        y := jsonb_build_object('campo', v_campo, 'op', v_op, 'valor', replace(v_txt, ',', '.')::numeric);
      else
        if v_tipo in ('funil', 'estagio', 'canal', 'departamento', 'etiqueta', 'conta') then
          v_id := public.nx_auto_uuid(v_txt);
          if v_id is null or not public.nx_auto_ref_ok(p_cliente, v_tipo, v_id) then
            perform public.nx_auto_falha(p || ': o item escolhido não existe mais');
          end if;
          v_txt := v_id::text;
        end if;
        if v_tipo = 'origem' and v_txt not in ('anuncio', 'whatsapp', 'indicacao', 'organico', 'manual', 'site', 'importacao') then
          perform public.nx_auto_falha(p || ': escolha a origem');
        end if;
        if char_length(v_txt) > 200 then perform public.nx_auto_falha(p || ': o valor pode ter até 200 caracteres'); end if;
        y := jsonb_build_object('campo', v_campo, 'op', v_op, 'valor', v_txt);
      end if;
    end if;
    nconds := nconds || jsonb_build_array(y);
  end loop;

  -- ---------------------------------------------------------- Então (ações)
  if jsonb_typeof(v_acoes) <> 'array' or jsonb_array_length(v_acoes) = 0 then
    perform public.nx_auto_falha('acrescente pelo menos uma ação em «Então»');
  end if;
  if jsonb_array_length(v_acoes) > 10 then perform public.nx_auto_falha('use até 10 ações'); end if;
  for i in 0 .. jsonb_array_length(v_acoes) - 1 loop
    x := v_acoes -> i;
    p := 'ação ' || (i + 1);
    if jsonb_typeof(x) <> 'object' or coalesce(x ->> 'tipo', '') not in ('criar_negocio', 'mover_estagio', 'criar_tarefa',
        'enviar_mensagem', 'enviar_template', 'atribuir', 'etiquetar', 'notificar', 'resolver_conversa', 'alerta_whatsapp',
        'mover_funil', 'etiqueta_adicionar', 'etiqueta_remover', 'campo_atualizar', 'nota', 'esperar', 'parar', 'ia_decidir') then
      perform public.nx_auto_falha(p || ': tipo de ação desconhecido');
    end if;
    case x ->> 'tipo'
      when 'criar_negocio' then
        v_id := public.nx_auto_id(p_cliente, 'funil', x ->> 'funil_id', p || ': o funil escolhido não existe mais');
        v_id2 := public.nx_auto_id(p_cliente, 'estagio', x ->> 'estagio_id', p || ': a etapa escolhida não existe mais');
        if v_id is not null and v_id2 is not null
           and not exists (select 1 from public.nx_estagios s where s.id = v_id2 and s.funil_id = v_id) then
          perform public.nx_auto_falha(p || ': a etapa não é desse funil');
        end if;
        v_txt := nullif(btrim(coalesce(x ->> 'titulo', '')), '');
        if char_length(v_txt) > 120 then perform public.nx_auto_falha(p || ': o título pode ter até 120 caracteres'); end if;
        y := jsonb_strip_nulls(jsonb_build_object('tipo', 'criar_negocio', 'funil_id', v_id, 'estagio_id', v_id2, 'titulo', v_txt));
      when 'mover_estagio' then
        if coalesce(btrim(x ->> 'estagio_id'), '') = '' then perform public.nx_auto_falha(p || ': escolha a etapa'); end if;
        y := jsonb_build_object('tipo', 'mover_estagio',
          'estagio_id', public.nx_auto_id(p_cliente, 'estagio', x ->> 'estagio_id', p || ': a etapa escolhida não existe mais'));
      when 'mover_funil' then
        if coalesce(btrim(x ->> 'funil_id'), '') = '' then perform public.nx_auto_falha(p || ': escolha o funil'); end if;
        v_id := public.nx_auto_id(p_cliente, 'funil', x ->> 'funil_id', p || ': o funil escolhido não existe mais');
        if not exists (select 1 from public.nx_funis f where f.id = v_id and f.ativo) then
          perform public.nx_auto_falha(p || ': o funil escolhido está desativado');
        end if;
        v_id2 := public.nx_auto_id(p_cliente, 'estagio', x ->> 'estagio_id', p || ': a etapa escolhida não existe mais');
        if v_id2 is not null and not exists (select 1 from public.nx_estagios s where s.id = v_id2 and s.funil_id = v_id) then
          perform public.nx_auto_falha(p || ': a etapa não é desse funil');
        end if;
        y := jsonb_strip_nulls(jsonb_build_object('tipo', 'mover_funil', 'funil_id', v_id, 'estagio_id', v_id2));
      when 'criar_tarefa' then
        v_txt := btrim(coalesce(x ->> 'titulo', ''));
        if v_txt = '' then perform public.nx_auto_falha(p || ': escreva o título da tarefa'); end if;
        if char_length(v_txt) > 160 then perform public.nx_auto_falha(p || ': o título pode ter até 160 caracteres'); end if;
        if x ? 'tipo_tarefa' and x -> 'tipo_tarefa' <> 'null'::jsonb
           and coalesce(x ->> 'tipo_tarefa', '') not in ('tarefa', 'ligacao', 'reuniao', 'visita', 'whatsapp', 'email') then
          perform public.nx_auto_falha(p || ': tipo de tarefa inválido');
        end if;
        n := 24;
        if x ? 'vence_em_horas' and x -> 'vence_em_horas' <> 'null'::jsonb and coalesce(x ->> 'vence_em_horas', '') <> '' then
          n := public.nx_auto_int(x -> 'vence_em_horas');
          if n is null or n not between 0 and 2160 then perform public.nx_auto_falha(p || ': o prazo vai de 0 a 2160 horas'); end if;
        end if;
        if coalesce(x ->> 'dono', '') not in ('responsavel', 'atendente') then
          v_id := public.nx_auto_uuid(x ->> 'dono');
          if v_id is null or not public.nx_auto_ref_ok(p_cliente, 'conta', v_id) then
            perform public.nx_auto_falha(p || ': escolha para quem é a tarefa');
          end if;
        end if;
        y := jsonb_build_object('tipo', 'criar_tarefa', 'titulo', v_txt,
          'tipo_tarefa', coalesce(nullif(x ->> 'tipo_tarefa', ''), 'tarefa'), 'vence_em_horas', n, 'dono', x ->> 'dono');
      when 'enviar_mensagem' then
        v_txt := btrim(coalesce(x ->> 'texto', ''));
        if v_txt = '' then perform public.nx_auto_falha(p || ': escreva a mensagem'); end if;
        if char_length(v_txt) > 4096 then perform public.nx_auto_falha(p || ': a mensagem pode ter até 4096 caracteres'); end if;
        y := jsonb_build_object('tipo', 'enviar_mensagem', 'texto', v_txt);
      when 'enviar_template' then
        if x ? 'parametros' and jsonb_typeof(x -> 'parametros') not in ('array', 'null') then
          perform public.nx_auto_falha(p || ': os parâmetros estão em formato inválido');
        end if;
        select coalesce(jsonb_agg(coalesce(z #>> '{}', '') order by o), '[]'::jsonb) into w
          from jsonb_array_elements(case when jsonb_typeof(x -> 'parametros') = 'array' then x -> 'parametros' else '[]'::jsonb end)
               with ordinality q(z, o);
        if jsonb_array_length(w) > 10 then perform public.nx_auto_falha(p || ': use até 10 parâmetros'); end if;
        if exists (select 1 from jsonb_array_elements_text(w) z where char_length(z) > 200) then
          perform public.nx_auto_falha(p || ': cada parâmetro pode ter até 200 caracteres');
        end if;
        if coalesce(btrim(x ->> 'template_id'), '') = '' then
          if p_ligar then perform public.nx_auto_falha(p || ': escolha o modelo aprovado'); end if;
          v_txt := nullif(left(btrim(coalesce(x ->> 'template_nome', '')), 60), '');
          y := jsonb_strip_nulls(jsonb_build_object('tipo', 'enviar_template', 'template_nome', v_txt, 'parametros', w));
        else
          v_id := public.nx_auto_uuid(x ->> 'template_id');
          select * into t from public.nx_templates k where k.id = v_id and k.cliente_id = p_cliente;
          if t.id is null then perform public.nx_auto_falha(p || ': o modelo escolhido não existe mais'); end if;
          if p_ligar and upper(coalesce(t.status, '')) <> 'APPROVED' then
            perform public.nx_auto_falha(p || ': o modelo ainda não foi aprovado pela Meta');
          end if;
          if jsonb_array_length(w) <> coalesce(t.num_parametros, 0) then
            perform public.nx_auto_falha(p || ': o modelo pede ' || coalesce(t.num_parametros, 0) || ' parâmetro'
                                         || case when coalesce(t.num_parametros, 0) = 1 then '' else 's' end);
          end if;
          if exists (select 1 from jsonb_array_elements_text(w) z where btrim(z) = '') then
            perform public.nx_auto_falha(p || ': preencha todos os parâmetros');
          end if;
          y := jsonb_build_object('tipo', 'enviar_template', 'template_id', t.id, 'parametros', w);
        end if;
      when 'atribuir' then
        -- "dono" (rodizio | conta | departamento) é o campo do contrato novo; "modo" (rodizio | conta) é o antigo
        v_modo := coalesce(nullif(btrim(x ->> 'dono'), ''), nullif(btrim(x ->> 'modo'), ''));
        if v_modo is null or v_modo not in ('rodizio', 'conta', 'departamento')
           or (v_modo = 'departamento' and coalesce(x ->> 'dono', '') <> 'departamento') then
          perform public.nx_auto_falha(p || ': escolha como atribuir');
        end if;
        v_id := null;
        if v_modo = 'conta' then
          v_id := public.nx_auto_uuid(x ->> 'conta_id');
          if v_id is null or not public.nx_auto_ref_ok(p_cliente, 'conta', v_id) then
            perform public.nx_auto_falha(p || ': escolha a pessoa');
          end if;
        end if;
        v_id2 := public.nx_auto_id(p_cliente, 'departamento', x ->> 'departamento_id', p || ': o departamento escolhido não existe mais');
        if v_modo = 'departamento' and v_id2 is null then perform public.nx_auto_falha(p || ': escolha o departamento'); end if;
        y := jsonb_strip_nulls(jsonb_build_object('tipo', 'atribuir',
               case when coalesce(x ->> 'dono', '') <> '' then 'dono' else 'modo' end, v_modo,
               'conta_id', v_id, 'departamento_id', v_id2));
      when 'etiquetar' then
        if coalesce(btrim(x ->> 'etiqueta_id'), '') = '' and coalesce(btrim(x ->> 'etiqueta_nome'), '') = '' then
          perform public.nx_auto_falha(p || ': escolha a etiqueta');
        end if;
        if coalesce(btrim(x ->> 'etiqueta_id'), '') <> '' then
          v_id := public.nx_auto_id(p_cliente, 'etiqueta', x ->> 'etiqueta_id', p || ': a etiqueta escolhida não existe mais');
        else
          v_txt := btrim(x ->> 'etiqueta_nome');
          if char_length(v_txt) > 40 then perform public.nx_auto_falha(p || ': o nome da etiqueta pode ter até 40 caracteres'); end if;
          v_id := null;
        end if;
        if coalesce(x ->> 'alvo', '') not in ('contato', 'conversa') then
          perform public.nx_auto_falha(p || ': escolha onde pôr a etiqueta');
        end if;
        if v_id is null then
          -- modelo "preço → Orçamento": a etiqueta é achada pelo nome ou criada agora
          select k.id into v_id from public.nx_etiquetas k
           where k.cliente_id = p_cliente and lower(k.nome) = lower(v_txt) limit 1;
          if v_id is null then
            insert into public.nx_etiquetas (cliente_id, nome, cor) values (p_cliente, v_txt, '#E5B35C')
            on conflict do nothing returning id into v_id;
            if v_id is null then
              select k.id into v_id from public.nx_etiquetas k
               where k.cliente_id = p_cliente and lower(k.nome) = lower(v_txt) limit 1;
            end if;
          end if;
        end if;
        y := jsonb_build_object('tipo', 'etiquetar', 'etiqueta_id', v_id, 'alvo', x ->> 'alvo',
                                'remover', coalesce(x ->> 'remover', 'false') = 'true');
      when 'etiqueta_adicionar', 'etiqueta_remover' then
        if coalesce(btrim(x ->> 'etiqueta_id'), '') = '' then perform public.nx_auto_falha(p || ': escolha a etiqueta'); end if;
        y := jsonb_build_object('tipo', x ->> 'tipo',
          'etiqueta_id', public.nx_auto_id(p_cliente, 'etiqueta', x ->> 'etiqueta_id', p || ': a etiqueta escolhida não existe mais'));
      when 'campo_atualizar' then
        v_txt := btrim(coalesce(x ->> 'campo', ''));
        if v_txt !~ '^[a-z][a-z0-9_]{1,39}$' then perform public.nx_auto_falha(p || ': escolha o campo'); end if;
        if v_txt <> 'score' and not exists (select 1 from public.nx_campos k
              where k.cliente_id = p_cliente and k.chave = v_txt and k.entidade in ('contato', 'negocio') and k.ativo) then
          perform public.nx_auto_falha(p || ': o campo escolhido não existe mais');
        end if;
        v_txt2 := btrim(coalesce(x ->> 'valor', ''));
        if v_txt2 = '' then perform public.nx_auto_falha(p || ': escreva o valor'); end if;
        if char_length(v_txt2) > 200 then perform public.nx_auto_falha(p || ': o valor pode ter até 200 caracteres'); end if;
        y := jsonb_build_object('tipo', 'campo_atualizar', 'campo', v_txt, 'valor', v_txt2);
      when 'nota' then
        v_txt := btrim(coalesce(x ->> 'texto', ''));
        if v_txt = '' then perform public.nx_auto_falha(p || ': escreva a nota'); end if;
        if char_length(v_txt) > 1000 then perform public.nx_auto_falha(p || ': a nota pode ter até 1000 caracteres'); end if;
        y := jsonb_build_object('tipo', 'nota', 'texto', v_txt);
      when 'notificar' then
        v_id := null;
        if coalesce(x ->> 'para', '') not in ('responsavel', 'admins', 'departamento') then
          v_id := public.nx_auto_uuid(x ->> 'para');
          if v_id is null or not public.nx_auto_ref_ok(p_cliente, 'conta', v_id) then
            perform public.nx_auto_falha(p || ': escolha quem recebe o aviso');
          end if;
        end if;
        v_id2 := public.nx_auto_id(p_cliente, 'departamento', x ->> 'departamento_id', p || ': o departamento escolhido não existe mais');
        if x ->> 'para' = 'departamento' and v_id2 is null then perform public.nx_auto_falha(p || ': escolha o departamento'); end if;
        v_txt := btrim(coalesce(x ->> 'titulo', ''));
        v_txt2 := btrim(coalesce(x ->> 'texto', ''));
        -- o aviso precisa de título OU de texto (só o texto vira o título)
        if v_txt = '' and v_txt2 = '' then perform public.nx_auto_falha(p || ': escreva o título do aviso'); end if;
        if char_length(v_txt) > 120 then perform public.nx_auto_falha(p || ': o título do aviso pode ter até 120 caracteres'); end if;
        if char_length(v_txt2) > 500 then
          perform public.nx_auto_falha(p || ': o detalhe do aviso pode ter até 500 caracteres');
        end if;
        y := jsonb_strip_nulls(jsonb_build_object('tipo', 'notificar', 'para', x ->> 'para', 'titulo', nullif(v_txt, ''),
               'texto', nullif(v_txt2, ''),
               'departamento_id', case when x ->> 'para' = 'departamento' then v_id2 end));
      when 'esperar' then
        n := public.nx_auto_int(x -> 'minutos');
        if n is null or n not between 1 and 43200 then
          perform public.nx_auto_falha(p || ': a espera vai de 1 minuto a 30 dias (43200 minutos)');
        end if;
        if i = jsonb_array_length(v_acoes) - 1 then
          perform public.nx_auto_falha(p || ': depois de esperar, acrescente outra ação');
        end if;
        v_esperas := v_esperas + 1;
        if v_esperas > 5 then perform public.nx_auto_falha(p || ': use até 5 esperas'); end if;
        y := jsonb_build_object('tipo', 'esperar', 'minutos', n,
          'cancelar_se_cliente_responder', coalesce(x ->> 'cancelar_se_cliente_responder', 'true') <> 'false');
      when 'parar' then
        y := jsonb_build_object('tipo', 'parar');
      when 'ia_decidir' then
        if coalesce(x ->> 'tarefa', '') not in ('classificar_etapa', 'resumir_nota', 'pontuar_lead') then
          perform public.nx_auto_falha(p || ': escolha o que a IA faz');
        end if;
        v_txt := nullif(btrim(coalesce(x ->> 'instrucao', '')), '');
        if char_length(v_txt) > 500 then perform public.nx_auto_falha(p || ': a instrução pode ter até 500 caracteres'); end if;
        y := jsonb_strip_nulls(jsonb_build_object('tipo', 'ia_decidir', 'tarefa', x ->> 'tarefa', 'instrucao', v_txt));
      when 'resolver_conversa' then
        y := jsonb_build_object('tipo', 'resolver_conversa');
      when 'alerta_whatsapp' then
        v_txt := btrim(coalesce(x ->> 'texto', ''));
        if v_txt = '' or char_length(v_txt) > 1000 then
          perform public.nx_auto_falha(p || ': escreva o alerta (até 1000 caracteres)');
        end if;
        y := jsonb_build_object('tipo', 'alerta_whatsapp', 'texto', v_txt);
      else
        perform public.nx_auto_falha(p || ': tipo de ação desconhecido');
    end case;
    nacoes := nacoes || jsonb_build_array(y);
  end loop;

  return jsonb_build_object('nome', v_nome, 'gatilho', v_gat, 'config', nc, 'condicoes', nconds, 'acoes', nacoes,
                            'respeitar_horario', coalesce(a ->> 'respeitar_horario', 'false') = 'true');
end $$;

-- ------------------------------------------------------------
-- 4. Gatilhos de banco novos, conferência do config e alvos de tempo
-- ------------------------------------------------------------

-- conversa resolvida (não oculta) → evento 'conversa_resolvida'
create or replace function public.nx_tg_auto_conversa_res()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.oculta then return null; end if;
  perform public.nx_auto_evento(new.cliente_id, 'conversa_resolvida', jsonb_build_object(
    'conversa_id', new.id, 'contato_id', new.contato_id, 'canal_id', new.canal_id,
    'departamento_id', new.departamento_id, 'negocio_id', new.negocio_id));
  return null;
end $$;

drop trigger if exists nx_auto_ev_conversa_res on public.nx_conversas;
create trigger nx_auto_ev_conversa_res after update on public.nx_conversas
  for each row when (old.status is distinct from new.status and new.status = 'resolvida')
  execute function public.nx_tg_auto_conversa_res();

-- o cliente respondeu: as sequências que esperam por ele (e pediram para parar se ele responder) são canceladas
create or replace function public.nx_tg_auto_seq_resposta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.nx_auto_sequencias s
                  where s.cliente_id = new.cliente_id and s.contato_id = new.contato_id
                    and s.status = 'esperando' and s.cancelar_se_responder) then
    return null;
  end if;
  with c as (
    update public.nx_auto_sequencias s
       set status = 'cancelada', motivo = 'o cliente respondeu', atualizado_em = now()
     where s.cliente_id = new.cliente_id and s.contato_id = new.contato_id
       and s.status = 'esperando' and s.cancelar_se_responder
    returning s.automacao_id, s.chave)
  update public.nx_auto_execucoes x
     set estado = 'cancelada', atualizado_em = now(),
         detalhe = left(coalesce(x.detalhe, '') || ' · cancelada: o cliente respondeu', 1000)
    from c where x.automacao_id = c.automacao_id and x.chave = c.chave;
  return null;
end $$;

drop trigger if exists nx_auto_seq_resposta on public.nx_mensagens;
create trigger nx_auto_seq_resposta after insert on public.nx_mensagens
  for each row when (new.direcao = 'in' and new.tipo not in ('sistema', 'nota'))
  execute function public.nx_tg_auto_seq_resposta();

-- automação desligada: quem estava esperando (ou aguardando a IA) é cancelado na hora
create or replace function public.nx_tg_auto_desligada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  with c as (
    update public.nx_auto_sequencias s
       set status = 'cancelada', motivo = 'a automação foi desligada', atualizado_em = now()
     where s.automacao_id = new.id and s.status in ('esperando', 'aguardando_ia')
    returning s.automacao_id, s.chave, s.pedido_id),
  p as (
    update public.nx_auto_ia_pedidos q set status = 'cancelado', concluido_em = now(),
           detalhe = 'a automação foi desligada'
     where q.id in (select pedido_id from c where pedido_id is not null) and q.status in ('pendente', 'processando')
    returning q.id)
  update public.nx_auto_execucoes x
     set estado = 'cancelada', atualizado_em = now(),
         detalhe = left(coalesce(x.detalhe, '') || ' · cancelada: a automação foi desligada', 1000)
    from c where x.automacao_id = c.automacao_id and x.chave = c.chave;
  return null;
end $$;

drop trigger if exists nx_auto_desligada on public.nx_automacoes;
create trigger nx_auto_desligada after update on public.nx_automacoes
  for each row when (old.ativo and not new.ativo)
  execute function public.nx_tg_auto_desligada();

-- texto do erro de uma execução ("Ação 2 (mover etapa): falta o valor para marcar como ganho.")
create or replace function public.nx_auto_erro_texto(p_msg text, p_hint text, p_detalhe text)
returns text
language plpgsql immutable
security definer
set search_path = ''
as $$
declare v_n text; v_t text; v_r text; v_h text := nullif(btrim(coalesce(p_hint, '')), '');
begin
  if coalesce(p_detalhe, '') like 'acao:%' then
    v_n := split_part(p_detalhe, ':', 2);
    v_t := case split_part(p_detalhe, ':', 3)
      when 'criar_tarefa' then 'criar tarefa' when 'mover_estagio' then 'mover etapa'
      when 'criar_negocio' then 'criar negócio' when 'enviar_mensagem' then 'enviar mensagem'
      when 'enviar_template' then 'enviar modelo' when 'atribuir' then 'atribuir'
      when 'etiquetar' then 'etiqueta' when 'notificar' then 'avisar'
      when 'resolver_conversa' then 'resolver conversa' when 'alerta_whatsapp' then 'alerta no WhatsApp'
      when 'mover_funil' then 'mover de funil' when 'etiqueta_adicionar' then 'pôr etiqueta'
      when 'etiqueta_remover' then 'tirar etiqueta' when 'campo_atualizar' then 'preencher campo'
      when 'nota' then 'anotar' when 'esperar' then 'esperar' when 'parar' then 'parar'
      when 'ia_decidir' then 'IA decide'
      else split_part(p_detalhe, ':', 3) end;
  end if;
  v_r := case p_msg
    when 'valor_obrigatorio' then 'falta o valor para marcar como ganho'
    when 'estagio_invalido' then 'a etapa não é válida' || coalesce(' (' || v_h || ')', '')
    when 'funil_invalido' then case v_h
        when 'fechado_no_ads' then 'negócio fechado no funil de anúncios não muda de funil'
        when 'sai_do_ads' then 'esse negócio veio do funil de anúncios e só pode ir para outro funil de anúncios'
        else 'o funil não é válido' || coalesce(' (' || v_h || ')', '') end
    when 'template_invalido' then 'modelo inválido' || coalesce(': ' || v_h, '')
    when 'rodizio_indisponivel' then 'o rodízio ainda não está disponível neste ambiente'
    when 'funcao_invalida' then 'o alerta no WhatsApp ainda não está disponível'
    when 'dados_invalidos' then 'dados inválidos' || coalesce(' (' || v_h || ')', '')
    else left(coalesce(p_msg, 'erro desconhecido'), 300) || coalesce(' (' || left(v_h, 100) || ')', '')
  end;
  if v_n is not null then return 'Ação ' || v_n || ' (' || v_t || '): ' || v_r || '.'; end if;
  return upper(left(v_r, 1)) || substr(v_r, 2) || '.';
end $$;

-- o config do gatilho de EVENTO bate com o evento? (+ conversa_resolvida)
create or replace function public.nx_auto_config_ok(p_gatilho text, p_cfg jsonb, p_ref jsonb)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
declare c jsonb := coalesce(p_cfg, '{}'::jsonb); r jsonb := coalesce(p_ref, '{}'::jsonb); v_txt text;
begin
  case p_gatilho
    when 'conversa_nova', 'conversa_resolvida' then
      return (c ->> 'canal_id' is null or c ->> 'canal_id' = r ->> 'canal_id')
         and (c ->> 'departamento_id' is null or c ->> 'departamento_id' = r ->> 'departamento_id');
    when 'mensagem_recebida' then
      if c ->> 'canal_id' is not null and c ->> 'canal_id' is distinct from r ->> 'canal_id' then return false; end if;
      if jsonb_typeof(c -> 'palavras') <> 'array' or jsonb_array_length(c -> 'palavras') = 0 then return true; end if;
      v_txt := public.nx_auto_norm(r ->> 'texto');
      if v_txt = '' then return false; end if;
      return exists (select 1 from jsonb_array_elements_text(c -> 'palavras') w
                      where public.nx_auto_norm(w) <> '' and position(public.nx_auto_norm(w) in v_txt) > 0);
    when 'negocio_criado', 'negocio_ganho', 'negocio_perdido' then
      return c ->> 'funil_id' is null or c ->> 'funil_id' = r ->> 'funil_id';
    when 'negocio_estagio' then
      return c ->> 'estagio_id' is not null and c ->> 'estagio_id' = r ->> 'estagio_para';
    when 'etiqueta_adicionada' then
      return c ->> 'etiqueta_id' is not null and c ->> 'etiqueta_id' = r ->> 'etiqueta_id';
    else
      return false;
  end case;
end $$;

-- alvos dos gatilhos de TEMPO (§5.7 passo 3), sem os já executados (chave)
-- (cópia de 20260928h + agendado e apos_data)
create or replace function public.nx_auto_alvos_tempo(p_auto public.nx_automacoes, p_lim int)
returns table (chave text, ref jsonb)
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  c jsonb := coalesce(p_auto.config, '{}'::jsonb);
  v_min int; v_h int; v_dep uuid; v_est uuid; v_funil uuid; v_so boolean; v_hpad jsonb; v_hor time; v_dias int[];
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  case p_auto.gatilho
  when 'sem_resposta' then
    v_min := greatest(coalesce(public.nx_auto_int(c -> 'minutos'), 15), 5);
    v_dep := public.nx_auto_uuid(c ->> 'departamento_id');
    v_so := coalesce(c ->> 'so_no_horario', 'false') = 'true';
    select d.horario into v_hpad from public.nx_departamentos d where d.cliente_id = p_auto.cliente_id and d.padrao;
    return query
      select 'sr:' || cv.id || ':' || floor(extract(epoch from cv.ultima_entrada_em))::bigint,
             jsonb_build_object('conversa_id', cv.id, 'contato_id', cv.contato_id)
        from public.nx_conversas cv
        left join public.nx_departamentos d on d.id = cv.departamento_id
       where cv.cliente_id = p_auto.cliente_id and cv.status = 'aberta' and cv.aguardando and not cv.oculta
         and cv.ultima_entrada_em < now() - make_interval(mins => v_min)
         -- janela de 1 dia além do prazo: ligar a automação não dispara para conversas esquecidas há semanas
         and cv.ultima_entrada_em > now() - make_interval(mins => v_min + 1440)
         and (v_dep is null or cv.departamento_id = v_dep)
         and (not v_so or public.nx_horario_aberto(case when cv.departamento_id is null then v_hpad else d.horario end, now()))
         and not exists (select 1 from public.nx_auto_execucoes x
                          where x.automacao_id = p_auto.id
                            and x.chave = 'sr:' || cv.id || ':' || floor(extract(epoch from cv.ultima_entrada_em))::bigint)
       order by cv.ultima_entrada_em
       limit p_lim;
  when 'tempo_no_estagio' then
    v_est := public.nx_auto_uuid(c ->> 'estagio_id');
    v_h := greatest(coalesce(public.nx_auto_int(c -> 'horas'), 48), 1);
    return query
      select 'te:' || l.id || ':' || l.estagio_id || ':' || floor(extract(epoch from l.estagio_em))::bigint,
             jsonb_build_object('negocio_id', l.id, 'contato_id', l.contato_id)
        from public.nx_leads l
       where l.cliente_id = p_auto.cliente_id and l.estagio_id = v_est and l.status = 'aberto'
         and l.estagio_em < now() - make_interval(hours => v_h)
         and not exists (select 1 from public.nx_auto_execucoes x
                          where x.automacao_id = p_auto.id
                            and x.chave = 'te:' || l.id || ':' || l.estagio_id || ':' || floor(extract(epoch from l.estagio_em))::bigint)
       order by l.estagio_em
       limit p_lim;
  when 'tarefa_vencida' then
    return query
      select 'tv:' || t.id, jsonb_build_object('tarefa_id', t.id, 'negocio_id', t.negocio_id, 'contato_id', t.contato_id)
        from public.nx_tarefas t
       where t.cliente_id = p_auto.cliente_id and t.concluida_em is null
         and t.vence_em < now() and t.vence_em > now() - interval '7 days'
         -- anti-laço: tarefa criada por automação de "tarefa vencida" não dispara outra
         and not exists (select 1 from public.nx_automacoes a2 where a2.id = t.automacao_id and a2.gatilho = 'tarefa_vencida')
         and not exists (select 1 from public.nx_auto_execucoes x where x.automacao_id = p_auto.id and x.chave = 'tv:' || t.id)
       order by t.vence_em
       limit p_lim;
  when 'antes_da_data' then
    v_h := least(greatest(coalesce(public.nx_auto_int(c -> 'horas'), 24), 1), 72);
    v_funil := public.nx_auto_uuid(c ->> 'funil_id');
    if c ->> 'campo' = 'previsao_fechamento' then
      return query
        select 'ad:' || s.id || ':' || floor(extract(epoch from s.alvo))::bigint,
               jsonb_build_object('negocio_id', s.id, 'contato_id', s.contato_id)
          from (select l.id, l.contato_id, ((l.previsao_fechamento + time '09:00') at time zone 'America/Sao_Paulo') as alvo
                  from public.nx_leads l
                 where l.cliente_id = p_auto.cliente_id and l.status = 'aberto'
                   and l.previsao_fechamento between v_hoje and v_hoje + (v_h / 24 + 1)
                   and (v_funil is null or l.funil_id = v_funil)) s
         where s.alvo > now() and s.alvo <= now() + make_interval(hours => v_h)
           and not exists (select 1 from public.nx_auto_execucoes x
                            where x.automacao_id = p_auto.id and x.chave = 'ad:' || s.id || ':' || floor(extract(epoch from s.alvo))::bigint)
         order by s.alvo
         limit p_lim;
    else
      return query
        select 'ad:' || s.id || ':' || floor(extract(epoch from s.alvo))::bigint,
               jsonb_build_object('negocio_id', s.id, 'contato_id', s.contato_id)
          from (select l.id, l.contato_id, l.consulta_em as alvo
                  from public.nx_leads l
                 where l.cliente_id = p_auto.cliente_id and l.status = 'aberto' and l.consulta_em is not null
                   and l.consulta_em > now() and l.consulta_em <= now() + make_interval(hours => v_h)
                   and (v_funil is null or l.funil_id = v_funil)
                union all
                select l.id, l.contato_id, ((l.data_consulta + time '09:00') at time zone 'America/Sao_Paulo')
                  from public.nx_leads l
                 where l.cliente_id = p_auto.cliente_id and l.status = 'aberto' and l.consulta_em is null
                   and l.data_consulta between v_hoje and v_hoje + (v_h / 24 + 1)
                   and (v_funil is null or l.funil_id = v_funil)) s
         where s.alvo > now() and s.alvo <= now() + make_interval(hours => v_h)
           and not exists (select 1 from public.nx_auto_execucoes x
                            where x.automacao_id = p_auto.id and x.chave = 'ad:' || s.id || ':' || floor(extract(epoch from s.alvo))::bigint)
         order by s.alvo
         limit p_lim;
    end if;
  when 'apos_data' then
    -- X horas DEPOIS da data. Janela de 48 h: ligar a automação não dispara para datas antigas.
    v_h := least(greatest(coalesce(public.nx_auto_int(c -> 'horas'), 2), 1), 720);
    v_funil := public.nx_auto_uuid(c ->> 'funil_id');
    if c ->> 'campo' = 'previsao_fechamento' then
      return query
        select 'ap:' || s.id || ':' || floor(extract(epoch from s.alvo))::bigint,
               jsonb_build_object('negocio_id', s.id, 'contato_id', s.contato_id)
          from (select l.id, l.contato_id, ((l.previsao_fechamento + time '09:00') at time zone 'America/Sao_Paulo') as alvo
                  from public.nx_leads l
                 where l.cliente_id = p_auto.cliente_id and l.status = 'aberto'
                   and l.previsao_fechamento between v_hoje - (v_h / 24 + 4) and v_hoje
                   and (v_funil is null or l.funil_id = v_funil)) s
         where s.alvo + make_interval(hours => v_h) <= now()
           and s.alvo + make_interval(hours => v_h) > now() - interval '48 hours'
           and not exists (select 1 from public.nx_auto_execucoes x
                            where x.automacao_id = p_auto.id and x.chave = 'ap:' || s.id || ':' || floor(extract(epoch from s.alvo))::bigint)
         order by s.alvo
         limit p_lim;
    else
      -- a data da consulta vale para QUALQUER status: na clínica quem fecha na consulta vai para «fechou» (ganho) e quem
      -- não fecha para «não fechou» (perdido), e os dois devem receber o pós-atendimento (a condição de etapa separa quem faltou)
      return query
        select 'ap:' || s.id || ':' || floor(extract(epoch from s.alvo))::bigint,
               jsonb_build_object('negocio_id', s.id, 'contato_id', s.contato_id)
          from (select l.id, l.contato_id, l.consulta_em as alvo
                  from public.nx_leads l
                 where l.cliente_id = p_auto.cliente_id and l.consulta_em is not null
                   and l.consulta_em <= now() - make_interval(hours => v_h)
                   and l.consulta_em > now() - make_interval(hours => v_h) - interval '48 hours'
                   and (v_funil is null or l.funil_id = v_funil)
                union all
                select l.id, l.contato_id, ((l.data_consulta + time '09:00') at time zone 'America/Sao_Paulo')
                  from public.nx_leads l
                 where l.cliente_id = p_auto.cliente_id and l.consulta_em is null
                   and l.data_consulta between v_hoje - (v_h / 24 + 4) and v_hoje
                   and (v_funil is null or l.funil_id = v_funil)) s
         where s.alvo + make_interval(hours => v_h) <= now()
           and s.alvo + make_interval(hours => v_h) > now() - interval '48 hours'
           and not exists (select 1 from public.nx_auto_execucoes x
                            where x.automacao_id = p_auto.id and x.chave = 'ap:' || s.id || ':' || floor(extract(epoch from s.alvo))::bigint)
         order by s.alvo
         limit p_lim;
    end if;
  when 'agendado' then
    -- todo dia, num horário (America/Sao_Paulo), nos dias da semana escolhidos (0 = domingo … 6 = sábado):
    -- um alvo por negócio ABERTO que casa (funil e etapa opcionais), uma vez por dia. Rodando a partir
    -- do horário e por até 3 h (ligar a automação à tarde não dispara um lote "atrasado" de manhã).
    if coalesce(c ->> 'horario', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return; end if;
    v_hor := (c ->> 'horario')::time;
    v_dias := coalesce(array(select public.nx_auto_int(z) from jsonb_array_elements(
                case when jsonb_typeof(c -> 'dias_semana') = 'array' then c -> 'dias_semana' else '[0,1,2,3,4,5,6]'::jsonb end) z), '{}'::int[]);
    v_funil := public.nx_auto_uuid(c ->> 'funil_id');
    v_est := public.nx_auto_uuid(c ->> 'estagio_id');
    return query
      select 'ag:' || l.id || ':' || to_char(d.dia, 'YYYY-MM-DD'),
             jsonb_build_object('negocio_id', l.id, 'contato_id', l.contato_id)
        from (select x.dia from (values (v_hoje - 1), (v_hoje)) x(dia)
               where extract(dow from x.dia)::int = any(v_dias)
                 and ((x.dia + v_hor) at time zone 'America/Sao_Paulo') <= now()
                 and ((x.dia + v_hor) at time zone 'America/Sao_Paulo') + interval '3 hours' > now()) d
       cross join lateral (
         select l2.id, l2.contato_id from public.nx_leads l2
          where l2.cliente_id = p_auto.cliente_id and l2.status = 'aberto'
            and (v_funil is null or l2.funil_id = v_funil) and (v_est is null or l2.estagio_id = v_est)
            and not exists (select 1 from public.nx_auto_execucoes x
                             where x.automacao_id = p_auto.id and x.chave = 'ag:' || l2.id || ':' || to_char(d.dia, 'YYYY-MM-DD'))
          order by l2.id
          limit p_lim) l
       limit p_lim;
  else
    return;
  end case;
end $$;

-- exemplos reais para o "testar sem gravar" (nx_auto_simular): até p_lim alvos que o gatilho poderia pegar
create or replace function public.nx_auto_simular_alvos(p_cliente uuid, p_gat text, p_cfg jsonb, p_negocio bigint, p_lim int)
returns setof jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  c jsonb := coalesce(p_cfg, '{}'::jsonb);
  v_canal uuid := public.nx_auto_uuid(c ->> 'canal_id');
  v_dep uuid := public.nx_auto_uuid(c ->> 'departamento_id');
  v_funil uuid := public.nx_auto_uuid(c ->> 'funil_id');
  v_est uuid := public.nx_auto_uuid(c ->> 'estagio_id');
  v_etq uuid := public.nx_auto_uuid(c ->> 'etiqueta_id');
  v_status text;
begin
  if p_negocio is not null then
    return query select jsonb_build_object('negocio_id', l.id, 'contato_id', l.contato_id, 'funil_id', l.funil_id, 'estagio_para', l.estagio_id)
                   from public.nx_leads l where l.id = p_negocio and l.cliente_id = p_cliente;
    return;
  end if;
  if p_gat in ('conversa_nova', 'conversa_resolvida', 'sem_resposta') then
    return query
      select jsonb_build_object('conversa_id', cv.id, 'contato_id', cv.contato_id, 'canal_id', cv.canal_id,
                                'departamento_id', cv.departamento_id)
        from public.nx_conversas cv
       where cv.cliente_id = p_cliente and not cv.oculta
         and (p_gat <> 'conversa_resolvida' or cv.status = 'resolvida')
         and (v_canal is null or cv.canal_id = v_canal) and (v_dep is null or cv.departamento_id = v_dep)
       order by cv.ultima_msg_em desc, cv.id desc
       limit p_lim;
  elsif p_gat = 'mensagem_recebida' then
    return query
      select jsonb_build_object('conversa_id', m.conversa_id, 'contato_id', m.contato_id, 'canal_id', m.canal_id,
                                'mensagem_id', m.id, 'texto', left(m.corpo, 500))
        from public.nx_mensagens m
       where m.cliente_id = p_cliente and m.direcao = 'in' and m.tipo not in ('sistema', 'nota')
         and (v_canal is null or m.canal_id = v_canal)
       order by m.id desc
       limit p_lim;
  elsif p_gat = 'tarefa_vencida' then
    return query
      select jsonb_build_object('tarefa_id', t.id, 'negocio_id', t.negocio_id, 'contato_id', t.contato_id)
        from public.nx_tarefas t
       where t.cliente_id = p_cliente and t.concluida_em is null
       order by t.vence_em nulls last, t.id
       limit p_lim;
  elsif p_gat = 'etiqueta_adicionada' then
    return query
      select jsonb_build_object('contato_id', k.id, 'etiqueta_id', v_etq, 'alvo', 'contato')
        from public.nx_contatos k
       where k.cliente_id = p_cliente and v_etq is not null and k.etiquetas @> array[v_etq]
       order by k.id desc
       limit p_lim;
  else
    -- apos_data com a data da consulta olha qualquer status (o motor também); os demais, o status do próprio gatilho
    v_status := case when p_gat = 'negocio_ganho' then 'ganho' when p_gat = 'negocio_perdido' then 'perdido'
                     when p_gat = 'apos_data' and c ->> 'campo' is distinct from 'previsao_fechamento' then null
                     else 'aberto' end;
    return query
      select jsonb_build_object('negocio_id', l.id, 'contato_id', l.contato_id, 'funil_id', l.funil_id, 'estagio_para', l.estagio_id)
        from public.nx_leads l
       where l.cliente_id = p_cliente and (v_status is null or l.status = v_status)
         and (v_funil is null or l.funil_id = v_funil)
         and (v_est is null or l.estagio_id = v_est)
         and (p_gat not in ('antes_da_data', 'apos_data')
              or (case when c ->> 'campo' = 'previsao_fechamento' then l.previsao_fechamento is not null
                       else (l.consulta_em is not null or l.data_consulta is not null) end))
       order by l.atualizado_em desc, l.id desc
       limit p_lim;
  end if;
end $$;

-- ------------------------------------------------------------
-- 5. Execução dos passos (ações) — a partir do passo p_inicio
--    Devolve jsonb {detalhe, passos[], proximo, esperar_min, cancelar_se_responder, parou, pedido, alvo, total}:
--      proximo     = índice (0 = a primeira) da próxima ação quando a sequência PAROU para esperar / pedir à IA; senão null
--      esperar_min = minutos de espera do passo «esperar»
--      pedido      = id do pedido à IA (nx_auto_ia_pedidos) quando a sequência aguarda uma decisão
--    p_sim = true: simulação (a chamada que usa é a nx_auto_simular, dentro de uma subtransação desfeita no fim):
--      esperar e IA não pausam, o alerta do gestor não é disparado.
--    Erro numa ação: relança com DETAIL 'acao:<n>:<tipo>' (quem chamou desfaz o trecho inteiro e grava o erro).
-- ------------------------------------------------------------
create or replace function public.nx_auto_passos(p_auto public.nx_automacoes, p_acoes jsonb, p_alvo jsonb,
                                                 p_inicio int default 0, p_sim boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c uuid := p_auto.cliente_id;
  v_alvo jsonb := coalesce(p_alvo, '{}'::jsonb);
  v_d jsonb; ac jsonb; i int; v_total int; v_tipo text; v_det text[] := '{}'; v_n0 int;
  v_neg bigint; v_ct bigint; v_cv bigint; v_conta uuid; v_id uuid; v_n int; v_quando timestamptz;
  v_txt text; v_titulo text; v_link text; v_ntipo text; v_nome text; v_funil uuid; v_novo bigint;
  v_pars jsonb; v_par text; v_raw text; v_ue timestamptz; v_canal uuid; v_fila bigint; v_optin boolean;
  e public.nx_estagios; t public.nx_templates;
  v_msg text; v_hint text; v_st text;
  v_conversa_primeiro boolean := p_auto.gatilho in ('conversa_nova', 'mensagem_recebida', 'sem_resposta', 'conversa_resolvida');
  v_pas jsonb := '[]'::jsonb; v_prox int; v_esp int; v_canc boolean := true; v_parou boolean := false; v_ped bigint;
  v_acum int := 0; v_ini int;
  v_modo text; v_dep uuid; v_rem boolean; v_campo text; v_tarefa text; v_tmp text; v_val jsonb; v_nome2 text;
  fk public.nx_campos;
begin
  v_total := jsonb_array_length(coalesce(p_acoes, '[]'::jsonb));
  for i in greatest(coalesce(p_inicio, 0), 0) + 1 .. v_total loop
    ac := p_acoes -> (i - 1);
    v_tipo := ac ->> 'tipo';
    v_n0 := cardinality(v_det);
    v_ini := v_acum;
    begin
      v_d := public.nx_auto_dados(v_c, v_alvo);
      v_neg := (v_d #>> '{negocio,id}')::bigint;
      v_ct := (v_d #>> '{contato,id}')::bigint;
      v_cv := case when coalesce(v_d #>> '{conversa,status}', 'resolvida') <> 'resolvida' then (v_d #>> '{conversa,id}')::bigint end;

      case v_tipo
      -- -------------------------------------------------- criar_tarefa
      when 'criar_tarefa' then
        v_conta := case ac ->> 'dono'
          when 'responsavel' then coalesce((v_d #>> '{negocio,dono_id}')::uuid, (v_d #>> '{conversa,atribuida_a}')::uuid, (v_d #>> '{contato,dono_id}')::uuid)
          when 'atendente' then coalesce((v_d #>> '{conversa,atribuida_a}')::uuid, (v_d #>> '{negocio,dono_id}')::uuid, (v_d #>> '{contato,dono_id}')::uuid)
          else public.nx_auto_uuid(ac ->> 'dono') end;
        if v_conta is not null and not exists (select 1 from public.nx_contas k where k.id = v_conta) then v_conta := null; end if;
        v_titulo := left(coalesce(nullif(btrim(public.nx_auto_texto(ac ->> 'titulo', v_d)), ''), 'Tarefa da automação'), 160);
        insert into public.nx_tarefas (cliente_id, tipo, titulo, vence_em, dono_id, contato_id, negocio_id, automacao_id)
        values (v_c, coalesce(nullif(ac ->> 'tipo_tarefa', ''), 'tarefa'), v_titulo,
                now() + make_interval(hours => coalesce(public.nx_auto_int(ac -> 'vence_em_horas'), 24)),
                v_conta, v_ct, v_neg, p_auto.id);
        v_det := v_det || ('tarefa «' || left(v_titulo, 60) || '» para '
                           || coalesce((select k.nome from public.nx_contas k where k.id = v_conta), 'ninguém (sem responsável)'));

      -- -------------------------------------------------- mover_estagio
      when 'mover_estagio' then
        if v_neg is null then
          v_det := v_det || 'mover etapa: pulado (sem negócio)'::text;
        else
          v_det := v_det || public.nx_auto_mover(v_c, p_auto.nome, v_neg, public.nx_auto_uuid(ac ->> 'estagio_id'));
        end if;

      -- -------------------------------------------------- mover_funil
      when 'mover_funil' then
        if v_neg is null then
          v_det := v_det || 'mover de funil: pulado (sem negócio)'::text;
        else
          v_funil := public.nx_auto_uuid(ac ->> 'funil_id');
          if v_funil is null or not exists (select 1 from public.nx_funis f where f.id = v_funil and f.cliente_id = v_c and f.ativo) then
            raise exception 'funil_invalido' using errcode = '22023', hint = 'nao_encontrado';
          end if;
          select f.nome into v_nome from public.nx_funis f where f.id = v_funil;
          v_id := public.nx_auto_uuid(ac ->> 'estagio_id');
          if v_id is not null then
            select * into e from public.nx_estagios s where s.id = v_id and s.funil_id = v_funil and s.cliente_id = v_c;
            if e.id is null then raise exception 'estagio_invalido' using errcode = '22023', hint = 'nao_encontrado'; end if;
          else
            select * into e from public.nx_estagios s where s.funil_id = v_funil and s.cliente_id = v_c and s.tipo = 'aberto'
             order by s.ordem limit 1;
            if e.id is null then raise exception 'estagio_invalido' using errcode = '22023', hint = 'funil_sem_etapa'; end if;
          end if;
          if v_id is null and (v_d #>> '{negocio,funil_id}')::uuid = v_funil then
            v_det := v_det || ('já estava no funil «' || v_nome || '»');
          else
            v_det := v_det || public.nx_auto_mover(v_c, p_auto.nome, v_neg, e.id);
          end if;
        end if;

      -- -------------------------------------------------- criar_negocio
      when 'criar_negocio' then
        if v_ct is null then
          v_det := v_det || 'criar negócio: pulado (sem contato)'::text;
        else
          select * into e from public.nx_estagios s where s.id = public.nx_auto_uuid(ac ->> 'estagio_id') and s.cliente_id = v_c;
          v_funil := coalesce(public.nx_auto_uuid(ac ->> 'funil_id'), e.funil_id,
                              (select f.id from public.nx_funis f where f.cliente_id = v_c and f.padrao limit 1));
          if v_funil is null or not exists (select 1 from public.nx_funis f where f.id = v_funil and f.cliente_id = v_c and f.ativo) then
            raise exception 'funil_invalido' using errcode = '22023', hint = 'nao_encontrado';
          end if;
          if e.id is not null and e.funil_id <> v_funil then e := null; end if;
          if e.id is null then
            select * into e from public.nx_estagios s where s.funil_id = v_funil and s.tipo = 'aberto' order by s.ordem limit 1;
          end if;
          select f.nome into v_nome from public.nx_funis f where f.id = v_funil;
          if exists (select 1 from public.nx_leads l where l.cliente_id = v_c and l.contato_id = v_ct
                        and l.funil_id = v_funil and l.status = 'aberto') then
            v_det := v_det || ('criar negócio: pulado (já tinha um aberto em «' || v_nome || '»)');
          else
            insert into public.nx_leads (cliente_id, contato_id, funil_id, estagio_id, titulo, origem, dono_id)
            values (v_c, v_ct, v_funil, e.id,
                    nullif(left(btrim(public.nx_auto_texto(ac ->> 'titulo', v_d)), 120), ''), 'manual',
                    coalesce((v_d #>> '{contato,dono_id}')::uuid, (v_d #>> '{conversa,atribuida_a}')::uuid))
            returning id into v_novo;
            v_alvo := v_alvo || jsonb_build_object('negocio_id', v_novo);
            v_det := v_det || ('negócio criado em «' || v_nome || '»');
          end if;
        end if;

      -- -------------------------------------------------- enviar_mensagem (fila; fora da janela = pulada)
      when 'enviar_mensagem' then
        v_optin := (v_d #>> '{contato,optin_marketing}')::boolean;
        v_canal := case when v_cv is not null then (v_d #>> '{conversa,canal_id}')::uuid end;
        -- canal CodeWords (aparelho, 20260929a_codewords.sql): sem conversa aberta, abre uma no canal
        -- CodeWords do contato; lá não existe janela de 24 h nem modelo da Meta
        if v_ct is not null and v_canal is null and not coalesce((v_d #>> '{contato,bloqueado}')::boolean, false) then
          v_canal := public.nx_codewords_canal_contato(v_c, v_ct);
          if v_canal is not null then
            v_cv := public.nx_auto_abrir_conversa(v_c, v_ct, v_canal, v_neg, p_auto.nome);
            v_alvo := v_alvo || jsonb_build_object('conversa_id', v_cv);
          end if;
        end if;
        if v_ct is null then
          v_det := v_det || 'mensagem: pulada (sem contato)'::text;
        elsif coalesce((v_d #>> '{contato,bloqueado}')::boolean, false) then
          v_det := v_det || 'mensagem: pulada (contato bloqueado)'::text;
        elsif v_cv is null or v_canal is null then
          v_det := v_det || 'mensagem: pulada (sem conversa aberta)'::text;
        else
          v_txt := btrim(public.nx_auto_texto(ac ->> 'texto', v_d));
          if v_txt = '' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'mensagem vazia'; end if;
          v_quando := public.nx_auto_quando(v_c, v_cv, p_auto.respeitar_horario);
          v_ue := (v_d #>> '{conversa,ultima_entrada_em}')::timestamptz;
          if exists (select 1 from public.nx_canais k where k.id = v_canal and k.provedor = 'codewords') then
            -- sem janela no aparelho; quem pediu para sair (SAIR) não recebe texto de automação
            v_ue := case when v_optin is false then null else 'infinity'::timestamptz end;
          end if;
          if v_ue is null or v_quando >= v_ue + interval '24 hours' then
            v_det := v_det || case when v_optin is false then 'mensagem: pulada (contato pediu para não receber)'
                                   else 'mensagem: pulada (fora da janela de 24 h)' end;
          else
            insert into public.nx_envios_fila (cliente_id, conversa_id, contato_id, canal_id, tipo, texto, origem, automacao_id, enviar_em)
            values (v_c, v_cv, v_ct, v_canal, 'texto', left(v_txt, 4096), 'automacao', p_auto.id, v_quando)
            returning id into v_fila;
            v_det := v_det || ('mensagem na fila' || case when v_quando > now() + interval '1 minute'
                                 then ' para ' || to_char(v_quando at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') else '' end);
          end if;
        end if;

      -- -------------------------------------------------- enviar_template (abre conversa se preciso)
      when 'enviar_template' then
        select * into t from public.nx_templates k where k.id = public.nx_auto_uuid(ac ->> 'template_id') and k.cliente_id = v_c;
        v_optin := (v_d #>> '{contato,optin_marketing}')::boolean;
        if t.id is null or upper(coalesce(t.status, '')) <> 'APPROVED' then
          raise exception 'template_invalido' using errcode = '22023', hint = 'o modelo não está aprovado';
        elsif v_ct is null then
          v_det := v_det || 'modelo: pulado (sem contato)'::text;
        elsif coalesce((v_d #>> '{contato,bloqueado}')::boolean, false) then
          v_det := v_det || 'modelo: pulado (contato bloqueado)'::text;
        elsif v_optin is false and upper(coalesce(t.categoria, '')) = 'MARKETING' then
          v_det := v_det || 'modelo: pulado (contato pediu para não receber)'::text;
        elsif coalesce(v_d #>> '{contato,wa_id}', v_d #>> '{contato,telefone}') is null then
          v_det := v_det || 'modelo: pulado (contato sem telefone)'::text;
        else
          v_pars := '[]'::jsonb; v_n := 0;
          for v_raw in select z from jsonb_array_elements_text(coalesce(ac -> 'parametros', '[]'::jsonb)) z loop
            v_n := v_n + 1;
            v_par := btrim(public.nx_auto_texto(v_raw, v_d));
            if v_par = '' then
              raise exception 'template_invalido' using errcode = '22023',
                hint = case when v_raw like '%{hora_consulta}%' then 'a hora da consulta não está marcada'
                            when v_raw like '%{data_consulta}%' then 'a data da consulta não está marcada'
                            else 'o parâmetro ' || v_n || ' ficou vazio' end;
            end if;
            v_pars := v_pars || to_jsonb(left(v_par, 1000));
          end loop;
          if v_n <> coalesce(t.num_parametros, 0) then
            raise exception 'template_invalido' using errcode = '22023', hint = 'o modelo pede ' || coalesce(t.num_parametros, 0) || ' parâmetros';
          end if;
          v_canal := t.canal_id;
          if v_cv is not null and (v_d #>> '{conversa,canal_id}')::uuid = v_canal then
            v_id := null;  -- usa a conversa do alvo
          else
            v_cv := public.nx_auto_abrir_conversa(v_c, v_ct, v_canal, v_neg, p_auto.nome);
          end if;
          v_quando := public.nx_auto_quando(v_c, v_cv, p_auto.respeitar_horario);
          v_txt := coalesce(t.corpo, '');
          for v_n in 1 .. jsonb_array_length(v_pars) loop
            v_txt := replace(v_txt, '{{' || v_n || '}}', v_pars ->> (v_n - 1));
          end loop;
          insert into public.nx_envios_fila (cliente_id, conversa_id, contato_id, canal_id, tipo, template, origem, automacao_id, enviar_em)
          values (v_c, v_cv, v_ct, v_canal, 'template',
                  jsonb_build_object('template_id', t.id, 'nome', t.nome, 'idioma', t.idioma, 'categoria', t.categoria,
                                     'parametros', v_pars, 'corpo', left(v_txt, 4096)),
                  'automacao', p_auto.id, v_quando)
          returning id into v_fila;
          v_alvo := v_alvo || jsonb_build_object('conversa_id', v_cv);
          v_det := v_det || ('modelo «' || t.nome || '» na fila' || case when v_quando > now() + interval '1 minute'
                               then ' para ' || to_char(v_quando at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') else '' end);
        end if;

      -- -------------------------------------------------- atribuir
      when 'atribuir' then
        if coalesce(ac ->> 'dono', '') <> '' then
          -- contrato novo: dono = rodizio | conta | departamento. Vale para o RESPONSÁVEL do negócio e para o
          -- ATENDENTE da conversa aberta (o que existir). Rodízio explícito: quem recebeu há mais tempo.
          v_modo := ac ->> 'dono';
          v_dep := public.nx_auto_uuid(ac ->> 'departamento_id');
          if v_dep is not null and not exists (select 1 from public.nx_departamentos d where d.id = v_dep and d.cliente_id = v_c) then
            raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
          end if;
          if v_neg is null and v_cv is null then
            v_det := v_det || 'atribuir: pulado (sem negócio nem conversa)'::text;
          elsif v_modo = 'departamento' and v_cv is null then
            v_det := v_det || 'atribuir: pulado (sem conversa aberta para mudar de departamento)'::text;
          else
            v_tmp := null;
            if v_cv is not null and v_dep is not null then
              select d.nome into v_nome from public.nx_departamentos d where d.id = v_dep;
              if (v_d #>> '{conversa,departamento_id}')::uuid is distinct from v_dep then
                update public.nx_conversas set departamento_id = v_dep, atualizado_em = now() where id = v_cv;
                perform public.nx_auto_sistema(v_cv, 'Movida para o departamento ' || coalesce(v_nome, '') || ' pela automação «' || p_auto.nome || '»');
              end if;
              v_tmp := 'conversa em «' || coalesce(v_nome, 'departamento') || '»';
            end if;
            v_conta := null;
            if v_modo = 'conta' then
              v_conta := public.nx_auto_uuid(ac ->> 'conta_id');
              if not public.nx_auto_ref_ok(v_c, 'conta', v_conta) then
                raise exception 'dados_invalidos' using errcode = '22023', hint = 'a pessoa não tem mais acesso';
              end if;
            elsif v_modo = 'rodizio' then
              v_conta := public.nx_auto_proximo(v_c, coalesce(v_dep, (v_d #>> '{conversa,departamento_id}')::uuid));
            elsif exists (select 1 from public.nx_departamentos d where d.id = v_dep and d.distribuicao = 'rodizio') then
              v_conta := public.nx_auto_proximo(v_c, v_dep);
            end if;
            if v_conta is null then
              v_det := v_det || coalesce(v_tmp, case when v_modo = 'rodizio' then 'rodízio: ninguém disponível (equipe sem acesso)'
                                                      else 'atribuir: nada a mudar' end);
            else
              select k.nome into v_nome from public.nx_contas k where k.id = v_conta;
              v_nome2 := coalesce(nullif(btrim(v_d #>> '{contato,nome}'), ''), 'contato');
              if v_neg is not null and (v_d #>> '{negocio,dono_id}')::uuid is distinct from v_conta then
                update public.nx_leads set dono_id = v_conta, atualizado_em = now() where id = v_neg and cliente_id = v_c;
                if v_cv is null then
                  perform public.nx_notificar(v_c, v_conta, 'atribuida',
                    left(coalesce(nullif(btrim(v_d #>> '{negocio,titulo}'), ''), nullif(btrim(v_d #>> '{negocio,nome}'), ''),
                                  nullif(btrim(v_d #>> '{contato,nome}'), ''), 'Negócio') || ' atribuído a você', 120),
                    'Pela automação «' || p_auto.nome || '»', '#/crm/negocio/' || v_neg);
                end if;
              end if;
              if v_cv is not null and (v_d #>> '{conversa,atribuida_a}')::uuid is distinct from v_conta then
                update public.nx_conversas set atribuida_a = v_conta, atualizado_em = now() where id = v_cv;
                perform public.nx_auto_sistema(v_cv, 'Atribuída a ' || coalesce(v_nome, 'atendente') || ' pela automação «' || p_auto.nome || '»');
                perform public.nx_notificar(v_c, v_conta, 'atribuida',
                  left('Conversa com ' || v_nome2 || ' atribuída a você', 120),
                  'Pela automação «' || p_auto.nome || '»', '#/conversas/' || v_cv);
              end if;
              update public.nx_acessos set ultima_atribuicao_em = clock_timestamp() where conta_id = v_conta and cliente_id = v_c;
              v_det := v_det || ('atribuído a ' || coalesce(v_nome, 'atendente')
                                 || case when v_neg is not null and v_cv is not null then ' (negócio e conversa)'
                                         when v_neg is not null then ' (negócio)' else ' (conversa)' end
                                 || coalesce(' · ' || v_tmp, ''));
            end if;
          end if;
        else
          -- contrato antigo (modo = rodizio | conta): só a conversa
          if v_cv is null then
            v_det := v_det || 'atribuir: pulado (sem conversa aberta)'::text;
          else
            v_id := public.nx_auto_uuid(ac ->> 'departamento_id');
            if v_id is not null then
              if not exists (select 1 from public.nx_departamentos d where d.id = v_id and d.cliente_id = v_c) then
                raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
              end if;
              update public.nx_conversas set departamento_id = v_id, atualizado_em = now() where id = v_cv and departamento_id is distinct from v_id;
            end if;
            if ac ->> 'modo' = 'conta' then
              v_conta := public.nx_auto_uuid(ac ->> 'conta_id');
              if not public.nx_auto_ref_ok(v_c, 'conta', v_conta) then
                raise exception 'dados_invalidos' using errcode = '22023', hint = 'a pessoa não tem mais acesso';
              end if;
              if (v_d #>> '{conversa,atribuida_a}')::uuid is distinct from v_conta then
                update public.nx_conversas set atribuida_a = v_conta, atualizado_em = now() where id = v_cv;
                update public.nx_acessos set ultima_atribuicao_em = now() where conta_id = v_conta and cliente_id = v_c;
                select k.nome into v_nome from public.nx_contas k where k.id = v_conta;
                perform public.nx_auto_sistema(v_cv, 'Atribuída a ' || coalesce(v_nome, 'atendente') || ' pela automação «' || p_auto.nome || '»');
                perform public.nx_notificar(v_c, v_conta, 'atribuida',
                  left('Conversa com ' || coalesce(nullif(v_d #>> '{contato,nome}', ''), 'contato') || ' atribuída a você', 120),
                  'Pela automação «' || p_auto.nome || '»', '#/conversas/' || v_cv);
              end if;
              v_det := v_det || ('atribuída a ' || coalesce((select k.nome from public.nx_contas k where k.id = v_conta), 'atendente'));
            else
              if to_regprocedure('public.nx_cv_distribuir(bigint)') is null then
                raise exception 'rodizio_indisponivel' using errcode = '22023';
              end if;
              v_conta := public.nx_cv_distribuir(v_cv);
              v_det := v_det || case when v_conta is null then 'rodízio: ninguém disponível (departamento sem rodízio ou equipe sem acesso)'
                                     else 'atribuída a ' || coalesce((select k.nome from public.nx_contas k where k.id = v_conta), 'atendente') end;
            end if;
          end if;
        end if;

      -- -------------------------------------------------- etiquetar
      when 'etiquetar' then
        v_id := public.nx_auto_uuid(ac ->> 'etiqueta_id');
        select k.nome into v_nome from public.nx_etiquetas k where k.id = v_id and k.cliente_id = v_c;
        if v_nome is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'a etiqueta não existe mais'; end if;
        if ac ->> 'alvo' = 'conversa' then
          if v_cv is null then
            v_det := v_det || 'etiqueta: pulada (sem conversa aberta)'::text;
          else
            update public.nx_conversas set
              etiquetas = case when coalesce((ac ->> 'remover')::boolean, false) then array_remove(etiquetas, v_id)
                               when v_id = any(etiquetas) then etiquetas else etiquetas || v_id end,
              atualizado_em = now()
             where id = v_cv;
            v_det := v_det || (case when coalesce((ac ->> 'remover')::boolean, false) then 'etiqueta «' || v_nome || '» tirada da conversa'
                                    else 'etiqueta «' || v_nome || '» na conversa' end);
          end if;
        else
          if v_ct is null then
            v_det := v_det || 'etiqueta: pulada (sem contato)'::text;
          else
            update public.nx_contatos set
              etiquetas = case when coalesce((ac ->> 'remover')::boolean, false) then array_remove(etiquetas, v_id)
                               when v_id = any(etiquetas) then etiquetas else etiquetas || v_id end
             where id = v_ct and cliente_id = v_c;
            v_det := v_det || (case when coalesce((ac ->> 'remover')::boolean, false) then 'etiqueta «' || v_nome || '» tirada do contato'
                                    else 'etiqueta «' || v_nome || '» no contato' end);
          end if;
        end if;

      -- -------------------------------------------------- etiqueta_adicionar / etiqueta_remover
      -- no NEGÓCIO (se houver) ou, sem negócio, no contato
      when 'etiqueta_adicionar', 'etiqueta_remover' then
        v_id := public.nx_auto_uuid(ac ->> 'etiqueta_id');
        select k.nome into v_nome from public.nx_etiquetas k where k.id = v_id and k.cliente_id = v_c;
        if v_nome is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'a etiqueta não existe mais'; end if;
        v_rem := v_tipo = 'etiqueta_remover';
        if v_neg is not null then
          update public.nx_leads set
            etiquetas = case when v_rem then array_remove(etiquetas, v_id)
                             when v_id = any(etiquetas) then etiquetas else etiquetas || v_id end,
            atualizado_em = now()
           where id = v_neg and cliente_id = v_c;
          v_det := v_det || (case when v_rem then 'etiqueta «' || v_nome || '» tirada do negócio'
                                  else 'etiqueta «' || v_nome || '» no negócio' end);
        elsif v_ct is not null then
          update public.nx_contatos set
            etiquetas = case when v_rem then array_remove(etiquetas, v_id)
                             when v_id = any(etiquetas) then etiquetas else etiquetas || v_id end
           where id = v_ct and cliente_id = v_c;
          v_det := v_det || (case when v_rem then 'etiqueta «' || v_nome || '» tirada do contato'
                                  else 'etiqueta «' || v_nome || '» no contato' end);
        else
          v_det := v_det || 'etiqueta: pulada (sem negócio nem contato)'::text;
        end if;

      -- -------------------------------------------------- campo_atualizar
      -- campo personalizado do contato ou do negócio (nx_campos) ou o «score» (0–100) do negócio
      when 'campo_atualizar' then
        v_campo := btrim(coalesce(ac ->> 'campo', ''));
        select * into fk from public.nx_campos k
         where k.cliente_id = v_c and k.chave = v_campo and k.ativo and k.entidade in ('contato', 'negocio')
         order by (k.entidade = 'contato') desc limit 1;
        if fk.id is null and v_campo <> 'score' then
          raise exception 'dados_invalidos' using errcode = '22023', hint = 'o campo não existe mais';
        end if;
        v_txt := left(btrim(public.nx_auto_texto(ac ->> 'valor', v_d)), 200);
        if v_txt = '' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'o valor ficou vazio'; end if;
        if fk.id is null then            -- score
          if v_txt !~ '^[0-9]{1,3}$' or v_txt::int > 100 then
            raise exception 'dados_invalidos' using errcode = '22023', hint = 'o score vai de 0 a 100';
          end if;
          v_val := to_jsonb(v_txt::int);
        else
          v_val := case fk.tipo
            when 'numero' then case when replace(v_txt, ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then to_jsonb(replace(v_txt, ',', '.')::numeric) end
            when 'moeda' then case when replace(v_txt, ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then to_jsonb(replace(v_txt, ',', '.')::numeric) end
            when 'sim_nao' then case when lower(v_txt) in ('sim', 'true', '1', 's') then 'true'::jsonb
                                     when lower(v_txt) in ('nao', 'não', 'false', '0', 'n') then 'false'::jsonb end
            when 'data' then case when v_txt ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then to_jsonb(v_txt)
                                  when v_txt ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
                                    then to_jsonb(substr(v_txt, 7, 4) || '-' || substr(v_txt, 4, 2) || '-' || substr(v_txt, 1, 2)) end
            when 'opcao' then (select to_jsonb(o) from unnest(fk.opcoes) o where public.nx_auto_norm(o) = public.nx_auto_norm(v_txt) limit 1)
            when 'multi' then null
            else to_jsonb(v_txt) end;
          if v_val is null then
            raise exception 'dados_invalidos' using errcode = '22023',
              hint = case fk.tipo when 'numero' then 'o valor não é um número' when 'moeda' then 'o valor não é um número'
                                  when 'sim_nao' then 'o valor precisa ser sim ou não' when 'data' then 'a data precisa ser AAAA-MM-DD ou DD/MM/AAAA'
                                  when 'opcao' then 'o valor não está entre as opções do campo'
                                  else 'esse tipo de campo não pode ser preenchido por automação' end;
          end if;
        end if;
        if fk.id is null or fk.entidade = 'negocio' then
          if v_neg is null then
            v_det := v_det || 'campo: pulado (sem negócio)'::text;
          else
            update public.nx_leads set campos = coalesce(campos, '{}'::jsonb) || jsonb_build_object(v_campo, v_val), atualizado_em = now()
             where id = v_neg and cliente_id = v_c;
            v_det := v_det || ('campo «' || v_campo || '» = ' || (v_val #>> '{}'));
          end if;
        else
          if v_ct is null then
            v_det := v_det || 'campo: pulado (sem contato)'::text;
          else
            update public.nx_contatos set campos = coalesce(campos, '{}'::jsonb) || jsonb_build_object(v_campo, v_val), atualizado_em = now()
             where id = v_ct and cliente_id = v_c;
            v_det := v_det || ('campo «' || v_campo || '» = ' || (v_val #>> '{}'));
          end if;
        end if;

      -- -------------------------------------------------- nota (histórico do negócio, ou do contato)
      when 'nota' then
        v_txt := left(btrim(public.nx_auto_texto(ac ->> 'texto', v_d)), 1000);
        if v_txt = '' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'a nota ficou vazia'; end if;
        if v_ct is null and v_neg is null then
          v_det := v_det || 'nota: pulada (sem contato nem negócio)'::text;
        else
          insert into public.nx_notas (cliente_id, contato_id, negocio_id, autor_id, texto)
          values (v_c, v_ct, v_neg, null, 'Automação «' || p_auto.nome || '»: ' || v_txt);
          v_det := v_det || ('nota «' || left(v_txt, 60) || case when char_length(v_txt) > 60 then '…' else '' end || '»');
        end if;

      -- -------------------------------------------------- notificar
      when 'notificar' then
        v_ntipo := case p_auto.gatilho when 'sem_resposta' then 'sem_resposta' when 'tarefa_vencida' then 'tarefa' else 'automacao' end;
        v_link := case
          when p_auto.gatilho = 'conversa_resolvida' and (v_d #>> '{conversa,id}') is not null then '#/conversas/' || (v_d #>> '{conversa,id}')
          when v_conversa_primeiro and v_cv is not null then '#/conversas/' || v_cv
          when v_neg is not null then '#/crm/negocio/' || v_neg
          when v_cv is not null then '#/conversas/' || v_cv
          when v_ct is not null then '#/contatos/' || v_ct
          when p_auto.gatilho = 'tarefa_vencida' then '#/tarefas' end;
        -- título e detalhe; só o texto (sem título) vira o título
        v_titulo := nullif(btrim(public.nx_auto_texto(ac ->> 'titulo', v_d)), '');
        v_txt := nullif(left(btrim(public.nx_auto_texto(ac ->> 'texto', v_d)), 500), '');
        if v_titulo is null and v_txt is not null then
          v_titulo := left(v_txt, 120);
          if char_length(v_txt) <= 120 then v_txt := null; end if;
        end if;
        v_titulo := left(coalesce(v_titulo, p_auto.nome), 120);
        if ac ->> 'para' = 'departamento' then
          v_dep := public.nx_auto_uuid(ac ->> 'departamento_id');
          if v_dep is null or not exists (select 1 from public.nx_departamentos d where d.id = v_dep and d.cliente_id = v_c) then
            raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
          end if;
          v_n := 0;
          for v_conta in
            select a.conta_id from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
             where a.cliente_id = v_c and k.aprovado and a.papel in ('atendente', 'supervisor', 'admin')
               and (cardinality(a.departamentos) = 0 or v_dep = any(a.departamentos))
          loop
            v_n := v_n + public.nx_notificar(v_c, v_conta, v_ntipo, v_titulo, v_txt, v_link);
          end loop;
          if v_n = 0 then v_n := public.nx_notificar(v_c, null, v_ntipo, v_titulo, v_txt, v_link); end if;
          v_conta := null;
          v_det := v_det || case when v_n = 0 then 'aviso: ninguém recebeu (sem pessoa com acesso)'
                                 when v_n = 1 then 'aviso para 1 pessoa do departamento'
                                 else 'aviso para ' || v_n || ' pessoas do departamento' end;
        else
          v_conta := case ac ->> 'para'
            when 'responsavel' then coalesce((v_d #>> '{negocio,dono_id}')::uuid, (v_d #>> '{conversa,atribuida_a}')::uuid, (v_d #>> '{contato,dono_id}')::uuid)
            when 'admins' then null
            else public.nx_auto_uuid(ac ->> 'para') end;
          v_n := public.nx_notificar(v_c, v_conta, v_ntipo, v_titulo, v_txt, v_link);
          -- responsável sem acesso ao cliente (ou sem responsável: v_conta nulo já vai aos admins) → admins
          if v_n = 0 and v_conta is not null and ac ->> 'para' = 'responsavel' then
            v_conta := null;
            v_n := public.nx_notificar(v_c, null, v_ntipo, v_titulo, v_txt, v_link);
          end if;
          v_det := v_det || case
            when v_n = 0 then 'aviso: ninguém recebeu (sem pessoa com acesso)'
            when v_conta is not null then 'aviso para ' || coalesce((select k.nome from public.nx_contas k where k.id = v_conta), 'a pessoa')
            when v_n = 1 then 'aviso para 1 pessoa'
            else 'aviso para ' || v_n || ' pessoas' end;
        end if;

      -- -------------------------------------------------- resolver_conversa
      when 'resolver_conversa' then
        if v_cv is null then
          v_det := v_det || 'resolver: pulado (sem conversa aberta)'::text;
        else
          update public.nx_conversas set status = 'resolvida', resolvida_em = now(), aguardando = false, atualizado_em = now()
           where id = v_cv and status <> 'resolvida';
          perform public.nx_auto_sistema(v_cv, 'Atendimento ' || coalesce(v_d #>> '{conversa,protocolo}', '') || ' resolvido pela automação «' || p_auto.nome || '»');
          v_det := v_det || 'conversa resolvida'::text;
        end if;

      -- -------------------------------------------------- alerta_whatsapp (P1: depende do modo alerta da nx-enviar, F2)
      -- só a agência (gestor/super) salva esta ação (nx_automacao_salvar) e ela tem teto por hora:
      -- sai pelo número da Nexus para o WhatsApp do gestor — uma automação de "mensagem recebida"
      -- não pode virar enxurrada nesse número
      when 'alerta_whatsapp' then
        if p_sim then
          v_det := v_det || 'alerta ao WhatsApp do gestor (na simulação não é enviado)'::text;
        -- execuções ok desta automação na última hora que não pularam o alerta (o detalhe pode vir cortado)
        elsif (select count(*) from public.nx_auto_execucoes x
             where x.automacao_id = p_auto.id and x.criado_em > now() - interval '1 hour' and x.ok
               and x.detalhe not like '%alerta: pulado%' and x.detalhe <> 'Condições não atendidas — nada feito.') >= 20 then
          v_det := v_det || 'alerta: pulado (limite de 20 por hora desta automação)'::text;
        else
          v_txt := left(btrim(public.nx_auto_texto(ac ->> 'texto', v_d)), 1000);
          perform public.nx_disparar('nx-enviar', jsonb_build_object('alerta', jsonb_build_object('cliente', v_c, 'texto', v_txt)));
          v_det := v_det || 'alerta pedido ao WhatsApp do gestor'::text;
        end if;

      -- -------------------------------------------------- esperar (passo de sequência)
      when 'esperar' then
        v_esp := public.nx_auto_int(ac -> 'minutos');
        if v_esp is null or v_esp not between 1 and 43200 then
          raise exception 'dados_invalidos' using errcode = '22023', hint = 'o tempo de espera vai de 1 a 43200 minutos';
        end if;
        v_canc := coalesce(ac ->> 'cancelar_se_cliente_responder', 'true') <> 'false';
        v_det := v_det || ('aguarda ' || public.nx_auto_dur(v_esp) || case when v_canc then ' (para se o cliente responder)' else '' end);
        if p_sim then
          v_acum := v_acum + v_esp;
        elsif i < v_total then
          v_prox := i;      -- índice (0 = a primeira) da próxima ação
        end if;

      -- -------------------------------------------------- parar (encerra a sequência deste alvo)
      when 'parar' then
        v_parou := true;
        v_det := v_det || 'sequência encerrada aqui'::text;

      -- -------------------------------------------------- ia_decidir (a nx-ia responde; o resultado é aplicado por nx_auto_ia_resolver)
      when 'ia_decidir' then
        v_tarefa := ac ->> 'tarefa';
        if v_tarefa is null or v_tarefa not in ('classificar_etapa', 'resumir_nota', 'pontuar_lead') then
          raise exception 'dados_invalidos' using errcode = '22023', hint = 'a tarefa da IA';
        end if;
        v_tmp := case v_tarefa when 'classificar_etapa' then 'classificar a etapa' when 'resumir_nota' then 'resumir a conversa'
                               else 'pontuar o lead' end;
        if p_sim then
          v_det := v_det || case v_tarefa
            when 'classificar_etapa' then 'a IA escolheria a etapa'
              || coalesce(' entre: ' || (select string_agg(s.nome, ', ' order by s.ordem) from public.nx_estagios s
                                          where s.cliente_id = v_c and s.funil_id = (v_d #>> '{negocio,funil_id}')::uuid and s.tipo <> 'ganho'), '')
            when 'resumir_nota' then 'a IA escreveria um resumo da conversa como nota'
            else 'a IA daria uma nota de 0 a 100 ao lead' end;
        elsif not public.nx_auto_ia_ligada() then
          v_det := v_det || 'IA: pulado (a IA ainda não está configurada)'::text;
        elsif public.nx_limite(v_c, 'ia_mes') is not null and public.nx_uso(v_c, 'ia_mes') >= public.nx_limite(v_c, 'ia_mes') then
          v_det := v_det || 'IA: pulado (a cota de IA do mês acabou)'::text;
        elsif v_tarefa in ('classificar_etapa', 'pontuar_lead') and v_neg is null then
          v_det := v_det || 'IA: pulado (sem negócio)'::text;
        elsif v_tarefa = 'classificar_etapa' and coalesce(v_d #>> '{negocio,status}', 'aberto') <> 'aberto' then
          v_det := v_det || 'IA: pulado (o negócio já está fechado)'::text;
        elsif v_tarefa = 'resumir_nota' and (v_ct is null or not exists (
                select 1 from public.nx_mensagens m where m.cliente_id = v_c and m.contato_id = v_ct and m.tipo not in ('nota', 'sistema'))) then
          v_det := v_det || 'IA: pulado (sem conversa para resumir)'::text;
        elsif exists (select 1 from public.nx_auto_ia_pedidos q
                       where q.automacao_id = p_auto.id and q.tarefa = v_tarefa and q.status in ('pendente', 'processando')
                         and q.alvo ->> 'negocio_id' is not distinct from v_neg::text
                         and q.alvo ->> 'contato_id' is not distinct from v_ct::text) then
          v_det := v_det || 'IA: pulado (já está em análise)'::text;
        elsif (select count(*) from public.nx_auto_ia_pedidos q where q.cliente_id = v_c and q.status in ('pendente', 'processando')) >= 200 then
          v_det := v_det || 'IA: pulado (fila de decisões cheia)'::text;
        else
          insert into public.nx_auto_ia_pedidos (cliente_id, automacao_id, tarefa, instrucao, alvo)
          values (v_c, p_auto.id, v_tarefa, nullif(left(btrim(coalesce(ac ->> 'instrucao', '')), 500), ''),
                  jsonb_strip_nulls(jsonb_build_object('negocio_id', v_neg, 'contato_id', v_ct, 'conversa_id', (v_d #>> '{conversa,id}')::bigint)))
          returning id into v_ped;
          v_det := v_det || ('IA pedida: ' || v_tmp);
          v_prox := i;      -- a sequência espera a resposta da IA (mesmo que seja o último passo)
        end if;

      else
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'ação desconhecida';
      end case;
    exception when others then
      get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint, v_st = returned_sqlstate;
      raise exception using message = v_msg, hint = coalesce(v_hint, ''), detail = 'acao:' || i || ':' || coalesce(v_tipo, '?'), errcode = v_st;
    end;

    v_tmp := case when cardinality(v_det) > v_n0 then array_to_string(v_det[v_n0 + 1 : cardinality(v_det)], ' · ') else '' end;
    v_pas := v_pas || jsonb_build_array(jsonb_build_object('n', i, 'tipo', v_tipo, 'texto', v_tmp,
               'pulado', position('pulad' in lower(v_tmp)) > 0, 'depois_min', v_ini));
    exit when v_prox is not null or v_parou;
  end loop;
  return jsonb_build_object('detalhe', array_to_string(v_det, ' · '), 'passos', v_pas, 'proximo', v_prox,
                            'esperar_min', v_esp, 'cancelar_se_responder', v_canc, 'parou', v_parou,
                            'pedido', v_ped, 'alvo', v_alvo, 'total', v_total);
end $$;

-- compatível com quem chamava a versão antiga (a sequência com esperar/IA é tratada por nx_auto_rodar)
create or replace function public.nx_auto_acoes(p_auto public.nx_automacoes, p_alvo jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.nx_auto_passos(p_auto, p_auto.acoes, p_alvo, 0, false) ->> 'detalhe';
end $$;

-- ------------------------------------------------------------
-- 6. Rodar uma automação para UM alvo (com sequências) e continuar quem estava esperando
-- ------------------------------------------------------------

-- etapa atual do negócio do alvo (null sem negócio). A sequência guarda a etapa de quando PAROU: se outra pessoa
-- mover o negócio enquanto ela espera, as automações de etapa (negocio_estagio / tempo_no_estagio) não falam mais com ele.
create or replace function public.nx_auto_estagio_do_alvo(p_cliente uuid, p_alvo jsonb)
returns uuid
language sql stable
security definer
set search_path = ''
as $$
  select l.estagio_id from public.nx_leads l
   where l.id = case when (p_alvo ->> 'negocio_id') ~ '^[0-9]{1,18}$' then (p_alvo ->> 'negocio_id')::bigint end
     and l.cliente_id = p_cliente;
$$;

-- roda UMA automação para UM alvo, com dedupe pela chave. Devolve ok | erro | pulou | repetido | pendente.
-- p_tempo = gatilho de tempo: condição que não vale também grava a chave (senão o mesmo alvo
-- voltaria em toda rodada e tomaria a vez dos outros).
-- Passo «esperar» / decisão da IA: grava a execução como 'esperando' / 'aguardando_ia' e a sequência
-- (nx_auto_sequencias) com as ações que faltam; nx_auto_continuar a retoma.
create or replace function public.nx_auto_rodar(p_auto public.nx_automacoes, p_ref jsonb, p_chave text,
                                                p_evento bigint, p_prof int, p_tempo boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alvo jsonb; v_d jsonb; v_det text; v_quem text; v_r jsonb; v_estado text; v_total int; v_prox int;
  v_msg text; v_hint text; v_detalhe text;
begin
  if exists (select 1 from public.nx_auto_execucoes x where x.automacao_id = p_auto.id and x.chave = p_chave) then
    return 'repetido';
  end if;
  begin
    v_alvo := public.nx_auto_alvo(p_auto.cliente_id, p_ref);
    v_d := public.nx_auto_dados(p_auto.cliente_id, v_alvo);
    if not public.nx_auto_condicoes(p_auto.condicoes, v_d) then
      if p_tempo then
        insert into public.nx_auto_execucoes (automacao_id, cliente_id, evento_id, chave, ok, detalhe)
        values (p_auto.id, p_auto.cliente_id, p_evento, p_chave, true, 'Condições não atendidas — nada feito.')
        on conflict (automacao_id, chave) do nothing;
      end if;
      return 'pulou';
    end if;
    perform set_config('nx.automacao', p_auto.id::text, true);
    perform set_config('nx.profundidade', (coalesce(p_prof, 0) + 1)::text, true);
    v_r := public.nx_auto_passos(p_auto, p_auto.acoes, v_alvo, 0, false);
    v_det := v_r ->> 'detalhe';
    v_alvo := v_r -> 'alvo';
    v_total := (v_r ->> 'total')::int;
    v_prox := (v_r ->> 'proximo')::int;
    v_quem := coalesce(nullif(btrim(v_d #>> '{contato,nome}'), ''), nullif(btrim(v_d #>> '{negocio,nome}'), ''),
                       nullif(btrim(v_d #>> '{tarefa,titulo}'), ''));
    v_estado := case when (v_r ->> 'pedido') is not null then 'aguardando_ia'
                     when v_prox is not null then 'esperando'
                     when coalesce((v_r ->> 'parou')::boolean, false) then 'parada'
                     else 'concluida' end;
    insert into public.nx_auto_execucoes (automacao_id, cliente_id, evento_id, chave, ok, detalhe, estado, passo, total_passos, atualizado_em)
    values (p_auto.id, p_auto.cliente_id, p_evento, p_chave, true,
            left(coalesce(v_quem || ': ', '') || coalesce(nullif(v_det, ''), 'nada a fazer'), 1000),
            v_estado, coalesce(v_prox, v_total), v_total, now())
    on conflict (automacao_id, chave) do nothing;
    if v_estado in ('esperando', 'aguardando_ia') then
      insert into public.nx_auto_sequencias (automacao_id, cliente_id, chave, contato_id, alvo, acoes, passo, continuar_em,
                                             cancelar_se_responder, pedido_id, status, profundidade, estagio_ref)
      values (p_auto.id, p_auto.cliente_id, p_chave, nullif(v_alvo ->> 'contato_id', '')::bigint, v_alvo, p_auto.acoes,
              coalesce(v_prox, v_total),
              case when v_estado = 'esperando' then now() + make_interval(mins => (v_r ->> 'esperar_min')::int) end,
              coalesce((v_r ->> 'cancelar_se_responder')::boolean, true), (v_r ->> 'pedido')::bigint,
              v_estado, coalesce(p_prof, 0), public.nx_auto_estagio_do_alvo(p_auto.cliente_id, v_alvo))
      on conflict (automacao_id, chave) do nothing;
    end if;
    update public.nx_automacoes set execucoes = execucoes + 1, ultima_execucao_em = now() where id = p_auto.id;
    if (v_alvo ->> 'contato_id') is not null or (v_alvo ->> 'negocio_id') is not null then
      perform public.nx_historico_add(p_auto.cliente_id, 'automacao', (v_alvo ->> 'contato_id')::bigint,
        (v_alvo ->> 'negocio_id')::bigint, (v_alvo ->> 'conversa_id')::bigint,
        jsonb_build_object('automacao_id', p_auto.id, 'nome', p_auto.nome, 'detalhe', left(v_det, 500)));
    end if;
    perform set_config('nx.automacao', '', true);
    perform set_config('nx.profundidade', '', true);
    return 'ok';
  exception
    when lock_not_available then
      return 'pendente';
    when others then
      get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint, v_detalhe = pg_exception_detail;
      insert into public.nx_auto_execucoes (automacao_id, cliente_id, evento_id, chave, ok, detalhe, estado, atualizado_em)
      values (p_auto.id, p_auto.cliente_id, p_evento, p_chave, false,
              left(public.nx_auto_erro_texto(v_msg, v_hint, v_detalhe), 1000), 'erro', now())
      on conflict (automacao_id, chave) do nothing;
      update public.nx_automacoes set erros = erros + 1, ultima_execucao_em = now() where id = p_auto.id;
      return 'erro';
  end;
end $$;

-- retoma UMA sequência (chegou a hora, ou a IA respondeu): roda as ações que faltam.
-- Devolve ok | erro | cancelada | pendente.
create or replace function public.nx_auto_continuar(p_seq public.nx_auto_sequencias)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.nx_automacoes; v_alvo jsonb; v_r jsonb; v_det text; v_prox int; v_total int; v_estado text; v_erro text;
  v_msg text; v_hint text; v_detalhe text;
  v_neg bigint; v_nstatus text; v_nest uuid; v_motivo text;
begin
  select * into a from public.nx_automacoes x where x.id = p_seq.automacao_id;
  if a.id is null or not a.ativo then
    update public.nx_auto_sequencias set status = 'cancelada', motivo = 'a automação foi desligada', atualizado_em = now()
     where id = p_seq.id;
    update public.nx_auto_execucoes x set estado = 'cancelada', atualizado_em = now(),
           detalhe = left(coalesce(x.detalhe, '') || ' · cancelada: a automação foi desligada', 1000)
     where x.automacao_id = p_seq.automacao_id and x.chave = p_seq.chave;
    return 'cancelada';
  end if;
  -- o negócio mudou enquanto a sequência esperava? Quem fechou por telefone não pode receber «ficou alguma dúvida sobre o
  -- orçamento?». Nas automações de etapa (negocio_estagio / tempo_no_estagio) vale a ETAPA de quando a sequência parou
  -- (estagio_ref): ganhar ou perder é mudar de etapa, e a própria sequência pode mover o negócio sem se cancelar. Nas de
  -- negócio aberto sem etapa (negocio_criado, antes_da_data, agendado) vale o status. Automações de ganho/perdido, de
  -- conversa, de tarefa e de «depois da data» não passam por aqui.
  v_neg := case when (p_seq.alvo ->> 'negocio_id') ~ '^[0-9]{1,18}$' then (p_seq.alvo ->> 'negocio_id')::bigint end;
  if v_neg is not null and a.gatilho in ('negocio_criado', 'negocio_estagio', 'tempo_no_estagio', 'antes_da_data', 'agendado') then
    select l.status, l.estagio_id into v_nstatus, v_nest from public.nx_leads l
     where l.id = v_neg and l.cliente_id = p_seq.cliente_id;
    if not found then
      v_motivo := 'o negócio não existe mais';
    elsif a.gatilho in ('negocio_estagio', 'tempo_no_estagio') then
      if p_seq.estagio_ref is not null and v_nest is distinct from p_seq.estagio_ref then
        v_motivo := 'o negócio mudou de etapa';
      end if;
    elsif v_nstatus = 'ganho' then
      v_motivo := 'o negócio foi ganho';
    elsif v_nstatus = 'perdido' then
      v_motivo := 'o negócio foi perdido';
    end if;
    if v_motivo is not null then
      update public.nx_auto_sequencias set status = 'cancelada', motivo = v_motivo, pedido_id = null, atualizado_em = now()
       where id = p_seq.id;
      update public.nx_auto_execucoes x set estado = 'cancelada', atualizado_em = now(),
             detalhe = left(coalesce(x.detalhe, '') || ' · cancelada: ' || v_motivo, 1000)
       where x.automacao_id = p_seq.automacao_id and x.chave = p_seq.chave;
      return 'cancelada';
    end if;
  end if;
  begin
    perform set_config('nx.automacao', a.id::text, true);
    perform set_config('nx.profundidade', (coalesce(p_seq.profundidade, 0) + 1)::text, true);
    v_alvo := public.nx_auto_alvo(p_seq.cliente_id, p_seq.alvo);
    v_r := public.nx_auto_passos(a, p_seq.acoes, v_alvo, p_seq.passo, false);
    v_det := v_r ->> 'detalhe';
    v_alvo := v_r -> 'alvo';
    v_total := (v_r ->> 'total')::int;
    v_prox := (v_r ->> 'proximo')::int;
    v_estado := case when (v_r ->> 'pedido') is not null then 'aguardando_ia'
                     when v_prox is not null then 'esperando'
                     when coalesce((v_r ->> 'parou')::boolean, false) then 'parada'
                     else 'concluida' end;
    update public.nx_auto_execucoes x set estado = v_estado, passo = coalesce(v_prox, v_total), atualizado_em = now(),
           detalhe = left(coalesce(x.detalhe, '') || coalesce(' · ' || nullif(v_det, ''), ''), 1000)
     where x.automacao_id = p_seq.automacao_id and x.chave = p_seq.chave;
    update public.nx_auto_sequencias set
      alvo = v_alvo, atualizado_em = now(), passo = coalesce(v_prox, v_total),
      status = case v_estado when 'esperando' then 'esperando' when 'aguardando_ia' then 'aguardando_ia' else 'concluida' end,
      continuar_em = case when v_estado = 'esperando' then now() + make_interval(mins => (v_r ->> 'esperar_min')::int) end,
      cancelar_se_responder = case when v_estado = 'esperando' then coalesce((v_r ->> 'cancelar_se_responder')::boolean, true)
                                   else cancelar_se_responder end,
      estagio_ref = case when v_estado = 'esperando' then public.nx_auto_estagio_do_alvo(p_seq.cliente_id, v_alvo) else estagio_ref end,
      pedido_id = (v_r ->> 'pedido')::bigint,
      motivo = case when v_estado = 'parada' then 'a sequência foi encerrada pelo passo «parar»' else null end
     where id = p_seq.id;
    if (v_alvo ->> 'contato_id') is not null or (v_alvo ->> 'negocio_id') is not null then
      perform public.nx_historico_add(p_seq.cliente_id, 'automacao', (v_alvo ->> 'contato_id')::bigint,
        (v_alvo ->> 'negocio_id')::bigint, (v_alvo ->> 'conversa_id')::bigint,
        jsonb_build_object('automacao_id', a.id, 'nome', a.nome, 'detalhe', left(v_det, 500)));
    end if;
    perform set_config('nx.automacao', '', true);
    perform set_config('nx.profundidade', '', true);
    return 'ok';
  exception
    when lock_not_available then
      return 'pendente';
    when others then
      get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint, v_detalhe = pg_exception_detail;
      v_erro := public.nx_auto_erro_texto(v_msg, v_hint, v_detalhe);
      update public.nx_auto_sequencias set status = 'erro', motivo = left(v_erro, 300), pedido_id = null, atualizado_em = now()
       where id = p_seq.id;
      update public.nx_auto_execucoes x set ok = false, estado = 'erro', atualizado_em = now(),
             detalhe = left(coalesce(x.detalhe, '') || ' · ' || v_erro, 1000)
       where x.automacao_id = p_seq.automacao_id and x.chave = p_seq.chave;
      update public.nx_automacoes set erros = erros + 1, ultima_execucao_em = now() where id = a.id;
      return 'erro';
  end;
end $$;

-- ------------------------------------------------------------
-- 7. Decisões da IA (ia_decidir): contexto, fila, resposta e erro
-- ------------------------------------------------------------

-- encerra o pedido na sequência: ok → as ações seguintes seguem (nx_auto_continuar); erro → a sequência para
create or replace function public.nx_auto_ia_encerrar(p_pedido bigint, p_ok boolean, p_detalhe text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare s public.nx_auto_sequencias; v_fim boolean;
begin
  select * into s from public.nx_auto_sequencias x where x.pedido_id = p_pedido and x.status = 'aguardando_ia' for update;
  if s.id is null then return; end if;
  if p_ok then
    v_fim := s.passo >= jsonb_array_length(s.acoes);
    -- «esperando» aqui é só a fila para a próxima rodada (continuar_em = agora), NÃO uma espera pelo cliente: a resposta que
    -- chegar nesses segundos não cancela o resto (cancelar_se_responder = false); quem espera o cliente é o passo «esperar».
    -- A etapa de referência é a de agora: a decisão da IA (classificar_etapa) acabou de mover o negócio.
    update public.nx_auto_sequencias set status = case when v_fim then 'concluida' else 'esperando' end,
           continuar_em = case when v_fim then null else now() end, pedido_id = null, atualizado_em = now(),
           cancelar_se_responder = false,
           estagio_ref = public.nx_auto_estagio_do_alvo(s.cliente_id, s.alvo)
     where id = s.id;
    update public.nx_auto_execucoes x set estado = case when v_fim then 'concluida' else 'esperando' end,
           passo = s.passo, atualizado_em = now(),
           detalhe = left(coalesce(x.detalhe, '') || coalesce(' · ' || nullif(p_detalhe, ''), ''), 1000)
     where x.automacao_id = s.automacao_id and x.chave = s.chave;
  else
    update public.nx_auto_sequencias set status = 'erro', motivo = left(p_detalhe, 300), pedido_id = null, atualizado_em = now()
     where id = s.id;
    update public.nx_auto_execucoes x set ok = false, estado = 'erro', atualizado_em = now(),
           detalhe = left(coalesce(x.detalhe, '') || ' · ' || coalesce(p_detalhe, 'erro da IA'), 1000)
     where x.automacao_id = s.automacao_id and x.chave = s.chave;
    update public.nx_automacoes set erros = erros + 1, ultima_execucao_em = now() where id = s.automacao_id;
  end if;
end $$;

-- o que a IA recebe: negócio, etapas possíveis (opções fechadas) e a conversa do contato — tudo DADO
create or replace function public.nx_auto_ia_contexto(p public.nx_auto_ia_pedidos)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_neg bigint := nullif(p.alvo ->> 'negocio_id', '')::bigint;
  v_ct bigint := nullif(p.alvo ->> 'contato_id', '')::bigint;
  l public.nx_leads; e public.nx_estagios; c public.nx_clientes; r record;
  v_itens jsonb[] := '{}'; v_tam int := 0; v_txt text; v_quem text; v_contato text; v_ocultas bigint[] := '{}';
  v_etapas jsonb; v_neg_json jsonb;
begin
  select * into c from public.nx_clientes x where x.id = p.cliente_id;
  if v_neg is not null then select * into l from public.nx_leads x where x.id = v_neg and x.cliente_id = p.cliente_id; end if;
  if l.id is not null then
    v_ct := coalesce(v_ct, l.contato_id);
    select * into e from public.nx_estagios s where s.id = l.estagio_id and s.cliente_id = p.cliente_id;
    -- opções da classificação: etapas ABERTAS e PERDIDAS do funil do negócio (a IA nunca fecha como ganho)
    select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'tipo', s.tipo) order by s.ordem), '[]'::jsonb)
      into v_etapas from public.nx_estagios s
     where s.cliente_id = p.cliente_id and s.funil_id = l.funil_id and s.tipo <> 'ganho';
    v_neg_json := jsonb_build_object('id', l.id, 'titulo', l.titulo, 'nome', l.nome, 'servico', l.servico, 'origem', l.origem,
      'status', l.status, 'valor', coalesce(l.valor, l.valor_previsto), 'criado_em', l.criado_em,
      'etapa_atual', jsonb_build_object('id', e.id, 'nome', e.nome, 'tipo', e.tipo),
      'campos', case when length(coalesce(l.campos, '{}'::jsonb)::text) <= 1500 then l.campos end);
  end if;
  select k.nome into v_contato from public.nx_contatos k where k.id = v_ct and k.cliente_id = p.cliente_id;
  select coalesce(array_agg(x.id), '{}'::bigint[]) into v_ocultas from public.nx_conversas x
   where x.cliente_id = p.cliente_id and x.contato_id = v_ct and x.oculta;
  for r in
    select m.direcao, m.tipo, m.corpo, m.criado_em, m.origem, x.nome as autor
      from public.nx_mensagens m left join public.nx_contas x on x.id = m.enviado_por
     where m.contato_id = v_ct and m.cliente_id = p.cliente_id and m.tipo not in ('nota', 'sistema')
       and not (m.conversa_id = any(v_ocultas))
     order by m.id desc
     limit 30
  loop
    v_txt := left(case when r.tipo = 'texto' then coalesce(r.corpo, '')
                       else '[' || r.tipo || ']' || coalesce(' ' || nullif(r.corpo, ''), '') end, 1500);
    v_quem := case when r.direcao = 'in' then 'cliente'
                   else coalesce(nullif(split_part(coalesce(r.autor, ''), ' ', 1), ''),
                                 case when r.origem = 'automacao' then 'automação' when r.origem = 'ia' then 'assistente' else 'equipe' end) end;
    exit when v_tam + octet_length(v_txt) > 12000;
    v_tam := v_tam + octet_length(v_txt);
    v_itens := array_prepend(jsonb_build_object('dir', r.direcao, 'quem', v_quem, 'texto', v_txt, 'em', r.criado_em), v_itens);
  end loop;
  return jsonb_build_object(
    'empresa', c.nome, 'vertical', c.vertical,
    'ia', case when jsonb_typeof(c.cfg -> 'ia') = 'object'
               then jsonb_build_object('sobre', left(coalesce(c.cfg #>> '{ia,sobre}', ''), 1500),
                                       'servicos', left(coalesce(c.cfg #>> '{ia,servicos}', ''), 1500)) else '{}'::jsonb end,
    'contato_nome', v_contato,
    'negocio', v_neg_json,
    'etapas', case when p.tarefa = 'classificar_etapa' then v_etapas end,
    'mensagens', to_jsonb(v_itens));
end $$;

-- reserva uma leva de pedidos para a nx-ia (status → processando) e devolve cada um com o contexto
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
   where q.status = 'pendente'
     and not exists (select 1 from public.nx_auto_sequencias s where s.pedido_id = q.id and s.status = 'aguardando_ia');
  for r in select * from public.nx_auto_ia_pedidos q
            where q.status = 'pendente' and q.proximo_em <= now() and (p_pedido is null or q.id = p_pedido)
            order by q.id limit v_lim for update skip locked loop
    update public.nx_auto_ia_pedidos set status = 'processando', pego_em = now(), tentativas = tentativas + 1 where id = r.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', r.id, 'cliente_id', r.cliente_id, 'tarefa', r.tarefa, 'instrucao', r.instrucao, 'tentativas', r.tentativas + 1,
      'contexto', public.nx_auto_ia_contexto(r)));
  end loop;
  return v_out::json;
end $$;

-- a chamada à IA falhou. p_tentar = true e ainda há tentativas → volta para a fila daqui a p_em segundos
-- (p_conta = false não gasta a tentativa: ritmo da cota por minuto); senão o pedido vira erro e a sequência para.
create or replace function public.nx_auto_ia_falhar(p_pedido bigint, p_erro text, p_tentar boolean default false,
                                                    p_em int default 120, p_conta boolean default true)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare r public.nx_auto_ia_pedidos; v_erro text := left(coalesce(nullif(btrim(p_erro), ''), 'a IA não respondeu'), 400);
begin
  select * into r from public.nx_auto_ia_pedidos q where q.id = p_pedido for update;
  if r.id is null or r.status not in ('pendente', 'processando') then
    return json_build_object('ok', false, 'erro', 'pedido_encerrado');
  end if;
  if coalesce(p_tentar, false) and (r.tentativas < 3 or not coalesce(p_conta, true)) then
    update public.nx_auto_ia_pedidos set status = 'pendente', pego_em = null, despachado_em = null,
           proximo_em = now() + make_interval(secs => least(greatest(coalesce(p_em, 120), 5), 3600)),
           tentativas = case when coalesce(p_conta, true) then tentativas else greatest(tentativas - 1, 0) end,
           detalhe = left(v_erro, 500)
     where id = r.id;
    return json_build_object('ok', true, 'tentar_de_novo', true);
  end if;
  update public.nx_auto_ia_pedidos set status = 'erro', pego_em = null, concluido_em = now(), detalhe = left(v_erro, 500) where id = r.id;
  perform public.nx_auto_ia_encerrar(r.id, false, 'IA: ' || v_erro);
  return json_build_object('ok', true, 'tentar_de_novo', false);
end $$;

-- aplica a decisão da IA (validada DE NOVO aqui: etapa ∈ etapas do funil do negócio · nota ≤ 1.000 ·
-- score 0–100 + motivo ≤ 200) e libera as ações seguintes da sequência
create or replace function public.nx_auto_ia_resolver(p_pedido bigint, p_resultado jsonb, p_modelo text default null,
                                                      p_in int default null, p_out int default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.nx_auto_ia_pedidos; a public.nx_automacoes; l public.nx_leads; e public.nx_estagios;
  res jsonb := coalesce(p_resultado, '{}'::jsonb);
  v_neg bigint; v_ct bigint; v_det text; v_motivo text; v_txt text; v_id uuid; v_score int; v_prof int;
  v_msg text; v_hint text; v_err text;
begin
  select * into r from public.nx_auto_ia_pedidos q where q.id = p_pedido for update;
  if r.id is null then return json_build_object('ok', false, 'erro', 'pedido_nao_encontrado'); end if;
  if r.status <> 'processando' then return json_build_object('ok', false, 'erro', 'pedido_encerrado'); end if;
  select * into a from public.nx_automacoes x where x.id = r.automacao_id;
  select s.profundidade into v_prof from public.nx_auto_sequencias s where s.pedido_id = r.id and s.status = 'aguardando_ia';
  if a.id is null or not a.ativo or v_prof is null then
    update public.nx_auto_ia_pedidos set status = 'cancelado', pego_em = null, concluido_em = now(),
           detalhe = 'a sequência foi cancelada' where id = r.id;
    return json_build_object('ok', true, 'cancelado', true);
  end if;
  begin
    if jsonb_typeof(res) <> 'object' then
      raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'a resposta não é um objeto';
    end if;
    perform set_config('nx.automacao', a.id::text, true);
    perform set_config('nx.profundidade', (coalesce(v_prof, 0) + 1)::text, true);
    v_neg := nullif(r.alvo ->> 'negocio_id', '')::bigint;
    v_ct := nullif(r.alvo ->> 'contato_id', '')::bigint;
    if v_neg is not null then select * into l from public.nx_leads x where x.id = v_neg and x.cliente_id = r.cliente_id; end if;
    v_ct := coalesce(v_ct, l.contato_id);
    case r.tarefa
      when 'classificar_etapa' then
        if l.id is null then raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'o negócio não existe mais'; end if;
        if l.status <> 'aberto' then raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'o negócio já foi fechado'; end if;
        v_id := public.nx_auto_uuid(res ->> 'etapa_id');
        select * into e from public.nx_estagios s
         where s.id = v_id and s.cliente_id = r.cliente_id and s.funil_id = l.funil_id and s.tipo <> 'ganho';
        if v_id is null or e.id is null then
          raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'a etapa escolhida não é uma das opções do funil';
        end if;
        v_motivo := left(nullif(btrim(coalesce(res ->> 'motivo', '')), ''), 300);
        v_det := public.nx_auto_mover(r.cliente_id, a.nome, l.id, e.id,
                   case when e.tipo = 'perdido' then 'IA: ' || coalesce(v_motivo, 'sem motivo informado') end);
        if v_motivo is not null and e.tipo <> 'perdido' and v_det like 'movido%' then
          insert into public.nx_notas (cliente_id, contato_id, negocio_id, autor_id, texto)
          values (r.cliente_id, l.contato_id, l.id, null, left('IA moveu para «' || e.nome || '»: ' || v_motivo, 5000));
        end if;
        v_det := 'IA: ' || v_det || coalesce(' (' || v_motivo || ')', '');
      when 'resumir_nota' then
        v_txt := btrim(coalesce(res ->> 'texto', ''));
        if v_txt = '' or char_length(v_txt) > 1000 then
          raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'o resumo precisa ter de 1 a 1000 caracteres';
        end if;
        if v_ct is null and l.id is null then
          raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'sem contato nem negócio para anotar';
        end if;
        insert into public.nx_notas (cliente_id, contato_id, negocio_id, autor_id, texto)
        values (r.cliente_id, v_ct, l.id, null, 'IA: ' || v_txt);
        v_det := 'IA: resumo da conversa gravado como nota';
      when 'pontuar_lead' then
        if l.id is null then raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'o negócio não existe mais'; end if;
        v_score := public.nx_auto_int(res -> 'score');
        v_motivo := left(btrim(coalesce(res ->> 'motivo', '')), 400);
        if v_score is null or v_score not between 0 and 100 then
          raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'a nota vai de 0 a 100';
        end if;
        if v_motivo = '' or char_length(v_motivo) > 200 then
          raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'o motivo precisa ter de 1 a 200 caracteres';
        end if;
        update public.nx_leads set
          campos = coalesce(campos, '{}'::jsonb) || jsonb_build_object('score', v_score, 'score_motivo', v_motivo,
                     'score_em', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI')),
          atualizado_em = now()
         where id = l.id and cliente_id = r.cliente_id;
        v_det := 'IA: lead com nota ' || v_score || ' (' || v_motivo || ')';
      else
        raise exception 'ia_resultado_invalido' using errcode = '22023', hint = 'tarefa desconhecida';
    end case;
    perform set_config('nx.automacao', '', true);
    perform set_config('nx.profundidade', '', true);
  exception when others then
    get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
    v_err := case when v_msg = 'ia_resultado_invalido' then 'a resposta da IA não pôde ser aplicada (' || coalesce(v_hint, 'inválida') || ')'
                  else rtrim(public.nx_auto_erro_texto(v_msg, v_hint, null), '.') end;
    update public.nx_auto_ia_pedidos set status = 'erro', pego_em = null, concluido_em = now(), resultado = res,
           modelo = left(p_modelo, 80), tokens_in = p_in, tokens_out = p_out, detalhe = left(v_err, 500)
     where id = r.id;
    perform public.nx_auto_ia_encerrar(r.id, false, left('IA: ' || v_err, 280));
    return json_build_object('ok', false, 'erro', 'resultado_invalido', 'detalhe', v_err);
  end;
  update public.nx_auto_ia_pedidos set status = 'aplicado', pego_em = null, concluido_em = now(), resultado = res,
         modelo = left(p_modelo, 80), tokens_in = p_in, tokens_out = p_out, detalhe = left(v_det, 500)
   where id = r.id;
  perform public.nx_auto_ia_encerrar(r.id, true, left(v_det, 280));
  if v_ct is not null or l.id is not null then
    perform public.nx_historico_add(r.cliente_id, 'automacao', v_ct, l.id, nullif(r.alvo ->> 'conversa_id', '')::bigint,
      jsonb_build_object('automacao_id', a.id, 'nome', a.nome, 'detalhe', left(v_det, 500)));
  end if;
  return json_build_object('ok', true, 'detalhe', v_det);
end $$;

-- o motor chama a nx-ia (automacao_decidir) quando há pedido esperando; pedido velho demais vira erro
create or replace function public.nx_auto_ia_chamar()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_n int;
begin
  for r in select q.id from public.nx_auto_ia_pedidos q
            where q.status in ('pendente', 'processando') and q.criado_em < now() - interval '2 hours' for update skip locked loop
    perform public.nx_auto_ia_falhar(r.id, 'a IA não respondeu em 2 horas', false);
  end loop;
  update public.nx_auto_ia_pedidos set despachado_em = now()
   where status = 'pendente' and proximo_em <= now() and (despachado_em is null or despachado_em < now() - interval '90 seconds');
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
-- 8. Motor em lotes curtos (§5.7) — pg_cron a cada 15 s: select public.nx_auto_lote(25)
--    (cópia de 20260928h + sequências vencidas, gatilhos agendado/apos_data e chamada da IA)
-- ------------------------------------------------------------
create or replace function public.nx_auto_lote(p_max int default 25)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  t0 timestamptz := clock_timestamp();
  v_max int := least(greatest(coalesce(p_max, 25), 1), 200);
  v_orc interval := interval '1500 milliseconds';     -- orçamento da rodada (meta < 2 s)
  ev public.nx_eventos; a public.nx_automacoes; r record; sq public.nx_auto_sequencias;
  v_pend boolean; v_res text; v_resto int; v_n int;
  n_ev int := 0; n_exec int := 0; n_err int := 0; n_sla int := 0; n_tempo int := 0; n_seq int := 0; n_ia int := 0;
  v_apto boolean;
begin
  if not pg_try_advisory_xact_lock(hashtext('nx_auto_lote')) then
    return json_build_object('ocupado', true);
  end if;
  perform set_config('lock_timeout', '2s', true);
  perform set_config('nx.lote', '1', true);

  -- 2. eventos pendentes — revezando entre clientes: primeiro o evento mais antigo de CADA cliente,
  --    depois o 2º de cada um… (dentro do cliente a ordem é a do id). Um cliente com backlog grande
  --    (importação, ação em massa) não segura as automações dos outros. A lista de clientes com
  --    pendência sai por "loose index scan" em nx_eventos_cli_pend (uma busca por cliente).
  for ev in
    select e.* from public.nx_eventos e
     where e.processado_em is null
       and e.id = any (array(
         with recursive cl(cid) as (
           (select x.cliente_id from public.nx_eventos x
             where x.processado_em is null order by x.cliente_id limit 1)
           union all
           select (select x.cliente_id from public.nx_eventos x
                    where x.processado_em is null and x.cliente_id > cl.cid order by x.cliente_id limit 1)
             from cl where cl.cid is not null)
         select s.id from (
           select p.id, row_number() over (partition by cl.cid order by p.id) as rn
             from cl cross join lateral (select x.id from public.nx_eventos x
                                          where x.cliente_id = cl.cid and x.processado_em is null
                                          order by x.id limit v_max) p
            where cl.cid is not null) s
          order by s.rn, s.id
          limit v_max))
     order by e.id
     for update skip locked
  loop
    n_ev := n_ev + 1;
    v_pend := false;
    v_apto := public.nx_auto_cliente_apto(ev.cliente_id);
    if v_apto then
      for a in
        select x.* from public.nx_automacoes x
         where x.cliente_id = ev.cliente_id and x.gatilho = ev.tipo and x.ativo
         order by x.criado_em, x.id
      loop
        continue when ev.origem_automacao is not distinct from a.id or ev.profundidade >= 3;
        continue when not public.nx_auto_config_ok(a.gatilho, a.config, ev.ref);
        v_res := public.nx_auto_rodar(a, ev.ref, 'ev:' || ev.id, ev.id, ev.profundidade, false);
        if v_res = 'ok' then n_exec := n_exec + 1;
        elsif v_res = 'erro' then n_err := n_err + 1;
        elsif v_res = 'pendente' then v_pend := true;
        end if;
      end loop;
    end if;
    if not v_pend then
      update public.nx_eventos set processado_em = now() where id = ev.id;
    end if;
    exit when clock_timestamp() - t0 > v_orc;
  end loop;

  -- 2b. sequências que chegaram na hora de continuar (esperar) ou cuja decisão da IA chegou:
  --     antes dos gatilhos de tempo, para uma sequência longa não ficar para trás
  if clock_timestamp() - t0 < v_orc then
    for sq in
      select s.* from public.nx_auto_sequencias s
       where s.status = 'esperando' and s.continuar_em <= now()
         and public.nx_auto_cliente_apto(s.cliente_id)
       order by s.continuar_em, s.id
       limit v_max
       for update skip locked
    loop
      v_res := public.nx_auto_continuar(sq);
      if v_res = 'ok' then n_exec := n_exec + 1; n_seq := n_seq + 1;
      elsif v_res = 'erro' then n_err := n_err + 1; n_seq := n_seq + 1;
      elsif v_res = 'cancelada' then n_seq := n_seq + 1;
      end if;
      exit when clock_timestamp() - t0 > v_orc;
    end loop;
  end if;

  -- 3. gatilhos de tempo — no máximo v_max alvos por chamada, revezando pela vez mais antiga em que a
  --    automação foi tocada: execução OU alvo marcado como "condições não atendidas" (esse não mexe na
  --    ultima_execucao_em mostrada na tela; sem contá-lo, uma automação com milhares de alvos que não
  --    passam na condição ficaria sempre na frente e seguraria as dos outros clientes)
  v_resto := v_max;
  for a in
    select x.* from public.nx_automacoes x
      left join lateral (select max(k.criado_em) as ult from public.nx_auto_execucoes k where k.automacao_id = x.id) u on true
     where x.ativo and x.gatilho in ('sem_resposta', 'tempo_no_estagio', 'tarefa_vencida', 'antes_da_data', 'agendado', 'apos_data')
     order by greatest(x.ultima_execucao_em, u.ult) nulls first, x.id
  loop
    exit when v_resto <= 0 or clock_timestamp() - t0 > v_orc;
    continue when not public.nx_auto_cliente_apto(a.cliente_id);
    for r in select * from public.nx_auto_alvos_tempo(a, v_resto) loop
      v_res := public.nx_auto_rodar(a, r.ref, r.chave, null, 0, true);
      if v_res = 'ok' then n_exec := n_exec + 1; n_tempo := n_tempo + 1; v_resto := v_resto - 1;
      elsif v_res = 'erro' then n_err := n_err + 1; n_tempo := n_tempo + 1; v_resto := v_resto - 1;
      elsif v_res = 'pulou' then v_resto := v_resto - 1;
      end if;
      exit when v_resto <= 0 or clock_timestamp() - t0 > v_orc;
    end loop;
  end loop;

  -- 4. SLA da etapa: um aviso por entrada na etapa (só estouros dos últimos 7 dias)
  if clock_timestamp() - t0 < v_orc then
    for r in
      select l.id, l.cliente_id, l.dono_id, e.nome as etapa, e.sla_horas,
             coalesce(nullif(btrim(l.titulo), ''), nullif(btrim(l.nome), ''), 'Sem título') as titulo
        from public.nx_estagios e
        join public.nx_leads l on l.estagio_id = e.id and l.status = 'aberto'
       where e.sla_horas is not null
         and l.estagio_em < now() - make_interval(hours => e.sla_horas)
         and l.estagio_em > now() - make_interval(hours => e.sla_horas) - interval '7 days'
         and not exists (select 1 from public.nx_notificacoes n
                          where n.tipo = 'sla_etapa' and n.link = '#/crm/negocio/' || l.id and n.criado_em > l.estagio_em)
         -- cliente suspenso/sem CRM sai no filtro (não com "continue" no laço): senão os negócios
         -- dele voltariam em toda rodada e ocupariam as v_max vagas de todos os outros clientes
         and public.nx_auto_cliente_apto(l.cliente_id, 'crm')
       order by l.estagio_em
       limit v_max
    loop
      v_n := 0;
      if r.dono_id is not null then
        v_n := public.nx_notificar(r.cliente_id, r.dono_id, 'sla_etapa',
          left('Parado em «' || r.etapa || '» há mais de ' || r.sla_horas || ' h', 120), left(r.titulo, 500), '#/crm/negocio/' || r.id);
      end if;
      if v_n = 0 then
        v_n := public.nx_notificar(r.cliente_id, null, 'sla_etapa',
          left('Parado em «' || r.etapa || '» há mais de ' || r.sla_horas || ' h', 120), left(r.titulo, 500), '#/crm/negocio/' || r.id);
      end if;
      n_sla := n_sla + v_n;
      exit when clock_timestamp() - t0 > v_orc;
    end loop;
  end if;

  -- 4b. pedidos esperando a IA: chama a nx-ia (automacao_decidir)
  begin
    n_ia := public.nx_auto_ia_chamar();
  exception when others then
    raise warning 'nx_auto_lote (ia): %', sqlerrm;
  end;

  -- 5. pulso uma vez por cliente tocado
  perform public.nx_pulso_lote_fim();
  perform set_config('nx.lote', '', true);
  return json_build_object(
    'eventos', n_ev, 'execucoes', n_exec, 'erros', n_err, 'tempo_alvos', n_tempo, 'sla_avisos', n_sla,
    'sequencias', n_seq, 'ia_pedidos', n_ia,
    'restantes', (select count(*) from (select 1 from public.nx_eventos e where e.processado_em is null limit 10000) s),
    'tempo_ms', round(extract(epoch from clock_timestamp() - t0) * 1000));
end $$;

-- faxina das sequências e dos pedidos de IA já encerrados (pg_cron 06:50 UTC)
create or replace function public.nx_auto_faxina()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare n_seq int; n_ped int;
begin
  delete from public.nx_auto_sequencias where status in ('concluida', 'cancelada', 'erro') and atualizado_em < now() - interval '60 days';
  get diagnostics n_seq = row_count;
  delete from public.nx_auto_ia_pedidos where status in ('aplicado', 'erro', 'cancelado') and coalesce(concluido_em, criado_em) < now() - interval '30 days';
  get diagnostics n_ped = row_count;
  return json_build_object('sequencias', n_seq, 'pedidos_ia', n_ped);
end $$;

-- ------------------------------------------------------------
-- 9. Cota de IA (30c) com a ação «automacao» — decisões do motor não têm pessoa por trás (p_conta nulo)
--    e entram só no teto do mês e num teto de 30 por minuto por empresa
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
  if p_cliente is null or p_acao is null or p_acao not in ('sugerir', 'resumir', 'automacao')
     or (p_conta is null and p_acao <> 'automacao') then
    return json_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  if p_conta is not null
     and not exists (select 1 from public.nx_acessos a where a.cliente_id = p_cliente and a.conta_id = p_conta) then
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
  else
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
-- 10. nx_disparar: cópia de 20260929a_codewords.sql + 'nx-ia' (o motor pede as decisões da IA)
-- ------------------------------------------------------------
create or replace function public.nx_disparar(p_funcao text, p_corpo jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare cfg public.nx_config; v_id bigint;
begin
  if p_funcao is null or p_funcao not in ('nx-ciclo', 'nx-relatorio', 'nx-enviar', 'nx-codewords', 'nx-ia') then
    raise exception 'funcao_invalida';
  end if;
  select * into cfg from public.nx_config where id = 1;
  if cfg.funcoes_url is null then raise exception 'funcoes_url_nao_configurada'; end if;
  select net.http_post(
    url := cfg.funcoes_url || '/' || p_funcao,
    body := coalesce(p_corpo, '{}'::jsonb),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-nx-cron', cfg.cron_token),
    timeout_milliseconds := 120000
  ) into v_id;
  return v_id;
end $$;

-- ------------------------------------------------------------
-- 11. RPCs do painel
-- ------------------------------------------------------------
create or replace function public.nx_auto_item(a public.nx_automacoes)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object('id', a.id, 'nome', a.nome, 'ativo', a.ativo, 'gatilho', a.gatilho, 'config', a.config,
    'condicoes', a.condicoes, 'acoes', a.acoes, 'respeitar_horario', a.respeitar_horario,
    'execucoes', a.execucoes, 'erros', a.erros, 'ultima_execucao_em', a.ultima_execucao_em,
    'em_espera', (select count(*) from public.nx_auto_sequencias s
                   where s.automacao_id = a.id and s.status in ('esperando', 'aguardando_ia')),
    'criado_em', a.criado_em, 'atualizado_em', a.atualizado_em);
end $$;

create or replace function public.nx_automacoes_listar(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'supervisor'); v_vert text;
begin
  perform public.nx_exigir_modulo(p_cliente, 'automacoes');
  select c.vertical into v_vert from public.nx_clientes c where c.id = p_cliente;
  return json_build_object(
    'sistema', json_build_array(
      json_build_object('nome', 'Conversa nova vira contato e negócio',
        'descricao', 'Toda conversa nova no WhatsApp cria (ou acha) o contato e abre um negócio na primeira etapa do funil padrão.', 'ligada', true),
      json_build_object('nome', 'Anúncio marca a origem',
        'descricao', 'Quem chega por anúncio de clique para o WhatsApp fica marcado com a plataforma, a campanha e o anúncio — o primeiro toque nunca é sobrescrito.', 'ligada', true),
      json_build_object('nome', 'Fora do horário responde sozinho',
        'descricao', 'Conversa nova fora do horário do departamento recebe a mensagem de fora do horário (no máximo uma vez a cada 12 h por contato).', 'ligada', true),
      json_build_object('nome', 'Rodízio do departamento',
        'descricao', 'Conversas novas vão para quem atendeu o cliente antes ou, no rodízio, para quem tem menos atendimentos abertos.', 'ligada', true),
      json_build_object('nome', 'Pediu para sair não recebe marketing',
        'descricao', 'Quem responde SAIR, PARAR ou STOP deixa de receber mensagens de marketing; lembretes de serviço continuam.', 'ligada', true)),
    'itens', coalesce((select json_agg(public.nx_auto_item(a) order by a.criado_em, a.id)
                         from public.nx_automacoes a where a.cliente_id = p_cliente), '[]'::json),
    'base', public.nx_auto_base(p_cliente),
    'limite', json_build_object('usadas', (select count(*) from public.nx_automacoes a where a.cliente_id = p_cliente),
                                'limite', public.nx_limite(p_cliente, 'automacoes')),
    'ia', json_build_object('disponivel', public.nx_auto_ia_ligada(),
                            'usadas', public.nx_uso(p_cliente, 'ia_mes'), 'limite', public.nx_limite(p_cliente, 'ia_mes')),
    'vertical', v_vert,
    'pode_editar', public.nx_rank(v.papel) >= 3);
end $$;

-- execuções: + estado (concluida | esperando | aguardando_ia | cancelada | parada | erro), passo, total_passos e
-- continua_em (quando a sequência volta a rodar). Linhas antigas: estado null.
create or replace function public.nx_automacao_execucoes(p_token text, p_cliente uuid, p_id uuid, p_limite int default 50)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'supervisor');
begin
  perform public.nx_exigir_modulo(p_cliente, 'automacoes');
  if not exists (select 1 from public.nx_automacoes a where a.id = p_id and a.cliente_id = p_cliente) then
    raise exception 'automacao_nao_encontrada' using errcode = '22023';
  end if;
  return coalesce((
    select json_agg(json_build_object('criado_em', s.criado_em, 'ok', s.ok, 'detalhe', s.detalhe, 'chave', s.chave, 'link', s.link,
                                      'estado', s.estado, 'passo', s.passo, 'total_passos', s.total_passos,
                                      'continua_em', s.continua_em, 'atualizado_em', s.atualizado_em)
                    order by s.criado_em desc, s.id desc)
      from (select x.id, x.criado_em, x.ok, x.detalhe, x.chave, x.estado, x.passo, x.total_passos, x.atualizado_em,
                   case when q.status = 'esperando' then q.continuar_em end as continua_em,
                   case split_part(x.chave, ':', 1)
                     when 'sr' then '#/conversas/' || split_part(x.chave, ':', 2)
                     when 'te' then '#/crm/negocio/' || split_part(x.chave, ':', 2)
                     when 'ad' then '#/crm/negocio/' || split_part(x.chave, ':', 2)
                     when 'ap' then '#/crm/negocio/' || split_part(x.chave, ':', 2)
                     when 'ag' then '#/crm/negocio/' || split_part(x.chave, ':', 2)
                     when 'tv' then '#/tarefas'
                     when 'ev' then case
                       when e.ref ? 'negocio_id' and e.tipo like 'negocio_%' then '#/crm/negocio/' || (e.ref ->> 'negocio_id')
                       when e.ref ? 'conversa_id' then '#/conversas/' || (e.ref ->> 'conversa_id')
                       when e.ref ? 'contato_id' then '#/contatos/' || (e.ref ->> 'contato_id') end
                   end as link
              from public.nx_auto_execucoes x
              left join public.nx_eventos e on e.id = x.evento_id and e.cliente_id = x.cliente_id
              left join public.nx_auto_sequencias q on q.automacao_id = x.automacao_id and q.chave = x.chave
             where x.automacao_id = p_id and x.cliente_id = p_cliente
               and not (x.ok and x.detalhe = 'Condições não atendidas — nada feito.')
             order by x.criado_em desc, x.id desc
             limit least(greatest(coalesce(p_limite, 50), 1), 200)) s), '[]'::json);
end $$;

-- cancela as sequências que esperam (todas da automação, ou só a da chave)
create or replace function public.nx_automacao_cancelar_espera(p_token text, p_cliente uuid, p_id uuid, p_chave text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); v_n int;
begin
  perform public.nx_exigir_modulo(p_cliente, 'automacoes');
  if not exists (select 1 from public.nx_automacoes a where a.id = p_id and a.cliente_id = p_cliente) then
    raise exception 'automacao_nao_encontrada' using errcode = '22023';
  end if;
  -- inclui quem aguarda a IA (o «em espera» da tela soma os dois): o pedido de IA dela também é cancelado e não gasta cota
  with c as (
    update public.nx_auto_sequencias s set status = 'cancelada', motivo = 'cancelada pela equipe', atualizado_em = now()
     where s.automacao_id = p_id and s.cliente_id = p_cliente and s.status in ('esperando', 'aguardando_ia')
       and (p_chave is null or s.chave = p_chave)
    returning s.automacao_id, s.chave, s.pedido_id),
  p as (
    update public.nx_auto_ia_pedidos q set status = 'cancelado', pego_em = null, concluido_em = now(), detalhe = 'cancelada pela equipe'
     where q.id in (select c.pedido_id from c where c.pedido_id is not null) and q.status in ('pendente', 'processando')
    returning q.id)
  update public.nx_auto_execucoes x set estado = 'cancelada', atualizado_em = now(),
         detalhe = left(coalesce(x.detalhe, '') || ' · cancelada pela equipe', 1000)
    from c where x.automacao_id = c.automacao_id and x.chave = c.chave;
  get diagnostics v_n = row_count;
  return json_build_object('ok', true, 'canceladas', v_n);
end $$;

-- ------------------------------------------------------------
-- 12. Testar sem gravar: o que ACONTECERIA com a automação (a do editor, salva ou não)
--     Roda o motor de verdade sobre até 5 exemplos reais dentro de uma subtransação que é DESFEITA no fim
--     (nada fica gravado: nem tarefa, nem mensagem na fila, nem etiqueta). Esperar e IA não pausam: a lista
--     mostra cada passo com "depois_min" (quanto tempo depois do primeiro ele rodaria).
-- ------------------------------------------------------------
create or replace function public.nx_auto_simular(p_token text, p_cliente uuid, p_automacao jsonb, p_negocio bigint default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  v_sim jsonb;
  v_msg text; v_hint text; v_st text; v_det text;
begin
  perform public.nx_exigir_modulo(p_cliente, 'automacoes');
  if p_automacao is null or jsonb_typeof(p_automacao) <> 'object' then
    perform public.nx_auto_falha('dados da automação inválidos');
  end if;
  begin
    v_sim := public.nx_auto_simular_corpo(p_cliente, p_automacao, p_negocio);
    raise exception 'nx_sim_fim' using errcode = 'NXS01', detail = v_sim::text;   -- desfaz tudo o que a simulação gravou
  exception
    when sqlstate 'NXS01' then
      get stacked diagnostics v_det = pg_exception_detail;
      return v_det::json;
    when others then
      get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint, v_st = returned_sqlstate;
      raise exception using message = v_msg, hint = coalesce(v_hint, ''), errcode = v_st;
  end;
end $$;

create or replace function public.nx_auto_simular_corpo(p_cliente uuid, p_automacao jsonb, p_negocio bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n jsonb; a public.nx_automacoes; v_ref jsonb; v_alvo jsonb; v_d jsonb; v_cfg boolean; v_cond boolean; v_res jsonb;
  v_amostra jsonb := '[]'::jsonb; v_item jsonb; v_quem text; v_erro text; v_link text;
  v_msg text; v_hint text; v_st text; v_detalhe text; v_det text;
  v_evento boolean;
begin
  n := public.nx_auto_normalizar(p_cliente, p_automacao, false);
  insert into public.nx_automacoes (cliente_id, nome, ativo, gatilho, config, condicoes, acoes, respeitar_horario)
  values (p_cliente, n ->> 'nome', true, n ->> 'gatilho', n -> 'config', n -> 'condicoes', n -> 'acoes',
          (n ->> 'respeitar_horario')::boolean)
  returning * into a;
  v_evento := a.gatilho in ('conversa_nova', 'mensagem_recebida', 'conversa_resolvida', 'negocio_criado', 'negocio_estagio',
                            'negocio_ganho', 'negocio_perdido', 'etiqueta_adicionada');
  for v_ref in select x from public.nx_auto_simular_alvos(p_cliente, a.gatilho, a.config, p_negocio, 5) x loop
    v_alvo := public.nx_auto_alvo(p_cliente, v_ref);
    v_d := public.nx_auto_dados(p_cliente, v_alvo);
    v_cfg := case when v_evento and p_negocio is null then public.nx_auto_config_ok(a.gatilho, a.config, v_ref) else true end;
    v_cond := public.nx_auto_condicoes(a.condicoes, v_d);
    v_quem := coalesce(nullif(btrim(v_d #>> '{contato,nome}'), ''), nullif(btrim(v_d #>> '{negocio,nome}'), ''),
                       nullif(btrim(v_d #>> '{tarefa,titulo}'), ''), 'Sem nome');
    v_link := case when v_alvo ->> 'negocio_id' is not null then '#/crm/negocio/' || (v_alvo ->> 'negocio_id')
                   when v_alvo ->> 'conversa_id' is not null then '#/conversas/' || (v_alvo ->> 'conversa_id')
                   when v_alvo ->> 'contato_id' is not null then '#/contatos/' || (v_alvo ->> 'contato_id') end;
    v_item := jsonb_build_object('rotulo', v_quem, 'negocio_id', v_alvo -> 'negocio_id', 'contato_id', v_alvo -> 'contato_id',
                                 'conversa_id', v_alvo -> 'conversa_id', 'link', v_link,
                                 'casa_gatilho', v_cfg, 'passa_condicoes', v_cond, 'passos', '[]'::jsonb, 'erro', null);
    if v_cfg and v_cond then
      begin
        begin
          v_res := public.nx_auto_passos(a, a.acoes, v_alvo, 0, true);
          raise exception 'nx_sim_alvo' using errcode = 'NXS02', detail = v_res::text;
        exception
          when sqlstate 'NXS02' then
            get stacked diagnostics v_det = pg_exception_detail;
            v_res := v_det::jsonb;
          when others then
            get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint, v_detalhe = pg_exception_detail;
            v_res := jsonb_build_object('erro', public.nx_auto_erro_texto(v_msg, v_hint, v_detalhe));
        end;
      end;
      v_item := v_item || jsonb_build_object('passos', coalesce(v_res -> 'passos', '[]'::jsonb),
                                             'erro', v_res -> 'erro', 'parou', coalesce(v_res -> 'parou', 'false'::jsonb));
    end if;
    v_amostra := v_amostra || jsonb_build_array(v_item);
  end loop;
  return jsonb_build_object('ok', true, 'automacao', n, 'amostra', v_amostra, 'tamanho_amostra', 5,
    'aviso', case when jsonb_array_length(v_amostra) = 0 then 'Nenhum exemplo encontrado agora para testar: não há registro que o gatilho pegaria.' end);
end $$;

-- ------------------------------------------------------------
-- 13. nx-ia → automacao_montar: as opções fechadas do cliente (a IA só escolhe entre elas)
--     interna (só service_role): a nx-ia autentica o painel e confere o token DE NOVO aqui (nx_ctx, admin)
-- ------------------------------------------------------------
create or replace function public.nx_auto_ia_base(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); c public.nx_clientes;
begin
  perform public.nx_exigir_modulo(p_cliente, 'automacoes');
  select * into c from public.nx_clientes x where x.id = p_cliente;
  return json_build_object('empresa', c.nome, 'vertical', c.vertical, 'base', public.nx_auto_base(p_cliente),
    'limite', json_build_object('usadas', (select count(*) from public.nx_automacoes a where a.cliente_id = p_cliente),
                                'limite', public.nx_limite(p_cliente, 'automacoes')));
end $$;

-- ------------------------------------------------------------
-- 14. Permissões (internas só service_role; painel anon/authenticated/service_role)
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'nx_auto_dur', 'nx_auto_mover', 'nx_auto_proximo', 'nx_auto_base', 'nx_auto_ia_ligada',
         'nx_tg_auto_conversa_res', 'nx_tg_auto_seq_resposta', 'nx_tg_auto_desligada',
         'nx_auto_normalizar', 'nx_auto_erro_texto', 'nx_auto_config_ok', 'nx_auto_alvos_tempo', 'nx_auto_simular_alvos',
         'nx_auto_passos', 'nx_auto_acoes', 'nx_auto_estagio_do_alvo', 'nx_auto_rodar', 'nx_auto_continuar',
         'nx_auto_ia_encerrar', 'nx_auto_ia_contexto', 'nx_auto_ia_pegar', 'nx_auto_ia_falhar', 'nx_auto_ia_resolver',
         'nx_auto_ia_chamar', 'nx_auto_lote', 'nx_auto_faxina', 'nx_ia_reservar', 'nx_disparar',
         'nx_auto_item', 'nx_automacoes_listar', 'nx_automacao_execucoes', 'nx_automacao_cancelar_espera',
         'nx_auto_simular', 'nx_auto_simular_corpo', 'nx_auto_ia_base')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    if r.proname in ('nx_automacoes_listar', 'nx_automacao_execucoes', 'nx_automacao_cancelar_espera', 'nx_auto_simular') then
      execute format('grant execute on function %s to anon, authenticated, service_role', r.fn);
    else
      execute format('grant execute on function %s to service_role', r.fn);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 15. Agendamento (idempotente): faxina diária das sequências e dos pedidos de IA
-- ------------------------------------------------------------
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'nx-faxina-auto' loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('nx-faxina-auto', '50 6 * * *', 'select public.nx_auto_faxina()');
end $$;

notify pgrst, 'reload schema';
