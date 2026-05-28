import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { formatResumeCodeForDisplay } from "@/lib/resume-code";
import { getSessionUser } from "@/lib/request-auth";
import { notifyLiveSessionActivity } from "@/lib/notify-live-session-activity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ liveSessionId: string; deviceId: string }>;
};

/** Create or return the personal rejoin code for an in-progress student exam. */
export async function POST(request: Request, { params }: Params) {
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
    return NextResponse.json({ error: "Only teachers can create rejoin codes." }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("teacher_ensure_student_resume_code", {
    p_live_session_id: liveSessionId,
    p_device_id: deviceId,
  });

  if (error) {
    if (error.message.includes("teacher_ensure_student_resume_code") || error.code === "42883") {
      return NextResponse.json(
        {
          error:
            "Database is missing teacher_ensure_student_resume_code. Run migration 20260520120000_teacher_controlled_resume_code.sql.",
        },
        { status: 503 },
      );
    }
    if (error.message.includes("student response not found")) {
      return NextResponse.json(
        { error: "Student has not joined this session on their device yet." },
        { status: 404 },
      );
    }
    if (error.message.includes("not allowed")) {
      return NextResponse.json({ error: "You do not own this session." }, { status: 403 });
    }
    if (error.message.includes("exam already submitted")) {
      return NextResponse.json({ error: "This student has already submitted." }, { status: 409 });
    }
    if (error.message.includes("session is not open")) {
      return NextResponse.json(
        { error: "Rejoin codes can only be issued while the session is open." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const resumeCode = typeof data === "string" ? data.trim().toUpperCase() : "";
  if (!resumeCode) {
    return NextResponse.json({ error: "Could not create rejoin code." }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const rejoinUrl = new URL("/", origin);
  rejoinUrl.searchParams.set("resume", resumeCode);

  void notifyLiveSessionActivity(liveSessionId);

  return NextResponse.json({
    ok: true,
    resumeCode,
    displayCode: formatResumeCodeForDisplay(resumeCode),
    rejoinUrl: rejoinUrl.toString(),
  });
}
