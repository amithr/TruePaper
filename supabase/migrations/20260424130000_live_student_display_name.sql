-- Require a display name for each live anonymous exam response (shown to teachers).

begin;

alter table public.form_responses
  add column if not exists student_display_name text;

update public.form_responses
set student_display_name = 'Student'
where live_session_id is not null
  and student_id is null
  and (student_display_name is null or length(trim(student_display_name)) = 0);

alter table public.form_responses
  drop constraint if exists form_responses_live_display_name_chk;

alter table public.form_responses
  add constraint form_responses_live_display_name_chk check (
    live_session_id is null
    or student_id is not null
    or (
      student_display_name is not null
      and length(trim(student_display_name)) between 1 and 120
    )
  );

-- ---------------------------------------------------------------------------
-- Student read: include display name
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
  disp text := '';
begin
  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('answers', '{}'::jsonb, 'suspended', false, 'finished', false, 'displayName', '');
  end if;

  select * into fs from public.form_sessions where id = p_live_session_id limit 1;
  if not found then
    return jsonb_build_object('answers', '{}'::jsonb, 'suspended', false, 'finished', false, 'displayName', '');
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    return jsonb_build_object('answers', '{}'::jsonb, 'suspended', false, 'finished', false, 'displayName', '');
  end if;

  select fr.answers, (fr.suspended_at is not null), (fr.finished_at is not null),
         coalesce(nullif(trim(fr.student_display_name), ''), '')
  into ans, susp, fin, disp
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and fr.anonymous_session_id = p_device_id
    and fr.student_id is null;

  if not found then
    ans := '{}'::jsonb;
    susp := false;
    fin := false;
    disp := '';
  end if;

  return jsonb_build_object(
    'answers', coalesce(ans, '{}'::jsonb),
    'suspended', susp,
    'finished', fin,
    'displayName', disp
  );
end;
$$;

drop function if exists public.save_live_session_student_response(uuid, text, jsonb);

create or replace function public.save_live_session_student_response(
  p_live_session_id uuid,
  p_device_id text,
  p_answers jsonb,
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
begin
  name := trim(coalesce(p_display_name, ''));
  if name is null or name = '' or length(name) > 120 then
    raise exception 'display name must be 1–120 characters';
  end if;

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
    last_activity_at = timezone('utc', now()),
    student_display_name = name
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
    last_activity_at,
    student_display_name
  )
  values (
    fid,
    p_live_session_id,
    p_device_id,
    null,
    p_answers,
    null,
    timezone('utc', now()),
    name
  );
end;
$$;

drop function if exists public.suspend_live_session_student_tab_leave(uuid, text);

create or replace function public.suspend_live_session_student_tab_leave(
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

  fid := fs.form_id;

  update public.form_responses
  set
    suspended_at = coalesce(suspended_at, timezone('utc', now())),
    updated_at = now(),
    last_activity_at = timezone('utc', now()),
    student_display_name = coalesce(nullif(trim(student_display_name), ''), name)
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
    last_activity_at,
    student_display_name
  )
  values (
    fid,
    p_live_session_id,
    p_device_id,
    null,
    '{}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now()),
    name
  );
end;
$$;

drop function if exists public.register_live_session_student_presence(uuid, text);

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

  fid := fs.form_id;

  update public.form_responses
  set
    last_activity_at = timezone('utc', now()),
    updated_at = now(),
    student_display_name = name
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

drop function if exists public.heartbeat_live_session_student(uuid, text, boolean, boolean);

create or replace function public.heartbeat_live_session_student(
  p_live_session_id uuid,
  p_device_id text,
  p_is_typing boolean,
  p_interaction boolean,
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

  fid := fs.form_id;

  update public.form_responses
  set
    last_activity_at = case
      when coalesce(p_interaction, true) then timezone('utc', now())
      else last_activity_at
    end,
    last_typing_at = case
      when coalesce(p_is_typing, false) then timezone('utc', now())
      else last_typing_at
    end,
    updated_at = now(),
    student_display_name = name
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

  if not coalesce(p_interaction, true) then
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
    last_typing_at,
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
    case when coalesce(p_is_typing, false) then timezone('utc', now()) else null end,
    name
  );
end;
$$;

drop function if exists public.finish_live_session_student_response(uuid, text);

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
    timezone('utc', now()),
    name
  );
end;
$$;

revoke all on function public.save_live_session_student_response(uuid, text, jsonb, text) from public;
revoke all on function public.suspend_live_session_student_tab_leave(uuid, text, text) from public;
revoke all on function public.register_live_session_student_presence(uuid, text, text) from public;
revoke all on function public.heartbeat_live_session_student(uuid, text, boolean, boolean, text) from public;
revoke all on function public.finish_live_session_student_response(uuid, text, text) from public;

grant execute on function public.save_live_session_student_response(uuid, text, jsonb, text) to anon, authenticated, service_role;
grant execute on function public.suspend_live_session_student_tab_leave(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.register_live_session_student_presence(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.heartbeat_live_session_student(uuid, text, boolean, boolean, text) to anon, authenticated, service_role;
grant execute on function public.finish_live_session_student_response(uuid, text, text) to anon, authenticated, service_role;

commit;
