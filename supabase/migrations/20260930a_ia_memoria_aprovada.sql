-- ÓRBITA — conhecimento operacional aprovado para o agente.
-- Migração aditiva: só amplia o JSON cfg.ia e preserva a ACL da RPC existente.
-- A memória é texto revisado pela equipe, limitada, lida como dado e não treina o modelo.
create or replace function public.nx_ia_config_salvar(p_token text, p_cliente uuid, p_ia jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.nx_ctx_t := public.nx_ctx(p_token, p_cliente, 'admin');
  r jsonb := coalesce(p_ia, '{}'::jsonb);
  atual jsonb;
  novo jsonb;
  k text;
  v_soma int;
begin
  perform public.nx_exigir_modulo(p_cliente, 'conversas');
  if jsonb_typeof(r) <> 'object' then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'ia';
  end if;
  select case when jsonb_typeof(c.cfg -> 'ia') = 'object' then c.cfg -> 'ia' else '{}'::jsonb end
    into atual from public.nx_clientes c where c.id = p_cliente for update;
  novo := atual;
  foreach k in array array['sobre', 'servicos', 'horarios', 'regras', 'proibido', 'memoria_aprovada'] loop
    if r ? k then
      if jsonb_typeof(r -> k) not in ('string', 'null') then
        raise exception 'dados_invalidos' using errcode = '22023', hint = k;
      end if;
      if k = 'memoria_aprovada' and char_length(btrim(coalesce(r ->> k, ''))) > 3000 then
        raise exception 'dados_invalidos' using errcode = '22023', hint = k;
      end if;
      novo := novo || jsonb_build_object(k, btrim(coalesce(r ->> k, '')));
    end if;
  end loop;
  foreach k in array array['assistente_nome', 'endereco', 'boas_vindas'] loop
    if r ? k then
      if jsonb_typeof(r -> k) not in ('string', 'null')
         or char_length(btrim(coalesce(r ->> k, ''))) > (case k when 'assistente_nome' then 40 when 'endereco' then 300 else 500 end) then
        raise exception 'dados_invalidos' using errcode = '22023', hint = k;
      end if;
      novo := novo || jsonb_build_object(k, btrim(coalesce(r ->> k, '')));
    end if;
  end loop;
  if r ? 'tom' then
    if coalesce(r ->> 'tom', '') not in ('formal', 'proximo') then
      raise exception 'dados_invalidos' using errcode = '22023', hint = 'tom';
    end if;
    novo := novo || jsonb_build_object('tom', r ->> 'tom');
  end if;
  v_soma := coalesce(char_length(novo ->> 'sobre'), 0) + coalesce(char_length(novo ->> 'servicos'), 0)
          + coalesce(char_length(novo ->> 'horarios'), 0) + coalesce(char_length(novo ->> 'regras'), 0)
          + coalesce(char_length(novo ->> 'proibido'), 0) + coalesce(char_length(novo ->> 'memoria_aprovada'), 0);
  if v_soma > 15000 then
    raise exception 'dados_invalidos' using errcode = '22023', hint = 'tamanho';
  end if;
  update public.nx_clientes set cfg = jsonb_set(coalesce(cfg, '{}'::jsonb), '{ia}', novo, true)
   where id = p_cliente;
  return json_build_object(
    'sobre', coalesce(novo ->> 'sobre', ''), 'servicos', coalesce(novo ->> 'servicos', ''),
    'horarios', coalesce(novo ->> 'horarios', ''), 'regras', coalesce(novo ->> 'regras', ''),
    'proibido', coalesce(novo ->> 'proibido', ''),
    'memoria_aprovada', coalesce(novo ->> 'memoria_aprovada', ''),
    'tom', case when novo ->> 'tom' = 'formal' then 'formal' else 'proximo' end,
    'assistente_nome', coalesce(novo ->> 'assistente_nome', ''), 'endereco', coalesce(novo ->> 'endereco', ''),
    'boas_vindas', coalesce(novo ->> 'boas_vindas', ''),
    'caracteres', v_soma);
end $$;
