-- ============================================================
-- ÓRBITA — 20260928d_crm_b.sql · frente F4 (CRM) · parte P0-B
-- §5.3 da ESPEC: nx_tarefas_listar, nx_buscar, nx_contatos_importar,
-- nx_empresas_listar/ver/salvar/excluir, nx_funil_salvar/excluir,
-- nx_campo_salvar/excluir, nx_etiqueta_excluir, nx_motivo_salvar/excluir.
-- Aditivo e idempotente (create or replace). Nenhuma tabela nova; usa as
-- tabelas do arquivo a (F1) e os leitores internos do arquivo d
-- (nx_crm_uuid, nx_crm_int8, nx_crm_num, nx_crm_data, nx_crm_ts,
-- nx_crm_uuids, nx_crm_dono_ok, nx_crm_restrito, nx_crm_etiquetas_ok,
-- nx_crm_cards, nx_crm_tarefas_json).
-- As regras de etapa ↔ marco e a TRAVA DO ADS continuam SÓ no gatilho da
-- F1 (nx_tg_negocio_antes): aqui só se valida o que é do CRM.
-- Erros: '42501' = acesso, '22023' = dados (message = código, hint opcional).
-- ============================================================

-- ------------------------------------------------------------
-- Índice de apoio (aditivo): dedupe por e-mail da importação e da criação
-- de negócio (lower(email) por cliente) sem varrer os contatos do cliente.
-- ------------------------------------------------------------
create index if not exists nx_contatos_email on public.nx_contatos (cliente_id, lower(email)) where email is not null;

-- ------------------------------------------------------------
-- Internas
-- ------------------------------------------------------------

-- texto → chave de busca (minúsculo, sem acento)
create or replace function public.nx_crm_norm(p text)
returns text
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p, '')));
end $$;

