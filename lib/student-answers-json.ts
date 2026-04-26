import type { StudentAnswers } from "@/lib/forms";

export function parseStudentAnswersJson(value: unknown): StudentAnswers {
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/** Canonical JSON for comparing whether local answers differ from last persisted copy. */
export function stableStringifyStudentAnswers(answers: StudentAnswers): string {
  const keys = Object.keys(answers).sort((a, b) => a.localeCompare(b));
  const normalized: Record<string, string> = {};
  for (const key of keys) {
    normalized[key] = answers[key] ?? "";
  }
  return JSON.stringify(normalized);
}
