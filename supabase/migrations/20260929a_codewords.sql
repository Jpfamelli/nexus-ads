-- ============================================================
-- ÓRBITA — CodeWords como transporte de conversas WhatsApp
-- Aditivo: mantém canais Meta existentes e acrescenta transporte CodeWords.
-- API key e chave do webhook ficam no Vault; o banco guarda só referências
-- e o hash da chave recebida no endpoint público.
-- ============================================================

alter table public.nx_canais
  add column if not exists provedor text not null default 'meta'
    check (provedor in ('meta','codewords')),
  add column if not exists codewords_service_id text,
  add column if not exists codewords_api_segredo uuid,
  add column if not exists codewords_hook_segredo uuid,
  add column if not exists codewords_hook_hash text;

create index if not exists nx_canais_codewords_hook
  on public.nx_canais(codewords_hook_hash) where provedor = 'codewords';

-- Alguns provedores podem notificar a entrega antes do eco de saída. Guarda o
-- recibo até a mensagem existir, sem perder estados por causa da ordem HTTP.
create table if not exists public.nx_codewords_status_pendentes (
  canal_id uuid not null references public.nx_canais(id) on delete cascade,
  provider_id text not null check (char_length(provider_id) between 1 and 160
    and provider_id ~ '^[A-Za-z0-9._:-]+$'),
  status text not null check (status in ('sent','delivered','read','failed')),
  erro text,
  expira_em timestamptz not null default (now() + interval '7 days'),
  primary key (canal_id, provider_id)
);
create index if not exists nx_codewords_status_expira
  on public.nx_codewords_status_pendentes(expira_em);
alter table public.nx_codewords_status_pendentes enable row level security;
revoke all on table public.nx_codewords_status_pendentes from public, anon, authenticated;
grant all on table public.nx_codewords_status_pendentes to service_role;

-- O retorno do canal nunca revela a API key. O webhook CodeWords é uma URL
-- de posse: a chave aleatória tem 256 bits, fica no Vault e só seu SHA-256
-- é usado para localizar o canal recebido.
create or replace function public.nx_cv_base(p_token text, p_cliente uuid)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  v_cfg jsonb; v_iacfg jsonb; v_ia boolean; v_config json;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  select coalesce(c.cfg -> 'cv', '{}'::jsonb),
         case when jsonb_typeof(c.cfg -> 'ia') = 'object' then c.cfg -> 'ia' else '{}'::jsonb end
    into v_cfg, v_iacfg from public.nx_clientes c where c.id = p_cliente;
  select coalesce(nullif(btrim(x.anthropic_api_key), ''), '') <> '' into v_ia
    from public.nx_config x where x.id = 1;
  if public.nx_rank(v.papel) >= 3 then
    v_config := json_build_object(
      'departamentos', coalesce((select json_agg(public.nx_cv_json_dep(d) order by d.ordem, d.nome)
                                   from public.nx_departamentos d where d.cliente_id = p_cliente), '[]'::json),
      'ia', json_build_object('sobre', coalesce(v_iacfg ->> 'sobre', ''), 'servicos', coalesce(v_iacfg ->> 'servicos', ''),
        'horarios', coalesce(v_iacfg ->> 'horarios', ''), 'regras', coalesce(v_iacfg ->> 'regras', ''),
        'proibido', coalesce(v_iacfg ->> 'proibido', ''),
        'tom', case when v_iacfg ->> 'tom' = 'formal' then 'formal' else 'proximo' end));
  end if;
  return json_build_object(
    'eu', json_build_object('id', v.conta_id, 'nome', v.nome, 'papel', v.papel,
                            'departamentos', to_json(v.departamentos), 'ver_todas', v.ver_todas),
    'canais', coalesce((select json_agg(json_build_object(
       'id', k.id, 'nome', k.nome, 'numero_exibicao', k.numero_exibicao, 'status', k.status,
       'coexistencia', k.coexistencia, 'tem_token', k.token_segredo is not null, 'provedor', k.provedor,
       'departamento_id', k.departamento_id, 'app_inscrito', k.app_inscrito,
       'ultimo_erro', k.ultimo_erro) order by k.criado_em)
       from public.nx_canais k where k.cliente_id = p_cliente), '[]'::json),
    'departamentos', coalesce((select json_agg(json_build_object('id', d.id, 'nome', d.nome, 'cor', d.cor,
       'padrao', d.padrao, 'distribuicao', d.distribuicao, 'ativo', d.ativo) order by d.ordem, d.nome)
       from public.nx_departamentos d where d.cliente_id = p_cliente and d.ativo), '[]'::json),
    'respostas', coalesce((select json_agg(json_build_object('id', r.id, 'atalho', r.atalho, 'titulo', r.titulo,
       'corpo', r.corpo, 'departamento_id', r.departamento_id, 'usos', r.usos, 'ordem', r.ordem, 'ativo', r.ativo)
       order by r.ordem, r.atalho) from public.nx_respostas r where r.cliente_id = p_cliente), '[]'::json),
    'etiquetas', coalesce((select json_agg(json_build_object('id', e.id, 'nome', e.nome, 'cor', e.cor)
       order by lower(e.nome)) from public.nx_etiquetas e where e.cliente_id = p_cliente), '[]'::json),
    'usuarios', coalesce((select json_agg(json_build_object('id', k.id, 'nome', k.nome, 'papel', a.papel,
       'departamentos', to_json(a.departamentos), 'recebe_conversas', a.recebe_conversas, 'aprovado', k.aprovado)
       order by k.nome) from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
       where a.cliente_id = p_cliente), '[]'::json),
    'templates', coalesce((select json_agg(json_build_object('id', t.id, 'canal_id', t.canal_id, 'nome', t.nome,
       'idioma', t.idioma, 'categoria', t.categoria, 'status', t.status, 'corpo', t.corpo,
       'num_parametros', t.num_parametros) order by t.nome, t.idioma)
       from public.nx_templates t where t.cliente_id = p_cliente), '[]'::json),
    'cfg', json_build_object('recibo_leitura', coalesce((v_cfg ->> 'recibo_leitura')::boolean, true),
                             'assinatura', coalesce((v_cfg ->> 'assinatura')::boolean, false)),
    'ia', json_build_object('ligada', coalesce(v_ia, false),
       'cota', json_build_object('usadas', public.nx_uso(p_cliente, 'ia_mes'),
                                 'limite', public.nx_limite(p_cliente, 'ia_mes'))),
    'config', v_config);
