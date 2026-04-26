import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

/** Ends the session immediately by setting closes_at to now (join + saves then fail as closed). */
export async function POST(_request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can stop a session." }, { status: 403 });
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("form_sessions")
    .update({ closes_at: nowIso })
    .eq("id", liveSessionId)
    .eq("created_by", session.user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, closesAt: nowIso });
}
