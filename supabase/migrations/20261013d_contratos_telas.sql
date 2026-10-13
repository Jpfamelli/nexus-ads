-- ============================================================
-- ÓRBITA — 20261013d_contratos_telas.sql · plano «1000+ melhorias» de 13/10/2026 · frente srv, lote srv-2, migração d
-- Contratos que as telas já leem por detecção. ADITIVA e idempotente: só create or replace na MESMA assinatura (cópia da definição
-- EM VIGOR, citada em cada bloco, + o marcado «plano 1000»); campos NOVOS nas respostas, nenhum removido; nenhum dado muda.
-- Depende da 20261013c (nx_conversas.primeira_entrada_em, nx_integracoes.ultimo_sync_parcial).
--   SV-110 nx_cv_listar sem row_number() sobre todas as conversas: ORDER BY + LIMIT direto (a aba «Aguardando» no índice parcial)
--   CA-247 nx_cv_json_item: ultima_msg_origem / ultima_msg_por / ultima_msg_por_nome (quem mandou a última saída)
--   CA-001 nx_cv_marcar_lida: papel leitura ou quem NÃO é o responsável (conversa de outra pessoa) não zera as não lidas
--          ({ignorado: true}); a resposta continua com ultimo_wamid_in
--   AS-145 nx_cv_horario_normalizar: faixa que cruza a meia-noite (22:00–02:00) aceita como a ÚLTIMA do dia (nx_horario_aberto e
--          nx_proximo_horario já tratam desde a 20261008a)
--   conv nx_cv_base.departamentos com o horário também para quem não é admin (a lista mostra a espera em horário útil)
--   CR-217 nx_inicio.agendados_sem_data {total, itens ≤ 5}
--   CR-204 nx_crm_cards (quadro, lista, busca): movido_por / movido_por_id / movido_em (última troca de etapa)
--   AD-138 nx_dados.agora (relógio do servidor) · SV-195 integracoes[].ultimo_sync_parcial · SV-116 hora_conversa pela
--          primeira_entrada_em da conversa (sem subconsulta em nx_mensagens por lead quando a coluna já está preenchida)
-- Smoke: supabase/testes/29_contratos_telas.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. CA-247 nx_cv_json_item — cópia de 20261009b_pulso_canais_origem.sql + origem/autor da última saída
-- ------------------------------------------------------------
create or replace function public.nx_cv_json_item(cv public.nx_conversas)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_ct jsonb; v_neg jsonb; v_dono text; v_origem text; v_por uuid; v_por_nome text;
begin
  if cv.id is null then return null; end if;
  select jsonb_build_object('id', k.id, 'nome', k.nome, 'telefone', k.telefone,
                            'optin_marketing', k.optin_marketing, 'bloqueado', k.bloqueado,
                            'origem', k.origem, 'plataforma', k.plataforma)
    into v_ct from public.nx_contatos k where k.id = cv.contato_id;
  if cv.negocio_id is not null then
    select jsonb_build_object('id', l.id, 'titulo', l.titulo, 'status', l.status,
                              'estagio_nome', s.nome, 'estagio_cor', s.cor)
      into v_neg
      from public.nx_leads l left join public.nx_estagios s on s.id = l.estagio_id
     where l.id = cv.negocio_id and l.cliente_id = cv.cliente_id;
  end if;
  if cv.atribuida_a is not null then
    select k.nome into v_dono from public.nx_contas k where k.id = cv.atribuida_a;
  end if;
  -- plano 1000 (CA-247): quem mandou a última saída — «Você:» só quando foi a própria pessoa (IA, automação e colega com o nome)
  if cv.ultima_msg_dir = 'out' then
    select m.origem, m.enviado_por, k.nome into v_origem, v_por, v_por_nome
      from public.nx_mensagens m left join public.nx_contas k on k.id = m.enviado_por
     where m.conversa_id = cv.id and m.direcao = 'out' and m.tipo not in ('nota', 'sistema')
     order by m.id desc limit 1;
  end if;
  return jsonb_build_object(
    'id', cv.id, 'contato', v_ct, 'canal_id', cv.canal_id, 'departamento_id', cv.departamento_id,
    'atribuida_a', cv.atribuida_a, 'atribuida_nome', v_dono, 'status', cv.status,
    'aguardando', cv.aguardando, 'nao_lidas', cv.nao_lidas, 'ultima_msg_em', cv.ultima_msg_em,
    'ultima_msg_resumo', cv.ultima_msg_resumo, 'ultima_msg_dir', cv.ultima_msg_dir,
    'ultima_msg_origem', v_origem, 'ultima_msg_por', v_por, 'ultima_msg_por_nome', v_por_nome,
    'ultima_entrada_em', cv.ultima_entrada_em,
    'janela_ate', cv.ultima_entrada_em + interval '24 hours',
    'etiquetas', to_jsonb(cv.etiquetas), 'protocolo', cv.protocolo, 'oculta', cv.oculta,
    'negocio', v_neg);
