-- E2E-3009 · semeia métricas FICTÍCIAS de campanha SÓ no tenant 'teste-e2e' (prefixo E2E-3009).
-- Google G1: campanha + anúncio (resíduo de 10,00 / 100 imp / 5 cliques / 1 conv no dia -4 só no nível campanha).
-- Meta M1: campanha + anúncio iguais. 7 dias (hoje-7 .. hoje-1), valores determinísticos:
--   Google: gasto 50+5i · impr 1000+100i · cliques 40+4i · conv 2+(i%2)
--   Meta:   gasto 30+3i · impr 2000+50i  · cliques 60+2i · conv 1+(i%3=0)  · freq 1,8 · alcance = 60% das impressões
-- Totais esperados: gasto 784 (G 490 + M 294) · conv 27 (G 18 + M 9) · impr 25.200 · cliques 868.
insert into public.nx_metricas_dia (cliente_id, plataforma, data, nivel, campanha_ext, campanha_nome, anuncio_ext, anuncio_nome,
                                    impressoes, alcance, frequencia, cliques, gasto, conversoes)
select c.id, 'google', (now() at time zone 'America/Sao_Paulo')::date - i, 'campanha', 'E2E-3009-CAMP-G1', 'E2E-3009 Campanha Implante', '', null,
       1000 + 100 * i, 0, 0, 40 + 4 * i, 50 + 5 * i, 2 + (i % 2)
  from public.nx_clientes c, generate_series(1, 7) i where c.slug = 'teste-e2e'
union all
select c.id, 'google', (now() at time zone 'America/Sao_Paulo')::date - i, 'anuncio', 'E2E-3009-CAMP-G1', 'E2E-3009 Campanha Implante', 'E2E-3009-AD-G1', 'E2E-3009 Video Sorriso',
       1000 + 100 * i - case when i = 4 then 100 else 0 end, 0, 0, 40 + 4 * i - case when i = 4 then 5 else 0 end,
       50 + 5 * i - case when i = 4 then 10 else 0 end, 2 + (i % 2) - case when i = 4 then 1 else 0 end
  from public.nx_clientes c, generate_series(1, 7) i where c.slug = 'teste-e2e'
union all
select c.id, 'meta', (now() at time zone 'America/Sao_Paulo')::date - i, 'campanha', 'E2E-3009-CAMP-M1', 'E2E-3009 Campanha Facial', '', null,
       2000 + 50 * i, (2000 + 50 * i) * 6 / 10, 1.8, 60 + 2 * i, 30 + 3 * i, 1 + (case when i % 3 = 0 then 1 else 0 end)
  from public.nx_clientes c, generate_series(1, 7) i where c.slug = 'teste-e2e'
union all
select c.id, 'meta', (now() at time zone 'America/Sao_Paulo')::date - i, 'anuncio', 'E2E-3009-CAMP-M1', 'E2E-3009 Campanha Facial', 'E2E-3009-AD-M1', 'E2E-3009 Reel Facial',
       2000 + 50 * i, (2000 + 50 * i) * 6 / 10, 1.8, 60 + 2 * i, 30 + 3 * i, 1 + (case when i % 3 = 0 then 1 else 0 end)
  from public.nx_clientes c, generate_series(1, 7) i where c.slug = 'teste-e2e';

select plataforma, nivel, count(*) linhas, sum(gasto) gasto, sum(impressoes) impr, sum(cliques) cliques, sum(conversoes) conv
  from public.nx_metricas_dia m join public.nx_clientes c on c.id = m.cliente_id
 where c.slug = 'teste-e2e' and m.campanha_ext like 'E2E-3009-%' group by 1, 2 order by 1, 2;
