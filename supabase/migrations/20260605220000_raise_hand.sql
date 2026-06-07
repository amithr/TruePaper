-- Students can raise a hand on a question; teachers see it on the exam roster.

begin;

alter table public.live_session_presence
  add column if not exists hand_raised_at timestamptz,
  add column if not exists hand_raise_question_id uuid;

create or replace function public.set_student_hand_raise(
  p_live_session_id uuid,
  p_device_id text,
  p_question_id uuid,
  p_raised boolean
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
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select sess.id, sess.form_id, sess.opens_at, sess.closes_at, sess.delivery_mode
  into fs
  from public.form_sessions sess
  where sess.id = p_live_session_id
  limit 1;

  if not found then
    raise exception 'session not found';
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    if fs.delivery_mode not in ('self_paced', 'hybrid') then
      raise exception 'session is not open';
    end if;
  end if;

  fid := fs.form_id;

  if p_raised then
    if p_question_id is null then
      raise exception 'question id required';
    end if;
    if not exists (
      select 1
      from public.questions q
      where q.id = p_question_id
        and q.form_id = fid
    ) then
      raise exception 'question not found';
    end if;
  end if;

  perform public.touch_live_session_presence(p_live_session_id, p_device_id, false, true);

  update public.live_session_presence
  set
    hand_raised_at = case when p_raised then timezone('utc', now()) else null end,
    hand_raise_question_id = case when p_raised then p_question_id else null end
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id);
end;
$$;

create or replace function public.clear_student_hand_raise(
  p_live_session_id uuid,
  p_device_id text,
  p_question_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  update public.live_session_presence
  set
    hand_raised_at = null,
    hand_raise_question_id = null
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id)
    and hand_raised_at is not null
    and (
      p_question_id is null
      or hand_raise_question_id = p_question_id
    );
end;
$$;

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

  select p.hand_raised_at, p.hand_raise_question_id into pres
  from public.live_session_presence p
  where p.live_session_id = p_live_session_id
    and lower(p.anonymous_session_id) = lower(p_device_id);

  return jsonb_build_object(
    'opensAt', fs.opens_at,
    'closesAt', fs.closes_at,
    'suspended', coalesce(r.suspended_at is not null, false),
    'finished', coalesce(r.finished_at is not null, false),
    'handRaiseQuestionId', pres.hand_raise_question_id,
    'handRaisedAt', pres.hand_raised_at
  );
end;
$$;

grant execute on function public.set_student_hand_raise(uuid, text, uuid, boolean) to anon, service_role;
grant execute on function public.clear_student_hand_raise(uuid, text, uuid) to authenticated, service_role;

commit;
