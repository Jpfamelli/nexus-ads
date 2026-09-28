-- ============================================================
-- ÓRBITA — 20260928e_conversas.sql · frente F5 (Conversas) · P0-A
-- §5.4 da ESPEC: RPCs da central de conversas (lista, chat, notas,
-- atribuição, status, etiquetas, nova conversa, vínculo com negócio),
-- números de WhatsApp (nx_canais) e respostas rápidas; interna
-- nx_cv_distribuir (rodízio / manter atendente) usada pela F2 e F7.
--
-- Regras (ESPEC §0): tudo aditivo e idempotente (create or replace);
-- plpgsql + security definer + search_path ''; RPC de painel →
-- anon/authenticated/service_role; interna → só service_role.
-- Autorização SEMPRE por public.nx_ctx (F1) e visibilidade de conversa
-- SEMPRE por public.nx_cv_visivel (F1) — ou a forma WHERE copiada de lá,
-- marcada com "-- regra nx_cv_visivel".
-- Erros: acesso 42501, dados 22023 (message = código do Apêndice B).
-- Depende do arquivo a (20260928a_saas_base.sql, F1).
-- ============================================================

-- ------------------------------------------------------------
-- Internas de montagem (JSON) — só service_role
-- ------------------------------------------------------------

-- Mensagem (§5.1): {id, conversa_id, direcao, tipo, corpo, midia, status, erro,
-- enviado_por:{id,nome}|null, origem, responde_a:{id,direcao,resumo}|null, reacao,
-- template, referral, criado_em, atualizado_em}  (+ wamid: o composer manda em "responde_a")
create or replace function public.nx_cv_json_msg(m public.nx_mensagens)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_por jsonb; v_resp jsonb;
begin
  if m.id is null then return null; end if;
  if m.enviado_por is not null then
    select jsonb_build_object('id', k.id, 'nome', k.nome) into v_por
      from public.nx_contas k where k.id = m.enviado_por;
  end if;
  if m.responde_a_wamid is not null then
    select jsonb_build_object(
             'id', r.id, 'direcao', r.direcao,
             'resumo', coalesce(nullif(left(r.corpo, 120), ''),
                                case r.tipo when 'imagem' then 'Foto' when 'audio' then 'Áudio'
                                            when 'video' then 'Vídeo' when 'documento' then 'Documento'
                                            when 'sticker' then 'Figurinha' when 'localizacao' then 'Localização'
                                            when 'contato' then 'Contato' when 'template' then 'Modelo'
                                            else 'Mensagem' end))
      into v_resp
      from public.nx_mensagens r
     where r.wamid = m.responde_a_wamid and r.cliente_id = m.cliente_id;
  end if;
  return jsonb_build_object(
    'id', m.id, 'conversa_id', m.conversa_id, 'direcao', m.direcao, 'tipo', m.tipo, 'wamid', m.wamid,
    'corpo', m.corpo, 'midia', m.midia, 'status', m.status, 'erro', m.erro,
    'enviado_por', v_por, 'origem', m.origem, 'responde_a', v_resp, 'reacao', m.reacao,
    'template', m.template, 'referral', m.referral,
    'criado_em', m.criado_em, 'atualizado_em', m.atualizado_em);
end $$;

-- ConversaItem (§5.1): {id, contato:{id,nome,telefone}, canal_id, departamento_id, atribuida_a,
-- status, aguardando, nao_lidas, ultima_msg_em, ultima_msg_resumo, ultima_msg_dir,
-- ultima_entrada_em, janela_ate, etiquetas, protocolo, oculta,
-- negocio:{id, estagio_nome, estagio_cor}|null}  (+ atribuida_nome, contato.optin_marketing)
create or replace function public.nx_cv_json_item(cv public.nx_conversas)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_ct jsonb; v_neg jsonb; v_dono text;
begin
  if cv.id is null then return null; end if;
  select jsonb_build_object('id', k.id, 'nome', k.nome, 'telefone', k.telefone,
                            'optin_marketing', k.optin_marketing, 'bloqueado', k.bloqueado)
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
  return jsonb_build_object(
    'id', cv.id, 'contato', v_ct, 'canal_id', cv.canal_id, 'departamento_id', cv.departamento_id,
    'atribuida_a', cv.atribuida_a, 'atribuida_nome', v_dono, 'status', cv.status,
    'aguardando', cv.aguardando, 'nao_lidas', cv.nao_lidas, 'ultima_msg_em', cv.ultima_msg_em,
    'ultima_msg_resumo', cv.ultima_msg_resumo, 'ultima_msg_dir', cv.ultima_msg_dir,
    'ultima_entrada_em', cv.ultima_entrada_em,
    'janela_ate', cv.ultima_entrada_em + interval '24 hours',
    'etiquetas', to_jsonb(cv.etiquetas), 'protocolo', cv.protocolo, 'oculta', cv.oculta,
    'negocio', v_neg);
end $$;

-- Card (§5.1) de um negócio — usado na lateral da conversa (+ estagio_nome/cor/tipo, funil_nome)
create or replace function public.nx_cv_json_card(l public.nx_leads)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_ct jsonb; v_tar jsonb; v_est record; v_funil text; v_nl int;
begin
  if l.id is null then return null; end if;
  select jsonb_build_object('id', k.id, 'nome', k.nome, 'telefone', k.telefone)
    into v_ct from public.nx_contatos k where k.id = l.contato_id;
  select s.nome, s.cor, s.tipo into v_est from public.nx_estagios s where s.id = l.estagio_id;
  select f.nome into v_funil from public.nx_funis f where f.id = l.funil_id;
  select jsonb_build_object('vence_em', t.vence_em,
                            'atrasada', t.vence_em is not null and t.vence_em < now())
    into v_tar
    from public.nx_tarefas t
   where t.negocio_id = l.id and t.concluida_em is null
   order by t.vence_em nulls last limit 1;
  select coalesce(sum(x.nao_lidas), 0) into v_nl
    from public.nx_conversas x where x.negocio_id = l.id and x.status <> 'resolvida';
  return jsonb_build_object(
    'id', l.id, 'titulo', l.titulo, 'contato', v_ct, 'valor_previsto', l.valor_previsto,
    'valor', l.valor, 'status', l.status, 'funil_id', l.funil_id, 'funil_nome', v_funil,
    'estagio_id', l.estagio_id, 'estagio_nome', v_est.nome, 'estagio_cor', v_est.cor,
    'estagio_tipo', v_est.tipo, 'dono_id', l.dono_id, 'etiquetas', to_jsonb(l.etiquetas),
    'servico', l.servico, 'origem', l.origem,
    'anuncio', (l.plataforma is not null or l.origem = 'anuncio'),
    'estagio_em', l.estagio_em, 'criado_em', l.criado_em, 'ordem', l.ordem,
    'tarefa', v_tar, 'nao_lidas', v_nl);
