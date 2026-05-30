-- Scale to many concurrent sessions on a single Pro project.
--
--  * Move student/teacher live updates off Supabase Realtime onto polling
--    (Pro caps Realtime at 10k concurrent connections; 20k students cannot
--    hold WebSockets). form_responses leaves the realtime publication.
--  * Remove write amplification: replica identity full is no longer needed
--    (nothing reads postgres_changes), and high-frequency presence writes move
--    to a narrow live_session_presence table so heartbeats stop rewriting the
--    wide answers/feedback row.
--  * Hot write RPCs become single-statement upserts (atomic, no update-then-
--    insert race at high concurrency).
--  * New slim get_live_session_student_state powers the 3s student poll
--    (ended / suspend / resume) without shipping the answers JSONB.

begin;

-- ---------------------------------------------------------------------------
-- 1) Take form_responses out of the realtime publication; drop replica full.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'form_responses'
  ) then
    execute 'alter publication supabase_realtime drop table public.form_responses';
  end if;
end;
$$;

alter table public.form_responses replica identity default;

-- ---------------------------------------------------------------------------
-- 2) Narrow presence table for high-frequency heartbeats / activity.
--    fillfactor leaves room for HOT updates so churn stays off the indexes.
-- ---------------------------------------------------------------------------
create table if not exists public.live_session_presence (
  live_session_id uuid not null references public.form_sessions (id) on delete cascade,
  anonymous_session_id text not null,
  last_activity_at timestamptz,
  last_typing_at timestamptz,
  primary key (live_session_id, anonymous_session_id)
) with (fillfactor = 70);

-- Seed from existing rows so in-flight sessions keep their activity status.
insert into public.live_session_presence (
  live_session_id, anonymous_session_id, last_activity_at, last_typing_at
)
select fr.live_session_id, fr.anonymous_session_id, fr.last_activity_at, fr.last_typing_at
from public.form_responses fr
where fr.live_session_id is not null
  and fr.anonymous_session_id is not null
on conflict (live_session_id, anonymous_session_id) do nothing;

-- Only security-definer RPCs (service_role) touch presence; no direct access.
alter table public.live_session_presence enable row level security;

