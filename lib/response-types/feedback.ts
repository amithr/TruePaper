import type { DrawingStroke } from "@/lib/response-types/drawing";
import type { RubricScoreEntry, TeacherFeedbackPayload } from "@/lib/response-types/types";

/** Wire keys in live_teacher_feedback jsonb. */
export type FeedbackKey = string;

export function feedbackKeyForQuestion(questionId: string): FeedbackKey {
  return questionId;
}

export function feedbackKeyForPart(questionId: string, partId: string): FeedbackKey {
  return `${questionId}::part::${partId}`;
}

export function feedbackKeyForQuick(questionId: string): FeedbackKey {
  return `${questionId}::quick`;
}

export function feedbackKeyForRubric(questionId: string): FeedbackKey {
  return `${questionId}::rubric`;
}

export function feedbackKeyForInline(questionId: string): FeedbackKey {
  return `${questionId}::inline`;
}

export function feedbackKeyForCanvas(questionId: string): FeedbackKey {
  return `${questionId}::canvas`;
}

export type TeacherFeedbackStore = Record<FeedbackKey, unknown>;

function parsePayload(raw: unknown): TeacherFeedbackPayload | null {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as TeacherFeedbackPayload;
        if (parsed && typeof parsed === "object" && "kind" in parsed) {
          return parsed;
        }
      } catch {
        /* legacy plain string */
      }
    }
    return { kind: "message", message: trimmed };
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "kind" in raw) {
    return raw as TeacherFeedbackPayload;
  }
  return null;
}

export function parseTeacherFeedbackStore(raw: unknown): TeacherFeedbackStore {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    if (typeof raw === "string") {
      try {
        return parseTeacherFeedbackStore(JSON.parse(raw));
      } catch {
        return {};
      }
    }
    return {};
  }
  return raw as TeacherFeedbackStore;
}

/** Legacy flat string map (questionId → message). */
export function parseLegacyFeedbackStrings(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

export function getQuestionFeedback(
  store: TeacherFeedbackStore,
  questionId: string,
): TeacherFeedbackPayload | null {
  return parsePayload(store[questionId]);
}

export function getPartFeedback(
  store: TeacherFeedbackStore,
  questionId: string,
  partId: string,
): string {
  const key = feedbackKeyForPart(questionId, partId);
  const payload = parsePayload(store[key]);
  if (payload?.kind === "message") {
    return payload.message;
  }
  const whole = getQuestionFeedback(store, questionId);
  if (whole?.kind === "perPart" && whole.parts[partId]) {
    return whole.parts[partId];
  }
  return "";
}

export function getQuickNudge(store: TeacherFeedbackStore, questionId: string): string {
  const payload = parsePayload(store[feedbackKeyForQuick(questionId)]);
  if (payload?.kind === "quick") {
    return payload.nudge;
  }
  return "";
}

export function getRubricScores(
  store: TeacherFeedbackStore,
  questionId: string,
): RubricScoreEntry[] {
  const payload = parsePayload(store[feedbackKeyForRubric(questionId)]);
  if (payload?.kind === "rubric") {
    return payload.scores;
  }
  return [];
}

export function getInlineComments(store: TeacherFeedbackStore, questionId: string) {
  const payload = parsePayload(store[feedbackKeyForInline(questionId)]);
  if (payload?.kind === "inline") {
    return payload.comments;
  }
  return [];
}

export function getCanvasAnnotation(
  store: TeacherFeedbackStore,
  questionId: string,
): DrawingStroke[] {
  const payload = parsePayload(store[feedbackKeyForCanvas(questionId)]);
  if (payload?.kind === "canvas" && Array.isArray(payload.strokes)) {
    return payload.strokes;
  }
  return [];
}

/** Whole-message text for student card (legacy + message kind). */
export function getDisplayMessage(
  store: TeacherFeedbackStore,
  questionId: string,
): string {
  const payload = getQuestionFeedback(store, questionId);
  if (payload?.kind === "message") {
    return payload.message;
  }
  const legacy = parseLegacyFeedbackStrings(store);
  return legacy[questionId] ?? "";
}

export function hasAnyFeedback(store: TeacherFeedbackStore, questionId: string): boolean {
  if (getDisplayMessage(store, questionId).trim()) {
    return true;
  }
  if (getQuickNudge(store, questionId).trim()) {
    return true;
  }
  if (getRubricScores(store, questionId).length > 0) {
    return true;
  }
  if (getInlineComments(store, questionId).length > 0) {
    return true;
  }
  const prefix = `${questionId}::part::`;
  return Object.keys(store).some((key) => key.startsWith(prefix) && String(store[key] ?? "").trim());
}

export function serializeFeedbackPayload(payload: TeacherFeedbackPayload): string {
  return JSON.stringify(payload);
}

export function mergeFeedbackStore(
  store: TeacherFeedbackStore,
  key: FeedbackKey,
  payload: TeacherFeedbackPayload | null,
): TeacherFeedbackStore {
  const next = { ...store };
  if (!payload || (payload.kind === "message" && !payload.message.trim())) {
    delete next[key];
    return next;
  }
  next[key] = serializeFeedbackPayload(payload);
  return next;
}

/** Convert legacy string-only store to typed store. */
export function migrateLegacyFeedback(raw: unknown): TeacherFeedbackStore {
  const legacy = parseLegacyFeedbackStrings(raw);
  const store: TeacherFeedbackStore = {};
  for (const [questionId, message] of Object.entries(legacy)) {
    if (message.trim()) {
      store[questionId] = serializeFeedbackPayload({ kind: "message", message });
    }
  }
  return store;
}
