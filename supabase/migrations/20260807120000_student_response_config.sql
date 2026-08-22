-- Include a student-safe response_config in the public join/resume/review payloads.
--
-- The join/resume routes and the review parser already read `responseConfig`
-- per question, but the RPCs never sent it, so students always fell back to
-- type defaults (canvas size, matching pairs, passage text, and the new
-- drawDiagram `promptImageAsBackground` flag were lost). Answer-bearing keys
-- are stripped so keys never leak to students:
--   acceptedAnswers / caseSensitive (shortAnswer, mathInput)
--   correctAnswer                   (trueFalse)
--   correct                         (matching, labelling)
--   correctOrder                    (ordering)

begin;

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
    'descriptionImagePath', f.description_image_path,
    'liveTeacherFeedbackEnabled', coalesce(f.live_teacher_feedback_enabled, false),
    'questions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'prompt', q.prompt,
            'promptImagePath', q.prompt_image_path,
            'type', q.question_type,
            'options', q.options,
            'displayOrder', q.display_order,
            'responseConfig',
              coalesce(q.response_config, '{}'::jsonb)
                - array['acceptedAnswers', 'caseSensitive', 'correct', 'correctOrder', 'correctAnswer']
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

  select resp.* into fr
  from public.form_responses resp
  where resp.student_resume_code = c
    and resp.student_id is null
    and resp.live_session_id is not null
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
    'descriptionImagePath', f.description_image_path,
    'liveTeacherFeedbackEnabled', coalesce(f.live_teacher_feedback_enabled, false),
    'questions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'prompt', q.prompt,
            'promptImagePath', q.prompt_image_path,
            'type', q.question_type,
            'options', q.options,
            'displayOrder', q.display_order,
            'responseConfig',
              coalesce(q.response_config, '{}'::jsonb)
                - array['acceptedAnswers', 'caseSensitive', 'correct', 'correctOrder', 'correctAnswer']
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
  if length(tok) <> 12 then
    return null;
  end if;
  if tok !~ '^[2-9A-HJ-NP-Z]+$' then
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
      'promptImagePath', q.prompt_image_path,
      'type', q.question_type,
      'options', coalesce(q.options, '[]'::jsonb),
      'points', q.points,
      'displayOrder', q.display_order,
      'responseConfig',
        coalesce(q.response_config, '{}'::jsonb)
          - array['acceptedAnswers', 'caseSensitive', 'correct', 'correctOrder', 'correctAnswer'],
      'earnedPoints',
        case
          when graded and grades ? q.id::text
            then (grades ->> q.id::text)::int
          else null
        end
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
    'descriptionImagePath', f.description_image_path,
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

commit;
