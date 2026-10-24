-- Teacher settings page: profile photo, per-teacher session defaults, and
-- self-service account deletion.
--
-- Account deletion runs as a SECURITY DEFINER function that deletes the caller's
-- own auth.users row (the project has no service-role key on the server). The
-- teacher's forms are deleted first because forms.created_by is `on delete set
-- null` — otherwise they would survive as orphans. Everything else cascades.

begin;

-- ---------------------------------------------------------------------------
-- 1) Profile photo
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 2) Per-teacher session defaults (seed the Start popover + new forms)
-- ---------------------------------------------------------------------------
create table if not exists public.teacher_defaults (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- null = no time limit
  duration_minutes integer check (duration_minutes is null or duration_minutes between 5 and 480),
  delivery_mode text not null default 'live' check (delivery_mode in ('live', 'self_paced', 'hybrid')),
  accept_late_sync boolean not null default true,
  live_feedback boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.teacher_defaults enable row level security;

drop policy if exists "teacher_defaults_select_own" on public.teacher_defaults;
create policy "teacher_defaults_select_own"
  on public.teacher_defaults for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "teacher_defaults_insert_own" on public.teacher_defaults;
create policy "teacher_defaults_insert_own"
  on public.teacher_defaults for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "teacher_defaults_update_own" on public.teacher_defaults;
create policy "teacher_defaults_update_own"
  on public.teacher_defaults for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3) Delete my account
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- forms.created_by is `on delete set null`: remove them explicitly so questions,
  -- sessions, responses, presence, transfers and feedback cascade away with them.
  delete from public.forms where created_by = uid;
  delete from public.form_sessions where created_by = uid;

  -- profiles, teacher_defaults, library rows and feedback authored cascade from here.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

commit;
