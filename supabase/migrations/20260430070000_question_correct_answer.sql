begin;

alter table public.questions
  add column if not exists correct_answer text;

alter table public.questions
  drop constraint if exists questions_correct_answer_chk;

alter table public.questions
  add constraint questions_correct_answer_chk check (
    (
      question_type = 'multipleChoice'
      and (
        correct_answer is null
        or options ? correct_answer
      )
    )
    or (
      question_type = 'text'
      and correct_answer is null
    )
  );

commit;
