-- ============================================================
-- ÓRBITA — supabase/testes/01_base.sql · frente F1
-- Smoke do arquivo a (20260928a_saas_base.sql): sementes, modelo por
-- vertical, nx_ctx, limites, telefone, gatilho do negócio (§4.9, os 4
-- testes), pulso, histórico com autor, visibilidade de conversa,
-- notificações, Vault, horários, permissões e tempo do nx_ctx.
-- Roda pelo execute_sql. TUDO em begin … rollback: nada fica no banco.
-- Falha = exceção 'FALHOU: <caso>'.
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
  v_plat uuid; v_rev uuid; cA uuid; cB uuid;
  k_su uuid; k_gr uuid; k_adm uuid; k_at uuid; k_le uuid; k_sup uuid; k_sem uuid; k_pend uuid;
  v public.nx_ctx_t; vs public.nx_ctx_t;
  e text; n int; j json; t0 timestamptz; ms numeric;
  f_pac uuid; f_pos uuid; s_nova uuid; s_agend uuid; s_fechou uuid; s_perdido uuid; s_emtrat uuid; s_b uuid;
  dep_rec uuid; dep_com uuid;
  ct1 bigint; ct2 bigint; ct3 bigint; ct4 bigint;
  l1 bigint; l2 bigint; l3 bigint; lg bigint; lh1 bigint; lh2 bigint; lp bigint;
  cv1 bigint; cv2 bigint; cv3 bigint;
  pv1 bigint; pv2 bigint; sec uuid; hr jsonb; ts timestamptz;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  k_contas public.nx_contas;
