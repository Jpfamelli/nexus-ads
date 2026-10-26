-- ============================================================
-- ÓRBITA — 20261022a_plano1500c.sql (plano «1500c», frente srv)
-- Migração ADITIVA e IDEMPOTENTE: colunas/índices com if not exists, funções com create or replace a partir da definição
-- EM VIGOR (a da migração mais recente que define cada uma — anotada em cada bloco). Nenhuma assinatura existente muda;
-- as RPCs novas são do painel com p_token (anon + service_role) ou internas (só service_role). Nada de dado real é alterado:
-- a faxina só ganha retenções de dados transitórios (erros do aparelho 30 d, notificações não lidas 180 d, histórico do cron).
--
--   Segurança / sessão
--   SC-001  nx_senha_redefinir devolve sessão nova {token, expira_em}           SC-009  limite de 10 links errados por IP
--   SC-010  nx_senha_validar: 8 a 72 bytes (bcrypt corta em 72), não só espaços — nas 4 RPCs que gravam senha
--   SC-011  nx_senha_link_criar invalida os links pendentes da conta              SC-012  redefinir recusa conta suspensa/org parada
--   SC-013  nx_senha_trocar com limite (5 em 15 min) e sessoes_encerradas (UCB-114)
--   SC-014  sessão vale no máximo 90 dias desde a criação (mesmo renovada)        SC-016  convite aceito sem delete no caminho
--   SC-018  teto global de cadastros (50/h)                                       SC-019  auditoria de entrada e trocas de senha
--   SC-004  nx_contas.suspenso_em / nx_acessos.suspenso_em + nx_conta_suspender / nx_acesso_suspender
--   SC-020/UCB-050  nx_sessoes_listar, nx_sessao_encerrar, nx_sessoes_encerrar   UCB-047 nx_entrar: hint restam:N
--   UCC-030/UCC-031 expira_em em nx_entrar e nx_app_sessao                        SC-003  nx_convite_ver: expira_em
--   SC-005  nx_convite_regerar                                                    SC-002/UCC-135 nx_erros_front + nx_erro_cliente_registrar
--   SC-036  nx_rastreio_registrar recusa payload > 8 KB
--   LGPD
--   SC-104/105 nx_titular_exportar / nx_titular_localizar                        SC-099  nx_clientes.ia_desligada (reservar + contexto)
--   SC-100/101 o negócio que fica perde campos/título/ids de anúncio; o rastreio, o telefone
--   SC-116/122/190 faxina: notificações não lidas > 180 d, cron em lotes, erros do aparelho > 30 d
--   Custo de IA
--   SC-095  aviso aos admins em 80% e 100% da franquia de IA (1× por mês cada)   SC-096  nx_ia_custo_resumo
--   Operação
--   SC-057  nx_relatorio_chamar não para no primeiro erro (só sem funcoes_url)    AC-055  relatório «semanal» (opt-in cfg.relSemanal)
--   SC-141/142/143/145/147 nx_saude_dados: mais tarefas, integrações com erro, eventos atrasados, crons ausentes
--   UCC-104 nx_evento_registrar   SC-151  nx_fila_resumo                                                        SC-054/055 nx_trava_estender
--   SC-008/RB-163 nx_inicio: atribuida_id/atribuida_nome em aguardando_lista     UCC-018/019 nx_pulso: ultima_msg_em e cliente
--   AC-063/AC-262 nx_cfg_validar: diasFechados, agenciaNome, agenciaCidade, relSemanal
--   Índices: SC-169/171/173/174/175/176/177/178/183/184/189/190
--   SC-108  nx_login_ip devolve o RESUMO do IP (h + 32 hex): as chaves de limite não guardam mais o IP (bloqueios em curso zeram)
--   SC-141/147 nx_saude_dados: tarefas do pg_cron atrasadas e 1 leitura por tarefa   SC-131/UC-024 nx_teste_avisar + cron diário
--   Pendências das frentes: UCB-029 convites vencidos · CC-197/267 nx_buscar · RC-311 empresas valor_aberto · RC-065 previsão no cartão
--   CC-245/324/239/240 agenda (obs, marcado_por, confirmada_em, nx_agenda_confirmar) · CC-027 SLA por departamento
--   UCA-093 descrição da automação · UCB-091 nx_suporte_entrar · UCC-104 nx_evento_registrar
-- Smoke: supabase/testes/34_plano1500c.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colunas, tabela nova e índices
-- ------------------------------------------------------------
-- SC-004: suspender sem apagar (a conta inteira, pela plataforma; ou o acesso a UM cliente, pelo admin dele)
alter table public.nx_contas add column if not exists suspenso_em timestamptz;
alter table public.nx_acessos add column if not exists suspenso_em timestamptz;
-- SC-099 (LGPD): o cliente pode desligar o envio das conversas à IA (sugerir, resumir, automações, relatório)
alter table public.nx_clientes add column if not exists ia_desligada boolean not null default false;
-- SC-020 / UCB-050: o navegador de cada sessão (para a lista «Sessões em outros aparelhos»; só o User-Agent, cortado em 200)
alter table public.nx_sessoes add column if not exists agente text;

-- SC-002: erros de JavaScript do painel/app (deduplicados: uma linha por mensagem+rota+versão, com contagem)
create table if not exists public.nx_erros_front (
  id bigint generated always as identity primary key,
  hash text not null,
  org_id uuid,
  cliente_id uuid,
  conta_id uuid,
  rota text,
  mensagem text not null,
  pilha text,
  agente text,
  versao text,
  contagem int not null default 1,
  primeiro_em timestamptz not null default now(),
  ultimo_em timestamptz not null default now()
);
alter table public.nx_erros_front enable row level security;
create unique index if not exists nx_erros_front_hash on public.nx_erros_front (hash);
-- SC-190: retenção de 30 dias
create index if not exists nx_erros_front_ultimo_em on public.nx_erros_front (ultimo_em);

-- AC-055: tipo «semanal» em nx_relatorios (o CHECK antigo só tinha diario e mensal)
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'nx_relatorios_tipo_check'
              and pg_get_constraintdef(oid) not like '%semanal%') then
    alter table public.nx_relatorios drop constraint nx_relatorios_tipo_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nx_relatorios_tipo_check') then
    alter table public.nx_relatorios add constraint nx_relatorios_tipo_check check (tipo in ('diario', 'semanal', 'mensal'));
  end if;
end $$;

-- índices das retenções e das telas novas (o que já existia ficou de fora: nx_sessoes_expira, nx_sessoes_conta, nx_ia_uso_cliente,
-- nx_mensagens_periodo, nx_leads_contato, nx_execucoes_tarefa)
create index if not exists nx_auditoria_org_criado on public.nx_auditoria (org_id, criado_em desc);          -- SC-169
create index if not exists nx_auditoria_criado on public.nx_auditoria (criado_em);                          -- SC-171
create index if not exists nx_execucoes_teste_painel on public.nx_execucoes (id desc)
  where tarefa = 'nx-ciclo' and (resumo ->> 'painel') = 'true';                                              -- SC-173 / SC-083
create index if not exists nx_notificacoes_criado on public.nx_notificacoes (criado_em);                    -- SC-174
create index if not exists nx_login_falhas_em on public.nx_login_falhas (em);                               -- SC-175
create index if not exists nx_ia_reservas_expira on public.nx_ia_reservas (expira_em);                      -- SC-176
create index if not exists nx_auto_execucoes_criado on public.nx_auto_execucoes (criado_em);                -- SC-177
create index if not exists nx_eventos_processado on public.nx_eventos (processado_em)
  where processado_em is not null;                                                                           -- SC-178
create index if not exists nx_canal_historico_em on public.nx_canal_historico (em);                         -- SC-183
create index if not exists nx_relatorios_criado on public.nx_relatorios (criado_em);                        -- SC-184
create index if not exists nx_fila_cli_status on public.nx_envios_fila (cliente_id, status, enviar_em);     -- SC-189
create index if not exists nx_conversas_entrada on public.nx_conversas (cliente_id, ultima_entrada_em desc)
  where ultima_entrada_em is not null;                                                                     -- UCC-018 (nx_pulso)

-- CC-027: limites do SLA por departamento (minutos: atenção / atraso / crítico; o front já lê e cai em 15/30/60 sem eles)
alter table public.nx_departamentos add column if not exists sla_aten int not null default 15;
alter table public.nx_departamentos add column if not exists sla_atraso int not null default 30;
alter table public.nx_departamentos add column if not exists sla_critico int not null default 60;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nx_departamentos_sla_check') then
    alter table public.nx_departamentos add constraint nx_departamentos_sla_check
      check (sla_aten between 1 and 1440 and sla_atraso between 1 and 1440 and sla_critico between 1 and 1440
             and sla_aten < sla_atraso and sla_atraso < sla_critico);
  end if;
end $$;

-- UCA-093: descrição da automação (até 500), salva pelo nx_automacao_salvar e devolvida no item (o front já busca nela)
alter table public.nx_automacoes add column if not exists descricao text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nx_automacoes_descricao_check') then
    alter table public.nx_automacoes add constraint nx_automacoes_descricao_check check (descricao is null or char_length(descricao) <= 500);
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Auxiliar interna (antes das cópias que a usam)
-- ------------------------------------------------------------
-- plano 1500c · SC-095: avisa os admins/supervisores (e o gestor da revenda) que a franquia de IA do mês passou de 80% ou
-- acabou — uma vez por mês por limiar. Chamada pelo nx_ia_reservar, que já segura o bloqueio da empresa (sem aviso duplicado).
create or replace function public.nx_ia_franquia_avisar(p_cliente uuid, p_pct int, p_desde timestamptz)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tit text := case when p_pct >= 100 then 'A franquia de IA do mês acabou' else 'A franquia de IA do mês passou de 80%' end;
begin
  if p_cliente is null then return 0; end if;
  if exists (select 1 from public.nx_notificacoes n
              where n.cliente_id = p_cliente and n.tipo = 'sistema' and n.titulo = v_tit and n.criado_em >= p_desde) then
    return 0;
  end if;
  return public.nx_notificar(p_cliente, null, 'sistema', v_tit,
    case when p_pct >= 100 then 'Sugerir resposta, resumo e as automações com IA ficam parados até o mês virar ou a franquia aumentar.'
         else 'Quando a franquia acabar, sugerir resposta, resumo e as automações com IA param até o mês virar.' end,
    '#/config/plano');
end $$;

-- ------------------------------------------------------------
-- 3. Funções NOVAS
-- ------------------------------------------------------------

-- plano 1500c · SC-010: a regra única da senha (as 4 RPCs que gravam senha chamam esta). 8 caracteres sem contar os espaços das
-- pontas (só espaços não vale) e no máximo 72 bytes (o bcrypt ignora o que passa disso: a senha «longa» valeria só pelo começo).
create or replace function public.nx_senha_validar(p_senha text)
returns void
language plpgsql immutable
security definer
set search_path = ''
as $$
begin
  if char_length(btrim(coalesce(p_senha, ''))) < 8 then raise exception 'senha_curta' using errcode = '22023'; end if;
  if octet_length(p_senha) > 72 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'senha_longa'; end if;
end $$;

