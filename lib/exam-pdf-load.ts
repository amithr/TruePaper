import type { SupabaseClient } from "@supabase/supabase-js";

import { parseQuestionGrades, sumEarnedPoints, sumPossiblePoints } from "@/lib/exam-grades";
import type { Form } from "@/lib/forms";
import { buildForms } from "@/lib/forms-api";
import { isMissingColumnError } from "@/lib/is-missing-db-column";
import { parseLiveTeacherFeedback, type LiveTeacherFeedbackByQuestionId } from "@/lib/live-teacher-feedback";
import { parseStudentAnswersJson } from "@/lib/student-answers-json";

const RESPONSE_SELECT_FULL =
  "anonymous_session_id, student_display_name, answers, suspended_at, finished_at, text_graded_at, text_grades, last_activity_at, updated_at, live_teacher_feedback";

const RESPONSE_SELECT_FALLBACK =
  "anonymous_session_id, student_display_name, answers, suspended_at, finished_at, last_activity_at, updated_at, live_teacher_feedback";

const FORM_SELECT =
  "id, title, description, description_image_path, created_by, live_teacher_feedback_enabled";
const FORM_SELECT_LEGACY = "id, title, description, created_by";

export type ExamPdfSession = {
  id: string;
  joinCode: string;
  opensAt: string;
  closesAt: string;
  formTitle: string;
};

export type ExamPdfStudent = {
  anonymousSessionId: string;
  displayName: string;
  suspended: boolean;
  finished: boolean;
  graded: boolean;
  gradedAt: string | null;
  finishedAt: string | null;
  lastActivityAt: string | null;
  hasJoined: boolean;
  answers: Record<string, string>;
  liveTeacherFeedback: LiveTeacherFeedbackByQuestionId;
  questionGrades: Record<string, number>;
  pointsEarned: number | null;
  pointsPossible: number;
};

export type LoadedSessionForPdf = {
  session: ExamPdfSession;
  form: Form;
};

type FormRow = {
  id: string;
  title: string;
  description: string | null;
  description_image_path?: string | null;
  created_by: string | null;
  live_teacher_feedback_enabled?: boolean | null;
};

type StudentResponseRow = Record<string, unknown>;

/** Look up the form + session for a teacher-owned live session, or return null if not owned. */
export async function loadSessionForPdf(
  supabase: SupabaseClient,
  userId: string,
  liveSessionId: string,
): Promise<LoadedSessionForPdf | null> {
  const { data: fs, error: fsError } = await supabase
    .from("form_sessions")
    .select("id, join_code, opens_at, closes_at, form_id, forms ( title )")
    .eq("id", liveSessionId)
    .eq("created_by", userId)
    .maybeSingle();

  if (fsError) {
    throw new Error(fsError.message);
  }
  if (!fs) {
    return null;
  }

  const formId = fs.form_id as string;
  let formRow: FormRow | null = null;
  const formPrimary = await supabase.from("forms").select(FORM_SELECT).eq("id", formId).maybeSingle();
  if (formPrimary.error && isMissingColumnError(formPrimary.error, "live_teacher_feedback_enabled")) {
    const formRetry = await supabase.from("forms").select(FORM_SELECT_LEGACY).eq("id", formId).maybeSingle();
    if (formRetry.error) {
      throw new Error(formRetry.error.message);
    }
    formRow = formRetry.data as FormRow | null;
  } else if (formPrimary.error) {
    throw new Error(formPrimary.error.message);
  } else {
    formRow = formPrimary.data as FormRow | null;
  }

  if (!formRow) {
    return null;
  }

  const { data: questionRows, error: qError } = await supabase
    .from("questions")
    .select(
      "id, form_id, prompt, prompt_image_path, question_type, options, correct_answer, points, display_order, response_config",
    )
    .eq("form_id", formId)
    .order("display_order", { ascending: true });

  if (qError) {
    throw new Error(qError.message);
  }

  const [form] = buildForms(
    [
      {
        id: formRow.id,
        title: formRow.title,
        description: formRow.description ?? "",
        description_image_path: formRow.description_image_path ?? null,
        created_by: formRow.created_by,
        live_teacher_feedback_enabled: formRow.live_teacher_feedback_enabled === true,
      },
    ],
    questionRows ?? [],
  );

  const formsNested = fs.forms as { title: string } | { title: string }[] | null;
  const nestedTitle = Array.isArray(formsNested) ? formsNested[0]?.title : formsNested?.title;

  return {
    session: {
      id: fs.id as string,
      joinCode: fs.join_code as string,
      opensAt: fs.opens_at as string,
      closesAt: fs.closes_at as string,
      formTitle: nestedTitle?.trim() || form.title || "Form",
    },
    form,
  };
}

