-- Suspend anonymous live-session students who leave the exam tab; only the session teacher can clear.

begin;

alter table public.form_responses
  add column if not exists suspended_at timestamptz;

-- ---------------------------------------------------------------------------
-- Student read: answers + suspended flag
-- ---------------------------------------------------------------------------
create or replace function public.get_live_session_student_response(p_live_session_id uuid, p_device_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  fs record;
  ans jsonb;
  susp boolean := false;
begin
  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('answers', '{}'::jsonb, 'suspended', false);
  end if;

  select * into fs from public.form_sessions where id = p_live_session_id limit 1;
  if not found then
    return jsonb_build_object('answers', '{}'::jsonb, 'suspended', false);
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    return jsonb_build_object('answers', '{}'::jsonb, 'suspended', false);
  end if;

  select fr.answers, (fr.suspended_at is not null)
  into ans, susp
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and fr.anonymous_session_id = p_device_id
    and fr.student_id is null;

  if not found then
    ans := '{}'::jsonb;
    susp := false;
  end if;

  return jsonb_build_object(
    'answers', coalesce(ans, '{}'::jsonb),
    'suspended', susp
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Student save: blocked while suspended
-- ---------------------------------------------------------------------------
create or replace function public.save_live_session_student_response(
  p_live_session_id uuid,
  p_device_id text,
  p_answers jsonb
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
begin
  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'answers must be a json object';
  end if;

  select * into fs from public.form_sessions where id = p_live_session_id limit 1;
  if not found then
    raise exception 'session not found';
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    raise exception 'session is not open';
  end if;

  fid := fs.form_id;

  select fr.suspended_at into susp
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and fr.anonymous_session_id = p_device_id
    and fr.student_id is null;

  if susp is not null then
    raise exception 'exam suspended until your teacher allows you to continue';
  end if;

  update public.form_responses
  set answers = p_answers, updated_at = now()
  where live_session_id = p_live_session_id
    and anonymous_session_id = p_device_id
    and student_id is null
    and suspended_at is null;

  if found then
    return;
  end if;

  insert into public.form_responses (
    form_id,
    live_session_id,
    anonymous_session_id,
    student_id,
    answers,
    suspended_at
  )
  values (fid, p_live_session_id, p_device_id, null, p_answers, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Anon: record tab leave (first suspension timestamp kept)
-- ---------------------------------------------------------------------------
create or replace function public.suspend_live_session_student_tab_leave(
  p_live_session_id uuid,
  p_device_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fs record;
  fid uuid;
begin
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

  update public.form_responses
  set
    suspended_at = coalesce(suspended_at, timezone('utc', now())),
    updated_at = now()
  where live_session_id = p_live_session_id
    and anonymous_session_id = p_device_id
    and student_id is null;

  if found then
    return;
  end if;

  insert into public.form_responses (
    form_id,
    live_session_id,
    anonymous_session_id,
    student_id,
    answers,
    suspended_at
  )
  values (fid, p_live_session_id, p_device_id, null, '{}'::jsonb, timezone('utc', now()));
end;
$$;

-- ---------------------------------------------------------------------------
-- Teacher: clear suspension (must own the live session)
-- ---------------------------------------------------------------------------
create or replace function public.teacher_clear_live_session_student_suspension(
  p_live_session_id uuid,
  p_device_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  if not exists (
    select 1 from public.form_sessions fs
    where fs.id = p_live_session_id
      and fs.created_by = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  update public.form_responses
  set suspended_at = null, updated_at = now()
  where live_session_id = p_live_session_id
    and anonymous_session_id = p_device_id
    and student_id is null;
end;
$$;

revoke all on function public.suspend_live_session_student_tab_leave(uuid, text) from public;
revoke all on function public.teacher_clear_live_session_student_suspension(uuid, text) from public;

grant execute on function public.suspend_live_session_student_tab_leave(uuid, text) to anon, authenticated, service_role;
grant execute on function public.teacher_clear_live_session_student_suspension(uuid, text) to authenticated, service_role;

grant execute on function public.get_live_session_student_response(uuid, text) to anon, authenticated, service_role;
grant execute on function public.save_live_session_student_response(uuid, text, jsonb) to anon, authenticated, service_role;

commit;
