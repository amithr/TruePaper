import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

/** Permanently delete a closed live session and all student responses (CASCADE). */
export async function DELETE(_request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can delete sessions." }, { status: 403 });
  }

  const { error } = await supabase.rpc("teacher_delete_live_session", {
    p_live_session_id: liveSessionId,
  });

  if (error) {
    if (error.message.includes("teacher_delete_live_session") || error.code === "42883") {
      return NextResponse.json(
        {
          error:
            "Database is missing teacher_delete_live_session. Run migration 20260520110000_teacher_delete_live_session.sql.",
        },
        { status: 503 },
      );
    }
    if (error.message.includes("session not found")) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    if (error.message.includes("not allowed")) {
      return NextResponse.json({ error: "You do not own this session." }, { status: 403 });
    }
    if (error.message.includes("session still running")) {
      return NextResponse.json(
        { error: "Stop the session before deleting it." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