end $$;

-- mensagem de sistema na conversa (não mexe em ultima_msg_*, aguardando, nao_lidas)
create or replace function public.nx_cv_sistema(p_conversa bigint, p_texto text, p_conta uuid default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo,
                                   status, enviado_por, origem)
  select cv.cliente_id, cv.id, cv.contato_id, cv.canal_id, 'out', 'sistema', left(p_texto, 4096),
         'enviada', p_conta, null
    from public.nx_conversas cv where cv.id = p_conversa
  returning id into v_id;
  return v_id;
end $$;

-- canal para o painel (nunca devolve segredo) + dados do webhook
create or replace function public.nx_canal_json(k public.nx_canais)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_base text; v_proprio boolean;
begin
  if k.id is null then return null; end if;
  select rtrim(coalesce(nullif(btrim(x.funcoes_url), ''), 'https://dtjznipitihnwmcgpzqh.supabase.co/functions/v1'), '/')
    into v_base from public.nx_config x where x.id = 1;
  v_base := coalesce(v_base, 'https://dtjznipitihnwmcgpzqh.supabase.co/functions/v1');
  v_proprio := k.app_secret_segredo is not null;
  return jsonb_build_object(
    'id', k.id, 'nome', k.nome, 'phone_number_id', k.phone_number_id, 'waba_id', k.waba_id,
    'numero_exibicao', k.numero_exibicao, 'status', k.status, 'app_inscrito', k.app_inscrito,
    'coexistencia', k.coexistencia, 'tem_token', k.token_segredo is not null,
    'tem_app_secret', v_proprio, 'departamento_id', k.departamento_id,
    'qualidade', k.qualidade, 'ultimo_erro', k.ultimo_erro, 'verificado_em', k.verificado_em,
    'criado_em', k.criado_em,
    'webhook', case when v_proprio then
        jsonb_build_object('modo', 'proprio', 'url', v_base || '/nx-whatsapp?c=' || k.chave_publica,
                           'verify_token', k.verify_token, 'campo', 'messages')
      else
        jsonb_build_object('modo', 'nexus', 'url', v_base || '/nx-whatsapp', 'verify_token', null,
                           'campo', 'messages',
                           'texto', 'O webhook deste número é o do aplicativo da plataforma. Peça ao suporte para inscrever o app na WABA.')
      end);
end $$;

