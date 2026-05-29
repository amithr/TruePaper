-- Security hardening migration.
--
-- Addresses the following items from the 2026-05-28 security audit:
--
--   C1  finalize_all_live_session_students was callable by anon for any
--       liveSessionId with no closed-window or ownership check, allowing
--       force-finish of every student in an active session.
--
--   H1  profiles_update_own did not pin `role`, allowing any authenticated
--       student to self-promote to teacher via direct supabase-js calls.
--
--   H2  forms_select_authenticated / questions_select_authenticated used
--       `using (true)`, exposing every teacher's forms — including
--       `correct_answer` on questions — to any authenticated user.
--
--   M7  get_student_review_by_token only required length >= 8 while tokens
--       are always 12 chars. Tighten validation.
--
-- After this migration:
--   * Anonymous force-finish is gated on the session window being closed.
--   * Profiles.role can only be changed by a SECURITY DEFINER RPC.
--   * Forms/questions SELECT is restricted to the owning teacher.
--   * Review tokens must match the exact generated shape.

set local search_path = public;

-- ---------------------------------------------------------------------------
-- C1: finalize_all_live_session_students only finalizes a session whose
--     window has already closed. Direct anon RPC calls during an open
--     session now raise 'session not closed'.
--
-- stop_live_session is unaffected: it sets closes_at = now_ts *before*
-- calling this function in the same transaction, so the check still passes
-- when the teacher is intentionally ending the session early.
-- ---------------------------------------------------------------------------
create or replace function public.finalize_all_live_session_students(p_live_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  now_ts timestamptz := timezone('utc', now());
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

  update public.form_responses
  set
    finished_at = now_ts,
    suspended_at = null,
    last_activity_at = now_ts,
    updated_at = now()
  where live_session_id = p_live_session_id
    and student_id is null
    and finished_at is null;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.finalize_all_live_session_students(uuid) from public;
grant execute on function public.finalize_all_live_session_students(uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- H1: Pin profiles.role on direct UPDATE. A subquery in WITH CHECK forces
--     the new row's role to equal the row's existing role; only an explicit
--     SECURITY DEFINER RPC may flip it.
--
-- The subquery sees the pre-update value (snapshot semantics) and respects
-- profiles_select_own (own row only), so there is no recursion or leak.
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (
      select p.role
      from public.profiles p
      where p.id = auth.uid()
    )
  );

-- Replaces the in-callback `update profiles set role='teacher'` that the
-- old policy permitted. OAuth users still need their role corrected when
-- their `handle_new_user` trigger predates the OAuth defaults migration.
-- This function refuses to act for email/password users.
create or replace function public.ensure_oauth_teacher_role()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  provider text;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'unauthorized';
  end if;

  select coalesce(nullif(au.raw_app_meta_data ->> 'provider', ''), 'email')
  into provider
  from auth.users au
  where au.id = uid;

  if provider is null or provider = 'email' then
    return;
  end if;

  update public.profiles
  set role = 'teacher'
  where id = uid
    and role is distinct from 'teacher';
end;
$$;

revoke all on function public.ensure_oauth_teacher_role() from public;
grant execute on function public.ensure_oauth_teacher_role() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- H2: Restrict SELECT on forms and questions to the owning teacher.
--
-- Students never read these tables directly; the public student flow goes
-- through SECURITY DEFINER RPCs (lookup_join_code, get_student_review_by_token,
-- etc.) which redact correct_answer. Server routes that read forms/questions
-- already filter by `created_by = auth.uid()` or hop via teacher-owned
-- form_sessions, so this is a tightening only.
-- ---------------------------------------------------------------------------
drop policy if exists "forms_select_authenticated" on public.forms;
drop policy if exists "forms_select_owner" on public.forms;
create policy "forms_select_owner"
  on public.forms for select
  to authenticated
  using (created_by = auth.uid());

drop policy if exists "questions_select_authenticated" on public.questions;
drop policy if exists "questions_select_owner" on public.questions;
create policy "questions_select_owner"
  on public.questions for select
  to authenticated
  using (
    exists (
      select 1
      from public.forms f
      where f.id = questions.form_id
        and f.created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- M7: Review tokens are generated as exactly 12 uppercase base32 chars
--     (generate_student_review_token). Validate the input matches that
--     shape so attackers cannot enumerate against the 8-char weak check.
-- ---------------------------------------------------------------------------
create or replace function public.get_student_review_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tok text := upper(trim(coalesce(p_token, '')));
  fid uuid;
  payload jsonb;
  qjson jsonb;
  grades jsonb;
  graded boolean := false;
  earned int := 0;
  possible int := 0;
begin
  if length(tok) <> 12 then
    return null;
  end if;
  if tok !~ '^[2-9A-HJ-NP-Z]+$' then
    return null;
  end if;

  select fs.form_id,
         coalesce(fr.text_grades, '{}'::jsonb),
         (fr.text_graded_at is not null)
  into fid, grades, graded
  from public.form_responses fr
  inner join public.form_sessions fs on fs.id = fr.live_session_id
  where fr.student_review_token = tok
    and fr.student_id is null
  limit 1;

  if fid is null then
    return null;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prompt', q.prompt,
      'type', q.question_type,
      'options', coalesce(q.options, '[]'::jsonb),
      'points', q.points,
      'displayOrder', q.display_order,
      'earnedPoints',
        case
          when graded and grades ? q.id::text
            then (grades ->> q.id::text)::int
          else null
        end
    )
    order by q.display_order
  )
  into qjson
  from public.questions q
  where q.form_id = fid;

  if graded then
    select coalesce(sum((grades ->> q.id::text)::int), 0),
           coalesce(sum(q.points), 0)
    into earned, possible
    from public.questions q
    where q.form_id = fid
      and grades ? q.id::text;
  end if;

  select jsonb_build_object(
    'formTitle', coalesce(f.title, 'Form'),
    'formDescription', coalesce(f.description, ''),
    'displayName', coalesce(nullif(trim(fr.student_display_name), ''), ''),
    'finished', fr.finished_at is not null,
    'graded', graded,
    'pointsEarned', case when graded then earned else null end,
    'pointsPossible', case when graded then possible else null end,
    'sessionOpen',
      timezone('utc', now()) >= fs.opens_at
      and timezone('utc', now()) <= fs.closes_at,
    'questions', coalesce(qjson, '[]'::jsonb),
    'answers', coalesce(fr.answers, '{}'::jsonb),
    'liveTeacherFeedback', coalesce(fr.live_teacher_feedback, '{}'::jsonb)
  )
  into payload
  from public.form_responses fr
  inner join public.form_sessions fs on fs.id = fr.live_session_id
  inner join public.forms f on f.id = fs.form_id
  where fr.student_review_token = tok
    and fr.student_id is null;

  return payload;
end;
$$;

revoke all on function public.get_student_review_by_token(text) from public;
grant execute on function public.get_student_review_by_token(text)
  to anon, authenticated, service_role;
