-- Presence keepalive: add live_session_presence.last_seen_at so the teacher
-- roster can tell a student who is present-but-thinking (recent last_seen, stale
-- last_activity) apart from one who silently dropped their connection (stale
-- last_seen). This closes the inactivity-heatmap gap where a silent disconnect
-- looked identical to disengagement and got flagged as "stuck".
--
-- last_seen_at is bumped on EVERY heartbeat — including interaction:false
-- keepalives the client now sends while idle — unlike last_activity_at
-- (interaction only) and last_typing_at (typing only). All heartbeat RPC paths
-- funnel through touch_live_session_presence, so updating it here is sufficient.

begin;

alter table public.live_session_presence
  add column if not exists last_seen_at timestamptz;

-- Seed so in-flight sessions immediately have a usable value.
update public.live_session_presence
set last_seen_at = greatest(
  coalesce(last_activity_at, 'epoch'::timestamptz),
  coalesce(last_typing_at, 'epoch'::timestamptz)
)
where last_seen_at is null
  and (last_activity_at is not null or last_typing_at is not null);

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
    live_session_id, anonymous_session_id, last_activity_at, last_typing_at, last_seen_at
  )
  values (
    p_live_session_id,
    p_device_id,
    case when coalesce(p_interaction, true) then timezone('utc', now()) else null end,
    case when coalesce(p_is_typing, false) then timezone('utc', now()) else null end,
    timezone('utc', now())
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
    end,
    last_seen_at = timezone('utc', now());
$$;

revoke all on function public.touch_live_session_presence(uuid, text, boolean, boolean) from public;
grant execute on function public.touch_live_session_presence(uuid, text, boolean, boolean) to service_role;

commit;
