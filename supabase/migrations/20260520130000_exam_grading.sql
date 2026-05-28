-- Exam grading: MC auto-score on submit, teacher text grades, graded status + points.

begin;

create or replace function public.autograde_mc_for_response(
  p_live_session_id uuid,
  p_device_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid;
  ans jsonb;
  grades jsonb;
  q record;
  chosen text;
  earned int;
begin
  select fs.form_id into fid
  from public.form_sessions fs
  where fs.id = p_live_session_id;

  if fid is null then
    return;
  end if;

  select fr.answers, coalesce(fr.text_grades, '{}'::jsonb)
  into ans, grades
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if not found then
    return;
  end if;

  for q in
    select id, points, correct_answer
    from public.questions
    where form_id = fid
      and question_type = 'multipleChoice'
  loop
    chosen := ans ->> q.id::text;
    if q.correct_answer is not null and chosen is not null and chosen = q.correct_answer then
      earned := q.points;
    else
      earned := 0;
    end if;
    grades := grades || jsonb_build_object(q.id::text, earned);
  end loop;

  update public.form_responses
  set text_grades = grades
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id)
    and student_id is null;
end;
$$;

create or replace function public.teacher_set_response_question_grade(
  p_live_session_id uuid,
  p_device_id text,
  p_question_id uuid,
  p_points integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  fid uuid;
  max_pts int;
  grades jsonb;
  pts int;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select fs.form_id into fid
  from public.form_sessions fs
  where fs.id = p_live_session_id
    and fs.created_by = uid;

  if fid is null then
    raise exception 'not allowed';
  end if;

  select q.points into max_pts
  from public.questions q
  where q.id = p_question_id
    and q.form_id = fid;

  if max_pts is null then
    raise exception 'question not found';
  end if;

  if not exists (
    select 1
    from public.form_responses fr
    where fr.live_session_id = p_live_session_id
      and lower(fr.anonymous_session_id) = lower(p_device_id)
      and fr.student_id is null
      and fr.finished_at is not null
  ) then
    raise exception 'exam not submitted';
  end if;

  pts := greatest(0, least(max_pts, coalesce(p_points, 0)));

  select coalesce(fr.text_grades, '{}'::jsonb) into grades
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  grades := grades || jsonb_build_object(p_question_id::text, pts);

  update public.form_responses
  set
    text_grades = grades,
    updated_at = now()
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id)
    and student_id is null;

  return grades;
end;
$$;

create or replace function public.internal_mark_response_graded(
  p_live_session_id uuid,
  p_device_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid;
  grades jsonb;
  missing int;
begin
  select fs.form_id into fid
  from public.form_sessions fs
  where fs.id = p_live_session_id;

  if fid is null then
    raise exception 'session not found';
  end if;

  select coalesce(fr.text_grades, '{}'::jsonb) into grades
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null
    and fr.finished_at is not null;

  if not found then
    raise exception 'exam not submitted';
  end if;

  select count(*) into missing
  from public.questions q
  where q.form_id = fid
    and not (grades ? q.id::text);

  if missing > 0 then
    raise exception 'not all questions graded';
  end if;

  update public.form_responses
  set
    text_graded_at = timezone('utc', now()),
    updated_at = now()
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id)
    and student_id is null
    and finished_at is not null
    and text_graded_at is null;
end;
$$;