end $$;

-- O compositor precisa distinguir o transporte CodeWords do canal Meta: esse
-- canal não tem token Meta, mas pode enviar texto pela chave do workflow.
create or replace function public.nx_cv_contexto_envio(p_ctx jsonb, p_cliente uuid, p_conversa bigint)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  v public.nx_ctx_t := jsonb_populate_record(null::public.nx_ctx_t, coalesce(p_ctx, '{}'::jsonb));
  cv public.nx_conversas; ct public.nx_contatos; k public.nx_canais; c public.nx_clientes;
begin
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  select * into cv from public.nx_conversas where id = p_conversa and cliente_id = p_cliente;
  select * into ct from public.nx_contatos where id = cv.contato_id and cliente_id = p_cliente;
  select * into k from public.nx_canais where id = cv.canal_id and cliente_id = p_cliente;
  select * into c from public.nx_clientes where id = p_cliente;
  return json_build_object(
    'conversa', json_build_object('id', cv.id, 'status', cv.status, 'canal_id', cv.canal_id,
      'contato_id', cv.contato_id, 'protocolo', cv.protocolo, 'departamento_id', cv.departamento_id,
      'atribuida_a', cv.atribuida_a, 'ultima_entrada_em', cv.ultima_entrada_em,
      'janela_ate', cv.ultima_entrada_em + interval '24 hours'),
    'contato', json_build_object('id', ct.id, 'wa_id', ct.wa_id, 'telefone', ct.telefone, 'nome', ct.nome,
      'optin_marketing', ct.optin_marketing, 'bloqueado', ct.bloqueado),
    'canal_id', cv.canal_id,
    'canal', case when k.id is not null then json_build_object('id', k.id, 'nome', k.nome, 'status', k.status,
      'provedor', k.provedor, 'tem_token', case when k.provedor = 'codewords' then k.codewords_api_segredo is not null
                                                else k.token_segredo is not null end) end,
    'janela_aberta', coalesce(cv.ultima_entrada_em > now() - interval '24 hours', false),
    'ultimo_wamid_in', (select m.wamid from public.nx_mensagens m
      where m.conversa_id = cv.id and m.direcao = 'in' and m.wamid is not null order by m.id desc limit 1),
    'cfg_cv', jsonb_build_object('recibo_leitura', true, 'assinatura', false)
      || case when jsonb_typeof(c.cfg -> 'cv') = 'object' then c.cfg -> 'cv' else '{}'::jsonb end,
    'atendente_nome', (select x.nome from public.nx_contas x where x.id = v.conta_id), 'empresa', c.nome);
