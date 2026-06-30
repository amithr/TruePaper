import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FEEDBACK_MAX_ATTEMPTS } from "@/lib/offline/config";
import { drainFeedbackQueue } from "@/lib/offline/feedback-engine";
import type { FeedbackQueueItem } from "@/lib/offline/types";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID, TEST_SUBMISSION_ID } from "@/lib/test/fixtures";

const queue: FeedbackQueueItem[] = [];

vi.mock("@/lib/offline/feedback-queue", () => ({
  listPendingFeedbackItems: vi.fn(async () => [...queue]),
  markFeedbackAttempt: vi.fn(async (item: FeedbackQueueItem) => {
    const idx = queue.findIndex((q) => q.id === item.id);
    if (idx >= 0) {
      queue[idx] = { ...item, status: "uploading", attempts: item.attempts + 1, lastAttemptAt: Date.now() };
    }
  }),
  markFeedbackFailed: vi.fn(async (item: FeedbackQueueItem, message: string) => {
    const idx = queue.findIndex((q) => q.id === item.id);
    if (idx >= 0) {
      queue[idx] = { ...queue[idx], status: "failed", lastError: message };
    }
  }),
  markFeedbackRetryable: vi.fn(async (item: FeedbackQueueItem, message: string) => {
    const idx = queue.findIndex((q) => q.id === item.id);
    if (idx >= 0) {
      queue[idx] = { ...queue[idx], status: "queued", lastError: message };
    }
  }),
  removeFeedbackItem: vi.fn(async (id: string) => {
    const idx = queue.findIndex((q) => q.id === id);
    if (idx >= 0) {
      queue.splice(idx, 1);
    }
  }),
}));

function seed(overrides: Partial<FeedbackQueueItem> = {}): FeedbackQueueItem {
  return {
    id: TEST_SUBMISSION_ID,
    liveSessionId: TEST_LIVE_SESSION_ID,
    studentDeviceId: TEST_DEVICE_ID.toLowerCase(),
    responseId: null,
    questionId: null,
    anchor: null,
    authorId: "",
    authorName: "",
    type: "text",
    body: "comment",
    responseVersionTag: null,
    createdAt: Date.now(),
    status: "queued",
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    ...overrides,
  };
}

describe("drainFeedbackQueue", () => {
  beforeEach(() => {
    queue.length = 0;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uploads pending items and removes on success", async () => {
    queue.push(seed());
    const transport = vi.fn().mockResolvedValue({ ok: true });
    const result = await drainFeedbackQueue(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID, transport);
    expect(result).toEqual({ synced: 1, failed: 0, pending: 0 });
  });

  it("flags non-retryable rejections as failed (never dropped)", async () => {
    queue.push(seed());
    const transport = vi.fn().mockResolvedValue({ ok: false, retryable: false, message: "too large" });
    const result = await drainFeedbackQueue(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID, transport);
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    expect(queue[0]?.status).toBe("failed");
    expect(queue[0]?.lastError).toBe("too large");
  });

  it("keeps retryable failures queued (not failed) until attempts exhausted", async () => {
    queue.push(seed());
    const transport = vi.fn().mockResolvedValue({ ok: false, retryable: true, message: "network" });
    const result = await drainFeedbackQueue(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID, transport);
    expect(result.failed).toBe(0);
    expect(result.pending).toBe(1);
    expect(queue[0]?.status).toBe("queued");
  });

  it("surfaces as failed once retryable attempts are exhausted", async () => {
    queue.push(seed({ attempts: FEEDBACK_MAX_ATTEMPTS - 1, lastAttemptAt: null }));
    const transport = vi.fn().mockResolvedValue({ ok: false, retryable: true, message: "network" });
    const result = await drainFeedbackQueue(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID, transport);
    expect(result.failed).toBe(1);
    expect(queue[0]?.status).toBe("failed");
  });

  it("skips items already flagged failed (awaiting teacher action)", async () => {
    queue.push(seed({ status: "failed" }));
    const transport = vi.fn().mockResolvedValue({ ok: true });
    const result = await drainFeedbackQueue(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID, transport);
    expect(transport).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });

  it("respects backoff before re-attempting", async () => {
    queue.push(seed({ attempts: 2, lastAttemptAt: Date.now() }));
    const transport = vi.fn().mockResolvedValue({ ok: true });
    const result = await drainFeedbackQueue(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID, transport);
    expect(transport).not.toHaveBeenCalled();
    expect(result.pending).toBe(1);
  });
});
