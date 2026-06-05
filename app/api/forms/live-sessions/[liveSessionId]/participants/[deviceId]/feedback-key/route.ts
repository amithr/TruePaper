import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { parseLiveTeacherFeedback } from "@/lib/live-teacher-feedback";
import { getSessionUser } from "@/lib/request-auth";
import { broadcastStudentExamPatch } from "@/lib/student-exam-channel";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ liveSessionId: string; deviceId: string }>;
};

type Body = {
  key?: string;
  payload?: string;
};

const MAX_PAYLOAD_LEN = 4000;

export async function PATCH(request: Request, { params }: Params) {
  const { liveSessionId, deviceId: rawDeviceId } = await params;
  const deviceId = decodeURIComponent(rawDeviceId).trim().toLowerCase();
  const body = (await request.json()) as Body;
  const key = body.key?.trim() ?? "";
  const payload = (body.payload ?? "").trim().slice(0, MAX_PAYLOAD_LEN);

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "Invalid device id." }, { status: 400 });
  }
  if (!key) {
    return NextResponse.json({ error: "A feedback key is required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can send feedback." }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("set_teacher_feedback_key", {
    p_live_session_id: liveSessionId,
    p_device_id: deviceId,
    p_feedback_key: key,
    p_payload: payload,
  });

  if (error) {
    if (error.message.includes("set_teacher_feedback_key") || error.code === "42883") {
      return NextResponse.json(
        {
          error:
            "Database is missing set_teacher_feedback_key. Run migration 20260605120000_response_types.sql.",
        },
        { status: 503 },
      );
    }
    if (error.message.includes("not authenticated")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (error.message.includes("not allowed")) {
      return NextResponse.json(
        { error: "Feedback is not enabled for this form, or you do not own this session." },
        { status: 403 },
      );
    }
    if (error.message.includes("student response not found")) {
      return NextResponse.json({ error: "Student has not joined yet." }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const liveTeacherFeedback = parseLiveTeacherFeedback(data);

  try {
    const broadcastClient = createSupabaseAnonServiceClient();
    await broadcastStudentExamPatch(broadcastClient, liveSessionId, deviceId, {
      liveTeacherFeedback,
    });
  } catch {
    /* best effort */
  }

  return NextResponse.json({ ok: true, liveTeacherFeedback });
}
