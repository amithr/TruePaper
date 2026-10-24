import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { ensureCustomer } from "@/lib/billing/customer";
import { isPlanId, type PlanId } from "@/lib/billing/plans";
import { ensurePlanPriceId } from "@/lib/billing/prices";
import { loadBillingRow, loadBillingState, syncSubscription } from "@/lib/billing/store";
import { getStripe, isBillingConfigured } from "@/lib/billing/stripe";
import { pendingClientSecret } from "@/lib/billing/subscription-state";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  plan?: string;
};

const SUBSCRIPTION_EXPAND = ["latest_invoice.confirmation_secret"];

/**
 * Choose a plan.
 * - No subscription → create one in `default_incomplete`; the client confirms the
 *   first invoice's PaymentIntent with the Payment Element (clientSecret).
 * - Existing subscription → switch the price with proration; if the proration
 *   invoice needs the card, a clientSecret comes back the same way.
 * - `free` → cancel at the end of the current period (keeps access until then).
 */
export async function POST(request: Request) {
  if (!isBillingConfigured()) {
    return NextResponse.json({ error: "Billing is not configured on this server.", code: "not_configured" }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can subscribe." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  if (!isPlanId(body.plan)) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }
  const plan: PlanId = body.plan;

  try {
    const current = await loadBillingState(supabase, session.user.id);
    if (current.source === "billing_off") {
      return NextResponse.json({ error: "Billing is switched off.", code: "billing_off" }, { status: 409 });
    }

    const stripe = getStripe();
    const { row } = await loadBillingRow(supabase, session.user.id);
    const existingId = row?.stripe_subscription_id ?? null;
    let existing: Stripe.Subscription | null = null;
    if (existingId) {
      existing = await stripe.subscriptions.retrieve(existingId).catch(() => null);
      if (existing && (existing.status === "canceled" || existing.status === "incomplete_expired")) {
        existing = null;
      }
    }

    if (plan === "free") {
      if (!existing) {
        return NextResponse.json({ ok: true, clientSecret: null, status: "none", plan: "free" });
      }
      const updated = await stripe.subscriptions.update(existing.id, { cancel_at_period_end: true });
      const state = await syncSubscription(supabase, session.user.id, updated);
      return NextResponse.json({ ok: true, clientSecret: null, ...state });
    }

    const priceId = await ensurePlanPriceId(stripe, plan);

    if (existing) {
      const item = existing.items.data[0];
      const updated = await stripe.subscriptions.update(existing.id, {
        items: [{ id: item.id, price: priceId }],
        cancel_at_period_end: false,
        proration_behavior: "always_invoice",
        payment_behavior: "default_incomplete",
        metadata: { supabase_user_id: session.user.id, truepaper_plan: plan },
        expand: SUBSCRIPTION_EXPAND,
      });
      const state = await syncSubscription(supabase, session.user.id, updated);
      return NextResponse.json({ ok: true, clientSecret: pendingClientSecret(updated), ...state });
    }

    const customerId = await ensureCustomer(stripe, supabase, {
      id: session.user.id,
      email: session.user.email,
      name: session.profile?.display_name,
    });
    const created = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      metadata: { supabase_user_id: session.user.id, truepaper_plan: plan },
      expand: SUBSCRIPTION_EXPAND,
    });
    const state = await syncSubscription(supabase, session.user.id, created);
    const clientSecret = pendingClientSecret(created);
    if (!clientSecret) {
      return NextResponse.json({ error: "Stripe did not return a payment to confirm." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, clientSecret, ...state });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not start the subscription.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
