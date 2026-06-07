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
  question_type text not null check (
    question_type in (
      'multipleChoice',
      'text',
      'shortAnswer',
      'extendedWritten',
      'structuredMultiPart',
      'annotateSource',
      'drawDiagram',
      'graph',
      'photoHandwritten',
      'trueFalse',
      'matching',
      'ordering',
      'labelling',
      'mathInput'
    )
  ),
  options jsonb not null default '[]'::jsonb,
  correct_answer text,
  points integer not null default 1,
  response_config jsonb not null default '{}'::jsonb,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint questions_points_chk check (points > 0 and points <= 1000),
  constraint questions_correct_answer_chk check (
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
  )
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
  delivery_mode text not null default 'live'
    check (delivery_mode in ('live', 'self_paced', 'hybrid')),
  accept_late_sync boolean not null default true,
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
  student_resume_code text,
  student_review_token text,
  last_synced_submission_id uuid,
  server_received_sequence bigint not null default 0,
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

create unique index if not exists form_responses_student_resume_code_uidx
  on public.form_responses (student_resume_code)
  where student_resume_code is not null;

create unique index if not exists form_responses_student_review_token_uidx
  on public.form_responses (student_review_token)
  where student_review_token is not null;

create index if not exists form_responses_form_id_idx on public.form_responses (form_id);

-- Narrow, high-churn presence table. Heartbeats write here (not the wide
-- form_responses row) so autosave/heartbeat traffic stops rewriting the
-- answers/feedback JSONB. fillfactor leaves room for HOT updates.
create table if not exists public.live_session_presence (
  live_session_id uuid not null references public.form_sessions (id) on delete cascade,
  anonymous_session_id text not null,
  last_activity_at timestamptz,
  last_typing_at timestamptz,
  pending_sync_count integer not null default 0,
  sync_state text not null default 'synced'
    check (sync_state in ('synced', 'pending', 'offline')),
  hand_raised_at timestamptz,
  hand_raise_question_id uuid,
  primary key (live_session_id, anonymous_session_id)
) with (fillfactor = 70);

alter table public.live_session_presence enable row level security;

-- Idempotent dedupe ledger for offline answer sync. Only security-definer RPCs
-- touch this table; RLS is enabled with no policies so clients cannot read/write.
create table if not exists public.answer_sync_submissions (
  submission_id uuid primary key,
  live_session_id uuid not null references public.form_sessions (id) on delete cascade,
  device_id text not null,
  received_at timestamptz not null default now()
);

create index if not exists answer_sync_submissions_session_device_idx
  on public.answer_sync_submissions (live_session_id, device_id);

alter table public.answer_sync_submissions enable row level security;

drop policy if exists "live_session_presence_select_teacher" on public.live_session_presence;
create policy "live_session_presence_select_teacher"
  on public.live_session_presence for select
  to authenticated
  using (
    exists (
      select 1 from public.form_sessions fs
      where fs.id = live_session_presence.live_session_id
        and fs.created_by = auth.uid()
    )
  );