-- texto → padrão LIKE seguro ('%x%'), já normalizado
create or replace function public.nx_crm_like(p text)
returns text
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return '%' || replace(replace(replace(public.nx_crm_norm(p), '\', '\\'), '%', '\%'), '_', '\_') || '%';
end $$;

-- rótulo → chave de campo (^[a-z][a-z0-9_]{1,39}$), única por cliente/entidade
create or replace function public.nx_crm_chave_campo(p_cliente uuid, p_entidade text, p_rotulo text)
returns text
language plpgsql stable
security definer
set search_path = ''
as $$
declare b text; c text; i int := 1;
begin
  b := regexp_replace(public.nx_crm_norm(p_rotulo), '[^a-z0-9]+', '_', 'g');
  b := btrim(b, '_');
  if b = '' then b := 'campo'; end if;
  if b !~ '^[a-z]' then b := 'c_' || b; end if;
  b := left(b, 34);
  if length(b) < 2 then b := b || '_campo'; end if;
  c := b;
  while exists (select 1 from public.nx_campos x where x.cliente_id = p_cliente and x.entidade = p_entidade and x.chave = c) loop
    i := i + 1;
    c := b || '_' || i;
  end loop;
  return c;
end $$;

-- valor de planilha (texto) → jsonb do campo personalizado; inválido → null
create or replace function public.nx_crm_campo_valor(p_tipo text, p_opcoes text[], p_txt text)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare s text := btrim(coalesce(p_txt, '')); t text; n numeric; d date; op text; lista jsonb := '[]'::jsonb; x text;
begin
  if s = '' then return null; end if;
  case p_tipo
    when 'texto' then return to_jsonb(left(s, 500));
    when 'texto_longo' then return to_jsonb(left(s, 5000));
    when 'numero', 'moeda' then
      t := regexp_replace(s, '(R\$|\s)', '', 'g');
      if t ~ ',' then t := replace(replace(t, '.', ''), ',', '.');
      elsif t ~ '^-?\d{1,3}(\.\d{3})+$' then t := replace(t, '.', '');
      end if;
      if t !~ '^-?\d+(\.\d+)?$' then return null; end if;
      n := t::numeric;
      if p_tipo = 'moeda' and n < 0 then return null; end if;
      return to_jsonb(n);
    when 'data' then
      begin
        if s ~ '^\d{4}-\d{2}-\d{2}' then d := left(s, 10)::date;
        elsif s ~ '^\d{1,2}/\d{1,2}/\d{4}$' then d := to_date(s, 'DD/MM/YYYY');
        else return null; end if;
      exception when others then return null;
      end;
      return to_jsonb(d::text);
    when 'opcao' then
      select o into op from unnest(coalesce(p_opcoes, '{}'::text[])) o where public.nx_crm_norm(o) = public.nx_crm_norm(s) limit 1;
      return case when op is null then null else to_jsonb(op) end;
    when 'multi' then
      foreach x in array regexp_split_to_array(s, '\s*[;,]\s*') loop
        continue when btrim(x) = '';
        select o into op from unnest(coalesce(p_opcoes, '{}'::text[])) o where public.nx_crm_norm(o) = public.nx_crm_norm(x) limit 1;
        if op is null then return null; end if;
        if not lista @> to_jsonb(array[op]) then lista := lista || to_jsonb(op); end if;
      end loop;
      return case when jsonb_array_length(lista) = 0 then null else lista end;
    when 'sim_nao' then
      t := public.nx_crm_norm(s);
      if t in ('sim', 's', 'true', '1', 'x', 'yes', 'y', 'verdadeiro') then return 'true'::jsonb; end if;
      if t in ('nao', 'n', 'false', '0', 'no', 'falso') then return 'false'::jsonb; end if;
      return null;
    when 'telefone' then
      t := public.nx_tel_normalizar(s);
      return case when t is null then null else to_jsonb(t) end;
    when 'email' then
      return case when s ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then to_jsonb(lower(s)) else null end;
    when 'url' then
      if s !~* '^https?://' then s := 'https://' || s; end if;
      return case when s ~* '^https?://[^\s./]+\.[^\s]{2,}$' then to_jsonb(left(s, 500)) else null end;
    else return to_jsonb(left(s, 500));
  end case;
end $$;

-- funil no formato do nx_crm_base (com as etapas na ordem)
create or replace function public.nx_crm_funil_json(p_cliente uuid, p_funil uuid)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return (select json_build_object('id', f.id, 'nome', f.nome, 'ordem', f.ordem, 'padrao', f.padrao,
            'conta_no_ads', f.conta_no_ads, 'ativo', f.ativo,
            'estagios', coalesce((
               select json_agg(json_build_object('id', e.id, 'nome', e.nome, 'cor', e.cor, 'ordem', e.ordem,
                        'tipo', e.tipo, 'marco', e.marco, 'probabilidade', e.probabilidade, 'sla_horas', e.sla_horas)
                        order by e.ordem, e.criado_em)
                 from public.nx_estagios e where e.funil_id = f.id), '[]'::json))
            from public.nx_funis f where f.id = p_funil and f.cliente_id = p_cliente);
end $$;

create or replace function public.nx_crm_empresa_json(p_cliente uuid, p_id bigint)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return (select to_jsonb(e) - 'busca' from public.nx_empresas e where e.id = p_id and e.cliente_id = p_cliente);
end $$;

-- ------------------------------------------------------------
-- nx_tarefas_listar (T9)
-- filtro {dono:'eu'|'todos'|uuid, situacao:'abertas'|'atrasadas'|'hoje'|'proximas'|'concluidas', negocio_id?, contato_id?}
-- atendente/leitura só veem as próprias (supervisor+ vê todas), salvo quando o filtro é um negócio/contato visível.
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
  l public.nx_leads; k public.nx_contatos;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if jsonb_typeof(f) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'filtro'; end if;
  if v_sit not in ('abertas', 'atrasadas', 'hoje', 'proximas', 'concluidas') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'situacao';
  end if;
  v_fim := v_ini + interval '1 day';
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
             else t.concluida_em is not null end
     order by case when v_sit = 'concluidas' then -extract(epoch from t.concluida_em) end,
              t.vence_em asc nulls last, t.id
     limit 201) into ids;

  return json_build_object(
    'itens', public.nx_crm_tarefas_json(p_cliente, ids[1:200]),
    'tem_mais', coalesce(cardinality(ids), 0) > 200,
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
-- nx_buscar (Ctrl/⌘+K do shell): contatos, negócios e conversas (≤ 8 de cada)
-- ordem: começo do texto > início de palavra > contém
-- ------------------------------------------------------------
create or replace function public.nx_buscar(p_token text, p_cliente uuid, p_q text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  q text := left(btrim(coalesce(p_q, '')), 80);
  d text; dk text; qn text; pl text; pc text; pp text; tel boolean := false;
  r_ct json; r_ng json; r_cv json; restr boolean := public.nx_crm_restrito(v);
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if char_length(q) < 2 then
    return json_build_object('contatos', '[]'::json, 'negocios', '[]'::json, 'conversas', '[]'::json);
  end if;
  d := regexp_replace(q, '\D', '', 'g');
  if q ~ '^[0-9\s().+-]+$' and length(d) >= 4 then
    tel := true;
    dk := coalesce(public.nx_tel_chave(public.nx_tel_normalizar(d)), d);
  end if;
  qn := replace(replace(replace(public.nx_crm_norm(q), '\', '\\'), '%', '\%'), '_', '\_');
  pl := '%' || qn || '%';       -- contém
  pc := qn || '%';              -- começo
  pp := '% ' || qn || '%';      -- início de palavra

  -- contatos
  select coalesce(json_agg(json_build_object('id', x.id, 'nome', x.nome, 'telefone', x.telefone) order by x.rk, x.nm, x.id), '[]'::json)
    into r_ct
    from (select k.id, k.nome, k.telefone, lower(coalesce(k.nome, '')) nm,
                 case when tel then 0
                      when k.busca like pc then 0 when k.busca like pp then 1 else 2 end rk
            from public.nx_contatos k
           where k.cliente_id = p_cliente
             and (not restr or k.dono_id is null or k.dono_id = v.conta_id)
             and (case when tel then (k.telefone like '%' || d || '%' or k.tel_chave like '%' || dk || '%')
                       else k.busca like pl end)
           order by rk, nm, k.id limit 8) x;

  -- negócios (título ou nome)
  select coalesce(json_agg(json_build_object('id', x.id, 'titulo', x.titulo, 'contato_nome', x.contato_nome,
                                             'estagio_nome', x.estagio_nome, 'status', x.status)
                           order by x.rk, x.ab desc, x.criado_em desc), '[]'::json)
    into r_ng
    from (select l.id, coalesce(l.titulo, l.nome) titulo, coalesce(k.nome, l.nome) contato_nome, e.nome estagio_nome,
                 l.status, (l.status = 'aberto') ab, l.criado_em,
                 case when tel then 0
                      when public.nx_crm_norm(coalesce(l.titulo, l.nome)) like pc then 0
                      when public.nx_crm_norm(coalesce(l.titulo, '') || ' ' || coalesce(l.nome, '')) like pp then 1 else 2 end rk
            from public.nx_leads l
            left join public.nx_contatos k on k.id = l.contato_id
            left join public.nx_estagios e on e.id = l.estagio_id
           where l.cliente_id = p_cliente
             and (not restr or l.dono_id is null or l.dono_id = v.conta_id)
             and (case when tel then (l.telefone like '%' || d || '%' or l.telefone like '%' || dk || '%')
                       else public.nx_crm_norm(coalesce(l.titulo, '') || ' ' || coalesce(l.nome, '')) like pl end)
           order by rk, (l.status = 'aberto') desc, l.criado_em desc limit 8) x;

  -- conversas visíveis (contato ou protocolo)
  select coalesce(json_agg(json_build_object('id', x.id, 'contato_nome', x.contato_nome, 'protocolo', x.protocolo,
                                             'status', x.status, 'telefone', x.telefone)
                           order by x.rk, x.ult desc nulls last), '[]'::json)
    into r_cv
    from (select cv.id, coalesce(k.nome, k.telefone) contato_nome, k.telefone, cv.protocolo, cv.status, cv.ultima_msg_em ult,
                 case when cv.protocolo is not null and lower(cv.protocolo) like lower(q) || '%' then 0
                      when k.busca like pc then 0 when k.busca like pp then 1 else 2 end rk
            from public.nx_conversas cv
            join public.nx_contatos k on k.id = cv.contato_id
           where cv.cliente_id = p_cliente
             and ( (tel and (k.telefone like '%' || d || '%' or k.tel_chave like '%' || dk || '%'))
                or (not tel and k.busca like pl)
                or (cv.protocolo is not null and cv.protocolo like '%' || replace(replace(q, '%', ''), '_', '') || '%') )
             -- regra nx_cv_visivel
             and (not cv.oculta or public.nx_rank(v.papel) >= 2)
             and ( public.nx_rank(v.papel) >= 3
                or cv.atribuida_a = v.conta_id
                or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                      or cv.departamento_id = any(v.departamentos))
                     and (public.nx_rank(v.papel) = 2 or cv.atribuida_a is null or v.ver_todas) ) )
           order by rk, cv.ultima_msg_em desc nulls last limit 8) x;

  return json_build_object('contatos', r_ct, 'negocios', r_ng, 'conversas', r_cv);
end $$;

-- ------------------------------------------------------------
-- nx_contatos_importar (T10): lote de até 100 linhas
-- ------------------------------------------------------------
create or replace function public.nx_contatos_importar(p_token text, p_cliente uuid, p_linhas jsonb, p_opcoes jsonb default '{}'::jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'supervisor');
  o jsonb := coalesce(p_opcoes, '{}'::jsonb);
  n int; i int; lin jsonb; nl int;
  v_atualizar boolean := false;
  v_etq_opc uuid[];
  v_tem_dono boolean; v_dono uuid;
  v_criar_neg boolean := false; v_funil uuid; e public.nx_estagios; e2 public.nx_estagios;
  v_imp bigint; v_linha0 int := 0;
  -- por linha
  v_nome text; v_tel_bruto text; v_tel text; v_chave text; v_email text; v_uf text; v_nasc date; v_doc text; v_cidade text;
  v_obs text; v_origem text; v_emp_nome text; v_emp bigint; v_etqs uuid[]; v_campos jsonb; v_id bigint; v_existe boolean;
  v_titulo text; v_valor numeric; v_est_nome text; v_x text; v_j jsonb; cp record; v_tmp text;
  -- pré-contagem
  v_novos int := 0; v_vistos text[] := '{}';
  -- caches
  c_emp jsonb := '{}'::jsonb; c_etq jsonb := '{}'::jsonb;
  -- resultado
  v_criados int := 0; v_atualizados int := 0; v_ignorados int := 0;
  v_erros jsonb := '[]'::jsonb; v_avisos jsonb := '[]'::jsonb;
  v_msg text; v_hint text; v_acao text; v_av jsonb;
  paleta constant text[] := array['#6FA3CF','#8FB8DD','#E5B35C','#C9BFAF','#7FD1A5','#F08A74','#9D9486','#B0761F','#CF9540','#A98BD6','#5FB3A8','#D67FA3'];
  origens constant text[] := array['anuncio','whatsapp','indicacao','organico','manual','site','importacao'];
  campos_ct constant jsonb := coalesce((select jsonb_object_agg(x.chave, jsonb_build_object('tipo', x.tipo, 'opcoes', to_jsonb(x.opcoes), 'rotulo', x.rotulo))
                                           from public.nx_campos x
                                          where x.cliente_id = p_cliente and x.entidade = 'contato' and x.ativo), '{}'::jsonb);
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if jsonb_typeof(o) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'opcoes'; end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'linhas'; end if;
  n := jsonb_array_length(p_linhas);
  if n > 100 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'linhas'; end if;
  if o ? 'atualizar' then
    if jsonb_typeof(o -> 'atualizar') not in ('boolean', 'null') then raise exception 'dados_invalidos' using errcode = '22023', hint = 'atualizar'; end if;
    v_atualizar := coalesce((o ->> 'atualizar')::boolean, false);
  end if;
  v_etq_opc := public.nx_crm_etiquetas_ok(p_cliente, public.nx_crm_uuids(o, 'etiquetas'));
  v_tem_dono := o ? 'dono_id';
  if v_tem_dono then
    v_dono := public.nx_crm_uuid(o, 'dono_id');
    if not public.nx_crm_dono_ok(p_cliente, v_dono) then raise exception 'dados_invalidos' using errcode = '22023', hint = 'dono_id'; end if;
  end if;
  v_linha0 := coalesce(least(greatest(public.nx_crm_int8(o, 'linha_inicial'), 0), 1000000)::int, 0);
  -- negócio por linha (opcional): etapa aberta do funil escolhido
  if jsonb_typeof(o -> 'negocio') = 'object' then
    v_funil := public.nx_crm_uuid(o -> 'negocio', 'funil_id');
    if nullif(o -> 'negocio' ->> 'estagio_id', '') is not null then
      select * into e from public.nx_estagios s
       where s.id = public.nx_crm_uuid(o -> 'negocio', 'estagio_id') and s.cliente_id = p_cliente
         and (v_funil is null or s.funil_id = v_funil);
      if e.id is null then raise exception 'estagio_invalido' using errcode = '22023'; end if;
      if e.tipo <> 'aberto' then raise exception 'estagio_invalido' using errcode = '22023', hint = 'fechado'; end if;
    else
      if v_funil is null then
        select f.id into v_funil from public.nx_funis f where f.cliente_id = p_cliente and f.padrao limit 1;
      end if;
      if v_funil is null or not exists (select 1 from public.nx_funis f where f.id = v_funil and f.cliente_id = p_cliente and f.ativo) then
        raise exception 'funil_invalido' using errcode = '22023', hint = 'nao_encontrado';
      end if;
      select * into e from public.nx_estagios s where s.funil_id = v_funil and s.tipo = 'aberto' order by s.ordem limit 1;
      if e.id is null then raise exception 'estagio_invalido' using errcode = '22023', hint = 'funil_sem_etapa'; end if;
    end if;
    v_funil := e.funil_id;
    v_criar_neg := true;
  end if;

  -- importação (acumula no mesmo registro quando o front repete o id)
  v_imp := public.nx_crm_int8(o, 'importacao_id');
  if v_imp is not null and not exists (select 1 from public.nx_importacoes x where x.id = v_imp and x.cliente_id = p_cliente) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'importacao_id';
  end if;
  if n = 0 then
    return json_build_object('importacao_id', v_imp, 'criados', 0, 'atualizados', 0, 'ignorados', 0,
                             'erros', '[]'::json, 'avisos', '[]'::json);
  end if;

  -- 1ª passada: quantos contatos NOVOS este lote cria (limite do plano conferido uma vez)
  for i in 0 .. n - 1 loop
    lin := p_linhas -> i;
    continue when jsonb_typeof(lin) <> 'object';
    v_tel := public.nx_tel_normalizar(nullif(btrim(lin ->> 'telefone'), ''));
    v_chave := public.nx_tel_chave(v_tel);
    v_email := lower(nullif(btrim(lin ->> 'email'), ''));
    if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_email := null; end if;
    v_nome := nullif(btrim(lin ->> 'nome'), '');
    continue when v_nome is null and v_tel is null and v_email is null;
    v_existe := (v_chave is not null and (('t:' || v_chave) = any(v_vistos)
                   or exists (select 1 from public.nx_contatos k where k.cliente_id = p_cliente and k.tel_chave = v_chave)))
             or (v_email is not null and (('e:' || v_email) = any(v_vistos)
                   or exists (select 1 from public.nx_contatos k where k.cliente_id = p_cliente and lower(k.email) = v_email)));
    if not v_existe then v_novos := v_novos + 1; end if;
    if v_chave is not null then v_vistos := v_vistos || ('t:' || v_chave); end if;
    if v_email is not null then v_vistos := v_vistos || ('e:' || v_email); end if;
  end loop;
  if v_novos > 0 then perform public.nx_exigir_limite(p_cliente, 'contatos', v_novos); end if;

  perform set_config('nx.lote', '1', true);

  -- 2ª passada: grava
  for i in 0 .. n - 1 loop
    lin := p_linhas -> i;
    nl := coalesce(case when (lin ->> '_linha') ~ '^\d{1,7}$' then (lin ->> '_linha')::int end, v_linha0 + i + 1);
    if jsonb_typeof(lin) <> 'object' then
      v_erros := v_erros || jsonb_build_object('linha', nl, 'motivo', 'Linha em formato inválido');
      continue;
    end if;
    v_acao := null; v_av := '[]'::jsonb;
    begin
      v_nome := left(nullif(btrim(lin ->> 'nome'), ''), 160);
      v_tel_bruto := nullif(btrim(lin ->> 'telefone'), '');
      v_tel := public.nx_tel_normalizar(v_tel_bruto);
      if v_tel_bruto is not null and v_tel is null then
        v_av := v_av || jsonb_build_object('linha', nl, 'motivo', 'Telefone inválido — importado sem telefone');
      end if;
      v_chave := public.nx_tel_chave(v_tel);
      v_email := lower(nullif(btrim(lin ->> 'email'), ''));
      if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        v_av := v_av || jsonb_build_object('linha', nl, 'motivo', 'E-mail inválido — importado sem e-mail');
        v_email := null;
      end if;
      if v_nome is null and v_tel is null and v_email is null then
        v_ignorados := v_ignorados + 1;
        continue;
      end if;
      v_uf := upper(nullif(btrim(lin ->> 'uf'), ''));
      if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then
        v_av := v_av || jsonb_build_object('linha', nl, 'motivo', 'UF inválida — ignorada');
        v_uf := null;
      end if;
      v_nasc := null;
      if nullif(btrim(lin ->> 'nascimento'), '') is not null then
        begin
          v_nasc := public.nx_crm_data(lin, 'nascimento');
          if v_nasc > current_date or v_nasc < date '1900-01-01' then raise exception 'x'; end if;
        exception when others then
          v_nasc := null;
          v_av := v_av || jsonb_build_object('linha', nl, 'motivo', 'Nascimento inválido — ignorado');
        end;
      end if;
      v_doc := left(nullif(btrim(lin ->> 'documento'), ''), 40);
      v_cidade := left(nullif(btrim(lin ->> 'cidade'), ''), 80);
      v_obs := left(nullif(btrim(lin ->> 'obs'), ''), 5000);
      v_origem := public.nx_crm_norm(nullif(btrim(lin ->> 'origem'), ''));
      v_origem := case
        when v_origem = '' then null
        when v_origem = any(origens) then v_origem
        when v_origem like 'anunc%' or v_origem in ('meta', 'facebook', 'instagram', 'google', 'ads') then 'anuncio'
        when v_origem like 'whats%' or v_origem = 'zap' then 'whatsapp'
        when v_origem like 'indica%' then 'indicacao'
        when v_origem like 'organ%' then 'organico'
        when v_origem like 'site%' or v_origem like 'formul%' then 'site'
        else null end;
      -- empresa (nome → acha/cria)
      v_emp := null;
      v_emp_nome := left(nullif(btrim(lin ->> 'empresa'), ''), 160);
      if v_emp_nome is not null then
        if c_emp ? public.nx_crm_norm(v_emp_nome) then
          v_emp := (c_emp ->> public.nx_crm_norm(v_emp_nome))::bigint;
        else
          select m.id into v_emp from public.nx_empresas m
           where m.cliente_id = p_cliente and public.nx_crm_norm(m.nome) = public.nx_crm_norm(v_emp_nome) order by m.id limit 1;
          if v_emp is null then
            insert into public.nx_empresas (cliente_id, nome) values (p_cliente, v_emp_nome) returning id into v_emp;
          end if;
          c_emp := c_emp || jsonb_build_object(public.nx_crm_norm(v_emp_nome), v_emp);
        end if;
      end if;
      -- etiquetas ('a;b' → acha/cria) + as do lote
      v_etqs := v_etq_opc;
      if nullif(btrim(lin ->> 'etiquetas'), '') is not null then
        foreach v_x in array coalesce((select array_agg(left(btrim(s), 40)) from regexp_split_to_table(lin ->> 'etiquetas', '\s*[;|]\s*') s
                                         where btrim(s) <> ''), '{}'::text[]) loop
          exit when cardinality(v_etqs) >= 30;
          if c_etq ? lower(v_x) then
            v_etqs := v_etqs || (c_etq ->> lower(v_x))::uuid;
          else
            select t.id into v_tmp from public.nx_etiquetas t where t.cliente_id = p_cliente and lower(t.nome) = lower(v_x);
            if v_tmp is null then
              insert into public.nx_etiquetas (cliente_id, nome, cor)
              values (p_cliente, v_x, paleta[1 + (select count(*) from public.nx_etiquetas t where t.cliente_id = p_cliente)::int % 12])
              returning id::text into v_tmp;
            end if;
            c_etq := c_etq || jsonb_build_object(lower(v_x), v_tmp);
            v_etqs := v_etqs || v_tmp::uuid;
            v_tmp := null;
          end if;
        end loop;
      end if;
      v_etqs := coalesce((select array_agg(distinct x) from unnest(v_etqs) x), '{}'::uuid[]);
      -- campos personalizados de contato (só chaves do catálogo)
      v_campos := '{}'::jsonb;
      if jsonb_typeof(lin -> 'campos') = 'object' then
        for cp in select key, value from jsonb_each(lin -> 'campos') loop
          continue when not (campos_ct ? cp.key);
          v_j := public.nx_crm_campo_valor(campos_ct -> cp.key ->> 'tipo',
                   array(select jsonb_array_elements_text(campos_ct -> cp.key -> 'opcoes')),
                   case when jsonb_typeof(cp.value) = 'string' then cp.value #>> '{}' else cp.value::text end);
          if v_j is null then
            if btrim(coalesce(cp.value #>> '{}', '')) <> '' then
              v_av := v_av || jsonb_build_object('linha', nl, 'motivo',
                            format('Campo «%s»: valor não reconhecido — ignorado', campos_ct -> cp.key ->> 'rotulo'));
            end if;
          else
            v_campos := v_campos || jsonb_build_object(cp.key, v_j);
          end if;
        end loop;
      end if;

      -- dedupe: tel_chave, depois e-mail
      v_id := null;
      if v_chave is not null then
        select k.id into v_id from public.nx_contatos k where k.cliente_id = p_cliente and k.tel_chave = v_chave;
      end if;
      if v_id is null and v_email is not null then
        select k.id into v_id from public.nx_contatos k where k.cliente_id = p_cliente and lower(k.email) = v_email order by k.id limit 1;
      end if;

      if v_id is not null then
        if not v_atualizar then
          v_ignorados := v_ignorados + 1;
          continue;
        end if;
        update public.nx_contatos k set
          nome = coalesce(v_nome, k.nome),
          telefone = coalesce(k.telefone, v_tel),
          email = coalesce(v_email, k.email),
          documento = coalesce(v_doc, k.documento),
          nascimento = coalesce(v_nasc, k.nascimento),
          cidade = coalesce(v_cidade, k.cidade),
          uf = coalesce(v_uf, k.uf),
          empresa_id = coalesce(v_emp, k.empresa_id),
          obs = case when v_obs is null then k.obs when k.obs is null then v_obs
                     when position(v_obs in k.obs) > 0 then k.obs else left(k.obs || E'\n' || v_obs, 5000) end,
          etiquetas = coalesce((select array_agg(distinct x) from unnest(k.etiquetas || v_etqs) x), '{}'::uuid[]),
          campos = k.campos || v_campos
        where k.id = v_id;
        v_acao := 'atualizado';
        perform public.nx_historico_add(p_cliente, 'importado', v_id, null, null,
                  jsonb_build_object('acao', 'atualizado', 'importacao_id', v_imp));
      else
        insert into public.nx_contatos (cliente_id, nome, telefone, email, documento, nascimento, cidade, uf, empresa_id,
                                        origem, dono_id, etiquetas, campos, obs)
        values (p_cliente, v_nome, v_tel, v_email, v_doc, v_nasc, v_cidade, v_uf, v_emp,
                coalesce(v_origem, 'importacao'), case when v_tem_dono then v_dono end, v_etqs, v_campos, v_obs)
        returning id into v_id;
        v_acao := 'criado';
        perform public.nx_historico_add(p_cliente, 'importado', v_id, null, null,
                  jsonb_build_object('acao', 'criado', 'importacao_id', v_imp));
      end if;

      -- negócio da linha
      if v_criar_neg then
        e2 := e;
        v_est_nome := nullif(btrim(lin ->> 'estagio'), '');
        if v_est_nome is not null then
          select * into e2 from public.nx_estagios s
           where s.funil_id = v_funil and public.nx_crm_norm(s.nome) = public.nx_crm_norm(v_est_nome) order by s.ordem limit 1;
          if e2.id is null or e2.tipo <> 'aberto' then
            v_av := v_av || jsonb_build_object('linha', nl, 'motivo',
                          format('Etapa «%s» não existe ou está fechada — usamos «%s»', left(v_est_nome, 40), e.nome));
            e2 := e;
          end if;
        end if;
        if exists (select 1 from public.nx_leads l where l.cliente_id = p_cliente and l.contato_id = v_id
                                                    and l.funil_id = v_funil and l.status = 'aberto') then
          v_av := v_av || jsonb_build_object('linha', nl, 'motivo', 'Já tinha negócio aberto nesse funil — nenhum novo criado');
        else
          v_valor := null;
          if nullif(btrim(lin ->> 'negocio_valor'), '') is not null then
            v_j := public.nx_crm_campo_valor('moeda', null, lin ->> 'negocio_valor');
            if v_j is null then
              v_av := v_av || jsonb_build_object('linha', nl, 'motivo', 'Valor do negócio inválido — ignorado');
            else
              v_valor := round((v_j #>> '{}')::numeric, 2);
              if v_valor > 9999999999 then v_valor := null; end if;
            end if;
          end if;
          v_titulo := left(nullif(btrim(lin ->> 'negocio_titulo'), ''), 120);
          insert into public.nx_leads (cliente_id, contato_id, funil_id, estagio_id, titulo, valor_previsto, dono_id,
                                       origem, atualizado_em)
          values (p_cliente, v_id, e2.funil_id, e2.id, v_titulo, v_valor, case when v_tem_dono then v_dono end,
                  'importacao', now());
        end if;
      end if;
    exception when others then
      get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
      if v_msg = 'limite_plano' then raise; end if;
      v_acao := null; v_av := '[]'::jsonb;   -- a linha foi desfeita: nada dela conta
      v_erros := v_erros || jsonb_build_object('linha', nl, 'motivo',
                   case v_msg
                     when 'telefone_invalido' then 'Telefone inválido'
                     when 'dados_invalidos' then 'Dados inválidos' || coalesce(' (' || nullif(v_hint, '') || ')', '')
                     else 'Não foi possível gravar esta linha' end);
    end;
    -- só conta o que ficou gravado (a exceção desfaz a linha inteira)
    v_avisos := v_avisos || v_av;
    if v_acao = 'criado' then v_criados := v_criados + 1;
    elsif v_acao = 'atualizado' then v_atualizados := v_atualizados + 1; end if;
  end loop;

  -- registro da importação
  if v_imp is null then
    insert into public.nx_importacoes (cliente_id, conta_id, arquivo, total, criados, atualizados, ignorados, erros)
    values (p_cliente, v.conta_id, left(nullif(btrim(o ->> 'arquivo'), ''), 200), n, v_criados, v_atualizados, v_ignorados,
            (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(v_erros) x limit 1000) s))
    returning id into v_imp;
  else
    update public.nx_importacoes x set
      total = x.total + n, criados = x.criados + v_criados, atualizados = x.atualizados + v_atualizados,
      ignorados = x.ignorados + v_ignorados,
      erros = (select coalesce(jsonb_agg(y), '[]'::jsonb) from (select y from jsonb_array_elements(x.erros || v_erros) y limit 1000) s)
    where x.id = v_imp;
  end if;

  -- pulso uma vez no fim do lote
  if v_criados + v_atualizados > 0 then
    perform set_config('nx.lote_clientes',
      case when coalesce(current_setting('nx.lote_clientes', true), '') = '' then p_cliente::text
           when position(p_cliente::text in current_setting('nx.lote_clientes', true)) > 0 then current_setting('nx.lote_clientes', true)
           else current_setting('nx.lote_clientes', true) || ',' || p_cliente::text end, true);
  end if;
  perform set_config('nx.lote', '', true);
  perform public.nx_pulso_lote_fim();

  return json_build_object('importacao_id', v_imp, 'criados', v_criados, 'atualizados', v_atualizados,
                           'ignorados', v_ignorados, 'erros', v_erros, 'avisos', v_avisos);
end $$;

-- ------------------------------------------------------------
-- Empresas (T8)
-- ------------------------------------------------------------
create or replace function public.nx_empresas_listar(p_token text, p_cliente uuid, p_filtro jsonb default '{}'::jsonb,
                                                     p_pagina int default 1, p_por_pagina int default 50)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  f jsonb := coalesce(p_filtro, '{}'::jsonb);
  n int := least(greatest(coalesce(p_por_pagina, 50), 1), 100);
  pg int := least(greatest(coalesce(p_pagina, 1), 1), 100000);
  q text := btrim(coalesce(f ->> 'busca', ''));
  pl text; v_total int; itens json; restr boolean := public.nx_crm_restrito(v);
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if jsonb_typeof(f) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'filtro'; end if;
  pl := case when q = '' then null else public.nx_crm_like(q) end;
  select count(*) into v_total from (
    select 1 from public.nx_empresas e where e.cliente_id = p_cliente and (pl is null or e.busca like pl) limit 100001) x;
  -- as contagens seguem a mesma visibilidade do nx_empresa_ver (atendente/leitura restrito: só o que é dele ou sem dono)
  select coalesce(json_agg(json_build_object(
           'id', e.id, 'nome', e.nome, 'documento', e.documento, 'cidade', e.cidade, 'uf', e.uf,
           'telefone', e.telefone, 'email', e.email, 'site', e.site, 'criado_em', e.criado_em,
           'contatos', (select count(*) from public.nx_contatos k where k.empresa_id = e.id and k.cliente_id = p_cliente
                           and (not restr or k.dono_id is null or k.dono_id = v.conta_id)),
           'negocios_abertos', (select count(*) from public.nx_contatos k join public.nx_leads l on l.contato_id = k.id
                                 where k.empresa_id = e.id and k.cliente_id = p_cliente and l.cliente_id = p_cliente and l.status = 'aberto'
                                   and (not restr or l.dono_id is null or l.dono_id = v.conta_id)))
         order by lower(e.nome), e.id), '[]'::json)
    into itens
    from (select * from public.nx_empresas e
           where e.cliente_id = p_cliente and (pl is null or e.busca like pl)
           order by lower(e.nome), e.id limit n offset (pg - 1) * n) e;
  return json_build_object('itens', itens, 'total', v_total, 'pagina', pg, 'por_pagina', n, 'tem_mais', pg * n < v_total);
end $$;

create or replace function public.nx_empresa_ver(p_token text, p_cliente uuid, p_id bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  emp jsonb; restr boolean := public.nx_crm_restrito(v);
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  emp := public.nx_crm_empresa_json(p_cliente, p_id);
  if emp is null then raise exception 'empresa_nao_encontrada' using errcode = '22023'; end if;
  return json_build_object(
    'empresa', emp,
    'contatos', coalesce((
      select json_agg(json_build_object('id', k.id, 'nome', k.nome, 'telefone', k.telefone, 'email', k.email,
                                        'etiquetas', k.etiquetas, 'dono_id', k.dono_id) order by lower(k.nome) nulls last, k.id)
        from (select * from public.nx_contatos k
               where k.empresa_id = p_id and k.cliente_id = p_cliente
                 and (not restr or k.dono_id is null or k.dono_id = v.conta_id)
               order by lower(k.nome) nulls last, k.id limit 200) k), '[]'::json),
    'negocios', public.nx_crm_cards(p_cliente, array(
                  select l.id from public.nx_leads l join public.nx_contatos k on k.id = l.contato_id
                   where k.empresa_id = p_id and k.cliente_id = p_cliente and l.cliente_id = p_cliente
                     and (not restr or l.dono_id is null or l.dono_id = v.conta_id)
                   order by (l.status = 'aberto') desc, l.criado_em desc limit 100), v));
end $$;

create or replace function public.nx_empresa_salvar(p_token text, p_cliente uuid, p_empresa jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  c jsonb := coalesce(p_empresa, '{}'::jsonb);
  v_id bigint := public.nx_crm_int8(c, 'id');
  r public.nx_empresas; v_nome text; v_tel text; v_email text; v_uf text; v_site text; v_campos jsonb; v_ch text;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if jsonb_typeof(c) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'empresa'; end if;
  if v_id is not null then
    select * into r from public.nx_empresas where id = v_id and cliente_id = p_cliente for update;
    if r.id is null then raise exception 'empresa_nao_encontrada' using errcode = '22023'; end if;
  end if;
  if v_id is null or c ? 'nome' then
    v_nome := left(nullif(btrim(c ->> 'nome'), ''), 160);
    if v_nome is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'nome'; end if;
  end if;
  if c ? 'telefone' and nullif(btrim(c ->> 'telefone'), '') is not null then
    v_tel := public.nx_tel_normalizar(c ->> 'telefone');
    if v_tel is null then raise exception 'telefone_invalido' using errcode = '22023', hint = 'telefone'; end if;
  end if;
  if c ? 'email' then
    v_email := lower(nullif(btrim(c ->> 'email'), ''));
    if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'email';
    end if;
  end if;
  if c ? 'uf' then
    v_uf := upper(nullif(btrim(c ->> 'uf'), ''));
    if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'uf'; end if;
  end if;
  if c ? 'site' then
    v_site := nullif(btrim(c ->> 'site'), '');
    if v_site is not null and v_site !~* '^https?://' then v_site := 'https://' || v_site; end if;
    if v_site is not null and v_site !~* '^https?://[^\s./]+\.[^\s]{2,}$' then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'site';
    end if;
    v_site := left(v_site, 300);
  end if;
  if c ? 'campos' and jsonb_typeof(c -> 'campos') not in ('object', 'null') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'campos';
  end if;
  v_campos := jsonb_strip_nulls(coalesce(r.campos, '{}'::jsonb)
                || coalesce(case when jsonb_typeof(c -> 'campos') = 'object' then c -> 'campos' end, '{}'::jsonb));
  if v_id is null or c ? 'campos' then
    select x.chave into v_ch from public.nx_campos x
     where x.cliente_id = p_cliente and x.entidade = 'empresa' and x.obrigatorio and x.ativo
       and nullif(btrim(coalesce(v_campos ->> x.chave, '')), '') is null
       and not coalesce(jsonb_typeof(v_campos -> x.chave) = 'array' and jsonb_array_length(v_campos -> x.chave) > 0, false)
     order by x.ordem, x.criado_em limit 1;
    if v_ch is not null then raise exception 'campo_obrigatorio' using errcode = '22023', hint = v_ch; end if;
  end if;
  if v_id is null then
    insert into public.nx_empresas (cliente_id, nome, documento, site, telefone, email, cidade, uf, obs, campos)
    values (p_cliente, v_nome, left(nullif(btrim(c ->> 'documento'), ''), 40), v_site, v_tel, v_email,
            left(nullif(btrim(c ->> 'cidade'), ''), 80), v_uf, left(nullif(btrim(c ->> 'obs'), ''), 5000), v_campos)
    returning * into r;
  else
    update public.nx_empresas x set
      nome = coalesce(v_nome, x.nome),
      documento = case when c ? 'documento' then left(nullif(btrim(c ->> 'documento'), ''), 40) else x.documento end,
      site = case when c ? 'site' then v_site else x.site end,
      telefone = case when c ? 'telefone' then v_tel else x.telefone end,
      email = case when c ? 'email' then v_email else x.email end,
      cidade = case when c ? 'cidade' then left(nullif(btrim(c ->> 'cidade'), ''), 80) else x.cidade end,
      uf = case when c ? 'uf' then v_uf else x.uf end,
      obs = case when c ? 'obs' then left(nullif(btrim(c ->> 'obs'), ''), 5000) else x.obs end,
      campos = case when c ? 'campos' then v_campos else x.campos end
    where x.id = r.id;
  end if;
  return public.nx_crm_empresa_json(p_cliente, r.id)::json;
end $$;

create or replace function public.nx_empresa_excluir(p_token text, p_cliente uuid, p_id bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); v_id bigint; v_n int;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  select id into v_id from public.nx_empresas where id = p_id and cliente_id = p_cliente for update;
  if v_id is null then raise exception 'empresa_nao_encontrada' using errcode = '22023'; end if;
  update public.nx_contatos set empresa_id = null where empresa_id = v_id and cliente_id = p_cliente;
  get diagnostics v_n = row_count;
  delete from public.nx_empresas where id = v_id;
  return json_build_object('ok', true, 'contatos_soltos', v_n);
end $$;

-- ------------------------------------------------------------
-- nx_funil_salvar: funil + lista COMPLETA de etapas (na ordem do array)
-- ------------------------------------------------------------
create or replace function public.nx_funil_salvar(p_token text, p_cliente uuid, p_funil jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  f jsonb := coalesce(p_funil, '{}'::jsonb);
  v_id uuid := public.nx_crm_uuid(f, 'id');
  r public.nx_funis;
  v_nome text; v_ordem int; v_padrao boolean; v_ads boolean; v_ativo boolean;
  v_mover jsonb := coalesce(f -> 'mover', '{}'::jsonb);
  est jsonb; e jsonb; i int; n int;
  v_eid uuid; v_tipo text; v_marco text; v_cor text; v_prob int; v_sla int; v_enome text;
  v_ab int := 0; v_ga int := 0; v_pe int := 0; v_marcos text[] := '{}'; v_nomes text[] := '{}';
  v_mant uuid[] := '{}'; v_tipos jsonb := '{}'::jsonb; v_marcos_novos jsonb := '{}'::jsonb;
  x record; v_dest uuid; v_destinos uuid[] := '{}'; v_remover uuid[] := '{}'; v_orc int; v_n int; v_resto int;
  paleta constant text[] := array['#6FA3CF','#8FB8DD','#E5B35C','#C9BFAF','#7FD1A5','#F08A74','#9D9486','#B0761F','#CF9540','#A98BD6','#5FB3A8','#D67FA3'];
  marcos_ok constant text[] := array['nova','agendada','orcamento','fechou','nao_fechou','faltou','perdida'];
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if jsonb_typeof(f) <> 'object' then raise exception 'funil_invalido' using errcode = '22023', hint = 'formato'; end if;
  if jsonb_typeof(v_mover) <> 'object' then raise exception 'funil_invalido' using errcode = '22023', hint = 'mover'; end if;
  if v_id is not null then
    select * into r from public.nx_funis where id = v_id and cliente_id = p_cliente for update;
    if r.id is null then raise exception 'funil_invalido' using errcode = '22023', hint = 'nao_encontrado'; end if;
  elsif not (f ? 'estagios') then
    raise exception 'funil_invalido' using errcode = '22023', hint = 'etapas';
  end if;

  -- propriedades do funil
  v_nome := case when f ? 'nome' then left(nullif(btrim(f ->> 'nome'), ''), 60) else r.nome end;
  if v_nome is null then raise exception 'funil_invalido' using errcode = '22023', hint = 'nome'; end if;
  if exists (select 1 from public.nx_funis y where y.cliente_id = p_cliente and lower(y.nome) = lower(v_nome)
                                             and y.id is distinct from v_id) then
    raise exception 'funil_invalido' using errcode = '22023', hint = 'nome_em_uso';
  end if;
  foreach v_enome in array array['conta_no_ads', 'padrao', 'ativo'] loop
    if f ? v_enome and jsonb_typeof(f -> v_enome) <> 'boolean' then
      raise exception 'funil_invalido' using errcode = '22023', hint = v_enome;
    end if;
  end loop;
  v_ads := case when f ? 'conta_no_ads' then (f ->> 'conta_no_ads')::boolean else coalesce(r.conta_no_ads, false) end;
  v_padrao := case when f ? 'padrao' then (f ->> 'padrao')::boolean else coalesce(r.padrao, false) end;
  v_ativo := case when f ? 'ativo' then (f ->> 'ativo')::boolean else coalesce(r.ativo, true) end;
  if f ? 'ordem' and nullif(f ->> 'ordem', '') is not null then
    begin v_ordem := least(greatest((f ->> 'ordem')::int, 0), 1000);
    exception when others then raise exception 'funil_invalido' using errcode = '22023', hint = 'ordem'; end;
  else
    v_ordem := coalesce(r.ordem, (select coalesce(max(y.ordem), 0) + 1 from public.nx_funis y where y.cliente_id = p_cliente));
  end if;
  -- só funil vazio muda de lado (Ads ↔ fora do Ads)
  if v_id is not null and v_ads is distinct from r.conta_no_ads
     and exists (select 1 from public.nx_leads l where l.cliente_id = p_cliente and l.funil_id = v_id) then
    raise exception 'funil_invalido' using errcode = '22023', hint = case when r.conta_no_ads then 'sai_do_ads' else 'entra_no_ads' end;
  end if;
  -- mudar de lado exige mandar as etapas de novo (marcos entram ou saem)
  if v_id is not null and v_ads is distinct from r.conta_no_ads and not (f ? 'estagios') then
    raise exception 'funil_invalido' using errcode = '22023', hint = 'etapas';
  end if;
  -- funil padrão: recebe as conversas do WhatsApp → precisa estar ativo e contar no Ads
  if v_padrao and not v_ativo then raise exception 'funil_invalido' using errcode = '22023', hint = 'padrao_inativo'; end if;
  if v_padrao and not v_ads then raise exception 'funil_invalido' using errcode = '22023', hint = 'padrao_sem_ads'; end if;
  if v_id is not null and r.padrao and not v_padrao then
    raise exception 'funil_invalido' using errcode = '22023', hint = 'precisa_padrao';
  end if;
  if v_ativo and (v_id is null or not r.ativo) then perform public.nx_exigir_limite(p_cliente, 'funis', 1); end if;

  -- etapas
  if f ? 'estagios' then
    est := f -> 'estagios';
    if jsonb_typeof(est) <> 'array' then raise exception 'funil_invalido' using errcode = '22023', hint = 'etapas'; end if;
    n := jsonb_array_length(est);
    if n < 1 or n > 25 then raise exception 'funil_invalido' using errcode = '22023', hint = 'etapas'; end if;
    for i in 0 .. n - 1 loop
      e := est -> i;
      if jsonb_typeof(e) <> 'object' then raise exception 'funil_invalido' using errcode = '22023', hint = 'etapas'; end if;
      v_enome := left(nullif(btrim(e ->> 'nome'), ''), 40);
      if v_enome is null then raise exception 'funil_invalido' using errcode = '22023', hint = 'etapa_nome'; end if;
      if lower(v_enome) = any(v_nomes) then raise exception 'funil_invalido' using errcode = '22023', hint = 'etapa_repetida'; end if;
      v_nomes := v_nomes || lower(v_enome);
      v_tipo := coalesce(nullif(e ->> 'tipo', ''), 'aberto');
      if v_tipo not in ('aberto', 'ganho', 'perdido') then raise exception 'funil_invalido' using errcode = '22023', hint = 'tipo'; end if;
      v_marco := nullif(e ->> 'marco', '');
      if not v_ads then v_marco := null;
      else
        if v_marco is null then raise exception 'funil_invalido' using errcode = '22023', hint = 'marco_obrigatorio'; end if;
        if not (v_marco = any(marcos_ok)) then raise exception 'funil_invalido' using errcode = '22023', hint = 'marco'; end if;
        if not ((v_marco = 'fechou' and v_tipo = 'ganho') or (v_marco in ('nao_fechou', 'perdida') and v_tipo = 'perdido')
                or (v_marco in ('nova', 'agendada', 'orcamento', 'faltou') and v_tipo = 'aberto')) then
          raise exception 'funil_invalido' using errcode = '22023', hint = 'marco_tipo';
        end if;
        v_marcos := v_marcos || v_marco;
      end if;
      v_cor := nullif(btrim(e ->> 'cor'), '');
      if v_cor is not null and v_cor !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'funil_invalido' using errcode = '22023', hint = 'cor'; end if;
      if nullif(e ->> 'probabilidade', '') is not null then
        begin v_prob := (e ->> 'probabilidade')::numeric::int;
        exception when others then raise exception 'funil_invalido' using errcode = '22023', hint = 'probabilidade'; end;
        if v_prob < 0 or v_prob > 100 then raise exception 'funil_invalido' using errcode = '22023', hint = 'probabilidade'; end if;
      end if;
      if nullif(e ->> 'sla_horas', '') is not null then
        begin v_sla := (e ->> 'sla_horas')::numeric::int;
        exception when others then raise exception 'funil_invalido' using errcode = '22023', hint = 'sla'; end;
        if v_sla < 1 or v_sla > 2160 then raise exception 'funil_invalido' using errcode = '22023', hint = 'sla'; end if;
      end if;
      v_eid := public.nx_crm_uuid(e, 'id');
      if v_eid is not null then
        if v_id is null or not exists (select 1 from public.nx_estagios s where s.id = v_eid and s.funil_id = v_id and s.cliente_id = p_cliente) then
          raise exception 'estagio_invalido' using errcode = '22023';
        end if;
        if v_eid = any(v_mant) then raise exception 'funil_invalido' using errcode = '22023', hint = 'etapa_repetida'; end if;
        v_mant := v_mant || v_eid;
        v_tipos := v_tipos || jsonb_build_object(v_eid::text, v_tipo);
        v_marcos_novos := v_marcos_novos || jsonb_build_object(v_eid::text, coalesce(v_marco, ''));
      end if;
      case v_tipo when 'aberto' then v_ab := v_ab + 1; when 'ganho' then v_ga := v_ga + 1; else v_pe := v_pe + 1; end case;
    end loop;
    if v_ab = 0 or v_ga = 0 or v_pe = 0 then raise exception 'funil_invalido' using errcode = '22023', hint = 'tipos'; end if;
    if v_ads and not ('nova' = any(v_marcos) and 'fechou' = any(v_marcos)) then
      raise exception 'funil_invalido' using errcode = '22023', hint = 'marcos';
    end if;

    if v_id is not null then
      -- etapas removidas com negócios precisam de destino (etapa mantida, do mesmo tipo)
      for x in select s.id, s.tipo, (select count(*) from public.nx_leads l where l.cliente_id = p_cliente and l.estagio_id = s.id) as qt
                 from public.nx_estagios s where s.funil_id = v_id and not (s.id = any(v_mant)) loop
        if x.qt > 0 then
          v_dest := public.nx_crm_uuid(v_mover, x.id::text);
          if v_dest is null then raise exception 'estagio_com_negocios' using errcode = '22023', hint = x.qt::text; end if;
          if not (v_dest = any(v_mant)) then raise exception 'estagio_invalido' using errcode = '22023', hint = 'destino'; end if;
          if v_tipos ->> v_dest::text <> x.tipo then raise exception 'estagio_invalido' using errcode = '22023', hint = 'destino_tipo'; end if;
          v_destinos := v_destinos || v_dest;
        end if;
      end loop;
      -- etapa com negócios (ou que vai recebê-los) não muda de tipo nem de marco
      for x in select s.id, s.tipo, coalesce(s.marco, '') as marco from public.nx_estagios s
                where s.funil_id = v_id and s.id = any(v_mant) loop
        if (x.tipo <> v_tipos ->> x.id::text or x.marco <> v_marcos_novos ->> x.id::text)
           and (x.id = any(v_destinos) or exists (select 1 from public.nx_leads l where l.cliente_id = p_cliente and l.estagio_id = x.id)) then
          raise exception 'funil_invalido' using errcode = '22023', hint = 'etapa_com_negocios';
        end if;
      end loop;
    end if;
  end if;

  -- grava o funil (um só padrão: desliga os outros antes)
  if v_padrao then
    update public.nx_funis set padrao = false where cliente_id = p_cliente and padrao and id is distinct from v_id;
  end if;
  if v_id is null then
    insert into public.nx_funis (cliente_id, nome, ordem, padrao, conta_no_ads, ativo)
    values (p_cliente, v_nome, v_ordem, v_padrao, v_ads, v_ativo) returning * into r;
    v_id := r.id;
  else
    update public.nx_funis set nome = v_nome, ordem = v_ordem, padrao = v_padrao, conta_no_ads = v_ads, ativo = v_ativo
     where id = v_id;
  end if;

  if f ? 'estagios' then
    -- etapas que saem (as que existiam e não vieram no array)
    v_remover := array(select s.id from public.nx_estagios s where s.funil_id = v_id and not (s.id = any(v_mant)));
    -- atualiza as mantidas e cria as novas, na ordem do array
    for i in 0 .. n - 1 loop
      e := est -> i;
      v_eid := public.nx_crm_uuid(e, 'id');
      v_tipo := coalesce(nullif(e ->> 'tipo', ''), 'aberto');
      v_marco := case when v_ads then nullif(e ->> 'marco', '') end;
      v_cor := upper(nullif(btrim(e ->> 'cor'), ''));
      v_prob := (nullif(e ->> 'probabilidade', ''))::numeric::int;
      v_sla := (nullif(e ->> 'sla_horas', ''))::numeric::int;
      if v_eid is not null then
        -- etapa mantida: chave ausente = valor atual (cor, probabilidade, SLA)
        update public.nx_estagios s set nome = left(btrim(e ->> 'nome'), 40), cor = coalesce(v_cor, s.cor), ordem = i + 1,
                                        tipo = v_tipo, marco = v_marco,
                                        probabilidade = coalesce(v_prob, case when s.tipo = v_tipo then s.probabilidade end,
                                                                 case v_tipo when 'ganho' then 100 when 'perdido' then 0 else 10 end),
                                        sla_horas = case when e ? 'sla_horas' then v_sla else s.sla_horas end
         where s.id = v_eid;
      else
        v_cor := coalesce(v_cor, paleta[1 + i % 12]);
        v_prob := coalesce(v_prob, case v_tipo when 'ganho' then 100 when 'perdido' then 0 else 10 end);
        insert into public.nx_estagios (cliente_id, funil_id, nome, cor, ordem, tipo, marco, probabilidade, sla_horas)
        values (p_cliente, v_id, left(btrim(e ->> 'nome'), 40), v_cor, i + 1, v_tipo, v_marco, v_prob, v_sla);
      end if;
    end loop;
    -- move os negócios das etapas que saem (o gatilho da F1 cuida de etapa/marco/status), no máximo
    -- 500 por chamada (regra 11), e apaga as etapas que ficaram vazias. Sobrou negócio → restantes > 0:
    -- o front chama de novo com as mesmas etapas (sem as que saem) e o mesmo "mover".
    if cardinality(v_remover) > 0 then
      v_orc := 500;
      foreach v_eid in array v_remover loop
        v_dest := public.nx_crm_uuid(v_mover, v_eid::text);
        if v_dest is not null and v_orc > 0 then
          update public.nx_leads set estagio_id = v_dest, atualizado_em = now()
           where id in (select l.id from public.nx_leads l where l.cliente_id = p_cliente and l.estagio_id = v_eid limit v_orc);
          get diagnostics v_n = row_count;
          v_orc := v_orc - v_n;
        end if;
      end loop;
      delete from public.nx_estagios s
       where s.id = any(v_remover) and s.funil_id = v_id
         and not exists (select 1 from public.nx_leads l where l.cliente_id = p_cliente and l.estagio_id = s.id);
      select count(*) into v_resto from public.nx_leads l where l.cliente_id = p_cliente and l.estagio_id = any(v_remover);
    end if;
  end if;
  return (public.nx_crm_funil_json(p_cliente, v_id)::jsonb || jsonb_build_object('restantes', coalesce(v_resto, 0)))::json;
end $$;

-- ------------------------------------------------------------
-- nx_funil_excluir: negócios vão para p_mover_para (funil com o MESMO conta_no_ads)
-- ------------------------------------------------------------
create or replace function public.nx_funil_excluir(p_token text, p_cliente uuid, p_id uuid, p_mover_para uuid default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  r public.nx_funis; d public.nx_estagios; df public.nx_funis;
  v_ab int; v_fe int; v_mov int := 0; v_n int; eg uuid; ep uuid;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  select * into r from public.nx_funis where id = p_id and cliente_id = p_cliente for update;
  if r.id is null then raise exception 'funil_invalido' using errcode = '22023', hint = 'nao_encontrado'; end if;
  if r.padrao then raise exception 'funil_invalido' using errcode = '22023', hint = 'padrao'; end if;
  select count(*) filter (where l.status = 'aberto'), count(*) filter (where l.status <> 'aberto')
    into v_ab, v_fe from public.nx_leads l where l.cliente_id = p_cliente and l.funil_id = p_id;
  if v_ab + v_fe > 0 then
    if p_mover_para is null then raise exception 'estagio_com_negocios' using errcode = '22023', hint = (v_ab + v_fe)::text; end if;
    select * into d from public.nx_estagios where id = p_mover_para and cliente_id = p_cliente;
    if d.id is null or d.funil_id = p_id then raise exception 'estagio_invalido' using errcode = '22023', hint = 'destino'; end if;
    if d.tipo <> 'aberto' then raise exception 'estagio_invalido' using errcode = '22023', hint = 'fechado'; end if;
    select * into df from public.nx_funis where id = d.funil_id;
    if df.conta_no_ads is distinct from r.conta_no_ads then
      raise exception 'funil_invalido' using errcode = '22023', hint = case when r.conta_no_ads then 'sai_do_ads' else 'entra_no_ads' end;
    end if;
    -- fechados do funil do Ads não mudam de funil (a receita do ROI ficaria órfã): desative em vez de excluir
    if r.conta_no_ads and v_fe > 0 then raise exception 'funil_invalido' using errcode = '22023', hint = 'tem_fechados'; end if;
    -- no máximo 500 negócios por chamada (regra 11); o front repete até excluido = true
    update public.nx_leads set estagio_id = d.id, atualizado_em = now()
     where id in (select l.id from public.nx_leads l where l.cliente_id = p_cliente and l.funil_id = p_id and l.status = 'aberto' limit 500);
    get diagnostics v_mov = row_count;
    if v_fe > 0 and v_mov < 500 then
      select s.id into eg from public.nx_estagios s where s.funil_id = df.id and s.tipo = 'ganho' order by s.ordem limit 1;
      select s.id into ep from public.nx_estagios s where s.funil_id = df.id and s.tipo = 'perdido' order by s.ordem limit 1;
      if eg is null or ep is null then raise exception 'funil_invalido' using errcode = '22023', hint = 'destino_sem_fechadas'; end if;
      update public.nx_leads set estagio_id = case when status = 'ganho' then eg else ep end, atualizado_em = now()
       where id in (select l.id from public.nx_leads l where l.cliente_id = p_cliente and l.funil_id = p_id and l.status <> 'aberto'
                     limit 500 - v_mov);
      get diagnostics v_n = row_count;
      v_mov := v_mov + v_n;
    end if;
    select count(*) into v_n from public.nx_leads l where l.cliente_id = p_cliente and l.funil_id = p_id;
    if v_n > 0 then
      return json_build_object('ok', true, 'excluido', false, 'movidos', v_mov, 'restantes', v_n);
    end if;
  end if;
  delete from public.nx_funis where id = p_id;
  return json_build_object('ok', true, 'excluido', true, 'movidos', v_mov, 'restantes', 0);
end $$;

-- ------------------------------------------------------------
-- Campos personalizados
-- ------------------------------------------------------------
create or replace function public.nx_campo_salvar(p_token text, p_cliente uuid, p_campo jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  c jsonb := coalesce(p_campo, '{}'::jsonb);
  v_id uuid := public.nx_crm_uuid(c, 'id');
  r public.nx_campos;
  v_ent text; v_chave text; v_rot text; v_tipo text; v_ops text[]; v_obr boolean; v_funil uuid; v_ordem int; v_ativo boolean;
  tipos constant text[] := array['texto','texto_longo','numero','moeda','data','opcao','multi','sim_nao','telefone','email','url'];
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if jsonb_typeof(c) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'campo'; end if;
  if v_id is not null then
    select * into r from public.nx_campos where id = v_id and cliente_id = p_cliente for update;
    if r.id is null then raise exception 'campo_nao_encontrado' using errcode = '22023'; end if;
  end if;
  -- entidade e chave não mudam depois de criadas
  v_ent := coalesce(nullif(c ->> 'entidade', ''), r.entidade);
  if v_ent is null or v_ent not in ('contato', 'negocio', 'empresa') then raise exception 'dados_invalidos' using errcode = '22023', hint = 'entidade'; end if;
  if r.id is not null and v_ent <> r.entidade then raise exception 'dados_invalidos' using errcode = '22023', hint = 'entidade'; end if;
  v_rot := case when c ? 'rotulo' or r.id is null then left(nullif(btrim(c ->> 'rotulo'), ''), 60) else r.rotulo end;
  if v_rot is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'rotulo'; end if;
  if r.id is not null then
    if nullif(c ->> 'chave', '') is not null and c ->> 'chave' <> r.chave then raise exception 'dados_invalidos' using errcode = '22023', hint = 'chave'; end if;
    v_chave := r.chave;
  else
    v_chave := nullif(btrim(c ->> 'chave'), '');
    if v_chave is null then v_chave := public.nx_crm_chave_campo(p_cliente, v_ent, v_rot);
    elsif v_chave !~ '^[a-z][a-z0-9_]{1,39}$' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'chave';
    elsif exists (select 1 from public.nx_campos x where x.cliente_id = p_cliente and x.entidade = v_ent and x.chave = v_chave) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'chave_em_uso';
    end if;
    if (select count(*) from public.nx_campos x where x.cliente_id = p_cliente and x.entidade = v_ent) >= 50 then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'max_campos';
    end if;
  end if;
  if exists (select 1 from public.nx_campos x where x.cliente_id = p_cliente and x.entidade = v_ent
                                               and lower(x.rotulo) = lower(v_rot) and x.id is distinct from r.id) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'rotulo_em_uso';
  end if;
  v_tipo := coalesce(nullif(c ->> 'tipo', ''), r.tipo, 'texto');
  if not (v_tipo = any(tipos)) then raise exception 'dados_invalidos' using errcode = '22023', hint = 'tipo'; end if;
  -- opções: só opcao/multi (1..50, cada 1..60, sem repetir)
  if v_tipo in ('opcao', 'multi') then
    if c ? 'opcoes' then
      if jsonb_typeof(c -> 'opcoes') <> 'array' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'opcoes'; end if;
      select array_agg(o order by i) into v_ops
        from (select distinct on (lower(btrim(x))) left(btrim(x), 60) o, min(ord) over (partition by lower(btrim(x))) i
                from jsonb_array_elements_text(c -> 'opcoes') with ordinality t(x, ord) where btrim(x) <> ''
               order by lower(btrim(x)), ord) s;
    else v_ops := r.opcoes;
    end if;
    if v_ops is null or cardinality(v_ops) < 1 or cardinality(v_ops) > 50 then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'opcoes';
    end if;
  else v_ops := '{}';
  end if;
  if c ? 'obrigatorio' and jsonb_typeof(c -> 'obrigatorio') <> 'boolean' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'obrigatorio'; end if;
  if c ? 'ativo' and jsonb_typeof(c -> 'ativo') <> 'boolean' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'ativo'; end if;
  v_obr := case when c ? 'obrigatorio' then (c ->> 'obrigatorio')::boolean else coalesce(r.obrigatorio, false) end;
  v_ativo := case when c ? 'ativo' then (c ->> 'ativo')::boolean else coalesce(r.ativo, true) end;
  -- funil: só para negócio (null = todos os funis)
  if v_ent = 'negocio' then
    v_funil := case when c ? 'funil_id' then public.nx_crm_uuid(c, 'funil_id') else r.funil_id end;
    if v_funil is not null and not exists (select 1 from public.nx_funis y where y.id = v_funil and y.cliente_id = p_cliente) then
      raise exception 'funil_invalido' using errcode = '22023', hint = 'nao_encontrado';
    end if;
  end if;
  if c ? 'ordem' and nullif(c ->> 'ordem', '') is not null then
    begin v_ordem := least(greatest((c ->> 'ordem')::numeric::int, 0), 10000);
    exception when others then raise exception 'dados_invalidos' using errcode = '22023', hint = 'ordem'; end;
  else
    v_ordem := coalesce(r.ordem, (select coalesce(max(x.ordem), 0) + 1 from public.nx_campos x where x.cliente_id = p_cliente and x.entidade = v_ent));
  end if;
  if r.id is null then
    insert into public.nx_campos (cliente_id, entidade, chave, rotulo, tipo, opcoes, obrigatorio, funil_id, ordem, ativo)
    values (p_cliente, v_ent, v_chave, v_rot, v_tipo, v_ops, v_obr, v_funil, v_ordem, v_ativo) returning * into r;
  else
    update public.nx_campos set rotulo = v_rot, tipo = v_tipo, opcoes = v_ops, obrigatorio = v_obr, funil_id = v_funil,
                                ordem = v_ordem, ativo = v_ativo
     where id = r.id returning * into r;
  end if;
  return json_build_object('id', r.id, 'entidade', r.entidade, 'chave', r.chave, 'rotulo', r.rotulo, 'tipo', r.tipo,
                           'opcoes', r.opcoes, 'obrigatorio', r.obrigatorio, 'funil_id', r.funil_id, 'ordem', r.ordem, 'ativo', r.ativo);
end $$;

create or replace function public.nx_campo_excluir(p_token text, p_cliente uuid, p_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); v_id uuid;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  -- os valores ficam no JSON `campos` (ocultos: a chave some do catálogo)
  delete from public.nx_campos where id = p_id and cliente_id = p_cliente returning id into v_id;
  if v_id is null then raise exception 'campo_nao_encontrado' using errcode = '22023'; end if;
  return json_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- nx_etiqueta_excluir: 1ª chamada tira do catálogo; cada chamada limpa até 2.000 linhas → {restantes}
-- ------------------------------------------------------------
create or replace function public.nx_etiqueta_excluir(p_token text, p_cliente uuid, p_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  v_del uuid; v_orcamento int := 2000; v_n int; v_resto int;
  alvo uuid[] := array[p_id];
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if p_id is null then raise exception 'etiqueta_nao_encontrada' using errcode = '22023'; end if;
  delete from public.nx_etiquetas where id = p_id and cliente_id = p_cliente returning id into v_del;
  if v_del is null
     and not exists (select 1 from public.nx_contatos k where k.cliente_id = p_cliente and k.etiquetas @> alvo)
     and not exists (select 1 from public.nx_leads l where l.cliente_id = p_cliente and l.etiquetas @> alvo)
     and not exists (select 1 from public.nx_conversas c where c.cliente_id = p_cliente and c.etiquetas @> alvo) then
    raise exception 'etiqueta_nao_encontrada' using errcode = '22023';
  end if;
  perform set_config('nx.lote', '1', true);
  update public.nx_contatos k set etiquetas = array_remove(k.etiquetas, p_id)
   where k.id in (select x.id from public.nx_contatos x where x.cliente_id = p_cliente and x.etiquetas @> alvo limit v_orcamento);
  get diagnostics v_n = row_count;
  v_orcamento := v_orcamento - v_n;
  if v_orcamento > 0 then
    update public.nx_leads l set etiquetas = array_remove(l.etiquetas, p_id)
     where l.id in (select x.id from public.nx_leads x where x.cliente_id = p_cliente and x.etiquetas @> alvo limit v_orcamento);
    get diagnostics v_n = row_count;
    v_orcamento := v_orcamento - v_n;
  end if;
  if v_orcamento > 0 then
    update public.nx_conversas c set etiquetas = array_remove(c.etiquetas, p_id)
     where c.id in (select x.id from public.nx_conversas x where x.cliente_id = p_cliente and x.etiquetas @> alvo limit v_orcamento);
  end if;
  select (select count(*) from (select 1 from public.nx_contatos k where k.cliente_id = p_cliente and k.etiquetas @> alvo limit 100000) a)
       + (select count(*) from (select 1 from public.nx_leads l where l.cliente_id = p_cliente and l.etiquetas @> alvo limit 100000) b)
       + (select count(*) from (select 1 from public.nx_conversas c where c.cliente_id = p_cliente and c.etiquetas @> alvo limit 100000) c)
    into v_resto;
  perform set_config('nx.lote', '', true);
  perform public.nx_pulso_lote_fim();
  return json_build_object('ok', true, 'restantes', v_resto);
end $$;

-- ------------------------------------------------------------
-- Motivos de perda
-- ------------------------------------------------------------
create or replace function public.nx_motivo_salvar(p_token text, p_cliente uuid, p_motivo jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  c jsonb := coalesce(p_motivo, '{}'::jsonb);
  v_id uuid := public.nx_crm_uuid(c, 'id');
  r public.nx_motivos_perda; v_nome text; v_ordem int;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if jsonb_typeof(c) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'motivo'; end if;
  if v_id is not null then
    select * into r from public.nx_motivos_perda where id = v_id and cliente_id = p_cliente for update;
    if r.id is null then raise exception 'motivo_nao_encontrado' using errcode = '22023'; end if;
  end if;
  v_nome := case when c ? 'nome' or r.id is null then left(nullif(btrim(c ->> 'nome'), ''), 60) else r.nome end;
  if v_nome is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'nome'; end if;
  if exists (select 1 from public.nx_motivos_perda m where m.cliente_id = p_cliente and m.ativo
                                                     and lower(m.nome) = lower(v_nome) and m.id is distinct from r.id) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'nome_em_uso';
  end if;
  if c ? 'exige_texto' and jsonb_typeof(c -> 'exige_texto') <> 'boolean' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'exige_texto'; end if;
  if c ? 'ativo' and jsonb_typeof(c -> 'ativo') <> 'boolean' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'ativo'; end if;
  if c ? 'ordem' and nullif(c ->> 'ordem', '') is not null then
    begin v_ordem := least(greatest((c ->> 'ordem')::numeric::int, 0), 10000);
    exception when others then raise exception 'dados_invalidos' using errcode = '22023', hint = 'ordem'; end;
  else
    v_ordem := coalesce(r.ordem, (select coalesce(max(m.ordem), 0) + 1 from public.nx_motivos_perda m where m.cliente_id = p_cliente));
  end if;
  if r.id is null then
    insert into public.nx_motivos_perda (cliente_id, nome, exige_texto, ordem, ativo)
    values (p_cliente, v_nome, coalesce((c ->> 'exige_texto')::boolean, false), v_ordem, coalesce((c ->> 'ativo')::boolean, true))
    returning * into r;
  else
    update public.nx_motivos_perda set nome = v_nome,
      exige_texto = case when c ? 'exige_texto' then (c ->> 'exige_texto')::boolean else exige_texto end,
      ordem = v_ordem,
      ativo = case when c ? 'ativo' then (c ->> 'ativo')::boolean else ativo end
     where id = r.id returning * into r;
  end if;
  return json_build_object('id', r.id, 'nome', r.nome, 'exige_texto', r.exige_texto, 'ordem', r.ordem, 'ativo', r.ativo);
end $$;

create or replace function public.nx_motivo_excluir(p_token text, p_cliente uuid, p_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); r public.nx_motivos_perda; v_usado boolean;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  select * into r from public.nx_motivos_perda where id = p_id and cliente_id = p_cliente for update;
  if r.id is null then raise exception 'motivo_nao_encontrado' using errcode = '22023'; end if;
  v_usado := exists (select 1 from public.nx_leads l where l.cliente_id = p_cliente and l.motivo_perda_id = r.id);
  if v_usado then
    update public.nx_motivos_perda set ativo = false where id = r.id;   -- relatórios antigos continuam com o nome
  else
    delete from public.nx_motivos_perda where id = r.id;
  end if;
  return json_build_object('ok', true, 'desativado', v_usado);
end $$;

-- ------------------------------------------------------------
-- nx_contatos_exportar (P1): páginas de até 2.000 contatos com o mesmo filtro da lista;
-- o front junta as páginas e gera o CSV (; com BOM). Só admin.
-- ------------------------------------------------------------
create or replace function public.nx_contatos_exportar(p_token text, p_cliente uuid, p_filtro jsonb default '{}'::jsonb, p_pagina int default 1)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  pg int := least(greatest(coalesce(p_pagina, 1), 1), 100000);
  w text; ids bigint[]; itens json;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  w := public.nx_crm_filtro_contatos(p_cliente, v, p_filtro);
  execute format('select array(select k.id from public.nx_contatos k where %s order by k.id limit 2001 offset %s)', w, (pg - 1) * 2000)
    into ids;
  select coalesce(json_agg(
           (to_jsonb(k) - 'busca' - 'tel_chave' - 'cliente_id')
           || jsonb_build_object(
                'empresa_nome', (select e.nome from public.nx_empresas e where e.id = k.empresa_id and e.cliente_id = p_cliente),
                'etiquetas_nomes', coalesce((select jsonb_agg(t.nome order by lower(t.nome)) from public.nx_etiquetas t
                                              where t.cliente_id = p_cliente and t.id = any(k.etiquetas)), '[]'::jsonb),
                'dono_nome', (select a.nome from public.nx_contas a where a.id = k.dono_id))
           order by x.o), '[]'::json)
    into itens
    from unnest(ids[1:2000]) with ordinality x(id, o)
    join public.nx_contatos k on k.id = x.id and k.cliente_id = p_cliente;
  return json_build_object('itens', itens, 'pagina', pg, 'tem_mais', coalesce(cardinality(ids), 0) > 2000);
end $$;

-- ------------------------------------------------------------
-- Permissões: internas só service_role; painel anon/authenticated/service_role
-- ------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.nx_crm_norm(text)', 'public.nx_crm_like(text)',
    'public.nx_crm_chave_campo(uuid,text,text)', 'public.nx_crm_campo_valor(text,text[],text)',
    'public.nx_crm_funil_json(uuid,uuid)', 'public.nx_crm_empresa_json(uuid,bigint)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'public.nx_tarefas_listar(text,uuid,jsonb)',
    'public.nx_buscar(text,uuid,text)',
    'public.nx_contatos_importar(text,uuid,jsonb,jsonb)',
    'public.nx_empresas_listar(text,uuid,jsonb,integer,integer)',
    'public.nx_empresa_ver(text,uuid,bigint)',
    'public.nx_empresa_salvar(text,uuid,jsonb)',
    'public.nx_empresa_excluir(text,uuid,bigint)',
    'public.nx_funil_salvar(text,uuid,jsonb)',
    'public.nx_funil_excluir(text,uuid,uuid,uuid)',
    'public.nx_campo_salvar(text,uuid,jsonb)',
    'public.nx_campo_excluir(text,uuid,uuid)',
    'public.nx_etiqueta_excluir(text,uuid,uuid)',
    'public.nx_motivo_salvar(text,uuid,jsonb)',
    'public.nx_motivo_excluir(text,uuid,uuid)',
    'public.nx_contatos_exportar(text,uuid,jsonb,integer)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
end $$;
