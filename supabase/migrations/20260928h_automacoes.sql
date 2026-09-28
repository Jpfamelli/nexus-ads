-- ============================================================
-- ÓRBITA (SaaS da Nexus) — 20260928h_automacoes.sql · frente F7
-- Automações (ESPEC v1.1 §2.6, §5.7–§5.9):
--   gatilhos de banco que alimentam nx_eventos · validação e
--   normalização (nx_auto_normalizar) · motor em lotes curtos
--   (nx_auto_lote, pg_cron a cada 15 s) com gatilhos de tempo e SLA ·
--   fila (nx_fila_chamar) · faxina diária · RPCs do painel ·
--   agendamentos.
--
-- Regras: só ACRESCENTA; idempotente (create or replace, if not exists,
-- drop trigger if exists + create, cron com unschedule antes); toda
-- função security definer + search_path ''; internas só service_role,
-- painel anon/authenticated/service_role.
-- Depende do arquivo a (F1). Em tempo de execução usa, se existirem,
-- nx_cv_distribuir (F5, arquivo e) e nx_disparar com 'nx-enviar' (F2,
-- arquivo f) — nada quebra se ainda não existirem (a ação vira erro
-- honesto na execução / o disparo da fila vira aviso).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Apoio: carimbo "pego para envio" na fila e índices do motor
-- ------------------------------------------------------------
-- quando o item virou 'enviando' (nx_fila_pegar da F2 só troca o status):
-- é o que o nx_fila_chamar usa para devolver à fila um envio travado há 10 min.
alter table public.nx_envios_fila add column if not exists pego_em timestamptz;

create index if not exists nx_auto_execucoes_auto on public.nx_auto_execucoes(automacao_id, criado_em desc);
create index if not exists nx_eventos_fila on public.nx_eventos(id) where processado_em is null;
-- revezamento entre clientes no motor (um cliente com backlog grande não segura os outros)
create index if not exists nx_eventos_cli_pend on public.nx_eventos(cliente_id, id) where processado_em is null;
create index if not exists nx_automacoes_tempo on public.nx_automacoes(ultima_execucao_em nulls first)
  where ativo and gatilho in ('sem_resposta', 'tempo_no_estagio', 'tarefa_vencida', 'antes_da_data');
create index if not exists nx_leads_auto_dconsulta on public.nx_leads(cliente_id, data_consulta)
  where status = 'aberto' and consulta_em is null and data_consulta is not null;
create index if not exists nx_leads_auto_previsao on public.nx_leads(cliente_id, previsao_fechamento)
  where status = 'aberto' and previsao_fechamento is not null;
create index if not exists nx_conversas_auto_sr on public.nx_conversas(cliente_id, ultima_entrada_em)
  where status = 'aberta' and aguardando;
create index if not exists nx_tarefas_auto_venc on public.nx_tarefas(cliente_id, vence_em) where concluida_em is null;
create index if not exists nx_notificacoes_auto_sla on public.nx_notificacoes(link, criado_em) where tipo = 'sla_etapa';
create index if not exists nx_fila_enviando on public.nx_envios_fila(pego_em) where status = 'enviando';

-- ------------------------------------------------------------
-- 2. Utilitárias internas
-- ------------------------------------------------------------
create or replace function public.nx_auto_uuid(p text)
returns uuid
language plpgsql immutable
security definer
set search_path = ''
as $$
begin
  if p is null or btrim(p) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  return btrim(p)::uuid;
end $$;