end $$;

-- ------------------------------------------------------------
-- 2. SV-110 nx_cv_listar — cópia de 20261013b_seguranca_dados.sql: o row_number() over (…) ordenava TODAS as conversas visíveis
--    que passavam no filtro antes do limit (20 mil conversas = 20 mil linhas ordenadas a cada abertura e atualização da lista).
--    Agora: ORDER BY + LIMIT v_lim + 1 direto, em dois ramos — «Aguardando» sem busca (predicado literal: índice parcial
--    nx_conversas_aguardando) e o resto por (ultima_msg_em, id) (índice nx_conversas_lista_ordem). Mesma resposta.
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
  v_dep uuid; v_canal uuid; v_at text; v_at_id uuid; v_etq uuid[]; v_nl boolean; v_antes_id bigint;
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
  exception when invalid_text_representation then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'filtro';
  end;
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
-- 3. CA-001 nx_cv_marcar_lida — cópia de 20260928e_conversas.sql: só zera as não lidas quem atende a conversa (dono dela, ou
--    ela sem dono). Papel leitura (supervisor só olhando) e quem abre a conversa de OUTRA pessoa deixam o contador como está —
--    antes o «1 nova» do atendente sumia porque alguém só olhou. A resposta continua com ultimo_wamid_in (+ ignorado).
-- ------------------------------------------------------------
create or replace function public.nx_cv_marcar_lida(p_token text, p_cliente uuid, p_conversa bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura'); v_w text; v_dono uuid; v_ignorado boolean;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  select cv.atribuida_a into v_dono from public.nx_conversas cv where cv.id = p_conversa and cv.cliente_id = p_cliente;
  v_ignorado := v.papel = 'leitura' or (v_dono is not null and v_dono is distinct from v.conta_id);
  if not v_ignorado then
    update public.nx_conversas set nao_lidas = 0, atualizado_em = now()
     where id = p_conversa and cliente_id = p_cliente and nao_lidas <> 0;
  end if;
  select m.wamid into v_w from public.nx_mensagens m
   where m.conversa_id = p_conversa and m.direcao = 'in' and m.wamid is not null
   order by m.id desc limit 1;
  return json_build_object('ultimo_wamid_in', v_w, 'ignorado', v_ignorado);
end $$;

-- ------------------------------------------------------------
-- 4. AS-145 nx_cv_horario_normalizar — cópia de 20260928e_conversas_b.sql: fim < início = faixa que passa da meia-noite
--    (22:00–02:00 vale até as 02:00 do dia seguinte), só como a ÚLTIMA faixa do dia (a mesma regra do validarHorario da tela)
-- ------------------------------------------------------------
create or replace function public.nx_cv_horario_normalizar(p jsonb)
returns jsonb
language plpgsql immutable
security definer
set search_path = ''
as $$
declare
  r jsonb := '{}'::jsonb;
  k text; dia jsonb; f jsonb; faixas jsonb; ini text; fim text; ant text; n int;
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) <> 'object' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'horario';
  end if;
  for k in select jsonb_object_keys(p) loop
    if k !~ '^[0-6]$' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'horario'; end if;
  end loop;
  for i in 0..6 loop
    dia := p -> i::text;
    faixas := '[]'::jsonb;
    ant := null;
    if dia is not null and jsonb_typeof(dia) <> 'null' then
      if jsonb_typeof(dia) <> 'array' or jsonb_array_length(dia) > 2 then
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'horario';
      end if;
      n := jsonb_array_length(dia);
      for j in 0..n - 1 loop
        f := dia -> j;
        if jsonb_typeof(f) <> 'array' or jsonb_array_length(f) <> 2 then
          raise exception 'dados_invalidos' using errcode = '22023', hint = 'horario';
        end if;
        ini := f ->> 0; fim := f ->> 1;
        if coalesce(ini, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           or coalesce(fim, '') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
           or ini = fim or (ant is not null and ini < ant)
           -- plano 1000 (AS-145): fim antes do início só na última faixa do dia (cruza a meia-noite)
           or (fim < ini and j <> n - 1) then
          raise exception 'dados_invalidos' using errcode = '22023', hint = 'horario';
        end if;
        ant := fim;
        faixas := faixas || jsonb_build_array(jsonb_build_array(ini, fim));
      end loop;
    end if;
    r := r || jsonb_build_object(i::text, faixas);
  end loop;
  return r;
end $$;

-- ------------------------------------------------------------
-- 5. nx_cv_base — cópia de 20260930e_cv_base_memoria_aprovada.sql: departamentos com o horário para todos os papéis (a lista
--    mede a espera em horário de atendimento; sem ele, quem não é admin via a espera corrida)
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
    'config', v_config);
