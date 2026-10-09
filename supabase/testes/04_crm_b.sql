-- ============================================================
-- ÓRBITA — supabase/testes/04_crm_b.sql · frente F4 (CRM) · P0-B
-- Smoke do arquivo 20260928d_crm_b.sql: tarefas (T9), busca Ctrl/⌘+K,
-- importação em lotes (dedupe por telefone com/sem 55/9 e por e-mail,
-- etiquetas/empresas por nome, campos, negócio por linha, limite do plano),
-- empresas, editor de funis (tipos, marcos do Ads, etapa com negócios,
-- padrão, limite), excluir funil, campos, excluir etiqueta em páginas de
-- 2.000, motivos, papéis, isolamento por id e TEMPO (5.000 contatos,
-- 5.000 negócios, 2.000 conversas: cada chamada < 2 s).
-- Roda pelo execute_sql. TUDO em begin … rollback. Falha = 'FALHOU: <caso>'.
-- O último bloco termina com raise 'OK 04_crm_b — tempos…' (erro = sucesso).
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
  cA uuid; cB uuid;
  k_adm uuid; k_at uuid; k_res uuid; k_le uuid; k_sup uuid; k_b uuid;
  f_pac uuid; f_pos uuid; fB uuid; s_nova uuid; s_agend uuid; s_fechou uuid; s_pos1 uuid; s_pos2 uuid; sB uuid;
  e_impl uuid; eB uuid; m_novo uuid; m_preco uuid;
  ct1 bigint; ct2 bigint; ct3 bigint; ctB bigint; n1 bigint; n2 bigint; nB bigint; cv1 bigint; cv2 bigint;
  emp1 bigint; empB bigint; imp bigint; fN uuid; fAds uuid; st jsonb; x jsonb;
  j jsonb; linhas jsonb; i int; n int; ini timestamptz; s_ids uuid[];
