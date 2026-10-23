import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { getSessionUser } from "@/lib/request-auth";
import { notifyLiveSessionActivity } from "@/lib/notify-live-session-activity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ liveSessionId: string; deviceId: string }>;
};

/**
 * "Not them": decline a pending request to move this student's attempt to another
 * device. The original device keeps the attempt and its pause state is restored.
 * (Approval is the ordinary Let in → POST .../resume-student.)
 */
export async function DELETE(_request: Request, { params }: Params) {
  const { liveSessionId, deviceId: rawDeviceId } = await params;
  const deviceId = decodeURIComponent(rawDeviceId).trim().toLowerCase();

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "Invalid device id." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can decline rejoin requests." }, { status: 403 });
  }

  const { error } = await supabase.rpc("teacher_decline_live_session_device_rejoin", {
    p_live_session_id: liveSessionId,
    p_device_id: deviceId,
  });

  if (error) {
    if (error.message.includes("teacher_decline_live_session_device_rejoin") || error.code === "42883") {
      return NextResponse.json(
        {
          error:
            "Database is missing teacher_decline_live_session_device_rejoin. Run migration 20261023120000_device_rejoin_transfer.sql.",
        },
        { status: 503 },
      );
    }
    if (error.message.includes("no pending rejoin request")) {
      return NextResponse.json({ error: "There is no pending rejoin request." }, { status: 404 });
    }
    if (error.message.includes("not allowed")) {
      return NextResponse.json({ error: "You do not own this session." }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  void notifyLiveSessionActivity(liveSessionId);
  return NextResponse.json({ ok: true });
}
