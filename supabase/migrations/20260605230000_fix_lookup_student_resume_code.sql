-- Fix ambiguous "fr.*" in lookup_student_resume_code: the PL/pgSQL record variable
-- and table alias shared the same name, which newer PostgreSQL rejects.

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

commit;
