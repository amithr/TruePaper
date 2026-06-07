-- Allow live teacher feedback on every question type (not only written responses).

begin;

create or replace function public.set_live_teacher_feedback(
  p_live_session_id uuid,
  p_device_id text,
  p_question_id uuid,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  fid uuid;
  existing jsonb;
  trimmed text;
  question_found uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select sess.form_id
  into fid
  from public.form_sessions sess
  join public.forms f on f.id = sess.form_id
  where sess.id = p_live_session_id
    and sess.created_by = uid
    and coalesce(f.live_teacher_feedback_enabled, false);

  if fid is null then
    raise exception 'not allowed';
  end if;

  select q.id
  into question_found
  from public.questions q
  where q.id = p_question_id
    and q.form_id = fid;

  if question_found is null then
    raise exception 'question not found';
  end if;

  select coalesce(fr.live_teacher_feedback, '{}'::jsonb)
  into existing
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if not found then
    raise exception 'student response not found';
  end if;

  trimmed := left(trim(coalesce(p_message, '')), 2000);

  if trimmed = '' then
    existing := existing - p_question_id::text;
  else
    existing := existing || jsonb_build_object(p_question_id::text, trimmed);
  end if;

  update public.form_responses
  set
    live_teacher_feedback = existing,
    updated_at = now()
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id)
    and student_id is null;

  return existing;
end;
$$;

commit;
