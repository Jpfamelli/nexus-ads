-- ============================================================
-- ÓRBITA — recibos CodeWords antes/depois do eco de saída
-- Executar somente depois de 20260929a_codewords.sql.
-- Todo o fixture está em BEGIN/ROLLBACK; o DO termina em exceção
-- de sucesso para que o editor mostre o resultado sem persistir dados.
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
  c uuid; canal_a uuid; canal_b uuid; contato bigint; conversa_a bigint; conversa_b bigint;
  conta uuid; atendente uuid; j json;
  r json; estado text; n int;
begin
  insert into public.nx_clientes(slug,nome,vertical)
  values('teste-cw-' || substr(gen_random_uuid()::text,1,8),'Teste CodeWords','odonto') returning id into c;
  insert into public.nx_contas(email,nome,senha_hash,papel,aprovado)
  values('teste-cw-' || substr(gen_random_uuid()::text,1,8) || '@teste.local','Admin CodeWords','hash-falso','clinica',true)
  returning id into conta;
  insert into public.nx_contas(email,nome,senha_hash,papel,aprovado)
  values('teste-cw-at-' || substr(gen_random_uuid()::text,1,8) || '@teste.local','Atendente CodeWords','hash-falso','clinica',true)
  returning id into atendente;
  insert into public.nx_acessos(conta_id,cliente_id,papel,ver_todas,departamentos,recebe_conversas)
  values(conta,c,'admin',true,'{}',false);
  insert into public.nx_acessos(conta_id,cliente_id,papel,ver_todas,departamentos,recebe_conversas)
  values(atendente,c,'atendente',false,'{}',true);
  insert into public.nx_sessoes(token_hash,conta_id,expira_em)
  values(public.nx_hash('tok-cw-smoke'),conta,now()+interval '1 hour'),
        (public.nx_hash('tok-cw-atendente'),atendente,now()+interval '1 hour');
  insert into public.nx_canais(cliente_id,tipo,provedor,nome,numero_exibicao,codewords_service_id,status)
  values(c,'whatsapp_cloud','codewords','CW A','+5512991234567','teste-cw-a','ativo') returning id into canal_a;
  insert into public.nx_canais(cliente_id,tipo,provedor,nome,numero_exibicao,codewords_service_id,status)
  values(c,'whatsapp_cloud','codewords','CW B','+5512991234568','teste-cw-b','ativo') returning id into canal_b;
  insert into public.nx_contatos(cliente_id,nome,telefone,wa_id)
  values(c,'Contato CW','5512991234567','5512991234567') returning id into contato;
  insert into public.nx_conversas(cliente_id,canal_id,contato_id,protocolo,status)
  values(c,canal_a,contato,'TESTE-CW-A','aberta') returning id into conversa_a;
  insert into public.nx_conversas(cliente_id,canal_id,contato_id,protocolo,status)
  values(c,canal_b,contato,'TESTE-CW-B','aberta') returning id into conversa_b;

  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_canal_salvar(%L,%L,%L)',
    'tok-cw-atendente',c,jsonb_build_object('id',canal_a)))='sem_permissao',
    'atendente não pode configurar canal CodeWords');
  j := public.nx_codewords_canal_salvar('tok-cw-smoke',c,jsonb_build_object(
    'id',canal_a,'nome','CW A','numero_exibicao','+5512991234567',
    'codewords_service_id','teste-cw-a','codewords_api_key','cwk-test-only-unused-key-0000000000000000'));
  perform pg_temp.ok((j->'canal'->>'provedor')='codewords'
    and (j->'canal'->>'tem_codewords_api_key')::boolean,'canal salva chave sem retorná-la');
  perform pg_temp.ok(position('cwk-test-only' in j::text)=0
    and (j->>'webhook_url') ~ '/nx-codewords\?ch=[0-9a-f]{64}$','segredo só no Vault e URL de webhook emitida');
  perform pg_temp.ok((select public.nx_segredo_ler(codewords_api_segredo)='cwk-test-only-unused-key-0000000000000000'
    from public.nx_canais where id=canal_a),'chave de teste gravada no Vault');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_codewords_canal_salvar(%L,%L,%L)',
    'tok-cw-smoke',c,jsonb_build_object('id',canal_a,'rotacionar_webhook','talvez')))
    ='dados_invalidos|rotacionar_webhook','rotação inválida retorna erro de domínio');
  update public.nx_canais set status='ativo' where id=canal_a;

  r := public.nx_codewords_status(canal_a,'msg-early','delivered');
  perform pg_temp.ok((r->>'pendente')::boolean,'recibo antes do eco fica pendente');
  perform public.nx_codewords_status(canal_a,'msg-early','sent');
  perform public.nx_codewords_status(canal_a,'msg-early','failed','falha atrasada');
  select status into estado from public.nx_codewords_status_pendentes
   where canal_id=canal_a and provider_id='msg-early';
  perform pg_temp.ok(estado='delivered','recibos antecipados preservam o estado entregue');

  perform public.nx_codewords_status(canal_a,'msg-failed','failed','falha confirmada');
  perform public.nx_codewords_status(canal_a,'msg-failed','sent');
  select status into estado from public.nx_codewords_status_pendentes
   where canal_id=canal_a and provider_id='msg-failed';
  perform pg_temp.ok(estado='failed','envio enviado não regride falha confirmada');

  perform public.nx_codewords_status(canal_b,'msg-early','read');
  r := public.nx_codewords_saida(canal_a,jsonb_build_object(
    'id','msg-early','wa_id','5512991234567','text','resposta de teste'));
  select status into estado from public.nx_mensagens
   where cliente_id=c and canal_id=canal_a and wamid='cw:'||canal_a::text||':out:msg-early';
  perform pg_temp.ok(estado='entregue','eco aplica recibo antecipado ao canal A');
  perform pg_temp.ok(not exists(select 1 from public.nx_codewords_status_pendentes
    where canal_id=canal_a and provider_id='msg-early'),'pendência A consumida pelo eco');
  perform pg_temp.ok(exists(select 1 from public.nx_codewords_status_pendentes
    where canal_id=canal_b and provider_id='msg-early' and status='read'),'recibo homônimo do canal B fica isolado');

  perform public.nx_codewords_saida(canal_a,jsonb_build_object(
    'id','msg-early','wa_id','5512991234567','text','resposta repetida'));
  select count(*) into n from public.nx_mensagens
   where cliente_id=c and canal_id=canal_a and wamid='cw:'||canal_a::text||':out:msg-early';
  perform pg_temp.ok(n=1,'eco duplicado não duplica mensagem');
  perform public.nx_codewords_status(canal_a,'msg-early','failed','falha atrasada');
  select status into estado from public.nx_mensagens
   where cliente_id=c and canal_id=canal_a and wamid='cw:'||canal_a::text||':out:msg-early';
  perform pg_temp.ok(estado='entregue','falha atrasada não regride mensagem entregue');

  perform public.nx_codewords_saida(canal_a,jsonb_build_object(
    'id','msg-failed','wa_id','5512991234567','text','envio que falhou'));
  select status into estado from public.nx_mensagens
   where cliente_id=c and canal_id=canal_a and wamid='cw:'||canal_a::text||':out:msg-failed';
  perform pg_temp.ok(estado='falhou','falha antecipada aplicada ao eco');
  raise exception 'OK_10_CODEWORDS recibos ordenados, monotônicos e isolados';
end $t$;

rollback;
