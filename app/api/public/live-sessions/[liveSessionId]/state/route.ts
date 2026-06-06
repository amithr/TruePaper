import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

/**
 * Lightweight student poll (every ~3s): ended / suspend / resume + window.
 * Never returns answers or feedback bodies — those have their own paths.
 */
export async function GET(request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId")?.trim() ?? "";

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json(
      { error: "A valid deviceId query parameter is required." },
      { status: 400 },
    );
  }

  try {
    const supabase = createSupabaseAnonServiceClient();
    const { data, error } = await supabase.rpc("get_live_session_student_state", {
      p_live_session_id: liveSessionId,
      p_device_id: deviceId,
    });

    if (error) {
      if (error.message.includes("get_live_session_student_state") || error.code === "42883") {
        return NextResponse.json(
          {
            error:
              "Database is missing get_live_session_student_state. Run migration 20260530090000_scale_polling_presence.sql.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = (data ?? {}) as {
      opensAt?: string;
      closesAt?: string;
      suspended?: boolean;
      finished?: boolean;
      handRaiseQuestionId?: string | null;
      handRaisedAt?: string | null;
    };

    return NextResponse.json({
      opensAt: typeof row.opensAt === "string" ? row.opensAt : null,
      closesAt: typeof row.closesAt === "string" ? row.closesAt : null,
      suspended: row.suspended === true,
      finished: row.finished === true,
      handRaiseQuestionId:
        typeof row.handRaiseQuestionId === "string" ? row.handRaiseQuestionId : null,
      handRaisedAt: typeof row.handRaisedAt === "string" ? row.handRaisedAt : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
