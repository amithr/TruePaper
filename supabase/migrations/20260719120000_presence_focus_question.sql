-- Track which question a student is focused on / typing in so the teacher
-- watch view can show "Live · typing in Q{n}" and highlight that card.

begin;

alter table public.live_session_presence
  add column if not exists focus_question_id uuid;

-- 5-arg touch (focus optional). Keep 4-arg as a thin wrapper for older callers.
create or replace function public.touch_live_session_presence(
  p_live_session_id uuid,
  p_device_id text,
  p_is_typing boolean,
  p_interaction boolean,
  p_focus_question_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.live_session_presence as p (
    live_session_id,
    anonymous_session_id,
    last_activity_at,
    last_typing_at,
    last_seen_at,
    focus_question_id
  )
  values (
    p_live_session_id,
    p_device_id,
    case when coalesce(p_interaction, true) then timezone('utc', now()) else null end,
    case when coalesce(p_is_typing, false) then timezone('utc', now()) else null end,
    timezone('utc', now()),
    case
      when coalesce(p_interaction, true) or coalesce(p_is_typing, false)
        then p_focus_question_id
      else null
    end
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
    last_seen_at = timezone('utc', now()),
    focus_question_id = case
      when coalesce(p_interaction, true) or coalesce(p_is_typing, false)
        then p_focus_question_id
      else p.focus_question_id
    end;
$$;

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
  select public.touch_live_session_presence(
    p_live_session_id,
    p_device_id,
    p_is_typing,
    p_interaction,
    null::uuid
  );
$$;

revoke all on function public.touch_live_session_presence(uuid, text, boolean, boolean) from public;
revoke all on function public.touch_live_session_presence(uuid, text, boolean, boolean, uuid) from public;
grant execute on function public.touch_live_session_presence(uuid, text, boolean, boolean) to service_role;
grant execute on function public.touch_live_session_presence(uuid, text, boolean, boolean, uuid) to service_role;

drop function if exists public.heartbeat_live_session_student(uuid, text, boolean, boolean, text, integer, text);

create function public.heartbeat_live_session_student(
  p_live_session_id uuid,
  p_device_id text,
  p_is_typing boolean,
  p_interaction boolean,
  p_display_name text,
  p_pending_sync_count integer default 0,
  p_sync_state text default 'synced',
  p_focus_question_id uuid default null
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
    p_live_session_id,
    p_device_id,
    p_is_typing,
    p_interaction,
    p_focus_question_id
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
  uuid, text, boolean, boolean, text, integer, text, uuid
) to anon, authenticated, service_role;

commit;