-- plano 1500c · SC-001 / SC-020 / UCC-030: cria UMA sessão (30 dias; o nx_conta_do_token corta em 90 desde a criação) com o
-- navegador de quem pediu, mantendo no máximo 20 por conta (as mais antigas saem — a regra do SV-129). Interna (service_role).
create or replace function public.nx_sessao_criar(p_conta uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_exp timestamptz := now() + interval '30 days';
  v_ag text;
begin
  if p_conta is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'conta'; end if;
  begin
    v_ag := left(nullif(btrim(nullif(current_setting('request.headers', true), '')::json ->> 'user-agent'), ''), 200);
  exception when others then v_ag := null;
  end;
  insert into public.nx_sessoes (token_hash, conta_id, expira_em, agente) values (public.nx_hash(v_token), p_conta, v_exp, v_ag);
  delete from public.nx_sessoes s where s.conta_id = p_conta and s.token_hash in (
    select y.token_hash from public.nx_sessoes y where y.conta_id = p_conta
    order by (y.token_hash = public.nx_hash(v_token)) desc, y.criado_em desc, y.token_hash offset 20);
  return json_build_object('token', v_token, 'expira_em', v_exp);
end $$;

-- plano 1500c · SC-054 / SC-055: estende o prazo de uma trava que ESTE dono tem (o aviso de saúde/custo pega a trava curta,
-- envia e só então grava o prazo longo; se o envio falha, solta). Devolve false quando a trava não é mais dele.
create or replace function public.nx_trava_estender(p_nome text, p_segundos integer, p_dono text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  if coalesce(btrim(p_nome), '') = '' then raise exception 'trava_sem_nome'; end if;
  update public.nx_travas t
     set ate = now() + make_interval(secs => greatest(1, least(coalesce(p_segundos, 60), 2592000)))
   where t.nome = p_nome and t.dono is not distinct from p_dono;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

-- plano 1500c · SC-020 / UCB-050: os aparelhos com a conta aberta. id = 16 primeiros caracteres do hash do token (não dá para
-- chegar ao token por ele); navegador = resumo do User-Agent gravado na criação (sessões antigas: nulo → «Navegador»).
create or replace function public.nx_sessoes_listar(p_token text)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
declare c public.nx_contas := public.nx_conta_do_token(p_token); v_atual text := public.nx_hash(p_token);
begin
  return coalesce((
    select json_agg(json_build_object(
             'id', left(s.token_hash, 16),
             'criado_em', s.criado_em,
             'expira_em', s.expira_em,
             'atual', s.token_hash = v_atual,
             'navegador', nullif(concat_ws(' · ',
                 case when s.agente ~* 'edg/' then 'Edge' when s.agente ~* 'opr/|opera' then 'Opera'
                      when s.agente ~* 'firefox|fxios' then 'Firefox' when s.agente ~* 'chrome|crios' then 'Chrome'
                      when s.agente ~* 'safari' then 'Safari' end,
                 case when s.agente ~* 'android' then 'Android' when s.agente ~* 'iphone|ipad|ipod' then 'iPhone/iPad'
                      when s.agente ~* 'windows' then 'Windows' when s.agente ~* 'mac os' then 'Mac'
                      when s.agente ~* 'linux' then 'Linux' end), ''))
             order by (s.token_hash = v_atual) desc, s.criado_em desc)
      from public.nx_sessoes s
     where s.conta_id = c.id and s.expira_em > now() and s.criado_em > now() - interval '90 days'), '[]'::json);
end $$;

-- plano 1500c · SC-020 / UCB-050: encerra UMA sessão da própria conta (a atual sai pelo «Sair»; aqui não).
create or replace function public.nx_sessao_encerrar(p_token text, p_id text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare c public.nx_contas := public.nx_conta_do_token(p_token); v_n int;
begin
  if p_id is null or p_id !~ '^[0-9a-f]{16}$' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'sessao'; end if;
  delete from public.nx_sessoes s
   where s.conta_id = c.id and left(s.token_hash, 16) = p_id and s.token_hash <> public.nx_hash(p_token);
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'sessao'; end if;
  perform public.nx_auditar(c.org_id, null, c.id, 'sessao_encerrada', jsonb_build_object('n', v_n));
  return json_build_object('ok', true, 'encerradas', v_n);
end $$;

-- plano 1500c · SC-004: a plataforma suspende (ou reativa) uma conta inteira sem apagar nada. Suspensa: as sessões caem e o
-- nx_conta_do_token recusa (sessao_invalida); o nx_entrar diz conta_suspensa. Só a equipe da plataforma (super).
create or replace function public.nx_conta_suspender(p_token text, p_conta uuid, p_suspenso boolean default true)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare c public.nx_contas := public.nx_conta_do_token(p_token); k public.nx_contas; v_n int := 0;
begin
  if not public.nx_super(c) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if p_conta is null or p_conta = c.id then raise exception 'dados_invalidos' using errcode = '22023', hint = 'conta'; end if;
  update public.nx_contas x
     set suspenso_em = case when coalesce(p_suspenso, true) then coalesce(x.suspenso_em, now()) end
   where x.id = p_conta
  returning * into k;
  if k.id is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'conta'; end if;
  if coalesce(p_suspenso, true) then
    delete from public.nx_sessoes where conta_id = k.id;
    get diagnostics v_n = row_count;
  end if;
  perform public.nx_auditar(k.org_id, null, c.id, case when coalesce(p_suspenso, true) then 'conta_suspensa' else 'conta_reativada' end,
                            jsonb_build_object('conta', k.id, 'sessoes', v_n));
  return json_build_object('ok', true, 'suspenso', k.suspenso_em is not null, 'suspenso_em', k.suspenso_em);
end $$;

-- plano 1500c · SC-004: o admin suspende (ou reativa) o acesso de UMA pessoa à empresa dele — o nx_ctx passa a recusar
-- (sem_acesso, hint suspenso) sem apagar o usuário, o histórico nem as atribuições. Não vale para si mesmo nem para papel igual
-- ou acima do seu (gestor/super podem qualquer um).
create or replace function public.nx_acesso_suspender(p_token text, p_cliente uuid, p_conta uuid, p_suspenso boolean default true)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); a public.nx_acessos;
begin
  if p_conta is null or p_conta = v.conta_id then raise exception 'dados_invalidos' using errcode = '22023', hint = 'conta'; end if;
  select * into a from public.nx_acessos x where x.conta_id = p_conta and x.cliente_id = p_cliente for update;
  if a.conta_id is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'conta'; end if;
  if v.papel not in ('gestor', 'super') and public.nx_rank(a.papel) >= public.nx_rank(v.papel) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  update public.nx_acessos x
     set suspenso_em = case when coalesce(p_suspenso, true) then coalesce(x.suspenso_em, now()) end
   where x.conta_id = p_conta and x.cliente_id = p_cliente
  returning * into a;
  perform public.nx_auditar((select c.org_id from public.nx_clientes c where c.id = p_cliente), p_cliente, v.conta_id,
                            case when coalesce(p_suspenso, true) then 'acesso_suspenso' else 'acesso_reativado' end,
                            jsonb_build_object('conta', p_conta));
  return json_build_object('ok', true, 'suspenso', a.suspenso_em is not null, 'suspenso_em', a.suspenso_em);
end $$;

-- plano 1500c · SC-005: «Gerar link novo» de um convite pendente ou vencido da empresa: o antigo é revogado e nasce outro com o
-- mesmo papel, departamentos, nome e e-mail, valendo 7 dias. 10 por hora por pessoa.
create or replace function public.nx_convite_regerar(p_token text, p_cliente uuid, p_convite uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  cv public.nx_convites; v_token text; v_id uuid; v_exp timestamptz := now() + interval '7 days';
begin
  if not (public.nx_taxa_usar('convite_regerar:' || v.conta_id::text, 10, 3600) ->> 'ok')::boolean then
    raise exception 'limite_taxa' using errcode = '22023';
  end if;
  select * into cv from public.nx_convites x
   where x.id = p_convite and x.cliente_id = p_cliente and x.usado_em is null
  for update;
  if cv.id is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'convite'; end if;
  update public.nx_convites set revogado = true where id = cv.id;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.nx_convites (token_hash, org_id, cliente_id, papel, departamentos, email, nome, criado_por, expira_em)
  values (public.nx_hash(v_token), cv.org_id, cv.cliente_id, cv.papel, cv.departamentos, cv.email, cv.nome, v.conta_id, v_exp)
  returning id into v_id;
  perform public.nx_auditar(cv.org_id, p_cliente, v.conta_id, 'convite_regerado', jsonb_build_object('de', cv.id, 'convite', v_id));
  return json_build_object('id', v_id, 'token', v_token, 'expira_em', v_exp,
                           'link', coalesce(public.nx_link_base(p_cliente), '') || '#/convite/' || v_token);
end $$;

-- plano 1500c · SC-002 / UCC-135: o resumo de um erro do aparelho (código, tela, versão, navegador — nada de dado pessoal),
-- deduplicado: uma linha por código+tela+versão, com contagem. 30 por minuto por conta; a faxina apaga depois de 30 dias.
create or replace function public.nx_erro_cliente_registrar(p_token text, p_erro jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.nx_contas := public.nx_conta_do_token(p_token);
  e jsonb := case when jsonb_typeof(p_erro) = 'object' then p_erro else '{}'::jsonb end;
  v_cod text := left(coalesce(nullif(btrim(e ->> 'codigo'), ''), 'erro'), 60);
  v_tela text := left(regexp_replace(coalesce(e ->> 'tela', ''), '[^A-Za-z0-9/_-]', '', 'g'), 60);
  v_ver text := left(coalesce(e ->> 'versao', ''), 30);
  v_nav text := left(coalesce(e ->> 'navegador', ''), 60);
begin
  if not (public.nx_taxa_usar('erro_front:' || c.id::text, 30, 60) ->> 'ok')::boolean then
    return json_build_object('ok', false, 'erro', 'limite_taxa');
  end if;
  insert into public.nx_erros_front (hash, org_id, conta_id, rota, mensagem, agente, versao)
  values (public.nx_hash(v_cod || '|' || v_tela || '|' || v_ver), c.org_id, c.id, nullif(v_tela, ''), v_cod, nullif(v_nav, ''), nullif(v_ver, ''))
  on conflict (hash) do update set contagem = public.nx_erros_front.contagem + 1, ultimo_em = now(),
                                   conta_id = excluded.conta_id, agente = coalesce(excluded.agente, public.nx_erros_front.agente);
  return json_build_object('ok', true);
end $$;

-- plano 1500c · UCC-104: evento leve para o comercial (ver_plano, conhecer_produto, pedir_modulo, assinar, viu_fora_do_plano…)
-- na auditoria. 60 por hora por conta; dados acima de 2 KB não são guardados.
create or replace function public.nx_evento_registrar(p_token text, p_tipo text, p_dados jsonb default '{}'::jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare c public.nx_contas := public.nx_conta_do_token(p_token);
begin
  if p_tipo is null or p_tipo !~ '^[a-z0-9_.-]{2,40}$' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'tipo'; end if;
  if not (public.nx_taxa_usar('evento:' || c.id::text, 60, 3600) ->> 'ok')::boolean then
    return json_build_object('ok', false, 'erro', 'limite_taxa');
  end if;
  perform public.nx_auditar(c.org_id, null, c.id, 'evento_comercial',
    jsonb_build_object('tipo', p_tipo,
                       'dados', case when jsonb_typeof(p_dados) = 'object' and pg_column_size(p_dados) <= 2048 then p_dados else '{}'::jsonb end));
  return json_build_object('ok', true);
end $$;

-- plano 1500c · SC-105 (LGPD): achar o titular que pediu os dados — por telefone (só dígitos, 8+), e-mail ou documento. Só admin;
-- até 20 resultados; cada busca fica na auditoria (sem o termo buscado).
create or replace function public.nx_titular_localizar(p_token text, p_cliente uuid, p_busca text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  v_txt text := lower(btrim(coalesce(p_busca, '')));
  v_dig text := regexp_replace(coalesce(p_busca, ''), '[^0-9]', '', 'g');
  j json;
begin
  if char_length(v_txt) < 3 or (position('@' in v_txt) = 0 and char_length(v_dig) < 8) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'busca';
  end if;
  select coalesce(json_agg(json_build_object('id', k.id, 'nome', k.nome, 'telefone', k.telefone, 'email', k.email,
                                             'criado_em', k.criado_em) order by k.criado_em desc), '[]'::json)
    into j
    from (select * from public.nx_contatos k
           where k.cliente_id = p_cliente
             and ( (position('@' in v_txt) > 0 and lower(k.email) = v_txt)
                or (char_length(v_dig) >= 8 and (right(regexp_replace(coalesce(k.telefone, ''), '[^0-9]', '', 'g'), char_length(right(v_dig, 11))) = right(v_dig, 11)
                                                 or regexp_replace(coalesce(k.documento, ''), '[^0-9]', '', 'g') = v_dig)) )
           order by k.criado_em desc
           limit 20) k;
  perform public.nx_auditar((select c.org_id from public.nx_clientes c where c.id = p_cliente), p_cliente, v.conta_id,
                            'titular_localizado', jsonb_build_object('n', json_array_length(j)));
  return j;
end $$;

-- plano 1500c · SC-104 (LGPD): tudo o que a empresa guarda de UM contato, num JSON para entregar ao titular — cadastro, negócios
-- (sem dados internos de anúncio), conversas e até 5.000 mensagens (sem notas internas). Só admin; fica na auditoria.
create or replace function public.nx_titular_exportar(p_token text, p_cliente uuid, p_contato bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); v_id bigint;
begin
  select k.id into v_id from public.nx_contatos k where k.id = p_contato and k.cliente_id = p_cliente;
  if v_id is null then raise exception 'contato_nao_encontrado' using errcode = '22023'; end if;
  perform public.nx_auditar((select c.org_id from public.nx_clientes c where c.id = p_cliente), p_cliente, v.conta_id,
                            'titular_exportado', jsonb_build_object('contato', v_id));
  return json_build_object(
    'gerado_em', now(),
    'empresa', (select c.nome from public.nx_clientes c where c.id = p_cliente),
    'contato', public.nx_crm_contato_json(p_cliente, v_id),
    'negocios', coalesce((select json_agg(json_build_object('id', l.id, 'titulo', l.titulo, 'servico', l.servico, 'status', l.status,
                                                            'valor', l.valor, 'origem', l.origem, 'consulta_em', l.consulta_em,
                                                            'campos', l.campos, 'obs', l.obs, 'criado_em', l.criado_em,
                                                            'fechado_em', l.fechado_em) order by l.criado_em)
                            from public.nx_leads l where l.contato_id = v_id and l.cliente_id = p_cliente), '[]'::json),
    'conversas', coalesce((select json_agg(json_build_object('id', cv.id, 'status', cv.status, 'aberta_em', cv.aberta_em)
                                           order by cv.aberta_em)
                             from public.nx_conversas cv where cv.contato_id = v_id and cv.cliente_id = p_cliente), '[]'::json),
    'mensagens', coalesce((select json_agg(json_build_object('conversa_id', m.conversa_id, 'direcao', m.direcao, 'tipo', m.tipo,
                                                             'texto', m.corpo, 'em', m.criado_em) order by m.id)
                             from (select * from public.nx_mensagens m
                                    where m.contato_id = v_id and m.cliente_id = p_cliente and m.tipo not in ('nota', 'sistema')
                                    order by m.id desc limit 5000) m), '[]'::json));
end $$;

-- plano 1500c · SC-096: o custo da IA da empresa — franquia do mês (usadas/limite) e os últimos 3 meses por ação (pedidos,
-- custo em US$). Só admin.
create or replace function public.nx_ia_custo_resumo(p_token text, p_cliente uuid)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  v_ini timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  return json_build_object(
    'mes', json_build_object('usadas', public.nx_uso(p_cliente, 'ia_mes'), 'limite', public.nx_limite(p_cliente, 'ia_mes'),
                             'desligada', (select c.ia_desligada or coalesce(c.cfg -> 'ia' ->> 'desligada', '') = 'true'
                                             from public.nx_clientes c where c.id = p_cliente)),
    'por_mes', coalesce((
      select json_agg(json_build_object('mes', x.mes, 'acao', x.acao, 'pedidos', x.n, 'custo_usd', x.custo) order by x.mes desc, x.acao)
        from (select to_char(u.criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes, u.acao, count(*)::int as n,
                     round(coalesce(sum(u.custo_usd), 0)::numeric, 4) as custo
                from public.nx_ia_uso u
               where u.cliente_id = p_cliente and u.criado_em >= v_ini - interval '2 months'
               group by 1, 2) x), '[]'::json));
end $$;

-- plano 1500c · SC-151: a fila de envios da empresa num resumo — por situação nos últimos 7 dias, as pendentes atrasadas
-- (> 30 min) e a pendente mais antiga. Supervisor ou acima.
create or replace function public.nx_fila_resumo(p_token text, p_cliente uuid)
returns json
language plpgsql stable
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'supervisor');
begin
  return json_build_object(
    'por_status', coalesce((select json_object_agg(x.status, x.n)
                              from (select f.status, count(*)::int as n from public.nx_envios_fila f
                                     where f.cliente_id = p_cliente and f.criado_em > now() - interval '7 days'
                                     group by f.status) x), '{}'::json),
    'atrasadas', (select count(*)::int from public.nx_envios_fila f
                   where f.cliente_id = p_cliente and f.status = 'pendente' and f.enviar_em < now() - interval '30 minutes'),
    'mais_antiga', (select min(f.enviar_em) from public.nx_envios_fila f where f.cliente_id = p_cliente and f.status = 'pendente'),
    'pausados', (select c.envios_pausados from public.nx_clientes c where c.id = p_cliente),
    'agora', now());
end $$;

-- plano 1500c · SC-131 / UC-024: o fim do teste não pega ninguém de surpresa — a 3 dias e no último dia, os admins/supervisores da
-- empresa e o gestor da revenda recebem um aviso no sino (link #/config/plano), uma vez por marco. Não muda status nem apaga nada
-- (vencido, o nx_ctx já deixa só leitura). Interna: o cron diário 'nx-teste-avisos' chama.
create or replace function public.nx_teste_avisar()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare c record; v_n int := 0; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_tit text;
begin
  for c in
    select x.id, x.nome, x.teste_ate from public.nx_clientes x
     where x.status = 'teste' and coalesce(x.ativo, true) and x.teste_ate in (v_hoje, v_hoje + 3)
       and not exists (select 1 from public.nx_orgs o where o.id = x.org_id and o.status in ('suspenso', 'cancelado'))
  loop
    v_tit := case when c.teste_ate = v_hoje then 'O teste termina hoje' else 'O teste termina em 3 dias' end;
    if exists (select 1 from public.nx_notificacoes n
                where n.cliente_id = c.id and n.tipo = 'sistema' and n.titulo = v_tit and n.criado_em > now() - interval '5 days') then
      continue;
    end if;
    v_n := v_n + public.nx_notificar(c.id, null, 'sistema', v_tit,
      'Depois do último dia (' || to_char(c.teste_ate, 'DD/MM') || '), a conta fica só para leitura até a assinatura. Veja os planos.',
      '#/config/plano');
  end loop;
  return v_n;
end $$;

-- plano 1500c · CC-240 / CC-239: «Confirmada» no detalhe da consulta — grava quando o paciente confirmou (a remarcação apaga).
-- p_inicio = o «inicio» que o nx_agenda_dia devolveu (a consulta tem de ser essa, com 1 min de folga). Atendente ou acima.
create or replace function public.nx_agenda_confirmar(p_token text, p_cliente uuid, p_negocio bigint, p_inicio text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'atendente'); l public.nx_leads; v_ini timestamptz; v_em timestamptz := now();
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  begin
    v_ini := public.nx_crm_ts(jsonb_build_object('t', p_inicio), 't');
  exception when others then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'inicio';
  end;
  select * into l from public.nx_leads x where x.id = p_negocio and x.cliente_id = p_cliente for update;
  if l.id is null or (public.nx_crm_restrito(v) and l.dono_id is not null and l.dono_id <> v.conta_id) then
    raise exception 'negocio_nao_encontrado' using errcode = '22023';
  end if;
  if v_ini is null or l.consulta_em is null or abs(extract(epoch from l.consulta_em - v_ini)) > 60 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'consulta_mudou';
  end if;
  update public.nx_leads x set campos = coalesce(x.campos, '{}'::jsonb) || jsonb_build_object('confirmada_em', v_em), atualizado_em = now()
   where x.id = l.id;
  insert into public.nx_notas (cliente_id, contato_id, negocio_id, autor_id, texto)
  values (p_cliente, l.contato_id, l.id, v.conta_id, 'Consulta de ' || public.nx_agenda_rotulo(l.consulta_em) || ' confirmada.');
  return json_build_object('ok', true, 'confirmada_em', v_em);
end $$;

-- plano 1500c · UCB-091: a equipe da plataforma/revenda diz POR QUE entrou na empresa (o nx_ctx já registra a entrada; aqui vai o
-- motivo, até 200). Só gestor da org do cliente ou super.
create or replace function public.nx_suporte_entrar(p_token text, p_cliente uuid, p_motivo text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
begin
  if v.papel not in ('gestor', 'super') then raise exception 'sem_permissao' using errcode = '42501'; end if;
  perform public.nx_auditar((select c.org_id from public.nx_clientes c where c.id = p_cliente), p_cliente, v.conta_id, 'suporte_motivo',
                            jsonb_build_object('papel', v.papel, 'motivo', left(nullif(btrim(coalesce(p_motivo, '')), ''), 200)));
  return json_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- 4. CÓPIAS das funções em vigor (trocas marcadas com «plano 1500c»)
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- plano 1500c · SC-014 / SC-004 nx_conta_do_token: sessão vale no máximo 90 dias desde a criação; conta suspensa cai
--   (cópia da definição em vigor: 20261008b_operacao_seguranca.sql)
-- ------------------------------------------------------------
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
   where s.token_hash = public.nx_hash(p_token) and s.expira_em > now()
     and s.criado_em > now() - interval '90 days';   -- plano 1500c · SC-014: renovar não estica a sessão para sempre
  if c.id is null then raise exception 'sessao_invalida' using errcode = '28000'; end if;
  if not c.aprovado then raise exception 'conta_pendente' using errcode = '28000'; end if;
  if c.suspenso_em is not null then raise exception 'sessao_invalida' using errcode = '28000'; end if;   -- plano 1500c · SC-004
  return c;
end $$;

-- ------------------------------------------------------------
-- plano 1500c · SC-004 nx_ctx: acesso suspenso pelo admin da empresa → sem_acesso (hint suspenso)
--   (cópia da definição em vigor: 20261013b_seguranca_dados.sql)
-- ------------------------------------------------------------
create or replace function public.nx_ctx(p_token text, p_cliente uuid, p_min text default 'atendente')
returns public.nx_ctx_t
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.nx_contas := public.nx_conta_do_token(p_token);   -- sessao_invalida / conta_pendente
  v_min text := coalesce(p_min, 'atendente');
  v_super boolean;
  v_cli public.nx_clientes;
  a public.nx_acessos;
  v_papel text;
  r public.nx_ctx_t;
begin
  v_super := c.papel = 'gestor'
             and exists (select 1 from public.nx_orgs o where o.id = c.org_id and o.tipo = 'plataforma');
  if p_cliente is not null then
    select * into v_cli from public.nx_clientes where id = p_cliente;
  end if;
  if v_cli.id is null then
    raise exception 'cliente_nao_encontrado' using errcode = '22023';
  end if;
  select * into a from public.nx_acessos where conta_id = c.id and cliente_id = p_cliente;

  if v_super then
    v_papel := 'super';
  elsif c.papel = 'gestor' and v_cli.org_id = c.org_id then
    v_papel := 'gestor';
  elsif a.conta_id is not null then
    v_papel := a.papel;
    -- plano 1500c · SC-004: o usuário continua cadastrado (histórico, atribuições), mas não entra nesta empresa
    if a.suspenso_em is not null then raise exception 'sem_acesso' using errcode = '42501', hint = 'suspenso'; end if;
  else
    raise exception 'sem_acesso' using errcode = '42501';
  end if;

  if public.nx_rank(v_papel) < 4 then
    if v_cli.status in ('suspenso', 'cancelado') then
      raise exception 'conta_suspensa' using errcode = '42501';
    end if;
    if v_cli.status = 'teste' and v_cli.teste_ate < (now() at time zone 'America/Sao_Paulo')::date
       and v_min <> 'leitura' then
      raise exception 'teste_expirado' using errcode = '42501';
    end if;
    if exists (select 1 from public.nx_orgs o where o.id = v_cli.org_id and o.status = 'suspenso') then
      raise exception 'conta_suspensa' using errcode = '42501';
    end if;
    -- plano 1000 (SV-127): cliente PAUSADO pela plataforma (nx_clientes.ativo = false): a equipe com a tela aberta (ou um token)
    -- continuava enviando e salvando; agora só lê (como teste_expirado). errcode 22023, como no nx_app_sessao (frente A).
    if not coalesce(v_cli.ativo, true) and v_min <> 'leitura' then
      raise exception 'cliente_pausado' using errcode = '22023';
    end if;
  end if;

  if public.nx_rank(v_papel) < public.nx_rank(v_min) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  perform set_config('nx.conta', c.id::text, true);
  perform set_config('nx.cliente', p_cliente::text, true);

  -- auditoria de suporte (no servidor): gestor/super sem acesso próprio → 1 linha por hora.
  -- Em transação SOMENTE LEITURA (o PostgREST roda RPC stable/immutable assim, e GET sempre) o
  -- insert daria 'cannot execute INSERT in a read-only transaction' e derrubaria a RPC: aí a
  -- linha fica para a próxima chamada de escrita (RPCs de painel são volatile por padrão).
  if v_papel in ('gestor', 'super') and a.conta_id is null
     and coalesce(current_setting('transaction_read_only', true), 'off') <> 'on'
     and not exists (select 1 from public.nx_auditoria x
                      where x.acao = 'suporte_entrou' and x.conta_id = c.id and x.cliente_id = p_cliente
                        and x.criado_em > now() - interval '1 hour') then
    perform public.nx_auditar(v_cli.org_id, p_cliente, c.id, 'suporte_entrou', jsonb_build_object('papel', v_papel));
  end if;

  r := row(c.id, c.org_id, c.nome, v_papel, v_super,
           coalesce(a.departamentos, '{}'::uuid[]), coalesce(a.ver_todas, true))::public.nx_ctx_t;
  return r;
end $$;

-- ------------------------------------------------------------
-- plano 1500c · nx_entrar: UCB-047 hint restam:N · UCC-030 expira_em · SC-004 conta suspensa · SC-019 auditoria · SC-020 navegador
--   (cópia da definição em vigor: 20261013e_funcoes_seguranca.sql)
-- ------------------------------------------------------------
create or replace function public.nx_entrar(p_email text, p_senha text)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
declare
  c public.nx_contas; v_token text;
  s json;   -- plano 1500c: a sessão criada (nx_sessao_criar)
  v_email text := lower(trim(coalesce(p_email, '')));
  v_ip text := public.nx_login_ip();
  v_rest boolean := nullif(current_setting('request.headers', true), '') is not null;   -- chamada pelo PostgREST?
  v_min int;
begin
  -- 1. bloqueio ANTES de qualquer custo (bcrypt/pg_sleep). Plano 1000 (SV-238): 10 falhas em 15 min por (conta, IP) ou por IP;
  --    por CONTA só com 50 (de vários IPs) — antes 10 senhas erradas de qualquer lugar trancavam o dono da clínica para fora.
  --    Sem IP (chamada por SQL): por conta com 10, como antes.
  v_min := greatest(public.nx_login_bloqueio('conta:' || v_email, case when v_ip is null then 10 else 50 end, interval '15 minutes'),
                    case when v_ip is null then 0
                         else greatest(public.nx_login_bloqueio('ip:' || v_ip, 10, interval '15 minutes'),
                                       public.nx_login_bloqueio('contaip:' || v_email || '|' || v_ip, 10, interval '15 minutes')) end);
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
      perform public.nx_login_falha_registrar(array_remove(array['conta:' || v_email, case when v_ip is not null then 'ip:' || v_ip end,
                                                                   case when v_ip is not null then 'contaip:' || v_email || '|' || v_ip end], null));
      -- plano 1000 (SV-238): o limite alto por conta disparou → a própria conta é avisada (uma vez por dia)
      if c.id is not null and public.nx_login_bloqueio('conta:' || v_email, 50, interval '15 minutes') > 0
         and not exists (select 1 from public.nx_notificacoes n where n.conta_id = c.id and n.titulo = 'Muitas tentativas de entrar na sua conta'
                                                                    and n.criado_em > now() - interval '1 day') then
        perform public.nx_notificar(a.cliente_id, c.id, 'sistema', 'Muitas tentativas de entrar na sua conta',
                  'Houve 50 senhas erradas em 15 minutos, de vários lugares. Se não foi você, troque a senha em Minha conta.', '#/conta')
           from (select x.cliente_id from public.nx_acessos x where x.conta_id = c.id order by x.cliente_id limit 1) a;
      end if;
      perform set_config('response.status', '400', true);
      -- plano 1500c · UCB-047: quantas tentativas restam antes do bloqueio (pela chave mais apertada: conta+IP; sem IP, a conta)
      return json_build_object('code', 'P0001', 'message', 'credenciais_invalidas', 'details', null,
        'hint', 'restam:' || greatest(0, 10 - (select count(*)::int from public.nx_login_falhas f
                                                where f.chave = case when v_ip is null then 'conta:' || v_email
                                                                     else 'contaip:' || v_email || '|' || v_ip end
                                                  and f.em > now() - interval '15 minutes')));
    end if;
    raise exception 'credenciais_invalidas';
  end if;
  if not c.aprovado then raise exception 'conta_pendente'; end if;
  if c.suspenso_em is not null then raise exception 'conta_suspensa' using errcode = '28000'; end if;   -- plano 1500c · SC-004
  -- plano 1000 (SV-239): login certo zera as falhas desta conta (as do IP ficam: outra conta não «limpa» um IP que tenta senhas)
  delete from public.nx_login_falhas where chave = 'conta:' || v_email or (v_ip is not null and chave = 'contaip:' || v_email || '|' || v_ip);
  -- plano 1500c · SC-020: a sessão nasce no nx_sessao_criar (navegador + o teto de 20 por conta do SV-129)
  s := public.nx_sessao_criar(c.id);
  v_token := s ->> 'token';
  -- plano 1500c · SC-019: a entrada fica na auditoria (só um resumo do IP, nunca o IP)
  perform public.nx_auditar(c.org_id, null, c.id, 'entrou',
                            jsonb_build_object('ip', case when v_ip is not null then left(public.nx_hash(v_ip), 12) end));
  -- plano 1500c · UCC-030: até quando o token vale
  return json_build_object('token', v_token, 'nome', c.nome, 'papel', c.papel, 'expira_em', s -> 'expira_em');
end $function$;

-- ------------------------------------------------------------
-- plano 1500c · UCC-031 / SC-014 nx_app_sessao: expira_em do token; a renovação não passa de 90 dias desde a criação
--   (cópia da definição em vigor: 20261008b_operacao_seguranca.sql)
-- ------------------------------------------------------------
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
  update public.nx_sessoes set expira_em = least(now() + interval '30 days', criado_em + interval '90 days')   -- plano 1500c · SC-014
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
    'expira_em', (select x.expira_em from public.nx_sessoes x where x.token_hash = public.nx_hash(p_token)),   -- plano 1500c · UCC-031
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
-- plano 1500c · SC-003 nx_convite_ver: + expira_em (a tela diz até quando o convite vale)
--   (cópia da definição em vigor: 20260928c_plataforma.sql)
-- ------------------------------------------------------------
create or replace function public.nx_convite_ver(p_convite text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare cv public.nx_convites; o public.nx_orgs; x public.nx_clientes;
begin
  if p_convite is null or p_convite !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'convite_invalido' using errcode = '22023';
  end if;
  select * into cv from public.nx_convites where token_hash = public.nx_hash(lower(p_convite));
  if cv.id is null or cv.usado_em is not null or cv.revogado or cv.expira_em <= now() or cv.tentativas >= 5 then
    raise exception 'convite_invalido' using errcode = '22023';
  end if;
  select * into o from public.nx_orgs where id = cv.org_id;
  if cv.cliente_id is not null then select * into x from public.nx_clientes where id = cv.cliente_id; end if;
  return json_build_object(
    'org', json_build_object('nome', o.nome, 'marca', public.nx_marca_publica_de(o.marca)),
    'cliente', case when x.id is null then null else json_build_object('nome', x.nome) end,
    'papel', cv.papel, 'email', cv.email, 'nome', cv.nome,
    'expira_em', cv.expira_em);   -- plano 1500c · SC-003
end $$;

-- ------------------------------------------------------------
-- plano 1500c · nx_convite_aceitar: SC-010 regra da senha · SC-016 sem o delete global de sessões no caminho · SC-004
--   (cópia da definição em vigor: 20260928c_plataforma.sql)
-- ------------------------------------------------------------
create or replace function public.nx_convite_aceitar(p_convite text, p_nome text, p_email text, p_senha text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  cv public.nx_convites;
  k public.nx_contas;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_nome text := btrim(coalesce(p_nome, ''));
  v_token text;
  s json;   -- plano 1500c
begin
  if p_convite is null or p_convite !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'convite_invalido' using errcode = '22023';
  end if;
  select * into cv from public.nx_convites where token_hash = public.nx_hash(lower(p_convite)) for update;
  if cv.id is null or cv.usado_em is not null or cv.revogado or cv.expira_em <= now() or cv.tentativas >= 5 then
    raise exception 'convite_invalido' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido' using errcode = '22023'; end if;

  select * into k from public.nx_contas where email = v_email;
  if k.id is null then
    -- conta NOVA, já aprovada, na org do convite
    if char_length(v_nome) < 2 or char_length(v_nome) > 80 then raise exception 'nome_invalido' using errcode = '22023'; end if;
    perform public.nx_senha_validar(p_senha);   -- plano 1500c · SC-010
    insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id)
    values (v_email, v_nome, extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
            case when cv.papel = 'gestor' then 'gestor' else 'clinica' end, true, cv.org_id)
    returning * into k;
    if cv.cliente_id is not null then
      insert into public.nx_acessos (conta_id, cliente_id, papel, departamentos)
      values (k.id, cv.cliente_id, cv.papel, cv.departamentos)
      on conflict (conta_id, cliente_id) do nothing;
    end if;
  else
    -- conta EXISTENTE: nunca vira gestor por convite; nunca muda org, papel, nome ou senha
    if cv.papel = 'gestor' then
      raise exception 'convite_invalido' using errcode = '22023', hint = 'conta_existente';
    end if;
    if k.senha_hash <> extensions.crypt(coalesce(p_senha, ''), k.senha_hash) then
      perform pg_sleep(0.4);
      update public.nx_convites set tentativas = tentativas + 1 where id = cv.id;
      return json_build_object('ok', false, 'erro', 'credenciais_invalidas');
    end if;
    if not k.aprovado then raise exception 'conta_pendente' using errcode = '28000'; end if;
    if k.suspenso_em is not null then raise exception 'conta_suspensa' using errcode = '28000'; end if;   -- plano 1500c · SC-004
    insert into public.nx_acessos (conta_id, cliente_id, papel, departamentos)
    values (k.id, cv.cliente_id, cv.papel, cv.departamentos)
    on conflict (conta_id, cliente_id) do nothing;
  end if;

  update public.nx_convites set usado_em = now(), usado_por = k.id where id = cv.id;
  -- plano 1500c · SC-016: a sessão nasce no nx_sessao_criar (a faxina diária apaga as vencidas; o delete de TODAS aqui travava a tabela)
  s := public.nx_sessao_criar(k.id);
  v_token := s ->> 'token';
  perform public.nx_auditar(cv.org_id, cv.cliente_id, k.id, 'convite_aceito', jsonb_build_object('convite', cv.id, 'papel', cv.papel));
  return json_build_object('ok', true, 'token', v_token, 'nome', k.nome, 'papel', k.papel, 'cliente_id', cv.cliente_id,
                           'expira_em', s -> 'expira_em');
end $$;

-- ------------------------------------------------------------
-- plano 1500c · nx_criar_conta: SC-010 regra da senha · SC-018 teto global de 50 cadastros por hora
--   (cópia da definição em vigor: 20261008b_operacao_seguranca.sql)
-- ------------------------------------------------------------
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
  perform public.nx_senha_validar(p_senha);   -- plano 1500c · SC-010
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'nome_invalido'; end if;
  if v_ip is not null then
    v_min := public.nx_login_bloqueio('cadastro:' || v_ip, 5, interval '1 hour');
    if v_min > 0 then raise exception 'muitas_tentativas' using errcode = '22023', hint = v_min::text; end if;
  end if;
  -- plano 1500c · SC-018: um robô com muitos IPs criava contas sem fim (cada uma pendente de aprovação, enchendo a fila do gestor)
  v_min := public.nx_login_bloqueio('cadastro:global', 50, interval '1 hour');
  if v_min > 0 then raise exception 'muitas_tentativas' using errcode = '22023', hint = v_min::text; end if;
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
  perform public.nx_login_falha_registrar(array_remove(array['cadastro:global', case when v_ip is not null then 'cadastro:' || v_ip end], null));   -- plano 1500c · SC-018
  return json_build_object('ok', true, 'papel', case when v_primeira then 'gestor' else 'clinica' end, 'aprovado', v_primeira);
end $function$;

-- ------------------------------------------------------------
-- plano 1500c · SC-011 nx_senha_link_criar: o link novo invalida os pendentes da mesma conta
--   (cópia da definição em vigor: 20260928c_plataforma.sql)
-- ------------------------------------------------------------
create or replace function public.nx_senha_link_criar(p_token text, p_cliente uuid, p_conta uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); c public.nx_contas; v_token text; v_exp timestamptz;
begin
  select * into c from public.nx_contas where id = v.conta_id;
  if p_conta is null or p_conta = c.id then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if not public.nx_conta_no_escopo(c, p_conta, p_cliente) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if not exists (select 1 from public.nx_contas k where k.id = p_conta) then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'conta';
  end if;
  -- plano 1500c · SC-011: só o link mais novo vale (o antigo, mandado por engano ou vazado, deixa de abrir)
  update public.nx_senha_links set usado_em = now() where conta_id = p_conta and usado_em is null and expira_em > now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_exp := now() + interval '24 hours';
  insert into public.nx_senha_links (token_hash, conta_id, criado_por, expira_em)
  values (public.nx_hash(v_token), p_conta, c.id, v_exp);
  perform public.nx_auditar((select x.org_id from public.nx_clientes x where x.id = p_cliente), p_cliente, c.id,
                            'senha_link', jsonb_build_object('conta', p_conta));
  return json_build_object('token', v_token, 'expira_em', v_exp,
                           'link', coalesce(public.nx_link_base(p_cliente), '') || '#/senha/' || v_token);
end $$;

-- ------------------------------------------------------------
-- plano 1500c · SC-108 (LGPD) nx_login_ip: devolve um RESUMO do IP (h + 32 hex do sha-256) — as chaves de limite (nx_login_falhas, nx_taxa) deixam de guardar o IP
--   (cópia da definição em vigor: 20261013b_seguranca_dados.sql)
-- ------------------------------------------------------------
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
    -- plano 1000 (SV-189): o IP que a Cloudflare põe (cf-connecting-ip) vale antes do x-forwarded-for, cujo 1º valor o próprio
    -- cliente manda (trocando-o a cada tentativa, o limite de falhas por IP nunca disparava). Sem ele, o de sempre.
    v := nullif(btrim(coalesce(v_h::json ->> 'cf-connecting-ip', '')), '');
    if v is null then v := nullif(btrim(split_part(coalesce(v_h::json ->> 'x-forwarded-for', ''), ',', 1)), ''); end if;
  exception when others then
    return null;
  end;
  -- plano 1500c · SC-108: só as chaves de limite usam o valor (login, cadastro, formulário, rastreio, redefinir) — o IP em si não é guardado
  return case when v is null then null else 'h' || left(public.nx_hash(left(v, 64)), 32) end;
end $$;

-- ------------------------------------------------------------
-- plano 1500c · SC-100 / SC-101 nx_contato_excluir: o negócio que fica (ROI) perde também campos, título e ids de anúncio; o rastreio, o telefone
--   (cópia da definição em vigor: 20260928d_crm.sql)
-- ------------------------------------------------------------
create or replace function public.nx_contato_excluir(p_token text, p_cliente uuid, p_id bigint, p_confirmacao text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); v_n int := 0; v_id bigint;
begin
  perform public.nx_exigir_modulo(p_cliente, 'crm');
  if coalesce(lower(btrim(p_confirmacao)), '') <> 'excluir' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'confirmacao';
  end if;
  select id into v_id from public.nx_contatos where id = p_id and cliente_id = p_cliente for update;
  if v_id is null then raise exception 'contato_nao_encontrado' using errcode = '22023'; end if;
  -- mídias das mensagens → faxina do Storage (só caminhos dentro da pasta deste cliente)
  insert into public.nx_midia_lixo (cliente_id, path)
  select p_cliente, m.midia ->> 'path'
    from public.nx_mensagens m
   where m.contato_id = v_id and m.cliente_id = p_cliente
     and m.midia ->> 'path' is not null and left(m.midia ->> 'path', 37) = p_cliente::text || '/';
  get diagnostics v_n = row_count;
  -- negócios ficam (ROI), sem dado pessoal
  -- plano 1500c · SC-101: o clique do site ligado ao negócio guardava o telefone
  update public.nx_rastreio r set telefone = null
   where r.cliente_id = p_cliente and r.telefone is not null
     and r.negocio_id in (select l.id from public.nx_leads l where l.contato_id = v_id and l.cliente_id = p_cliente);
  update public.nx_leads set nome = 'Removido', telefone = null, obs = null, contato_id = null, atualizado_em = now(),
         campos = '{}'::jsonb, titulo = null, ctwa_clid = null, gclid = null   -- plano 1500c · SC-100
   where contato_id = v_id and cliente_id = p_cliente;
  -- cascata: conversas, mensagens, tarefas, notas e histórico do contato
  delete from public.nx_contatos where id = v_id;
  return json_build_object('ok', true, 'midias_na_fila', v_n);
end $$;

-- ------------------------------------------------------------
-- plano 1500c · nx_ia_reservar: SC-099 IA desligada pela empresa · SC-095 aviso aos admins em 80% e 100% da franquia (1× por mês cada)
--   (cópia da definição em vigor: 20261013c_operacao_indices.sql)
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
  -- plano 1500c · SC-099 (LGPD): a empresa desligou o envio das conversas à IA (coluna da plataforma ou cfg.ia.desligada do painel)
  if exists (select 1 from public.nx_clientes c
              where c.id = p_cliente and (c.ia_desligada or coalesce(c.cfg -> 'ia' ->> 'desligada', '') = 'true')) then
    return json_build_object('ok', false, 'erro', 'ia_desligada');
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
    perform public.nx_ia_franquia_avisar(p_cliente, 100, v_inicio_mes);   -- plano 1500c · SC-095
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
  -- plano 1500c · SC-095: passou de 80% com esta reserva → os admins ficam sabendo antes de acabar
  if coalesce(v_limite, 0) > 0 and (v_usadas + v_reservadas + 1) * 100 >= v_limite * 80 then
    perform public.nx_ia_franquia_avisar(p_cliente, case when v_usadas + v_reservadas + 1 >= v_limite then 100 else 80 end, v_inicio_mes);
  end if;
  return json_build_object('ok', true, 'reserva_id', v_id);
end $$;

-- ------------------------------------------------------------
-- plano 1500c · SC-099 nx_ia_contexto: + ia_desligada (a função nx-ia não manda a conversa quando vem true)
--   (cópia da definição em vigor: 20260928f_funcoes.sql)
-- ------------------------------------------------------------
create or replace function public.nx_ia_contexto(p_ctx jsonb, p_cliente uuid, p_conversa bigint, p_limite int default 30)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := jsonb_populate_record(null::public.nx_ctx_t, coalesce(p_ctx, '{}'::jsonb));
  cv public.nx_conversas; c public.nx_clientes; r record;
  v_itens jsonb[] := '{}'; v_tam int := 0; v_txt text; v_quem text; v_contato text;
  v_ocultas bigint[] := '{}';
begin
  if not public.nx_cv_visivel(v, p_cliente, p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = '22023';
  end if;
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  select * into cv from public.nx_conversas where id = p_conversa and cliente_id = p_cliente;
  select * into c from public.nx_clientes where id = p_cliente;
  select k.nome into v_contato from public.nx_contatos k where k.id = cv.contato_id and k.cliente_id = p_cliente;
  -- mesma regra do nx_cv_mensagens (F5): conversa OCULTA só para supervisor+; abaixo disso,
  -- as mensagens dela não entram no histórico que vai para a IA
  if public.nx_rank(v.papel) < 2 then
    select coalesce(array_agg(x.id), '{}'::bigint[]) into v_ocultas from public.nx_conversas x
     where x.cliente_id = p_cliente and x.contato_id = cv.contato_id and x.oculta;
  end if;
  -- histórico contínuo do contato (mais novas primeiro, até 12 KB); notas internas e
  -- mensagens de sistema NÃO entram
  for r in
    select m.direcao, m.tipo, m.corpo, m.criado_em, m.origem, x.nome as autor
      from public.nx_mensagens m left join public.nx_contas x on x.id = m.enviado_por
     where m.contato_id = cv.contato_id and m.cliente_id = p_cliente and m.tipo not in ('nota', 'sistema')
       and not (m.conversa_id = any(v_ocultas))
     order by m.id desc
     limit greatest(1, least(coalesce(p_limite, 30), 100))
  loop
    v_txt := left(case when r.tipo = 'texto' then coalesce(r.corpo, '')
                       else '[' || public.nx_wa_resumo(r.tipo, null) || ']' || coalesce(' ' || nullif(r.corpo, ''), '') end,
                  1500);
    v_quem := case when r.direcao = 'in' then 'cliente'
                   else coalesce(nullif(split_part(coalesce(r.autor, ''), ' ', 1), ''),
                                 case when r.origem = 'automacao' then 'automação' else 'equipe' end) end;
    exit when v_tam + octet_length(v_txt) > 12000;
    v_tam := v_tam + octet_length(v_txt);
    v_itens := array_prepend(jsonb_build_object('dir', r.direcao, 'quem', v_quem, 'texto', v_txt, 'em', r.criado_em),
                             v_itens);
  end loop;
  return json_build_object(
    'empresa', c.nome, 'vertical', c.vertical,
    'ia_desligada', coalesce(c.ia_desligada, false) or coalesce(c.cfg -> 'ia' ->> 'desligada', '') = 'true',   -- plano 1500c · SC-099
    'org_assinatura', (select o.marca ->> 'assinatura' from public.nx_orgs o where o.id = c.org_id),
    'ia', case when jsonb_typeof(c.cfg -> 'ia') = 'object' then c.cfg -> 'ia' else '{}'::jsonb end,
    'contato_nome', v_contato,
    'atendente_nome', (select x.nome from public.nx_contas x where x.id = v.conta_id),
    'conversa_id', cv.id,
    'mensagens', to_jsonb(v_itens));
end $$;

-- ------------------------------------------------------------
-- plano 1500c · SC-036 nx_rastreio_registrar: recusa corpo acima de 8 KB (a chave do site é pública)
--   (cópia da definição em vigor: 20261015a_plano1000b.sql)
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
  -- plano 1500c · SC-036: payload gigante custava parse/CPU antes de qualquer limite
  if pg_column_size(p_dados) > 8192 then raise exception 'dados_invalidos' using errcode = '22023', hint = 'tamanho'; end if;
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
-- plano 1500c · UCC-018 / UCC-019 nx_pulso: + ultima_msg_em (mensagem recebida mais nova) e cliente {status, teste_ate}
--   (cópia da definição em vigor: 20261013f_entrada_contratos.sql)
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
    'canais', coalesce((select json_agg(json_build_object(
                          'id', k.id, 'nome', k.nome, 'estado', public.nx_canal_estado(k),
                          -- plano 1000 (SV-114): a coluna quando preenchida (o coalesce só consulta o histórico sem ela)
                          'desde', coalesce(k.estado_desde, (select h.em from public.nx_canal_historico h where h.canal_id = k.id order by h.em desc, h.id desc limit 1)))
                          order by k.criado_em, k.id)
                         from public.nx_canais k where k.cliente_id = p_cliente), '[]'::json),
    -- plano 1500c · UCC-018 (índice nx_conversas_entrada)
    'ultima_msg_em', (select cv.ultima_entrada_em from public.nx_conversas cv
                       where cv.cliente_id = p_cliente and cv.ultima_entrada_em is not null
                       order by cv.ultima_entrada_em desc limit 1),
    -- plano 1500c · UCC-019
    'cliente', (select json_build_object('status', x.status, 'teste_ate', x.teste_ate) from public.nx_clientes x where x.id = p_cliente),
    'agora', now());
end $$;

-- ------------------------------------------------------------
-- plano 1500c · SC-008 / RB-163 nx_inicio: quem atende cada conversa da lista «aguardando»
--   (cópia da definição em vigor: 20261013d_contratos_telas.sql)
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
  select coalesce(json_agg(json_build_object('id', x.id, 'nome', x.nome, 'espera_min', x.espera_min, 'canal', x.canal,
                                             'atribuida_id', x.atribuida_a, 'atribuida_nome', x.atribuida_nome,   -- plano 1500c · SC-008
                                             'contato_id', x.contato_id)   -- plano 1500c · RC-228
                           order by x.espera_min desc, x.id), '[]'::json)
    into j_ag
    from (select cv.id, coalesce(k.nome, k.telefone) as nome,
                 floor(extract(epoch from now() - coalesce(cv.ultima_entrada_em, cv.aberta_em)) / 60)::int as espera_min,
                 coalesce(ch.provedor, 'meta') as canal,
                 cv.atribuida_a, ac.nome as atribuida_nome, cv.contato_id   -- plano 1500c · SC-008 / RC-228
            from public.nx_conversas cv
            left join public.nx_contatos k on k.id = cv.contato_id and k.cliente_id = p_cliente
            left join public.nx_canais ch on ch.id = cv.canal_id
            left join public.nx_contas ac on ac.id = cv.atribuida_a   -- plano 1500c · SC-008
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
-- plano 1500c · AC-063 / AC-262 / AC-055 nx_cfg_validar: diasFechados, agenciaNome, agenciaCidade e relSemanal
--   (cópia da definição em vigor: 20261001b_correcoes.sql)
-- ------------------------------------------------------------
create or replace function public.nx_cfg_validar(p jsonb)
returns void
language plpgsql immutable
security definer
set search_path = ''
as $$
declare k text; v jsonb; z record;
begin
  if p is null or jsonb_typeof(p) = 'null' then return; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'cfg'; end if;
  foreach k in array array['cpaAlvo', 'orcamento', 'fee'] loop
    v := p -> k;
    if v is null or jsonb_typeof(v) = 'null' then continue; end if;
    if not (jsonb_typeof(v) = 'number' or (jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[0-9]+([.,][0-9]+)?$'))
       or (case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > 1000000000 else false end) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = k;
    end if;
  end loop;
  v := p -> 'regrasOff';
  if v is not null and jsonb_typeof(v) <> 'null' then
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 100
       or exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') > 60) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'regrasOff';
    end if;
  end if;
  v := p -> 'ticket';
  if v is not null and jsonb_typeof(v) <> 'null' then
    if jsonb_typeof(v) <> 'object' then raise exception 'dados_invalidos' using errcode = '22023', hint = 'ticket'; end if;
    for z in select e.key, e.value from jsonb_each(v) e loop
      if jsonb_typeof(z.value) <> 'number' or (z.value #>> '{}')::numeric < 0 or (z.value #>> '{}')::numeric > 1000000000 then
        raise exception 'dados_invalidos' using errcode = '22023', hint = 'ticket';
      end if;
    end loop;
  end if;
  v := p -> 'proximos';
  if v is not null and jsonb_typeof(v) <> 'null' then
    if jsonb_typeof(v) <> 'object'
       or exists (select 1 from jsonb_each(v) e where jsonb_typeof(e.value) <> 'string') then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'proximos';
    end if;
  end if;
  foreach k in array array['waGestor', 'waCliente'] loop
    v := p -> k;
    if v is null or jsonb_typeof(v) = 'null' or jsonb_typeof(v) = 'string' then continue; end if;
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 50
       or exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) not in ('string', 'number')) then
      raise exception 'dados_invalidos' using errcode = '22023', hint = k;
    end if;
  end loop;
  -- plano 1500c · AC-063: dias da semana fechados (0 = domingo … 6 = sábado)
  v := p -> 'diasFechados';
  if v is not null and jsonb_typeof(v) <> 'null' then
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 7
       or exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'number' or (e #>> '{}') !~ '^[0-6]$') then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'diasFechados';
    end if;
  end if;
  -- plano 1500c · AC-262: nome e cidade da agência na folha do relatório
  foreach k in array array['agenciaNome', 'agenciaCidade'] loop
    v := p -> k;
    if v is null or jsonb_typeof(v) = 'null' then continue; end if;
    if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 80 then
      raise exception 'dados_invalidos' using errcode = '22023', hint = k;
    end if;
  end loop;
  -- plano 1500c · AC-055: relatório semanal (opt-in)
  v := p -> 'relSemanal';
  if v is not null and jsonb_typeof(v) not in ('null', 'boolean') then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'relSemanal';
  end if;
end $$;

-- ------------------------------------------------------------
-- plano 1500c · nx_usuarios_listar: UCB-029 convites vencidos há até 7 dias (vencido:true) · SC-004 suspenso por usuário
--   (cópia da definição em vigor: 20261013f_entrada_contratos.sql)
-- ------------------------------------------------------------
create or replace function public.nx_usuarios_listar(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin'); c public.nx_contas;
begin
  select * into c from public.nx_contas where id = v.conta_id;
  return json_build_object(
    'usuarios', coalesce((
      select json_agg(json_build_object(
               'conta_id', k.id, 'nome', k.nome, 'email', k.email, 'telefone', k.telefone, 'papel', a.papel,
               'departamentos', a.departamentos, 'ver_todas', a.ver_todas, 'recebe_conversas', a.recebe_conversas,
               'aprovado', k.aprovado, 'ultimo_acesso', k.ultimo_acesso,
               'editavel', public.nx_conta_no_escopo(c, k.id, p_cliente) and k.id <> c.id,
               'eu', k.id = c.id, 'gestor', k.papel = 'gestor',
               'suspenso', a.suspenso_em is not null or k.suspenso_em is not null)   -- plano 1500c · SC-004
             order by (a.papel = 'admin') desc, lower(k.nome))
        from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
       where a.cliente_id = p_cliente), '[]'::json),
    'convites', coalesce((
      -- plano 1000: os departamentos do convite (a tela mostra onde a pessoa vai atender antes de aceitar)
      select json_agg(json_build_object('id', cv.id, 'papel', cv.papel, 'email', cv.email, 'nome', cv.nome,
                                        'expira_em', cv.expira_em, 'criado_em', cv.criado_em, 'departamentos', cv.departamentos,
                                        'vencido', cv.expira_em <= now()) order by cv.criado_em desc)   -- plano 1500c · UCB-029
        from public.nx_convites cv
       where cv.cliente_id = p_cliente and cv.usado_em is null and not cv.revogado
         and cv.expira_em > now() - interval '7 days' and cv.tentativas < 5), '[]'::json),   -- plano 1500c · UCB-029: + vencidos há até 7 dias
    'departamentos', coalesce((
      select json_agg(json_build_object('id', d.id, 'nome', d.nome, 'cor', d.cor) order by d.ordem, d.nome)
        from public.nx_departamentos d where d.cliente_id = p_cliente and d.ativo), '[]'::json),
    'eu', json_build_object('id', c.id, 'papel', v.papel),
    'limite', public.nx_limite(p_cliente, 'usuarios'),
    'uso', public.nx_uso(p_cliente, 'usuarios'));
end $$;

-- ------------------------------------------------------------
-- plano 1500c · CC-197 / CC-267 nx_buscar: o negócio traz o telefone do contato (final, para homônimos) e consulta_em
--   (cópia da definição em vigor: 20260928d_crm_b.sql)
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
                                             'estagio_nome', x.estagio_nome, 'status', x.status,
                                             'contato_telefone', x.contato_telefone, 'consulta_em', x.consulta_em)   -- plano 1500c · CC-197 / CC-267
                           order by x.rk, x.ab desc, x.criado_em desc), '[]'::json)
    into r_ng
    from (select l.id, coalesce(l.titulo, l.nome) titulo, coalesce(k.nome, l.nome) contato_nome, e.nome estagio_nome,
                 l.status, (l.status = 'aberto') ab, l.criado_em, coalesce(k.telefone, l.telefone) contato_telefone, l.consulta_em,   -- plano 1500c
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
-- plano 1500c · RC-311 nx_empresas_listar: valor_aberto (soma do valor previsto dos negócios abertos, mesma visibilidade)
--   (cópia da definição em vigor: 20260928d_crm_b.sql)
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
                                   and (not restr or l.dono_id is null or l.dono_id = v.conta_id)),
           -- plano 1500c · RC-311
           'valor_aberto', (select coalesce(sum(coalesce(l.valor_previsto, l.valor, 0)), 0) from public.nx_contatos k join public.nx_leads l on l.contato_id = k.id
                             where k.empresa_id = e.id and k.cliente_id = p_cliente and l.cliente_id = p_cliente and l.status = 'aberto'
                               and (not restr or l.dono_id is null or l.dono_id = v.conta_id)))
         order by lower(e.nome), e.id), '[]'::json)
    into itens
    from (select * from public.nx_empresas e
           where e.cliente_id = p_cliente and (pl is null or e.busca like pl)
           order by lower(e.nome), e.id limit n offset (pg - 1) * n) e;
  return json_build_object('itens', itens, 'total', v_total, 'pagina', pg, 'por_pagina', n, 'tem_mais', pg * n < v_total);
end $$;

-- ------------------------------------------------------------
-- plano 1500c · RC-065 / RC-294 nx_crm_cards: previsao_fechamento no cartão do quadro
--   (cópia da definição em vigor: 20261013d_contratos_telas.sql)
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
      'previsao_fechamento', l.previsao_fechamento,   -- plano 1500c · RC-065
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
-- plano 1500c · CC-245 / CC-324 nx_agenda_marcar_core: a observação e quem marcou ('ia' ou a conta) ficam na consulta
--   (cópia da definição em vigor: 20261008c_dados_telas.sql)
-- ------------------------------------------------------------
create or replace function public.nx_agenda_marcar_core(p_cliente uuid, p_negocio bigint, p_inicio timestamptz, p_servico text,
                                                        p_remarcar boolean, p_encaixe boolean, p_quem text,
                                                        p_obs text default null, p_conta uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.nx_leads; e public.nx_estagios; cfg jsonb := public.nx_agenda_cfg(p_cliente);
  v_ini timestamptz := date_trunc('minute', p_inicio);
  v_serv text; v_erro text; v_dur int; v_ant timestamptz; v_fut boolean; v_txt text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ia boolean := coalesce(p_quem, '') = 'ia';
  v_obs text := left(nullif(btrim(coalesce(p_obs, '')), ''), 1000);
begin
  -- uma agenda por cliente: quem chega depois enxerga o que o primeiro gravou
  perform pg_advisory_xact_lock(hashtextextended('nx_agenda:' || p_cliente::text, 0));
  select * into l from public.nx_leads where id = p_negocio and cliente_id = p_cliente and status = 'aberto' for update;
  if l.id is null then return jsonb_build_object('ok', false, 'erro', 'negocio_nao_encontrado'); end if;
  v_serv := coalesce(left(nullif(btrim(coalesce(p_servico, '')), ''), 120), l.servico);
  v_dur := public.nx_agenda_dur(cfg, v_serv);
  v_ant := l.consulta_em;
  v_fut := v_ant is not null and v_ant > now();

  if v_fut and v_ini = date_trunc('minute', v_ant) and coalesce(v_serv, '') = coalesce(l.servico, '') then
    return jsonb_build_object('ok', true, 'negocio_id', l.id, 'contato_id', l.contato_id, 'mudou', false, 'remarcada', false,
      'consulta', jsonb_build_object('inicio', public.nx_agenda_iso(v_ant), 'rotulo', public.nx_agenda_rotulo(v_ant),
                                     'servico', v_serv, 'duracao_min', v_dur, 'encaixe', coalesce((l.campos ->> 'encaixe')::boolean, false)));
  end if;
  if v_fut and not coalesce(p_remarcar, false) then
    return jsonb_build_object('ok', false, 'erro', 'ja_agendada', 'negocio_id', l.id,
      'consulta', jsonb_build_object('inicio', public.nx_agenda_iso(v_ant), 'rotulo', public.nx_agenda_rotulo(v_ant), 'servico', l.servico));
  end if;

  v_erro := public.nx_agenda_checar(p_cliente, v_ini, v_serv, l.id, coalesce(p_encaixe, false));
  if v_erro is not null then
    return jsonb_build_object('ok', false, 'erro', v_erro)
        || case when v_erro <> 'dados_invalidos'
                then jsonb_build_object('sugestoes', public.nx_agenda_sugestoes(p_cliente, v_ini, v_serv, l.id, 4))
                else '{}'::jsonb end;
  end if;

  -- mesma regra do nx_negocio_mover para a etapa "agendada" (marco): etapa do funil do negócio + datas
  select * into e from public.nx_estagios s
   where s.cliente_id = p_cliente and s.funil_id = l.funil_id and s.marco = 'agendada' order by s.ordem limit 1;
  update public.nx_leads x set
    consulta_em = v_ini,
    servico = v_serv,
    data_agenda = coalesce(x.data_agenda, v_hoje),
    estagio_id = coalesce(e.id, x.estagio_id),
    ordem = case when e.id is not null and e.id is distinct from x.estagio_id then -extract(epoch from clock_timestamp()) else x.ordem end,
    -- contrato 6: o encaixe fica gravado; a presença era da consulta anterior
    campos = (coalesce(x.campos, '{}'::jsonb) - 'presenca' - 'agenda_obs' - 'marcado_por' - 'confirmada_em') || jsonb_build_object('encaixe', coalesce(p_encaixe, false))
             -- plano 1500c · CC-245 / CC-324: a observação desta marcação e quem marcou (a de antes sai junto com a presença)
             || jsonb_strip_nulls(jsonb_build_object('agenda_obs', v_obs, 'marcado_por', case when v_ia then 'ia' else p_conta::text end)),
    atualizado_em = now()
  where x.id = l.id;   -- o gatilho da F1 aplica etapa↔marco, status e data_consulta (São Paulo)

  v_txt := case when v_fut then 'Consulta remarcada de ' || public.nx_agenda_rotulo(v_ant) || ' para ' || public.nx_agenda_rotulo(v_ini)
                else 'Consulta marcada para ' || public.nx_agenda_rotulo(v_ini) end
        || coalesce(' (' || v_serv || ')', '') || case when coalesce(p_encaixe, false) then ' [encaixe]' else '' end
        || coalesce('. ' || v_obs, '');
  insert into public.nx_notas (cliente_id, contato_id, negocio_id, autor_id, texto)
  values (p_cliente, l.contato_id, l.id, case when v_ia then null else p_conta end,
          left(case when v_ia then 'IA: ' else '' end || v_txt, 5000));
  if v_ia then
    perform public.nx_notificar(p_cliente, null, 'sistema',
      left((case when v_fut then 'Consulta remarcada pela IA: ' else 'Consulta marcada pela IA: ' end)
           || coalesce((select k.nome from public.nx_contatos k where k.id = l.contato_id), l.nome, 'contato'), 120),
      public.nx_agenda_rotulo(v_ini) || coalesce(' · ' || v_serv, ''), '#/crm/negocio/' || l.id);
  end if;
  return jsonb_build_object('ok', true, 'negocio_id', l.id, 'contato_id', l.contato_id, 'mudou', true, 'remarcada', v_fut,
    'consulta', jsonb_build_object('inicio', public.nx_agenda_iso(v_ini), 'rotulo', public.nx_agenda_rotulo(v_ini),
                                   'servico', v_serv, 'duracao_min', v_dur, 'encaixe', coalesce(p_encaixe, false)),
    'anterior', case when v_fut then jsonb_build_object('inicio', public.nx_agenda_iso(v_ant), 'rotulo', public.nx_agenda_rotulo(v_ant)) end,
    'etapa', e.nome);
end $$;

-- ------------------------------------------------------------
-- plano 1500c · CC-245 / CC-324 nx_agenda_dia: obs e marcado_por de cada consulta
--   (cópia da definição em vigor: 20261015a_plano1000b.sql)
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
      'obs', l.campos ->> 'agenda_obs', 'marcado_por', l.campos ->> 'marcado_por',   -- plano 1500c · CC-245 / CC-324
      'confirmada_em', l.campos ->> 'confirmada_em',   -- plano 1500c · CC-239 / CC-240
      'confirmacao', case when l.campos ? 'confirmada_em' then 'confirmada' else 'pendente' end,   -- plano 1500c · RC-202
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
-- plano 1500c · CC-027 nx_cv_json_dep: + limites do SLA
--   (cópia da definição em vigor: 20260928e_conversas_b.sql)
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
    'sla_aten', d.sla_aten, 'sla_atraso', d.sla_atraso, 'sla_critico', d.sla_critico,   -- plano 1500c · CC-027
    'conversas_abertas', (select count(*) from public.nx_conversas cv
                           where cv.cliente_id = d.cliente_id and cv.departamento_id = d.id
                             and cv.status in ('aberta', 'pendente')),
    'canais', (select count(*) from public.nx_canais k where k.cliente_id = d.cliente_id and k.departamento_id = d.id),
    'pessoas', (select count(*) from public.nx_acessos a where a.cliente_id = d.cliente_id and d.id = any(a.departamentos)));
end $$;

-- ------------------------------------------------------------
-- plano 1500c · CC-027 nx_cv_base: limites do SLA de cada departamento (todos os papéis)
--   (cópia da definição em vigor: 20261015a_plano1000b.sql)
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
                 'distribuicao', d.distribuicao, 'ativo', d.ativo, 'horario', d.horario,
                 'sla_aten', d.sla_aten, 'sla_atraso', d.sla_atraso, 'sla_critico', d.sla_critico) order by d.ordem, d.nome)   -- plano 1500c · CC-027
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
-- plano 1500c · CC-027 nx_departamento_salvar: aceita sla_aten / sla_atraso / sla_critico (minutos, 1..1440, em ordem crescente)
--   (cópia da definição em vigor: 20260928e_conversas_b.sql)
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
  -- plano 1500c · CC-027: só as chaves enviadas mudam; o CHECK da tabela garante 1..1440 e atenção < atraso < crítico
  if r ? 'sla_aten' or r ? 'sla_atraso' or r ? 'sla_critico' then
    begin
      update public.nx_departamentos d
         set sla_aten = coalesce((r ->> 'sla_aten')::int, d.sla_aten),
             sla_atraso = coalesce((r ->> 'sla_atraso')::int, d.sla_atraso),
             sla_critico = coalesce((r ->> 'sla_critico')::int, d.sla_critico)
       where d.id = x.id
      returning * into x;
    exception when others then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'sla';
    end;
  end if;
  perform public.nx_pulso_bater(p_cliente);
  return public.nx_cv_json_dep(x)::json;
end $$;

-- ------------------------------------------------------------
-- plano 1500c · UCA-093 nx_auto_item: + descricao
--   (cópia da definição em vigor: 20261015a_plano1000b.sql)
-- ------------------------------------------------------------
create or replace function public.nx_auto_item(a public.nx_automacoes)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  -- plano 1500c · UCA-093: + descricao (comentário na linha de cima: o resto da linha original continua valendo)
  return jsonb_build_object('id', a.id, 'nome', a.nome, 'descricao', a.descricao, 'ativo', a.ativo, 'gatilho', a.gatilho, 'config', a.config,
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
-- plano 1500c · UCA-093 nx_automacao_salvar (a de 4 parâmetros, em vigor): grava a descrição quando vier (vazia apaga)
--   (cópia da definição em vigor: 20261015a_plano1000b.sql)
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
  -- plano 1500c · UCA-093: a descrição não passa pelo normalizar (texto livre, até 500)
  if p_auto ? 'descricao' then
    if char_length(coalesce(p_auto ->> 'descricao', '')) > 500 then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'descricao';
    end if;
    update public.nx_automacoes set descricao = nullif(btrim(coalesce(p_auto ->> 'descricao', '')), '') where id = a.id returning * into a;
  end if;
  return public.nx_auto_item(a)::json;
end $$;

-- ------------------------------------------------------------
-- plano 1500c · nx_relatorio_chamar: SC-057 um cliente com erro não para os outros · AC-055 tipo semanal (só quem ligou cfg.relSemanal)
--   (cópia da definição em vigor: 20261013c_operacao_indices.sql)
-- ------------------------------------------------------------
create or replace function public.nx_relatorio_chamar(p_tipo text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare c record; v_n int := 0; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_tipo not in ('diario', 'semanal', 'mensal') then raise exception 'dados_invalidos' using errcode = '22023', hint = 'tipo'; end if;
  for c in
    select x.id from public.nx_clientes x
     where x.ativo and x.status in ('ativo', 'teste')
       and (x.status <> 'teste' or x.teste_ate is null or x.teste_ate >= v_hoje)
       and not exists (select 1 from public.nx_orgs o where o.id = x.org_id and o.status in ('suspenso', 'cancelado'))
       and (p_tipo <> 'semanal' or coalesce(x.cfg ->> 'relSemanal', '') = 'true')   -- plano 1500c · AC-055
     order by x.nome, x.id
  loop
    begin
      perform public.nx_disparar('nx-relatorio', jsonb_build_object('tipo', p_tipo, 'cliente', c.id));
      v_n := v_n + 1;
    exception when others then
      raise warning 'nx_relatorio_chamar: %', sqlerrm;
      -- plano 1500c · SC-057: só a falta de funcoes_url (vale para todos) encerra; o erro de UM cliente não deixa os outros sem relatório
      if sqlerrm ilike '%funcoes_url%' then exit; end if;
    end;
  end loop;
  return v_n;
end $$;

-- ------------------------------------------------------------
-- plano 1500c · nx_saude_dados: SC-141 tarefas do pg_cron · SC-143 eventos atrasados · SC-145 crons ausentes · SC-147 1 consulta por tarefa · integrações com erro
--   (cópia da definição em vigor: 20261013c_operacao_indices.sql)
-- ------------------------------------------------------------
create or replace function public.nx_saude_dados()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tarefas json; v_cron int := null; v_http int := null; v_fila int; v_midia int; v_ia int; v_pausa boolean; v_pausados int;
  v_prob text[] := '{}'; r record;
  v_ev int; v_integ int; v_crons text[] := null; v_cron_atr text[] := null;   -- plano 1500c
begin
  select coalesce(json_agg(json_build_object('tarefa', t.tarefa, 'ultima_ok', t.ultima_ok, 'ultima_falha', t.ultima_falha,
                                             'prazo_h', t.prazo_h, 'atrasada', t.atrasada) order by t.tarefa), '[]'::json)
    into v_tarefas
    from (select p.tarefa, p.prazo_h,
                 x.ultima_ok, x.ultima_falha,
                 coalesce(x.ultima_ok, '-infinity'::timestamptz) < now() - make_interval(hours => p.prazo_h) as atrasada
            from (values ('nx-ciclo', 3), ('nx-relatorio', 26)) p(tarefa, prazo_h)
            -- plano 1500c · SC-147: uma leitura por tarefa (antes três subconsultas)
            cross join lateral (select max(e.inicio) filter (where e.ok) as ultima_ok,
                                       max(e.inicio) filter (where e.ok is not true and e.inicio > now() - interval '24 hours') as ultima_falha
                                  from public.nx_execucoes e where e.tarefa = p.tarefa) x) t;
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
  -- plano 1500c · SC-143: eventos de automação sem processar há mais de 10 min (índice nx_eventos_pendentes)
  select count(*)::int into v_ev from public.nx_eventos e where e.processado_em is null and e.criado_em < now() - interval '10 minutes';
  -- plano 1500c · SC-145: integrações de anúncio ligadas cuja última sincronização deu erro
  select count(*)::int into v_integ from public.nx_integracoes i where i.ativo and i.status ~* '^(erro|falha)';
  -- plano 1500c · SC-145: os jobs do pg_cron que o sistema precisa (num banco restaurado eles somem sem ninguém ver)
  begin
    execute $q$select coalesce(array_agg(x.nome order by x.nome), '{}'::text[])
                 from unnest(array['nx-ciclo', 'nx-fila', 'nx-faxina-saas', 'nx-automacoes', 'nx-relatorio-diario', 'nx-relatorio-mensal']) x(nome)
                where not exists (select 1 from cron.job j where j.jobname = x.nome)$q$ into v_crons;
  exception when others then v_crons := null;
  end;
  -- plano 1500c · SC-141: as tarefas que só o pg_cron registra (fila, CodeWords, automações, faxinas): última execução boa dentro do prazo
  begin
    execute $q$select coalesce(array_agg(format('%s sem execução boa há mais de %s min', x.nome, x.prazo_min) order by x.nome), '{}'::text[])
                 from (values ('nx-fila', 15), ('nx-codewords-sync', 30), ('nx-automacoes', 15), ('nx-faxina-saas', 1560), ('nx-faxina-auto', 1560)) x(nome, prazo_min)
                where exists (select 1 from cron.job j where j.jobname = x.nome and j.active)
                  and coalesce((select max(d.end_time) from cron.job_run_details d join cron.job j on j.jobid = d.jobid
                                 where j.jobname = x.nome and d.status = 'succeeded'), '-infinity'::timestamptz)
                      < now() - make_interval(mins => x.prazo_min)$q$ into v_cron_atr;
  exception when others then v_cron_atr := null;
  end;
  v_prob := v_prob || coalesce(v_cron_atr, '{}'::text[]);
  if v_ev > 0 then v_prob := v_prob || format('%s eventos de automação parados há mais de 10 min', v_ev); end if;
  if v_integ > 0 then v_prob := v_prob || format('%s integrações de anúncio com erro na última sincronização', v_integ); end if;
  if cardinality(v_crons) > 0 then v_prob := v_prob || format('agendamentos ausentes no pg_cron: %s', array_to_string(v_crons, ', ')); end if;
  if coalesce(v_cron, 0) > 0 then v_prob := v_prob || format('%s execuções do cron falharam em 24 h', v_cron); end if;
  if coalesce(v_http, 0) > 20 then v_prob := v_prob || format('%s chamadas às funções sem resposta boa em 24 h', v_http); end if;
  if v_fila > 0 then v_prob := v_prob || format('%s mensagens na fila atrasadas há mais de 30 min', v_fila); end if;
  if v_midia > 0 then v_prob := v_prob || format('%s mídias recebidas presas em «baixando»', v_midia); end if;
  if v_ia > 0 then v_prob := v_prob || format('%s decisões de IA adiadas (chave ou cota)', v_ia); end if;
  if v_pausa then v_prob := v_prob || 'envios automáticos PAUSADOS na plataforma'::text; end if;
  return json_build_object('em', now(), 'tarefas', v_tarefas, 'cron_falhas_24h', v_cron, 'http_falhas_24h', v_http,
                           'fila_atrasada', v_fila, 'midia_presa', v_midia, 'ia_adiada', v_ia,
                           'envios_pausados', v_pausa, 'clientes_pausados', v_pausados,
                           'eventos_atrasados', v_ev, 'integracoes_erro', v_integ, 'crons_ausentes', to_json(v_crons), 'crons_atrasados', to_json(v_cron_atr),   -- plano 1500c
                           'problemas', to_json(v_prob));
end $$;

-- ------------------------------------------------------------
-- plano 1500c · nx_saas_faxina: SC-190 erros do aparelho > 30 d · SC-118 notificações NÃO lidas > 180 d · SC-122 histórico do pg_cron em lotes
--   (cópia da definição em vigor: 20261013e_funcoes_seguranca.sql)
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
  n_ras int; n_trv int; n_exe int; n_http int := null; n_pri int;
  n_res int; n_cwt int; n_tax int; n_iac int;
  n_erf int; n_nnl int; n_cron int := 0; v_k int := 0;   -- plano 1500c
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
  -- plano 1000 (SV-123): reservas de IA vencidas há > 7 d, contador por minuto do aparelho > 2 h, contadores nx_taxa > 2 d (as
  -- chaves por IP do rastreio não voltam) e o cache de resumo da IA > 1 d
  n_res := public.nx_saas_faxina_lotes('nx_ia_reservas', $w$expira_em < now() - interval '7 days'$w$);
  n_cwt := public.nx_saas_faxina_lotes('nx_codewords_taxa', $w$minuto < now() - interval '2 hours'$w$);
  n_tax := public.nx_saas_faxina_lotes('nx_taxa', $w$minuto < now() - interval '2 days'$w$);
  n_iac := public.nx_saas_faxina_lotes('nx_ia_cache', $w$criado_em < now() - interval '1 day'$w$);
  -- SV-116: preenche a 1ª entrada das conversas antigas aos poucos
  n_pri := public.nx_conversas_primeira_preencher(20000);
  -- plano 1500c · SC-190 / SC-118
  delete from public.nx_erros_front where ultimo_em < now() - interval '30 days';
  get diagnostics n_erf = row_count;
  n_nnl := public.nx_saas_faxina_lotes('nx_notificacoes', $w$lida_em is null and criado_em < now() - interval '180 days'$w$);

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
    -- plano 1500c · SC-122: em lotes de 10.000 (um delete só segurava a tabela do cron por minutos)
    loop
      delete from cron.job_run_details where runid in
        (select d.runid from cron.job_run_details d where d.end_time < now() - interval '3 days' limit 10000);
      get diagnostics v_n = row_count;
      n_cron := n_cron + v_n; v_k := v_k + 1;
      exit when v_n < 10000 or v_k >= 50;
    end loop;
  exception when others then null;
  end;

  return json_build_object('eventos', n_ev, 'execucoes', n_ex, 'notificacoes', n_no, 'fila', n_fi, 'convites', n_cv,
                           'senha_links', n_sl, 'midia_lixo', n_ml, 'etiquetas_orfas', n_etq,
                           'sessoes', n_ses, 'requisicoes', n_req, 'envio_refs', n_refs, 'codewords_status_pendentes', n_cwp,
                           'login_falhas', n_login,
                           'rastreio', n_ras, 'travas', n_trv, 'execucoes_tarefas', n_exe, 'http_respostas', n_http,
                           'primeira_entrada', n_pri,
                           'ia_reservas', n_res, 'codewords_taxa', n_cwt, 'taxa', n_tax, 'ia_cache', n_iac,
                           'erros_front', n_erf, 'notificacoes_nao_lidas', n_nnl, 'cron_historico', n_cron);   -- plano 1500c
end $$;

-- ------------------------------------------------------------
-- plano 1500c · nx_senha_redefinir: SC-001 já entra (sessão nova {token, expira_em}) · SC-009 limite por IP · SC-010 regra da senha
--   · SC-012 conta suspensa / organização parada não redefine · SC-019 auditoria
--   (reescrita a partir da definição em vigor: 20260928c_plataforma.sql — mesma assinatura, mesmos erros para o front)
-- ------------------------------------------------------------
create or replace function public.nx_senha_redefinir(p_link text, p_senha text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.nx_senha_links; k public.nx_contas; s json;
  v_ip text := public.nx_login_ip();
  v_rest boolean := nullif(current_setting('request.headers', true), '') is not null;
  v_min int;
begin
  -- SC-009: 10 links errados em 15 min por IP → espera (o token tem 256 bits; o limite tira o incentivo de tentar)
  if v_ip is not null then
    v_min := public.nx_login_bloqueio('redefinir:' || v_ip, 10, interval '15 minutes');
    if v_min > 0 then raise exception 'muitas_tentativas' using errcode = '22023', hint = v_min::text; end if;
  end if;
  if p_link is not null and p_link ~ '^[0-9a-fA-F]{64}$' then
    select * into l from public.nx_senha_links where token_hash = public.nx_hash(lower(p_link)) for update;
  end if;
  if l.token_hash is not null and l.usado_em is null and l.expira_em > now() then
    select * into k from public.nx_contas where id = l.conta_id;
  end if;
  -- SC-012: conta suspensa ou organização suspensa/cancelada — o link não serve (mesma resposta de link vencido)
  if k.id is null or k.suspenso_em is not null
     or exists (select 1 from public.nx_orgs o where o.id = k.org_id and o.status in ('suspenso', 'cancelado')) then
    if v_ip is not null and v_rest then
      -- a falha conta no limite do IP (a transação commita) e o front recebe o mesmo que receberia do raise
      perform public.nx_login_falha_registrar(array['redefinir:' || v_ip]);
      perform set_config('response.status', '400', true);
      return json_build_object('code', '22023', 'message', 'link_invalido', 'details', null, 'hint', null);
    end if;
    raise exception 'link_invalido' using errcode = '22023';
  end if;
  perform public.nx_senha_validar(p_senha);   -- SC-010
  update public.nx_contas set senha_hash = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)), trocar_senha = false
   where id = l.conta_id returning * into k;
  delete from public.nx_sessoes where conta_id = l.conta_id;
  update public.nx_senha_links set usado_em = now() where conta_id = l.conta_id and usado_em is null;
  perform public.nx_auditar(k.org_id, null, k.id, 'senha_redefinida',
                            jsonb_build_object('ip', case when v_ip is not null then left(public.nx_hash(v_ip), 12) end));
  -- SC-001: quem acabou de provar que tem o link entra direto (conta pendente de aprovação: só {ok}, entra depois)
  if not k.aprovado then return json_build_object('ok', true); end if;
  s := public.nx_sessao_criar(k.id);
  return json_build_object('ok', true, 'token', s ->> 'token', 'expira_em', s -> 'expira_em', 'nome', k.nome, 'papel', k.papel);
end $$;

-- ------------------------------------------------------------
-- plano 1500c · nx_senha_trocar: SC-013 limite (5 senhas atuais erradas em 15 min) · SC-010 regra da senha
--   · UCB-114 devolve sessoes_encerradas · SC-019 auditoria
--   (reescrita a partir da definição em vigor: 20260928c_plataforma.sql — mesma assinatura)
-- ------------------------------------------------------------
create or replace function public.nx_senha_trocar(p_token text, p_atual text, p_nova text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.nx_contas := public.nx_conta_do_token(p_token);
  v_rest boolean := nullif(current_setting('request.headers', true), '') is not null;
  v_min int; v_n int;
begin
  -- SC-013: um token roubado não vira oráculo para descobrir a senha (e com ela entrar em outros lugares)
  v_min := public.nx_login_bloqueio('senha:' || c.id::text, 5, interval '15 minutes');
  if v_min > 0 then raise exception 'muitas_tentativas' using errcode = '22023', hint = v_min::text; end if;
  if c.senha_hash <> extensions.crypt(coalesce(p_atual, ''), c.senha_hash) then
    perform pg_sleep(0.4);
    if v_rest then
      perform public.nx_login_falha_registrar(array['senha:' || c.id::text]);
      perform set_config('response.status', '403', true);   -- o mesmo status do raise 28000
      return json_build_object('code', '28000', 'message', 'credenciais_invalidas', 'details', null, 'hint', null);
    end if;
    raise exception 'credenciais_invalidas' using errcode = '28000';
  end if;
  perform public.nx_senha_validar(p_nova);   -- SC-010
  update public.nx_contas set senha_hash = extensions.crypt(p_nova, extensions.gen_salt('bf', 10)), trocar_senha = false
   where id = c.id;
  -- as outras sessões caem; esta continua
  delete from public.nx_sessoes where conta_id = c.id and token_hash <> public.nx_hash(p_token);
  get diagnostics v_n = row_count;
  delete from public.nx_login_falhas where chave = 'senha:' || c.id::text;
  perform public.nx_auditar(c.org_id, null, c.id, 'senha_trocada', jsonb_build_object('sessoes_encerradas', v_n));
  return json_build_object('ok', true, 'sessoes_encerradas', v_n);   -- UCB-114
end $$;

-- ------------------------------------------------------------
-- 5. Agenda (idempotente) — AC-055: relatório semanal às segundas 8h30 (SP), só para quem ligou cfg.relSemanal; SC-131: aviso do teste.
--    Só cria se não existir (agenda e comando de quem já existe ficam como estão).
-- ------------------------------------------------------------
do $$
begin
  -- SC-131 / UC-024: aviso do fim do teste, todo dia às 9h (SP)
  if not exists (select 1 from cron.job where jobname = 'nx-teste-avisos') then
    perform cron.schedule('nx-teste-avisos', '0 12 * * *', 'select public.nx_teste_avisar()');
  end if;
  if not exists (select 1 from cron.job where jobname = 'nx-relatorio-semanal') then
    perform cron.schedule('nx-relatorio-semanal', '30 11 * * 1', $c$select public.nx_relatorio_chamar('semanal')$c$);
  end if;
end $$;

-- ------------------------------------------------------------
-- 6. Permissões. As cópias de mesma assinatura mantêm as da origem. As RPCs novas do painel (p_token, passam pelo nx_ctx ou
--    pela sessão): anon + service_role. As internas: só service_role. Nunca authenticated.
-- ------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.nx_sessoes_listar(text)',
    'public.nx_sessao_encerrar(text, text)',
    'public.nx_conta_suspender(text, uuid, boolean)',
    'public.nx_acesso_suspender(text, uuid, uuid, boolean)',
    'public.nx_convite_regerar(text, uuid, uuid)',
    'public.nx_erro_cliente_registrar(text, jsonb)',
    'public.nx_evento_registrar(text, text, jsonb)',
    'public.nx_titular_localizar(text, uuid, text)',
    'public.nx_titular_exportar(text, uuid, bigint)',
    'public.nx_ia_custo_resumo(text, uuid)',
    'public.nx_fila_resumo(text, uuid)',
    'public.nx_agenda_confirmar(text, uuid, bigint, text)',
    'public.nx_suporte_entrar(text, uuid, text)'] loop
    execute format('revoke all on function %s from public, authenticated', f);
    execute format('grant execute on function %s to anon, service_role', f);
  end loop;
  foreach f in array array[
    'public.nx_senha_validar(text)',
    'public.nx_sessao_criar(uuid)',
    'public.nx_trava_estender(text, integer, text)',
    'public.nx_ia_franquia_avisar(uuid, integer, timestamptz)',
    'public.nx_teste_avisar()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  -- a tabela nova: RLS ligado e sem política (só as funções security definer leem/gravam)
  revoke all on table public.nx_erros_front from public, anon, authenticated;
  raise notice 'nx_revogar_authenticated: % funções', public.nx_revogar_authenticated();
end $$;

insert into public.nx_versao_banco (nome) values ('20261022a_plano1500c')
on conflict (nome) do update set aplicada_em = now();

notify pgrst, 'reload schema';