-- inteiro vindo do JSON (número inteiro ou texto só com dígitos); senão null
create or replace function public.nx_auto_int(p jsonb)
returns int
language plpgsql immutable
security definer
set search_path = ''
as $$
declare t text;
begin
  if p is null then return null; end if;
  if jsonb_typeof(p) not in ('number', 'string') then return null; end if;
  t := btrim(p #>> '{}');
  if t !~ '^-?[0-9]{1,9}$' then return null; end if;
  return t::int;
end $$;

-- minúsculas e sem acento (comparações de texto das condições e palavras)
create or replace function public.nx_auto_norm(p text)
returns text
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return btrim(lower(extensions.unaccent(coalesce(p, ''))));
end $$;

create or replace function public.nx_auto_falha(p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'automacao_invalida' using errcode = '22023', hint = p_motivo;
end $$;

-- o id é do cliente? (tipo: canal, departamento, funil, estagio, etiqueta, conta, template)
create or replace function public.nx_auto_ref_ok(p_cliente uuid, p_tipo text, p_id uuid)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if p_id is null or p_cliente is null then return false; end if;
  case p_tipo
    when 'canal' then return exists (select 1 from public.nx_canais x where x.id = p_id and x.cliente_id = p_cliente);
    when 'departamento' then return exists (select 1 from public.nx_departamentos x where x.id = p_id and x.cliente_id = p_cliente);
    when 'funil' then return exists (select 1 from public.nx_funis x where x.id = p_id and x.cliente_id = p_cliente);
    when 'estagio' then return exists (select 1 from public.nx_estagios x where x.id = p_id and x.cliente_id = p_cliente);
    when 'etiqueta' then return exists (select 1 from public.nx_etiquetas x where x.id = p_id and x.cliente_id = p_cliente);
    when 'template' then return exists (select 1 from public.nx_templates x where x.id = p_id and x.cliente_id = p_cliente);
    when 'conta' then return exists (select 1 from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
                                      where a.cliente_id = p_cliente and a.conta_id = p_id and k.aprovado);
    else return false;
  end case;
end $$;

-- id opcional: vazio → null; inválido ou de outro cliente → automacao_invalida (hint = p_motivo)
create or replace function public.nx_auto_id(p_cliente uuid, p_tipo text, p_val text, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v uuid;
begin
  if p_val is null or btrim(p_val) = '' then return null; end if;
  v := public.nx_auto_uuid(p_val);
  if v is null or not public.nx_auto_ref_ok(p_cliente, p_tipo, v) then
    perform public.nx_auto_falha(p_motivo);
  end if;
  return v;
end $$;

-- ------------------------------------------------------------
-- 3. Eventos (§5.7): só gravam se o cliente tem automação ATIVA daquele gatilho
-- ------------------------------------------------------------
create or replace function public.nx_auto_evento(p_cliente uuid, p_tipo text, p_ref jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  if p_cliente is null or current_setting('nx.backfill', true) = '1' then return null; end if;
  if not exists (select 1 from public.nx_automacoes a
                  where a.cliente_id = p_cliente and a.gatilho = p_tipo and a.ativo) then
    return null;
  end if;
  insert into public.nx_eventos (cliente_id, tipo, ref, origem_automacao, profundidade)
  values (p_cliente, p_tipo, jsonb_strip_nulls(coalesce(p_ref, '{}'::jsonb)),
          public.nx_auto_uuid(nullif(current_setting('nx.automacao', true), '')),
          coalesce(nullif(current_setting('nx.profundidade', true), '')::int, 0))
  returning id into v_id;
  return v_id;
end $$;

-- negócio: criado (+ entrou na 1ª etapa), mudou de etapa, ganho, perdido
create or replace function public.nx_tg_auto_negocio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare r jsonb;
begin
  if current_setting('nx.backfill', true) = '1' then return null; end if;
  if not exists (select 1 from public.nx_automacoes a
                  where a.cliente_id = new.cliente_id and a.ativo
                    and a.gatilho in ('negocio_criado', 'negocio_estagio', 'negocio_ganho', 'negocio_perdido')) then
    return null;
  end if;
  r := jsonb_build_object('negocio_id', new.id, 'contato_id', new.contato_id, 'funil_id', new.funil_id);
  if tg_op = 'INSERT' then
    perform public.nx_auto_evento(new.cliente_id, 'negocio_criado', r || jsonb_build_object('estagio_para', new.estagio_id));
    if new.estagio_id is not null then
      perform public.nx_auto_evento(new.cliente_id, 'negocio_estagio', r || jsonb_build_object('estagio_para', new.estagio_id));
    end if;
    return null;
  end if;
  if new.estagio_id is distinct from old.estagio_id and new.estagio_id is not null then
    perform public.nx_auto_evento(new.cliente_id, 'negocio_estagio',
      r || jsonb_build_object('estagio_de', old.estagio_id, 'estagio_para', new.estagio_id));
  end if;
  if new.status is distinct from old.status and new.status in ('ganho', 'perdido') then
    perform public.nx_auto_evento(new.cliente_id, 'negocio_' || new.status, r || jsonb_build_object('estagio_para', new.estagio_id));
  end if;
  return null;
end $$;

-- conversa nova (não oculta)
create or replace function public.nx_tg_auto_conversa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.oculta then return null; end if;
  perform public.nx_auto_evento(new.cliente_id, 'conversa_nova', jsonb_build_object(
    'conversa_id', new.id, 'contato_id', new.contato_id, 'canal_id', new.canal_id, 'departamento_id', new.departamento_id));
  return null;
end $$;

-- etiqueta nova em contato ou conversa → um evento por etiqueta acrescentada
create or replace function public.nx_tg_auto_etiqueta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare e uuid;
begin
  if not exists (select 1 from public.nx_automacoes a
                  where a.cliente_id = new.cliente_id and a.gatilho = 'etiqueta_adicionada' and a.ativo) then
    return null;
  end if;
  for e in select x from unnest(new.etiquetas) x where not (x = any(coalesce(old.etiquetas, '{}'::uuid[]))) loop
    if tg_table_name = 'nx_conversas' then
      if new.oculta then continue; end if;
      perform public.nx_auto_evento(new.cliente_id, 'etiqueta_adicionada', jsonb_build_object(
        'conversa_id', new.id, 'contato_id', new.contato_id, 'etiqueta_id', e, 'alvo', 'conversa'));
    else
      perform public.nx_auto_evento(new.cliente_id, 'etiqueta_adicionada', jsonb_build_object(
        'contato_id', new.id, 'etiqueta_id', e, 'alvo', 'contato'));
    end if;
  end loop;
  return null;
end $$;

-- mensagem recebida (in, não sistema/nota; conversa oculta não gera)
create or replace function public.nx_tg_auto_mensagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.nx_automacoes a
                  where a.cliente_id = new.cliente_id and a.gatilho = 'mensagem_recebida' and a.ativo) then
    return null;
  end if;
  if exists (select 1 from public.nx_conversas cv where cv.id = new.conversa_id and cv.oculta) then return null; end if;
  perform public.nx_auto_evento(new.cliente_id, 'mensagem_recebida', jsonb_build_object(
    'mensagem_id', new.id, 'conversa_id', new.conversa_id, 'contato_id', new.contato_id,
    'canal_id', new.canal_id, 'texto', left(new.corpo, 500)));
  return null;
end $$;

-- carimbo pego_em quando o item da fila vira 'enviando'
create or replace function public.nx_tg_fila_pego()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.pego_em := now();
  return new;
end $$;

-- WHEN nos gatilhos: nada roda nas atualizações que não interessam (a conversa é
-- atualizada a cada mensagem). Sem "UPDATE OF": mudança feita por gatilho BEFORE
-- (etapa ↔ marco da F1) não conta para a lista de colunas, mas conta no WHEN.
drop trigger if exists nx_auto_ev_negocio_ins on public.nx_leads;
create trigger nx_auto_ev_negocio_ins after insert on public.nx_leads
  for each row execute function public.nx_tg_auto_negocio();
drop trigger if exists nx_auto_ev_negocio_upd on public.nx_leads;
create trigger nx_auto_ev_negocio_upd after update on public.nx_leads
  for each row when (old.estagio_id is distinct from new.estagio_id or old.status is distinct from new.status)
  execute function public.nx_tg_auto_negocio();

drop trigger if exists nx_auto_ev_conversa on public.nx_conversas;
create trigger nx_auto_ev_conversa after insert on public.nx_conversas
  for each row execute function public.nx_tg_auto_conversa();
drop trigger if exists nx_auto_ev_conversa_etq on public.nx_conversas;
create trigger nx_auto_ev_conversa_etq after update on public.nx_conversas
  for each row when (old.etiquetas is distinct from new.etiquetas)
  execute function public.nx_tg_auto_etiqueta();

drop trigger if exists nx_auto_ev_contato_etq on public.nx_contatos;
create trigger nx_auto_ev_contato_etq after update on public.nx_contatos
  for each row when (old.etiquetas is distinct from new.etiquetas)
  execute function public.nx_tg_auto_etiqueta();

drop trigger if exists nx_auto_ev_mensagem on public.nx_mensagens;
create trigger nx_auto_ev_mensagem after insert on public.nx_mensagens
  for each row when (new.direcao = 'in' and new.tipo not in ('sistema', 'nota'))
  execute function public.nx_tg_auto_mensagem();

drop trigger if exists nx_fila_pego on public.nx_envios_fila;
create trigger nx_fila_pego before update on public.nx_envios_fila
  for each row when (new.status = 'enviando' and old.status is distinct from 'enviando')
  execute function public.nx_tg_fila_pego();

-- ------------------------------------------------------------
-- 4. Validação e normalização (§5.8) — as MESMAS frases do auto-logica.validar
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
  i int; n int; v_id uuid; v_id2 uuid; v_txt text; v_campo text; v_op text; v_tipo text; p text;
  t public.nx_templates; e public.nx_estagios;
begin
  if v_nome = '' then perform public.nx_auto_falha('dê um nome à automação'); end if;
  if char_length(v_nome) > 80 then perform public.nx_auto_falha('o nome pode ter até 80 caracteres'); end if;
  if v_gat is null or v_gat not in ('conversa_nova', 'mensagem_recebida', 'negocio_criado', 'negocio_estagio',
      'negocio_ganho', 'negocio_perdido', 'etiqueta_adicionada', 'sem_resposta', 'tempo_no_estagio',
      'tarefa_vencida', 'antes_da_data') then
    perform public.nx_auto_falha('escolha o gatilho em «Quando»');
  end if;

  -- ---------------------------------------------------------- Quando (config)
  case v_gat
    when 'conversa_nova' then
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
        'enviar_mensagem', 'enviar_template', 'atribuir', 'etiquetar', 'notificar', 'resolver_conversa', 'alerta_whatsapp') then
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
        if coalesce(x ->> 'modo', '') not in ('rodizio', 'conta') then perform public.nx_auto_falha(p || ': escolha como atribuir'); end if;
        v_id := null;
        if x ->> 'modo' = 'conta' then
          v_id := public.nx_auto_uuid(x ->> 'conta_id');
          if v_id is null or not public.nx_auto_ref_ok(p_cliente, 'conta', v_id) then
            perform public.nx_auto_falha(p || ': escolha a pessoa');
          end if;
        end if;
        y := jsonb_strip_nulls(jsonb_build_object('tipo', 'atribuir', 'modo', x ->> 'modo', 'conta_id', v_id,
          'departamento_id', public.nx_auto_id(p_cliente, 'departamento', x ->> 'departamento_id', p || ': o departamento escolhido não existe mais')));
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
      when 'notificar' then
        if coalesce(x ->> 'para', '') not in ('responsavel', 'admins') then
          v_id := public.nx_auto_uuid(x ->> 'para');
          if v_id is null or not public.nx_auto_ref_ok(p_cliente, 'conta', v_id) then
            perform public.nx_auto_falha(p || ': escolha quem recebe o aviso');
          end if;
        end if;
        v_txt := btrim(coalesce(x ->> 'titulo', ''));
        if v_txt = '' then perform public.nx_auto_falha(p || ': escreva o título do aviso'); end if;
        if char_length(v_txt) > 120 then perform public.nx_auto_falha(p || ': o título do aviso pode ter até 120 caracteres'); end if;
        if char_length(coalesce(x ->> 'texto', '')) > 500 then
          perform public.nx_auto_falha(p || ': o detalhe do aviso pode ter até 500 caracteres');
        end if;
        y := jsonb_strip_nulls(jsonb_build_object('tipo', 'notificar', 'para', x ->> 'para', 'titulo', v_txt,
                                                  'texto', nullif(btrim(coalesce(x ->> 'texto', '')), '')));
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
-- 5. Execução: alvo, dados, condições, variáveis, ações
-- ------------------------------------------------------------

-- completa o alvo (§5.8): negócio + contato + conversa aberta mais recente;
-- conversa/mensagem + contato + negócio vinculado (ou aberto mais recente).
-- Todo id é conferido contra o cliente (id de outro cliente vira null).
create or replace function public.nx_auto_alvo(p_cliente uuid, p_ref jsonb)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  r jsonb := coalesce(p_ref, '{}'::jsonb);
  v_neg bigint; v_ct bigint; v_cv bigint; v_tf bigint; x bigint; y bigint;
begin
  v_neg := case when (r ->> 'negocio_id') ~ '^[0-9]{1,18}$' then (r ->> 'negocio_id')::bigint end;
  v_ct := case when (r ->> 'contato_id') ~ '^[0-9]{1,18}$' then (r ->> 'contato_id')::bigint end;
  v_cv := case when (r ->> 'conversa_id') ~ '^[0-9]{1,18}$' then (r ->> 'conversa_id')::bigint end;
  v_tf := case when (r ->> 'tarefa_id') ~ '^[0-9]{1,18}$' then (r ->> 'tarefa_id')::bigint end;

  if v_tf is not null then
    select t.negocio_id, t.contato_id into x, y from public.nx_tarefas t where t.id = v_tf and t.cliente_id = p_cliente;
    if not found then v_tf := null; else v_neg := coalesce(v_neg, x); v_ct := coalesce(v_ct, y); end if;
  end if;
  if v_cv is not null then
    select cv.negocio_id, cv.contato_id into x, y from public.nx_conversas cv where cv.id = v_cv and cv.cliente_id = p_cliente;
    if not found then v_cv := null; else v_neg := coalesce(v_neg, x); v_ct := coalesce(v_ct, y); end if;
  end if;
  if v_neg is not null then
    select l.contato_id into x from public.nx_leads l where l.id = v_neg and l.cliente_id = p_cliente;
    if not found then v_neg := null; else v_ct := coalesce(v_ct, x); end if;
  end if;
  if v_ct is not null and not exists (select 1 from public.nx_contatos k where k.id = v_ct and k.cliente_id = p_cliente) then
    v_ct := null;
  end if;
  if v_cv is null and v_ct is not null then
    select cv.id into v_cv from public.nx_conversas cv
     where cv.contato_id = v_ct and cv.cliente_id = p_cliente and cv.status <> 'resolvida' and not cv.oculta
     order by cv.ultima_msg_em desc, cv.id desc limit 1;
  end if;
  if v_neg is null and v_ct is not null then
    select l.id into v_neg from public.nx_leads l
     where l.contato_id = v_ct and l.cliente_id = p_cliente and l.status = 'aberto'
     order by l.criado_em desc, l.id desc limit 1;
  end if;
  return r || jsonb_build_object('negocio_id', v_neg, 'contato_id', v_ct, 'conversa_id', v_cv, 'tarefa_id', v_tf);
end $$;

-- retrato do alvo para condições e variáveis (lido de novo antes de cada ação)
create or replace function public.nx_auto_dados(p_cliente uuid, p_alvo jsonb)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  d jsonb;
  v_neg bigint := (p_alvo ->> 'negocio_id')::bigint;
  v_ct bigint := (p_alvo ->> 'contato_id')::bigint;
  v_cv bigint := (p_alvo ->> 'conversa_id')::bigint;
  v_tf bigint := (p_alvo ->> 'tarefa_id')::bigint;
  j jsonb;
begin
  d := jsonb_build_object('texto', p_alvo ->> 'texto',
                          'empresa', (select c.nome from public.nx_clientes c where c.id = p_cliente));
  if v_neg is not null then
    select to_jsonb(l) - 'obs' into j from public.nx_leads l where l.id = v_neg and l.cliente_id = p_cliente;
    if j is not null then
      d := d || jsonb_build_object('negocio', j,
        'estagio_nome', (select s.nome from public.nx_estagios s where s.id = (j ->> 'estagio_id')::uuid),
        'dono_nome', (select k.nome from public.nx_contas k where k.id = (j ->> 'dono_id')::uuid));
    end if;
  end if;
  if v_ct is not null then
    select to_jsonb(k) - 'busca' - 'obs' into j from public.nx_contatos k where k.id = v_ct and k.cliente_id = p_cliente;
    if j is not null then d := d || jsonb_build_object('contato', j); end if;
  end if;
  if v_cv is not null then
    select to_jsonb(cv) into j from public.nx_conversas cv where cv.id = v_cv and cv.cliente_id = p_cliente;
    if j is not null then
      d := d || jsonb_build_object('conversa', j,
        'atendente_nome', (select k.nome from public.nx_contas k where k.id = (j ->> 'atribuida_a')::uuid));
    end if;
  end if;
  if v_tf is not null then
    select to_jsonb(t) into j from public.nx_tarefas t where t.id = v_tf and t.cliente_id = p_cliente;
    if j is not null then d := d || jsonb_build_object('tarefa', j); end if;
  end if;
  return d;
end $$;

-- uma condição (§5.8)
create or replace function public.nx_auto_cond_ok(p_c jsonb, p_d jsonb)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_campo text := p_c ->> 'campo';
  v_op text := p_c ->> 'op';
  v_val text := p_c ->> 'valor';
  v text; k text; lst text[]; nv numeric; nx numeric;
begin
  if v_campo = 'etiqueta' then
    select coalesce(array_agg(distinct z), '{}'::text[]) into lst from (
      select jsonb_array_elements_text(coalesce(p_d #> '{contato,etiquetas}', '[]'::jsonb)) z
      union all select jsonb_array_elements_text(coalesce(p_d #> '{negocio,etiquetas}', '[]'::jsonb))
      union all select jsonb_array_elements_text(coalesce(p_d #> '{conversa,etiquetas}', '[]'::jsonb))) s;
    return case v_op
      when 'vazio' then cardinality(lst) = 0
      when 'preenchido' then cardinality(lst) > 0
      when 'igual' then v_val = any(lst)
      when 'contem' then v_val = any(lst)
      when 'diferente' then not (v_val = any(lst))
      when 'nao_contem' then not (v_val = any(lst))
      else false end;
  end if;

  if v_campo like 'contato.%' then
    k := substr(v_campo, 9);
    v := coalesce(p_d #>> array['contato', 'campos', k],
                  case when k in ('nome', 'email', 'cidade', 'uf', 'origem', 'documento', 'telefone', 'nascimento')
                       then p_d #>> array['contato', k] end);
  else
    v := case v_campo
      when 'origem' then coalesce(p_d #>> '{negocio,origem}', p_d #>> '{contato,origem}')
      when 'funil_id' then p_d #>> '{negocio,funil_id}'
      when 'estagio_id' then p_d #>> '{negocio,estagio_id}'
      when 'canal_id' then p_d #>> '{conversa,canal_id}'
      when 'departamento_id' then p_d #>> '{conversa,departamento_id}'
      when 'dono_id' then coalesce(p_d #>> '{negocio,dono_id}', p_d #>> '{conversa,atribuida_a}', p_d #>> '{contato,dono_id}')
      when 'valor' then coalesce(p_d #>> '{negocio,valor}', p_d #>> '{negocio,valor_previsto}')
      when 'texto' then p_d ->> 'texto'
    end;
  end if;

  if v_op = 'vazio' then return v is null or btrim(v) = ''; end if;
  if v_op = 'preenchido' then return v is not null and btrim(v) <> ''; end if;
  v_val := coalesce(v_val, '');

  if v_op in ('maior', 'menor') or v_campo = 'valor' then
    if v is null then return v_op = 'diferente'; end if;
    if btrim(v) ~ '^-?[0-9]+(\.[0-9]+)?$' and replace(btrim(v_val), ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then
      nv := btrim(v)::numeric; nx := replace(btrim(v_val), ',', '.')::numeric;
      return case v_op when 'maior' then nv > nx when 'menor' then nv < nx
                       when 'igual' then nv = nx when 'diferente' then nv <> nx else false end;
    end if;
    if v_op in ('maior', 'menor') then   -- datas ISO e textos: ordem de texto
      return case v_op when 'maior' then btrim(v) > btrim(v_val) else btrim(v) < btrim(v_val) end;
    end if;
  end if;

  return case v_op
    when 'igual' then public.nx_auto_norm(v) = public.nx_auto_norm(v_val)
    when 'diferente' then public.nx_auto_norm(v) <> public.nx_auto_norm(v_val)
    when 'contem' then position(public.nx_auto_norm(v_val) in public.nx_auto_norm(v)) > 0
    when 'nao_contem' then position(public.nx_auto_norm(v_val) in public.nx_auto_norm(v)) = 0
    else false end;
end $$;

-- todas as condições valem?
create or replace function public.nx_auto_condicoes(p_conds jsonb, p_d jsonb)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
declare c jsonb;
begin
  for c in select value from jsonb_array_elements(coalesce(p_conds, '[]'::jsonb)) loop
    if not coalesce(public.nx_auto_cond_ok(c, p_d), false) then return false; end if;
  end loop;
  return true;
end $$;

-- o config do gatilho de EVENTO bate com o evento?
create or replace function public.nx_auto_config_ok(p_gatilho text, p_cfg jsonb, p_ref jsonb)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
declare c jsonb := coalesce(p_cfg, '{}'::jsonb); r jsonb := coalesce(p_ref, '{}'::jsonb); v_txt text;
begin
  case p_gatilho
    when 'conversa_nova' then
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

-- variáveis de §5.8 (datas e horas em SP)
create or replace function public.nx_auto_texto(p_txt text, p_d jsonb)
returns text
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  r text := coalesce(p_txt, '');
  v_nome text; v_valor numeric; v_ce timestamptz; v_dc date;
begin
  if position('{' in r) = 0 then return r; end if;
  v_nome := btrim(coalesce(nullif(btrim(p_d #>> '{contato,nome}'), ''), p_d #>> '{negocio,nome}', ''));
  v_valor := coalesce((p_d #>> '{negocio,valor}')::numeric, (p_d #>> '{negocio,valor_previsto}')::numeric);
  v_ce := (p_d #>> '{negocio,consulta_em}')::timestamptz;
  v_dc := (p_d #>> '{negocio,data_consulta}')::date;
  r := replace(r, '{primeiro_nome}', split_part(v_nome, ' ', 1));
  r := replace(r, '{nome}', v_nome);
  r := replace(r, '{empresa}', coalesce(p_d ->> 'empresa', ''));
  r := replace(r, '{protocolo}', coalesce(p_d #>> '{conversa,protocolo}', ''));
  r := replace(r, '{etapa}', coalesce(p_d ->> 'estagio_nome', ''));
  r := replace(r, '{valor}', case when v_valor is null then ''
                                  else 'R$ ' || translate(to_char(v_valor, 'FM999,999,999,990.00'), ',.', '.,') end);
  r := replace(r, '{atendente}', split_part(btrim(coalesce(p_d ->> 'atendente_nome', p_d ->> 'dono_nome', '')), ' ', 1));
  r := replace(r, '{data_consulta}', coalesce(to_char(v_ce at time zone 'America/Sao_Paulo', 'DD/MM'), to_char(v_dc, 'DD/MM'), ''));
  r := replace(r, '{hora_consulta}', coalesce(to_char(v_ce at time zone 'America/Sao_Paulo', 'HH24:MI'), ''));
  return r;
end $$;

-- mensagem de sistema na conversa (mesmo formato do nx_cv_sistema da F5; não mexe em ultima_msg_*)
create or replace function public.nx_auto_sistema(p_conversa bigint, p_texto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status, origem)
  select cv.cliente_id, cv.id, cv.contato_id, cv.canal_id, 'out', 'sistema', left(p_texto, 4096), 'enviada', 'automacao'
    from public.nx_conversas cv where cv.id = p_conversa;
end $$;

-- quando a mensagem pode sair (respeitar_horario → próxima abertura do departamento da conversa, ou do padrão)
create or replace function public.nx_auto_quando(p_cliente uuid, p_conversa bigint, p_respeitar boolean)
returns timestamptz
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_h jsonb; v_dep uuid;
begin
  if not coalesce(p_respeitar, false) then return now(); end if;
  select cv.departamento_id into v_dep from public.nx_conversas cv where cv.id = p_conversa and cv.cliente_id = p_cliente;
  if v_dep is not null then
    select d.horario into v_h from public.nx_departamentos d where d.id = v_dep;
  else
    select d.horario into v_h from public.nx_departamentos d where d.cliente_id = p_cliente and d.padrao;
  end if;
  return coalesce(public.nx_proximo_horario(v_h, now()), now());
end $$;

-- abre a conversa como o nx_cv_nova (sem atribuir), para o modelo sair para quem não escreveu nas últimas 24 h
create or replace function public.nx_auto_abrir_conversa(p_cliente uuid, p_contato bigint, p_canal uuid,
                                                         p_negocio bigint, p_auto_nome text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint; v_dep uuid; v_ue timestamptz;
begin
  select cv.id into v_id from public.nx_conversas cv
   where cv.cliente_id = p_cliente and cv.canal_id = p_canal and cv.contato_id = p_contato and cv.status <> 'resolvida'
   order by cv.id desc limit 1;
  if v_id is not null then return v_id; end if;
  select k.departamento_id into v_dep from public.nx_canais k where k.id = p_canal and k.cliente_id = p_cliente;
  if v_dep is null then
    select d.id into v_dep from public.nx_departamentos d where d.cliente_id = p_cliente and d.padrao;
  end if;
  select max(cv.ultima_entrada_em) into v_ue from public.nx_conversas cv
   where cv.cliente_id = p_cliente and cv.contato_id = p_contato and cv.canal_id = p_canal;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, negocio_id, protocolo,
                                   status, aguardando, ultima_entrada_em, ultima_msg_em)
  values (p_cliente, p_canal, p_contato, v_dep,
          (select l.id from public.nx_leads l where l.id = p_negocio and l.cliente_id = p_cliente),
          public.nx_protocolo(p_cliente), 'aberta', false, v_ue, now())
  on conflict (cliente_id, canal_id, contato_id) where status <> 'resolvida' do nothing
  returning id into v_id;
  if v_id is null then
    select cv.id into v_id from public.nx_conversas cv
     where cv.cliente_id = p_cliente and cv.canal_id = p_canal and cv.contato_id = p_contato and cv.status <> 'resolvida'
     order by cv.id desc limit 1;
    return v_id;
  end if;
  perform public.nx_auto_sistema(v_id, left('Conversa iniciada pela automação «' || coalesce(p_auto_nome, '') || '»', 4096));
  return v_id;
end $$;

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

-- executa as ações em ordem; devolve o detalhe ("tarefa «X» para Ana · aviso para 2 pessoas").
-- Erro numa ação: relança com DETAIL 'acao:<n>:<tipo>' (o motor desfaz a automação inteira e grava o erro).
create or replace function public.nx_auto_acoes(p_auto public.nx_automacoes, p_alvo jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c uuid := p_auto.cliente_id;
  v_alvo jsonb := coalesce(p_alvo, '{}'::jsonb);
  v_d jsonb; ac jsonb; i int := 0; v_tipo text; v_det text[] := '{}';
  v_neg bigint; v_ct bigint; v_cv bigint; v_conta uuid; v_id uuid; v_n int; v_quando timestamptz;
  v_txt text; v_titulo text; v_link text; v_ntipo text; v_nome text; v_funil uuid; v_novo bigint;
  v_pars jsonb; v_par text; v_raw text; v_ue timestamptz; v_canal uuid; v_fila bigint; v_optin boolean;
  e public.nx_estagios; t public.nx_templates;
  v_msg text; v_hint text; v_st text;
  v_conversa_primeiro boolean := p_auto.gatilho in ('conversa_nova', 'mensagem_recebida', 'sem_resposta');
begin
  for ac in select value from jsonb_array_elements(coalesce(p_auto.acoes, '[]'::jsonb)) loop
    i := i + 1;
    v_tipo := ac ->> 'tipo';
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
          select * into e from public.nx_estagios s where s.id = public.nx_auto_uuid(ac ->> 'estagio_id') and s.cliente_id = v_c;
          if e.id is null then raise exception 'estagio_invalido' using errcode = '22023', hint = 'nao_encontrado'; end if;
          if (v_d #>> '{negocio,estagio_id}')::uuid = e.id then
            v_det := v_det || ('já estava em «' || e.nome || '»');
          else
            if e.tipo = 'ganho' and coalesce((v_d #>> '{negocio,valor}')::numeric, (v_d #>> '{negocio,valor_previsto}')::numeric) is null then
              raise exception 'valor_obrigatorio' using errcode = '22023';
            end if;
            -- mesmas datas que o CRM (nx_negocio_mover) e o painel clássico gravam: "agendada" carimba
            -- data_agenda (hoje, se vazia) e "fechou" carimba data_consulta — senão o nucleo.js conta o
            -- agendamento no dia da conversa e os números mudam conforme quem moveu
            update public.nx_leads l set
              estagio_id = e.id,
              ordem = -extract(epoch from clock_timestamp()),
              valor = case when e.tipo = 'ganho' then coalesce(l.valor, l.valor_previsto) else l.valor end,
              data_agenda = case when e.marco = 'agendada' then coalesce(l.data_agenda, (now() at time zone 'America/Sao_Paulo')::date) else l.data_agenda end,
              data_consulta = case when e.marco = 'fechou' then coalesce(l.data_consulta, (now() at time zone 'America/Sao_Paulo')::date) else l.data_consulta end,
              motivo_perda_txt = case when e.tipo = 'perdido' then coalesce(l.motivo_perda_txt, left('Automação «' || p_auto.nome || '»', 500)) else l.motivo_perda_txt end
             where l.id = v_neg and l.cliente_id = v_c;
            v_det := v_det || ('movido para «' || e.nome || '»');
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
        if v_ct is null then
          v_det := v_det || 'mensagem: pulada (sem contato)'::text;
        elsif coalesce((v_d #>> '{contato,bloqueado}')::boolean, false) then
          v_det := v_det || 'mensagem: pulada (contato bloqueado)'::text;
        elsif v_cv is null or (v_d #>> '{conversa,canal_id}') is null then
          v_det := v_det || 'mensagem: pulada (sem conversa aberta)'::text;
        else
          v_txt := btrim(public.nx_auto_texto(ac ->> 'texto', v_d));
          if v_txt = '' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'mensagem vazia'; end if;
          v_quando := public.nx_auto_quando(v_c, v_cv, p_auto.respeitar_horario);
          v_ue := (v_d #>> '{conversa,ultima_entrada_em}')::timestamptz;
          if v_ue is null or v_quando >= v_ue + interval '24 hours' then
            v_det := v_det || case when v_optin is false then 'mensagem: pulada (contato pediu para não receber)'
                                   else 'mensagem: pulada (fora da janela de 24 h)' end;
          else
            insert into public.nx_envios_fila (cliente_id, conversa_id, contato_id, canal_id, tipo, texto, origem, automacao_id, enviar_em)
            values (v_c, v_cv, v_ct, (v_d #>> '{conversa,canal_id}')::uuid, 'texto', left(v_txt, 4096), 'automacao', p_auto.id, v_quando)
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

      -- -------------------------------------------------- notificar
      when 'notificar' then
        v_conta := case ac ->> 'para'
          when 'responsavel' then coalesce((v_d #>> '{negocio,dono_id}')::uuid, (v_d #>> '{conversa,atribuida_a}')::uuid, (v_d #>> '{contato,dono_id}')::uuid)
          when 'admins' then null
          else public.nx_auto_uuid(ac ->> 'para') end;
        v_ntipo := case p_auto.gatilho when 'sem_resposta' then 'sem_resposta' when 'tarefa_vencida' then 'tarefa' else 'automacao' end;
        v_link := case
          when v_conversa_primeiro and v_cv is not null then '#/conversas/' || v_cv
          when v_neg is not null then '#/crm/negocio/' || v_neg
          when v_cv is not null then '#/conversas/' || v_cv
          when v_ct is not null then '#/contatos/' || v_ct
          when p_auto.gatilho = 'tarefa_vencida' then '#/tarefas' end;
        v_titulo := left(coalesce(nullif(btrim(public.nx_auto_texto(ac ->> 'titulo', v_d)), ''), p_auto.nome), 120);
        v_txt := nullif(left(btrim(public.nx_auto_texto(ac ->> 'texto', v_d)), 500), '');
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
        -- execuções ok desta automação na última hora que não pularam o alerta (o detalhe pode vir cortado)
        if (select count(*) from public.nx_auto_execucoes x
             where x.automacao_id = p_auto.id and x.criado_em > now() - interval '1 hour' and x.ok
               and x.detalhe not like '%alerta: pulado%' and x.detalhe <> 'Condições não atendidas — nada feito.') >= 20 then
          v_det := v_det || 'alerta: pulado (limite de 20 por hora desta automação)'::text;
        else
          v_txt := left(btrim(public.nx_auto_texto(ac ->> 'texto', v_d)), 1000);
          perform public.nx_disparar('nx-enviar', jsonb_build_object('alerta', jsonb_build_object('cliente', v_c, 'texto', v_txt)));
          v_det := v_det || 'alerta pedido ao WhatsApp do gestor'::text;
        end if;

      else
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'ação desconhecida';
      end case;
    exception when others then
      get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint, v_st = returned_sqlstate;
      raise exception using message = v_msg, hint = coalesce(v_hint, ''), detail = 'acao:' || i || ':' || coalesce(v_tipo, '?'), errcode = v_st;
    end;
  end loop;
  return array_to_string(v_det, ' · ');
end $$;

-- roda UMA automação para UM alvo, com dedupe pela chave. Devolve ok | erro | pulou | repetido | pendente.
-- p_tempo = gatilho de tempo: condição que não vale também grava a chave (senão o mesmo alvo
-- voltaria em toda rodada e tomaria a vez dos outros).
create or replace function public.nx_auto_rodar(p_auto public.nx_automacoes, p_ref jsonb, p_chave text,
                                                p_evento bigint, p_prof int, p_tempo boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alvo jsonb; v_d jsonb; v_det text; v_quem text;
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
    v_det := public.nx_auto_acoes(p_auto, v_alvo);
    v_quem := coalesce(nullif(btrim(v_d #>> '{contato,nome}'), ''), nullif(btrim(v_d #>> '{negocio,nome}'), ''),
                       nullif(btrim(v_d #>> '{tarefa,titulo}'), ''));
    insert into public.nx_auto_execucoes (automacao_id, cliente_id, evento_id, chave, ok, detalhe)
    values (p_auto.id, p_auto.cliente_id, p_evento, p_chave, true,
            left(coalesce(v_quem || ': ', '') || coalesce(nullif(v_det, ''), 'nada a fazer'), 1000))
    on conflict (automacao_id, chave) do nothing;
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
      insert into public.nx_auto_execucoes (automacao_id, cliente_id, evento_id, chave, ok, detalhe)
      values (p_auto.id, p_auto.cliente_id, p_evento, p_chave, false,
              left(public.nx_auto_erro_texto(v_msg, v_hint, v_detalhe), 1000))
      on conflict (automacao_id, chave) do nothing;
      update public.nx_automacoes set erros = erros + 1, ultima_execucao_em = now() where id = p_auto.id;
      return 'erro';
  end;
end $$;

-- alvos dos gatilhos de TEMPO (§5.7 passo 3), sem os já executados (chave)
create or replace function public.nx_auto_alvos_tempo(p_auto public.nx_automacoes, p_lim int)
returns table (chave text, ref jsonb)
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  c jsonb := coalesce(p_auto.config, '{}'::jsonb);
  v_min int; v_h int; v_dep uuid; v_est uuid; v_funil uuid; v_so boolean; v_hpad jsonb;
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
  else
    return;
  end case;
end $$;

-- o cliente pode rodar automações? (módulo ligado; ativo ou teste em dia; org não suspensa)
create or replace function public.nx_auto_cliente_apto(p_cliente uuid, p_modulo text default 'automacoes')
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1 from public.nx_clientes c
      left join public.nx_orgs o on o.id = c.org_id
     where c.id = p_cliente
       and p_modulo = any(c.modulos)
       and c.status in ('ativo', 'teste')
       and (c.status <> 'teste' or c.teste_ate is null or c.teste_ate >= (now() at time zone 'America/Sao_Paulo')::date)
       and coalesce(o.status, 'ativo') <> 'suspenso');
end $$;

-- ------------------------------------------------------------
-- 6. Motor em lotes curtos (§5.7) — pg_cron a cada 15 s: select public.nx_auto_lote(25)
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
  ev public.nx_eventos; a public.nx_automacoes; r record;
  v_pend boolean; v_res text; v_resto int; v_n int;
  n_ev int := 0; n_exec int := 0; n_err int := 0; n_sla int := 0; n_tempo int := 0;
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

  -- 3. gatilhos de tempo — no máximo v_max alvos por chamada, revezando pela vez mais antiga em que a
  --    automação foi tocada: execução OU alvo marcado como "condições não atendidas" (esse não mexe na
  --    ultima_execucao_em mostrada na tela; sem contá-lo, uma automação com milhares de alvos que não
  --    passam na condição ficaria sempre na frente e seguraria as dos outros clientes)
  v_resto := v_max;
  for a in
    select x.* from public.nx_automacoes x
      left join lateral (select max(k.criado_em) as ult from public.nx_auto_execucoes k where k.automacao_id = x.id) u on true
     where x.ativo and x.gatilho in ('sem_resposta', 'tempo_no_estagio', 'tarefa_vencida', 'antes_da_data')
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

  -- 5. pulso uma vez por cliente tocado
  perform public.nx_pulso_lote_fim();
  perform set_config('nx.lote', '', true);
  return json_build_object(
    'eventos', n_ev, 'execucoes', n_exec, 'erros', n_err, 'tempo_alvos', n_tempo, 'sla_avisos', n_sla,
    'restantes', (select count(*) from (select 1 from public.nx_eventos e where e.processado_em is null limit 10000) s),
    'tempo_ms', round(extract(epoch from clock_timestamp() - t0) * 1000));
end $$;

-- ------------------------------------------------------------
-- 7. Fila (§5.7) — pg_cron a cada minuto: select public.nx_fila_chamar()
-- ------------------------------------------------------------
create or replace function public.nx_fila_chamar()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- envio travado há mais de 10 min volta para a fila (até 3 tentativas; depois falhou)
  update public.nx_envios_fila f set
    status = case when f.tentativas >= 3 then 'falhou' else 'pendente' end,
    erro = case when f.tentativas >= 3 then left(coalesce(f.erro || ' · ', '') || 'o envio não respondeu depois de 3 tentativas', 1000)
                else f.erro end,
    processado_em = case when f.tentativas >= 3 then now() else f.processado_em end,
    pego_em = null
  where f.status = 'enviando'
    and coalesce(f.pego_em, f.enviar_em + interval '50 minutes') < now() - interval '10 minutes';

  if exists (select 1 from public.nx_envios_fila f where f.status = 'pendente' and f.enviar_em <= now())
     or exists (select 1 from public.nx_midia_lixo m where m.apagado_em is null and m.erro is null) then
    begin
      perform public.nx_disparar('nx-enviar', '{"fila":true}'::jsonb);
    exception when others then
      -- nx_disparar ainda sem 'nx-enviar' (arquivo f) ou sem funcoes_url: os itens esperam a próxima rodada
      raise warning 'nx_fila_chamar: %', sqlerrm;
    end;
  end if;
end $$;

-- ------------------------------------------------------------
-- 8. Faxina diária (§5.9) — pg_cron 06:40 UTC: select public.nx_saas_faxina()
-- ------------------------------------------------------------
create or replace function public.nx_saas_faxina()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_ev int; n_ex int; n_no int; n_fi int; n_cv int; n_sl int; n_ml int; n_etq int := 0; v_n int; v_lim int := 5000;
begin
  delete from public.nx_eventos where processado_em is not null and processado_em < now() - interval '7 days';
  get diagnostics n_ev = row_count;
  delete from public.nx_auto_execucoes where criado_em < now() - interval '60 days';
  get diagnostics n_ex = row_count;
  delete from public.nx_notificacoes where lida_em is not null and criado_em < now() - interval '60 days';
  get diagnostics n_no = row_count;
  delete from public.nx_envios_fila
   where status in ('enviado', 'falhou', 'pulado', 'cancelado') and coalesce(processado_em, criado_em) < now() - interval '30 days';
  get diagnostics n_fi = row_count;
  delete from public.nx_convites where expira_em < now() - interval '30 days';
  get diagnostics n_cv = row_count;
  delete from public.nx_senha_links where expira_em < now() - interval '30 days';
  get diagnostics n_sl = row_count;
  delete from public.nx_midia_lixo where apagado_em is not null and apagado_em < now() - interval '30 days';
  get diagnostics n_ml = row_count;

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

  -- histórico do pg_cron só dos jobs do SaaS (o de 15 s gera ~5.800 linhas/dia)
  begin
    delete from cron.job_run_details
     where end_time < now() - interval '3 days'
       and jobid in (select j.jobid from cron.job j where j.jobname in ('nx-automacoes', 'nx-fila', 'nx-faxina-saas'));
  exception when others then null;
  end;

  return json_build_object('eventos', n_ev, 'execucoes', n_ex, 'notificacoes', n_no, 'fila', n_fi, 'convites', n_cv,
                           'senha_links', n_sl, 'midia_lixo', n_ml, 'etiquetas_orfas', n_etq);
end $$;

-- ------------------------------------------------------------
-- 9. RPCs do painel (§5.7) · módulo 'automacoes'
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
    'base', json_build_object(
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
          from public.nx_campos c where c.cliente_id = p_cliente and c.entidade = 'contato' and c.ativo), '[]'::json)),
    'limite', json_build_object('usadas', (select count(*) from public.nx_automacoes a where a.cliente_id = p_cliente),
                                'limite', public.nx_limite(p_cliente, 'automacoes')),
    'vertical', v_vert,
    'pode_editar', public.nx_rank(v.papel) >= 3);
end $$;

create or replace function public.nx_automacao_salvar(p_token text, p_cliente uuid, p_auto jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  v_id uuid; v_ligar boolean; n jsonb; a public.nx_automacoes; v_pos bigint;
begin
  perform public.nx_exigir_modulo(p_cliente, 'automacoes');
  if p_auto is null or jsonb_typeof(p_auto) <> 'object' then perform public.nx_auto_falha('dados da automação inválidos'); end if;
  if coalesce(btrim(p_auto ->> 'id'), '') <> '' then
    v_id := public.nx_auto_uuid(p_auto ->> 'id');
    if v_id is null then raise exception 'automacao_nao_encontrada' using errcode = '22023'; end if;
    select * into a from public.nx_automacoes x where x.id = v_id and x.cliente_id = p_cliente for update;
    if a.id is null then raise exception 'automacao_nao_encontrada' using errcode = '22023'; end if;
  end if;
  v_ligar := case when p_auto ->> 'ativo' in ('true', 'false') then (p_auto ->> 'ativo')::boolean
                  else coalesce(a.ativo, false) end;
  -- alerta_whatsapp sai pelo número da Nexus para o WhatsApp do GESTOR: só a agência (gestor/super)
  -- configura. O editor esconde a ação; aqui fecha a porta para quem chama a RPC direto.
  if public.nx_rank(v.papel) < 4 and jsonb_typeof(p_auto -> 'acoes') = 'array' then
    select q.o into v_pos
      from jsonb_array_elements(p_auto -> 'acoes') with ordinality q(x, o)
     where jsonb_typeof(q.x) = 'object' and q.x ->> 'tipo' = 'alerta_whatsapp'
     order by q.o limit 1;
    if v_pos is not null then
      perform public.nx_auto_falha('ação ' || v_pos || ': o alerta no WhatsApp do gestor só pode ser configurado pela agência');
    end if;
  end if;
  n := public.nx_auto_normalizar(p_cliente, p_auto, v_ligar);
  if v_id is not null then
    update public.nx_automacoes set
      nome = n ->> 'nome', gatilho = n ->> 'gatilho', config = n -> 'config', condicoes = n -> 'condicoes',
      acoes = n -> 'acoes', respeitar_horario = (n ->> 'respeitar_horario')::boolean, ativo = v_ligar, atualizado_em = now()
     where id = v_id
    returning * into a;
  else
    perform public.nx_exigir_limite(p_cliente, 'automacoes');
    insert into public.nx_automacoes (cliente_id, nome, ativo, gatilho, config, condicoes, acoes, respeitar_horario, criado_por)
    values (p_cliente, n ->> 'nome', v_ligar, n ->> 'gatilho', n -> 'config', n -> 'condicoes', n -> 'acoes',
            (n ->> 'respeitar_horario')::boolean, v.conta_id)
    returning * into a;
  end if;
  return public.nx_auto_item(a)::json;
end $$;

create or replace function public.nx_automacao_ativar(p_token text, p_cliente uuid, p_id uuid, p_ativo boolean)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  a public.nx_automacoes; n jsonb;
begin
  perform public.nx_exigir_modulo(p_cliente, 'automacoes');
  select * into a from public.nx_automacoes x where x.id = p_id and x.cliente_id = p_cliente for update;
  if a.id is null then raise exception 'automacao_nao_encontrada' using errcode = '22023'; end if;
  if coalesce(p_ativo, false) then
    -- ligar confere tudo de novo (etapa apagada, modelo ainda não aprovado…)
    n := public.nx_auto_normalizar(p_cliente, jsonb_build_object('nome', a.nome, 'gatilho', a.gatilho, 'config', a.config,
           'condicoes', a.condicoes, 'acoes', a.acoes, 'respeitar_horario', a.respeitar_horario), true);
    update public.nx_automacoes set ativo = true, config = n -> 'config', condicoes = n -> 'condicoes', acoes = n -> 'acoes',
                                    atualizado_em = now()
     where id = a.id returning * into a;
  else
    update public.nx_automacoes set ativo = false, atualizado_em = now() where id = a.id returning * into a;
  end if;
  return public.nx_auto_item(a)::json;
end $$;

create or replace function public.nx_automacao_excluir(p_token text, p_cliente uuid, p_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); v_n int;
begin
  perform public.nx_exigir_modulo(p_cliente, 'automacoes');
  delete from public.nx_automacoes where id = p_id and cliente_id = p_cliente;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'automacao_nao_encontrada' using errcode = '22023'; end if;
  return json_build_object('ok', true);
end $$;

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
    select json_agg(json_build_object('criado_em', s.criado_em, 'ok', s.ok, 'detalhe', s.detalhe, 'chave', s.chave, 'link', s.link)
                    order by s.criado_em desc, s.id desc)
      from (select x.id, x.criado_em, x.ok, x.detalhe, x.chave,
                   case split_part(x.chave, ':', 1)
                     when 'sr' then '#/conversas/' || split_part(x.chave, ':', 2)
                     when 'te' then '#/crm/negocio/' || split_part(x.chave, ':', 2)
                     when 'ad' then '#/crm/negocio/' || split_part(x.chave, ':', 2)
                     when 'tv' then '#/tarefas'
                     when 'ev' then case
                       when e.ref ? 'negocio_id' and e.tipo like 'negocio_%' then '#/crm/negocio/' || (e.ref ->> 'negocio_id')
                       when e.ref ? 'conversa_id' then '#/conversas/' || (e.ref ->> 'conversa_id')
                       when e.ref ? 'contato_id' then '#/contatos/' || (e.ref ->> 'contato_id') end
                   end as link
              from public.nx_auto_execucoes x
              left join public.nx_eventos e on e.id = x.evento_id and e.cliente_id = x.cliente_id
             where x.automacao_id = p_id and x.cliente_id = p_cliente
               and not (x.ok and x.detalhe = 'Condições não atendidas — nada feito.')
             order by x.criado_em desc, x.id desc
             limit least(greatest(coalesce(p_limite, 50), 1), 200)) s), '[]'::json);
end $$;

-- ------------------------------------------------------------
-- 10. Permissões das funções deste arquivo
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'nx_auto_uuid', 'nx_auto_int', 'nx_auto_norm', 'nx_auto_falha', 'nx_auto_ref_ok', 'nx_auto_id',
         'nx_auto_evento', 'nx_tg_auto_negocio', 'nx_tg_auto_conversa', 'nx_tg_auto_etiqueta', 'nx_tg_auto_mensagem',
         'nx_tg_fila_pego', 'nx_auto_normalizar', 'nx_auto_alvo', 'nx_auto_dados', 'nx_auto_cond_ok', 'nx_auto_condicoes',
         'nx_auto_config_ok', 'nx_auto_texto', 'nx_auto_sistema', 'nx_auto_quando', 'nx_auto_abrir_conversa',
         'nx_auto_erro_texto', 'nx_auto_acoes', 'nx_auto_rodar', 'nx_auto_alvos_tempo', 'nx_auto_cliente_apto',
         'nx_auto_lote', 'nx_fila_chamar', 'nx_saas_faxina', 'nx_auto_item',
         'nx_automacoes_listar', 'nx_automacao_salvar', 'nx_automacao_ativar', 'nx_automacao_excluir', 'nx_automacao_execucoes')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    if r.proname in ('nx_automacoes_listar', 'nx_automacao_salvar', 'nx_automacao_ativar', 'nx_automacao_excluir',
                     'nx_automacao_execucoes') then
      execute format('grant execute on function %s to anon, authenticated, service_role', r.fn);
    else
      execute format('grant execute on function %s to service_role', r.fn);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 11. Agendamentos (§5.9) — idempotente: unschedule antes
--     Se o agendamento em segundos falhar: '* * * * *' com nx_auto_lote(40) (uma transação curta por minuto).
-- ------------------------------------------------------------
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname in ('nx-automacoes', 'nx-fila', 'nx-faxina-saas') loop
    perform cron.unschedule(j.jobid);
  end loop;
  begin
    perform cron.schedule('nx-automacoes', '15 seconds', 'select public.nx_auto_lote(25)');
  exception when others then
    perform cron.schedule('nx-automacoes', '* * * * *', 'select public.nx_auto_lote(40)');
  end;
  perform cron.schedule('nx-fila', '* * * * *', 'select public.nx_fila_chamar()');
  perform cron.schedule('nx-faxina-saas', '40 6 * * *', 'select public.nx_saas_faxina()');
end $$;

notify pgrst, 'reload schema';
