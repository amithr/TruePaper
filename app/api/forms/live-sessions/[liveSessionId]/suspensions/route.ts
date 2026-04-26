import { NextResponse } from "next/server";

import { isMissingColumnError } from "@/lib/is-missing-db-column";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

export type SuspendedStudentRow = {
  anonymousSessionId: string;
  displayName: string;
  suspendedAt: string;
};

type SuspensionQueryRow = {
  anonymous_session_id: string | null;
  student_display_name?: string | null;
  suspended_at: string | null;
};

export async function GET(_request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can view suspensions." }, { status: 403 });
  }

  const { data: owns, error: ownsError } = await supabase
    .from("form_sessions")
    .select("id")
    .eq("id", liveSessionId)
    .eq("created_by", session.user.id)
    .maybeSingle();

  if (ownsError) {
    return NextResponse.json({ error: ownsError.message }, { status: 500 });
  }

  if (!owns) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const primary = await supabase
    .from("form_responses")
    .select("anonymous_session_id, student_display_name, suspended_at")
    .eq("live_session_id", liveSessionId);

  let rows: SuspensionQueryRow[] | null = primary.data as SuspensionQueryRow[] | null;
  let error = primary.error;

  if (error && isMissingColumnError(error, "student_display_name")) {
    const retry = await supabase
      .from("form_responses")
      .select("anonymous_session_id, suspended_at")
      .eq("live_session_id", liveSessionId);
    rows = retry.data as SuspensionQueryRow[] | null;
    error = retry.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const students: SuspendedStudentRow[] = (rows ?? [])
    .filter((r) => Boolean(r.anonymous_session_id) && r.suspended_at != null)
    .map((r) => ({
      anonymousSessionId: r.anonymous_session_id as string,
      displayName: (r.student_display_name as string | null | undefined)?.trim() ?? "",
      suspendedAt: r.suspended_at as string,
    }));

  return NextResponse.json({ students });
}
