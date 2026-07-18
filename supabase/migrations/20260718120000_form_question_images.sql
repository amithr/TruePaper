-- Form description + question prompt images (Supabase Storage paths).
-- Bucket: form-assets (public read; teacher write under own userId prefix).

begin;

alter table public.forms
  add column if not exists description_image_path text;

alter table public.questions
  add column if not exists prompt_image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'form-assets',
  'form-assets',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "form_assets_public_read" on storage.objects;
create policy "form_assets_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'form-assets');

drop policy if exists "form_assets_teacher_insert" on storage.objects;
create policy "form_assets_teacher_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'form-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "form_assets_teacher_update" on storage.objects;
create policy "form_assets_teacher_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'form-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'form-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "form_assets_teacher_delete" on storage.objects;
create policy "form_assets_teacher_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'form-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Include image paths in join payload for students.
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
    'descriptionImagePath', f.description_image_path,
    'liveTeacherFeedbackEnabled', coalesce(f.live_teacher_feedback_enabled, false),
    'questions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'prompt', q.prompt,
            'promptImagePath', q.prompt_image_path,
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
    'descriptionImagePath', f.description_image_path,
    'liveTeacherFeedbackEnabled', coalesce(f.live_teacher_feedback_enabled, false),
    'questions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'prompt', q.prompt,
            'promptImagePath', q.prompt_image_path,
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
  grades jsonb;
  graded boolean := false;
  earned int := 0;
  possible int := 0;
begin
  if length(tok) <> 12 then
    return null;
  end if;
  if tok !~ '^[2-9A-HJ-NP-Z]+$' then
    return null;
  end if;

  select fs.form_id,
         coalesce(fr.text_grades, '{}'::jsonb),
         (fr.text_graded_at is not null)
  into fid, grades, graded
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
      'promptImagePath', q.prompt_image_path,
      'type', q.question_type,
      'options', coalesce(q.options, '[]'::jsonb),
      'points', q.points,
      'displayOrder', q.display_order,
      'earnedPoints',
        case
          when graded and grades ? q.id::text
            then (grades ->> q.id::text)::int
          else null
        end
    )
    order by q.display_order
  )
  into qjson
  from public.questions q
  where q.form_id = fid;

  if graded then
    select coalesce(sum((grades ->> q.id::text)::int), 0),
           coalesce(sum(q.points), 0)
    into earned, possible
    from public.questions q
    where q.form_id = fid
      and grades ? q.id::text;
  end if;

  select jsonb_build_object(
    'formTitle', coalesce(f.title, 'Form'),
    'formDescription', coalesce(f.description, ''),
    'descriptionImagePath', f.description_image_path,
    'displayName', coalesce(nullif(trim(fr.student_display_name), ''), ''),
    'finished', fr.finished_at is not null,
    'graded', graded,
    'pointsEarned', case when graded then earned else null end,
    'pointsPossible', case when graded then possible else null end,
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

commit;
