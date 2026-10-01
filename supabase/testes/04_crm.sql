-- ============================================================
-- ÓRBITA — supabase/testes/04_crm.sql · frente F4 (CRM)
-- Smoke do arquivo d (20260928d_crm.sql): base, kanban com filtros
-- (alguma/todas/nenhuma), mover (valor, campo obrigatório, motivo, marco
-- agendada/fechou), TRAVA DO ADS + "Iniciar pós-venda" com a receita do
-- nx_dados intacta, gaveta, ficha 360, contatos (busca sem acento/telefone),
-- tarefas, notas, etiqueta, papéis, isolamento por id e teste de TEMPO
-- (5.000 contatos, 5.000 negócios, 20.000 mensagens: cada RPC < 2 s).
-- Roda pelo execute_sql. TUDO em begin … rollback. Falha = 'FALHOU: <caso>'.
-- ============================================================
begin;

create or replace function pg_temp.erro(p_sql text) returns text language plpgsql as $f$
declare m text; h text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics m = message_text, h = pg_exception_hint;
  return m || coalesce('|' || nullif(h, ''), '');
end $f$;

create or replace function pg_temp.ok(p boolean, p_caso text) returns void language plpgsql as $f$
begin
  if not coalesce(p, false) then raise exception 'FALHOU: %', p_caso; end if;
end $f$;

do $t$
declare
  cA uuid; cB uuid; cT uuid;
  k_adm uuid; k_at uuid; k_at2 uuid; k_res uuid; k_le uuid; k_sup uuid; k_b uuid;
  f_pac uuid; f_pos uuid; s_nova uuid; s_agend uuid; s_orc uuid; s_fechou uuid; s_naofech uuid; s_perd uuid;
  s_emtrat uuid; sB uuid; fB uuid;
  e_impl uuid; e_orto uuid; e_urg uuid; eB uuid; m_preco uuid; m_outro uuid;
  n1 bigint; n2 bigint; n3 bigint; n4 bigint; nB bigint; nPos bigint; ct1 bigint; ct2 bigint; ctB bigint;
  cv1 bigint; t1 bigint; nt1 bigint;
  j jsonb; j2 jsonb; r record; x text; n int; rec_antes numeric; rec_depois numeric;
  t0 timestamptz; ms numeric; cols jsonb;
