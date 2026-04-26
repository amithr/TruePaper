import type { StudentAnswers } from "@/lib/forms";

function answersFromJsonObject(raw: Record<string, unknown>): StudentAnswers {
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

/** Parses RPC / API payload: `{ answers, suspended, finished?, displayName? }` or legacy flat answers object. */
export function parseLiveSessionStudentGet(data: unknown): {
  answers: StudentAnswers;
  suspended: boolean;
  finished: boolean;
  displayName: string;
} {
  if (data === null || data === undefined) {
    return { answers: {}, suspended: false, finished: false, displayName: "" };
  }

  if (typeof data === "string") {
    try {
      return parseLiveSessionStudentGet(JSON.parse(data) as unknown);
    } catch {
      return { answers: {}, suspended: false, finished: false, displayName: "" };
    }
  }

  if (typeof data !== "object" || Array.isArray(data)) {
    return { answers: {}, suspended: false, finished: false, displayName: "" };
  }

  const obj = data as Record<string, unknown>;

  if ("suspended" in obj) {
    const answersRaw = obj.answers;
    const answers =
      answersRaw && typeof answersRaw === "object" && !Array.isArray(answersRaw)
        ? answersFromJsonObject(answersRaw as Record<string, unknown>)
        : {};
    const dn = obj.displayName;
    return {
      answers,
      suspended: Boolean(obj.suspended),
      finished: Boolean(obj.finished),
      displayName: typeof dn === "string" ? dn : "",
    };
  }

  return { answers: answersFromJsonObject(obj), suspended: false, finished: false, displayName: "" };
}
