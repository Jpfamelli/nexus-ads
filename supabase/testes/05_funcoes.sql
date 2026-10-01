-- ============================================================
-- ÓRBITA — supabase/testes/05_funcoes.sql · frente F2
-- Smoke do arquivo f (20260928f_funcoes.sql): internas das Edge Functions.
-- Casos de §8.4 (F2): nx_wa_entrada idempotente por wamid; reação não cria
-- mensagem; conversa nova fora do horário enfileira UMA vez em 12 h;
-- nx_wa_status não regride e ignora wamid de outro canal; nx_cv_saida marca
-- a 1ª resposta; textos gigantes não falham; bloqueado grava na conversa
-- oculta; "SAIR" marca opt-out; nx_fila_pegar(p_ids) pega o item uma vez só.
-- + isolamento (A2) de todas as internas que recebem id, DDI estrangeiro,
-- modelos, IA, mídia, permissões e tempo (regra 11: internas < 1 s).
-- Roda pelo execute_sql. TUDO em begin … rollback (e termina em exceção
-- 'OK 05_funcoes…' = rollback garantido). Falha = exceção 'FALHOU: <caso>'.
-- Rodar DEPOIS do arquivo e (nx_cv_distribuir); sem ele, as conversas novas
-- só não são distribuídas.
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

