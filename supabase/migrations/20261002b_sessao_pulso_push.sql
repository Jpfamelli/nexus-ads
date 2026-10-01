-- ============================================================
-- ÓRBITA — 20261002b_sessao_pulso_push.sql · frente B · plano de melhorias de 01/10/2026
-- ADITIVA e idempotente (create or replace / if not exists); nada de drop, nada em nx_config, nenhum dado de produção alterado.
--   Parte 1 (M17): nx_app_sessao renova a sessão de quem usa o app (30 dias de INATIVIDADE, não 30 dias fixos desde o login).
--   Parte 2 (M19): nx_pulso devolve nao_lidas e o maior id de mensagem de entrada visível (aditivo: as chaves v/notif/agora seguem iguais).
--   Parte 3 (M20): notificação push (tabela fechada, RPCs de assinar/cancelar) — só se a onda 3 chegar a ser feita.
-- Smoke: supabase/testes/16_sessao_pulso_push.sql (begin … rollback). NÃO aplicada pela frente: a publicação aplica, com o ok do dono.
-- ============================================================

-- ------------------------------------------------------------
-- Parte 1 — M17: sessão que não derruba quem usa todo dia
-- Problema: o login grava expira_em = now() + 30 dias e nada renova (nenhum update em nx_sessoes): quem abre o app TODO dia caía no dia 30.
-- Agora, quando faltam menos de 20 dias, o nx_app_sessao (a leitura do boot) empurra a expiração para now() + 30 dias.
--   - UPDATE condicional e por chave primária (token_hash): no máximo uma escrita a cada ~10 dias por sessão;
--   - só renova o que nx_conta_do_token já aceitou (sessão vencida ou token inválido levantam sessao_invalida ANTES e nada é renovado);
--   - uma sessão ociosa (ninguém abre o app) continua vencendo em 30 dias.
-- O corpo abaixo é o de 20260928c_plataforma.sql com UMA linha nova (o update de expira_em).
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
  update public.nx_sessoes set expira_em = now() + interval '30 days'
   where token_hash = public.nx_hash(p_token) and expira_em < now() + interval '20 days';
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
    'modulos_plano', (select json_object_agg(pp.id, pp.modulos) from public.nx_planos pp),
    'clientes', coalesce((
      select json_agg(json_strip_nulls(json_build_object(
               'id', x.id, 'slug', x.slug, 'nome', x.nome, 'status', nullif(x.status, 'ativo'), 'teste_ate', x.teste_ate,
               'plano', x.plano,
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