begin
  -- ---------------------------------------------------------- cenário
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-f4b-a', 'Teste F4B A', 'odonto') returning id into cA;
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-f4b-b', 'Teste F4B B', 'oficina') returning id into cB;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f4b-adm@teste.local', 'Ana Admin', 'x', 'clinica', true) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f4b-at@teste.local', 'Beto Atendente', 'x', 'clinica', true) returning id into k_at;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f4b-res@teste.local', 'Duda Restrita', 'x', 'clinica', true) returning id into k_res;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f4b-le@teste.local', 'Eva Leitura', 'x', 'clinica', true) returning id into k_le;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f4b-sup@teste.local', 'Fábio Supervisor', 'x', 'clinica', true) returning id into k_sup;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado) values ('teste-f4b-b@teste.local', 'Gil B', 'x', 'clinica', true) returning id into k_b;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values
    (k_adm, cA, 'admin'), (k_at, cA, 'atendente'), (k_le, cA, 'leitura'), (k_sup, cA, 'supervisor'), (k_b, cB, 'admin');
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas) values (k_res, cA, 'atendente', false);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash('tok-f4b-adm'), k_adm, now() + interval '1 hour'), (public.nx_hash('tok-f4b-at'), k_at, now() + interval '1 hour'),
    (public.nx_hash('tok-f4b-res'), k_res, now() + interval '1 hour'), (public.nx_hash('tok-f4b-le'), k_le, now() + interval '1 hour'),
    (public.nx_hash('tok-f4b-sup'), k_sup, now() + interval '1 hour'), (public.nx_hash('tok-f4b-b'), k_b, now() + interval '1 hour');
  select id into f_pac from public.nx_funis where cliente_id = cA and padrao;
  select id into f_pos from public.nx_funis where cliente_id = cA and not conta_no_ads;
  select id into s_nova from public.nx_estagios where funil_id = f_pac and marco = 'nova';
  select id into s_agend from public.nx_estagios where funil_id = f_pac and marco = 'agendada';
  select id into s_fechou from public.nx_estagios where funil_id = f_pac and marco = 'fechou';
  select id into s_pos1 from public.nx_estagios where funil_id = f_pos order by ordem limit 1;
  select id into s_pos2 from public.nx_estagios where funil_id = f_pos order by ordem offset 1 limit 1;
  select id into fB from public.nx_funis where cliente_id = cB and padrao;
  select id into sB from public.nx_estagios where funil_id = fB order by ordem limit 1;
  select id into e_impl from public.nx_etiquetas where cliente_id = cA and nome = 'Implante';
  select id into eB from public.nx_etiquetas where cliente_id = cB limit 1;
  select id into m_preco from public.nx_motivos_perda where cliente_id = cA and nome = 'Preço';

  -- contatos e negócios base
  ct1 := (public.nx_contato_salvar('tok-f4b-at', cA, '{"nome":"João da Silva","telefone":"(12) 99830-3030","dono_id":null}')::jsonb ->> 'id')::bigint;
  ct2 := (public.nx_contato_salvar('tok-f4b-at', cA, '{"nome":"Joana Prado","telefone":"12 98111-2222","dono_id":null}')::jsonb ->> 'id')::bigint;
  ct3 := (public.nx_contato_salvar('tok-f4b-sup', cA, jsonb_build_object('nome', 'Maria João', 'email', 'maria@teste.local', 'dono_id', k_sup))::jsonb ->> 'id')::bigint;
  ctB := (public.nx_contato_salvar('tok-f4b-b', cB, '{"nome":"João de B","telefone":"12 97777-1111"}')::jsonb ->> 'id')::bigint;
  n1 := (public.nx_negocio_salvar('tok-f4b-at', cA, jsonb_build_object('contato_id', ct1, 'titulo', 'Implante superior', 'valor_previsto', 3500, 'dono_id', null))::jsonb ->> 'id')::bigint;
  n2 := (public.nx_negocio_salvar('tok-f4b-sup', cA, jsonb_build_object('contato_id', ct3, 'titulo', 'Clareamento'))::jsonb ->> 'id')::bigint;
  nB := (public.nx_negocio_salvar('tok-f4b-b', cB, jsonb_build_object('contato_id', ctB, 'titulo', 'Freio'))::jsonb ->> 'id')::bigint;

  -- ---------------------------------------------------------- nx_tarefas_listar (T9)
  insert into public.nx_tarefas (cliente_id, titulo, vence_em, dono_id, negocio_id, contato_id) values
    (cA, 'Hoje', (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '23 hours 59 minutes') at time zone 'America/Sao_Paulo', k_at, n1, ct1),
    (cA, 'Atrasada', now() - interval '2 days', k_at, n1, ct1),
    (cA, 'Próxima', now() + interval '3 days', k_at, null, ct2),
    (cA, 'Sem data', null, k_at, null, null),
    (cA, 'Do supervisor', now() + interval '5 days', k_sup, n1, ct1),
    (cA, 'Da restrita', now() - interval '1 day', k_res, null, null);
  insert into public.nx_tarefas (cliente_id, titulo, vence_em, dono_id, concluida_em) values (cA, 'Feita', now() - interval '1 day', k_at, now());
  j := public.nx_tarefas_listar('tok-f4b-at', cA, '{"situacao":"hoje"}')::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'itens') = 1 and j -> 'itens' -> 0 ->> 'titulo' = 'Hoje', 'tarefas: aba Hoje');
  perform pg_temp.ok((j -> 'contagens' ->> 'hoje')::int = 1 and (j -> 'contagens' ->> 'atrasadas')::int = 1 and (j -> 'contagens' ->> 'proximas')::int = 2,
                     'tarefas: contagens (hoje 1, atrasadas 1, próximas 2 com a sem data)');
  j := public.nx_tarefas_listar('tok-f4b-at', cA, '{"situacao":"atrasadas"}')::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'itens') = 1 and (j -> 'itens' -> 0 ->> 'atrasada')::boolean, 'tarefas: aba Atrasadas');
  j := public.nx_tarefas_listar('tok-f4b-at', cA, '{"situacao":"proximas"}')::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'itens') = 2 and j -> 'itens' -> 1 ->> 'titulo' = 'Sem data', 'tarefas: Próximas, sem data por último');
  j := public.nx_tarefas_listar('tok-f4b-at', cA, '{"situacao":"concluidas"}')::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'itens') = 1 and j -> 'itens' -> 0 ->> 'titulo' = 'Feita', 'tarefas: Concluídas');
  j := public.nx_tarefas_listar('tok-f4b-at', cA, '{"situacao":"abertas","dono":"todos"}')::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'itens') = 4, 'tarefas: atendente com "todos" continua vendo só as suas');
  j := public.nx_tarefas_listar('tok-f4b-sup', cA, '{"situacao":"abertas","dono":"todos"}')::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'itens') = 6, 'tarefas: supervisor vê todas');
  j := public.nx_tarefas_listar('tok-f4b-sup', cA, jsonb_build_object('situacao', 'abertas', 'dono', k_res))::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'itens') = 1, 'tarefas: supervisor filtra por pessoa');
  j := public.nx_tarefas_listar('tok-f4b-at', cA, jsonb_build_object('negocio_id', n1))::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'itens') = 3, 'tarefas: por negócio mostra as de todos no negócio');
  perform pg_temp.ok(j -> 'itens' -> 0 -> 'negocio' ->> 'titulo' = 'Implante superior' and j -> 'itens' -> 0 -> 'contato' ->> 'nome' = 'João da Silva', 'tarefas: vínculos negócio/contato');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_tarefas_listar(%L,%L,%L)', 'tok-f4b-at', cA, jsonb_build_object('negocio_id', nB))) = 'negocio_nao_encontrado', 'tarefas: negócio de outro cliente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_tarefas_listar(%L,%L,%L)', 'tok-f4b-res', cA, jsonb_build_object('negocio_id', n2))) = 'negocio_nao_encontrado', 'tarefas: restrita não abre negócio de colega');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_tarefas_listar(%L,%L,%L)', 'tok-f4b-at', cA, '{"situacao":"x"}')) = 'dados_invalidos|situacao', 'tarefas: situação inválida');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_tarefas_listar(%L,%L,%L)', 'tok-f4b-b', cA, '{}')) = 'sem_acesso', 'tarefas: conta de outro cliente');

  -- ---------------------------------------------------------- nx_buscar
  insert into public.nx_conversas (cliente_id, contato_id, protocolo, status, atribuida_a) values (cA, ct1, '2026-000777', 'aberta', k_at) returning id into cv1;
  insert into public.nx_conversas (cliente_id, contato_id, protocolo, status, atribuida_a) values (cA, ct3, '2026-000778', 'aberta', k_sup) returning id into cv2;
  j := public.nx_buscar('tok-f4b-le', cA, 'joa')::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'contatos') = 3, 'buscar: 3 contatos com "joa" (sem acento)');
  perform pg_temp.ok((j -> 'contatos' -> 2 ->> 'id')::bigint = ct3, 'buscar: início de palavra depois do começo do texto');
  j := public.nx_buscar('tok-f4b-le', cA, 'impl')::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'negocios') = 1 and j -> 'negocios' -> 0 ->> 'estagio_nome' = 'Nova conversa'
                     and j -> 'negocios' -> 0 ->> 'contato_nome' = 'João da Silva', 'buscar: negócio por título com etapa e contato');
  j := public.nx_buscar('tok-f4b-le', cA, '98303')::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'contatos') = 1 and jsonb_array_length(j -> 'conversas') = 1, 'buscar: dígitos → telefone (contato e conversa)');
  j := public.nx_buscar('tok-f4b-le', cA, '2026-000778')::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'conversas') = 1 and j -> 'conversas' -> 0 ->> 'contato_nome' = 'Maria João', 'buscar: conversa por protocolo');
  j := public.nx_buscar('tok-f4b-res', cA, 'joa')::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'contatos') = 2 and jsonb_array_length(j -> 'conversas') = 0, 'buscar: restrita não vê contato nem conversa de colega');
  j := public.nx_buscar('tok-f4b-le', cA, 'j')::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'contatos') = 0 and jsonb_array_length(j -> 'negocios') = 0, 'buscar: menos de 2 letras → vazio');
  j := public.nx_buscar('tok-f4b-le', cA, 'freio')::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'negocios') = 0, 'buscar: nada de outro cliente');

  -- ---------------------------------------------------------- campos personalizados
  j := public.nx_campo_salvar('tok-f4b-adm', cA, '{"entidade":"contato","rotulo":"Convênio","tipo":"opcao","opcoes":["Unimed","Amil","unimed",""]}')::jsonb;
  perform pg_temp.ok(j ->> 'chave' = 'convenio' and j -> 'opcoes' = '["Unimed","Amil"]'::jsonb, 'campo: chave gerada do rótulo e opções sem repetir');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_campo_salvar(%L,%L,%L)', 'tok-f4b-adm', cA, '{"entidade":"contato","rotulo":"convênio","tipo":"texto"}')) = 'dados_invalidos|rotulo_em_uso', 'campo: rótulo repetido');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_campo_salvar(%L,%L,%L)', 'tok-f4b-adm', cA, '{"entidade":"contato","rotulo":"Plano","tipo":"opcao","opcoes":[]}')) = 'dados_invalidos|opcoes', 'campo: opção sem opções');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_campo_salvar(%L,%L,%L)', 'tok-f4b-adm', cA, jsonb_build_object('id', j ->> 'id', 'chave', 'outra'))) = 'dados_invalidos|chave', 'campo: chave não muda');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_campo_salvar(%L,%L,%L)', 'tok-f4b-adm', cA, jsonb_build_object('entidade', 'negocio', 'rotulo', 'Dente', 'tipo', 'texto', 'funil_id', fB))) = 'funil_invalido|nao_encontrado', 'campo: funil de outro cliente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_campo_salvar(%L,%L,%L)', 'tok-f4b-sup', cA, '{"entidade":"contato","rotulo":"X","tipo":"texto"}')) = 'sem_permissao', 'campo: supervisor não configura');
  x := public.nx_campo_salvar('tok-f4b-adm', cA, '{"entidade":"contato","rotulo":"Convênio","tipo":"opcao","opcoes":["Unimed","Amil"],"obrigatorio":false,"chave":"convenio2"}'::jsonb || '{"rotulo":"Plano de saúde"}')::jsonb;
  perform pg_temp.ok(x ->> 'chave' = 'convenio2', 'campo: chave informada vale na criação');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_campo_salvar(%L,%L,%L)', 'tok-f4b-adm', cA, '{"entidade":"contato","rotulo":"Outro","tipo":"texto","chave":"convenio"}')) = 'dados_invalidos|chave_em_uso', 'campo: chave em uso');
  j := public.nx_campo_salvar('tok-f4b-adm', cA, jsonb_build_object('id', x ->> 'id', 'obrigatorio', true, 'opcoes', jsonb_build_array('A', 'B', 'C')))::jsonb;
  perform pg_temp.ok((j ->> 'obrigatorio')::boolean and jsonb_array_length(j -> 'opcoes') = 3 and j ->> 'rotulo' = 'Plano de saúde', 'campo: editar só as chaves presentes');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contato_salvar(%L,%L,%L)', 'tok-f4b-at', cA, '{"nome":"Sem plano"}')) = 'campo_obrigatorio|convenio2', 'campo obrigatório de contato bloqueia salvar');
  perform public.nx_contato_salvar('tok-f4b-at', cA, jsonb_build_object('id', ct2, 'campos', jsonb_build_object('convenio2', 'A')));
  j := public.nx_campo_excluir('tok-f4b-adm', cA, (x ->> 'id')::uuid)::jsonb;
  perform pg_temp.ok((j ->> 'ok')::boolean and (select campos ->> 'convenio2' from public.nx_contatos where id = ct2) = 'A', 'campo excluído: valor fica no JSON (oculto)');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_campo_excluir(%L,%L,%L)', 'tok-f4b-adm', cA, (x ->> 'id'))) = 'campo_nao_encontrado', 'campo: excluir de novo');
  for i in 1 .. 49 loop
    perform public.nx_campo_salvar('tok-f4b-adm', cA, jsonb_build_object('entidade', 'empresa', 'rotulo', 'Campo ' || i, 'tipo', 'texto'));
  end loop;
  perform public.nx_campo_salvar('tok-f4b-adm', cA, '{"entidade":"empresa","rotulo":"Campo 50","tipo":"texto"}');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_campo_salvar(%L,%L,%L)', 'tok-f4b-adm', cA, '{"entidade":"empresa","rotulo":"Campo 51","tipo":"texto"}')) = 'dados_invalidos|max_campos', 'campo: máximo de 50 por entidade');
  delete from public.nx_campos where cliente_id = cA and entidade = 'empresa';

  -- ---------------------------------------------------------- empresas (T8)
  j := public.nx_empresa_salvar('tok-f4b-at', cA, '{"nome":"Frota Vale","cidade":"Taubaté","uf":"sp","site":"frotavale.com.br","telefone":"(12) 3333-4444"}')::jsonb;
  emp1 := (j ->> 'id')::bigint;
  perform pg_temp.ok(j ->> 'uf' = 'SP' and j ->> 'site' = 'https://frotavale.com.br' and j ->> 'telefone' = '551233334444' and not (j ? 'busca'), 'empresa: normaliza UF, site e telefone');
  empB := (public.nx_empresa_salvar('tok-f4b-b', cB, '{"nome":"Empresa B"}')::jsonb ->> 'id')::bigint;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_empresa_salvar(%L,%L,%L)', 'tok-f4b-at', cA, '{"cidade":"x"}')) = 'dados_invalidos|nome', 'empresa: nome obrigatório');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_empresa_salvar(%L,%L,%L)', 'tok-f4b-le', cA, '{"nome":"x"}')) = 'sem_permissao', 'empresa: leitura não cria');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_empresa_salvar(%L,%L,%L)', 'tok-f4b-at', cA, jsonb_build_object('id', empB, 'nome', 'roubada'))) = 'empresa_nao_encontrada', 'empresa: id de outro cliente');
  perform public.nx_contato_salvar('tok-f4b-at', cA, jsonb_build_object('id', ct1, 'empresa_id', emp1));
  perform public.nx_contato_salvar('tok-f4b-sup', cA, jsonb_build_object('id', ct3, 'empresa_id', emp1));
  j := public.nx_empresas_listar('tok-f4b-le', cA, '{"busca":"taubate"}')::jsonb;
  perform pg_temp.ok((j ->> 'total')::int = 1 and (j -> 'itens' -> 0 ->> 'contatos')::int = 2 and (j -> 'itens' -> 0 ->> 'negocios_abertos')::int = 2, 'empresas: busca sem acento com contagens');
  j := public.nx_empresas_listar('tok-f4b-le', cA, '{}')::jsonb;
  perform pg_temp.ok((j ->> 'total')::int = 1 and not (j ->> 'tem_mais')::boolean, 'empresas: só as do cliente');
  j := public.nx_empresa_ver('tok-f4b-le', cA, emp1)::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'contatos') = 2 and jsonb_array_length(j -> 'negocios') = 2 and j -> 'empresa' ->> 'nome' = 'Frota Vale', 'empresa: ficha com contatos e negócios');
  j := public.nx_empresa_ver('tok-f4b-res', cA, emp1)::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'contatos') = 1 and jsonb_array_length(j -> 'negocios') = 1, 'empresa: restrita vê só o que é dela ou sem dono');
  -- (revisão) a LISTA conta com a mesma visibilidade da ficha: antes a restrita via "2 contatos · 2 negócios" e a ficha mostrava 1
  j := public.nx_empresas_listar('tok-f4b-res', cA, '{"busca":"taubate"}')::jsonb;
  perform pg_temp.ok((j -> 'itens' -> 0 ->> 'contatos')::int = 1 and (j -> 'itens' -> 0 ->> 'negocios_abertos')::int = 1,
                     'empresas: contagens da restrita = o que a ficha mostra');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_empresa_ver(%L,%L,%s)', 'tok-f4b-adm', cA, empB)) = 'empresa_nao_encontrada', 'empresa: ver de outro cliente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_empresa_excluir(%L,%L,%s)', 'tok-f4b-at', cA, emp1)) = 'sem_permissao', 'empresa: atendente não exclui');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_empresa_excluir(%L,%L,%s)', 'tok-f4b-adm', cA, empB)) = 'empresa_nao_encontrada', 'empresa: excluir de outro cliente');
  perform pg_temp.ok((select count(*) from public.nx_empresas where id = empB) = 1, 'empresa de B intacta');

  -- ---------------------------------------------------------- motivos
  j := public.nx_motivo_salvar('tok-f4b-adm', cA, '{"nome":"Mudou de cidade","exige_texto":true}')::jsonb;
  m_novo := (j ->> 'id')::uuid;
  perform pg_temp.ok((j ->> 'exige_texto')::boolean and (j ->> 'ativo')::boolean
                     and (j ->> 'ordem')::int = (select max(ordem) from public.nx_motivos_perda where cliente_id = cA)
                     and (select count(*) from public.nx_motivos_perda where cliente_id = cA and ordem = (j ->> 'ordem')::int) = 1, 'motivo: criar no fim da lista');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_motivo_salvar(%L,%L,%L)', 'tok-f4b-adm', cA, '{"nome":"preço"}')) = 'dados_invalidos|nome_em_uso', 'motivo: nome repetido');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_motivo_salvar(%L,%L,%L)', 'tok-f4b-at', cA, '{"nome":"x"}')) = 'sem_permissao', 'motivo: atendente não configura');
  j := public.nx_motivo_excluir('tok-f4b-adm', cA, m_novo)::jsonb;
  perform pg_temp.ok(not (j ->> 'desativado')::boolean and not exists (select 1 from public.nx_motivos_perda where id = m_novo), 'motivo sem uso: apagado');
  perform public.nx_negocio_mover('tok-f4b-at', cA, n1, (select id from public.nx_estagios where funil_id = f_pac and marco = 'nao_fechou'), null,
                                  jsonb_build_object('motivo_perda_id', m_preco));
  j := public.nx_motivo_excluir('tok-f4b-adm', cA, m_preco)::jsonb;
  perform pg_temp.ok((j ->> 'desativado')::boolean and (select not ativo from public.nx_motivos_perda where id = m_preco), 'motivo usado: só desativado');
  perform pg_temp.ok(not exists (select 1 from json_array_elements(public.nx_crm_base('tok-f4b-le', cA) -> 'motivos') m where m ->> 'id' = m_preco::text), 'motivo desativado some da base');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_motivo_excluir(%L,%L,%L)', 'tok-f4b-adm', cA, (select id from public.nx_motivos_perda where cliente_id = cB limit 1))) = 'motivo_nao_encontrado', 'motivo: de outro cliente');
  perform public.nx_negocio_mover('tok-f4b-at', cA, n1, s_nova);   -- reabre

  -- ---------------------------------------------------------- funis: criar / validar
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_salvar(%L,%L,%L)', 'tok-f4b-sup', cA, '{"nome":"X","estagios":[]}')) = 'sem_permissao', 'funil: supervisor não configura');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_salvar(%L,%L,%L)', 'tok-f4b-adm', cA,
    '{"nome":"Só abertas","estagios":[{"nome":"A"},{"nome":"B"}]}')) = 'funil_invalido|tipos', 'funil: precisa aberto, ganho e perdido');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_salvar(%L,%L,%L)', 'tok-f4b-adm', cA,
    '{"nome":"Ads sem marco","conta_no_ads":true,"estagios":[{"nome":"A","marco":"nova"},{"nome":"G","tipo":"ganho"},{"nome":"P","tipo":"perdido","marco":"perdida"}]}')) = 'funil_invalido|marco_obrigatorio',
    'funil do Ads sem marco → funil_invalido');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_salvar(%L,%L,%L)', 'tok-f4b-adm', cA,
    '{"nome":"Ads sem nova","conta_no_ads":true,"estagios":[{"nome":"A","marco":"agendada"},{"nome":"G","tipo":"ganho","marco":"fechou"},{"nome":"P","tipo":"perdido","marco":"perdida"}]}')) = 'funil_invalido|marcos',
    'funil do Ads sem os marcos nova e fechou');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_salvar(%L,%L,%L)', 'tok-f4b-adm', cA,
    '{"nome":"Marco errado","conta_no_ads":true,"estagios":[{"nome":"A","marco":"nova"},{"nome":"G","tipo":"ganho","marco":"nova"},{"nome":"P","tipo":"perdido","marco":"perdida"}]}')) = 'funil_invalido|marco_tipo',
    'funil: marco incompatível com o tipo');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_salvar(%L,%L,%L)', 'tok-f4b-adm', cA,
    '{"nome":"pacientes","estagios":[{"nome":"A"},{"nome":"G","tipo":"ganho"},{"nome":"P","tipo":"perdido"}]}')) = 'funil_invalido|nome_em_uso', 'funil: nome repetido');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_salvar(%L,%L,%L)', 'tok-f4b-adm', cA,
    '{"nome":"Rep","estagios":[{"nome":"A"},{"nome":"a"},{"nome":"G","tipo":"ganho"},{"nome":"P","tipo":"perdido"}]}')) = 'funil_invalido|etapa_repetida', 'funil: etapa repetida');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_salvar(%L,%L,%L)', 'tok-f4b-adm', cA,
    '{"nome":"Padrão fora","padrao":true,"estagios":[{"nome":"A"},{"nome":"G","tipo":"ganho"},{"nome":"P","tipo":"perdido"}]}')) = 'funil_invalido|padrao_sem_ads', 'funil padrão precisa contar no Ads');
  j := public.nx_funil_salvar('tok-f4b-adm', cA,
    '{"nome":"Indicações","estagios":[{"nome":"Recebida","marco":"nova","sla_horas":24},{"nome":"Contato feito","probabilidade":40},{"nome":"Virou paciente","tipo":"ganho"},{"nome":"Não virou","tipo":"perdido"}]}')::jsonb;
  fN := (j ->> 'id')::uuid; st := j -> 'estagios';
  perform pg_temp.ok(jsonb_array_length(st) = 4 and (st -> 0 ->> 'ordem')::int = 1 and st -> 0 ->> 'marco' is null and (st -> 0 ->> 'sla_horas')::int = 24
                     and (st -> 2 ->> 'probabilidade')::int = 100 and (st -> 1 ->> 'probabilidade')::int = 40 and st -> 0 ->> 'cor' ~ '^#[0-9A-F]{6}$'
                     and not (j ->> 'conta_no_ads')::boolean and not (j ->> 'padrao')::boolean,
                     'funil fora do Ads: marco ignorado, probabilidade/cor padrão, ordem do array');
  -- negócios no funil novo
  ini := clock_timestamp();
  perform public.nx_negocio_salvar('tok-f4b-at', cA, jsonb_build_object('contato_id', ct2, 'funil_id', fN, 'titulo', 'Ind 1'));
  perform public.nx_negocio_salvar('tok-f4b-at', cA, jsonb_build_object('contato_id', ct2, 'funil_id', fN, 'titulo', 'Ind 2', 'estagio_id', st -> 1 ->> 'id'));
  -- remover etapa com negócios sem destino
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_salvar(%L,%L,%L)', 'tok-f4b-adm', cA, jsonb_build_object('id', fN,
      'estagios', jsonb_build_array(st -> 1, st -> 2, st -> 3)))) = 'estagio_com_negocios|1', 'remover etapa com negócios → estagio_com_negocios (hint = quantidade)');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_salvar(%L,%L,%L)', 'tok-f4b-adm', cA, jsonb_build_object('id', fN,
      'estagios', jsonb_build_array(st -> 1, st -> 2, st -> 3), 'mover', jsonb_build_object(st -> 0 ->> 'id', st -> 2 ->> 'id')))) = 'estagio_invalido|destino_tipo', 'mover para etapa de outro tipo');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_salvar(%L,%L,%L)', 'tok-f4b-adm', cA, jsonb_build_object('id', fN,
      'estagios', jsonb_build_array(st -> 0, (st -> 1) || '{"tipo":"ganho"}', st -> 2, st -> 3)))) = 'funil_invalido|etapa_com_negocios', 'etapa com negócios não muda de tipo');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_salvar(%L,%L,%L)', 'tok-f4b-adm', cA, jsonb_build_object('id', fN, 'conta_no_ads', true,
      'estagios', st))) = 'funil_invalido|entra_no_ads', 'funil com negócios não muda de lado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_salvar(%L,%L,%L)', 'tok-f4b-adm', cA, jsonb_build_object('id', fN,
      'estagios', jsonb_build_array(jsonb_build_object('id', sB, 'nome', 'x'), st -> 2, st -> 3)))) = 'estagio_invalido', 'etapa de outro cliente no array');
  j := public.nx_funil_salvar('tok-f4b-adm', cA, jsonb_build_object('id', fN, 'nome', 'Indicações 2',
      'estagios', jsonb_build_array((st -> 1) || '{"nome":"Em contato"}', jsonb_build_object('nome', 'Proposta', 'cor', '#a98bd6'), st -> 2, st -> 3),
      'mover', jsonb_build_object(st -> 0 ->> 'id', st -> 1 ->> 'id')))::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'estagios') = 4 and j -> 'estagios' -> 0 ->> 'nome' = 'Em contato' and j -> 'estagios' -> 1 ->> 'cor' = '#A98BD6'
                     and j ->> 'nome' = 'Indicações 2', 'editar funil: renomeia, cria etapa nova na posição e remove a antiga');
  perform pg_temp.ok((select count(*) from public.nx_leads where funil_id = fN and estagio_id = (st -> 1 ->> 'id')::uuid) = 2
                     and not exists (select 1 from public.nx_estagios where id = (st -> 0 ->> 'id')::uuid), 'negócios movidos para o destino e etapa apagada');
  -- padrão
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_salvar(%L,%L,%L)', 'tok-f4b-adm', cA, jsonb_build_object('id', f_pac, 'padrao', false))) = 'funil_invalido|precisa_padrao', 'não desliga o único padrão');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_salvar(%L,%L,%L)', 'tok-f4b-adm', cA, jsonb_build_object('id', f_pac, 'conta_no_ads', false, 'padrao', false))) = 'funil_invalido|sai_do_ads', 'funil do Ads com negócios não sai do Ads');
  j := public.nx_funil_salvar('tok-f4b-adm', cA,
    '{"nome":"Ads 2","conta_no_ads":true,"padrao":true,"estagios":[{"nome":"Nova","marco":"nova"},{"nome":"Agendou","marco":"agendada"},{"nome":"Fechou","tipo":"ganho","marco":"fechou"},{"nome":"Perdeu","tipo":"perdido","marco":"perdida"}]}')::jsonb;
  fAds := (j ->> 'id')::uuid;
  perform pg_temp.ok((j ->> 'padrao')::boolean and not (select padrao from public.nx_funis where id = f_pac) and (select count(*) from public.nx_funis where cliente_id = cA and padrao) = 1,
                     'um só padrão: ligar um desliga o outro');
  perform public.nx_funil_salvar('tok-f4b-adm', cA, jsonb_build_object('id', f_pac, 'padrao', true));
  -- limite de funis ativos
  update public.nx_clientes set limites = '{"funis": 4}' where id = cA;   -- ativos: Pacientes, Pós-tratamento, Indicações 2, Ads 2
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_salvar(%L,%L,%L)', 'tok-f4b-adm', cA,
    '{"nome":"Quinto","estagios":[{"nome":"A"},{"nome":"G","tipo":"ganho"},{"nome":"P","tipo":"perdido"}]}')) = 'limite_plano|funis:4', 'limite de funis do plano');
  j := public.nx_funil_salvar('tok-f4b-adm', cA, '{"nome":"Quinto inativo","ativo":false,"estagios":[{"nome":"A"},{"nome":"G","tipo":"ganho"},{"nome":"P","tipo":"perdido"}]}')::jsonb;
  perform pg_temp.ok(not (j ->> 'ativo')::boolean, 'funil inativo não conta no limite');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_salvar(%L,%L,%L)', 'tok-f4b-adm', cA, jsonb_build_object('id', j ->> 'id', 'ativo', true))) = 'limite_plano|funis:4', 'reativar respeita o limite');
  update public.nx_clientes set limites = '{}' where id = cA;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_salvar(%L,%L,%L)', 'tok-f4b-adm', cA, jsonb_build_object('id', fB, 'nome', 'roubado'))) = 'funil_invalido|nao_encontrado', 'funil de outro cliente');

  -- ---------------------------------------------------------- excluir funil
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_excluir(%L,%L,%L,null)', 'tok-f4b-adm', cA, f_pac)) = 'funil_invalido|padrao', 'não exclui o funil padrão');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_excluir(%L,%L,%L,null)', 'tok-f4b-adm', cA, fN)) = 'estagio_com_negocios|2', 'excluir funil com negócios exige destino');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_excluir(%L,%L,%L,%L)', 'tok-f4b-adm', cA, fN, s_nova)) = 'funil_invalido|entra_no_ads', 'destino no funil do Ads para funil fora do Ads');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_excluir(%L,%L,%L,%L)', 'tok-f4b-adm', cA, fN, sB)) = 'estagio_invalido|destino', 'destino de outro cliente');
  -- um ganho no funil fN (fora do Ads) vai para a etapa ganha do destino
  perform public.nx_negocio_mover('tok-f4b-at', cA, (select id from public.nx_leads where funil_id = fN order by id limit 1),
                                  (select id from public.nx_estagios where funil_id = fN and tipo = 'ganho'), null, '{"valor":900}');
  j := public.nx_funil_excluir('tok-f4b-adm', cA, fN, s_pos1)::jsonb;
  perform pg_temp.ok((j ->> 'movidos')::int = 2 and (j ->> 'excluido')::boolean and (j ->> 'restantes')::int = 0
                     and not exists (select 1 from public.nx_funis where id = fN), 'excluir funil: negócios movidos e funil apagado');
  perform pg_temp.ok((select count(*) from public.nx_leads l join public.nx_estagios e on e.id = l.estagio_id
                       where l.funil_id = f_pos and l.titulo in ('Ind 1', 'Ind 2') and ((l.status = 'ganho' and e.tipo = 'ganho' and l.valor = 900) or (l.status = 'aberto' and e.id = s_pos1))) = 2,
                     'excluir funil: ganho continua ganho (com valor), aberto vai para a etapa escolhida');
  perform public.nx_negocio_salvar('tok-f4b-at', cA, jsonb_build_object('contato_id', ct2, 'funil_id', fAds, 'titulo', 'No Ads 2'));
  perform public.nx_negocio_mover('tok-f4b-at', cA, (select id from public.nx_leads where funil_id = fAds limit 1),
                                  (select id from public.nx_estagios where funil_id = fAds and tipo = 'ganho'), null, '{"valor":100}');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_funil_excluir(%L,%L,%L,%L)', 'tok-f4b-adm', cA, fAds, s_nova)) = 'funil_invalido|tem_fechados', 'funil do Ads com fechados não é excluído (desativar)');

  -- ---------------------------------------------------------- importação
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contatos_importar(%L,%L,%L,%L)', 'tok-f4b-at', cA, '[]', '{}')) = 'sem_permissao', 'importar: atendente não importa');
  select jsonb_agg(jsonb_build_object('nome', 'X' || g)) into linhas from generate_series(1, 101) g;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contatos_importar(%L,%L,%L,%L)', 'tok-f4b-sup', cA, linhas, '{}')) = 'dados_invalidos|linhas', 'importar: mais de 100 linhas');
  -- lote 1: 100 linhas, 10 repetidas dentro do lote com outro formato (sem 55 / sem o 9) e 1 já cadastrado (ct1 sem o 9)
  select jsonb_agg(case
           when g <= 89 then jsonb_build_object('nome', 'Paciente ' || g, 'telefone', '(12) 9' || lpad((70000000 + g)::text, 8, '0'))
           when g <= 99 then jsonb_build_object('nome', 'Paciente ' || (g - 89) || ' dup', 'telefone', '5512' || lpad((70000000 + g - 89)::text, 8, '0'))
           else jsonb_build_object('nome', 'João de novo', 'telefone', '551298303030') end order by g)
    into linhas from generate_series(1, 100) g;
  ini := clock_timestamp();
  j := public.nx_contatos_importar('tok-f4b-sup', cA, linhas, '{"arquivo":"pacientes.csv"}')::jsonb;
  perform pg_temp.ok(extract(epoch from clock_timestamp() - ini) < 2, 'importar: lote 1 < 2 s');
  imp := (j ->> 'importacao_id')::bigint;
  perform pg_temp.ok((j ->> 'criados')::int = 89 and (j ->> 'ignorados')::int = 11 and (j ->> 'atualizados')::int = 0 and jsonb_array_length(j -> 'erros') = 0,
                     'importar lote 1: 89 criados, 11 duplicados ignorados (55/9)');
  perform pg_temp.ok((select nome from public.nx_contatos where id = ct1) = 'João da Silva', 'importar sem atualizar não mexe no existente');
  perform pg_temp.ok((select count(*) from public.nx_contatos where cliente_id = cA and origem = 'importacao' and dono_id is null) = 89, 'importados: origem importação, sem responsável');
  perform pg_temp.ok((select count(*) from public.nx_historico where cliente_id = cA and tipo = 'importado') = 89, 'importados: uma linha do tempo por contato');
  -- lote 2 (atualizar): 50 existentes + 50 novos, etiquetas do lote
  select jsonb_agg(case when g <= 50 then jsonb_build_object('nome', 'Paciente ' || g || ' Atualizado', 'telefone', '12' || lpad((70000000 + g)::text, 8, '0'), 'cidade', 'Taubaté')
                        else jsonb_build_object('nome', 'Novo ' || g, 'email', 'novo' || g || '@teste.local') end order by g)
    into linhas from generate_series(1, 100) g;
  ini := clock_timestamp();
  j := public.nx_contatos_importar('tok-f4b-sup', cA, linhas, jsonb_build_object('atualizar', true, 'importacao_id', imp, 'etiquetas', jsonb_build_array(e_impl, eB), 'linha_inicial', 100))::jsonb;
  perform pg_temp.ok(extract(epoch from clock_timestamp() - ini) < 2, 'importar: lote 2 < 2 s');
  perform pg_temp.ok((j ->> 'criados')::int = 50 and (j ->> 'atualizados')::int = 50 and (j ->> 'importacao_id')::bigint = imp, 'importar lote 2: 50 atualizados + 50 criados, mesma importação');
  perform pg_temp.ok((select count(*) from public.nx_contatos where cliente_id = cA and cidade = 'Taubaté' and nome like '% Atualizado' and etiquetas = array[e_impl]) = 50,
                     'atualizar preenche campos e une etiquetas (a de outro cliente descartada)');
  -- lote 3: e-mail repetido, vazia, telefone ruim, etiquetas e empresa por nome, campo, UF e data
  linhas := jsonb_build_array(
    jsonb_build_object('nome', 'Pelo e-mail', 'email', 'NOVO51@teste.local', 'cidade', 'Caçapava'),
    jsonb_build_object('obs', 'só observação'),
    jsonb_build_object('nome', 'Tel ruim', 'telefone', '123', 'uf', 'São Paulo', 'nascimento', '31/02/1990', '_linha', 777),
    jsonb_build_object('nome', 'Com tudo', 'telefone', '12 99000-0001', 'etiquetas', 'VIP; implante', 'empresa', 'Frota Vale', 'uf', 'sp',
                       'nascimento', '05/03/1985', 'origem', 'Indicação', 'campos', jsonb_build_object('convenio', 'unimed', 'inexistente', 'x')),
    jsonb_build_object('nome', 'Outro da frota', 'telefone', '12 99000-0002', 'empresa', 'frota vale', 'etiquetas', 'vip', 'campos', jsonb_build_object('convenio', 'Bradesco')));
  j := public.nx_contatos_importar('tok-f4b-sup', cA, linhas, jsonb_build_object('atualizar', true, 'importacao_id', imp, 'linha_inicial', 200))::jsonb;
  perform pg_temp.ok((j ->> 'criados')::int = 3 and (j ->> 'atualizados')::int = 1 and (j ->> 'ignorados')::int = 1, 'importar lote 3: e-mail acha o existente; linha vazia ignorada');
  perform pg_temp.ok((select cidade from public.nx_contatos where cliente_id = cA and lower(email) = 'novo51@teste.local') = 'Caçapava', 'dedupe por e-mail sem diferenciar maiúsculas');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(j -> 'avisos') a where (a ->> 'linha')::int = 777 and a ->> 'motivo' like 'Telefone inválido%')
                     and exists (select 1 from jsonb_array_elements(j -> 'avisos') a where (a ->> 'linha')::int = 205 and a ->> 'motivo' like 'Campo «Convênio»%'),
                     'avisos com o número da linha (_linha e linha_inicial)');
  perform pg_temp.ok((select telefone is null and uf is null and nascimento is null from public.nx_contatos where cliente_id = cA and nome = 'Tel ruim'), 'linha com dados ruins entra sem eles');
  perform pg_temp.ok((select count(*) from public.nx_etiquetas where cliente_id = cA and lower(nome) = 'vip') = 1
                     and (select count(*) from public.nx_empresas where cliente_id = cA) = 1, 'etiqueta e empresa por nome: acha ou cria uma vez só');
  perform pg_temp.ok((select empresa_id = emp1 and uf = 'SP' and nascimento = date '1985-03-05' and origem = 'indicacao' and campos = '{"convenio":"Unimed"}'::jsonb
                        and cardinality(etiquetas) = 2 and e_impl = any(etiquetas)
                        from public.nx_contatos where cliente_id = cA and nome = 'Com tudo'), 'linha completa: empresa, UF, data, origem, campo normalizado, etiquetas');
  perform pg_temp.ok((select erros from public.nx_importacoes where id = imp) = '[]'::jsonb and (select total from public.nx_importacoes where id = imp) = 205
                     and (select criados from public.nx_importacoes where id = imp) = 142, 'registro da importação acumula');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contatos_importar(%L,%L,%L,%L)', 'tok-f4b-b', cB, '[{"nome":"x"}]', jsonb_build_object('importacao_id', imp))) = 'dados_invalidos|importacao_id',
                     'importação de outro cliente não acumula');
  -- lote 4: negócio por linha no funil de pós-venda, etapa por nome e valor BR
  linhas := jsonb_build_array(
    jsonb_build_object('nome', 'Com negócio', 'telefone', '12 99000-0003', 'negocio_titulo', 'Retorno', 'negocio_valor', '1.500,00', 'estagio', 'concluido'),
    jsonb_build_object('nome', 'Etapa ruim', 'telefone', '12 99000-0004', 'estagio', 'Sem retorno'),
    jsonb_build_object('nome', 'Com tudo', 'telefone', '12 99000-0001'));
  j := public.nx_contatos_importar('tok-f4b-sup', cA, linhas, jsonb_build_object('atualizar', true, 'negocio', jsonb_build_object('funil_id', f_pos), 'dono_id', k_at))::jsonb;
  perform pg_temp.ok((j ->> 'criados')::int = 2 and (j ->> 'atualizados')::int = 1, 'importar com negócio: contagens');
  perform pg_temp.ok((select valor_previsto = 1500 and titulo = 'Retorno' and origem = 'importacao' and dono_id = k_at and plataforma is null
                        and estagio_id = (select id from public.nx_estagios where funil_id = f_pos and nome = 'Concluído')
                        from public.nx_leads where cliente_id = cA and contato_id = (select id from public.nx_contatos where cliente_id = cA and nome = 'Com negócio')),
                     'negócio da linha: título, valor BR, etapa pelo nome, responsável, origem importação');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(j -> 'avisos') a where a ->> 'motivo' like 'Etapa «Sem retorno»%'), 'etapa fechada → aviso e 1ª etapa aberta');
  j := public.nx_contatos_importar('tok-f4b-sup', cA, linhas, jsonb_build_object('atualizar', true, 'negocio', jsonb_build_object('funil_id', f_pos)))::jsonb;
  perform pg_temp.ok((select count(*) from jsonb_array_elements(j -> 'avisos') a where a ->> 'motivo' like 'Já tinha negócio aberto%') = 3
                     and (select count(*) from public.nx_leads where cliente_id = cA and funil_id = f_pos and origem = 'importacao') = 3, 'reimportar não duplica negócio aberto');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contatos_importar(%L,%L,%L,%L)', 'tok-f4b-sup', cA, '[{"nome":"x"}]', jsonb_build_object('negocio', jsonb_build_object('estagio_id', s_fechou)))) = 'estagio_invalido|fechado',
                     'importar direto em etapa ganha → recusado');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contatos_importar(%L,%L,%L,%L)', 'tok-f4b-sup', cA, '[{"nome":"x"}]', jsonb_build_object('negocio', jsonb_build_object('funil_id', fB)))) = 'funil_invalido|nao_encontrado',
                     'importar para funil de outro cliente');
  -- limite do plano: conferido uma vez por lote com as linhas novas
  n := (select count(*) from public.nx_contatos where cliente_id = cA);
  update public.nx_clientes set limites = jsonb_build_object('contatos', n + 2) where id = cA;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contatos_importar(%L,%L,%L,%L)', 'tok-f4b-sup', cA,
      '[{"nome":"L1"},{"nome":"L2"},{"nome":"L3"},{"nome":"Paciente 1","telefone":"12970000001"}]', '{"atualizar":true}')) = 'limite_plano|contatos:' || (n + 2),
      'limite de contatos: 3 novos num lote que só cabe 2 → nada gravado');
  perform pg_temp.ok((select count(*) from public.nx_contatos where cliente_id = cA) = n, 'lote recusado pelo limite não grava nada');
  j := public.nx_contatos_importar('tok-f4b-sup', cA, '[{"nome":"L1"},{"nome":"L2"},{"nome":"Paciente 1","telefone":"12970000001"}]', '{"atualizar":true}')::jsonb;
  perform pg_temp.ok((j ->> 'criados')::int = 2 and (j ->> 'atualizados')::int = 1, 'limite: 2 novos + 1 existente cabem');
  update public.nx_clientes set limites = '{}' where id = cA;

  -- ---------------------------------------------------------- exportar (P1)
  j := public.nx_contatos_exportar('tok-f4b-adm', cA, '{}', 1)::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'itens') = (select count(*) from public.nx_contatos where cliente_id = cA) and not (j ->> 'tem_mais')::boolean
                     and not (j -> 'itens' -> 0 ? 'busca') and not (j -> 'itens' -> 0 ? 'cliente_id') and j -> 'itens' -> 0 ? 'etiquetas_nomes',
                     'exportar: todos os contatos, sem busca/cliente_id, com nomes das etiquetas');
  j := public.nx_contatos_exportar('tok-f4b-adm', cA, jsonb_build_object('busca', 'com tudo'), 1)::jsonb;
  perform pg_temp.ok(jsonb_array_length(j -> 'itens') = 1 and j -> 'itens' -> 0 ->> 'empresa_nome' = 'Frota Vale'
                     and j -> 'itens' -> 0 -> 'etiquetas_nomes' ? 'VIP', 'exportar: mesmo filtro da lista, empresa e etiquetas por nome');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contatos_exportar(%L,%L)', 'tok-f4b-sup', cA)) = 'sem_permissao', 'exportar: só admin');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_contatos_exportar(%L,%L)', 'tok-f4b-adm', cB)) = 'sem_acesso', 'exportar: outro cliente');

  -- ---------------------------------------------------------- excluir etiqueta
  perform public.nx_negocio_salvar('tok-f4b-at', cA, jsonb_build_object('id', n2, 'etiquetas', jsonb_build_array(e_impl)));
  update public.nx_conversas set etiquetas = array[e_impl] where id = cv1;
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_etiqueta_excluir(%L,%L,%L)', 'tok-f4b-sup', cA, e_impl)) = 'sem_permissao', 'etiqueta: supervisor não exclui');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_etiqueta_excluir(%L,%L,%L)', 'tok-f4b-adm', cA, eB)) = 'etiqueta_nao_encontrada', 'etiqueta de outro cliente');
  perform pg_temp.ok(exists (select 1 from public.nx_etiquetas where id = eB), 'etiqueta de B intacta');
  j := public.nx_etiqueta_excluir('tok-f4b-adm', cA, e_impl)::jsonb;
  perform pg_temp.ok((j ->> 'restantes')::int = 0 and not exists (select 1 from public.nx_etiquetas where id = e_impl)
                     and not exists (select 1 from public.nx_contatos where cliente_id = cA and e_impl = any(etiquetas))
                     and not exists (select 1 from public.nx_leads where id = n2 and e_impl = any(etiquetas))
                     and not exists (select 1 from public.nx_conversas where id = cv1 and e_impl = any(etiquetas)), 'etiqueta: sai do catálogo e de contatos, negócios e conversas');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_etiqueta_excluir(%L,%L,%L)', 'tok-f4b-adm', cA, e_impl)) = 'etiqueta_nao_encontrada', 'etiqueta: excluir de novo');

  -- ---------------------------------------------------------- excluir empresa (por último: contatos soltos)
  j := public.nx_empresa_excluir('tok-f4b-adm', cA, emp1)::jsonb;
  perform pg_temp.ok((j ->> 'contatos_soltos')::int = 4 and not exists (select 1 from public.nx_contatos where empresa_id = emp1), 'excluir empresa: contatos ficam sem empresa');

  -- ---------------------------------------------------------- permissões (grants)
  perform pg_temp.ok(has_function_privilege('anon', 'public.nx_contatos_importar(text,uuid,jsonb,jsonb)', 'execute')
                 and has_function_privilege('anon', 'public.nx_funil_salvar(text,uuid,jsonb)', 'execute')
                 and has_function_privilege('anon', 'public.nx_buscar(text,uuid,text)', 'execute')
                 and has_function_privilege('anon', 'public.nx_etiqueta_excluir(text,uuid,uuid)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_crm_campo_valor(text,text[],text)', 'execute')
                 and not has_function_privilege('anon', 'public.nx_crm_funil_json(uuid,uuid)', 'execute')
                 and not has_function_privilege('authenticated', 'public.nx_crm_chave_campo(uuid,text,text)', 'execute'),
                 'grants: painel anon; internas só service_role');
  raise notice 'OK 04_crm_b (funcional)';
