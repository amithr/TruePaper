-- Rejoin codes are teacher-issued only (not auto-generated or shown to students during the exam).

begin;

create or replace function public.get_live_session_student_response(p_live_session_id uuid, p_device_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  fs record;
  fid uuid;
  feedback_enabled boolean := false;
  ans jsonb;
  live_fb jsonb;
  susp boolean := false;
  fin boolean := false;
  disp text := '';
  session_open boolean := false;
begin
  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object(
      'answers', '{}'::jsonb,
      'suspended', false,
      'finished', false,
      'displayName', '',
      'liveTeacherFeedback', '{}'::jsonb,
      'liveTeacherFeedbackEnabled', false,
      'resumeCode', null
    );
  end if;

  select * into fs from public.form_sessions where id = p_live_session_id limit 1;
  if not found then
    return jsonb_build_object(
      'answers', '{}'::jsonb,
      'suspended', false,
      'finished', false,
      'displayName', '',
      'liveTeacherFeedback', '{}'::jsonb,
      'liveTeacherFeedbackEnabled', false,
      'resumeCode', null
    );
  end if;

  session_open :=
    timezone('utc', now()) >= fs.opens_at
    and timezone('utc', now()) <= fs.closes_at;

  fid := fs.form_id;
  select coalesce(f.live_teacher_feedback_enabled, false)
  into feedback_enabled
  from public.forms f
  where f.id = fid;

  select fr.answers,
         coalesce(fr.live_teacher_feedback, '{}'::jsonb),
         (fr.suspended_at is not null),
         (fr.finished_at is not null),
         coalesce(nullif(trim(fr.student_display_name), ''), '')
  into ans, live_fb, susp, fin, disp
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if not found then
    if not session_open then
      return jsonb_build_object(
        'answers', '{}'::jsonb,
        'suspended', false,
        'finished', false,
        'displayName', '',
        'liveTeacherFeedback', '{}'::jsonb,
        'liveTeacherFeedbackEnabled', feedback_enabled,
        'resumeCode', null
      );
    end if;

    ans := '{}'::jsonb;
    live_fb := '{}'::jsonb;
    susp := false;
    fin := false;
    disp := '';
  end if;

  return jsonb_build_object(
    'answers', coalesce(ans, '{}'::jsonb),
    'suspended', susp,
    'finished', fin,
    'displayName', disp,
    'liveTeacherFeedback', coalesce(live_fb, '{}'::jsonb),
    'liveTeacherFeedbackEnabled', feedback_enabled,
    'resumeCode', null
  );
end;
$$;

create or replace function public.teacher_ensure_student_resume_code(
  p_live_session_id uuid,
  p_device_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  fs record;
  fin timestamptz;
  code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select * into fs
  from public.form_sessions
  where id = p_live_session_id
    and created_by = auth.uid()
  limit 1;

  if not found then
    raise exception 'not allowed';
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    raise exception 'session is not open';
  end if;

  select fr.finished_at into fin
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if not found then
    raise exception 'student response not found';
  end if;

  if fin is not null then
    raise exception 'exam already submitted';
  end if;

  select fr.student_resume_code into code
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if code is not null then
    return code;
  end if;

  code := public.generate_student_resume_code();

  update public.form_responses
  set student_resume_code = code
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id)
    and student_id is null
    and student_resume_code is null
    and finished_at is null;

  select fr.student_resume_code into code
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if code is null then
    raise exception 'could not create rejoin code';
  end if;

  return code;
end;
$$;

revoke all on function public.ensure_student_resume_code(uuid, text) from public;
grant execute on function public.ensure_student_resume_code(uuid, text) to service_role;

revoke all on function public.teacher_ensure_student_resume_code(uuid, text) from public;
grant execute on function public.teacher_ensure_student_resume_code(uuid, text) to authenticated, service_role;

commit;
