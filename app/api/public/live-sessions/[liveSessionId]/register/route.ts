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

    // Plan cap: Free allows 10 students per live session. A device that already has
    // a row is always let through (reload / rejoin). Missing RPC = pre-billing DB.
    const capacity = await supabase.rpc("live_session_student_capacity", {
      p_live_session_id: liveSessionId,
      p_device_id: deviceId,
    });
    if (!capacity.error) {
      const cap = (capacity.data ?? {}) as { ok?: boolean; allowed?: boolean; limit?: number | null };
      if (cap.ok && cap.allowed === false) {
        return NextResponse.json(
          {
            error: "This session is full. Ask your teacher to let you in another way.",
            code: "session_full",
            limit: typeof cap.limit === "number" ? cap.limit : null,
          },
          { status: 409 },
        );
      }
    }

    const { error } = await supabase.rpc("register_live_session_student_presence", {
      p_live_session_id: liveSessionId,
      p_device_id: deviceId,
      p_display_name: displayName,
    });

    if (error) {
      if (error.message.includes("register_live_session_student_presence") || error.code === "42883") {
        return NextResponse.json(
          {
            error:
              "Database is missing register_live_session_student_presence (3-arg) or it is outdated. Run migration 20260424130000_live_student_display_name.sql.",
          },
          { status: 503 },
        );
      }
      if (error.message.includes("exam already submitted")) {
        return NextResponse.json(
          { error: "You have already submitted this exam and cannot rejoin." },
          { status: 403 },
        );
      }
      const moved = movedDeviceErrorResponse(error);
      if (moved) {
        return moved;
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
