import { NextResponse } from "next/server";

import type { StudentAnswers } from "@/lib/forms";
import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { isValidLiveSessionDisplayName, normalizeLiveSessionDisplayName } from "@/lib/live-session-display-name";
import { finalizeLiveSessionIfClosed } from "@/lib/live-session-finalize";
import { parseLiveSessionStudentGet } from "@/lib/live-session-student-get";
import { broadcastTeacherWatchRefresh } from "@/lib/broadcast-teacher-watch";
import { notifyLiveSessionActivity } from "@/lib/notify-live-session-activity";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

type SaveBody = {
  deviceId?: string;
  answers?: StudentAnswers;
  displayName?: string;
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
    await finalizeLiveSessionIfClosed(supabase, liveSessionId).catch(() => {
      /* best-effort if finalize RPC is unavailable */
    });

    const { data, error } = await supabase.rpc("get_live_session_student_response", {
      p_live_session_id: liveSessionId,
      p_device_id: deviceId,
    });

    if (error) {
      if (error.message.includes("get_live_session_student_response") || error.code === "42883") {
        return NextResponse.json(
          {
            error:
              "Database is missing get_live_session_student_response. Run migration 20260421120000_join_code_sessions.sql.",
          },
          { status: 503 },
        );
      }
      const hint =
        error.message.includes("ensure_student_resume_code") ||
        error.message.includes("live_teacher_feedback") ||
        error.message.includes("student_resume_code")
          ? " Run migration 20260516180000_repair_get_live_session_student_response.sql."
          : "";
      return NextResponse.json({ error: error.message + hint }, { status: 500 });
    }

    const {
      answers,
      suspended,
      finished,
      graded,
      pointsEarned,
      pointsPossible,
      displayName,
      liveTeacherFeedback,
      liveTeacherFeedbackEnabled,
    } = parseLiveSessionStudentGet(data);
    return NextResponse.json({
      answers,
      suspended,
      finished,
      graded,
      pointsEarned,
      pointsPossible,
      displayName,
      liveTeacherFeedback,
      liveTeacherFeedbackEnabled,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const body = (await request.json()) as SaveBody;
  const deviceId = body.deviceId?.trim() ?? "";
  const answers = body.answers ?? {};
  const displayName = normalizeLiveSessionDisplayName(body.displayName ?? "");

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "A valid deviceId is required." }, { status: 400 });
  }

  if (!isValidLiveSessionDisplayName(displayName)) {
    return NextResponse.json(
      { error: "Enter your name (1–120 characters) to take this exam." },
      { status: 400 },
    );
  }

  try {
    const supabase = createSupabaseAnonServiceClient();
    const { error } = await supabase.rpc("save_live_session_student_response", {
      p_live_session_id: liveSessionId,
      p_device_id: deviceId,
      p_answers: answers,
      p_display_name: displayName,
    });

    if (error) {
      if (error.message.includes("save_live_session_student_response") || error.code === "42883") {
        return NextResponse.json(
          {
            error:
              "Database is missing save_live_session_student_response (4-arg) or it is outdated. Run migration 20260424130000_live_student_display_name.sql.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    void notifyLiveSessionActivity(liveSessionId);
    void broadcastTeacherWatchRefresh(supabase, liveSessionId, deviceId).catch(() => {
      /* watch page may poll */
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
