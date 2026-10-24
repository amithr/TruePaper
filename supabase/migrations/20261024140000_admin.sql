-- Admin area (/dashboard/admin): a global "charge for plans?" switch, a per-user
-- complimentary plan, and read access to every account. Admins are flagged on
-- profiles; cross-account reads go through SECURITY DEFINER functions that check
-- the flag, so RLS on the underlying tables stays owner-only.
--
-- The first admin is seeded by email below.

begin;

-- ---------------------------------------------------------------------------
-- 1) Flags + global settings
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

alter table public.profiles
  add column if not exists plan_override text
    check (plan_override is null or plan_override in ('free', 'classroom', 'department', 'school'));

create table if not exists public.app_settings (
  id integer primary key default 1 check (id = 1),
  -- false = nobody is charged; every account gets every feature (School-tier caps).
  billing_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_select_authenticated" on public.app_settings;
create policy "app_settings_select_authenticated"
  on public.app_settings for select
  to authenticated
  using (true);

update public.profiles
set is_admin = true
where id in (select u.id from auth.users u where lower(u.email) = 'amithravindar2493@gmail.com');

-- ---------------------------------------------------------------------------
-- 2) Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.admin_assert()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
end;
$$;

-- Mirrors lib/billing/plans.ts (students per live session; null = unlimited).
create or replace function public.plan_student_limit(p_plan text)
returns integer
language sql
immutable
as $$
  select case p_plan
    when 'free' then 10
    when 'classroom' then 35
    when 'department' then 150
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Join-time cap now honours the global switch and complimentary plans
-- ---------------------------------------------------------------------------
create or replace function public.live_session_student_capacity(
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
  fs record;
  b record;
  lim integer := 10;
  plan_id text := 'free';
  n integer := 0;
  already boolean := false;
  ov text;
  enabled boolean := true;
begin
  select id, created_by into fs from public.form_sessions where id = p_live_session_id limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select plan, status, student_limit, current_period_end into b
  from public.billing_subscriptions
  where user_id = fs.created_by;
  if found
     and b.status in ('active', 'trialing', 'past_due')
     and (b.current_period_end is null or b.current_period_end > now() - interval '3 days') then
    plan_id := b.plan;
    lim := b.student_limit;  -- null = unlimited
  end if;

  -- Complimentary plan set by an admin wins over Stripe.
  select p.plan_override into ov from public.profiles p where p.id = fs.created_by;
  if ov is not null then
    plan_id := ov;
    lim := public.plan_student_limit(ov);
  end if;

  -- Billing switched off: no caps for anyone.
  select s.billing_enabled into enabled from public.app_settings s where s.id = 1;
  if found and not enabled then
    plan_id := 'school';
    lim := null;
  end if;

  select count(*) into n
  from public.form_responses fr
  where fr.live_session_id = p_live_session_id
    and fr.student_id is null;

  if p_device_id is not null then
    already := exists (
      select 1 from public.form_responses fr
      where fr.live_session_id = p_live_session_id
        and fr.student_id is null
        and lower(fr.anonymous_session_id) = lower(p_device_id)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'plan', plan_id,
    'limit', lim,
    'count', n,
    'allowed', already or lim is null or n < lim
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Admin RPCs
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  enabled boolean := true;
begin
  perform public.admin_assert();
  select s.billing_enabled into enabled from public.app_settings s where s.id = 1;
  return jsonb_build_object(
    'billingEnabled', coalesce(enabled, true),
    'users', (select count(*) from public.profiles),
    'teachers', (select count(*) from public.profiles where role = 'teacher'),
    'admins', (select count(*) from public.profiles where is_admin),
    'paid', (select count(*) from public.billing_subscriptions where plan <> 'free' and status in ('active', 'trialing', 'past_due')),
    'forms', (select count(*) from public.forms),
    'sessions', (select count(*) from public.form_sessions),
    'sessionsLast7Days', (select count(*) from public.form_sessions where created_at > now() - interval '7 days'),
    'submissions', (select count(*) from public.form_responses where student_id is null and finished_at is not null)
  );
end;
$$;

create or replace function public.admin_set_billing_enabled(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_assert();
  insert into public.app_settings (id, billing_enabled, updated_at)
  values (1, coalesce(p_enabled, true), now())
  on conflict (id) do update set billing_enabled = excluded.billing_enabled, updated_at = now();
  return jsonb_build_object('ok', true, 'billingEnabled', coalesce(p_enabled, true));
end;
$$;

create or replace function public.admin_list_users(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  term text;
  total integer := 0;
  lim integer;
  off integer;
  rows jsonb;
begin
  perform public.admin_assert();
  term := nullif(lower(trim(coalesce(p_query, ''))), '');
  lim := least(greatest(coalesce(p_limit, 50), 1), 200);
  off := greatest(coalesce(p_offset, 0), 0);

  select count(*) into total
  from public.profiles p
  join auth.users u on u.id = p.id
  where term is null
     or lower(coalesce(u.email, '')) like '%' || term || '%'
     or lower(coalesce(p.display_name, '')) like '%' || term || '%';

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into rows
  from (
    select
      p.id,
      u.email,
      p.display_name as "displayName",
      p.avatar_url as "avatarUrl",
      p.role,
      p.is_admin as "isAdmin",
      p.plan_override as "planOverride",
      p.created_at as "createdAt",
      u.last_sign_in_at as "lastSignInAt",
      b.plan as "billingPlan",
      b.status as "billingStatus",
      (select count(*) from public.forms f where f.created_by = p.id) as "formsCount",
      (select count(*) from public.form_sessions s where s.created_by = p.id) as "sessionsCount",
      (select max(s.created_at) from public.form_sessions s where s.created_by = p.id) as "lastSessionAt"
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.billing_subscriptions b on b.user_id = p.id
    where term is null
       or lower(coalesce(u.email, '')) like '%' || term || '%'
       or lower(coalesce(p.display_name, '')) like '%' || term || '%'
    order by p.created_at desc
    limit lim offset off
  ) x;

  return jsonb_build_object('total', total, 'users', rows);
end;
$$;

create or replace function public.admin_get_user(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  prof jsonb;
  bill jsonb;
  forms_json jsonb;
  sessions_json jsonb;
begin
  perform public.admin_assert();

  select to_jsonb(x) into prof
  from (
    select
      p.id,
      u.email,
      p.display_name as "displayName",
      p.avatar_url as "avatarUrl",
      p.role,
      p.is_admin as "isAdmin",
      p.plan_override as "planOverride",
      p.created_at as "createdAt",
      u.last_sign_in_at as "lastSignInAt",
      p.onboarding_tour_completed_at as "onboardingTourCompletedAt"
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = p_user_id
  ) x;
  if prof is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select to_jsonb(x) into bill
  from (
    select
      b.plan,
      b.status,
      b.student_limit as "studentLimit",
      b.stripe_customer_id as "stripeCustomerId",
      b.stripe_subscription_id as "stripeSubscriptionId",
      b.current_period_end as "currentPeriodEnd",
      b.cancel_at_period_end as "cancelAtPeriodEnd",
      b.updated_at as "updatedAt"
    from public.billing_subscriptions b
    where b.user_id = p_user_id
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into forms_json
  from (
    select
      f.id,
      f.title,
      f.created_at as "createdAt",
      (select count(*) from public.questions q where q.form_id = f.id) as "questionCount",
      (select count(*) from public.form_sessions s where s.form_id = f.id) as "sessionsCount"
    from public.forms f
    where f.created_by = p_user_id
    order by f.created_at desc
    limit 100
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into sessions_json
  from (
    select
      s.id,
      s.join_code as "joinCode",
      s.opens_at as "opensAt",
      s.closes_at as "closesAt",
      s.created_at as "createdAt",
      f.title as "formTitle",
      (select count(*) from public.form_responses r where r.live_session_id = s.id and r.student_id is null) as "participants",
      (select count(*) from public.form_responses r where r.live_session_id = s.id and r.student_id is null and r.finished_at is not null) as "submitted"
    from public.form_sessions s
    left join public.forms f on f.id = s.form_id
    where s.created_by = p_user_id
    order by s.created_at desc
    limit 30
  ) x;

  return jsonb_build_object(
    'ok', true,
    'profile', prof,
    'billing', bill,
    'forms', forms_json,
    'sessions', sessions_json
  );
end;
$$;

create or replace function public.admin_set_plan_override(p_user_id uuid, p_plan text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_assert();
  if p_plan is not null and p_plan not in ('free', 'classroom', 'department', 'school') then
    raise exception 'unknown plan';
  end if;
  update public.profiles set plan_override = p_plan where id = p_user_id;
  if not found then
    raise exception 'user not found';
  end if;
  return jsonb_build_object('ok', true, 'planOverride', p_plan);
end;
$$;

create or replace function public.admin_set_admin(p_user_id uuid, p_is_admin boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_assert();
  if p_user_id = auth.uid() then
    raise exception 'cannot change your own admin flag';
  end if;
  update public.profiles set is_admin = coalesce(p_is_admin, false) where id = p_user_id;
  if not found then
    raise exception 'user not found';
  end if;
  return jsonb_build_object('ok', true, 'isAdmin', coalesce(p_is_admin, false));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Grants
-- ---------------------------------------------------------------------------
revoke all on function public.is_admin() from public;
revoke all on function public.admin_assert() from public;
revoke all on function public.plan_student_limit(text) from public;
revoke all on function public.live_session_student_capacity(uuid, text) from public;
revoke all on function public.admin_get_overview() from public;
revoke all on function public.admin_set_billing_enabled(boolean) from public;
revoke all on function public.admin_list_users(text, integer, integer) from public;
revoke all on function public.admin_get_user(uuid) from public;
revoke all on function public.admin_set_plan_override(uuid, text) from public;
revoke all on function public.admin_set_admin(uuid, boolean) from public;

grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.admin_assert() to authenticated, service_role;
grant execute on function public.plan_student_limit(text) to anon, authenticated, service_role;
grant execute on function public.live_session_student_capacity(uuid, text) to anon, authenticated, service_role;
grant execute on function public.admin_get_overview() to authenticated, service_role;
grant execute on function public.admin_set_billing_enabled(boolean) to authenticated, service_role;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated, service_role;
grant execute on function public.admin_get_user(uuid) to authenticated, service_role;
grant execute on function public.admin_set_plan_override(uuid, text) to authenticated, service_role;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated, service_role;

commit;
