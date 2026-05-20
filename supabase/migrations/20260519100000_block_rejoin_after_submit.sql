-- Prevent students who have submitted from rejoining via personal rejoin code or session register.

begin;

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

  if fr.finished_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_submitted');
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

create or replace function public.register_live_session_student_presence(
  p_live_session_id uuid,
  p_device_id text,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fs record;
  fid uuid;
  name text;
begin
  name := trim(coalesce(p_display_name, ''));
  if name is null or name = '' or length(name) > 120 then
    raise exception 'display name must be 1–120 characters';
  end if;

  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select * into fs from public.form_sessions where id = p_live_session_id limit 1;
  if not found then
    raise exception 'session not found';
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    raise exception 'session is not open';
  end if;

  if exists (
    select 1
    from public.form_responses fr
    where fr.live_session_id = p_live_session_id
      and fr.anonymous_session_id = p_device_id
      and fr.student_id is null
      and fr.finished_at is not null
  ) then
    raise exception 'exam already submitted';
  end if;

  fid := fs.form_id;

  update public.form_responses
  set
    last_activity_at = timezone('utc', now()),
    updated_at = now(),
    student_display_name = name
  where live_session_id = p_live_session_id
    and anonymous_session_id = p_device_id
    and student_id is null
    and finished_at is null;

  if found then
    return;
  end if;

  insert into public.form_responses (
    form_id,
    live_session_id,
    anonymous_session_id,
    student_id,
    answers,
    suspended_at,
    last_activity_at,
    student_display_name
  )
  values (
    fid,
    p_live_session_id,
    p_device_id,
    null,
    '{}'::jsonb,
    null,
    timezone('utc', now()),
    name
  );
end;
$$;

commit;
