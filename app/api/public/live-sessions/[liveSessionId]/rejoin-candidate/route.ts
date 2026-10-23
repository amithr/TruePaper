import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { isValidLiveSessionDisplayName, normalizeLiveSessionDisplayName } from "@/lib/live-session-display-name";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

type CandidatePayload = {
  ok?: boolean;
  reason?: string;
  found?: boolean;
  ambiguous?: boolean;
  answeredCount?: number;
  questionTotal?: number;
  lastActiveAt?: string | null;
  suspended?: boolean;
  pendingRequest?: boolean;
};

/**
 * Before a student starts a blank attempt: is there exactly one unfinished attempt
 * with this name on another device? Never exposes that device's id.
 */
export async function GET(request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId")?.trim() ?? "";
  const displayName = normalizeLiveSessionDisplayName(searchParams.get("name") ?? "");

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "A valid deviceId query parameter is required." }, { status: 400 });
  }
  if (!isValidLiveSessionDisplayName(displayName)) {
    return NextResponse.json({ error: "A name (1–120 characters) is required." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAnonServiceClient();
    const { data, error } = await supabase.rpc("lookup_live_session_rejoin_candidate", {
      p_live_session_id: liveSessionId,
      p_display_name: displayName,
      p_device_id: deviceId,
    });

    if (error) {
      if (error.message.includes("lookup_live_session_rejoin_candidate") || error.code === "42883") {
        return NextResponse.json(
          {
            error:
              "Database is missing lookup_live_session_rejoin_candidate. Run migration 20261023120000_device_rejoin_transfer.sql.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const payload = (data ?? {}) as CandidatePayload;
    if (!payload.ok) {
      const reason = payload.reason ?? "unknown";
      if (reason === "session_closed") {
        return NextResponse.json({ error: "This session is not open.", code: reason }, { status: 409 });
      }
      if (reason === "not_found") {
        return NextResponse.json({ error: "Session not found.", code: reason }, { status: 404 });
      }
      return NextResponse.json({ error: "Invalid request.", code: reason }, { status: 400 });
    }

    return NextResponse.json({
      found: payload.found === true,
      ambiguous: payload.ambiguous === true,
      answeredCount: Math.max(0, Number(payload.answeredCount) || 0),
      questionTotal: Math.max(0, Number(payload.questionTotal) || 0),
      lastActiveAt: typeof payload.lastActiveAt === "string" ? payload.lastActiveAt : null,
      suspended: payload.suspended === true,
      pendingRequest: payload.pendingRequest === true,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
