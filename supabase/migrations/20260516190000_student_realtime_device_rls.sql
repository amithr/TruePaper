-- Allow anonymous students to receive Realtime postgres_changes for their own live exam row only.
-- Pair with a short-lived JWT that includes claim device_id (see /api/public/.../realtime-token).

begin;

drop policy if exists "form_responses_select_anon_own_live" on public.form_responses;
create policy "form_responses_select_anon_own_live"
  on public.form_responses for select
  to anon
  using (
    student_id is null
    and live_session_id is not null
    and anonymous_session_id is not null
    and lower(anonymous_session_id) = lower(coalesce(auth.jwt() ->> 'device_id', ''))
  );

commit;
