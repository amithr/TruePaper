-- OAuth sign-ups (e.g. Google) should land as teachers, since students never
-- create accounts in this app -- they join sessions anonymously by code.
--
-- Also prefer the OAuth provider's `full_name` / `name` user-metadata over the
-- email local-part when seeding the new profile's display name.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r text;
  provider text;
begin
  r := new.raw_user_meta_data->>'role';
  provider := coalesce(new.raw_app_meta_data->>'provider', 'email');

  if r is null or r not in ('teacher', 'student') then
    if provider <> 'email' then
      -- OAuth sign-ups (google, github, etc.) are always teacher accounts.
      r := 'teacher';
    else
      r := 'student';
    end if;
  end if;

  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    r,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
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

commit;
