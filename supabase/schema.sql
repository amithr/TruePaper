-- Full schema for a fresh Supabase project (SQL editor).
-- For incremental updates on an existing database, prefer supabase/migrations/.

-- ---------------------------------------------------------------------------
-- Forms & questions
-- ---------------------------------------------------------------------------
create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  prompt text not null,
  question_type text not null check (question_type in ('multipleChoice', 'text')),
  options jsonb not null default '[]'::jsonb,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists questions_form_id_idx on public.questions (form_id);
create index if not exists questions_display_order_idx on public.questions (form_id, display_order);

create table if not exists public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (form_id, student_id)
);

create index if not exists form_responses_form_id_idx on public.form_responses (form_id);

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_form_responses_updated_at on public.form_responses;
create trigger set_form_responses_updated_at
before update on public.form_responses
for each row
execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Profiles (synced from auth.users)
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
