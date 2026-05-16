import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { parseLiveTeacherFeedback } from "@/lib/live-teacher-feedback";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

type FeedbackPayload = {
  enabled?: boolean;
  feedback?: unknown;
};

export async function GET(request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId")?.trim() ?? "";

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "A valid deviceId query parameter is required." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAnonServiceClient();
    const { data, error } = await supabase.rpc("get_student_live_teacher_feedback", {
      p_live_session_id: liveSessionId,
      p_device_id: deviceId,
    });

    if (error) {
      if (error.message.includes("get_student_live_teacher_feedback") || error.code === "42883") {
        return NextResponse.json(
          {
            error:
              "Database is missing get_student_live_teacher_feedback. Run migration 20260516170000_get_student_live_teacher_feedback.sql.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const payload = (typeof data === "string" ? JSON.parse(data) : data) as FeedbackPayload;
    return NextResponse.json({
      enabled: payload?.enabled === true,
      liveTeacherFeedback: parseLiveTeacherFeedback(payload?.feedback),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
