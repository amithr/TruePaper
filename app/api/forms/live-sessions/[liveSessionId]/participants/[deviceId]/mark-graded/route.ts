import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { getSessionUser } from "@/lib/request-auth";
import { notifyLiveSessionActivity } from "@/lib/notify-live-session-activity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ liveSessionId: string; deviceId: string }>;
};

export async function POST(_request: Request, { params }: Params) {
  const { liveSessionId, deviceId: rawDeviceId } = await params;
  const deviceId = decodeURIComponent(rawDeviceId).trim().toLowerCase();

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "Invalid device id." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can mark exams graded." }, { status: 403 });
  }

  const { error } = await supabase.rpc("teacher_mark_response_graded", {
    p_live_session_id: liveSessionId,
    p_device_id: deviceId,
  });

  if (error) {
    if (error.message.includes("teacher_mark_response_graded") || error.code === "42883") {
      return NextResponse.json(
        {
          error:
            "Database is missing teacher_mark_response_graded. Run migration 20260520130000_exam_grading.sql.",
        },
        { status: 503 },
      );
    }
    if (error.message.includes("not all questions graded")) {
      return NextResponse.json(
        { error: "Enter points for every question before marking graded." },
        { status: 409 },
      );
    }
    if (error.message.includes("exam not submitted")) {
      return NextResponse.json({ error: "The student has not submitted yet." }, { status: 409 });
    }
    if (error.message.includes("not allowed")) {
      return NextResponse.json({ error: "You do not own this session." }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  void notifyLiveSessionActivity(liveSessionId);

  return NextResponse.json({ ok: true });
}
