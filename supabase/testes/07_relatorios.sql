-- ============================================================
-- ÓRBITA — supabase/testes/07_relatorios.sql · frente F6
-- Smoke do arquivo g (20260928g_relatorios.sql): nx_inicio, nx_rel_vendas,
-- nx_rel_atendimento. Casos §8.4: KPIs por fechado_em; período anterior;
-- tpr mediana; mapa de calor no fuso SP; período > 366 dias → periodo_grande;
-- teste de tempo de 90 dias (5.000 contatos, 5.000 negócios, 20.000
-- mensagens) < 2 s cada relatório. + visibilidade, isolamento, módulo.
-- + P1 (20260928g_relatorios_b.sql): nx_entrada_chave e nx_lead_entrada (formulário do site).
-- Roda pelo execute_sql. TUDO em begin … rollback. Falha = 'FALHOU: <caso>'.
-- O período de teste é JUNHO/2026 (longe do "agora"), para o que os gatilhos
-- carimbam com now() não cair dentro dele.
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

-- instante no fuso de SP
create or replace function pg_temp.sp(p text) returns timestamptz language sql as $f$ select p::timestamp at time zone 'America/Sao_Paulo' $f$;

-- ---------------------------------------------------------- P1: formulário do site (20260928g_relatorios_b.sql)
-- nx_entrada_chave (admin) e nx_lead_entrada (anon). Não levanta exceção no fim: o bloco principal
-- do 07 roda depois e termina em 'VERDE' (rollback garantido).
do $p1$
declare
  c uuid; k_adm uuid; k_le uuid; ch text; ch2 text; r text; j jsonb; n int; nl int; v_ct bigint; v_neg bigint;
  t0 timestamptz; ms numeric;
  ok_dados jsonb := '{"nome":"Maria do Site","telefone":"(12) 99830-3030","email":"Maria@Exemplo.com","mensagem":"Quero avaliar um implante","servico":"Implante","utm_source":"google","utm_campaign":"implante-set"}';
