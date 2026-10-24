import type Stripe from "stripe";
import { describe, expect, it } from "vitest";

import {
  billingStateFromRow,
  FREE_STATE,
  pendingClientSecret,
  rowFromStripeSubscription,
  type BillingRow,
} from "@/lib/billing/subscription-state";

const NOW = Date.parse("2026-10-24T12:00:00Z");

function row(over: Partial<BillingRow> = {}): BillingRow {
  return {
    user_id: "u1",
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "sub_1",
    plan: "classroom",
    status: "active",
    student_limit: 35,
    current_period_end: "2026-11-24T12:00:00Z",
    cancel_at_period_end: false,
    ...over,
  };
}

function stripeSub(over: Partial<Stripe.Subscription> & { lookupKey?: string | null; periodEnd?: number } = {}): Stripe.Subscription {
  const { lookupKey = "truepaper_classroom_monthly_v1", periodEnd = 1795000000, ...rest } = over;
  return {
    id: "sub_1",
    object: "subscription",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    metadata: { supabase_user_id: "u1", truepaper_plan: "classroom" },
    items: {
      object: "list",
      data: [{ id: "si_1", price: { lookup_key: lookupKey }, current_period_end: periodEnd }],
    },
    latest_invoice: null,
    ...rest,
  } as unknown as Stripe.Subscription;
}

describe("billingStateFromRow", () => {
  it("is Free without a row", () => {
    expect(billingStateFromRow(null, NOW)).toEqual(FREE_STATE);
  });

  it("entitles active and trialing paid plans", () => {
    expect(billingStateFromRow(row(), NOW)).toMatchObject({ plan: "classroom", studentLimit: 35, hasCustomer: true });
    expect(billingStateFromRow(row({ status: "trialing" }), NOW).plan).toBe("classroom");
  });

  it("keeps past_due for a short grace period, then falls back to Free", () => {
    expect(billingStateFromRow(row({ status: "past_due", current_period_end: "2026-10-23T12:00:00Z" }), NOW).plan).toBe("classroom");
    expect(billingStateFromRow(row({ status: "past_due", current_period_end: "2026-10-01T12:00:00Z" }), NOW).plan).toBe("free");
    expect(billingStateFromRow(row({ status: "canceled" }), NOW)).toMatchObject({ plan: "free", studentLimit: 10 });
  });
});

describe("rowFromStripeSubscription", () => {
  it("reads the plan from the price lookup key and the period end from the item", () => {
    expect(rowFromStripeSubscription(stripeSub(), "u1")).toMatchObject({
      user_id: "u1",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      plan: "classroom",
      status: "active",
      student_limit: 35,
      current_period_end: new Date(1795000000 * 1000).toISOString(),
      cancel_at_period_end: false,
    });
  });

  it("falls back to subscription metadata and drops entitlement when canceled", () => {
    expect(rowFromStripeSubscription(stripeSub({ lookupKey: null }), "u1").plan).toBe("classroom");
    expect(rowFromStripeSubscription(stripeSub({ status: "canceled" }), "u1")).toMatchObject({ plan: "free", student_limit: 10 });
  });
});

describe("pendingClientSecret", () => {
  it("returns the invoice confirmation secret only while the invoice is open", () => {
    const open = stripeSub({
      latest_invoice: { status: "open", confirmation_secret: { client_secret: "pi_secret", type: "payment_intent" } } as never,
    });
    expect(pendingClientSecret(open)).toBe("pi_secret");
    const paid = stripeSub({ latest_invoice: { status: "paid", confirmation_secret: null } as never });
    expect(pendingClientSecret(paid)).toBeNull();
    expect(pendingClientSecret(stripeSub({ latest_invoice: "in_1" as never }))).toBeNull();
  });
});
