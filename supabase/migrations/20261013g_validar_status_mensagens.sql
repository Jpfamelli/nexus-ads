-- ============================================================
-- ÓRBITA — 20261013g_validar_status_mensagens.sql · plano «1000+ melhorias» de 13/10/2026 · frente srv, lote srv-3, migração g
--   SV-132 a CHECK nx_mensagens_status_check nasceu NOT VALID na 20261008b e nunca foi validada: o banco não garantia que as linhas
--   ANTIGAS obedecem. VALIDATE CONSTRAINT pega SHARE UPDATE EXCLUSIVE (não bloqueia leitura nem escrita), mas varre a maior tabela
--   do banco: aplicar FORA DO HORÁRIO e separada das outras. Linha antiga fora da lista → a migração falha (nada muda) e o ensaio em
--   ROLLBACK mostra antes. Idempotente: já validada (ou sem a constraint) → nada a fazer.
-- Smoke: supabase/testes/32_validar_status_mensagens.sql
-- ============================================================
do $$
begin
  if exists (select 1 from pg_constraint c
              where c.conrelid = 'public.nx_mensagens'::regclass and c.conname = 'nx_mensagens_status_check' and not c.convalidated) then
    alter table public.nx_mensagens validate constraint nx_mensagens_status_check;
  end if;
end $$;

insert into public.nx_versao_banco (nome) values ('20261013g_validar_status_mensagens')
on conflict (nome) do update set aplicada_em = now();

notify pgrst, 'reload schema';