-- ------------------------------------------------------------
-- nx_cv_distribuir — interna (F2 no webhook e F7 no motor chamam)
-- manter_atendente → quem atendeu antes (ainda com acesso, recebe_conversas);
-- senão rodízio → menos conversas abertas, depois ultima_atribuicao_em mais antiga.
-- ------------------------------------------------------------
create or replace function public.nx_cv_distribuir(p_conversa bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cv public.nx_conversas;
  d public.nx_departamentos;
  v_conta uuid;
  v_como text;
  v_nome text;
  v_contato text;
begin
  select * into cv from public.nx_conversas where id = p_conversa for update;
  if cv.id is null then return null; end if;
  if cv.atribuida_a is not null then return cv.atribuida_a; end if;
  if cv.status = 'resolvida' or cv.oculta then return null; end if;

  select * into d from public.nx_departamentos
   where id = cv.departamento_id and cliente_id = cv.cliente_id;
  if d.id is null then
    select * into d from public.nx_departamentos where cliente_id = cv.cliente_id and padrao limit 1;
  end if;
  if d.id is null then return null; end if;

  -- uma distribuição por vez por cliente (a contagem de abertas enxerga a anterior já gravada)
  perform pg_advisory_xact_lock(hashtextextended('nx-rodizio:' || cv.cliente_id::text, 0));

  if d.manter_atendente then
    select x.atribuida_a into v_conta
      from public.nx_conversas x
      join public.nx_acessos a on a.conta_id = x.atribuida_a and a.cliente_id = x.cliente_id
      join public.nx_contas k on k.id = a.conta_id
     where x.cliente_id = cv.cliente_id and x.contato_id = cv.contato_id and x.id <> cv.id
       and x.atribuida_a is not null
       and a.recebe_conversas and a.papel in ('atendente', 'supervisor', 'admin') and k.aprovado
     order by x.aberta_em desc, x.id desc
     limit 1;
    if v_conta is not null then v_como := 'mesmo atendente de antes'; end if;
  end if;

  if v_conta is null and d.distribuicao = 'rodizio' then
    select a.conta_id into v_conta
      from public.nx_acessos a
      join public.nx_contas k on k.id = a.conta_id
     where a.cliente_id = cv.cliente_id and a.recebe_conversas
       and a.papel in ('atendente', 'supervisor', 'admin') and k.aprovado
       and (cardinality(a.departamentos) = 0 or d.id = any(a.departamentos))
     order by (select count(*) from public.nx_conversas x
                where x.cliente_id = cv.cliente_id and x.atribuida_a = a.conta_id
                  and x.status in ('aberta', 'pendente')),
              a.ultima_atribuicao_em asc nulls first, a.criado_em, a.conta_id
     limit 1;
    if v_conta is not null then v_como := 'rodízio de ' || d.nome; end if;
  end if;

  if v_conta is null then return null; end if;

  update public.nx_conversas set atribuida_a = v_conta, atualizado_em = now() where id = cv.id;
  update public.nx_acessos set ultima_atribuicao_em = now()
   where conta_id = v_conta and cliente_id = cv.cliente_id;
  select k.nome into v_nome from public.nx_contas k where k.id = v_conta;
  select coalesce(nullif(k.nome, ''), k.telefone, 'contato') into v_contato
    from public.nx_contatos k where k.id = cv.contato_id;
  perform public.nx_cv_sistema(cv.id, 'Atribuída a ' || coalesce(v_nome, 'atendente') || ' (' || v_como || ')', null);
  perform public.nx_notificar(cv.cliente_id, v_conta, 'atribuida',
                              left('Nova conversa com ' || coalesce(v_contato, 'contato'), 120),
                              'Protocolo ' || cv.protocolo, '#/conversas/' || cv.id);
  return v_conta;
end $$;

-- ------------------------------------------------------------
-- nx_cv_base — dados de apoio da tela (leitura): definida SÓ no arquivo
-- 20260928e_conversas_b.sql (com a chave "config" para admin+). Ficava também aqui
-- (sem "config"): reaplicar este arquivo sozinho desfazia a versão do e_b e
-- quebrava as telas de configuração. Uma definição só = reaplicar e, e_b, em
-- qualquer ordem, dá sempre o mesmo banco.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- nx_cv_listar — abas, filtros, busca, paginação por p_antes
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
  v_dep uuid; v_canal uuid; v_at text; v_at_id uuid; v_etq uuid[]; v_nl boolean;
  v_q text; v_qn text; v_dig text; v_busca boolean;
  v_itens jsonb; v_n int; v_cont json;
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

  with base as (
    select cv.id,
           row_number() over (order by
             case when v_aba = 'aguardando' and not v_busca then cv.ultima_entrada_em end asc nulls last,
             cv.ultima_msg_em desc, cv.id desc) as rn
      from public.nx_conversas cv
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
               when v_aba = 'aguardando' then not cv.oculta and cv.status = 'aberta' and cv.aguardando
               when v_aba = 'abertas' then not cv.oculta and cv.status = 'aberta'
               when v_aba = 'pendentes' then not cv.oculta and cv.status = 'pendente'
               when v_aba = 'resolvidas' then not cv.oculta and cv.status = 'resolvida'
                                              and cv.resolvida_em > now() - interval '30 days'
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
            or (v_aba = 'aguardando' and not v_busca and cv.ultima_entrada_em > p_antes)
            or ((v_aba <> 'aguardando' or v_busca) and cv.ultima_msg_em < p_antes))
     order by rn
     limit v_lim + 1
  )
  select coalesce(jsonb_agg(public.nx_cv_json_item(c) order by b.rn) filter (where b.rn <= v_lim), '[]'::jsonb),
         count(*)
    into v_itens, v_n
    from base b join public.nx_conversas c on c.id = b.id;

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
-- nx_cv_ver — cabeçalho + lateral (não altera nada)
-- ------------------------------------------------------------
create or replace function public.nx_cv_ver(p_token text, p_cliente uuid, p_id bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  cv public.nx_conversas;
  k public.nx_contatos;
  v_rank int;
  v_conv jsonb;
  v_anuncio jsonb;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  v_rank := public.nx_rank(v.papel);
  if not public.nx_cv_visivel(v, p_cliente, p_id) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  select * into cv from public.nx_conversas where id = p_id;
  select * into k from public.nx_contatos where id = cv.contato_id and cliente_id = p_cliente;

  v_conv := public.nx_cv_json_item(cv) || jsonb_build_object(
    'aberta_em', cv.aberta_em, 'primeira_resposta_em', cv.primeira_resposta_em,
    'resolvida_em', cv.resolvida_em,
    'departamento', (select jsonb_build_object('id', d.id, 'nome', d.nome, 'cor', d.cor)
                       from public.nx_departamentos d where d.id = cv.departamento_id),
    'atribuida', (select jsonb_build_object('id', x.id, 'nome', x.nome)
                    from public.nx_contas x where x.id = cv.atribuida_a),
    'canal', (select jsonb_build_object('id', c.id, 'nome', c.nome, 'numero_exibicao', c.numero_exibicao,
                                        'status', c.status, 'tem_token', c.token_segredo is not null)
                from public.nx_canais c where c.id = cv.canal_id),
    'resolvida_por', (select jsonb_build_object('id', x.id, 'nome', x.nome)
                        from public.nx_contas x where x.id = cv.resolvida_por));

  if k.anuncio_ext is not null or k.campanha_ext is not null then
    select jsonb_build_object('plataforma', coalesce(k.plataforma, m.plataforma),
                              'campanha_nome', m.campanha_nome, 'anuncio_nome', m.anuncio_nome)
      into v_anuncio
      from public.nx_metricas_dia m
     where m.cliente_id = p_cliente
       and ((k.anuncio_ext is not null and m.anuncio_ext = k.anuncio_ext)
            or (k.anuncio_ext is null and m.campanha_ext = k.campanha_ext))
     order by m.data desc limit 1;
  end if;
  if v_anuncio is null and k.plataforma is not null then
    v_anuncio := jsonb_build_object('plataforma', k.plataforma, 'campanha_nome', null, 'anuncio_nome', null);
  end if;

  return json_build_object(
    'conversa', v_conv,
    'contato', to_jsonb(k) - 'busca' - 'tel_chave',
    'anuncio', v_anuncio,
    'negocios', coalesce((select jsonb_agg(public.nx_cv_json_card(l) order by l.criado_em desc)
                            from public.nx_leads l
                           where l.cliente_id = p_cliente and l.contato_id = k.id and l.status = 'aberto'
                             and (v.papel not in ('atendente', 'leitura') or v.ver_todas
                                  or l.dono_id = v.conta_id or l.dono_id is null)), '[]'::jsonb),
    'atendimentos', coalesce((select jsonb_agg(jsonb_build_object(
                                'id', x.id, 'protocolo', x.protocolo, 'status', x.status,
                                'aberta_em', x.aberta_em, 'resolvida_em', x.resolvida_em,
                                'canal_id', x.canal_id,
                                'atribuida_nome', (select a.nome from public.nx_contas a where a.id = x.atribuida_a))
                                order by x.aberta_em desc)
                                from public.nx_conversas x
                               where x.cliente_id = p_cliente and x.contato_id = k.id
                                 and (not x.oculta or v_rank >= 2)), '[]'::jsonb),
    'tarefas', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', t.id, 'tipo', t.tipo, 'titulo', t.titulo, 'vence_em', t.vence_em,
                           'atrasada', t.vence_em is not null and t.vence_em < now(),
                           'negocio_id', t.negocio_id,
                           'dono', (select jsonb_build_object('id', a.id, 'nome', a.nome)
                                      from public.nx_contas a where a.id = t.dono_id))
                           order by t.vence_em nulls last, t.id)
                           from public.nx_tarefas t
                          where t.cliente_id = p_cliente and t.contato_id = k.id and t.concluida_em is null), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------
