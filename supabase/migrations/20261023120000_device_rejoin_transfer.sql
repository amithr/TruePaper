-- Device rejoin: a student whose device died can continue their attempt on a new
-- device by typing the same name + class code. The request pauses the original
-- row (teacher roster shows "waiting"); the teacher's existing Let in approves it
-- and the row moves to the new device id. Approved requests stay as tombstones so
-- the old device can never re-create a blank row (every student write RPC is an
-- `insert … on conflict do update`; a BEFORE INSERT trigger covers them all —
-- one PK lookup per autosave on a tiny table).
--
-- Also restores the "exam already submitted" guard in
-- register_live_session_student_presence that 20260530090000 dropped.

begin;

-- ---------------------------------------------------------------------------
-- 1) Requests / tombstones
-- ---------------------------------------------------------------------------
create table if not exists public.live_session_device_transfers (
  live_session_id uuid not null references public.form_sessions (id) on delete cascade,
  from_device_id text not null,
  to_device_id text not null,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  declined_at timestamptz,
  -- suspended_at of the source row before the request paused it; restored on decline/cancel.
  prior_suspended_at timestamptz,
  primary key (live_session_id, from_device_id)
);

create index if not exists live_session_device_transfers_to_idx
  on public.live_session_device_transfers (live_session_id, to_device_id);

alter table public.live_session_device_transfers enable row level security;

drop policy if exists "live_session_device_transfers_select_teacher" on public.live_session_device_transfers;
create policy "live_session_device_transfers_select_teacher"
  on public.live_session_device_transfers for select
  to authenticated
  using (
    exists (
      select 1 from public.form_sessions fs
      where fs.id = live_session_device_transfers.live_session_id
        and fs.created_by = auth.uid()
    )
  );

-- A request the teacher has not answered yet. Requests expire after 15 minutes.
create or replace function public.live_session_rejoin_request_pending(
  p_requested_at timestamptz,
  p_approved_at timestamptz,
  p_declined_at timestamptz
)
returns boolean
language sql
stable
as $$
  select p_approved_at is null
     and p_declined_at is null
     and p_requested_at > now() - interval '15 minutes';
$$;

-- ---------------------------------------------------------------------------
-- 2) Block writes from a device whose attempt moved elsewhere
-- ---------------------------------------------------------------------------
create or replace function public.block_moved_device_rows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.live_session_id is null or new.anonymous_session_id is null then
    return new;
  end if;
  if exists (
    select 1 from public.live_session_device_transfers t
    where t.live_session_id = new.live_session_id
      and t.from_device_id = lower(new.anonymous_session_id)
      and t.approved_at is not null
  ) then
    raise exception 'exam moved to another device';
  end if;
  return new;
end;
$$;

drop trigger if exists form_responses_block_moved_device on public.form_responses;
create trigger form_responses_block_moved_device
  before insert on public.form_responses
  for each row execute function public.block_moved_device_rows();

drop trigger if exists live_session_presence_block_moved_device on public.live_session_presence;
create trigger live_session_presence_block_moved_device
  before insert on public.live_session_presence
  for each row execute function public.block_moved_device_rows();

