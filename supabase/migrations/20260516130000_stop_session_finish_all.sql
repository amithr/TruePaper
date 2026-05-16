-- When a live session ends, mark every student device in that session as finished.

begin;

create or replace function public.finalize_all_live_session_students(p_live_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  now_ts timestamptz := timezone('utc', now());
begin
  if p_live_session_id is null then
    raise exception 'live session id required';
  end if;

  update public.form_responses
  set
    finished_at = now_ts,
    suspended_at = null,
    last_activity_at = now_ts,
    updated_at = now()
  where live_session_id = p_live_session_id
    and student_id is null
    and finished_at is null;

  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.stop_live_session(p_live_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  now_ts timestamptz := timezone('utc', now());
  finished_count integer;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'unauthorized';
  end if;

  if not exists (
    select 1
    from public.form_sessions fs
    where fs.id = p_live_session_id
      and fs.created_by = uid
  ) then
    raise exception 'session not found';
  end if;

  update public.form_sessions
  set closes_at = now_ts
  where id = p_live_session_id;

  finished_count := public.finalize_all_live_session_students(p_live_session_id);

  return jsonb_build_object(
    'ok', true,
    'closesAt', now_ts,
    'finishedCount', finished_count
  );
end;
$$;

revoke all on function public.finalize_all_live_session_students(uuid) from public;
revoke all on function public.stop_live_session(uuid) from public;

grant execute on function public.finalize_all_live_session_students(uuid) to anon, authenticated, service_role;
grant execute on function public.stop_live_session(uuid) to authenticated, service_role;

commit;