begin
  insert into public.nx_clientes (slug, nome) values ('teste-f6-p1', 'Teste F6 P1') returning id into c;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f6-p1-adm@teste.local', 'Admin P1', 'x', 'clinica', true) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f6-p1-le@teste.local', 'Leitura P1', 'x', 'clinica', true) returning id into k_le;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_adm, c, 'admin'), (k_le, c, 'leitura');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash('tok-f6-p1-adm'), k_adm, now() + interval '1 hour'), (public.nx_hash('tok-f6-p1-le'), k_le, now() + interval '1 hour');

  -- chave: nasce vazia, gera 48 hex, mostra a mesma, rotaciona; leitura não mexe
  perform pg_temp.ok((public.nx_entrada_chave('tok-f6-p1-adm', c, false)::jsonb ->> 'chave') is null, 'P1: chave nasce vazia');
  ch := public.nx_entrada_chave('tok-f6-p1-adm', c, true)::jsonb ->> 'chave';
  perform pg_temp.ok(ch ~ '^[0-9a-f]{48}$', 'P1: chave gerada com 24 bytes hex (' || coalesce(ch, 'null') || ')');
  perform pg_temp.ok(public.nx_entrada_chave('tok-f6-p1-adm', c, false)::jsonb ->> 'chave' = ch, 'P1: mostrar devolve a mesma chave');
  r := pg_temp.erro(format('select public.nx_entrada_chave(%L, %L::uuid, true)', 'tok-f6-p1-le', c));
  perform pg_temp.ok(r like 'sem_permissao%', 'P1: leitura não gera chave (' || r || ')');
  r := pg_temp.erro(format('select public.nx_entrada_chave(%L, %L::uuid, false)', 'tok-f6-p1-le', c));
  perform pg_temp.ok(r like 'sem_permissao%', 'P1: leitura não vê a chave (' || r || ')');

  -- chave errada → ok sem gravar
  j := public.nx_lead_entrada(repeat('ab', 24), ok_dados)::jsonb;
  select count(*) into n from public.nx_leads where cliente_id = c;
  perform pg_temp.ok(j = '{"ok":true}'::jsonb and n = 0, 'P1: chave errada responde ok e não grava');
  j := public.nx_lead_entrada('curta', ok_dados)::jsonb;
  perform pg_temp.ok(j = '{"ok":true}'::jsonb, 'P1: chave malformada responde ok');

  -- dados inválidos: o mesmo erro com chave certa OU errada (não revela a chave)
  r := pg_temp.erro(format('select public.nx_lead_entrada(%L, %L::jsonb)', repeat('ab', 24), '{"telefone":"12998303030"}'));
  perform pg_temp.ok(r = 'dados_invalidos|nome', 'P1: sem nome → dados_invalidos|nome (chave errada) (' || r || ')');
  r := pg_temp.erro(format('select public.nx_lead_entrada(%L, %L::jsonb)', ch, '{"telefone":"12998303030"}'));
  perform pg_temp.ok(r = 'dados_invalidos|nome', 'P1: sem nome → dados_invalidos|nome (chave certa) (' || r || ')');
  r := pg_temp.erro(format('select public.nx_lead_entrada(%L, %L::jsonb)', ch, '{"nome":"Só nome"}'));
  perform pg_temp.ok(r = 'dados_invalidos|telefone', 'P1: sem telefone e sem e-mail (' || r || ')');
  r := pg_temp.erro(format('select public.nx_lead_entrada(%L, %L::jsonb)', ch, '{"nome":"X","email":"nao-e-email"}'));
  perform pg_temp.ok(r = 'dados_invalidos|email', 'P1: e-mail inválido (' || r || ')');
  r := pg_temp.erro(format('select public.nx_lead_entrada(%L, %L::jsonb)', ch, '{"nome":"X","telefone":"123"}'));
  perform pg_temp.ok(r = 'dados_invalidos|telefone', 'P1: telefone curto (' || r || ')');
  r := pg_temp.erro(format('select public.nx_lead_entrada(%L, %L::jsonb)', ch, 'null'));
  perform pg_temp.ok(r = 'dados_invalidos|nome', 'P1: corpo nulo (' || r || ')');

  -- entrada válida: contato + negócio no funil padrão (origem site) + nota + aviso aos admins
  t0 := clock_timestamp();
  j := public.nx_lead_entrada(ch, ok_dados)::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  perform pg_temp.ok(j = '{"ok":true}'::jsonb, 'P1: entrada válida responde ok');
  perform pg_temp.ok(ms < 500, 'P1: nx_lead_entrada rápido (' || round(ms) || ' ms)');
  select l.id, l.contato_id into v_neg, v_ct from public.nx_leads l where l.cliente_id = c;
  perform pg_temp.ok(v_neg is not null, 'P1: negócio criado');
  perform pg_temp.ok(exists (select 1 from public.nx_leads l join public.nx_funis f on f.id = l.funil_id join public.nx_estagios e on e.id = l.estagio_id
                              where l.id = v_neg and f.padrao and l.origem = 'site' and l.status = 'aberto' and l.plataforma is null
                                and l.nome = 'Maria do Site' and l.telefone = '5512998303030' and l.servico = 'Implante'
                                and l.obs like '%utm_source=google%' and l.obs like '%utm_campaign=implante-set%'),
                     'P1: negócio no funil padrão, etapa aberta, origem site, UTMs na observação, sem atribuição de anúncio');
  perform pg_temp.ok(exists (select 1 from public.nx_contatos k where k.id = v_ct and k.cliente_id = c and k.origem = 'site'
                              and k.email = 'maria@exemplo.com' and k.nome = 'Maria do Site'), 'P1: contato criado com e-mail em minúsculas e origem site');
  perform pg_temp.ok(exists (select 1 from public.nx_notas nt where nt.negocio_id = v_neg and nt.contato_id = v_ct and nt.texto like '%Quero avaliar um implante%'),
                     'P1: mensagem virou nota do negócio');
  perform pg_temp.ok(exists (select 1 from public.nx_notificacoes nf where nf.cliente_id = c and nf.conta_id = k_adm and nf.link = '#/crm/negocio/' || v_neg
                              and nf.titulo like 'Novo contato pelo site: Maria do Site%'), 'P1: admin avisado com link para o negócio');
  perform pg_temp.ok(not exists (select 1 from public.nx_notificacoes nf where nf.cliente_id = c and nf.conta_id = k_le), 'P1: leitura não recebe o aviso');

  -- mesmo telefone em outro formato → mesmo contato; só e-mail → acha pelo e-mail; contato existente não é sobrescrito
  perform public.nx_lead_entrada(ch, '{"nome":"Outro Nome","telefone":"5512998303030"}'::jsonb);
  perform public.nx_lead_entrada(ch, '{"nome":"Por E-mail","email":"MARIA@exemplo.com"}'::jsonb);
  select count(*) into n from public.nx_contatos where cliente_id = c;
  select count(*) into nl from public.nx_leads where cliente_id = c and contato_id = v_ct;
  perform pg_temp.ok(n = 1 and nl = 3, 'P1: telefone (com e sem 55) e e-mail acham o mesmo contato (contatos ' || n || ', negócios ' || nl || ')');
  perform pg_temp.ok((select nome from public.nx_contatos where id = v_ct) = 'Maria do Site', 'P1: formulário não sobrescreve o nome do contato');

  -- limite de 30 por hora
  insert into public.nx_leads (cliente_id, nome, origem, funil_id, etapa)
    select c, 'Carga ' || g, 'site', (select id from public.nx_funis where cliente_id = c and padrao), 'nova' from generate_series(1, 27) g;
  r := pg_temp.erro(format('select public.nx_lead_entrada(%L, %L::jsonb)', ch, '{"nome":"Trinta e um","telefone":"12997001122"}'));
  perform pg_temp.ok(r like 'limite_taxa%', 'P1: 31ª entrada na hora → limite_taxa (' || r || ')');

  -- cliente suspenso: ok sem gravar
  update public.nx_leads set criado_em = now() - interval '2 hours' where cliente_id = c;
  update public.nx_clientes set status = 'suspenso' where id = c;
  select count(*) into n from public.nx_leads where cliente_id = c;
  j := public.nx_lead_entrada(ch, '{"nome":"Suspenso","telefone":"12997001133"}'::jsonb)::jsonb;
  perform pg_temp.ok(j = '{"ok":true}'::jsonb and (select count(*) from public.nx_leads where cliente_id = c) = n, 'P1: cliente suspenso não recebe (e não revela)');
  update public.nx_clientes set status = 'ativo', modulos = array_remove(modulos, 'crm') where id = c;
  j := public.nx_lead_entrada(ch, '{"nome":"Sem CRM","telefone":"12997001144"}'::jsonb)::jsonb;
  perform pg_temp.ok(j = '{"ok":true}'::jsonb and (select count(*) from public.nx_leads where cliente_id = c) = n, 'P1: cliente sem o módulo CRM não recebe');

  -- rotacionar invalida a chave velha
  update public.nx_clientes set modulos = array_append(modulos, 'crm') where id = c;
  ch2 := public.nx_entrada_chave('tok-f6-p1-adm', c, true)::jsonb ->> 'chave';
  perform pg_temp.ok(ch2 <> ch, 'P1: rotacionar gera outra chave');
  perform public.nx_lead_entrada(ch, '{"nome":"Chave velha","telefone":"12997001155"}'::jsonb);
  perform pg_temp.ok((select count(*) from public.nx_leads where cliente_id = c) = n, 'P1: chave velha deixa de gravar');
  perform public.nx_lead_entrada(ch2, '{"nome":"Chave nova","telefone":"12997001166"}'::jsonb);
  perform pg_temp.ok((select count(*) from public.nx_leads where cliente_id = c) = n + 1, 'P1: chave nova grava');

  -- privilégios
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_lead_entrada(text, jsonb)', 'execute'), 'P1: anon executa nx_lead_entrada');
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_entrada_chave(text, uuid, boolean)', 'execute'), 'P1: nx_entrada_chave é RPC de painel');
  perform pg_temp.ok(not has_table_privilege('anon', 'public.nx_leads', 'insert'), 'P1: anon continua sem acesso direto à tabela');
  raise notice '07 P1 formulário: ok';
end $p1$;

do $t$
declare
  cA uuid; cB uuid; cT uuid;
  k_adm uuid; k_at uuid; k_le uuid; k_admB uuid; k_admT uuid;
  f_pac uuid; f_B uuid; f_T uuid; s_nova uuid; s_ag uuid; s_orc uuid; s_fechou uuid; s_naofe uuid; m1 uuid; d_B uuid; can1 uuid;
  L1 bigint; L2 bigint; L3 bigint; L4 bigint; L5 bigint; L6 bigint; L7 bigint; L8 bigint; L9 bigint; L10 bigint; L11 bigint;
  ct1 bigint; ct2 bigint; ct3 bigint; ct4 bigint; ct5 bigint; ct6 bigint;
  C1 bigint; C2 bigint; C3 bigint; C4 bigint; C5 bigint; C6 bigint;
  j jsonb; x jsonb; t0 timestamptz; ms numeric; n int; v_dow int; v_tempos text := '';
