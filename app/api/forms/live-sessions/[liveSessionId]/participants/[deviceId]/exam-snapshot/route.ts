import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { buildForms } from "@/lib/forms-api";
import type { Form } from "@/lib/forms";
import { isMissingColumnError } from "@/lib/is-missing-db-column";
import { parseStudentAnswersJson } from "@/lib/student-answers-json";
import { parseTextQuestionGrades } from "@/lib/text-grades";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ liveSessionId: string; deviceId: string }>;
};

const RESPONSE_SELECT_WITH_NAME =
  "answers, student_display_name, suspended_at, finished_at, last_activity_at, updated_at, text_grades, text_graded_at";
const RESPONSE_SELECT_LEGACY =
  "answers, suspended_at, finished_at, last_activity_at, updated_at, text_grades, text_graded_at";

function sessionWindowOpen(opensAt: string, closesAt: string, nowMs: number): boolean {
  return nowMs >= new Date(opensAt).getTime() && nowMs <= new Date(closesAt).getTime();
}

export async function GET(_request: Request, { params }: Params) {
  const { liveSessionId, deviceId: rawDeviceId } = await params;
  const deviceId = decodeURIComponent(rawDeviceId).trim();

  if (!isValidAnonymousSessionId(deviceId)) {
    return NextResponse.json({ error: "Invalid device id." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can view student exams." }, { status: 403 });
  }

  const { data: fs, error: fsError } = await supabase
    .from("form_sessions")
    .select("id, join_code, opens_at, closes_at, form_id")
    .eq("id", liveSessionId)
    .eq("created_by", session.user.id)
    .maybeSingle();

  if (fsError) {
    return NextResponse.json({ error: fsError.message }, { status: 500 });
  }

  if (!fs) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const formId = fs.form_id as string;

  const { data: formRow, error: formError } = await supabase
    .from("forms")
    .select("id, title, description, created_by")
    .eq("id", formId)
    .maybeSingle();

  if (formError) {
    return NextResponse.json({ error: formError.message }, { status: 500 });
  }

  if (!formRow) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  const { data: questionRows, error: qError } = await supabase
    .from("questions")
    .select("id, form_id, prompt, question_type, options, correct_answer, points, display_order")
    .eq("form_id", formId)
    .order("display_order", { ascending: true });

  if (qError) {
    return NextResponse.json({ error: qError.message }, { status: 500 });
  }

  const [form] = buildForms([formRow], questionRows ?? []);

  const primary = await supabase
    .from("form_responses")
    .select(RESPONSE_SELECT_WITH_NAME)
    .eq("live_session_id", liveSessionId)
    .eq("anonymous_session_id", deviceId)
    .is("student_id", null)
    .maybeSingle();

  let row = primary.data as Record<string, unknown> | null;
  let rowError = primary.error;

  if (rowError && isMissingColumnError(rowError, "student_display_name")) {
    const retry = await supabase
      .from("form_responses")
      .select(RESPONSE_SELECT_LEGACY)
      .eq("live_session_id", liveSessionId)
      .eq("anonymous_session_id", deviceId)
      .is("student_id", null)
      .maybeSingle();
    row = retry.data as Record<string, unknown> | null;
    rowError = retry.error;
  }

  if (rowError) {
    return NextResponse.json({ error: rowError.message }, { status: 500 });
  }

  const nowMs = Date.now();
  const answers = parseStudentAnswersJson(row?.answers);
  const displayName =
    typeof row?.student_display_name === "string" ? row.student_display_name.trim() : "";
  const suspended = Boolean(row?.suspended_at);
  const finished = Boolean(row?.finished_at);
  const lastActivityAt = typeof row?.last_activity_at === "string" ? row.last_activity_at : null;
  const updatedAt = typeof row?.updated_at === "string" ? row.updated_at : null;

  return NextResponse.json({
    session: {
      id: fs.id,
      joinCode: fs.join_code,
      opensAt: fs.opens_at,
      closesAt: fs.closes_at,
      sessionOpen: sessionWindowOpen(fs.opens_at as string, fs.closes_at as string, nowMs),
    },
    student: {
      anonymousSessionId: deviceId,
      displayName,
      suspended,
      finished,
      lastActivityAt,
      hasJoined: row != null,
    },
    form: form as Form,
    answers,
    textGrades: parseTextQuestionGrades(row?.text_grades),
    textGradedAt: typeof row?.text_graded_at === "string" ? row.text_graded_at : null,
    updatedAt,
  });
}
