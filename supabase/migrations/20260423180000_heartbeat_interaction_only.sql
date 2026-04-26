-- Heartbeat: only bump last_activity_at when p_interaction is true (pointer, typing, etc.).
-- Periodic keepalive uses p_interaction false so idle / in-progress counts reflect real engagement.

begin;

drop function if exists public.heartbeat_live_session_student(uuid, text, boolean);

create or replace function public.heartbeat_live_session_student(
  p_live_session_id uuid,
  p_device_id text,
  p_is_typing boolean,
  p_interaction boolean default true
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
    last_activity_at = case
      when coalesce(p_interaction, true) then timezone('utc', now())
      else last_activity_at
    end,
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

revoke all on function public.heartbeat_live_session_student(uuid, text, boolean, boolean) from public;
grant execute on function public.heartbeat_live_session_student(uuid, text, boolean, boolean) to anon, authenticated, service_role;

commit;
