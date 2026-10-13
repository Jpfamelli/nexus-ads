-- ============================================================
-- 20261013h · plano 1000 · nx_config_ver devolve ia_aviso_custo_usd
--   O teto do aviso diário de custo de IA (SV-071, 20261013e) era gravado por nx_config_salvar
--   mas não voltava na leitura: o painel clássico não tinha como mostrar o valor atual.
--   Aditiva: mesma função de 20260928b + uma chave. Idempotente (create or replace + grants).
-- ============================================================

create or replace function public.nx_config_ver(p_token text)
 returns json
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare c public.nx_contas := public.nx_exigir_gestor(p_token); cfg public.nx_config;
begin
  if not public.nx_super(c) then raise exception 'so_plataforma' using errcode = '42501'; end if;
  select * into cfg from public.nx_config where id = 1;
  return json_build_object(
    'webhook_url', cfg.funcoes_url || '/nx-whatsapp',
    'wa_verify_token', cfg.wa_verify_token,
    'painel_url', cfg.painel_url,
    'modelo_ia', cfg.modelo_ia,
    'wa_template', cfg.wa_template,
    'wa_phone_number_id', cfg.wa_phone_number_id,
    'google_api_versao', cfg.google_api_versao,
    'tem_wa_token', cfg.wa_access_token is not null,
    'tem_app_secret', cfg.meta_app_secret is not null,
    'tem_ia', cfg.anthropic_api_key is not null,
    'saas_url', cfg.saas_url,
    'ia_aviso_custo_usd', cfg.ia_aviso_custo_usd,
    'ultimas_execucoes', coalesce((
      select json_agg(row_to_json(e) order by e.inicio desc)
        from (select tarefa, inicio, fim, ok, resumo from public.nx_execucoes order by inicio desc limit 8) e), '[]'::json));
end $function$;

revoke all on function public.nx_config_ver(text) from public, anon, authenticated;
grant execute on function public.nx_config_ver(text) to anon, service_role;   -- authenticated fica de fora (20261008b)

insert into public.nx_versao_banco (nome) values ('20261013h_config_ver_custo_ia')
on conflict (nome) do update set aplicada_em = now();

notify pgrst, 'reload schema';
