-- Queued teacher feedback (FeedbackItem): offline-authored text comments that
-- upload in the background and are delivered to the student when both sides are
-- online. Distinct from the legacy single-value `live_teacher_feedback` jsonb:
-- FeedbackItems are append-style, per-author, creation-timestamped, and
-- delivery-tracked so a teacher never loses work they believe they've delivered.
--
-- created_at is CLIENT-supplied and authoritative for ordering/display (the
-- student must never see feedback "from the future"). synced_at / delivered_at
-- are server-side bookkeeping only and are never shown as "when this was written".
-- Voice memos are intentionally out of scope for this migration (audio_* columns
-- are reserved so the queue can add a low-priority blob path later without churn).

begin;

create table if not exists public.feedback_items (
  id uuid primary key,
  live_session_id uuid not null references public.form_sessions (id) on delete cascade,
  response_id uuid references public.form_responses (id) on delete set null,
  student_device_id text not null,
  question_id uuid references public.questions (id) on delete cascade,
  anchor jsonb,
  author_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null default '',
  type text not null default 'text' check (type in ('text', 'voice')),
  body text,
  audio_path text,
  audio_duration_ms integer,
  response_version_tag text,
  created_at timestamptz not null,
  synced_at timestamptz not null default now(),
  delivered_at timestamptz,
  retracted_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists feedback_items_session_device_idx
  on public.feedback_items (live_session_id, student_device_id);
create index if not exists feedback_items_author_idx
  on public.feedback_items (author_id);
create index if not exists feedback_items_created_idx
  on public.feedback_items (created_at);

-- Only SECURITY DEFINER RPCs touch this table (mirrors answer_sync_submissions).
alter table public.feedback_items enable row level security;

-- Teacher upsert: idempotent on id (re-uploads of the same queued item collapse
-- onto one row, so we never sync an original then a correction as two items).
-- created_at is preserved from the first insert; later edits keep original order.
create or replace function public.upsert_feedback_item(
  p_id uuid,
  p_live_session_id uuid,
  p_device_id text,
  p_question_id uuid,
  p_type text,
  p_body text,
  p_created_at timestamptz,
  p_response_version_tag text default null,
  p_anchor jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  fid uuid;
  rid uuid;
  aname text;
  trimmed text;
  ftype text;
  result jsonb;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_id is null then
    raise exception 'feedback id required';
  end if;

  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  ftype := coalesce(nullif(trim(p_type), ''), 'text');
  if ftype <> 'text' then
    -- Voice memos are not implemented yet (deferred). Reject early and clearly.
    raise exception 'unsupported feedback type';
  end if;

  -- Session must be owned by the calling teacher and have feedback enabled.
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

  if p_question_id is not null then
    if not exists (
      select 1 from public.questions q
      where q.id = p_question_id and q.form_id = fid
    ) then
      raise exception 'question not found';
    end if;
  end if;

  select fr.id
  into rid
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  trimmed := left(trim(coalesce(p_body, '')), 4000);
  if trimmed = '' then
    raise exception 'feedback body required';
  end if;

  select coalesce(nullif(trim(p.display_name), ''), 'Teacher')
  into aname
  from public.profiles p
  where p.id = uid;
  aname := coalesce(aname, 'Teacher');

  insert into public.feedback_items (
    id, live_session_id, response_id, student_device_id, question_id, anchor,
    author_id, author_name, type, body, response_version_tag, created_at
  )
  values (
    p_id, p_live_session_id, rid, lower(p_device_id), p_question_id, p_anchor,
    uid, aname, ftype, trimmed, p_response_version_tag, coalesce(p_created_at, now())
  )
  on conflict (id) do update set
    body = excluded.body,
    question_id = coalesce(excluded.question_id, public.feedback_items.question_id),
    anchor = coalesce(excluded.anchor, public.feedback_items.anchor),
    -- Preserve the original version anchor on later edits (edits don't re-capture it).
    response_version_tag = coalesce(excluded.response_version_tag, public.feedback_items.response_version_tag),
    response_id = coalesce(public.feedback_items.response_id, excluded.response_id),
    retracted_at = null,
    updated_at = now()
  where public.feedback_items.author_id = uid;

  -- If the conflict row belonged to a different author, the update is a no-op:
  -- never let one teacher overwrite another's comment (co-teaching safety).
  if not exists (
    select 1 from public.feedback_items where id = p_id and author_id = uid
  ) then
    raise exception 'not allowed';
  end if;

  select to_jsonb(fi) - 'student_device_id'
  into result
  from public.feedback_items fi
  where fi.id = p_id;

  return result;
end;
$$;

-- Teacher delete of an already-synced item (queued-but-unsynced items are removed
-- locally and never reach the server). Soft-retract so the student's copy is
-- withdrawn on their next read.
create or replace function public.retract_feedback_item(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  affected int;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;

  update public.feedback_items
  set retracted_at = now(), updated_at = now()
  where id = p_id and author_id = uid;
  get diagnostics affected = row_count;

  return jsonb_build_object('ok', affected > 0);
end;
$$;

-- Teacher read for the watch page: all live (non-retracted) items for one
-- student response, ordered by authoritative created_at. Surfaces delivery
-- status and co-teachers' comments.
create or replace function public.get_session_feedback_items(
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
  uid uuid;
  items jsonb;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.form_sessions fs
    where fs.id = p_live_session_id and fs.created_by = uid
  ) then
    raise exception 'not allowed';
  end if;

  select coalesce(jsonb_agg(item_json order by item_created_at asc), '[]'::jsonb)
  into items
  from (
    select jsonb_build_object(
      'id', fi.id,
      'questionId', fi.question_id,
      'authorId', fi.author_id,
      'authorName', fi.author_name,
      'type', fi.type,
      'body', fi.body,
      'createdAt', fi.created_at,
      'syncedAt', fi.synced_at,
      'deliveredAt', fi.delivered_at,
      'isOwn', fi.author_id = uid
    ) as item_json, fi.created_at as item_created_at
    from public.feedback_items fi
    where fi.live_session_id = p_live_session_id
      and lower(fi.student_device_id) = lower(p_device_id)
      and fi.retracted_at is null
  ) ordered;

  return items;
end;
$$;

-- Student read (anon): live feedback for this device, ordered by authoritative
-- created_at, with a calm "response changed since" flag when the response was
-- modified after the comment was written (anchored to the captured version).
create or replace function public.get_student_feedback_items(
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
  current_updated timestamptz;
  items jsonb;
begin
  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('enabled', false, 'items', '[]'::jsonb);
  end if;

  select
    coalesce(f.live_teacher_feedback_enabled, false),
    fr.updated_at
  into enabled, current_updated
  from public.form_responses fr
  join public.form_sessions fs on fs.id = fr.live_session_id
  join public.forms f on f.id = fs.form_id
  where fr.live_session_id = p_live_session_id
    and lower(fr.anonymous_session_id) = lower(p_device_id)
    and fr.student_id is null;

  select coalesce(jsonb_agg(item_json order by item_created_at asc), '[]'::jsonb)
  into items
  from (
    select jsonb_build_object(
      'id', fi.id,
      'questionId', fi.question_id,
      'authorName', fi.author_name,
      'type', fi.type,
      'body', fi.body,
      'createdAt', fi.created_at,
      -- Anchored to the version the comment was written against: flag when the
      -- response was modified after the captured updated_at (compared as
      -- timestamptz so client ISO formatting differences don't false-positive).
      'versionChanged',
        case
          when fi.response_version_tag is null or current_updated is null then false
          else fi.response_version_tag::timestamptz is distinct from current_updated
        end
    ) as item_json, fi.created_at as item_created_at
    from public.feedback_items fi
    where fi.live_session_id = p_live_session_id
      and lower(fi.student_device_id) = lower(p_device_id)
      and fi.retracted_at is null
      and fi.type = 'text'
  ) ordered;

  return jsonb_build_object('enabled', enabled, 'items', coalesce(items, '[]'::jsonb));
end;
$$;

-- Student delivery confirmation (anon): marks the listed items delivered so the
-- teacher can see their feedback landed. Idempotent; only fills null delivered_at.
create or replace function public.confirm_feedback_items_delivered(
  p_live_session_id uuid,
  p_device_id text,
  p_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  affected int;
begin
  if p_device_id is null
     or lower(p_device_id) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid device id';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return jsonb_build_object('ok', true, 'delivered', 0);
  end if;

  update public.feedback_items
  set delivered_at = now(), updated_at = now()
  where id = any(p_ids)
    and live_session_id = p_live_session_id
    and lower(student_device_id) = lower(p_device_id)
    and delivered_at is null;
  get diagnostics affected = row_count;

  return jsonb_build_object('ok', true, 'delivered', affected);
end;
$$;

revoke all on function public.upsert_feedback_item(uuid, uuid, text, uuid, text, text, timestamptz, text, jsonb) from public;
grant execute on function public.upsert_feedback_item(uuid, uuid, text, uuid, text, text, timestamptz, text, jsonb) to authenticated, service_role;

revoke all on function public.retract_feedback_item(uuid) from public;
grant execute on function public.retract_feedback_item(uuid) to authenticated, service_role;

revoke all on function public.get_session_feedback_items(uuid, text) from public;
grant execute on function public.get_session_feedback_items(uuid, text) to authenticated, service_role;

revoke all on function public.get_student_feedback_items(uuid, text) from public;
grant execute on function public.get_student_feedback_items(uuid, text) to anon, authenticated, service_role;

revoke all on function public.confirm_feedback_items_delivered(uuid, text, uuid[]) from public;
grant execute on function public.confirm_feedback_items_delivered(uuid, text, uuid[]) to anon, authenticated, service_role;

commit;
