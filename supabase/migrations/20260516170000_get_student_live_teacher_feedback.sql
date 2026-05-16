-- Dedicated student read for live teacher feedback (not gated by session window).

begin;

create or replace function public.get_student_live_teacher_feedback(
  p_live_session_id uuid,
  p_device_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  enabled boolean := false;
  feedback jsonb := '{}'::jsonb;
begin
  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('enabled', false, 'feedback', '{}'::jsonb);
  end if;

  select
    coalesce(f.live_teacher_feedback_enabled, false),
    coalesce(fr.live_teacher_feedback, '{}'::jsonb)
  into enabled, feedback
  from public.form_responses fr
  inner join public.form_sessions fs on fs.id = fr.live_session_id
  inner join public.forms f on f.id = fs.form_id
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if not found then
    return jsonb_build_object('enabled', false, 'feedback', '{}'::jsonb);
  end if;

  return jsonb_build_object(
    'enabled', enabled,
    'feedback', feedback
  );
end;
$$;

revoke all on function public.get_student_live_teacher_feedback(uuid, text) from public;
grant execute on function public.get_student_live_teacher_feedback(uuid, text) to anon, authenticated, service_role;

commit;
