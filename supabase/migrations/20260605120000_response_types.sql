-- OAL response types: expand question types, response_config, richer feedback, rubric scores.

begin;

alter table public.questions
  add column if not exists response_config jsonb not null default '{}'::jsonb;

alter table public.questions
  drop constraint if exists questions_question_type_check;

alter table public.questions
  add constraint questions_question_type_check
  check (
    question_type in (
      'multipleChoice',
      'text',
      'shortAnswer',
      'extendedWritten',
      'structuredMultiPart',
      'annotateSource'
    )
  );

alter table public.form_responses
  add column if not exists rubric_scores jsonb not null default '{}'::jsonb;

-- Allow live feedback on all written response types (not only legacy text).
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
  join public.forms f on f.id = fs.form_id
  where fs.id = p_live_session_id
    and fs.created_by = uid
    and coalesce(f.live_teacher_feedback_enabled, false);

  if fid is null then
    raise exception 'not allowed';
  end if;

  select q.question_type
  into qtype
  from public.questions q
  where q.id = p_question_id
    and q.form_id = fid;

  if qtype is null then
    raise exception 'question not found';
  end if;

  if qtype not in ('text', 'shortAnswer', 'extendedWritten', 'structuredMultiPart', 'annotateSource') then
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

-- Structured feedback key (per-part, quick nudge, rubric, inline).
create or replace function public.set_teacher_feedback_key(
  p_live_session_id uuid,
  p_device_id text,
  p_feedback_key text,
  p_payload text
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
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  if p_feedback_key is null or length(trim(p_feedback_key)) = 0 then
    raise exception 'invalid feedback key';
  end if;

  select fs.form_id
  into fid
  from public.form_sessions fs
  join public.forms f on f.id = fs.form_id
  where fs.id = p_live_session_id
    and fs.created_by = uid
    and coalesce(f.live_teacher_feedback_enabled, false);

  if fid is null then
    raise exception 'not allowed';
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

  trimmed := left(trim(coalesce(p_payload, '')), 4000);

  if trimmed = '' then
    existing := existing - p_feedback_key;
  else
    existing := existing || jsonb_build_object(p_feedback_key, trimmed);
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

revoke all on function public.set_teacher_feedback_key(uuid, text, text, text) from public;
grant execute on function public.set_teacher_feedback_key(uuid, text, text, text) to authenticated, service_role;

commit;