-- ---------------------------------------------------------------------------
-- 3) Student side: find / request / cancel
-- ---------------------------------------------------------------------------
create or replace function public.normalize_student_display_name(p_name text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$$;

-- Is there exactly one unfinished attempt with this name on another device?
-- Never returns the other device's id.
create or replace function public.lookup_live_session_rejoin_candidate(
  p_live_session_id uuid,
  p_display_name text,
  p_device_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  fs record;
  r record;
  dev text;
  name_norm text;
  n integer;
  answered integer := 0;
  total integer := 0;
  last_active timestamptz;
  pending boolean := false;
begin
  dev := lower(trim(coalesce(p_device_id, '')));
  if dev !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_device');
  end if;

  name_norm := public.normalize_student_display_name(p_display_name);
  if name_norm = '' or length(name_norm) > 120 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;

  select id, form_id, opens_at, closes_at into fs
  from public.form_sessions
  where id = p_live_session_id
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    return jsonb_build_object('ok', false, 'reason', 'session_closed');
  end if;

  select count(*) into n
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and fr.student_id is null
    and fr.finished_at is null
    and public.normalize_student_display_name(fr.student_display_name) = name_norm
    and lower(fr.anonymous_session_id) <> dev;

  if n = 0 then
    return jsonb_build_object('ok', true, 'found', false);
  end if;
  if n > 1 then
    return jsonb_build_object('ok', true, 'found', false, 'ambiguous', true);
  end if;

  select fr.* into r
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and fr.student_id is null
    and fr.finished_at is null
    and public.normalize_student_display_name(fr.student_display_name) = name_norm
    and lower(fr.anonymous_session_id) <> dev
  limit 1;

  select count(*) into answered
  from jsonb_each(coalesce(r.answers, '{}'::jsonb)) e
  where e.value <> '""'::jsonb
    and e.value <> 'null'::jsonb
    and e.value <> '[]'::jsonb
    and e.value <> '{}'::jsonb;

  select count(*) into total from public.questions q where q.form_id = fs.form_id;

  select greatest(p.last_seen_at, p.last_activity_at, p.last_typing_at) into last_active
  from public.live_session_presence p
  where p.live_session_id = p_live_session_id
    and lower(p.anonymous_session_id) = lower(r.anonymous_session_id);
  last_active := greatest(coalesce(last_active, r.updated_at), r.updated_at);

  pending := exists (
    select 1 from public.live_session_device_transfers t
    where t.live_session_id = p_live_session_id
      and t.from_device_id = lower(r.anonymous_session_id)
      and t.to_device_id = dev
      and public.live_session_rejoin_request_pending(t.requested_at, t.approved_at, t.declined_at)
  );

  return jsonb_build_object(
    'ok', true,
    'found', true,
    'answeredCount', answered,
    'questionTotal', total,
    'lastActiveAt', last_active,
    'suspended', r.suspended_at is not null,
    'pendingRequest', pending
  );
end;
$$;

-- Ask to continue the attempt with this name on this device. Pauses the source
-- row at once so it shows as "waiting" to the teacher and the old device's
-- autosaves are held (423). Last request for a row wins.
create or replace function public.request_live_session_device_rejoin(
  p_live_session_id uuid,
  p_display_name text,
  p_device_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  fs record;
  r record;
  dev text;
  name_norm text;
  n integer;
begin
  dev := lower(trim(coalesce(p_device_id, '')));
  if dev !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_device');
  end if;

  name_norm := public.normalize_student_display_name(p_display_name);
  if name_norm = '' or length(name_norm) > 120 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;

  select id, form_id, opens_at, closes_at into fs
  from public.form_sessions
  where id = p_live_session_id
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    return jsonb_build_object('ok', false, 'reason', 'session_closed');
  end if;

  -- This device already has its own attempt here: just continue it.
  if exists (
    select 1 from public.form_responses fr
    where fr.live_session_id = p_live_session_id
      and lower(fr.anonymous_session_id) = dev
      and fr.student_id is null
  ) then
    if exists (
      select 1 from public.form_responses fr
      where fr.live_session_id = p_live_session_id
        and lower(fr.anonymous_session_id) = dev
        and fr.student_id is null
        and fr.finished_at is not null
    ) then
      return jsonb_build_object('ok', false, 'reason', 'already_submitted');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'target_has_attempt');
  end if;

  select count(*) into n
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and fr.student_id is null
    and fr.finished_at is null
    and public.normalize_student_display_name(fr.student_display_name) = name_norm
    and lower(fr.anonymous_session_id) <> dev;

  if n = 0 then
    if exists (
      select 1 from public.form_responses fr
      where fr.live_session_id = p_live_session_id
        and fr.student_id is null
        and fr.finished_at is not null
        and public.normalize_student_display_name(fr.student_display_name) = name_norm
    ) then
      return jsonb_build_object('ok', false, 'reason', 'already_submitted');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if n > 1 then
    return jsonb_build_object('ok', false, 'reason', 'ambiguous');
  end if;

  select fr.id, fr.anonymous_session_id, fr.suspended_at into r
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and fr.student_id is null
    and fr.finished_at is null
    and public.normalize_student_display_name(fr.student_display_name) = name_norm
    and lower(fr.anonymous_session_id) <> dev
  limit 1;

  insert into public.live_session_device_transfers (
    live_session_id, from_device_id, to_device_id, requested_at, approved_at, declined_at, prior_suspended_at
  )
  values (p_live_session_id, lower(r.anonymous_session_id), dev, now(), null, null, r.suspended_at)
  on conflict (live_session_id, from_device_id) do update set
    to_device_id = excluded.to_device_id,
    requested_at = now(),
    approved_at = null,
    declined_at = null,
    -- An earlier unanswered request already paused the row; keep the true prior state.
    prior_suspended_at = case
      when live_session_device_transfers.declined_at is null
        then live_session_device_transfers.prior_suspended_at
      else excluded.prior_suspended_at
    end;

  update public.form_responses
  set suspended_at = coalesce(suspended_at, now()), updated_at = now()
  where id = r.id;

  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$$;

-- The requesting device gives up: restore the source row's pause state.
create or replace function public.cancel_live_session_device_rejoin(
  p_live_session_id uuid,
  p_device_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  t record;
  dev text;
begin
  dev := lower(trim(coalesce(p_device_id, '')));
  if dev !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_device');
  end if;

  select * into t
  from public.live_session_device_transfers x
  where x.live_session_id = p_live_session_id
    and x.to_device_id = dev
    and x.approved_at is null
  limit 1;
  if not found then
    return jsonb_build_object('ok', true, 'status', 'none');
  end if;

  if t.declined_at is null then
    update public.form_responses
    set suspended_at = t.prior_suspended_at, updated_at = now()
    where live_session_id = p_live_session_id
      and lower(anonymous_session_id) = t.from_device_id
      and student_id is null;
  end if;

  delete from public.live_session_device_transfers x
  where x.live_session_id = t.live_session_id
    and x.from_device_id = t.from_device_id;

  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Teacher side: Let in approves a pending request; Not them declines it
-- ---------------------------------------------------------------------------
create or replace function public.teacher_clear_live_session_student_suspension(
  p_live_session_id uuid,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  t record;
  src text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  if not exists (
    select 1 from public.form_sessions fs
    where fs.id = p_live_session_id
      and fs.created_by = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  src := lower(p_device_id);

  select * into t
  from public.live_session_device_transfers x
  where x.live_session_id = p_live_session_id
    and x.from_device_id = src
    and public.live_session_rejoin_request_pending(x.requested_at, x.approved_at, x.declined_at)
  limit 1;

  if not found then
    update public.form_responses
    set suspended_at = null, updated_at = now()
    where live_session_id = p_live_session_id
      and lower(anonymous_session_id) = src
      and student_id is null;

    get diagnostics n = row_count;
    if n = 0 then
      raise exception 'student response not found';
    end if;

    return jsonb_build_object('ok', true, 'transferred', false);
  end if;

  -- The new device must not already hold a submitted attempt here.
  if exists (
    select 1 from public.form_responses fr
    where fr.live_session_id = p_live_session_id
      and lower(fr.anonymous_session_id) = t.to_device_id
      and fr.student_id is null
      and fr.finished_at is not null
  ) then
    raise exception 'target device already submitted';
  end if;

  -- A stray blank row on the new device (it registered before asking) gives way.
  delete from public.form_responses
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = t.to_device_id
    and student_id is null;

  -- The student may be moving back to a device that was moved away from earlier.
  delete from public.live_session_device_transfers x
  where x.live_session_id = p_live_session_id
    and x.from_device_id = t.to_device_id;

  update public.form_responses
  set anonymous_session_id = t.to_device_id, suspended_at = null, updated_at = now()
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = src
    and student_id is null;

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'student response not found';
  end if;

  delete from public.live_session_presence
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = t.to_device_id;
  update public.live_session_presence
  set anonymous_session_id = t.to_device_id
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = src;

  update public.feedback_items
  set student_device_id = t.to_device_id
  where live_session_id = p_live_session_id
    and lower(student_device_id) = src;

  update public.live_session_device_transfers x
  set approved_at = now()
  where x.live_session_id = p_live_session_id
    and x.from_device_id = src;

  return jsonb_build_object('ok', true, 'transferred', true, 'toDeviceId', t.to_device_id);
end;
$$;

create or replace function public.teacher_decline_live_session_device_rejoin(
  p_live_session_id uuid,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  src text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  if not exists (
    select 1 from public.form_sessions fs
    where fs.id = p_live_session_id
      and fs.created_by = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  src := lower(p_device_id);

  select * into t
  from public.live_session_device_transfers x
  where x.live_session_id = p_live_session_id
    and x.from_device_id = src
    and x.approved_at is null
    and x.declined_at is null
  limit 1;
  if not found then
    raise exception 'no pending rejoin request';
  end if;

  update public.form_responses
  set suspended_at = t.prior_suspended_at, updated_at = now()
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = src
    and student_id is null;

  update public.live_session_device_transfers x
  set declined_at = now()
  where x.live_session_id = p_live_session_id
    and x.from_device_id = src;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Student polls learn about moves and request status
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
  pres record;
  t record;
  dev text;
  has_row boolean := false;
  moved boolean := false;
  req text := 'none';
begin
  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;
  dev := lower(p_device_id);

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
  has_row := found;

  if not has_row then
    moved := exists (
      select 1 from public.live_session_device_transfers x
      where x.live_session_id = p_live_session_id
        and x.from_device_id = dev
        and x.approved_at is not null
    );
  end if;

  select * into t
  from public.live_session_device_transfers x
  where x.live_session_id = p_live_session_id
    and x.to_device_id = dev
  order by x.requested_at desc
  limit 1;
  if found then
    if t.approved_at is not null then
      req := 'none';
    elsif t.declined_at is not null then
      req := 'declined';
    elsif public.live_session_rejoin_request_pending(t.requested_at, t.approved_at, t.declined_at) then
      req := 'pending';
    else
      req := 'expired';
    end if;
  end if;

  select p.hand_raised_at, p.hand_raise_question_id into pres
  from public.live_session_presence p
  where p.live_session_id = p_live_session_id
    and lower(p.anonymous_session_id) = dev;

  return jsonb_build_object(
    'opensAt', fs.opens_at,
    'closesAt', fs.closes_at,
    'suspended', coalesce(r.suspended_at is not null, false),
    'finished', coalesce(r.finished_at is not null, false),
    'handRaiseQuestionId', pres.hand_raise_question_id,
    'handRaisedAt', pres.hand_raised_at,
    'hasResponse', has_row,
    'movedToAnotherDevice', moved,
    'rejoinRequest', req
  );
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
  moved boolean := false;
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
      'resumeCode', null,
      'movedToAnotherDevice', false
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
      'resumeCode', null,
      'movedToAnotherDevice', false
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
    moved := exists (
      select 1 from public.live_session_device_transfers x
      where x.live_session_id = p_live_session_id
        and x.from_device_id = lower(p_device_id)
        and x.approved_at is not null
    );

    if not session_open or moved then
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
        'resumeCode', null,
        'movedToAnotherDevice', moved
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
    'resumeCode', null,
    'movedToAnotherDevice', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Register: restore the post-submit guard (lost in 20260530090000)
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

  if exists (
    select 1 from public.form_responses fr
    where fr.live_session_id = p_live_session_id
      and lower(fr.anonymous_session_id) = lower(p_device_id)
      and fr.student_id is null
      and fr.finished_at is not null
  ) then
    raise exception 'exam already submitted';
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

-- ---------------------------------------------------------------------------
-- 7) Grants
-- ---------------------------------------------------------------------------
revoke all on function public.live_session_rejoin_request_pending(timestamptz, timestamptz, timestamptz) from public;
revoke all on function public.normalize_student_display_name(text) from public;
revoke all on function public.block_moved_device_rows() from public;
revoke all on function public.lookup_live_session_rejoin_candidate(uuid, text, text) from public;
revoke all on function public.request_live_session_device_rejoin(uuid, text, text) from public;
revoke all on function public.cancel_live_session_device_rejoin(uuid, text) from public;
revoke all on function public.teacher_clear_live_session_student_suspension(uuid, text) from public;
revoke all on function public.teacher_decline_live_session_device_rejoin(uuid, text) from public;
revoke all on function public.get_live_session_student_state(uuid, text) from public;
revoke all on function public.get_live_session_student_response(uuid, text) from public;
revoke all on function public.register_live_session_student_presence(uuid, text, text) from public;

grant execute on function public.live_session_rejoin_request_pending(timestamptz, timestamptz, timestamptz) to anon, authenticated, service_role;
grant execute on function public.normalize_student_display_name(text) to anon, authenticated, service_role;
grant execute on function public.lookup_live_session_rejoin_candidate(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.request_live_session_device_rejoin(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.cancel_live_session_device_rejoin(uuid, text) to anon, authenticated, service_role;
grant execute on function public.teacher_clear_live_session_student_suspension(uuid, text) to authenticated, service_role;
grant execute on function public.teacher_decline_live_session_device_rejoin(uuid, text) to authenticated, service_role;
grant execute on function public.get_live_session_student_state(uuid, text) to anon, authenticated, service_role;
grant execute on function public.get_live_session_student_response(uuid, text) to anon, authenticated, service_role;
grant execute on function public.register_live_session_student_presence(uuid, text, text) to anon, authenticated, service_role;

commit;
