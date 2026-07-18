import type { Question, QuestionType, StudentAnswers } from "@/lib/forms";
import { parseLiveTeacherFeedback } from "@/lib/live-teacher-feedback";
import { parseResponseConfig } from "@/lib/response-types/registry";
import { normalizeResponseType } from "@/lib/response-types/types";
import { parseStudentAnswersJson } from "@/lib/student-answers-json";

export type StudentReviewQuestion = Question & {
  earnedPoints: number | null;
};

export type StudentReviewPayload = {
  formTitle: string;
  formDescription: string;
  descriptionImagePath: string | null;
  displayName: string;
  finished: boolean;
  graded: boolean;
  pointsEarned: number | null;
  pointsPossible: number | null;
  sessionOpen: boolean;
  questions: StudentReviewQuestion[];
  answers: StudentAnswers;
  liveTeacherFeedback: Record<string, string>;
};

function parseQuestions(raw: unknown): StudentReviewQuestion[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((row): StudentReviewQuestion | null => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return null;
      }
      const o = row as Record<string, unknown>;
      const typeRaw = typeof o.type === "string" ? o.type : "text";
      const type: QuestionType = normalizeResponseType(typeRaw);
      const options = Array.isArray(o.options)
        ? o.options.filter((opt): opt is string => typeof opt === "string")
        : [];
      return {
        id: String(o.id ?? ""),
        prompt: String(o.prompt ?? ""),
        promptImagePath:
          typeof o.promptImagePath === "string" && o.promptImagePath.trim()
            ? o.promptImagePath.trim()
            : null,
        type,
        options,
        correctAnswer: null,
        points: Math.max(1, Number(o.points) || 1),
        displayOrder: Number(o.displayOrder) || 0,
        responseConfig: parseResponseConfig(type, o.responseConfig),
        earnedPoints:
          typeof o.earnedPoints === "number" && Number.isFinite(o.earnedPoints)
            ? Math.max(0, Math.floor(o.earnedPoints))
            : null,
      };
    })
    .filter((q): q is StudentReviewQuestion => q !== null && q.id.length > 0)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export function parseStudentReviewPayload(raw: unknown): StudentReviewPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const pe = o.pointsEarned;
  const pp = o.pointsPossible;
  return {
    formTitle: typeof o.formTitle === "string" ? o.formTitle : "Form",
    formDescription: typeof o.formDescription === "string" ? o.formDescription : "",
    descriptionImagePath:
      typeof o.descriptionImagePath === "string" && o.descriptionImagePath.trim()
        ? o.descriptionImagePath.trim()
        : null,
    displayName: typeof o.displayName === "string" ? o.displayName : "",
    finished: o.finished === true,
    graded: o.graded === true,
    pointsEarned: typeof pe === "number" && Number.isFinite(pe) ? pe : null,
    pointsPossible: typeof pp === "number" && Number.isFinite(pp) ? pp : null,
    sessionOpen: o.sessionOpen === true,
    questions: parseQuestions(o.questions),
    answers: parseStudentAnswersJson(o.answers),
    liveTeacherFeedback: parseLiveTeacherFeedback(o.liveTeacherFeedback),
  };
}
