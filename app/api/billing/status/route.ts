import { NextResponse } from "next/server";

import { loadBillingState } from "@/lib/billing/store";
import { isBillingConfigured } from "@/lib/billing/stripe";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Current entitlement for the signed-in teacher. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers have billing." }, { status: 403 });
  }

  try {
    const state = await loadBillingState(supabase, session.user.id);
    return NextResponse.json({ configured: isBillingConfigured(), ...state });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load billing." }, { status: 500 });
  }
}
