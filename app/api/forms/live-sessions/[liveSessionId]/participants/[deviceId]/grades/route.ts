import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { parseQuestionGrades } from "@/lib/exam-grades";
import { getSessionUser } from "@/lib/request-auth";
import { notifyLiveSessionActivity } from "@/lib/notify-live-session-activity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ liveSessionId: string; deviceId: string }>;
};

type Body = {
  questionId?: string;
  points?: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: Params) {
  const { liveSessionId, deviceId: rawDeviceId } = await params;
  const deviceId = decodeURIComponent(rawDeviceId).trim().toLowerCase();
  const body = (await request.json()) as Body;
  const questionId = body.questionId?.trim() ?? "";

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
    return NextResponse.json({ error: "Only teachers can grade exams." }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("teacher_set_response_question_grade", {
    p_live_session_id: liveSessionId,
    p_device_id: deviceId,
    p_question_id: questionId,
    p_points: Math.floor(Number(body.points) || 0),
  });

  if (error) {
    if (error.message.includes("teacher_set_response_question_grade") || error.code === "42883") {
      return NextResponse.json(
        {
          error:
            "Database is missing teacher_set_response_question_grade. Run migration 20260520130000_exam_grading.sql.",
        },
        { status: 503 },
      );
    }
    if (error.message.includes("exam not submitted")) {
      return NextResponse.json({ error: "Grade after the student submits." }, { status: 409 });
    }
    if (error.message.includes("not allowed")) {
      return NextResponse.json({ error: "You do not own this session." }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  void notifyLiveSessionActivity(liveSessionId);

  return NextResponse.json({
    ok: true,
    questionGrades: parseQuestionGrades(data),
  });
}
