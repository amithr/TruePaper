import type { Form, StudentAnswers } from "@/lib/forms";
import type { ClientSyncState, DeliveryMode } from "@/lib/offline/config";

export type CachedExamSession = {
  key: string;
  liveSessionId: string;
  deviceId: string;
  joinCode: string;
  displayName: string;
  form: Form;
  deliveryMode: DeliveryMode;
  cachedAt: number;
};

export type LocalAnswerRecord = {
  key: string;
  liveSessionId: string;
  deviceId: string;
  answers: StudentAnswers;
  updatedAt: number;
  /** Per-question revision for last-write-wins merge across tabs. */
  revisions: Record<string, number>;
};

export type SyncQueueItem = {
  submissionId: string;
  liveSessionId: string;
  deviceId: string;
  displayName: string;
  answers: StudentAnswers;
  createdAt: number;
  attempts: number;
  lastAttemptAt: number | null;
};

export type SyncResult =
  | { ok: true; deduped?: boolean }
  | { ok: false; retryable: boolean; message: string };

export type ConnectionSnapshot = {
  state: ClientSyncState;
  pendingCount: number;
  pendingFinish: boolean;
  serverReachable: boolean;
  lastSyncedAt: number | null;
  idbAvailable: boolean;
};

export type FinishQueueItem = {
  key: string;
  liveSessionId: string;
  deviceId: string;
  displayName: string;
  answers: StudentAnswers;
  submissionId: string;
  createdAt: number;
  attempts: number;
  lastAttemptAt: number | null;
};

export type CachedJoinDraft = {
  key: "join_draft";
  joinCode: string;
  displayName: string;
  updatedAt: number;
};

export type FeedbackItemType = "text" | "voice";

/**
 * Local status of a queued teacher feedback item.
 * - `queued`: written locally, not yet uploaded (offline-identical to online).
 * - `uploading`: an upload attempt is in flight.
 * - `failed`: retries exhausted — surfaced to the teacher, never dropped.
 * Once the server accepts an item it is removed from the local queue; delivery
 * status (synced/delivered) is then read back from the server.
 */
export type FeedbackQueueStatus = "queued" | "uploading" | "failed";

/**
 * Teacher-authored feedback awaiting upload. Persisted in IndexedDB so it
 * survives app close / device restart, mirroring the answer/finish queues.
 * `createdAt` is authoritative for ordering and student display (never the
 * sync/delivery time).
 */
export type FeedbackQueueItem = {
  id: string;
  liveSessionId: string;
  studentDeviceId: string;
  responseId: string | null;
  questionId: string | null;
  anchor: { questionId: string; selection?: { start: number; end: number } } | null;
  authorId: string;
  authorName: string;
  type: FeedbackItemType;
  body: string;
  /** Snapshot of the response version (its `updated_at`) when written. */
  responseVersionTag: string | null;
  createdAt: number;
  status: FeedbackQueueStatus;
  attempts: number;
  lastAttemptAt: number | null;
  lastError: string | null;
};
