-- Live teacher feedback during exams (form setting + per-student per-question messages).

begin;

alter table public.forms
  add column if not exists live_teacher_feedback_enabled boolean not null default false;

alter table public.form_responses
  add column if not exists live_teacher_feedback jsonb not null default '{}'::jsonb;

-- Include form flag in join payload for students.
create or replace function public.lookup_join_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c text;
  fs record;
  payload jsonb;
begin
  c := upper(trim(p_code));
  if c !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  select s.* into fs
  from public.form_sessions s
  where s.join_code = c
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
    'formId', fs.form_id,
    'opensAt', fs.opens_at,
    'closesAt', fs.closes_at,
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

-- Student poll: include live feedback when the form allows it.
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
begin
  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object(
      'answers', '{}'::jsonb,
      'suspended', false,
      'finished', false,
      'displayName', '',
      'liveTeacherFeedback', '{}'::jsonb
    );
  end if;

  select * into fs from public.form_sessions where id = p_live_session_id limit 1;
  if not found then
    return jsonb_build_object(
      'answers', '{}'::jsonb,
      'suspended', false,
      'finished', false,
      'displayName', '',
      'liveTeacherFeedback', '{}'::jsonb
    );
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    return jsonb_build_object(
      'answers', '{}'::jsonb,
      'suspended', false,
      'finished', false,
      'displayName', '',
      'liveTeacherFeedback', '{}'::jsonb
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
    and fr.anonymous_session_id = p_device_id
    and fr.student_id is null;

  if not found then
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
    'liveTeacherFeedback', case when feedback_enabled then coalesce(live_fb, '{}'::jsonb) else '{}'::jsonb end
  );
end;
$$;

commit;