async function selectResponseRows(
  supabase: SupabaseClient,
  liveSessionId: string,
  deviceId?: string,
): Promise<StudentResponseRow[]> {
  const baseSelect = (select: string) => {
    let q = supabase
      .from("form_responses")
      .select(select)
      .eq("live_session_id", liveSessionId)
      .is("student_id", null);
    if (deviceId) {
      q = q.eq("anonymous_session_id", deviceId.toLowerCase());
    }
    return q;
  };

  const primary = await baseSelect(RESPONSE_SELECT_FULL);

  if (primary.error && isMissingColumnError(primary.error, "text_graded_at")) {
    const retry = await baseSelect(RESPONSE_SELECT_FALLBACK);
    if (retry.error) {
      throw new Error(retry.error.message);
    }
    return (retry.data ?? []) as unknown as StudentResponseRow[];
  }

  if (primary.error) {
    throw new Error(primary.error.message);
  }

  return (primary.data ?? []) as unknown as StudentResponseRow[];
}

function mapStudentRow(row: StudentResponseRow, form: Form): ExamPdfStudent {
  const answers = parseStudentAnswersJson(row.answers);
  const liveTeacherFeedback = parseLiveTeacherFeedback(row.live_teacher_feedback);
  const questionGrades = parseQuestionGrades(row.text_grades);
  const finishedAt = typeof row.finished_at === "string" ? row.finished_at : null;
  const gradedAt = typeof row.text_graded_at === "string" ? row.text_graded_at : null;
  const lastActivityAt = typeof row.last_activity_at === "string" ? row.last_activity_at : null;
  const displayName = typeof row.student_display_name === "string" ? row.student_display_name.trim() : "";
  const pointsPossible = sumPossiblePoints(form.questions);
  const pointsEarned = gradedAt ? sumEarnedPoints(questionGrades, form.questions) : null;
  return {
    anonymousSessionId: (row.anonymous_session_id as string | null)?.toLowerCase() ?? "",
    displayName,
    suspended: Boolean(row.suspended_at),
    finished: Boolean(finishedAt),
    graded: Boolean(gradedAt),
    finishedAt,
    gradedAt,
    lastActivityAt,
    hasJoined: true,
    answers,
    liveTeacherFeedback,
    questionGrades,
    pointsEarned,
    pointsPossible,
  };
}

export async function loadStudentForPdf(
  supabase: SupabaseClient,
  liveSessionId: string,
  deviceId: string,
  form: Form,
): Promise<ExamPdfStudent | null> {
  const rows = await selectResponseRows(supabase, liveSessionId, deviceId);
  if (rows.length === 0) {
    return null;
  }
  return mapStudentRow(rows[0], form);
}

export async function loadAllStudentsForPdf(
  supabase: SupabaseClient,
  liveSessionId: string,
  form: Form,
): Promise<ExamPdfStudent[]> {
  const rows = await selectResponseRows(supabase, liveSessionId);
  const mapped = rows.map((row) => mapStudentRow(row, form));
  return mapped.sort((a, b) => {
    const left = a.displayName || a.anonymousSessionId;
    const right = b.displayName || b.anonymousSessionId;
    return left.localeCompare(right, undefined, { sensitivity: "base" });
  });
}
