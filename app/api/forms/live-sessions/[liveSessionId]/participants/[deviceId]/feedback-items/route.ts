import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { isMissingDbFunctionError } from "@/lib/is-missing-db-function";
import { notifyLiveSessionActivity } from "@/lib/notify-live-session-activity";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ liveSessionId: string; deviceId: string }>;
};

type PutBody = {
  id?: string;
  questionId?: string | null;
  body?: string;
  createdAt?: string;
  responseVersionTag?: string | null;
  anchor?: unknown;
};

const MAX_BODY_LEN = 4000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIGRATION_HINT =
  "Database is missing feedback_items RPCs. Run migration 20260630120000_feedback_items.sql.";

async function requireTeacher() {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) } as const;
  }
  if (session.profile?.role !== "teacher") {
    return {
      error: NextResponse.json({ error: "Only teachers can leave feedback." }, { status: 403 }),
    } as const;
  }
  return { supabase } as const;
}

function mapRpcError(error: { message?: string | null; code?: string | null }) {
  if (isMissingDbFunctionError(error, "feedback_item") || isMissingDbFunctionError(error)) {
    return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
  }
  const message = error.message ?? "Request failed.";
  if (message.includes("not authenticated")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (message.includes("not allowed")) {
    return NextResponse.json(
      { error: "Feedback is not enabled for this form, or you do not own this session." },
      { status: 403 },
    );
  }
  if (message.includes("question not found")) {
    return NextResponse.json({ error: "Question not found for this session." }, { status: 404 });
  }
  if (message.includes("body required")) {
    return NextResponse.json({ error: "Feedback text is required." }, { status: 400 });
  }
  if (message.includes("unsupported feedback type")) {
    return NextResponse.json({ error: "Only text feedback is supported." }, { status: 400 });
  }
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function PUT(request: Request, { params }: Params) {
  const { liveSessionId, deviceId: rawDeviceId } = await params;
  const deviceId = decodeURIComponent(rawDeviceId).trim().toLowerCase();
  const body = (await request.json()) as PutBody;

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "Invalid device id." }, { status: 400 });
  }

  const id = (body.id ?? "").trim();
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "A valid feedback id is required." }, { status: 400 });
  }

  const questionId = body.questionId?.trim() ?? "";
  if (questionId && !UUID_RE.test(questionId)) {
    return NextResponse.json({ error: "Invalid questionId." }, { status: 400 });
  }

  const text = (body.body ?? "").trim().slice(0, MAX_BODY_LEN);
  if (!text) {
    return NextResponse.json({ error: "Feedback text is required." }, { status: 400 });
  }

  const createdAt = body.createdAt && !Number.isNaN(Date.parse(body.createdAt))
    ? new Date(body.createdAt).toISOString()
    : new Date().toISOString();

  const auth = await requireTeacher();
  if ("error" in auth) {
    return auth.error;
  }

  const { data, error } = await auth.supabase.rpc("upsert_feedback_item", {
    p_id: id,
    p_live_session_id: liveSessionId,
    p_device_id: deviceId,
    p_question_id: questionId || null,
    p_type: "text",
    p_body: text,
    p_created_at: createdAt,
    p_response_version_tag: body.responseVersionTag ?? null,
    p_anchor: body.anchor ?? null,
  });

  if (error) {
    return mapRpcError(error);
  }

  try {
    void notifyLiveSessionActivity(liveSessionId);
  } catch {
    /* best effort */
  }

  return NextResponse.json({ ok: true, item: data });
}

export async function GET(_request: Request, { params }: Params) {
  const { liveSessionId, deviceId: rawDeviceId } = await params;
  const deviceId = decodeURIComponent(rawDeviceId).trim().toLowerCase();

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "Invalid device id." }, { status: 400 });
  }

  const auth = await requireTeacher();
  if ("error" in auth) {
    return auth.error;
  }

  const { data, error } = await auth.supabase.rpc("get_session_feedback_items", {
    p_live_session_id: liveSessionId,
    p_device_id: deviceId,
  });

  if (error) {
    return mapRpcError(error);
  }

  const items = typeof data === "string" ? JSON.parse(data) : (data ?? []);
  return NextResponse.json({ items: Array.isArray(items) ? items : [] });
}
