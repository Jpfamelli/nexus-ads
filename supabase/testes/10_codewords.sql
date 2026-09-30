-- ============================================================
-- ÓRBITA — supabase/testes/10_codewords.sql · canal CodeWords (modelo "aparelho")
-- Smoke do arquivo 20260929a_codewords.sql: cadastro admin-only (chave cwk- no Vault,
-- nunca devolvida; URL secreta com hash; número E.164; numero_em_uso), URL → canal e
-- limite de taxa, situação do aparelho, entrada + decisão da IA (IA 24h, pausa, limite
-- anti-loop, fora do horário pulado), contexto, saída da IA/celular (duplicada, eco,
-- gêmea, pausa automática), recibo antes do eco (monotônico), humano/nota/etapa/origem,
-- sincronização (idempotente, gêmeas, 90 s de espera, pausa por celular), automação de
-- texto sem janela de 24 h, isolamento entre clientes e permissões.
-- Roda em begin … rollback. O bloco principal SEMPRE termina em exceção:
--   'OK_10_CODEWORDS …' = todos os casos passaram · 'FALHOU: <caso>' = falha
-- Chaves e números são sintéticos; nada chama o CodeWords.
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
  sfx text := substr(md5(random()::text), 1, 8);
  cA uuid; cB uuid; dep_rec uuid; dep_com uuid;
  k_adm uuid; k_at uuid; k_at2 uuid; k_admb uuid;
  kA uuid; kB uuid; kM uuid; segA text; segVelho text;
  j json; jb jsonb; r json; d json;
  ct bigint; cv bigint; ctB bigint; cvB bigint; ctAd bigint; neg bigint; n int; n2 int; v_id bigint;
  tel text := '5512988880001'; telB text := '5512977770002'; telAd text := '5512966660003';
  aut uuid; a public.nx_automacoes; v_txt text;
  chave_teste text := 'cwk-teste-sintetica-' || md5(random()::text);
