-- ============================================================
-- ÓRBITA — 20261008b_operacao_seguranca.sql · plano «100+ melhorias» de 08/10/2026 · frente S-B (banco), migração b
-- Operação e segurança: acessos, segredos, login, sessão, número de WhatsApp (histórico/vigia/contadores), fila, nota,
-- pulso, faxina, permissões. ADITIVA e idempotente: create or replace, if not exists, do $$ … $$ com checagem; nenhuma
-- assinatura de função existente muda (a única função NOVA com o mesmo nome é nx_cv_nota de 5 argumentos, sem default no
-- p_req, como as de 20261002c); nenhum dado de produção é alterado.
--
-- Por quê (mapa H/C/D/G/B, contratos 3, 8, 9, 10, 11 e 12 do plano):
--   S-B16 [C110] nx_hash, nx_conta_do_token e nx_exigir_gestor com search_path = '' (eram as últimas com 'public','extensions');
--         [C111] índice nx_sessoes(expira_em) e purga das sessões vencidas na faxina (não mais no login).
--   S-B9  [H8] nx_login_falhas + nx_entrar: 10 falhas em 15 min por conta (e-mail normalizado) ou por IP (x-forwarded-for) →
--         erro muitas_tentativas com hint = minutos; o bloqueio nunca passa de 15 min (falha não é gravada enquanto bloqueado);
--         nx_criar_conta: 5 por hora por IP. [H7] nx_sessao renova a sessão como nx_app_sessao e diz se a conta é super.
--         COMO a falha sobrevive: nx_entrar continua LANÇANDO credenciais_invalidas quando chamada por SQL (smokes 03/13 e o
--         ensaio pelo MCP); pelo PostgREST (request.headers presente) a falha é gravada e a resposta é o MESMO JSON de erro que
--         o PostgREST mandaria ({code, message, details, hint}) com response.status 400 — a transação COMMITA e a falha fica.
--         Um raise desfaria a linha gravada (é o motivo de «fica para o gateway» em 20261001b).
--   S-B10 [H5] nx_app_sessao e nx_sessao devolvem clientes[].ativo (interruptor da Nexus) e migracao (última linha de
--         nx_versao_banco, criada na migração a); conta operacional (papel clinica) só com clientes ativo = false → cliente_pausado.
--   S-B7  [H1] nx_conta_definir só apaga acessos DENTRO do escopo do chamador (nx_pode) e grava o papel do acesso novo
--         explicitamente (o que a conta já tem em outro cliente; senão 'admin', o que o clássico sempre quis dizer).
--         nx_contas_listar devolve «origem» ('orbita' | 'plataforma') para o clássico esconder os usuários do Órbita (P8).
--   S-B8  [H3] nx_config_salvar: segredo com null EXPLÍCITO apaga ('' continua mantendo); auditoria com os NOMES das chaves.
--   S-B11 [S10][B71] nx_canal_historico + nx_canal_historico_listar; nx_codewords_situacao grava uma linha quando o estado
--         (conectado/desconectado/desconhecido) muda e notifica os admins (canal_caiu/canal_voltou, com nx_notificacoes.dados =
--         {canal_id, canal_nome, estado} — coluna nova, devolvida por nx_notificacoes_listar); nx_codewords_vigia_alvos;
--         nx_canais.codewords_aviso_em e codewords_contadores + nx_codewords_contar (eco, grupo, lid, payload_desconhecido,
--         http_422, http_413); nx_canal_json expõe contadores e aviso_em dentro de «codewords».
--   S-B12 [D143] nx_fila_concluir('pendente') adia enviar_em (1, 5, 15, 60 min pela tentativa) e zera lote/pego_em.
--   S-B13 [G251] nx_cv_nota(p_token, p_cliente, p_conversa, p_texto, p_req) idempotente por 24 h (nx_requisicoes).
--   S-B16 [H309] nx_pulso.nao_lidas (conversas não lidas visíveis, a MESMA conta de nx_cv_listar.contagens);
--         [C100][C114] nx_saas_faxina só apaga transitórios: sessões vencidas, nx_requisicoes > 7 d, nx_envio_refs > 7 d,
--         notificações lidas > 90 d, nx_codewords_status_pendentes vencidos, nx_login_falhas > 1 d, cron.job_run_details de
--         TODOS os jobs (> 3 d). Mensagens, histórico e auditoria continuam para sempre (decisão 6).
--   S-B17 [C106] revoke execute de authenticated (e do PUBLIC implícito) em todas as nx_*, preservando anon/service_role.
--   Pedidos da S-F: nx_config.meta_api_versao (só a coluna) [F211]; nx_mensagens.status ganha 'sem_confirmacao' [D144];
--         nx_codewords_origem grava a plataforma da fonte contada (instagram/facebook → meta, google → google) [A29].
--   Os CHECKs trocados (nx_notificacoes.tipo, nx_mensagens.status) entram NOT VALID: são superconjuntos dos anteriores, então
--   as linhas existentes já cumprem — sem varredura longa sob ACCESS EXCLUSIVE.
-- Smoke: supabase/testes/20_operacao_seguranca.sql (begin … rollback; termina em 'OK_20_…'). Falha antes desta migração.
-- Erros em português: errcode 22023 + hint. Toda função: security definer + set search_path = ''.
-- ============================================================

-- ------------------------------------------------------------
-- 1. S-B16 [C110] search_path = '' nas três funções que ainda usavam 'public','extensions' (corpo igual, schema explícito)
-- ------------------------------------------------------------
create or replace function public.nx_hash(p text)
returns text
language sql immutable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(coalesce(p, ''), 'sha256'), 'hex')
$$;

create or replace function public.nx_conta_do_token(p_token text)
returns public.nx_contas
language plpgsql
security definer
set search_path = ''
as $$
declare c public.nx_contas;
begin
  select ct.* into c
    from public.nx_sessoes s join public.nx_contas ct on ct.id = s.conta_id
   where s.token_hash = public.nx_hash(p_token) and s.expira_em > now();
  if c.id is null then raise exception 'sessao_invalida' using errcode = '28000'; end if;
  if not c.aprovado then raise exception 'conta_pendente' using errcode = '28000'; end if;
  return c;
end $$;

create or replace function public.nx_exigir_gestor(p_token text)
returns public.nx_contas
language plpgsql
security definer
set search_path = ''
as $$
declare c public.nx_contas := public.nx_conta_do_token(p_token);
begin
  if c.papel <> 'gestor' then raise exception 'so_gestor' using errcode = '42501'; end if;
  return c;
end $$;

-- [C111] a purga das vencidas sai do login e vai para a faxina; o índice deixa as duas leituras baratas
create index if not exists nx_sessoes_expira on public.nx_sessoes (expira_em);

-- ------------------------------------------------------------
-- 2. S-B9 [H8] falhas de login e limites de nx_entrar / nx_criar_conta
-- ------------------------------------------------------------
create table if not exists public.nx_login_falhas (
  id bigint generated always as identity primary key,
  chave text not null check (char_length(chave) between 4 and 200),   -- 'conta:<e-mail>' | 'ip:<ip>' | 'cadastro:<ip>'
  em timestamptz not null default now()
);
create index if not exists nx_login_falhas_chave on public.nx_login_falhas (chave, em desc);
alter table public.nx_login_falhas enable row level security;
revoke all on table public.nx_login_falhas from public, anon, authenticated;
grant select, insert, delete on table public.nx_login_falhas to service_role;