create or replace function public.touch_live_session_presence(
  p_live_session_id uuid,
  p_device_id text,
  p_is_typing boolean,
  p_interaction boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.live_session_presence as p (
    live_session_id, anonymous_session_id, last_activity_at, last_typing_at
  )
  values (
    p_live_session_id,
    p_device_id,
    case when coalesce(p_interaction, true) then timezone('utc', now()) else null end,
    case when coalesce(p_is_typing, false) then timezone('utc', now()) else null end
  )
  on conflict (live_session_id, anonymous_session_id) do update
  set
    last_activity_at = case
      when coalesce(p_interaction, true) then timezone('utc', now())
      else p.last_activity_at
    end,
    last_typing_at = case
      when coalesce(p_is_typing, false) then timezone('utc', now())
      else p.last_typing_at
    end;
$$;

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

drop policy if exists "form_responses_select_anon_own_live" on public.form_responses;
create policy "form_responses_select_anon_own_live"
  on public.form_responses for select
  to anon
  using (
    student_id is null
    and live_session_id is not null
    and anonymous_session_id is not null
    and lower(anonymous_session_id) = lower(coalesce(auth.jwt() ->> 'device_id', ''))
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

drop policy if exists "form_responses_delete_owner" on public.form_responses;
create policy "form_responses_delete_owner"
  on public.form_responses for delete
  to authenticated
  using (
    exists (
      select 1
      from public.forms f
      where f.id = form_responses.form_id
        and f.created_by = auth.uid()
    )
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
  left join public.live_session_presence p
    on p.live_session_id = fr.live_session_id
   and p.anonymous_session_id = fr.anonymous_session_id
  where fr.live_session_id = fs.id
    and fr.student_id is null
    and fr.suspended_at is null
    and fr.finished_at is null
    and (
      (p.last_typing_at is not null and (now_ts - p.last_typing_at) < interval '8 seconds')
      or not (
        (p.last_activity_at is null or (now_ts - p.last_activity_at) > interval '45 seconds')
        and (p.last_typing_at is null or (now_ts - p.last_typing_at) > interval '45 seconds')
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
-- Student read: include display name and personal rejoin code
-- ---------------------------------------------------------------------------
create or replace function public.generate_student_resume_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  result text := '';
  i integer;
  tries integer := 0;
  ch integer;
begin
  loop
    result := '';
    for i in 1..8 loop
      ch := 1 + floor(random() * length(alphabet))::integer;
      result := result || substr(alphabet, ch, 1);
    end loop;
    exit when not exists (
      select 1 from public.form_responses fr where fr.student_resume_code = result
    );
    tries := tries + 1;
    if tries > 100 then
      raise exception 'could not allocate student resume code';
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public.ensure_student_resume_code(
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
begin
  if p_live_session_id is null or p_device_id is null then
    return null;
  end if;

  select fr.student_resume_code into code
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if not found then
    return null;
  end if;

  if code is not null then
    return code;
  end if;

  code := public.generate_student_resume_code();

  update public.form_responses
  set student_resume_code = code
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id)
    and student_id is null
    and student_resume_code is null;

  select fr.student_resume_code into code
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  return code;
end;
$$;

create or replace function public.lookup_student_resume_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c text;
  fr record;
  fs record;
  payload jsonb;
begin
  c := upper(trim(coalesce(p_code, '')));
  if c !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  select resp.* into fr
  from public.form_responses resp
  where resp.student_resume_code = c
    and resp.student_id is null
    and resp.live_session_id is not null
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if fr.finished_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_submitted');
  end if;

  select s.* into fs
  from public.form_sessions s
  where s.id = fr.live_session_id
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
    'deviceId', fr.anonymous_session_id,
    'displayName', coalesce(nullif(trim(fr.student_display_name), ''), ''),
    'joinCode', fs.join_code,
    'formId', fs.form_id,
    'opensAt', fs.opens_at,
    'closesAt', fs.closes_at,
    'resumeCode', c,
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

create or replace function public.get_live_session_student_response(p_live_session_id uuid, p_device_id text)
returns jsonb
language plpgsql
volatile
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
  session_open boolean := false;
begin
  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object(
      'answers', '{}'::jsonb,
      'suspended', false,
      'finished', false,
      'displayName', '',
      'liveTeacherFeedback', '{}'::jsonb,
      'liveTeacherFeedbackEnabled', false,
      'resumeCode', null
    );
  end if;

  select * into fs from public.form_sessions where id = p_live_session_id limit 1;
  if not found then
    return jsonb_build_object(
      'answers', '{}'::jsonb,
      'suspended', false,
      'finished', false,
      'displayName', '',
      'liveTeacherFeedback', '{}'::jsonb,
      'liveTeacherFeedbackEnabled', false,
      'resumeCode', null
    );
  end if;

  session_open :=
    timezone('utc', now()) >= fs.opens_at
    and timezone('utc', now()) <= fs.closes_at;

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
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if not found then
    if not session_open then
      return jsonb_build_object(
        'answers', '{}'::jsonb,
        'suspended', false,
        'finished', false,
        'displayName', '',
        'liveTeacherFeedback', '{}'::jsonb,
        'liveTeacherFeedbackEnabled', feedback_enabled,
        'resumeCode', null
      );
    end if;

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
    'liveTeacherFeedback', coalesce(live_fb, '{}'::jsonb),
    'liveTeacherFeedbackEnabled', feedback_enabled,
    'resumeCode', null
  );
end;
$$;

create or replace function public.teacher_ensure_student_resume_code(
  p_live_session_id uuid,
  p_device_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  fs record;
  fin timestamptz;
  code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select * into fs
  from public.form_sessions
  where id = p_live_session_id
    and created_by = auth.uid()
  limit 1;

  if not found then
    raise exception 'not allowed';
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    raise exception 'session is not open';
  end if;

  select fr.finished_at into fin
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if not found then
    raise exception 'student response not found';
  end if;

  if fin is not null then
    raise exception 'exam already submitted';
  end if;

  select fr.student_resume_code into code
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if code is not null then
    return code;
  end if;

  code := public.generate_student_resume_code();

  update public.form_responses
  set student_resume_code = code
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id)
    and student_id is null
    and student_resume_code is null
    and finished_at is null;

  select fr.student_resume_code into code
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if code is null then
    raise exception 'could not create rejoin code';
  end if;

  return code;
end;
$$;

drop function if exists public.save_live_session_student_response(uuid, text, jsonb);

-- Idempotent save with late-sync support for closed sessions. The optional
-- submission id dedupes retried offline syncs.
create or replace function public.save_live_session_student_response(
  p_live_session_id uuid,
  p_device_id text,
  p_answers jsonb,
  p_display_name text,
  p_submission_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fs record;
  susp timestamptz;
  fin timestamptz;
  name text;
  window_open boolean;
  allow_save boolean;
begin
  name := trim(coalesce(p_display_name, ''));
  if name is null or name = '' or length(name) > 120 then
    raise exception 'display name must be 1–120 characters';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'answers must be a json object';
  end if;

  if p_submission_id is not null then
    if exists (
      select 1 from public.answer_sync_submissions
      where submission_id = p_submission_id
    ) then
      return jsonb_build_object('ok', true, 'deduped', true);
    end if;
  end if;

  select * into fs from public.form_sessions where id = p_live_session_id limit 1;
  if not found then
    raise exception 'session not found';
  end if;

  window_open := timezone('utc', now()) >= fs.opens_at
    and timezone('utc', now()) <= fs.closes_at;

  allow_save := window_open
    or fs.delivery_mode in ('self_paced', 'hybrid')
    or coalesce(fs.accept_late_sync, true);

  if not allow_save then
    raise exception 'session is not open';
  end if;

  select fr.suspended_at, fr.finished_at into susp, fin
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if susp is not null then
    raise exception 'exam suspended until your teacher allows you to continue';
  end if;

  if fin is not null then
    raise exception 'exam already submitted';
  end if;

  insert into public.form_responses (
    form_id, live_session_id, anonymous_session_id, student_id, answers, student_display_name
  )
  values (fs.form_id, p_live_session_id, lower(p_device_id), null, p_answers, name)
  on conflict (live_session_id, anonymous_session_id)
    where live_session_id is not null and anonymous_session_id is not null
  do update set
    answers = excluded.answers,
    updated_at = now(),
    student_display_name = excluded.student_display_name,
    last_synced_submission_id = coalesce(p_submission_id, form_responses.last_synced_submission_id),
    server_received_sequence = form_responses.server_received_sequence + 1
  where form_responses.suspended_at is null
    and form_responses.finished_at is null;

  if p_submission_id is not null then
    insert into public.answer_sync_submissions (submission_id, live_session_id, device_id)
    values (p_submission_id, p_live_session_id, lower(p_device_id))
    on conflict (submission_id) do nothing;
  end if;

  update public.live_session_presence
  set
    pending_sync_count = 0,
    sync_state = 'synced',
    last_activity_at = now()
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id);

  perform public.touch_live_session_presence(p_live_session_id, p_device_id, false, true);

  return jsonb_build_object('ok', true, 'deduped', false);
end;
$$;

-- The 5-arg overload above is the single entry point. The legacy 4-arg wrapper
-- was removed (see 20260605180000_drop_legacy_save_response_wrapper.sql) because
-- it created PostgREST overload ambiguity; drop it here for older databases.
drop function if exists public.save_live_session_student_response(uuid, text, jsonb, text);

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

  insert into public.form_responses (
    form_id, live_session_id, anonymous_session_id, student_id, answers, suspended_at, student_display_name
  )
  values (fs.form_id, p_live_session_id, p_device_id, null, '{}'::jsonb, timezone('utc', now()), name)
  on conflict (live_session_id, anonymous_session_id)
    where live_session_id is not null and anonymous_session_id is not null
  do update set
    suspended_at = coalesce(form_responses.suspended_at, timezone('utc', now())),
    updated_at = now(),
    student_display_name = coalesce(nullif(trim(form_responses.student_display_name), ''), excluded.student_display_name);

  perform public.touch_live_session_presence(p_live_session_id, p_device_id, false, true);
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

  insert into public.form_responses (
    form_id, live_session_id, anonymous_session_id, student_id, answers, student_display_name
  )
  values (fs.form_id, p_live_session_id, p_device_id, null, '{}'::jsonb, name)
  on conflict (live_session_id, anonymous_session_id)
    where live_session_id is not null and anonymous_session_id is not null
  do update set
    updated_at = now(),
    student_display_name = excluded.student_display_name;

  perform public.touch_live_session_presence(p_live_session_id, p_device_id, false, true);
end;
$$;

drop function if exists public.heartbeat_live_session_student(uuid, text, boolean, boolean);
drop function if exists public.heartbeat_live_session_student(uuid, text, boolean, boolean, text);

-- Heartbeat with optional pending-sync metadata for the teacher roster.
create or replace function public.heartbeat_live_session_student(
  p_live_session_id uuid,
  p_device_id text,
  p_is_typing boolean,
  p_interaction boolean,
  p_display_name text,
  p_pending_sync_count integer default 0,
  p_sync_state text default 'synced'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fs record;
begin
  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select opens_at, closes_at, delivery_mode into fs
  from public.form_sessions
  where id = p_live_session_id
  limit 1;
  if not found then
    raise exception 'session not found';
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    if fs.delivery_mode not in ('self_paced', 'hybrid') then
      raise exception 'session is not open';
    end if;
  end if;

  perform public.touch_live_session_presence(
    p_live_session_id, p_device_id, p_is_typing, p_interaction
  );

  update public.live_session_presence
  set
    pending_sync_count = greatest(0, coalesce(p_pending_sync_count, 0)),
    sync_state = case
      when p_sync_state = 'offline' then 'offline'
      when coalesce(p_pending_sync_count, 0) > 0 then 'pending'
      when p_sync_state in ('offline', 'pending', 'synced') then p_sync_state
      else 'synced'
    end
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id);
end;
$$;

drop function if exists public.finish_live_session_student_response(uuid, text);

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
  chosen text;
  earned int;
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
    select id, points, correct_answer
    from public.questions
    where form_id = fid
      and question_type = 'multipleChoice'
  loop
    chosen := ans ->> q.id::text;
    if q.correct_answer is not null and chosen is not null and chosen = q.correct_answer then
      earned := q.points;
    else
      earned := 0;
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
  needs_manual_grading boolean := false;
  did_finish boolean := false;
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

  select exists (
    select 1
    from public.questions q
    where q.form_id = fid
      and (
        q.question_type <> 'multipleChoice'
        or q.correct_answer is null
      )
  ) into needs_manual_grading;

  select fr.suspended_at, fr.finished_at into susp, fin
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if susp is not null then
    raise exception 'cannot submit while suspended';
  end if;

  if fin is not null then
    return;
  end if;

  insert into public.form_responses (
    form_id, live_session_id, anonymous_session_id, student_id, answers, finished_at, student_display_name
  )
  values (fs.form_id, p_live_session_id, lower(p_device_id), null, '{}'::jsonb, timezone('utc', now()), name)
  on conflict (live_session_id, anonymous_session_id)
    where live_session_id is not null and anonymous_session_id is not null
  do update set
    finished_at = timezone('utc', now()),
    updated_at = now(),
    student_display_name = excluded.student_display_name
  where form_responses.suspended_at is null
    and form_responses.finished_at is null;

  get diagnostics did_finish = row_count;
  if not did_finish then
    return;
  end if;

  perform public.autograde_mc_for_response(p_live_session_id, p_device_id);

  if not needs_manual_grading then
    begin
      perform public.internal_mark_response_graded(p_live_session_id, p_device_id);
    exception
      when others then
        null;
    end;
  end if;

  perform public.touch_live_session_presence(p_live_session_id, p_device_id, false, true);
end;
$$;

-- Slim student poll (~3s): ended / suspend / resume + window. No answers/feedback.
create or replace function public.set_student_hand_raise(
  p_live_session_id uuid,
  p_device_id text,
  p_question_id uuid,
  p_raised boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fs record;
  fid uuid;
begin
  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select sess.id, sess.form_id, sess.opens_at, sess.closes_at, sess.delivery_mode
  into fs
  from public.form_sessions sess
  where sess.id = p_live_session_id
  limit 1;

  if not found then
    raise exception 'session not found';
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    if fs.delivery_mode not in ('self_paced', 'hybrid') then
      raise exception 'session is not open';
    end if;
  end if;

  fid := fs.form_id;

  if p_raised then
    if p_question_id is null then
      raise exception 'question id required';
    end if;
    if not exists (
      select 1
      from public.questions q
      where q.id = p_question_id
        and q.form_id = fid
    ) then
      raise exception 'question not found';
    end if;
  end if;

  perform public.touch_live_session_presence(p_live_session_id, p_device_id, false, true);

  update public.live_session_presence
  set
    hand_raised_at = case when p_raised then timezone('utc', now()) else null end,
    hand_raise_question_id = case when p_raised then p_question_id else null end
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id);
end;
$$;

create or replace function public.clear_student_hand_raise(
  p_live_session_id uuid,
  p_device_id text,
  p_question_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  update public.live_session_presence
  set
    hand_raised_at = null,
    hand_raise_question_id = null
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id)
    and hand_raised_at is not null
    and (
      p_question_id is null
      or hand_raise_question_id = p_question_id
    );
end;
$$;

create or replace function public.get_live_session_student_state(
  p_live_session_id uuid,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fs record;
  r record;
  pres record;
begin
  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select opens_at, closes_at into fs
  from public.form_sessions
  where id = p_live_session_id
  limit 1;
  if not found then
    raise exception 'session not found';
  end if;

  select fr.suspended_at, fr.finished_at into r
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and fr.anonymous_session_id = p_device_id
    and fr.student_id is null;

  select p.hand_raised_at, p.hand_raise_question_id into pres
  from public.live_session_presence p
  where p.live_session_id = p_live_session_id
    and lower(p.anonymous_session_id) = lower(p_device_id);

  return jsonb_build_object(
    'opensAt', fs.opens_at,
    'closesAt', fs.closes_at,
    'suspended', coalesce(r.suspended_at is not null, false),
    'finished', coalesce(r.finished_at is not null, false),
    'handRaiseQuestionId', pres.hand_raise_question_id,
    'handRaisedAt', pres.hand_raised_at
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
  question_found uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  select sess.form_id
  into fid
  from public.form_sessions sess
  join public.forms f on f.id = sess.form_id
  where sess.id = p_live_session_id
    and sess.created_by = uid
    and coalesce(f.live_teacher_feedback_enabled, false);

  if fid is null then
    raise exception 'not allowed';
  end if;

  select q.id
  into question_found
  from public.questions q
  where q.id = p_question_id
    and q.form_id = fid;

  if question_found is null then
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

create or replace function public.generate_student_review_token()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  result text := '';
  i integer;
  tries integer := 0;
  ch integer;
begin
  loop
    result := '';
    for i in 1..12 loop
      ch := 1 + floor(random() * length(alphabet))::integer;
      result := result || substr(alphabet, ch, 1);
    end loop;
    exit when not exists (
      select 1 from public.form_responses fr where fr.student_review_token = result
    );
    tries := tries + 1;
    if tries > 100 then
      raise exception 'could not allocate student review token';
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public.ensure_student_review_token(
  p_live_session_id uuid,
  p_device_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  code text;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  if not exists (
    select 1
    from public.form_sessions fs
    where fs.id = p_live_session_id
      and fs.created_by = uid
  ) then
    raise exception 'not allowed';
  end if;

  select fr.student_review_token into code
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if not found then
    raise exception 'student response not found';
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

create or replace function public.get_student_review_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tok text := upper(trim(coalesce(p_token, '')));
  fid uuid;
  payload jsonb;
  qjson jsonb;
begin
  if length(tok) < 8 then
    return null;
  end if;

  select fs.form_id
  into fid
  from public.form_responses fr
  inner join public.form_sessions fs on fs.id = fr.live_session_id
  where fr.student_review_token = tok
    and fr.student_id is null
  limit 1;

  if fid is null then
    return null;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prompt', q.prompt,
      'type', q.question_type,
      'options', coalesce(q.options, '[]'::jsonb),
      'points', q.points,
      'displayOrder', q.display_order
    )
    order by q.display_order
  )
  into qjson
  from public.questions q
  where q.form_id = fid;

  select jsonb_build_object(
    'formTitle', coalesce(f.title, 'Form'),
    'formDescription', coalesce(f.description, ''),
    'displayName', coalesce(nullif(trim(fr.student_display_name), ''), ''),
    'finished', fr.finished_at is not null,
    'sessionOpen',
      timezone('utc', now()) >= fs.opens_at
      and timezone('utc', now()) <= fs.closes_at,
    'questions', coalesce(qjson, '[]'::jsonb),
    'answers', coalesce(fr.answers, '{}'::jsonb),
    'liveTeacherFeedback', coalesce(fr.live_teacher_feedback, '{}'::jsonb)
  )
  into payload
  from public.form_responses fr
  inner join public.form_sessions fs on fs.id = fr.live_session_id
  inner join public.forms f on f.id = fs.form_id
  where fr.student_review_token = tok
    and fr.student_id is null;

  return payload;
end;
$$;

create or replace function public.get_student_live_teacher_feedback(
  p_live_session_id uuid,
  p_device_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  enabled boolean := false;
  feedback jsonb := '{}'::jsonb;
begin
  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('enabled', false, 'feedback', '{}'::jsonb);
  end if;

  select
    coalesce(f.live_teacher_feedback_enabled, false),
    coalesce(fr.live_teacher_feedback, '{}'::jsonb)
  into enabled, feedback
  from public.form_responses fr
  inner join public.form_sessions fs on fs.id = fr.live_session_id
  inner join public.forms f on f.id = fs.form_id
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  if not found then
    return jsonb_build_object('enabled', false, 'feedback', '{}'::jsonb);
  end if;

  return jsonb_build_object(
    'enabled', enabled,
    'feedback', feedback
  );
end;
$$;

create or replace function public.teacher_clear_live_session_student_suspension(
  p_live_session_id uuid,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
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
    and lower(anonymous_session_id) = lower(p_device_id)
    and student_id is null;

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'student response not found';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.teacher_delete_live_session_student(
  p_live_session_id uuid,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  if not exists (
    select 1 from public.form_sessions fs
    where fs.id = p_live_session_id
      and fs.created_by = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  delete from public.form_responses
  where live_session_id = p_live_session_id
    and lower(anonymous_session_id) = lower(p_device_id)
    and student_id is null;

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'student response not found';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.teacher_delete_live_session(p_live_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  now_ts timestamptz := timezone('utc', now());
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.form_sessions fs
    where fs.id = p_live_session_id
      and fs.created_by = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  if exists (
    select 1 from public.form_sessions fs
    where fs.id = p_live_session_id
      and fs.opens_at <= now_ts
      and fs.closes_at >= now_ts
  ) then
    raise exception 'session still running';
  end if;

  delete from public.form_sessions
  where id = p_live_session_id
    and created_by = auth.uid();

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'session not found';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.finalize_all_live_session_students(p_live_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
  now_ts timestamptz := timezone('utc', now());
  r record;
  fid uuid;
  needs_manual_grading boolean := false;
begin
  if p_live_session_id is null then
    raise exception 'live session id required';
  end if;

  if not exists (
    select 1
    from public.form_sessions
    where id = p_live_session_id
      and closes_at is not null
      and closes_at <= now_ts
  ) then
    raise exception 'session not closed';
  end if;

  select fs.form_id into fid
  from public.form_sessions fs
  where fs.id = p_live_session_id;

  if fid is not null then
    select exists (
      select 1
      from public.questions q
      where q.form_id = fid
        and (
          q.question_type <> 'multipleChoice'
          or q.correct_answer is null
        )
    ) into needs_manual_grading;
  end if;

  for r in
    update public.form_responses
    set
      finished_at = now_ts,
      suspended_at = null,
      last_activity_at = now_ts,
      updated_at = now()
    where live_session_id = p_live_session_id
      and student_id is null
      and finished_at is null
    returning lower(anonymous_session_id) as device_id
  loop
    n := n + 1;
    perform public.autograde_mc_for_response(p_live_session_id, r.device_id);
    if not needs_manual_grading then
      begin
        perform public.internal_mark_response_graded(p_live_session_id, r.device_id);
      exception
        when others then
          null;
      end;
    end if;
  end loop;

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
revoke all on function public.get_live_session_student_state(uuid, text) from public;
revoke all on function public.touch_live_session_presence(uuid, text, boolean, boolean) from public;
revoke all on function public.save_live_session_student_response(uuid, text, jsonb, text, uuid) from public;
revoke all on function public.suspend_live_session_student_tab_leave(uuid, text, text) from public;
revoke all on function public.register_live_session_student_presence(uuid, text, text) from public;
revoke all on function public.heartbeat_live_session_student(uuid, text, boolean, boolean, text, integer, text) from public;
revoke all on function public.finish_live_session_student_response(uuid, text, text) from public;
revoke all on function public.set_live_teacher_feedback(uuid, text, uuid, text) from public;
revoke all on function public.ensure_student_resume_code(uuid, text) from public;
revoke all on function public.teacher_ensure_student_resume_code(uuid, text) from public;
revoke all on function public.lookup_student_resume_code(text) from public;
revoke all on function public.get_student_live_teacher_feedback(uuid, text) from public;
revoke all on function public.ensure_student_review_token(uuid, text) from public;
revoke all on function public.get_student_review_by_token(text) from public;
revoke all on function public.teacher_clear_live_session_student_suspension(uuid, text) from public;
revoke all on function public.teacher_delete_live_session_student(uuid, text) from public;
revoke all on function public.teacher_delete_live_session(uuid) from public;
revoke all on function public.set_student_hand_raise(uuid, text, uuid, boolean) from public;
revoke all on function public.clear_student_hand_raise(uuid, text, uuid) from public;

grant execute on function public.lookup_join_code(text) to anon, authenticated, service_role;
grant execute on function public.ensure_student_resume_code(uuid, text) to service_role;
grant execute on function public.teacher_ensure_student_resume_code(uuid, text) to authenticated, service_role;
grant execute on function public.lookup_student_resume_code(text) to anon, authenticated, service_role;
grant execute on function public.get_student_live_teacher_feedback(uuid, text) to anon, authenticated, service_role;
grant execute on function public.ensure_student_review_token(uuid, text) to authenticated, service_role;
grant execute on function public.get_student_review_by_token(text) to anon, authenticated, service_role;
grant execute on function public.get_live_session_public_board(text) to anon, authenticated, service_role;
grant execute on function public.get_live_session_student_response(uuid, text) to anon, authenticated, service_role;
grant execute on function public.get_live_session_student_state(uuid, text) to anon, authenticated, service_role;
grant execute on function public.touch_live_session_presence(uuid, text, boolean, boolean) to service_role;
grant execute on function public.save_live_session_student_response(uuid, text, jsonb, text, uuid) to anon, authenticated, service_role;
grant execute on function public.suspend_live_session_student_tab_leave(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.register_live_session_student_presence(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.heartbeat_live_session_student(uuid, text, boolean, boolean, text, integer, text) to anon, authenticated, service_role;
grant execute on function public.finish_live_session_student_response(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.set_live_teacher_feedback(uuid, text, uuid, text) to authenticated, service_role;
grant execute on function public.teacher_clear_live_session_student_suspension(uuid, text) to authenticated, service_role;
grant execute on function public.teacher_delete_live_session_student(uuid, text) to authenticated, service_role;
grant execute on function public.teacher_delete_live_session(uuid) to authenticated, service_role;
grant execute on function public.set_student_hand_raise(uuid, text, uuid, boolean) to anon, service_role;
grant execute on function public.clear_student_hand_raise(uuid, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Realtime
--
-- form_responses is intentionally NOT in the realtime publication and uses the
-- default (PK) replica identity: at scale students/teachers poll instead of
-- holding WebSockets (Pro caps Realtime at 10k connections). See migration
-- 20260530090000_scale_polling_presence.sql.
-- ---------------------------------------------------------------------------
alter table public.form_sessions replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'form_sessions'
     ) then
    execute 'alter publication supabase_realtime add table public.form_sessions';
  end if;
end;
$$;
