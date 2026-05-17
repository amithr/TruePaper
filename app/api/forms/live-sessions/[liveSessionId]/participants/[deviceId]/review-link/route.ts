import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { buildStudentReviewUrl } from "@/lib/student-review-url";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ liveSessionId: string; deviceId: string }>;
};

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
    return NextResponse.json({ error: "Only teachers can create review links." }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("ensure_student_review_token", {
    p_live_session_id: liveSessionId,
    p_device_id: deviceId,
  });

  if (error) {
    if (error.message.includes("ensure_student_review_token") || error.code === "42883") {
      return NextResponse.json(
        {
          error:
            "Database is missing ensure_student_review_token. Run migration 20260518100000_student_review_share.sql.",
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const token = typeof data === "string" ? data.trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Could not create review link." }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const reviewUrl = buildStudentReviewUrl(origin, token);

  return NextResponse.json({ ok: true, token, reviewUrl });
}
