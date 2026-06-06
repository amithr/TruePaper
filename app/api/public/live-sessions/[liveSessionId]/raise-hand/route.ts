import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { notifyLiveSessionActivity } from "@/lib/notify-live-session-activity";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

type Body = {
  deviceId?: string;
  questionId?: string;
  raised?: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const body = (await request.json()) as Body;
  const deviceId = body.deviceId?.trim() ?? "";
  const questionId = body.questionId?.trim() ?? "";
  const raised = body.raised !== false;

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "A valid deviceId is required." }, { status: 400 });
  }

  if (raised && (!questionId || !UUID_RE.test(questionId))) {
    return NextResponse.json({ error: "A valid questionId is required." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAnonServiceClient();
    const { error } = await supabase.rpc("set_student_hand_raise", {
      p_live_session_id: liveSessionId,
      p_device_id: deviceId,
      p_question_id: raised ? questionId : null,
      p_raised: raised,
    });

    if (error) {
      if (error.message.includes("set_student_hand_raise") || error.code === "42883") {
        return NextResponse.json(
          {
            error:
              "Database is missing set_student_hand_raise. Run migration 20260605220000_raise_hand.sql.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    void notifyLiveSessionActivity(liveSessionId);

    return NextResponse.json({
      ok: true,
      raised,
      questionId: raised ? questionId : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
