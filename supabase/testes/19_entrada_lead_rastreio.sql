-- ============================================================
-- ÓRBITA — supabase/testes/19_entrada_lead_rastreio.sql · smoke de 20261008a_entrada_lead_rastreio.sql (plano 100, frente S-B)
--   S-B5 telefone: fixo × celular com chaves distintas, DDI 55 só com DDD válido, «+» respeitado, backfill idempotente
--   S-B4 faixa que cruza a meia-noite (22:00–02:00) aberta às 23h e à 1h do dia seguinte, fechada às 3h; próximo horário
--   S-B6 nx_lead_salvar com hint (valor, data_consulta, etapa, plataforma, id, telefone) e gravação válida
--   S-B3 nx_wa_entrada grava o horário original; reação não toca o contato; opt-out com status 'sistema';
--        marco sem estágio escolhe o estágio do tipo certo; formulário respeita o limite de contatos
--   S-B1 nx_lead_webhook v2: aberto > 30 dias → existente; fechado < 30 dias → novo (e a conversa aponta para ele);
--        nome = nome do contato (não o apelido); campanha nula preenchida por nx_atribuicao_completar
--   S-B2 rastreio: código no canal Meta; sem negócio fica pendente e o gatilho aplica quando o negócio nasce; resultado gravado;
--        classificação orgânico/meta × pago; google; repetido; código de outro telefone; limites 120/min; teste sem gravar; listagem
-- Roda em begin … rollback. O bloco principal SEMPRE termina em exceção:
--   'OK_19_ENTRADA_LEAD_RASTREIO …' = todos os casos passaram · 'FALHOU: <caso>' = falha
-- Antes da 20261008a este arquivo falha (colunas, regras e funções novas).
-- ============================================================
begin;

create or replace function pg_temp.ok(p boolean, p_caso text) returns void language plpgsql as $f$
begin
  if not coalesce(p, false) then raise exception 'FALHOU: %', p_caso; end if;
end $f$;

create or replace function pg_temp.erro(p_sql text) returns text language plpgsql as $f$
declare m text; h text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics m = message_text, h = pg_exception_hint;
  return m || coalesce('|' || nullif(h, ''), '');
end $f$;

do $t$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  cA uuid; k_adm uuid; tok text := 'tok-19-adm-' || sfx; kM uuid; kC uuid; f uuid; e_nova uuid; chave text;
  f2 uuid; e2_nova uuid; e2_fechado uuid;
  j json; jb jsonb; r text; n int; n0 int; ct bigint; ct2 bigint; ct3 bigint; l1 bigint; l2 bigint; l3 bigint; cv bigint;
  tel text := '5512998' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  tel2 text := '5512997' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  tel3 text := '5512996' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  tel4 text := '5512995' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  telX text := '5512994' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  telY text := '5512993' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  telZ text := '5512992' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  hr jsonb := '{"1":[["22:00","02:00"]],"2":[["09:00","12:00"]]}'::jsonb;   -- segunda: plantão noturno; terça: manhã
  c1 text; c2 text; c3 text; v_em timestamptz; v_ult timestamptz; m_id bigint; ln bigint; rx public.nx_rastreio;
