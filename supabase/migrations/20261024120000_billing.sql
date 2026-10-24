-- Billing: Stripe subscriptions with student-count tiers (Free ≤ 10 students per
-- live session). One row per teacher mirrors the Stripe subscription; the
-- student cap is stored on the row (computed by the server from the plan) so the
-- join-time check below needs no plan table in SQL.
--
-- Writers: the teacher's own routes (RLS own-row) and the Stripe webhook (service
-- role). Readers: the teacher (own row) and the anon join flow through the RPC.

begin;

create table if not exists public.billing_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null default 'free' check (plan in ('free', 'classroom', 'department', 'school')),
  status text not null default 'none',
  -- null = unlimited
  student_limit integer check (student_limit is null or student_limit > 0),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create unique index if not exists billing_subscriptions_customer_uidx
  on public.billing_subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;

alter table public.billing_subscriptions enable row level security;

drop policy if exists "billing_subscriptions_select_own" on public.billing_subscriptions;
create policy "billing_subscriptions_select_own"
  on public.billing_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "billing_subscriptions_insert_own" on public.billing_subscriptions;
create policy "billing_subscriptions_insert_own"
  on public.billing_subscriptions for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "billing_subscriptions_update_own" on public.billing_subscriptions;
create policy "billing_subscriptions_update_own"
  on public.billing_subscriptions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Join-time capacity check. A student who already has a row in the session is
-- always allowed (reloads, rejoins). No billing row = the free tier.
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

revoke all on function public.live_session_student_capacity(uuid, text) from public;
grant execute on function public.live_session_student_capacity(uuid, text) to anon, authenticated, service_role;

commit;
