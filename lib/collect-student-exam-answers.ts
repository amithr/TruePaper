import type { Question, StudentAnswers } from "@/lib/forms";

/** Merge ref-backed answers with live textarea values (source of truth while typing). */
export function mergeStudentAnswersForSave(
  base: StudentAnswers,
  formEl: HTMLFormElement | null,
  textQuestions: Question[],
): StudentAnswers {
  const merged = { ...base };
  if (!formEl) {
    return merged;
  }
  for (const question of textQuestions) {
    if (question.type !== "text") {
      continue;
    }
    const field = formEl.querySelector<HTMLTextAreaElement>(
      `textarea#${CSS.escape(question.id)}`,
    );
    if (field) {
      merged[question.id] = field.value;
    }
  }
  return merged;
}
