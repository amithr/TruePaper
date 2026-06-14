import { NextResponse } from "next/server";

import { isMissingColumnError } from "@/lib/is-missing-db-column";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Marks the first-login tour as seen for the current teacher. Idempotent. */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers have an onboarding tour." }, { status: 403 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_tour_completed_at: new Date().toISOString() })
    .eq("id", session.user.id);

  if (error) {
    // Pre-migration deploys: treat a missing column as a no-op success so the
    // client doesn't keep retrying.
    if (isMissingColumnError(error, "onboarding_tour_completed_at")) {
      return NextResponse.json({ ok: true, persisted: false });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, persisted: true });
}