end $$;

create or replace function public.nx_canal_json(k public.nx_canais)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_base text; v_proprio boolean; v_cw boolean; v_hook text;
begin
  if k.id is null then return null; end if;
  select rtrim(coalesce(nullif(btrim(x.funcoes_url), ''),
         'https://dtjznipitihnwmcgpzqh.supabase.co/functions/v1'), '/') into v_base
    from public.nx_config x where x.id = 1;
  v_base := coalesce(v_base, 'https://dtjznipitihnwmcgpzqh.supabase.co/functions/v1');
  v_proprio := k.app_secret_segredo is not null;
  v_cw := k.provedor = 'codewords';
  if v_cw and k.codewords_hook_segredo is not null then
    v_hook := public.nx_segredo_ler(k.codewords_hook_segredo);
  end if;
  return jsonb_build_object(
    'id', k.id, 'nome', k.nome, 'provedor', k.provedor,
    'phone_number_id', k.phone_number_id, 'waba_id', k.waba_id, 'numero_exibicao', k.numero_exibicao,
    'status', k.status, 'app_inscrito', k.app_inscrito, 'coexistencia', k.coexistencia,
    'tem_token', case when v_cw then false else k.token_segredo is not null end,
    'tem_codewords_api_key', k.codewords_api_segredo is not null,
    'codewords_service_id', k.codewords_service_id,
    'tem_app_secret', v_proprio, 'departamento_id', k.departamento_id,
    'qualidade', k.qualidade, 'ultimo_erro', k.ultimo_erro, 'verificado_em', k.verificado_em,
    'criado_em', k.criado_em,
    'webhook', case
      when v_cw then jsonb_build_object(
        'modo', 'codewords', 'url', case when v_hook is not null then v_base || '/nx-codewords?ch=' || v_hook end,
        'campo', 'evento HTTP POST · JSON Órbita v1')
      when v_proprio then jsonb_build_object('modo', 'proprio', 'url', v_base || '/nx-whatsapp?c=' || k.chave_publica,
        'verify_token', k.verify_token, 'campo', 'messages')
      else jsonb_build_object('modo', 'nexus', 'url', v_base || '/nx-whatsapp', 'verify_token', null,
        'campo', 'messages', 'texto', 'O webhook deste número é o do aplicativo da plataforma. Peça ao suporte para inscrever o app na WABA.')
    end);
end $$;

create or replace function public.nx_canal_credencial(p_canal uuid, p_cliente uuid)
returns json language plpgsql stable security definer set search_path = ''
as $$
declare k public.nx_canais;
begin
  select * into k from public.nx_canais where id = p_canal and cliente_id = p_cliente;
  if k.id is null then raise exception 'canal_nao_encontrado' using errcode = '22023'; end if;
  return json_build_object('canal_id', k.id, 'cliente_id', k.cliente_id, 'nome', k.nome,
    'provedor', k.provedor, 'phone_number_id', k.phone_number_id, 'waba_id', k.waba_id,
    'token', public.nx_segredo_ler(k.token_segredo),
    'app_secret', public.nx_segredo_ler(k.app_secret_segredo),
    'codewords_service_id', k.codewords_service_id,
    'codewords_api_key', public.nx_segredo_ler(k.codewords_api_segredo));
end $$;

