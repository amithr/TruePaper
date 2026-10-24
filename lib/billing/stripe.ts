import Stripe from "stripe";

/**
 * Server-side Stripe client. Keys come from the environment:
 *   STRIPE_SECRET_KEY                 — required for any billing call
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — the browser's Payment Element
 *   STRIPE_WEBHOOK_SECRET             — webhook signature check
 * The SDK pins the current Stripe API version itself (no override here).
 */
let client: Stripe | null = null;

export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable.");
  }
  if (!client) {
    client = new Stripe(key, { appInfo: { name: "TruePaper", url: "https://truepaper.app" } });
  }
  return client;
}

/** Test seam: forget the cached client (e.g. when env changes between tests). */
export function resetStripeClientForTests(): void {
  client = null;
}
