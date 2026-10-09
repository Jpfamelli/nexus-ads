-- Smoke da 20261009d_origem_frase_sem_negocio: contato SEM negócio aberto — a frase do botão anota uma vez só e não diz «aplicado»
-- quando nada mudou. Roda em transação e desfaz tudo; termina em raise exception 'OK_25_…'.
begin;
create or replace function pg_temp.ok(p boolean, p_caso text) returns void language plpgsql as $f$
begin
  if not coalesce(p, false) then raise exception 'FALHOU: %', p_caso; end if;
end $f$;
do $t$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  org_p uuid; cA uuid; kM uuid; ct1 bigint; ct2 bigint; l bigint;
  t1 text := '5512991' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  t2 text := '5512990' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  j json;
begin
  select id into org_p from public.nx_orgs where tipo = 'plataforma' limit 1;
  perform pg_temp.ok(org_p is not null, 'fixture: org da plataforma');
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status) values ('t25-a-' || sfx, 'Teste 25 A', org_p, 'interno', 'odonto', 'ativo') returning id into cA;
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor) values (cA, 'Meta 25', 'pn-25-' || sfx, 'meta') returning id into kM;
  insert into public.nx_contatos (cliente_id, nome, telefone) values (cA, 'Sem negócio 25', t1) returning id into ct1;
  insert into public.nx_contatos (cliente_id, nome, telefone, origem) values (cA, 'Indicação 25', t2, 'indicacao') returning id into ct2;

  j := public.nx_origem_frase(kM, t1, 'site', null, 'Vim pelo site');
  perform pg_temp.ok((j ->> 'aplicado')::boolean and (select origem = 'site' from public.nx_contatos where id = ct1), '1ª vez: contato vira site ' || j::text);
  perform pg_temp.ok((select count(*) from public.nx_notas n where n.contato_id = ct1) = 1, '1ª vez: uma nota');
  j := public.nx_origem_frase(kM, t1, 'site', null, 'Vim pelo site');
  perform pg_temp.ok(not (j ->> 'aplicado')::boolean and j ->> 'motivo' = 'ja_tem_origem', 'repetir (reentrega/sincronização): nada aplicado ' || j::text);
  j := public.nx_origem_frase(kM, t1, 'anuncio', 'meta', null);
  perform pg_temp.ok(not (j ->> 'aplicado')::boolean and (select origem = 'site' from public.nx_contatos where id = ct1), 'outra frase depois: não troca');
  perform pg_temp.ok((select count(*) from public.nx_notas n where n.contato_id = ct1) = 1, 'antes: uma nota NOVA a cada chamada');

  j := public.nx_origem_frase(kM, t2, 'anuncio', 'meta', null);
  perform pg_temp.ok(not (j ->> 'aplicado')::boolean and j ->> 'motivo' = 'ja_tem_origem', 'contato de indicação sem negócio: não «aplicado» ' || j::text);
  perform pg_temp.ok((select origem = 'indicacao' and plataforma is null from public.nx_contatos where id = ct2), 'indicação intacta');
  perform pg_temp.ok((select count(*) from public.nx_notas n where n.contato_id = ct2) = 0, 'e sem nota mentindo');

  -- com negócio aberto o comportamento da 20261009a continua
  insert into public.nx_leads (cliente_id, contato_id, titulo, nome, telefone, status, etapa, data_conversa, origem)
    values (cA, ct2, 'Negócio 25', 'Indicação 25', t2, 'aberto', 'nova', (now() at time zone 'America/Sao_Paulo')::date, 'whatsapp') returning id into l;
  j := public.nx_origem_frase(kM, t2, 'anuncio', 'meta', null);
  perform pg_temp.ok((j ->> 'aplicado')::boolean and (j ->> 'negocio_id')::bigint = l
                 and (select origem = 'anuncio' and plataforma = 'meta' from public.nx_leads where id = l), 'negócio aberto «whatsapp»: aplica no negócio');
  perform pg_temp.ok((select origem = 'indicacao' from public.nx_contatos where id = ct2), 'o contato de indicação continua indicação');
  perform pg_temp.ok(exists (select 1 from public.nx_versao_banco where nome = '20261009d_origem_frase_sem_negocio'), 'versão registrada');
  raise exception 'OK_25_ORIGEM_FRASE_SEM_NEGOCIO — sem negócio aberto: uma nota só, sem «aplicado» falso; com negócio, como antes';
end $t$;
rollback;
