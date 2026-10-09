-- ============================================================
-- ÓRBITA — 20261009d_origem_frase_sem_negocio.sql · revisão adversarial de 09/10/2026 (frente G)
-- ADITIVA e idempotente: create or replace de nx_origem_frase com a MESMA assinatura (cópia de 20261009a + o marcado); nenhum dado muda.
-- Defeito: contato SEM negócio aberto → a nota «Origem pela mensagem do botão do site» era gravada a CADA chamada (reentrega,
-- sincronização) e a resposta dizia aplicado:true mesmo quando o contato já tinha outra origem e nada mudava.
-- Agora, sem negócio: só grava a nota (e diz aplicado) quando o contato de fato mudou; senão ja_tem_origem, sem nota.
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
  v_ct bigint; v_cv_neg bigint; v_neg bigint; v_plat text; v_mudou_ct bigint;
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
   where id = v_ct and cliente_id = k.cliente_id and plataforma is null and coalesce(origem, 'whatsapp') = 'whatsapp'
  returning id into v_mudou_ct;
  -- 20261009d: sem negócio aberto, só conta (e só anota) quando o CONTATO mudou — repetir não grava outra nota
  if v_neg is null and v_mudou_ct is null then
    return json_build_object('ok', true, 'aplicado', false, 'motivo', 'ja_tem_origem', 'negocio_id', null);
  end if;
  insert into public.nx_notas (cliente_id, contato_id, negocio_id, texto)
  values (k.cliente_id, v_ct, l.id,
          'Origem pela mensagem do botão do site: ' || case p_origem when 'site' then 'Site'
            else 'Anúncio (' || case v_plat when 'meta' then 'Meta' else 'Google' end || ')' end
          || coalesce(' — ' || v_det, ''));
  return json_build_object('ok', true, 'aplicado', true, 'origem', p_origem, 'plataforma', v_plat, 'negocio_id', l.id);
end $$;

revoke all on function public.nx_origem_frase(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.nx_origem_frase(uuid, text, text, text, text) to service_role;

insert into public.nx_versao_banco (nome) values ('20261009d_origem_frase_sem_negocio')
on conflict (nome) do update set aplicada_em = now();

notify pgrst, 'reload schema';
