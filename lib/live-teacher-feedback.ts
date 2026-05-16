export type LiveTeacherFeedbackByQuestionId = Record<string, string>;

export function parseLiveTeacherFeedback(raw: unknown): LiveTeacherFeedbackByQuestionId {
  if (raw === null || raw === undefined) {
    return {};
  }
  if (typeof raw === "string") {
    try {
      return parseLiveTeacherFeedback(JSON.parse(raw) as unknown);
    } catch {
      return {};
    }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .map(([key, value]): [string, string] | null => {
        if (typeof value === "string") {
          return [key, value];
        }
        if (value === null || value === undefined) {
          return null;
        }
        return [key, String(value)];
      })
      .filter((entry): entry is [string, string] => entry !== null),
  );
}