create or replace function public.teacher_mark_response_graded(
  p_live_session_id uuid,
  p_device_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  fid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select fs.form_id into fid
  from public.form_sessions fs
  where fs.id = p_live_session_id
    and fs.created_by = uid;

  if fid is null then
    raise exception 'not allowed';
  end if;

  perform public.internal_mark_response_graded(p_live_session_id, p_device_id);
end;
$$;

create or replace function public.finish_live_session_student_response(
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
  susp timestamptz;
  fin timestamptz;
  name text;
  has_text_questions boolean := false;
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

  fid := fs.form_id;

  select exists (
    select 1 from public.questions q
    where q.form_id = fid and q.question_type = 'text'
  ) into has_text_questions;

  select fr.suspended_at, fr.finished_at into susp, fin
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and fr.anonymous_session_id = p_device_id
    and fr.student_id is null;

  if found then
    if susp is not null then
      raise exception 'cannot submit while suspended';
    end if;
    if fin is not null then
      return;
    end if;
  end if;

  update public.form_responses
  set
    finished_at = timezone('utc', now()),
    last_activity_at = timezone('utc', now()),
    updated_at = now(),
    student_display_name = name
  where live_session_id = p_live_session_id
    and anonymous_session_id = p_device_id
    and student_id is null
    and suspended_at is null
    and finished_at is null;

  if found then
    perform public.autograde_mc_for_response(p_live_session_id, p_device_id);
    if not has_text_questions then
      perform public.internal_mark_response_graded(p_live_session_id, p_device_id);
    end if;
    return;
  end if;

  insert into public.form_responses (
    form_id,
    live_session_id,
    anonymous_session_id,
    student_id,
    answers,
    student_display_name,
    finished_at,
    last_activity_at
  )
  values (
    fid,
    p_live_session_id,
    p_device_id,
    null,
    '{}'::jsonb,
    name,
    timezone('utc', now()),
    timezone('utc', now())
  );

  perform public.autograde_mc_for_response(p_live_session_id, p_device_id);
  if not has_text_questions then
    perform public.internal_mark_response_graded(p_live_session_id, p_device_id);
  end if;
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
  grades jsonb;
  susp boolean := false;
  fin boolean := false;
  graded boolean := false;
  disp text := '';
  session_open boolean := false;
  earned int := 0;
  possible int := 0;
begin
  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object(
      'answers', '{}'::jsonb,
      'suspended', false,
      'finished', false,
      'graded', false,
      'pointsEarned', null,
      'pointsPossible', null,
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
      'graded', false,
      'pointsEarned', null,
      'pointsPossible', null,
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
         coalesce(fr.text_grades, '{}'::jsonb),
         (fr.suspended_at is not null),
         (fr.finished_at is not null),
         (fr.text_graded_at is not null),
         coalesce(nullif(trim(fr.student_display_name), ''), '')
  into ans, live_fb, grades, susp, fin, graded, disp
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
        'graded', false,
        'pointsEarned', null,
        'pointsPossible', null,
        'displayName', '',
        'liveTeacherFeedback', '{}'::jsonb,
        'liveTeacherFeedbackEnabled', feedback_enabled,
        'resumeCode', null
      );
    end if;

    ans := '{}'::jsonb;
    live_fb := '{}'::jsonb;
    grades := '{}'::jsonb;
    susp := false;
    fin := false;
    graded := false;
    disp := '';
  end if;

  if graded then
    select coalesce(sum((grades ->> q.id::text)::int), 0),
           coalesce(sum(q.points), 0)
    into earned, possible
    from public.questions q
    where q.form_id = fid
      and grades ? q.id::text;
  end if;

  return jsonb_build_object(
    'answers', coalesce(ans, '{}'::jsonb),
    'suspended', susp,
    'finished', fin,
    'graded', graded,
    'pointsEarned', case when graded then earned else null end,
    'pointsPossible', case when graded then possible else null end,
    'displayName', disp,
    'liveTeacherFeedback', coalesce(live_fb, '{}'::jsonb),
    'liveTeacherFeedbackEnabled', feedback_enabled,
    'resumeCode', null
  );
end;
$$;

create or replace function public.get_student_review_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tok text := upper(trim(coalesce(p_token, '')));
  fid uuid;
  payload jsonb;
  qjson jsonb;
  grades jsonb;
  graded boolean := false;
  earned int := 0;
  possible int := 0;
begin
  if length(tok) < 8 then
    return null;
  end if;

  select fs.form_id,
         coalesce(fr.text_grades, '{}'::jsonb),
         (fr.text_graded_at is not null)
  into fid, grades, graded
  from public.form_responses fr
  inner join public.form_sessions fs on fs.id = fr.live_session_id
  where fr.student_review_token = tok
    and fr.student_id is null
  limit 1;

  if fid is null then
    return null;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prompt', q.prompt,
      'type', q.question_type,
      'options', coalesce(q.options, '[]'::jsonb),
      'points', q.points,
      'displayOrder', q.display_order,
      'earnedPoints', case when graded and grades ? q.id::text then (grades ->> q.id::text)::int else null end
    )
    order by q.display_order
  )
  into qjson
  from public.questions q
  where q.form_id = fid;

  if graded then
    select coalesce(sum((grades ->> q.id::text)::int), 0),
           coalesce(sum(q.points), 0)
    into earned, possible
    from public.questions q
    where q.form_id = fid
      and grades ? q.id::text;
  end if;

  select jsonb_build_object(
    'formTitle', coalesce(f.title, 'Form'),
    'formDescription', coalesce(f.description, ''),
    'displayName', coalesce(nullif(trim(fr.student_display_name), ''), ''),
    'finished', fr.finished_at is not null,
    'graded', graded,
    'pointsEarned', case when graded then earned else null end,
    'pointsPossible', case when graded then possible else null end,
    'sessionOpen',
      timezone('utc', now()) >= fs.opens_at
      and timezone('utc', now()) <= fs.closes_at,
    'questions', coalesce(qjson, '[]'::jsonb),
    'answers', coalesce(fr.answers, '{}'::jsonb),
    'liveTeacherFeedback', coalesce(fr.live_teacher_feedback, '{}'::jsonb)
  )
  into payload
  from public.form_responses fr
  inner join public.form_sessions fs on fs.id = fr.live_session_id
  inner join public.forms f on f.id = fs.form_id
  where fr.student_review_token = tok
    and fr.student_id is null;

  return payload;
end;
$$;

revoke all on function public.internal_mark_response_graded(uuid, text) from public;
revoke all on function public.autograde_mc_for_response(uuid, text) from public;
revoke all on function public.teacher_set_response_question_grade(uuid, text, uuid, integer) from public;
revoke all on function public.teacher_mark_response_graded(uuid, text) from public;

grant execute on function public.internal_mark_response_graded(uuid, text) to service_role;
grant execute on function public.autograde_mc_for_response(uuid, text) to service_role;
grant execute on function public.teacher_set_response_question_grade(uuid, text, uuid, integer) to authenticated, service_role;
grant execute on function public.teacher_mark_response_graded(uuid, text) to authenticated, service_role;

commit;
