-- Who is running a live session: name + profile photo for the student exam
-- header and feedback bubbles. Anonymous students cannot read `profiles`
-- (own-row RLS), so this SECURITY DEFINER lookup exposes exactly two fields.

begin;

create or replace function public.get_live_session_host(p_live_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  select p.display_name, p.avatar_url into r
  from public.form_sessions fs
  join public.profiles p on p.id = fs.created_by
  where fs.id = p_live_session_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'displayName', coalesce(nullif(trim(r.display_name), ''), ''),
    'avatarUrl', r.avatar_url
  );
end;
$$;

revoke all on function public.get_live_session_host(uuid) from public;
grant execute on function public.get_live_session_host(uuid) to anon, authenticated, service_role;

commit;
