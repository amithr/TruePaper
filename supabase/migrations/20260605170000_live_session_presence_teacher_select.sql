-- Teachers read presence for roster status (overview, dashboard, watch).
-- Writes remain security-definer RPCs only; this adds SELECT for session owners.

begin;

drop policy if exists "live_session_presence_select_teacher" on public.live_session_presence;
create policy "live_session_presence_select_teacher"
  on public.live_session_presence for select
  to authenticated
  using (
    exists (
      select 1 from public.form_sessions fs
      where fs.id = live_session_presence.live_session_id
        and fs.created_by = auth.uid()
    )
  );

commit;
