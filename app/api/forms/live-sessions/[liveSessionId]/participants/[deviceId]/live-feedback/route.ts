import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { clearStudentHandRaise } from "@/lib/clear-student-hand-raise";
import { parseLiveTeacherFeedback } from "@/lib/live-teacher-feedback";
import { notifyLiveSessionActivity } from "@/lib/notify-live-session-activity";
import { getSessionUser } from "@/lib/request-auth";
import { broadcastStudentExamPatch } from "@/lib/student-exam-channel";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ liveSessionId: string; deviceId: string }>;
};

type Body = {
  questionId?: string;
  message?: string;
};

const MAX_MESSAGE_LEN = 2000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: Params) {
  const { liveSessionId, deviceId: rawDeviceId } = await params;
  const deviceId = decodeURIComponent(rawDeviceId).trim().toLowerCase();
  const body = (await request.json()) as Body;
  const questionId = body.questionId?.trim() ?? "";
  const message = (body.message ?? "").trim().slice(0, MAX_MESSAGE_LEN);

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "Invalid device id." }, { status: 400 });
  }

  if (!questionId || !UUID_RE.test(questionId)) {
    return NextResponse.json({ error: "A valid questionId is required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can send live feedback." }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("set_live_teacher_feedback", {
    p_live_session_id: liveSessionId,
    p_device_id: deviceId,
    p_question_id: questionId,
    p_message: message,
  });

  if (error) {
    if (error.message.includes("set_live_teacher_feedback") || error.code === "42883") {
      return NextResponse.json(
        {
          error:
            "Database is missing set_live_teacher_feedback. Run migration 20260516140000_live_teacher_feedback_rpc.sql.",
        },
        { status: 503 },
      );
    }
    if (error.message.includes("not authenticated")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (error.message.includes("not allowed")) {
      return NextResponse.json(
        {
          error:
            "Live teacher feedback is not enabled for this form, or you do not own this session.",
        },
        { status: 403 },
      );
    }
    if (error.message.includes("question not found")) {
      return NextResponse.json({ error: "Question not found or not a text question." }, { status: 404 });
    }
    if (error.message.includes("student response not found")) {
      return NextResponse.json(
        { error: "Student has not joined this session on their device yet." },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const liveTeacherFeedback = parseLiveTeacherFeedback(data);

  if (message) {
    try {
      await clearStudentHandRaise(supabase, liveSessionId, deviceId, questionId);
      void notifyLiveSessionActivity(liveSessionId);
    } catch {
      /* best effort */
    }
  }

  try {
    const broadcastClient = createSupabaseAnonServiceClient();
    await broadcastStudentExamPatch(broadcastClient, liveSessionId, deviceId.toLowerCase(), {
      liveTeacherFeedback,
    });
  } catch {
    /* student may still receive postgres realtime */
  }

  return NextResponse.json({
    ok: true,
    liveTeacherFeedback,
  });
}
