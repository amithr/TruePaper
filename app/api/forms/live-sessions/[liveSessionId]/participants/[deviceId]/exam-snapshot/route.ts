import { NextResponse } from "next/server";

import { isValidAnonymousSessionId } from "@/lib/anonymous-session";
import { parseQuestionGrades, sumEarnedPoints, sumPossiblePoints } from "@/lib/exam-grades";
import { buildForms } from "@/lib/forms-api";
import type { Form } from "@/lib/forms";
import { isMissingColumnError } from "@/lib/is-missing-db-column";
import { parseStudentAnswersJson } from "@/lib/student-answers-json";
import { parseLiveTeacherFeedback } from "@/lib/live-teacher-feedback";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ liveSessionId: string; deviceId: string }>;
};

const RESPONSE_SELECT_WITH_NAME =
  "answers, student_display_name, suspended_at, finished_at, text_graded_at, text_grades, last_activity_at, updated_at, live_teacher_feedback, student_resume_code";
const RESPONSE_SELECT_LEGACY =
  "answers, suspended_at, finished_at, last_activity_at, updated_at";
const FORM_SELECT =
  "id, title, description, description_image_path, created_by, live_teacher_feedback_enabled";
const FORM_SELECT_LEGACY = "id, title, description, created_by";

function sessionWindowOpen(opensAt: string, closesAt: string, nowMs: number): boolean {
  return nowMs >= new Date(opensAt).getTime() && nowMs <= new Date(closesAt).getTime();
}