begin
  -- ---------------------------------------------------------- fixtures
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-cw-a-' || sfx, 'Teste CW A', 'odonto') returning id into cA;
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-cw-b-' || sfx, 'Teste CW B', 'odonto') returning id into cB;
  select id into dep_rec from public.nx_departamentos where cliente_id = cA and padrao;
  select id into dep_com from public.nx_departamentos where cliente_id = cA and not padrao order by ordem limit 1;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-cw-adm-' || sfx || '@teste.local', 'Ana Admin', 'x', 'clinica', true) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-cw-at-' || sfx || '@teste.local', 'Beto Atende', 'x', 'clinica', true) returning id into k_at;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-cw-at2-' || sfx || '@teste.local', 'Caio Comercial', 'x', 'clinica', true) returning id into k_at2;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-cw-admb-' || sfx || '@teste.local', 'Dora Admin B', 'x', 'clinica', true) returning id into k_admb;
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas, departamentos, recebe_conversas) values
    (k_adm, cA, 'admin', true, '{}', false), (k_at, cA, 'atendente', false, array[dep_rec], false),
    (k_at2, cA, 'atendente', false, array[dep_com], false), (k_admb, cB, 'admin', true, '{}', false);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash('tok-cw-adm-' || sfx), k_adm, now() + interval '1 hour'), (public.nx_hash('tok-cw-at-' || sfx), k_at, now() + interval '1 hour'),
    (public.nx_hash('tok-cw-at2-' || sfx), k_at2, now() + interval '1 hour'), (public.nx_hash('tok-cw-admb-' || sfx), k_admb, now() + interval '1 hour');

  -- ---------------------------------------------------------- 1. cadastro (admin-only, Vault, URL secreta)
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_canal_salvar(%L,%L,%L)', 'tok-cw-at-' || sfx, cA,
    jsonb_build_object('nome', 'X', 'numero', '+5512991230001', 'codewords_api_key', chave_teste))) = 'sem_permissao', 'atendente não configura canal CodeWords');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_canal_salvar(%L,%L,%L)', 'tok-cw-adm-' || sfx, cA,
    jsonb_build_object('nome', 'X', 'numero', '+5512991230001'))) = 'dados_invalidos|codewords_api_key', 'canal novo sem chave');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_canal_salvar(%L,%L,%L)', 'tok-cw-adm-' || sfx, cA,
    jsonb_build_object('nome', 'X', 'numero', '+5512991230001', 'codewords_api_key', 'cwotk-uso-unico-0000000000000'))) = 'dados_invalidos|codewords_api_key', 'chave cwotk- (uso único) recusada');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_canal_salvar(%L,%L,%L)', 'tok-cw-adm-' || sfx, cA,
    jsonb_build_object('nome', 'X', 'numero', 'abc', 'codewords_api_key', chave_teste))) = 'dados_invalidos|numero', 'número inválido');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_canal_salvar(%L,%L,%L)', 'tok-cw-adm-' || sfx, cA,
    jsonb_build_object('nome', 'X', 'numero', '+5512991230001', 'codewords_api_key', chave_teste, 'rota', 'outra'))) = 'dados_invalidos|rota', 'rota inválida');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_canal_salvar(%L,%L,%L)', 'tok-cw-adm-' || sfx, cA,
    jsonb_build_object('nome', 'X', 'numero', '+5512991230001', 'codewords_api_key', chave_teste, 'ia_volta_horas', 999))) = 'dados_invalidos|ia_volta_horas', 'volta da IA fora de 0..168');

  j := public.nx_codewords_canal_salvar('tok-cw-adm-' || sfx, cA,
    jsonb_build_object('nome', 'WhatsApp da clínica', 'numero', '(12) 99123-0001', 'codewords_api_key', chave_teste));
  kA := (j -> 'canal' ->> 'id')::uuid;
  perform pg_temp.ok(j -> 'canal' ->> 'provedor' = 'codewords' and j -> 'canal' -> 'codewords' ->> 'numero' = '+5512991230001'
    and j -> 'canal' -> 'codewords' ->> 'rota' = 'fluxo' and (j -> 'canal' -> 'codewords' ->> 'ia_ligada')::boolean
    and (j -> 'canal' -> 'codewords' ->> 'ia_volta_horas')::int = 6 and j -> 'canal' ->> 'status' = 'pendente',
    'canal criado: E.164 com 55, rota fluxo, IA 24h ligada, volta em 6 h, pendente');
  perform pg_temp.ok(position(chave_teste in j::text) = 0 and position('cwk-' in j::text) = 0, 'a chave cwk- nunca volta');
  perform pg_temp.ok(public.nx_segredo_ler((select codewords_api_segredo from public.nx_canais where id = kA)) = chave_teste, 'chave no Vault');
  perform pg_temp.ok((j ->> 'webhook_url') ~ '/nx-codewords\?ch=[0-9a-f]{64}$' and j -> 'webhook' ->> 'modo' = 'codewords', 'URL secreta emitida');
  segA := substring(j ->> 'webhook_url' from 'ch=([0-9a-f]{64})$');
  perform pg_temp.ok((select codewords_hook_hash from public.nx_canais where id = kA) = encode(extensions.digest(segA, 'sha256'), 'hex')
    and position(segA in coalesce((select codewords_hook_hash from public.nx_canais where id = kA), '')) = 0, 'banco guarda só o hash do segredo');
  perform pg_temp.ok((public.nx_codewords_canal(segA) ->> 'canal_id')::uuid = kA, 'segredo da URL → canal');
  perform pg_temp.ok(public.nx_codewords_canal(repeat('0', 64)) is null and public.nx_codewords_canal('curto') is null, 'segredo errado → nada');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_canal_salvar(%L,%L,%L)', 'tok-cw-admb-' || sfx, cB,
    jsonb_build_object('nome', 'B', 'numero', '+5512991230001', 'codewords_api_key', chave_teste))) = 'numero_em_uso|numero', 'mesmo aparelho em outro cliente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_canal_salvar(%L,%L,%L)', 'tok-cw-admb-' || sfx, cB,
    jsonb_build_object('id', kA, 'nome', 'roubado'))) = 'canal_nao_encontrado', 'admin de B não edita canal de A');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_canal_salvar(%L,%L,%L)', 'tok-cw-adm-' || sfx, cA,
    jsonb_build_object('id', kA, 'nome', 'Meta?', 'phone_number_id', '990000009901', 'waba_id', '990000009902'))) = 'canal_nao_encontrado',
    'nx_canal_salvar (Meta) não mexe em canal CodeWords');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_canal_salvar(%L,%L,%L)', 'tok-cw-adm-' || sfx, cA,
    jsonb_build_object('id', kA, 'rotacionar_url', 'talvez'))) = 'dados_invalidos|rotacionar_url', 'rotação inválida');
  segVelho := segA;
  j := public.nx_codewords_canal_salvar('tok-cw-adm-' || sfx, cA, jsonb_build_object('id', kA, 'rotacionar_url', true, 'codewords_service_id', 'svc_ia_teste'));
  segA := substring(j ->> 'webhook_url' from 'ch=([0-9a-f]{64})$');
  perform pg_temp.ok(segA <> segVelho and public.nx_codewords_canal(segVelho) is null and (public.nx_codewords_canal(segA) ->> 'canal_id')::uuid = kA
    and (j ->> 'url_nova')::boolean and j -> 'canal' -> 'codewords' ->> 'service_id' = 'svc_ia_teste', 'rotação troca a URL; a antiga para de valer');
  j := public.nx_canais_listar('tok-cw-adm-' || sfx, cA);
  perform pg_temp.ok(position('cwk-' in j::text) = 0 and j::text like '%"modo": "codewords"%', 'nx_canais_listar: bloco CodeWords sem chave');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_canais_listar(%L,%L)', 'tok-cw-at-' || sfx, cA)) = 'sem_permissao', 'atendente não lista canais (URL secreta)');

  -- limite de taxa: 240 por minuto e canal
  for n in 1..241 loop r := public.nx_codewords_canal(segA); end loop;
  perform pg_temp.ok((r ->> 'excedido')::boolean, 'mais de 240 chamadas no minuto → excedido');
  delete from public.nx_codewords_taxa where canal_id = kA;

  -- ---------------------------------------------------------- 2. situação do aparelho
  j := public.nx_codewords_situacao(kA, cA, jsonb_build_object('conectado', true, 'numero_conferido', true, 'phone_id', 'dev-teste-1',
         'estado', 'logged_in', 'inscricao', 'svc_ia_teste/webhook', 'erro', null));
  perform pg_temp.ok(j ->> 'status' = 'ativo' and (j ->> 'tem_token')::boolean and j -> 'codewords' ->> 'phone_id' = 'dev-teste-1', 'conectado + número conferido → ativo');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_situacao(%L,%L,%L)', kA, cB, '{"conectado":false}')) = 'canal_nao_encontrado', 'situação com cliente errado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_situacao(%L,%L,%L)', kA, cA, '{"phone_id":"com espaço"}')) = 'dados_invalidos|phone_id', 'phone_id inválido');
  perform public.nx_codewords_situacao(kA, cA, '{"sync_erro":"proxy caiu"}');
  perform pg_temp.ok((select codewords_sync_erro is null and codewords_sync_falhas = 1 from public.nx_canais where id = kA), 'uma falha de sincronização não acende o aviso');
  perform public.nx_codewords_situacao(kA, cA, '{"sync_erro":"proxy caiu"}');
  perform pg_temp.ok((select codewords_sync_erro = 'proxy caiu' from public.nx_canais where id = kA), 'duas falhas seguidas acendem o aviso');
  perform public.nx_codewords_situacao(kA, cA, '{"sync_ok":true}');
  perform pg_temp.ok((select codewords_sync_erro is null and codewords_sync_falhas = 0 from public.nx_canais where id = kA), 'sincronização boa apaga o aviso');
  perform public.nx_codewords_forma(kA, '["event","payload.from","payload.body","não vale!"]'::jsonb);
  perform pg_temp.ok((select codewords_forma = '["event","payload.from","payload.body"]'::jsonb from public.nx_canais where id = kA), 'forma guarda só nomes de campos válidos');

  -- canal CodeWords do cliente B (isolamento)
  j := public.nx_codewords_canal_salvar('tok-cw-admb-' || sfx, cB, jsonb_build_object('nome', 'B', 'numero', '+5512991230002', 'codewords_api_key', chave_teste));
  kB := (j -> 'canal' ->> 'id')::uuid;
  r := public.nx_wa_entrada(kB, jsonb_build_object('wamid', 'cw:' || kB::text || ':B-1', 'wa_id', telB, 'nome', 'Bia B', 'tipo', 'texto', 'corpo', 'oi B'));
  cvB := (r ->> 'conversa_id')::bigint; ctB := (r ->> 'contato_id')::bigint;

  -- ---------------------------------------------------------- 3. IA: configuração, entrada e decisão
  j := public.nx_ia_config_salvar('tok-cw-adm-' || sfx, cA, '{"sobre":"Clínica de testes","assistente_nome":"Sofia","endereco":"Rua Teste, 10","boas_vindas":"Olá! Sou a Sofia."}');
  perform pg_temp.ok(j ->> 'assistente_nome' = 'Sofia' and j ->> 'endereco' = 'Rua Teste, 10' and j ->> 'sobre' = 'Clínica de testes', 'IA: nome da assistente, endereço e boas-vindas');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ia_config_salvar(%L,%L,%L)', 'tok-cw-adm-' || sfx, cA,
    jsonb_build_object('assistente_nome', repeat('x', 41)))) = 'dados_invalidos|assistente_nome', 'nome da assistente até 40');
  perform pg_temp.ok((public.nx_cv_base('tok-cw-adm-' || sfx, cA) -> 'config' -> 'ia' ->> 'assistente_nome') = 'Sofia', 'nx_cv_base.config.ia traz os campos novos');
  perform pg_temp.ok(exists (select 1 from json_array_elements(public.nx_cv_base('tok-cw-at-' || sfx, cA) -> 'canais') x
    where x ->> 'provedor' = 'codewords' and (x ->> 'tem_token')::boolean and (x ->> 'ia_ligada')::boolean), 'nx_cv_base.canais: provedor e IA');

  r := public.nx_wa_entrada(kA, jsonb_build_object('wamid', 'cw:' || kA::text || ':MSG1', 'wa_id', tel, 'nome', 'Paula Teste',
         'tipo', 'texto', 'corpo', 'Oi, quero marcar uma avaliação'));
  cv := (r ->> 'conversa_id')::bigint; ct := (r ->> 'contato_id')::bigint;
  perform pg_temp.ok((r ->> 'nova_conversa')::boolean, 'entrada cria a conversa');
  perform pg_temp.ok(public.nx_lead_webhook(cA, tel, array[tel], 'Paula Teste', null, (now() at time zone 'America/Sao_Paulo')::date, 30) = 'criado', 'lead criado');
  select id into neg from public.nx_leads where cliente_id = cA and contato_id = ct and status = 'aberto';
  perform pg_temp.ok(neg is not null, 'negócio ligado ao contato');
  d := public.nx_codewords_decidir(kA, cv, (r ->> 'fila_id')::bigint);
  perform pg_temp.ok((d ->> 'responder')::boolean, 'IA 24h responde a entrada');
  perform pg_temp.ok((d -> 'dados' -> 'contato' ->> 'primeira_vez')::boolean and d -> 'dados' -> 'contato' ->> 'nome' = 'Paula Teste'
    and json_array_length(d -> 'dados' -> 'historico') = 1 and d -> 'dados' -> 'historico' -> 0 ->> 'dir' = 'in'
    and d -> 'dados' -> 'negocio' ->> 'marco' = 'nova' and d -> 'dados' -> 'empresa' -> 'ia' ->> 'assistente_nome' = 'Sofia',
    'contexto: contato, primeira vez, histórico, etapa e IA');
  if (r ->> 'fila_id') is not null then
    perform pg_temp.ok((select status from public.nx_envios_fila where id = (r ->> 'fila_id')::bigint) = 'pulado', 'fora do horário não sai quando a IA responde');
  end if;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_decidir(%L,%L)', kA, cvB)) = 'conversa_nao_encontrada', 'decidir com conversa de outro cliente');

  -- ---------------------------------------------------------- 4. saída da IA, duplicada e recibo antes do eco
  r := public.nx_codewords_saida(kA, jsonb_build_object('telefone', tel, 'texto', 'Olá Paula! Sou a Sofia.', 'id', 'IA-1', 'autor', 'ia'));
  perform pg_temp.ok((r ->> 'registrada')::boolean and r ->> 'motivo' = 'saida', 'saída da IA gravada');
  perform pg_temp.ok((select origem = 'ia' and direcao = 'out' and status = 'enviada' from public.nx_mensagens where wamid = 'cw:' || kA::text || ':IA-1'), 'mensagem da IA com origem ia');
  perform pg_temp.ok(not (select aguardando from public.nx_conversas where id = cv), 'resposta da IA tira de aguardando');
  r := public.nx_codewords_saida(kA, jsonb_build_object('telefone', tel, 'texto', 'Olá Paula! Sou a Sofia.', 'id', 'IA-1', 'autor', 'ia'));
  perform pg_temp.ok(not (r ->> 'registrada')::boolean and r ->> 'motivo' = 'duplicada', 'repetição da IA → duplicada');
  perform pg_temp.ok((public.nx_codewords_status(kA, 'IA-2', 'delivered') ->> 'pendente')::boolean, 'recibo antes do eco fica pendente');
  perform public.nx_codewords_status(kA, 'IA-2', 'sent');
  perform pg_temp.ok((select status from public.nx_codewords_status_pendentes where canal_id = kA and provider_id = 'IA-2') = 'delivered', 'pendente não regride');
  perform public.nx_codewords_status(kB, 'IA-2', 'read');
  perform public.nx_codewords_saida(kA, jsonb_build_object('telefone', tel, 'texto', 'Posso te ajudar com horários.', 'id', 'IA-2', 'autor', 'ia'));
  perform pg_temp.ok((select status from public.nx_mensagens where wamid = 'cw:' || kA::text || ':IA-2') = 'entregue', 'eco aplica o recibo pendente do MESMO canal');
  perform pg_temp.ok(exists (select 1 from public.nx_codewords_status_pendentes where canal_id = kB and provider_id = 'IA-2'), 'recibo homônimo de outro canal fica isolado');
  perform public.nx_codewords_status(kA, 'IA-2', 'failed', 'falha atrasada');
  perform pg_temp.ok((select status from public.nx_mensagens where wamid = 'cw:' || kA::text || ':IA-2') = 'entregue', 'falha não desfaz entregue');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_status(%L,%L,%L)', kA, 'id com espaço', 'read')) = 'dados_invalidos', 'id de recibo inválido');

  -- ---------------------------------------------------------- 5. pausa: celular, painel, manual e volta
  r := public.nx_codewords_saida(kA, jsonb_build_object('telefone', tel, 'texto', 'Oi Paula, aqui é a Ana.', 'id', 'CEL-1', 'autor', 'celular'));
  perform pg_temp.ok((r ->> 'registrada')::boolean, 'saída do celular gravada');
  perform pg_temp.ok((select ia_pausada_por = 'celular' and ia_pausada_ate between now() + interval '5 hours 59 minutes' and now() + interval '6 hours 1 minute'
    from public.nx_conversas where id = cv), 'mensagem do celular pausa a IA por 6 h');
  perform pg_temp.ok(exists (select 1 from public.nx_mensagens where conversa_id = cv and tipo = 'sistema' and corpo like 'IA pausada: alguém respondeu pelo celular%'), 'aviso da pausa no chat');
  perform pg_temp.ok((select origem is null and enviado_por is null from public.nx_mensagens where wamid = 'cw:' || kA::text || ':CEL-1'), 'mensagem do celular sem origem de sistema');
  perform pg_temp.ok(public.nx_codewords_decidir(kA, cv) ->> 'motivo' = 'pausada', 'IA pausada não responde');
  j := public.nx_cv_ia_estado('tok-cw-at-' || sfx, cA, cv);
  perform pg_temp.ok((j ->> 'pausada')::boolean and j ->> 'pausada_por' = 'celular' and (j ->> 'disponivel')::boolean and not (j ->> 'respondendo')::boolean, 'estado da IA para o atendente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ia_estado(%L,%L,%L)', 'tok-cw-at2-' || sfx, cA, cv)) = 'conversa_nao_encontrada', 'atendente de outro departamento não vê');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ia_estado(%L,%L,%L)', 'tok-cw-adm-' || sfx, cA, cvB)) = 'conversa_nao_encontrada', 'conversa de outro cliente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ia_devolver(%L,%L,%L)', 'tok-cw-admb-' || sfx, cB, cv)) = 'conversa_nao_encontrada', 'admin de B não devolve conversa de A');
  j := public.nx_cv_ia_devolver('tok-cw-at-' || sfx, cA, cv);
  perform pg_temp.ok(not (j ->> 'pausada')::boolean and (j ->> 'respondendo')::boolean, 'devolver para a IA');
  perform pg_temp.ok(exists (select 1 from public.nx_mensagens where conversa_id = cv and tipo = 'sistema' and corpo like 'Beto devolveu a conversa para a IA'), 'aviso de devolução');
  perform pg_temp.ok((public.nx_codewords_decidir(kA, cv) ->> 'responder')::boolean, 'devolvida → IA responde');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ia_pausar(%L,%L,%L,%L)', 'tok-cw-at-' || sfx, cA, cv, 999)) = 'dados_invalidos|horas', 'horas fora de 0..168');
  j := public.nx_cv_ia_pausar('tok-cw-at-' || sfx, cA, cv, 0);
  perform pg_temp.ok((j ->> 'so_manual')::boolean and j ->> 'pausada_por' = 'manual' and j ->> 'pausada_por_nome' = 'Beto Atende', 'assumir com 0 h: só volta manual');
  perform public.nx_cv_ia_devolver('tok-cw-adm-' || sfx, cA, cv);
  j := public.nx_cv_ia_pausa_auto(cA, cv, 'painel', k_adm);
  perform pg_temp.ok((j ->> 'pausada')::boolean and j ->> 'pausada_por' = 'painel', 'resposta pelo painel pausa a IA');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_ia_pausa_auto(%L,%L,%L,%L)', cB, cv, 'painel', k_adm)) = 'conversa_nao_encontrada', 'pausa automática respeita o cliente');
  update public.nx_conversas set ia_pausada_ate = now() - interval '1 minute' where id = cv;
  perform pg_temp.ok((public.nx_codewords_decidir(kA, cv) ->> 'responder')::boolean, 'pausa vencida → IA volta sozinha');

  -- ---------------------------------------------------------- 6. limite anti-loop, IA 24h desligada e rota direta
  for n in 1..6 loop
    perform public.nx_codewords_saida(kA, jsonb_build_object('telefone', tel, 'texto', 'resposta repetida ' || n, 'id', 'LOOP-' || n, 'autor', 'ia'));
  end loop;
  select count(*) into n from public.nx_notificacoes where cliente_id = cA and tipo = 'sistema';
  d := public.nx_codewords_decidir(kA, cv);
  perform pg_temp.ok(d ->> 'motivo' = 'limite', '8 respostas da IA em 10 min → limite');
  select count(*) into n2 from public.nx_notificacoes where cliente_id = cA and tipo = 'sistema';
  perform pg_temp.ok(n2 > n and (select count(*) from public.nx_mensagens where conversa_id = cv and corpo like 'IA segurada%') = 1, 'equipe avisada uma vez');
  perform public.nx_codewords_decidir(kA, cv);
  perform pg_temp.ok((select count(*) from public.nx_mensagens where conversa_id = cv and corpo like 'IA segurada%') = 1, 'sem aviso repetido na mesma janela');
  update public.nx_mensagens set criado_em = now() - interval '11 minutes' where conversa_id = cv and origem = 'ia';
  perform pg_temp.ok((public.nx_codewords_decidir(kA, cv) ->> 'responder')::boolean, 'limite passa depois de 10 min');
  perform public.nx_codewords_canal_salvar('tok-cw-adm-' || sfx, cA, jsonb_build_object('id', kA, 'ia_ligada', false));
  perform pg_temp.ok(public.nx_codewords_decidir(kA, cv) ->> 'motivo' = 'ia_desligada', 'IA 24h desligada');
  perform public.nx_codewords_canal_salvar('tok-cw-adm-' || sfx, cA, jsonb_build_object('id', kA, 'ia_ligada', true, 'rota', 'direta'));
  perform pg_temp.ok(public.nx_codewords_decidir(kA, cv) ->> 'motivo' = 'ia_desligada', 'rota direta não tem IA');
  r := public.nx_codewords_saida(kA, jsonb_build_object('telefone', tel, 'texto', 'digitado no aparelho', 'id', 'DIR-1'));
  perform pg_temp.ok((select ia_pausada_por from public.nx_conversas where id = cv) = 'celular', 'rota direta: saída sem autor = celular');
  perform public.nx_codewords_canal_salvar('tok-cw-adm-' || sfx, cA, jsonb_build_object('id', kA, 'rota', 'fluxo'));
  perform public.nx_cv_ia_devolver('tok-cw-adm-' || sfx, cA, cv);

  -- ---------------------------------------------------------- 7. eco do painel e gêmeas
  perform public.nx_cv_saida(k_adm, cA, cv, jsonb_build_object('tipo', 'texto', 'corpo', 'Mensagem do painel',
    'wamid', 'cw:' || kA::text || ':PAINEL-1', 'status', 'enviada', 'origem', 'painel'));
  r := public.nx_codewords_saida(kA, jsonb_build_object('telefone', tel, 'texto', 'Mensagem do painel', 'id', 'PAINEL-1', 'autor', 'celular'));
  perform pg_temp.ok(r ->> 'motivo' = 'eco' and not (r ->> 'registrada')::boolean, 'eco do painel não duplica');
  perform pg_temp.ok(not coalesce((select ia_pausada_ate > now() from public.nx_conversas where id = cv), false), 'eco do painel não pausa de novo');
  perform public.nx_cv_saida(k_adm, cA, cv, jsonb_build_object('tipo', 'texto', 'corpo', 'Confirmação pendente',
    'wamid', 'cw:' || kA::text || ':orbita-p-0001', 'status', 'pendente', 'erro', 'Confirmação pendente'));
  r := public.nx_codewords_saida(kA, jsonb_build_object('telefone', tel, 'texto', 'Confirmação pendente', 'id', 'REAL-9'));
  perform pg_temp.ok(r ->> 'motivo' = 'eco' and (select status = 'enviada' and erro is null from public.nx_mensagens where wamid = 'cw:' || kA::text || ':REAL-9'),
    'gêmea do painel adotada: id real e enviada');
  perform pg_temp.ok(not exists (select 1 from public.nx_mensagens where wamid = 'cw:' || kA::text || ':orbita-p-0001'), 'id provisório substituído');
  r := public.nx_codewords_saida(kA, jsonb_build_object('telefone', tel, 'texto', 'Resposta da IA sem id', 'id', 'orbita-h-0001', 'autor', 'ia'));
  perform pg_temp.ok((r ->> 'registrada')::boolean, 'IA sem message_id grava com id estável');
  r := public.nx_codewords_saida(kA, jsonb_build_object('telefone', telB, 'texto', 'para o B', 'id', 'X-B', 'autor', 'celular'));
  perform pg_temp.ok(r ->> 'ignorado' = 'sem_conversa' and not exists (select 1 from public.nx_mensagens where wamid = 'cw:' || kA::text || ':X-B')
    and (select count(*) from public.nx_mensagens where conversa_id = cvB) = 1, 'canal de A não grava nada na conversa de B');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_saida(%L,%L)', kA, '{"telefone":"123","texto":"x","id":"a"}')) = 'dados_invalidos|telefone', 'telefone curto');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_saida(%L,%L)', kA, jsonb_build_object('telefone', tel, 'texto', '', 'id', 'VAZIO'))) = 'dados_invalidos|texto', 'texto vazio');

  -- ---------------------------------------------------------- 8. sincronização (aparelho → banco)
  perform public.nx_cv_ia_devolver('tok-cw-adm-' || sfx, cA, cv);
  j := public.nx_codewords_sync_gravar(kA, cv, jsonb_build_array(
    jsonb_build_object('id', 'SYNC-IN-1', 'texto', 'mensagem que o fluxo não mandou', 'de_mim', false, 'em', to_char((now() - interval '3 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    jsonb_build_object('id', 'SYNC-IMG-1', 'tipo', 'imagem', 'midia_nome', 'foto.jpg', 'de_mim', false, 'em', to_char((now() - interval '3 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    jsonb_build_object('id', 'SYNC-OUT-1', 'texto', 'respondi pelo celular', 'de_mim', true, 'em', to_char((now() - interval '2 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    jsonb_build_object('id', 'SYNC-OUT-2', 'texto', 'acabei de mandar', 'de_mim', true, 'em', to_char((now() - interval '10 seconds') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    jsonb_build_object('id', 'REAL-10', 'texto', 'Resposta da IA sem id', 'de_mim', true, 'em', to_char((now() - interval '1 minute') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    jsonb_build_object('id', 'MSG1', 'texto', 'Oi, quero marcar uma avaliação', 'de_mim', false, 'em', to_char((now() - interval '20 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    jsonb_build_object('id', 'id inválido', 'texto', 'x', 'de_mim', false, 'em', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    jsonb_build_object('id', 'SEM-DATA', 'texto', 'x', 'de_mim', false)));
  perform pg_temp.ok((j ->> 'entradas')::int = 2 and (j ->> 'saidas')::int = 1 and (j ->> 'recentes')::int = 1 and (j ->> 'adotadas')::int = 1
    and (j ->> 'ja_tinha')::int = 1 and (j ->> 'ignoradas')::int = 2, 'sincronização: entradas, saída do celular, recente, gêmea, repetida e inválidas → ' || j::text);
  perform pg_temp.ok((select tipo = 'imagem' and midia ->> 'estado' = 'indisponivel' and midia ->> 'nome' = 'foto.jpg' from public.nx_mensagens where wamid = 'cw:' || kA::text || ':SYNC-IMG-1'),
    'mídia do aparelho vira mensagem de imagem (arquivo indisponível)');
  perform pg_temp.ok((select ia_pausada_por = 'celular' from public.nx_conversas where id = cv), 'saída feita no celular (vista na sincronização) pausa a IA');
  perform pg_temp.ok(exists (select 1 from public.nx_mensagens where wamid = 'cw:' || kA::text || ':REAL-10' and origem = 'ia'), 'resposta da IA sem id adotada pelo id do aparelho');
  j := public.nx_codewords_sync_gravar(kA, cv, jsonb_build_array(
    jsonb_build_object('id', 'SYNC-IN-1', 'texto', 'mensagem que o fluxo não mandou', 'de_mim', false, 'em', to_char((now() - interval '3 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    jsonb_build_object('id', 'SYNC-OUT-1', 'texto', 'respondi pelo celular', 'de_mim', true, 'em', to_char((now() - interval '2 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))));
  perform pg_temp.ok((j ->> 'ja_tinha')::int = 2 and (j ->> 'entradas')::int = 0 and (j ->> 'saidas')::int = 0, 'sincronização é idempotente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_sync_gravar(%L,%L,%L)', kA, cvB, '[]')) = 'conversa_nao_encontrada', 'sincronizar conversa de outro cliente');
  perform pg_temp.ok(exists (select 1 from json_array_elements(public.nx_codewords_sync_alvos(50)) x where (x ->> 'conversa_id')::bigint = cv and (x ->> 'canal_id')::uuid = kA),
    'conversa ativa entra na sincronização');
  perform pg_temp.ok(exists (select 1 from cron.job where jobname = 'nx-codewords-sync' and schedule = '*/2 * * * *'), 'pg_cron de 2 em 2 min');

  -- ---------------------------------------------------------- 9. humano, nota, origem e etapa
  perform public.nx_cv_ia_devolver('tok-cw-adm-' || sfx, cA, cv);
  select count(*) into n from public.nx_notificacoes where cliente_id = cA;
  j := public.nx_codewords_humano(kA, tel, 'Cliente pediu para falar com uma pessoa');
  perform pg_temp.ok((j ->> 'ok')::boolean and (select aguardando and ia_pausada_por = 'humano' from public.nx_conversas where id = cv), 'humano: pausa e volta para aguardando');
  perform pg_temp.ok((select count(*) from public.nx_notificacoes where cliente_id = cA) > n
    and exists (select 1 from public.nx_mensagens where conversa_id = cv and corpo like 'A IA chamou a equipe: Cliente pediu%'), 'humano: equipe avisada');
  perform pg_temp.ok(public.nx_codewords_humano(kA, '5512900000000', 'x') ->> 'erro' = 'conversa_nao_encontrada', 'humano com telefone sem conversa');
  j := public.nx_codewords_nota(kA, tel, 'Quer avaliação de implante; prefere manhã.');
  perform pg_temp.ok((j ->> 'ok')::boolean and (select texto = 'IA: Quer avaliação de implante; prefere manhã.' and negocio_id = neg from public.nx_notas where id = (j ->> 'nota_id')::bigint), 'nota da IA no negócio');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_nota(%L,%L,%L)', kA, tel, '  ')) = 'dados_invalidos|texto', 'nota vazia');
  perform pg_temp.ok(public.nx_codewords_origem(kA, tel, 'tiktok', null) ->> 'erro' = 'origem_invalida', 'origem fora da lista');
  j := public.nx_codewords_origem(kA, tel, 'instagram', 'viu um post');
  perform pg_temp.ok((j ->> 'aplicado')::boolean and (select origem from public.nx_leads where id = neg) = 'organico'
    and exists (select 1 from public.nx_notas where negocio_id = neg and texto = 'Origem contada à IA: Instagram — viu um post'), 'origem sem anúncio é registrada');
  r := public.nx_wa_entrada(kA, jsonb_build_object('wamid', 'cw:' || kA::text || ':AD-1', 'wa_id', telAd, 'nome', 'Rui Anúncio', 'tipo', 'texto', 'corpo', 'vi o anúncio',
         'referral', jsonb_build_object('source_type', 'ad', 'source_id', 'AD-TESTE-1')));
  perform public.nx_lead_webhook(cA, telAd, array[telAd], 'Rui Anúncio', '{"origem":"anuncio","plataforma":"meta","anuncio_ext":"AD-TESTE-1"}'::jsonb,
    (now() at time zone 'America/Sao_Paulo')::date, 30);
  j := public.nx_codewords_origem(kA, telAd, 'google', null);
  perform pg_temp.ok(not (j ->> 'aplicado')::boolean and j ->> 'motivo' = 'ja_tem_anuncio', 'anúncio não é sobrescrito pela origem contada');
  perform pg_temp.ok(public.nx_codewords_etapa(kA, tel, 'fechou', null) ->> 'erro' = 'etapa_invalida', 'IA nunca marca fechou');
  perform pg_temp.ok(public.nx_codewords_etapa(kA, tel, 'agendada', null) ->> 'erro' = 'etapa_invalida', 'agendada só pelo agendar');
  j := public.nx_codewords_etapa(kA, tel, 'orcamento', 'Pediu valores do implante');
  perform pg_temp.ok((j ->> 'mudou')::boolean and (select etapa = 'orcamento' and status = 'aberto' from public.nx_leads where id = neg), 'IA move para orçamento');
  perform pg_temp.ok(not (public.nx_codewords_etapa(kA, tel, 'orcamento', null) ->> 'mudou')::boolean, 'mesma etapa: nada muda');
  j := public.nx_codewords_etapa(kA, tel, 'perdida', 'Achou caro');
  perform pg_temp.ok((select status = 'perdido' and motivo_perda_txt = 'IA: Achou caro' from public.nx_leads where id = neg), 'IA marca perdida com motivo');
  perform pg_temp.ok(public.nx_codewords_etapa(kA, tel, 'orcamento', null) ->> 'erro' = 'negocio_nao_encontrado', 'sem negócio aberto');
  j := public.nx_codewords_dados(kA, tel);
  perform pg_temp.ok(j -> 'negocio' is null or json_typeof(j -> 'negocio') = 'null', 'contexto sem negócio aberto');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_dados(%L,%L)', kA, '12')) = 'dados_invalidos|telefone', 'contexto com telefone inválido');

  -- ---------------------------------------------------------- 10. automação: texto por canal CodeWords sem janela de 24 h
  perform public.nx_cv_ia_devolver('tok-cw-adm-' || sfx, cA, cv);
  update public.nx_conversas set ultima_entrada_em = now() - interval '3 days' where id = cv;
  insert into public.nx_automacoes (cliente_id, nome, ativo, gatilho, config, acoes)
  values (cA, 'Lembrete teste', false, 'antes_da_data', '{"campo":"consulta_em","horas":24}'::jsonb,
          '[{"tipo":"enviar_mensagem","texto":"Lembrete: sua avaliação é amanhã, {primeiro_nome}."}]'::jsonb)
  returning id into aut;
  select * into a from public.nx_automacoes where id = aut;
  v_txt := public.nx_auto_acoes(a, public.nx_auto_alvo(cA, jsonb_build_object('conversa_id', cv)));
  perform pg_temp.ok(v_txt like 'mensagem na fila%' and exists (select 1 from public.nx_envios_fila where automacao_id = aut and canal_id = kA and tipo = 'texto'),
    'automação manda texto pelo CodeWords mesmo com a janela de 24 h fechada → ' || coalesce(v_txt, '?'));
  update public.nx_conversas set status = 'resolvida', resolvida_em = now() where id = cv;
  v_txt := public.nx_auto_acoes(a, public.nx_auto_alvo(cA, jsonb_build_object('contato_id', ct)));
  perform pg_temp.ok(v_txt like 'mensagem na fila%' and (select count(*) from public.nx_conversas where cliente_id = cA and contato_id = ct and canal_id = kA and status <> 'resolvida') = 1,
    'sem conversa aberta: a automação abre uma no canal CodeWords do contato');
  update public.nx_contatos set optin_marketing = false where id = ct;
  v_txt := public.nx_auto_acoes(a, public.nx_auto_alvo(cA, jsonb_build_object('contato_id', ct)));
  perform pg_temp.ok(v_txt like '%pulada (contato pediu para não receber)%', 'quem pediu SAIR não recebe texto de automação no CodeWords');

  -- ---------------------------------------------------------- 11. permissões
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_codewords_canal_salvar(text,uuid,jsonb)', 'execute')
    and has_function_privilege('anon', 'public.nx_cv_ia_estado(text,uuid,bigint)', 'execute')
    and has_function_privilege('anon', 'public.nx_cv_ia_pausar(text,uuid,bigint,integer)', 'execute')
    and has_function_privilege('anon', 'public.nx_cv_ia_devolver(text,uuid,bigint)', 'execute'), 'RPCs do painel liberadas (autenticam por sessão)');
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_codewords_canal(text)', 'execute')
    and not has_function_privilege('anon', 'public.nx_codewords_saida(uuid,jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.nx_codewords_decidir(uuid,bigint,bigint)', 'execute')
    and not has_function_privilege('anon', 'public.nx_codewords_sync_gravar(uuid,bigint,jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.nx_cv_ia_pausa_auto(uuid,bigint,text,uuid)', 'execute')
    and not has_function_privilege('anon', 'public.nx_canal_credencial(uuid,uuid)', 'execute')
    and not has_function_privilege('anon', 'public.nx_disparar(text,jsonb)', 'execute'), 'internas só para service_role');
  perform pg_temp.ok(not has_table_privilege('anon', 'public.nx_codewords_status_pendentes', 'select')
    and not has_table_privilege('anon', 'public.nx_codewords_taxa', 'select'), 'tabelas novas fechadas para anon');
  perform pg_temp.ok(position(chave_teste in public.nx_cv_base('tok-cw-adm-' || sfx, cA)::text) = 0
    and position(segA in public.nx_cv_base('tok-cw-adm-' || sfx, cA)::text) = 0, 'nx_cv_base não expõe chave nem segredo da URL');

  raise exception 'OK_10_CODEWORDS todos os casos passaram';
end $t$;

rollback;
