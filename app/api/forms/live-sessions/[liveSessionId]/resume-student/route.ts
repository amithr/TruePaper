import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { getSessionUser } from "@/lib/request-auth";
import { notifyLiveSessionActivity } from "@/lib/notify-live-session-activity";
import { broadcastStudentExamPatch } from "@/lib/student-exam-channel";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

type Body = {
  deviceId?: string;
};

export async function POST(request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const body = (await request.json()) as Body;
  const deviceId = body.deviceId?.trim().toLowerCase() ?? "";

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "A valid deviceId is required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can resume students." }, { status: 403 });
  }

  const { error } = await supabase.rpc("teacher_clear_live_session_student_suspension", {
    p_live_session_id: liveSessionId,
    p_device_id: deviceId,
  });

  if (error) {
    if (error.message.includes("teacher_clear_live_session_student_suspension") || error.code === "42883") {
      return NextResponse.json(
        {
          error:
            "Database is missing teacher_clear_live_session_student_suspension. Run migration 20260422140000_exam_tab_suspension.sql or 20260516200000_fix_teacher_clear_suspension.sql.",
        },
        { status: 503 },
      );
    }
    if (error.message.includes("student response not found")) {
      return NextResponse.json({ error: "Student has not joined this session yet." }, { status: 404 });
    }
    if (error.message.includes("not allowed")) {
      return NextResponse.json({ error: "You do not own this session." }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  try {
    const broadcastClient = createSupabaseAnonServiceClient();
    await broadcastStudentExamPatch(broadcastClient, liveSessionId, deviceId, {
      suspended: false,
    });
  } catch {
    /* postgres realtime may still deliver the update */
  }

  void notifyLiveSessionActivity(liveSessionId);

  return NextResponse.json({ ok: true });
}