-- Exclusivo do webhook Meta: não resolve canais cujo transporte é CodeWords.
create or replace function public.nx_wa_canal(p_phone_number_id text default null, p_chave text default null)
returns json language plpgsql stable security definer set search_path = ''
as $$
declare k public.nx_canais; v_slug text;
begin
  if nullif(btrim(coalesce(p_chave, '')), '') is not null then
    select * into k from public.nx_canais where chave_publica = btrim(p_chave) and provedor = 'meta';
  elsif nullif(btrim(coalesce(p_phone_number_id, '')), '') is not null then
    select * into k from public.nx_canais where phone_number_id = btrim(p_phone_number_id) and provedor = 'meta';
  end if;
  if k.id is null then return null; end if;
  select c.slug into v_slug from public.nx_clientes c where c.id = k.cliente_id;
  return json_build_object('canal_id', k.id, 'cliente_id', k.cliente_id, 'cliente_slug', v_slug,
    'phone_number_id', k.phone_number_id, 'waba_id', k.waba_id, 'verify_token', k.verify_token,
    'app_secret', public.nx_segredo_ler(k.app_secret_segredo),
    'tem_token', k.token_segredo is not null, 'status', k.status);
end $$;

create or replace function public.nx_codewords_canal_salvar(p_token text, p_cliente uuid, p_canal jsonb)
returns json language plpgsql security definer set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  c jsonb := coalesce(p_canal, '{}'::jsonb); k public.nx_canais;
  v_id uuid; v_nome text; v_num text; v_service text; v_key text; v_dep uuid;
  v_hook text; v_hash text; v_hook_id uuid; v_base text; v_org uuid; v_rotacionar boolean := false;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  begin v_id := nullif(c ->> 'id', '')::uuid;
  exception when invalid_text_representation then raise exception 'canal_nao_encontrado' using errcode='22023'; end;
  if v_id is not null then
    select * into k from public.nx_canais where id = v_id and cliente_id = p_cliente and provedor = 'codewords' for update;
    if k.id is null then raise exception 'canal_nao_encontrado' using errcode='22023'; end if;
  end if;
  v_nome := left(btrim(coalesce(c ->> 'nome', k.nome, '')), 40);
  if char_length(v_nome) < 1 then raise exception 'dados_invalidos' using errcode='22023', hint='nome'; end if;
  v_num := nullif(left(btrim(coalesce(c ->> 'numero_exibicao', k.numero_exibicao, '')), 30), '');
  if v_num is null or v_num !~ '^\+?[0-9 ()-]{8,30}$' then
    raise exception 'dados_invalidos' using errcode='22023', hint='numero_exibicao';
  end if;
  v_service := coalesce(nullif(btrim(c ->> 'codewords_service_id'), ''), k.codewords_service_id);
  if v_service is null or char_length(v_service) > 120 or v_service !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'dados_invalidos' using errcode='22023', hint='codewords_service_id';
  end if;
  v_key := nullif(btrim(c ->> 'codewords_api_key'), '');
  -- Integração de longa duração exige chave reutilizável. cwotk- é de uso único.
  if v_key is not null and (char_length(v_key) < 20 or char_length(v_key) > 500 or v_key ~ '\s'
       or v_key !~ '^cwk-[^[:space:]]+$') then
    raise exception 'dados_invalidos' using errcode='22023', hint='codewords_api_key';
  end if;
  if v_id is null and v_key is null then
    raise exception 'dados_invalidos' using errcode='22023', hint='codewords_api_key';
  end if;
  begin v_dep := nullif(c ->> 'departamento_id', '')::uuid;
  exception when invalid_text_representation then raise exception 'dados_invalidos' using errcode='22023', hint='departamento_id'; end;
  if c ? 'rotacionar_webhook' then
    begin v_rotacionar := coalesce((c ->> 'rotacionar_webhook')::boolean, false);
    exception when invalid_text_representation then
      raise exception 'dados_invalidos' using errcode='22023', hint='rotacionar_webhook';
    end;
  end if;
  if v_dep is null then
    select d.id into v_dep from public.nx_departamentos d where d.cliente_id=p_cliente and d.padrao and d.ativo limit 1;
  elsif not exists(select 1 from public.nx_departamentos d where d.id=v_dep and d.cliente_id=p_cliente and d.ativo) then
    raise exception 'dados_invalidos' using errcode='22023', hint='departamento_id';
  end if;

  if v_id is null then
    perform public.nx_exigir_limite(p_cliente, 'canais', 1);
    insert into public.nx_canais(cliente_id, tipo, provedor, nome, numero_exibicao, departamento_id,
                                 status, app_inscrito, codewords_service_id)
    values(p_cliente, 'whatsapp_cloud', 'codewords', v_nome, v_num, v_dep, 'pendente', null, v_service)
    returning * into k;
  else
    update public.nx_canais set nome=v_nome, numero_exibicao=v_num, departamento_id=v_dep,
      codewords_service_id=v_service, status=case when v_key is not null or v_service is distinct from k.codewords_service_id then 'pendente' else status end,
      ultimo_erro=case when v_key is not null or v_service is distinct from k.codewords_service_id then null else ultimo_erro end
      where id=v_id returning * into k;
  end if;
  if v_key is not null then
    update public.nx_canais set codewords_api_segredo=public.nx_segredo_gravar(
      k.codewords_api_segredo, v_key, 'nx-cw-api-' || k.id::text) where id=k.id returning * into k;
  end if;
  if k.codewords_hook_segredo is null or v_rotacionar then
    v_hook := encode(extensions.gen_random_bytes(32), 'hex');
    v_hash := encode(extensions.digest(v_hook, 'sha256'), 'hex');
    v_hook_id := public.nx_segredo_gravar(k.codewords_hook_segredo, v_hook, 'nx-cw-hook-' || k.id::text);
    update public.nx_canais set codewords_hook_segredo=v_hook_id, codewords_hook_hash=v_hash where id=k.id returning * into k;
  end if;
  select c0.org_id into v_org from public.nx_clientes c0 where c0.id=p_cliente;
  perform public.nx_auditar(v_org, p_cliente, v.conta_id, case when v_id is null then 'codewords_conectado' else 'codewords_configurado' end,
    jsonb_build_object('canal', k.id, 'service_id', k.codewords_service_id, 'api_key_atualizada', v_key is not null));
  select rtrim(coalesce(nullif(btrim(x.funcoes_url), ''), 'https://dtjznipitihnwmcgpzqh.supabase.co/functions/v1'), '/')
    into v_base from public.nx_config x where x.id=1;
  v_base := coalesce(v_base, 'https://dtjznipitihnwmcgpzqh.supabase.co/functions/v1');
  return json_build_object('canal', public.nx_canal_json(k) - 'webhook',
    'webhook_url', v_base || '/nx-codewords?ch=' || public.nx_segredo_ler(k.codewords_hook_segredo));
