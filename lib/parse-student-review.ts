import type { Question, QuestionType, StudentAnswers } from "@/lib/forms";
import { parseLiveTeacherFeedback } from "@/lib/live-teacher-feedback";
import { parseStudentAnswersJson } from "@/lib/student-answers-json";

export type StudentReviewPayload = {
  formTitle: string;
  formDescription: string;
  displayName: string;
  finished: boolean;
  sessionOpen: boolean;
  questions: Question[];
  answers: StudentAnswers;
  liveTeacherFeedback: Record<string, string>;
};

function parseQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((row): Question | null => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return null;
      }
      const o = row as Record<string, unknown>;
      const typeRaw = o.type;
      const type: QuestionType =
        typeRaw === "multipleChoice" || typeRaw === "text" ? typeRaw : "text";
      const options = Array.isArray(o.options)
        ? o.options.filter((opt): opt is string => typeof opt === "string")
        : [];
      return {
        id: String(o.id ?? ""),
        prompt: String(o.prompt ?? ""),
        type,
        options,
        correctAnswer: null,
        points: Math.max(1, Number(o.points) || 1),
        displayOrder: Number(o.displayOrder) || 0,
      };
    })
    .filter((q): q is Question => q !== null && q.id.length > 0)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export function parseStudentReviewPayload(raw: unknown): StudentReviewPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  return {
    formTitle: typeof o.formTitle === "string" ? o.formTitle : "Form",
    formDescription: typeof o.formDescription === "string" ? o.formDescription : "",
    displayName: typeof o.displayName === "string" ? o.displayName : "",
    finished: o.finished === true,
    sessionOpen: o.sessionOpen === true,
    questions: parseQuestions(o.questions),
    answers: parseStudentAnswersJson(o.answers),
    liveTeacherFeedback: parseLiveTeacherFeedback(o.liveTeacherFeedback),
  };
}
