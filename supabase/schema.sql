-- Full schema for a fresh Supabase project (SQL editor).
-- For incremental updates on an existing database, prefer supabase/migrations/.

-- ---------------------------------------------------------------------------
-- Forms & questions
-- ---------------------------------------------------------------------------
create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  live_teacher_feedback_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  prompt text not null,
  question_type text not null check (question_type in ('multipleChoice', 'text')),
  options jsonb not null default '[]'::jsonb,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists questions_form_id_idx on public.questions (form_id);
create index if not exists questions_display_order_idx on public.questions (form_id, display_order);

create table if not exists public.form_sessions (
  id uuid primary key default gen_random_uuid(),
  join_code text not null unique,
  form_id uuid not null references public.forms (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  opens_at timestamptz not null default now(),
  closes_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint form_sessions_join_code_fmt check (
    join_code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$'
  ),
  constraint form_sessions_window_chk check (closes_at > opens_at)
);

create index if not exists form_sessions_form_id_idx on public.form_sessions (form_id);
create index if not exists form_sessions_created_by_idx on public.form_sessions (created_by);

create table if not exists public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  student_id uuid references auth.users (id) on delete cascade,
  anonymous_session_id text,
  live_session_id uuid references public.form_sessions (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  suspended_at timestamptz,
  last_activity_at timestamptz,
  last_typing_at timestamptz,
  finished_at timestamptz,
  student_display_name text,
  live_teacher_feedback jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint form_responses_responder_chk check (
    (student_id is not null and anonymous_session_id is null and live_session_id is null)
    or (
      student_id is null
      and anonymous_session_id is not null
      and live_session_id is not null
    )
  ),
  constraint form_responses_live_display_name_chk check (
    live_session_id is null
    or student_id is not null
    or (
      student_display_name is not null
      and length(trim(student_display_name)) between 1 and 120
    )
  )
);

create unique index if not exists form_responses_form_student_uidx
  on public.form_responses (form_id, student_id)
  where student_id is not null;

create unique index if not exists form_responses_live_device_uidx
  on public.form_responses (live_session_id, anonymous_session_id)
  where live_session_id is not null and anonymous_session_id is not null;

create index if not exists form_responses_form_id_idx on public.form_responses (form_id);

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_form_responses_updated_at on public.form_responses;
create trigger set_form_responses_updated_at
before update on public.form_responses
for each row
execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Profiles (synced from auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('teacher', 'student')),
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r text;
begin
  r := new.raw_user_meta_data->>'role';
  if r is null or r not in ('teacher', 'student') then
    r := 'student';
  end if;

  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    r,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
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

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.forms enable row level security;
alter table public.questions enable row level security;
alter table public.form_sessions enable row level security;
alter table public.form_responses enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "forms_select_authenticated" on public.forms;
create policy "forms_select_authenticated"
  on public.forms for select
  to authenticated
  using (true);

drop policy if exists "forms_select_anon" on public.forms;

drop policy if exists "forms_insert_teacher" on public.forms;
create policy "forms_insert_teacher"
  on public.forms for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'teacher'
    )
  );

drop policy if exists "forms_update_owner" on public.forms;
create policy "forms_update_owner"
  on public.forms for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "forms_delete_owner" on public.forms;
create policy "forms_delete_owner"
  on public.forms for delete
  to authenticated
  using (created_by = auth.uid());

drop policy if exists "questions_select_authenticated" on public.questions;
create policy "questions_select_authenticated"
  on public.questions for select
  to authenticated
  using (true);

drop policy if exists "questions_select_anon" on public.questions;

drop policy if exists "questions_insert_owner" on public.questions;
create policy "questions_insert_owner"
  on public.questions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.forms f
      where f.id = form_id and f.created_by = auth.uid()
    )
  );

drop policy if exists "questions_update_owner" on public.questions;
create policy "questions_update_owner"
  on public.questions for update
  to authenticated
  using (
    exists (
      select 1 from public.forms f
      where f.id = form_id and f.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.forms f
      where f.id = form_id and f.created_by = auth.uid()
    )
  );

