with base(t,n,h) as (values
('nx_acessos',0,'vazio'),
('nx_agenda_bloqueios',0,'vazio'),
('nx_agenda_config',0,'vazio'),
('nx_alertas',0,'vazio'),
('nx_auditoria',11,'500b9d557d1e5a9589a1a2dfd9044ad8'),
('nx_auto_execucoes',0,'vazio'),
('nx_automacoes',0,'vazio'),
('nx_campos',0,'vazio'),
('nx_canais',0,'vazio'),
('nx_clientes(linha)',1,'a7dd170e4e8ce214b80a34aad804ba0a'),
('nx_contatos',0,'vazio'),
('nx_conversas',0,'vazio'),
('nx_convites',0,'vazio'),
('nx_departamentos',2,'1cd6b67179c667357af061f57ea298fa'),
('nx_dominios',0,'vazio'),
('nx_empresas',0,'vazio'),
('nx_envios_fila',0,'vazio'),
('nx_estagios',12,'5d0cff60b090affda62b8afff80dbd94'),
('nx_etiquetas',9,'4769863f8bae87450541efd5be76faf3'),
('nx_eventos',0,'vazio'),
('nx_funis',2,'bf6cf95ab8884236e71d30e2dd6a28eb'),
('nx_historico',0,'vazio'),
('nx_ia_reservas',0,'vazio'),
('nx_ia_uso',0,'vazio'),
('nx_importacoes',0,'vazio'),
('nx_leads',0,'vazio'),
('nx_mensagens',0,'vazio'),
('nx_metricas_dia',0,'vazio'),
('nx_midia_lixo',0,'vazio'),
('nx_motivos_perda',6,'4e0446abeef9c86ed8ba8d3baef368a1'),
('nx_notas',0,'vazio'),
('nx_notificacoes',0,'vazio'),
('nx_pulsos',1,'591c3fd3ba85e99b3a6b3a67e61e1d89'),
('nx_rastreio',0,'vazio'),
('nx_relatorios',0,'vazio'),
('nx_respostas',8,'55a66ed39b1c1190647d16949cfd0996'),
('nx_seq',0,'vazio'),
('nx_tarefas',0,'vazio'),
('nx_templates',0,'vazio'),
('nx_visoes',0,'vazio')
), t as (
  select c.table_name from information_schema.columns c
  join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
  where c.table_schema = 'public' and c.column_name = 'cliente_id' and c.table_name <> 'nx_integracoes'
), r as (
  select t.table_name, x from t cross join lateral query_to_xml(format('select count(*) n, coalesce(md5(string_agg(md5(z::text), %L order by md5(z::text))), %L) h from public.%I z where cliente_id = %L', ',', 'vazio', t.table_name, 'a2b5708e-987a-40a1-af32-4b89bf10756b'), false, true, '') x
), agora as (
  select table_name as t, (xpath('/row/n/text()', x))[1]::text::int as n, (xpath('/row/h/text()', x))[1]::text as h from r
  union all select 'nx_clientes(linha)', 1, md5(z::text) from public.nx_clientes z where z.id = 'a2b5708e-987a-40a1-af32-4b89bf10756b'
)
select coalesce(a.t, b.t) as tabela, b.n as n_antes, a.n as n_depois, b.h as hash_antes, a.h as hash_depois,
       (select count(*) from vault.secrets) as vault_secrets, (select count(*) from agora) as tabelas_comparadas,
       (select count(*) from base b2 join agora a2 on a2.t=b2.t and (a2.n<>b2.n or a2.h<>b2.h)) as tabelas_diferentes
from agora a full join base b on a.t = b.t
where a.h is distinct from b.h or a.n is distinct from b.n
union all
select 'RESUMO', null, null, null, null, (select count(*) from vault.secrets), (select count(*) from agora), (select count(*) from base b2 join agora a2 on a2.t=b2.t and (a2.n<>b2.n or a2.h<>b2.h));