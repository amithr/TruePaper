-- Extend finish-time autograde beyond multiple choice:
-- shortAnswer + mathInput (acceptedAnswers in response_config) and trueFalse.

begin;

create or replace function public.autograde_mc_for_response(
  p_live_session_id uuid,
  p_device_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid;
  ans jsonb;
  grades jsonb;
  q record;
  raw_answer text;
  chosen text;
  final_answer text;
  answer_json jsonb;
  earned int;
  accepted jsonb;
  accepted_item text;
  case_sensitive boolean;
  student_norm text;
  accepted_norm text;
  matched boolean;
  tf_student boolean;
  tf_correct boolean;
begin
  select fs.form_id into fid
  from public.form_sessions fs
  where fs.id = p_live_session_id;

  if fid is null then
    return;
  end if;

  select fr.answers, coalesce(fr.text_grades, '{}'::jsonb)
  into ans, grades
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if not found then
    return;
  end if;

  for q in
    select id, points, correct_answer, question_type, response_config
    from public.questions
    where form_id = fid
      and question_type in ('multipleChoice', 'shortAnswer', 'trueFalse', 'mathInput')
  loop
    earned := 0;
    raw_answer := ans ->> q.id::text;

    if q.question_type = 'multipleChoice' then
      if q.correct_answer is not null
         and raw_answer is not null
         and raw_answer = q.correct_answer then
        earned := q.points;
      end if;

    elsif q.question_type = 'shortAnswer' then
      accepted := coalesce(q.response_config -> 'acceptedAnswers', '[]'::jsonb);
      if jsonb_typeof(accepted) = 'array'
         and jsonb_array_length(accepted) > 0
         and raw_answer is not null
         and length(trim(raw_answer)) > 0 then
        case_sensitive := coalesce((q.response_config ->> 'caseSensitive')::boolean, false);
        student_norm := case
          when case_sensitive then trim(raw_answer)
          else lower(trim(raw_answer))
        end;
        matched := false;
        for accepted_item in
          select jsonb_array_elements_text(accepted)
        loop
          accepted_norm := case
            when case_sensitive then trim(accepted_item)
            else lower(trim(accepted_item))
          end;
          if accepted_norm <> '' and accepted_norm = student_norm then
            matched := true;
            exit;
          end if;
        end loop;
        if matched then
          earned := q.points;
        end if;
      end if;

    elsif q.question_type = 'mathInput' then
      accepted := coalesce(q.response_config -> 'acceptedAnswers', '[]'::jsonb);
      final_answer := '';
      if raw_answer is not null and length(trim(raw_answer)) > 0 then
        begin
          answer_json := raw_answer::jsonb;
          final_answer := coalesce(
            nullif(trim(coalesce(answer_json ->> 'answer', '')), ''),
            nullif(trim(coalesce(answer_json ->> 'latex', '')), ''),
            ''
          );
        exception
          when others then
            final_answer := trim(raw_answer);
        end;
      end if;
      if jsonb_typeof(accepted) = 'array'
         and jsonb_array_length(accepted) > 0
         and length(final_answer) > 0 then
        case_sensitive := coalesce((q.response_config ->> 'caseSensitive')::boolean, false);
        student_norm := case
          when case_sensitive then final_answer
          else lower(final_answer)
        end;
        matched := false;
        for accepted_item in
          select jsonb_array_elements_text(accepted)
        loop
          accepted_norm := case
            when case_sensitive then trim(accepted_item)
            else lower(trim(accepted_item))
          end;
          if accepted_norm <> '' and accepted_norm = student_norm then
            matched := true;
            exit;
          end if;
        end loop;
        if matched then
          earned := q.points;
        end if;
      end if;

    elsif q.question_type = 'trueFalse' then
      if raw_answer is not null
         and q.response_config ? 'correctAnswer'
         and jsonb_typeof(q.response_config -> 'correctAnswer') = 'boolean' then
        begin
          answer_json := raw_answer::jsonb;
          if (answer_json ->> 'answer') in ('true', 'false') then
            tf_student := (answer_json ->> 'answer')::boolean;
            tf_correct := (q.response_config ->> 'correctAnswer')::boolean;
            if tf_student = tf_correct then
              earned := q.points;
            end if;
          end if;
        exception
          when others then
            null;
        end;
      end if;
    end if;

    grades := grades || jsonb_build_object(q.id::text, earned);
  end loop;

  update public.form_responses
  set text_grades = grades
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id)
    and student_id is null;
end;
$$;

commit;
