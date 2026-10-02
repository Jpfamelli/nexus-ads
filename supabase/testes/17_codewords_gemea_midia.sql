-- ============================================================
-- ÓRBITA — supabase/testes/17_codewords_gemea_midia.sql · smoke de 20261003a_codewords_gemea_midia.sql
--   Mídia do painel gravada com id provisório (cw:<canal>:orbita-p-…, pendente) é ADOTADA pela saída do aparelho
--   (nx_codewords_saida) e pela sincronização (nx_codewords_sync_gravar) mesmo SEM texto: mesma linha, id real,
--   status enviada, nenhuma bolha nova. Texto continua casando como antes; mídia de outro tipo não casa.
-- Roda em begin … rollback. O bloco principal SEMPRE termina em exceção:
--   'OK_17_GEMEA_MIDIA …' = todos os casos passaram · 'FALHOU: <caso>' = falha
-- ============================================================
begin;

create or replace function pg_temp.ok(p boolean, p_caso text) returns void language plpgsql as $f$
begin
  if not coalesce(p, false) then raise exception 'FALHOU: %', p_caso; end if;
end $f$;

do $t$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  cA uuid; k uuid; ct bigint; cv bigint; m_audio bigint; m_foto bigint; m_video bigint; j json; n0 int; n1 int;
  tel text := '5512998301' || lpad((floor(random() * 900) + 100)::text, 3, '0');
begin
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-17-' || sfx, 'Teste 17', 'odonto') returning id into cA;
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor, codewords_api_segredo, codewords_phone_id, codewords_numero, codewords_conectado, codewords_rota)
    values (cA, 'Aparelho 17', null, 'codewords', gen_random_uuid(), 'ph-17-' || sfx, '+5512998300000', true, 'direta') returning id into k;
  insert into public.nx_contatos (cliente_id, nome, telefone, wa_id) values (cA, 'Paciente 17', tel, tel) returning id into ct;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status) values (cA, k, ct, '2026-17' || sfx, 'aberta') returning id into cv;

  -- saídas do painel com id provisório e status pendente (envio ambíguo): áudio sem texto, foto sem legenda, vídeo sem legenda
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, midia, wamid, status, origem)
    values (cA, cv, ct, k, 'out', 'audio', null, jsonb_build_object('path', cA::text || '/out/a.wav', 'mime', 'audio/wav', 'estado', 'ok'),
            'cw:' || k::text || ':orbita-p-' || sfx || 'a', 'pendente', 'painel') returning id into m_audio;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, midia, wamid, status, origem)
    values (cA, cv, ct, k, 'out', 'imagem', null, jsonb_build_object('path', cA::text || '/out/f.jpg', 'mime', 'image/jpeg', 'estado', 'ok'),
            'cw:' || k::text || ':orbita-p-' || sfx || 'f', 'pendente', 'painel') returning id into m_foto;
  insert into public.nx_mensagens (cliente_id, conversa_id, contato_id, canal_id, direcao, tipo, corpo, midia, wamid, status, origem)
    values (cA, cv, ct, k, 'out', 'video', null, jsonb_build_object('path', cA::text || '/out/v.mp4', 'mime', 'video/mp4', 'estado', 'ok'),
            'cw:' || k::text || ':orbita-p-' || sfx || 'v', 'pendente', 'painel') returning id into m_video;
  n0 := (select count(*) from public.nx_mensagens where conversa_id = cv);

  -- (1) saída do aparelho: áudio sem texto → adota a gêmea de áudio
  j := public.nx_codewords_saida(k, jsonb_build_object('telefone', tel, 'id', 'REAL17A' || sfx, 'tipo', 'audio', 'texto', null));
  perform pg_temp.ok((select wamid from public.nx_mensagens where id = m_audio) = 'cw:' || k::text || ':REAL17A' || sfx, 'saída: áudio adotou o id real');
  perform pg_temp.ok((select status from public.nx_mensagens where id = m_audio) = 'enviada', 'saída: áudio pendente virou enviada');
  perform pg_temp.ok((select count(*) from public.nx_mensagens where conversa_id = cv) = n0, 'saída: nenhuma bolha nova para o áudio');

  -- (2) sincronização: foto sem legenda (de_mim) → adota a gêmea de imagem; vídeo chega do aparelho como documento → adota a gêmea de vídeo
  j := public.nx_codewords_sync_gravar(k, cv, jsonb_build_array(
         jsonb_build_object('id', 'REAL17F' || sfx, 'de_mim', true, 'tipo', 'imagem', 'texto', null, 'em', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
         jsonb_build_object('id', 'REAL17V' || sfx, 'de_mim', true, 'tipo', 'documento', 'texto', null, 'em', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))));
  perform pg_temp.ok((select wamid from public.nx_mensagens where id = m_foto) = 'cw:' || k::text || ':REAL17F' || sfx, 'sync: foto adotou o id real ' || j::text);
  perform pg_temp.ok((select status from public.nx_mensagens where id = m_foto) = 'enviada', 'sync: foto pendente virou enviada');
  perform pg_temp.ok((select wamid from public.nx_mensagens where id = m_video) = 'cw:' || k::text || ':REAL17V' || sfx, 'sync: vídeo (documento no aparelho) adotou o id real');
  perform pg_temp.ok((select count(*) from public.nx_mensagens where conversa_id = cv) = n0, 'sync: nenhuma bolha nova');

  -- (3) repetir os mesmos ids não duplica nem desfaz
  j := public.nx_codewords_saida(k, jsonb_build_object('telefone', tel, 'id', 'REAL17A' || sfx, 'tipo', 'audio', 'texto', null));
  perform pg_temp.ok((select count(*) from public.nx_mensagens where conversa_id = cv) = n0, 'repetição do mesmo id não duplica');

  -- (4) mídia de tipo diferente, sem gêmea, continua entrando como bolha nova (comportamento de sempre)
  n1 := (select count(*) from public.nx_mensagens where conversa_id = cv);
  j := public.nx_codewords_saida(k, jsonb_build_object('telefone', tel, 'id', 'REAL17S' || sfx, 'tipo', 'sticker', 'texto', null));
  perform pg_temp.ok((select count(*) from public.nx_mensagens where conversa_id = cv) = n1 + 1, 'sticker sem gêmea vira bolha nova');

  -- (5) o marcador está nas duas funções
  perform pg_temp.ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname in ('nx_codewords_sync_gravar', 'nx_codewords_saida')
                         and position('-- gêmea de MÍDIA do painel' in p.prosrc) > 0) = 2, 'patch presente nas duas funções');

  raise exception 'OK_17_GEMEA_MIDIA — áudio, foto e vídeo do painel adotados pelo aparelho e pela sincronização, sem bolha nova';
end $t$;

rollback;
