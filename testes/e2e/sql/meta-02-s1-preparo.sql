-- ============================================================
-- ÓRBITA — testes/e2e/sql/meta-02-s1-preparo.sql
-- Entre a fase 1 e a fase 2 do E2E do canal Meta (cliente 'meta-3009'). O que a API do painel não alcança:
--   1) modelos (templates) dos dois canais — o painel só os traz da Meta (sincronizar_templates = chamada real);
--   2) saídas com wamid conhecido para os recibos (ESPEC §8.5 item 6: nx_cv_saida como service role);
--   3) a conversa do contato 8 com a janela de 24 h vencida (ultima_entrada_em = agora - 25 h).
-- {{RUN}} = id da rodada (estado.json → run). Só mexe no cliente 'meta-3009'.
-- ============================================================
do $$
declare
  v_cli uuid; cA uuid; cB uuid; c1 bigint; c7 bigint; c8 bigint;
  run text := '{{RUN}}';
begin
  select id into v_cli from public.nx_clientes where slug = 'meta-3009';
  select id into cA from public.nx_canais where cliente_id = v_cli and nome = 'META-3009 A';
  select id into cB from public.nx_canais where cliente_id = v_cli and nome = 'META-3009 B';
  if v_cli is null or cA is null or cB is null then raise exception 'cliente/canais META-3009 não encontrados'; end if;

  -- 1) modelos (mesmo formato do GET /message_templates da Graph)
  perform public.nx_templates_gravar(cA, v_cli, jsonb_build_array(
    jsonb_build_object('name', 'meta3009_lembrete', 'language', 'pt_BR', 'category', 'UTILITY', 'status', 'APPROVED',
      'components', jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', 'Olá {{1}}, sua consulta é {{2}}.'))),
    jsonb_build_object('name', 'meta3009_promo', 'language', 'pt_BR', 'category', 'MARKETING', 'status', 'APPROVED',
      'components', jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', '{{1}}, promoção de clareamento neste mês!'))),
    jsonb_build_object('name', 'meta3009_pendente', 'language', 'pt_BR', 'category', 'UTILITY', 'status', 'PENDING',
      'components', jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', 'Modelo ainda em análise.')))));
  perform public.nx_templates_gravar(cB, v_cli, jsonb_build_array(
    jsonb_build_object('name', 'meta3009_b', 'language', 'pt_BR', 'category', 'UTILITY', 'status', 'APPROVED',
      'components', jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', 'Modelo do segundo número.')))));

  -- 2) saídas com wamid conhecido (p_conta nula = sistema: não tira a conversa de 'aguardando')
  select cv.id into c1 from public.nx_conversas cv join public.nx_contatos ct on ct.id = cv.contato_id
   where cv.cliente_id = v_cli and ct.telefone = '5512993008001' and cv.status <> 'resolvida' order by cv.id desc limit 1;
  select cv.id into c7 from public.nx_conversas cv join public.nx_contatos ct on ct.id = cv.contato_id
   where cv.cliente_id = v_cli and ct.telefone = '5512993008007' and cv.status <> 'resolvida' order by cv.id desc limit 1;
  select cv.id into c8 from public.nx_conversas cv join public.nx_contatos ct on ct.id = cv.contato_id
   where cv.cliente_id = v_cli and ct.telefone = '5512993008008' and cv.status <> 'resolvida' order by cv.id desc limit 1;
  if c1 is null or c7 is null or c8 is null then raise exception 'conversas dos contatos 1, 7 e 8 não encontradas'; end if;
  perform public.nx_cv_saida(null, v_cli, c1, jsonb_build_object('tipo', 'texto', 'corpo', 'Saída de teste 1', 'wamid', 'wamid.META3009-' || run || '-SAIDA-1', 'status', 'enviada'));
  perform public.nx_cv_saida(null, v_cli, c1, jsonb_build_object('tipo', 'texto', 'corpo', 'Saída de teste 2', 'wamid', 'wamid.META3009-' || run || '-SAIDA-2', 'status', 'enviada'));
  perform public.nx_cv_saida(null, v_cli, c1, jsonb_build_object('tipo', 'texto', 'corpo', 'Saída de teste tardia', 'wamid', 'wamid.META3009-' || run || '-SAIDA-TARDIA', 'status', 'enviada'));
  perform public.nx_cv_saida(null, v_cli, c1, jsonb_build_object('tipo', 'texto', 'corpo', 'Saída de teste 4', 'wamid', 'wamid.META3009-' || run || '-SAIDA-4', 'status', 'pendente'));
  perform public.nx_cv_saida(null, v_cli, c1, jsonb_build_object('tipo', 'texto', 'corpo', 'Saída de teste 5 (falha por janela)', 'wamid', 'wamid.META3009-' || run || '-SAIDA-5', 'status', 'enviada'));
  perform public.nx_cv_saida(null, v_cli, c7, jsonb_build_object('tipo', 'texto', 'corpo', 'Saída de teste do canal B', 'wamid', 'wamid.META3009-' || run || '-SAIDA-B', 'status', 'enviada'));

  -- 3) janela vencida do contato 8
  update public.nx_conversas set ultima_entrada_em = now() - interval '25 hours' where id = c8;
end $$;
select jsonb_build_object(
  'modelos', (select count(*) from public.nx_templates t join public.nx_clientes c on c.id = t.cliente_id where c.slug = 'meta-3009'),
  'saidas', (select count(*) from public.nx_mensagens m join public.nx_clientes c on c.id = m.cliente_id where c.slug = 'meta-3009' and m.wamid like 'wamid.META3009-{{RUN}}-SAIDA-%'),
  'janela_8_h', (select round(extract(epoch from now() - cv.ultima_entrada_em) / 3600, 1) from public.nx_conversas cv join public.nx_contatos ct on ct.id = cv.contato_id join public.nx_clientes c on c.id = cv.cliente_id where c.slug = 'meta-3009' and ct.telefone = '5512993008008' limit 1)) s1;
