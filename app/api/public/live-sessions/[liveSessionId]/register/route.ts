import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { isValidLiveSessionDisplayName, normalizeLiveSessionDisplayName } from "@/lib/live-session-display-name";
import { notifyLiveSessionActivity } from "@/lib/notify-live-session-activity";
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
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    void notifyLiveSessionActivity(liveSessionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
