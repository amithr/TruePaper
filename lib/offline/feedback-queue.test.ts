import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  editQueuedFeedbackItem,
  enqueueFeedbackItem,
  listFailedFeedbackItems,
  listPendingFeedbackItems,
  markFeedbackFailed,
  pendingFeedbackCount,
  removeFeedbackItem,
  retryFailedFeedbackItem,
} from "@/lib/offline/feedback-queue";
import type { FeedbackQueueItem } from "@/lib/offline/types";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID, TEST_QUESTION_ID } from "@/lib/test/fixtures";

const store = new Map<string, FeedbackQueueItem>();

vi.mock("@/lib/offline/idb", () => ({
  idbPut: vi.fn(async (_store: string, item: FeedbackQueueItem) => {
    store.set(item.id, item);
  }),
  idbGet: vi.fn(async (_store: string, id: string) => store.get(id) ?? null),
  idbDelete: vi.fn(async (_store: string, id: string) => {
    store.delete(id);
  }),
  idbGetAllByIndex: vi.fn(async () => [...store.values()]),
}));

describe("feedback-queue", () => {
  beforeEach(() => {
    store.clear();
    globalThis.IDBKeyRange = { only: (value: unknown) => value } as unknown as typeof IDBKeyRange;
  });

  it("enqueues a queued text item with authoritative createdAt", async () => {
    const item = await enqueueFeedbackItem({
      liveSessionId: TEST_LIVE_SESSION_ID,
      studentDeviceId: TEST_DEVICE_ID,
      questionId: TEST_QUESTION_ID,
      body: "Nice work",
      responseVersionTag: "2026-06-30T10:00:00Z",
      createdAt: 1000,
    });
    expect(item.status).toBe("queued");
    expect(item.type).toBe("text");
    expect(item.createdAt).toBe(1000);
    expect(item.anchor).toEqual({ questionId: TEST_QUESTION_ID });
    expect(await pendingFeedbackCount(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID)).toBe(1);
  });

  it("edits a queued item in place without creating a second item", async () => {
    const item = await enqueueFeedbackItem({
      liveSessionId: TEST_LIVE_SESSION_ID,
      studentDeviceId: TEST_DEVICE_ID,
      questionId: TEST_QUESTION_ID,
      body: "first",
    });
    await editQueuedFeedbackItem(item.id, "second");
    const pending = await listPendingFeedbackItems(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.body).toBe("second");
  });

  it("removes a queued item directly", async () => {
    const item = await enqueueFeedbackItem({
      liveSessionId: TEST_LIVE_SESSION_ID,
      studentDeviceId: TEST_DEVICE_ID,
      questionId: null,
      body: "to delete",
    });
    await removeFeedbackItem(item.id);
    expect(await pendingFeedbackCount(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID)).toBe(0);
  });

  it("excludes failed items from the pending count and surfaces them", async () => {
    const item = await enqueueFeedbackItem({
      liveSessionId: TEST_LIVE_SESSION_ID,
      studentDeviceId: TEST_DEVICE_ID,
      questionId: null,
      body: "broken",
    });
    await markFeedbackFailed(item, "server rejected");
    expect(await pendingFeedbackCount(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID)).toBe(0);
    const failed = await listFailedFeedbackItems(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.lastError).toBe("server rejected");
  });

  it("re-queues a failed item for retry, resetting attempts", async () => {
    const item = await enqueueFeedbackItem({
      liveSessionId: TEST_LIVE_SESSION_ID,
      studentDeviceId: TEST_DEVICE_ID,
      questionId: null,
      body: "retry me",
    });
    await markFeedbackFailed(item, "network");
    const retried = await retryFailedFeedbackItem(item.id);
    expect(retried?.status).toBe("queued");
    expect(retried?.attempts).toBe(0);
    expect(await pendingFeedbackCount(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID)).toBe(1);
  });
});
