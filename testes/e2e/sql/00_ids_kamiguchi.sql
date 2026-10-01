-- E2E-3009 · gera o kam-ids.json (só ids; nada sensível) que o orbita-e2e.mjs usa para TENTAR (e falhar) mexer no cliente real.
-- Salve o resultado como ${E2E_DIR}/kam-ids.json (mantenha só 2-3 ids por lista se quiser).
select json_build_object(
 'cliente', (select id from public.nx_clientes where slug = 'kamiguchi'),
 'funis', (select json_agg(id) from public.nx_funis where cliente_id = (select id from public.nx_clientes where slug = 'kamiguchi')),
 'estagios', (select json_agg(id order by ordem) from public.nx_estagios where cliente_id = (select id from public.nx_clientes where slug = 'kamiguchi')),
 'etiquetas', (select json_agg(id) from public.nx_etiquetas where cliente_id = (select id from public.nx_clientes where slug = 'kamiguchi')),
 'departamentos', (select json_agg(id) from public.nx_departamentos where cliente_id = (select id from public.nx_clientes where slug = 'kamiguchi')),
 'respostas', (select json_agg(id) from public.nx_respostas where cliente_id = (select id from public.nx_clientes where slug = 'kamiguchi')),
 'motivos', (select json_agg(id) from public.nx_motivos_perda where cliente_id = (select id from public.nx_clientes where slug = 'kamiguchi'))
) as kam_ids;
