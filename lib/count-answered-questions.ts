import type { StudentAnswers } from "@/lib/forms";

/** Count questions with a non-empty saved answer. */
export function countAnsweredQuestions(
  answers: StudentAnswers,
  questionIds: readonly string[],
): number {
  let count = 0;
  for (const id of questionIds) {
    if ((answers[id] ?? "").trim().length > 0) {
      count += 1;
    }
  }
  return count;
}
