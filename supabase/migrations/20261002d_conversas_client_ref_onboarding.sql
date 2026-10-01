-- ============================================================
-- ÓRBITA — 20261002d_conversas_client_ref_onboarding.sql · frente D (Conversas, Início, Configurações) · plano de 01/10/2026
--
-- M36  Nada se perde no chat: ENVIO IDEMPOTENTE. O painel manda um `client_ref` por intenção de envio; o MESMO client_ref repetido
--      (tentativa depois de um timeout, fila de saída que reenvia ao voltar a internet) devolve a mensagem que já foi gravada e NÃO faz
--      outro envio à Meta/CodeWords. Peças:
--        · nx_mensagens.client_ref (texto de 8 a 80 caracteres [A-Za-z0-9:_.-]) + índice ÚNICO PARCIAL (cliente_id, client_ref);
--        · nx_cv_ref_ver(cliente, conversa, ref)    → a mensagem já gravada para esse ref (ou null), ANTES de enviar;
--        · nx_cv_ref_marcar(cliente, mensagem, ref) → grava o ref na saída recém-criada (false se outra saída já o tem).
--      São funções NOVAS ao lado de nx_cv_saida (que não foi tocada: o que roda hoje continua igual); quem chama é o
--      supabase/functions/_compartilhado/enviar.js (service_role, como as demais internas).
--
-- M32  Checklist "Deixe o Órbita pronto": nx_onboarding_estado(p_token, p_cliente) — RPC SÓ DE LEITURA (admin) com os 11 itens
--      calculados de tabelas que já existem. NUNCA lê segredo: de cada chave/token só se pergunta "existe?" (is not null).
--      Itens, na ordem recomendada: 1 chave salva · 2 aparelho pareado · 3 recebimento conferido · 4 IA validada ou "receber direto" ·
--      5 mensagem enviada · 6 departamento com horário · 7 faixas da agenda · 8 script do site com contato recebido ·
--      9 colega convidado · 10 funil ajustado · 11 anúncios ligados (OPCIONAL, não conta para o 100 %).
--
-- ADITIVA e idempotente: add column/create index if not exists, create or replace. Nada de drop, nenhuma linha de dado alterada,
-- nada em nx_config. Testes: supabase/testes/15_conversas_client_ref_onboarding.sql (begin … rollback; termina em exceção «OK_15…»).
-- Publicação: só com o ok do João e a trava da Ponte (AGENTS.md). NÃO aplicada.
-- ============================================================

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

-- a mensagem já gravada para este ref (null = ainda não há); o ref de OUTRA conversa é erro do cliente
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

-- grava o ref na saída que acabou de ser criada; false = já existe outra saída com esse ref (corrida: a outra ganhou)
create or replace function public.nx_cv_ref_marcar(p_cliente uuid, p_mensagem bigint, p_ref text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ref is null or p_ref !~ '^[A-Za-z0-9:_.-]{8,80}$' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'client_ref';
  end if;
  begin
    update public.nx_mensagens set client_ref = p_ref
     where id = p_mensagem and cliente_id = p_cliente and direcao = 'out' and client_ref is null;
    return found;
  exception when unique_violation then
    return false;
  end;
end $$;

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
  v_ult_site timestamptz; v_canal uuid; v_vert text; v_mod_funis int; v_mod_est int;
  v_itens jsonb; v_total int := 11; v_feitos int; v_obrig int := 10; v_obrig_feitos int; v_pct int;
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

  -- 5: já saiu mensagem de verdade (teste ou conversa) — notas internas e avisos do sistema não contam
  f_msg := exists (select 1 from public.nx_mensagens m
                    where m.cliente_id = p_cliente and m.direcao = 'out' and m.tipo not in ('nota', 'sistema')
                      and m.status in ('enviada', 'entregue', 'lida'));
  -- 6: departamento ativo com horário definido (horario nulo = "24 horas", ou seja, nunca configurado). O modelo odonto já traz o horário da Recepção.
  f_dep := exists (select 1 from public.nx_departamentos d where d.cliente_id = p_cliente and d.ativo and d.horario is not null);
  -- 7: a agenda tem horário próprio ou herda o do departamento (a fonte "padrao" é o que vale sem configurar)
  f_agenda := coalesce(public.nx_agenda_cfg(p_cliente) ->> 'horario_fonte', 'padrao') <> 'padrao';
  -- 8: o script do site gravou visitas e alguma delas virou contato (usado_em)
  select max(r.usado_em) into v_ult_site from public.nx_rastreio r where r.cliente_id = p_cliente and r.usado_em is not null;
  f_site := v_ult_site is not null;
  -- 9: tem mais alguém além de quem configura (acesso ou convite ainda válido)
  f_colega := (select count(*) from public.nx_acessos a where a.cliente_id = p_cliente)
            + (select count(*) from public.nx_convites c where c.cliente_id = p_cliente and c.usado_em is null and not c.revogado
                                                          and c.expira_em > now() and c.tentativas < 5) >= 2;
  -- 10: o funil saiu do modelo da vertical (nx_aplicar_modelo semeia 2 funis e 12/11/10 etapas em odonto/oficina/loja, 1 funil e 7 etapas no genérico):
  --     outro número de funis ativos ou de etapas, ou qualquer funil/etapa criado depois da implantação. Só renomear não é detectável (o botão
  --     "Já está bom" da tela marca localmente).
  select coalesce(nullif(c.vertical, ''), 'generico') into v_vert from public.nx_clientes c where c.id = p_cliente;
  v_mod_funis := case when v_vert in ('odonto', 'oficina', 'loja') then 2 else 1 end;
  v_mod_est := case v_vert when 'odonto' then 12 when 'oficina' then 11 when 'loja' then 10 else 7 end;
  f_funil := (select count(*) from public.nx_funis f where f.cliente_id = p_cliente and f.ativo) <> v_mod_funis
          or (select count(*) from public.nx_estagios e where e.cliente_id = p_cliente) <> v_mod_est
          or exists (select 1 from public.nx_funis f join public.nx_clientes c on c.id = f.cliente_id
                      where f.cliente_id = p_cliente and f.criado_em > c.criado_em + interval '1 hour')
          or exists (select 1 from public.nx_estagios e join public.nx_clientes c on c.id = e.cliente_id
                      where e.cliente_id = p_cliente and e.criado_em > c.criado_em + interval '1 hour');
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
    jsonb_build_object('id', 'script_site', 'rotulo', 'Script do site com contato recebido', 'feito', f_site, 'opcional', false, 'ultimo_em', v_ult_site),
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
