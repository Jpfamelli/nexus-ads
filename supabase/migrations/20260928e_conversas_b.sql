-- ============================================================
-- ÓRBITA — 20260928e_conversas_b.sql · frente F5 (Conversas) · P0-B
-- Complemento do arquivo e (§5.4 da ESPEC):
--   nx_cv_buscar_msgs        busca nas mensagens (só conversas visíveis)
--   nx_departamento_salvar   departamentos e horários (um só padrão)
--   nx_departamento_excluir  conversas/números/acessos do excluído vão para o padrão
--   nx_ia_config_salvar      cfg.ia (assistente de IA; soma ≤ 15.000 caracteres)
--   nx_cv_config_salvar      cfg.cv (recibo de leitura, assinatura)
--   nx_cv_ocultar            (P1) spam: resolve + oculta + contato bloqueado / desfazer
--   nx_cv_base               (definida só aqui) + chave "config" (só admin+):
--                            departamentos completos (inclusive inativos) e cfg.ia
--                            — para as telas de configuração. Chave nova; nenhuma
--                            chave antiga do contrato muda.
-- Regras (ESPEC §0): aditivo e idempotente (create or replace); plpgsql +
-- security definer + search_path ''; painel → anon/authenticated/service_role;
-- interna → só service_role. Autorização por public.nx_ctx; visibilidade de
-- conversa pela forma WHERE de public.nx_cv_visivel ("-- regra nx_cv_visivel").
-- Erros: acesso 42501, dados 22023 (message = código do Apêndice B).
-- Depende dos arquivos a (F1) e e (F5).
-- ============================================================

-- ------------------------------------------------------------
-- Montadora interna: departamento completo (config)
-- ------------------------------------------------------------
create or replace function public.nx_cv_json_dep(d public.nx_departamentos)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if d.id is null then return null; end if;
  return jsonb_build_object(
    'id', d.id, 'nome', d.nome, 'cor', d.cor, 'padrao', d.padrao, 'distribuicao', d.distribuicao,
    'manter_atendente', d.manter_atendente, 'horario', d.horario, 'msg_fora_horario', d.msg_fora_horario,
    'ordem', d.ordem, 'ativo', d.ativo,
    'conversas_abertas', (select count(*) from public.nx_conversas cv
                           where cv.cliente_id = d.cliente_id and cv.departamento_id = d.id
                             and cv.status in ('aberta', 'pendente')),
    'canais', (select count(*) from public.nx_canais k where k.cliente_id = d.cliente_id and k.departamento_id = d.id),
    'pessoas', (select count(*) from public.nx_acessos a where a.cliente_id = d.cliente_id and d.id = any(a.departamentos)));
end $$;

