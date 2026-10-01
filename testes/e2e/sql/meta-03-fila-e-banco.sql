-- ============================================================
-- ÓRBITA — testes/e2e/sql/meta-03-fila-e-banco.sql
-- Depois da fase 2 do E2E do canal Meta (cliente 'meta-3009'). Três blocos, rodar NESTA ordem, cada um numa chamada:
--   [A] enfileira 5 itens da fila em nx_envios_fila que o nx-enviar RECUSA antes de chegar à Graph
--       (sem nenhuma chamada de rede à Meta):
--         a  modelo de MARKETING para contato que disse SAIR            → pulado (descadastrado)
--         b  texto para conversa com a janela de 24 h vencida          → pulado (fora da janela)
--         e  texto pelo canal B (sem token)                            → falhou (número sem token)
--         g  modelo PENDING (não aprovado)                             → falhou (modelo não aprovado)
--         h  modelo aprovado com o nº de parâmetros errado             → falhou (parâmetros)
--   [B] dispara o modo cron do nx-enviar SÓ para esses ids pelo nx_disparar (o token do cron fica dentro da função
--       do banco — nada de nx_config é lido aqui). O resultado chega em net._http_response.
--   [C] confere (depois de ~8 s) os itens da fila, a resposta HTTP do nx-enviar e o estado do banco.
-- Só mexe no cliente 'meta-3009'.
-- ============================================================

-- [A] ----------------------------------------------------------------------------------------------
with ctx as (
  select c.id cli,
         (select id from public.nx_canais where cliente_id = c.id and nome = 'META-3009 A') cA,
         (select id from public.nx_canais where cliente_id = c.id and nome = 'META-3009 B') cB
    from public.nx_clientes c where c.slug = 'meta-3009'),
conv as (
  select ct.telefone, cv.id conv_id, cv.contato_id, cv.canal_id
    from public.nx_conversas cv join public.nx_contatos ct on ct.id = cv.contato_id join ctx on ctx.cli = cv.cliente_id
   where cv.status <> 'resolvida' and ct.telefone in ('5512993008001', '5512993008007', '5512993008008', '5512993008011')),
tpl as (
  select t.nome, t.id from public.nx_templates t join ctx on ctx.cli = t.cliente_id and t.canal_id = ctx.cA),
ins as (
  insert into public.nx_envios_fila (cliente_id, conversa_id, contato_id, canal_id, tipo, texto, template, origem, enviar_em)
  select ctx.cli, cv.conv_id, cv.contato_id, cv.canal_id, v.tipo, v.texto,
         case when v.tipo = 'template' then jsonb_build_object('caso', v.caso, 'template_id', (select id from tpl where nome = v.modelo), 'parametros', to_jsonb(v.params)) end,
         v.origem, now()
    from ctx
    join (values
      ('a', '5512993008011', 'template', null::text, 'meta3009_promo', array['Maria'], 'automacao'),
      ('b', '5512993008008', 'texto', 'META-3009 fila b: texto fora da janela', null, array[]::text[], 'agendada'),
      ('e', '5512993008007', 'texto', 'META-3009 fila e: texto pelo canal sem token', null, array[]::text[], 'agendada'),
      ('g', '5512993008001', 'template', null, 'meta3009_pendente', array[]::text[], 'automacao'),
      ('h', '5512993008001', 'template', null, 'meta3009_lembrete', array['so-um'], 'automacao')
    ) v(caso, tel, tipo, texto, modelo, params, origem) on true
    join conv cv on cv.telefone = v.tel
  returning id, tipo, conversa_id, texto, template)
select id, tipo, coalesce(template ->> 'caso', left(texto, 40)) rotulo from ins order by id;

-- [B] ----------------------------------------------------------------------------------------------
select public.nx_disparar('nx-enviar', jsonb_build_object('ids', (
  select array_agg(f.id) from public.nx_envios_fila f join public.nx_clientes c on c.id = f.cliente_id
   where c.slug = 'meta-3009' and f.status = 'pendente'))) as net_request_id;

-- [C] (troque {{NET_ID}} pelo net_request_id acima) -------------------------------------------------
select jsonb_build_object(
  'fila', (select jsonb_agg(jsonb_build_object('rotulo', coalesce(f.template ->> 'caso', left(f.texto, 28)), 'origem', f.origem, 'status', f.status,
                                                  'tentativas', f.tentativas, 'erro', f.erro) order by f.id)
             from public.nx_envios_fila f join public.nx_clientes c on c.id = f.cliente_id where c.slug = 'meta-3009' and f.origem <> 'fora_horario'),
  'fora_horario', (select jsonb_agg(jsonb_build_object('telefone', ct.telefone, 'itens', n, 'status', st, 'erro', er) order by ct.telefone)
                     from (select f.contato_id, count(*) n, min(f.status) st, min(f.erro) er from public.nx_envios_fila f
                             join public.nx_clientes c on c.id = f.cliente_id where c.slug = 'meta-3009' and f.origem = 'fora_horario' group by f.contato_id) x
                     join public.nx_contatos ct on ct.id = x.contato_id),
  'http', (select jsonb_build_object('status', r.status_code, 'corpo', left(r.content, 400), 'timeout', r.timed_out, 'erro', r.error_msg)
             from net._http_response r where r.id = {{NET_ID}}::bigint)) as checagem;
