-- When a student heartbeat explicitly reports offline, keep that state even if
-- pending_sync_count > 0. Previously pending count always won, so roster badges
-- showed "Saving…" instead of "Offline" for disconnected students with queued work.

begin;

drop function if exists public.heartbeat_live_session_student(uuid, text, boolean, boolean, text, integer, text);

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
      when p_sync_state = 'offline' then 'offline'
      when coalesce(p_pending_sync_count, 0) > 0 then 'pending'
      when p_sync_state in ('offline', 'pending', 'synced') then p_sync_state
      else 'synced'
    end
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id);
end;
$$;

grant execute on function public.heartbeat_live_session_student(
  uuid, text, boolean, boolean, text, integer, text
) to anon, authenticated, service_role;

commit;
