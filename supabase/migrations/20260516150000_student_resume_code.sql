-- Personal rejoin codes: students can return to their in-progress exam after losing this device/browser.

begin;

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

create or replace function public.ensure_student_resume_code(
  p_live_session_id uuid,
  p_device_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
begin
  if p_live_session_id is null or p_device_id is null then
    return null;
  end if;

  select fr.student_resume_code into code
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if not found then
    return null;
  end if;

  if code is not null then
    return code;
  end if;

  code := public.generate_student_resume_code();

  update public.form_responses
  set student_resume_code = code
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id)
    and student_id is null
    and student_resume_code is null;

  select fr.student_resume_code into code
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  return code;
end;
$$;

create or replace function public.lookup_student_resume_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c text;
  fr record;
  fs record;
  payload jsonb;
begin
  c := upper(trim(coalesce(p_code, '')));
  if c !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  select fr.* into fr
  from public.form_responses fr
  where fr.student_resume_code = c
    and fr.student_id is null
    and fr.live_session_id is not null
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select s.* into fs
  from public.form_sessions s
  where s.id = fr.live_session_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    return jsonb_build_object('ok', false, 'reason', 'session_closed');
  end if;

  select jsonb_build_object(
    'ok', true,
    'liveSessionId', fs.id,
    'deviceId', fr.anonymous_session_id,
    'displayName', coalesce(nullif(trim(fr.student_display_name), ''), ''),
    'joinCode', fs.join_code,
    'formId', fs.form_id,
    'opensAt', fs.opens_at,
    'closesAt', fs.closes_at,
    'resumeCode', c,
    'title', f.title,
    'description', coalesce(f.description, ''),
    'liveTeacherFeedbackEnabled', coalesce(f.live_teacher_feedback_enabled, false),
    'questions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'prompt', q.prompt,
            'type', q.question_type,
            'options', q.options,
            'displayOrder', q.display_order
          )
          order by q.display_order
        )
        from public.questions q
        where q.form_id = fs.form_id
      ),
      '[]'::jsonb
    )
  )
  into payload
  from public.forms f
  where f.id = fs.form_id;

  return payload;
end;
$$;

-- Include resume code in student poll payload.
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
    'liveTeacherFeedback', case when feedback_enabled then coalesce(live_fb, '{}'::jsonb) else '{}'::jsonb end,
    'resumeCode', resume_code
  );
end;
$$;

revoke all on function public.generate_student_resume_code() from public;
revoke all on function public.ensure_student_resume_code(uuid, text) from public;
revoke all on function public.lookup_student_resume_code(text) from public;

grant execute on function public.generate_student_resume_code() to service_role;
grant execute on function public.ensure_student_resume_code(uuid, text) to anon, authenticated, service_role;
grant execute on function public.lookup_student_resume_code(text) to anon, authenticated, service_role;

commit;
