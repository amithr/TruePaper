-- Students use lookup_join_code (SECURITY DEFINER); no direct anon listing of forms/questions.

begin;

drop policy if exists "forms_select_anon" on public.forms;
drop policy if exists "questions_select_anon" on public.questions;

commit;
