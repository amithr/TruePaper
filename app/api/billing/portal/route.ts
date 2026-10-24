import { NextResponse } from "next/server";

import { ensureCustomer } from "@/lib/billing/customer";
import { getStripe, isBillingConfigured } from "@/lib/billing/stripe";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  /** Locale-prefixed path to return to (default: the settings page). */
  returnPath?: string;
};

/** Stripe Customer Portal: update the card, see invoices, cancel. */
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
    return NextResponse.json({ error: "Only teachers have billing." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const returnPath =
    body.returnPath && body.returnPath.startsWith("/") && !body.returnPath.startsWith("//")
      ? body.returnPath
      : "/dashboard/settings";
  const requestUrl = new URL(request.url);
  const origin = `${requestUrl.protocol}//${requestUrl.host}`;

  try {
    const stripe = getStripe();
    const customerId = await ensureCustomer(stripe, supabase, {
      id: session.user.id,
      email: session.user.email,
      name: session.profile?.display_name,
    });
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}${returnPath}`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not open billing." }, { status: 500 });
  }
}
