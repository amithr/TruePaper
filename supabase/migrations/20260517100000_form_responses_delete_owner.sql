-- Allow form owners to delete student responses (required for ON DELETE CASCADE from forms).

begin;

drop policy if exists "form_responses_delete_owner" on public.form_responses;

create policy "form_responses_delete_owner"
  on public.form_responses
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.forms f
      where f.id = form_responses.form_id
        and f.created_by = auth.uid()
    )
  );

commit;
