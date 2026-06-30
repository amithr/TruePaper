import { NextResponse } from "next/server";

import { isMissingDbFunctionError } from "@/lib/is-missing-db-function";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ liveSessionId: string; deviceId: string; feedbackId: string }>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(_request: Request, { params }: Params) {
  const { feedbackId: rawId } = await params;
  const feedbackId = decodeURIComponent(rawId).trim();

  if (!UUID_RE.test(feedbackId)) {
    return NextResponse.json({ error: "Invalid feedback id." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can delete feedback." }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("retract_feedback_item", { p_id: feedbackId });

  if (error) {
    if (isMissingDbFunctionError(error, "retract_feedback_item") || isMissingDbFunctionError(error)) {
      return NextResponse.json(
        { error: "Database is missing retract_feedback_item. Run migration 20260630120000_feedback_items.sql." },
        { status: 503 },
      );
    }
    if ((error.message ?? "").includes("not authenticated")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? { ok: true });
}
