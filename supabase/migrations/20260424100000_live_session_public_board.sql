-- Public projector-style summary for an open live session (join code only; no answers).

begin;

create or replace function public.get_live_session_public_board(p_code text)
returns jsonb
language plpgsql
stable
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
  now_ts timestamptz;
begin
  now_ts := timezone('utc', now());
  c := upper(trim(p_code));
  if c !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
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

  -- Matches app engagement rules: typing within 8s, or not idle on both pointer and typing (45s).
  select count(*)::int into inprog
  from public.form_responses fr
  where fr.live_session_id = fs.id
    and fr.student_id is null
    and fr.suspended_at is null
    and fr.finished_at is null
    and (
      (fr.last_typing_at is not null and (now_ts - fr.last_typing_at) < interval '8 seconds')
      or not (
        (fr.last_activity_at is null or (now_ts - fr.last_activity_at) > interval '45 seconds')
        and (fr.last_typing_at is null or (now_ts - fr.last_typing_at) > interval '45 seconds')
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

revoke all on function public.get_live_session_public_board(text) from public;
grant execute on function public.get_live_session_public_board(text) to anon, authenticated, service_role;

commit;
