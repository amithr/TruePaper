import { describe, expect, it } from "vitest";

import { effectiveBillingState } from "@/lib/billing/entitlement";
import type { BillingRow } from "@/lib/billing/subscription-state";

const NOW = Date.parse("2026-10-24T12:00:00Z");
const classroom: BillingRow = {
  user_id: "u1",
  stripe_customer_id: "cus_1",
  stripe_subscription_id: "sub_1",
  plan: "classroom",
  status: "active",
  student_limit: 35,
  current_period_end: "2026-11-24T12:00:00Z",
  cancel_at_period_end: false,
};

describe("effectiveBillingState", () => {
  it("passes Stripe through when billing is on and nothing is overridden", () => {
    expect(effectiveBillingState(classroom, { billingEnabled: true, planOverride: null }, NOW)).toMatchObject({
      plan: "classroom",
      studentLimit: 35,
      source: "stripe",
    });
    expect(effectiveBillingState(null, { billingEnabled: true, planOverride: null }, NOW)).toMatchObject({ plan: "free", studentLimit: 10 });
  });

  it("a complimentary plan beats the subscription", () => {
    expect(effectiveBillingState(null, { billingEnabled: true, planOverride: "department" }, NOW)).toMatchObject({
      plan: "department",
      studentLimit: 150,
      source: "override",
    });
  });

  it("billing switched off lifts every cap, even over an override", () => {
    expect(effectiveBillingState(null, { billingEnabled: false, planOverride: "free" }, NOW)).toMatchObject({
      plan: "school",
      studentLimit: null,
      source: "billing_off",
    });
    // The Stripe facts (customer, renewal) are still reported so the portal link keeps working.
    expect(effectiveBillingState(classroom, { billingEnabled: false, planOverride: null }, NOW)).toMatchObject({
      hasCustomer: true,
      subscriptionId: "sub_1",
    });
  });
});