begin
  -- ---------------------------------------------------------- fixtures
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-19-' || sfx, 'Teste 19', 'odonto') returning id into cA;
  select id into f from public.nx_funis where cliente_id = cA and padrao limit 1;
  select id into e_nova from public.nx_estagios where cliente_id = cA and funil_id = f and marco = 'nova' limit 1;
  perform pg_temp.ok(f is not null and e_nova is not null, 'fixture: funil padrão com etapa nova');
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-19-adm-' || sfx || '@teste.local', 'Ana Admin 19', 'x', 'clinica', true) returning id into k_adm;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_adm, cA, 'admin');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(tok), k_adm, now() + interval '1 hour');
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor) values (cA, 'Meta 19', 'pn-19-' || sfx, 'meta') returning id into kM;
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor, codewords_api_segredo, codewords_phone_id, codewords_numero, codewords_conectado, codewords_rota)
    values (cA, 'Aparelho 19', null, 'codewords', gen_random_uuid(), 'ph-19-' || sfx, '+5512998300000', true, 'direta') returning id into kC;
  chave := encode(extensions.gen_random_bytes(24), 'hex');
  update public.nx_clientes set entrada_chave = chave where id = cA;

  -- ---------------------------------------------------------- S-B10 versão do banco
  perform pg_temp.ok(exists (select 1 from public.nx_versao_banco where nome = '20261008a_entrada_lead_rastreio'), 'nx_versao_banco registra a migração a');

  -- ---------------------------------------------------------- S-B5 telefone
  perform pg_temp.ok(public.nx_tel_chave('5512998303030') = '1298303030' and public.nx_tel_chave('551298303030') = '1298303030', 'celular com e sem o 9 → mesma chave');
  perform pg_temp.ok(public.nx_tel_chave('5512933334444') = '12933334444' and public.nx_tel_chave('551233334444') = '1233334444', 'fixo 3333-4444 e «celular» 93333-4444 têm chaves distintas');
  perform pg_temp.ok(public.nx_tel_normalizar('(12) 99830-3030') = '5512998303030', 'digitado 11 dígitos com DDD válido ganha 55');
  perform pg_temp.ok(public.nx_tel_normalizar('1298303030') = '551298303030', 'digitado 10 dígitos ganha 55');
  perform pg_temp.ok(public.nx_tel_normalizar('1 212 555 1234') is null, 'EUA sem «+» (11 dígitos, 3º dígito não é 9) NÃO ganha 55');
  perform pg_temp.ok(public.nx_tel_normalizar('(10) 99830-3030') is null, 'DDD inexistente não ganha 55');
  perform pg_temp.ok(public.nx_tel_normalizar('+1 212 555 1234') = '12125551234', '«+» vale como DDI informado');
  perform pg_temp.ok(public.nx_tel_normalizar('14155551234', true) = '14155551234', 'número do WhatsApp fica como veio');
  perform pg_temp.ok(public.nx_tel_normalizar('0 12 99777-3030') = '5512997773030', 'zero de tronco sai');
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Fixo 19', '551233334444');
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Celular 19', '5512933334444');
  perform pg_temp.ok((select count(*) from public.nx_contatos where cliente_id = cA and telefone in ('551233334444', '5512933334444')) = 2, 'fixo e celular com os mesmos 8 finais são DOIS contatos');
  j := public.nx_tel_chave_backfill(cA);
  perform pg_temp.ok((j ->> 'recalculados')::int = 0 and (j ->> 'pulados')::int = 0, 'backfill idempotente: nada a recalcular em dados recém-gravados ' || j::text);
  perform pg_temp.ok(not exists (select 1 from public.nx_contatos k where k.telefone is not null and k.tel_chave is distinct from public.nx_tel_chave(k.telefone)
                                   and not exists (select 1 from public.nx_contatos o where o.cliente_id = k.cliente_id and o.id <> k.id and o.tel_chave = public.nx_tel_chave(k.telefone))),
    'depois da migração nenhuma chave está defasada (salvo colisão pulada)');

  -- ---------------------------------------------------------- S-B4 horário que cruza a meia-noite (2026-09-28 é segunda)
  perform pg_temp.ok(public.nx_horario_aberto(hr, '2026-09-28 23:00-03'), 'segunda 23h aberto (plantão 22–02)');
  perform pg_temp.ok(public.nx_horario_aberto(hr, '2026-09-29 01:00-03'), 'terça 1h aberto (madrugada da faixa de segunda)');
  perform pg_temp.ok(not public.nx_horario_aberto(hr, '2026-09-29 03:00-03'), 'terça 3h fechado');
  perform pg_temp.ok(not public.nx_horario_aberto(hr, '2026-09-28 10:00-03'), 'segunda 10h fechado');
  perform pg_temp.ok(public.nx_horario_aberto(hr, '2026-09-29 10:00-03'), 'terça 10h aberto (faixa normal)');
  perform pg_temp.ok(public.nx_proximo_horario(hr, '2026-09-28 10:00-03') = '2026-09-28 22:00-03'::timestamptz, 'próximo horário na segunda de manhã é 22h');
  perform pg_temp.ok(public.nx_proximo_horario(hr, '2026-09-29 01:00-03') = '2026-09-29 01:00-03'::timestamptz, 'na madrugada aberta o próximo horário é agora');
  perform pg_temp.ok(public.nx_horario_aberto('{"1":[["00:00","00:00"]]}'::jsonb, '2026-09-28 15:00-03'), '00:00–00:00 = dia inteiro');

  -- ---------------------------------------------------------- S-B6 nx_lead_salvar com hint
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_lead_salvar(%L,%L,%L)', tok, cA, '{"nome":"X","valor":"1.200,50"}')) = 'dados_invalidos|valor', 'valor com vírgula → hint valor');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_lead_salvar(%L,%L,%L)', tok, cA, '{"nome":"X","data_consulta":"31/13/2026"}')) = 'dados_invalidos|data_consulta', 'data impossível → hint data_consulta');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_lead_salvar(%L,%L,%L)', tok, cA, '{"nome":"X","etapa":"xpto"}')) = 'dados_invalidos|etapa', 'etapa fora da lista → hint etapa');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_lead_salvar(%L,%L,%L)', tok, cA, '{"nome":"X","plataforma":"tiktok"}')) = 'dados_invalidos|plataforma', 'plataforma desconhecida → hint plataforma');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_lead_salvar(%L,%L,%L)', tok, cA, '{"id":"abc","nome":"X"}')) = 'dados_invalidos|id', 'id não numérico → hint id');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_lead_salvar(%L,%L,%L)', tok, cA, '{"nome":"X","telefone":"1 212 555 1234"}')) = 'dados_invalidos|telefone', 'telefone ambíguo sem «+» → hint telefone');
  j := public.nx_lead_salvar(tok, cA, jsonb_build_object('nome', 'Lead 19', 'telefone', tel4, 'valor', '1200.50', 'data_consulta', '31/10/2026', 'etapa', 'agendada'));
  perform pg_temp.ok((j ->> 'valor')::numeric = 1200.50 and (j ->> 'data_consulta') = '2026-10-31' and (j ->> 'etapa') = 'agendada', 'lead válido gravado com valor, data dd/mm/aaaa e etapa');

  -- ---------------------------------------------------------- S-B3 nx_wa_entrada
  v_em := date_trunc('second', now() - interval '2 days');
  j := public.nx_wa_entrada(kM, jsonb_build_object('wamid', 'w19a' || sfx, 'wa_id', tel, 'nome', 'Mah 🌸', 'tipo', 'texto', 'corpo', 'oi',
                                                     'em', to_char(v_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
  m_id := (j ->> 'mensagem_id')::bigint; ct := (j ->> 'contato_id')::bigint; cv := (j ->> 'conversa_id')::bigint;
  perform pg_temp.ok((select criado_em from public.nx_mensagens where id = m_id) = v_em, 'entrada gravada com criado_em = horário original (2 dias atrás)');
  j := public.nx_wa_entrada(kM, jsonb_build_object('wamid', 'w19b' || sfx, 'wa_id', tel, 'tipo', 'texto', 'corpo', 'velha',
                                                     'em', to_char((now() - interval '10 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
  perform pg_temp.ok((select criado_em from public.nx_mensagens where id = (j ->> 'mensagem_id')::bigint) > now() - interval '1 minute', 'data com mais de 7 dias não vale: fica now()');
  -- reação: nem nome, nem ultimo_contato_em, nem contato novo
  select ultimo_contato_em into v_ult from public.nx_contatos where id = ct;
  perform pg_sleep(0.05);
  j := public.nx_wa_entrada(kM, jsonb_build_object('wamid', 'w19r' || sfx, 'wa_id', tel, 'nome', 'Outro Nome', 'tipo', 'texto',
                                                     'reacao', jsonb_build_object('wamid', 'w19a' || sfx, 'emoji', '👍')));
  perform pg_temp.ok((j ->> 'reacao')::boolean and (select reacao from public.nx_mensagens where id = m_id) = '👍', 'reação grava o emoji na mensagem alvo');
  perform pg_temp.ok((select ultimo_contato_em from public.nx_contatos where id = ct) = v_ult and (select nome from public.nx_contatos where id = ct) = 'Mah 🌸', 'reação não toca nome nem ultimo_contato_em');
  n0 := (select count(*) from public.nx_contatos where cliente_id = cA);
  j := public.nx_wa_entrada(kM, jsonb_build_object('wamid', 'w19r2' || sfx, 'wa_id', telZ, 'tipo', 'texto', 'reacao', jsonb_build_object('wamid', 'nada', 'emoji', '❤')));
  perform pg_temp.ok((select count(*) from public.nx_contatos where cliente_id = cA) = n0 and (j ->> 'contato_id') is null, 'reação de telefone desconhecido não cria contato');
  -- wa_id só por um mais completo
  j := public.nx_wa_entrada(kM, jsonb_build_object('wamid', 'w19c' || sfx, 'wa_id', substr(tel, 3), 'tipo', 'texto', 'corpo', 'sem ddi'));
  perform pg_temp.ok((j ->> 'contato_id')::bigint = ct and (select wa_id from public.nx_contatos where id = ct) = tel, 'número sem DDI acha o contato e NÃO sobrescreve o wa_id canônico');
  -- opt-out com status sistema
  j := public.nx_wa_entrada(kM, jsonb_build_object('wamid', 'w19s' || sfx, 'wa_id', tel, 'tipo', 'texto', 'corpo', 'SAIR'));
  perform pg_temp.ok((j ->> 'optout')::boolean, 'SAIR registra opt-out');
  perform pg_temp.ok(exists (select 1 from public.nx_mensagens m where m.conversa_id = cv and m.tipo = 'sistema' and m.status = 'sistema'
                               and m.corpo like 'Contato pediu para não receber%'), 'a mensagem de sistema do opt-out tem status sistema (não conta como entrega)');
  -- marco sem estágio: funil só com Nova (aberto) e Fechado (ganho, sem marco)
  insert into public.nx_funis (cliente_id, nome, padrao, conta_no_ads, ativo) values (cA, 'Funil 19', false, false, true) returning id into f2;
  insert into public.nx_estagios (cliente_id, funil_id, nome, ordem, tipo, marco) values (cA, f2, 'Nova 19', 1, 'aberto', 'nova') returning id into e2_nova;
  insert into public.nx_estagios (cliente_id, funil_id, nome, ordem, tipo, marco) values (cA, f2, 'Fechado 19', 2, 'ganho', null) returning id into e2_fechado;
  insert into public.nx_leads (cliente_id, funil_id, estagio_id, titulo, nome, telefone, status, etapa) values (cA, f2, e2_nova, 'Marco 19', 'Marco', tel3, 'aberto', 'nova') returning id into l1;
  j := public.nx_lead_salvar(tok, cA, jsonb_build_object('id', l1, 'etapa', 'fechou'));
  perform pg_temp.ok((select estagio_id from public.nx_leads where id = l1) = e2_fechado and (select status from public.nx_leads where id = l1) = 'ganho',
    'marco fechou sem estágio com esse marco → vai para o estágio do tipo ganho');
  j := public.nx_lead_salvar(tok, cA, jsonb_build_object('id', l1, 'etapa', 'orcamento'));
  perform pg_temp.ok((select estagio_id from public.nx_leads where id = l1) = e2_nova and (select status from public.nx_leads where id = l1) = 'aberto',
    'marco aberto sem estágio → 1º estágio aberto');
  -- formulário respeita o limite de contatos (plano com teto = contatos de hoje)
  insert into public.nx_planos (id, nome, limites, modulos, ordem) values ('p19_' || sfx, 'P19', jsonb_build_object('contatos', (select count(*) from public.nx_contatos where cliente_id = cA)), '{crm,conversas}', 999);
  update public.nx_clientes set plano = 'p19_' || sfx where id = cA;
  n0 := (select count(*) from public.nx_contatos where cliente_id = cA);
  j := public.nx_lead_entrada(chave, jsonb_build_object('nome', 'Site Cheio', 'telefone', '(12) 99777-1' || lpad((floor(random() * 900) + 100)::text, 3, '0')));
  perform pg_temp.ok((j ->> 'ok')::boolean and (select count(*) from public.nx_contatos where cliente_id = cA) = n0, 'plano cheio: formulário responde ok e NÃO cria contato');
  perform pg_temp.ok(exists (select 1 from public.nx_notificacoes n where n.cliente_id = cA and n.titulo = 'Limite de contatos do plano atingido'), 'admin avisado do limite');
  update public.nx_clientes set plano = 'interno' where id = cA;
  update public.nx_planos set limites = '{}'::jsonb where id = 'p19_' || sfx;

  -- ---------------------------------------------------------- S-B1 nx_lead_webhook v2
  -- (a) aberto há 45 dias → existente (antes: 2º negócio)
  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id) values (cA, 'Antigo Aberto', tel2, tel2) returning id into ct2;
  insert into public.nx_leads (cliente_id, contato_id, funil_id, estagio_id, titulo, telefone, status, etapa, data_conversa)
    values (cA, ct2, f, e_nova, 'Aberto 45d', tel2, 'aberto', 'nova', hoje - 45) returning id into l2;
  perform pg_temp.ok(public.nx_lead_webhook(cA, tel2, array[tel2], 'Apelido Zap', '{}'::jsonb, hoje, 30) = 'existente', 'negócio aberto há 45 dias → existente');
  perform pg_temp.ok((select count(*) from public.nx_leads where contato_id = ct2) = 1, 'nenhum negócio duplicado');
  -- (b) fechado há 2 dias → novo negócio; conversa aberta passa a apontar para o novo
  update public.nx_leads set status = 'ganho', fechado_em = now() - interval '2 days', estagio_id = (select id from public.nx_estagios where funil_id = f and marco = 'fechou' limit 1) where id = l2;
  perform pg_temp.ok((select status from public.nx_leads where id = l2) = 'ganho', 'fixture: negócio fechado');
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, negocio_id) values (cA, kM, ct2, '2026-19' || sfx, 'aberta', l2) returning id into cv;
  perform pg_temp.ok(public.nx_lead_webhook(cA, tel2, array[tel2], 'Apelido Zap', '{"origem":"anuncio","plataforma":"meta","anuncio_ext":"AD19"}'::jsonb, hoje, 30) = 'criado', 'último negócio fechado → nasce um novo');
  select id into l3 from public.nx_leads where contato_id = ct2 and status = 'aberto' order by id desc limit 1;
  perform pg_temp.ok(l3 is not null and l3 <> l2, 'o negócio novo é outro registro, aberto');
  perform pg_temp.ok((select negocio_id from public.nx_conversas where id = cv) = l3, 'a conversa aberta aponta para o negócio novo');
  perform pg_temp.ok((select nome from public.nx_leads where id = l3) = 'Antigo Aberto', 'nome do negócio = nome do contato no CRM, não o apelido do WhatsApp');
  perform pg_temp.ok((select anuncio_ext from public.nx_leads where id = l3) = 'AD19' and (select campanha_ext from public.nx_leads where id = l3) is null, 'anúncio gravado; campanha ainda desconhecida');
  -- (c) contato sem nome → apelido
  perform pg_temp.ok(public.nx_lead_webhook(cA, telY, array[telY], 'Só Apelido', '{}'::jsonb, hoje, 30) = 'criado', 'contato novo → criado');
  perform pg_temp.ok((select nome from public.nx_leads where cliente_id = cA and telefone = telY) = 'Só Apelido', 'sem nome no CRM vale o apelido');
  perform pg_temp.ok(public.nx_lead_webhook(cA, telY, array[telY], 'Outro', '{}'::jsonb, hoje, 30) = 'existente', 'e a 2ª mensagem acha o mesmo negócio');
  -- (d) campanha nula → nx_atribuicao_completar
  insert into public.nx_metricas_dia (cliente_id, plataforma, data, nivel, campanha_ext, campanha_nome, anuncio_ext, anuncio_nome)
    values (cA, 'meta', hoje, 'anuncio', 'CAMP19', 'Campanha 19', 'AD19', 'Anúncio 19');
  j := public.nx_atribuicao_completar(cA);
  perform pg_temp.ok((j ->> 'leads')::int >= 1 and (select campanha_ext from public.nx_leads where id = l3) = 'CAMP19', 'campanha_ext preenchida a partir do anúncio ' || j::text);
  perform pg_temp.ok((select campanha_ext from public.nx_contatos where id = ct2) = 'CAMP19', 'contato também');
  j := public.nx_atribuicao_completar(cA);
  perform pg_temp.ok((j ->> 'leads')::int = 0 and (j ->> 'contatos')::int = 0, 'idempotente: 2ª chamada não mexe em nada');
  perform pg_temp.ok(current_setting('nx.backfill', true) is distinct from '1', 'a flag de backfill não vaza para o resto da transação');
  perform pg_temp.ok(public.nx_lead_webhook(cA, tel3, array[tel3], 'Marco', '{}'::jsonb, hoje, 30) = 'existente', 'negócio aberto em funil não padrão também conta como existente');

  -- ---------------------------------------------------------- S-B2 rastreio
  n0 := (select count(*) from public.nx_rastreio where cliente_id = cA);
  j := public.nx_rastreio_registrar(chave, '{"teste":"1","utm_source":"instagram"}'::jsonb);
  perform pg_temp.ok((j ->> 'teste')::boolean and (j ->> 'codigo') ~ '^[A-HJKMNP-Z2-9]{5}$' and (select count(*) from public.nx_rastreio where cliente_id = cA) = n0, 'teste devolve código e não grava');
  j := public.nx_rastreio_registrar('0000000000000000000000000000000000000000000000ff', '{"teste":"1"}'::jsonb);
  perform pg_temp.ok((j ->> 'teste') is null and (j ->> 'codigo') is not null, 'chave errada em modo teste não revela nada');
  c1 := public.nx_rastreio_registrar(chave, '{"utm_source":"instagram","fbclid":"FB19","pagina":"https://x.test/bio"}'::jsonb) ->> 'codigo';
  c2 := public.nx_rastreio_registrar(chave, '{"utm_source":"facebook","utm_medium":"paid-social","utm_campaign":"campanha 19","pagina":"https://x.test/lp"}'::jsonb) ->> 'codigo';
  c3 := public.nx_rastreio_registrar(chave, '{"utm_source":"google","gclid":"G19"}'::jsonb) ->> 'codigo';
  perform pg_temp.ok(c1 ~ '^[A-HJKMNP-Z2-9]{5}$' and c2 ~ '^[A-HJKMNP-Z2-9]{5}$' and c3 ~ '^[A-HJKMNP-Z2-9]{5}$', 'três códigos registrados');
  -- canal Meta: antes era canal_nao_encontrado; sem negócio fica pendente
  j := public.nx_rastreio_atribuir(kM, telX, c1);
  perform pg_temp.ok((j ->> 'motivo') = 'sem_negocio' and (j ->> 'pendente')::boolean, 'canal Meta aceito; sem negócio → pendente ' || j::text);
  perform pg_temp.ok((select pendente and telefone = telX and resultado ->> 'motivo' = 'sem_negocio' from public.nx_rastreio where cliente_id = cA and codigo = c1), 'nx_rastreio guarda telefone, pendente e resultado');
  -- o negócio nasce → o gatilho aplica o código pendente
  perform pg_temp.ok(public.nx_lead_webhook(cA, telX, array[telX], 'Pendente', '{}'::jsonb, hoje, 30) = 'criado', 'negócio do telefone pendente criado');
  select id into ln from public.nx_leads where cliente_id = cA and telefone = telX order by id desc limit 1;
  perform pg_temp.ok((select origem from public.nx_leads where id = ln) = 'organico' and (select plataforma from public.nx_leads where id = ln) = 'meta'
                     and (select rastreio ->> 'codigo' from public.nx_leads where id = ln) = c1, 'gatilho aplicou: instagram + fbclid sem medium pago → organico/meta');
  perform pg_temp.ok((select not pendente and negocio_id = ln and (resultado ->> 'aplicado')::boolean from public.nx_rastreio where cliente_id = cA and codigo = c1), 'código deixou de ser pendente e tem resultado aplicado');
  perform pg_temp.ok((select origem from public.nx_contatos where cliente_id = cA and telefone = telX) = 'organico', 'contato recebeu a origem real');
  -- canal CodeWords: pago + campanha casada pelo nome
  perform pg_temp.ok(public.nx_lead_webhook(cA, telY, array[telY], 'Só Apelido', '{}'::jsonb, hoje, 30) = 'existente', 'fixture: telY tem negócio aberto');
  j := public.nx_rastreio_atribuir(kC, telY, c2);
  perform pg_temp.ok((j ->> 'aplicado')::boolean and (j ->> 'origem') = 'anuncio' and (j ->> 'plataforma') = 'meta' and (j ->> 'campanha_ext') = 'CAMP19', 'paid-social + campanha pelo nome → anuncio/meta/CAMP19 ' || j::text);
  j := public.nx_rastreio_atribuir(kC, telY, c2);
  perform pg_temp.ok((j ->> 'repetido')::boolean, 'mesmo código de novo → repetido');
  j := public.nx_rastreio_atribuir(kM, telZ, c2);
  perform pg_temp.ok((j ->> 'motivo') = 'codigo_ja_usado', 'código de outro telefone → codigo_ja_usado');
  -- google
  perform pg_temp.ok(public.nx_lead_webhook(cA, tel4, array[tel4], 'Lead 19', '{}'::jsonb, hoje, 30) = 'existente', 'fixture: tel4 tem negócio aberto (criado pelo clássico)');
  j := public.nx_rastreio_atribuir(kM, tel4, c3);
  perform pg_temp.ok((j ->> 'motivo') = 'origem_definida', 'negócio criado à mão (origem manual) não recebe o código');
  perform pg_temp.ok(public.nx_lead_webhook(cA, telZ, array[telZ], 'Zé Google', '{}'::jsonb, hoje, 30) = 'criado', 'fixture: telZ ganha negócio pelo webhook');
  perform pg_temp.ok((public.nx_rastreio_atribuir(kM, telZ, c3) ->> 'motivo') = 'codigo_ja_usado', 'o código ficou vinculado ao telefone que o mandou primeiro');
  c3 := public.nx_rastreio_registrar(chave, '{"utm_source":"google","gclid":"G19B"}'::jsonb) ->> 'codigo';
  j := public.nx_rastreio_atribuir(kM, telZ, c3);
  perform pg_temp.ok((j ->> 'aplicado')::boolean and (j ->> 'plataforma') = 'google' and (j ->> 'origem') = 'anuncio' and (j ->> 'gclid')::boolean, 'gclid → google/anuncio ' || j::text);
  perform pg_temp.ok((public.nx_rastreio_atribuir(kM, tel4, 'ABC') ->> 'motivo') = 'codigo_invalido' and (public.nx_rastreio_atribuir(kM, tel4, 'ZZZZZ') ->> 'motivo') = 'codigo_desconhecido', 'formato inválido e código inexistente');
  -- classificação sem tabela
  rx.cliente_id := cA; rx.codigo := 'AAAAA'; rx.utm_source := 'instagram'; rx.utm_medium := 'pmax'; rx.criado_em := now(); rx.pendente := false;
  perform pg_temp.ok((public.nx_rastreio_plataforma(rx) ->> 'origem') = 'anuncio' and (public.nx_rastreio_plataforma(rx) ->> 'plataforma') = 'meta', 'medium pmax conta como pago');
  rx.utm_medium := null; rx.utm_source := 'ig';
  perform pg_temp.ok((public.nx_rastreio_plataforma(rx) ->> 'origem') = 'organico' and (public.nx_rastreio_plataforma(rx) ->> 'plataforma') = 'meta', 'ig sem medium → organico/meta');
  rx.utm_source := null; rx.utm_medium := 'seo';
  perform pg_temp.ok((public.nx_rastreio_plataforma(rx) ->> 'origem') = 'organico' and (public.nx_rastreio_plataforma(rx) ->> 'plataforma') is null, 'seo → organico sem plataforma');
  -- listagem (admin) sem o código
  j := public.nx_rastreio_listar(tok, cA, 30);
  perform pg_temp.ok((j -> 'totais' ->> 'cliques')::int >= 3 and (j -> 'totais' ->> 'casados')::int >= 3, 'totais: cliques e casados ' || (j -> 'totais')::text);
  perform pg_temp.ok(j::text not like '%' || c1 || '%' and j::text not like '%' || c2 || '%', 'a listagem não traz o código');
  perform pg_temp.ok((j::jsonb -> 'itens' -> 0) ? 'em' and (j::jsonb -> 'itens' -> 0) ? 'casou' and (j::jsonb -> 'itens' -> 0) ? 'motivo' and (j::jsonb -> 'itens' -> 0) ? 'plataforma' and (j::jsonb -> 'itens' -> 0) ? 'contato_nome', 'itens com em/casou/motivo/plataforma/contato_nome');
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'itens') i where (i ->> 'casou')::boolean and (i ->> 'contato_nome') = 'Só Apelido'), 'item casado traz o nome do contato');
  -- limite: 120 por minuto
  insert into public.nx_rastreio (cliente_id, codigo, criado_em)
    select cA, 'Q' || a[1 + (g / 20) % 20] || a[1 + g % 20] || 'XY', now()
      from generate_series(1, 110) g, (select array['A','B','C','D','E','F','G','H','J','K','M','N','P','Q','R','S','T','U','V','W'] as a) z on conflict do nothing;
  n := (select count(*) from public.nx_rastreio r where r.cliente_id = cA and r.criado_em > now() - interval '1 minute');
  perform pg_temp.ok(n < 120, 'fixture: abaixo de 120 no minuto (' || n || ')');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_rastreio_registrar(%L, %L)', chave, '{}')) = 'ok', 'com menos de 120 no minuto ainda registra');
  insert into public.nx_rastreio (cliente_id, codigo, criado_em)
    select cA, 'R' || a[1 + (g / 20) % 20] || a[1 + g % 20] || 'XY', now()
      from generate_series(1, 10) g, (select array['A','B','C','D','E','F','G','H','J','K','M','N','P','Q','R','S','T','U','V','W'] as a) z on conflict do nothing;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_rastreio_registrar(%L, %L)', chave, '{}')) = 'limite_taxa', '120 no minuto → limite_taxa');
  perform pg_temp.ok((public.nx_rastreio_registrar(chave, '{"teste":"1"}'::jsonb) ->> 'teste')::boolean, 'o teste não entra no limite');

  raise exception 'OK_19_ENTRADA_LEAD_RASTREIO — telefone, horário noturno, nx_lead_salvar, nx_wa_entrada, lead v2 (4 casos) e rastreio (Meta, pendente, classificação, limites, listagem)';
end $t$;

rollback;