begin
  perform set_config('nx.sem_historico', '1', true);   -- a linha do tempo do teste é escrita à mão, com datas de junho

  -- ---------------------------------------------------------- cenário
  insert into public.nx_clientes (slug, nome) values ('teste-f6-a', 'Teste F6 A') returning id into cA;
  insert into public.nx_clientes (slug, nome) values ('teste-f6-b', 'Teste F6 B') returning id into cB;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f6-adm@teste.local', 'Admin F6', 'x', 'clinica', true) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f6-at@teste.local', 'Atendente F6', 'x', 'clinica', true) returning id into k_at;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f6-le@teste.local', 'Leitura F6', 'x', 'clinica', true) returning id into k_le;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f6-admb@teste.local', 'Admin F6 B', 'x', 'clinica', true) returning id into k_admB;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_adm, cA, 'admin'), (k_le, cA, 'leitura'), (k_admB, cB, 'admin');
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas) values (k_at, cA, 'atendente', false);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash('tok-f6-adm'), k_adm, now() + interval '1 hour'), (public.nx_hash('tok-f6-at'), k_at, now() + interval '1 hour'),
    (public.nx_hash('tok-f6-le'), k_le, now() + interval '1 hour'), (public.nx_hash('tok-f6-admb'), k_admB, now() + interval '1 hour');
  select id into f_pac from public.nx_funis where cliente_id = cA and padrao;
  select id into f_B from public.nx_funis where cliente_id = cB and padrao;
  select id into s_nova from public.nx_estagios where funil_id = f_pac and marco = 'nova';
  select id into s_ag from public.nx_estagios where funil_id = f_pac and marco = 'agendada';
  select id into s_orc from public.nx_estagios where funil_id = f_pac and marco = 'orcamento';
  select id into s_fechou from public.nx_estagios where funil_id = f_pac and marco = 'fechou';
  select id into s_naofe from public.nx_estagios where funil_id = f_pac and marco = 'nao_fechou';
  perform pg_temp.ok(f_pac is not null and s_nova is not null and s_fechou is not null and s_naofe is not null, 'modelo odonto aplicado ao cliente de teste');
  insert into public.nx_motivos_perda (cliente_id, nome) values (cA, 'Preço alto') returning id into m1;
  select id into d_B from public.nx_departamentos where cliente_id = cB limit 1;
  if d_B is null then insert into public.nx_departamentos (cliente_id, nome) values (cB, 'Recepção B') returning id into d_B; end if;

  -- ---------------------------------------------------------- negócios (junho = período; 02/05–31/05 = anterior)
  insert into public.nx_leads (cliente_id, nome, origem, plataforma, estagio_id, valor, dono_id, criado_em, data_conversa, fechado_em)
    values (cA, 'L1', 'anuncio', 'meta', s_fechou, 1000, k_adm, pg_temp.sp('2026-06-05 10:00'), '2026-06-05', pg_temp.sp('2026-06-20 15:00')) returning id into L1;
  insert into public.nx_leads (cliente_id, nome, origem, estagio_id, valor, dono_id, criado_em, data_conversa, fechado_em)
    values (cA, 'L2', 'manual', s_fechou, 500, k_at, pg_temp.sp('2026-04-10 10:00'), '2026-04-10', pg_temp.sp('2026-06-10 11:00')) returning id into L2;
  insert into public.nx_leads (cliente_id, nome, origem, estagio_id, valor_previsto, dono_id, motivo_perda_id, criado_em, data_conversa, fechado_em)
    values (cA, 'L3', 'manual', s_naofe, 300, k_at, m1, pg_temp.sp('2026-06-12 10:00'), '2026-06-12', pg_temp.sp('2026-06-25 10:00')) returning id into L3;
  insert into public.nx_leads (cliente_id, nome, origem, estagio_id, valor_previsto, criado_em, data_conversa)
    values (cA, 'L4', 'manual', s_ag, 800, pg_temp.sp('2026-06-15 10:00'), '2026-06-15') returning id into L4;
  insert into public.nx_leads (cliente_id, nome, origem, estagio_id, valor, dono_id, criado_em, data_conversa, fechado_em)
    values (cA, 'L5', 'manual', s_fechou, 200, k_adm, pg_temp.sp('2026-05-10 10:00'), '2026-05-10', pg_temp.sp('2026-05-20 10:00')) returning id into L5;
  insert into public.nx_leads (cliente_id, nome, origem, estagio_id, dono_id, criado_em, data_conversa)
    values (cA, 'L6', 'manual', s_nova, k_adm, pg_temp.sp('2026-06-01 00:30'), '2026-06-01') returning id into L6;
  insert into public.nx_leads (cliente_id, nome, origem, estagio_id, criado_em, data_conversa)
    values (cA, 'L7', 'manual', s_nova, pg_temp.sp('2026-07-01 00:00:30'), '2026-07-01') returning id into L7;
  insert into public.nx_leads (cliente_id, nome, origem, estagio_id, criado_em, data_conversa)
    values (cA, 'L8', 'manual', s_nova, pg_temp.sp('2026-05-31 23:59'), '2026-05-31') returning id into L8;
  insert into public.nx_leads (cliente_id, nome, origem, estagio_id, criado_em, data_conversa)
    values (cA, 'L9', 'manual', s_ag, pg_temp.sp('2026-06-30 23:59'), '2026-06-30') returning id into L9;
  update public.nx_leads set estagio_em = now() - interval '10 days' where id = L8;   -- parado há 10 dias

  -- linha do tempo (junho)
  insert into public.nx_historico (cliente_id, negocio_id, tipo, dados, criado_em) values
    (cA, L1, 'negocio_criado', jsonb_build_object('estagio', s_nova), pg_temp.sp('2026-06-05 10:00')),
    (cA, L1, 'estagio', jsonb_build_object('de', s_nova, 'para', s_ag), pg_temp.sp('2026-06-06 10:00')),
    (cA, L1, 'estagio', jsonb_build_object('de', s_ag, 'para', s_fechou), pg_temp.sp('2026-06-20 15:00')),
    (cA, L3, 'negocio_criado', jsonb_build_object('estagio', s_nova), pg_temp.sp('2026-06-12 10:00')),
    (cA, L3, 'estagio', jsonb_build_object('de', s_nova, 'para', s_naofe), pg_temp.sp('2026-06-25 10:00')),
    (cA, L4, 'negocio_criado', jsonb_build_object('estagio', s_nova), pg_temp.sp('2026-06-15 10:00')),
    (cA, L4, 'estagio', jsonb_build_object('de', s_nova, 'para', s_ag), pg_temp.sp('2026-06-16 10:00'));

  -- ---------------------------------------------------------- nx_rel_vendas (admin)
  j := public.nx_rel_vendas('tok-f6-adm', cA, '2026-06-01', '2026-06-30')::jsonb;
  perform pg_temp.ok(j -> 'periodo' = '{"de":"2026-06-01","ate":"2026-06-30"}'::jsonb and j -> 'anterior' = '{"de":"2026-05-02","ate":"2026-05-31"}'::jsonb,
                     'período anterior = mesmo tamanho logo antes: ' || (j -> 'anterior')::text);
  perform pg_temp.ok((j #>> '{kpis,criados}')::int = 5, 'criados por criado_em (bordas 00:30 do dia 1 e 23:59 do dia 30 em SP; 01/07 fora): ' || (j #>> '{kpis,criados}'));
  perform pg_temp.ok((j #>> '{kpis,ganhos}')::int = 2 and (j #>> '{kpis,receita}')::numeric = 1500,
                     'ganhos e receita por fechado_em (L2 criado em abril, ganho em junho, conta): ' || (j -> 'kpis')::text);
  perform pg_temp.ok((j #>> '{kpis,perdidos}')::int = 1 and (j #>> '{kpis,valor_perdido}')::numeric = 300, 'perdidos e valor perdido');
  perform pg_temp.ok((j #>> '{kpis,ticket_medio}')::numeric = 750 and (j #>> '{kpis,conversao_pct}')::numeric = 66.7, 'ticket e conversão = ganhos ÷ (ganhos + perdidos)');
  perform pg_temp.ok((j #>> '{kpis,ciclo_medio_dias}')::numeric between 37.5 and 38.5, 'ciclo médio (15 e 61 dias): ' || (j #>> '{kpis,ciclo_medio_dias}'));
  perform pg_temp.ok((j #>> '{kpis,abertos}')::int = 5 and (j #>> '{kpis,valor_aberto}')::numeric = 800, 'carteira aberta agora: ' || (j -> 'kpis')::text);
  perform pg_temp.ok((j #>> '{kpis_anterior,criados}')::int = 2 and (j #>> '{kpis_anterior,ganhos}')::int = 1 and (j #>> '{kpis_anterior,receita}')::numeric = 200,
                     'KPIs do período anterior: ' || (j -> 'kpis_anterior')::text);
  perform pg_temp.ok(j #> '{kpis_anterior,abertos}' = 'null'::jsonb, 'carteira aberta não tem período anterior');
  -- funil
  select e into x from jsonb_array_elements(j -> 'funil') e where e ->> 'estagio_id' = s_nova::text;
  perform pg_temp.ok((x ->> 'passaram')::int = 3 and (x ->> 'avancaram')::int = 2 and (x ->> 'conversao_proxima_pct')::numeric = 66.7,
                     'funil: entraram em Nova 3, avançaram 2 (a perda não conta): ' || x::text);
  select e into x from jsonb_array_elements(j -> 'funil') e where e ->> 'estagio_id' = s_ag::text;
  perform pg_temp.ok((x ->> 'passaram')::int = 2 and (x ->> 'conversao_proxima_pct')::numeric = 50 and (x ->> 'qtd_atual')::int = 2,
                     'funil: agendada 2 entradas, 50% seguiram, 2 lá agora (L4, L9): ' || x::text);
  select e into x from jsonb_array_elements(j -> 'funil') e where e ->> 'estagio_id' = s_fechou::text;
  perform pg_temp.ok((x ->> 'qtd_atual')::int = 2 and (x ->> 'valor_atual')::numeric = 1500 and x -> 'conversao_proxima_pct' = 'null'::jsonb,
                     'funil: etapa de ganho mostra os fechados no período: ' || x::text);
  perform pg_temp.ok(jsonb_array_length(j -> 'funil') = 7, 'funil com as 7 etapas do modelo');
  -- origem, responsável, motivos, parados, série
  select e into x from jsonb_array_elements(j -> 'por_origem') e where e ->> 'origem' = 'anuncio';
  perform pg_temp.ok(x ->> 'plataforma' = 'meta' and (x ->> 'criados')::int = 1 and (x ->> 'ganhos')::int = 1 and (x ->> 'receita')::numeric = 1000, 'por origem: anúncio Meta');
  select e into x from jsonb_array_elements(j -> 'por_dono') e where e ->> 'conta_id' = k_adm::text;
  perform pg_temp.ok((x ->> 'criados')::int = 2 and (x ->> 'ganhos')::int = 1 and (x ->> 'receita')::numeric = 1000 and (x ->> 'abertos')::int = 1, 'por responsável (admin): ' || x::text);
  select e into x from jsonb_array_elements(j -> 'por_dono') e where e -> 'conta_id' = 'null'::jsonb;
  perform pg_temp.ok(x ->> 'nome' = 'Sem responsável' and (x ->> 'abertos')::int = 4 and (x ->> 'criados')::int = 2, 'por responsável: sem responsável (L4, L7, L8, L9 abertos; L4 e L9 criados em junho) ' || x::text);
  perform pg_temp.ok(j -> 'motivos_perda' = jsonb_build_array(jsonb_build_object('motivo_id', m1, 'nome', 'Preço alto', 'qtd', 1, 'valor', 300)), 'motivos de perda: ' || (j -> 'motivos_perda')::text);
  perform pg_temp.ok(j -> 'parados' @> jsonb_build_array(jsonb_build_object('estagio_id', s_nova, 'qtd', 1)), 'parados > 7 dias por etapa: ' || (j -> 'parados')::text);
  perform pg_temp.ok(jsonb_array_length(j -> 'serie') = 30, 'série com os 30 dias');
  perform pg_temp.ok((select (e ->> 'ganhos')::int = 1 and (e ->> 'receita')::numeric = 1000 from jsonb_array_elements(j -> 'serie') e where e ->> 'd' = '2026-06-20'), 'série: ganho de L1 no dia 20 (SP)');
  perform pg_temp.ok((select (e ->> 'criados')::int = 1 from jsonb_array_elements(j -> 'serie') e where e ->> 'd' = '2026-06-01'), 'série: L6 criado 00:30 SP conta no dia 1');
  perform pg_temp.ok(j -> 'funil_ref' ->> 'id' = f_pac::text and jsonb_array_length(j -> 'funis') >= 2, 'funil de referência = padrão; lista de funis para o seletor');
  -- filtro por funil (pós-venda: nada)
  j := public.nx_rel_vendas('tok-f6-adm', cA, '2026-06-01', '2026-06-30', (select id from public.nx_funis where cliente_id = cA and not padrao limit 1))::jsonb;
  perform pg_temp.ok((j #>> '{kpis,criados}')::int = 0 and (j #>> '{kpis,ganhos}')::int = 0, 'filtro de funil (pós-venda vazio)');

  -- visibilidade: atendente sem ver_todas só vê os seus e os sem dono
  j := public.nx_rel_vendas('tok-f6-at', cA, '2026-06-01', '2026-06-30')::jsonb;
  perform pg_temp.ok((j #>> '{kpis,criados}')::int = 3 and (j #>> '{kpis,ganhos}')::int = 1 and (j #>> '{kpis,receita}')::numeric = 500,
                     'atendente sem ver_todas: só os seus e sem dono: ' || (j -> 'kpis')::text);
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(j -> 'por_dono') e where e ->> 'conta_id' = k_adm::text), 'atendente não vê a linha do admin');

  -- erros: período, isolamento, módulo
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_rel_vendas(%L, %L, %L, %L)', 'tok-f6-adm', cA, '2025-06-01', '2026-06-03')) = 'periodo_grande', 'período de 367 dias → periodo_grande');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_rel_vendas(%L, %L, %L, %L)', 'tok-f6-adm', cA, '2025-06-01', '2026-06-02')) = 'ok', 'período de 366 dias passa');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_rel_atendimento(%L, %L, %L, %L)', 'tok-f6-adm', cA, '2025-01-01', '2026-06-02')) = 'periodo_grande', 'atendimento: periodo_grande');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_rel_vendas(%L, %L, %L, %L)', 'tok-f6-adm', cA, '2026-06-30', '2026-06-01')) = 'dados_invalidos|periodo', 'de > até → dados_invalidos');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_rel_vendas(%L, %L, %L, %L, %L)', 'tok-f6-adm', cA, '2026-06-01', '2026-06-30', f_B)) = 'dados_invalidos|p_funil', 'funil de outro cliente = inexistente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_rel_atendimento(%L, %L, %L, %L, %L)', 'tok-f6-adm', cA, '2026-06-01', '2026-06-30', d_B)) = 'dados_invalidos|p_departamento', 'departamento de outro cliente = inexistente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_rel_vendas(%L, %L, %L, %L)', 'tok-f6-adm', cB, '2026-06-01', '2026-06-30')) = 'sem_acesso', 'token de A no cliente B → sem_acesso');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_inicio(%L, %L)', 'tok-f6-admb', cA)) = 'sem_acesso', 'nx_inicio: token de B no cliente A → sem_acesso');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_inicio(%L, %L)', 'tok-nao-existe', cA)) = 'sessao_invalida', 'sem sessão → sessao_invalida');
  update public.nx_clientes set modulos = array_remove(modulos, 'relatorios') where id = cA;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_rel_vendas(%L, %L, %L, %L)', 'tok-f6-adm', cA, '2026-06-01', '2026-06-30')) = 'modulo_desligado|relatorios', 'relatórios fora do plano → modulo_desligado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_inicio(%L, %L)', 'tok-f6-adm', cA)) = 'ok', 'Início não depende de módulo');
  update public.nx_clientes set modulos = array_append(modulos, 'relatorios') where id = cA;
  perform pg_temp.ok(not has_function_privilege('public', 'public.nx_rel_vendas(text, uuid, date, date, uuid)', 'execute')
                     and has_function_privilege('anon', 'public.nx_rel_vendas(text, uuid, date, date, uuid)', 'execute')
                     and has_function_privilege('anon', 'public.nx_rel_atendimento(text, uuid, date, date, uuid)', 'execute')
                     and has_function_privilege('anon', 'public.nx_inicio(text, uuid)', 'execute'), 'grants: anon executa, public não');

  -- ---------------------------------------------------------- atendimento
  insert into public.nx_canais (cliente_id, nome, phone_number_id) values (cA, 'Recepção F6', 'teste-f6-pid-1') returning id into can1;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Ct1', '5512990000001') returning id into ct1;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Ct2', '5512990000002') returning id into ct2;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Ct3', '5512990000003') returning id into ct3;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Ct4', '5512990000004') returning id into ct4;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Ct5', '5512990000005') returning id into ct5;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Ct6', '5512990000006') returning id into ct6;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, atribuida_a, aberta_em, primeira_resposta_em, resolvida_em, resolvida_por, ultima_entrada_em)
    values (cA, can1, ct1, 'T6-1', 'resolvida', false, k_adm, pg_temp.sp('2026-06-03 10:00'), pg_temp.sp('2026-06-03 10:10'), pg_temp.sp('2026-06-03 12:00'), k_adm, pg_temp.sp('2026-06-03 23:30')) returning id into C1;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, atribuida_a, aberta_em, primeira_resposta_em, resolvida_em, resolvida_por)
    values (cA, can1, ct2, 'T6-2', 'resolvida', false, k_at, pg_temp.sp('2026-06-04 09:00'), pg_temp.sp('2026-06-04 09:20'), pg_temp.sp('2026-06-05 09:00'), k_at) returning id into C2;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, atribuida_a, aberta_em, primeira_resposta_em, ultima_entrada_em)
    values (cA, can1, ct3, 'T6-3', 'aberta', false, k_adm, pg_temp.sp('2026-06-05 08:00'), pg_temp.sp('2026-06-05 09:00'), now() - interval '10 minutes') returning id into C3;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, aberta_em, ultima_entrada_em)
    values (cA, can1, ct4, 'T6-4', 'aberta', true, pg_temp.sp('2026-06-06 08:00'), now() - interval '45 minutes') returning id into C4;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, aberta_em, primeira_resposta_em, resolvida_em)
    values (cA, can1, ct5, 'T6-5', 'resolvida', false, pg_temp.sp('2026-05-20 10:00'), pg_temp.sp('2026-05-20 10:30'), pg_temp.sp('2026-05-20 11:00')) returning id into C5;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, oculta, aberta_em)
    values (cA, can1, ct6, 'T6-6', 'resolvida', false, true, pg_temp.sp('2026-06-07 08:00')) returning id into C6;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status, criado_em, enviado_por) values
    (cA, C1, ct1, can1, 'in', 'texto', 'oi', 'recebida', pg_temp.sp('2026-06-03 10:00'), null),
    (cA, C1, ct1, can1, 'out', 'texto', 'olá', 'enviada', pg_temp.sp('2026-06-03 10:10'), k_adm),
    (cA, C1, ct1, can1, 'out', 'nota', 'nota interna', 'enviada', pg_temp.sp('2026-06-03 10:11'), k_adm),
    (cA, C1, ct1, can1, 'out', 'sistema', 'Ana assumiu', 'enviada', pg_temp.sp('2026-06-03 10:12'), null),
    (cA, C1, ct1, can1, 'in', 'texto', 'boa noite', 'recebida', pg_temp.sp('2026-06-03 23:30'), null),   -- 02:30 UTC do dia 4
    (cA, C6, ct6, can1, 'in', 'texto', 'spam', 'recebida', pg_temp.sp('2026-06-07 08:00'), null),
    (cA, C5, ct5, can1, 'in', 'texto', 'maio', 'recebida', pg_temp.sp('2026-05-20 10:00'), null);

  j := public.nx_rel_atendimento('tok-f6-adm', cA, '2026-06-01', '2026-06-30')::jsonb;
  perform pg_temp.ok((j #>> '{kpis,novas}')::int = 4 and (j #>> '{kpis,resolvidas}')::int = 2, 'novas e resolvidas (oculta fora): ' || (j -> 'kpis')::text);
  perform pg_temp.ok((j #>> '{kpis,tpr_mediana_min}')::numeric = 20 and (j #>> '{kpis,tpr_media_min}')::numeric = 30,
                     'tpr: mediana 20 min e média 30 min (10, 20, 60): ' || (j -> 'kpis')::text);
  perform pg_temp.ok((j #>> '{kpis,resolucao_mediana_h}')::numeric = 13, 'resolução mediana 13 h (2 e 24)');
  perform pg_temp.ok((j #>> '{kpis,sem_resposta}')::int = 1 and (j #>> '{kpis,abertas_agora}')::int = 2 and (j #>> '{kpis,aguardando_agora}')::int = 1, 'sem resposta, abertas e aguardando agora');
  perform pg_temp.ok((j #>> '{kpis,msgs_in}')::int = 2 and (j #>> '{kpis,msgs_out}')::int = 1, 'mensagens: nota e sistema fora, oculta fora: ' || (j -> 'kpis')::text);
  perform pg_temp.ok((j #>> '{kpis_anterior,novas}')::int = 1 and (j #>> '{kpis_anterior,tpr_mediana_min}')::numeric = 30 and (j #>> '{kpis_anterior,msgs_in}')::int = 1, 'atendimento: período anterior');
  v_dow := extract(dow from date '2026-06-03')::int;
  perform pg_temp.ok(j -> 'mapa_calor' @> jsonb_build_array(jsonb_build_object('dow', v_dow, 'hora', 23, 'qtd', 1), jsonb_build_object('dow', v_dow, 'hora', 10, 'qtd', 1))
                     and not exists (select 1 from jsonb_array_elements(j -> 'mapa_calor') e where (e ->> 'hora')::int = 2),
                     'mapa de calor no fuso de SP (23:30 SP, nunca 02:30 UTC): ' || (j -> 'mapa_calor')::text);
  select e into x from jsonb_array_elements(j -> 'por_atendente') e where e ->> 'conta_id' = k_adm::text;
  perform pg_temp.ok((x ->> 'conversas')::int = 2 and (x ->> 'resolvidas')::int = 1 and (x ->> 'tpr_mediana_min')::numeric = 35 and (x ->> 'msgs_out')::int = 1, 'por atendente (admin): ' || x::text);
  select e into x from jsonb_array_elements(j -> 'por_canal') e where e ->> 'canal_id' = can1::text;
  perform pg_temp.ok((x ->> 'novas')::int = 4 and (x ->> 'msgs_in')::int = 2 and (x ->> 'msgs_out')::int = 1, 'por número: ' || coalesce(x::text, (j -> 'por_canal')::text));
  perform pg_temp.ok(jsonb_array_length(j -> 'serie') = 30 and (select (e ->> 'resolvidas')::int = 1 from jsonb_array_elements(j -> 'serie') e where e ->> 'd' = '2026-06-05'), 'série novas × resolvidas');
  perform pg_temp.ok(jsonb_array_length(j -> 'por_departamento') >= 1, 'por departamento');
  -- atendente: só o que vê (as suas + sem dono)
  j := public.nx_rel_atendimento('tok-f6-at', cA, '2026-06-01', '2026-06-30')::jsonb;
  perform pg_temp.ok((j #>> '{kpis,novas}')::int = 2 and (j #>> '{kpis,resolvidas}')::int = 1 and (j #>> '{kpis,msgs_in}')::int = 0,
                     'atendimento com a visibilidade do atendente: ' || (j -> 'kpis')::text);

  -- ---------------------------------------------------------- nx_inicio
  insert into public.nx_leads (cliente_id, nome, origem, plataforma, estagio_id, valor, dono_id, fechado_em)
    values (cA, 'L10', 'anuncio', 'meta', s_fechou, 700, k_adm, now()) returning id into L10;   -- ganho hoje (data_conversa = hoje)
  insert into public.nx_leads (cliente_id, nome, origem, estagio_id, valor, dono_id, criado_em, data_conversa, fechado_em)
    values (cA, 'L11', 'manual', s_fechou, 300, k_adm, now() - interval '40 days', ((now() - interval '40 days') at time zone 'America/Sao_Paulo')::date,
            (date_trunc('month', (now() at time zone 'America/Sao_Paulo')) - interval '1 month' + interval '2 days 12 hours') at time zone 'America/Sao_Paulo') returning id into L11;
  insert into public.nx_tarefas (cliente_id, titulo, vence_em, dono_id) values
    (cA, 'atrasada', now() - interval '2 hours', k_adm), (cA, 'semana que vem', now() + interval '7 days', k_adm),
    (cA, 'de outro', now() - interval '1 hour', k_at);
  insert into public.nx_tarefas (cliente_id, titulo, vence_em, dono_id, concluida_em) values (cA, 'feita', now() - interval '3 hours', k_adm, now());
  insert into public.nx_notificacoes (cliente_id, conta_id, tipo, titulo) values (cA, k_adm, 'sistema', 'a'), (cA, k_adm, 'sistema', 'b');
  insert into public.nx_notificacoes (cliente_id, conta_id, tipo, titulo, lida_em) values (cA, k_adm, 'sistema', 'c', now());
  j := public.nx_inicio('tok-f6-adm', cA)::jsonb;
  perform pg_temp.ok((j #>> '{conversas,abertas}')::int = 2 and (j #>> '{conversas,aguardando}')::int = 1 and (j #>> '{conversas,sem_dono}')::int = 1
                     and (j #>> '{conversas,minhas}')::int = 1, 'início: contagens de conversa: ' || (j -> 'conversas')::text);
  perform pg_temp.ok((j #>> '{conversas,espera_mais_antiga_min}')::int between 44 and 46, 'início: espera mais antiga ~45 min');
  perform pg_temp.ok((j #>> '{tarefas,atrasadas}')::int = 1 and jsonb_array_length(j #> '{tarefas,proximas}') = 2
                     and (j #>> '{tarefas,proximas,0,titulo}') = 'atrasada' and (j #>> '{tarefas,proximas,0,atrasada}')::boolean,
                     'início: tarefas da pessoa (atrasada primeiro; concluída e de outro fora): ' || (j -> 'tarefas')::text);
  perform pg_temp.ok((j #>> '{negocios,abertos}')::int = 5 and (j #>> '{negocios,ganhos_mes}')::int = 1 and (j #>> '{negocios,receita_mes}')::numeric = 700
                     and (j #>> '{negocios,receita_mes_anterior}')::numeric = 300, 'início: negócios do mês e do anterior: ' || (j -> 'negocios')::text);
  perform pg_temp.ok((j #>> '{leads,hoje}')::int = 1 and (j #>> '{leads,hoje_anuncio}')::int = 1, 'início: leads de hoje: ' || (j -> 'leads')::text);
  perform pg_temp.ok(jsonb_array_length(j -> 'canais') = 1 and (j #>> '{canais,0,ultima_entrada_em}') is not null and not (j -> 'canais' -> 0 ? 'verify_token'),
                     'início: saúde do número sem segredo');
  perform pg_temp.ok((j ->> 'notificacoes_nao_lidas')::int = 2, 'início: não lidas');
  j := public.nx_inicio('tok-f6-at', cA)::jsonb;
  perform pg_temp.ok((j #>> '{conversas,abertas}')::int = 1 and (j #>> '{tarefas,atrasadas}')::int = 1 and (j #>> '{negocios,abertos}')::int = 4,
                     'início com a visibilidade do atendente: ' || j::text);
  j := public.nx_inicio('tok-f6-le', cA)::jsonb;
  perform pg_temp.ok(j ? 'conversas' and j ? 'negocios', 'leitura abre o Início');

  -- revisão: cada número do Início = o contador da aba de destino (Conversas e Tarefas)
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, oculta, aberta_em, ultima_entrada_em)
    values (cA, can1, ct6, 'T6-7', 'aberta', true, true, now() - interval '3 hours', now() - interval '3 hours');   -- contato bloqueado: oculta
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, aguardando, aberta_em)
    values (cA, can1, ct5, 'T6-8', 'pendente', false, now() - interval '1 day');                                     -- pendente sem dono
  insert into public.nx_tarefas (cliente_id, titulo, vence_em, dono_id) values
    (cA, 'sem dono atrasada', now() - interval '30 minutes', null),
    (cA, 'mais tarde hoje', least(now() + interval '1 minute',
       (((now() at time zone 'America/Sao_Paulo')::date + 1)::timestamp at time zone 'America/Sao_Paulo') - interval '1 second'), k_adm);
  foreach n in array array[1, 2] loop
    j := public.nx_inicio(case n when 1 then 'tok-f6-adm' else 'tok-f6-at' end, cA)::jsonb;
    x := public.nx_cv_listar(case n when 1 then 'tok-f6-adm' else 'tok-f6-at' end, cA, '{"aba":"abertas"}'::jsonb)::jsonb -> 'contagens';
    perform pg_temp.ok((j #>> '{conversas,abertas}')::int = (x ->> 'abertas')::int
                       and (j #>> '{conversas,aguardando}')::int = (x ->> 'aguardando')::int
                       and (j #>> '{conversas,sem_dono}')::int = (x ->> 'sem_dono')::int
                       and (j #>> '{conversas,minhas}')::int = (x ->> 'minhas')::int
                       and (j #>> '{conversas,pendentes}')::int = (x ->> 'pendentes')::int,
                       'início = contadores das abas de Conversas (' || n || '): ' || (j -> 'conversas')::text || ' × ' || x::text);
    -- contadores da tela Tarefas ("Minhas"): pela RPC da F4 quando ela já está no banco; senão pela mesma regra escrita aqui
    if to_regprocedure('public.nx_tarefas_listar(text,uuid,jsonb)') is not null then
      execute 'select public.nx_tarefas_listar($1, $2, $3)::jsonb -> ''contagens'''
        into x using (case n when 1 then 'tok-f6-adm' else 'tok-f6-at' end), cA, '{"dono":"eu","situacao":"hoje"}'::jsonb;
    else
      select jsonb_build_object(
               'hoje', count(*) filter (where t.vence_em >= (((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo')
                                          and t.vence_em < ((((now() at time zone 'America/Sao_Paulo')::date) + 1)::timestamp at time zone 'America/Sao_Paulo')),
               'atrasadas', count(*) filter (where t.vence_em < now()))
        into x from public.nx_tarefas t
       where t.cliente_id = cA and t.concluida_em is null and t.dono_id = case n when 1 then k_adm else k_at end;
    end if;
    perform pg_temp.ok((j #>> '{tarefas,hoje}')::int = (x ->> 'hoje')::int and (j #>> '{tarefas,atrasadas}')::int = (x ->> 'atrasadas')::int,
                       'início = contadores da tela Tarefas (' || n || '): ' || (j -> 'tarefas')::text || ' × ' || x::text);
    perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(j #> '{tarefas,proximas}') e where e ->> 'titulo' = 'sem dono atrasada'),
                       'início: tarefa sem dono não aparece para ninguém em "Minhas" (' || n || ')');
  end loop;
  j := public.nx_inicio('tok-f6-adm', cA)::jsonb;
  perform pg_temp.ok((j #>> '{conversas,aguardando}')::int = 1 and (j #>> '{conversas,sem_dono}')::int = 2 and (j #>> '{conversas,pendentes}')::int = 1
                     and (j #>> '{conversas,espera_mais_antiga_min}')::int between 44 and 46,
                     'início: conversa oculta fora (nem na espera mais antiga); pendente sem dono conta em "sem responsável": ' || (j -> 'conversas')::text);
  perform pg_temp.ok((j #>> '{tarefas,hoje}')::int >= 1, 'início: tarefa que vence mais tarde hoje conta em "hoje": ' || (j -> 'tarefas')::text);
  delete from public.nx_conversas where cliente_id = cA and protocolo in ('T6-7', 'T6-8');
  delete from public.nx_tarefas where cliente_id = cA and titulo in ('sem dono atrasada', 'mais tarde hoje');

  -- ---------------------------------------------------------- tempo: 90 dias com 5.000 contatos, 5.000 negócios, 20.000 mensagens
  perform set_config('nx.lote', '1', true);
  insert into public.nx_clientes (slug, nome) values ('teste-f6-t', 'Teste F6 Tempo') returning id into cT;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f6-admt@teste.local', 'Admin T', 'x', 'clinica', true) returning id into k_admT;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_admT, cT, 'admin');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash('tok-f6-admt'), k_admT, now() + interval '1 hour');
  select id into f_T from public.nx_funis where cliente_id = cT and padrao;
  insert into public.nx_contatos (cliente_id, nome, telefone)
    select cT, 'Contato ' || g, '55129' || lpad(g::text, 8, '0') from generate_series(1, 5000) g;
  insert into public.nx_leads (cliente_id, nome, contato_id, origem, estagio_id, valor, valor_previsto, dono_id, criado_em, data_conversa, fechado_em)
    select cT, 'N' || c.g, c.id, case when c.g % 3 = 0 then 'anuncio' else 'whatsapp' end,
           (select e.id from public.nx_estagios e where e.funil_id = f_T order by e.ordem offset (c.g % 6) limit 1),
           case when c.g % 6 = 4 then 100 + c.g % 900 end, 200 + c.g % 800, case when c.g % 2 = 0 then k_admT end,
           now() - (c.g % 120) * interval '1 day' - (c.g % 24) * interval '1 hour', ((now() - (c.g % 120) * interval '1 day') at time zone 'America/Sao_Paulo')::date,
           case when c.g % 6 in (4, 5) then now() - (c.g % 100) * interval '1 day' end
      from (select id, row_number() over (order by id)::int as g from public.nx_contatos where cliente_id = cT) c;
  insert into public.nx_historico (cliente_id, negocio_id, tipo, dados, criado_em)
    select cT, l.id, 'estagio', jsonb_build_object('de', null, 'para', l.estagio_id), l.criado_em + interval '1 hour'
      from public.nx_leads l where l.cliente_id = cT;
  insert into public.nx_conversas (cliente_id, contato_id, protocolo, status, aguardando, atribuida_a, aberta_em, primeira_resposta_em, resolvida_em, ultima_entrada_em)
    select cT, c.id, 'T-' || c.id, case when c.id % 5 = 0 then 'aberta' else 'resolvida' end, c.id % 10 = 0,
           case when c.id % 2 = 0 then k_admT end,
           now() - (c.id % 120) * interval '1 day', now() - (c.id % 120) * interval '1 day' + (c.id % 90) * interval '1 minute',
           case when c.id % 5 <> 0 then now() - (c.id % 120) * interval '1 day' + interval '3 hours' end, now() - (c.id % 120) * interval '1 day'
      from public.nx_contatos c where c.cliente_id = cT and c.id % 2 = 0;   -- 2.500 conversas
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, direcao, tipo, corpo, status, criado_em, enviado_por)
    select cT, cv.id, cv.contato_id, case when g % 2 = 0 then 'in' else 'out' end, 'texto', 'msg ' || g,
           case when g % 2 = 0 then 'recebida' else 'enviada' end, cv.aberta_em + g * interval '7 minutes', case when g % 2 = 1 then k_admT end
      from public.nx_conversas cv cross join generate_series(1, 8) g where cv.cliente_id = cT;   -- 20.000 mensagens
  perform public.nx_pulso_lote_fim();
  select count(*) into n from public.nx_mensagens where cliente_id = cT;
  perform pg_temp.ok(n = 20000, 'volume: 20.000 mensagens geradas (' || n || ')');

  t0 := clock_timestamp();
  j := public.nx_rel_vendas('tok-f6-admt', cT, ((now() at time zone 'America/Sao_Paulo')::date - 89), (now() at time zone 'America/Sao_Paulo')::date)::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  v_tempos := v_tempos || ' · nx_rel_vendas 90 dias ' || round(ms) || ' ms';
  perform pg_temp.ok(ms < 2000, 'lento nx_rel_vendas ' || round(ms) || ' ms');
  perform pg_temp.ok((j #>> '{kpis,criados}')::int > 3000 and (j #>> '{kpis,ganhos}')::int > 0, 'volume: vendas com números');
  t0 := clock_timestamp();
  j := public.nx_rel_atendimento('tok-f6-admt', cT, ((now() at time zone 'America/Sao_Paulo')::date - 89), (now() at time zone 'America/Sao_Paulo')::date)::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  v_tempos := v_tempos || ' · nx_rel_atendimento 90 dias ' || round(ms) || ' ms';
  perform pg_temp.ok(ms < 2000, 'lento nx_rel_atendimento ' || round(ms) || ' ms');
  perform pg_temp.ok((j #>> '{kpis,novas}')::int > 1000 and (j #>> '{kpis,msgs_in}')::int > 5000, 'volume: atendimento com números');
  t0 := clock_timestamp();
  j := public.nx_inicio('tok-f6-admt', cT)::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  v_tempos := v_tempos || ' · nx_inicio ' || round(ms) || ' ms';
  perform pg_temp.ok(ms < 2000, 'lento nx_inicio ' || round(ms) || ' ms');
  t0 := clock_timestamp();
  j := public.nx_rel_vendas('tok-f6-admt', cT, ((now() at time zone 'America/Sao_Paulo')::date - 366), (now() at time zone 'America/Sao_Paulo')::date)::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  v_tempos := v_tempos || ' · nx_rel_vendas 366 dias ' || round(ms) || ' ms';
  perform pg_temp.ok(ms < 2000, 'lento nx_rel_vendas 366 dias ' || round(ms) || ' ms');

  -- termina em exceção de propósito: garante o rollback e mostra o resultado no execute_sql
  raise exception '07_relatorios: VERDE%', v_tempos;
end $t$;

rollback;
