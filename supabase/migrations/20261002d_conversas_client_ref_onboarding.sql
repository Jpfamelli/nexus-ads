-- ============================================================
-- ÓRBITA — 20261002d_conversas_client_ref_onboarding.sql · frente D (Conversas, Início, Configurações) · plano de 01/10/2026
--
-- M36  Nada se perde no chat: ENVIO IDEMPOTENTE. O painel manda um `client_ref` por intenção de envio; o MESMO client_ref repetido
--      (tentativa depois de um timeout, fila de saída que reenvia ao voltar a internet) devolve a mensagem que já foi gravada e NÃO faz
--      outro envio à Meta/CodeWords. Peças:
--        · nx_mensagens.client_ref (texto de 8 a 80 caracteres [A-Za-z0-9:_.-]) + índice ÚNICO PARCIAL (cliente_id, client_ref);
--        · nx_envio_refs (cliente, ref) → a RESERVA do ref, feita ANTES de falar com o canal: dois pedidos simultâneos com o mesmo
--          ref (F5, internet que cai e volta, duas abas) não enviam em dobro, porque só UM consegue inserir a linha;
--        · nx_cv_ref_reservar(cliente, conversa, ref) → {"estado": "novo" | "gravada" (+ "mensagem") | "em_andamento" | "antiga"};
--        · nx_cv_ref_liberar(cliente, ref)          → solta a reserva SEM mensagem (erro em que com certeza nada saiu);
--        · nx_cv_ref_marcar(cliente, mensagem, ref) → grava o ref na saída recém-criada (false se outra saída já o tem) e aponta
--          a reserva para ela;
--        · nx_cv_ref_ver(cliente, conversa, ref)    → só consulta a mensagem já gravada (ou null). Fica por compatibilidade.
--      São funções NOVAS ao lado de nx_cv_saida (que não foi tocada: o que roda hoje continua igual); quem chama é o
--      supabase/functions/_compartilhado/enviar.js (service_role, como as demais internas).
--
-- M32  Checklist "Deixe o Órbita pronto": nx_onboarding_estado(p_token, p_cliente) — RPC SÓ DE LEITURA (admin) com os 11 itens
--      calculados de tabelas que já existem. NUNCA lê segredo: de cada chave/token só se pergunta "existe?" (is not null).
--      Itens, na ordem recomendada: 1 chave salva · 2 aparelho pareado · 3 recebimento conferido · 4 IA validada ou "receber direto" ·
--      5 mensagem enviada · 6 departamento com horário · 7 faixas da agenda · 8 script do site com contato recebido (OPCIONAL:
--      nem toda empresa tem site) · 9 colega convidado · 10 funil ajustado · 11 anúncios ligados (OPCIONAL).
--      Os 2 opcionais não contam para o 100 %: são 9 obrigatórios de 11.
--
-- ADITIVA e idempotente: add column/create table/create index if not exists, create or replace. Nada de drop, nenhuma linha de
-- dado alterada, nada em nx_config. Testes: supabase/testes/15_conversas_client_ref_onboarding.sql (begin … rollback; termina em
-- exceção «OK_15…»).
-- Publicação: só com o ok do João e a trava da Ponte (AGENTS.md). NÃO aplicada.
-- ============================================================

-- O ALTER de nx_mensagens pede trava exclusiva: se a tabela estiver ocupada por uma transação longa, a migração desiste em 5 s em
-- vez de enfileirar e segurar o webhook e o envio atrás dela. Vale até o fim da transação da migração (arquivo rodado inteiro ou
-- por EXECUTE dentro de um bloco DO); fora de transação o Postgres só avisa e segue.
set local lock_timeout = '5s';

-- ------------------------------------------------------------
-- 1. client_ref (M36)
-- ------------------------------------------------------------
alter table public.nx_mensagens add column if not exists client_ref text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'nx_mensagens_client_ref_formato') then
    alter table public.nx_mensagens
      add constraint nx_mensagens_client_ref_formato check (client_ref is null or client_ref ~ '^[A-Za-z0-9:_.-]{8,80}$');
  end if;
end $$;

