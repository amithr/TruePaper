import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

/** Ends the session immediately and marks all student devices in the session as finished. */
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

  const { data, error } = await supabase.rpc("stop_live_session", {
    p_live_session_id: liveSessionId,
  });

  if (error) {
    if (error.message.includes("stop_live_session") || error.code === "42883") {
      return NextResponse.json(
        {
          error:
            "Database is missing stop_live_session. Run migration 20260516130000_stop_session_finish_all.sql.",
        },
        { status: 503 },
      );
    }
    if (error.message.includes("session not found")) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const payload = data as { ok?: boolean; closesAt?: string; finishedCount?: number } | null;
  const closesAt =
    typeof payload?.closesAt === "string" ? payload.closesAt : new Date().toISOString();

  return NextResponse.json({
    ok: true,
    closesAt,
    finishedCount: typeof payload?.finishedCount === "number" ? payload.finishedCount : 0,
  });
}