-- ------------------------------------------------------------
-- Validação interna do horário (§3.8): null = 24 h; senão objeto com chaves
-- "0".."6" (0 = domingo), cada uma com até 2 faixas ["HH:MM","HH:MM"], início <
-- fim, sem sobrepor. Devolve o horário normalizado (todas as 7 chaves).
-- ------------------------------------------------------------
create or replace function public.nx_cv_horario_normalizar(p jsonb)
returns jsonb
language plpgsql immutable
security definer
set search_path = ''
as $$
declare
  r jsonb := '{}'::jsonb;
  k text; dia jsonb; f jsonb; faixas jsonb; ini text; fim text; ant text;
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
      for f in select x from jsonb_array_elements(dia) x loop
        if jsonb_typeof(f) <> 'array' or jsonb_array_length(f) <> 2 then
          raise exception 'dados_invalidos' using errcode = '22023', hint = 'horario';
        end if;
        ini := f ->> 0; fim := f ->> 1;
        if coalesce(ini, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           or coalesce(fim, '') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
           or ini >= fim or (ant is not null and ini < ant) then
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
-- nx_cv_base — ÚNICA definição (o arquivo e não a repete): dados de apoio da
-- tela + "config" para admin+ (telas de configuração)
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
              'tom', case when v_iacfg ->> 'tom' = 'formal' then 'formal' else 'proximo' end));
  end if;
  return json_build_object(
    'eu', json_build_object('id', v.conta_id, 'nome', v.nome, 'papel', v.papel,
                            'departamentos', to_json(v.departamentos), 'ver_todas', v.ver_todas),
    'canais', coalesce((select json_agg(json_build_object(
                 'id', k.id, 'nome', k.nome, 'numero_exibicao', k.numero_exibicao, 'status', k.status,
                 'coexistencia', k.coexistencia, 'tem_token', k.token_segredo is not null,
                 'departamento_id', k.departamento_id, 'app_inscrito', k.app_inscrito,
                 'ultimo_erro', k.ultimo_erro) order by k.criado_em)
               from public.nx_canais k where k.cliente_id = p_cliente), '[]'::json),
    'departamentos', coalesce((select json_agg(json_build_object(
                 'id', d.id, 'nome', d.nome, 'cor', d.cor, 'padrao', d.padrao,
                 'distribuicao', d.distribuicao, 'ativo', d.ativo) order by d.ordem, d.nome)
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
-- nx_cv_buscar_msgs — busca nas mensagens (texto e notas) das conversas visíveis
-- ------------------------------------------------------------
create or replace function public.nx_cv_buscar_msgs(p_token text, p_cliente uuid, p_q text, p_limite int default 30)
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
             'criado_em', x.criado_em) order by x.id desc)
      from (
        select m.id, m.conversa_id, m.contato_id, m.direcao, m.tipo, m.corpo, m.criado_em,
               cv.protocolo, cv.status as status_cv,
               coalesce(nullif(btrim(k.nome), ''), k.telefone) as contato_nome,
               greatest(1, strpos(lower(m.corpo), v_ql) - 50) as ini
          from public.nx_mensagens m
          join public.nx_conversas cv on cv.id = m.conversa_id
          join public.nx_contatos k on k.id = m.contato_id
         where m.cliente_id = p_cliente
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
-- Departamentos e horários
-- ------------------------------------------------------------
create or replace function public.nx_departamento_salvar(p_token text, p_cliente uuid, p_departamento jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  r jsonb := coalesce(p_departamento, '{}'::jsonb);
  x public.nx_departamentos;
  v_id uuid;
  v_nome text; v_cor text; v_padrao boolean; v_dist text; v_manter boolean; v_hor jsonb; v_msg text;
  v_ordem int; v_ativo boolean;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if jsonb_typeof(r) <> 'object' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
  end if;
  begin
    v_id := nullif(r ->> 'id', '')::uuid;
    v_ordem := nullif(r ->> 'ordem', '')::int;
    v_padrao := nullif(r ->> 'padrao', '')::boolean;
    v_manter := nullif(r ->> 'manter_atendente', '')::boolean;
    v_ativo := nullif(r ->> 'ativo', '')::boolean;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
  end;
  if v_id is not null then
    select * into x from public.nx_departamentos where id = v_id and cliente_id = p_cliente for update;
    if x.id is null then
      raise exception 'departamento_nao_encontrado' using errcode = '22023';
    end if;
  elsif (select count(*) from public.nx_departamentos where cliente_id = p_cliente) >= 30 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'maximo';
  end if;

  v_nome := btrim(coalesce(r ->> 'nome', x.nome, ''));
  if char_length(v_nome) < 1 or char_length(v_nome) > 40 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'nome';
  end if;
  if exists (select 1 from public.nx_departamentos o
              where o.cliente_id = p_cliente and lower(o.nome) = lower(v_nome) and o.id is distinct from v_id) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'nome_repetido';
  end if;
  v_cor := coalesce(nullif(btrim(r ->> 'cor'), ''), x.cor, '#6FA3CF');
  if v_cor !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'cor';
  end if;
  v_cor := upper(v_cor);
  v_dist := coalesce(nullif(btrim(r ->> 'distribuicao'), ''), x.distribuicao, 'manual');
  if v_dist not in ('manual', 'rodizio') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'distribuicao';
  end if;
  v_padrao := coalesce(v_padrao, x.padrao, false);
  v_manter := coalesce(v_manter, x.manter_atendente, true);
  v_ativo := coalesce(v_ativo, x.ativo, true);
  v_ordem := coalesce(v_ordem, x.ordem,
                      (select coalesce(max(o.ordem), -1) + 1 from public.nx_departamentos o where o.cliente_id = p_cliente));
  if r ? 'horario' then v_hor := public.nx_cv_horario_normalizar(r -> 'horario'); else v_hor := x.horario; end if;
  if r ? 'msg_fora_horario' then v_msg := nullif(btrim(coalesce(r ->> 'msg_fora_horario', '')), '');
  else v_msg := x.msg_fora_horario; end if;
  if char_length(v_msg) > 1000 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'msg_fora_horario';
  end if;

  -- um só padrão: o padrão atual não deixa de ser padrão sem outro no lugar, nem fica inativo
  if x.id is not null and x.padrao and not v_padrao then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'padrao';
  end if;
  if v_padrao and not v_ativo then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'padrao_inativo';
  end if;
  if v_padrao then
    update public.nx_departamentos set padrao = false
     where cliente_id = p_cliente and padrao and id is distinct from v_id;
  end if;

  if v_id is null then
    insert into public.nx_departamentos (cliente_id, nome, cor, padrao, distribuicao, manter_atendente, horario,
                                         msg_fora_horario, ordem, ativo)
    values (p_cliente, v_nome, v_cor, v_padrao, v_dist, v_manter, v_hor, v_msg, v_ordem, v_ativo)
    returning * into x;
  else
    update public.nx_departamentos
       set nome = v_nome, cor = v_cor, padrao = v_padrao, distribuicao = v_dist, manter_atendente = v_manter,
           horario = v_hor, msg_fora_horario = v_msg, ordem = v_ordem, ativo = v_ativo
     where id = v_id
    returning * into x;
  end if;
  perform public.nx_pulso_bater(p_cliente);
  return public.nx_cv_json_dep(x)::json;
end $$;

create or replace function public.nx_departamento_excluir(p_token text, p_cliente uuid, p_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  x public.nx_departamentos;
  v_pad uuid;
  v_conv int; v_can int; v_pes int;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  select * into x from public.nx_departamentos where id = p_id and cliente_id = p_cliente for update;
  if x.id is null then
    raise exception 'departamento_nao_encontrado' using errcode = '22023';
  end if;
  if x.padrao then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'padrao';
  end if;
  select d.id into v_pad from public.nx_departamentos d where d.cliente_id = p_cliente and d.padrao;
  if v_pad is null then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'sem_padrao';
  end if;
  -- conversas e números do excluído vão para o padrão
  update public.nx_conversas set departamento_id = v_pad
   where cliente_id = p_cliente and departamento_id = x.id;
  get diagnostics v_conv = row_count;
  update public.nx_canais set departamento_id = v_pad
   where cliente_id = p_cliente and departamento_id = x.id;
  get diagnostics v_can = row_count;
  -- quem atendia o excluído passa a atender o padrão (lista vazia = todos: nunca esvaziar)
  update public.nx_acessos a
     set departamentos = (select coalesce(array_agg(distinct e), '{}')
                            from unnest(array_replace(a.departamentos, x.id, v_pad)) e)
   where a.cliente_id = p_cliente and x.id = any(a.departamentos);
  get diagnostics v_pes = row_count;
  delete from public.nx_departamentos where id = x.id;
  perform public.nx_pulso_bater(p_cliente);
  return json_build_object('ok', true, 'movidas', v_conv, 'canais', v_can, 'pessoas', v_pes, 'para', v_pad);
end $$;

-- ------------------------------------------------------------
-- Assistente de IA (cfg.ia) e preferências da central (cfg.cv)
-- ------------------------------------------------------------
create or replace function public.nx_ia_config_salvar(p_token text, p_cliente uuid, p_ia jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  r jsonb := coalesce(p_ia, '{}'::jsonb);
  atual jsonb;
  novo jsonb;
  k text;
  v_soma int;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if jsonb_typeof(r) <> 'object' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'ia';
  end if;
  select case when jsonb_typeof(c.cfg -> 'ia') = 'object' then c.cfg -> 'ia' else '{}'::jsonb end
    into atual from public.nx_clientes c where c.id = p_cliente for update;
  novo := atual;
  foreach k in array array['sobre', 'servicos', 'horarios', 'regras', 'proibido'] loop
    if r ? k then
      if jsonb_typeof(r -> k) not in ('string', 'null') then
        raise exception 'dados_invalidos' using errcode = '22023', hint = k;
      end if;
      novo := novo || jsonb_build_object(k, btrim(coalesce(r ->> k, '')));
    end if;
  end loop;
  if r ? 'tom' then
    if coalesce(r ->> 'tom', '') not in ('formal', 'proximo') then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'tom';
    end if;
    novo := novo || jsonb_build_object('tom', r ->> 'tom');
  end if;
  v_soma := coalesce(char_length(novo ->> 'sobre'), 0) + coalesce(char_length(novo ->> 'servicos'), 0)
          + coalesce(char_length(novo ->> 'horarios'), 0) + coalesce(char_length(novo ->> 'regras'), 0)
          + coalesce(char_length(novo ->> 'proibido'), 0);
  if v_soma > 15000 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'tamanho';
  end if;
  update public.nx_clientes set cfg = jsonb_set(coalesce(cfg, '{}'::jsonb), '{ia}', novo, true)
   where id = p_cliente;
  return json_build_object(
    'sobre', coalesce(novo ->> 'sobre', ''), 'servicos', coalesce(novo ->> 'servicos', ''),
    'horarios', coalesce(novo ->> 'horarios', ''), 'regras', coalesce(novo ->> 'regras', ''),
    'proibido', coalesce(novo ->> 'proibido', ''),
    'tom', case when novo ->> 'tom' = 'formal' then 'formal' else 'proximo' end,
    'caracteres', v_soma);
end $$;

create or replace function public.nx_cv_config_salvar(p_token text, p_cliente uuid, p_cfg jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  r jsonb := coalesce(p_cfg, '{}'::jsonb);
  atual jsonb;
  novo jsonb;
  k text;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if jsonb_typeof(r) <> 'object' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'cfg';
  end if;
  select case when jsonb_typeof(c.cfg -> 'cv') = 'object' then c.cfg -> 'cv' else '{}'::jsonb end
    into atual from public.nx_clientes c where c.id = p_cliente for update;
  novo := atual;
  foreach k in array array['recibo_leitura', 'assinatura'] loop
    if r ? k then
      if jsonb_typeof(r -> k) <> 'boolean' then
        raise exception 'dados_invalidos' using errcode = '22023', hint = k;
      end if;
      novo := novo || jsonb_build_object(k, r -> k);
    end if;
  end loop;
  update public.nx_clientes set cfg = jsonb_set(coalesce(cfg, '{}'::jsonb), '{cv}', novo, true)
   where id = p_cliente;
  return json_build_object(
    'recibo_leitura', coalesce((novo ->> 'recibo_leitura')::boolean, true),
    'assinatura', coalesce((novo ->> 'assinatura')::boolean, false));
end $$;

-- ------------------------------------------------------------
-- P1 · nx_cv_ocultar — spam: resolve + oculta + contato bloqueado; desfazer tira o bloqueio
-- (o webhook da F2 grava as mensagens de contato bloqueado numa conversa oculta, sem avisar)
-- ------------------------------------------------------------
create or replace function public.nx_cv_ocultar(p_token text, p_cliente uuid, p_conversa bigint, p_ocultar boolean)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'supervisor');
  cv public.nx_conversas;
  v_eu text := coalesce(nullif(v.nome, ''), 'Alguém');
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if p_ocultar is null then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'ocultar';
  end if;
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  select * into cv from public.nx_conversas where id = p_conversa for update;
  if p_ocultar and not cv.oculta then
    update public.nx_conversas
       set oculta = true, status = 'resolvida', resolvida_em = coalesce(resolvida_em, now()),
           resolvida_por = coalesce(resolvida_por, v.conta_id), aguardando = false, nao_lidas = 0, atualizado_em = now()
     where id = cv.id;
    update public.nx_contatos set bloqueado = true where id = cv.contato_id and cliente_id = p_cliente;
    perform public.nx_cv_sistema(cv.id, 'Conversa ocultada por ' || v_eu || ' — contato bloqueado', v.conta_id);
  elsif not p_ocultar and cv.oculta then
    update public.nx_conversas set oculta = false, atualizado_em = now() where id = cv.id;
    update public.nx_contatos set bloqueado = false where id = cv.contato_id and cliente_id = p_cliente;
    perform public.nx_cv_sistema(cv.id, v_eu || ' desfez o bloqueio do contato', v.conta_id);
  end if;
  select * into cv from public.nx_conversas where id = p_conversa;
  return public.nx_cv_json_item(cv)::json;
end $$;

-- ------------------------------------------------------------
-- Permissões das funções deste arquivo
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'nx_cv_json_dep','nx_cv_horario_normalizar',
         'nx_cv_base','nx_cv_buscar_msgs','nx_departamento_salvar','nx_departamento_excluir',
         'nx_ia_config_salvar','nx_cv_config_salvar','nx_cv_ocultar')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    if r.proname in ('nx_cv_json_dep','nx_cv_horario_normalizar') then
      execute format('grant execute on function %s to service_role', r.fn);
    else
      execute format('grant execute on function %s to anon, authenticated, service_role', r.fn);
    end if;
  end loop;
end $$;
