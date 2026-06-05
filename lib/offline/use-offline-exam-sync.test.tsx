import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SYNC_DEBOUNCE_MS } from "@/lib/offline/config";
import { TEST_DEVICE_ID, TEST_DISPLAY_NAME, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";

const pendingSyncCount = vi.fn();
const prunePendingSyncQueue = vi.fn();
const enqueueSyncItem = vi.fn();
const clearPendingSyncQueue = vi.fn();
const drainSyncQueue = vi.fn();
const putStudentAnswersSync = vi.fn();
const saveLocalAnswers = vi.fn();
const isIdbAvailable = vi.fn();

vi.mock("@/lib/offline/sync-queue", () => ({
  pendingSyncCount: (...args: unknown[]) => pendingSyncCount(...args),
  prunePendingSyncQueue: (...args: unknown[]) => prunePendingSyncQueue(...args),
  enqueueSyncItem: (...args: unknown[]) => enqueueSyncItem(...args),
  clearPendingSyncQueue: (...args: unknown[]) => clearPendingSyncQueue(...args),
}));

vi.mock("@/lib/offline/sync-engine", () => ({
  drainSyncQueue: (...args: unknown[]) => drainSyncQueue(...args),
}));

vi.mock("@/lib/offline/sync-transport", () => ({
  putStudentAnswersSync: (...args: unknown[]) => putStudentAnswersSync(...args),
}));

vi.mock("@/lib/offline/answer-store", () => ({
  saveLocalAnswers: (...args: unknown[]) => saveLocalAnswers(...args),
}));

vi.mock("@/lib/offline/idb", () => ({
  isIdbAvailable: () => isIdbAvailable(),
}));

import { useOfflineExamSync } from "@/lib/offline/use-offline-exam-sync";

describe("useOfflineExamSync", () => {
  beforeEach(() => {
    pendingSyncCount.mockReset();
    prunePendingSyncQueue.mockReset();
    enqueueSyncItem.mockReset();
    clearPendingSyncQueue.mockReset();
    clearPendingSyncQueue.mockResolvedValue(undefined);
    drainSyncQueue.mockReset();
    putStudentAnswersSync.mockReset();
    saveLocalAnswers.mockReset();
    isIdbAvailable.mockReset();

    pendingSyncCount.mockResolvedValue(0);
    prunePendingSyncQueue.mockResolvedValue(0);
    enqueueSyncItem.mockResolvedValue(undefined);
    saveLocalAnswers.mockResolvedValue(undefined);
    drainSyncQueue.mockResolvedValue({ synced: 1, pending: 0 });
    isIdbAvailable.mockResolvedValue(true);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("reports idb availability on mount", async () => {
    const onStatusChange = vi.fn();
    const { result } = renderHook(() =>
      useOfflineExamSync({
        enabled: true,
        liveSessionId: TEST_LIVE_SESSION_ID,
        deviceId: TEST_DEVICE_ID,
        displayName: TEST_DISPLAY_NAME,
        getAnswers: () => ({}),
        onStatusChange,
      }),
    );

    await waitFor(() => expect(result.current.snapshot.idbAvailable).toBe(true));
    expect(onStatusChange).toHaveBeenCalled();
  });

  it("scheduleSync enqueues local save and drain", async () => {
    const answers = { q1: "answer" };
    const getAnswers = vi.fn(() => answers);
    const onSynced = vi.fn();

    const { result } = renderHook(() =>
      useOfflineExamSync({
        enabled: true,
        liveSessionId: TEST_LIVE_SESSION_ID,
        deviceId: TEST_DEVICE_ID,
        displayName: TEST_DISPLAY_NAME,
        getAnswers,
        onSynced,
      }),
    );

    await waitFor(() => expect(result.current.snapshot.idbAvailable).toBe(true));

    vi.useFakeTimers();
    try {
      await act(async () => {
        result.current.scheduleSync();
        await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 50);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(saveLocalAnswers).toHaveBeenCalledWith(
      TEST_LIVE_SESSION_ID,
      TEST_DEVICE_ID,
      answers,
    );
    expect(enqueueSyncItem).toHaveBeenCalled();
    expect(drainSyncQueue).toHaveBeenCalled();
    await waitFor(() => expect(onSynced).toHaveBeenCalled());
  });

  it("does not reschedule when answers are unchanged", async () => {
    const answers = { q1: "same" };
    const getAnswers = vi.fn(() => answers);
    const onSynced = vi.fn();

    const { result } = renderHook(() =>
      useOfflineExamSync({
        enabled: true,
        liveSessionId: TEST_LIVE_SESSION_ID,
        deviceId: TEST_DEVICE_ID,
        displayName: TEST_DISPLAY_NAME,
        getAnswers,
        onSynced,
      }),
    );

    await waitFor(() => expect(result.current.snapshot.idbAvailable).toBe(true));

    vi.useFakeTimers();
    try {
      await act(async () => {
        result.current.scheduleSync();
        await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 50);
      });
      enqueueSyncItem.mockClear();
      onSynced.mockClear();

      await act(async () => {
        result.current.scheduleSync();
        await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 50);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(enqueueSyncItem).not.toHaveBeenCalled();
    await waitFor(() => expect(onSynced).toHaveBeenCalled());
  });

  it("flushNow enqueues latest answers and waits for drain", async () => {
    const answers = { q1: "final" };
    drainSyncQueue.mockResolvedValue({ synced: 1, pending: 0 });
    const onSynced = vi.fn();

    const { result } = renderHook(() =>
      useOfflineExamSync({
        enabled: true,
        liveSessionId: TEST_LIVE_SESSION_ID,
        deviceId: TEST_DEVICE_ID,
        displayName: TEST_DISPLAY_NAME,
        getAnswers: () => answers,
        onSynced,
      }),
    );

    await waitFor(() => expect(result.current.snapshot.idbAvailable).toBe(true));

    await act(async () => {
      const flushResult = await result.current.flushNow();
      expect(flushResult).toEqual({ pending: 0 });
    });

    expect(enqueueSyncItem).toHaveBeenCalledWith({
      liveSessionId: TEST_LIVE_SESSION_ID,
      deviceId: TEST_DEVICE_ID,
      displayName: TEST_DISPLAY_NAME,
      answers,
    });
    expect(drainSyncQueue).toHaveBeenCalled();
    expect(onSynced).toHaveBeenCalled();
    expect(result.current.snapshot.state).toBe("synced");
  });

  it("returns stable scheduleSync identity across rerenders", async () => {
    const getAnswers = vi.fn(() => ({}));
    const { result, rerender } = renderHook(
      (props: { enabled: boolean }) =>
        useOfflineExamSync({
          enabled: props.enabled,
          liveSessionId: TEST_LIVE_SESSION_ID,
          deviceId: TEST_DEVICE_ID,
          displayName: TEST_DISPLAY_NAME,
          getAnswers,
        }),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => expect(result.current.snapshot.idbAvailable).toBe(true));
    const firstScheduleSync = result.current.scheduleSync;

    rerender({ enabled: true });
    expect(result.current.scheduleSync).toBe(firstScheduleSync);
  });

  it("reports offline after transport failure while browser claims online", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    drainSyncQueue.mockResolvedValue({ synced: 0, failed: 1, pending: 1 });

    const { result } = renderHook(() =>
      useOfflineExamSync({
        enabled: true,
        liveSessionId: TEST_LIVE_SESSION_ID,
        deviceId: TEST_DEVICE_ID,
        displayName: TEST_DISPLAY_NAME,
        getAnswers: () => ({ q1: "answer" }),
      }),
    );

    await waitFor(() => expect(result.current.snapshot.idbAvailable).toBe(true));

    vi.useFakeTimers();
    try {
      await act(async () => {
        result.current.scheduleSync();
        await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 50);
      });
    } finally {
      vi.useRealTimers();
    }

    await waitFor(() => expect(result.current.snapshot.state).toBe("offline"));
  });

  it("acknowledgeSynced clears pending queue and marks synced", async () => {
    const answers = { q1: "done" };
    const onSynced = vi.fn();

    const { result } = renderHook(() =>
      useOfflineExamSync({
        enabled: true,
        liveSessionId: TEST_LIVE_SESSION_ID,
        deviceId: TEST_DEVICE_ID,
        displayName: TEST_DISPLAY_NAME,
        getAnswers: () => answers,
        onSynced,
      }),
    );

    await waitFor(() => expect(result.current.snapshot.idbAvailable).toBe(true));

    await act(async () => {
      await result.current.acknowledgeSynced();
    });

    expect(clearPendingSyncQueue).toHaveBeenCalledWith(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID);
    expect(onSynced).toHaveBeenCalled();
    expect(result.current.snapshot.state).toBe("synced");
    expect(result.current.snapshot.pendingCount).toBe(0);
  });
});