end $$;

-- Lookup para evento recebido: nunca devolve API key nem o segredo do webhook.
create or replace function public.nx_codewords_canal(p_chave text)
returns json language plpgsql stable security definer set search_path = ''
as $$
declare k public.nx_canais;
begin
  if p_chave is null or char_length(p_chave) <> 64 or p_chave !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into k from public.nx_canais
   where provedor='codewords' and codewords_hook_hash=encode(extensions.digest(p_chave, 'sha256'), 'hex') limit 1;
  if k.id is null then return null; end if;
  return json_build_object('canal_id', k.id, 'cliente_id', k.cliente_id, 'status', k.status);
end $$;

create or replace function public.nx_codewords_canal_verificado(p_canal uuid, p_cliente uuid, p_ok boolean, p_erro text default null)
returns json language plpgsql security definer set search_path = ''
as $$
declare k public.nx_canais;
begin
  update public.nx_canais set status=case when coalesce(p_ok,false) then 'ativo' else 'erro' end,
    verificado_em=now(), ultimo_erro=case when coalesce(p_ok,false) then null else left(coalesce(p_erro,'falhou'),500) end
   where id=p_canal and cliente_id=p_cliente and provedor='codewords' returning * into k;
  if k.id is null then raise exception 'canal_nao_encontrado' using errcode='22023'; end if;
  return json_build_object('id',k.id,'status',k.status,'verificado_em',k.verificado_em,'ultimo_erro',k.ultimo_erro);
end $$;