end $$;

-- ------------------------------------------------------------
-- 6. CR-204 nx_crm_cards — cópia de 20260929c_cards_origem.sql + quem trocou a etapa por último (nx_historico tipo 'estagio')
-- ------------------------------------------------------------
create or replace function public.nx_crm_cards(p_cliente uuid, p_ids bigint[], v public.nx_ctx_t)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if p_ids is null or cardinality(p_ids) = 0 then return '[]'::json; end if;
  return coalesce((
    select json_agg(json_build_object(
      'id', l.id, 'titulo', l.titulo, 'nome', l.nome, 'telefone', l.telefone,
      'contato', case when k.id is null then null
                      else json_build_object('id', k.id, 'nome', k.nome, 'telefone', k.telefone) end,
      'valor_previsto', l.valor_previsto, 'valor', l.valor, 'status', l.status,
      'funil_id', l.funil_id, 'estagio_id', l.estagio_id, 'dono_id', l.dono_id,
      'etiquetas', l.etiquetas, 'servico', l.servico, 'origem', l.origem,
      'anuncio', (l.plataforma is not null or l.origem = 'anuncio'), 'plataforma', l.plataforma,
      'campanha_ext', l.campanha_ext, 'anuncio_ext', l.anuncio_ext,
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
        'utm_term', l.rastreio ->> 'utm_term', 'pagina', l.rastreio ->> 'pagina')) end,
      'estagio_em', l.estagio_em, 'criado_em', l.criado_em, 'fechado_em', l.fechado_em,
      'consulta_em', l.consulta_em, 'data_consulta', l.data_consulta, 'ordem', l.ordem,
      'tarefa', (select json_build_object('vence_em', t.vence_em, 'atrasada', coalesce(t.vence_em < now(), false))
                   from public.nx_tarefas t
                  where t.negocio_id = l.id and t.concluida_em is null
                  order by t.vence_em nulls last, t.id limit 1),
      'nao_lidas', coalesce((
         select sum(cv.nao_lidas)::int from public.nx_conversas cv
          where cv.contato_id = l.contato_id and cv.status <> 'resolvida' and cv.nao_lidas > 0
            -- regra nx_cv_visivel
            and cv.cliente_id = p_cliente
            and (not cv.oculta or public.nx_rank(v.papel) >= 2)
            and ( public.nx_rank(v.papel) >= 3
               or cv.atribuida_a = v.conta_id
               or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                     or cv.departamento_id = any(v.departamentos))
                    and (public.nx_rank(v.papel) = 2 or cv.atribuida_a is null or v.ver_todas) ) )), 0),
      -- plano 1000 (CR-204): quem moveu de etapa por último (automação = sem autor → null)
      'movido_por', mv.nome, 'movido_por_id', mv.autor_id, 'movido_em', mv.criado_em
    ) order by x.o)
    from unnest(p_ids) with ordinality x(id, o)
    join public.nx_leads l on l.id = x.id and l.cliente_id = p_cliente
    left join public.nx_contatos k on k.id = l.contato_id
    left join lateral (select h.autor_id, h.criado_em, kc.nome
                         from public.nx_historico h left join public.nx_contas kc on kc.id = h.autor_id
                        where h.negocio_id = l.id and h.tipo = 'estagio'
                        order by h.criado_em desc, h.id desc limit 1) mv on true), '[]'::json);
