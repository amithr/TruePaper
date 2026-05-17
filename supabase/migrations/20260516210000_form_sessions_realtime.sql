-- Teachers: realtime updates when sessions start/stop or window changes.

begin;

alter table public.form_sessions replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'form_sessions'
     ) then
    execute 'alter publication supabase_realtime add table public.form_sessions';
  end if;
end;
$$;

commit;
