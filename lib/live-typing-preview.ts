import type { StudentAnswers } from "@/lib/forms";
import { previewResponseText } from "@/lib/response-types/answers";
import { isWrittenResponseType, normalizeResponseType } from "@/lib/response-types/types";

const DEFAULT_MAX_LEN = 96;

export type RosterPreviewQuestion = { id: string; type: string };

/** Questions whose answers appear as live roster subtitles. */
export function rosterPreviewQuestions(
  questions: readonly RosterPreviewQuestion[],
): RosterPreviewQuestion[] {
  return questions.filter((q) => isWrittenResponseType(normalizeResponseType(q.type)));
}

export function rosterPreviewQuestionIds(
  questions: readonly RosterPreviewQuestion[],
): string[] {
  return rosterPreviewQuestions(questions).map((q) => q.id);
}

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

/** Type-aware roster preview (extendedWritten, shortAnswer, structuredMultiPart, …). */
export function liveSessionRosterPreview(
  answers: StudentAnswers,
  questions: readonly RosterPreviewQuestion[],
  maxLen = DEFAULT_MAX_LEN,
): string {
  let best = "";
  for (const q of rosterPreviewQuestions(questions)) {
    const chunk = previewResponseText(normalizeResponseType(q.type), answers[q.id], maxLen);
    if (chunk.length > best.length) {
      best = chunk;
    }
  }
  return truncateTypingPreview(best, maxLen);
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
