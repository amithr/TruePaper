import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { isMissingDbFunctionError } from "@/lib/is-missing-db-function";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";
import type { StudentFeedbackItem } from "@/lib/feedback-items";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

type Payload = {
  enabled?: boolean;
  items?: StudentFeedbackItem[];
};

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
    const { data, error } = await supabase.rpc("get_student_feedback_items", {
      p_live_session_id: liveSessionId,
      p_device_id: deviceId,
    });

    if (error) {
      if (isMissingDbFunctionError(error, "get_student_feedback_items") || isMissingDbFunctionError(error)) {
        // Pre-migration: degrade gracefully so the exam UI keeps working.
        return NextResponse.json({ enabled: false, items: [] });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const payload = (typeof data === "string" ? JSON.parse(data) : data) as Payload;
    return NextResponse.json({
      enabled: payload?.enabled === true,
      items: Array.isArray(payload?.items) ? payload!.items : [],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
