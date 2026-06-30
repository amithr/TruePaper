import {
  FEEDBACK_MAX_ATTEMPTS,
  SYNC_RETRY_BASE_MS,
  SYNC_RETRY_MAX_MS,
} from "@/lib/offline/config";
import {
  listPendingFeedbackItems,
  listSessionFeedbackItems,
  markFeedbackAttempt,
  markFeedbackFailed,
  markFeedbackRetryable,
  removeFeedbackItem,
} from "@/lib/offline/feedback-queue";
import { uploadFeedbackItem } from "@/lib/offline/feedback-transport";
import type { FeedbackQueueItem, SyncResult } from "@/lib/offline/types";

export type FeedbackTransport = (item: FeedbackQueueItem) => Promise<SyncResult>;

function retryDelayMs(attempts: number): number {
  const exp = Math.min(SYNC_RETRY_MAX_MS, SYNC_RETRY_BASE_MS * 2 ** attempts);
  const jitter = Math.floor(Math.random() * 0.3 * exp);
  return exp + jitter;
}

/**
 * Drain queued text feedback for one (session, student). Reuses the same
 * exponential backoff as the answer/finish queues. On success the row is removed
 * (the server becomes the source of truth for delivery). On a permanent failure
 * — server rejection, or retries exhausted — the row is flagged `failed` and
 * kept so the teacher can be told; we never silently drop feedback.
 */
export async function drainFeedbackQueue(
  liveSessionId: string,
  studentDeviceId: string,
  transport: FeedbackTransport = uploadFeedbackItem,
): Promise<{ synced: number; failed: number; pending: number }> {
  const items = await listPendingFeedbackItems(liveSessionId, studentDeviceId);
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    if (item.status === "failed") {
      failed += 1;
      continue;
    }
    if (item.lastAttemptAt && Date.now() - item.lastAttemptAt < retryDelayMs(item.attempts)) {
      continue;
    }

    await markFeedbackAttempt(item);
    const result = await transport({ ...item, attempts: item.attempts + 1 });

    if (result.ok) {
      await removeFeedbackItem(item.id);
      synced += 1;
    } else if (!result.retryable) {
      await markFeedbackFailed(item, result.message);
      failed += 1;
    } else if (item.attempts + 1 >= FEEDBACK_MAX_ATTEMPTS) {
      await markFeedbackFailed(item, result.message);
      failed += 1;
    } else {
      await markFeedbackRetryable(item, result.message);
    }
  }

  const remaining = await listPendingFeedbackItems(liveSessionId, studentDeviceId);
  const pending = remaining.filter((i) => i.status !== "failed").length;
  return { synced, failed, pending };
}

/**
 * Drain all queued feedback for a session, grouped by student device. Lets the
 * teacher's ambient indicator keep delivering feedback regardless of which page
 * is open (session header vs. per-student watch page).
 */
export async function drainSessionFeedbackQueue(
  liveSessionId: string,
  transport: FeedbackTransport = uploadFeedbackItem,
): Promise<{ synced: number; failed: number; pending: number }> {
  const items = await listSessionFeedbackItems(liveSessionId);
  const devices = [...new Set(items.map((i) => i.studentDeviceId))];
  let synced = 0;
  let failed = 0;
  let pending = 0;
  for (const device of devices) {
    const result = await drainFeedbackQueue(liveSessionId, device, transport);
    synced += result.synced;
    failed += result.failed;
    pending += result.pending;
  }
  return { synced, failed, pending };
}
