begin;

alter table public.questions
  add column if not exists points integer not null default 1;

alter table public.questions
  drop constraint if exists questions_points_chk;

alter table public.questions
  add constraint questions_points_chk check (points > 0 and points <= 1000);

commit;
