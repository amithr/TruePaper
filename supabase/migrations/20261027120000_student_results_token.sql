-- Students see their results: at hand-in the student's own device claims the
-- read-only results token (the same one teachers could already copy from the
-- watch page), so the hand-in screen can link to /review/<token>. The device id
-- is the credential, as for every public route; only a finished row qualifies.

begin;

create or replace function public.claim_student_review_token(
  p_live_session_id uuid,
  p_device_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
  fin timestamptz;
begin
  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select fr.student_review_token, fr.finished_at into code, fin
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if not found then
    raise exception 'student response not found';
  end if;
  if fin is null then
    raise exception 'exam not handed in';
  end if;
  if code is not null then
    return code;
  end if;

  code := public.generate_student_review_token();

  update public.form_responses
  set student_review_token = code
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id)
    and student_id is null
    and student_review_token is null;

  select fr.student_review_token into code
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  return code;
end;
$$;

revoke all on function public.claim_student_review_token(uuid, text) from public;
grant execute on function public.claim_student_review_token(uuid, text) to anon, authenticated, service_role;

commit;
