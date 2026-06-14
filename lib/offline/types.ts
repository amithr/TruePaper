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
