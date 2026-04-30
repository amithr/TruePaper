export type TextQuestionGrade = {
  score: number;
  feedback: string;
  gradedAt: string;
};

export type TextQuestionGradesByQuestionId = Record<string, TextQuestionGrade>;

export function parseTextQuestionGrades(raw: unknown): TextQuestionGradesByQuestionId {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  const parsed: TextQuestionGradesByQuestionId = {};
  for (const [questionId, value] of entries) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const row = value as Record<string, unknown>;
    if (typeof row.feedback !== "string" || typeof row.gradedAt !== "string") {
      continue;
    }
    if (typeof row.score !== "number" || !Number.isFinite(row.score)) {
      continue;
    }
    parsed[questionId] = {
      score: Math.max(0, Math.min(5, Math.round(row.score))),
      feedback: row.feedback,
      gradedAt: row.gradedAt,
    };
  }
  return parsed;
}