create or replace function pg_temp.msg(p_wamid text, p_wa text, p_corpo text, p_extra jsonb default '{}'::jsonb)
returns jsonb language sql as $f$
  select jsonb_build_object('wamid', p_wamid, 'wa_id', p_wa, 'nome', 'Paciente Teste F2', 'tipo', 'texto',
                            'corpo', p_corpo, 'em', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
         || p_extra
$f$;

do $t$
declare
  cA uuid; cB uuid; kA1 uuid; kA2 uuid; kB uuid; dep_rec uuid; dep_com uuid;
  k_adm uuid; k_at uuid; k_admB uuid;
  ctx_adm jsonb; ctx_at jsonb; ctx_admB jsonb;
  r json; r2 json; j jsonb; e text; n int; ms numeric; t0 timestamptz;
  ct1 bigint; cv1 bigint; cv2 bigint; cvB bigint; m1 bigint; mo1 bigint; mo2 bigint; mB bigint;
  fila1 bigint; tpl1 uuid; tpl2 uuid; sec uuid; ctx_ruim jsonb;
  fechado constant jsonb := '{"0":[],"1":[],"2":[],"3":[],"4":[],"5":[],"6":[]}';
begin
  -- ---------------------------------------------------------- cenário
  insert into public.nx_clientes (slug, nome, cfg) values ('teste-f2-a', 'Clínica Teste F2 A', '{"waGestor":["(12) 99999-8888","5512911112222"]}')
  returning id into cA;
  insert into public.nx_clientes (slug, nome) values ('teste-f2-b', 'Clínica Teste F2 B') returning id into cB;
  select id into dep_rec from public.nx_departamentos where cliente_id = cA and padrao;
  select id into dep_com from public.nx_departamentos where cliente_id = cA and not padrao limit 1;
  perform pg_temp.ok(dep_rec is not null and dep_com is not null, 'modelo criou os departamentos');
  -- 24 h e distribuição manual (fora do horário é testado à parte; o rodízio é da F5)
  update public.nx_departamentos set horario = null, distribuicao = 'manual' where cliente_id in (cA, cB);

  sec := public.nx_segredo_gravar(null, 'token-teste-f2-a1', 'teste-f2-token-a1');
  insert into public.nx_canais (cliente_id, nome, phone_number_id, waba_id, token_segredo, departamento_id)
  values (cA, 'Recepção F2', 'teste-f2-pid-a1', 'teste-f2-waba-a', sec, dep_rec) returning id into kA1;
  insert into public.nx_canais (cliente_id, nome, phone_number_id, waba_id)
  values (cA, 'Comercial F2', 'teste-f2-pid-a2', 'teste-f2-waba-a') returning id into kA2;
  insert into public.nx_canais (cliente_id, nome, phone_number_id, waba_id, app_secret_segredo)
  values (cB, 'Único B', 'teste-f2-pid-b', 'teste-f2-waba-b', public.nx_segredo_gravar(null, 'segredo-b', 'teste-f2-app-b'))
  returning id into kB;

  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f2-adm@teste.local', 'Ana Admin', 'x', 'clinica', true) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f2-at@teste.local', 'Beto Atendente', 'x', 'clinica', true) returning id into k_at;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f2-admb@teste.local', 'Caio Admin B', 'x', 'clinica', true) returning id into k_admB;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_adm, cA, 'admin'), (k_admB, cB, 'admin');
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas, departamentos) values (k_at, cA, 'atendente', false, array[dep_rec]);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash('tok-f2-adm'), k_adm, now() + interval '1 hour'), (public.nx_hash('tok-f2-at'), k_at, now() + interval '1 hour'),
    (public.nx_hash('tok-f2-admb'), k_admB, now() + interval '1 hour');
  ctx_adm := public.nx_fn_ctx('tok-f2-adm', cA, 'atendente')::jsonb;
  ctx_at := public.nx_fn_ctx('tok-f2-at', cA, 'atendente')::jsonb;
  ctx_admB := public.nx_fn_ctx('tok-f2-admb', cB, 'atendente')::jsonb;

  -- ---------------------------------------------------------- canais
  r := public.nx_wa_canal(p_chave => (select chave_publica from public.nx_canais where id = kB));
  perform pg_temp.ok((r ->> 'canal_id')::uuid = kB and (r ->> 'cliente_id')::uuid = cB and r ->> 'app_secret' = 'segredo-b'
                     and not (r ->> 'tem_token')::boolean and r ->> 'cliente_slug' = 'teste-f2-b', 'nx_wa_canal pela chave pública (com app secret do Vault)');
  r := public.nx_wa_canal('teste-f2-pid-a1');
  perform pg_temp.ok((r ->> 'canal_id')::uuid = kA1 and (r ->> 'tem_token')::boolean and r ->> 'app_secret' is null, 'nx_wa_canal pelo phone_number_id');
  perform pg_temp.ok(public.nx_wa_canal(p_chave => 'nao-existe') is null and public.nx_wa_canal() is null, 'nx_wa_canal desconhecido → null');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_canal_credencial(%L,%L)', kB, cA)) = 'canal_nao_encontrado', 'credencial: canal de outro cliente → canal_nao_encontrado');
  r := public.nx_canal_credencial(kA1, cA);
  perform pg_temp.ok(r ->> 'token' = 'token-teste-f2-a1' and r ->> 'phone_number_id' = 'teste-f2-pid-a1' and r ->> 'waba_id' = 'teste-f2-waba-a', 'credencial do próprio canal');
  r := public.nx_canal_verificado(kA1, cA, true, '+55 12 3999-0000', 'GREEN', false, 'app não inscrito na WABA');
  perform pg_temp.ok(r ->> 'status' = 'pendente' and not (r ->> 'app_inscrito')::boolean and r ->> 'ultimo_erro' like 'app não inscrito%', 'verificado sem app inscrito → pendente');
  r := public.nx_canal_verificado(kA1, cA, true, null, 'GREEN', true, null);
  perform pg_temp.ok(r ->> 'status' = 'ativo' and r ->> 'ultimo_erro' is null and r ->> 'numero_exibicao' = '+55 12 3999-0000', 'número ok + app inscrito → ativo');
  r := public.nx_canal_verificado(kA2, cA, false, null, null, null, 'token vencido');
  perform pg_temp.ok(r ->> 'status' = 'erro' and r ->> 'ultimo_erro' = 'token vencido', 'teste com erro → status erro');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_canal_verificado(%L,%L,true,null,null,true,null)', kB, cA)) = 'canal_nao_encontrado', 'verificado: canal de outro cliente');

  -- ---------------------------------------------------------- entrada (anúncio, contato novo)
  r := public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-1', '5512988887777', 'Oi, vi o anúncio do clareamento',
         jsonb_build_object('referral', jsonb_build_object('source_type', 'ad', 'source_id', 'AD-F2', 'ctwa_clid', 'CLID-F2'))));
  ct1 := (r ->> 'contato_id')::bigint; cv1 := (r ->> 'conversa_id')::bigint; m1 := (r ->> 'mensagem_id')::bigint;
  perform pg_temp.ok((r ->> 'nova_conversa')::boolean and not (r ->> 'duplicada')::boolean and m1 is not null, 'entrada: conversa nova + mensagem');
  perform pg_temp.ok((select telefone = '5512988887777' and wa_id = '5512988887777' and origem = 'anuncio' and plataforma = 'meta'
                             and anuncio_ext = 'AD-F2' and ctwa_clid = 'CLID-F2' and nome = 'Paciente Teste F2' and cliente_id = cA
                        from public.nx_contatos where id = ct1), 'contato criado com wa_id exato e atribuição do anúncio');
  perform pg_temp.ok((select status = 'aberta' and aguardando and nao_lidas = 1 and departamento_id = dep_rec and canal_id = kA1
                             and ultima_msg_dir = 'in' and ultima_entrada_em is not null and protocolo ~ '^\d{4}-\d{6}$'
                        from public.nx_conversas where id = cv1), 'conversa: aberta, aguardando, 1 não lida, departamento do canal, protocolo');
  perform pg_temp.ok((select direcao = 'in' and tipo = 'texto' and status = 'recebida' and referral ->> 'source_id' = 'AD-F2' and canal_id = kA1
                        from public.nx_mensagens where id = m1), 'mensagem de entrada com referral');
  perform pg_temp.ok(exists (select 1 from public.nx_notificacoes where cliente_id = cA and conta_id = k_adm and tipo = 'lead_anuncio'
                                and link = '#/conversas/' || cv1), 'lead de anúncio notifica o admin');

  -- idempotente por wamid
  r := public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-1', '5512988887777', 'Oi, vi o anúncio do clareamento'));
  perform pg_temp.ok((r ->> 'duplicada')::boolean and (r ->> 'mensagem_id')::bigint = m1, 'mesmo wamid → duplicada');
  perform pg_temp.ok((select count(*) from public.nx_mensagens where conversa_id = cv1) = 1
                     and (select nao_lidas from public.nx_conversas where id = cv1) = 1, 'duplicada não grava nem conta de novo');

  -- segunda mensagem: mesma conversa; sem referral não muda a atribuição
  r := public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-2', '5512988887777', 'Quanto custa?'));
  perform pg_temp.ok((r ->> 'conversa_id')::bigint = cv1 and not (r ->> 'nova_conversa')::boolean, '2ª mensagem na mesma conversa');
  perform pg_temp.ok((select nao_lidas from public.nx_conversas where id = cv1) = 2, 'não lidas soma');

  -- o mesmo número com e sem o 9 é o mesmo contato
  r := public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-3', '551288887777', 'sem o nono dígito'));
  perform pg_temp.ok((r ->> 'contato_id')::bigint = ct1 and (r ->> 'conversa_id')::bigint = cv1, 'sem o 9 cai no mesmo contato e conversa');
  perform pg_temp.ok((select wa_id from public.nx_contatos where id = ct1) = '551288887777', 'wa_id atualizado para o último from');

  -- M3: o 2º número do cliente abre conversa própria para o mesmo contato
  r := public.nx_wa_entrada(kA2, pg_temp.msg('wamid.TESTE-F2-4', '5512988887777', 'pelo outro número'));
  cv2 := (r ->> 'conversa_id')::bigint;
  perform pg_temp.ok((r ->> 'contato_id')::bigint = ct1 and cv2 <> cv1 and (r ->> 'nova_conversa')::boolean
                     and (select canal_id from public.nx_conversas where id = cv2) = kA2, '2º número: mesma pessoa, conversa do canal');
  perform pg_temp.ok(not (r ->> 'midia_pendente')::boolean, 'texto não tem mídia');

  -- reação: não cria mensagem, grava o emoji na mensagem alvo
  n := (select count(*) from public.nx_mensagens where cliente_id = cA);
  r := public.nx_wa_entrada(kA1, jsonb_build_object('wamid', 'wamid.TESTE-F2-R', 'wa_id', '5512988887777', 'reacao',
                                                    jsonb_build_object('wamid', 'wamid.TESTE-F2-2', 'emoji', '👍')));
  perform pg_temp.ok((r ->> 'reacao')::boolean and (select count(*) from public.nx_mensagens where cliente_id = cA) = n, 'reação não cria mensagem');
  perform pg_temp.ok((select reacao from public.nx_mensagens where wamid = 'wamid.TESTE-F2-2') = '👍', 'reação gravada na mensagem alvo');
  r := public.nx_wa_entrada(kB, jsonb_build_object('wamid', 'wamid.TESTE-F2-R2', 'wa_id', '5512988887777', 'reacao',
                                                   jsonb_build_object('wamid', 'wamid.TESTE-F2-1', 'emoji', '😡')));
  perform pg_temp.ok((select reacao from public.nx_mensagens where wamid = 'wamid.TESTE-F2-1') is null and r ->> 'mensagem_id' is null,
                     'reação pelo canal de OUTRO cliente não mexe na mensagem');
  -- (revisão) reação só na conversa do PRÓPRIO contato: outro contato do mesmo cliente não mexe
  perform public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-OUTRO', '5512911113333', 'sou outra pessoa'));
  r := public.nx_wa_entrada(kA1, jsonb_build_object('wamid', 'wamid.TESTE-F2-R3', 'wa_id', '5512988887777', 'reacao',
                                                    jsonb_build_object('wamid', 'wamid.TESTE-F2-OUTRO', 'emoji', '😡')));
  perform pg_temp.ok((select reacao from public.nx_mensagens where wamid = 'wamid.TESTE-F2-OUTRO') is null and r ->> 'mensagem_id' is null,
                     'reação à mensagem de OUTRO contato do mesmo cliente não mexe nela');
  -- (revisão) data impossível no "em" não derruba a gravação
  r := public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-DATA', '5512911113333', 'data impossível', '{"em":"2026-02-31T10:00:00Z"}'));
  perform pg_temp.ok(r ->> 'mensagem_id' is not null and not (r ->> 'duplicada')::boolean, '"em" com data impossível → grava com now()');

  -- mídia: canal com token → baixando; sem token → indisponível
  r := public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-IMG', '5512988887777', 'foto do dente',
         jsonb_build_object('tipo', 'imagem', 'midia', jsonb_build_object('media_id', 'MID-1', 'mime', 'image/jpeg', 'sha256', 'abc', 'nome', repeat('n', 500)))));
  perform pg_temp.ok((r ->> 'midia_pendente')::boolean, 'imagem num canal com token → midia_pendente');
  perform pg_temp.ok((select midia ->> 'estado' = 'baixando' and char_length(midia ->> 'nome') = 200 and midia ->> 'media_id' = 'MID-1'
                        from public.nx_mensagens where wamid = 'wamid.TESTE-F2-IMG'), 'midia baixando, nome cortado em 200');
  perform pg_temp.ok((select ultima_msg_resumo from public.nx_conversas where id = cv1) = 'Foto: foto do dente', 'resumo da foto');
  r2 := public.nx_wa_entrada(kA2, pg_temp.msg('wamid.TESTE-F2-IMG2', '5512988887777', null,
         jsonb_build_object('tipo', 'audio', 'midia', jsonb_build_object('media_id', 'MID-2', 'mime', 'audio/ogg'))));
  perform pg_temp.ok(not (r2 ->> 'midia_pendente')::boolean
                     and (select midia ->> 'estado' from public.nx_mensagens where wamid = 'wamid.TESTE-F2-IMG2') = 'indisponivel',
                     'canal sem token → mídia indisponível (honesto)');
  -- nx_wa_midia_ok
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_wa_midia_ok(%s,%L,%L,10)', (r ->> 'mensagem_id')::bigint, cA, cB::text || '/in/2026-09/x.jpg')) = 'dados_invalidos|path', 'midia_ok: path de outro cliente recusado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_wa_midia_ok(%s,%L,%L,10)', (r ->> 'mensagem_id')::bigint, cB, cB::text || '/in/2026-09/x.jpg')) = 'mensagem_nao_encontrada', 'midia_ok: mensagem de outro cliente');
  perform public.nx_wa_midia_ok((r ->> 'mensagem_id')::bigint, cA, cA::text || '/in/2026-09/x.jpg', 12345);
  perform pg_temp.ok((select midia ->> 'estado' = 'ok' and midia ->> 'path' = cA::text || '/in/2026-09/x.jpg' and (midia ->> 'tamanho')::int = 12345
                        and midia ->> 'media_id' = 'MID-1' from public.nx_mensagens where wamid = 'wamid.TESTE-F2-IMG'), 'midia_ok grava path e tamanho (mantém o resto)');
  perform public.nx_wa_midia_ok((r2 ->> 'mensagem_id')::bigint, cA, null, null, 'arquivo maior que 16 MB');
  perform pg_temp.ok((select midia ->> 'estado' from public.nx_mensagens where wamid = 'wamid.TESTE-F2-IMG2') = 'falhou', 'midia_ok com erro → falhou');

  -- textos gigantes não falham
  r := public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-GRANDE', '5512977770000', repeat('x', 5000),
         jsonb_build_object('nome', repeat('N', 300), 'referral', jsonb_build_object('source_type', 'ad', 'source_id', repeat('9', 300)))));
  perform pg_temp.ok((select char_length(corpo) from public.nx_mensagens where wamid = 'wamid.TESTE-F2-GRANDE') = 4096, 'corpo cortado em 4096');
  perform pg_temp.ok((select char_length(nome) from public.nx_contatos where id = (r ->> 'contato_id')::bigint) = 160, 'nome cortado em 160');
  perform pg_temp.ok((select char_length(ultima_msg_resumo) from public.nx_conversas where id = (r ->> 'conversa_id')::bigint) <= 140, 'resumo ≤ 140');

  -- DDI estrangeiro: sem 55
  r := public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-US', '14155551234', 'hello'));
  perform pg_temp.ok((select telefone = '14155551234' and wa_id = '14155551234' from public.nx_contatos where id = (r ->> 'contato_id')::bigint),
                     'from estrangeiro → telefone = wa_id, sem 55');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_wa_entrada(%L,%L)', kA1, pg_temp.msg('wamid.TESTE-F2-X', '123', 'curto'))) = 'dados_invalidos|wa_id', 'wa_id inválido → dados_invalidos');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_wa_entrada(%L,%L)', gen_random_uuid(), pg_temp.msg('wamid.TESTE-F2-X', '5512988887777', 'x'))) = 'canal_nao_encontrado', 'canal inexistente');

  -- tipo desconhecido vira 'desconhecido'
  r := public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-UNS', '5512988887777', 'Mensagem não suportada pela API do WhatsApp — veja no celular', '{"tipo":"coisa_nova"}'));
  perform pg_temp.ok((select tipo from public.nx_mensagens where id = (r ->> 'mensagem_id')::bigint) = 'desconhecido', 'tipo desconhecido');

  -- ---------------------------------------------------------- opt-out
  r := public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-SAIR', '5512988887777', '  Sair! '));
  perform pg_temp.ok((r ->> 'optout')::boolean, '"Sair!" → optout');
  perform pg_temp.ok((select optin_marketing = false and optin_origem = 'whatsapp: pediu para sair' and optin_em is not null
                        from public.nx_contatos where id = ct1), 'contato marcado como não quer marketing');
  perform pg_temp.ok(exists (select 1 from public.nx_mensagens where conversa_id = cv1 and tipo = 'sistema'
                               and corpo = 'Contato pediu para não receber mensagens de marketing'), 'mensagem de sistema do opt-out');
  r := public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-NAO', '5512988887777', 'não quero sair agora'));
  perform pg_temp.ok(not (r ->> 'optout')::boolean, 'frase com "sair" no meio não é opt-out');
  perform pg_temp.ok((public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-DESC', '5512966660000', 'DESCADASTRAR')) ->> 'optout')::boolean, 'DESCADASTRAR → optout');

  -- ---------------------------------------------------------- saída e recibos
  update public.nx_conversas set atribuida_a = k_adm where id = cv1;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_saida(%L,%L,%s,%L)', k_adm, cB, cv1, '{"tipo":"texto","corpo":"x"}')) = 'conversa_nao_encontrada', 'saída: conversa de outro cliente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_saida(%L,%L,%s,%L)', k_adm, cA, cv1, '{"tipo":"nota","corpo":"x"}')) = 'dados_invalidos|tipo', 'saída não grava nota');
  r := public.nx_cv_saida(null, cA, cv1, '{"tipo":"texto","corpo":"Fora do horário","status":"enviada","wamid":"wamid.TESTE-F2-AUTO","origem":"fora_horario"}');
  perform pg_temp.ok((select aguardando and primeira_resposta_em is null from public.nx_conversas where id = cv1), 'mensagem automática não tira de aguardando nem conta 1ª resposta');
  r := public.nx_cv_saida(k_adm, cA, cv1, jsonb_build_object('tipo', 'texto', 'corpo', 'Olá! Custa R$ 500.', 'status', 'enviada',
                                                          'wamid', 'wamid.TESTE-F2-S1', 'responde_a_wamid', 'wamid.TESTE-F2-2'));
  mo1 := (r ->> 'id')::bigint;
  perform pg_temp.ok(r ->> 'direcao' = 'out' and r ->> 'origem' = 'painel' and (r -> 'enviado_por' ->> 'nome') = 'Ana Admin'
                     and (r -> 'responde_a' ->> 'direcao') = 'in', 'saída no formato Mensagem (autor, citação)');
  perform pg_temp.ok((select not aguardando and primeira_resposta_em is not null and ultima_msg_dir = 'out'
                        from public.nx_conversas where id = cv1), 'resposta humana: 1ª resposta e sai de aguardando');
  r := public.nx_cv_saida(k_adm, cA, cv1, '{"tipo":"texto","corpo":"cita de outro","responde_a_wamid":"wamid.TESTE-F2-US"}');
  perform pg_temp.ok(r -> 'responde_a' is null or json_typeof(r -> 'responde_a') = 'null', 'citação de mensagem de OUTRO contato é ignorada');
  r := public.nx_cv_saida(k_adm, cA, cv1, '{"tipo":"texto","corpo":"vai falhar","status":"enviada","wamid":"wamid.TESTE-F2-S2"}');
  mo2 := (r ->> 'id')::bigint;
  r := public.nx_cv_saida(k_adm, cA, cv1, '{"tipo":"texto","corpo":"de novo","wamid":"wamid.TESTE-F2-S1"}');
  perform pg_temp.ok((r ->> 'id')::bigint = mo1, 'mesmo wamid na saída devolve a mensagem existente');

  r := public.nx_wa_status(kA1, '[{"id":"wamid.TESTE-F2-S1","status":"delivered"}]');
  perform pg_temp.ok((r ->> 'atualizados')::int = 1 and (select status from public.nx_mensagens where id = mo1) = 'entregue', 'delivered → entregue');
  r := public.nx_wa_status(kA1, '[{"id":"wamid.TESTE-F2-S1","status":"sent"}]');
  perform pg_temp.ok((r ->> 'ignorados')::int = 1 and (select status from public.nx_mensagens where id = mo1) = 'entregue', 'sent depois de delivered não regride');
  r := public.nx_wa_status(kA2, '[{"id":"wamid.TESTE-F2-S1","status":"read"}]');
  perform pg_temp.ok((r ->> 'ignorados')::int = 1 and (select status from public.nx_mensagens where id = mo1) = 'entregue', 'recibo pelo OUTRO canal do cliente é ignorado');
  r := public.nx_wa_status(kB, '[{"id":"wamid.TESTE-F2-S1","status":"read"}]');
  perform pg_temp.ok((r ->> 'ignorados')::int = 1 and (select status from public.nx_mensagens where id = mo1) = 'entregue', 'recibo pelo canal de OUTRO cliente é ignorado');
  r := public.nx_wa_status(kA1, '[{"id":"wamid.TESTE-F2-S1","status":"read"},{"id":"wamid.TESTE-F2-S1","status":"failed","errors":[{"code":131026}]}]');
  perform pg_temp.ok((r ->> 'atualizados')::int = 1 and (r ->> 'ignorados')::int = 1
                     and (select status from public.nx_mensagens where id = mo1) = 'lida', 'read → lida; failed depois de lida é ignorado');
  r := public.nx_wa_status(kA1, '[{"id":"wamid.TESTE-F2-S2","status":"failed","errors":[{"code":190,"title":"Invalid token"}],"erro_texto":"WhatsApp não entregou (código 190): Invalid token — token vencido ou revogado"}]');
  perform pg_temp.ok((r ->> 'falhas')::int = 1 and (select status = 'falhou' and erro like '%token vencido%' from public.nx_mensagens where id = mo2), 'failed → falhou com dica');
  r := public.nx_wa_status(kA1, '[{"id":"wamid.TESTE-F2-S2","status":"sent"},{"id":"wamid.x","status":"delivered"},{"status":"read"},{"id":"wamid.TESTE-F2-1","status":"read"}]');
  perform pg_temp.ok((r ->> 'ignorados')::int = 4 and (select status from public.nx_mensagens where id = mo2) = 'falhou', 'sent após falhou, wamid desconhecido, sem id e mensagem de ENTRADA → ignorados');
  r := public.nx_wa_status(kA1, '[{"id":"wamid.TESTE-F2-S2","status":"delivered"}]');
  perform pg_temp.ok((select status = 'entregue' and erro is null from public.nx_mensagens where id = mo2), 'delivered depois de failed corrige (chegou de fato)');

  -- ---------------------------------------------------------- contexto de envio (A2)
  r := public.nx_cv_contexto_envio(ctx_adm, cA, cv1);
  perform pg_temp.ok((r ->> 'janela_aberta')::boolean and (r -> 'contato' ->> 'wa_id') = '5512988887777'
                     and (r ->> 'canal_id')::uuid = kA1 and (r -> 'canal' ->> 'tem_token')::boolean
                     and r ->> 'ultimo_wamid_in' is not null and r ->> 'atendente_nome' = 'Ana Admin'
                     and (r -> 'cfg_cv' ->> 'recibo_leitura')::boolean and not (r -> 'cfg_cv' ->> 'assinatura')::boolean
                     and (r -> 'contato' ->> 'optin_marketing')::boolean = false, 'contexto de envio do admin');
  r := public.nx_wa_entrada(kB, pg_temp.msg('wamid.TESTE-F2-B1', '5512988887777', 'oi B'));
  cvB := (r ->> 'conversa_id')::bigint; mB := (r ->> 'mensagem_id')::bigint;
  perform pg_temp.ok((select cliente_id from public.nx_contatos where id = (r ->> 'contato_id')::bigint) = cB and (r ->> 'contato_id')::bigint <> ct1,
                     'mesmo telefone no canal de B vira contato de B');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_contexto_envio(%L,%L,%s)', ctx_adm, cA, cvB)) = 'conversa_nao_encontrada', 'contexto: conversa de outro cliente → não encontrada');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_contexto_envio(%L,%L,%s)', ctx_adm, cB, cvB)) = 'conversa_nao_encontrada', 'contexto: ctx de A usado com p_cliente B → não encontrada');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_contexto_envio(%L,%L,%s)', ctx_at, cA, cv1)) = 'conversa_nao_encontrada', 'contexto: atendente sem ver_todas não vê conversa de colega');
  perform pg_temp.ok((public.nx_cv_contexto_envio(ctx_at, cA, (select id from public.nx_conversas where cliente_id = cA and atribuida_a is null and departamento_id = dep_rec and not oculta order by id limit 1)) ->> 'janela_aberta')::boolean,
                     'contexto: atendente vê conversa sem dono do departamento dele');
  ctx_ruim := ctx_at || jsonb_build_object('papel', 'admin');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_contexto_envio(%L,%L,%s)', ctx_ruim, cA, cv1)) = 'conversa_nao_encontrada', 'contexto: papel forjado no ctx não abre');
  update public.nx_clientes set modulos = array['crm','relatorios'] where id = cB;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_contexto_envio(%L,%L,%s)', ctx_admB, cB, cvB)) = 'modulo_desligado|conversas', 'contexto: módulo conversas desligado');
  update public.nx_clientes set modulos = array['crm','conversas','relatorios','ads','automacoes','marca'] where id = cB;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_msg_reenvio(%L,%L,%s)', ctx_adm, cA, mo1)) = 'mensagem_nao_encontrada', 'reenvio: só texto que falhou');
  update public.nx_mensagens set status = 'falhou' where id = mo1;
  perform pg_temp.ok((public.nx_cv_msg_reenvio(ctx_adm, cA, mo1) ->> 'conversa_id')::bigint = cv1, 'reenvio da própria mensagem');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_cv_msg_reenvio(%L,%L,%s)', ctx_admB, cB, mo1)) = 'mensagem_nao_encontrada', 'reenvio: mensagem de outro cliente');

  -- ---------------------------------------------------------- bloqueado
  update public.nx_contatos set bloqueado = true where id = ct1;
  update public.nx_conversas set status = 'resolvida', oculta = true, resolvida_em = now() where id = cv1;
  n := (select nao_lidas from public.nx_conversas where id = cv1);
  r := public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-BLQ', '5512988887777', 'ainda estou aqui'));
  perform pg_temp.ok((r ->> 'bloqueado')::boolean and (r ->> 'conversa_id')::bigint = cv1 and not (r ->> 'nova_conversa')::boolean,
                     'bloqueado: grava na última conversa (oculta) do canal');
  perform pg_temp.ok((select status = 'resolvida' and oculta and nao_lidas = n from public.nx_conversas where id = cv1)
                     and not exists (select 1 from public.nx_conversas where contato_id = ct1 and canal_id = kA1 and status <> 'resolvida'),
                     'bloqueado: sem conversa nova e sem mexer em não lidas');
  update public.nx_contatos set bloqueado = true where wa_id = '14155551234' and cliente_id = cA;
  delete from public.nx_conversas where contato_id = (select id from public.nx_contatos where wa_id = '14155551234' and cliente_id = cA);
  r := public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-BLQ2', '14155551234', 'hi again'));
  perform pg_temp.ok((r ->> 'bloqueado')::boolean and (select status = 'resolvida' and oculta from public.nx_conversas where id = (r ->> 'conversa_id')::bigint),
                     'bloqueado sem conversa: cria UMA já resolvida e oculta');

  -- ---------------------------------------------------------- fora do horário + fila
  update public.nx_departamentos set horario = fechado, msg_fora_horario = 'Olá {primeiro_nome}! Estamos fechados. Protocolo {protocolo}.' where id = dep_rec;
  r := public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-FH1', '5512955554444', 'Oi, tem horário?', '{"nome":"Maria Souza"}'));
  fila1 := (r ->> 'fila_id')::bigint;
  perform pg_temp.ok(fila1 is not null and (select tipo = 'texto' and origem = 'fora_horario' and status = 'pendente'
                                                   and texto like 'Olá Maria! Estamos fechados. Protocolo ____-______.'
                                              from public.nx_envios_fila where id = fila1), 'conversa nova fora do horário → 1 item na fila com variáveis');
  r := public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-FH2', '5512955554444', 'alô?'));
  perform pg_temp.ok(r ->> 'fila_id' is null, 'mesma conversa: não enfileira de novo');
  update public.nx_conversas set status = 'resolvida' where id = (r ->> 'conversa_id')::bigint;
  r := public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-FH3', '5512955554444', 'voltei'));
  perform pg_temp.ok((r ->> 'nova_conversa')::boolean and r ->> 'fila_id' is null, 'conversa nova do mesmo contato em < 12 h: não enfileira');

  j := public.nx_fila_pegar(20, array[fila1])::jsonb;
  perform pg_temp.ok(jsonb_array_length(j) = 1 and (j -> 0 ->> 'id')::bigint = fila1 and (j -> 0 ->> 'cliente_id')::uuid = cA
                     and (j -> 0 ->> 'janela_aberta')::boolean and (j -> 0 -> 'contato' ->> 'wa_id') = '5512955554444'
                     and (j -> 0 ->> 'canal_id')::uuid = kA1 and (j -> 0 ->> 'tentativas')::int = 1,
                     'nx_fila_pegar(p_ids) pega o item com contexto de envio');
  perform pg_temp.ok((select status from public.nx_envios_fila where id = fila1) = 'enviando', 'item marcado enviando');
  perform pg_temp.ok(json_array_length(public.nx_fila_pegar(20, array[fila1])) = 0, 'o 2º pedido (cron ou webhook) NÃO pega o mesmo item');
  perform pg_temp.ok(not exists (select 1 from json_array_elements(public.nx_fila_pegar(100)) x where (x ->> 'id')::bigint = fila1), 'nem a varredura sem ids');
  perform public.nx_fila_concluir(fila1, 'enviado', null, mo1);
  perform pg_temp.ok((select status = 'enviado' and processado_em is not null and mensagem_id = mo1 from public.nx_envios_fila where id = fila1), 'fila concluída');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_fila_concluir(%s,%L,null,null)', fila1, 'qualquer')) = 'dados_invalidos|status', 'status inválido na fila');
  insert into public.nx_envios_fila (cliente_id, conversa_id, contato_id, canal_id, tipo, texto, origem, enviar_em)
  values (cA, cv1, ct1, kA1, 'texto', 'amanhã', 'agendada', now() + interval '1 day') returning id into fila1;
  perform pg_temp.ok(not exists (select 1 from json_array_elements(public.nx_fila_pegar(100)) x where (x ->> 'id')::bigint = fila1), 'fila: item futuro não sai antes da hora');

  -- ---------------------------------------------------------- modelos
  r := public.nx_templates_gravar(kA1, cA, '[
    {"name":"confirmacao_consulta","language":"pt_BR","category":"UTILITY","status":"APPROVED",
     "components":[{"type":"BODY","text":"Olá {{1}}, confirmando sua consulta em {{2}}."}]},
    {"name":"promo","language":"pt_BR","category":"MARKETING","status":"PENDING","components":[{"type":"BODY","text":"Promo"}]},
    {"name":"nomeado","language":"pt_BR","category":"UTILITY","status":"APPROVED","components":[{"type":"BODY","text":"Oi {{nome}}, {{nome}} e {{data}}"}]}]');
  perform pg_temp.ok((r ->> 'total')::int = 3, 'modelos gravados');
  select id into tpl1 from public.nx_templates where canal_id = kA1 and nome = 'confirmacao_consulta';
  select id into tpl2 from public.nx_templates where canal_id = kA1 and nome = 'promo';
  perform pg_temp.ok((select num_parametros = 2 and corpo like 'Olá {{1}}%' from public.nx_templates where id = tpl1)
                     and (select num_parametros from public.nx_templates where canal_id = kA1 and nome = 'nomeado') = 2, 'corpo e nº de parâmetros (posicional e nomeado)');
  r := public.nx_template_ver(cA, tpl1, kA1);
  perform pg_temp.ok(r ->> 'nome' = 'confirmacao_consulta' and r ->> 'idioma' = 'pt_BR' and (r ->> 'num_parametros')::int = 2, 'nx_template_ver aprovado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_template_ver(%L,%L,%L)', cA, tpl2, kA1)) = 'template_invalido', 'modelo não aprovado → template_invalido');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_template_ver(%L,%L,%L)', cB, tpl1, kA1)) = 'template_invalido', 'modelo de outro cliente → template_invalido');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_template_ver(%L,%L,%L)', cA, tpl1, kA2)) = 'template_invalido', 'modelo de outro número → template_invalido');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_templates_gravar(%L,%L,%L)', kA1, cB, '[]')) = 'canal_nao_encontrado', 'gravar modelos no canal de outro cliente');
  perform public.nx_templates_gravar(kA1, cA, '[{"name":"confirmacao_consulta","language":"pt_BR","category":"UTILITY","status":"APPROVED","components":[{"type":"BODY","text":"Olá {{1}}"}]}]');
  perform pg_temp.ok((select status from public.nx_templates where id = tpl2) = 'DELETED'
                     and (select num_parametros from public.nx_templates where id = tpl1) = 1, 'nova sincronização atualiza e aposenta o que sumiu');
  insert into public.nx_envios_fila (cliente_id, conversa_id, contato_id, canal_id, tipo, template, origem)
  values (cA, cv1, ct1, kA1, 'template', jsonb_build_object('nome', 'confirmacao_consulta', 'idioma', 'pt_BR', 'parametros', jsonb_build_array('Maria')), 'automacao')
  returning id into fila1;
  j := public.nx_fila_pegar(20, array[fila1])::jsonb;
  perform pg_temp.ok((j -> 0 -> 'modelo' ->> 'categoria') = 'UTILITY' and (j -> 0 -> 'modelo' ->> 'id')::uuid = tpl1, 'fila de modelo traz a categoria (opt-out pula MARKETING)');

  -- ---------------------------------------------------------- IA
  update public.nx_contatos set bloqueado = false where id = ct1;
  perform public.nx_cv_saida(k_adm, cA, cv1, jsonb_build_object('tipo', 'texto', 'corpo', repeat('y', 3000)));
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status)
  values (cA, cv1, ct1, kA1, 'out', 'nota', 'NOTA INTERNA SECRETA', 'enviada');
  update public.nx_conversas set status = 'aberta', oculta = false where id = cv1;
  r := public.nx_ia_contexto(ctx_adm, cA, cv1);
  perform pg_temp.ok(r ->> 'empresa' = 'Clínica Teste F2 A' and r ->> 'vertical' = 'odonto' and r ->> 'atendente_nome' = 'Ana Admin'
                     and r ->> 'contato_nome' = 'Paciente Teste F2' and json_array_length(r -> 'mensagens') > 3, 'contexto da IA');
  perform pg_temp.ok(position('NOTA INTERNA' in (r -> 'mensagens')::text) = 0 and position('não receber mensagens de marketing' in (r -> 'mensagens')::text) = 0,
                     'IA: notas internas e mensagens de sistema NÃO entram');
  perform pg_temp.ok(octet_length((r -> 'mensagens')::text) < 16000
                     and (select bool_and(char_length(x ->> 'texto') <= 1500) from json_array_elements(r -> 'mensagens') x), 'IA: cada texto ≤ 1.500 e total ≤ 12 KB');
  perform pg_temp.ok((r -> 'mensagens' -> 0 ->> 'em') <= (r -> 'mensagens' -> (json_array_length(r -> 'mensagens') - 1) ->> 'em'), 'IA: mais antiga primeiro');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ia_contexto(%L,%L,%s)', ctx_adm, cA, cvB)) = 'conversa_nao_encontrada', 'IA: conversa de outro cliente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_ia_contexto(%L,%L,%s)', ctx_at, cA, cv1)) = 'conversa_nao_encontrada', 'IA: conversa invisível ao atendente');
  -- (revisão) conversa OCULTA do mesmo contato (regra do nx_cv_mensagens): o atendente não leva as
  -- mensagens dela para a IA; admin (supervisor+) leva o histórico inteiro
  update public.nx_conversas set atribuida_a = k_at where id = cv1;
  update public.nx_conversas set oculta = true where id = cv2;
  r := public.nx_ia_contexto(ctx_at, cA, cv1);
  perform pg_temp.ok(json_array_length(r -> 'mensagens') > 3 and position('pelo outro número' in (r -> 'mensagens')::text) = 0,
                     'IA: atendente não leva mensagens da conversa OCULTA do contato');
  r := public.nx_ia_contexto(ctx_adm, cA, cv1);
  perform pg_temp.ok(position('pelo outro número' in (r -> 'mensagens')::text) > 0, 'IA: admin leva o histórico contínuo (inclui a oculta)');
  update public.nx_conversas set oculta = false where id = cv2;
  update public.nx_conversas set atribuida_a = k_adm where id = cv1;
  r := public.nx_ia_cota(cA, k_adm);
  perform pg_temp.ok((r ->> 'usadas')::int = 0 and r ->> 'limite' is null and (r ->> 'conta_minuto')::int = 0, 'cota (plano interno = ilimitado)');
  perform public.nx_ia_registrar(cA, k_adm, 'sugerir', 'claude-opus-5', 100, 50, true);
  perform public.nx_ia_registrar(cA, k_adm, 'sugerir', 'claude-opus-5', null, null, false);
  r := public.nx_ia_cota(cA, k_adm);
  perform pg_temp.ok((r ->> 'usadas')::int = 2 and (r ->> 'conta_minuto')::int = 2, 'cota conta toda tentativa (ok ou não), como o ritmo (20260930c)');
  update public.nx_clientes set plano = 'essencial' where id = cA;
  perform pg_temp.ok((public.nx_ia_cota(cA) ->> 'limite')::int = 300, 'limite ia_mes do plano');

  -- ---------------------------------------------------------- faxina de mídia, alerta
  insert into public.nx_midia_lixo (cliente_id, path) values (cA, cA::text || '/in/2026-09/a.jpg'), (cA, cA::text || '/out/2026-09/b.pdf');
  j := public.nx_midia_lixo_pegar(500)::jsonb;
  perform pg_temp.ok(jsonb_array_length(j) >= 2, 'lixo pendente listado');
  n := public.nx_midia_lixo_concluir(array(select (x ->> 'id')::bigint from jsonb_array_elements(j) x where x ->> 'path' like cA::text || '/in/%'), null);
  perform pg_temp.ok(n = 1 and exists (select 1 from public.nx_midia_lixo where path = cA::text || '/in/2026-09/a.jpg' and apagado_em is not null), 'lixo concluído');
  perform public.nx_midia_lixo_concluir(array(select id from public.nx_midia_lixo where path = cA::text || '/out/2026-09/b.pdf'), 'erro 500');
  perform pg_temp.ok(not exists (select 1 from json_array_elements(public.nx_midia_lixo_pegar(500)) x where x ->> 'path' = cA::text || '/out/2026-09/b.pdf'), 'item com erro sai da fila automática');
  perform pg_temp.ok((public.nx_alerta_destinos(cA) -> 'destinos')::jsonb = '["12999998888", "5512911112222"]'::jsonb, 'destinos do alerta (só dígitos)');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_alerta_destinos(%L)', gen_random_uuid())) = 'cliente_nao_encontrado', 'alerta: cliente inexistente');

  -- ---------------------------------------------------------- nx_disparar e permissões
  perform pg_temp.ok(pg_temp.erro('select public.nx_disparar(''nx-outra'', ''{}''::jsonb)') = 'funcao_invalida', 'nx_disparar recusa função fora da lista');
  perform pg_temp.ok((select prosrc like '%''nx-enviar''%' from pg_proc where oid = 'public.nx_disparar(text,jsonb)'::regprocedure), 'nx_disparar aceita nx-enviar');
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_disparar(text,jsonb)', 'execute')
                     and not has_function_privilege('authenticated', 'public.nx_disparar(text,jsonb)', 'execute'), 'nx_disparar sem grant para o painel');
  perform pg_temp.ok(not exists (
      select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public'
         and p.proname in ('nx_wa_resumo','nx_wa_msg_json','nx_wa_canal','nx_canal_credencial','nx_canal_verificado','nx_wa_entrada',
                           'nx_wa_status','nx_wa_midia_ok','nx_cv_saida','nx_cv_contexto_envio','nx_cv_msg_reenvio','nx_fila_pegar',
                           'nx_fila_concluir','nx_templates_gravar','nx_template_ver','nx_ia_contexto','nx_ia_cota','nx_ia_registrar',
                           'nx_midia_lixo_pegar','nx_midia_lixo_concluir','nx_alerta_destinos','nx_disparar')
         and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
              or not has_function_privilege('service_role', p.oid, 'execute'))), 'internas da F2: só service_role');
  perform pg_temp.ok((select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                       where s.nspname = 'public' and p.proname in ('nx_wa_entrada','nx_wa_status','nx_cv_saida','nx_fila_pegar')
                         and p.prosecdef and array_to_string(p.proconfig, ',') = 'search_path=""') = 4, 'security definer + search_path vazio');

  -- ---------------------------------------------------------- tempo (regra 11: internas < 1 s) com volume
  perform set_config('nx.sem_historico', '1', true);
  perform set_config('nx.lote', '1', true);
  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id)
  select cA, 'Volume ' || g, '55129' || lpad(g::text, 8, '0'), '55129' || lpad(g::text, 8, '0') from generate_series(1, 5000) g;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, departamento_id, protocolo, ultima_entrada_em)
  select cA, kA1, k.id, dep_rec, 'V-' || k.id, now() - interval '1 hour' from public.nx_contatos k where k.cliente_id = cA and k.nome like 'Volume %';
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, status, wamid)
  select cv.cliente_id, cv.id, cv.contato_id, kA1, case when g % 2 = 0 then 'in' else 'out' end, 'texto', 'mensagem ' || g,
         case when g % 2 = 0 then 'recebida' else 'enviada' end, 'wamid.VOL-' || cv.id || '-' || g
    from public.nx_conversas cv cross join generate_series(1, 4) g
   where cv.cliente_id = cA and cv.protocolo like 'V-%';
  perform public.nx_pulso_lote_fim();
  perform set_config('nx.lote', '', true);
  perform set_config('nx.sem_historico', '', true);
  perform pg_temp.ok((select count(*) from public.nx_mensagens where cliente_id = cA) >= 20000, 'volume: 20.000 mensagens');
  update public.nx_departamentos set horario = null where id = dep_rec;

  t0 := clock_timestamp();
  for i in 1..20 loop
    perform public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-T' || i, '55129' || lpad((i * 97)::text, 8, '0'), 'mensagem de volume ' || i));
  end loop;
  ms := extract(epoch from clock_timestamp() - t0) * 1000 / 20;
  perform pg_temp.ok(ms < 150, 'lento nx_wa_entrada (contato existente) ' || round(ms, 1) || ' ms');
  t0 := clock_timestamp();
  for i in 1..20 loop
    perform public.nx_wa_entrada(kA1, pg_temp.msg('wamid.TESTE-F2-N' || i, '55139' || lpad(i::text, 8, '0'), 'contato novo ' || i));
  end loop;
  ms := extract(epoch from clock_timestamp() - t0) * 1000 / 20;
  perform pg_temp.ok(ms < 150, 'lento nx_wa_entrada (contato novo) ' || round(ms, 1) || ' ms');
  t0 := clock_timestamp();
  for i in 1..20 loop perform public.nx_cv_contexto_envio(ctx_adm, cA, cv1); end loop;
  ms := extract(epoch from clock_timestamp() - t0) * 1000 / 20;
  perform pg_temp.ok(ms < 50, 'lento nx_cv_contexto_envio ' || round(ms, 1) || ' ms');
  t0 := clock_timestamp();
  for i in 1..20 loop perform public.nx_ia_contexto(ctx_adm, cA, cv1); end loop;
  ms := extract(epoch from clock_timestamp() - t0) * 1000 / 20;
  perform pg_temp.ok(ms < 100, 'lento nx_ia_contexto ' || round(ms, 1) || ' ms');
  t0 := clock_timestamp();
  for i in 1..20 loop
    perform public.nx_wa_status(kA1, (select jsonb_agg(jsonb_build_object('id', 'wamid.VOL-' || (cv.id) || '-1', 'status', 'delivered'))
                                        from (select id from public.nx_conversas where cliente_id = cA and protocolo like 'V-%' order by id offset i * 10 limit 10) cv));
  end loop;
  ms := extract(epoch from clock_timestamp() - t0) * 1000 / 20;
  perform pg_temp.ok(ms < 100, 'lento nx_wa_status (10 recibos) ' || round(ms, 1) || ' ms');
  insert into public.nx_envios_fila (cliente_id, conversa_id, contato_id, canal_id, tipo, texto, origem)
  select cA, cv.id, cv.contato_id, kA1, 'texto', 'lote', 'automacao' from public.nx_conversas cv where cv.cliente_id = cA and cv.protocolo like 'V-%' limit 2000;
  t0 := clock_timestamp();
  j := public.nx_fila_pegar(100)::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  perform pg_temp.ok(jsonb_array_length(j) = 100 and ms < 300, 'lento nx_fila_pegar(100) com 2.000 pendentes ' || round(ms, 1) || ' ms');

  raise exception 'OK 05_funcoes: todos os casos passaram';
end $t$;

rollback;
