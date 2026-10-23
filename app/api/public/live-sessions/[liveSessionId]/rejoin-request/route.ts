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

type RequestPayload = {
  ok?: boolean;
  reason?: string;
  status?: string;
};

const MISSING_HINT =
  "Run migration 20261023120000_device_rejoin_transfer.sql.";

/**
 * Ask to continue the attempt with this name on this device. The source row is
 * paused at once (roster: waiting); the teacher's Let in moves it here.
 */
export async function POST(request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const body = (await request.json().catch(() => ({}))) as Body;
  const deviceId = body.deviceId?.trim() ?? "";
  const displayName = normalizeLiveSessionDisplayName(body.displayName ?? "");

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "A valid deviceId is required." }, { status: 400 });
  }
  if (!isValidLiveSessionDisplayName(displayName)) {
    return NextResponse.json({ error: "A name (1–120 characters) is required." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAnonServiceClient();
    const { data, error } = await supabase.rpc("request_live_session_device_rejoin", {
      p_live_session_id: liveSessionId,
      p_display_name: displayName,
      p_device_id: deviceId,
    });

    if (error) {
      if (error.message.includes("request_live_session_device_rejoin") || error.code === "42883") {
        return NextResponse.json(
          { error: `Database is missing request_live_session_device_rejoin. ${MISSING_HINT}` },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const payload = (data ?? {}) as RequestPayload;
    if (!payload.ok) {
      const reason = payload.reason ?? "unknown";
      switch (reason) {
        case "not_found":
          return NextResponse.json(
            { error: "We couldn't find an attempt with that name.", code: reason },
            { status: 404 },
          );
        case "already_submitted":
          return NextResponse.json(
            { error: "You have already submitted this exam and cannot rejoin.", code: reason },
            { status: 403 },
          );
        case "ambiguous":
        case "target_has_attempt":
        case "session_closed":
          return NextResponse.json({ error: "Could not request a rejoin.", code: reason }, { status: 409 });
        default:
          return NextResponse.json({ error: "Invalid request.", code: reason }, { status: 400 });
      }
    }

    void notifyLiveSessionActivity(liveSessionId);
    return NextResponse.json({ ok: true, status: "pending" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** The requesting device gives up; the source row's pause state is restored. */
export async function DELETE(request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId")?.trim() ?? "";

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "A valid deviceId query parameter is required." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAnonServiceClient();
    const { data, error } = await supabase.rpc("cancel_live_session_device_rejoin", {
      p_live_session_id: liveSessionId,
      p_device_id: deviceId,
    });

    if (error) {
      if (error.message.includes("cancel_live_session_device_rejoin") || error.code === "42883") {
        return NextResponse.json(
          { error: `Database is missing cancel_live_session_device_rejoin. ${MISSING_HINT}` },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const payload = (data ?? {}) as RequestPayload;
    void notifyLiveSessionActivity(liveSessionId);
    return NextResponse.json({ ok: true, status: payload.status ?? "none" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
