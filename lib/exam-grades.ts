import type { Question } from "@/lib/forms";

/** Per-question earned points stored on form_responses.text_grades. */
export function parseQuestionGrades(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== "string" || !key.trim()) {
      continue;
    }
    const n = Number(value);
    if (Number.isFinite(n)) {
      out[key] = Math.max(0, Math.floor(n));
    }
  }
  return out;
}

export function sumPossiblePoints(questions: Pick<Question, "points">[]): number {
  return questions.reduce((sum, q) => sum + Math.max(1, Math.floor(Number(q.points) || 1)), 0);
}

export function sumEarnedPoints(
  grades: Record<string, number>,
  questions: Pick<Question, "id">[],
): number {
  return questions.reduce((sum, q) => sum + (grades[q.id] ?? 0), 0);
}

export function mcEarnedPoints(question: Question, answer: string | undefined): number {
  if (question.type !== "multipleChoice") {
    return 0;
  }
  if (!answer?.trim() || !question.correctAnswer) {
    return 0;
  }
  return answer.trim() === question.correctAnswer ? Math.max(1, question.points) : 0;
}

export function formatPointsScore(earned: number, possible: number): string {
  return `${earned} / ${possible} pt${possible === 1 ? "" : "s"}`;
}

/** Percentage 0–100 (rounded). Returns 0 when possible is 0. */
export function scorePercent(earned: number, possible: number): number {
  if (!Number.isFinite(possible) || possible <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((earned / possible) * 100)));
}

export type ScoreTier = "perfect" | "great" | "solid" | "needs-work";

export function scoreTier(earned: number, possible: number): ScoreTier {
  const pct = scorePercent(earned, possible);
  if (pct >= 100) return "perfect";
  if (pct >= 80) return "great";
  if (pct >= 60) return "solid";
  return "needs-work";
}

/** Short, supportive copy shown on the student review page based on score tier. */
export function scoreTierMessage(tier: ScoreTier): string {
  switch (tier) {
    case "perfect":
      return "Perfect score!";
    case "great":
      return "Great work.";
    case "solid":
      return "Solid effort.";
    default:
      return "Nice try — review the feedback below.";
  }
}

/** Tone of a single question's earned value (used for per-question pills on review). */
export type QuestionScoreTone = "full" | "partial" | "zero";

export function questionScoreTone(earned: number, possible: number): QuestionScoreTone {
  const ep = Math.max(0, Math.floor(Number(earned) || 0));
  const pp = Math.max(0, Math.floor(Number(possible) || 0));
  if (pp <= 0) return "zero";
  if (ep >= pp) return "full";
  if (ep <= 0) return "zero";
  return "partial";
}

/** Grading state for a single question card on the teacher's watch page. */
export type GradingState = "needs-grading" | "auto" | "graded";

export function gradingStateFor(
  question: Pick<Question, "id" | "type" | "correctAnswer">,
  earnedPoints: number | null | undefined,
): GradingState {
  if (typeof earnedPoints !== "number") {
    return "needs-grading";
  }
  return question.type === "multipleChoice" && question.correctAnswer ? "auto" : "graded";
}

/**
 * Whether every question has a non-null earned value (i.e. ready to mark graded).
 * `grades` is the {questionId: points} map; questions are all the form questions.
 */
export function isFullyGraded(
  grades: Record<string, number | null | undefined>,
  questions: Pick<Question, "id">[],
): boolean {
  if (questions.length === 0) {
    return false;
  }
  return questions.every((q) => typeof grades[q.id] === "number");
}
