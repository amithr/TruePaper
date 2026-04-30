begin;

alter table public.form_responses
  add column if not exists text_grades jsonb not null default '{}'::jsonb;

alter table public.form_responses
  add column if not exists text_graded_at timestamptz;

commit;
