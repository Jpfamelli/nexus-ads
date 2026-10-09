-- Smoke da 20261009a_origem_frase_botao: nx_origem_frase (frase do botão do site em canal Meta OU aparelho; «Vim pelo
-- anúncio (instagram)» vira origem anúncio + plataforma; nunca sobrescreve anúncio/rastreio nem origem já dada).
-- Roda em transação e desfaz tudo; termina em raise exception 'OK_22_…' (o ensaio no banco real só confia nessa marca).
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
  org_p uuid; cA uuid; cB uuid; kM uuid; kC uuid; kB uuid;
  ct1 bigint; ct2 bigint; ct3 bigint; ct4 bigint; l1 bigint; l2 bigint; l3 bigint; l4 bigint;
  t1 text := '5512996' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  t2 text := '5512995' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  t3 text := '5512994' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  t4 text := '5512993' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  j json;
begin
  select id into org_p from public.nx_orgs where tipo = 'plataforma' limit 1;
  perform pg_temp.ok(org_p is not null, 'fixture: org da plataforma');
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status) values ('t22-a-' || sfx, 'Teste 22 A', org_p, 'interno', 'odonto', 'ativo') returning id into cA;
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status) values ('t22-b-' || sfx, 'Teste 22 B', org_p, 'interno', 'odonto', 'ativo') returning id into cB;
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor) values (cA, 'Meta 22', 'pn-22-' || sfx, 'meta') returning id into kM;
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor, codewords_api_segredo, codewords_phone_id, codewords_numero, codewords_rota)
    values (cA, 'Aparelho 22', null, 'codewords', gen_random_uuid(), 'ph-22-' || sfx, '+5512998220000', 'direta') returning id into kC;
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor) values (cB, 'Meta 22 B', 'pn-22b-' || sfx, 'meta') returning id into kB;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Frase 1', t1) returning id into ct1;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Frase 2', t2) returning id into ct2;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Frase 3', t3) returning id into ct3;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Frase 4', t4) returning id into ct4;
  insert into public.nx_leads (cliente_id, contato_id, titulo, nome, telefone, status, etapa, data_conversa, origem)
    values (cA, ct1, 'Frase 1', 'Frase 1', t1, 'aberto', 'nova', hoje, 'whatsapp') returning id into l1;
  insert into public.nx_leads (cliente_id, contato_id, titulo, nome, telefone, status, etapa, data_conversa, origem)
    values (cA, ct2, 'Frase 2', 'Frase 2', t2, 'aberto', 'nova', hoje, 'whatsapp') returning id into l2;
  insert into public.nx_leads (cliente_id, contato_id, titulo, nome, telefone, status, etapa, data_conversa, origem, plataforma, anuncio_ext)
    values (cA, ct3, 'Frase 3', 'Frase 3', t3, 'aberto', 'nova', hoje, 'anuncio', 'meta', 'AD-22') returning id into l3;
  insert into public.nx_leads (cliente_id, contato_id, titulo, nome, telefone, status, etapa, data_conversa, origem)
    values (cA, ct4, 'Frase 4', 'Frase 4', t4, 'aberto', 'nova', hoje, 'indicacao') returning id into l4;

  -- canal da META (antes: canal_nao_encontrado e nada era atribuído)
  j := public.nx_origem_frase(kM, t1, 'anuncio', 'meta', 'Vim pelo anúncio (instagram)');
  perform pg_temp.ok((j ->> 'aplicado')::boolean and (j ->> 'negocio_id')::bigint = l1, 'canal Meta: aplicado no negócio aberto ' || j::text);
  perform pg_temp.ok((select origem = 'anuncio' and plataforma = 'meta' from public.nx_leads where id = l1), 'negócio: origem ANÚNCIO + meta (antes: organico)');
  perform pg_temp.ok((select origem = 'anuncio' and plataforma = 'meta' from public.nx_contatos where id = ct1), 'contato também');
  perform pg_temp.ok(exists (select 1 from public.nx_notas n where n.negocio_id = l1 and n.texto like 'Origem pela mensagem do botão do site: Anúncio (Meta)%'), 'nota no negócio');
  j := public.nx_origem_frase(kM, t1, 'anuncio', 'meta', null);
  perform pg_temp.ok(not (j ->> 'aplicado')::boolean and j ->> 'motivo' = 'ja_tem_anuncio', 'repetir não muda nada (idempotente)');
  perform pg_temp.ok((select count(*) from public.nx_notas n where n.negocio_id = l1) = 1, 'e não duplica a nota');

  -- canal do APARELHO + site
  j := public.nx_origem_frase(kC, t2, 'site', null, 'Vim pelo site');
  perform pg_temp.ok((j ->> 'aplicado')::boolean and (select origem = 'site' and plataforma is null from public.nx_leads where id = l2), 'aparelho: site sem plataforma');
  j := public.nx_origem_frase(kC, t2, 'anuncio', 'google', null);
  perform pg_temp.ok(not (j ->> 'aplicado')::boolean and j ->> 'motivo' = 'ja_tem_origem' and (select origem = 'site' from public.nx_leads where id = l2),
    'origem já dada (site) não é trocada por outra frase');

  -- nunca sobrescreve anúncio/rastreio nem origem já contada
  j := public.nx_origem_frase(kM, t3, 'site', null, null);
  perform pg_temp.ok(j ->> 'motivo' = 'ja_tem_anuncio' and (select origem = 'anuncio' and anuncio_ext = 'AD-22' from public.nx_leads where id = l3), 'anúncio (CTWA) intacto');
  j := public.nx_origem_frase(kM, t4, 'anuncio', 'meta', null);
  perform pg_temp.ok(j ->> 'motivo' = 'ja_tem_origem' and (select origem = 'indicacao' and plataforma is null from public.nx_leads where id = l4), 'indicação intacta');

  -- validação e isolamento
  perform pg_temp.ok((public.nx_origem_frase(kM, t1, 'organico', null, null) ->> 'erro') = 'origem_invalida', 'só site/anuncio');
  perform pg_temp.ok((public.nx_origem_frase(kM, t1, 'anuncio', null, null) ->> 'erro') = 'plataforma_invalida', 'anúncio exige meta/google');
  perform pg_temp.ok((public.nx_origem_frase(kM, t1, 'anuncio', 'tiktok', null) ->> 'erro') = 'plataforma_invalida', 'plataforma fora da lista');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_origem_frase(%L,%L,%L,null,null)', gen_random_uuid(), t1, 'site')) = 'canal_nao_encontrado', 'canal inexistente');
  perform pg_temp.ok(pg_temp.erro(format('select public.nx_origem_frase(%L,%L,%L,null,null)', kM, '12', 'site')) = 'dados_invalidos|telefone', 'telefone curto');
  perform pg_temp.ok((public.nx_origem_frase(kB, t1, 'site', null, null) ->> 'erro') = 'contato_nao_encontrado', 'canal de OUTRO cliente não acha o contato deste');
  perform pg_temp.ok((select origem = 'anuncio' from public.nx_leads where id = l1), 'e não mexeu em nada');
  perform pg_temp.ok(not has_function_privilege('anon', 'public.nx_origem_frase(uuid,text,text,text,text)', 'execute')
                 and not has_function_privilege('authenticated', 'public.nx_origem_frase(uuid,text,text,text,text)', 'execute')
                 and has_function_privilege('service_role', 'public.nx_origem_frase(uuid,text,text,text,text)', 'execute'), 'só service_role');
  perform pg_temp.ok(exists (select 1 from public.nx_versao_banco where nome = '20261009a_origem_frase_botao'), 'versão registrada');
  raise exception 'OK_22_ORIGEM_FRASE_BOTAO — frase do botão em canal Meta e aparelho, anúncio com plataforma, sem sobrescrever, isolamento, permissões';
end $t$;
rollback;
