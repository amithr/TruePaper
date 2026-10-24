import { NextResponse } from "next/server";

import { loadBillingRow, syncSubscription } from "@/lib/billing/store";
import { getStripe, isBillingConfigured } from "@/lib/billing/stripe";
import { billingStateFromRow } from "@/lib/billing/subscription-state";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Pull the subscription from Stripe right after the client confirmed a payment,
 * so the plan flips immediately instead of waiting for the webhook.
 */
export async function POST() {
  if (!isBillingConfigured()) {
    return NextResponse.json({ error: "Billing is not configured on this server.", code: "not_configured" }, { status: 503 });
  }
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers have billing." }, { status: 403 });
  }

  try {
    const { row } = await loadBillingRow(supabase, session.user.id);
    if (!row?.stripe_subscription_id) {
      return NextResponse.json({ ok: true, ...billingStateFromRow(row) });
    }
    const sub = await getStripe().subscriptions.retrieve(row.stripe_subscription_id);
    const state = await syncSubscription(supabase, session.user.id, sub);
    return NextResponse.json({ ok: true, ...state });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not sync billing." }, { status: 500 });
  }
}