begin
  -- ---------------------------------------------------------- cenário
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-f4-a', 'Teste F4 A', 'odonto') returning id into cA;
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-f4-b', 'Teste F4 B', 'oficina') returning id into cB;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values
    ('teste-f4-adm@teste.local', 'Ana Admin', 'x', 'clinica', true) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values
    ('teste-f4-at@teste.local', 'Beto Atendente', 'x', 'clinica', true) returning id into k_at;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values
    ('teste-f4-at2@teste.local', 'Caio Atendente', 'x', 'clinica', true) returning id into k_at2;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values
    ('teste-f4-res@teste.local', 'Duda Restrita', 'x', 'clinica', true) returning id into k_res;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values
    ('teste-f4-le@teste.local', 'Eva Leitura', 'x', 'clinica', true) returning id into k_le;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values
    ('teste-f4-sup@teste.local', 'Fábio Supervisor', 'x', 'clinica', true) returning id into k_sup;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values
    ('teste-f4-b@teste.local', 'Gil B', 'x', 'clinica', true) returning id into k_b;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values
    (k_adm, cA, 'admin'), (k_at, cA, 'atendente'), (k_at2, cA, 'atendente'), (k_le, cA, 'leitura'),
    (k_sup, cA, 'supervisor'), (k_b, cB, 'admin');
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas) values (k_res, cA, 'atendente', false);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash('tok-f4-adm'), k_adm, now() + interval '1 hour'), (public.nx_hash('tok-f4-at'), k_at, now() + interval '1 hour'),
    (public.nx_hash('tok-f4-at2'), k_at2, now() + interval '1 hour'), (public.nx_hash('tok-f4-res'), k_res, now() + interval '1 hour'),
    (public.nx_hash('tok-f4-le'), k_le, now() + interval '1 hour'), (public.nx_hash('tok-f4-sup'), k_sup, now() + interval '1 hour'),
    (public.nx_hash('tok-f4-b'), k_b, now() + interval '1 hour');

  select id into f_pac from public.nx_funis where cliente_id = cA and padrao;
  select id into f_pos from public.nx_funis where cliente_id = cA and not conta_no_ads;
  select id into s_nova from public.nx_estagios where funil_id = f_pac and marco = 'nova';
  select id into s_agend from public.nx_estagios where funil_id = f_pac and marco = 'agendada';
  select id into s_orc from public.nx_estagios where funil_id = f_pac and marco = 'orcamento';
  select id into s_fechou from public.nx_estagios where funil_id = f_pac and marco = 'fechou';
  select id into s_naofech from public.nx_estagios where funil_id = f_pac and marco = 'nao_fechou';
  select id into s_perd from public.nx_estagios where funil_id = f_pac and marco = 'perdida';
  select id into s_emtrat from public.nx_estagios where funil_id = f_pos order by ordem limit 1;
  select id into fB from public.nx_funis where cliente_id = cB and padrao;
  select id into sB from public.nx_estagios where funil_id = fB order by ordem limit 1;
  select id into e_impl from public.nx_etiquetas where cliente_id = cA and nome = 'Implante';
  select id into e_orto from public.nx_etiquetas where cliente_id = cA and nome = 'Ortodontia';
  select id into e_urg from public.nx_etiquetas where cliente_id = cA and nome = 'Urgência';
  select id into eB from public.nx_etiquetas where cliente_id = cB limit 1;
  select id into m_preco from public.nx_motivos_perda where cliente_id = cA and nome = 'Preço';
  update public.nx_motivos_perda set exige_texto = true where cliente_id = cA and nome = 'Sem interesse agora' returning id into m_outro;

  -- ---------------------------------------------------------- nx_crm_base
  j := public.nx_crm_base('tok-f4-le', cA)::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'funis') = 2, 'base: 2 funis do modelo odonto');
  perform pg_temp.ok(jsonb_array_length(j -> 'funis' -> 0 -> 'estagios') = 7 and (j -> 'funis' -> 0 ->> 'padrao')::boolean, 'base: Pacientes (padrão) com 7 etapas na frente');
  perform pg_temp.ok(jsonb_array_length(j -> 'etiquetas') = 9 and jsonb_array_length(j -> 'motivos') = 6, 'base: 9 etiquetas e 6 motivos');
  perform pg_temp.ok(jsonb_array_length(j -> 'usuarios') = 6 and j ? 'ticket' and (j -> 'eu' ->> 'papel') = 'leitura', 'base: 6 usuários, ticket e eu');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_crm_base(%L,%L)', 'tok-f4-b', cA)) = 'sem_acesso', 'base: conta de outro cliente → sem_acesso');

  -- ---------------------------------------------------------- criar negócio (contato novo por telefone digitado)
  j := public.nx_negocio_salvar('tok-f4-at', cA, jsonb_build_object('contato', jsonb_build_object('nome', 'João da Silva', 'telefone', '(12) 99830-3030'),
        'titulo', 'Implante superior', 'valor_previsto', 3500, 'etiquetas', jsonb_build_array(e_impl, eB)))::jsonb;
  n1 := (j ->> 'id')::bigint; ct1 := (j -> 'contato' ->> 'id')::bigint;
  perform pg_temp.ok((select telefone from public.nx_contatos where id = ct1) = '5512998303030', 'contato novo: telefone digitado ganha 55');
  perform pg_temp.ok((j ->> 'estagio_id')::uuid = s_nova and (j ->> 'funil_id')::uuid = f_pac and j ->> 'status' = 'aberto', 'negócio: funil padrão, 1ª etapa aberta');
  perform pg_temp.ok((j ->> 'dono_id')::uuid = k_at and j ->> 'origem' = 'manual' and j ->> 'nome' = 'João da Silva', 'negócio: dono = quem cria, origem manual, nome copiado do contato (gatilho)');
  perform pg_temp.ok(j -> 'etiquetas' = jsonb_build_array(e_impl), 'negócio: etiqueta de outro cliente descartada');
  j := public.nx_negocio_salvar('tok-f4-at', cA, jsonb_build_object('contato', jsonb_build_object('nome', 'Outro nome', 'telefone', '551298303030'),
        'titulo', 'Clareamento', 'etiquetas', jsonb_build_array(e_orto, e_impl)))::jsonb;
  n2 := (j ->> 'id')::bigint;
  perform pg_temp.ok((j -> 'contato' ->> 'id')::bigint = ct1, 'telefone sem o 9 → reaproveita o mesmo contato');
  perform pg_temp.ok((select count(*) from public.nx_contatos where cliente_id = cA) = 1, 'nenhum contato duplicado');
  j := public.nx_negocio_salvar('tok-f4-at2', cA, jsonb_build_object('contato', jsonb_build_object('nome', 'Márcia Araújo', 'telefone', '12 98111-2222'),
        'titulo', 'Ortodontia', 'etiquetas', jsonb_build_array(e_urg)))::jsonb;
  n3 := (j ->> 'id')::bigint; ct2 := (j -> 'contato' ->> 'id')::bigint;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_salvar(%L,%L,%L)', 'tok-f4-at', cA, '{"titulo":"x"}')) = 'dados_invalidos|contato', 'criar sem contato → dados_invalidos');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_salvar(%L,%L,%L)', 'tok-f4-at', cA, jsonb_build_object('contato_id', ct1, 'estagio_id', s_fechou))) = 'estagio_invalido|fechado', 'criar direto em etapa ganha → estagio_invalido');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_salvar(%L,%L,%L)', 'tok-f4-at', cA, jsonb_build_object('contato', jsonb_build_object('telefone', '123')))) = 'telefone_invalido|telefone', 'telefone curto → telefone_invalido');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_salvar(%L,%L,%L)', 'tok-f4-le', cA, jsonb_build_object('contato_id', ct1))) = 'sem_permissao', 'leitura não cria negócio');

  -- ---------------------------------------------------------- kanban e filtros
  j := public.nx_negocios_kanban('tok-f4-le', cA, f_pac)::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'colunas') = 7, 'kanban: 7 colunas');
  perform pg_temp.ok((j -> 'colunas' -> 0 ->> 'total')::int = 3 and jsonb_array_length(j -> 'colunas' -> 0 -> 'itens') = 3, 'kanban: 3 na Nova conversa');
  perform pg_temp.ok((j -> 'totais' ->> 'abertos')::int = 3 and (j -> 'totais' ->> 'soma_aberto')::numeric = 3500
                     and (j -> 'totais' ->> 'previsao_ponderada')::numeric = 350, 'kanban: totais (abertos, soma, previsão ponderada 10%)');
  perform pg_temp.ok((j -> 'colunas' -> 0 -> 'itens' -> 0 ->> 'id')::bigint = n3, 'kanban: mais novo no topo');
  j := public.nx_negocios_kanban('tok-f4-le', cA, null)::jsonb;
  perform pg_temp.ok((j ->> 'funil_id')::uuid = f_pac, 'kanban sem funil → funil padrão');
  j := public.nx_negocios_kanban('tok-f4-le', cA, f_pac, jsonb_build_object('busca', 'joao'))::jsonb;
  perform pg_temp.ok((j -> 'colunas' -> 0 ->> 'total')::int = 2, 'filtro busca sem acento (joao → João)');
  j := public.nx_negocios_kanban('tok-f4-le', cA, f_pac, jsonb_build_object('busca', '98111'))::jsonb;
  perform pg_temp.ok((j -> 'colunas' -> 0 ->> 'total')::int = 1, 'filtro busca por dígitos → telefone');
  j := public.nx_negocios_kanban('tok-f4-le', cA, f_pac, jsonb_build_object('etiquetas', jsonb_build_object('op', 'alguma', 'ids', jsonb_build_array(e_impl, e_urg))))::jsonb;
  perform pg_temp.ok((j -> 'colunas' -> 0 ->> 'total')::int = 3, 'etiquetas: alguma');
  j := public.nx_negocios_kanban('tok-f4-le', cA, f_pac, jsonb_build_object('etiquetas', jsonb_build_object('op', 'todas', 'ids', jsonb_build_array(e_impl, e_orto))))::jsonb;
  perform pg_temp.ok((j -> 'colunas' -> 0 ->> 'total')::int = 1, 'etiquetas: todas');
  j := public.nx_negocios_kanban('tok-f4-le', cA, f_pac, jsonb_build_object('etiquetas', jsonb_build_object('op', 'nenhuma', 'ids', jsonb_build_array(e_impl))))::jsonb;
  perform pg_temp.ok((j -> 'colunas' -> 0 ->> 'total')::int = 1, 'etiquetas: nenhuma');
  j := public.nx_negocios_kanban('tok-f4-at', cA, f_pac, jsonb_build_object('dono', 'eu'))::jsonb;
  perform pg_temp.ok((j -> 'colunas' -> 0 ->> 'total')::int = 2, 'filtro dono = eu');
  j := public.nx_negocios_kanban('tok-f4-le', cA, f_pac, jsonb_build_object('valor_min', 1000))::jsonb;
  perform pg_temp.ok((j -> 'colunas' -> 0 ->> 'total')::int = 1, 'filtro valor mínimo');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocios_kanban(%L,%L,%L)', 'tok-f4-le', cA, fB)) = 'funil_invalido|nao_encontrado', 'kanban: funil de outro cliente → funil_invalido');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocios_kanban(%L,%L,%L,%L)', 'tok-f4-le', cA, f_pac, '{"campo":{"chave":"x; drop","op":"igual"}}')) = 'dados_invalidos|campo', 'filtro campo: chave inválida recusada');
  j := public.nx_negocios_coluna('tok-f4-le', cA, s_nova, '{}'::jsonb, 1)::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'itens') = 2 and not (j ->> 'tem_mais')::boolean, 'coluna: offset 1 → 2 itens, sem mais');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocios_coluna(%L,%L,%L,%L,0)', 'tok-f4-le', cA, sB, '{}')) = 'estagio_invalido', 'coluna: etapa de outro cliente');

  -- visão restrita (atendente sem ver_todas): só os seus e os sem dono
  update public.nx_leads set dono_id = null where id = n3;
  j := public.nx_negocios_kanban('tok-f4-res', cA, f_pac)::jsonb;
  perform pg_temp.ok((j -> 'colunas' -> 0 ->> 'total')::int = 1, 'restrito: só vê o sem dono');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_ver(%L,%L,%s)', 'tok-f4-res', cA, n1)) = 'negocio_nao_encontrado', 'restrito: negócio de colega some');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_mover(%L,%L,%s,%L)', 'tok-f4-res', cA, n1, s_orc)) = 'negocio_nao_encontrado', 'restrito: não move negócio de colega');

  -- ---------------------------------------------------------- mover
  j := public.nx_negocio_mover('tok-f4-at', cA, n1, s_orc)::jsonb;
  perform pg_temp.ok((j ->> 'estagio_id')::uuid = s_orc and (select etapa from public.nx_leads where id = n1) = 'orcamento', 'mover: etapa ↔ marco (orcamento)');
  -- agendada com data e hora
  j := public.nx_negocio_mover('tok-f4-at', cA, n2, s_agend, null, jsonb_build_object('consulta_em', '2026-10-05T14:30'))::jsonb;
  select * into r from public.nx_leads where id = n2;
  perform pg_temp.ok(r.consulta_em = ('2026-10-05 14:30'::timestamp at time zone 'America/Sao_Paulo') and r.data_consulta = '2026-10-05'
                     and r.data_agenda = (now() at time zone 'America/Sao_Paulo')::date and r.etapa = 'agendada', 'mover p/ agendada: consulta_em, data_consulta (SP) e data_agenda');
  -- ganho sem valor
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_mover(%L,%L,%s,%L)', 'tok-f4-at', cA, n2, s_fechou)) = 'valor_obrigatorio', 'ganho sem valor → valor_obrigatorio');
  -- campo obrigatório do negócio bloqueia GANHAR
  insert into public.nx_campos (cliente_id, entidade, chave, rotulo, tipo, obrigatorio, funil_id)
  values (cA, 'negocio', 'procedimento', 'Procedimento', 'texto', true, f_pac);
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_mover(%L,%L,%s,%L,null,%L)', 'tok-f4-at', cA, n1, s_fechou, '{"valor":3200}')) = 'campo_obrigatorio|procedimento', 'campo obrigatório vazio → campo_obrigatorio');
  select coalesce(sum((x2 ->> 'valor')::numeric), 0) into rec_antes
    from jsonb_array_elements(public.nx_dados('tok-f4-adm', cA)::jsonb -> 'leads') x2 where x2 ->> 'etapa' = 'fechou';
  j := public.nx_negocio_mover('tok-f4-at', cA, n1, s_fechou, null, '{"valor":3200,"campos":{"procedimento":"Implante"}}')::jsonb;
  select * into r from public.nx_leads where id = n1;
  perform pg_temp.ok(r.status = 'ganho' and r.valor = 3200 and r.fechado_em is not null and r.etapa = 'fechou'
                     and r.data_consulta = (now() at time zone 'America/Sao_Paulo')::date and r.campos ->> 'procedimento' = 'Implante', 'ganho: valor, fechado_em, marco fechou, data_consulta, campo');
  select coalesce(sum((x2 ->> 'valor')::numeric), 0) into rec_antes
    from jsonb_array_elements(public.nx_dados('tok-f4-adm', cA)::jsonb -> 'leads') x2 where x2 ->> 'etapa' = 'fechou';
  perform pg_temp.ok(rec_antes = 3200, 'nx_dados conta a receita do ganho (3200)');
  -- reordenar na MESMA coluna ganha não pede nada de novo
  perform public.nx_negocio_mover('tok-f4-at', cA, n1, s_fechou, -1);
  perform pg_temp.ok((select ordem from public.nx_leads where id = n1) = -1, 'reordenar na mesma coluna com p_ordem');

  -- TRAVA DO ADS: ganho não sai do funil de anúncios; receita do nx_dados intacta
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_mover(%L,%L,%s,%L)', 'tok-f4-at', cA, n1, s_emtrat)) = 'funil_invalido|fechado_no_ads', 'trava: ganho p/ Pós-tratamento → fechado_no_ads');
  select coalesce(sum((x2 ->> 'valor')::numeric), 0) into rec_depois
    from jsonb_array_elements(public.nx_dados('tok-f4-adm', cA)::jsonb -> 'leads') x2 where x2 ->> 'etapa' = 'fechou';
  perform pg_temp.ok(rec_depois = rec_antes and (select funil_id from public.nx_leads where id = n1) = f_pac, 'trava: receita do nx_dados não muda');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_mover(%L,%L,%s,%L)', 'tok-f4-at', cA, n3, s_emtrat)) = 'funil_invalido|sai_do_ads', 'trava: aberto p/ funil fora do Ads → sai_do_ads');
  -- "Iniciar pós-venda": negócio NOVO no pós, sem herdar anúncio (mesmo com contato de anúncio)
  update public.nx_contatos set plataforma = 'meta', campanha_ext = 'cmp-1' where id = ct1;
  j := public.nx_negocio_salvar('tok-f4-at', cA, jsonb_build_object('contato_id', ct1, 'funil_id', f_pos, 'titulo', 'Pós-venda — João'))::jsonb;
  nPos := (j ->> 'id')::bigint;
  perform pg_temp.ok((j ->> 'funil_id')::uuid = f_pos and (j ->> 'estagio_id')::uuid = s_emtrat and j ->> 'plataforma' is null
                     and j ->> 'origem' = 'manual' and not (j ->> 'anuncio')::boolean, 'Iniciar pós-venda: negócio novo no pós, sem plataforma');
  perform pg_temp.ok((select count(*) from public.nx_leads where contato_id = ct1) = 3, 'Iniciar pós-venda não mexe no ganho');

  -- perder: motivo obrigatório (e texto quando o motivo pede)
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_mover(%L,%L,%s,%L)', 'tok-f4-at', cA, n3, s_naofech)) = 'motivo_obrigatorio', 'perder sem motivo → motivo_obrigatorio');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_mover(%L,%L,%s,%L,null,%L)', 'tok-f4-at', cA, n3, s_naofech, jsonb_build_object('motivo_perda_id', m_outro))) = 'motivo_obrigatorio|texto', 'motivo que exige texto sem texto');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_mover(%L,%L,%s,%L,null,%L)', 'tok-f4-at', cA, n3, s_naofech, jsonb_build_object('motivo_perda_id', gen_random_uuid()))) = 'dados_invalidos|motivo_perda_id', 'motivo inexistente');
  perform public.nx_negocio_mover('tok-f4-at', cA, n3, s_naofech, null, jsonb_build_object('motivo_perda_id', m_preco));
  select * into r from public.nx_leads where id = n3;
  perform pg_temp.ok(r.status = 'perdido' and r.motivo_perda_id = m_preco and r.etapa = 'nao_fechou' and r.fechado_em is not null, 'perdido com motivo');
  -- perdido → outra etapa perdida mantém o motivo; reabrir limpa
  perform public.nx_negocio_mover('tok-f4-at', cA, n3, s_perd);
  perform pg_temp.ok((select motivo_perda_id from public.nx_leads where id = n3) = m_preco, 'perdido → perdido mantém o motivo');
  perform public.nx_negocio_mover('tok-f4-at', cA, n3, s_nova);
  select * into r from public.nx_leads where id = n3;
  perform pg_temp.ok(r.status = 'aberto' and r.motivo_perda_id is null and r.fechado_em is null, 'reabrir: status aberto, motivo e fechado_em limpos');
  -- kanban: ganho recente aparece; com fechados_dias os antigos somem
  update public.nx_leads set fechado_em = now() - interval '40 days' where id = n1;
  j := public.nx_negocios_kanban('tok-f4-le', cA, f_pac)::jsonb;
  select c into cols from jsonb_array_elements(j -> 'colunas') c where (c ->> 'estagio_id')::uuid = s_fechou;
  perform pg_temp.ok((cols ->> 'total')::int = 0, 'kanban: ganho de 40 dias fora dos 30 dias');
  j := public.nx_negocios_kanban('tok-f4-le', cA, f_pac, '{"fechados_dias":0}')::jsonb;
  select c into cols from jsonb_array_elements(j -> 'colunas') c where (c ->> 'estagio_id')::uuid = s_fechou;
  perform pg_temp.ok((cols ->> 'total')::int = 1 and (cols ->> 'soma_valor')::numeric = 3200, '"Ver mais antigos" (fechados_dias 0) mostra o ganho e soma o valor');
  -- isolamento no mover
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_mover(%L,%L,%s,%L)', 'tok-f4-at', cA, n2, sB)) = 'estagio_invalido', 'mover para etapa de outro cliente → estagio_invalido');
  insert into public.nx_leads (cliente_id, nome, telefone) values (cB, 'Lead B', '5512977776666') returning id into nB;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_mover(%L,%L,%s,%L)', 'tok-f4-at', cA, nB, s_orc)) = 'negocio_nao_encontrado'
                     and (select estagio_id from public.nx_leads where id = nB) = sB, 'mover negócio de outro cliente → nao_encontrado, linha intacta');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_ver(%L,%L,%s)', 'tok-f4-adm', cA, nB)) = 'negocio_nao_encontrado', 'ver negócio de outro cliente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_salvar(%L,%L,%L)', 'tok-f4-adm', cA, jsonb_build_object('id', nB, 'titulo', 'hack'))) = 'negocio_nao_encontrado'
                     and (select titulo from public.nx_leads where id = nB) is null, 'salvar negócio de outro cliente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_excluir(%L,%L,%s)', 'tok-f4-adm', cA, nB)) = 'negocio_nao_encontrado', 'excluir negócio de outro cliente');

  -- ---------------------------------------------------------- atualizar e gaveta
  j := public.nx_negocio_salvar('tok-f4-at', cA, jsonb_build_object('id', n2, 'valor_previsto', 1100, 'servico', 'Clareamento',
        'etiquetas', jsonb_build_array(e_urg), 'campos', jsonb_build_object('procedimento', 'Clareamento a laser')))::jsonb;
  perform pg_temp.ok((j ->> 'valor_previsto')::numeric = 1100 and j -> 'etiquetas' = jsonb_build_array(e_urg)
                     and j -> 'campos' ->> 'procedimento' = 'Clareamento a laser' and j ->> 'titulo' = 'Clareamento', 'salvar: só as chaves presentes');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_salvar(%L,%L,%L)', 'tok-f4-at', cA, jsonb_build_object('id', n2, 'dono_id', k_b))) = 'dados_invalidos|dono_id', 'dono de outro cliente recusado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_salvar(%L,%L,%L)', 'tok-f4-at', cA, jsonb_build_object('id', n2, 'valor_previsto', -5))) = 'dados_invalidos|valor_previsto', 'valor negativo recusado');
  j := public.nx_negocio_ver('tok-f4-le', cA, n1)::jsonb;
  perform pg_temp.ok(j ?& array['negocio','contato','empresa','funil','estagio','anuncio','tarefas','notas','tempo','conversas','outros'], 'ver: todas as chaves');
  perform pg_temp.ok(j -> 'negocio' ->> 'status' = 'ganho' and (j -> 'contato' ->> 'id')::bigint = ct1 and not (j -> 'contato' ? 'busca'), 'ver: negócio e contato (sem busca/tel_chave)');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(j -> 'tempo') t where t ->> 'tipo' = 'negocio_criado')
                     and exists (select 1 from jsonb_array_elements(j -> 'tempo') t where t ->> 'tipo' = 'ganho'), 'ver: linha do tempo com criado e ganho');
  perform pg_temp.ok(jsonb_array_length(j -> 'outros') = 2, 'ver: outros negócios do contato');

  -- ---------------------------------------------------------- tarefas
  j := public.nx_tarefa_salvar('tok-f4-at', cA, jsonb_build_object('titulo', 'Ligar para confirmar', 'tipo', 'ligacao', 'negocio_id', n2,
        'vence_em', to_char(now() - interval '1 hour', 'YYYY-MM-DD"T"HH24:MI:SSOF')))::jsonb;
  t1 := (j ->> 'id')::bigint;
  perform pg_temp.ok((j -> 'contato' ->> 'id')::bigint = ct1 and (j ->> 'atrasada')::boolean and (j -> 'dono' ->> 'id')::uuid = k_at, 'tarefa: herda o contato do negócio, atrasada, dono = quem cria');
  j := public.nx_negocios_kanban('tok-f4-le', cA, f_pac)::jsonb;
  select c into cols from jsonb_array_elements(j -> 'colunas') c where (c ->> 'estagio_id')::uuid = s_agend;
  perform pg_temp.ok((cols -> 'itens' -> 0 -> 'tarefa' ->> 'atrasada')::boolean, 'card: selo de tarefa atrasada');
  j := public.nx_tarefa_concluir('tok-f4-at', cA, t1, true)::jsonb;
  perform pg_temp.ok(j ->> 'concluida_em' is not null and not (j ->> 'atrasada')::boolean, 'tarefa concluída');
  j := public.nx_tarefa_concluir('tok-f4-at', cA, t1, false)::jsonb;
  perform pg_temp.ok(j ->> 'concluida_em' is null, 'tarefa reaberta');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_tarefa_salvar(%L,%L,%L)', 'tok-f4-at', cA, jsonb_build_object('titulo', 'x', 'negocio_id', nB))) = 'negocio_nao_encontrado', 'tarefa com negócio de outro cliente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_tarefa_salvar(%L,%L,%L)', 'tok-f4-at', cA, '{"titulo":""}')) = 'dados_invalidos|titulo', 'tarefa sem título');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_tarefa_excluir(%L,%L,%s)', 'tok-f4-b', cB, t1)) = 'tarefa_nao_encontrada', 'excluir tarefa de outro cliente');
  -- visão restrita (revisão S2): tarefa de colega não é alterável e ela só liga tarefa/nota ao que enxerga
  perform pg_temp.ok((select dono_id from public.nx_contatos where id = ct2) = k_at2 and (select dono_id from public.nx_leads where id = n2) = k_at, 'pré S2: ct2 e n2 são de colegas');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_tarefa_concluir(%L,%L,%s,true)', 'tok-f4-res', cA, t1)) = 'tarefa_nao_encontrada'
                     and (select concluida_em from public.nx_tarefas where id = t1) is null, 'restrito: não conclui tarefa de colega');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_tarefa_salvar(%L,%L,%L)', 'tok-f4-res', cA, jsonb_build_object('id', t1, 'titulo', 'hack'))) = 'tarefa_nao_encontrada'
                     and (select titulo from public.nx_tarefas where id = t1) = 'Ligar para confirmar', 'restrito: não edita tarefa de colega');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_tarefa_excluir(%L,%L,%s)', 'tok-f4-res', cA, t1)) = 'tarefa_nao_encontrada', 'restrito: não exclui tarefa de colega');
  perform pg_temp.ok(exists (select 1 from public.nx_tarefas where id = t1), 'restrito: tarefa do colega continua lá');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_tarefa_salvar(%L,%L,%L)', 'tok-f4-res', cA, jsonb_build_object('titulo', 'x', 'negocio_id', n2))) = 'negocio_nao_encontrado', 'restrito: não liga tarefa a negócio de colega');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_tarefa_salvar(%L,%L,%L)', 'tok-f4-res', cA, jsonb_build_object('titulo', 'x', 'contato_id', ct2))) = 'contato_nao_encontrado', 'restrito: não liga tarefa a contato de colega');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_nota_salvar(%L,%L,%L)', 'tok-f4-res', cA, jsonb_build_object('texto', 'x', 'negocio_id', n2))) = 'negocio_nao_encontrado', 'restrito: não põe nota em negócio de colega');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_nota_salvar(%L,%L,%L)', 'tok-f4-res', cA, jsonb_build_object('texto', 'x', 'contato_id', ct2))) = 'contato_nao_encontrado', 'restrito: não põe nota em contato de colega');
  j := public.nx_tarefa_salvar('tok-f4-res', cA, jsonb_build_object('titulo', 'Retornar', 'negocio_id', n3))::jsonb;   -- n3 está sem dono: visível
  perform pg_temp.ok((j -> 'dono' ->> 'id')::uuid = k_res, 'restrito: cria tarefa no negócio sem dono');
  perform pg_temp.ok((public.nx_tarefa_concluir('tok-f4-res', cA, (j ->> 'id')::bigint, true)::jsonb ->> 'concluida_em') is not null, 'restrito: conclui a própria tarefa');
  perform pg_temp.ok((public.nx_tarefa_excluir('tok-f4-res', cA, (j ->> 'id')::bigint)::jsonb ->> 'ok')::boolean, 'restrito: exclui a própria tarefa');

  -- ---------------------------------------------------------- notas
  j := public.nx_nota_salvar('tok-f4-at', cA, jsonb_build_object('negocio_id', n2, 'texto', 'Prefere horário da manhã'))::jsonb;
  nt1 := (j ->> 'id')::bigint;
  perform pg_temp.ok((j ->> 'contato_id')::bigint = ct1 and (j ->> 'pode_editar')::boolean, 'nota do negócio também é do contato');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_nota_salvar(%L,%L,%L)', 'tok-f4-at2', cA, jsonb_build_object('id', nt1, 'texto', 'mudei'))) = 'sem_permissao', 'colega não edita nota alheia');
  j := public.nx_nota_salvar('tok-f4-adm', cA, jsonb_build_object('id', nt1, 'fixada', true))::jsonb;
  perform pg_temp.ok((j ->> 'fixada')::boolean, 'admin fixa nota alheia');
  j := public.nx_negocio_ver('tok-f4-le', cA, n2)::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'notas') = 1 and jsonb_array_length(j -> 'tarefas') = 1
                     and exists (select 1 from jsonb_array_elements(j -> 'tempo') t where t ->> 'fonte' = 'nota'), 'gaveta: notas, tarefas e tempo com nota');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_nota_excluir(%L,%L,%s)', 'tok-f4-at2', cA, nt1)) = 'sem_permissao', 'colega não exclui nota alheia');

  -- ---------------------------------------------------------- etiqueta
  j := public.nx_etiqueta_salvar('tok-f4-at', cA, '{"nome":"VIP","cor":"#b0761f"}')::jsonb;
  perform pg_temp.ok(j ->> 'cor' = '#B0761F', 'etiqueta criada por atendente');
  j2 := public.nx_etiqueta_salvar('tok-f4-at', cA, '{"nome":"vip"}')::jsonb;
  perform pg_temp.ok(j2 ->> 'id' = j ->> 'id', 'mesmo nome (sem caixa) → mesma etiqueta');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_etiqueta_salvar(%L,%L,%L)', 'tok-f4-at', cA, jsonb_build_object('id', j ->> 'id', 'nome', 'VIP 2'))) = 'sem_permissao', 'editar etiqueta exige supervisor');
  perform pg_temp.ok((public.nx_etiqueta_salvar('tok-f4-sup', cA, jsonb_build_object('id', j ->> 'id', 'nome', 'VIP ouro'))::jsonb ->> 'nome') = 'VIP ouro', 'supervisor edita etiqueta');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_etiqueta_salvar(%L,%L,%L)', 'tok-f4-sup', cA, jsonb_build_object('id', eB, 'nome', 'x'))) = 'etiqueta_nao_encontrada', 'etiqueta de outro cliente');

  -- ---------------------------------------------------------- contatos
  j := public.nx_contatos_listar('tok-f4-le', cA, jsonb_build_object('busca', 'marcia araujo'))::jsonb;
  perform pg_temp.ok((j ->> 'total')::int = 1 and (j -> 'itens' -> 0 ->> 'id')::bigint = ct2, 'contatos: busca sem acento');
  j := public.nx_contatos_listar('tok-f4-le', cA, jsonb_build_object('busca', '99830-3030'))::jsonb;
  perform pg_temp.ok((j ->> 'total')::int = 1 and (j -> 'itens' -> 0 ->> 'id')::bigint = ct1, 'contatos: busca por telefone formatado');
  j := public.nx_contatos_listar('tok-f4-le', cA, '{}'::jsonb, 1, 50, 'nome')::jsonb;
  perform pg_temp.ok((j ->> 'total')::int = 2 and (j -> 'itens' -> 0 ->> 'nome') = 'João da Silva' and (j -> 'itens' -> 0 ->> 'negocios_abertos')::int = 2, 'contatos: ordem por nome e negócios abertos');
  j := public.nx_contatos_listar('tok-f4-le', cA, '{"tem_negocio_aberto":false}')::jsonb;
  perform pg_temp.ok((j ->> 'total')::int = 0, 'contatos: sem negócio aberto');
  j := public.nx_contato_salvar('tok-f4-at', cA, '{"nome":"Paula Nova","telefone":"12 3456-7890","email":"PAULA@Teste.com","uf":"sp"}')::jsonb;
  perform pg_temp.ok(j ->> 'telefone' = '551234567890' and j ->> 'email' = 'paula@teste.com' and j ->> 'uf' = 'SP'
                     and (j ->> 'dono_id')::uuid = k_at and not (j ? 'busca'), 'contato novo: normaliza telefone/e-mail/UF');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contato_salvar(%L,%L,%L)', 'tok-f4-at', cA, jsonb_build_object('id', (j ->> 'id')::bigint, 'telefone', '12998303030'))) = 'telefone_em_uso|' || ct1, 'telefone de outro contato → telefone_em_uso (hint = id)');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contato_salvar(%L,%L,%L)', 'tok-f4-at', cA, jsonb_build_object('id', ct1, 'optin_marketing', false))) = 'dados_invalidos|optin_origem', 'opt-in sem origem recusado');
  j := public.nx_contato_salvar('tok-f4-at', cA, jsonb_build_object('id', ct1, 'optin_marketing', true, 'optin_origem', 'ficha assinada na recepção'))::jsonb;
  perform pg_temp.ok((j ->> 'optin_marketing')::boolean and j ->> 'optin_em' is not null, 'opt-in com origem');
  j := public.nx_contato_salvar('tok-f4-at', cA, jsonb_build_object('id', ct1, 'nome', 'João Silva Souza'))::jsonb;
  perform pg_temp.ok((select nome from public.nx_leads where id = n2) = 'João Silva Souza' and (select nome from public.nx_leads where id = n1) = 'João da Silva', 'renomear contato muda só o negócio aberto');
  insert into public.nx_campos (cliente_id, entidade, chave, rotulo, tipo, obrigatorio) values (cA, 'contato', 'convenio', 'Convênio', 'texto', true);
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contato_salvar(%L,%L,%L)', 'tok-f4-at', cA, '{"nome":"Sem campo"}')) = 'campo_obrigatorio|convenio', 'contato: campo obrigatório ao criar');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contato_ver(%L,%L,%s)', 'tok-f4-adm', cA, (select id from public.nx_contatos where cliente_id = cB limit 1))) = 'contato_nao_encontrado', 'ficha de contato de outro cliente');
  j := public.nx_contato_ver('tok-f4-le', cA, ct1)::jsonb;
  perform pg_temp.ok(j ?& array['contato','empresa','negocios','conversas','tarefas','notas','tempo','rfm'], 'ficha: todas as chaves');
  perform pg_temp.ok((j -> 'rfm' ->> 'ganhos')::int = 1 and (j -> 'rfm' ->> 'total_gasto')::numeric = 3200 and jsonb_array_length(j -> 'negocios') = 3, 'ficha: RFM e negócios');

  -- ---------------------------------------------------------- excluir contato (LGPD)
  insert into public.nx_conversas (cliente_id, contato_id, protocolo, status) values (cA, ct1, '2026-990001', 'aberta') returning id into cv1;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, direcao, tipo, corpo, status, midia) values
    (cA, cv1, ct1, 'in', 'imagem', null, 'recebida', jsonb_build_object('path', cA::text || '/in/2026-09/a.jpg', 'estado', 'ok')),
    (cA, cv1, ct1, 'in', 'texto', 'oi', 'recebida', null),
    (cA, cv1, ct1, 'in', 'imagem', null, 'recebida', jsonb_build_object('path', cB::text || '/in/2026-09/forjado.jpg', 'estado', 'ok'));
  j := public.nx_contato_ver('tok-f4-adm', cA, ct1)::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'conversas') = 1, 'ficha: conversa visível ao admin');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contato_ver(%L,%L,%s)', 'tok-f4-res', cA, ct2)) = 'contato_nao_encontrado', 'restrito: contato de colega some');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contato_excluir(%L,%L,%s,%L)', 'tok-f4-at', cA, ct1, 'excluir')) = 'sem_permissao', 'atendente não exclui contato');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contato_excluir(%L,%L,%s,%L)', 'tok-f4-adm', cA, ct1, 'sim')) = 'dados_invalidos|confirmacao', 'excluir exige digitar "excluir"');
  select coalesce(sum((x2 ->> 'valor')::numeric), 0) into rec_antes
    from jsonb_array_elements(public.nx_dados('tok-f4-adm', cA)::jsonb -> 'leads') x2 where x2 ->> 'etapa' = 'fechou';
  j := public.nx_contato_excluir('tok-f4-adm', cA, ct1, 'excluir')::jsonb;
  perform pg_temp.ok((j ->> 'ok')::boolean and (j ->> 'midias_na_fila')::int = 1, 'LGPD: 1 mídia (só da pasta do cliente) na faxina');
  perform pg_temp.ok(exists (select 1 from public.nx_midia_lixo where cliente_id = cA and path = cA::text || '/in/2026-09/a.jpg')
                     and not exists (select 1 from public.nx_midia_lixo where path like cB::text || '/%forjado%'), 'LGPD: path forjado de outro cliente não entra');
  perform pg_temp.ok(not exists (select 1 from public.nx_contatos where id = ct1) and not exists (select 1 from public.nx_conversas where id = cv1)
                     and not exists (select 1 from public.nx_mensagens where conversa_id = cv1) and not exists (select 1 from public.nx_tarefas where id = t1)
                     and not exists (select 1 from public.nx_notas where id = nt1), 'LGPD: contato, conversa, mensagens, tarefas e notas apagados');
  perform pg_temp.ok((select count(*) from public.nx_leads where id in (n1, n2, nPos) and nome = 'Removido' and telefone is null and contato_id is null and obs is null) = 3,
                     'LGPD: negócios anonimizados');
  select coalesce(sum((x2 ->> 'valor')::numeric), 0) into rec_depois
    from jsonb_array_elements(public.nx_dados('tok-f4-adm', cA)::jsonb -> 'leads') x2 where x2 ->> 'etapa' = 'fechou';
  perform pg_temp.ok(rec_depois = rec_antes, 'LGPD: receita do ROI não muda');
  -- excluir negócio
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_negocio_excluir(%L,%L,%s)', 'tok-f4-at', cA, n3)) = 'sem_permissao', 'atendente não exclui negócio');
  j := public.nx_negocio_excluir('tok-f4-adm', cA, n3)::jsonb;   -- (o exists abaixo precisa de outro comando: snapshot)
  perform pg_temp.ok((j ->> 'ok')::boolean and not exists (select 1 from public.nx_leads where id = n3), 'admin exclui negócio');

  -- ---------------------------------------------------------- permissões (grants)
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_negocios_kanban(text,uuid,uuid,jsonb,integer)', 'execute')
                 and has_function_privilege('anon', 'public.nx_negocio_mover(text,uuid,bigint,uuid,double precision,jsonb)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_crm_cards(uuid,bigint[],public.nx_ctx_t)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_crm_filtro_negocios(uuid,public.nx_ctx_t,jsonb,boolean)', 'execute')
                 and not has_function_privilege('authenticated', 'public.nx_crm_tempo(uuid,public.nx_ctx_t,bigint,bigint)', 'execute'),
                 'grants: painel anon; internas só service_role');
  raise notice 'OK 04_crm (funcional)';
