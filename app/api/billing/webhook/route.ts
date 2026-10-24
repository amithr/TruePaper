import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { syncSubscription, userIdForSubscription } from "@/lib/billing/store";
import { getStripe } from "@/lib/billing/stripe";
import { createSupabaseServiceRoleClient, isServiceRoleConfigured } from "@/lib/supabase/service-role";

/**
 * Stripe → TruePaper. Subscription lifecycle events keep `billing_subscriptions`
 * current (renewals, failed payments, cancellations, portal changes). Needs
 * STRIPE_WEBHOOK_SECRET and SUPABASE_SERVICE_ROLE_KEY (no user session here).
 * Register: https://<host>/api/billing/webhook with events `customer.subscription.*`.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET." }, { status: 503 });
  }
  if (!isServiceRoleConfigured()) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const payload = await request.text();
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid signature." }, { status: 400 });
  }

  if (!event.type.startsWith("customer.subscription.")) {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const sub = event.data.object as Stripe.Subscription;
  try {
    const supabase = createSupabaseServiceRoleClient();
    const userId = await userIdForSubscription(supabase, sub);
    if (!userId) {
      // Not one of ours (or the customer row is gone): acknowledge so Stripe stops retrying.
      return NextResponse.json({ received: true, ignored: "unknown customer" });
    }
    await syncSubscription(supabase, userId, sub);
    return NextResponse.json({ received: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Webhook failed." }, { status: 500 });
  }
}