drop policy if exists "questions_delete_owner" on public.questions;
create policy "questions_delete_owner"
  on public.questions for delete
  to authenticated
  using (
    exists (
      select 1 from public.forms f
      where f.id = form_id and f.created_by = auth.uid()
    )
  );

drop policy if exists "form_responses_select" on public.form_responses;
create policy "form_responses_select"
  on public.form_responses for select
  to authenticated
  using (
    student_id = auth.uid()
    or exists (
      select 1 from public.forms f
      where f.id = form_id and f.created_by = auth.uid()
    )
  );

drop policy if exists "form_sessions_select_teacher" on public.form_sessions;
create policy "form_sessions_select_teacher"
  on public.form_sessions for select
  to authenticated
  using (created_by = auth.uid());

drop policy if exists "form_sessions_insert_teacher" on public.form_sessions;
create policy "form_sessions_insert_teacher"
  on public.form_sessions for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.forms f
      where f.id = form_id and f.created_by = auth.uid()
    )
  );

drop policy if exists "form_sessions_update_teacher" on public.form_sessions;
create policy "form_sessions_update_teacher"
  on public.form_sessions for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "form_sessions_delete_teacher" on public.form_sessions;
create policy "form_sessions_delete_teacher"
  on public.form_sessions for delete
  to authenticated
  using (created_by = auth.uid());

drop policy if exists "form_responses_insert" on public.form_responses;
create policy "form_responses_insert"
  on public.form_responses for insert
  to authenticated
  with check (
    student_id = auth.uid()
    and anonymous_session_id is null
    and live_session_id is null
  );

drop policy if exists "form_responses_update" on public.form_responses;
create policy "form_responses_update"
  on public.form_responses for update
  to authenticated
  using (
    student_id = auth.uid()
    and anonymous_session_id is null
    and live_session_id is null
  )
  with check (
    student_id = auth.uid()
    and anonymous_session_id is null
    and live_session_id is null
  );

-- ---------------------------------------------------------------------------
-- Join-code live sessions (anon calls SECURITY DEFINER RPCs; no public form listing)
-- ---------------------------------------------------------------------------
drop function if exists public.get_anonymous_form_response(uuid, text);
drop function if exists public.save_anonymous_form_response(uuid, text, jsonb);

create or replace function public.lookup_join_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c text;
  fs record;
  payload jsonb;
begin
  c := upper(trim(p_code));
  if c !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  select s.* into fs
  from public.form_sessions s
  where s.join_code = c
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    return jsonb_build_object('ok', false, 'reason', 'session_closed');
  end if;

  select jsonb_build_object(
    'ok', true,
    'liveSessionId', fs.id,
    'formId', fs.form_id,
    'opensAt', fs.opens_at,
    'closesAt', fs.closes_at,
    'title', f.title,
    'description', coalesce(f.description, ''),
    'liveTeacherFeedbackEnabled', coalesce(f.live_teacher_feedback_enabled, false),
    'questions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'prompt', q.prompt,
            'type', q.question_type,
            'options', q.options,
            'displayOrder', q.display_order
          )
          order by q.display_order
        )
        from public.questions q
        where q.form_id = fs.form_id
      ),
      '[]'::jsonb
    )
  )
  into payload
  from public.forms f
  where f.id = fs.form_id;

  return payload;
end;
$$;

