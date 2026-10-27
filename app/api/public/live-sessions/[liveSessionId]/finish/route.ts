import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { isValidLiveSessionDisplayName, normalizeLiveSessionDisplayName } from "@/lib/live-session-display-name";
import { movedDeviceErrorResponse } from "@/lib/moved-device-response";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

type Body = {
  deviceId?: string;
  displayName?: string;
};

export async function POST(request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const body = (await request.json()) as Body;
  const deviceId = body.deviceId?.trim() ?? "";
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
    const { error } = await supabase.rpc("finish_live_session_student_response", {
      p_live_session_id: liveSessionId,
      p_device_id: deviceId,
      p_display_name: displayName,
    });

    if (error) {
      if (error.message.includes("finish_live_session_student_response") || error.code === "42883") {
        return NextResponse.json(
          {
            error:
              "Database is missing finish_live_session_student_response (3-arg) or it is outdated. Run migration 20260424130000_live_student_display_name.sql.",
          },
          { status: 503 },
        );
      }
      const moved = movedDeviceErrorResponse(error);
      if (moved) {
        return moved;
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // The hand-in screen links straight to the student's results. Best effort: a
    // database without the token RPC yet just returns null and the screen copes.
    let reviewToken: string | null = null;
    const claimed = await supabase.rpc("claim_student_review_token", {
      p_live_session_id: liveSessionId,
      p_device_id: deviceId,
    });
    if (!claimed.error && typeof claimed.data === "string" && claimed.data.trim()) {
      reviewToken = claimed.data.trim().toUpperCase();
    }

    return NextResponse.json({ ok: true, reviewToken });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
