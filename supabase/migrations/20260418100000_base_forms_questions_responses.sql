-- Bootstrap: core tables required before 20260418120000_auth_profiles_rls.sql
-- Run migrations in filename order (this file first).

begin;

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
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
  student_name text not null,
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint form_responses_form_id_student_name_key unique (form_id, student_name)
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

commit;
