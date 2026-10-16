-- ============================================================
-- ÓRBITA — 20261015a_plano1000b.sql (plano «1000+ melhorias, rodada B», frente srv)
-- Migração ADITIVA e IDEMPOTENTE: colunas/índices com if not exists, funções com create or replace a partir da definição
-- EM VIGOR (a da migração mais recente que define cada uma). Três funções ganham parâmetro novo com default no fim
-- (nx_automacao_salvar, nx_automacao_execucoes, nx_cv_buscar_msgs): a assinatura antiga é removida ANTES (senão viraria
-- sobrecarga e o PostgREST não saberia qual chamar) e as permissões são regravadas no fim.
--
--   CB-005  nx_ddd_valido recusa o DDD 29 (não existe)
--   UB-212  nx_automacoes.atualizado_por; nx_auto_item devolve atualizado_por e atualizado_por_nome
--   UB-217  nx_automacoes_listar: itens[].mensagens_30d (envios da fila que saíram em 30 dias)
--   UB-213  nx_automacao_execucoes(p_busca, p_desde)        UB-214  … (p_filtradas): as «Condições não atendidas» com estado 'filtrada'
--   UB-211  nx_automacao_salvar(p_atualizado_em): recusa com edicao_desatualizada quando outra pessoa salvou antes (só confere se vier)
--   UB-216  condições «campanha» (contém) e «plataforma» (Meta/Google) no nx_auto_normalizar e no nx_auto_cond_ok
--   UB-219  gatilho tarefa_vencida com config.tipo_tarefa e config.dono_id opcionais (normalizar + nx_auto_alvos_tempo)
--   AB-007/008/009  rastreio: evento ('aquecimento'|'clique'), confirmação do clique na MESMA linha, eventos:true na resposta;
--           nx_rastreio_listar conta só clique (ou evento nulo, os antigos) em cliques/cliques_reais e o total em registros
--   AB-121  ttclid, msclkid e utm_id no rastreio do site e no formulário (nx_lead_entrada); ttclid/msclkid = anúncio
--   RB-256  nx_tarefas_listar: «Concluídas» dos últimos p_filtro.concluidas_dias (7 por padrão; 30; 0 = todas)
--   CB-209  nx_cv_listar: p_filtro.origem (origem do contato)
--   CB-206  nx_cv_buscar_msgs: origem e enviado_por_nome      CB-207  … (p_antes_id): «ver mais mensagens»
--   CB-208  nx_cv_marcar_nao_lida (RPC nova: dono da conversa ou conversa sem dono)
--   CB-203  nx_cv_base: ia_assistente_nome para todos os papéis
--   CB-211  nx_agenda_dia: nome da campanha/anúncio resolvido uma vez por campanha do período (não por consulta)
--   UB-223  nx_clientes.tema_anterior: nx_tema_salvar guarda a marca anterior; nx_tema_salvar/nx_cliente_tema devolvem
--   B-002   nx_alertas.enviando_em (reserva do radar antes do envio)   B-024/B-029 índices do radar e do custo de IA
-- Smoke: supabase/testes/33_plano1000b.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colunas e índices
-- ------------------------------------------------------------
-- UB-212: quem salvou/ligou/desligou por último (nulo nas antigas)
alter table public.nx_automacoes add column if not exists atualizado_por uuid references public.nx_contas(id) on delete set null;
-- AB-007/AB-121: o evento do registro (nulo = antigo, contado como clique) e os ids de clique novos
alter table public.nx_rastreio add column if not exists evento text check (evento in ('aquecimento', 'clique'));
alter table public.nx_rastreio add column if not exists utm_id text;
alter table public.nx_rastreio add column if not exists ttclid text;
alter table public.nx_rastreio add column if not exists msclkid text;
-- UB-223: uma versão anterior da marca (para «Voltar à marca anterior»)
alter table public.nx_clientes add column if not exists tema_anterior jsonb;
-- B-002: reserva do alerta do radar antes do envio (o reenvio não repete um alerta que saiu e não foi registrado)
alter table public.nx_alertas add column if not exists enviando_em timestamptz;
-- B-024: alertas não enviados do cliente (o reenvio do radar, toda hora)
create index if not exists nx_alertas_nao_enviados on public.nx_alertas (cliente_id, id) where enviado_em is null;
-- B-029: o aviso diário de custo de IA filtra só por data (sem cliente)
create index if not exists nx_ia_uso_criado on public.nx_ia_uso (criado_em);
-- UB-217: mensagens por automação (a contagem de 30 dias da lista)
create index if not exists nx_fila_automacao on public.nx_envios_fila (automacao_id, criado_em desc) where automacao_id is not null;

-- ------------------------------------------------------------
-- 2. Assinaturas antigas que ganham parâmetro (removidas ANTES do create, senão viram sobrecarga)
-- ------------------------------------------------------------
drop function if exists public.nx_automacao_salvar(text, uuid, jsonb);   -- lint:permitido troca de assinatura (UB-211: + p_atualizado_em default null)
drop function if exists public.nx_automacao_execucoes(text, uuid, uuid, integer);   -- lint:permitido troca de assinatura (UB-213/214: + p_busca, p_desde, p_filtradas)
drop function if exists public.nx_cv_buscar_msgs(text, uuid, text, integer);   -- lint:permitido troca de assinatura (CB-207: + p_antes_id)

-- ------------------------------------------------------------
-- CB-005 nx_ddd_valido: o DDD 29 não existe (2[12478])
--   (cópia da definição em vigor: 20261008a_entrada_lead_rastreio.sql)
-- ------------------------------------------------------------
create or replace function public.nx_ddd_valido(p text)
returns boolean
language sql immutable
security definer
set search_path = ''
as $$
  select coalesce(p, '') ~ '^(1[1-9]|2[12478]|3[1-578]|4[1-9]|5[13-5]|6[1-9]|7[13-579]|8[1-9]|9[1-9])$'
$$;

-- ------------------------------------------------------------
-- UB-212 nx_auto_item: + atualizado_por e atualizado_por_nome
--   (cópia da definição em vigor: 20261001a_automacoes_ia.sql)
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
    'criado_em', a.criado_em, 'atualizado_em', a.atualizado_em,
    -- plano 1000b · UB-212: quem mudou por último («Alterada por Ana, há 2 dias»); nulo nas que ninguém mexeu desde a 20261015a
    'atualizado_por', a.atualizado_por,
    'atualizado_por_nome', (select k.nome from public.nx_contas k where k.id = a.atualizado_por));
end $$;

-- ------------------------------------------------------------
-- UB-217 nx_automacoes_listar: itens[].mensagens_30d
--   (cópia da definição em vigor: 20261001a_automacoes_ia.sql)
-- ------------------------------------------------------------
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
    -- plano 1000b · UB-217: + mensagens_30d (envios da fila desta automação que saíram nos últimos 30 dias)
    'itens', coalesce((select json_agg(public.nx_auto_item(a) || jsonb_build_object('mensagens_30d', coalesce(ms.n, 0))
                                       order by a.criado_em, a.id)
                         from public.nx_automacoes a
                         left join (select f.automacao_id, count(*)::int as n
                                      from public.nx_envios_fila f
                                     where f.cliente_id = p_cliente and f.automacao_id is not null and f.status = 'enviado'
                                       and f.criado_em > now() - interval '30 days'
                                     group by f.automacao_id) ms on ms.automacao_id = a.id
                        where a.cliente_id = p_cliente), '[]'::json),
    'base', public.nx_auto_base(p_cliente),
    'limite', json_build_object('usadas', (select count(*) from public.nx_automacoes a where a.cliente_id = p_cliente),
                                'limite', public.nx_limite(p_cliente, 'automacoes')),
    'ia', json_build_object('disponivel', public.nx_auto_ia_ligada(),
                            'usadas', public.nx_uso(p_cliente, 'ia_mes'), 'limite', public.nx_limite(p_cliente, 'ia_mes')),
    'vertical', v_vert,
    'pode_editar', public.nx_rank(v.papel) >= 3);
end $$;

-- ------------------------------------------------------------
-- UB-213/UB-214 nx_automacao_execucoes(+ p_busca, p_desde, p_filtradas) — assinatura nova (a antiga caiu no topo)
--   (cópia da definição em vigor: 20261013f_entrada_contratos.sql)
-- ------------------------------------------------------------
create or replace function public.nx_automacao_execucoes(p_token text, p_cliente uuid, p_id uuid, p_limite int default 50,
                                                         p_busca text default null, p_desde timestamptz default null,
                                                         p_filtradas boolean default false)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'supervisor');
  -- plano 1000b · UB-213: busca pela pessoa (contato) ou pelo negócio, sem curinga do usuário
  v_q text := nullif(left(btrim(coalesce(p_busca, '')), 80), '');
  v_ql text;
