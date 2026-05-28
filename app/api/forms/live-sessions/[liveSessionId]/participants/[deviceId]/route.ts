import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { getSessionUser } from "@/lib/request-auth";
import { notifyLiveSessionActivity } from "@/lib/notify-live-session-activity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ liveSessionId: string; deviceId: string }>;
};

export async function DELETE(_request: Request, { params }: Params) {
  const { liveSessionId, deviceId: rawDeviceId } = await params;
  const deviceId = decodeURIComponent(rawDeviceId).trim().toLowerCase();

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "A valid deviceId is required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can remove student exams." }, { status: 403 });
  }

  const { error } = await supabase.rpc("teacher_delete_live_session_student", {
    p_live_session_id: liveSessionId,
    p_device_id: deviceId,
  });

  if (error) {
    if (error.message.includes("teacher_delete_live_session_student") || error.code === "42883") {
      return NextResponse.json(
        {
          error:
            "Database is missing teacher_delete_live_session_student. Run migration 20260520100000_teacher_delete_live_student.sql.",
        },
        { status: 503 },
      );
    }
    if (error.message.includes("student response not found")) {
      return NextResponse.json({ error: "Student exam not found in this session." }, { status: 404 });
    }
    if (error.message.includes("not allowed")) {
      return NextResponse.json({ error: "You do not own this session." }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  void notifyLiveSessionActivity(liveSessionId);

  return NextResponse.json({ ok: true });
}
