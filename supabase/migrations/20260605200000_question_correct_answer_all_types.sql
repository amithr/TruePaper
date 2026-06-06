-- The original correct_answer check only allowed `text` and `multipleChoice`.
-- New response types (shortAnswer, extendedWritten, trueFalse, etc.) must have
-- correct_answer null; only multiple choice may set it.

begin;

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
      question_type <> 'multipleChoice'
      and correct_answer is null
    )
  );

commit;