begin
  perform public.nx_exigir_modulo(p_cliente, 'automacoes');
  if not exists (select 1 from public.nx_automacoes a where a.id = p_id and a.cliente_id = p_cliente) then
    raise exception 'automacao_nao_encontrada' using errcode = '22023';
  end if;
  if v_q is not null then
    v_ql := '%' || replace(replace(replace(lower(v_q), chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%';
  end if;
  return coalesce((
    select json_agg(json_build_object('criado_em', s.criado_em, 'ok', s.ok, 'detalhe', s.detalhe, 'chave', s.chave, 'link', s.link,
                                      'estado', case when s.filtrada then 'filtrada' else s.estado end, 'passo', s.passo, 'total_passos', s.total_passos,
                                      'continua_em', s.continua_em, 'atualizado_em', s.atualizado_em,
                                      'contato_nome', s.contato_nome, 'negocio_titulo', s.negocio_titulo)
                    order by s.criado_em desc, s.id desc)
      from (select x.id, x.criado_em, x.ok, x.detalhe, x.chave, x.estado, x.passo, x.total_passos, x.atualizado_em,
                   -- plano 1000b · UB-214: quem não passou nas condições (o motor já grava a linha; a lista só mostra com p_filtradas)
                   (x.ok and x.detalhe = 'Condições não atendidas — nada feito.') as filtrada,
                   coalesce(ln.titulo, ln.nome) as negocio_titulo, kc.nome as contato_nome,
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
              -- plano 1000: quem a execução tocou (contato e negócio), pela chave ou pelo evento — a lista diz «Ana · Implante»
              left join lateral (select
                  case when split_part(x.chave, ':', 1) in ('te', 'ad', 'ap', 'ag') and split_part(x.chave, ':', 2) ~ '^\d{1,18}$' then split_part(x.chave, ':', 2)::bigint
                       when e.ref ->> 'negocio_id' ~ '^\d{1,18}$' then (e.ref ->> 'negocio_id')::bigint end as neg_id,
                  case when split_part(x.chave, ':', 1) = 'sr' and split_part(x.chave, ':', 2) ~ '^\d{1,18}$' then split_part(x.chave, ':', 2)::bigint
                       when e.ref ->> 'conversa_id' ~ '^\d{1,18}$' then (e.ref ->> 'conversa_id')::bigint end as cv_id,
                  case when e.ref ->> 'contato_id' ~ '^\d{1,18}$' then (e.ref ->> 'contato_id')::bigint end as ct_id) ids on true
              left join public.nx_leads ln on ln.id = ids.neg_id and ln.cliente_id = x.cliente_id
              left join public.nx_conversas cx on cx.id = ids.cv_id and cx.cliente_id = x.cliente_id
              left join public.nx_contatos kc on kc.id = coalesce(ids.ct_id, ln.contato_id, cx.contato_id) and kc.cliente_id = x.cliente_id
             where x.automacao_id = p_id and x.cliente_id = p_cliente
               and (coalesce(p_filtradas, false) or not (x.ok and x.detalhe = 'Condições não atendidas — nada feito.'))
               and (p_desde is null or x.criado_em >= p_desde)
               and (v_ql is null or lower(coalesce(kc.nome, '')) like v_ql or lower(coalesce(ln.titulo, '')) like v_ql
                    or lower(coalesce(ln.nome, '')) like v_ql)
             order by x.criado_em desc, x.id desc
             limit least(greatest(coalesce(p_limite, 50), 1), 200)) s), '[]'::json);
end $$;

-- ------------------------------------------------------------
-- UB-211/UB-212 nx_automacao_salvar(+ p_atualizado_em) — assinatura nova (a antiga caiu no topo)
--   (cópia da definição em vigor: 20260928h_automacoes.sql)
-- ------------------------------------------------------------
create or replace function public.nx_automacao_salvar(p_token text, p_cliente uuid, p_auto jsonb, p_atualizado_em timestamptz default null)
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
    -- plano 1000b · UB-211: quem editou uma versão antiga não apaga o que outra pessoa salvou depois (só confere quando vier;
    -- milissegundos, a precisão do Date do navegador). O hint leva o atualizado_em atual (a tela oferece recarregar).
    if p_atualizado_em is not null
       and date_trunc('milliseconds', a.atualizado_em) <> date_trunc('milliseconds', p_atualizado_em) then
      raise exception 'edicao_desatualizada' using errcode = '22023',
        hint = to_char(a.atualizado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    end if;
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
      acoes = n -> 'acoes', respeitar_horario = (n ->> 'respeitar_horario')::boolean, ativo = v_ligar, atualizado_em = now(),
      atualizado_por = v.conta_id   -- plano 1000b · UB-212
     where id = v_id
    returning * into a;
  else
    perform public.nx_exigir_limite(p_cliente, 'automacoes');
    insert into public.nx_automacoes (cliente_id, nome, ativo, gatilho, config, condicoes, acoes, respeitar_horario, criado_por, atualizado_por)
    values (p_cliente, n ->> 'nome', v_ligar, n ->> 'gatilho', n -> 'config', n -> 'condicoes', n -> 'acoes',
            (n ->> 'respeitar_horario')::boolean, v.conta_id, v.conta_id)
    returning * into a;
  end if;
  return public.nx_auto_item(a)::json;
end $$;

-- ------------------------------------------------------------
-- UB-212 nx_automacao_ativar: grava quem ligou/desligou
--   (cópia da definição em vigor: 20260928h_automacoes.sql)
-- ------------------------------------------------------------
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
                                    atualizado_em = now(), atualizado_por = v.conta_id
     where id = a.id returning * into a;
  else
    update public.nx_automacoes set ativo = false, atualizado_em = now(), atualizado_por = v.conta_id where id = a.id returning * into a;
  end if;
  return public.nx_auto_item(a)::json;
end $$;

-- ------------------------------------------------------------
-- UB-216/UB-219 nx_auto_normalizar: condições campanha/plataforma; tarefa_vencida com tipo_tarefa e dono_id
--   (cópia da definição em vigor: 20261001b_correcoes.sql)
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
      if jsonb_typeof(c -> 'palavras') = 'array' and jsonb_array_length(c -> 'palavras') > 1000 then
        perform public.nx_auto_falha('use até 20 palavras');
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
      -- plano 1000b · UB-219: filtros opcionais «só deste tipo» e «só desta pessoa»
      if coalesce(btrim(c ->> 'tipo_tarefa'), '') <> ''
         and c ->> 'tipo_tarefa' not in ('tarefa', 'ligacao', 'reuniao', 'visita', 'whatsapp', 'email') then
        perform public.nx_auto_falha('escolha o tipo de tarefa em «Quando»');
      end if;
      nc := jsonb_strip_nulls(jsonb_build_object(
        'tipo_tarefa', nullif(btrim(coalesce(c ->> 'tipo_tarefa', '')), ''),
        'dono_id', public.nx_auto_id(p_cliente, 'conta', c ->> 'dono_id', 'a pessoa escolhida em «Quando» não tem mais acesso')));
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
        if jsonb_array_length(c -> 'dias_semana') > 100 then
          perform public.nx_auto_falha('os dias da semana vão de 0 (domingo) a 6 (sábado)');
        end if;
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
      when v_campo = 'campanha' then 'campanha'       -- plano 1000b · UB-216
      when v_campo = 'plataforma' then 'plataforma'   -- plano 1000b · UB-216
      when v_campo ~ '^contato\.[a-z][a-z0-9_]{0,39}$' then 'campo'
    end;
    if v_tipo is null then perform public.nx_auto_falha(p || ': escolha o campo'); end if;
    if v_op not in ('igual', 'diferente', 'contem', 'nao_contem', 'maior', 'menor', 'vazio', 'preenchido') then
      perform public.nx_auto_falha(p || ': escolha a comparação');
    end if;
    if v_op in ('maior', 'menor') and v_tipo not in ('numero', 'campo') then
      perform public.nx_auto_falha(p || ': «maior» e «menor» valem só para valor e campos');
    end if;
    -- plano 1000b · UB-216: campanha é «contém / não contém» (o nome, o id ou o utm_campaign); plataforma é «é / não é»
    if v_tipo = 'campanha' and v_op in ('igual', 'diferente') then
      perform public.nx_auto_falha(p || ': para a campanha use «contém» ou «não contém»');
    end if;
    if v_tipo = 'plataforma' and v_op in ('contem', 'nao_contem') then
      perform public.nx_auto_falha(p || ': para a plataforma use «é» ou «não é»');
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
        if v_tipo = 'plataforma' then
          v_txt := lower(v_txt);
          if v_txt not in ('meta', 'google') then perform public.nx_auto_falha(p || ': escolha a plataforma (Meta ou Google)'); end if;
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
        if jsonb_typeof(x -> 'parametros') = 'array' and jsonb_array_length(x -> 'parametros') > 100 then
          perform public.nx_auto_falha(p || ': use até 10 parâmetros');
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

  if not exists (select 1 from jsonb_array_elements(nacoes) z where z ->> 'tipo' not in ('esperar', 'parar')) then
    perform public.nx_auto_falha('acrescente pelo menos um passo que faça algo, além de esperar ou parar');
  end if;
  return jsonb_build_object('nome', v_nome, 'gatilho', v_gat, 'config', nc, 'condicoes', nconds, 'acoes', nacoes,
                            'respeitar_horario', coalesce(a ->> 'respeitar_horario', 'false') = 'true');
end $$;

-- ------------------------------------------------------------
-- UB-216 nx_auto_cond_ok: campanha e plataforma do anúncio
--   (cópia da definição em vigor: 20260928h_automacoes.sql)
-- ------------------------------------------------------------
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
      -- plano 1000b · UB-216: a campanha (id, utm_campaign do rastreio e o nome na métrica mais recente) e a plataforma do
      -- anúncio (negócio primeiro; senão o 1º toque do contato)
      when 'campanha' then nullif(concat_ws(' ',
             coalesce(p_d #>> '{negocio,campanha_ext}', p_d #>> '{contato,campanha_ext}'),
             p_d #>> '{negocio,rastreio,utm_campaign}',
             (select m.campanha_nome from public.nx_metricas_dia m
               where m.cliente_id = public.nx_auto_uuid(coalesce(p_d #>> '{negocio,cliente_id}', p_d #>> '{contato,cliente_id}'))
                 and m.plataforma = coalesce(p_d #>> '{negocio,plataforma}', p_d #>> '{contato,plataforma}')
                 and m.campanha_ext = coalesce(p_d #>> '{negocio,campanha_ext}', p_d #>> '{contato,campanha_ext}')
                 and m.campanha_nome is not null
               order by m.data desc limit 1)), '')
      when 'plataforma' then coalesce(p_d #>> '{negocio,plataforma}', p_d #>> '{contato,plataforma}')
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

-- ------------------------------------------------------------
-- UB-219 nx_auto_alvos_tempo: tarefa_vencida com tipo_tarefa e dono_id
--   (cópia da definição em vigor: 20261001b_correcoes.sql)
-- ------------------------------------------------------------
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
  v_tt text; v_dono_tv uuid;   -- plano 1000b · UB-219
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
         and l.estagio_em > now() - make_interval(hours => v_h) - interval '30 days'
         and not exists (select 1 from public.nx_auto_execucoes x
                          where x.automacao_id = p_auto.id
                            and x.chave = 'te:' || l.id || ':' || l.estagio_id || ':' || floor(extract(epoch from l.estagio_em))::bigint)
       order by l.estagio_em
       limit p_lim;
  when 'tarefa_vencida' then
    v_tt := nullif(btrim(coalesce(c ->> 'tipo_tarefa', '')), '');
    v_dono_tv := public.nx_auto_uuid(c ->> 'dono_id');
    return query
      select 'tv:' || t.id, jsonb_build_object('tarefa_id', t.id, 'negocio_id', t.negocio_id, 'contato_id', t.contato_id)
        from public.nx_tarefas t
       where t.cliente_id = p_auto.cliente_id and t.concluida_em is null
         and t.vence_em < now() and t.vence_em > now() - interval '7 days'
         and (v_tt is null or t.tipo = v_tt) and (v_dono_tv is null or t.dono_id = v_dono_tv)   -- plano 1000b · UB-219
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

-- ------------------------------------------------------------
-- AB-121 nx_rastreio_plataforma: ttclid (TikTok) e msclkid (Microsoft Ads) são clique de anúncio
--   (cópia da definição em vigor: 20261008a_entrada_lead_rastreio.sql)
-- ------------------------------------------------------------
create or replace function public.nx_rastreio_plataforma(r public.nx_rastreio)
returns jsonb
language plpgsql immutable
security definer
set search_path = ''
as $$
declare
  v_src text := lower(coalesce(r.utm_source, '')); v_med text := lower(coalesce(r.utm_medium, ''));
  v_paid boolean; v_plat text; v_orig text;
  v_meta_src constant text[] := array['facebook', 'fb', 'instagram', 'ig', 'meta', 'facebook_ads', 'meta_ads', 'fb_ads', 'instagram_ads', 'ig_ads'];
  v_google_src constant text[] := array['google', 'adwords', 'googleads', 'google_ads', 'google-ads', 'gads', 'youtube'];
begin
  v_paid := v_med in ('cpc', 'ppc', 'paid', 'paidsocial', 'paid_social', 'paid-social', 'social_paid', 'social-paid', 'display',
                      'cpm', 'ads', 'ad', 'pmax', 'performance_max', 'video', 'remarketing', 'retargeting', 'cpv', 'cpa');
  v_plat := case
    when r.gclid is not null or r.gbraid is not null or r.wbraid is not null then 'google'
    when v_src = any(v_google_src) and (v_paid or r.utm_campaign is not null) then 'google'
    when v_src = any(v_meta_src) or r.fbclid is not null then 'meta'
  end;
  v_orig := case
    when v_plat = 'google' then 'anuncio'
    when v_plat = 'meta' and v_paid then 'anuncio'
    when v_plat = 'meta' then 'organico'
    when r.ttclid is not null or r.msclkid is not null then 'anuncio'   -- plano 1000b · AB-121
    when v_paid then 'anuncio'
    when v_med in ('organic', 'organico', 'orgânico', 'seo', 'social', 'bio') then 'organico'
    else 'site' end;
  return jsonb_build_object('plataforma', v_plat, 'origem', v_orig, 'pago', v_paid);
end $$;

-- ------------------------------------------------------------
-- AB-007/AB-121 nx_rastreio_registrar: evento, confirmação do clique na mesma linha, eventos:true; utm_id/ttclid/msclkid
--   (cópia da definição em vigor: 20261013c_operacao_indices.sql)
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
  -- plano 1000b · AB-007: 'aquecimento' (hover/foco/visita de campanha) × 'clique' (o toque real); outro valor = antigo (nulo)
  v_ev text := case when d ->> 'evento' in ('aquecimento', 'clique') then d ->> 'evento' end;
  v_conf text := upper(nullif(btrim(coalesce(d ->> 'confirmar', '')), ''));
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
  -- plano 1000b · AB-007: {evento:'clique', confirmar: CODIGO} marca como clique a linha do código que nasceu do aquecimento
  -- (sem inserir outra e sem gastar o limite do cliente); código de outro cliente, velho ou já clique → confirmado:false
  if v_ev = 'clique' and v_conf is not null then
    if v_conf !~ '^[A-HJKMNP-Z2-9]{5}$' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'confirmar'; end if;
    update public.nx_rastreio r set evento = 'clique'
     where r.cliente_id = cli.id and r.codigo = v_conf and r.evento = 'aquecimento' and r.criado_em > now() - interval '2 days';
    return json_build_object('ok', true, 'codigo', v_conf, 'eventos', true, 'confirmado', found);
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
                                    gclid, gbraid, wbraid, fbclid, pagina, utm_id, ttclid, msclkid, evento)
    values (cli.id, v_cod,
            public.nx_rastreio_txt(d, 'utm_source', 100), public.nx_rastreio_txt(d, 'utm_medium', 100),
            public.nx_rastreio_txt(d, 'utm_campaign', 150), public.nx_rastreio_txt(d, 'utm_content', 150),
            public.nx_rastreio_txt(d, 'utm_term', 150),
            public.nx_rastreio_txt(d, 'gclid', 250, true), public.nx_rastreio_txt(d, 'gbraid', 250, true),
            public.nx_rastreio_txt(d, 'wbraid', 250, true), public.nx_rastreio_txt(d, 'fbclid', 250, true), v_pagina,
            -- plano 1000b · AB-121/AB-007
            public.nx_rastreio_txt(d, 'utm_id', 100), public.nx_rastreio_txt(d, 'ttclid', 250, true),
            public.nx_rastreio_txt(d, 'msclkid', 250, true), v_ev)
    on conflict (cliente_id, codigo) do nothing
    returning id into v_id;
    exit when v_id is not null;
  end loop;
  if v_id is null then raise exception 'falha_temporaria' using errcode = '54000'; end if;
  -- plano 1000b · AB-007: eventos:true = este servidor entende a confirmação do clique (o rastreio.v2 só confirma com ela)
  return json_build_object('ok', true, 'codigo', v_cod, 'eventos', true);
end $$;

-- ------------------------------------------------------------
-- AB-009 nx_rastreio_listar: cliques = só clique (ou evento nulo, antigos); registros = todos; itens[].evento
--   (cópia da definição em vigor: 20261008a_entrada_lead_rastreio.sql)
-- ------------------------------------------------------------
create or replace function public.nx_rastreio_listar(p_token text, p_cliente uuid, p_dias int default 30)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  v_dias int := least(greatest(coalesce(p_dias, 30), 1), 90);
  v_de timestamptz := now() - make_interval(days => least(greatest(coalesce(p_dias, 30), 1), 90));
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  return json_build_object(
    'dias', v_dias,
    'itens', coalesce((
      select json_agg(json_build_object(
          'em', r.criado_em, 'pagina', r.pagina,
          'utm_source', r.utm_source, 'utm_medium', r.utm_medium, 'utm_campaign', r.utm_campaign, 'utm_content', r.utm_content,
          'plataforma', coalesce(r.resultado ->> 'plataforma', public.nx_rastreio_plataforma(r) ->> 'plataforma'),
          'origem', coalesce(r.resultado ->> 'origem', public.nx_rastreio_plataforma(r) ->> 'origem'),
          'casou', coalesce((r.resultado ->> 'aplicado')::boolean, false),
          'motivo', case when r.pendente then 'pendente' else r.resultado ->> 'motivo' end,
          'usado_em', r.usado_em, 'negocio_id', r.negocio_id,
          'evento', r.evento, 'utm_id', r.utm_id,   -- plano 1000b · AB-009/AB-121
          'contato_nome', (select coalesce(k.nome, l.nome) from public.nx_leads l
                             left join public.nx_contatos k on k.id = l.contato_id
                            where l.id = r.negocio_id and l.cliente_id = p_cliente))
        order by r.criado_em desc)
        from (select * from public.nx_rastreio x where x.cliente_id = p_cliente and x.criado_em >= v_de
               order by x.criado_em desc limit 500) r), '[]'::json),
    'totais', (select json_build_object(
          -- plano 1000b · AB-009: o «aquecimento» (código preparado antes do toque) não é clique; nulo = registro antigo (clique)
          'cliques', count(*) filter (where x.evento is null or x.evento = 'clique'),
          'cliques_reais', count(*) filter (where x.evento is null or x.evento = 'clique'),
          'registros', count(*),
          'casados', count(*) filter (where coalesce((x.resultado ->> 'aplicado')::boolean, false)),
          'usados', count(*) filter (where x.usado_em is not null),
          'pendentes', count(*) filter (where x.pendente))
        from public.nx_rastreio x where x.cliente_id = p_cliente and x.criado_em >= v_de));
end $$;

-- ------------------------------------------------------------
-- AB-121 nx_lead_entrada: utm_id, ttclid e msclkid do formulário (rastreio, observação e origem)
--   (cópia da definição em vigor: 20261013f_entrada_contratos.sql)
-- ------------------------------------------------------------
create or replace function public.nx_lead_entrada(p_chave text, p_dados jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  -- texto externo: sem caracteres de controle, aparado e cortado
  v_nome text := nullif(btrim(left(regexp_replace(coalesce(d->>'nome', ''), '[[:cntrl:]]+', ' ', 'g'), 160)), '');
  v_tel_bruto text := left(coalesce(d->>'telefone', ''), 40);
  v_tel text;
  v_email text := lower(nullif(btrim(left(coalesce(d->>'email', ''), 160)), ''));
  v_msg text := nullif(btrim(left(regexp_replace(coalesce(d->>'mensagem', ''), '[^[:print:][:space:]]+', '', 'g'), 2000)), '');
  v_serv text := nullif(btrim(left(regexp_replace(coalesce(d->>'servico', ''), '[[:cntrl:]]+', ' ', 'g'), 80)), '');
  v_utm_s text := nullif(btrim(left(regexp_replace(coalesce(d->>'utm_source', ''), '[[:cntrl:]]+', ' ', 'g'), 80)), '');
  v_utm_c text := nullif(btrim(left(regexp_replace(coalesce(d->>'utm_campaign', ''), '[[:cntrl:]]+', ' ', 'g'), 120)), '');
  -- plano 1000: o resto do rastreio que o formulário do site manda e o aceite da política de privacidade
  v_utm_m text := nullif(btrim(left(regexp_replace(coalesce(d->>'utm_medium', ''), '[[:cntrl:]]+', ' ', 'g'), 80)), '');
  v_utm_ct text := nullif(btrim(left(regexp_replace(coalesce(d->>'utm_content', ''), '[[:cntrl:]]+', ' ', 'g'), 120)), '');
  v_utm_t text := nullif(btrim(left(regexp_replace(coalesce(d->>'utm_term', ''), '[[:cntrl:]]+', ' ', 'g'), 120)), '');
  v_gclid text := nullif(left(regexp_replace(coalesce(d->>'gclid', ''), '[^A-Za-z0-9._-]+', '', 'g'), 200), '');
  v_fbclid text := nullif(left(regexp_replace(coalesce(d->>'fbclid', ''), '[^A-Za-z0-9._-]+', '', 'g'), 200), '');
  -- plano 1000b · AB-121: o rastreio.v2 também guarda utm_id (id da campanha), ttclid (TikTok) e msclkid (Microsoft Ads)
  v_utm_id text := nullif(btrim(left(regexp_replace(coalesce(d->>'utm_id', ''), '[[:cntrl:]]+', ' ', 'g'), 100)), '');
  v_ttclid text := nullif(left(regexp_replace(coalesce(d->>'ttclid', ''), '[^A-Za-z0-9._-]+', '', 'g'), 200), '');
  v_msclkid text := nullif(left(regexp_replace(coalesce(d->>'msclkid', ''), '[^A-Za-z0-9._-]+', '', 'g'), 200), '');
  v_aceite boolean := case when lower(coalesce(d->>'aceite_privacidade', '')) in ('true', '1', 'sim', 'on', 'yes') then true end;
  rr public.nx_rastreio; cls jsonb; v_plat text; v_orig text := 'site'; v_camp text; v_rast jsonb;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  cli public.nx_clientes;
  v_contato bigint;
  v_funil uuid;
  v_neg bigint;
  v_n int;
  v_ip text;
  v_novo boolean := false;
begin
  -- 1) os dados primeiro (o erro não depende da chave)
  if nullif(regexp_replace(v_tel_bruto, '\D', '', 'g'), '') is not null then
    v_tel := public.nx_tel_normalizar(v_tel_bruto, false);
    if v_tel is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'telefone'; end if;
  end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'email';
  end if;
  if v_nome is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'nome'; end if;
  if v_tel is null and v_email is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'telefone'; end if;

  -- 2) a chave: qualquer problema → ok sem gravar (não revela)
  if p_chave is null or p_chave !~ '^[0-9a-f]{48}$' then return json_build_object('ok', true); end if;
  select * into cli from public.nx_clientes c where c.entrada_chave = p_chave;
  if cli.id is null
     or not coalesce(cli.ativo, true)
     or coalesce(cli.status, 'ativo') not in ('ativo', 'teste')
     or (cli.status = 'teste' and cli.teste_ate is not null and cli.teste_ate < v_hoje)
     or not ('crm' = any(coalesce(cli.modulos, '{}'::text[])))
     or exists (select 1 from public.nx_orgs o where o.id = cli.org_id and o.status in ('suspenso', 'cancelado')) then
    return json_build_object('ok', true);
  end if;

  -- 3) limite por IP (plano 1000, SV-108: 5 formulários por hora — a chave é pública e qualquer um esgotava o limite do
  --    cliente) e de 30 por hora por cliente (trava por cliente: chamadas simultâneas esperam a vez)
  v_ip := public.nx_login_ip();
  if v_ip is not null and not (public.nx_taxa_usar('form:' || v_ip, 5, 3600) ->> 'ok')::boolean then
    raise exception 'limite_taxa' using errcode = '54000';
  end if;
  -- plano 1000 (SV-254): esperar a trava consultiva no máximo 5 s (uma entrega presa não segura as outras até o statement_timeout;
  -- o erro faz a Meta / o fluxo tentarem de novo). set_config local = só nesta transação (a RPC).
  perform set_config('lock_timeout', '5s', true);
  perform pg_advisory_xact_lock(hashtextextended('nx_lead_entrada:' || cli.id::text, 0));
  -- plano 1000 (SV-136): a MESMA trava do nx_wa_entrada e do nx_lead_webhook (cliente + chave do telefone) — formulário e WhatsApp
  -- da mesma pessoa no mesmo instante esperam a vez e viram UM negócio
  if v_tel is not null then
    perform pg_advisory_xact_lock(hashtextextended(cli.id::text || ':' || coalesce(public.nx_tel_chave(v_tel), v_tel), 0));
  end if;
  select count(*) into v_n
    from public.nx_leads l
   where l.cliente_id = cli.id and l.data_conversa >= v_hoje - 1
     and l.origem = 'site' and l.criado_em > now() - interval '1 hour';
  if v_n >= 30 then raise exception 'limite_taxa' using errcode = '54000'; end if;

  -- 4) contato: telefone → e-mail → novo
  if v_tel is not null then v_contato := public.nx_contato_por_tel(cli.id, v_tel); end if;
  if v_contato is null and v_email is not null then
    select k.id into v_contato from public.nx_contatos k
     where k.cliente_id = cli.id and lower(k.email) = v_email order by k.id limit 1;
  end if;
  if v_contato is null then
    -- contato NOVO conta no limite de contatos do plano (único caminho que não contava). Plano cheio: o site recebe {ok:true}
    -- sem gravar (formulário anônimo não vê o erro) e os admins recebem um aviso por dia.
    begin
      perform public.nx_exigir_limite(cli.id, 'contatos', 1);
    exception when others then
      if sqlerrm <> 'limite_plano' then raise; end if;
      if not exists (select 1 from public.nx_notificacoes n
                      where n.cliente_id = cli.id and n.tipo = 'sistema'
                        and n.titulo = 'Limite de contatos do plano atingido' and n.criado_em > now() - interval '24 hours') then
        perform public.nx_notificar(cli.id, null, 'sistema', 'Limite de contatos do plano atingido',
          left('Um contato do formulário do site não foi gravado (' || v_nome || '). Libere espaço ou aumente o plano.', 500),
          '#/config');
      end if;
      return json_build_object('ok', true);
    end;
    insert into public.nx_contatos (cliente_id, nome, telefone, email, origem)
    values (cli.id, v_nome, v_tel, v_email, 'site')
    on conflict (cliente_id, tel_chave) where tel_chave is not null
    do update set nome = coalesce(public.nx_contatos.nome, excluded.nome),
                  email = coalesce(public.nx_contatos.email, excluded.email)
    returning id into v_contato;
  else
    -- contato existente: só preenche o que estiver vazio (formulário anônimo nunca sobrescreve)
    update public.nx_contatos k
       set nome = coalesce(k.nome, v_nome), email = coalesce(k.email, v_email),
           telefone = coalesce(k.telefone, v_tel)
     where k.id = v_contato
       and (k.nome is null or (k.email is null and v_email is not null) or (k.telefone is null and v_tel is not null));
  end if;

  -- 5) plano 1000 (SV-107): contato com negócio ABERTO → o envio vira só nota nele (decisão 1 do plano 100; duplo clique ou
  --    reenvio do formulário criavam 2 negócios e 2 avisos). Sem negócio aberto: negócio novo no funil padrão (o gatilho acha a
  --    etapa 'nova' e completa nome/telefone)
  select l.id into v_neg from public.nx_leads l
   where l.cliente_id = cli.id and l.contato_id = v_contato and l.status = 'aberto'
   order by l.criado_em desc, l.id desc limit 1;
  if v_neg is null then
    -- plano 1000 (SV-137): a MESMA classificação do rastreio do site (nx_rastreio_plataforma): utm_source/medium, gclid, fbclid →
    -- plataforma e origem (anúncio × orgânico × site); utm_campaign que casa com campanha conhecida é anúncio (como no aplicar)
    rr.utm_source := v_utm_s; rr.utm_medium := v_utm_m; rr.utm_campaign := v_utm_c; rr.utm_content := v_utm_ct; rr.utm_term := v_utm_t;
    rr.gclid := v_gclid; rr.fbclid := v_fbclid;
    rr.utm_id := v_utm_id; rr.ttclid := v_ttclid; rr.msclkid := v_msclkid;   -- plano 1000b · AB-121
    cls := public.nx_rastreio_plataforma(rr);
    v_plat := cls ->> 'plataforma'; v_orig := coalesce(cls ->> 'origem', 'site');
    if v_plat is not null and v_utm_c is not null then
      select m.campanha_ext into v_camp from public.nx_metricas_dia m
       where m.cliente_id = cli.id and m.plataforma = v_plat and (m.campanha_ext = v_utm_c or lower(m.campanha_nome) = lower(v_utm_c))
       order by (m.campanha_ext = v_utm_c) desc, m.data desc limit 1;
      if v_camp is not null then v_orig := 'anuncio'; end if;
      v_camp := coalesce(v_camp, left(v_utm_c, 100));
    end if;
    v_rast := jsonb_strip_nulls(jsonb_build_object('via', 'formulario', 'utm_source', v_utm_s, 'utm_medium', v_utm_m, 'utm_campaign', v_utm_c,
      'utm_content', v_utm_ct, 'utm_term', v_utm_t, 'fbclid', v_fbclid, 'aceite_privacidade', v_aceite,
      'utm_id', v_utm_id, 'ttclid', v_ttclid, 'msclkid', v_msclkid,
      'aceite_em', case when v_aceite then now() end, 'clique_em', now()));
    select f.id into v_funil from public.nx_funis f where f.cliente_id = cli.id and f.padrao and f.ativo limit 1;
    insert into public.nx_leads (cliente_id, nome, telefone, contato_id, origem, plataforma, campanha_ext, gclid, rastreio, servico, obs, funil_id, etapa)
    values (cli.id, v_nome, v_tel, v_contato, v_orig, v_plat, v_camp, v_gclid, v_rast, v_serv,
            left(concat_ws(' · ', 'Formulário do site',
                           case when v_utm_s is not null then 'utm_source=' || v_utm_s end,
                           case when v_utm_m is not null then 'utm_medium=' || v_utm_m end,
                           case when v_utm_c is not null then 'utm_campaign=' || v_utm_c end,
                           case when v_utm_ct is not null then 'utm_content=' || v_utm_ct end,
                           case when v_utm_t is not null then 'utm_term=' || v_utm_t end,
                           case when v_gclid is not null then 'gclid' end,
                           case when v_fbclid is not null then 'fbclid' end,
                           case when v_utm_id is not null then 'utm_id=' || v_utm_id end,
                           case when v_ttclid is not null then 'ttclid' end,
                           case when v_msclkid is not null then 'msclkid' end,
                           case when v_aceite then 'aceitou a política de privacidade' end), 5000),
            v_funil, 'nova')
    returning id into v_neg;
    v_novo := true;
    -- contato: 1º toque (só preenche o vazio; a origem padrão vira a real), como o nx_rastreio_aplicar
    if v_plat is not null or v_orig <> 'site' then
      update public.nx_contatos k set
        origem = case when k.origem in ('whatsapp', 'site') then v_orig else k.origem end,
        plataforma = coalesce(k.plataforma, v_plat), campanha_ext = coalesce(k.campanha_ext, v_camp)
      where k.id = v_contato and k.cliente_id = cli.id and k.plataforma is null;
    end if;
  end if;

  -- 6) mensagem vira nota (no negócio que já existia: sempre uma nota, para o envio repetido deixar rastro); avisa os admins
  --    (negócio que já existia: no máximo um aviso a cada 30 min)
  if v_msg is not null or not v_novo then
    insert into public.nx_notas (cliente_id, contato_id, negocio_id, texto)
    values (cli.id, v_contato, v_neg, left(case when v_msg is not null then 'Mensagem enviada pelo formulário do site: ' || v_msg
                                                else 'Formulário do site enviado de novo' end, 5000));
  end if;
  if v_novo or not exists (select 1 from public.nx_notificacoes n
                            where n.cliente_id = cli.id and n.link = '#/crm/negocio/' || v_neg and n.criado_em > now() - interval '30 minutes') then
    perform public.nx_notificar(cli.id, null, 'sistema',
                                left(case when v_novo then 'Novo contato pelo site: ' else 'Contato do site escreveu de novo: ' end || v_nome, 120),
                                left(concat_ws(' · ', v_serv, v_msg), 500), '#/crm/negocio/' || v_neg);
  end if;
  return json_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- RB-256 nx_tarefas_listar: «Concluídas» dos últimos p_filtro.concluidas_dias (padrão 7; 0 = todas)
--   (cópia da definição em vigor: 20260928d_crm_b.sql)
-- ------------------------------------------------------------
create or replace function public.nx_tarefas_listar(p_token text, p_cliente uuid, p_filtro jsonb default '{}'::jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  f jsonb := coalesce(p_filtro, '{}'::jsonb);
  v_sit text := coalesce(nullif(f ->> 'situacao', ''), 'abertas');
  v_dono_txt text := nullif(f ->> 'dono', '');
  v_dono uuid; v_todos boolean := false;
  v_neg bigint := public.nx_crm_int8(f, 'negocio_id');
  v_ct bigint := public.nx_crm_int8(f, 'contato_id');
  v_ini timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_fim timestamptz;
  ids bigint[];
  v_cdias int;   -- plano 1000b · RB-256
  l public.nx_leads; k public.nx_contatos;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if jsonb_typeof(f) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'filtro'; end if;
  if v_sit not in ('abertas', 'atrasadas', 'hoje', 'proximas', 'concluidas') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'situacao';
  end if;
  v_fim := v_ini + interval '1 day';
  -- plano 1000b · RB-256: «Concluídas» dos últimos N dias (7 por padrão, 30, até 366; 0 = todas). Com negócio/contato
  -- informado (a gaveta do negócio): todas, como antes.
  if f ? 'concluidas_dias' then
    v_cdias := public.nx_crm_int8(f, 'concluidas_dias');
    if v_cdias is not null and v_cdias not between 0 and 366 then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'concluidas_dias';
    end if;
  end if;
  if v_cdias is null and v_neg is null and v_ct is null then v_cdias := 7; end if;
  if v_cdias = 0 then v_cdias := null; end if;
  -- negócio/contato informado precisa ser do cliente e visível
  if v_neg is not null then
    select * into l from public.nx_leads where id = v_neg and cliente_id = p_cliente;
    if l.id is null or (public.nx_crm_restrito(v) and l.dono_id is not null and l.dono_id <> v.conta_id) then
      raise exception 'negocio_nao_encontrado' using errcode = '22023';
    end if;
  end if;
  if v_ct is not null then
    select * into k from public.nx_contatos where id = v_ct and cliente_id = p_cliente;
    if k.id is null or (public.nx_crm_restrito(v) and k.dono_id is not null and k.dono_id <> v.conta_id) then
      raise exception 'contato_nao_encontrado' using errcode = '22023';
    end if;
  end if;
  -- de quem
  if v_dono_txt = 'todos' then v_todos := true;
  elsif v_dono_txt is null or v_dono_txt = 'eu' then v_dono := v.conta_id;
    if v_neg is not null or v_ct is not null then v_todos := v_dono_txt is null; end if;
  else v_dono := public.nx_crm_uuid(f, 'dono');
  end if;
  if public.nx_rank(v.papel) < 2 and v_neg is null and v_ct is null then
    v_todos := false; v_dono := v.conta_id;   -- atendente/leitura: só as próprias
  end if;

  select array(
    select t.id from public.nx_tarefas t
     where t.cliente_id = p_cliente
       and (v_todos or t.dono_id = v_dono)
       and (v_neg is null or t.negocio_id = v_neg)
       and (v_ct is null or t.contato_id = v_ct)
       and case v_sit
             when 'abertas' then t.concluida_em is null
             when 'atrasadas' then t.concluida_em is null and t.vence_em < now()
             when 'hoje' then t.concluida_em is null and t.vence_em >= v_ini and t.vence_em < v_fim
             when 'proximas' then t.concluida_em is null and (t.vence_em >= v_fim or t.vence_em is null)
             else t.concluida_em is not null
                  and (v_cdias is null or t.concluida_em >= now() - make_interval(days => v_cdias)) end
     order by case when v_sit = 'concluidas' then -extract(epoch from t.concluida_em) end,
              t.vence_em asc nulls last, t.id
     limit 201) into ids;

  return json_build_object(
    'itens', public.nx_crm_tarefas_json(p_cliente, ids[1:200]),
    'tem_mais', coalesce(cardinality(ids), 0) > 200,
    'concluidas_dias', case when v_sit = 'concluidas' then coalesce(v_cdias, 0) end,
    'contagens', (select json_build_object(
        'hoje', count(*) filter (where t.vence_em >= v_ini and t.vence_em < v_fim),
        'atrasadas', count(*) filter (where t.vence_em < now()),
        'proximas', count(*) filter (where t.vence_em >= v_fim or t.vence_em is null))
      from public.nx_tarefas t
     where t.cliente_id = p_cliente and t.concluida_em is null
       and (v_todos or t.dono_id = v_dono)
       and (v_neg is null or t.negocio_id = v_neg)
       and (v_ct is null or t.contato_id = v_ct)));
end $$;

-- ------------------------------------------------------------
-- CB-209 nx_cv_listar: p_filtro.origem (origem do contato). O desempate da página (CB-205) já existe: p_filtro.antes_id
--   (cópia da definição em vigor: 20261013d_contratos_telas.sql)
-- ------------------------------------------------------------
create or replace function public.nx_cv_listar(p_token text, p_cliente uuid, p_filtro jsonb default '{}'::jsonb,
                                               p_limite int default 50, p_antes timestamptz default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  f jsonb := coalesce(p_filtro, '{}'::jsonb);
  v_rank int;
  v_aba text := coalesce(nullif(f ->> 'aba', ''), 'abertas');
  v_lim int := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_dep uuid; v_canal uuid; v_at text; v_at_id uuid; v_etq uuid[]; v_nl boolean; v_antes_id bigint; v_origem text;
  v_q text; v_qn text; v_dig text; v_busca boolean;
  v_ids bigint[]; v_itens jsonb; v_n int; v_cont json;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  v_rank := public.nx_rank(v.papel);
  if v_aba not in ('minhas', 'sem_dono', 'aguardando', 'abertas', 'pendentes', 'resolvidas', 'ocultas') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'aba';
  end if;
  if v_aba = 'ocultas' and v_rank < 2 then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  begin
    v_dep := nullif(f ->> 'departamento_id', '')::uuid;
    v_canal := nullif(f ->> 'canal_id', '')::uuid;
    v_at := nullif(f ->> 'atendente', '');
    if v_at is not null and v_at not in ('eu', 'sem') then v_at_id := v_at::uuid; end if;
    if jsonb_typeof(f -> 'etiquetas') = 'array' and jsonb_array_length(f -> 'etiquetas') > 0 then
      select array_agg(x::uuid) into v_etq from jsonb_array_elements_text(f -> 'etiquetas') x;
    end if;
    v_nl := coalesce(nullif(f ->> 'nao_lidas', '')::boolean, false);
    -- plano 1000 (SV-111): id do último item da página anterior (desempate de quem tem o mesmo ultima_msg_em)
    v_antes_id := nullif(f ->> 'antes_id', '')::bigint;
    v_origem := nullif(f ->> 'origem', '');   -- plano 1000b · CB-209
  exception when invalid_text_representation then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'filtro';
  end;
  -- plano 1000b · CB-209: a origem do contato (anúncio, site, orgânico…), os mesmos valores de nx_contatos.origem
  if v_origem is not null and v_origem not in ('anuncio', 'whatsapp', 'indicacao', 'organico', 'manual', 'site', 'importacao') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'origem';
  end if;
  v_q := left(btrim(coalesce(f ->> 'busca', '')), 80);
  v_busca := char_length(v_q) >= 2;
  if v_busca then
    v_qn := replace(replace(replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, v_q)),
                    '\', '\\'), '%', '\%'), '_', '\_');
    v_dig := regexp_replace(v_q, '\D', '', 'g');
  end if;

  if v_aba = 'aguardando' and not v_busca then
    -- plano 1000 (SV-110): «Aguardando» — quem espera há mais tempo primeiro, predicado literal (índice parcial)
    v_ids := array(
      select cv.id from public.nx_conversas cv
       where cv.cliente_id = p_cliente and cv.status = 'aberta' and cv.aguardando and not cv.oculta
         -- regra nx_cv_visivel
         and ( v_rank >= 3
            or cv.atribuida_a = v.conta_id
            or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                  or cv.departamento_id = any(v.departamentos))
                 and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )
         and (v_dep is null or cv.departamento_id = v_dep)
         and (v_canal is null or cv.canal_id = v_canal)
         and (v_at is null
              or (v_at = 'eu' and cv.atribuida_a = v.conta_id)
              or (v_at = 'sem' and cv.atribuida_a is null)
              or (v_at_id is not null and cv.atribuida_a = v_at_id))
         and (v_etq is null or cv.etiquetas && v_etq)
         and (not v_nl or cv.nao_lidas > 0)
         and (v_origem is null or exists (select 1 from public.nx_contatos ko
                                           where ko.id = cv.contato_id and ko.cliente_id = p_cliente and ko.origem = v_origem))
         and (p_antes is null or cv.ultima_entrada_em > p_antes)
       order by cv.ultima_entrada_em asc nulls last, cv.ultima_msg_em desc, cv.id desc
       limit v_lim + 1);
  else
    v_ids := array(
      select cv.id from public.nx_conversas cv
       where cv.cliente_id = p_cliente
         -- regra nx_cv_visivel
         and (not cv.oculta or v_rank >= 2)
         and ( v_rank >= 3
            or cv.atribuida_a = v.conta_id
            or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                  or cv.departamento_id = any(v.departamentos))
                 and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )
         -- aba (com busca: procura em todos os atendimentos, menos os ocultos)
         and ( case
                 when v_aba = 'ocultas' then cv.oculta
                 when v_busca then not cv.oculta
                 when v_aba = 'minhas' then not cv.oculta and cv.status in ('aberta', 'pendente') and cv.atribuida_a = v.conta_id
                 when v_aba = 'sem_dono' then not cv.oculta and cv.status in ('aberta', 'pendente') and cv.atribuida_a is null
                 when v_aba = 'abertas' then not cv.oculta and cv.status = 'aberta'
                 when v_aba = 'pendentes' then not cv.oculta and cv.status = 'pendente'
                 when v_aba = 'resolvidas' then not cv.oculta and cv.status = 'resolvida'
                                                and cv.resolvida_em > now() - interval '30 days'
                 else false
               end )
         and (v_dep is null or cv.departamento_id = v_dep)
         and (v_canal is null or cv.canal_id = v_canal)
         and (v_at is null
              or (v_at = 'eu' and cv.atribuida_a = v.conta_id)
              or (v_at = 'sem' and cv.atribuida_a is null)
              or (v_at_id is not null and cv.atribuida_a = v_at_id))
         and (v_etq is null or cv.etiquetas && v_etq)
         and (not v_nl or cv.nao_lidas > 0)
         and (v_origem is null or exists (select 1 from public.nx_contatos ko
                                           where ko.id = cv.contato_id and ko.cliente_id = p_cliente and ko.origem = v_origem))
         and (not v_busca
              or cv.protocolo ilike '%' || v_qn || '%'
              or cv.contato_id in (select k.id from public.nx_contatos k
                                    where k.cliente_id = p_cliente
                                      and (k.busca like '%' || v_qn || '%'
                                           or (char_length(v_dig) >= 4 and k.telefone like '%' || v_dig || '%'))))
         and (p_antes is null
              or (case when v_antes_id is null then cv.ultima_msg_em < p_antes
                       else (cv.ultima_msg_em, cv.id) < (p_antes, v_antes_id) end))
       order by cv.ultima_msg_em desc, cv.id desc
       limit v_lim + 1);
  end if;
  v_n := coalesce(cardinality(v_ids), 0);
  select coalesce(jsonb_agg(public.nx_cv_json_item(c) order by x.o), '[]'::jsonb)
    into v_itens
    from unnest(v_ids[1:v_lim]) with ordinality x(id, o)
    join public.nx_conversas c on c.id = x.id;

  -- contagens das abas (só visibilidade; ignoram filtros e busca — alimentam o menu e o título)
  select json_build_object(
           'minhas', count(*) filter (where cv.atribuida_a = v.conta_id),
           'sem_dono', count(*) filter (where cv.atribuida_a is null),
           'aguardando', count(*) filter (where cv.status = 'aberta' and cv.aguardando),
           'abertas', count(*) filter (where cv.status = 'aberta'),
           'pendentes', count(*) filter (where cv.status = 'pendente'),
           'nao_lidas', count(*) filter (where cv.nao_lidas > 0))
    into v_cont
    from public.nx_conversas cv
   where cv.cliente_id = p_cliente and cv.status in ('aberta', 'pendente') and not cv.oculta
     -- regra nx_cv_visivel
     and ( v_rank >= 3
        or cv.atribuida_a = v.conta_id
        or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
              or cv.departamento_id = any(v.departamentos))
             and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) );

  return json_build_object('itens', v_itens, 'tem_mais', v_n > v_lim, 'contagens', v_cont,
                           'aba', v_aba, 'busca', v_busca);
end $$;

-- ------------------------------------------------------------
-- CB-206/CB-207 nx_cv_buscar_msgs(+ p_antes_id): origem e enviado_por_nome; «ver mais» — assinatura nova (a antiga caiu no topo)
--   (cópia da definição em vigor: 20260928e_conversas_b.sql)
-- ------------------------------------------------------------
create or replace function public.nx_cv_buscar_msgs(p_token text, p_cliente uuid, p_q text, p_limite int default 30,
                                                    p_antes_id bigint default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  v_rank int;
  v_q text := left(btrim(coalesce(p_q, '')), 80);
  v_ql text;
  v_lim int := least(greatest(coalesce(p_limite, 30), 1), 50);
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if char_length(v_q) < 3 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'busca';
  end if;
  v_rank := public.nx_rank(v.papel);
  v_ql := lower(v_q);
  return coalesce((
    select json_agg(json_build_object(
             'conversa_id', x.conversa_id, 'contato_nome', x.contato_nome, 'contato_id', x.contato_id,
             'mensagem_id', x.id, 'direcao', x.direcao, 'tipo', x.tipo, 'protocolo', x.protocolo,
             'status', x.status_cv,
             'trecho', case
                         when char_length(x.corpo) <= 160 then x.corpo
                         else (case when x.ini > 1 then '…' else '' end)
                              || substr(x.corpo, x.ini, 158)
                              || (case when x.ini + 158 <= char_length(x.corpo) then '…' else '' end)
                       end,
             'criado_em', x.criado_em,
             -- plano 1000b · CB-206: quem mandou (painel, IA, automação…) e o nome de quem estava no painel
             'origem', x.origem, 'enviado_por_nome', x.enviado_por_nome) order by x.id desc)
      from (
        select m.id, m.conversa_id, m.contato_id, m.direcao, m.tipo, m.corpo, m.criado_em,
               m.origem, (select ke.nome from public.nx_contas ke where ke.id = m.enviado_por) as enviado_por_nome,
               cv.protocolo, cv.status as status_cv,
               coalesce(nullif(btrim(k.nome), ''), k.telefone) as contato_nome,
               greatest(1, strpos(lower(m.corpo), v_ql) - 50) as ini
          from public.nx_mensagens m
          join public.nx_conversas cv on cv.id = m.conversa_id
          join public.nx_contatos k on k.id = m.contato_id
         where m.cliente_id = p_cliente
           and (p_antes_id is null or m.id < p_antes_id)   -- plano 1000b · CB-207: a página seguinte (ids menores)
           and m.tipo in ('texto', 'nota')
           and lower(m.corpo) like '%' || replace(replace(replace(v_ql, '\', '\\'), '%', '\%'), '_', '\_') || '%'
           and cv.cliente_id = p_cliente
           -- regra nx_cv_visivel
           and (not cv.oculta or v_rank >= 2)
           and ( v_rank >= 3
              or cv.atribuida_a = v.conta_id
              or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                    or cv.departamento_id = any(v.departamentos))
                   and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )
         order by m.id desc
         limit v_lim
      ) x), '[]'::json);
end $$;

-- ------------------------------------------------------------
-- CB-208 nx_cv_marcar_nao_lida (RPC NOVA): «Marcar como não lida» volta o lembrete visual (nao_lidas ≥ 1). Só quem é dono
--        da conversa, ou qualquer um que a vê quando ela está sem dono (a regra do nx_cv_marcar_lida); leitura não marca.
--        Devolve {ok, nao_lidas}. Conversa invisível → conversa_nao_encontrada; de colega → sem_permissao.
-- ------------------------------------------------------------
create or replace function public.nx_cv_marcar_nao_lida(p_token text, p_cliente uuid, p_conversa bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente'); v_dono uuid; v_n int;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  select cv.atribuida_a into v_dono from public.nx_conversas cv where cv.id = p_conversa and cv.cliente_id = p_cliente for update;
  if v_dono is not null and v_dono is distinct from v.conta_id then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  update public.nx_conversas set nao_lidas = greatest(nao_lidas, 1), atualizado_em = now()
   where id = p_conversa and cliente_id = p_cliente
  returning nao_lidas into v_n;
  return json_build_object('ok', true, 'nao_lidas', v_n);
end $$;

-- ------------------------------------------------------------
-- CB-203 nx_cv_base: ia_assistente_nome para todos os papéis (os horários já vêm em departamentos[].horario)
--   (cópia da definição em vigor: 20261013d_contratos_telas.sql)
-- ------------------------------------------------------------
create or replace function public.nx_cv_base(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  v_cfg jsonb;
  v_iacfg jsonb;
  v_ia boolean;
  v_config json;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  select coalesce(c.cfg -> 'cv', '{}'::jsonb),
         case when jsonb_typeof(c.cfg -> 'ia') = 'object' then c.cfg -> 'ia' else '{}'::jsonb end
    into v_cfg, v_iacfg
    from public.nx_clientes c where c.id = p_cliente;
  select coalesce(nullif(btrim(x.anthropic_api_key), ''), '') <> '' into v_ia from public.nx_config x where x.id = 1;
  if public.nx_rank(v.papel) >= 3 then
    v_config := json_build_object(
      'departamentos', coalesce((select json_agg(public.nx_cv_json_dep(d) order by d.ordem, d.nome)
                                   from public.nx_departamentos d where d.cliente_id = p_cliente), '[]'::json),
      'ia', json_build_object(
              'sobre', coalesce(v_iacfg ->> 'sobre', ''), 'servicos', coalesce(v_iacfg ->> 'servicos', ''),
              'horarios', coalesce(v_iacfg ->> 'horarios', ''), 'regras', coalesce(v_iacfg ->> 'regras', ''),
              'proibido', coalesce(v_iacfg ->> 'proibido', ''),
              'memoria_aprovada', coalesce(v_iacfg ->> 'memoria_aprovada', ''),
              'tom', case when v_iacfg ->> 'tom' = 'formal' then 'formal' else 'proximo' end,
              'assistente_nome', coalesce(v_iacfg ->> 'assistente_nome', ''),
              'endereco', coalesce(v_iacfg ->> 'endereco', ''),
              'boas_vindas', coalesce(v_iacfg ->> 'boas_vindas', '')));
  end if;
  return json_build_object(
    'eu', json_build_object('id', v.conta_id, 'nome', v.nome, 'papel', v.papel,
                            'departamentos', to_json(v.departamentos), 'ver_todas', v.ver_todas),
    'canais', coalesce((select json_agg(json_build_object(
                 'id', k.id, 'nome', k.nome, 'numero_exibicao', k.numero_exibicao, 'status', k.status,
                 'coexistencia', k.coexistencia,
                 'tem_token', case when k.provedor = 'codewords'
                                   then k.codewords_api_segredo is not null and k.codewords_phone_id is not null
                                   else k.token_segredo is not null end,
                 'provedor', k.provedor,
                 'ia_ligada', case when k.provedor = 'codewords' then k.ia_ligada end,
                 'ia_rota', case when k.provedor = 'codewords' then k.codewords_rota end,
                 'departamento_id', k.departamento_id, 'app_inscrito', k.app_inscrito,
                 'ultimo_erro', k.ultimo_erro) order by k.criado_em)
               from public.nx_canais k where k.cliente_id = p_cliente), '[]'::json),
    -- plano 1000: + horario (o mesmo jsonb que o nx_horario_aberto lê) para todos os papéis
    'departamentos', coalesce((select json_agg(json_build_object(
                 'id', d.id, 'nome', d.nome, 'cor', d.cor, 'padrao', d.padrao,
                 'distribuicao', d.distribuicao, 'ativo', d.ativo, 'horario', d.horario) order by d.ordem, d.nome)
               from public.nx_departamentos d where d.cliente_id = p_cliente and d.ativo), '[]'::json),
    'respostas', coalesce((select json_agg(json_build_object(
                 'id', r.id, 'atalho', r.atalho, 'titulo', r.titulo, 'corpo', r.corpo,
                 'departamento_id', r.departamento_id, 'usos', r.usos, 'ordem', r.ordem, 'ativo', r.ativo)
                 order by r.ordem, r.atalho)
               from public.nx_respostas r where r.cliente_id = p_cliente), '[]'::json),
    'etiquetas', coalesce((select json_agg(json_build_object('id', e.id, 'nome', e.nome, 'cor', e.cor)
                 order by lower(e.nome))
               from public.nx_etiquetas e where e.cliente_id = p_cliente), '[]'::json),
    'usuarios', coalesce((select json_agg(json_build_object(
                 'id', k.id, 'nome', k.nome, 'papel', a.papel, 'departamentos', to_json(a.departamentos),
                 'recebe_conversas', a.recebe_conversas, 'aprovado', k.aprovado) order by k.nome)
               from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
              where a.cliente_id = p_cliente), '[]'::json),
    'templates', coalesce((select json_agg(json_build_object(
                 'id', t.id, 'canal_id', t.canal_id, 'nome', t.nome, 'idioma', t.idioma,
                 'categoria', t.categoria, 'status', t.status, 'corpo', t.corpo,
                 'num_parametros', t.num_parametros) order by t.nome, t.idioma)
               from public.nx_templates t where t.cliente_id = p_cliente), '[]'::json),
    'cfg', json_build_object(
                 'recibo_leitura', coalesce((v_cfg ->> 'recibo_leitura')::boolean, true),
                 'assinatura', coalesce((v_cfg ->> 'assinatura')::boolean, false)),
    'ia', json_build_object('ligada', coalesce(v_ia, false),
                            'cota', json_build_object('usadas', public.nx_uso(p_cliente, 'ia_mes'),
                                                      'limite', public.nx_limite(p_cliente, 'ia_mes'))),
    -- plano 1000b · CB-203: o nome do assistente da IA para todos os papéis (antes só no config de admin)
    'ia_assistente_nome', coalesce(v_iacfg ->> 'assistente_nome', ''),
    'config', v_config);
end $$;

-- ------------------------------------------------------------
-- CB-211 nx_agenda_dia — cópia da 20261008c_dados_telas.sql: o nome da campanha e do anúncio (a métrica mais recente) é
--        resolvido UMA vez por campanha/anúncio distinto do período (CTE), não por consulta (o mês com 300 consultas fazia 600
--        subconsultas). Mesma assinatura, mesma resposta.
-- ------------------------------------------------------------
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
  with base as (
    select l.* from public.nx_leads l
     where l.cliente_id = p_cliente and l.status in ('aberto', 'ganho')
       and l.consulta_em >= v_ini and l.consulta_em < v_fim
       and (not public.nx_crm_restrito(v) or l.dono_id is null or l.dono_id = v.conta_id)
  ), camp as (
    select c.plataforma, c.campanha_ext,
           (select m.campanha_nome from public.nx_metricas_dia m
             where m.cliente_id = p_cliente and m.plataforma = c.plataforma and m.campanha_ext = c.campanha_ext
               and m.campanha_nome is not null
             order by m.data desc limit 1) as nome
      from (select distinct b.plataforma, b.campanha_ext from base b where b.campanha_ext is not null) c
  ), anun as (
    select a.plataforma, a.anuncio_ext,
           (select m.anuncio_nome from public.nx_metricas_dia m
             where m.cliente_id = p_cliente and m.plataforma = a.plataforma and m.anuncio_ext = a.anuncio_ext
               and m.anuncio_nome is not null
             order by m.data desc limit 1) as nome
      from (select distinct b.plataforma, b.anuncio_ext from base b where b.anuncio_ext is not null) a
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'negocio_id', l.id, 'contato_id', l.contato_id, 'nome', coalesce(k.nome, l.nome), 'telefone', coalesce(k.telefone, l.telefone),
      'inicio', public.nx_agenda_iso(l.consulta_em), 'rotulo', public.nx_agenda_rotulo(l.consulta_em),
      'fim', public.nx_agenda_iso(l.consulta_em + make_interval(mins => public.nx_agenda_dur(cfg, l.servico))),
      'servico', l.servico, 'status', l.status, 'etapa', s.nome, 'marco', s.marco, 'dono_id', l.dono_id, 'titulo', l.titulo,
      'dono_nome', (select a.nome from public.nx_contas a where a.id = l.dono_id),
      'encaixe', coalesce((l.campos ->> 'encaixe')::boolean, false),
      'presenca', case when l.campos ->> 'presenca' in ('compareceu', 'faltou') then l.campos ->> 'presenca' end,
      'origem', l.origem, 'plataforma', l.plataforma, 'campanha_ext', l.campanha_ext, 'anuncio_ext', l.anuncio_ext,
      'campanha_nome', coalesce(cp.nome, nullif(l.rastreio ->> 'utm_campaign', '')),
      'anuncio_nome', coalesce(an.nome, nullif(l.rastreio ->> 'utm_content', '')),
      'rastreio', case when l.rastreio is null then null else jsonb_strip_nulls(jsonb_build_object(
        'utm_source', l.rastreio ->> 'utm_source', 'utm_medium', l.rastreio ->> 'utm_medium',
        'utm_campaign', l.rastreio ->> 'utm_campaign', 'utm_content', l.rastreio ->> 'utm_content',
        'utm_term', l.rastreio ->> 'utm_term', 'pagina', l.rastreio ->> 'pagina')) end)
    order by l.consulta_em, l.id), '[]'::jsonb) into r
    from base l
    left join public.nx_contatos k on k.id = l.contato_id
    left join public.nx_estagios s on s.id = l.estagio_id
    left join camp cp on cp.plataforma = l.plataforma and cp.campanha_ext = l.campanha_ext
    left join anun an on an.plataforma = l.plataforma and an.anuncio_ext = l.anuncio_ext;
  return json_build_object('data', v_de, 'dias', v_dias, 'fuso', 'America/Sao_Paulo', 'config', cfg, 'consultas', r,
    'bloqueios', public.nx_agenda_bloqueios_json(p_cliente, v_ini, v_fim));
end $$;

-- ------------------------------------------------------------
-- UB-223 nx_tema_salvar: guarda a marca anterior (tema_anterior) e a devolve
--   (cópia da definição em vigor: 20260928c_plataforma_b.sql)
-- ------------------------------------------------------------
create or replace function public.nx_tema_salvar(p_token text, p_cliente uuid, p_tema jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); t jsonb;
begin
  if v.papel not in ('gestor', 'super') then perform public.nx_exigir_modulo(p_cliente, 'marca'); end if;
  t := public.nx_marca_validar(p_tema, true);
  -- plano 1000b · UB-223: a marca que estava fica guardada («Voltar à marca anterior» salva a anterior de novo)
  update public.nx_clientes set tema_anterior = case when tema is distinct from t then tema else tema_anterior end, tema = t
   where id = p_cliente;
  perform public.nx_auditar((select x.org_id from public.nx_clientes x where x.id = p_cliente), p_cliente, v.conta_id, 'tema',
                            jsonb_build_object('chaves', (select jsonb_agg(x) from jsonb_object_keys(t) x)));
  return json_build_object('tema', t,
    'tema_anterior', (select x.tema_anterior from public.nx_clientes x where x.id = p_cliente), 'atualizado', public.nx_tema_hash(t, (select x.cfg from public.nx_clientes x where x.id = p_cliente)));
end $$;

-- ------------------------------------------------------------
-- UB-223 nx_cliente_tema: + tema_anterior
--   (cópia da definição em vigor: 20260928c_plataforma.sql)
-- ------------------------------------------------------------
create or replace function public.nx_cliente_tema(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura'); x public.nx_clientes;
begin
  select * into x from public.nx_clientes where id = p_cliente;
  return json_build_object(
    'tema', x.tema,
    'tema_anterior', x.tema_anterior,   -- plano 1000b · UB-223
    'marca_cliente', json_build_object('corMarca', x.cfg ->> 'corMarca', 'logoUrl', x.cfg ->> 'logoUrl'),
    'atualizado', public.nx_tema_hash(x.tema, x.cfg));
end $$;

-- ------------------------------------------------------------
-- Permissões: as cópias de mesma assinatura mantêm as da origem. As três com assinatura nova e a RPC nova são do painel com
-- p_token (passam pelo nx_ctx): anon + service_role, como as de origem; nunca authenticated.
-- ------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.nx_automacao_salvar(text, uuid, jsonb, timestamptz)',
    'public.nx_automacao_execucoes(text, uuid, uuid, integer, text, timestamptz, boolean)',
    'public.nx_cv_buscar_msgs(text, uuid, text, integer, bigint)',
    'public.nx_cv_marcar_nao_lida(text, uuid, bigint)'] loop
    execute format('revoke all on function %s from public, authenticated', f);
    execute format('grant execute on function %s to anon, service_role', f);
  end loop;
  raise notice 'nx_revogar_authenticated: % funções', public.nx_revogar_authenticated();
end $$;

insert into public.nx_versao_banco (nome) values ('20261015a_plano1000b')
on conflict (nome) do update set aplicada_em = now();

notify pgrst, 'reload schema';
