-- Allow anonymous student response read/write without the service_role key.
-- Uses SECURITY DEFINER RPCs callable with the anon API key (RLS still applies to direct table access).

begin;

create or replace function public.get_anonymous_form_response(p_form_id uuid, p_session_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if p_session_id is null
     or p_session_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return '{}'::jsonb;
  end if;

  select fr.answers into result
  from public.form_responses fr
  where fr.form_id = p_form_id
    and fr.anonymous_session_id = p_session_id
    and fr.student_id is null;

  return coalesce(result, '{}'::jsonb);
end;
$$;

create or replace function public.save_anonymous_form_response(p_form_id uuid, p_session_id text, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_session_id is null
     or p_session_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid session id';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'answers must be a json object';
  end if;

  update public.form_responses
  set answers = p_answers, updated_at = now()
  where form_id = p_form_id
    and anonymous_session_id = p_session_id
    and student_id is null;

  if found then
    return;
  end if;

  insert into public.form_responses (form_id, anonymous_session_id, student_id, answers)
  values (p_form_id, p_session_id, null, p_answers);
end;
$$;

revoke all on function public.get_anonymous_form_response(uuid, text) from public;
revoke all on function public.save_anonymous_form_response(uuid, text, jsonb) from public;

grant execute on function public.get_anonymous_form_response(uuid, text) to anon, authenticated, service_role;
grant execute on function public.save_anonymous_form_response(uuid, text, jsonb) to anon, authenticated, service_role;

commit;
