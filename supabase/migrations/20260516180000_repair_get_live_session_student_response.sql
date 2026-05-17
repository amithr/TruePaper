-- Repair student poll RPC: ensure columns/helpers exist and inline resume-code logic
-- (avoids runtime failure when ensure_student_resume_code was never created).

begin;

alter table public.forms
  add column if not exists live_teacher_feedback_enabled boolean not null default false;

alter table public.form_responses
  add column if not exists live_teacher_feedback jsonb not null default '{}'::jsonb;

alter table public.form_responses
  add column if not exists student_resume_code text;

create unique index if not exists form_responses_student_resume_code_uidx
  on public.form_responses (student_resume_code)
  where student_resume_code is not null;

create or replace function public.generate_student_resume_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  result text := '';
  i integer;
  tries integer := 0;
  ch integer;
begin
  loop
    result := '';
    for i in 1..8 loop
      ch := 1 + floor(random() * length(alphabet))::integer;
      result := result || substr(alphabet, ch, 1);
    end loop;
    exit when not exists (
      select 1 from public.form_responses fr where fr.student_resume_code = result
    );
    tries := tries + 1;
    if tries > 100 then
      raise exception 'could not allocate student resume code';
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public.get_live_session_student_response(p_live_session_id uuid, p_device_id text)
returns jsonb
language plpgsql
volatile
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
         coalesce(nullif(trim(fr.student_display_name), ''), ''),
         fr.student_resume_code
  into ans, live_fb, susp, fin, disp, resume_code
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
    resume_code := null;
  elsif resume_code is null then
    begin
      resume_code := public.generate_student_resume_code();
      update public.form_responses
      set student_resume_code = resume_code
      where live_session_id = p_live_session_id
        and lower(anonymous_session_id) = lower(p_device_id)
        and student_id is null
        and student_resume_code is null;
    exception when others then
      resume_code := null;
    end;
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

revoke all on function public.generate_student_resume_code() from public;
grant execute on function public.generate_student_resume_code() to service_role;

commit;
