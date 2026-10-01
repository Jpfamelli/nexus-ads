-- Órbita — recuperação segura da fila de mensagens.
-- Um POST interrompido pode ter sido aceito pelo provedor antes de o processo cair.
-- Não o reenvie automaticamente: marque como incerto e deixe um humano conferir.
begin;

create or replace function public.nx_fila_chamar()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.nx_envios_fila f set
    status = 'falhou',
    erro = left(case when coalesce(f.erro, '') = ''
      then 'STATUS INCERTO: o processo foi interrompido durante o envio; confira a conversa antes de reenviar.'
      else f.erro || ' · STATUS INCERTO: o processo foi interrompido durante o envio; confira a conversa antes de reenviar.'
    end, 1000),
    processado_em = clock_timestamp(),
    pego_em = null
  where f.status = 'enviando'
    and coalesce(f.pego_em, f.enviar_em + interval '50 minutes') < clock_timestamp() - interval '10 minutes';

  if exists (select 1 from public.nx_envios_fila f where f.status = 'pendente' and f.enviar_em <= now())
     or exists (select 1 from public.nx_midia_lixo m where m.apagado_em is null and m.erro is null) then
    begin
      perform public.nx_disparar('nx-enviar', '{"fila":true}'::jsonb);
    exception when others then
      -- nx_disparar ainda sem nx-enviar ou sem funcoes_url: a fila espera a próxima rodada
      raise warning 'nx_fila_chamar: %', sqlerrm;
    end;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
