export type LiveTeacherFeedbackByQuestionId = Record<string, string>;

export function parseLiveTeacherFeedback(raw: unknown): LiveTeacherFeedbackByQuestionId {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}