-- Recibo antecipado fica pendente até o eco criar a linha em nx_mensagens.
-- A trava por canal+ID serializa o recibo com nx_codewords_saida.
create or replace function public.nx_codewords_status(p_canal uuid, p_id text, p_status text, p_erro text default null)
returns json language plpgsql security definer set search_path = ''
as $$
declare v_cli uuid; v_wamid text; v_msg bigint; v_status text; v_erro text; v_aplicado json;
begin
  if p_id is null or char_length(p_id) not between 1 and 160 or p_id !~ '^[A-Za-z0-9._:-]+$'
     or coalesce(p_status, '') not in ('sent','delivered','read','failed') then
    raise exception 'dados_invalidos' using errcode='22023';
  end if;
  select cliente_id into v_cli from public.nx_canais where id=p_canal and provedor='codewords';
  if v_cli is null then raise exception 'canal_nao_encontrado' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nx-cw:' || p_canal::text || ':' || p_id, 0));
  delete from public.nx_codewords_status_pendentes where expira_em <= clock_timestamp();
  v_wamid := 'cw:' || p_canal::text || ':out:' || p_id;
  select id into v_msg from public.nx_mensagens
   where wamid=v_wamid and canal_id=p_canal and cliente_id=v_cli and direcao='out' for update;
  if v_msg is not null then
    v_aplicado := public.nx_wa_status(p_canal, jsonb_build_array(jsonb_build_object(
      'id',v_wamid,'status',p_status,'erro_texto',case when p_status='failed' then left(p_erro,500) end)));
    return json_build_object('ok',true,'pendente',false,'resultado',v_aplicado);
  end if;
  insert into public.nx_codewords_status_pendentes(canal_id,provider_id,status,erro,expira_em)
  values(p_canal,p_id,p_status,case when p_status='failed' then left(p_erro,500) end,
         clock_timestamp()+interval '7 days')
  on conflict(canal_id,provider_id) do update set
    status = case
      when nx_codewords_status_pendentes.status='read' or excluded.status='read' then 'read'
      when nx_codewords_status_pendentes.status='delivered' or excluded.status='delivered' then 'delivered'
      when nx_codewords_status_pendentes.status='failed' and excluded.status='sent' then 'failed'
      when excluded.status='failed' then 'failed'
      else 'sent' end,
    erro = case
      when nx_codewords_status_pendentes.status in ('delivered','read') or excluded.status in ('delivered','read') then null
      when excluded.status='failed' then excluded.erro
      when nx_codewords_status_pendentes.status='failed' then nx_codewords_status_pendentes.erro
      else null end,
    expira_em=excluded.expira_em
  returning status,erro into v_status,v_erro;
  return json_build_object('ok',true,'pendente',true,'status',v_status);
end $$;

-- Mensagem enviada pelo agente CodeWords: encontra somente a conversa do canal
-- e do telefone informados pelo evento autenticado, depois usa o gravador comum.
create or replace function public.nx_codewords_saida(p_canal uuid, p_msg jsonb)
returns json language plpgsql security definer set search_path = ''
as $$
declare k public.nx_canais; ct public.nx_contatos; cv public.nx_conversas; m jsonb := coalesce(p_msg,'{}'::jsonb);
  v_tel text := left(regexp_replace(coalesce(m->>'wa_id',''), '\D','','g'),20);
  v_id text := btrim(coalesce(m->>'id','')); v_cli uuid; v_text text := left(coalesce(m->>'text',''),4096);
  v_salvo json; v_status text; v_erro text;