-- nx_cv_mensagens — página (p_antes_id) ou delta (cursor duplo: p_depois_id + p_desde − 30 s)
-- Histórico contínuo do contato (todas as conversas dele no cliente).
-- ------------------------------------------------------------
create or replace function public.nx_cv_mensagens(p_token text, p_cliente uuid, p_conversa bigint,
                                                  p_antes_id bigint default null, p_desde timestamptz default null,
                                                  p_depois_id bigint default null, p_limite int default 50)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  v_contato bigint;
  v_ocultas bigint[];
  v_lim int := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_delta boolean := p_desde is not null or p_depois_id is not null;
  v_itens jsonb; v_n int; v_max bigint;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  select cv.contato_id into v_contato from public.nx_conversas cv where cv.id = p_conversa;
  if public.nx_rank(v.papel) < 2 then
    select array_agg(x.id) into v_ocultas from public.nx_conversas x
     where x.cliente_id = p_cliente and x.contato_id = v_contato and x.oculta;
  end if;
  v_ocultas := coalesce(v_ocultas, '{}'::bigint[]);

  if v_delta then
    with sel as (
      select m.id from public.nx_mensagens m
       where m.contato_id = v_contato and m.cliente_id = p_cliente
         and not (m.conversa_id = any(v_ocultas))
         and ( (p_depois_id is not null and m.id > p_depois_id)
            or (p_desde is not null and m.atualizado_em > p_desde - interval '30 seconds') )
       order by m.id
       limit 201
    ), num as (select s.id, row_number() over (order by s.id) rn from sel s)
    select coalesce(jsonb_agg(public.nx_cv_json_msg(m) order by m.id) filter (where n.rn <= 200), '[]'::jsonb),
           count(*), max(m.id) filter (where n.rn <= 200)
      into v_itens, v_n, v_max
      from num n join public.nx_mensagens m on m.id = n.id;
    v_n := case when v_n > 200 then 1 else 0 end;
  else
    with sel as (
      select m.id from public.nx_mensagens m
       where m.contato_id = v_contato and m.cliente_id = p_cliente
         and not (m.conversa_id = any(v_ocultas))
         and (p_antes_id is null or m.id < p_antes_id)
       order by m.id desc
       limit v_lim + 1
    ), num as (select s.id, row_number() over (order by s.id desc) rn from sel s)
    select coalesce(jsonb_agg(public.nx_cv_json_msg(m) order by m.id) filter (where n.rn <= v_lim), '[]'::jsonb),
           count(*), max(m.id) filter (where n.rn <= v_lim)
      into v_itens, v_n, v_max
      from num n join public.nx_mensagens m on m.id = n.id;
    v_n := case when v_n > v_lim then 1 else 0 end;
  end if;

  return json_build_object(
    'itens', v_itens,
    'tem_mais', v_n = 1,
    'conversas', coalesce((select json_agg(json_build_object('id', x.id, 'protocolo', x.protocolo,
                             'aberta_em', x.aberta_em, 'resolvida_em', x.resolvida_em, 'status', x.status,
                             'canal_id', x.canal_id) order by x.id)
                             from public.nx_conversas x
                            where x.cliente_id = p_cliente and x.contato_id = v_contato
                              and not (x.id = any(v_ocultas))), '[]'::json),
    'agora', clock_timestamp(),
    'ultimo_id', greatest(coalesce(v_max, p_depois_id), p_depois_id));
end $$;

