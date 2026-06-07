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
  isTyping?: boolean;
  /** When false, keepalive only — does not refresh last_activity_at (pointer/typing engagement). */
  interaction?: boolean;
  displayName?: string;
  pendingSyncCount?: number;
  syncState?: "synced" | "pending" | "offline";
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
    const pendingSyncCount = Math.max(0, Math.floor(Number(body.pendingSyncCount) || 0));
    const syncState =
      body.syncState === "offline" || body.syncState === "pending" || body.syncState === "synced"
        ? body.syncState
        : "synced";

    const legacyArgs = {
      p_live_session_id: liveSessionId,
      p_device_id: deviceId,
      p_is_typing: isTyping,
      p_interaction: interaction,
      p_display_name: displayName,
    };

    const { error: modernError } = await supabase.rpc("heartbeat_live_session_student", {
      ...legacyArgs,
      p_pending_sync_count: pendingSyncCount,
      p_sync_state: syncState,
    });

    let error = modernError;
    if (
      error &&
      (error.message.includes("heartbeat_live_session_student") || error.code === "42883")
    ) {
      // Backward-compatible path before offline_sync (5-arg RPC, no sync metadata).
      const legacy = await supabase.rpc("heartbeat_live_session_student", legacyArgs);
      error = legacy.error;
    }

    if (error) {
      if (error.message.includes("heartbeat_live_session_student") || error.code === "42883") {
        return NextResponse.json(
          {
            error:
              "Database is missing heartbeat_live_session_student. Run migrations through 20260605150000_offline_sync.sql (or re-run supabase/schema.sql).",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (syncState === "offline" || syncState === "pending") {
      void notifyLiveSessionActivity(liveSessionId);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