-- IP de quem chama: 1º endereço do x-forwarded-for que o PostgREST entrega em request.headers. Fora do PostgREST (smoke,
-- MCP, cron) não há cabeçalho → null, e o limite por IP simplesmente não se aplica.
create or replace function public.nx_login_ip()
returns text
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_h text := nullif(current_setting('request.headers', true), ''); v text;
begin
  if v_h is null then return null; end if;
  begin
    v := nullif(btrim(split_part(coalesce(v_h::json ->> 'x-forwarded-for', ''), ',', 1)), '');
  exception when others then
    return null;
  end;
  return left(v, 64);
end $$;

-- Minutos que ainda faltam para a chave sair do bloqueio (0 = livre): p_max falhas dentro de p_janela.
-- O bloqueio acaba quando a MAIS ANTIGA das últimas p_max falhas sai da janela: nunca mais que p_janela depois dela.
create or replace function public.nx_login_bloqueio(p_chave text, p_max int, p_janela interval)
returns int
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_n int; v_antiga timestamptz;
begin
  if p_chave is null then return 0; end if;
  select count(*), min(x.em) into v_n, v_antiga
    from (select f.em from public.nx_login_falhas f
           where f.chave = p_chave and f.em > now() - p_janela
           order by f.em desc limit p_max) x;
  if coalesce(v_n, 0) < p_max then return 0; end if;
  return greatest(ceil(extract(epoch from (v_antiga + p_janela - now())) / 60.0)::int, 1);
end $$;

create or replace function public.nx_login_falha_registrar(p_chaves text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.nx_login_falhas (chave)
  select left(k, 200) from unnest(coalesce(p_chaves, '{}'::text[])) k where coalesce(k, '') <> '';
end $$;

-- nx_entrar: cópia de 20261001b (bloco 24) + bloqueio por tentativas. MESMA assinatura e MESMOS erros.
--   · 10 falhas em 15 min por conta (e-mail normalizado) OU por IP → 'muitas_tentativas', hint = minutos (1…15);
--   · enquanto bloqueado nada é gravado (o bloqueio de uma conta — gestor ou super inclusive — nunca passa de 15 min);
--   · via PostgREST a falha de senha é gravada e devolvida como o JSON de erro padrão com status 400 (ver cabeçalho);
--   · por SQL continua lançando 'credenciais_invalidas' (contrato dos smokes 03 e 13);
--   · a purga das sessões vencidas saiu daqui (faxina, com índice).
create or replace function public.nx_entrar(p_email text, p_senha text)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
declare
  c public.nx_contas; v_token text;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_ip text := public.nx_login_ip();
  v_rest boolean := nullif(current_setting('request.headers', true), '') is not null;   -- chamada pelo PostgREST?
  v_min int;
begin
  -- 1. bloqueio ANTES de qualquer custo (bcrypt/pg_sleep): por conta e por IP
  v_min := greatest(public.nx_login_bloqueio('conta:' || v_email, 10, interval '15 minutes'),
                    case when v_ip is null then 0 else public.nx_login_bloqueio('ip:' || v_ip, 10, interval '15 minutes') end);
  if v_min > 0 then
    raise exception 'muitas_tentativas' using errcode = '22023', hint = v_min::text;
  end if;

  select * into c from public.nx_contas where email = v_email;
  -- e-mail inexistente também paga uma verificação bcrypt (mesmo custo das contas), senão o tempo entrega quais e-mails existem
  if c.id is null then perform extensions.crypt(coalesce(p_senha, ''), extensions.gen_salt('bf', 10)); end if;
  if c.id is null or c.senha_hash <> extensions.crypt(coalesce(p_senha, ''), c.senha_hash) then
    perform pg_sleep(0.4);
    if v_rest then
      -- 2. a falha fica gravada (a transação commita) e o front recebe exatamente o que receberia de um raise
      perform public.nx_login_falha_registrar(array_remove(array['conta:' || v_email, case when v_ip is not null then 'ip:' || v_ip end], null));
      perform set_config('response.status', '400', true);
      return json_build_object('code', 'P0001', 'message', 'credenciais_invalidas', 'details', null, 'hint', null);
    end if;
    raise exception 'credenciais_invalidas';
  end if;
  if not c.aprovado then raise exception 'conta_pendente'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(v_token), c.id, now() + interval '30 days');
  return json_build_object('token', v_token, 'nome', c.nome, 'papel', c.papel);
end $function$;

-- nx_criar_conta: cópia de 20260926 + 5 cadastros por hora por IP (decisão 7: o cadastro público continua, com limite).
create or replace function public.nx_criar_conta(p_email text, p_senha text, p_nome text, p_codigo text default null::text)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text := lower(trim(coalesce(p_email, ''))); v_primeira boolean; v_codigo text;
  v_ip text := public.nx_login_ip(); v_min int;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido'; end if;
  if length(coalesce(p_senha, '')) < 8 then raise exception 'senha_curta'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'nome_invalido'; end if;
  if v_ip is not null then
    v_min := public.nx_login_bloqueio('cadastro:' || v_ip, 5, interval '1 hour');
    if v_min > 0 then raise exception 'muitas_tentativas' using errcode = '22023', hint = v_min::text; end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('nx_criar_conta'));
  select not exists (select 1 from public.nx_contas) into v_primeira;
  if exists (select 1 from public.nx_contas where email = v_email) then raise exception 'email_em_uso'; end if;
  if v_primeira then
    -- a PRIMEIRA conta vira gestor, mas só com o código de ativação: quem achar a URL antes do dono não vira dono
    select codigo_gestor into v_codigo from public.nx_config where id = 1;
    if upper(trim(coalesce(p_codigo, ''))) <> v_codigo then raise exception 'codigo_invalido'; end if;
  end if;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado)
  values (v_email, trim(p_nome), extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
          case when v_primeira then 'gestor' else 'clinica' end, v_primeira);
  -- o cadastro que deu certo conta no limite do IP (a transação commita)
  if v_ip is not null then perform public.nx_login_falha_registrar(array['cadastro:' || v_ip]); end if;
  return json_build_object('ok', true, 'papel', case when v_primeira then 'gestor' else 'clinica' end, 'aprovado', v_primeira);
end $function$;

-- ------------------------------------------------------------
-- 3. S-B10 [H5] + S-B9 [H7]: versão do banco, cliente pausado, nx_sessao e nx_app_sessao
-- ------------------------------------------------------------
-- última migração aplicada (cada migração desta rodada grava a sua em nx_versao_banco)
create or replace function public.nx_versao_atual()
returns text
language sql stable
security definer
set search_path = ''
as $$
  select max(x.nome) from public.nx_versao_banco x
$$;

