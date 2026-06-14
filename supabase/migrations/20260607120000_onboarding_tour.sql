-- First-login onboarding tour completion flag (account-scoped).
-- Teachers update their own profile via the existing profiles_update_own policy,
-- so no new policy/RPC is required.
--
-- Note: column is left NULL for existing rows, so current teachers will see the
-- tour once on their next login. Backfill to now() here if you'd rather only show
-- it to genuinely new accounts.
alter table public.profiles
  add column if not exists onboarding_tour_completed_at timestamptz;
