-- ============================================================
-- ÓRBITA — supabase/testes/32_validar_status_mensagens.sql · smoke de 20261013g_validar_status_mensagens.sql (plano 1000, srv-3)
--   SV-132 a CHECK de status das mensagens está VALIDADA e continua recusando status fora da lista
-- Roda em begin … rollback; termina em raise exception 'OK_32_…'.
-- ============================================================
begin;
create or replace function pg_temp.ok(p boolean, p_caso text) returns void language plpgsql as $f$
begin
  if not coalesce(p, false) then raise exception 'FALHOU: %', p_caso; end if;
end $f$;

do $t$
declare v_erro text;
begin
  perform pg_temp.ok(exists (select 1 from public.nx_versao_banco where nome = '20261013g_validar_status_mensagens'), 'versão registrada');
  perform pg_temp.ok((select c.convalidated from pg_constraint c where c.conrelid = 'public.nx_mensagens'::regclass and c.conname = 'nx_mensagens_status_check'),
    'nx_mensagens_status_check validada (convalidated = true)');
  begin
    update public.nx_mensagens set status = 'inventado' where id = (select id from public.nx_mensagens limit 1);
    v_erro := case when found then 'gravou' else 'sem_linhas' end;
  exception when check_violation then v_erro := 'recusou';
  end;
  perform pg_temp.ok(v_erro in ('recusou', 'sem_linhas'), 'status fora da lista continua recusado (' || v_erro || ')');
  raise exception 'OK_32_VALIDAR_STATUS_MENSAGENS — CHECK de status validada';
end $t$;
rollback;
