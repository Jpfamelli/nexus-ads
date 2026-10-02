-- ============================================================
-- ÓRBITA — 20261003a_codewords_gemea_midia.sql · revisão da mídia pelo CodeWords (02/10/2026)
--
-- Problema: a "gêmea" (saída do painel gravada com id provisório cw:<canal>:orbita-p-… e status pendente, à espera da
-- confirmação do aparelho) só era adotada quando havia TEXTO igual. Mídia sem legenda (áudio sempre; foto/arquivo sem
-- legenda) não tem texto: a sincronização e a saída do aparelho não casavam com nada e gravavam uma SEGUNDA bolha
-- «arquivo indisponível», deixando a original em «Status incerto» para sempre.
--
-- Correção: em nx_codewords_sync_gravar e nx_codewords_saida, quando o casamento por texto não acha nada e o item é
-- mídia, procurar a saída do painel com id provisório, com arquivo (midia ? 'path') e do mesmo tipo (vídeo sai do
-- aparelho como arquivo), ±5 min. O UPDATE que já existe troca o id provisório pelo real e passa pendente → enviada.
--
-- Forma: PATCH do corpo em vigor (pg_get_functiondef + replace), guardado por âncora ÚNICA e por marcador (idempotente:
-- a 2ª aplicação não faz nada). Se a âncora não estiver exatamente uma vez, a migração FALHA sem tocar em nada — melhor
-- que recriar a função a partir de uma cópia que pode ter ficado para trás. Só aditiva; nenhum dado alterado.
-- Teste: supabase/testes/17_codewords_gemea_midia.sql (begin … rollback; termina em exceção «OK_17…»).
-- ============================================================
set local lock_timeout = '5s';

do $patch$
declare
  v_def text; v_novo text; v_oid oid; v_n int;
  v_marca constant text := '-- gêmea de MÍDIA do painel';
  -- nx_codewords_sync_gravar: a âncora é o fim do casamento por texto, logo antes do "if v_tw.id is not null"
  a1 constant text := E'       order by x.id desc limit 1 for update;\n    end if;\n    if v_tw.id is not null then';
  b1 constant text := E'       order by x.id desc limit 1 for update;\n    end if;\n'
    || E'    -- gêmea de MÍDIA do painel com id provisório: sem texto para comparar, casa pelo tipo (vídeo sai como arquivo no aparelho)\n'
    || E'    if v_tw.id is null and coalesce((it ->> ''de_mim'')::boolean, false)\n'
    || E'       and v_tipo in (''imagem'', ''audio'', ''video'', ''documento'') then\n'
    || E'      select * into v_tw from public.nx_mensagens x\n'
    || E'       where x.conversa_id = cv.id and x.cliente_id = k.cliente_id and x.direcao = ''out''\n'
    || E'         and x.wamid like ''cw:'' || k.id::text || '':orbita-p-%''\n'
    || E'         and x.midia ? ''path''\n'
    || E'         and (x.tipo = v_tipo or (x.tipo = ''video'' and v_tipo = ''documento''))\n'
    || E'         and x.criado_em between v_em - interval ''5 minutes'' and v_em + interval ''5 minutes''\n'
    || E'       order by x.id limit 1 for update;\n'
    || E'    end if;\n'
    || E'    if v_tw.id is not null then';
  -- nx_codewords_saida: idem (ali tudo é saída, sem a condição de de_mim)
  a2 constant text := E'     for update;\n  end if;\n  if v_tw.id is not null then\n    v_eco :=';
  b2 constant text := E'     for update;\n  end if;\n'
    || E'  -- gêmea de MÍDIA do painel com id provisório: sem texto para comparar, casa pelo tipo (vídeo sai como arquivo no aparelho)\n'
    || E'  if v_tw.id is null and v_tipo in (''imagem'', ''audio'', ''video'', ''documento'') then\n'
    || E'    select * into v_tw from public.nx_mensagens x\n'
    || E'     where x.conversa_id = cv.id and x.cliente_id = k.cliente_id and x.direcao = ''out''\n'
    || E'       and x.wamid like ''cw:'' || k.id::text || '':orbita-p-%''\n'
    || E'       and x.midia ? ''path''\n'
    || E'       and (x.tipo = v_tipo or (x.tipo = ''video'' and v_tipo = ''documento''))\n'
    || E'       and x.criado_em between v_em - interval ''5 minutes'' and v_em + interval ''5 minutes''\n'
    || E'     order by x.id limit 1 for update;\n'
    || E'  end if;\n'
    || E'  if v_tw.id is not null then\n    v_eco :=';
begin
  -- 1. nx_codewords_sync_gravar(uuid, bigint, jsonb)
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'nx_codewords_sync_gravar'
     and pg_get_function_identity_arguments(p.oid) = 'p_canal uuid, p_conversa bigint, p_itens jsonb';
  if v_oid is null then raise exception 'nx_codewords_sync_gravar não encontrada'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position(v_marca in v_def) = 0 then
    v_n := (length(v_def) - length(replace(v_def, a1, ''))) / length(a1);
    if v_n <> 1 then raise exception 'nx_codewords_sync_gravar: âncora encontrada % vez(es), esperava 1 — nada alterado', v_n; end if;
    v_novo := replace(v_def, a1, b1);
    execute v_novo;
  end if;

  -- 2. nx_codewords_saida(uuid, jsonb)
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'nx_codewords_saida'
     and pg_get_function_identity_arguments(p.oid) = 'p_canal uuid, p_msg jsonb';
  if v_oid is null then raise exception 'nx_codewords_saida não encontrada'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position(v_marca in v_def) = 0 then
    v_n := (length(v_def) - length(replace(v_def, a2, ''))) / length(a2);
    if v_n <> 1 then raise exception 'nx_codewords_saida: âncora encontrada % vez(es), esperava 1 — nada alterado', v_n; end if;
    v_novo := replace(v_def, a2, b2);
    execute v_novo;
  end if;
end $patch$;

-- conferência: as duas funções levam o marcador
do $$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('nx_codewords_sync_gravar', 'nx_codewords_saida')
         and position('-- gêmea de MÍDIA do painel' in p.prosrc) > 0) <> 2 then
    raise exception 'patch da gêmea de mídia não ficou nas duas funções';
  end if;
end $$;
