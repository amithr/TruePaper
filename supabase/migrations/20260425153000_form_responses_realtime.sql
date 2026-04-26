-- Supabase Realtime: teachers can subscribe to form_responses for live session watch views.
-- REPLICA IDENTITY FULL helps postgres_changes filters and payloads for UPDATEs.

begin;

alter table public.form_responses replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'form_responses'
     ) then
    execute 'alter publication supabase_realtime add table public.form_responses';
  end if;
end;
$$;

commit;
