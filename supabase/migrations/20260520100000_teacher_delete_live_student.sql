-- Allow session owners to remove a single live student exam (form_responses row).

begin;

create or replace function public.teacher_delete_live_session_student(
  p_live_session_id uuid,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  if not exists (
    select 1 from public.form_sessions fs
    where fs.id = p_live_session_id
      and fs.created_by = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  delete from public.form_responses
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id)
    and student_id is null;

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'student response not found';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.teacher_delete_live_session_student(uuid, text) from public;
grant execute on function public.teacher_delete_live_session_student(uuid, text) to authenticated, service_role;

commit;
