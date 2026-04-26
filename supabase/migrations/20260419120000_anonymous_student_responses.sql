-- Anonymous students: optional student_id, anonymous_session_id for browser session.
-- Public read of forms/questions for anon role (still use /api/public for responses).
-- Authenticated responses must set student_id only (anonymous_session_id null).

begin;

alter table public.form_responses
  drop constraint if exists form_responses_form_id_student_id_key;

alter table public.form_responses
  alter column student_id drop not null;

alter table public.form_responses
  add column if not exists anonymous_session_id text;

update public.form_responses
set anonymous_session_id = null
where student_id is not null;

alter table public.form_responses
  drop constraint if exists form_responses_responder_chk;

alter table public.form_responses
  add constraint form_responses_responder_chk check (
    (student_id is not null and anonymous_session_id is null)
    or (student_id is null and anonymous_session_id is not null)
  );

create unique index if not exists form_responses_form_student_uidx
  on public.form_responses (form_id, student_id)
  where student_id is not null;

create unique index if not exists form_responses_form_anon_uidx
  on public.form_responses (form_id, anonymous_session_id)
  where anonymous_session_id is not null;

-- Allow unauthenticated read of published form definitions (optional; app also uses service role).
drop policy if exists "forms_select_anon" on public.forms;
create policy "forms_select_anon"
  on public.forms for select
  to anon
  using (true);

drop policy if exists "questions_select_anon" on public.questions;
create policy "questions_select_anon"
  on public.questions for select
  to anon
  using (true);

drop policy if exists "form_responses_insert" on public.form_responses;
create policy "form_responses_insert"
  on public.form_responses for insert
  to authenticated
  with check (
    student_id = auth.uid()
    and anonymous_session_id is null
  );

drop policy if exists "form_responses_update" on public.form_responses;
create policy "form_responses_update"
  on public.form_responses for update
  to authenticated
  using (
    student_id = auth.uid()
    and anonymous_session_id is null
  )
  with check (
    student_id = auth.uid()
    and anonymous_session_id is null
  );

commit;
