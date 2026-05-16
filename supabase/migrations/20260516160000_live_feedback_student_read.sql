-- Students always receive saved live feedback on poll (not gated by join-time form flag).

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
  resume_code text := null;
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

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
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
    ans := '{}'::jsonb;
    live_fb := '{}'::jsonb;
    susp := false;
    fin := false;
    disp := '';
  else
    resume_code := public.ensure_student_resume_code(p_live_session_id, p_device_id);
  end if;

  return jsonb_build_object(
    'answers', coalesce(ans, '{}'::jsonb),
    'suspended', susp,
    'finished', fin,
    'displayName', disp,
    'liveTeacherFeedback', coalesce(live_fb, '{}'::jsonb),
    'liveTeacherFeedbackEnabled', feedback_enabled,
    'resumeCode', resume_code
  );
end;
$$;

commit;