end $t$;

-- ============================================================ TEMPO (regra 11): 5.000 contatos, 5.000 negócios, 20.000 mensagens
do $t$
declare
  cT uuid; k_adm uuid; k_res uuid; fT uuid; st uuid[]; eT uuid; ids bigint[]; ctx bigint; neg bigint;
  t0 timestamptz; ms numeric; rel text := ''; j jsonb;
begin
  select id into k_adm from public.nx_contas where email = 'teste-f4-adm@teste.local';
  select id into k_res from public.nx_contas where email = 'teste-f4-res@teste.local';
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-f4-t', 'Teste F4 Tempo', 'odonto') returning id into cT;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_adm, cT, 'admin');
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas) values (k_res, cT, 'atendente', false);
  select id into fT from public.nx_funis where cliente_id = cT and padrao;
  select array_agg(id order by ordem) into st from public.nx_estagios where funil_id = fT;
  select id into eT from public.nx_etiquetas where cliente_id = cT order by nome limit 1;
  perform set_config('nx.lote', '1', true);
  perform set_config('nx.sem_historico', '1', true);
  insert into public.nx_contatos (cliente_id, nome, telefone, email, etiquetas, dono_id, criado_em, ultimo_contato_em)
  select cT, 'Contato Teste ' || g || case when g % 7 = 0 then ' Araújo' else '' end,
         '55129' || lpad(g::text, 8, '0'), 'c' || g || '@teste.local',
         case when g % 3 = 0 then array[eT] else '{}'::uuid[] end,
         case when g % 2 = 0 then k_adm end,
         now() - make_interval(mins => g), now() - make_interval(mins => g * 2)
    from generate_series(1, 5000) g;
  insert into public.nx_leads (cliente_id, contato_id, estagio_id, valor_previsto, dono_id, titulo, etiquetas, valor)
  select cT, k.id, st[1 + (k.rn % 7)::int], (k.rn % 10) * 150, case when k.rn % 2 = 0 then k_adm end,
         'Negócio ' || k.rn, case when k.rn % 4 = 0 then array[eT] else '{}'::uuid[] end,
         case when (k.rn % 7) = 4 then 1000 end
    from (select id, row_number() over (order by id) as rn from public.nx_contatos where cliente_id = cT) k;
  insert into public.nx_conversas (cliente_id, contato_id, protocolo, status, nao_lidas)
  select cT, k.id, '2026-' || lpad(k.rn::text, 6, '0'), 'aberta', (k.rn % 3)::int
    from (select id, row_number() over (order by id) as rn from public.nx_contatos where cliente_id = cT order by id limit 2000) k;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, direcao, tipo, corpo, status)
  select cT, cv.id, cv.contato_id, case when g % 2 = 0 then 'in' else 'out' end, 'texto', 'mensagem ' || g,
         case when g % 2 = 0 then 'recebida' else 'enviada' end
    from public.nx_conversas cv cross join generate_series(1, 10) g where cv.cliente_id = cT;
  perform public.nx_pulso_lote_fim();
  perform set_config('nx.lote', '', true);
  perform set_config('nx.sem_historico', '', true);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash('tok-f4t-adm'), k_adm, now() + interval '1 hour'),
    (public.nx_hash('tok-f4t-res'), k_res, now() + interval '1 hour');
  perform pg_temp.ok((select count(*) from public.nx_leads where cliente_id = cT) = 5000
                     and (select count(*) from public.nx_mensagens where cliente_id = cT) = 20000, 'volume gerado');
  select id, contato_id into neg, ctx from public.nx_leads where cliente_id = cT and contato_id in (select contato_id from public.nx_conversas where cliente_id = cT) limit 1;

  t0 := clock_timestamp(); j := public.nx_crm_base('tok-f4t-adm', cT)::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' base=' || round(ms); perform pg_temp.ok(ms < 2000, 'lento nx_crm_base ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_negocios_kanban('tok-f4t-adm', cT, fT)::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' kanban=' || round(ms); perform pg_temp.ok(ms < 2000, 'lento nx_negocios_kanban ' || round(ms) || ' ms');
  perform pg_temp.ok((select sum((c ->> 'total')::int) from jsonb_array_elements(j -> 'colunas') c) > 0
                     and jsonb_array_length(j -> 'colunas' -> 0 -> 'itens') = 30, 'kanban grande: 30 por coluna');
  t0 := clock_timestamp(); j := public.nx_negocios_kanban('tok-f4t-adm', cT, fT, '{"busca":"araujo","fechados_dias":0}')::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' kanban_busca=' || round(ms); perform pg_temp.ok(ms < 2000, 'lento kanban busca ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_negocios_kanban('tok-f4t-adm', cT, fT, jsonb_build_object('etiquetas', jsonb_build_object('op', 'nenhuma', 'ids', jsonb_build_array(eT)), 'dono', 'sem'))::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' kanban_filtros=' || round(ms); perform pg_temp.ok(ms < 2000, 'lento kanban filtros ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_negocios_kanban('tok-f4t-res', cT, fT)::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' kanban_restrito=' || round(ms); perform pg_temp.ok(ms < 2000, 'lento kanban restrito ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_negocios_coluna('tok-f4t-adm', cT, st[2], '{}', 300)::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' coluna=' || round(ms); perform pg_temp.ok(ms < 2000, 'lento nx_negocios_coluna ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_contatos_listar('tok-f4t-adm', cT, '{}')::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' contatos=' || round(ms); perform pg_temp.ok(ms < 2000, 'lento nx_contatos_listar ' || round(ms) || ' ms');
  perform pg_temp.ok((j ->> 'total')::int = 5000 and jsonb_array_length(j -> 'itens') = 50 and (j ->> 'tem_mais')::boolean, 'contatos: total exato 5000 e página de 50');
  t0 := clock_timestamp(); j := public.nx_contatos_listar('tok-f4t-adm', cT, '{"busca":"araujo"}', 3, 50, 'nome')::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' contatos_busca=' || round(ms); perform pg_temp.ok(ms < 2000, 'lento contatos busca ' || round(ms) || ' ms');
  perform pg_temp.ok((j ->> 'total')::int = 714, 'contatos: busca araujo = 714');
  t0 := clock_timestamp(); j := public.nx_contatos_listar('tok-f4t-adm', cT, jsonb_build_object('busca', '0000123', 'etiquetas', jsonb_build_object('op', 'alguma', 'ids', jsonb_build_array(eT)), 'tem_negocio_aberto', true), 1, 100, 'ultimo_contato')::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' contatos_filtros=' || round(ms); perform pg_temp.ok(ms < 2000, 'lento contatos filtros ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_negocio_ver('tok-f4t-adm', cT, neg)::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' negocio_ver=' || round(ms); perform pg_temp.ok(ms < 2000, 'lento nx_negocio_ver ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_contato_ver('tok-f4t-adm', cT, ctx)::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' contato_ver=' || round(ms); perform pg_temp.ok(ms < 2000, 'lento nx_contato_ver ' || round(ms) || ' ms');
  perform pg_temp.ok(jsonb_array_length(j -> 'conversas') = 1, 'ficha: conversa do contato');
  t0 := clock_timestamp(); j := public.nx_negocio_mover('tok-f4t-adm', cT, neg, st[3])::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' mover=' || round(ms); perform pg_temp.ok(ms < 2000, 'lento nx_negocio_mover ' || round(ms) || ' ms');
  raise exception 'OK 04_crm — tempos (ms):%', rel;
end $t$;

rollback;
