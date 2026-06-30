import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { isMissingDbFunctionError } from "@/lib/is-missing-db-function";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

type Body = {
  deviceId?: string;
  ids?: unknown;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const body = (await request.json().catch(() => ({}))) as Body;
  const deviceId = (body.deviceId ?? "").trim();

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "A valid deviceId is required." }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((v): v is string => typeof v === "string" && UUID_RE.test(v)).slice(0, 200)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, delivered: 0 });
  }

  try {
    const supabase = createSupabaseAnonServiceClient();
    const { data, error } = await supabase.rpc("confirm_feedback_items_delivered", {
      p_live_session_id: liveSessionId,
      p_device_id: deviceId,
      p_ids: ids,
    });

    if (error) {
      if (
        isMissingDbFunctionError(error, "confirm_feedback_items_delivered") ||
        isMissingDbFunctionError(error)
      ) {
        return NextResponse.json({ ok: true, delivered: 0 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? { ok: true, delivered: 0 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