create or replace function public.get_live_session_public_board(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c text;
  fs record;
  fid uuid;
  ftitle text;
  qcounts jsonb;
  assigned int;
  inprog int;
  now_ts timestamptz;
begin
  now_ts := timezone('utc', now());
  c := upper(trim(p_code));
  if c !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  select s.* into fs from public.form_sessions s where s.join_code = c limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if now_ts < fs.opens_at or now_ts > fs.closes_at then
    return jsonb_build_object('ok', false, 'reason', 'session_closed');
  end if;

  fid := fs.form_id;

  select f.title into ftitle from public.forms f where f.id = fid limit 1;

  select coalesce(
    (
      select jsonb_object_agg(question_type, typ_cnt)
      from (
        select q.question_type, count(*)::int as typ_cnt
        from public.questions q
        where q.form_id = fid
        group by q.question_type
      ) sub
    ),
    '{}'::jsonb
  )
  into qcounts;

  select count(*)::int into assigned
  from public.form_responses fr
  where fr.live_session_id = fs.id
    and fr.student_id is null;

  select count(*)::int into inprog
  from public.form_responses fr
  where fr.live_session_id = fs.id
    and fr.student_id is null
    and fr.suspended_at is null
    and fr.finished_at is null
    and (
      (fr.last_typing_at is not null and (now_ts - fr.last_typing_at) < interval '8 seconds')
      or not (
        (fr.last_activity_at is null or (now_ts - fr.last_activity_at) > interval '45 seconds')
        and (fr.last_typing_at is null or (now_ts - fr.last_typing_at) > interval '45 seconds')
      )
    );

  return jsonb_build_object(
    'ok', true,
    'joinCode', fs.join_code,
    'formTitle', coalesce(nullif(trim(ftitle), ''), 'Form'),
    'opensAt', fs.opens_at,
    'closesAt', fs.closes_at,
    'durationMinutes', greatest(1, ceil(extract(epoch from (fs.closes_at - fs.opens_at)) / 60.0)::numeric)::int,
    'questionCounts', qcounts,
    'assignedCount', assigned,
    'inProgressCount', inprog
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Student read: include display name
-- ---------------------------------------------------------------------------
create or replace function public.get_live_session_student_response(p_live_session_id uuid, p_device_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  fs record;
  fid uuid;
  feedback_enabled boolean := false;
  ans jsonb;
  live_fb jsonb;
  susp boolean := false;
  fin boolean := false;
  disp text := '';
begin
  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object(
      'answers', '{}'::jsonb,
      'suspended', false,
      'finished', false,
      'displayName', '',
      'liveTeacherFeedback', '{}'::jsonb
    );
  end if;

  select * into fs from public.form_sessions where id = p_live_session_id limit 1;
  if not found then
    return jsonb_build_object(
      'answers', '{}'::jsonb,
      'suspended', false,
      'finished', false,
      'displayName', '',
      'liveTeacherFeedback', '{}'::jsonb
    );
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    return jsonb_build_object(
      'answers', '{}'::jsonb,
      'suspended', false,
      'finished', false,
      'displayName', '',
      'liveTeacherFeedback', '{}'::jsonb
    );
  end if;

  fid := fs.form_id;
  select coalesce(f.live_teacher_feedback_enabled, false)
  into feedback_enabled
  from public.forms f
  where f.id = fid;

  select fr.answers,
         coalesce(fr.live_teacher_feedback, '{}'::jsonb),
         (fr.suspended_at is not null),
         (fr.finished_at is not null),
         coalesce(nullif(trim(fr.student_display_name), ''), '')
  into ans, live_fb, susp, fin, disp
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and fr.anonymous_session_id = p_device_id
    and fr.student_id is null;

  if not found then
    ans := '{}'::jsonb;
    live_fb := '{}'::jsonb;
    susp := false;
    fin := false;
    disp := '';
  end if;

  return jsonb_build_object(
    'answers', coalesce(ans, '{}'::jsonb),
    'suspended', susp,
    'finished', fin,
    'displayName', disp,
    'liveTeacherFeedback', case when feedback_enabled then coalesce(live_fb, '{}'::jsonb) else '{}'::jsonb end
  );
end;
$$;

drop function if exists public.save_live_session_student_response(uuid, text, jsonb);

create or replace function public.save_live_session_student_response(
  p_live_session_id uuid,
  p_device_id text,
  p_answers jsonb,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fs record;
  fid uuid;
  susp timestamptz;
  fin timestamptz;
  name text;
begin
  name := trim(coalesce(p_display_name, ''));
  if name is null or name = '' or length(name) > 120 then
    raise exception 'display name must be 1–120 characters';
  end if;

  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'answers must be a json object';
  end if;

  select * into fs from public.form_sessions where id = p_live_session_id limit 1;
  if not found then
    raise exception 'session not found';
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    raise exception 'session is not open';
  end if;

  fid := fs.form_id;

  select fr.suspended_at, fr.finished_at into susp, fin
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and fr.anonymous_session_id = p_device_id
    and fr.student_id is null;

  if susp is not null then
    raise exception 'exam suspended until your teacher allows you to continue';
  end if;

  if fin is not null then
    raise exception 'exam already submitted';
  end if;

  update public.form_responses
  set
    answers = p_answers,
    updated_at = now(),
    last_activity_at = timezone('utc', now()),
    student_display_name = name
  where live_session_id = p_live_session_id
    and anonymous_session_id = p_device_id
    and student_id is null
    and suspended_at is null
    and finished_at is null;

  if found then
    return;
  end if;

  insert into public.form_responses (
    form_id,
    live_session_id,
    anonymous_session_id,
    student_id,
    answers,
    suspended_at,
    last_activity_at,
    student_display_name
  )
  values (
    fid,
    p_live_session_id,
    p_device_id,
    null,
    p_answers,
    null,
    timezone('utc', now()),
    name
  );
end;
$$;

drop function if exists public.suspend_live_session_student_tab_leave(uuid, text);

create or replace function public.suspend_live_session_student_tab_leave(
  p_live_session_id uuid,
  p_device_id text,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fs record;
  fid uuid;
  name text;
begin
  name := trim(coalesce(p_display_name, ''));
  if name is null or name = '' or length(name) > 120 then
    raise exception 'display name must be 1–120 characters';
  end if;

  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select * into fs from public.form_sessions where id = p_live_session_id limit 1;
  if not found then
    raise exception 'session not found';
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    raise exception 'session is not open';
  end if;

  fid := fs.form_id;

  update public.form_responses
  set
    suspended_at = coalesce(suspended_at, timezone('utc', now())),
    updated_at = now(),
    last_activity_at = timezone('utc', now()),
    student_display_name = coalesce(nullif(trim(student_display_name), ''), name)
  where live_session_id = p_live_session_id
    and anonymous_session_id = p_device_id
    and student_id is null;

  if found then
    return;
  end if;

  insert into public.form_responses (
    form_id,
    live_session_id,
    anonymous_session_id,
    student_id,
    answers,
    suspended_at,
    last_activity_at,
    student_display_name
  )
  values (
    fid,
    p_live_session_id,
    p_device_id,
    null,
    '{}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now()),
    name
  );
end;
$$;

drop function if exists public.register_live_session_student_presence(uuid, text);

create or replace function public.register_live_session_student_presence(
  p_live_session_id uuid,
  p_device_id text,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fs record;
  fid uuid;
  name text;
begin
  name := trim(coalesce(p_display_name, ''));
  if name is null or name = '' or length(name) > 120 then
    raise exception 'display name must be 1–120 characters';
  end if;

  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select * into fs from public.form_sessions where id = p_live_session_id limit 1;
  if not found then
    raise exception 'session not found';
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    raise exception 'session is not open';
  end if;

  fid := fs.form_id;

  update public.form_responses
  set
    last_activity_at = timezone('utc', now()),
    updated_at = now(),
    student_display_name = name
  where live_session_id = p_live_session_id
    and anonymous_session_id = p_device_id
    and student_id is null;

  if found then
    return;
  end if;

  insert into public.form_responses (
    form_id,
    live_session_id,
    anonymous_session_id,
    student_id,
    answers,
    suspended_at,
    last_activity_at,
    student_display_name
  )
  values (
    fid,
    p_live_session_id,
    p_device_id,
    null,
    '{}'::jsonb,
    null,
    timezone('utc', now()),
    name
  );
end;
$$;

drop function if exists public.heartbeat_live_session_student(uuid, text, boolean, boolean);

create or replace function public.heartbeat_live_session_student(
  p_live_session_id uuid,
  p_device_id text,
  p_is_typing boolean,
  p_interaction boolean,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fs record;
  fid uuid;
  name text;
begin
  name := trim(coalesce(p_display_name, ''));
  if name is null or name = '' or length(name) > 120 then
    raise exception 'display name must be 1–120 characters';
  end if;

  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select * into fs from public.form_sessions where id = p_live_session_id limit 1;
  if not found then
    raise exception 'session not found';
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    raise exception 'session is not open';
  end if;

  fid := fs.form_id;

  update public.form_responses
  set
    last_activity_at = case
      when coalesce(p_interaction, true) then timezone('utc', now())
      else last_activity_at
    end,
    last_typing_at = case
      when coalesce(p_is_typing, false) then timezone('utc', now())
      else last_typing_at
    end,
    updated_at = now(),
    student_display_name = name
  where live_session_id = p_live_session_id
    and anonymous_session_id = p_device_id
    and student_id is null
    and suspended_at is null
    and finished_at is null;

  if found then
    return;
  end if;

  if exists (
    select 1 from public.form_responses fr
    where fr.live_session_id = p_live_session_id
      and fr.anonymous_session_id = p_device_id
      and fr.student_id is null
  ) then
    return;
  end if;

  if not coalesce(p_interaction, true) then
    return;
  end if;

  insert into public.form_responses (
    form_id,
    live_session_id,
    anonymous_session_id,
    student_id,
    answers,
    suspended_at,
    last_activity_at,
    last_typing_at,
    student_display_name
  )
  values (
    fid,
    p_live_session_id,
    p_device_id,
    null,
    '{}'::jsonb,
    null,
    timezone('utc', now()),
    case when coalesce(p_is_typing, false) then timezone('utc', now()) else null end,
    name
  );
end;
$$;

drop function if exists public.finish_live_session_student_response(uuid, text);

create or replace function public.finish_live_session_student_response(
  p_live_session_id uuid,
  p_device_id text,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fs record;
  fid uuid;
  susp timestamptz;
  fin timestamptz;
  name text;
begin
  name := trim(coalesce(p_display_name, ''));
  if name is null or name = '' or length(name) > 120 then
    raise exception 'display name must be 1–120 characters';
  end if;

  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select * into fs from public.form_sessions where id = p_live_session_id limit 1;
  if not found then
    raise exception 'session not found';
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    raise exception 'session is not open';
  end if;

  fid := fs.form_id;

  select fr.suspended_at, fr.finished_at into susp, fin
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and fr.anonymous_session_id = p_device_id
    and fr.student_id is null;

  if found then
    if susp is not null then
      raise exception 'cannot submit while suspended';
    end if;
    if fin is not null then
      return;
    end if;
  end if;

  update public.form_responses
  set
    finished_at = timezone('utc', now()),
    last_activity_at = timezone('utc', now()),
    updated_at = now(),
    student_display_name = name
  where live_session_id = p_live_session_id
    and anonymous_session_id = p_device_id
    and student_id is null
    and suspended_at is null
    and finished_at is null;

  if found then
    return;
  end if;

  insert into public.form_responses (
    form_id,
    live_session_id,
    anonymous_session_id,
    student_id,
    answers,
    suspended_at,
    finished_at,
    last_activity_at,
    student_display_name
  )
  values (
    fid,
    p_live_session_id,
    p_device_id,
    null,
    '{}'::jsonb,
    null,
    timezone('utc', now()),
    timezone('utc', now()),
    name
  );
end;
$$;
create or replace function public.set_live_teacher_feedback(
  p_live_session_id uuid,
  p_device_id text,
  p_question_id uuid,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  fid uuid;
  existing jsonb;
  trimmed text;
  qtype text;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select fs.form_id
  into fid
  from public.form_sessions fs
  join public.forms f on f.id = fs.form_id
  where fs.id = p_live_session_id
    and fs.created_by = uid
    and coalesce(f.live_teacher_feedback_enabled, false);

  if fid is null then
    raise exception 'not allowed';
  end if;

  select q.question_type
  into qtype
  from public.questions q
  where q.id = p_question_id
    and q.form_id = fid;

  if qtype is distinct from 'text' then
    raise exception 'question not found';
  end if;

  select coalesce(fr.live_teacher_feedback, '{}'::jsonb)
  into existing
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if not found then
    raise exception 'student response not found';
  end if;

  trimmed := left(trim(coalesce(p_message, '')), 2000);

  if trimmed = '' then
    existing := existing - p_question_id::text;
  else
    existing := existing || jsonb_build_object(p_question_id::text, trimmed);
  end if;

  update public.form_responses
  set
    live_teacher_feedback = existing,
    updated_at = now()
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id)
    and student_id is null;

  return existing;
end;
$$;

create or replace function public.teacher_clear_live_session_student_suspension(
  p_live_session_id uuid,
  p_device_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  if not exists (
    select 1 from public.form_sessions fs
    where fs.id = p_live_session_id
      and fs.created_by = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  update public.form_responses
  set suspended_at = null, updated_at = now()
  where live_session_id = p_live_session_id
    and anonymous_session_id = p_device_id
    and student_id is null;
end;
$$;

create or replace function public.finalize_all_live_session_students(p_live_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  now_ts timestamptz := timezone('utc', now());
begin
  if p_live_session_id is null then
    raise exception 'live session id required';
  end if;

  update public.form_responses
  set
    finished_at = now_ts,
    suspended_at = null,
    last_activity_at = now_ts,
    updated_at = now()
  where live_session_id = p_live_session_id
    and student_id is null
    and finished_at is null;

  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.stop_live_session(p_live_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  now_ts timestamptz := timezone('utc', now());
  finished_count integer;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'unauthorized';
  end if;

  if not exists (
    select 1
    from public.form_sessions fs
    where fs.id = p_live_session_id
      and fs.created_by = uid
  ) then
    raise exception 'session not found';
  end if;

  update public.form_sessions
  set closes_at = now_ts
  where id = p_live_session_id;

  finished_count := public.finalize_all_live_session_students(p_live_session_id);

  return jsonb_build_object(
    'ok', true,
    'closesAt', now_ts,
    'finishedCount', finished_count
  );
end;
$$;

revoke all on function public.finalize_all_live_session_students(uuid) from public;
revoke all on function public.stop_live_session(uuid) from public;

grant execute on function public.finalize_all_live_session_students(uuid) to anon, authenticated, service_role;
grant execute on function public.stop_live_session(uuid) to authenticated, service_role;

revoke all on function public.lookup_join_code(text) from public;
revoke all on function public.get_live_session_public_board(text) from public;
revoke all on function public.get_live_session_student_response(uuid, text) from public;
revoke all on function public.save_live_session_student_response(uuid, text, jsonb, text) from public;
revoke all on function public.suspend_live_session_student_tab_leave(uuid, text, text) from public;
revoke all on function public.register_live_session_student_presence(uuid, text, text) from public;
revoke all on function public.heartbeat_live_session_student(uuid, text, boolean, boolean, text) from public;
revoke all on function public.finish_live_session_student_response(uuid, text, text) from public;
revoke all on function public.set_live_teacher_feedback(uuid, text, uuid, text) from public;
revoke all on function public.teacher_clear_live_session_student_suspension(uuid, text) from public;

grant execute on function public.lookup_join_code(text) to anon, authenticated, service_role;
grant execute on function public.get_live_session_public_board(text) to anon, authenticated, service_role;
grant execute on function public.get_live_session_student_response(uuid, text) to anon, authenticated, service_role;
grant execute on function public.save_live_session_student_response(uuid, text, jsonb, text) to anon, authenticated, service_role;
grant execute on function public.suspend_live_session_student_tab_leave(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.register_live_session_student_presence(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.heartbeat_live_session_student(uuid, text, boolean, boolean, text) to anon, authenticated, service_role;
grant execute on function public.finish_live_session_student_response(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.set_live_teacher_feedback(uuid, text, uuid, text) to authenticated, service_role;
grant execute on function public.teacher_clear_live_session_student_suspension(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Realtime (see migration 20260425153000_form_responses_realtime.sql)
-- ---------------------------------------------------------------------------
alter table public.form_responses replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'form_responses'
     ) then
    execute 'alter publication supabase_realtime add table public.form_responses';
  end if;
end;
$$;
