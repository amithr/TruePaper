-- Offline-first sync: idempotent submissions, self-paced mode, teacher pending indicator.

begin;

alter table public.form_sessions
  add column if not exists delivery_mode text not null default 'live'
    check (delivery_mode in ('live', 'self_paced', 'hybrid')),
  add column if not exists accept_late_sync boolean not null default true;

alter table public.form_responses
  add column if not exists last_synced_submission_id uuid,
  add column if not exists server_received_sequence bigint not null default 0;

create table if not exists public.answer_sync_submissions (
  submission_id uuid primary key,
  live_session_id uuid not null references public.form_sessions (id) on delete cascade,
  device_id text not null,
  received_at timestamptz not null default now()
);

create index if not exists answer_sync_submissions_session_device_idx
  on public.answer_sync_submissions (live_session_id, device_id);

-- Dedupe ledger: only security-definer RPCs touch this table; no direct client access.
alter table public.answer_sync_submissions enable row level security;

alter table public.live_session_presence
  add column if not exists pending_sync_count integer not null default 0,
  add column if not exists sync_state text not null default 'synced'
    check (sync_state in ('synced', 'pending', 'offline'));

-- Idempotent save with late-sync support for closed sessions.
create or replace function public.save_live_session_student_response(
  p_live_session_id uuid,
  p_device_id text,
  p_answers jsonb,
  p_display_name text,
  p_submission_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fs record;
  susp timestamptz;
  fin timestamptz;
  name text;
  window_open boolean;
  allow_save boolean;
begin
  name := trim(coalesce(p_display_name, ''));
  if name is null or name = '' or length(name) > 120 then
    raise exception 'display name must be 1–120 characters';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'answers must be a json object';
  end if;

  if p_submission_id is not null then
    if exists (
      select 1 from public.answer_sync_submissions
      where submission_id = p_submission_id
    ) then
      return jsonb_build_object('ok', true, 'deduped', true);
    end if;
  end if;

  select * into fs from public.form_sessions where id = p_live_session_id limit 1;
  if not found then
    raise exception 'session not found';
  end if;

  window_open := timezone('utc', now()) >= fs.opens_at
    and timezone('utc', now()) <= fs.closes_at;

  allow_save := window_open
    or fs.delivery_mode in ('self_paced', 'hybrid')
    or coalesce(fs.accept_late_sync, true);

  if not allow_save then
    raise exception 'session is not open';
  end if;

  select fr.suspended_at, fr.finished_at into susp, fin
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
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
  values (fs.form_id, p_live_session_id, lower(p_device_id), null, p_answers, name)
  on conflict (live_session_id, anonymous_session_id)
    where live_session_id is not null and anonymous_session_id is not null
  do update set
    answers = excluded.answers,
    updated_at = now(),
    student_display_name = excluded.student_display_name,
    last_synced_submission_id = coalesce(p_submission_id, form_responses.last_synced_submission_id),
    server_received_sequence = form_responses.server_received_sequence + 1
  where form_responses.suspended_at is null
    and form_responses.finished_at is null;

  if p_submission_id is not null then
    insert into public.answer_sync_submissions (submission_id, live_session_id, device_id)
    values (p_submission_id, p_live_session_id, lower(p_device_id))
    on conflict (submission_id) do nothing;
  end if;

  update public.live_session_presence
  set
    pending_sync_count = 0,
    sync_state = 'synced',
    last_activity_at = now()
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id);

  perform public.touch_live_session_presence(p_live_session_id, p_device_id, false, true);

  return jsonb_build_object('ok', true, 'deduped', false);
end;
$$;

-- Extend heartbeat with pending-sync metadata (backward-compatible extra args).
drop function if exists public.heartbeat_live_session_student(uuid, text, boolean, boolean, text);

create or replace function public.heartbeat_live_session_student(
  p_live_session_id uuid,
  p_device_id text,
  p_is_typing boolean,
  p_interaction boolean,
  p_display_name text,
  p_pending_sync_count integer default 0,
  p_sync_state text default 'synced'
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
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select opens_at, closes_at, delivery_mode into fs
  from public.form_sessions
  where id = p_live_session_id
  limit 1;
  if not found then
    raise exception 'session not found';
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    if fs.delivery_mode not in ('self_paced', 'hybrid') then
      raise exception 'session is not open';
    end if;
  end if;

  perform public.touch_live_session_presence(
    p_live_session_id, p_device_id, p_is_typing, p_interaction
  );

  update public.live_session_presence
  set
    pending_sync_count = greatest(0, coalesce(p_pending_sync_count, 0)),
    sync_state = case
      when coalesce(p_pending_sync_count, 0) > 0 then 'pending'
      when p_sync_state in ('offline', 'pending', 'synced') then p_sync_state
      else 'synced'
    end
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id);
end;
$$;

-- Backward-compatible 4-arg save wrapper (returns void for legacy callers).
drop function if exists public.save_live_session_student_response(uuid, text, jsonb, text);

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
begin
  perform public.save_live_session_student_response(
    p_live_session_id, p_device_id, p_answers, p_display_name, null::uuid
  );
end;
$$;

revoke all on function public.save_live_session_student_response(uuid, text, jsonb, text, uuid) from public;
grant execute on function public.save_live_session_student_response(uuid, text, jsonb, text, uuid)
  to anon, authenticated, service_role;
grant execute on function public.save_live_session_student_response(uuid, text, jsonb, text)
  to anon, authenticated, service_role;

grant execute on function public.heartbeat_live_session_student(
  uuid, text, boolean, boolean, text, integer, text
) to anon, authenticated, service_role;

commit;
