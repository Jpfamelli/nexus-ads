-- ============================================================
-- ÓRBITA — supabase/testes/35_plano2000d.sql · smoke de 20261026a_plano2000d.sql (plano 2000d, srv; a 26b é o 36)
--   Concorrência: DS-001/125/315 atribuir com dono esperado · DS-002 pegar a próxima · DS-003 etiquetas por diferença · DS-051 lote
--   Segurança: DS-124 rodízio · DS-127 avisos · DS-128/129 cadastro · DS-130/131 senha · DS-135 convite · DS-153 auditoria ·
--   DS-140/338/339 permissões e RLS · DS-156 suporte · DS-273 cobrança
--   Plano e teste: DS-280/281/282 limites e módulos · DS-274/275/276/277/297 teste de 14 dias · marca (DU-145…)
--   IA: DS-169/188 · Envio em massa: DU-041/042/043/044 · AX-059 · DS-350 · DU-383 · DS-173
--   Preferências, metas e LGPD: DS-009/346 · DS-080 · DS-069
-- Roda em begin … rollback; termina em raise exception 'OK_35_PLANO2000D — …'.
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
  org_p uuid; org_r uuid; cA uuid; cTe uuid; k_adm uuid; k_at uuid; k_at2 uuid; k_sup uuid; k_res uuid; kM uuid; dep uuid; dep2 uuid;
  t_adm text := 'tok-35-adm-' || sfx; t_at text := 'tok-35-at-' || sfx; t_at2 text := 'tok-35-at2-' || sfx;
  t_sup text := 'tok-35-sup-' || sfx; t_res text := 'tok-35-res-' || sfx;
  ct bigint; ct2 bigint; ct3 bigint; cv1 bigint; cv2 bigint; cv3 bigint; l1 bigint; l2 bigint; e1 uuid; e2 uuid; e3 uuid; e_ne uuid;
  j json; jb jsonb; n int; a public.nx_automacoes; v_txt text; v_tok text; v_hash text; v_conv text; ch text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  perform pg_temp.ok(exists (select 1 from public.nx_versao_banco where nome = '20261026a_plano2000d'), 'versão 26a registrada');
  select id into org_p from public.nx_orgs where tipo = 'plataforma' limit 1;
  insert into public.nx_clientes (slug, nome, org_id, vertical, status, entrada_chave) values ('t35-' || sfx, 'Teste 35', org_p, 'odonto', 'ativo', ch) returning id into cA;
  update public.nx_clientes set modulos = array(select distinct unnest(coalesce(modulos, '{}'::text[]) || array['crm', 'conversas', 'automacoes', 'ads'])) where id = cA;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t35-adm-' || sfx || '@teste.local', 'Admin Trinta e Cinco', 'x', 'clinica', true, org_p) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t35-at-' || sfx || '@teste.local', 'Ana Atende', 'x', 'clinica', true, org_p) returning id into k_at;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t35-at2-' || sfx || '@teste.local', 'Bia Atende', 'x', 'clinica', true, org_p) returning id into k_at2;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t35-res-' || sfx || '@teste.local', 'Rui Restrito', 'x', 'clinica', true, org_p) returning id into k_res;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t35-sup-' || sfx || '@teste.local', 'Super Trinta e Cinco', 'x', 'gestor', true, org_p) returning id into k_sup;
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas) values (k_adm, cA, 'admin', true), (k_at, cA, 'atendente', true), (k_at2, cA, 'atendente', true),
                                                                              (k_res, cA, 'atendente', false);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash(t_adm), k_adm, now() + interval '1 hour'), (public.nx_hash(t_at), k_at, now() + interval '1 hour'),
    (public.nx_hash(t_at2), k_at2, now() + interval '1 hour'), (public.nx_hash(t_sup), k_sup, now() + interval '1 hour'), (public.nx_hash(t_res), k_res, now() + interval '1 hour');
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor) values (cA, 'Meta 35', 'pn-35-' || sfx, 'meta') returning id into kM;
  insert into public.nx_departamentos (cliente_id, nome, distribuicao) values (cA, 'Recepção 35', 'rodizio') returning id into dep;
  insert into public.nx_departamentos (cliente_id, nome) values (cA, 'Comercial 35') returning id into dep2;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Carla 35', '5512990035001') returning id into ct;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Davi 35', '5512990035002') returning id into ct2;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Elis 35', '5512990035003') returning id into ct3;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, departamento_id, ultima_entrada_em)
  values (cA, kM, ct, 'p35a' || sfx, 'aberta', dep, now() - interval '30 minutes') returning id into cv1;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, departamento_id, ultima_entrada_em)
  values (cA, kM, ct2, 'p35b' || sfx, 'aberta', dep, now() - interval '10 minutes') returning id into cv2;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status, departamento_id, ultima_entrada_em)
  values (cA, kM, ct3, 'p35c' || sfx, 'pendente', dep2, now() - interval '5 minutes') returning id into cv3;

  -- ---------------------------------------------------------- DS-002 pegar a próxima (a mais antiga sem dono; nunca a mesma duas vezes)
  j := public.nx_cv_pegar_proxima(t_at, cA);
  perform pg_temp.ok((j -> 'conversa' ->> 'id')::bigint = cv1 and (j -> 'conversa' ->> 'atribuida_a')::uuid = k_at, 'DS-002: a mais antiga, atribuída a quem pediu');
  perform pg_temp.ok((select atribuida_em from public.nx_conversas where id = cv1) is not null, 'DS-022: atribuida_em preenchida');
  perform pg_temp.ok(exists (select 1 from public.nx_mensagens m where m.conversa_id = cv1 and m.tipo = 'sistema' and m.corpo = 'Ana Atende assumiu'), 'DS-002: mensagem de sistema');
  j := public.nx_cv_pegar_proxima(t_at2, cA, '{"departamento_id":null}'::jsonb);
  perform pg_temp.ok((j -> 'conversa' ->> 'id')::bigint = cv2, 'DS-002: a segunda pessoa recebe OUTRA conversa');
  j := public.nx_cv_pegar_proxima(t_at2, cA, jsonb_build_object('departamento_id', dep));
  perform pg_temp.ok(j -> 'conversa' is null or json_typeof(j -> 'conversa') = 'null', 'DS-002: fila do departamento vazia → conversa null');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_pegar_proxima(%L, %L, %L)', t_at, cA, '{"departamento_id":"x"}')) = 'dados_invalidos|departamento_id', 'DS-002: filtro inválido');

  -- ---------------------------------------------------------- DS-001 / DS-125 / DS-315 atribuir com o dono esperado
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_atribuir_v2(%L, %L, %s, %L, null, null)', t_at2, cA, cv1, k_at2)) = 'dono_mudou|Ana Atende',
    'DS-001: quem viu a conversa sem dono e tenta assumir recebe dono_mudou com o nome de quem ficou');
  -- o contrato que a tela de Conversas já usa (nomes de parâmetro como o PostgREST manda): nx_cv_atribuir + p_dono_esperado/p_conferir_dono
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_atribuir(p_token => %L, p_cliente => %L, p_conversa => %s, p_conta => %L, p_dono_esperado => null, p_conferir_dono => true)',
                                         t_at2, cA, cv1, k_at2)) = 'dono_mudou|Ana Atende', 'DS-001: nx_cv_atribuir com p_conferir_dono (contrato do front)');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_atribuir(%L, %L, 0, null, null)', t_at2, cA)) = 'conversa_nao_encontrada'
                     and pg_temp.erro(format('select public.nx_cv_atribuir(%L, %L, 0, %L, %L)', t_at2, cA, k_at2, dep)) = 'conversa_nao_encontrada',
                     'chamadas posicionais antigas (nulos e literais) continuam sem ambiguidade');
  j := public.nx_cv_atribuir_v2(t_at2, cA, cv1, k_at2, null, k_at);
  perform pg_temp.ok((j ->> 'atribuida_a')::uuid = k_at2, 'DS-001: com o dono certo, transfere');
  j := public.nx_cv_atribuir(t_adm, cA, cv1, k_at);
  perform pg_temp.ok((j ->> 'atribuida_a')::uuid = k_at, 'DS-001: a nx_cv_atribuir de sempre continua sem conferir');
  update public.nx_acessos set suspenso_em = now() where conta_id = k_at2 and cliente_id = cA;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_atribuir(%L, %L, %s, %L)', t_adm, cA, cv1, k_at2)) = 'dados_invalidos|conta', 'DS-125: acesso suspenso não recebe conversa');
  update public.nx_acessos set suspenso_em = null where conta_id = k_at2 and cliente_id = cA;
  update public.nx_contas set suspenso_em = now() where id = k_at2;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_atribuir(%L, %L, %s, %L)', t_adm, cA, cv1, k_at2)) = 'dados_invalidos|conta', 'DS-125: conta suspensa não recebe conversa');
  update public.nx_contas set suspenso_em = null where id = k_at2;
  j := public.nx_cv_atribuir_v2(t_adm, cA, cv1, null, dep2, k_at, true, true);
  perform pg_temp.ok((j ->> 'atribuida_a')::uuid = k_at and (j ->> 'departamento_id')::uuid = dep2, 'DS-315: muda o departamento mantendo o dono');
  j := public.nx_cv_atribuir_v2(t_adm, cA, cv1, null, dep, k_at, true, false);
  perform pg_temp.ok(j ->> 'atribuida_a' is null, 'DS-315: sem manter, o dono sai (como antes)');

  -- ---------------------------------------------------------- DS-124 rodízio pula suspenso e ausente · DS-127 aviso a suspenso
  update public.nx_conversas set atribuida_a = null, status = 'aberta' where id in (cv1, cv2, cv3);
  update public.nx_acessos set recebe_conversas = false where cliente_id = cA and conta_id in (k_adm, k_res);
  update public.nx_contas set ausente_ate = now() + interval '1 day' where id = k_at;
  update public.nx_acessos set suspenso_em = now() where conta_id = k_at2 and cliente_id = cA;
  perform pg_temp.ok(public.nx_cv_distribuir(cv1) is null, 'DS-124: ausente e suspenso ficam fora do rodízio');
  update public.nx_contas set ausente_ate = now() - interval '1 minute' where id = k_at;
  perform pg_temp.ok(public.nx_cv_distribuir(cv1) = k_at, 'DS-124: a ausência que passou volta ao rodízio');
  perform pg_temp.ok(public.nx_notificar(cA, k_at2, 'sistema', 'oi 35') = 0, 'DS-127: acesso suspenso não recebe aviso');
  update public.nx_acessos set suspenso_em = null where conta_id = k_at2 and cliente_id = cA;
  perform pg_temp.ok(public.nx_notificar(cA, k_at2, 'sistema', 'oi 35') = 1, 'DS-127: reativado volta a receber');
  update public.nx_contas set suspenso_em = now() where id = k_adm;
  n := public.nx_notificar(cA, null, 'sistema', 'aviso geral 35');
  perform pg_temp.ok(not exists (select 1 from public.nx_notificacoes x where x.conta_id = k_adm and x.titulo = 'aviso geral 35'), 'DS-127: admin suspenso fora do aviso geral');
  update public.nx_contas set suspenso_em = null where id = k_adm;

  -- ---------------------------------------------------------- DS-003 etiquetas da conversa por diferença · DS-051 lote de negócios
  insert into public.nx_etiquetas (cliente_id, nome, cor) values (cA, 'VIP 35', '#6FA3CF') returning id into e1;
  insert into public.nx_etiquetas (cliente_id, nome, cor) values (cA, 'Urgente 35', '#E5B35C') returning id into e2;
  insert into public.nx_etiquetas (cliente_id, nome, cor) values (cA, 'Retorno 35', '#7FD1A5') returning id into e3;
  update public.nx_conversas set etiquetas = array[e1] where id = cv2;
  j := public.nx_cv_etiquetas_mudar(t_adm, cA, cv2, array[e2], '{}');
  perform pg_temp.ok((select etiquetas from public.nx_conversas where id = cv2) @> array[e1, e2], 'DS-003: acrescentar mantém a que já estava');
  j := public.nx_cv_etiquetas_mudar(t_adm, cA, cv2, '{}', array[e1]);
  perform pg_temp.ok((select etiquetas from public.nx_conversas where id = cv2) = array[e2], 'DS-003: tirar só a pedida');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_etiquetas_mudar(%L, %L, %s, %L, %L)', t_adm, cA, cv2, array[gen_random_uuid()], '{}')) = 'dados_invalidos|etiquetas', 'DS-003: etiqueta de outro cliente');
  insert into public.nx_leads (cliente_id, nome, contato_id, titulo, status, etiquetas) values (cA, 'Neg 35a', ct, 'Implante', 'aberto', array[e3]) returning id into l1;
  insert into public.nx_leads (cliente_id, nome, contato_id, titulo, status, dono_id) values (cA, 'Neg 35b', ct2, 'Clareamento', 'aberto', k_at) returning id into l2;
  j := public.nx_negocios_etiquetar_lote(t_adm, cA, array[l1, l2, -1], array[e1], '{}');
  perform pg_temp.ok(json_array_length(j -> 'ok') = 2 and (j -> 'falhas' -> 0 ->> 'codigo') = 'negocio_nao_encontrado', 'DS-051: ok + falhas por id');
  perform pg_temp.ok((select etiquetas from public.nx_leads where id = l1) @> array[e1, e3], 'DS-051: a etiqueta que já estava continua');
  j := public.nx_negocios_etiquetar_lote(t_res, cA, array[l2], '{}', array[e1]);
  perform pg_temp.ok((j -> 'falhas' -> 0 ->> 'codigo') = 'negocio_nao_encontrado' and (select etiquetas from public.nx_leads where id = l2) = array[e1], 'DS-051: restrito não mexe no negócio do colega');
  perform pg_temp.ok(exists (select 1 from public.nx_historico h where h.negocio_id = l1 and h.tipo = 'etiquetas'), 'DS-051: histórico do negócio');

  -- ---------------------------------------------------------- DS-130 senha comum · DS-131 bcrypt regravado · DS-135 convite do e-mail
  perform pg_temp.ok(pg_temp.erro($$select public.nx_senha_validar('Password123')$$) = 'senha_fraca', 'DS-130: senha comum recusada');
  perform pg_temp.ok(pg_temp.erro($$select public.nx_senha_validar('cavalo-azul-35')$$) = 'ok', 'DS-130: senha boa passa');
  update public.nx_contas set senha_hash = extensions.crypt('senha-boa-35x', extensions.gen_salt('bf', 4)) where id = k_at2;
  perform set_config('request.headers', '', true);
  j := public.nx_entrar('t35-at2-' || sfx || '@teste.local', 'senha-boa-35x');
  select senha_hash into v_hash from public.nx_contas where id = k_at2;
  perform pg_temp.ok(j ->> 'token' is not null and substr(v_hash, 5, 2) = '12' and v_hash = extensions.crypt('senha-boa-35x', v_hash), 'DS-131: entrada regrava o bcrypt com custo 12');
  v_conv := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.nx_convites (token_hash, org_id, cliente_id, papel, email, expira_em)
  values (public.nx_hash(v_conv), org_p, cA, 'atendente', 'convidada-35-' || sfx || '@teste.local', now() + interval '1 day');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_convite_aceitar(%L, %L, %L, %L)', v_conv, 'Outra Pessoa', 'outra-35-' || sfx || '@teste.local', 'senha-boa-35y')) = 'convite_outro_email',
    'DS-135: convite de um e-mail não serve para outro');
  j := public.nx_convite_aceitar(v_conv, 'Convidada 35', 'Convidada-35-' || sfx || '@teste.local', 'senha-boa-35y');
  perform pg_temp.ok((j ->> 'ok')::boolean, 'DS-135: o e-mail convidado aceita (sem diferenciar maiúsculas)');

  -- ---------------------------------------------------------- DS-153 auditoria só cresce
  perform pg_temp.ok(pg_temp.erro('delete from public.nx_auditoria where id = (select max(id) from public.nx_auditoria)') = 'auditoria_imutavel', 'DS-153: delete recusado');
  perform pg_temp.ok(pg_temp.erro('update public.nx_auditoria set acao = acao where id = (select max(id) from public.nx_auditoria)') = 'auditoria_imutavel', 'DS-153: update recusado');
  perform set_config('nx.faxina', 'on', true);
  perform pg_temp.ok(pg_temp.erro('delete from public.nx_auditoria where id = -1') = 'ok', 'DS-153: a retenção explícita apaga');
  perform set_config('nx.faxina', '', true);
  -- plano 2000d · REV-M3: a faxina diária NÃO apaga auditoria (decisão 6) e não deixa nx.faxina ligado
  insert into public.nx_auditoria (cliente_id, acao, criado_em) values (cA, 't35_velha', now() - interval '900 days');
  j := public.nx_saas_faxina();
  perform pg_temp.ok(exists (select 1 from public.nx_auditoria where cliente_id = cA and acao = 't35_velha'), 'REV-M3: a faxina não apaga auditoria antiga (decisão 6)');
  perform pg_temp.ok(coalesce(current_setting('nx.faxina', true), '') = ''
                     and pg_temp.erro('delete from public.nx_auditoria where id = (select max(id) from public.nx_auditoria)') = 'auditoria_imutavel',
                     'REV-M3: depois da faxina o delete continua recusado');

  -- ---------------------------------------------------------- DS-156 suporte avisa o admin · DS-273 cobrança deixa ler
  perform public.nx_suporte_entrar(t_sup, cA, 'Ajustar o número 35');
  perform pg_temp.ok(exists (select 1 from public.nx_notificacoes x where x.conta_id = k_adm and x.titulo = 'A equipe de suporte entrou na sua conta'
                               and x.corpo like 'Motivo: Ajustar o número 35%'), 'DS-156: o admin fica sabendo do motivo');
  update public.nx_clientes set status = 'suspenso', motivo_status = 'cobranca' where id = cA;
  perform pg_temp.ok((public.nx_ctx(t_adm, cA, 'leitura')).papel = 'admin', 'DS-273: admin lê com a cobrança atrasada');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ctx(%L, %L, %L)', t_adm, cA, 'atendente')) = 'conta_suspensa', 'DS-273: mas não escreve');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ctx(%L, %L, %L)', t_at, cA, 'leitura')) = 'conta_suspensa', 'DS-273: atendente não entra');
  update public.nx_clientes set motivo_status = null where id = cA;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ctx(%L, %L, %L)', t_adm, cA, 'leitura')) = 'conta_suspensa', 'DS-273: suspenso por outro motivo continua fechado');
  update public.nx_clientes set status = 'ativo' where id = cA;

  -- ---------------------------------------------------------- DS-169 / DS-188 IA
  update public.nx_clientes set limites = coalesce(limites, '{}'::jsonb) || '{"ia_simular_dia": 1}'::jsonb where id = cA;
  j := public.nx_ia_reservar(cA, k_adm, 'simular');
  perform pg_temp.ok((j ->> 'ok')::boolean, 'DS-169: «simular» aceito');
  j := public.nx_ia_reservar(cA, k_adm, 'simular');
  perform pg_temp.ok((j ->> 'erro') = 'limite_dia', 'DS-169: teto diário do simular');
  perform pg_temp.ok((public.nx_ia_reservar(cA, k_adm, 'reescrever') ->> 'ok')::boolean and (public.nx_ia_reservar(cA, k_adm, 'traduzir') ->> 'ok')::boolean, 'DS-169: reescrever e traduzir aceitos');
  update public.nx_clientes set limites = coalesce(limites, '{}'::jsonb) || '{"ia_dia": 3}'::jsonb where id = cA;
  perform pg_temp.ok((public.nx_ia_reservar(cA, k_adm, 'sugerir') ->> 'erro') = 'limite_dia', 'DS-188: teto diário geral quando o plano define');
  update public.nx_clientes set limites = limites - 'ia_dia' - 'ia_simular_dia' where id = cA;

  -- ---------------------------------------------------------- DS-281 / DS-282 limites · DS-173 opt-out cancela a fila
  update public.nx_clientes set limites = coalesce(limites, '{}'::jsonb) || '{"departamentos": 2}'::jsonb where id = cA;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_departamento_salvar(%L, %L, %L)', t_adm, cA, '{"nome":"Terceiro 35"}')) = 'limite_plano|departamentos:2', 'DS-281: limite de departamentos');
  update public.nx_clientes set limites = (limites - 'departamentos') || '{"contatos": 4}'::jsonb where id = cA;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Folga 35', '5512990035004');
  perform pg_temp.ok(not exists (select 1 from public.nx_notificacoes x where x.cliente_id = cA and x.titulo = 'Limite de contatos do plano atingido'), 'DS-282: no limite, sem aviso');
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Folga 35b', '5512990035005');
  perform pg_temp.ok(exists (select 1 from public.nx_notificacoes x where x.cliente_id = cA and x.titulo = 'Limite de contatos do plano atingido')
                     and exists (select 1 from public.nx_auditoria x where x.cliente_id = cA and x.acao = 'limite_contatos_excedido'), 'DS-282 / REV-M2: passou do limite → entra, avisa e marca na auditoria');
  -- plano 2000d · REV-M2: a entrada automática nunca é recusada pelo gatilho (lead não se perde); o aviso e a marca saem 1× no mês
  perform pg_temp.ok(pg_temp.erro(format('insert into public.nx_contatos (cliente_id, nome, telefone) values (%L, %L, %L)', cA, 'Fora 35', '5512990035006')) = 'ok'
                     and pg_temp.erro(format('insert into public.nx_contatos (cliente_id, nome, telefone) values (%L, %L, %L)', cA, 'Fora 35b', '5512990035007')) = 'ok',
    'REV-M2: acima da folga a entrada automática continua entrando');
  perform pg_temp.ok((select count(*) from public.nx_auditoria x where x.cliente_id = cA and x.acao = 'limite_contatos_excedido') = 1
                     and (select count(*) from public.nx_notificacoes x where x.cliente_id = cA and x.titulo = 'Limite de contatos do plano atingido' and x.conta_id = k_adm) = 1,
    'REV-M2: aviso e marca 1× por mês');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_exigir_limite(%L, %L, 1)', cA, 'contatos')) = 'limite_plano|contatos:4', 'REV-M2: criação manual/importação continua bloqueada no limite');
  -- plano 2000d · REV-M2: o formulário do site (nx_lead_entrada) com o plano cheio grava o contato e o negócio (antes: ok sem gravar)
  perform set_config('request.headers', '', true);
  n := (select count(*) from public.nx_contatos where cliente_id = cA);
  j := public.nx_lead_entrada(ch, '{"nome":"Lead Cheio 35","telefone":"5512990035008"}'::jsonb);
  perform pg_temp.ok((j ->> 'ok')::boolean and (select count(*) from public.nx_contatos where cliente_id = cA) = n + 1
                     and exists (select 1 from public.nx_leads l join public.nx_contatos k on k.id = l.contato_id
                                  where k.cliente_id = cA and k.nome = 'Lead Cheio 35' and l.origem = 'site'),
                     'REV-M2: formulário com o plano cheio não perde o lead');
  update public.nx_clientes set limites = limites - 'contatos' where id = cA;
  insert into public.nx_envios_fila (cliente_id, contato_id, tipo, texto, origem) values (cA, ct3, 'texto', 'oi', 'automacao');
  update public.nx_contatos set optin_marketing = false where id = ct3;
  perform pg_temp.ok((select status from public.nx_envios_fila where contato_id = ct3 order by id desc limit 1) = 'cancelado', 'DS-173: opt-out cancela o pendente da automação');

  -- ---------------------------------------------------------- envio em massa: nx_auto_envio_guarda
  insert into public.nx_automacoes (cliente_id, nome, gatilho, ativo, acoes) values (cA, 'Lembrete 35', 'tempo_no_estagio', true, '[{"tipo":"nota","texto":"x"}]') returning * into a;
  perform pg_temp.ok(public.nx_auto_envio_guarda(a, ct3) = 'contato pediu para não receber', 'DU-044: opt-out barra a mensagem de automação');
  perform pg_temp.ok(public.nx_auto_envio_guarda(a, ct3, false) is null, 'DU-044: modelo que não é marketing passa (lembrete)');
  insert into public.nx_etiquetas (cliente_id, nome, cor) values (cA, 'Não enviar', '#9D9486') returning id into e_ne;
  update public.nx_contatos set etiquetas = array[e_ne] where id = ct2;
  perform pg_temp.ok(public.nx_auto_envio_guarda(a, ct2) = 'contato com a etiqueta «Não enviar»', 'AX-059: etiqueta «Não enviar»');
  update public.nx_contatos set etiquetas = '{}' where id = ct2;
  insert into public.nx_envios_fila (cliente_id, contato_id, tipo, texto, origem, status) values (cA, ct, 'texto', 'de outra', 'automacao', 'enviado');
  -- plano 2000d · REV-M1: sem configuração da empresa (e sem limite no plano) nada de teto, intervalo ou máximo por contato
  update public.nx_clientes set cfg = coalesce(cfg, '{}'::jsonb) - 'automacoes' where id = cA;
  perform pg_temp.ok(public.nx_auto_envio_guarda(a, ct) is null, 'REV-M1: sem configuração, o intervalo entre automações fica desligado');
  perform pg_temp.ok((public.nx_auto_base(cA) ->> 'teto_envios_dia') is null, 'REV-M1: sem teto por padrão');
  update public.nx_clientes set cfg = coalesce(cfg, '{}'::jsonb) || '{"automacoes":{"intervalo_contato_h":4}}'::jsonb where id = cA;
  perform pg_temp.ok(public.nx_auto_envio_guarda(a, ct) = 'mensagem automática recente para este contato', 'DU-043: intervalo entre automações diferentes (ligado)');
  -- conta pela hora PREVISTA: a mensagem de outra automação agendada para daqui a 10 h não ocupa o contato agora…
  update public.nx_envios_fila set status = 'cancelado' where contato_id = ct and texto = 'de outra';
  insert into public.nx_envios_fila (cliente_id, contato_id, tipo, texto, origem, status, enviar_em) values (cA, ct, 'texto', 'agendada 35', 'automacao', 'pendente', now() + interval '10 hours');
  perform pg_temp.ok(public.nx_auto_envio_guarda(a, ct) is null, 'REV-M1: o intervalo usa enviar_em, não a entrada na fila');
  -- …mas ocupa quem sairia perto dela
  perform pg_temp.ok(public.nx_auto_envio_guarda(a, ct, true, now() + interval '9 hours') = 'mensagem automática recente para este contato', 'REV-M1: perto da hora prevista, o intervalo vale');
  update public.nx_envios_fila set status = 'cancelado' where contato_id = ct and texto = 'agendada 35';
  -- confirmação (agendado) + lembrete (antes_da_data) com 1 h de distância: sem configuração saem os dois; com, o segundo é pulado
  declare a_conf public.nx_automacoes; a_lemb public.nx_automacoes;
  begin
    update public.nx_clientes set cfg = cfg - 'automacoes' where id = cA;
    insert into public.nx_automacoes (cliente_id, nome, gatilho, ativo, acoes) values (cA, 'Confirmação 35', 'agendado', true, '[{"tipo":"nota","texto":"x"}]') returning * into a_conf;
    insert into public.nx_automacoes (cliente_id, nome, gatilho, ativo, acoes) values (cA, 'Lembrete consulta 35', 'antes_da_data', true, '[{"tipo":"nota","texto":"x"}]') returning * into a_lemb;
    perform pg_temp.ok(public.nx_auto_envio_guarda(a_conf, ct2, false) is null, 'REV-M1: confirmação sai sem configuração');
    insert into public.nx_envios_fila (cliente_id, contato_id, tipo, texto, origem, automacao_id, status, enviar_em) values (cA, ct2, 'texto', 'conf 35', 'automacao', a_conf.id, 'enviado', now());
    perform pg_temp.ok(public.nx_auto_envio_guarda(a_lemb, ct2, false, now() + interval '1 hour') is null, 'REV-M1: lembrete 1 h depois também sai (sem configuração)');
    update public.nx_clientes set cfg = coalesce(cfg, '{}'::jsonb) || '{"automacoes":{"intervalo_contato_h":4}}'::jsonb where id = cA;
    perform pg_temp.ok(public.nx_auto_envio_guarda(a_lemb, ct2, false, now() + interval '1 hour') is null, 'REV-M1: gatilho de agenda nunca cai no intervalo entre automações');
    update public.nx_clientes set cfg = cfg || '{"automacoes":{"intervalo_contato_h":4,"max_msgs_contato_dia":1}}'::jsonb where id = cA;
    perform pg_temp.ok(public.nx_auto_envio_guarda(a_lemb, ct2, false, now() + interval '1 hour') = 'limite de mensagens automáticas por contato no dia', 'REV-M1: com configuração, o segundo é pulado');
    update public.nx_envios_fila set status = 'cancelado' where contato_id = ct2 and texto = 'conf 35';
    update public.nx_clientes set cfg = cfg - 'automacoes' where id = cA;
  end;
  update public.nx_envios_fila set status = 'enviado' where contato_id = ct and texto = 'de outra';
  update public.nx_clientes set cfg = coalesce(cfg, '{}'::jsonb) || '{"automacoes":{"intervalo_contato_h":0,"max_msgs_contato_dia":1}}'::jsonb where id = cA;
  perform pg_temp.ok(public.nx_auto_envio_guarda(a, ct) = 'limite de mensagens automáticas por contato no dia', 'DS-350: no máximo N por contato em 24 h');
  update public.nx_clientes set cfg = cfg || '{"automacoes":{"intervalo_contato_h":0,"max_msgs_contato_dia":0,"teto_dia":1}}'::jsonb where id = cA;
  v_txt := public.nx_auto_envio_guarda(a, ct);
  perform pg_temp.ok(v_txt like 'teto diário de mensagens automáticas da empresa atingido%'
                     and exists (select 1 from public.nx_notificacoes x where x.cliente_id = cA and x.titulo = 'Teto diário de mensagens automáticas atingido'), 'DU-042: teto diário + aviso');
  a.gatilho := 'mensagem_recebida';
  perform pg_temp.ok(public.nx_auto_envio_guarda(a, ct3) like 'teto diário%', 'DU-042: o teto vale também para resposta automática');
  update public.nx_clientes set cfg = cfg - 'automacoes' where id = cA;
  perform pg_temp.ok(public.nx_auto_envio_guarda(a, ct3) is null, 'DU-044: responder a quem escreveu não passa pelo opt-out nem pelo intervalo');
  a.gatilho := 'tempo_no_estagio';
  insert into public.nx_envios_fila (cliente_id, contato_id, tipo, texto, origem, automacao_id, status)
  select cA, ct, 'texto', 'x', 'automacao', a.id, case when g % 2 = 0 then 'falhou' else 'enviado' end from generate_series(1, 20) g;
  v_txt := public.nx_auto_envio_guarda(a, ct2);
  perform pg_temp.ok(v_txt like 'automação desligada pelo disjuntor%'
                     and not (select ativo from public.nx_automacoes where id = a.id)
                     and (select pausada_motivo from public.nx_automacoes where id = a.id) = 'disjuntor', 'DU-383: disjuntor desliga a automação');

  -- ---------------------------------------------------------- DU-041 só daqui para frente
  jb := public.nx_auto_normalizar(cA, '{"nome":"tv35","gatilho":"tarefa_vencida","config":{"so_novos":true},"acoes":[{"tipo":"nota","texto":"oi"}]}'::jsonb);
  perform pg_temp.ok((jb -> 'config' ->> 'so_novos')::boolean, 'DU-041: o normalizador guarda so_novos');
  insert into public.nx_automacoes (cliente_id, nome, gatilho, config, acoes) values (cA, 'TV 35', 'tarefa_vencida', jb -> 'config', jb -> 'acoes') returning * into a;
  insert into public.nx_tarefas (cliente_id, tipo, titulo, vence_em, dono_id) values (cA, 'ligacao', 'ligar 35', now() - interval '1 hour', k_adm);
  perform pg_temp.ok((select count(*) from public.nx_auto_alvos_tempo(a, 50) x) = 1, 'DU-041: desligada/sem data, a vencida entra (como antes)');
  j := public.nx_automacao_ativar(t_adm, cA, a.id, true);
  select * into a from public.nx_automacoes where id = a.id;
  perform pg_temp.ok(a.ignorar_antes is not null and (select count(*) from public.nx_auto_alvos_tempo(a, 50) x) = 0, 'DU-041: ligada com so_novos, quem já estava vencido fica de fora');
  perform pg_temp.ok((public.nx_auto_base(cA) -> 'recursos')::jsonb ? 'so_novos' and (public.nx_auto_base(cA) ->> 'mensagens_hoje') is not null, 'base anuncia recursos e mensagens de hoje');

  -- ---------------------------------------------------------- DS-280 módulos do plano · DS-274/275/276/277/297 teste de 14 dias · marca
  perform pg_temp.ok(exists (select 1 from public.nx_planos where id = 'teste' and (limites ->> 'contatos')::int = 500), 'DS-275: plano teste');
  perform pg_temp.ok(pg_temp.erro($$select public.nx_marca_validar('{"teste_aberto":"sim"}'::jsonb)$$) = 'marca_invalida|teste_aberto', 'marca: teste_aberto é booleano');
  jb := public.nx_marca_validar('{"teste_aberto":true,"dias_teste":7,"termos_url":"https://x.test/termos","suporte_email":"oi@x.test","nome_curto":"Órbita"}'::jsonb);
  perform pg_temp.ok((jb ->> 'teste_aberto')::boolean and (jb ->> 'dias_teste')::int = 7 and jb ->> 'termos_url' = 'https://x.test/termos', 'marca: chaves novas aceitas');
  perform pg_temp.ok(pg_temp.erro($$select public.nx_marca_validar('{"termos_url":"http://x.test"}'::jsonb)$$) = 'marca_invalida|termos_url', 'marca: só https');
  insert into public.nx_orgs (slug, nome, tipo, marca, limites) values ('rev35-' || sfx, 'Revenda 35', 'revenda', '{"teste_aberto":true}', '{"dias_teste":10,"testes_ativos":1}') returning id into org_r;
  perform pg_temp.ok((public.nx_marca_publica('', 'rev35-' || sfx) -> 'marca' ->> 'teste_aberto')::boolean
                     and (public.nx_marca_publica('', 'rev35-' || sfx) -> 'marca' ->> 'dias_teste')::int = 10, 'DU-202/DU-215: marca pública com teste_aberto e dias_teste');
  perform set_config('request.headers', '', true);
  j := public.nx_teste_criar('rev35-' || sfx, 'Clínica Sorriso 35', 'odonto', 'Dona Teste', 'teste35-' || sfx || '@teste.local', 'senha-boa-35z', '12 99830-3535', '2026-10-25T10:00:00Z', null);
  v_tok := j ->> 'token'; cTe := (j ->> 'cliente_id')::uuid;
  perform pg_temp.ok(v_tok is not null and (j ->> 'teste_ate')::date = public.nx_hoje_sp() + 10, 'DS-274: teste criado com sessão e o prazo da revenda');
  perform pg_temp.ok((select status = 'teste' and plano = 'teste' and cadastro ->> 'telefone' = '12998303535' from public.nx_clientes where id = cTe), 'DS-274: empresa em teste, plano teste, WhatsApp guardado');
  perform pg_temp.ok((public.nx_ctx(v_tok, cTe, 'admin')).papel = 'admin' and exists (select 1 from public.nx_funis where cliente_id = cTe), 'DS-274: admin da empresa nova, com o modelo da vertical');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_exigir_modulo(%L, %L)', cTe, 'ads')) = 'modulo_desligado|ads', 'DS-280: o plano teste não liga Anúncios');
  update public.nx_clientes set modulos = array_append(modulos, 'ads') where id = cTe;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_exigir_modulo(%L, %L)', cTe, 'ads')) = 'modulo_desligado|ads', 'DS-280: mesmo com o módulo na lista do cliente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_exigir_modulo(%L, %L)', cA, 'ads')) = 'ok', 'DS-280: empresa antiga sem mudança');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_departamento_salvar(%L, %L, %L)', v_tok, cTe, '{"nome":"Terceiro"}')) = 'limite_plano|departamentos:2', 'DS-275/281: o teste tem 2 departamentos');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_teste_criar(%L,%L,%L,%L,%L,%L)', 'rev35-' || sfx, 'Outra 35', 'loja', 'Outro', 'outro35-' || sfx || '@teste.local', 'senha-boa-35w')) = 'limite_testes',
    'DS-297: testes ativos por revenda');
  update public.nx_orgs set limites = '{"testes_ativos":5}' where id = org_r;
  n := (select count(*) from public.nx_login_falhas where chave = 'cadastro:global');
  j := public.nx_teste_criar('rev35-' || sfx, 'Outra 35', 'loja', 'Outro', 'teste35-' || sfx || '@teste.local', 'senha-boa-35w');
  perform pg_temp.ok((j ->> 'ok')::boolean and j ->> 'token' is null and (select count(*) from public.nx_clientes where org_id = org_r) = 1, 'DS-128: e-mail já usado → mesma resposta, sem token e sem empresa');
  -- plano 2000d · REV-M4: tentativa com e-mail repetido não conta no teto global de cadastros (só cadastro criado conta)
  perform public.nx_criar_conta('teste35-' || sfx || '@teste.local', 'senha-boa-35w', 'Repetido');
  perform pg_temp.ok((select count(*) from public.nx_login_falhas where chave = 'cadastro:global') = n, 'REV-M4: e-mail repetido não conta no teto global');
  j := public.nx_teste_criar('rev35-' || sfx, 'Mais Uma 35', 'loja', 'Mais Um', 'maisum35-' || sfx || '@teste.local', 'senha-boa-35w');
  perform pg_temp.ok(j ->> 'token' is not null and (select count(*) from public.nx_login_falhas where chave = 'cadastro:global') = n + 1, 'REV-M4: teste criado conta no teto global');
  perform public.nx_criar_conta('novo35-' || sfx || '@teste.local', 'senha-boa-35w', 'Novo 35');
  perform pg_temp.ok((select count(*) from public.nx_login_falhas where chave = 'cadastro:global') = n + 2, 'REV-M4: conta criada conta no teto global');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_teste_criar(%L,%L,%L,%L,%L,%L)', 'rev35-' || sfx, 'Outra 35', 'loja', 'Outro', 'x' || sfx || '@teste.local', '12345678')) = 'senha_fraca', 'DS-130: o teste também recusa senha comum');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_teste_criar(%L,%L,%L,%L,%L,%L)', (select slug from public.nx_orgs where tipo = 'plataforma' limit 1), 'X 35', 'loja', 'Fulano', 'y' || sfx || '@teste.local', 'senha-boa-35v')) like 'teste_fechado%'
                     or (select coalesce(marca ->> 'teste_aberto', '') from public.nx_orgs where tipo = 'plataforma' limit 1) = 'true', 'DS-274: org sem teste_aberto recusa');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_teste_prorrogar(%L, %L, 7)', v_tok, cTe)) = 'sem_permissao', 'DS-277: o próprio cliente não prorroga');
  j := public.nx_teste_prorrogar(t_sup, cTe, 7);
  perform pg_temp.ok((j ->> 'teste_ate')::date = public.nx_hoje_sp() + 17, 'DS-277: prorrogado 7 dias');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_teste_prorrogar(%L, %L, 7)', t_sup, cTe)) = 'dados_invalidos|ja_prorrogado', 'DS-277: uma vez só');
  update public.nx_clientes set teste_ate = public.nx_hoje_sp() + 2, teste_avisos = '{}' where id = cTe;
  perform public.nx_teste_avisar();
  n := (select count(*) from public.nx_notificacoes x where x.cliente_id = cTe and x.titulo like 'O teste termina%');
  perform public.nx_teste_avisar();
  perform pg_temp.ok(n >= 1 and (select count(*) from public.nx_notificacoes x where x.cliente_id = cTe and x.titulo like 'O teste termina%') = n
                     and (select teste_avisos ? 'd3' from public.nx_clientes where id = cTe), 'DS-276: o marco de 3 dias sai uma vez (mesmo a 2 dias do fim)');
  update public.nx_clientes set teste_ate = public.nx_hoje_sp() where id = cTe;
  perform public.nx_teste_avisar();
  perform pg_temp.ok(exists (select 1 from public.nx_notificacoes x where x.cliente_id = cTe and x.titulo = 'O teste termina hoje'), 'DS-276: o último dia também');

  -- ---------------------------------------------------------- DS-009 / DS-346 preferências · DS-080 metas · DS-069 LGPD
  j := public.nx_conta_pref_salvar(t_at, cA, 'conversas', '{"som":false}'::jsonb);
  perform pg_temp.ok((public.nx_conta_pref_ler(t_at, cA) -> 'conversas' -> 'valor' ->> 'som') = 'false', 'DS-009: preferência gravada e lida');
  perform pg_temp.ok(public.nx_conta_pref_ler(t_at2, cA)::jsonb = '{}'::jsonb, 'DS-009: outra pessoa não vê');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_conta_pref_salvar(%L, %L, %L, %L, %L)', t_at, cA, 'conversas', '{"som":true}', now() - interval '1 day')) like 'versao_antiga|%', 'DS-009: versão velha recusada');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_conta_pref_salvar(%L, %L, %L, %L)', t_at, cA, 'qualquer', '{}')) = 'dados_invalidos|chave', 'DS-009: só as chaves conhecidas');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_conta_pref_salvar(%L, %L, %L, %L)', t_at, cA, 'crm_colunas', jsonb_build_object('x', repeat('a', 17000)))) = 'dados_invalidos|valor', 'DS-151: teto de 16 KB');
  delete from public.nx_acessos where conta_id = k_at and cliente_id = cA;
  perform pg_temp.ok(not exists (select 1 from public.nx_conta_pref where conta_id = k_at and cliente_id = cA), 'DS-346: sem acesso, sem preferências');
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas) values (k_at, cA, 'atendente', true);
  j := public.nx_meta_salvar(t_adm, cA, jsonb_build_object('mes', to_char(public.nx_hoje_sp(), 'YYYY-MM'), 'valor', 15000, 'conta_id', k_at));
  perform pg_temp.ok((j ->> 'valor')::numeric = 15000 and exists (select 1 from public.nx_metas where cliente_id = cA and conta_id = k_at), 'DS-080: meta por pessoa');
  j := public.nx_meta_salvar(t_adm, cA, jsonb_build_object('mes', to_char(public.nx_hoje_sp(), 'YYYY-MM'), 'valor', 18000, 'conta_id', k_at));
  perform pg_temp.ok((select count(*) from public.nx_metas where cliente_id = cA and conta_id = k_at) = 1, 'DS-080: a mesma meta é atualizada');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_meta_salvar(%L, %L, %L)', t_at, cA, '{"mes":"2026-10","valor":1}')) = 'sem_permissao', 'DS-080: atendente não define meta');
  perform public.nx_titular_exportar(t_adm, cA, ct);
  j := public.nx_contato_excluir(t_adm, cA, ct, 'excluir', 'titular');
  perform pg_temp.ok((j ->> 'ok')::boolean and j ->> 'protocolo' is not null, 'DS-069: exclusão a pedido do titular devolve protocolo');
  perform pg_temp.ok((select count(*) from public.nx_lgpd_pedidos where cliente_id = cA) = 2 and json_array_length(public.nx_lgpd_pedidos_listar(t_adm, cA)) = 2, 'DS-069: acesso e exclusão registrados');
  perform pg_temp.ok(not exists (select 1 from public.nx_lgpd_pedidos p where p.cliente_id = cA and p.contato_hash like '%5512990035001%'), 'DS-069: sem o telefone no registro');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_lgpd_pedidos_listar(%L, %L)', t_at2, cA)) = 'sem_permissao', 'DS-069: só admin lê');

  -- ---------------------------------------------------------- cfg nova
  perform pg_temp.ok(pg_temp.erro($$select public.nx_cfg_validar('{"automacoes":{"teto_dia":9999}}'::jsonb)$$) = 'dados_invalidos|automacoes', 'cfg: teto_dia até 5000');
  perform pg_temp.ok(pg_temp.erro($$select public.nx_cfg_validar('{"relDias":[1,2,7]}'::jsonb)$$) = 'dados_invalidos|relDias', 'DA-187: dias 0–6');
  perform pg_temp.ok(pg_temp.erro($$select public.nx_cfg_validar('{"automacoes":{"teto_dia":100,"intervalo_contato_h":2.5},"relDias":[1,3],"silencio":{"de":22,"ate":7},"horaRelatorio":"08:30","radar":{"toleranciaR1":30}}'::jsonb)$$) = 'ok', 'cfg: chaves novas válidas');

  -- ---------------------------------------------------------- DS-140 / DS-338 / DS-339 permissões e RLS
  perform pg_temp.ok(not exists (select 1 from unnest(array['public.nx_segredo_ler(uuid)', 'public.nx_canal_credencial(uuid, uuid)', 'public.nx_cv_saida(uuid, uuid, bigint, jsonb)',
                                                      'public.nx_fila_pegar(integer, bigint[])', 'public.nx_auto_envio_guarda(public.nx_automacoes, bigint, boolean)',
                                                      'public.nx_conta_disponivel(uuid, uuid, boolean)', 'public.nx_tg_contatos_limite()']) f
                              where to_regprocedure(f) is not null and has_function_privilege('anon', to_regprocedure(f), 'execute')), 'DS-140: segredos e internas fora do anon');
  perform pg_temp.ok(not exists (select 1 from pg_class c join pg_namespace s on s.oid = c.relnamespace
                                  where s.nspname = 'public' and c.relname in ('nx_conta_pref', 'nx_lgpd_pedidos', 'nx_metas')
                                    and (not c.relrowsecurity or has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))),
                     'DS-338/339: tabelas novas com RLS e sem grant');
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_cv_pegar_proxima(text, uuid, jsonb)', 'execute')
                     and not has_function_privilege('authenticated', 'public.nx_cv_pegar_proxima(text, uuid, jsonb)', 'execute'), 'RPC nova: anon sim, authenticated não');

  raise exception 'OK_35_PLANO2000D — concorrência, segurança, limites, teste, IA, envio em massa, preferências, metas e LGPD';
end $t$;
rollback;
