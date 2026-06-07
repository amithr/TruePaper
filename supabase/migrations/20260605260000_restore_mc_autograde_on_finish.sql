-- Migration 20260530090000_scale_polling_presence.sql replaced finish_live_session_student_response
-- and finalize_all_live_session_students without calling autograde_mc_for_response, so MC scores
-- were never written to text_grades on submit or when a session ends.

begin;

create or replace function public.autograde_mc_for_response(
  p_live_session_id uuid,
  p_device_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid;
  ans jsonb;
  grades jsonb;
  q record;
  chosen text;
  earned int;
begin
  select fs.form_id into fid
  from public.form_sessions fs
  where fs.id = p_live_session_id;

  if fid is null then
    return;
  end if;

  select fr.answers, coalesce(fr.text_grades, '{}'::jsonb)
  into ans, grades
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if not found then
    return;
  end if;

  for q in
    select id, points, correct_answer
    from public.questions
    where form_id = fid
      and question_type = 'multipleChoice'
  loop
    chosen := ans ->> q.id::text;
    if q.correct_answer is not null and chosen is not null and chosen = q.correct_answer then
      earned := q.points;
    else
      earned := 0;
    end if;
    grades := grades || jsonb_build_object(q.id::text, earned);
  end loop;

  update public.form_responses
  set text_grades = grades
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id)
    and student_id is null;
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
  fid uuid;
  susp timestamptz;
  fin timestamptz;
  name text;
  needs_manual_grading boolean := false;
  did_finish boolean := false;
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

  select exists (
    select 1
    from public.questions q
    where q.form_id = fid
      and (
        q.question_type <> 'multipleChoice'
        or q.correct_answer is null
      )
  ) into needs_manual_grading;

  select fr.suspended_at, fr.finished_at into susp, fin
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
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
  values (fs.form_id, p_live_session_id, lower(p_device_id), null, '{}'::jsonb, timezone('utc', now()), name)
  on conflict (live_session_id, anonymous_session_id)
    where live_session_id is not null and anonymous_session_id is not null
  do update set
    finished_at = timezone('utc', now()),
    updated_at = now(),
    student_display_name = excluded.student_display_name
  where form_responses.suspended_at is null
    and form_responses.finished_at is null;

  get diagnostics did_finish = row_count;
  if not did_finish then
    return;
  end if;

  perform public.autograde_mc_for_response(p_live_session_id, p_device_id);

  if not needs_manual_grading then
    begin
      perform public.internal_mark_response_graded(p_live_session_id, p_device_id);
    exception
      when others then
        null;
    end;
  end if;

  perform public.touch_live_session_presence(p_live_session_id, p_device_id, false, true);
end;
$$;

create or replace function public.finalize_all_live_session_students(p_live_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
  now_ts timestamptz := timezone('utc', now());
  r record;
  fid uuid;
  needs_manual_grading boolean := false;
begin
  if p_live_session_id is null then
    raise exception 'live session id required';
  end if;

  if not exists (
    select 1
    from public.form_sessions
    where id = p_live_session_id
      and closes_at is not null
      and closes_at <= now_ts
  ) then
    raise exception 'session not closed';
  end if;

  select fs.form_id into fid
  from public.form_sessions fs
  where fs.id = p_live_session_id;

  if fid is not null then
    select exists (
      select 1
      from public.questions q
      where q.form_id = fid
        and (
          q.question_type <> 'multipleChoice'
          or q.correct_answer is null
        )
    ) into needs_manual_grading;
  end if;

  for r in
    update public.form_responses
    set
      finished_at = now_ts,
      suspended_at = null,
      last_activity_at = now_ts,
      updated_at = now()
    where live_session_id = p_live_session_id
      and student_id is null
      and finished_at is null
    returning lower(anonymous_session_id) as device_id
  loop
    n := n + 1;
    perform public.autograde_mc_for_response(p_live_session_id, r.device_id);
    if not needs_manual_grading then
      begin
        perform public.internal_mark_response_graded(p_live_session_id, r.device_id);
      exception
        when others then
          null;
      end;
    end if;
  end loop;

  return n;
end;
$$;

grant execute on function public.autograde_mc_for_response(uuid, text) to service_role;

commit;
