import type { SupabaseClient } from "@supabase/supabase-js";

import { getPlan, isPlanId, type PlanId } from "@/lib/billing/plans";
import { billingStateFromRow, type BillingRow, type BillingState } from "@/lib/billing/subscription-state";
import { isMissingColumnError, isMissingRelationError } from "@/lib/is-missing-db-column";

/** Admin-controlled inputs that can override what Stripe says. */
export type BillingContext = {
  /** Global switch (Admin → Billing). false = nobody is charged, no caps. */
  billingEnabled: boolean;
  /** Complimentary plan an admin granted this teacher. */
  planOverride: PlanId | null;
};

export const DEFAULT_BILLING_CONTEXT: BillingContext = { billingEnabled: true, planOverride: null };

/**
 * The plan a teacher is actually entitled to: billing switched off beats a
 * complimentary plan beats Stripe. Mirrors `live_session_student_capacity` in SQL.
 */
export function effectiveBillingState(
  row: BillingRow | null | undefined,
  ctx: BillingContext,
  nowMs = Date.now(),
): BillingState {
  const base = billingStateFromRow(row, nowMs);
  if (!ctx.billingEnabled) {
    return { ...base, plan: "school", studentLimit: null, source: "billing_off" };
  }
  if (ctx.planOverride) {
    return { ...base, plan: ctx.planOverride, studentLimit: getPlan(ctx.planOverride).studentLimit, source: "override" };
  }
  return { ...base, source: "stripe" };
}

/** Reads the global switch and the teacher's override; both tolerate a pre-migration DB. */
export async function loadBillingContext(supabase: SupabaseClient, userId: string): Promise<BillingContext> {
  const ctx: BillingContext = { ...DEFAULT_BILLING_CONTEXT };

  const settings = await supabase.from("app_settings").select("billing_enabled").eq("id", 1).maybeSingle();
  if (settings.error) {
    if (!isMissingRelationError(settings.error, "app_settings")) {
      throw new Error(settings.error.message);
    }
  } else if (settings.data && typeof settings.data.billing_enabled === "boolean") {
    ctx.billingEnabled = settings.data.billing_enabled;
  }

  const profile = await supabase.from("profiles").select("plan_override").eq("id", userId).maybeSingle();
  if (profile.error) {
    if (!isMissingColumnError(profile.error, "plan_override")) {
      throw new Error(profile.error.message);
    }
  } else if (isPlanId(profile.data?.plan_override)) {
    ctx.planOverride = profile.data.plan_override;
  }

  return ctx;
}
