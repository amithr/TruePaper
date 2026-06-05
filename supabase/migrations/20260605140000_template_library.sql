-- Template / question-bank library with sharing scopes, versions, and deep clone.

begin;

-- ── Organizations (schools) & departments ──────────────────────────────────

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.profiles
  add column if not exists organization_id uuid references public.organizations (id) on delete set null,
  add column if not exists department_id uuid references public.departments (id) on delete set null,
  add column if not exists org_role text not null default 'member'
    check (org_role in ('member', 'department_head', 'admin'));

create index if not exists profiles_organization_id_idx on public.profiles (organization_id);
create index if not exists profiles_department_id_idx on public.profiles (department_id);

-- ── Library templates ────────────────────────────────────────────────────────

create table if not exists public.library_templates (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text not null default '',
  source_kind text not null check (source_kind in ('question', 'form', 'session')),
  scope text not null default 'private'
    check (scope in ('private', 'department', 'school', 'public')),
  organization_id uuid references public.organizations (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  language text not null default 'en' check (language in ('en', 'uk')),
  subject text not null default '',
  grade_level text not null default '',
  curriculum_tags text[] not null default '{}',
  nmt_dpa_relevant boolean not null default false,
  interaction_types text[] not null default '{}',
  current_version_number integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_templates_scope_org_chk check (
    (scope in ('private', 'public') and organization_id is null and department_id is null)
    or (scope = 'school' and organization_id is not null and department_id is null)
    or (scope = 'department' and organization_id is not null and department_id is not null)
  )
);

create index if not exists library_templates_author_id_idx on public.library_templates (author_id);
create index if not exists library_templates_scope_idx on public.library_templates (scope);
create index if not exists library_templates_org_idx on public.library_templates (organization_id);
create index if not exists library_templates_dept_idx on public.library_templates (department_id);
create index if not exists library_templates_subject_idx on public.library_templates (subject);
create index if not exists library_templates_grade_idx on public.library_templates (grade_level);
create index if not exists library_templates_language_idx on public.library_templates (language);
create index if not exists library_templates_search_idx on public.library_templates
  using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(subject, '')));

create table if not exists public.library_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.library_templates (id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null,
  changelog text not null default '',
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (template_id, version_number)
);

create index if not exists library_template_versions_template_id_idx
  on public.library_template_versions (template_id);

create table if not exists public.library_template_clones (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.library_templates (id) on delete cascade,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  cloned_at_version_number integer not null,
  cloned_form_id uuid not null references public.forms (id) on delete cascade,
  cloned_at timestamptz not null default now(),
  unique (teacher_id, template_id, cloned_form_id)
);

create index if not exists library_template_clones_teacher_idx
  on public.library_template_clones (teacher_id);
