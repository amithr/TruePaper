-- Allow session owners to permanently delete a closed (non-running) live session.

begin;

create or replace function public.teacher_delete_live_session(p_live_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  now_ts timestamptz := timezone('utc', now());
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.form_sessions fs
    where fs.id = p_live_session_id
      and fs.created_by = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  if exists (
    select 1 from public.form_sessions fs
    where fs.id = p_live_session_id
      and fs.opens_at <= now_ts
      and fs.closes_at >= now_ts
  ) then
    raise exception 'session still running';
  end if;

  delete from public.form_sessions
  where id = p_live_session_id
    and created_by = auth.uid();

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'session not found';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.teacher_delete_live_session(uuid) from public;
grant execute on function public.teacher_delete_live_session(uuid) to authenticated, service_role;

commit;
