import type { StudentAnswers } from "@/lib/forms";

const DEFAULT_MAX_LEN = 96;

/** Longest non-empty text response among the form's text questions. */
export function longestTextAnswer(
  answers: StudentAnswers,
  textQuestionIds: readonly string[],
): string {
  let best = "";
  const ids =
    textQuestionIds.length > 0
      ? textQuestionIds
      : Object.keys(answers);
  for (const id of ids) {
    const value = (answers[id] ?? "").trim();
    if (value.length > best.length) {
      best = value;
    }
  }
  return best;
}

/** Truncate for roster subtitle (single line). */
export function truncateTypingPreview(text: string, maxLen = DEFAULT_MAX_LEN): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxLen - 1))}…`;
}

export function liveTypingPreview(
  answers: StudentAnswers,
  textQuestionIds: readonly string[],
  maxLen = DEFAULT_MAX_LEN,
): string {
  return truncateTypingPreview(longestTextAnswer(answers, textQuestionIds), maxLen);
}

/** Word count across text question answers. */
export function textAnswerWordCount(
  answers: StudentAnswers,
  textQuestionIds: readonly string[],
): number {
  const ids =
    textQuestionIds.length > 0
      ? textQuestionIds
      : Object.keys(answers);
  let total = 0;
  for (const id of ids) {
    const words = (answers[id] ?? "").trim().split(/\s+/).filter(Boolean);
    total += words.length;
  }
  return total;
}