create index if not exists library_template_clones_template_idx
  on public.library_template_clones (template_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.organizations enable row level security;
alter table public.departments enable row level security;
alter table public.library_templates enable row level security;
alter table public.library_template_versions enable row level security;
alter table public.library_template_clones enable row level security;

drop policy if exists "organizations_select_authenticated" on public.organizations;
create policy "organizations_select_authenticated"
  on public.organizations for select to authenticated using (true);

drop policy if exists "departments_select_authenticated" on public.departments;
create policy "departments_select_authenticated"
  on public.departments for select to authenticated using (true);

drop policy if exists "library_templates_select" on public.library_templates;
create policy "library_templates_select"
  on public.library_templates for select to authenticated
  using (
    author_id = auth.uid()
    or scope = 'public'
    or (
      scope = 'school'
      and organization_id is not null
      and organization_id = (
        select p.organization_id from public.profiles p where p.id = auth.uid()
      )
    )
    or (
      scope = 'department'
      and department_id is not null
      and department_id = (
        select p.department_id from public.profiles p where p.id = auth.uid()
      )
    )
  );

drop policy if exists "library_templates_insert_own" on public.library_templates;
create policy "library_templates_insert_own"
  on public.library_templates for insert to authenticated
  with check (author_id = auth.uid());

drop policy if exists "library_templates_update_own" on public.library_templates;
create policy "library_templates_update_own"
  on public.library_templates for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "library_templates_delete_own" on public.library_templates;
create policy "library_templates_delete_own"
  on public.library_templates for delete to authenticated
  using (author_id = auth.uid());

drop policy if exists "library_template_versions_select" on public.library_template_versions;
create policy "library_template_versions_select"
  on public.library_template_versions for select to authenticated
  using (
    exists (
      select 1 from public.library_templates t
      where t.id = template_id
        and (
          t.author_id = auth.uid()
          or t.scope = 'public'
          or (
            t.scope = 'school'
            and t.organization_id = (select p.organization_id from public.profiles p where p.id = auth.uid())
          )
          or (
            t.scope = 'department'
            and t.department_id = (select p.department_id from public.profiles p where p.id = auth.uid())
          )
        )
    )
  );

drop policy if exists "library_template_versions_insert_author" on public.library_template_versions;
create policy "library_template_versions_insert_author"
  on public.library_template_versions for insert to authenticated
  with check (
    exists (
      select 1 from public.library_templates t
      where t.id = template_id and t.author_id = auth.uid()
    )
  );

drop policy if exists "library_template_clones_select_own" on public.library_template_clones;
create policy "library_template_clones_select_own"
  on public.library_template_clones for select to authenticated
  using (teacher_id = auth.uid());

drop policy if exists "library_template_clones_insert_own" on public.library_template_clones;
create policy "library_template_clones_insert_own"
  on public.library_template_clones for insert to authenticated
  with check (teacher_id = auth.uid());

-- ── Deep clone template → new editable form ──────────────────────────────────

create or replace function public.clone_library_template(p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  tpl public.library_templates%rowtype;
  ver public.library_template_versions%rowtype;
  new_form_id uuid;
  q jsonb;
  qrec record;
  ord integer;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into tpl from public.library_templates where id = p_template_id;
  if not found then
    raise exception 'template not found';
  end if;

  if not (
    tpl.author_id = uid
    or tpl.scope = 'public'
    or (
      tpl.scope = 'school'
      and tpl.organization_id = (select p.organization_id from public.profiles p where p.id = uid)
    )
    or (
      tpl.scope = 'department'
      and tpl.department_id = (select p.department_id from public.profiles p where p.id = uid)
    )
  ) then
    raise exception 'not allowed';
  end if;

  select * into ver
  from public.library_template_versions
  where template_id = p_template_id
  order by version_number desc
  limit 1;

  if not found then
    raise exception 'template version not found';
  end if;

  insert into public.forms (title, description, created_by, live_teacher_feedback_enabled)
  values (
    coalesce(ver.snapshot->>'title', tpl.title),
    coalesce(ver.snapshot->>'description', tpl.description),
    uid,
    coalesce((ver.snapshot->>'liveTeacherFeedbackEnabled')::boolean, false)
  )
  returning id into new_form_id;

  ord := 0;
  for q in select * from jsonb_array_elements(
    case
      when ver.snapshot->'kind' = '"question"' then jsonb_build_array(ver.snapshot->'question')
      else coalesce(ver.snapshot->'questions', '[]'::jsonb)
    end
  )
  loop
    insert into public.questions (
      form_id,
      prompt,
      question_type,
      options,
      correct_answer,
      points,
      display_order,
      response_config
    )
    values (
      new_form_id,
      coalesce(q->>'prompt', ''),
      coalesce(q->>'type', 'extendedWritten'),
      coalesce(q->'options', '[]'::jsonb),
      case when coalesce(q->>'type', '') = 'multipleChoice' then q->>'correctAnswer' else null end,
      greatest(1, coalesce((q->>'points')::integer, 1)),
      coalesce((q->>'displayOrder')::integer, ord),
      coalesce(q->'responseConfig', '{}'::jsonb)
    );
    ord := ord + 1;
  end loop;

  insert into public.library_template_clones (
    template_id,
    teacher_id,
    cloned_at_version_number,
    cloned_form_id
  )
  values (
    p_template_id,
    uid,
    tpl.current_version_number,
    new_form_id
  );

  return jsonb_build_object(
    'formId', new_form_id,
    'templateId', p_template_id,
    'clonedAtVersion', tpl.current_version_number
  );
end;
$$;

revoke all on function public.clone_library_template(uuid) from public;
grant execute on function public.clone_library_template(uuid) to authenticated;

-- Demo school for department/school sharing (dev / onboarding).
insert into public.organizations (id, name, slug)
values ('11111111-1111-1111-1111-111111111111', 'Demo School', 'demo-school')
on conflict (slug) do nothing;

insert into public.departments (id, organization_id, name)
values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Mathematics'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Sciences'),
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'Languages')
on conflict (organization_id, name) do nothing;

commit;
