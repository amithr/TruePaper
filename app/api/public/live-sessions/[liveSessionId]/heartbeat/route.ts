import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { isValidLiveSessionDisplayName, normalizeLiveSessionDisplayName } from "@/lib/live-session-display-name";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

type Body = {
  deviceId?: string;
  isTyping?: boolean;
  /** When false, keepalive only — does not refresh last_activity_at (pointer/typing engagement). */
  interaction?: boolean;
  displayName?: string;
};

export async function POST(request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const body = (await request.json()) as Body;
  const deviceId = body.deviceId?.trim() ?? "";
  const isTyping = Boolean(body.isTyping);
  const interaction = body.interaction === undefined ? true : Boolean(body.interaction);
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
    const { error } = await supabase.rpc("heartbeat_live_session_student", {
      p_live_session_id: liveSessionId,
      p_device_id: deviceId,
      p_is_typing: isTyping,
      p_interaction: interaction,
      p_display_name: displayName,
    });

    if (error) {
      if (error.message.includes("heartbeat_live_session_student") || error.code === "42883") {
        return NextResponse.json(
          {
            error:
              "Database is missing heartbeat_live_session_student (5-arg) or it is outdated. Run migrations through 20260424130000_live_student_display_name.sql.",
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
