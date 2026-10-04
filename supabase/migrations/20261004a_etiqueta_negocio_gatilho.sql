-- ============================================================
-- ÓRBITA — 20261004a_etiqueta_negocio_gatilho.sql · prova das automações no teste-e2e (04/10/2026)
--
-- Falha encontrada: o gatilho «etiqueta_adicionada» («quando alguém ganha uma etiqueta») só disparava para etiqueta
-- posta em CONTATO ou CONVERSA. Etiqueta posta no NEGÓCIO (a gaveta da oportunidade, o Kanban e a própria ação
-- «etiqueta_adicionar» das automações mexem em nx_leads.etiquetas) não gerava evento: automações como
-- «Urgência → IA pontua o lead» nunca rodavam.
--
-- Correção: a mesma função de gatilho ganha o ramo de nx_leads (ref com negocio_id + contato_id, alvo «negocio») e
-- a tabela ganha o gatilho (insert e update de etiquetas). Aditiva e idempotente (create or replace + drop trigger
-- if exists). Nenhum dado alterado. Teste: supabase/testes/18_etiqueta_negocio_gatilho.sql (begin … rollback).
-- ============================================================
set local lock_timeout = '5s';

create or replace function public.nx_tg_auto_etiqueta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare e uuid;
begin
  if not exists (select 1 from public.nx_automacoes a
                  where a.cliente_id = new.cliente_id and a.gatilho = 'etiqueta_adicionada' and a.ativo) then
    return null;
  end if;
  for e in select x from unnest(new.etiquetas) x where not (x = any(coalesce(old.etiquetas, '{}'::uuid[]))) loop
    if tg_table_name = 'nx_conversas' then
      if new.oculta then continue; end if;
      perform public.nx_auto_evento(new.cliente_id, 'etiqueta_adicionada', jsonb_build_object(
        'conversa_id', new.id, 'contato_id', new.contato_id, 'etiqueta_id', e, 'alvo', 'conversa'));
    elsif tg_table_name = 'nx_leads' then
      -- etiqueta no NEGÓCIO: o alvo das ações é a própria oportunidade (negocio_id), com o contato dela
      perform public.nx_auto_evento(new.cliente_id, 'etiqueta_adicionada', jsonb_build_object(
        'negocio_id', new.id, 'contato_id', new.contato_id, 'funil_id', new.funil_id, 'estagio_para', new.estagio_id,
        'etiqueta_id', e, 'alvo', 'negocio'));
    else
      perform public.nx_auto_evento(new.cliente_id, 'etiqueta_adicionada', jsonb_build_object(
        'contato_id', new.id, 'etiqueta_id', e, 'alvo', 'contato'));
    end if;
  end loop;
  return null;
end $$;

drop trigger if exists nx_auto_ev_negocio_etq on public.nx_leads;
create trigger nx_auto_ev_negocio_etq after insert or update of etiquetas on public.nx_leads
  for each row execute function public.nx_tg_auto_etiqueta();
