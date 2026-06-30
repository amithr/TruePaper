import { idbDelete, idbGet, idbGetAll, idbGetAllByIndex, idbPut } from "@/lib/offline/idb";
import { newSubmissionId } from "@/lib/offline/sync-queue";
import { emitSyncQueueChanged } from "@/lib/sync-status-events";
import type { FeedbackQueueItem } from "@/lib/offline/types";

export function newFeedbackId(): string {
  return newSubmissionId();
}

export async function enqueueFeedbackItem(input: {
  liveSessionId: string;
  studentDeviceId: string;
  responseId?: string | null;
  questionId: string | null;
  authorId?: string;
  authorName?: string;
  body: string;
  responseVersionTag?: string | null;
  id?: string;
  createdAt?: number;
}): Promise<FeedbackQueueItem> {
  const item: FeedbackQueueItem = {
    id: input.id ?? newFeedbackId(),
    liveSessionId: input.liveSessionId,
    studentDeviceId: input.studentDeviceId.toLowerCase(),
    responseId: input.responseId ?? null,
    questionId: input.questionId,
    anchor: input.questionId ? { questionId: input.questionId } : null,
    authorId: input.authorId ?? "",
    authorName: input.authorName ?? "",
    type: "text",
    body: input.body,
    responseVersionTag: input.responseVersionTag ?? null,
    createdAt: input.createdAt ?? Date.now(),
    status: "queued",
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
  };
  await idbPut("feedback_queue", item);
  emitSyncQueueChanged();
  return item;
}

export async function getFeedbackItem(id: string): Promise<FeedbackQueueItem | null> {
  return idbGet<FeedbackQueueItem>("feedback_queue", id);
}

/**
 * Edit a still-queued item in place. The original is never synced and then
 * corrected as a second item — we mutate the single local row directly. A failed
 * item flips back to `queued` so the edit is retried.
 */
export async function editQueuedFeedbackItem(
  id: string,
  body: string,
): Promise<FeedbackQueueItem | null> {
  const existing = await getFeedbackItem(id);
  if (!existing) {
    return null;
  }
  const next: FeedbackQueueItem = {
    ...existing,
    body,
    status: existing.status === "uploading" ? "uploading" : "queued",
    lastError: null,
  };
  await idbPut("feedback_queue", next);
  emitSyncQueueChanged();
  return next;
}

export async function removeFeedbackItem(id: string): Promise<void> {
  await idbDelete("feedback_queue", id);
  emitSyncQueueChanged();
}

export async function listPendingFeedbackItems(
  liveSessionId: string,
  studentDeviceId: string,
): Promise<FeedbackQueueItem[]> {
  const key = [liveSessionId, studentDeviceId.toLowerCase()];
  const items = await idbGetAllByIndex<FeedbackQueueItem>(
    "feedback_queue",
    "by_session",
    IDBKeyRange.only(key),
  );
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

/** All queued feedback for a session across every student device (teacher view). */
export async function listSessionFeedbackItems(
  liveSessionId: string,
): Promise<FeedbackQueueItem[]> {
  const all = await idbGetAll<FeedbackQueueItem>("feedback_queue");
  return all
    .filter((item) => item.liveSessionId === liveSessionId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function markFeedbackAttempt(item: FeedbackQueueItem): Promise<void> {
  await idbPut("feedback_queue", {
    ...item,
    status: "uploading",
    attempts: item.attempts + 1,
    lastAttemptAt: Date.now(),
  });
  emitSyncQueueChanged();
}

/** Revert an item to `queued` after a retryable failure so it stays pending (not stuck "uploading"). */
export async function markFeedbackRetryable(item: FeedbackQueueItem, message: string): Promise<void> {
  await idbPut("feedback_queue", {
    ...item,
    status: "queued",
    lastError: message,
  });
  emitSyncQueueChanged();
}

/** Re-queue a failed item for another round of upload attempts (teacher-initiated retry). */
export async function retryFailedFeedbackItem(id: string): Promise<FeedbackQueueItem | null> {
  const existing = await getFeedbackItem(id);
  if (!existing) {
    return null;
  }
  const next: FeedbackQueueItem = {
    ...existing,
    status: "queued",
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
  };
  await idbPut("feedback_queue", next);
  emitSyncQueueChanged();
  return next;
}

/** Re-queue every failed feedback item for a session (teacher "Retry" from the indicator). */
export async function retryAllFailedFeedbackItems(liveSessionId: string): Promise<number> {
  const failed = (await listSessionFeedbackItems(liveSessionId)).filter(
    (item) => item.status === "failed",
  );
  for (const item of failed) {
    await idbPut("feedback_queue", {
      ...item,
      status: "queued",
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
    });
  }
  if (failed.length > 0) {
    emitSyncQueueChanged();
  }
  return failed.length;
}

export async function markFeedbackFailed(
  item: FeedbackQueueItem,
  message: string,
): Promise<void> {
  await idbPut("feedback_queue", {
    ...item,
    status: "failed",
    lastError: message,
  });
  emitSyncQueueChanged();
}

export async function pendingFeedbackCount(
  liveSessionId: string,
  studentDeviceId: string,
): Promise<number> {
  const items = await listPendingFeedbackItems(liveSessionId, studentDeviceId);
  return items.filter((i) => i.status !== "failed").length;
}

export async function listFailedFeedbackItems(
  liveSessionId: string,
  studentDeviceId: string,
): Promise<FeedbackQueueItem[]> {
  const items = await listPendingFeedbackItems(liveSessionId, studentDeviceId);
  return items.filter((i) => i.status === "failed");
}
