import { NextResponse } from "next/server";

import { parseQuestionGrades, sumEarnedPoints, sumPossiblePoints } from "@/lib/exam-grades";
import { isMissingColumnError } from "@/lib/is-missing-db-column";
import { finalizeLiveSessionIfClosed } from "@/lib/live-session-finalize";
import { computeLiveParticipantUiStatus } from "@/lib/participant-status";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const FORM_RESPONSES_OVERVIEW_SELECT_WITH_NAME =
  "anonymous_session_id, student_display_name, suspended_at, finished_at, text_graded_at, text_grades, last_activity_at, last_typing_at, updated_at";
const FORM_RESPONSES_OVERVIEW_SELECT_LEGACY =
  "anonymous_session_id, suspended_at, finished_at, last_activity_at, last_typing_at, updated_at";

type FormResponseOverviewRow = {
  anonymous_session_id: string | null;
  student_display_name?: string | null;
  suspended_at: string | null;
  finished_at: string | null;
  text_graded_at?: string | null;
  text_grades?: unknown;
  last_activity_at: string | null;
  last_typing_at: string | null;
  updated_at: string;
};

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

function sessionWindowOpen(opensAt: string, closesAt: string, nowMs: number): boolean {
  return nowMs >= new Date(opensAt).getTime() && nowMs <= new Date(closesAt).getTime();
}

export async function GET(_request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can view session details." }, { status: 403 });
  }

  const { data: fs, error: fsError } = await supabase
    .from("form_sessions")
    .select("id, join_code, opens_at, closes_at, form_id, forms ( title )")
    .eq("id", liveSessionId)
    .eq("created_by", session.user.id)
    .maybeSingle();

  if (fsError) {
    return NextResponse.json({ error: fsError.message }, { status: 500 });
  }

  if (!fs) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const forms = fs.forms as { title: string } | { title: string }[] | null;
  const formTitle = Array.isArray(forms) ? forms[0]?.title : forms?.title;

  const nowMs = Date.now();
  const windowOpen = sessionWindowOpen(fs.opens_at, fs.closes_at, nowMs);
  if (!windowOpen) {
    try {
      await finalizeLiveSessionIfClosed(supabase, liveSessionId);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Could not finalize session." },
        { status: 500 },
      );
    }
  }

  const primary = await supabase
    .from("form_responses")
    .select(FORM_RESPONSES_OVERVIEW_SELECT_WITH_NAME)
    .eq("live_session_id", liveSessionId)
    .is("student_id", null);

  let rows: FormResponseOverviewRow[] | null = primary.data as FormResponseOverviewRow[] | null;
  let rowsError = primary.error;

  if (rowsError && isMissingColumnError(rowsError, "student_display_name")) {
    const retry = await supabase
      .from("form_responses")
      .select(FORM_RESPONSES_OVERVIEW_SELECT_LEGACY)
      .eq("live_session_id", liveSessionId)
      .is("student_id", null);
    rows = retry.data as FormResponseOverviewRow[] | null;
    rowsError = retry.error;
  }

  if (rowsError && isMissingColumnError(rowsError, "text_graded_at")) {
    const retry = await supabase
      .from("form_responses")
      .select(FORM_RESPONSES_OVERVIEW_SELECT_WITH_NAME.replace(", text_graded_at, text_grades", ""))
      .eq("live_session_id", liveSessionId)
      .is("student_id", null);
    rows = retry.data as FormResponseOverviewRow[] | null;
    rowsError = retry.error;
  }

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  const { data: questionRows, error: qError } = await supabase
    .from("questions")
    .select("id, points")
    .eq("form_id", fs.form_id as string);

  if (qError) {
    return NextResponse.json({ error: qError.message }, { status: 500 });
  }

  const questions = (questionRows ?? []).map((q) => ({
    id: q.id as string,
    points: Math.max(1, Math.floor(Number(q.points) || 1)),
  }));
  const pointsPossible = sumPossiblePoints(questions);

  const participants = (rows ?? []).map((r) => {
    const suspendedAt = r.suspended_at as string | null;
    const finishedAt = r.finished_at as string | null;
    const gradedAt = (r.text_graded_at as string | null | undefined) ?? null;
    const lastActivityAt = r.last_activity_at as string | null;
    const lastTypingAt = r.last_typing_at as string | null;
    const grades = parseQuestionGrades(r.text_grades);
    const pointsEarned = gradedAt ? sumEarnedPoints(grades, questions) : null;
    return {
      anonymousSessionId: r.anonymous_session_id as string,
      displayName: (r.student_display_name as string | null | undefined)?.trim() ?? "",
      status: computeLiveParticipantUiStatus(
        { suspendedAt, finishedAt, gradedAt, lastActivityAt, lastTypingAt },
        windowOpen,
      ),
      suspendedAt,
      finishedAt,
      gradedAt,
      pointsEarned,
      pointsPossible: gradedAt ? pointsPossible : null,
      lastActivityAt,
      lastTypingAt,
      updatedAt: r.updated_at as string,
    };
  });

  return NextResponse.json({
    session: {
      id: fs.id,
      joinCode: fs.join_code,
      opensAt: fs.opens_at,
      closesAt: fs.closes_at,
      formId: fs.form_id,
      formTitle: formTitle?.trim() || "Form",
      sessionOpen: windowOpen,
    },
    participants,
  });
}
