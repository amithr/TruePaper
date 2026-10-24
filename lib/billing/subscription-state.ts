import type Stripe from "stripe";

import { FREE_STUDENT_LIMIT, getPlan, isPlanId, planFromLookupKey, type PlanId } from "@/lib/billing/plans";

/** What the UI and the join-time cap need to know. */
export type BillingState = {
  /** The plan the teacher is entitled to right now. */
  plan: PlanId;
  /** Stripe subscription status, or "none" without a subscription. */
  status: string;
  /** Students per live session; null = unlimited. */
  studentLimit: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  subscriptionId: string | null;
  /** Where the entitlement comes from (admin switch / complimentary plan / Stripe). */
  source?: "stripe" | "override" | "billing_off";
};

export type BillingRow = {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: string;
  status: string;
  student_limit: number | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export const FREE_STATE: BillingState = {
  plan: "free",
  status: "none",
  studentLimit: FREE_STUDENT_LIMIT,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  hasCustomer: false,
  subscriptionId: null,
};

const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);
/** past_due keeps access briefly while Stripe retries the card. */
const PAST_DUE_GRACE_MS = 3 * 86_400_000;

/** Entitlement from a stored row; mirrors `live_session_student_capacity` in SQL. */
export function billingStateFromRow(row: BillingRow | null | undefined, nowMs = Date.now()): BillingState {
  if (!row) {
    return FREE_STATE;
  }
  const paid = isPlanId(row.plan) ? row.plan : "free";
  const periodEndMs = row.current_period_end ? new Date(row.current_period_end).getTime() : null;
  const entitled =
    paid !== "free" &&
    ENTITLED_STATUSES.has(row.status) &&
    (periodEndMs === null || !Number.isFinite(periodEndMs) || nowMs <= periodEndMs + PAST_DUE_GRACE_MS);
  const plan: PlanId = entitled ? paid : "free";
  return {
    plan,
    status: row.status,
    studentLimit: entitled ? getPlan(plan).studentLimit : FREE_STUDENT_LIMIT,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    hasCustomer: Boolean(row.stripe_customer_id),
    subscriptionId: row.stripe_subscription_id,
  };
}

/** Map a Stripe subscription (items expanded by default) to our row. */
export function rowFromStripeSubscription(
  sub: Stripe.Subscription,
  userId: string,
): Omit<BillingRow, "user_id"> & { user_id: string; updated_at: string } {
  const item = sub.items.data[0];
  const plan =
    planFromLookupKey(item?.price.lookup_key) ??
    (isPlanId(sub.metadata?.truepaper_plan) ? sub.metadata.truepaper_plan : "free");
  const periodEnd = item?.current_period_end;
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  // A canceled / expired subscription no longer entitles anything; keep the ids for history.
  const live = ENTITLED_STATUSES.has(sub.status) || sub.status === "incomplete";
  return {
    user_id: userId,
    stripe_customer_id: customer,
    stripe_subscription_id: sub.id,
    plan: live ? plan : "free",
    status: sub.status,
    student_limit: live ? getPlan(plan).studentLimit : FREE_STUDENT_LIMIT,
    current_period_end: typeof periodEnd === "number" ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end === true,
    updated_at: new Date().toISOString(),
  };
}

/** The client secret for the first (or latest open) invoice, if the payment still needs the card. */
export function pendingClientSecret(sub: Stripe.Subscription): string | null {
  const invoice = sub.latest_invoice;
  if (!invoice || typeof invoice === "string") {
    return null;
  }
  if (invoice.status !== "open") {
    return null;
  }
  return invoice.confirmation_secret?.client_secret ?? null;
}
