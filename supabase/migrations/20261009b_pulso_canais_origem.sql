-- ============================================================
-- ÓRBITA — 20261009b_pulso_canais_origem.sql · plano «100+ melhorias», integração de 09/10/2026
-- Dois campos que as telas da onda 2 já leem por detecção. ADITIVA e idempotente: create or replace com as MESMAS
-- assinaturas; só chaves NOVAS nos JSONs devolvidos (quem não as conhece ignora); nenhum dado é alterado.
--
-- 1. nx_pulso ganha `canais` [{id, nome, estado, desde}] (estado = nx_canal_estado da 20261008b; desde = última troca no
--    nx_canal_historico): o shell (pulso.js · canaisCaidosDe) avisa o número caído no próximo pulso (≤ 15 s), em vez de
--    esperar a notificação do sino. Visível a qualquer papel (o atendente também precisa saber que o número caiu).
-- 2. nx_cv_json_item (lista de conversas) ganha contato.origem e contato.plataforma: a pílula «Veio de: …» na lista.
-- ============================================================

-- 1. nx_pulso: cópia de 20261008b + canais
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
                          'desde', (select h.em from public.nx_canal_historico h where h.canal_id = k.id order by h.em desc, h.id desc limit 1))
                          order by k.criado_em, k.id)
                         from public.nx_canais k where k.cliente_id = p_cliente), '[]'::json),
    'agora', now());
end $$;

-- 2. nx_cv_json_item: cópia de 20260928e + contato.origem/plataforma
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

insert into public.nx_versao_banco (nome) values ('20261009b_pulso_canais_origem')
on conflict (nome) do update set aplicada_em = now();

notify pgrst, 'reload schema';
