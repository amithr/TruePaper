import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { effectiveBillingState, loadBillingContext } from "@/lib/billing/entitlement";
import { billingStateFromRow, rowFromStripeSubscription, type BillingRow, type BillingState } from "@/lib/billing/subscription-state";
import { isMissingRelationError } from "@/lib/is-missing-db-column";

const SELECT =
  "user_id, stripe_customer_id, stripe_subscription_id, plan, status, student_limit, current_period_end, cancel_at_period_end";

export const BILLING_MIGRATION_HINT = "Run migration 20261024120000_billing.sql.";

/** The teacher's row, or null (also when the table doesn't exist yet). */
export async function loadBillingRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ row: BillingRow | null; tableMissing: boolean }> {
  const { data, error } = await supabase
    .from("billing_subscriptions")
    .select(SELECT)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingRelationError(error, "billing_subscriptions")) {
      return { row: null, tableMissing: true };
    }
    throw new Error(error.message);
  }
  return { row: (data as BillingRow | null) ?? null, tableMissing: false };
}

/** The teacher's effective entitlement: Stripe row + admin switch + complimentary plan. */
export async function loadBillingState(supabase: SupabaseClient, userId: string): Promise<BillingState> {
  const [{ row }, ctx] = await Promise.all([loadBillingRow(supabase, userId), loadBillingContext(supabase, userId)]);
  return effectiveBillingState(row, ctx);
}

/** Remember the Stripe customer before any subscription exists. */
export async function saveCustomerId(supabase: SupabaseClient, userId: string, customerId: string): Promise<void> {
  const { error } = await supabase
    .from("billing_subscriptions")
    .upsert(
      { user_id: userId, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) {
    throw new Error(isMissingRelationError(error, "billing_subscriptions") ? BILLING_MIGRATION_HINT : error.message);
  }
}

/** Mirror a Stripe subscription into the row (used by the sync route and the webhook). */
export async function syncSubscription(
  supabase: SupabaseClient,
  userId: string,
  sub: Stripe.Subscription,
): Promise<BillingState> {
  const row = rowFromStripeSubscription(sub, userId);
  const { error } = await supabase.from("billing_subscriptions").upsert(row, { onConflict: "user_id" });
  if (error) {
    throw new Error(isMissingRelationError(error, "billing_subscriptions") ? BILLING_MIGRATION_HINT : error.message);
  }
  return billingStateFromRow(row);
}

/** The user a Stripe object belongs to: subscription metadata first, then the customer row. */
export async function userIdForSubscription(
  supabase: SupabaseClient,
  sub: Stripe.Subscription,
): Promise<string | null> {
  const fromMeta = sub.metadata?.supabase_user_id;
  if (typeof fromMeta === "string" && fromMeta) {
    return fromMeta;
  }
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const { data } = await supabase
    .from("billing_subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customer)
    .maybeSingle();
  return (data as { user_id?: string } | null)?.user_id ?? null;
}
