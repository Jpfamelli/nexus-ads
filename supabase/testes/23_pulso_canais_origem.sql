-- Smoke da 20261009b_pulso_canais_origem: nx_pulso.canais (estado + desde, só do cliente, qualquer papel) e
-- contato.origem/plataforma na lista de conversas. Roda em transação e desfaz tudo; termina em raise exception 'OK_23_…'.
begin;
create or replace function pg_temp.ok(p boolean, p_caso text) returns void language plpgsql as $f$
begin
  if not coalesce(p, false) then raise exception 'FALHOU: %', p_caso; end if;
end $f$;
do $t$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  org_p uuid; cA uuid; cB uuid; k_adm uuid; k_at uuid; kM uuid; kC uuid; kB uuid; ct bigint; cv bigint;
  t_adm text := 'tok-23-adm-' || sfx; t_at text := 'tok-23-at-' || sfx;
  tel text := '5512992' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  j json; jb jsonb;
begin
  select id into org_p from public.nx_orgs where tipo = 'plataforma' limit 1;
  perform pg_temp.ok(org_p is not null, 'fixture: org da plataforma');
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status) values ('t23-a-' || sfx, 'Teste 23 A', org_p, 'interno', 'odonto', 'ativo') returning id into cA;
  insert into public.nx_clientes (slug, nome, org_id, plano, vertical, status) values ('t23-b-' || sfx, 'Teste 23 B', org_p, 'interno', 'odonto', 'ativo') returning id into cB;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t23-adm-' || sfx || '@teste.local', 'Admin 23', 'x', 'clinica', true, org_p) returning id into k_adm;
  insert into public.nx_contas (email, nome, senha_hash, papel, aprovado, org_id) values ('t23-at-' || sfx || '@teste.local', 'Atendente 23', 'x', 'clinica', true, org_p) returning id into k_at;
  insert into public.nx_acessos (conta_id, cliente_id, papel) values (k_adm, cA, 'admin'), (k_at, cA, 'atendente');
  insert into public.nx_sessoes (token_hash, conta_id, expira_em) values
    (public.nx_hash(t_adm), k_adm, now() + interval '1 hour'), (public.nx_hash(t_at), k_at, now() + interval '1 hour');
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor) values (cA, 'Meta 23', 'pn-23-' || sfx, 'meta') returning id into kM;
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor, codewords_api_segredo, codewords_phone_id, codewords_numero, codewords_rota, codewords_conectado)
    values (cA, 'Aparelho 23', null, 'codewords', gen_random_uuid(), 'ph-23-' || sfx, '+5512998230000', 'direta', true) returning id into kC;
  insert into public.nx_canais (cliente_id, nome, phone_number_id, provedor) values (cB, 'Meta 23 B', 'pn-23b-' || sfx, 'meta') returning id into kB;

  -- 1. pulso.canais
  j := public.nx_pulso(t_adm, cA);
  perform pg_temp.ok(json_array_length(j -> 'canais') = 2, 'só os 2 números do cliente (o do outro cliente fica fora) ' || (j -> 'canais')::text);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'canais') x where (x ->> 'id')::uuid = kC and x ->> 'estado' = 'conectado'
                               and x ->> 'nome' = 'Aparelho 23' and (x ->> 'desde') is null), 'aparelho conectado, sem histórico ainda: desde nulo');
  perform pg_temp.ok((j::jsonb ? 'v') and (j::jsonb ? 'notif') and (j::jsonb ? 'nao_lidas') and (j::jsonb ? 'agora'), 'as chaves de antes continuam');
  j := public.nx_codewords_situacao(kC, cA, '{"conectado": true, "estado": "logged_in"}'::jsonb);
  j := public.nx_codewords_situacao(kC, cA, '{"conectado": false, "estado": "logged_out"}'::jsonb);
  j := public.nx_pulso(t_at, cA);
  perform pg_temp.ok(exists (select 1 from json_array_elements(j -> 'canais') x where (x ->> 'id')::uuid = kC and x ->> 'estado' = 'desconectado'
                               and (x ->> 'desde')::timestamptz > now() - interval '1 minute'), 'caiu: o ATENDENTE também vê, com «desde» da queda');
  perform pg_temp.ok(not exists (select 1 from json_array_elements(public.nx_pulso(t_adm, cA) -> 'canais') x where (x ->> 'id')::uuid = kB), 'isolamento entre clientes');

  -- 2. contato.origem na lista
  insert into public.nx_contatos (cliente_id, nome, telefone, origem, plataforma) values (cA, 'Contato 23', tel, 'anuncio', 'meta') returning id into ct;
  insert into public.nx_conversas (cliente_id, canal_id, contato_id, protocolo, status) values (cA, kM, ct, '2026-23' || sfx, 'aberta') returning id into cv;
  jb := (select public.nx_cv_json_item(c) from public.nx_conversas c where c.id = cv);
  perform pg_temp.ok(jb -> 'contato' ->> 'origem' = 'anuncio' and jb -> 'contato' ->> 'plataforma' = 'meta', 'contato.origem e plataforma na lista ' || (jb -> 'contato')::text);
  perform pg_temp.ok((jb -> 'contato') ? 'bloqueado' and (jb -> 'contato') ? 'optin_marketing' and jb ? 'janela_ate', 'as chaves de antes continuam');
  perform pg_temp.ok(exists (select 1 from public.nx_versao_banco where nome = '20261009b_pulso_canais_origem'), 'versão registrada');
  raise exception 'OK_23_PULSO_CANAIS_ORIGEM — pulso com o estado dos números (qualquer papel, só do cliente) e origem do contato na lista';
end $t$;
rollback;