begin
  select * into k from public.nx_canais where id=p_canal and provedor='codewords';
  if k.id is null then raise exception 'canal_nao_encontrado' using errcode='22023'; end if;
  v_cli := k.cliente_id;
  if length(v_tel) not between 8 and 15 or char_length(v_id) not between 1 and 160
     or v_id !~ '^[A-Za-z0-9._:-]+$' or btrim(v_text) = '' then
    raise exception 'dados_invalidos' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nx-cw:' || p_canal::text || ':' || v_id, 0));
  select * into ct from public.nx_contatos x where x.cliente_id=v_cli
    and (x.wa_id=v_tel or x.telefone=v_tel or x.tel_chave=public.nx_tel_chave(public.nx_tel_normalizar(v_tel,true)))
   order by (x.wa_id=v_tel) desc, x.id desc limit 1;
  if ct.id is null or ct.bloqueado then return json_build_object('ok',true,'ignorado','contato_sem_conversa'); end if;
  select * into cv from public.nx_conversas x where x.cliente_id=v_cli and x.canal_id=p_canal and x.contato_id=ct.id
   order by (x.status <> 'resolvida') desc, x.ultima_msg_em desc limit 1;
  if cv.id is null then return json_build_object('ok',true,'ignorado','conversa_nao_encontrada'); end if;
  v_salvo := public.nx_cv_saida(null, v_cli, cv.id, jsonb_build_object(
    'tipo','texto','corpo',v_text,'wamid','cw:'||p_canal::text||':out:'||v_id,
    'status','enviada','origem','ia'));
  select status,erro into v_status,v_erro from public.nx_codewords_status_pendentes
   where canal_id=p_canal and provider_id=v_id and expira_em>clock_timestamp() for update;
  if found then
    perform public.nx_wa_status(p_canal, jsonb_build_array(jsonb_build_object(
      'id','cw:'||p_canal::text||':out:'||v_id,'status',v_status,'erro_texto',v_erro)));
    delete from public.nx_codewords_status_pendentes where canal_id=p_canal and provider_id=v_id;
  end if;
  delete from public.nx_codewords_status_pendentes where canal_id=p_canal and expira_em<=clock_timestamp();
  return v_salvo;
end $$;

create or replace function public.nx_canal_excluir(p_token text, p_cliente uuid, p_id uuid, p_confirmacao text)
returns json language plpgsql security definer set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token,p_cliente,'admin'); k public.nx_canais; v_org uuid;
begin
  perform public.nx_exigir_modulo(p_cliente,'conversas');
  select * into k from public.nx_canais where id=p_id and cliente_id=p_cliente for update;
  if k.id is null then raise exception 'canal_nao_encontrado' using errcode='22023'; end if;
  if coalesce(lower(btrim(p_confirmacao)),'') <> 'excluir' then raise exception 'dados_invalidos' using errcode='22023', hint='confirmacao'; end if;
  delete from public.nx_canais where id=k.id;
  delete from vault.secrets s where s.id in (k.token_segredo,k.app_secret_segredo,k.codewords_api_segredo,k.codewords_hook_segredo);
  perform set_config('nx.sem_gatilho_canal','1',true);
  update public.nx_clientes set wa_phone_number_id=null where id=p_cliente and wa_phone_number_id=k.phone_number_id;
  perform set_config('nx.sem_gatilho_canal','',true);
  select c.org_id into v_org from public.nx_clientes c where c.id=p_cliente;
  perform public.nx_auditar(v_org,p_cliente,v.conta_id,'canal_excluido',jsonb_build_object('canal',k.id,'provedor',k.provedor));
  return json_build_object('ok',true);
end $$;

-- A função pública nx_wa_canal continua restrita ao transporte Meta.
revoke all on function public.nx_codewords_canal_salvar(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.nx_codewords_canal_salvar(text,uuid,jsonb) to anon, authenticated, service_role;
revoke all on function public.nx_codewords_canal(text) from public, anon, authenticated;
grant execute on function public.nx_codewords_canal(text) to service_role;
revoke all on function public.nx_codewords_canal_verificado(uuid,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.nx_codewords_canal_verificado(uuid,uuid,boolean,text) to service_role;
revoke all on function public.nx_codewords_status(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.nx_codewords_status(uuid,text,text,text) to service_role;
revoke all on function public.nx_codewords_saida(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.nx_codewords_saida(uuid,jsonb) to service_role;
revoke all on function public.nx_cv_base(text,uuid) from public, anon, authenticated;
grant execute on function public.nx_cv_base(text,uuid) to anon, authenticated, service_role;
revoke all on function public.nx_canal_credencial(uuid,uuid) from public, anon, authenticated;
grant execute on function public.nx_canal_credencial(uuid,uuid) to service_role;
revoke all on function public.nx_wa_canal(text,text) from public, anon, authenticated;
grant execute on function public.nx_wa_canal(text,text) to service_role;
revoke all on function public.nx_canal_excluir(text,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.nx_canal_excluir(text,uuid,uuid,text) to anon, authenticated, service_role;
