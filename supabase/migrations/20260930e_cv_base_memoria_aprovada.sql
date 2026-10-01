-- Órbita — a leitura da configuração da IA devolve a memória aprovada (complemento de 20260930a_ia_memoria_aprovada.sql).
-- Sem isto a tela de Configurações (que lê base.config.ia) não mostraria o valor salvo e o próximo "salvar" o apagaria.
-- Aditiva: só substitui nx_cv_base (assinatura, ACL e segurança iguais). Cópia de 20260929a_codewords.sql (idêntica ao banco)
-- + a chave memoria_aprovada em config.ia. Aplicar DEPOIS de 20260930a.
create or replace function public.nx_cv_base(p_token text, p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'leitura');
  v_cfg jsonb;
  v_iacfg jsonb;
  v_ia boolean;
  v_config json;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  select coalesce(c.cfg -> 'cv', '{}'::jsonb),
         case when jsonb_typeof(c.cfg -> 'ia') = 'object' then c.cfg -> 'ia' else '{}'::jsonb end
    into v_cfg, v_iacfg
    from public.nx_clientes c where c.id = p_cliente;
  select coalesce(nullif(btrim(x.anthropic_api_key), ''), '') <> '' into v_ia from public.nx_config x where x.id = 1;
  if public.nx_rank(v.papel) >= 3 then
    v_config := json_build_object(
      'departamentos', coalesce((select json_agg(public.nx_cv_json_dep(d) order by d.ordem, d.nome)
                                   from public.nx_departamentos d where d.cliente_id = p_cliente), '[]'::json),
      'ia', json_build_object(
              'sobre', coalesce(v_iacfg ->> 'sobre', ''), 'servicos', coalesce(v_iacfg ->> 'servicos', ''),
              'horarios', coalesce(v_iacfg ->> 'horarios', ''), 'regras', coalesce(v_iacfg ->> 'regras', ''),
              'proibido', coalesce(v_iacfg ->> 'proibido', ''),
              'memoria_aprovada', coalesce(v_iacfg ->> 'memoria_aprovada', ''),
              'tom', case when v_iacfg ->> 'tom' = 'formal' then 'formal' else 'proximo' end,
              'assistente_nome', coalesce(v_iacfg ->> 'assistente_nome', ''),
              'endereco', coalesce(v_iacfg ->> 'endereco', ''),
              'boas_vindas', coalesce(v_iacfg ->> 'boas_vindas', '')));
  end if;
  return json_build_object(
    'eu', json_build_object('id', v.conta_id, 'nome', v.nome, 'papel', v.papel,
                            'departamentos', to_json(v.departamentos), 'ver_todas', v.ver_todas),
    'canais', coalesce((select json_agg(json_build_object(
                 'id', k.id, 'nome', k.nome, 'numero_exibicao', k.numero_exibicao, 'status', k.status,
                 'coexistencia', k.coexistencia,
                 'tem_token', case when k.provedor = 'codewords'
                                   then k.codewords_api_segredo is not null and k.codewords_phone_id is not null
                                   else k.token_segredo is not null end,
                 'provedor', k.provedor,
                 'ia_ligada', case when k.provedor = 'codewords' then k.ia_ligada end,
                 'ia_rota', case when k.provedor = 'codewords' then k.codewords_rota end,
                 'departamento_id', k.departamento_id, 'app_inscrito', k.app_inscrito,
                 'ultimo_erro', k.ultimo_erro) order by k.criado_em)
               from public.nx_canais k where k.cliente_id = p_cliente), '[]'::json),
    'departamentos', coalesce((select json_agg(json_build_object(
                 'id', d.id, 'nome', d.nome, 'cor', d.cor, 'padrao', d.padrao,
                 'distribuicao', d.distribuicao, 'ativo', d.ativo) order by d.ordem, d.nome)
               from public.nx_departamentos d where d.cliente_id = p_cliente and d.ativo), '[]'::json),
    'respostas', coalesce((select json_agg(json_build_object(
                 'id', r.id, 'atalho', r.atalho, 'titulo', r.titulo, 'corpo', r.corpo,
                 'departamento_id', r.departamento_id, 'usos', r.usos, 'ordem', r.ordem, 'ativo', r.ativo)
                 order by r.ordem, r.atalho)
               from public.nx_respostas r where r.cliente_id = p_cliente), '[]'::json),
    'etiquetas', coalesce((select json_agg(json_build_object('id', e.id, 'nome', e.nome, 'cor', e.cor)
                 order by lower(e.nome))
               from public.nx_etiquetas e where e.cliente_id = p_cliente), '[]'::json),
    'usuarios', coalesce((select json_agg(json_build_object(
                 'id', k.id, 'nome', k.nome, 'papel', a.papel, 'departamentos', to_json(a.departamentos),
                 'recebe_conversas', a.recebe_conversas, 'aprovado', k.aprovado) order by k.nome)
               from public.nx_acessos a join public.nx_contas k on k.id = a.conta_id
              where a.cliente_id = p_cliente), '[]'::json),
    'templates', coalesce((select json_agg(json_build_object(
                 'id', t.id, 'canal_id', t.canal_id, 'nome', t.nome, 'idioma', t.idioma,
                 'categoria', t.categoria, 'status', t.status, 'corpo', t.corpo,
                 'num_parametros', t.num_parametros) order by t.nome, t.idioma)
               from public.nx_templates t where t.cliente_id = p_cliente), '[]'::json),
    'cfg', json_build_object(
                 'recibo_leitura', coalesce((v_cfg ->> 'recibo_leitura')::boolean, true),
                 'assinatura', coalesce((v_cfg ->> 'assinatura')::boolean, false)),
    'ia', json_build_object('ligada', coalesce(v_ia, false),
                            'cota', json_build_object('usadas', public.nx_uso(p_cliente, 'ia_mes'),
                                                      'limite', public.nx_limite(p_cliente, 'ia_mes'))),
    'config', v_config);
end $$;