-- ------------------------------------------------------------
-- nx_cv_marcar_lida — zera nao_lidas; devolve o último wamid recebido (para o "lido" da nx-enviar)
-- ------------------------------------------------------------
create or replace function public.nx_cv_marcar_lida(p_token text, p_cliente uuid, p_conversa bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura'); v_w text;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  update public.nx_conversas set nao_lidas = 0, atualizado_em = now()
   where id = p_conversa and cliente_id = p_cliente and nao_lidas <> 0;
  select m.wamid into v_w from public.nx_mensagens m
   where m.conversa_id = p_conversa and m.direcao = 'in' and m.wamid is not null
   order by m.id desc limit 1;
  return json_build_object('ultimo_wamid_in', v_w);
end $$;

-- ------------------------------------------------------------
-- nx_cv_nota — nota interna (nunca vai ao WhatsApp; não mexe na conversa)
-- ------------------------------------------------------------
create or replace function public.nx_cv_nota(p_token text, p_cliente uuid, p_conversa bigint, p_texto text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  v_txt text := btrim(coalesce(p_texto, ''));
  m public.nx_mensagens;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  if char_length(v_txt) < 1 or char_length(v_txt) > 4096 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'texto';
  end if;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo,
                                   status, enviado_por, origem)
  select cv.cliente_id, cv.id, cv.contato_id, cv.canal_id, 'out', 'nota', v_txt, 'enviada', v.conta_id, 'painel'
    from public.nx_conversas cv where cv.id = p_conversa
  returning * into m;
  return public.nx_cv_json_msg(m)::json;
end $$;

-- ------------------------------------------------------------
-- nx_cv_atribuir — assumir, transferir (pessoa e/ou departamento), devolver à fila
-- p_conta nulo + p_departamento → vai para o departamento sem dono; os dois nulos → devolve à fila
-- ------------------------------------------------------------
create or replace function public.nx_cv_atribuir(p_token text, p_cliente uuid, p_conversa bigint,
                                                 p_conta uuid default null, p_departamento uuid default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  cv public.nx_conversas;
  d public.nx_departamentos;
  v_novo uuid;
  v_dep uuid;
  v_eu text := coalesce(nullif(v.nome, ''), 'Alguém');
  v_de text; v_para text; v_txt text; v_contato text;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  select * into cv from public.nx_conversas where id = p_conversa for update;

  if p_departamento is not null then
    select * into d from public.nx_departamentos where id = p_departamento and cliente_id = p_cliente and ativo;
    if d.id is null then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
    end if;
  end if;
  if p_conta is not null and p_conta <> v.conta_id then
    -- só quem tem acesso ativo de atendimento neste cliente recebe conversa
    if not exists (select 1 from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
                    where a.conta_id = p_conta and a.cliente_id = p_cliente
                      and a.papel in ('atendente', 'supervisor', 'admin') and k.aprovado) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'conta';
    end if;
  end if;

  v_novo := p_conta;
  v_dep := coalesce(p_departamento, cv.departamento_id);
  if v_novo is not distinct from cv.atribuida_a and v_dep is not distinct from cv.departamento_id then
    return public.nx_cv_json_item(cv)::json;   -- nada mudou
  end if;

  update public.nx_conversas
     set atribuida_a = v_novo, departamento_id = v_dep, atualizado_em = now()
   where id = cv.id;

  if v_novo is not null and v_novo is distinct from cv.atribuida_a then
    update public.nx_acessos set ultima_atribuicao_em = now()
     where conta_id = v_novo and cliente_id = p_cliente;
  end if;

  select k.nome into v_de from public.nx_contas k where k.id = cv.atribuida_a;
  select k.nome into v_para from public.nx_contas k where k.id = v_novo;
  if v_novo is distinct from cv.atribuida_a then
    if v_novo = v.conta_id and cv.atribuida_a is null then
      v_txt := v_eu || ' assumiu';
    elsif v_novo is not null and cv.atribuida_a is not null then
      v_txt := 'Transferida de ' || coalesce(v_de, 'atendente') || ' para ' || coalesce(v_para, 'atendente');
    elsif v_novo is not null then
      v_txt := 'Atribuída a ' || coalesce(v_para, 'atendente') || ' por ' || v_eu;
    elsif p_departamento is null then
      v_txt := v_eu || ' devolveu para a fila';
    end if;
  end if;
  if v_dep is distinct from cv.departamento_id then
    v_txt := coalesce(v_txt || ' · ', '') || 'Movida para ' || d.nome;
  end if;
  if v_txt is not null then
    perform public.nx_cv_sistema(cv.id, v_txt, v.conta_id);
  end if;

  if v_novo is not null and v_novo <> v.conta_id and v_novo is distinct from cv.atribuida_a then
    select coalesce(nullif(k.nome, ''), k.telefone, 'contato') into v_contato
      from public.nx_contatos k where k.id = cv.contato_id;
    perform public.nx_notificar(p_cliente, v_novo, 'atribuida',
                                left(v_eu || ' passou a conversa com ' || coalesce(v_contato, 'contato') || ' para você', 120),
                                'Protocolo ' || cv.protocolo, '#/conversas/' || cv.id);
  end if;

  select * into cv from public.nx_conversas where id = p_conversa;
  return public.nx_cv_json_item(cv)::json;
end $$;

-- ------------------------------------------------------------
-- nx_cv_status — aberta ↔ pendente; resolver; reabrir (ja_existe_aberta)
-- ------------------------------------------------------------
create or replace function public.nx_cv_status(p_token text, p_cliente uuid, p_conversa bigint, p_status text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  cv public.nx_conversas;
  v_outra bigint;
  v_chave text;
  v_eu text := coalesce(nullif(v.nome, ''), 'Alguém');
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if p_status is null or p_status not in ('aberta', 'pendente', 'resolvida') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'status';
  end if;
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  -- reabrir: mesma trava do webhook (cliente + chave do telefone), ANTES da trava da linha,
  -- para o webhook não criar outra aberta no meio (índice nx_conversas_uma_aberta)
  select * into cv from public.nx_conversas where id = p_conversa;
  if cv.status = 'resolvida' and p_status <> 'resolvida' then
    select coalesce(k.tel_chave, k.wa_id) into v_chave from public.nx_contatos k where k.id = cv.contato_id;
    if v_chave is not null then
      perform pg_advisory_xact_lock(hashtextextended(p_cliente::text || ':' || v_chave, 0));
    end if;
  end if;
  select * into cv from public.nx_conversas where id = p_conversa for update;
  if cv.status = p_status then
    return public.nx_cv_json_item(cv)::json;
  end if;

  if p_status = 'resolvida' then
    update public.nx_conversas
       set status = 'resolvida', resolvida_em = now(), resolvida_por = v.conta_id,
           aguardando = false, nao_lidas = 0, atualizado_em = now()
     where id = cv.id;
    perform public.nx_cv_sistema(cv.id, 'Atendimento ' || cv.protocolo || ' resolvido por ' || v_eu, v.conta_id);
  elsif cv.status = 'resolvida' then
    select x.id into v_outra from public.nx_conversas x
     where x.cliente_id = p_cliente and x.contato_id = cv.contato_id
       and x.canal_id is not distinct from cv.canal_id
       and x.status <> 'resolvida' and x.id <> cv.id
     limit 1;
    if v_outra is not null then
      raise exception 'ja_existe_aberta' using errcode = '22023', hint = v_outra::text;
    end if;
    update public.nx_conversas
       set status = p_status, resolvida_em = null, resolvida_por = null, atualizado_em = now()
     where id = cv.id;
    perform public.nx_cv_sistema(cv.id, 'Atendimento ' || cv.protocolo || ' reaberto por ' || v_eu, v.conta_id);
  else
    update public.nx_conversas set status = p_status, atualizado_em = now() where id = cv.id;
    perform public.nx_cv_sistema(cv.id,
      case when p_status = 'pendente' then v_eu || ' marcou como pendente'
           else v_eu || ' retomou o atendimento' end, v.conta_id);
  end if;

  select * into cv from public.nx_conversas where id = p_conversa;
  return public.nx_cv_json_item(cv)::json;
end $$;

-- ------------------------------------------------------------
-- nx_cv_etiquetas — substitui as etiquetas da conversa
-- ------------------------------------------------------------
create or replace function public.nx_cv_etiquetas(p_token text, p_cliente uuid, p_conversa bigint, p_etiquetas uuid[])
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  v_ids uuid[];
  cv public.nx_conversas;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
    from unnest(coalesce(p_etiquetas, '{}'::uuid[])) x where x is not null;
  if cardinality(v_ids) > 30 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'etiquetas';
  end if;
  if exists (select 1 from unnest(v_ids) x
              where not exists (select 1 from public.nx_etiquetas e where e.id = x and e.cliente_id = p_cliente)) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'etiquetas';
  end if;
  update public.nx_conversas set etiquetas = v_ids, atualizado_em = now()
   where id = p_conversa and cliente_id = p_cliente
  returning * into cv;
  return public.nx_cv_json_item(cv)::json;
end $$;

-- ------------------------------------------------------------
-- nx_cv_nova — iniciar conversa (contato existente ou telefone digitado) num número
-- ------------------------------------------------------------
create or replace function public.nx_cv_nova(p_token text, p_cliente uuid, p_canal uuid, p_contato bigint default null,
                                             p_telefone text default null, p_nome text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  k public.nx_canais;
  v_ct bigint;
  v_tel text;
  v_intl boolean;
  v_chave text;
  cv public.nx_conversas;
  v_dep uuid;
  v_neg bigint;
  v_entrada timestamptz;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  select * into k from public.nx_canais where id = p_canal and cliente_id = p_cliente;
  if k.id is null then
    raise exception 'canal_nao_encontrado' using errcode = '22023';
  end if;

  if p_contato is not null then
    select c.id, coalesce(c.tel_chave, c.wa_id) into v_ct, v_chave
      from public.nx_contatos c where c.id = p_contato and c.cliente_id = p_cliente;
    if v_ct is null then
      raise exception 'contato_nao_encontrado' using errcode = '22023';
    end if;
    -- mesma trava do webhook (nx_wa_entrada: cliente + chave do telefone): nunca duas conversas abertas
    if v_chave is not null then
      perform pg_advisory_xact_lock(hashtextextended(p_cliente::text || ':' || v_chave, 0));
    end if;
  elsif nullif(btrim(coalesce(p_telefone, '')), '') is not null then
    -- "+<DDI>…" ou "00<DDI>…" = número internacional completo: fica como veio (8–15 dígitos).
    -- Sem prefixo = regra do Brasil (10–11 dígitos ganham o 55).
    v_intl := btrim(p_telefone) ~ '^(\+|00)';
    v_tel := public.nx_tel_normalizar(regexp_replace(btrim(p_telefone), '^(\+|00)', ''), v_intl);
    if v_tel is null then
      raise exception 'telefone_invalido' using errcode = '22023', hint = 'telefone';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_cliente::text || ':' || coalesce(public.nx_tel_chave(v_tel), v_tel), 0));
    v_ct := public.nx_contato_por_tel(p_cliente, v_tel);
    if v_ct is null then
      perform public.nx_exigir_limite(p_cliente, 'contatos', 1);
      -- internacional de 8–11 dígitos (ex.: +1 EUA/Canadá): wa_id = número, senão o gatilho do
      -- contato trataria como número do Brasil e acrescentaria o 55
      insert into public.nx_contatos as c (cliente_id, nome, telefone, wa_id, origem)
      values (p_cliente, nullif(left(btrim(coalesce(p_nome, '')), 160), ''), v_tel,
              case when v_intl and char_length(v_tel) <= 11 then v_tel end, 'manual')
      on conflict (cliente_id, tel_chave) where tel_chave is not null
      do update set nome = coalesce(c.nome, excluded.nome)
      returning c.id into v_ct;
    end if;
  else
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'contato';
  end if;

  -- já existe atendimento aberto/pendente desse contato nesse número? devolve (se visível)
  select * into cv from public.nx_conversas x
   where x.cliente_id = p_cliente and x.canal_id = p_canal and x.contato_id = v_ct and x.status <> 'resolvida'
   limit 1;
  if cv.id is not null then
    if not public.nx_cv_visivel(v, p_cliente, cv.id) then
      raise exception 'ja_existe_aberta' using errcode = '22023', hint = cv.id::text;
    end if;
    return public.nx_cv_json_item(cv)::json;
  end if;

  v_dep := coalesce(k.departamento_id,
                    (select d.id from public.nx_departamentos d where d.cliente_id = p_cliente and d.padrao limit 1));
  select l.id into v_neg from public.nx_leads l
    left join public.nx_funis f on f.id = l.funil_id
   where l.cliente_id = p_cliente and l.contato_id = v_ct and l.status = 'aberto'
   order by (f.padrao is true) desc, l.criado_em desc
   limit 1;
  select max(x.ultima_entrada_em) into v_entrada from public.nx_conversas x
   where x.cliente_id = p_cliente and x.canal_id = p_canal and x.contato_id = v_ct;

  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, atribuida_a, negocio_id,
                                   protocolo, status, aguardando, ultima_entrada_em, ultima_msg_em)
  values (p_cliente, p_canal, v_ct, v_dep, v.conta_id, v_neg,
          public.nx_protocolo(p_cliente), 'aberta', false, v_entrada, now())
  returning * into cv;
  perform public.nx_cv_sistema(cv.id, 'Conversa iniciada por ' || coalesce(nullif(v.nome, ''), 'atendente'), v.conta_id);
  return public.nx_cv_json_item(cv)::json;
end $$;

-- ------------------------------------------------------------
-- nx_cv_vincular_negocio — liga (ou desliga, com p_negocio nulo) o negócio da conversa
-- ------------------------------------------------------------
create or replace function public.nx_cv_vincular_negocio(p_token text, p_cliente uuid, p_conversa bigint, p_negocio bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente');
  cv public.nx_conversas;
  l record;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  select * into cv from public.nx_conversas where id = p_conversa;
  if p_negocio is not null then
    select x.id, x.contato_id into l from public.nx_leads x where x.id = p_negocio and x.cliente_id = p_cliente;
    if l.id is null then
      raise exception 'negocio_nao_encontrado' using errcode = '22023';
    end if;
    if l.contato_id is distinct from cv.contato_id then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'contato';
    end if;
  end if;
  update public.nx_conversas set negocio_id = p_negocio, atualizado_em = now()
   where id = cv.id
  returning * into cv;
  return public.nx_cv_json_item(cv)::json;
end $$;

-- ------------------------------------------------------------
-- Números de WhatsApp (nx_canais) — admin
-- ------------------------------------------------------------
create or replace function public.nx_canal_salvar(p_token text, p_cliente uuid, p_canal jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  c jsonb := coalesce(p_canal, '{}'::jsonb);
  k public.nx_canais;
  v_id uuid;
  v_novo boolean;
  v_nome text; v_pid text; v_waba text; v_num text; v_dep uuid; v_coex boolean;
  v_tok text; v_sec text;
  v_old_pid text; v_old_waba text;
  v_mudou boolean := false;
  v_org uuid;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  begin
    v_id := nullif(c ->> 'id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'canal_nao_encontrado' using errcode = '22023';
  end;
  v_novo := v_id is null;
  if not v_novo then
    select * into k from public.nx_canais where id = v_id and cliente_id = p_cliente for update;
    if k.id is null then
      raise exception 'canal_nao_encontrado' using errcode = '22023';
    end if;
  end if;
  v_old_pid := k.phone_number_id; v_old_waba := k.waba_id;

  v_nome := case when c ? 'nome' then btrim(coalesce(c ->> 'nome', '')) else k.nome end;
  if v_nome is null or char_length(v_nome) < 1 or char_length(v_nome) > 40 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'nome';
  end if;
  v_pid := case when c ? 'phone_number_id' then nullif(regexp_replace(coalesce(c ->> 'phone_number_id', ''), '\s', '', 'g'), '')
                else k.phone_number_id end;
  if v_pid is null or v_pid !~ '^[0-9]{5,30}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'phone_number_id';
  end if;
  v_waba := case when c ? 'waba_id' then nullif(regexp_replace(coalesce(c ->> 'waba_id', ''), '\s', '', 'g'), '')
                 else k.waba_id end;
  if v_waba is null or v_waba !~ '^[0-9]{5,30}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'waba_id';
  end if;
  v_num := case when c ? 'numero_exibicao' then nullif(left(btrim(coalesce(c ->> 'numero_exibicao', '')), 30), '')
                else k.numero_exibicao end;
  if c ? 'departamento_id' then
    begin
      v_dep := nullif(c ->> 'departamento_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
    end;
    if v_dep is not null and not exists (select 1 from public.nx_departamentos d
                                          where d.id = v_dep and d.cliente_id = p_cliente) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
    end if;
  else
    v_dep := k.departamento_id;
  end if;
  if v_dep is null then
    select d.id into v_dep from public.nx_departamentos d where d.cliente_id = p_cliente and d.padrao limit 1;
  end if;
  begin
    v_coex := case when c ? 'coexistencia' then coalesce((c ->> 'coexistencia')::boolean, false)
                   else coalesce(k.coexistencia, false) end;
  exception when invalid_text_representation then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'coexistencia';
  end;
  v_tok := nullif(btrim(coalesce(c ->> 'token', '')), '');
  v_sec := nullif(btrim(coalesce(c ->> 'app_secret', '')), '');
  if v_tok is not null and (char_length(v_tok) < 20 or char_length(v_tok) > 1000 or v_tok ~ '\s') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'token';
  end if;
  if v_sec is not null and v_sec !~ '^[0-9A-Za-z]{16,128}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'app_secret';
  end if;

  -- número de outro canal (de qualquer cliente) ou de outro cliente pelo caminho antigo
  if exists (select 1 from public.nx_canais x where x.phone_number_id = v_pid and x.id is distinct from v_id)
     or exists (select 1 from public.nx_clientes x where x.wa_phone_number_id = v_pid and x.id <> p_cliente) then
    raise exception 'numero_em_uso' using errcode = '22023', hint = 'phone_number_id';
  end if;

  -- ordem obrigatória (§5.4): desliga o gatilho do cliente → grava o canal → só então o cliente
  perform set_config('nx.sem_gatilho_canal', '1', true);
  if v_novo then
    perform public.nx_exigir_limite(p_cliente, 'canais', 1);
    insert into public.nx_canais (cliente_id, nome, phone_number_id, waba_id, numero_exibicao, departamento_id,
                                  coexistencia, status, app_inscrito)
    values (p_cliente, v_nome, v_pid, v_waba, v_num, v_dep, v_coex, 'pendente', null)
    returning * into k;
    v_mudou := true;
  else
    v_mudou := v_pid is distinct from v_old_pid or v_waba is distinct from v_old_waba or v_tok is not null
               or v_sec is not null;
    update public.nx_canais
       set nome = v_nome, phone_number_id = v_pid, waba_id = v_waba, numero_exibicao = v_num,
           departamento_id = v_dep, coexistencia = v_coex,
           status = case when v_mudou then 'pendente' else status end,
           app_inscrito = case when v_mudou then null else app_inscrito end
     where id = k.id
    returning * into k;
  end if;
  if v_tok is not null then
    update public.nx_canais
       set token_segredo = public.nx_segredo_gravar(k.token_segredo, v_tok, 'nx-canal-token-' || k.id::text)
     where id = k.id returning * into k;
  end if;
  if v_sec is not null then
    update public.nx_canais
       set app_secret_segredo = public.nx_segredo_gravar(k.app_secret_segredo, v_sec, 'nx-canal-app-' || k.id::text)
     where id = k.id returning * into k;
  end if;
  update public.nx_clientes set wa_phone_number_id = v_pid
   where id = p_cliente
     and (wa_phone_number_id is null or (v_old_pid is not null and wa_phone_number_id = v_old_pid));
  perform set_config('nx.sem_gatilho_canal', '', true);

  select c2.org_id into v_org from public.nx_clientes c2 where c2.id = p_cliente;
  perform public.nx_auditar(v_org, p_cliente, v.conta_id, case when v_novo then 'canal_criado' else 'canal_alterado' end,
                            jsonb_build_object('canal', k.id, 'phone_number_id', k.phone_number_id,
                                               'token', v_tok is not null, 'app_secret', v_sec is not null));
  return json_build_object('canal', public.nx_canal_json(k) - 'webhook',
                           'webhook', public.nx_canal_json(k) -> 'webhook');
end $$;

create or replace function public.nx_canal_excluir(p_token text, p_cliente uuid, p_id uuid, p_confirmacao text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  k public.nx_canais;
  v_org uuid;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  select * into k from public.nx_canais where id = p_id and cliente_id = p_cliente for update;
  if k.id is null then
    raise exception 'canal_nao_encontrado' using errcode = '22023';
  end if;
  if coalesce(lower(btrim(p_confirmacao)), '') <> 'excluir' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'confirmacao';
  end if;
  delete from public.nx_canais where id = k.id;
  delete from vault.secrets s
   where s.id in (k.token_segredo, k.app_secret_segredo);
  perform set_config('nx.sem_gatilho_canal', '1', true);
  update public.nx_clientes set wa_phone_number_id = null
   where id = p_cliente and wa_phone_number_id = k.phone_number_id;
  perform set_config('nx.sem_gatilho_canal', '', true);
  select c.org_id into v_org from public.nx_clientes c where c.id = p_cliente;
  perform public.nx_auditar(v_org, p_cliente, v.conta_id, 'canal_excluido',
                            jsonb_build_object('canal', k.id, 'phone_number_id', k.phone_number_id));
  return json_build_object('ok', true);
end $$;

create or replace function public.nx_canais_listar(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  return coalesce((select json_agg(public.nx_canal_json(k) order by k.criado_em)
                     from public.nx_canais k where k.cliente_id = p_cliente), '[]'::json);
end $$;

-- ------------------------------------------------------------
-- Respostas rápidas
-- ------------------------------------------------------------
create or replace function public.nx_resposta_salvar(p_token text, p_cliente uuid, p_resposta jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'supervisor');
  r jsonb := coalesce(p_resposta, '{}'::jsonb);
  x public.nx_respostas;
  v_id uuid;
  v_atalho text; v_titulo text; v_corpo text; v_dep uuid; v_ordem int; v_ativo boolean;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  begin
    v_id := nullif(r ->> 'id', '')::uuid;
    v_dep := nullif(r ->> 'departamento_id', '')::uuid;
    v_ordem := coalesce(nullif(r ->> 'ordem', '')::int, 0);
    v_ativo := coalesce(nullif(r ->> 'ativo', '')::boolean, true);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'resposta';
  end;
  if v_id is not null then
    select * into x from public.nx_respostas where id = v_id and cliente_id = p_cliente for update;
    if x.id is null then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'id';
    end if;
  end if;
  v_atalho := lower(regexp_replace(btrim(coalesce(r ->> 'atalho', x.atalho, '')), '^/+', ''));
  if v_atalho !~ '^[a-z0-9_-]{1,30}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'atalho';
  end if;
  v_titulo := btrim(coalesce(r ->> 'titulo', x.titulo, ''));
  if char_length(v_titulo) < 1 or char_length(v_titulo) > 60 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'titulo';
  end if;
  v_corpo := btrim(coalesce(r ->> 'corpo', x.corpo, ''));
  if char_length(v_corpo) < 1 or char_length(v_corpo) > 4096 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'corpo';
  end if;
  if not (r ? 'departamento_id') then v_dep := x.departamento_id; end if;
  if v_dep is not null and not exists (select 1 from public.nx_departamentos d where d.id = v_dep and d.cliente_id = p_cliente) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'departamento';
  end if;
  if not (r ? 'ordem') and x.id is not null then v_ordem := x.ordem; end if;
  if not (r ? 'ativo') and x.id is not null then v_ativo := x.ativo; end if;
  if exists (select 1 from public.nx_respostas o
              where o.cliente_id = p_cliente and o.atalho = v_atalho and o.id is distinct from v_id) then
    raise exception 'atalho_em_uso' using errcode = '22023', hint = 'atalho';
  end if;

  if v_id is null then
    insert into public.nx_respostas (cliente_id, atalho, titulo, corpo, departamento_id, ordem, ativo)
    values (p_cliente, v_atalho, v_titulo, v_corpo, v_dep, v_ordem, v_ativo)
    returning * into x;
  else
    update public.nx_respostas
       set atalho = v_atalho, titulo = v_titulo, corpo = v_corpo, departamento_id = v_dep,
           ordem = v_ordem, ativo = v_ativo
     where id = v_id
    returning * into x;
  end if;
  return json_build_object('id', x.id, 'atalho', x.atalho, 'titulo', x.titulo, 'corpo', x.corpo,
                           'departamento_id', x.departamento_id, 'ordem', x.ordem, 'ativo', x.ativo,
                           'usos', x.usos);
end $$;

create or replace function public.nx_resposta_excluir(p_token text, p_cliente uuid, p_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'supervisor');
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  delete from public.nx_respostas where id = p_id and cliente_id = p_cliente;
  if not found then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'id';
  end if;
  return json_build_object('ok', true);
end $$;

create or replace function public.nx_resposta_usada(p_token text, p_cliente uuid, p_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente'); v_usos int;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  update public.nx_respostas set usos = usos + 1
   where id = p_id and cliente_id = p_cliente
  returning usos into v_usos;
  return json_build_object('ok', v_usos is not null, 'usos', v_usos);
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
         'nx_cv_json_msg','nx_cv_json_item','nx_cv_json_card','nx_cv_sistema','nx_canal_json','nx_cv_distribuir',
         'nx_cv_base','nx_cv_listar','nx_cv_ver','nx_cv_mensagens','nx_cv_marcar_lida','nx_cv_nota',
         'nx_cv_atribuir','nx_cv_status','nx_cv_etiquetas','nx_cv_nova','nx_cv_vincular_negocio',
         'nx_canal_salvar','nx_canal_excluir','nx_canais_listar',
         'nx_resposta_salvar','nx_resposta_excluir','nx_resposta_usada')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    if r.proname in ('nx_cv_json_msg','nx_cv_json_item','nx_cv_json_card','nx_cv_sistema','nx_canal_json',
                     'nx_cv_distribuir') then
      execute format('grant execute on function %s to service_role', r.fn);
    else
      execute format('grant execute on function %s to anon, authenticated, service_role', r.fn);
    end if;
  end loop;
end $$;