end $t$;

-- ============================================================ TEMPO (regra 11): 5.000 contatos, 5.000 negócios, 2.000 conversas
do $t$
declare
  cT uuid; k_adm uuid; k_res uuid; fT uuid; st uuid[]; eT uuid; eX uuid; sPos uuid;
  t0 timestamptz; ms numeric; rel text := ''; j jsonb; x jsonb; linhas jsonb; lote int; chamadas int := 0; imp bigint;
begin
  select id into k_adm from public.nx_contas where email = 'teste-f4b-adm@teste.local';
  select id into k_res from public.nx_contas where email = 'teste-f4b-res@teste.local';
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-f4b-t', 'Teste F4B Tempo', 'odonto') returning id into cT;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_adm, cT, 'admin');
  insert into public.nx_acessos (conta_id, cliente_id, papel, ver_todas) values (k_res, cT, 'atendente', false);
  select id into fT from public.nx_funis where cliente_id = cT and padrao;
  select array_agg(id order by ordem) into st from public.nx_estagios where funil_id = fT;
  select id into eT from public.nx_etiquetas where cliente_id = cT order by nome limit 1;
  insert into public.nx_etiquetas (cliente_id, nome, cor) values (cT, 'Para apagar', '#6FA3CF') returning id into eX;
  perform set_config('nx.lote', '1', true);
  perform set_config('nx.sem_historico', '1', true);
  insert into public.nx_contatos (cliente_id, nome, telefone, email, etiquetas, dono_id, criado_em)
  select cT, 'Contato Teste ' || g || case when g % 7 = 0 then ' Araújo' else '' end,
         -- celular de verdade (9 seguido de 6–9): a regra de 20261008a (S-B5 [C6]) só tira o 9 de celular; '55129' || 8 dígitos
         -- começando em 0 é um número de 9 dígitos que NÃO é celular e deixou de casar com a forma sem o 9
         '551299' || lpad(g::text, 7, '0'), 'c' || g || '@teste.local', array[eX] || case when g % 3 = 0 then array[eT] else '{}'::uuid[] end,
         case when g % 2 = 0 then k_adm end, now() - make_interval(mins => g)
    from generate_series(1, 5000) g;
  insert into public.nx_leads (cliente_id, contato_id, estagio_id, valor_previsto, dono_id, titulo, etiquetas)
  select cT, k.id, st[1 + (k.rn % 4)::int], (k.rn % 10) * 150, case when k.rn % 2 = 0 then k_adm end,
         'Negócio ' || k.rn, case when k.rn % 2 = 0 then array[eX] else '{}'::uuid[] end
    from (select id, row_number() over (order by id) as rn from public.nx_contatos where cliente_id = cT) k;
  insert into public.nx_conversas (cliente_id, contato_id, protocolo, status, etiquetas)
  select cT, k.id, '2026-' || lpad(k.rn::text, 6, '0'), 'aberta', array[eX]
    from (select id, row_number() over (order by id) as rn from public.nx_contatos where cliente_id = cT order by id limit 2000) k;
  insert into public.nx_tarefas (cliente_id, titulo, vence_em, dono_id, negocio_id)
  select cT, 'Tarefa ' || l.id, now() + make_interval(hours => (l.id % 200)::int - 100), case when l.id % 2 = 0 then k_adm else k_res end, l.id
    from public.nx_leads l where l.cliente_id = cT;
  perform public.nx_pulso_lote_fim();
  perform set_config('nx.lote', '', true);
  perform set_config('nx.sem_historico', '', true);
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values (public.nx_hash('tok-f4bt-adm'), k_adm, now() + interval '1 hour'),
    (public.nx_hash('tok-f4bt-res'), k_res, now() + interval '1 hour');

  t0 := clock_timestamp(); j := public.nx_buscar('tok-f4bt-adm', cT, 'araujo')::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' buscar=' || round(ms); perform pg_temp.ok(ms < 2000, 'lento nx_buscar ' || round(ms) || ' ms');
  perform pg_temp.ok(jsonb_array_length(j -> 'contatos') = 8 and jsonb_array_length(j -> 'conversas') = 8, 'buscar grande: 8 de cada');
  t0 := clock_timestamp(); j := public.nx_buscar('tok-f4bt-res', cT, '0001234')::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' buscar_tel=' || round(ms); perform pg_temp.ok(ms < 2000, 'lento nx_buscar telefone ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_buscar('tok-f4bt-adm', cT, 'negocio 49')::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' buscar_neg=' || round(ms); perform pg_temp.ok(ms < 2000, 'lento nx_buscar negócio ' || round(ms) || ' ms');
  perform pg_temp.ok(jsonb_array_length(j -> 'negocios') = 8, 'buscar negócio grande');
  t0 := clock_timestamp(); j := public.nx_tarefas_listar('tok-f4bt-adm', cT, '{"dono":"todos","situacao":"atrasadas"}')::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' tarefas=' || round(ms); perform pg_temp.ok(ms < 2000, 'lento nx_tarefas_listar ' || round(ms) || ' ms');
  perform pg_temp.ok(jsonb_array_length(j -> 'itens') = 200 and (j ->> 'tem_mais')::boolean, 'tarefas: página de 200');
  t0 := clock_timestamp(); j := public.nx_tarefas_listar('tok-f4bt-res', cT, '{"situacao":"proximas"}')::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' tarefas_res=' || round(ms); perform pg_temp.ok(ms < 2000, 'lento nx_tarefas_listar restrito ' || round(ms) || ' ms');
  t0 := clock_timestamp(); j := public.nx_empresas_listar('tok-f4bt-adm', cT, '{}')::jsonb;
  ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' empresas=' || round(ms); perform pg_temp.ok(ms < 2000, 'lento nx_empresas_listar ' || round(ms) || ' ms');

  -- importação: 5 lotes de 100 com duplicados por telefone (com e sem 55/9) num cliente com 5.000 contatos
  for lote in 1 .. 5 loop
    select jsonb_agg(case
             when g % 10 = 0 then jsonb_build_object('nome', 'Dup ' || g, 'telefone', '129' || lpad((g * 7)::text, 7, '0'))   -- sem 55 e sem o 9 extra → já existe (551299…)
             else jsonb_build_object('nome', 'Imp ' || lote || '-' || g, 'telefone', '(11) 9' || lpad((lote * 1000 + g)::text, 8, '0'),
                                     'email', 'imp' || lote || '-' || g || '@teste.local', 'etiquetas', 'Lote ' || lote || ';Importados',
                                     'empresa', 'Empresa ' || (g % 5), 'cidade', 'Taubaté') end order by g)
      into linhas from generate_series(1, 100) g;
    t0 := clock_timestamp();
    j := public.nx_contatos_importar('tok-f4bt-adm', cT, linhas, jsonb_build_object('atualizar', false, 'importacao_id', imp,
           'negocio', jsonb_build_object('funil_id', fT), 'linha_inicial', (lote - 1) * 100))::jsonb;
    ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' importar' || lote || '=' || round(ms);
    perform pg_temp.ok(ms < 2000, 'lento nx_contatos_importar lote ' || lote || ' ' || round(ms) || ' ms');
    perform pg_temp.ok((j ->> 'criados')::int = 90 and (j ->> 'ignorados')::int = 10 and jsonb_array_length(j -> 'erros') = 0,
                       'importar lote ' || lote || ': 90 criados, 10 duplicados (com/sem 55 e 9)');
    imp := (j ->> 'importacao_id')::bigint;
  end loop;
  perform pg_temp.ok((select total = 500 and criados = 450 and ignorados = 50 from public.nx_importacoes where id = imp), 'importação: 5 lotes somados');
  perform pg_temp.ok((select count(*) from public.nx_contatos where cliente_id = cT) = 5450 and (select count(*) from public.nx_empresas where cliente_id = cT) = 5
                     and (select count(*) from public.nx_leads where cliente_id = cT and origem = 'importacao') = 450, 'importação: contatos, empresas e negócios');
  -- exportar em páginas de 2.000 (5.450 contatos → 3 páginas)
  for lote in 1 .. 3 loop
    t0 := clock_timestamp(); j := public.nx_contatos_exportar('tok-f4bt-adm', cT, '{}', lote)::jsonb;
    ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' exportar' || lote || '=' || round(ms);
    perform pg_temp.ok(ms < 2000, 'lento nx_contatos_exportar página ' || lote || ' ' || round(ms) || ' ms');
    perform pg_temp.ok(jsonb_array_length(j -> 'itens') = case lote when 3 then 1450 else 2000 end and (j ->> 'tem_mais')::boolean = (lote < 3),
                       'exportar página ' || lote);
  end loop;

  -- excluir etiqueta marcada em 5.000 contatos + 2.500 negócios + 2.000 conversas: páginas de 2.000 até restantes = 0
  loop
    chamadas := chamadas + 1;
    t0 := clock_timestamp(); j := public.nx_etiqueta_excluir('tok-f4bt-adm', cT, eX)::jsonb;
    ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' etq' || chamadas || '=' || round(ms);
    perform pg_temp.ok(ms < 2000, 'lento nx_etiqueta_excluir chamada ' || chamadas || ' ' || round(ms) || ' ms');
    exit when (j ->> 'restantes')::int = 0 or chamadas > 10;
  end loop;
  perform pg_temp.ok(chamadas = 5 and not exists (select 1 from public.nx_contatos where cliente_id = cT and eX = any(etiquetas))
                     and not exists (select 1 from public.nx_leads where cliente_id = cT and eX = any(etiquetas))
                     and not exists (select 1 from public.nx_conversas where cliente_id = cT and eX = any(etiquetas))
                     and (select count(*) from public.nx_contatos where cliente_id = cT and eT = any(etiquetas)) = 1666,
                     'excluir etiqueta: 5 chamadas até restantes = 0; outras etiquetas intactas');

  -- editor de funil com 1.250 negócios numa etapa removida: 500 por chamada até restantes = 0
  chamadas := 0;
  loop
    chamadas := chamadas + 1;
    t0 := clock_timestamp();
    j := public.nx_funil_salvar('tok-f4bt-adm', cT, jsonb_build_object('id', fT, 'estagios',
           (select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'tipo', e.tipo, 'marco', e.marco, 'cor', e.cor) order by e.ordem)
              from public.nx_estagios e where e.funil_id = fT and e.id <> st[2]),
           'mover', jsonb_build_object(st[2]::text, st[1]::text)))::jsonb;
    ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' funil_mover' || chamadas || '=' || round(ms);
    perform pg_temp.ok(ms < 2000, 'lento nx_funil_salvar movendo negócios ' || round(ms) || ' ms');
    exit when (j ->> 'restantes')::int = 0 or chamadas > 5;
  end loop;
  perform pg_temp.ok(chamadas = 3 and jsonb_array_length(j -> 'estagios') = 6 and not exists (select 1 from public.nx_estagios where id = st[2])
                     and not exists (select 1 from public.nx_leads where estagio_id = st[2])
                     and (select count(*) from public.nx_leads where estagio_id = st[1]) = 1250 + 1250 + 450,
                     'funil: 3 chamadas de até 500, etapa removida no fim e negócios movidos');
  -- excluir funil fora do Ads com 1.300 negócios: 500 por chamada até excluido = true
  j := public.nx_funil_salvar('tok-f4bt-adm', cT, '{"nome":"Grande","estagios":[{"nome":"A"},{"nome":"G","tipo":"ganho"},{"nome":"P","tipo":"perdido"}]}')::jsonb;
  insert into public.nx_leads (cliente_id, contato_id, estagio_id, titulo)
  select cT, k.id, (j -> 'estagios' -> 0 ->> 'id')::uuid, 'Grande ' || k.id from public.nx_contatos k where k.cliente_id = cT order by k.id limit 1300;
  select s.id into sPos from public.nx_estagios s join public.nx_funis f on f.id = s.funil_id
   where s.cliente_id = cT and f.nome = 'Pós-tratamento' and s.tipo = 'aberto' order by s.ordem limit 1;
  chamadas := 0;
  loop
    chamadas := chamadas + 1;
    t0 := clock_timestamp();
    x := public.nx_funil_excluir('tok-f4bt-adm', cT, (j ->> 'id')::uuid, sPos)::jsonb;
    ms := extract(epoch from clock_timestamp() - t0) * 1000; rel := rel || ' funil_excluir' || chamadas || '=' || round(ms);
    perform pg_temp.ok(ms < 2000, 'lento nx_funil_excluir ' || round(ms) || ' ms');
    exit when (x ->> 'excluido')::boolean or chamadas > 5;
  end loop;
  perform pg_temp.ok(chamadas = 3 and not exists (select 1 from public.nx_funis where id = (j ->> 'id')::uuid), 'excluir funil grande: 3 chamadas de até 500');
  raise exception 'OK 04_crm_b — tempos (ms):%', rel;
end $t$;

rollback;