begin
  -- ---------------------------------------------------------- sementes e backfill
  v_plat := public.nx_org_plataforma();
  perform pg_temp.ok(v_plat is not null, 'org plataforma semeada');
  perform pg_temp.ok((select count(*) from public.nx_planos where id in ('essencial','profissional','completo','interno')) = 4, '4 planos semeados');
  perform pg_temp.ok(not exists (select 1 from public.nx_contas where org_id is null), 'contas com org (backfill)');
  perform pg_temp.ok(not exists (select 1 from public.nx_clientes where org_id is null or plano is null), 'clientes com org e plano (backfill)');
  perform pg_temp.ok(not exists (select 1 from public.nx_clientes c where not exists (select 1 from public.nx_funis f where f.cliente_id = c.id)), 'todo cliente tem funil (backfill)');
  perform pg_temp.ok(not exists (select 1 from public.nx_clientes c where not exists (select 1 from public.nx_pulsos p where p.cliente_id = c.id)), 'todo cliente tem pulso (backfill)');
  perform pg_temp.ok(exists (select 1 from storage.buckets where id = 'nx-midia' and not public), 'bucket nx-midia privado');

  -- ---------------------------------------------------------- orgs, clientes e modelo
  insert into public.nx_orgs (slug, nome, tipo, limites)
  values ('teste-f1-rev', 'Revenda Teste F1', 'revenda', '{"usuarios":3,"plano_padrao":"profissional"}')
  returning id into v_rev;
  insert into public.nx_clientes (slug, nome) values ('teste-f1-a', 'Teste F1 A') returning id into cA;
  insert into public.nx_clientes (slug, nome, org_id, vertical) values ('teste-f1-b', 'Teste F1 B', v_rev, 'oficina') returning id into cB;
  perform pg_temp.ok((select org_id = v_plat and plano = 'interno' from public.nx_clientes where id = cA), 'cliente sem org cai na plataforma com plano interno');
  perform pg_temp.ok((select plano = 'profissional' from public.nx_clientes where id = cB), 'cliente de revenda sem plano recebe plano_padrao');
  perform pg_temp.ok(exists (select 1 from public.nx_pulsos where cliente_id = cA), 'cliente novo ganha pulso');

  select id into f_pac from public.nx_funis where cliente_id = cA and nome = 'Pacientes' and padrao and conta_no_ads;
  select id into f_pos from public.nx_funis where cliente_id = cA and nome = 'Pós-tratamento' and not padrao and not conta_no_ads;
  perform pg_temp.ok(f_pac is not null and f_pos is not null, 'odonto: funis Pacientes (padrão, Ads) e Pós-tratamento');
  perform pg_temp.ok((select count(*) from public.nx_estagios where funil_id = f_pac) = 7, 'Pacientes com 7 etapas');
  perform pg_temp.ok((select count(*) from public.nx_estagios where funil_id = f_pac and marco is not null) = 7, 'toda etapa do funil do Ads tem marco');
  perform pg_temp.ok((select count(*) from public.nx_estagios where funil_id = f_pos) = 5, 'Pós-tratamento com 5 etapas');
  perform pg_temp.ok((select count(*) from public.nx_etiquetas where cliente_id = cA) = 9, 'odonto: 9 etiquetas');
  perform pg_temp.ok((select count(*) from public.nx_respostas where cliente_id = cA) = 8, 'odonto: 8 respostas');
  perform pg_temp.ok((select count(*) from public.nx_motivos_perda where cliente_id = cA) = 6, 'odonto: 6 motivos');
  perform pg_temp.ok((select count(*) from public.nx_departamentos where cliente_id = cA) = 2, 'odonto: 2 departamentos');
  select id into dep_rec from public.nx_departamentos where cliente_id = cA and nome = 'Recepção' and padrao and distribuicao = 'rodizio' and horario is not null and msg_fora_horario is not null;
  select id into dep_com from public.nx_departamentos where cliente_id = cA and nome = 'Comercial' and not padrao;
  perform pg_temp.ok(dep_rec is not null and dep_com is not null, 'Recepção padrão com rodízio e horário; Comercial');
  perform public.nx_aplicar_modelo(cA, 'odonto');
  perform pg_temp.ok((select count(*) from public.nx_funis where cliente_id = cA) = 2
                 and (select count(*) from public.nx_etiquetas where cliente_id = cA) = 9
                 and (select count(*) from public.nx_respostas where cliente_id = cA) = 8
                 and (select count(*) from public.nx_motivos_perda where cliente_id = cA) = 6
                 and (select count(*) from public.nx_departamentos where cliente_id = cA) = 2, 'nx_aplicar_modelo é idempotente');
  perform pg_temp.ok(exists (select 1 from public.nx_funis where cliente_id = cB and nome = 'Orçamentos' and padrao), 'oficina: funil Orçamentos');
  select id into s_nova from public.nx_estagios where funil_id = f_pac and marco = 'nova';
  select id into s_agend from public.nx_estagios where funil_id = f_pac and marco = 'agendada';
  select id into s_fechou from public.nx_estagios where funil_id = f_pac and marco = 'fechou';
  select id into s_perdido from public.nx_estagios where funil_id = f_pac and marco = 'perdida';
  select id into s_emtrat from public.nx_estagios where funil_id = f_pos and nome = 'Em tratamento';
  select id into s_b from public.nx_estagios where cliente_id = cB order by ordem limit 1;

  -- ---------------------------------------------------------- contas e sessões de teste
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f1-super@teste.local', 'Super F1', 'x', 'gestor', true) returning id into k_su;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('teste-f1-gr@teste.local', 'Gestor Rev F1', 'x', 'gestor', true, v_rev) returning id into k_gr;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f1-adm@teste.local', 'Admin F1', 'x', 'clinica', true) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f1-at@teste.local', 'Atendente F1', 'x', 'clinica', true) returning id into k_at;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f1-le@teste.local', 'Leitura F1', 'x', 'clinica', true) returning id into k_le;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f1-sup@teste.local', 'Supervisor F1', 'x', 'clinica', true) returning id into k_sup;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('teste-f1-sem@teste.local', 'Rev sem acesso F1', 'x', 'clinica', true, v_rev) returning id into k_sem;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f1-pend@teste.local', 'Pendente F1', 'x', 'clinica', false) returning id into k_pend;
  perform pg_temp.ok((select org_id from public.nx_contas where id = k_su) = v_plat, 'conta sem org cai na plataforma');
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_adm, cA, 'admin');
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas, departamentos) values (k_at, cA, 'atendente', false, array[dep_rec]);
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_le, cA, 'leitura');
  insert into public.nx_acessos (conta_id, cliente_id, papel, departamentos) values (k_sup, cA, 'supervisor', array[dep_com]);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash('tok-f1-su'), k_su, now() + interval '1 hour'), (public.nx_hash('tok-f1-gr'), k_gr, now() + interval '1 hour'),
    (public.nx_hash('tok-f1-adm'), k_adm, now() + interval '1 hour'), (public.nx_hash('tok-f1-at'), k_at, now() + interval '1 hour'),
    (public.nx_hash('tok-f1-le'), k_le, now() + interval '1 hour'), (public.nx_hash('tok-f1-sup'), k_sup, now() + interval '1 hour');

  -- ---------------------------------------------------------- nx_ctx
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ctx(%L,%L,%L)', 'tok-f1-gr', cA, 'leitura')) = 'sem_acesso', 'gestor de revenda NÃO vê cliente da Nexus');
  v := public.nx_ctx('tok-f1-gr', cB, 'admin');
  perform pg_temp.ok(v.papel = 'gestor' and not v.super and v.org_id = v_rev, 'gestor de revenda é gestor no cliente da própria org');
  v := public.nx_ctx('tok-f1-su', cB, 'admin');
  perform pg_temp.ok(v.papel = 'super' and v.super, 'super vê cliente da revenda');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ctx(%L,%L,%L)', 'tok-f1-at', cA, 'admin')) = 'sem_permissao', 'atendente com p_min admin → sem_permissao');
  v := public.nx_ctx('tok-f1-at', cA);
  perform pg_temp.ok(v.papel = 'atendente' and not v.ver_todas and v.departamentos = array[dep_rec] and v.conta_id = k_at, 'contexto do atendente (papel, ver_todas, departamentos)');
  perform pg_temp.ok(current_setting('nx.conta', true) = k_at::text and current_setting('nx.cliente', true) = cA::text, 'nx_ctx grava nx.conta e nx.cliente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ctx(%L,%L)', 'tok-f1-leitura', cA)) = 'sessao_invalida', 'token inválido → sessao_invalida');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ctx(%L,%L)', 'tok-f1-su', gen_random_uuid())) = 'cliente_nao_encontrado', 'cliente inexistente → cliente_nao_encontrado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ctx(%L,%L,%L)', 'tok-f1-le', cA, 'atendente')) = 'sem_permissao', 'leitura não escreve');
  perform pg_temp.ok((public.nx_fn_ctx('tok-f1-at', cA, 'leitura') ->> 'papel') = 'atendente', 'nx_fn_ctx devolve o contexto em JSON');

  update public.nx_clientes set status = 'suspenso' where id = cA;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ctx(%L,%L,%L)', 'tok-f1-adm', cA, 'leitura')) = 'conta_suspensa', 'cliente suspenso → conta_suspensa');
  perform pg_temp.ok((public.nx_ctx('tok-f1-su', cA, 'admin')).papel = 'super', 'super entra em cliente suspenso');
  update public.nx_clientes set status = 'teste', teste_ate = hoje - 1 where id = cA;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ctx(%L,%L,%L)', 'tok-f1-adm', cA, 'atendente')) = 'teste_expirado', 'teste vencido: escrita → teste_expirado');
  perform pg_temp.ok((public.nx_ctx('tok-f1-adm', cA, 'leitura')).papel = 'admin', 'teste vencido: leitura continua');
  update public.nx_clientes set status = 'ativo', teste_ate = null where id = cA;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_le, cB, 'leitura');
  update public.nx_orgs set status = 'suspenso' where id = v_rev;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ctx(%L,%L,%L)', 'tok-f1-le', cB, 'leitura')) = 'conta_suspensa', 'org suspensa → conta_suspensa');
  update public.nx_orgs set status = 'ativo' where id = v_rev;

  perform public.nx_ctx('tok-f1-su', cA, 'leitura');
  perform public.nx_ctx('tok-f1-su', cA, 'leitura');
  perform pg_temp.ok((select count(*) from public.nx_auditoria where acao = 'suporte_entrou' and conta_id = k_su and cliente_id = cA) = 1, 'duas entradas do super → UMA linha suporte_entrou');
  perform public.nx_ctx('tok-f1-adm', cA, 'leitura');
  perform pg_temp.ok(not exists (select 1 from public.nx_auditoria where conta_id = k_adm), 'acesso próprio não gera auditoria de suporte');

  -- ---------------------------------------------------------- limites
  perform pg_temp.ok(public.nx_limite(cA, 'canais') is null, 'plano interno = ilimitado');
  update public.nx_clientes set plano = 'essencial' where id = cA;
  perform pg_temp.ok(public.nx_limite(cA, 'canais') = 1, 'limite do plano essencial (canais 1)');
  insert into public.nx_canais (cliente_id, nome, phone_number_id) values (cA, 'Teste', 'teste-f1-pid-1');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_exigir_limite(%L,%L,1)', cA, 'canais')) = 'limite_plano|canais:1', 'nx_exigir_limite estoura com hint chave:n');
  update public.nx_clientes set limites = '{"canais":5}' where id = cA;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_exigir_limite(%L,%L,1)', cA, 'canais')) = 'ok', 'limites do cliente valem sobre o plano');
  update public.nx_clientes set plano = 'interno', limites = '{}' where id = cA;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_adm, cB, 'admin'), (k_at, cB, 'atendente');
  perform pg_temp.ok(public.nx_uso(cB, 'usuarios') = 3, 'nx_uso usuarios = acessos');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_exigir_limite(%L,%L,1)', cB, 'usuarios')) = 'limite_plano|org_usuarios:3', 'soma da revenda estoura com hint org_chave:n');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_exigir_limite_org(%L,%L,1)', v_rev, 'empresas')) = 'ok', 'revenda sem limite de empresas');
  update public.nx_orgs set limites = limites || '{"empresas":1}' where id = v_rev;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_exigir_limite_org(%L,%L,1)', v_rev, 'empresas')) = 'limite_plano|org_empresas:1', 'limite de empresas da revenda');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_exigir_limite_org(%L,%L,1)', v_plat, 'empresas')) = 'ok', 'plataforma sem limite');

  -- ---------------------------------------------------------- telefone
  perform pg_temp.ok(public.nx_tel_normalizar('(12) 99830-3030') = '5512998303030', 'digitado 11 dígitos ganha 55');
  perform pg_temp.ok(public.nx_tel_normalizar('1298303030') = '551298303030', 'digitado 10 dígitos ganha 55');
  perform pg_temp.ok(public.nx_tel_normalizar('123') is null, 'curto demais → null');
  perform pg_temp.ok(public.nx_tel_normalizar('14155551234', true) = '14155551234', 'número do WhatsApp fica como veio');
  perform pg_temp.ok(public.nx_tel_chave('5512998303030') = '1298303030' and public.nx_tel_chave('551298303030') = '1298303030', 'com e sem o 9 → mesma chave');
  perform pg_temp.ok(public.nx_tel_chave('14155551234') = '14155551234', 'estrangeiro: chave = número');
  insert into public.nx_contatos (cliente_id, nome, telefone, origem) values (cA, 'Ana', '12998303030', 'manual') returning id into ct1;
  perform pg_temp.ok((select telefone = '5512998303030' and tel_chave = '1298303030' and busca like '%ana%' from public.nx_contatos where id = ct1), 'contato digitado normalizado + busca');
  perform pg_temp.ok(pg_temp.erro(format('insert into public.nx_contatos (cliente_id, telefone) values (%L, %L)', cA, '551298303030')) like '%nx_contatos_tel%', '5512998303030 e 551298303030 são o mesmo contato');
  perform pg_temp.ok(public.nx_contato_por_tel(cA, '551298303030') = ct1, 'nx_contato_por_tel acha pela chave');
  perform pg_temp.ok(public.nx_contato_por_tel(cB, '551298303030') is null, 'nx_contato_por_tel não vaza entre clientes');
  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id) values (cA, 'John', '14155551234', '14155551234') returning id into ct4;
  perform pg_temp.ok((select telefone from public.nx_contatos where id = ct4) = '14155551234', 'número estrangeiro do WhatsApp sem 55 a mais');
  perform pg_temp.ok(public.nx_contato_por_tel(cA, '14155551234') = ct4, 'nx_contato_por_tel acha pelo wa_id exato');
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'José Álvares', '12911112222') returning id into ct3;
  perform pg_temp.ok((select busca like '%jose alvares%' from public.nx_contatos where id = ct3), 'busca sem acento');

  -- ---------------------------------------------------------- §4.9 teste 1: sincronização + webhook existente
  insert into public.nx_leads (cliente_id, contato_id) values (cA, ct1) returning id into l1;
  perform pg_temp.ok((select nome = 'Ana' and telefone = '5512998303030' and funil_id = f_pac and estagio_id = s_nova
                        and status = 'aberto' and etapa = 'nova' and ordem is not null from public.nx_leads where id = l1),
                     '§4.9(1) negócio só com contato_id ganha nome, telefone, funil padrão e etapa');
  n := (select count(*) from public.nx_leads where cliente_id = cA);
  perform pg_temp.ok(public.nx_lead_webhook(cA, '5512998303030', array['5512998303030','551298303030'], 'Ana', '{}'::jsonb, hoje, 30) = 'existente',
                     '§4.9(1) nx_lead_webhook com o from do contato → existente');
  perform pg_temp.ok((select count(*) from public.nx_leads where cliente_id = cA) = n, '§4.9(1) nenhum lead novo');

  -- ---------------------------------------------------------- webhook cria contato + funil + etapa; liga a conversa
  perform pg_temp.ok(public.nx_lead_webhook(cA, '5512988887777', array['5512988887777','551288887777'], 'Bruno',
            '{"origem":"anuncio","plataforma":"meta","campanha_ext":"c1","anuncio_ext":"a1","ctwa_clid":"x1"}'::jsonb, hoje, 30) = 'criado',
            'webhook cria lead');
  select id, contato_id into l2, ct2 from public.nx_leads where cliente_id = cA and telefone = '5512988887777';
  perform pg_temp.ok(ct2 is not null and (select plataforma = 'meta' and anuncio_ext = 'a1' and origem = 'anuncio' and nome = 'Bruno'
                                          from public.nx_contatos where id = ct2), 'lead do webhook cria contato com a atribuição');
  perform pg_temp.ok((select funil_id = f_pac and estagio_id = s_nova and status = 'aberto' from public.nx_leads where id = l2), 'lead do webhook no funil padrão, etapa pelo marco');
  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id) values (cA, 'Caio', '5512977776666', '5512977776666') returning id into ct3;
  insert into public.nx_conversas (cliente_id, contato_id, protocolo, departamento_id) values (cA, ct3, public.nx_protocolo(cA), dep_rec) returning id into cv1;
  perform pg_temp.ok(exists (select 1 from public.nx_historico where conversa_id = cv1 and tipo = 'conversa_aberta'), 'histórico conversa_aberta');
  perform public.nx_lead_webhook(cA, '5512977776666', array['5512977776666','551277776666'], 'Caio', '{}'::jsonb, hoje, 30);
  select id into l3 from public.nx_leads where contato_id = ct3;
  perform pg_temp.ok(l3 is not null and (select negocio_id from public.nx_conversas where id = cv1) = l3, 'negócio do webhook liga a conversa aberta');
  perform pg_temp.ok(exists (select 1 from public.nx_historico where negocio_id = l2 and tipo = 'negocio_criado'), 'histórico negocio_criado');

  -- ---------------------------------------------------------- etapa ↔ estágio
  update public.nx_leads set etapa = 'agendada', atualizado_em = now() where id = l2;   -- como o nx_lead_salvar faz
  perform pg_temp.ok((select estagio_id = s_agend and status = 'aberto' from public.nx_leads where id = l2), 'mudar etapa move a etapa do funil');
  update public.nx_leads set estagio_id = s_fechou where id = l2;
  perform pg_temp.ok((select etapa = 'fechou' and status = 'ganho' and fechado_em is not null from public.nx_leads where id = l2), 'mover para ganho: marco fechou, status ganho, fechado_em');
  perform pg_temp.ok(exists (select 1 from public.nx_historico where negocio_id = l2 and tipo = 'estagio' and dados ->> 'para_nome' = 'Fechou tratamento')
                 and exists (select 1 from public.nx_historico where negocio_id = l2 and tipo = 'ganho'), 'histórico estagio e ganho');
  update public.nx_leads set estagio_id = s_nova where id = l2;
  perform pg_temp.ok((select etapa = 'nova' and status = 'aberto' and fechado_em is null from public.nx_leads where id = l2), 'reabrir limpa fechado_em');
  update public.nx_leads set etapa = 'perdida' where id = l2;
  perform pg_temp.ok((select estagio_id = s_perdido and status = 'perdido' from public.nx_leads where id = l2), 'etapa perdida → etapa Perdido, status perdido');

  -- ---------------------------------------------------------- histórico com autor
  perform public.nx_ctx('tok-f1-adm', cA, 'atendente');
  update public.nx_leads set dono_id = k_adm where id = l1;
  perform pg_temp.ok((select autor_id from public.nx_historico where negocio_id = l1 and tipo = 'dono' order by id desc limit 1) = k_adm, 'histórico gravado com autor (nx.conta)');

  -- ---------------------------------------------------------- §4.9 teste 2: renomear contato
  update public.nx_contatos set nome = 'Ana Paula' where id = ct1;
  insert into public.nx_leads (cliente_id, contato_id, estagio_id, valor) values (cA, ct1, s_fechou, 500) returning id into lg;
  perform pg_temp.ok((select status = 'ganho' and nome = 'Ana Paula' and fechado_em is not null from public.nx_leads where id = lg), 'negócio criado ganho');
  update public.nx_contatos set nome = 'Ana P. Souza' where id = ct1;
  perform pg_temp.ok((select nome from public.nx_leads where id = l1) = 'Ana P. Souza', '§4.9(2) renomear contato muda o negócio aberto');
  perform pg_temp.ok((select nome from public.nx_leads where id = lg) = 'Ana Paula', '§4.9(2) e não muda o ganho');

  -- ---------------------------------------------------------- §4.9 teste 3: herança de atribuição
  insert into public.nx_contatos (cliente_id, nome, telefone, origem, plataforma, campanha_ext, anuncio_ext)
  values (cA, 'Dani', '12966665555', 'anuncio', 'meta', 'c9', 'a9') returning id into ct2;
  insert into public.nx_leads (cliente_id, contato_id, origem) values (cA, ct2, 'manual') returning id into lh1;
  perform pg_temp.ok((select origem = 'anuncio' and plataforma = 'meta' and anuncio_ext = 'a9' and campanha_ext = 'c9' from public.nx_leads where id = lh1),
                     '§4.9(3) negócio manual no funil do Ads herda o 1º toque');
  insert into public.nx_leads (cliente_id, contato_id, origem) values (cA, ct2, 'manual') returning id into lh2;
  perform pg_temp.ok((select origem = 'manual' and plataforma is null from public.nx_leads where id = lh2), '§4.9(3) segundo manual em 30 dias não herda');
  insert into public.nx_leads (cliente_id, contato_id, origem, funil_id) values (cA, ct2, 'manual', f_pos) returning id into lp;
  perform pg_temp.ok((select origem = 'manual' and plataforma is null and funil_id = f_pos and estagio_id = s_emtrat from public.nx_leads where id = lp),
                     '§4.9(3) negócio no pós-venda não herda (1ª etapa aberta)');

  -- ---------------------------------------------------------- §4.9 teste 4: trava do Ads
  perform pg_temp.ok(pg_temp.erro(format('update public.nx_leads set estagio_id = %L where id = %s', s_emtrat, lg)) = 'funil_invalido|fechado_no_ads',
                     '§4.9(4) ganho no Ads não vai para o pós-venda');
  perform pg_temp.ok(pg_temp.erro(format('update public.nx_leads set estagio_id = %L where id = %s', s_emtrat, l1)) = 'funil_invalido|sai_do_ads',
                     '§4.9(4) aberto no Ads não sai do Ads');
  perform pg_temp.ok(pg_temp.erro(format('update public.nx_leads set funil_id = %L where id = %s', f_pos, l1)) = 'funil_invalido|sai_do_ads',
                     'trava do Ads também no update direto de funil');
  perform pg_temp.ok(pg_temp.erro(format('update public.nx_leads set funil_id = %L where id = %s', f_pac, lp)) like 'estagio_invalido%',
                     'funil sem etapa → estagio_invalido');
  perform pg_temp.ok(pg_temp.erro(format('update public.nx_leads set estagio_id = %L where id = %s', s_b, l1)) = 'estagio_invalido',
                     'etapa de outro cliente → estagio_invalido');
  perform pg_temp.ok(pg_temp.erro(format('insert into public.nx_leads (cliente_id, contato_id) values (%L, %s)', cB, ct1)) = 'contato_nao_encontrado',
                     'contato de outro cliente → contato_nao_encontrado');
  update public.nx_leads set estagio_id = (select id from public.nx_estagios where funil_id = f_pos and nome = 'Concluído') where id = lp;
  perform pg_temp.ok((select status = 'aberto' and funil_id = f_pos from public.nx_leads where id = lp), 'mover dentro do pós-venda');
  perform pg_temp.ok(pg_temp.erro(format('update public.nx_leads set cliente_id = %L where id = %s', cB, l1)) = 'dados_invalidos|cliente_id',
                     'negócio não muda de empresa');
  perform pg_temp.ok(pg_temp.erro(format('update public.nx_contatos set cliente_id = %L where id = %s', cB, ct1)) = 'dados_invalidos|cliente_id',
                     'contato não muda de empresa');

  -- ---------------------------------------------------------- consulta_em (fuso SP)
  update public.nx_leads set consulta_em = '2026-10-01 23:30:00-03' where id = l1;
  perform pg_temp.ok((select data_consulta from public.nx_leads where id = l1) = date '2026-10-01', 'consulta_em → data_consulta no fuso SP');

  -- ---------------------------------------------------------- pulso
  perform set_config('nx.pulso_tx', '', true);   -- simula uma transação nova (o pulso bate 1× por transação)
  pv1 := (select p.v from public.nx_pulsos p where p.cliente_id = cA);
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, direcao, tipo, corpo, status)
  values (cA, cv1, ct3, 'in', 'texto', 'oi', 'recebida');
  pv2 := (select p.v from public.nx_pulsos p where p.cliente_id = cA);
  perform pg_temp.ok(pv2 > pv1, 'pulso sobe com mensagem');
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, direcao, tipo, corpo, status)
  values (cA, cv1, ct3, 'in', 'texto', 'de novo', 'recebida');
  perform pg_temp.ok((select p.v from public.nx_pulsos p where p.cliente_id = cA) = pv2, 'pulso bate uma vez só por transação');
  perform pg_temp.ok((public.nx_pulso('tok-f1-le', cA) ->> 'v')::bigint = pv2, 'nx_pulso devolve v');
  perform set_config('nx.lote', '1', true);
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, direcao, tipo, corpo, status)
  select cA, cv1, ct3, 'in', 'texto', 'lote ' || g, 'recebida' from generate_series(1, 3) g;
  perform pg_temp.ok((select p.v from public.nx_pulsos p where p.cliente_id = cA) = pv2, 'em lote o pulso não sobe por linha');
  perform public.nx_pulso_lote_fim();
  perform set_config('nx.lote', '0', true);
  perform pg_temp.ok((select p.v from public.nx_pulsos p where p.cliente_id = cA) = pv2 + 1, 'fim do lote bate uma vez');
  perform pg_temp.ok(public.nx_protocolo(cA) ~ '^[0-9]{4}-[0-9]{6}$', 'protocolo AAAA-NNNNNN');

  -- ---------------------------------------------------------- nx_cv_visivel
  insert into public.nx_conversas (cliente_id, contato_id, protocolo, departamento_id) values (cA, ct1, public.nx_protocolo(cA), dep_com) returning id into cv2;
  v := public.nx_ctx('tok-f1-at', cA, 'leitura');
  perform pg_temp.ok(public.nx_cv_visivel(v, cA, cv1), 'atendente vê sem dono do seu departamento');
  perform pg_temp.ok(not public.nx_cv_visivel(v, cA, cv2), 'atendente não vê sem dono de outro departamento');
  update public.nx_conversas set atribuida_a = k_adm where id = cv1;
  perform pg_temp.ok(not public.nx_cv_visivel(v, cA, cv1), 'atendente sem ver_todas não vê conversa de colega');
  update public.nx_conversas set atribuida_a = k_at where id = cv2;
  perform pg_temp.ok(public.nx_cv_visivel(v, cA, cv2), 'atendente vê a atribuída a si');
  perform pg_temp.ok(public.nx_cv_visivel(public.nx_ctx('tok-f1-le', cA, 'leitura'), cA, cv1), 'leitura com ver_todas vê a de colega');
  update public.nx_conversas set oculta = true where id = cv2;
  perform pg_temp.ok(not public.nx_cv_visivel(v, cA, cv2), 'oculta some para atendente');
  vs := public.nx_ctx('tok-f1-sup', cA, 'leitura');
  perform pg_temp.ok(public.nx_cv_visivel(vs, cA, cv2), 'supervisor vê oculta do seu departamento');
  perform pg_temp.ok(not public.nx_cv_visivel(vs, cA, cv1), 'supervisor não vê outro departamento');
  perform pg_temp.ok(public.nx_cv_visivel(public.nx_ctx('tok-f1-adm', cA, 'leitura'), cA, cv2), 'admin vê tudo');
  perform pg_temp.ok(not public.nx_cv_visivel(public.nx_ctx('tok-f1-su', cB, 'leitura'), cB, cv1), 'conversa de outro cliente = invisível');
  -- ctx calculado para OUTRO cliente não abre conversa deste (revisão: o nx_ctx_t não carrega o cliente)
  --   k_at: atendente em cA (sem ver_todas, só Recepção) e atendente em cB (ver_todas, todos os departamentos)
  perform pg_temp.ok(not public.nx_cv_visivel(public.nx_ctx('tok-f1-at', cB, 'leitura'), cA, cv1),
                     'ctx do atendente em B (ver_todas) não vale em A (sem ver_todas): conversa de colega continua fechada');
  perform pg_temp.ok(not public.nx_cv_visivel(public.nx_ctx('tok-f1-gr', cB, 'leitura'), cA, cv1), 'ctx de gestor da revenda (cB) não vale em cliente da Nexus');
  vs := row(k_adm, v_plat, 'Forjado', 'super', true, '{}'::uuid[], true)::public.nx_ctx_t;
  perform pg_temp.ok(not public.nx_cv_visivel(vs, cA, cv1), 'ctx com papel forjado (super sem ser super) → invisível');
  vs := row(gen_random_uuid(), v_plat, 'Sup', 'supervisor', false, array[dep_com], true)::public.nx_ctx_t;
  perform pg_temp.ok(not public.nx_cv_visivel(vs, cA, cv2), 'ctx de conta inexistente → invisível');

  -- ---------------------------------------------------------- notificações
  n := public.nx_notificar(cA, null, 'sistema', 'Teste F1', null, '#/inicio');
  perform pg_temp.ok(n = (select count(*) from (select a.conta_id from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
                                                  where a.cliente_id = cA and a.papel in ('admin','supervisor') and k.aprovado
                                                 union select k.id from public.nx_contas k where k.papel = 'gestor' and k.org_id = v_plat and k.aprovado) x),
                     'nx_notificar(null) = admins/supervisores + gestores da org');
  perform pg_temp.ok((public.nx_pulso('tok-f1-adm', cA) ->> 'notif')::int = 1, 'nx_pulso conta não lidas da conta');
  n := public.nx_notificar(cA, k_at, 'atribuida', repeat('x', 300), repeat('y', 900), 'javascript:alert(1)');
  perform pg_temp.ok(n = 1 and (select char_length(titulo) = 120 and char_length(corpo) = 500 and link is null
                                  from public.nx_notificacoes where conta_id = k_at order by id desc limit 1), 'nx_notificar corta textos e recusa link fora de #/');
  perform pg_temp.ok(public.nx_notificar(cA, k_gr, 'sistema', 'Vazamento?', null, null) = 0
                 and not exists (select 1 from public.nx_notificacoes where conta_id = k_gr), 'nx_notificar para conta de outra empresa → 0 linhas');
  perform pg_temp.ok(public.nx_notificar(cA, k_su, 'sistema', 'Super', null, null) = 1, 'nx_notificar para o super (vê todos) → 1');

  -- ---------------------------------------------------------- Vault
  sec := public.nx_segredo_gravar(null, 'segredo-1', 'nx-teste-f1-' || gen_random_uuid());
  perform pg_temp.ok(public.nx_segredo_ler(sec) = 'segredo-1', 'Vault grava e lê');
  perform public.nx_segredo_gravar(sec, 'segredo-2', null);
  perform pg_temp.ok(public.nx_segredo_ler(sec) = 'segredo-2', 'Vault atualiza');

  -- ---------------------------------------------------------- horários
  hr := '{"0":[],"1":[["08:00","12:00"],["13:30","18:00"]],"2":[["08:00","18:00"]],"3":[["08:00","18:00"]],"4":[["08:00","18:00"]],"5":[["08:00","18:00"]],"6":[["08:00","12:00"]]}';
  perform pg_temp.ok(public.nx_horario_aberto(hr, '2026-09-28 10:00-03'), 'segunda 10h aberto');
  perform pg_temp.ok(not public.nx_horario_aberto(hr, '2026-09-28 12:30-03'), 'segunda 12h30 fechado (almoço)');
  perform pg_temp.ok(public.nx_proximo_horario(hr, '2026-09-28 12:30-03') = '2026-09-28 13:30-03'::timestamptz, 'próxima abertura depois do almoço');
  perform pg_temp.ok(public.nx_proximo_horario(hr, '2026-10-03 13:00-03') = '2026-10-05 08:00-03'::timestamptz, 'sábado à tarde → segunda 8h (domingo fechado)');
  perform pg_temp.ok(public.nx_proximo_horario(hr, '2026-09-28 10:00-03') = '2026-09-28 10:00-03'::timestamptz, 'aberto agora → o próprio instante');
  perform pg_temp.ok(public.nx_horario_aberto(null, now()), 'sem horário = 24 h');
  perform pg_temp.ok(public.nx_proximo_horario('{"0":[],"1":[],"2":[],"3":[],"4":[],"5":[],"6":[]}', now()) is null, 'sem faixas → null');

  -- ---------------------------------------------------------- cfg público, link base, escopo
  perform pg_temp.ok(public.nx_cfg_publico('{"fee":1,"waGestor":["1"],"waCliente":["2"],"assinatura":"x","regrasOff":[],"corMarca":"#000000"}', 'admin', 'sessao')::text = '{"corMarca": "#000000"}', 'cfg de sessão sem chaves sensíveis');
  perform pg_temp.ok(public.nx_cfg_publico('{"fee":1,"waGestor":["1"],"waCliente":["2"],"assinatura":"x","regrasOff":[]}', 'admin', 'dados') ?& array['fee','assinatura','regrasOff']
                 and not (public.nx_cfg_publico('{"fee":1,"waGestor":["1"],"waCliente":["2"]}', 'admin', 'dados') ?| array['waGestor','waCliente']), 'cfg de dados mantém fee e tira waGestor/waCliente');
  perform pg_temp.ok(public.nx_cfg_publico('{"fee":1,"waGestor":["1"]}', 'super', 'sessao') ? 'waGestor', 'super recebe cfg inteiro');
  perform pg_temp.ok(public.nx_link_base(cA) is not distinct from (select nullif(btrim(saas_url), '') from public.nx_config where id = 1), 'sem domínio → saas_url');
  insert into public.nx_dominios (host, org_id, status) values ('teste-f1-org.exemplo.com.br', v_plat, 'ativo');
  perform pg_temp.ok(public.nx_link_base(cA) = 'https://teste-f1-org.exemplo.com.br/app/', 'domínio ativo da org');
  insert into public.nx_dominios (host, org_id, cliente_id, status) values ('teste-f1-cli.exemplo.com.br', v_plat, cA, 'ativo');
  perform pg_temp.ok(public.nx_link_base(cA) = 'https://teste-f1-cli.exemplo.com.br/app/', 'domínio do cliente vence o da org');
  select * into k_contas from public.nx_contas where id = k_adm;
  perform pg_temp.ok(public.nx_conta_no_escopo(k_contas, k_at, cA), 'admin mexe em atendente de clientes onde é admin');
  perform pg_temp.ok(not public.nx_conta_no_escopo(k_contas, k_su, cA), 'admin não mexe em gestor/super');
  perform pg_temp.ok(not public.nx_conta_no_escopo(k_contas, k_sem, cA), 'admin NÃO mexe em conta sem acesso nenhum de outra org (tomada de conta)');
  perform pg_temp.ok(not public.nx_conta_no_escopo(k_contas, k_pend, cA), 'admin NÃO mexe em conta pendente sem acesso');
  select * into k_contas from public.nx_contas where id = k_gr;
  perform pg_temp.ok(public.nx_conta_no_escopo(k_contas, k_sem, cB), 'gestor da revenda mexe em conta da própria org sem acesso');
  select * into k_contas from public.nx_contas where id = k_adm;
  delete from public.nx_acessos where conta_id = k_adm and cliente_id = cB;
  perform pg_temp.ok(not public.nx_conta_no_escopo(k_contas, k_at, cA), 'admin não mexe em quem tem acesso a cliente onde ele não é admin');
  select * into k_contas from public.nx_contas where id = k_gr;
  perform pg_temp.ok(not public.nx_conta_no_escopo(k_contas, k_le, cB), 'gestor de revenda não mexe em conta de outra org');
  select * into k_contas from public.nx_contas where id = k_su;
  perform pg_temp.ok(public.nx_conta_no_escopo(k_contas, k_gr, cB), 'super mexe em qualquer conta');

  -- ---------------------------------------------------------- canal pelo wa_phone_number_id, apagar cliente
  update public.nx_clientes set wa_phone_number_id = 'teste-f1-pid-9' where id = cB;
  perform pg_temp.ok((select count(*) from public.nx_canais where phone_number_id = 'teste-f1-pid-9' and cliente_id = cB and status = 'pendente'
                        and departamento_id = (select id from public.nx_departamentos where cliente_id = cB and padrao)) = 1, 'wa_phone_number_id cria o canal com o departamento padrão');
  perform set_config('nx.sem_gatilho_canal', '1', true);
  update public.nx_clientes set wa_phone_number_id = 'teste-f1-pid-8' where id = cA;
  perform set_config('nx.sem_gatilho_canal', '0', true);
  perform pg_temp.ok(not exists (select 1 from public.nx_canais where phone_number_id = 'teste-f1-pid-8'), 'nx.sem_gatilho_canal desliga o gatilho');
  delete from public.nx_clientes where id = cB;
  perform pg_temp.ok(exists (select 1 from public.nx_midia_lixo where cliente_id = cB and path = cB::text || '/'), 'apagar cliente põe a pasta na faxina de mídia');

  -- ---------------------------------------------------------- permissões
  perform pg_temp.ok(not exists (select 1 from pg_tables t where t.schemaname = 'public' and t.tablename like 'nx\_%'
                                   and (has_table_privilege('anon', format('public.%I', t.tablename), 'select')
                                     or has_table_privilege('authenticated', format('public.%I', t.tablename), 'select'))),
                     'nenhuma tabela nx_ acessível por anon/authenticated');
  perform pg_temp.ok(not exists (select 1 from pg_tables t where t.schemaname = 'public' and t.tablename like 'nx\_%'
                                   and not (select c.relrowsecurity from pg_class c where c.oid = format('public.%I', t.tablename)::regclass)),
                     'RLS ligado em todas as nx_');
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_ctx(text,uuid,text)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_fn_ctx(text,uuid,text)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_segredo_ler(uuid)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_cv_visivel(public.nx_ctx_t,uuid,bigint)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_aplicar_modelo(uuid,text)', 'execute')
                 and has_function_privilege('anon', 'public.nx_pulso(text,uuid)', 'execute')
                 and has_function_privilege('service_role', 'public.nx_fn_ctx(text,uuid,text)', 'execute'),
                     'internas só service_role; nx_pulso aberto ao painel');

  -- ---------------------------------------------------------- tempo (regra 11)
  t0 := clock_timestamp();
  for i in 1..300 loop perform public.nx_ctx('tok-f1-adm', cA, 'leitura'); end loop;
  ms := extract(epoch from clock_timestamp() - t0) * 1000 / 300;
  perform pg_temp.ok(ms < 5, 'lento nx_ctx ' || round(ms, 2) || ' ms');
  t0 := clock_timestamp();
  for i in 1..300 loop perform public.nx_pulso('tok-f1-su', cA); end loop;
  ms := extract(epoch from clock_timestamp() - t0) * 1000 / 300;
  perform pg_temp.ok(ms < 8, 'lento nx_pulso ' || round(ms, 2) || ' ms');
  t0 := clock_timestamp();
  for i in 1..300 loop perform public.nx_cv_visivel(v, cA, cv2); end loop;
  ms := extract(epoch from clock_timestamp() - t0) * 1000 / 300;
  perform pg_temp.ok(ms < 1, 'lento nx_cv_visivel ' || round(ms, 3) || ' ms');

  -- ---------------------------------------------------------- transação SOMENTE LEITURA (fica por ÚLTIMO)
  -- o PostgREST roda RPC stable/immutable (e todo GET) em transação read only: o nx_ctx do
  -- super/gestor sem acesso próprio não pode cair por causa do insert da auditoria.
  delete from public.nx_auditoria where conta_id = k_su;
  perform set_config('transaction_read_only', 'on', true);
  perform pg_temp.ok((public.nx_ctx('tok-f1-su', cA, 'leitura')).papel = 'super', 'nx_ctx do super em transação read only (sem cair na auditoria)');
  perform pg_temp.ok((public.nx_pulso('tok-f1-su', cA) ->> 'v') is not null, 'nx_pulso do super em transação read only');
  perform pg_temp.ok(not exists (select 1 from public.nx_auditoria where conta_id = k_su), '(read only: a auditoria fica para a próxima escrita)');

  raise notice 'OK 01_base: todos os casos passaram';
end $t$;

rollback;
