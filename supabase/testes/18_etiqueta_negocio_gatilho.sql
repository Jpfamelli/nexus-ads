-- ============================================================
-- ÓRBITA — supabase/testes/18_etiqueta_negocio_gatilho.sql · smoke de 20261004a_etiqueta_negocio_gatilho.sql
--   Etiqueta posta no NEGÓCIO (insert ou update de nx_leads.etiquetas) gera evento «etiqueta_adicionada» com
--   negocio_id, contato_id e alvo «negocio»; tirar etiqueta ou mudar outro campo não gera; sem automação ativa não gera.
-- Roda em begin … rollback. O bloco principal SEMPRE termina em exceção:
--   'OK_18_ETIQUETA_NEGOCIO …' = todos os casos passaram · 'FALHOU: <caso>' = falha
-- ============================================================
begin;

do $t$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  c uuid; f uuid; e uuid; ct bigint; l bigint; n0 int; r jsonb; urg uuid; ret uuid;
begin
  insert into public.nx_clientes (slug, nome, vertical) values ('teste-18-' || sfx, 'Teste 18', 'odonto') returning id into c;
  select id into f from public.nx_funis where cliente_id = c and padrao limit 1;
  select id into e from public.nx_estagios where cliente_id = c and funil_id = f order by ordem limit 1;
  insert into public.nx_etiquetas (cliente_id, nome) values (c, 'Urgência 18') returning id into urg;
  insert into public.nx_etiquetas (cliente_id, nome) values (c, 'Retorno 18') returning id into ret;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (c, 'Smoke 18', '5500000009218') returning id into ct;

  -- sem automação ativa do gatilho: nenhum evento (o gatilho sai cedo)
  insert into public.nx_leads (cliente_id, contato_id, funil_id, estagio_id, titulo, status, etiquetas)
    values (c, ct, f, e, 'Smoke 18 sem automação', 'aberto', array[urg]) returning id into l;
  if exists (select 1 from public.nx_eventos where cliente_id = c and tipo = 'etiqueta_adicionada') then
    raise exception 'FALHOU: sem automação ativa não devia gerar evento'; end if;

  insert into public.nx_automacoes (cliente_id, nome, ativo, gatilho, config, condicoes, acoes)
    values (c, 'Smoke 18', true, 'etiqueta_adicionada', jsonb_build_object('etiqueta_id', urg), '[]'::jsonb,
            jsonb_build_array(jsonb_build_object('tipo', 'nota', 'texto', 'smoke')));
  n0 := (select count(*) from public.nx_eventos where cliente_id = c and tipo = 'etiqueta_adicionada');

  -- insert com etiqueta → 1 evento com negocio_id/contato_id/alvo negocio
  insert into public.nx_leads (cliente_id, contato_id, funil_id, estagio_id, titulo, status, etiquetas)
    values (c, ct, f, e, 'Smoke 18', 'aberto', array[urg]) returning id into l;
  if (select count(*) from public.nx_eventos where cliente_id = c and tipo = 'etiqueta_adicionada') <> n0 + 1 then
    raise exception 'FALHOU: insert com etiqueta devia gerar 1 evento'; end if;
  select ref into r from public.nx_eventos where cliente_id = c and tipo = 'etiqueta_adicionada' order by id desc limit 1;
  if (r ->> 'negocio_id')::bigint <> l or r ->> 'alvo' <> 'negocio' or (r ->> 'etiqueta_id')::uuid <> urg or (r ->> 'contato_id')::bigint <> ct then
    raise exception 'FALHOU: ref errada %', r::text; end if;

  -- update acrescentando etiqueta → 1 evento; tirar etiqueta ou mudar título → nada
  update public.nx_leads set etiquetas = array[urg, ret] where id = l;
  if (select count(*) from public.nx_eventos where cliente_id = c and tipo = 'etiqueta_adicionada') <> n0 + 2 then
    raise exception 'FALHOU: etiqueta nova no update devia gerar 1 evento'; end if;
  update public.nx_leads set titulo = 'Smoke 18 b' where id = l;
  update public.nx_leads set etiquetas = array[ret] where id = l;
  if (select count(*) from public.nx_eventos where cliente_id = c and tipo = 'etiqueta_adicionada') <> n0 + 2 then
    raise exception 'FALHOU: tirar etiqueta ou mudar título não gera evento'; end if;

  -- contato e conversa continuam como antes
  update public.nx_contatos set etiquetas = array[urg] where id = ct;
  if (select ref ->> 'alvo' from public.nx_eventos where cliente_id = c and tipo = 'etiqueta_adicionada' order by id desc limit 1) <> 'contato' then
    raise exception 'FALHOU: etiqueta no contato continua gerando evento de contato'; end if;

  raise exception 'OK_18_ETIQUETA_NEGOCIO — etiqueta no negócio dispara o gatilho com negocio_id; contato e conversa como antes';
end $t$;

rollback;
