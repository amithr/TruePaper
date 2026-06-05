import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { drainSyncQueue } from "@/lib/offline/sync-engine";
import type { SyncQueueItem } from "@/lib/offline/types";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID, TEST_SUBMISSION_ID } from "@/lib/test/fixtures";

const queue: SyncQueueItem[] = [];

vi.mock("@/lib/offline/sync-queue", () => ({
  listPendingSyncItems: vi.fn(async () => [...queue]),
  markSyncAttempt: vi.fn(async (item: SyncQueueItem) => {
    const idx = queue.findIndex((q) => q.submissionId === item.submissionId);
    if (idx >= 0) {
      queue[idx] = { ...item, attempts: item.attempts + 1, lastAttemptAt: Date.now() };
    }
  }),
  removeSyncItem: vi.fn(async (submissionId: string) => {
    const idx = queue.findIndex((q) => q.submissionId === submissionId);
    if (idx >= 0) {
      queue.splice(idx, 1);
    }
  }),
}));

function seedItem(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  return {
    submissionId: TEST_SUBMISSION_ID,
    liveSessionId: TEST_LIVE_SESSION_ID,
    deviceId: TEST_DEVICE_ID.toLowerCase(),
    displayName: "Student",
    answers: { q1: "hello" },
    createdAt: Date.now(),
    attempts: 0,
    lastAttemptAt: null,
    ...overrides,
  };
}

describe("drainSyncQueue", () => {
  beforeEach(() => {
    queue.length = 0;
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("still attempts when navigator reports offline (flag has false negatives)", async () => {
    queue.push(seedItem());
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const transport = vi.fn().mockResolvedValue({ ok: true });
    const result = await drainSyncQueue(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID, transport);
    expect(transport).toHaveBeenCalled();
    expect(result).toEqual({ synced: 1, failed: 0, pending: 0 });
  });

  it("syncs pending items and removes on success", async () => {
    queue.push(seedItem());
    const transport = vi.fn().mockResolvedValue({ ok: true });
    const result = await drainSyncQueue(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID, transport);
    expect(result.synced).toBe(1);
    expect(result.pending).toBe(0);
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: TEST_SUBMISSION_ID }),
    );
  });

  it("returns deduped success from transport", async () => {
    queue.push(seedItem());
    const transport = vi.fn().mockResolvedValue({ ok: true, deduped: true });
    const result = await drainSyncQueue(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID, transport);
    expect(result.synced).toBe(1);
    expect(result.pending).toBe(0);
  });

  it("keeps retryable failures in the queue", async () => {
    queue.push(seedItem());
    const transport = vi.fn().mockResolvedValue({ ok: false, retryable: true, message: "network" });
    const result = await drainSyncQueue(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID, transport);
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.pending).toBe(1);
  });

  it("drops non-retryable failures", async () => {
    queue.push(seedItem());
    const transport = vi.fn().mockResolvedValue({ ok: false, retryable: false, message: "bad request" });
    const result = await drainSyncQueue(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID, transport);
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.pending).toBe(0);
  });

  it("respects retry backoff before re-attempting", async () => {
    queue.push(
      seedItem({
        attempts: 2,
        lastAttemptAt: Date.now(),
      }),
    );
    const transport = vi.fn().mockResolvedValue({ ok: true });
    const result = await drainSyncQueue(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID, transport);
    expect(transport).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
    expect(result.pending).toBe(1);
  });
});
