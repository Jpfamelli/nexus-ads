-- ============================================================
-- ÓRBITA — testes/e2e/sql/meta-01-seed-metricas.sql
-- Métricas FICTÍCIAS (plataforma meta) só do cliente 'meta-3009': dão o nome da campanha e do
-- anúncio para o referral de anúncio (CTWA) do E2E do canal Meta. Apagadas com o cliente.
-- ============================================================
insert into public.nx_metricas_dia (cliente_id, plataforma, data, nivel, campanha_ext, campanha_nome, anuncio_ext, anuncio_nome,
                                    impressoes, alcance, frequencia, cliques, gasto, conversoes, valor_conversao)
select c.id, 'meta', ((now() at time zone 'America/Sao_Paulo')::date - d), n.nivel, 'META-3009-CAMP-1', 'META-3009 Campanha Clareamento',
       case when n.nivel = 'anuncio' then 'META-3009-AD-1' else '' end, case when n.nivel = 'anuncio' then 'META-3009 Anúncio Sorriso' end,
       1000 + d * 10, 800 + d * 5, 1.25, 40 + d, 55.50 + d, 3, 0
from public.nx_clientes c cross join (values ('campanha'), ('anuncio')) n(nivel) cross join generate_series(1, 3) d
where c.slug = 'meta-3009'
on conflict do nothing;
select count(*) as metricas_meta3009 from public.nx_metricas_dia m join public.nx_clientes c on c.id = m.cliente_id where c.slug = 'meta-3009';
