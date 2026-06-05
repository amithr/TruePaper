import { NextResponse } from "next/server";

import type { StudentAnswers } from "@/lib/forms";
import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { isValidLiveSessionDisplayName, normalizeLiveSessionDisplayName } from "@/lib/live-session-display-name";
import { finalizeLiveSessionIfClosed } from "@/lib/live-session-finalize";
import { parseLiveSessionStudentGet } from "@/lib/live-session-student-get";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

type SaveBody = {
  deviceId?: string;
  answers?: StudentAnswers;
  displayName?: string;
  submissionId?: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const submissionId = body.submissionId?.trim() ?? "";

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "A valid deviceId is required." }, { status: 400 });
  }

  if (!isValidLiveSessionDisplayName(displayName)) {
    return NextResponse.json(
      { error: "Enter your name (1–120 characters) to take this exam." },
      { status: 400 },
    );
  }

  if (submissionId && !UUID_RE.test(submissionId)) {
    return NextResponse.json({ error: "submissionId must be a valid UUID." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAnonServiceClient();
    if (submissionId) {
      const { data, error } = await supabase.rpc("save_live_session_student_response", {
        p_live_session_id: liveSessionId,
        p_device_id: deviceId,
        p_answers: answers,
        p_display_name: displayName,
        p_submission_id: submissionId,
      });

      if (error) {
        if (error.message.includes("save_live_session_student_response") || error.code === "42883") {
          return NextResponse.json(
            {
              error:
                "Database is missing save_live_session_student_response (5-arg). Run migrations through 20260605150000_offline_sync.sql.",
            },
            { status: 503 },
          );
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      const payload = (data ?? {}) as { deduped?: boolean };
      return NextResponse.json({ ok: true, deduped: payload.deduped === true });
    }

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
              "Database is missing save_live_session_student_response (4-arg). Run migrations through 20260605150000_offline_sync.sql (includes display-name save RPCs from 20260424130000_live_student_display_name.sql).",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
