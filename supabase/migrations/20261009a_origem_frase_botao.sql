-- ============================================================
-- ÓRBITA — 20261009a_origem_frase_botao.sql · plano «100+ melhorias», revisão adversarial de 09/10/2026
-- A frase que o botão do site põe na mensagem («Vim pelo site», «Vim pelo anúncio (instagram)») quando o código [ref] não
-- veio. ADITIVA e idempotente: só uma função NOVA (nx_origem_frase); nada existente muda; nenhum dado é alterado aqui.
--
-- Por quê: a frase era gravada por nx_codewords_origem, que (1) só aceita canal do aparelho (nx_codewords_alvo exige
-- provedor 'codewords') — no webhook da Meta a chamada lançava canal_nao_encontrado e nada era atribuído; e (2) trata a
-- fonte como ORIGEM CONTADA («vi no Instagram» = orgânico): «Vim pelo anúncio (instagram)» virava origem 'organico',
-- e o lead que o botão diz ser de anúncio ficava fora do funil de anúncios.
--
-- nx_origem_frase(p_canal, p_telefone, p_origem 'site'|'anuncio', p_plataforma 'meta'|'google'|null, p_detalhe):
--   · qualquer canal (Meta ou aparelho) do cliente; contato pelo telefone (nx_contato_por_tel); negócio ABERTO do contato
--     (o da conversa desse canal primeiro, depois o funil padrão, depois o mais novo — a mesma ordem de nx_codewords_alvo);
--   · nunca sobrescreve atribuição melhor: negócio com anúncio (anuncio_ext), gclid, plataforma ou origem 'anuncio' → nada muda
--     (ja_tem_anuncio); negócio que já não é 'whatsapp' (indicação, site, orgânico já contado) → nada muda (ja_tem_origem);
--   · 'anuncio' grava origem 'anuncio' + plataforma (no funil de anúncios, balde «sem campanha identificada» do painel);
--     'site' grava origem 'site'; contato só quando ainda é 'whatsapp' sem plataforma; nota no negócio/contato.
--   · só service_role (as funções); idempotente: repetir não muda nada (o negócio já não é 'whatsapp').
-- ============================================================

create or replace function public.nx_origem_frase(p_canal uuid, p_telefone text, p_origem text, p_plataforma text default null,
                                                   p_detalhe text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.nx_canais; l public.nx_leads;
  d text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_ct bigint; v_cv_neg bigint; v_neg bigint; v_plat text;
  v_det text := left(nullif(btrim(coalesce(p_detalhe, '')), ''), 200);
begin
  if p_origem is null or p_origem not in ('site', 'anuncio') then
    return json_build_object('ok', false, 'erro', 'origem_invalida');
  end if;
  v_plat := case when p_origem = 'anuncio' and p_plataforma in ('meta', 'google') then p_plataforma end;
  if p_origem = 'anuncio' and v_plat is null then
    return json_build_object('ok', false, 'erro', 'plataforma_invalida');
  end if;
  select * into k from public.nx_canais where id = p_canal;
  if k.id is null then raise exception 'canal_nao_encontrado' using errcode = '22023'; end if;
  if length(d) not between 8 and 15 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'telefone';
  end if;
  v_ct := public.nx_contato_por_tel(k.cliente_id, d);
  if v_ct is null then return json_build_object('ok', false, 'erro', 'contato_nao_encontrado'); end if;
  select cv.negocio_id into v_cv_neg from public.nx_conversas cv
   where cv.cliente_id = k.cliente_id and cv.canal_id = k.id and cv.contato_id = v_ct
   order by (cv.status <> 'resolvida') desc, cv.ultima_msg_em desc, cv.id desc limit 1;
  select l2.id into v_neg from public.nx_leads l2 left join public.nx_funis f on f.id = l2.funil_id
   where l2.cliente_id = k.cliente_id and l2.contato_id = v_ct and l2.status = 'aberto'
   order by (l2.id = v_cv_neg) desc nulls last, coalesce(f.padrao, false) desc, l2.criado_em desc, l2.id desc
   limit 1;
  if v_neg is not null then
    select * into l from public.nx_leads where id = v_neg and cliente_id = k.cliente_id for update;
    if l.plataforma is not null or nullif(l.anuncio_ext, '') is not null or l.gclid is not null or l.origem = 'anuncio' then
      return json_build_object('ok', true, 'aplicado', false, 'motivo', 'ja_tem_anuncio', 'negocio_id', l.id);
    end if;
    if coalesce(l.origem, 'whatsapp') <> 'whatsapp' then
      return json_build_object('ok', true, 'aplicado', false, 'motivo', 'ja_tem_origem', 'negocio_id', l.id);
    end if;
    update public.nx_leads set origem = p_origem, plataforma = v_plat, atualizado_em = now() where id = l.id;
  end if;
  update public.nx_contatos set origem = p_origem, plataforma = v_plat
   where id = v_ct and cliente_id = k.cliente_id and plataforma is null and coalesce(origem, 'whatsapp') = 'whatsapp';
  insert into public.nx_notas (cliente_id, contato_id, negocio_id, texto)
  values (k.cliente_id, v_ct, l.id,
          'Origem pela mensagem do botão do site: ' || case p_origem when 'site' then 'Site'
            else 'Anúncio (' || case v_plat when 'meta' then 'Meta' else 'Google' end || ')' end
          || coalesce(' — ' || v_det, ''));
  return json_build_object('ok', true, 'aplicado', true, 'origem', p_origem, 'plataforma', v_plat, 'negocio_id', l.id);
end $$;

revoke all on function public.nx_origem_frase(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.nx_origem_frase(uuid, text, text, text, text) to service_role;

insert into public.nx_versao_banco (nome) values ('20261009a_origem_frase_botao')
on conflict (nome) do update set aplicada_em = now();

notify pgrst, 'reload schema';