create or replace function public.touch_live_session_presence(
  p_live_session_id uuid,
  p_device_id text,
  p_is_typing boolean,
  p_interaction boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.live_session_presence as p (
    live_session_id, anonymous_session_id, last_activity_at, last_typing_at
  )
  values (
    p_live_session_id,
    p_device_id,
    case when coalesce(p_interaction, true) then timezone('utc', now()) else null end,
    case when coalesce(p_is_typing, false) then timezone('utc', now()) else null end
  )
  on conflict (live_session_id, anonymous_session_id) do update
  set
    last_activity_at = case
      when coalesce(p_interaction, true) then timezone('utc', now())
      else p.last_activity_at
    end,
    last_typing_at = case
      when coalesce(p_is_typing, false) then timezone('utc', now())
      else p.last_typing_at
    end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Heartbeat: presence-only write (no longer rewrites form_responses).
-- ---------------------------------------------------------------------------
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
begin
  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select opens_at, closes_at into fs
  from public.form_sessions
  where id = p_live_session_id
  limit 1;
  if not found then
    raise exception 'session not found';
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    raise exception 'session is not open';
  end if;

  perform public.touch_live_session_presence(
    p_live_session_id, p_device_id, p_is_typing, p_interaction
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Save / suspend / finish / register: single-statement upserts that also
--    bump presence. answers stays on form_responses (autosave cadence only).
-- ---------------------------------------------------------------------------
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

  insert into public.form_responses (
    form_id, live_session_id, anonymous_session_id, student_id, answers, student_display_name
  )
  values (fs.form_id, p_live_session_id, p_device_id, null, '{}'::jsonb, name)
  on conflict (live_session_id, anonymous_session_id)
    where live_session_id is not null and anonymous_session_id is not null
  do update set
    updated_at = now(),
    student_display_name = excluded.student_display_name;

  perform public.touch_live_session_presence(p_live_session_id, p_device_id, false, true);
end;
$$;

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

  insert into public.form_responses (
    form_id, live_session_id, anonymous_session_id, student_id, answers, student_display_name
  )
  values (fs.form_id, p_live_session_id, p_device_id, null, p_answers, name)
  on conflict (live_session_id, anonymous_session_id)
    where live_session_id is not null and anonymous_session_id is not null
  do update set
    answers = excluded.answers,
    updated_at = now(),
    student_display_name = excluded.student_display_name
  where form_responses.suspended_at is null
    and form_responses.finished_at is null;

  perform public.touch_live_session_presence(p_live_session_id, p_device_id, false, true);
end;
$$;

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

  insert into public.form_responses (
    form_id, live_session_id, anonymous_session_id, student_id, answers, suspended_at, student_display_name
  )
  values (fs.form_id, p_live_session_id, p_device_id, null, '{}'::jsonb, timezone('utc', now()), name)
  on conflict (live_session_id, anonymous_session_id)
    where live_session_id is not null and anonymous_session_id is not null
  do update set
    suspended_at = coalesce(form_responses.suspended_at, timezone('utc', now())),
    updated_at = now(),
    student_display_name = coalesce(nullif(trim(form_responses.student_display_name), ''), excluded.student_display_name);

  perform public.touch_live_session_presence(p_live_session_id, p_device_id, false, true);
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

  select fr.suspended_at, fr.finished_at into susp, fin
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and fr.anonymous_session_id = p_device_id
    and fr.student_id is null;

  if susp is not null then
    raise exception 'cannot submit while suspended';
  end if;

  if fin is not null then
    return;
  end if;

  insert into public.form_responses (
    form_id, live_session_id, anonymous_session_id, student_id, answers, finished_at, student_display_name
  )
  values (fs.form_id, p_live_session_id, p_device_id, null, '{}'::jsonb, timezone('utc', now()), name)
  on conflict (live_session_id, anonymous_session_id)
    where live_session_id is not null and anonymous_session_id is not null
  do update set
    finished_at = timezone('utc', now()),
    updated_at = now(),
    student_display_name = excluded.student_display_name
  where form_responses.suspended_at is null
    and form_responses.finished_at is null;

  perform public.touch_live_session_presence(p_live_session_id, p_device_id, false, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Slim student-state poll: ended / suspend / resume / window, no answers.
-- ---------------------------------------------------------------------------
create or replace function public.get_live_session_student_state(
  p_live_session_id uuid,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fs record;
  r record;
begin
  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select opens_at, closes_at into fs
  from public.form_sessions
  where id = p_live_session_id
  limit 1;
  if not found then
    raise exception 'session not found';
  end if;

  select fr.suspended_at, fr.finished_at into r
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and fr.anonymous_session_id = p_device_id
    and fr.student_id is null;

  return jsonb_build_object(
    'opensAt', fs.opens_at,
    'closesAt', fs.closes_at,
    'suspended', coalesce(r.suspended_at is not null, false),
    'finished', coalesce(r.finished_at is not null, false)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Public board: read activity/typing from presence instead of the row.
-- ---------------------------------------------------------------------------
create or replace function public.get_live_session_public_board(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c text;
  fs record;
  fid uuid;
  ftitle text;
  qcounts jsonb;
  assigned int;
  inprog int;
  now_ts timestamptz := timezone('utc', now());
begin
  c := upper(trim(coalesce(p_code, '')));
  if c = '' then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select s.* into fs from public.form_sessions s where s.join_code = c limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if now_ts < fs.opens_at or now_ts > fs.closes_at then
    return jsonb_build_object('ok', false, 'reason', 'session_closed');
  end if;

  fid := fs.form_id;

  select f.title into ftitle from public.forms f where f.id = fid limit 1;

  select coalesce(
    (
      select jsonb_object_agg(question_type, typ_cnt)
      from (
        select q.question_type, count(*)::int as typ_cnt
        from public.questions q
        where q.form_id = fid
        group by q.question_type
      ) sub
    ),
    '{}'::jsonb
  )
  into qcounts;

  select count(*)::int into assigned
  from public.form_responses fr
  where fr.live_session_id = fs.id
    and fr.student_id is null;

  select count(*)::int into inprog
  from public.form_responses fr
  left join public.live_session_presence p
    on p.live_session_id = fr.live_session_id
   and p.anonymous_session_id = fr.anonymous_session_id
  where fr.live_session_id = fs.id
    and fr.student_id is null
    and fr.suspended_at is null
    and fr.finished_at is null
    and (
      (p.last_typing_at is not null and (now_ts - p.last_typing_at) < interval '8 seconds')
      or not (
        (p.last_activity_at is null or (now_ts - p.last_activity_at) > interval '45 seconds')
        and (p.last_typing_at is null or (now_ts - p.last_typing_at) > interval '45 seconds')
      )
    );

  return jsonb_build_object(
    'ok', true,
    'joinCode', fs.join_code,
    'formTitle', coalesce(nullif(trim(ftitle), ''), 'Form'),
    'opensAt', fs.opens_at,
    'closesAt', fs.closes_at,
    'durationMinutes', greatest(1, ceil(extract(epoch from (fs.closes_at - fs.opens_at)) / 60.0)::numeric)::int,
    'questionCounts', qcounts,
    'assignedCount', assigned,
    'inProgressCount', inprog
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Grants.
-- ---------------------------------------------------------------------------
revoke all on function public.touch_live_session_presence(uuid, text, boolean, boolean) from public;
revoke all on function public.get_live_session_student_state(uuid, text) from public;
grant execute on function public.touch_live_session_presence(uuid, text, boolean, boolean) to service_role;
grant execute on function public.get_live_session_student_state(uuid, text) to anon, authenticated, service_role;

commit;
