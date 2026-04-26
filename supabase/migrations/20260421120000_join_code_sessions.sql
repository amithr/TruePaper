-- Timed teacher sessions with a 6-character join code; student responses scoped to live_session_id.

begin;

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

alter table public.form_responses
  add column if not exists live_session_id uuid references public.form_sessions (id) on delete cascade;

delete from public.form_responses
where student_id is null;

alter table public.form_responses
  drop constraint if exists form_responses_responder_chk;

alter table public.form_responses
  add constraint form_responses_responder_chk check (
    (student_id is not null and anonymous_session_id is null and live_session_id is null)
    or (
      student_id is null
      and anonymous_session_id is not null
      and live_session_id is not null
    )
  );

drop index if exists form_responses_form_anon_uidx;

create unique index if not exists form_responses_live_device_uidx
  on public.form_responses (live_session_id, anonymous_session_id)
  where live_session_id is not null and anonymous_session_id is not null;

alter table public.form_sessions enable row level security;

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

drop policy if exists "form_sessions_delete_teacher" on public.form_sessions;
create policy "form_sessions_delete_teacher"
  on public.form_sessions for delete
  to authenticated
  using (created_by = auth.uid());

-- Replace anonymous form RPCs with join-code + live session scoped RPCs
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
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
  fs record;
begin
  if p_device_id is null
     or p_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return '{}'::jsonb;
  end if;

  select * into fs from public.form_sessions where id = p_live_session_id limit 1;
  if not found then
    return '{}'::jsonb;
  end if;

  if timezone('utc', now()) < fs.opens_at or timezone('utc', now()) > fs.closes_at then
    return '{}'::jsonb;
  end if;

  select fr.answers into result
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and fr.anonymous_session_id = p_device_id
    and fr.student_id is null;

  return coalesce(result, '{}'::jsonb);
end;
$$;

create or replace function public.save_live_session_student_response(
  p_live_session_id uuid,
  p_device_id text,
  p_answers jsonb
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

  update public.form_responses
  set answers = p_answers, updated_at = now()
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
    answers
  )
  values (fid, p_live_session_id, p_device_id, null, p_answers);
end;
$$;

revoke all on function public.lookup_join_code(text) from public;
revoke all on function public.get_live_session_student_response(uuid, text) from public;
revoke all on function public.save_live_session_student_response(uuid, text, jsonb) from public;

grant execute on function public.lookup_join_code(text) to anon, authenticated, service_role;
grant execute on function public.get_live_session_student_response(uuid, text) to anon, authenticated, service_role;
grant execute on function public.save_live_session_student_response(uuid, text, jsonb) to anon, authenticated, service_role;

commit;