create unique index if not exists nx_mensagens_client_ref_uq on public.nx_mensagens (cliente_id, client_ref) where client_ref is not null;

-- Reserva do ref: a linha nasce ANTES do envio (sem mensagem) e ganha a mensagem quando a saída é gravada. RLS ligada e sem
-- política: só as funções abaixo (security definer) leem e escrevem.
create table if not exists public.nx_envio_refs (
  cliente_id  uuid not null references public.nx_clientes(id) on delete cascade,
  client_ref  text not null check (client_ref ~ '^[A-Za-z0-9:_.-]{8,80}$'),
  conversa_id bigint not null,
  mensagem_id bigint,
  criado_em   timestamptz not null default now(),
  primary key (cliente_id, client_ref)
);
create index if not exists nx_envio_refs_criado_idx on public.nx_envio_refs (criado_em);
alter table public.nx_envio_refs enable row level security;
revoke all on table public.nx_envio_refs from public, anon, authenticated;

-- Reserva o ref ANTES de falar com o canal. Estados:
--   novo          = este pedido inseriu a reserva: pode enviar;
--   gravada       = já existe saída para o ref (vem em "mensagem"): devolver essa, sem enviar;
--   em_andamento  = outro pedido reservou há menos de 150 s (o tempo de vida de uma Edge Function) e ainda não gravou: esperar;
--   antiga        = reservado há mais de 150 s e sem mensagem: o envio pode ter saído; NUNCA reenviar sozinho.
-- O ref de OUTRA conversa é erro do cliente (dados_invalidos, hint client_ref), como em nx_cv_ref_ver.
create or replace function public.nx_cv_ref_reservar(p_cliente uuid, p_conversa bigint, p_ref text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.nx_mensagens;
  r public.nx_envio_refs;
begin
  if p_ref is null or p_ref !~ '^[A-Za-z0-9:_.-]{8,80}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'client_ref';
  end if;
  if p_cliente is null or p_conversa is null then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'conversa';
  end if;
  -- faxina barata e limitada: reservas com mais de 7 dias saem (o painel desiste da fila em 7 dias); nunca a do próprio pedido.
  -- skip locked: duas faxinas ao mesmo tempo não esperam uma pela outra.
  delete from public.nx_envio_refs x where x.ctid in (
    select y.ctid from public.nx_envio_refs y
     where y.criado_em < now() - interval '7 days' and not (y.cliente_id = p_cliente and y.client_ref = p_ref)
     limit 50 for update skip locked);
  -- a saída que já leva o ref vale sempre (inclusive as gravadas sem reserva e as que a faxina acima já esqueceu)
  select * into m from public.nx_mensagens where cliente_id = p_cliente and client_ref = p_ref;
  if m.id is not null then
    if m.conversa_id <> p_conversa then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'client_ref';
    end if;
    return json_build_object('estado', 'gravada', 'mensagem', public.nx_wa_msg_json(m.id));
  end if;
  -- só UM pedido insere; quem chega junto espera este insert terminar e cai no "já existe" abaixo
  insert into public.nx_envio_refs (cliente_id, client_ref, conversa_id) values (p_cliente, p_ref, p_conversa)
  on conflict (cliente_id, client_ref) do nothing;
  if found then return json_build_object('estado', 'novo'); end if;
  select * into r from public.nx_envio_refs where cliente_id = p_cliente and client_ref = p_ref;
  -- o dono liberou a reserva entre o insert e esta leitura: quem repete tenta de novo daqui a pouco
  if r.client_ref is null then return json_build_object('estado', 'em_andamento'); end if;
  if r.conversa_id <> p_conversa then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'client_ref';
  end if;
  if r.mensagem_id is not null then
    select * into m from public.nx_mensagens where id = r.mensagem_id and cliente_id = p_cliente;
    -- a mensagem foi apagada depois (contato excluído): não há o que devolver e não se envia de novo
    if m.id is null then return json_build_object('estado', 'antiga'); end if;
    return json_build_object('estado', 'gravada', 'mensagem', public.nx_wa_msg_json(m.id));
  end if;
  if r.criado_em > now() - interval '150 seconds' then return json_build_object('estado', 'em_andamento'); end if;
  return json_build_object('estado', 'antiga');
end $$;

-- solta a reserva que ainda NÃO tem mensagem (erro antes de falar com o canal: com certeza nada saiu); true = soltou
create or replace function public.nx_cv_ref_liberar(p_cliente uuid, p_ref text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ref is null or p_ref !~ '^[A-Za-z0-9:_.-]{8,80}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'client_ref';
  end if;
  delete from public.nx_envio_refs where cliente_id = p_cliente and client_ref = p_ref and mensagem_id is null;
  return found;
end $$;

-- a mensagem já gravada para este ref (null = ainda não há); o ref de OUTRA conversa é erro do cliente.
-- Só consulta: quem segura o envio em dobro é nx_cv_ref_reservar. Fica para quem ainda chama (compatibilidade).
create or replace function public.nx_cv_ref_ver(p_cliente uuid, p_conversa bigint, p_ref text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare m public.nx_mensagens;
begin
  if p_ref is null or p_ref !~ '^[A-Za-z0-9:_.-]{8,80}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'client_ref';
  end if;
  select * into m from public.nx_mensagens where cliente_id = p_cliente and client_ref = p_ref;
  if m.id is null then return null; end if;
  if m.conversa_id <> p_conversa then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'client_ref';
  end if;
  return public.nx_wa_msg_json(m.id);
end $$;

-- grava o ref na saída que acabou de ser criada; false = a mensagem não levou o ref (já tinha um, não é saída deste cliente, ou
-- outra saída já o tem). A reserva passa a apontar esta saída mesmo quando a mensagem não pôde levar o ref: a repetição devolve
-- a mensagem em vez de ficar "em andamento" para sempre.
create or replace function public.nx_cv_ref_marcar(p_cliente uuid, p_mensagem bigint, p_ref text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_ok boolean;
begin
  if p_ref is null or p_ref !~ '^[A-Za-z0-9:_.-]{8,80}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'client_ref';
  end if;
  begin
    update public.nx_mensagens set client_ref = p_ref
     where id = p_mensagem and cliente_id = p_cliente and direcao = 'out' and client_ref is null;
    v_ok := found;
  exception when unique_violation then
    v_ok := false;
  end;
  -- só saída ('out') deste cliente e da MESMA conversa da reserva
  update public.nx_envio_refs r set mensagem_id = p_mensagem
   where r.cliente_id = p_cliente and r.client_ref = p_ref and r.mensagem_id is null
     and exists (select 1 from public.nx_mensagens m
                  where m.id = p_mensagem and m.cliente_id = p_cliente and m.direcao = 'out' and m.conversa_id = r.conversa_id);
  return v_ok;
end $$;

revoke all on function public.nx_cv_ref_reservar(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.nx_cv_ref_reservar(uuid, bigint, text) to service_role;
revoke all on function public.nx_cv_ref_liberar(uuid, text) from public, anon, authenticated;
grant execute on function public.nx_cv_ref_liberar(uuid, text) to service_role;
revoke all on function public.nx_cv_ref_ver(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.nx_cv_ref_ver(uuid, bigint, text) to service_role;
revoke all on function public.nx_cv_ref_marcar(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.nx_cv_ref_marcar(uuid, bigint, text) to service_role;

-- ------------------------------------------------------------
-- 2. nx_onboarding_estado (M32) — leitura, só admin
-- ------------------------------------------------------------
create or replace function public.nx_onboarding_estado(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  f_chave boolean; f_pareado boolean; f_receb boolean; f_ia boolean; f_msg boolean; f_dep boolean; f_agenda boolean;
  f_site boolean; f_colega boolean; f_funil boolean; f_ads boolean;
  v_ult_site timestamptz; v_canal uuid; v_vert text; v_mod_funis int; v_mod_est int; v_funil_base timestamptz;
  v_itens jsonb; v_total int := 11; v_feitos int; v_obrig int := 9; v_obrig_feitos int; v_pct int;
begin
  -- 1-4: os números do cliente (CodeWords: aparelho; Meta: token e app inscrito). Só "existe/não existe", nunca o valor.
  select coalesce(bool_or((coalesce(k.provedor, 'meta') = 'codewords' and k.codewords_api_segredo is not null)
                          or (coalesce(k.provedor, 'meta') <> 'codewords' and k.token_segredo is not null)), false),
         coalesce(bool_or((coalesce(k.provedor, 'meta') = 'codewords' and k.codewords_conectado is true)
                          or (coalesce(k.provedor, 'meta') <> 'codewords' and k.status = 'ativo')), false),
         coalesce(bool_or((coalesce(k.provedor, 'meta') = 'codewords' and k.codewords_numero_conferido is true)
                          or (coalesce(k.provedor, 'meta') <> 'codewords' and k.app_inscrito is true)), false),
         coalesce(bool_or((coalesce(k.provedor, 'meta') = 'codewords' and k.codewords_rota = 'direta')
                          or (coalesce(k.provedor, 'meta') = 'codewords' and k.codewords_rota = 'fluxo' and k.codewords_service_id is not null and k.ia_ligada is true
                              and k.codewords_numero_conferido is true)
                          or (coalesce(k.provedor, 'meta') <> 'codewords' and k.status = 'ativo')), false)
    into f_chave, f_pareado, f_receb, f_ia
    from public.nx_canais k where k.cliente_id = p_cliente;
  -- o canal que ainda pede ação (para o "Fazer agora" abrir o assistente certo): o 1º que não está pronto, senão o 1º
  select k.id into v_canal from public.nx_canais k where k.cliente_id = p_cliente
   order by (case when coalesce(k.provedor, 'meta') = 'codewords' then coalesce(k.codewords_numero_conferido, false) else coalesce(k.app_inscrito, false) end), k.criado_em
   limit 1;

  -- 5: já saiu mensagem de verdade numa conversa — notas internas e avisos do sistema não contam. O teste do assistente do número
  --    (nx-codewords, enviar_teste) ainda NÃO conta: ele não grava mensagem nem deixa marca própria no canal; fica para quando houver.
  f_msg := exists (select 1 from public.nx_mensagens m
                    where m.cliente_id = p_cliente and m.direcao = 'out' and m.tipo not in ('nota', 'sistema')
                      and m.status in ('enviada', 'entregue', 'lida'));
  -- 6: departamento ativo com horário definido (horario nulo = "24 horas", ou seja, nunca configurado). O modelo odonto já traz o horário da Recepção.
  f_dep := exists (select 1 from public.nx_departamentos d where d.cliente_id = p_cliente and d.ativo and d.horario is not null);
  -- 7: a agenda tem horário próprio ou herda o do departamento (a fonte "padrao" é o que vale sem configurar)
  f_agenda := coalesce(public.nx_agenda_cfg(p_cliente) ->> 'horario_fonte', 'padrao') <> 'padrao';
  -- 8 (opcional: nem toda empresa tem site): o script do site gravou visitas e alguma delas virou contato (usado_em)
  select max(r.usado_em) into v_ult_site from public.nx_rastreio r where r.cliente_id = p_cliente and r.usado_em is not null;
  f_site := v_ult_site is not null;
  -- 9: tem mais alguém além de quem configura (acesso ou convite ainda válido)
  f_colega := (select count(*) from public.nx_acessos a where a.cliente_id = p_cliente)
            + (select count(*) from public.nx_convites c where c.cliente_id = p_cliente and c.usado_em is null and not c.revogado
                                                          and c.expira_em > now() and c.tentativas < 5) >= 2;
  -- 10: o funil saiu do modelo da vertical (nx_aplicar_modelo semeia 2 funis e 12/11/10 etapas em odonto/oficina/loja, 1 funil e 7 etapas no genérico):
  --     outro número de funis ativos ou de etapas, ou qualquer funil/etapa criado mais de 1 hora depois do PRIMEIRO funil do cliente.
  --     A referência é o primeiro funil, não a criação do cliente: nas empresas antigas o modelo foi semeado meses depois do cadastro
  --     (migração 20260928a) e o passo apareceria como feito sem ninguém ter mexido. Só renomear não é detectável (o botão "Já está
  --     bom" da tela marca localmente).
  select coalesce(nullif(c.vertical, ''), 'generico') into v_vert from public.nx_clientes c where c.id = p_cliente;
  v_mod_funis := case when v_vert in ('odonto', 'oficina', 'loja') then 2 else 1 end;
  v_mod_est := case v_vert when 'odonto' then 12 when 'oficina' then 11 when 'loja' then 10 else 7 end;
  select min(f.criado_em) into v_funil_base from public.nx_funis f where f.cliente_id = p_cliente;
  f_funil := coalesce((select count(*) from public.nx_funis f where f.cliente_id = p_cliente and f.ativo) <> v_mod_funis
          or (select count(*) from public.nx_estagios e where e.cliente_id = p_cliente) <> v_mod_est
          or exists (select 1 from public.nx_funis f
                      where f.cliente_id = p_cliente and f.criado_em > v_funil_base + interval '1 hour')
          or exists (select 1 from public.nx_estagios e
                      where e.cliente_id = p_cliente and e.criado_em > v_funil_base + interval '1 hour'), false);
  -- 11 (opcional): Meta ou Google ligados (só se a credencial existe, nunca o conteúdo)
  f_ads := exists (select 1 from public.nx_integracoes i where i.cliente_id = p_cliente and i.ativo and i.cred is not null and i.cred <> '{}'::jsonb);

  v_itens := jsonb_build_array(
    jsonb_build_object('id', 'chave_codewords', 'rotulo', 'Chave do WhatsApp salva', 'feito', f_chave, 'opcional', false, 'canal_id', v_canal),
    jsonb_build_object('id', 'aparelho_pareado', 'rotulo', 'Aparelho pareado', 'feito', f_pareado, 'opcional', false, 'canal_id', v_canal),
    jsonb_build_object('id', 'recebimento', 'rotulo', 'Recebimento conferido', 'feito', f_receb, 'opcional', false, 'canal_id', v_canal),
    jsonb_build_object('id', 'ia_ou_direto', 'rotulo', 'IA validada ou receber direto', 'feito', f_ia, 'opcional', false, 'canal_id', v_canal),
    jsonb_build_object('id', 'mensagem_teste', 'rotulo', 'Mensagem de teste enviada', 'feito', f_msg, 'opcional', false, 'canal_id', v_canal),
    jsonb_build_object('id', 'departamento_horario', 'rotulo', 'Departamento com horário', 'feito', f_dep, 'opcional', false),
    jsonb_build_object('id', 'agenda_faixas', 'rotulo', 'Faixas da agenda', 'feito', f_agenda, 'opcional', false),
    jsonb_build_object('id', 'script_site', 'rotulo', 'Script do site com contato recebido', 'feito', f_site, 'opcional', true, 'ultimo_em', v_ult_site),
    jsonb_build_object('id', 'colega_convidado', 'rotulo', 'Colega convidado', 'feito', f_colega, 'opcional', false),
    jsonb_build_object('id', 'funil_ajustado', 'rotulo', 'Funil ajustado', 'feito', f_funil, 'opcional', false),
    jsonb_build_object('id', 'anuncios_ligados', 'rotulo', 'Anúncios ligados', 'feito', f_ads, 'opcional', true));

  select count(*) filter (where (x ->> 'feito')::boolean),
         count(*) filter (where (x ->> 'feito')::boolean and not (x ->> 'opcional')::boolean)
    into v_feitos, v_obrig_feitos
    from jsonb_array_elements(v_itens) x;
  v_pct := round(v_obrig_feitos * 100.0 / v_obrig);
  return json_build_object('total', v_total, 'feitos', v_feitos, 'obrigatorios', v_obrig, 'obrigatorios_feitos', v_obrig_feitos,
                           'pct', v_pct, 'completo', v_obrig_feitos = v_obrig, 'itens', v_itens);
end $$;

revoke all on function public.nx_onboarding_estado(text, uuid) from public, anon, authenticated;
grant execute on function public.nx_onboarding_estado(text, uuid) to anon, authenticated, service_role;

-- o PostgREST só enxerga as funções novas depois de recarregar o cache (senão respondem 404 e o envio cai no modo sem reserva)
notify pgrst, 'reload schema';
