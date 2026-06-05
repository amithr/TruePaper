import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  enqueueSyncItem,
  listPendingSyncItems,
  pendingSyncCount,
  removeSyncItem,
} from "@/lib/offline/sync-queue";
import type { SyncQueueItem } from "@/lib/offline/types";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";

const store = new Map<string, SyncQueueItem>();
const sessionIndex = new Map<string, SyncQueueItem[]>();

vi.mock("@/lib/offline/idb", () => ({
  idbPut: vi.fn(async (_store: string, item: SyncQueueItem) => {
    store.set(item.submissionId, item);
    const key = `${item.liveSessionId}::${item.deviceId}`;
    const list = sessionIndex.get(key) ?? [];
    const without = list.filter((i) => i.submissionId !== item.submissionId);
    sessionIndex.set(key, [...without, item]);
  }),
  idbDelete: vi.fn(async (_store: string, submissionId: string) => {
    const item = store.get(submissionId);
    store.delete(submissionId);
    if (item) {
      const key = `${item.liveSessionId}::${item.deviceId}`;
      const list = sessionIndex.get(key) ?? [];
      sessionIndex.set(
        key,
        list.filter((i) => i.submissionId !== submissionId),
      );
    }
  }),
  idbGetAllByIndex: vi.fn(async () => [...store.values()]),
}));

describe("sync-queue", () => {
  beforeEach(() => {
    store.clear();
    sessionIndex.clear();
    globalThis.IDBKeyRange = {
      only: (value: unknown) => value,
    } as IDBKeyRange;
  });

  it("coalesces to a single pending item per session/device", async () => {
    await enqueueSyncItem({
      liveSessionId: TEST_LIVE_SESSION_ID,
      deviceId: TEST_DEVICE_ID,
      displayName: "A",
      answers: { q1: "first" },
    });
    await enqueueSyncItem({
      liveSessionId: TEST_LIVE_SESSION_ID,
      deviceId: TEST_DEVICE_ID,
      displayName: "A",
      answers: { q1: "second" },
    });

    const pending = await listPendingSyncItems(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.answers.q1).toBe("second");
    expect(await pendingSyncCount(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID)).toBe(1);
  });

  it("removes item after successful sync", async () => {
    const item = await enqueueSyncItem({
      liveSessionId: TEST_LIVE_SESSION_ID,
      deviceId: TEST_DEVICE_ID,
      displayName: "A",
      answers: { q1: "x" },
    });
    await removeSyncItem(item.submissionId);
    expect(await pendingSyncCount(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID)).toBe(0);
  });
});
