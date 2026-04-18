-- Auth profiles, form ownership, student responses by user id, and RLS.
-- Apply after the base tables from supabase/schema.sql exist.

begin;

-- ---------------------------------------------------------------------------
-- Profiles (one row per auth user; created by trigger on signup)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('teacher', 'student')),
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r text;
begin
  r := new.raw_user_meta_data->>'role';
  if r is null or r not in ('teacher', 'student') then
    r := 'student';
  end if;

  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    r,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Forms: teacher ownership
-- ---------------------------------------------------------------------------
alter table public.forms
  add column if not exists created_by uuid references auth.users (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Responses: keyed by student user id (replaces free-text student_name)
-- ---------------------------------------------------------------------------
alter table public.form_responses
  drop constraint if exists form_responses_form_id_student_name_key;

alter table public.form_responses
  add column if not exists student_id uuid references auth.users (id) on delete cascade;

delete from public.form_responses where student_id is null;

alter table public.form_responses
  drop column if exists student_name;

alter table public.form_responses
  alter column student_id set not null;

drop index if exists form_responses_form_student_uidx;
create unique index form_responses_form_student_uidx on public.form_responses (form_id, student_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.forms enable row level security;
alter table public.questions enable row level security;
alter table public.form_responses enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "forms_select_authenticated" on public.forms;
create policy "forms_select_authenticated"
  on public.forms for select
  to authenticated
  using (true);

drop policy if exists "forms_insert_teacher" on public.forms;
create policy "forms_insert_teacher"
  on public.forms for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'teacher'
    )
  );

drop policy if exists "forms_update_owner" on public.forms;
create policy "forms_update_owner"
  on public.forms for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "forms_delete_owner" on public.forms;
create policy "forms_delete_owner"
  on public.forms for delete
  to authenticated
  using (created_by = auth.uid());

drop policy if exists "questions_select_authenticated" on public.questions;
create policy "questions_select_authenticated"
  on public.questions for select
  to authenticated
  using (true);

drop policy if exists "questions_insert_owner" on public.questions;
create policy "questions_insert_owner"
  on public.questions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.forms f
      where f.id = form_id and f.created_by = auth.uid()
    )
  );

drop policy if exists "questions_update_owner" on public.questions;
create policy "questions_update_owner"
  on public.questions for update
  to authenticated
  using (
    exists (
      select 1 from public.forms f
      where f.id = form_id and f.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.forms f
      where f.id = form_id and f.created_by = auth.uid()
    )
  );

drop policy if exists "questions_delete_owner" on public.questions;
create policy "questions_delete_owner"
  on public.questions for delete
  to authenticated
  using (
    exists (
      select 1 from public.forms f
      where f.id = form_id and f.created_by = auth.uid()
    )
  );

drop policy if exists "form_responses_select" on public.form_responses;
create policy "form_responses_select"
  on public.form_responses for select
  to authenticated
  using (
    student_id = auth.uid()
    or exists (
      select 1 from public.forms f
      where f.id = form_id and f.created_by = auth.uid()
    )
  );

drop policy if exists "form_responses_insert" on public.form_responses;
create policy "form_responses_insert"
  on public.form_responses for insert
  to authenticated
  with check (student_id = auth.uid());

drop policy if exists "form_responses_update" on public.form_responses;
create policy "form_responses_update"
  on public.form_responses for update
  to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

commit;