end $$;

-- ------------------------------------------------------------
-- 7. CR-217 nx_inicio — cópia de 20261008c_dados_telas.sql + agendados_sem_data (negócio aberto numa etapa de marco
--    «agendada» sem consulta marcada: a agenda e o lembrete não sabem dele — a mesma regra do selo «sem data» do quadro)
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
  v_prazo int; j_ag json; j_funil json; j_s_ag json; j_s_cs json; j_s_va json; j_s_ld json; j_sem_data json;
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

  -- plano 1000 (CR-217): agendados sem data — negócio aberto numa etapa aberta de marco «agendada» e sem consulta_em
  select json_build_object(
           'total', count(*),
           'itens', coalesce(json_agg(json_build_object('id', x.id, 'titulo', x.titulo, 'contato_nome', x.contato_nome,
                                                        'estagio_nome', x.estagio_nome, 'desde', x.desde)
                                      order by x.desde nulls last, x.id) filter (where x.rn <= 5), '[]'::json))
    into j_sem_data
    from (select l.id, l.titulo, coalesce(k.nome, l.nome) as contato_nome, e.nome as estagio_nome,
                 coalesce(l.estagio_em, l.criado_em) as desde,
                 row_number() over (order by coalesce(l.estagio_em, l.criado_em) nulls last, l.id) as rn
            from public.nx_leads l
            join public.nx_estagios e on e.id = l.estagio_id
            left join public.nx_contatos k on k.id = l.contato_id and k.cliente_id = p_cliente
           where l.cliente_id = p_cliente and l.status = 'aberto' and e.tipo = 'aberto' and e.marco = 'agendada'
             and l.consulta_em is null
             and (v_todos or l.dono_id = v.conta_id or l.dono_id is null)) x;

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
    'notificacoes_nao_lidas', v_notif,
    'agendados_sem_data', j_sem_data);
end $$;

-- ------------------------------------------------------------
-- 8. nx_dados — cópia de 20261008c_dados_telas.sql + agora (AD-138), integracoes[].ultimo_sync_parcial (SV-195) e hora_conversa
--    pela primeira_entrada_em da conversa (SV-116; enquanto a faxina não preencher as antigas, a subconsulta de antes vale)
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
    -- plano 1000 (AD-138): o relógio do servidor (a tela corrige o «atualizado há x min» de aparelho com hora errada)
    'agora', now(),
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
                     -- contato aberta no dia da conversa); null quando não houve mensagem (negócio digitado à mão).
                     -- plano 1000 (SV-116): a 1ª entrada vem da coluna da conversa; a subconsulta só para quem ainda não tem
                     (select extract(hour from (min(coalesce(cv.primeira_entrada_em,
                               (select min(m.criado_em) from public.nx_mensagens m
                                 where m.conversa_id = cv.id and m.direcao = 'in' and m.tipo <> 'sistema')))
                              at time zone 'America/Sao_Paulo'))::int
                        from public.nx_conversas cv
                       where cv.cliente_id = x.cliente_id
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
      select json_agg(json_build_object('canal', canal, 'ativo', ativo, 'ultimo_sync', ultimo_sync, 'status', status,
                                        'ultimo_sync_parcial', ultimo_sync_parcial))
        from public.nx_integracoes where cliente_id = p_cliente), '[]'::json));
end $function$;

-- ------------------------------------------------------------
-- 9. Permissões: create or replace não mexe nas permissões de quem já existia (todas as funções acima já existiam)
-- ------------------------------------------------------------
do $$
begin
  raise notice 'nx_revogar_authenticated: % funções', public.nx_revogar_authenticated();
end $$;

insert into public.nx_versao_banco (nome) values ('20261013d_contratos_telas')
on conflict (nome) do update set aplicada_em = now();

notify pgrst, 'reload schema';
