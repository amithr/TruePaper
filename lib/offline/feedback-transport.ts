import { isRetryableNetworkError } from "@/lib/network-error";
import { requestJsonWithTimeout } from "@/lib/request-json";
import type { FeedbackQueueItem, SyncResult } from "@/lib/offline/types";

const FEEDBACK_TIMEOUT_MS = 20_000;

/**
 * Upload one queued feedback item. The route is idempotent on `id`, so a retry
 * after an ambiguous failure can never create a duplicate comment.
 */
export async function uploadFeedbackItem(item: FeedbackQueueItem): Promise<SyncResult> {
  try {
    await requestJsonWithTimeout<{ ok: true }>(
      `/api/forms/live-sessions/${item.liveSessionId}/participants/${encodeURIComponent(
        item.studentDeviceId,
      )}/feedback-items`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          questionId: item.questionId,
          body: item.body,
          createdAt: new Date(item.createdAt).toISOString(),
          responseVersionTag: item.responseVersionTag,
          anchor: item.anchor,
        }),
      },
      FEEDBACK_TIMEOUT_MS,
    );
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      retryable: isRetryableNetworkError(e),
      message: e instanceof Error ? e.message : "Feedback upload failed",
    };
  }
}
