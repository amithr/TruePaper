import type Stripe from "stripe";

import { getPlan, type PlanId } from "@/lib/billing/plans";

const PRODUCT_NAMES: Record<Exclude<PlanId, "free">, string> = {
  classroom: "TruePaper Classroom",
  department: "TruePaper Department",
  school: "TruePaper School",
};

const priceIdCache = new Map<string, string>();

/**
 * Resolve the Stripe Price for a paid plan by its lookup key, creating the
 * Product + Price on first use. Idempotent per Stripe account, so no price ids
 * need to be configured per environment.
 */
export async function ensurePlanPriceId(stripe: Stripe, planId: Exclude<PlanId, "free">): Promise<string> {
  const plan = getPlan(planId);
  const lookupKey = plan.lookupKey;
  if (!lookupKey) {
    throw new Error(`Plan ${planId} has no Stripe lookup key.`);
  }
  const cached = priceIdCache.get(lookupKey);
  if (cached) {
    return cached;
  }

  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (existing.data[0]) {
    priceIdCache.set(lookupKey, existing.data[0].id);
    return existing.data[0].id;
  }

  const product = await stripe.products.create({
    name: PRODUCT_NAMES[planId],
    metadata: { truepaper_plan: planId },
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: plan.currency,
    unit_amount: plan.monthlyAmount,
    recurring: { interval: "month" },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    metadata: { truepaper_plan: planId },
  });
  priceIdCache.set(lookupKey, price.id);
  return price.id;
}

/** Test seam. */
export function resetPriceCacheForTests(): void {
  priceIdCache.clear();
}