export async function GET(_request: Request, { params }: Params) {
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

  let formRow: Record<string, unknown> | null = null;
  const formPrimary = await supabase.from("forms").select(FORM_SELECT).eq("id", formId).maybeSingle();
  if (formPrimary.error && isMissingColumnError(formPrimary.error, "live_teacher_feedback_enabled")) {
    const formRetry = await supabase.from("forms").select(FORM_SELECT_LEGACY).eq("id", formId).maybeSingle();
    if (formRetry.error) {
      return NextResponse.json({ error: formRetry.error.message }, { status: 500 });
    }
    formRow = formRetry.data as Record<string, unknown> | null;
  } else if (formPrimary.error) {
    return NextResponse.json({ error: formPrimary.error.message }, { status: 500 });
  } else {
    formRow = formPrimary.data as Record<string, unknown> | null;
  }

  if (!formRow) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  const { data: questionRows, error: qError } = await supabase
    .from("questions")
    .select(
      "id, form_id, prompt, prompt_image_path, question_type, options, correct_answer, points, display_order, response_config",
    )
    .eq("form_id", formId)
    .order("display_order", { ascending: true });

  if (qError) {
    return NextResponse.json({ error: qError.message }, { status: 500 });
  }

  const formRowTyped = {
    id: formRow!.id as string,
    title: formRow!.title as string,
    description: (formRow!.description as string | null) ?? "",
    description_image_path: (formRow!.description_image_path as string | null) ?? null,
    created_by: (formRow!.created_by as string | null) ?? null,
    live_teacher_feedback_enabled: formRow!.live_teacher_feedback_enabled === true,
  };
  const [form] = buildForms([formRowTyped], questionRows ?? []);

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

  if (rowError && isMissingColumnError(rowError, "live_teacher_feedback")) {
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

  if (rowError && isMissingColumnError(rowError, "student_resume_code")) {
    const retry = await supabase
      .from("form_responses")
      .select(RESPONSE_SELECT_WITH_NAME.replace(", student_resume_code", ""))
      .eq("live_session_id", liveSessionId)
      .eq("anonymous_session_id", deviceId)
      .is("student_id", null)
      .maybeSingle();
    row = retry.data as Record<string, unknown> | null;
    rowError = retry.error;
  }

  if (rowError && isMissingColumnError(rowError, "text_graded_at")) {
    const retry = await supabase
      .from("form_responses")
      .select(
        RESPONSE_SELECT_WITH_NAME.replace(", text_graded_at, text_grades", "").replace(
          ", student_resume_code",
          "",
        ),
      )
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

  // Activity + hand-raise live in the narrow presence table now (heartbeats
  // stopped rewriting form_responses). Fall back to the row column for
  // pre-migration data. Match device id case-insensitively — presence rows
  // may retain the casing from register.
  const presencePrimary = await supabase
    .from("live_session_presence")
    .select(
      "last_activity_at, last_typing_at, last_seen_at, focus_question_id, hand_raise_question_id, hand_raised_at, anonymous_session_id",
    )
    .eq("live_session_id", liveSessionId);

  let presenceLastActivity: string | null = null;
  let presenceLastTyping: string | null = null;
  let presenceLastSeen: string | null = null;
  let focusQuestionId: string | null = null;
  let handRaiseQuestionId: string | null = null;
  let handRaisedAt: string | null = null;
  if (!presencePrimary.error) {
    const match = (presencePrimary.data ?? []).find(
      (p) =>
        typeof p.anonymous_session_id === "string" &&
        p.anonymous_session_id.toLowerCase() === deviceId,
    );
    if (match) {
      presenceLastActivity =
        typeof match.last_activity_at === "string" ? match.last_activity_at : null;
      presenceLastTyping =
        typeof match.last_typing_at === "string" ? match.last_typing_at : null;
      presenceLastSeen = typeof match.last_seen_at === "string" ? match.last_seen_at : null;
      focusQuestionId =
        typeof match.focus_question_id === "string" ? match.focus_question_id : null;
      handRaiseQuestionId =
        typeof match.hand_raise_question_id === "string" ? match.hand_raise_question_id : null;
      handRaisedAt = typeof match.hand_raised_at === "string" ? match.hand_raised_at : null;
    }
  } else if (
    isMissingColumnError(presencePrimary.error, "focus_question_id") ||
    isMissingColumnError(presencePrimary.error, "hand_raised_at")
  ) {
    const legacy = await supabase
      .from("live_session_presence")
      .select(
        "last_activity_at, last_typing_at, last_seen_at, hand_raise_question_id, hand_raised_at, anonymous_session_id",
      )
      .eq("live_session_id", liveSessionId);
    if (!legacy.error) {
      const match = (legacy.data ?? []).find(
        (p) =>
          typeof p.anonymous_session_id === "string" &&
          p.anonymous_session_id.toLowerCase() === deviceId,
      );
      if (match) {
        presenceLastActivity =
          typeof match.last_activity_at === "string" ? match.last_activity_at : null;
        presenceLastTyping =
          typeof match.last_typing_at === "string" ? match.last_typing_at : null;
        presenceLastSeen = typeof match.last_seen_at === "string" ? match.last_seen_at : null;
        handRaiseQuestionId =
          typeof match.hand_raise_question_id === "string" ? match.hand_raise_question_id : null;
        handRaisedAt = typeof match.hand_raised_at === "string" ? match.hand_raised_at : null;
      }
    } else if (isMissingColumnError(legacy.error, "hand_raised_at")) {
      const older = await supabase
        .from("live_session_presence")
        .select("last_activity_at, last_typing_at, last_seen_at, anonymous_session_id")
        .eq("live_session_id", liveSessionId);
      if (!older.error) {
        const match = (older.data ?? []).find(
          (p) =>
            typeof p.anonymous_session_id === "string" &&
            p.anonymous_session_id.toLowerCase() === deviceId,
        );
        presenceLastActivity =
          typeof match?.last_activity_at === "string" ? match.last_activity_at : null;
        presenceLastTyping =
          typeof match?.last_typing_at === "string" ? match.last_typing_at : null;
        presenceLastSeen =
          typeof match?.last_seen_at === "string" ? match.last_seen_at : null;
      }
    }
  }

  const nowMs = Date.now();
  const answers = parseStudentAnswersJson(row?.answers);
  const displayName =
    typeof row?.student_display_name === "string" ? row.student_display_name.trim() : "";
  const suspended = Boolean(row?.suspended_at);
  const finished = Boolean(row?.finished_at);
  const gradedAt = typeof row?.text_graded_at === "string" ? row.text_graded_at : null;
  const graded = Boolean(gradedAt);
  const questionGrades = parseQuestionGrades(row?.text_grades);
  const lastActivityAt =
    presenceLastActivity ?? (typeof row?.last_activity_at === "string" ? row.last_activity_at : null);
  const updatedAt = typeof row?.updated_at === "string" ? row.updated_at : null;

  const pointsPossible = sumPossiblePoints(form.questions);
  const pointsEarned = graded ? sumEarnedPoints(questionGrades, form.questions) : null;

  const studentResumeCode =
    typeof row?.student_resume_code === "string" ? row.student_resume_code.trim().toUpperCase() : "";

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
      graded,
      gradedAt,
      lastActivityAt,
      lastTypingAt: presenceLastTyping,
      lastSeenAt: presenceLastSeen,
      focusQuestionId,
      hasJoined: row != null,
      handRaiseQuestionId:
        handRaisedAt && handRaiseQuestionId ? handRaiseQuestionId : null,
      handRaisedAt: handRaisedAt && handRaiseQuestionId ? handRaisedAt : null,
    },
    form: form as Form,
    answers,
    questionGrades,
    pointsEarned,
    pointsPossible,
    liveTeacherFeedback: parseLiveTeacherFeedback(row?.live_teacher_feedback),
    studentResumeCode: studentResumeCode || null,
    updatedAt,
  });
}
