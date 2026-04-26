-- Presence, activity heartbeats, student finish, teacher early session stop, form_sessions UPDATE for owners.

begin;

alter table public.form_responses
  add column if not exists last_activity_at timestamptz,
  add column if not exists last_typing_at timestamptz,
  add column if not exists finished_at timestamptz;

update public.form_responses
set last_activity_at = coalesce(last_activity_at, updated_at)
where live_session_id is not null
  and anonymous_session_id is not null
  and last_activity_at is null;

drop policy if exists "form_sessions_update_teacher" on public.form_sessions;
create policy "form_sessions_update_teacher"
  on public.form_sessions for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Student read: answers + suspended + finished
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
  fin boolean := false;
begin
  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('answers', '{}'::jsonb, 'suspended', false, 'finished', false);
  end if;

  select * into fs from public.form_sessions where id = p_live_session_id limit 1;
  if not found then
    return jsonb_build_object('answers', '{}'::jsonb, 'suspended', false, 'finished', false);
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    return jsonb_build_object('answers', '{}'::jsonb, 'suspended', false, 'finished', false);
  end if;

  select fr.answers, (fr.suspended_at is not null), (fr.finished_at is not null)
  into ans, susp, fin
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and fr.anonymous_session_id = p_device_id
    and fr.student_id is null;

  if not found then
    ans := '{}'::jsonb;
    susp := false;
    fin := false;
  end if;

  return jsonb_build_object(
    'answers', coalesce(ans, '{}'::jsonb),
    'suspended', susp,
    'finished', fin
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Student save
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
  fin timestamptz;
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

  select fr.suspended_at, fr.finished_at into susp, fin
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and fr.anonymous_session_id = p_device_id
    and fr.student_id is null;

  if susp is not null then
    raise exception 'exam suspended until your teacher allows you to continue';
  end if;

  if fin is not null then
    raise exception 'exam already submitted';
  end if;

  update public.form_responses
  set
    answers = p_answers,
    updated_at = now(),
    last_activity_at = timezone('utc', now())
  where live_session_id = p_live_session_id
    and anonymous_session_id = p_device_id
    and student_id is null
    and suspended_at is null
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
    last_activity_at
  )
  values (
    fid,
    p_live_session_id,
    p_device_id,
    null,
    p_answers,
    null,
    timezone('utc', now())
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Tab leave suspend
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
    updated_at = now(),
    last_activity_at = timezone('utc', now())
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
    suspended_at,
    last_activity_at
  )
  values (
    fid,
    p_live_session_id,
    p_device_id,
    null,
    '{}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now())
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Register presence after join (upsert activity timestamp)
-- ---------------------------------------------------------------------------
create or replace function public.register_live_session_student_presence(
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
    last_activity_at = timezone('utc', now()),
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
    suspended_at,
    last_activity_at
  )
  values (
    fid,
    p_live_session_id,
    p_device_id,
    null,
    '{}'::jsonb,
    null,
    timezone('utc', now())
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Heartbeat (optional typing flag)
-- ---------------------------------------------------------------------------
create or replace function public.heartbeat_live_session_student(
  p_live_session_id uuid,
  p_device_id text,
  p_is_typing boolean
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
    last_activity_at = timezone('utc', now()),
    last_typing_at = case
      when coalesce(p_is_typing, false) then timezone('utc', now())
      else last_typing_at
    end,
    updated_at = now()
  where live_session_id = p_live_session_id
    and anonymous_session_id = p_device_id
    and student_id is null
    and suspended_at is null
    and finished_at is null;

  if found then
    return;
  end if;

  if exists (
    select 1 from public.form_responses fr
    where fr.live_session_id = p_live_session_id
      and fr.anonymous_session_id = p_device_id
      and fr.student_id is null
  ) then
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
    last_typing_at
  )
  values (
    fid,
    p_live_session_id,
    p_device_id,
    null,
    '{}'::jsonb,
    null,
    timezone('utc', now()),
    case when coalesce(p_is_typing, false) then timezone('utc', now()) else null end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Student submits exam (finished)
-- ---------------------------------------------------------------------------
create or replace function public.finish_live_session_student_response(
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
  susp timestamptz;
  fin timestamptz;
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
    updated_at = now()
  where live_session_id = p_live_session_id
    and anonymous_session_id = p_device_id
    and student_id is null
    and suspended_at is null
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
    finished_at,
    last_activity_at
  )
  values (
    fid,
    p_live_session_id,
    p_device_id,
    null,
    '{}'::jsonb,
    null,
    timezone('utc', now()),
    timezone('utc', now())
  );
end;
$$;

revoke all on function public.register_live_session_student_presence(uuid, text) from public;
revoke all on function public.heartbeat_live_session_student(uuid, text, boolean) from public;
revoke all on function public.finish_live_session_student_response(uuid, text) from public;

grant execute on function public.register_live_session_student_presence(uuid, text) to anon, authenticated, service_role;
grant execute on function public.heartbeat_live_session_student(uuid, text, boolean) to anon, authenticated, service_role;
grant execute on function public.finish_live_session_student_response(uuid, text) to anon, authenticated, service_role;

grant execute on function public.get_live_session_student_response(uuid, text) to anon, authenticated, service_role;
grant execute on function public.save_live_session_student_response(uuid, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.suspend_live_session_student_tab_leave(uuid, text) to anon, authenticated, service_role;

commit;