-- conta OPERACIONAL (papel clinica) cujos clientes estão TODOS com ativo = false não entra: 'cliente_pausado' (contrato 9).
-- gestor/super sempre entram (veem o interruptor desligado em clientes[].ativo e no Admin).
create or replace function public.nx_cliente_pausado_checar(p_conta public.nx_contas)
returns void
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if p_conta.id is null or p_conta.papel = 'gestor' then return; end if;
  if exists (select 1 from public.nx_acessos a where a.conta_id = p_conta.id)
     and not exists (select 1 from public.nx_acessos a join public.nx_clientes x on x.id = a.cliente_id
                      where a.conta_id = p_conta.id and x.ativo) then
    raise exception 'cliente_pausado' using errcode = '22023',
      hint = 'A conta desta empresa está pausada pela Nexus. Fale com o suporte.';
  end if;
end $$;

-- nx_sessao (clássico): cópia de 20260928b + renovação por uso (a MESMA linha de nx_app_sessao, M17), conta.super,
-- migracao e cliente_pausado. clientes[].ativo já vinha.
create or replace function public.nx_sessao(p_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
declare c public.nx_contas := public.nx_conta_do_token(p_token);
begin
  update public.nx_contas set ultimo_acesso = now() where id = c.id;
  update public.nx_sessoes set expira_em = now() + interval '30 days'
   where token_hash = public.nx_hash(p_token) and expira_em < now() + interval '20 days';
  perform public.nx_cliente_pausado_checar(c);
  return json_build_object(
    'conta', json_build_object('id', c.id, 'nome', c.nome, 'email', c.email, 'papel', c.papel, 'super', public.nx_super(c)),
    'migracao', public.nx_versao_atual(),
    'clientes', coalesce((
      select json_agg(json_build_object('id', x.id, 'slug', x.slug, 'nome', x.nome, 'ativo', x.ativo,
                                        'cfg', public.nx_cfg_publico(x.cfg, public.nx_papel_em(c, x.id), 'sessao'))
                      order by x.nome)
        from public.nx_clientes x where public.nx_pode(c, x.id)), '[]'::json));
end $function$;

-- nx_app_sessao: cópia de 20261002b + clientes[].ativo, migracao e cliente_pausado (contrato 9)
create or replace function public.nx_app_sessao(p_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.nx_contas := public.nx_conta_do_token(p_token);
  v_super boolean;
  o public.nx_orgs;
  v_padrao text;
begin
  update public.nx_contas set ultimo_acesso = now() where id = c.id;
  -- M17: renova só quando faltam menos de 20 dias (uma escrita a cada ~10 dias, não a cada abertura)
  update public.nx_sessoes set expira_em = now() + interval '30 days'
   where token_hash = public.nx_hash(p_token) and expira_em < now() + interval '20 days';
  perform public.nx_cliente_pausado_checar(c);
  v_super := public.nx_super(c);
  select * into o from public.nx_orgs where id = c.org_id;
  select nullif(btrim(x.saas_url), '') into v_padrao from public.nx_config x where x.id = 1;
  return json_build_object(
    'conta', json_build_object('id', c.id, 'nome', c.nome, 'email', c.email, 'papel', c.papel, 'org_id', c.org_id,
                               'super', v_super, 'telefone', c.telefone, 'trocar_senha', c.trocar_senha),
    'org', case when o.id is null then null
                else json_build_object('id', o.id, 'slug', o.slug, 'nome', o.nome, 'tipo', o.tipo,
                                       'marca', o.marca - 'logo' - 'logo_claro' - 'favicon',
                                       -- assinatura curta das imagens (que não vêm aqui): troca de logo derruba o cache do navegador
                                       'img_hash', left(md5(coalesce(o.marca ->> 'logo', '') || '|' || coalesce(o.marca ->> 'logo_claro', '')
                                                            || '|' || coalesce(o.marca ->> 'favicon', '')), 10)) end,
    'link_base_padrao', v_padrao,
    'migracao', public.nx_versao_atual(),
    'modulos_plano', (select json_object_agg(pp.id, pp.modulos) from public.nx_planos pp),
    'clientes', coalesce((
      select json_agg(json_strip_nulls(json_build_object(
               'id', x.id, 'slug', x.slug, 'nome', x.nome, 'status', nullif(x.status, 'ativo'), 'teste_ate', x.teste_ate,
               'plano', x.plano, 'ativo', coalesce(x.ativo, true),
               'modulos', case when pl.modulos is null or not (x.modulos @> pl.modulos and x.modulos <@ pl.modulos)
                               then x.modulos end,
               'vertical', x.vertical, 'papel', p.papel,
               'tem_tema', case when x.tema <> '{}'::jsonb or x.cfg ? 'corMarca' or x.cfg ? 'logoUrl' then true end,
               'tema_hash', case when x.tema <> '{}'::jsonb or x.cfg ? 'corMarca' or x.cfg ? 'logoUrl'
                                 then public.nx_tema_hash(x.tema, x.cfg) end,
               'link_base', nullif(public.nx_link_base(x.id), v_padrao),
               'proprio', case when p.papel in ('gestor', 'super') and a.conta_id is not null then true end,
               'org_nome', case when v_super and x.org_id is distinct from c.org_id then xo.nome end))
             order by x.nome)
        from public.nx_clientes x
        cross join lateral (select public.nx_papel_em(c, x.id) as papel) p
        left join public.nx_acessos a on a.conta_id = c.id and a.cliente_id = x.id
        left join public.nx_orgs xo on xo.id = x.org_id
        left join public.nx_planos pl on pl.id = x.plano
       where p.papel is not null), '[]'::json));
end $$;

-- ------------------------------------------------------------
-- 4. S-B7 [H1] nx_conta_definir: cópia de 20261001b + delete restrito ao escopo + papel explícito do acesso novo
-- ------------------------------------------------------------
create or replace function public.nx_conta_definir(p_token text, p_conta uuid, p_aprovado boolean, p_papel text, p_clientes uuid[])
returns json
language plpgsql
security definer
set search_path = ''
as $function$
declare
  c public.nx_contas := public.nx_exigir_gestor(p_token);
  v_super boolean := public.nx_super(c);
  alvo public.nx_contas;
  v_cli uuid; v_papel_acesso text; v_removidos int := 0; v_novos int := 0;
begin
  if p_papel is null or p_papel not in ('gestor', 'clinica') then raise exception 'papel_invalido'; end if;
  if p_conta = c.id and (p_papel <> 'gestor' or p_aprovado is false) then raise exception 'nao_pode_rebaixar_a_si'; end if;
  select * into alvo from public.nx_contas where id = p_conta;
  if alvo.id is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'conta'; end if;
  if not v_super then
    if not public.nx_conta_no_escopo(c, p_conta, null) then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
    if p_papel = 'gestor' and alvo.org_id is distinct from c.org_id then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
  end if;
  foreach v_cli in array coalesce(p_clientes, '{}'::uuid[]) loop
    if not public.nx_pode(c, v_cli) then raise exception 'sem_acesso' using errcode = '42501'; end if;
  end loop;
  update public.nx_contas set aprovado = coalesce(p_aprovado, aprovado), papel = p_papel where id = p_conta;
  -- só sai o acesso que o CHAMADOR enxerga (nx_pode): o clássico manda a lista já filtrada pela org do gestor, e um acesso da
  -- conta a cliente de OUTRA org (dado pela Nexus) ficava apagado em silêncio
  delete from public.nx_acessos a
   where a.conta_id = p_conta
     and not (a.cliente_id = any(coalesce(p_clientes, '{}'::uuid[])))
     and public.nx_pode(c, a.cliente_id);
  get diagnostics v_removidos = row_count;
  -- papel EXPLÍCITO do acesso novo: o que a conta já tem em outro cliente (o mais recente); sem nenhum, 'admin' — o que
  -- «Clínica — vê os clientes marcados» do clássico sempre quis dizer. Acesso que continua mantém papel e departamentos.
  select a.papel into v_papel_acesso from public.nx_acessos a where a.conta_id = p_conta order by a.criado_em desc, a.cliente_id limit 1;
  -- um a um: o limite 'usuarios' (cliente e soma da org) conta os que já entraram nesta chamada
  foreach v_cli in array coalesce(p_clientes, '{}'::uuid[]) loop
    if not exists (select 1 from public.nx_acessos a where a.conta_id = p_conta and a.cliente_id = v_cli) then
      if not v_super then perform public.nx_exigir_limite(v_cli, 'usuarios', 1); end if;
      insert into public.nx_acessos (conta_id, cliente_id, papel) values (p_conta, v_cli, coalesce(v_papel_acesso, 'admin'))
      on conflict do nothing;
      v_novos := v_novos + 1;
    end if;
  end loop;
  if p_aprovado is false then delete from public.nx_sessoes where conta_id = p_conta; end if;
  perform public.nx_auditar(alvo.org_id, null, c.id, 'conta_definida',
    jsonb_build_object('conta', p_conta, 'papel', p_papel, 'aprovado', coalesce(p_aprovado, alvo.aprovado),
                       'clientes', to_jsonb(coalesce(p_clientes, '{}'::uuid[])),
                       'removidos', v_removidos, 'novos', v_novos, 'papel_acesso', coalesce(v_papel_acesso, 'admin')));
  return public.nx_contas_listar(p_token);
end $function$;

-- nx_contas_listar: cópia de 20260928b + «origem» (pedido da frente P, P8 [H303]): 'orbita' = usuário que o Órbita administra
-- (entrou por convite, ou tem acesso com papel/departamentos/visão que o clássico não conhece); 'plataforma' = gestor da Nexus
-- ou «clínica» do clássico (acesso admin, sem departamento, vê tudo). O clássico tira as 'orbita' da tela Contas de acesso.
create or replace function public.nx_contas_listar(p_token text)
 returns json
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare c public.nx_contas := public.nx_exigir_gestor(p_token); v_super boolean := public.nx_super(c);
begin
  return coalesce((
    select json_agg(json_build_object('id', x.id, 'nome', x.nome, 'email', x.email, 'papel', x.papel, 'aprovado', x.aprovado,
             'criado_em', x.criado_em,
             'origem', case when x.papel <> 'gestor'
                             and (exists (select 1 from public.nx_convites cv where cv.usado_por = x.id)
                                  or exists (select 1 from public.nx_acessos a
                                              where a.conta_id = x.id
                                                and (a.papel <> 'admin' or cardinality(a.departamentos) > 0 or not a.ver_todas)))
                            then 'orbita' else 'plataforma' end,
             'clientes', coalesce((select json_agg(a.cliente_id) from public.nx_acessos a
                                    where a.conta_id = x.id
                                      and (v_super or exists (select 1 from public.nx_clientes k
                                                               where k.id = a.cliente_id and k.org_id = c.org_id))), '[]'::json))
             order by x.aprovado, x.criado_em desc)
      from public.nx_contas x
     where v_super
        or x.org_id = c.org_id
        or exists (select 1 from public.nx_acessos a join public.nx_clientes k on k.id = a.cliente_id
                    where a.conta_id = x.id and k.org_id = c.org_id)), '[]'::json);
end $function$;

-- ------------------------------------------------------------
-- 5. S-B8 [H3] nx_config_salvar: cópia de 20260928b + null explícito apaga o segredo + auditoria (nomes das chaves, nunca valores)
-- ------------------------------------------------------------
create or replace function public.nx_config_salvar(p_token text, p_cfg jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
declare c public.nx_contas := public.nx_exigir_gestor(p_token);
  v_apagadas text[] := '{}'::text[]; v_chaves text[];
begin
  if not public.nx_super(c) then raise exception 'so_plataforma' using errcode = '42501'; end if;
  if jsonb_typeof(p_cfg) is distinct from 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'cfg'; end if;
  if nullif(p_cfg->>'modelo_ia', '') is not null and p_cfg->>'modelo_ia' !~ '^[a-z0-9][a-z0-9._:-]{2,80}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'modelo_ia';
  end if;
  -- segredo: null EXPLÍCITO ("anthropic_api_key": null) apaga; '' ou chave ausente mantém o atual; valor troca
  if jsonb_typeof(p_cfg->'anthropic_api_key') = 'null' then v_apagadas := array_append(v_apagadas, 'anthropic_api_key'); end if;
  if jsonb_typeof(p_cfg->'wa_access_token') = 'null' then v_apagadas := array_append(v_apagadas, 'wa_access_token'); end if;
  if jsonb_typeof(p_cfg->'meta_app_secret') = 'null' then v_apagadas := array_append(v_apagadas, 'meta_app_secret'); end if;
  update public.nx_config set
    wa_access_token    = case when jsonb_typeof(p_cfg->'wa_access_token') = 'null' then null
                              else coalesce(nullif(p_cfg->>'wa_access_token', ''), wa_access_token) end,
    wa_phone_number_id = case when p_cfg ? 'wa_phone_number_id' then nullif(p_cfg->>'wa_phone_number_id', '') else wa_phone_number_id end,
    wa_template        = case when p_cfg ? 'wa_template' then nullif(p_cfg->>'wa_template', '') else wa_template end,
    meta_app_secret    = case when jsonb_typeof(p_cfg->'meta_app_secret') = 'null' then null
                              else coalesce(nullif(p_cfg->>'meta_app_secret', ''), meta_app_secret) end,
    anthropic_api_key  = case when jsonb_typeof(p_cfg->'anthropic_api_key') = 'null' then null
                              else coalesce(nullif(p_cfg->>'anthropic_api_key', ''), anthropic_api_key) end,
    modelo_ia          = coalesce(nullif(p_cfg->>'modelo_ia', ''), modelo_ia),
    painel_url         = case when p_cfg ? 'painel_url' then nullif(p_cfg->>'painel_url', '') else painel_url end,
    google_api_versao  = case when p_cfg ? 'google_api_versao' then nullif(p_cfg->>'google_api_versao', '') else google_api_versao end,
    saas_url           = case when p_cfg ? 'saas_url' then nullif(p_cfg->>'saas_url', '') else saas_url end,
    atualizado_em      = now()
  where id = 1;
  select array_agg(k order by k) into v_chaves from jsonb_object_keys(p_cfg) k;
  perform public.nx_auditar(c.org_id, null, c.id, case when cardinality(v_apagadas) > 0 then 'config_segredo_removido' else 'config_salva' end,
    jsonb_build_object('chaves', to_jsonb(coalesce(v_chaves, '{}'::text[])), 'apagadas', to_jsonb(v_apagadas)));
  return public.nx_config_ver(p_token);
end $function$;

-- ------------------------------------------------------------
-- 6. S-B11 (contrato 3): histórico do número, notificação, vigia, contadores
-- ------------------------------------------------------------
create table if not exists public.nx_canal_historico (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.nx_clientes(id) on delete cascade,
  canal_id uuid not null references public.nx_canais(id) on delete cascade,
  estado text not null check (estado in ('conectado', 'desconectado', 'desconhecido')),
  detalhe text check (char_length(detalhe) <= 500),
  em timestamptz not null default now()
);
create index if not exists nx_canal_historico_canal on public.nx_canal_historico (canal_id, em desc);
alter table public.nx_canal_historico enable row level security;
revoke all on table public.nx_canal_historico from public, anon, authenticated;
grant select, insert, delete on table public.nx_canal_historico to service_role;

alter table public.nx_canais
  add column if not exists codewords_aviso_em timestamptz,                               -- último aviso «aparelho caído» ao gestor
  add column if not exists codewords_contadores jsonb not null default '{}'::jsonb;     -- {eco, grupo, lid, payload_desconhecido, http_422, http_413, desde}

-- notificações ganham os tipos canal_caiu / canal_voltou (troca do CHECK, sem tocar em linha nenhuma)
do $$
declare r record;
begin
  for r in select c.conname from pg_constraint c
            where c.conrelid = 'public.nx_notificacoes'::regclass and c.contype = 'c'
              and pg_get_constraintdef(c.oid) like '%''lead_anuncio''%' and pg_get_constraintdef(c.oid) not like '%''canal_caiu''%' loop
    execute format('alter table public.nx_notificacoes drop constraint %I', r.conname);
  end loop;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.nx_notificacoes'::regclass and c.conname = 'nx_notificacoes_tipo_check') then
    alter table public.nx_notificacoes add constraint nx_notificacoes_tipo_check
      check (tipo in ('atribuida', 'sem_resposta', 'tarefa', 'sla_etapa', 'automacao', 'lead_anuncio', 'mencao', 'sistema',
                      'canal_caiu', 'canal_voltou')) not valid;   -- superconjunto do CHECK anterior: nada a validar
  end if;
end $$;

-- dados estruturados da notificação (pedido da frente A): canal_caiu/canal_voltou levam {canal_id, canal_nome, estado} — o
-- shell junta caiu × voltou do MESMO número pelo canal_id (os títulos são diferentes). Coluna nula, sem default: só metadado.
alter table public.nx_notificacoes add column if not exists dados jsonb;

-- Sino: cópia de 20260928c_plataforma_b + «dados» em cada item (MESMA assinatura)
create or replace function public.nx_notificacoes_listar(p_token text, p_cliente uuid, p_limite int default 30)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
begin
  return json_build_object(
    'itens', coalesce((
      select json_agg(json_build_object('id', n.id, 'tipo', n.tipo, 'titulo', n.titulo, 'corpo', n.corpo, 'link', n.link,
                                        'lida_em', n.lida_em, 'criado_em', n.criado_em, 'dados', n.dados) order by n.criado_em desc, n.id desc)
        from (select * from public.nx_notificacoes n
               where n.cliente_id = p_cliente and n.conta_id = v.conta_id
               order by n.criado_em desc, n.id desc
               limit least(greatest(coalesce(p_limite, 30), 1), 100)) n), '[]'::json),
    'nao_lidas', (select count(*) from public.nx_notificacoes n
                   where n.cliente_id = p_cliente and n.conta_id = v.conta_id and n.lida_em is null));
end $$;

-- estado derivado de um canal: conectado | desconectado | desconhecido (CodeWords pelo aparelho; Meta pelo status do número)
create or replace function public.nx_canal_estado(k public.nx_canais)
returns text
language sql immutable
security definer
set search_path = ''
as $$
  select case
    when coalesce(k.provedor, 'meta') = 'codewords' then
      case when k.codewords_conectado then 'conectado' when k.codewords_conectado is false then 'desconectado' else 'desconhecido' end
    else case k.status when 'ativo' then 'conectado' when 'erro' then 'desconectado' else 'desconhecido' end
  end
$$;

-- Grava a mudança de estado (uma linha por mudança; a 1ª leitura também grava, para existir o «desde») e avisa os admins:
-- conectado → desconectado = canal_caiu · desconectado → conectado = canal_voltou. Bate o pulso do cliente.
create or replace function public.nx_canal_historico_gravar(p_canal uuid, p_cliente uuid, p_antes text, p_depois text, p_detalhe text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_nome text; v_tem boolean; v_tipo text;
begin
  if p_depois is null then return false; end if;
  v_tem := exists (select 1 from public.nx_canal_historico h where h.canal_id = p_canal);
  if v_tem and p_depois is not distinct from p_antes then return false; end if;
  insert into public.nx_canal_historico (cliente_id, canal_id, estado, detalhe)
  values (p_cliente, p_canal, p_depois, left(nullif(btrim(coalesce(p_detalhe, '')), ''), 500));
  select k.nome into v_nome from public.nx_canais k where k.id = p_canal;
  if v_tem and p_antes = 'conectado' and p_depois = 'desconectado' then
    v_tipo := 'canal_caiu';
    perform public.nx_notificar(p_cliente, null, 'canal_caiu', left(coalesce(v_nome, 'Número') || ': número desconectado', 120),
      'O aparelho perdeu a conexão com o WhatsApp. Pareie ou reconecte pelo celular.', '#/config/numeros');
  elsif v_tem and p_antes = 'desconectado' and p_depois = 'conectado' then
    v_tipo := 'canal_voltou';
    perform public.nx_notificar(p_cliente, null, 'canal_voltou', left(coalesce(v_nome, 'Número') || ': número voltou', 120),
      'O aparelho reconectou e já recebe mensagens.', '#/config/numeros');
  end if;
  if v_tipo is not null then
    -- as linhas que o nx_notificar acabou de criar (mesma transação = mesmo now(); dados ainda nulo) ganham o canal
    update public.nx_notificacoes n set dados = jsonb_build_object('canal_id', p_canal, 'canal_nome', v_nome, 'estado', p_depois)
     where n.cliente_id = p_cliente and n.tipo = v_tipo and n.criado_em = now() and n.dados is null;
  end if;
  begin
    perform public.nx_pulso_bater(p_cliente);
  exception when others then null;
  end;
  return true;
end $$;

-- nx_codewords_situacao: cópia de 20260929a + histórico/notificação quando o estado muda. MESMA assinatura e retorno.
create or replace function public.nx_codewords_situacao(p_canal uuid, p_cliente uuid, p_dados jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare k public.nx_canais; d jsonb := coalesce(p_dados, '{}'::jsonb); v_phone text; v_sync boolean; v_ok boolean;
        v_antes text; v_depois text;
begin
  select * into k from public.nx_canais where id = p_canal and cliente_id = p_cliente and provedor = 'codewords' for update;
  if k.id is null then raise exception 'canal_nao_encontrado' using errcode = '22023'; end if;
  if jsonb_typeof(d) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023'; end if;
  v_antes := public.nx_canal_estado(k);
  v_phone := nullif(btrim(coalesce(d ->> 'phone_id', '')), '');
  if v_phone is not null and v_phone !~ '^[A-Za-z0-9._:@-]{1,120}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'phone_id';
  end if;
  begin
    v_sync := (d ->> 'sync_ok')::boolean;
  exception when invalid_text_representation then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'sync_ok';
  end;
  update public.nx_canais set
    codewords_conectado = case when d ? 'conectado' then (d ->> 'conectado')::boolean else codewords_conectado end,
    codewords_numero_conferido = case when d ? 'numero_conferido' then (d ->> 'numero_conferido')::boolean
                                      else codewords_numero_conferido end,
    codewords_conferido_em = case when d ? 'numero_conferido' or d ? 'conectado' then now() else codewords_conferido_em end,
    codewords_phone_id = case when d ? 'phone_id' then v_phone else codewords_phone_id end,
    codewords_estado = case when d ? 'estado' then left(nullif(btrim(coalesce(d ->> 'estado', '')), ''), 60) else codewords_estado end,
    codewords_inscricao = case when d ? 'inscricao' then left(nullif(btrim(coalesce(d ->> 'inscricao', '')), ''), 300)
                               else codewords_inscricao end,
    codewords_rota = case when d ->> 'rota' in ('fluxo', 'direta') then d ->> 'rota' else codewords_rota end,
    ultimo_erro = case when d ? 'erro' then left(nullif(btrim(coalesce(d ->> 'erro', '')), ''), 500) else ultimo_erro end,
    verificado_em = case when d ? 'conectado' then now() else verificado_em end,
    codewords_sync_em = case when v_sync is not null or d ? 'sync_erro' then now() else codewords_sync_em end,
    codewords_sync_falhas = case when v_sync then 0 when d ? 'sync_erro' then codewords_sync_falhas + 1 else codewords_sync_falhas end,
    -- o aviso só acende depois de 2 rodadas ruins seguidas (uma piscada do CodeWords não é defeito)
    codewords_sync_erro = case when v_sync then null
                               when d ? 'sync_erro' and codewords_sync_falhas + 1 >= 2 then left(coalesce(d ->> 'sync_erro', 'falhou'), 500)
                               else codewords_sync_erro end
  where id = k.id
  returning * into k;
  v_ok := coalesce(k.codewords_conectado, false) and coalesce(k.codewords_numero_conferido, false);
  update public.nx_canais set status = case
      when v_ok then 'ativo'
      when k.codewords_conectado is false or k.codewords_numero_conferido is false then 'erro'
      else 'pendente' end
   where id = k.id returning * into k;
  -- histórico + notificação: só quando a leitura trouxe «conectado» (as outras chamadas não dizem nada sobre o aparelho)
  if d ? 'conectado' then
    v_depois := public.nx_canal_estado(k);
    perform public.nx_canal_historico_gravar(k.id, k.cliente_id, v_antes, v_depois,
      concat_ws(' · ', nullif(k.codewords_estado, ''), case when d ? 'erro' then nullif(btrim(coalesce(d ->> 'erro', '')), '') end));
  end if;
  return (public.nx_canal_json(k) - 'webhook')::json;
end $$;

-- Painel (admin+): histórico do número, mais recente primeiro. [{id, canal_id, estado, detalhe, em}]
create or replace function public.nx_canal_historico_listar(p_token text, p_cliente uuid, p_canal uuid, p_limite int default 50)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
begin
  if not exists (select 1 from public.nx_canais k where k.id = p_canal and k.cliente_id = p_cliente) then
    raise exception 'canal_nao_encontrado' using errcode = '22023';
  end if;
  return coalesce((
    select json_agg(json_build_object('id', h.id, 'canal_id', h.canal_id, 'estado', h.estado, 'detalhe', h.detalhe, 'em', h.em)
                    order by h.em desc, h.id desc)
      from (select * from public.nx_canal_historico x
             where x.canal_id = p_canal and x.cliente_id = p_cliente
             order by x.em desc, x.id desc
             limit least(greatest(coalesce(p_limite, 50), 1), 200)) h), '[]'::json);
end $$;

-- Vigia (cron da sincronização): canais CodeWords pareados, de cliente ativo, SEM conversa recente (a sync já passa nesses) e
-- com a conferência mais velha que 20 min (ou nunca feita). caiu_em = desde quando está desconectado (histórico).
create or replace function public.nx_codewords_vigia_alvos(p_limite int default 20)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return coalesce((
    select json_agg(json_build_object(
             'canal_id', x.canal_id, 'cliente_id', x.cliente_id, 'conectado', x.conectado, 'conferido_em', x.conferido_em,
             'caiu_em', x.caiu_em, 'codewords_aviso_em', x.aviso_em) order by x.conferido_em nulls first)
      from (select k.id as canal_id, k.cliente_id, k.codewords_conectado as conectado, k.codewords_conferido_em as conferido_em,
                   k.codewords_aviso_em as aviso_em,
                   case when k.codewords_conectado is false then
                     (select h.em from public.nx_canal_historico h where h.canal_id = k.id order by h.em desc, h.id desc limit 1) end as caiu_em
              from public.nx_canais k
              join public.nx_clientes c on c.id = k.cliente_id
             where k.provedor = 'codewords' and k.codewords_phone_id is not null and k.codewords_api_segredo is not null
               and c.status in ('ativo', 'teste') and c.ativo
               and (k.codewords_conferido_em is null or k.codewords_conferido_em < now() - interval '20 minutes')
               and not exists (select 1 from public.nx_conversas cv
                                where cv.canal_id = k.id and cv.cliente_id = k.cliente_id and cv.ultima_msg_em > now() - interval '2 hours')
             order by k.codewords_conferido_em nulls first
             limit greatest(1, least(coalesce(p_limite, 20), 100))) x), '[]'::json);
end $$;

-- Contador por canal (API do agente): eco, grupo, lid, payload_desconhecido, http_422, http_413. Nunca derruba mensagem.
create or replace function public.nx_codewords_contar(p_canal uuid, p_chave text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  if p_chave is null or p_chave not in ('eco', 'grupo', 'lid', 'payload_desconhecido', 'http_422', 'http_413') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'chave';
  end if;
  update public.nx_canais k
     set codewords_contadores = coalesce(k.codewords_contadores, '{}'::jsonb)
       || jsonb_build_object(p_chave, coalesce((k.codewords_contadores ->> p_chave)::int, 0) + 1)
       || case when k.codewords_contadores ? 'desde' then '{}'::jsonb else jsonb_build_object('desde', now()) end
   where k.id = p_canal and k.provedor = 'codewords'
  returning k.codewords_contadores into v;
  if v is null then raise exception 'canal_nao_encontrado' using errcode = '22023'; end if;
  return json_build_object('ok', true, 'contadores', v);
end $$;

-- nx_canal_json: cópia de 20260929a + «contadores» e «aviso_em» dentro de codewords (a tela de Números mostra). Sem segredo.
create or replace function public.nx_canal_json(k public.nx_canais)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare v_base text; v_proprio boolean; v_cw boolean;
begin
  if k.id is null then return null; end if;
  select rtrim(coalesce(nullif(btrim(x.funcoes_url), ''), 'https://dtjznipitihnwmcgpzqh.supabase.co/functions/v1'), '/')
    into v_base from public.nx_config x where x.id = 1;
  v_base := coalesce(v_base, 'https://dtjznipitihnwmcgpzqh.supabase.co/functions/v1');
  v_proprio := k.app_secret_segredo is not null;
  v_cw := coalesce(k.provedor, 'meta') = 'codewords';
  return jsonb_build_object(
    'id', k.id, 'nome', k.nome, 'phone_number_id', k.phone_number_id, 'waba_id', k.waba_id,
    'numero_exibicao', k.numero_exibicao, 'status', k.status, 'app_inscrito', k.app_inscrito,
    'coexistencia', k.coexistencia,
    'tem_token', case when v_cw then k.codewords_api_segredo is not null and k.codewords_phone_id is not null
                      else k.token_segredo is not null end,
    'tem_app_secret', v_proprio, 'departamento_id', k.departamento_id,
    'qualidade', k.qualidade, 'ultimo_erro', k.ultimo_erro, 'verificado_em', k.verificado_em,
    'criado_em', k.criado_em, 'provedor', coalesce(k.provedor, 'meta'),
    'estado', public.nx_canal_estado(k),
    'codewords', case when v_cw then jsonb_build_object(
        'numero', k.codewords_numero, 'phone_id', k.codewords_phone_id, 'service_id', k.codewords_service_id,
        'rota', k.codewords_rota, 'tem_api_key', k.codewords_api_segredo is not null,
        'conectado', k.codewords_conectado, 'numero_conferido', k.codewords_numero_conferido,
        'conferido_em', k.codewords_conferido_em, 'estado', k.codewords_estado,
        'inscricao', k.codewords_inscricao,
        'ia_ligada', k.ia_ligada, 'ia_volta_horas', k.ia_volta_horas,
        'sync', jsonb_build_object('em', k.codewords_sync_em, 'erro', k.codewords_sync_erro,
                                   'falhas', k.codewords_sync_falhas),
        'forma_desconhecida', k.codewords_forma, 'forma_em', k.codewords_forma_em,
        'contadores', coalesce(k.codewords_contadores, '{}'::jsonb), 'aviso_em', k.codewords_aviso_em) end,
    'webhook', case
      when v_cw then jsonb_build_object('modo', 'codewords', 'url', public.nx_codewords_url(k),
        'verify_token', null, 'campo', 'API do agente (POST JSON)',
        'texto', 'URL secreta deste canal: o fluxo de IA do CodeWords chama esta API. Trate como senha.')
      when v_proprio then jsonb_build_object('modo', 'proprio', 'url', v_base || '/nx-whatsapp?c=' || k.chave_publica,
        'verify_token', k.verify_token, 'campo', 'messages')
      else jsonb_build_object('modo', 'nexus', 'url', v_base || '/nx-whatsapp', 'verify_token', null,
        'campo', 'messages',
        'texto', 'O webhook deste número é o do aplicativo da plataforma. Peça ao suporte para inscrever o app na WABA.')
    end);
end $$;

-- ------------------------------------------------------------
-- 7. S-B12 [D143] nx_fila_concluir: cópia de 20260928f + 'pendente' com recuo (1, 5, 15, 60 min pela tentativa) e sem lote/pego_em
-- ------------------------------------------------------------
create or replace function public.nx_fila_concluir(p_id bigint, p_status text, p_erro text, p_mensagem bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  if p_status not in ('enviado', 'falhou', 'pulado', 'cancelado', 'pendente') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'status';
  end if;
  if p_status = 'pendente' then
    -- credencial indisponível / sem tempo: volta para a fila DEPOIS (antes voltava imediato, gastava tentativa a cada rodada
    -- do cron e mantinha lote/pego_em antigos, o que confundia a detecção de item preso)
    update public.nx_envios_fila f set
      status = 'pendente',
      erro = left(nullif(btrim(coalesce(p_erro, '')), ''), 500),
      mensagem_id = coalesce(p_mensagem, f.mensagem_id),
      processado_em = null, pego_em = null, lote = null,
      enviar_em = now() + case when f.tentativas <= 1 then interval '1 minute'
                               when f.tentativas = 2 then interval '5 minutes'
                               when f.tentativas = 3 then interval '15 minutes'
                               else interval '60 minutes' end
    where f.id = p_id;
  else
    update public.nx_envios_fila set
      status = p_status,
      erro = left(nullif(btrim(coalesce(p_erro, '')), ''), 500),
      mensagem_id = coalesce(p_mensagem, mensagem_id),
      processado_em = now()
    where id = p_id;
  end if;
  get diagnostics v_n = row_count;
  return json_build_object('ok', v_n = 1);
end $$;

-- ------------------------------------------------------------
-- 8. S-B13 [G251] nx_cv_nota com p_req (5 argumentos, SEM default — a de 4 continua; padrão de 20261002c)
-- ------------------------------------------------------------
create or replace function public.nx_cv_nota(p_token text, p_cliente uuid, p_conversa bigint, p_texto text, p_req uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente'); ant jsonb; r json;
begin
  if p_req is null then return public.nx_cv_nota(p_token, p_cliente, p_conversa, p_texto); end if;
  ant := public.nx_req_usar(p_cliente, p_req, 'nx_cv_nota');
  if ant is not null then return ant::json; end if;
  r := public.nx_cv_nota(p_token, p_cliente, p_conversa, p_texto);
  perform public.nx_req_guardar(p_cliente, p_req, 'nx_cv_nota', r::jsonb);
  return r;
end $$;

-- ------------------------------------------------------------
-- 9. S-B16 [H309] nx_pulso.nao_lidas — conversas não lidas visíveis (a MESMA regra de nx_cv_listar.contagens)
-- ------------------------------------------------------------
create or replace function public.nx_pulso(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura'); v_rank int := public.nx_rank(v.papel);
begin
  return json_build_object(
    'v', coalesce((select p.v from public.nx_pulsos p where p.cliente_id = p_cliente), 0),
    'notif', (select count(*) from public.nx_notificacoes n
               where n.cliente_id = p_cliente and n.conta_id = v.conta_id and n.lida_em is null),
    'nao_lidas', (select count(*) from public.nx_conversas cv
                   where cv.cliente_id = p_cliente and cv.status in ('aberta', 'pendente') and not cv.oculta and cv.nao_lidas > 0
                     -- regra nx_cv_visivel
                     and ( v_rank >= 3
                        or cv.atribuida_a = v.conta_id
                        or ( (cardinality(v.departamentos) = 0 or cv.departamento_id is null
                              or cv.departamento_id = any(v.departamentos))
                             and (v_rank = 2 or cv.atribuida_a is null or v.ver_todas) ) )),
    'agora', now());
end $$;

-- ------------------------------------------------------------
-- 10. S-B16 [C100][C114] nx_saas_faxina: cópia de 20260928h + só transitórios (decisão 6)
-- ------------------------------------------------------------
create or replace function public.nx_saas_faxina()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_ev int; n_ex int; n_no int; n_fi int; n_cv int; n_sl int; n_ml int; n_etq int := 0; v_n int; v_lim int := 5000;
  n_ses int; n_req int; n_refs int; n_cwp int; n_login int;
begin
  delete from public.nx_eventos where processado_em is not null and processado_em < now() - interval '7 days';
  get diagnostics n_ev = row_count;
  delete from public.nx_auto_execucoes where criado_em < now() - interval '60 days';
  get diagnostics n_ex = row_count;
  -- notificações LIDAS há mais de 90 dias (as não lidas ficam)
  delete from public.nx_notificacoes where lida_em is not null and criado_em < now() - interval '90 days';
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
                           'login_falhas', n_login);
end $$;

-- ------------------------------------------------------------
-- 10b. Pedidos da frente S-F (funções desta rodada)
-- ------------------------------------------------------------
-- [F211] versão da Graph da Meta que respondeu por último (ciclo.js grava/lê como google_api_versao; a service_role já tem
-- UPDATE na tabela). Só a coluna: nenhum dado de nx_config é tocado.
alter table public.nx_config
  add column if not exists meta_api_versao text check (meta_api_versao is null or meta_api_versao ~ '^v[0-9]{1,3}\.[0-9]{1,2}$');

-- [D144] nx_mensagens.status ganha 'sem_confirmacao' (saída Meta ambígua há > 24 h: pode ter saído, ninguém confirmou).
-- A 20261008a só troca o CHECK quando falta 'sistema'; aqui troca quando falta 'sem_confirmacao'. NOT VALID: as linhas que já
-- existem passaram pelo CHECK anterior, que é um SUBCONJUNTO deste — não há o que validar, e a maior tabela do banco não fica
-- presa varrendo sob ACCESS EXCLUSIVE (a constraint vale para tudo que for gravado depois).
do $$
declare r record;
begin
  for r in select c.conname from pg_constraint c
            where c.conrelid = 'public.nx_mensagens'::regclass and c.contype = 'c'
              and pg_get_constraintdef(c.oid) like '%''recebida''%' and pg_get_constraintdef(c.oid) not like '%''sem_confirmacao''%' loop
    execute format('alter table public.nx_mensagens drop constraint %I', r.conname);
  end loop;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.nx_mensagens'::regclass and c.conname = 'nx_mensagens_status_check') then
    alter table public.nx_mensagens add constraint nx_mensagens_status_check
      check (status in ('recebida', 'pendente', 'enviada', 'entregue', 'lida', 'falhou', 'sistema', 'sem_confirmacao')) not valid;
  end if;
end $$;

-- [A29] nx_codewords_origem: cópia de 20260929b + grava a PLATAFORMA da fonte contada (instagram/facebook → meta, google → google)
-- no negócio e no contato. MESMA assinatura. Continua sem sobrescrever anúncio/rastreio: negócio que já tem plataforma, anúncio,
-- gclid ou origem 'anuncio' → ja_tem_anuncio, nada muda; contato só quando ainda é 'whatsapp' sem plataforma.
create or replace function public.nx_codewords_origem(p_canal uuid, p_telefone text, p_origem text, p_detalhe text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare a jsonb; l public.nx_leads; v_canon text; v_rot text; v_plat text;
        v_det text := left(nullif(btrim(coalesce(p_detalhe, '')), ''), 200);
begin
  if p_origem is null or p_origem not in ('google', 'instagram', 'facebook', 'indicacao', 'site', 'outro') then
    return json_build_object('ok', false, 'erro', 'origem_invalida');
  end if;
  a := public.nx_codewords_alvo(p_canal, p_telefone);
  if (a ->> 'contato_id') is null then return json_build_object('ok', false, 'erro', 'contato_nao_encontrado'); end if;
  v_canon := case p_origem when 'indicacao' then 'indicacao' when 'site' then 'site' else 'organico' end;
  v_plat := case p_origem when 'instagram' then 'meta' when 'facebook' then 'meta' when 'google' then 'google' end;
  v_rot := case p_origem when 'google' then 'Google' when 'instagram' then 'Instagram' when 'facebook' then 'Facebook'
                         when 'indicacao' then 'Indicação' when 'site' then 'Site' else 'Outro' end;
  if (a ->> 'negocio_id') is not null then
    select * into l from public.nx_leads where id = (a ->> 'negocio_id')::bigint and cliente_id = (a ->> 'cliente_id')::uuid
     for update;
    -- atribuição de anúncio (CTWA, utm/gclid do site) vale mais do que o que o cliente conta
    if l.plataforma is not null or nullif(l.anuncio_ext, '') is not null or l.gclid is not null or l.origem = 'anuncio' then
      return json_build_object('ok', true, 'aplicado', false, 'motivo', 'ja_tem_anuncio');
    end if;
    update public.nx_leads set origem = v_canon, plataforma = v_plat, atualizado_em = now() where id = l.id;
  end if;
  update public.nx_contatos set origem = v_canon, plataforma = v_plat
   where id = (a ->> 'contato_id')::bigint and cliente_id = (a ->> 'cliente_id')::uuid
     and plataforma is null and origem = 'whatsapp';
  insert into public.nx_notas (cliente_id, contato_id, negocio_id, texto)
  values ((a ->> 'cliente_id')::uuid, (a ->> 'contato_id')::bigint, l.id,
          'Origem contada à IA: ' || v_rot || coalesce(' — ' || v_det, ''));
  return json_build_object('ok', true, 'aplicado', true, 'origem', v_canon, 'plataforma', v_plat, 'negocio_id', l.id);
end $$;

-- ------------------------------------------------------------
-- 11. Permissões
-- ------------------------------------------------------------
-- funções NOVAS: internas só service_role; as do painel anon + service_role (a autenticação é o p_token dentro)
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('nx_login_ip', 'nx_login_bloqueio', 'nx_login_falha_registrar', 'nx_versao_atual', 'nx_cliente_pausado_checar',
                         'nx_canal_estado', 'nx_canal_historico_gravar', 'nx_canal_historico_listar', 'nx_codewords_vigia_alvos',
                         'nx_codewords_contar', 'nx_cv_nota')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    if r.proname in ('nx_canal_historico_listar', 'nx_cv_nota') then
      execute format('grant execute on function %s to anon, service_role', r.fn);
    else
      execute format('grant execute on function %s to service_role', r.fn);
    end if;
  end loop;
end $$;

-- S-B17 [C106]: nenhuma nx_* executável por authenticated (o painel usa só a chave anon; a service_role é das funções).
-- Tira também o EXECUTE implícito de PUBLIC (é por ele que authenticated herdaria), preservando exatamente quem já tinha
-- anon e service_role (no Supabase esses grants são explícitos pelos default privileges; aqui ficam explícitos em qualquer caso).
create or replace function public.nx_revogar_authenticated()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_n int := 0; v_anon boolean; v_svc boolean;
begin
  for r in
    select p.oid, p.oid::regprocedure as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'nx\_%' escape '\' and p.prokind = 'f'
  loop
    v_anon := has_function_privilege('anon', r.oid, 'execute');
    v_svc := has_function_privilege('service_role', r.oid, 'execute');
    execute format('revoke execute on function %s from public, authenticated', r.fn);
    if v_anon then execute format('grant execute on function %s to anon', r.fn); end if;
    if v_svc then execute format('grant execute on function %s to service_role', r.fn); end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.nx_revogar_authenticated() from public, anon, authenticated;
grant execute on function public.nx_revogar_authenticated() to service_role;

do $$
begin
  raise notice 'nx_revogar_authenticated: % funções', public.nx_revogar_authenticated();
end $$;

-- ------------------------------------------------------------
-- 12. Versão
-- ------------------------------------------------------------
insert into public.nx_versao_banco (nome) values ('20261008b_operacao_seguranca')
on conflict (nome) do update set aplicada_em = now();

notify pgrst, 'reload schema';
