import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

type Body = {
  deviceId?: string;
};

/**
 * The student's own results token, after hand-in. Used by the hand-in screen
 * when the token wasn't returned at finish time (offline hand-in, teacher ended
 * the exam remotely). Same credential as every public route: the device id.
 */
export async function POST(request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const body = (await request.json().catch(() => ({}))) as Body;
  const deviceId = body.deviceId?.trim() ?? "";
  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "A valid deviceId is required." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAnonServiceClient();
    const { data, error } = await supabase.rpc("claim_student_review_token", {
      p_live_session_id: liveSessionId,
      p_device_id: deviceId,
    });
    if (error) {
      if (error.message.includes("claim_student_review_token") || error.code === "42883") {
        return NextResponse.json(
          { error: "Database is missing claim_student_review_token. Run migration 20261027120000_student_results_token.sql." },
          { status: 503 },
        );
      }
      if (error.message.includes("not handed in")) {
        return NextResponse.json({ error: "Hand in the exam first.", code: "not_finished" }, { status: 409 });
      }
      if (error.message.includes("not found")) {
        return NextResponse.json({ error: "Exam not found.", code: "not_found" }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const token = typeof data === "string" ? data.trim().toUpperCase() : "";
    if (!token) {
      return NextResponse.json({ error: "No results token." }, { status: 500 });
    }
    return NextResponse.json({ token });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Configuration error." }, { status: 500 });
  }
}
