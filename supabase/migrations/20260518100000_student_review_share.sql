-- Student read-only results link + allow teachers to save feedback without the form flag gate.

begin;

alter table public.form_responses
  add column if not exists student_review_token text;

create unique index if not exists form_responses_student_review_token_uidx
  on public.form_responses (student_review_token)
  where student_review_token is not null;

create or replace function public.generate_student_review_token()
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
    for i in 1..12 loop
      ch := 1 + floor(random() * length(alphabet))::integer;
      result := result || substr(alphabet, ch, 1);
    end loop;
    exit when not exists (
      select 1 from public.form_responses fr where fr.student_review_token = result
    );
    tries := tries + 1;
    if tries > 100 then
      raise exception 'could not allocate student review token';
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public.ensure_student_review_token(
  p_live_session_id uuid,
  p_device_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  code text;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  if not exists (
    select 1
    from public.form_sessions fs
    where fs.id = p_live_session_id
      and fs.created_by = uid
  ) then
    raise exception 'not allowed';
  end if;

  select fr.student_review_token into code
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if not found then
    raise exception 'student response not found';
  end if;

  if code is not null then
    return code;
  end if;

  code := public.generate_student_review_token();

  update public.form_responses
  set student_review_token = code
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id)
    and student_id is null
    and student_review_token is null;

  select fr.student_review_token into code
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  return code;
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
begin
  if length(tok) < 8 then
    return null;
  end if;

  select fs.form_id
  into fid
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
      'displayOrder', q.display_order
    )
    order by q.display_order
  )
  into qjson
  from public.questions q
  where q.form_id = fid;

  select jsonb_build_object(
    'formTitle', coalesce(f.title, 'Form'),
    'formDescription', coalesce(f.description, ''),
    'displayName', coalesce(nullif(trim(fr.student_display_name), ''), ''),
    'finished', fr.finished_at is not null,
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

-- Teachers may save feedback whenever they own the session (not only when the form flag is on).
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
  qtype text;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select fs.form_id
  into fid
  from public.form_sessions fs
  where fs.id = p_live_session_id
    and fs.created_by = uid;

  if fid is null then
    raise exception 'not allowed';
  end if;

  select q.question_type
  into qtype
  from public.questions q
  where q.id = p_question_id
    and q.form_id = fid;

  if qtype is distinct from 'text' then
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

revoke all on function public.generate_student_review_token() from public;
revoke all on function public.ensure_student_review_token(uuid, text) from public;
revoke all on function public.get_student_review_by_token(text) from public;

grant execute on function public.generate_student_review_token() to service_role;
grant execute on function public.ensure_student_review_token(uuid, text) to authenticated, service_role;
grant execute on function public.get_student_review_by_token(text) to anon, authenticated, service_role;

commit;
