import type { StudentAnswers } from "@/lib/forms";
import { parseLiveTeacherFeedback, type LiveTeacherFeedbackByQuestionId } from "@/lib/live-teacher-feedback";

function answersFromJsonObject(raw: Record<string, unknown>): StudentAnswers {
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function resumeCodeFromObject(obj: Record<string, unknown>): string {
  const rc = obj.resumeCode;
  return typeof rc === "string" ? rc.trim().toUpperCase() : "";
}

const emptyParsed = {
  answers: {} as StudentAnswers,
  suspended: false,
  finished: false,
  displayName: "",
  liveTeacherFeedback: {} as LiveTeacherFeedbackByQuestionId,
  liveTeacherFeedbackEnabled: false,
  resumeCode: "",
};

/** Parses RPC / API payload: `{ answers, suspended, finished?, displayName?, resumeCode? }` or legacy flat answers object. */
export function parseLiveSessionStudentGet(data: unknown): {
  answers: StudentAnswers;
  suspended: boolean;
  finished: boolean;
  displayName: string;
  liveTeacherFeedback: LiveTeacherFeedbackByQuestionId;
  liveTeacherFeedbackEnabled: boolean;
  resumeCode: string;
} {
  if (data === null || data === undefined) {
    return { ...emptyParsed };
  }

  if (typeof data === "string") {
    try {
      return parseLiveSessionStudentGet(JSON.parse(data) as unknown);
    } catch {
      return { ...emptyParsed };
    }
  }

  if (typeof data !== "object" || Array.isArray(data)) {
    return { ...emptyParsed };
  }

  const obj = data as Record<string, unknown>;

  if ("suspended" in obj) {
    const answersRaw = obj.answers;
    const answers =
      answersRaw && typeof answersRaw === "object" && !Array.isArray(answersRaw)
        ? answersFromJsonObject(answersRaw as Record<string, unknown>)
        : {};
    const dn = obj.displayName;
    return {
      answers,
      suspended: Boolean(obj.suspended),
      finished: Boolean(obj.finished),
      displayName: typeof dn === "string" ? dn : "",
      liveTeacherFeedback: parseLiveTeacherFeedback(
        obj.liveTeacherFeedback ?? obj.live_teacher_feedback,
      ),
      liveTeacherFeedbackEnabled:
        obj.liveTeacherFeedbackEnabled === true || obj.live_teacher_feedback_enabled === true,
      resumeCode: resumeCodeFromObject(obj),
    };
  }

  return {
    answers: answersFromJsonObject(obj),
    suspended: false,
    finished: false,
    displayName: "",
    liveTeacherFeedback: {},
    liveTeacherFeedbackEnabled: false,
    resumeCode: "",
  };
}
