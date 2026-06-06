"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StudentAnswers } from "@/lib/forms";
import { saveLocalAnswers } from "@/lib/offline/answer-store";
import {
  SYNC_DEBOUNCE_MS,
  SYNC_MAX_WAIT_MS,
  type ClientSyncState,
} from "@/lib/offline/config";
import { isIdbAvailable } from "@/lib/offline/idb";
import {
  clearPendingSyncQueue,
  prunePendingSyncQueue,
  enqueueSyncItem,
} from "@/lib/offline/sync-queue";
import { drainSyncQueue } from "@/lib/offline/sync-engine";
import { putStudentAnswersSync } from "@/lib/offline/sync-transport";
import type { ConnectionSnapshot } from "@/lib/offline/types";
import { stableStringifyStudentAnswers } from "@/lib/student-answers-json";

function snapshotsEqual(a: ConnectionSnapshot, b: ConnectionSnapshot): boolean {
  return (
    a.state === b.state &&
    a.pendingCount === b.pendingCount &&
    a.lastSyncedAt === b.lastSyncedAt &&
    a.idbAvailable === b.idbAvailable
  );
}

type DrainResult = { synced: number; failed: number; pending: number };

function deriveSyncState(input: {
  pending: number;
  synced: number;
  failed: number;
}): ClientSyncState {
  const navOnline = typeof navigator !== "undefined" && navigator.onLine;
  // Transport failures with pending work mean we cannot reach the server — even when
  // navigator.onLine is still true (Playwright offline, captive portals, etc.).
  const transportUnreachable = input.failed > 0 && input.synced === 0 && input.pending > 0;
  const reachable = input.synced > 0 || (navOnline && !transportUnreachable);

  if (input.pending > 0) {
    return reachable ? "syncing" : "offline";
  }
  return reachable ? "synced" : "local_only";
}

type Options = {
  liveSessionId: string | null;
  deviceId: string | null;
  displayName: string;
  enabled: boolean;
  getAnswers: () => StudentAnswers;
  onSynced?: (answersJson: string) => void;
  onStatusChange?: (snapshot: ConnectionSnapshot) => void;
};

export function useOfflineExamSync({
  liveSessionId,
  deviceId,
  displayName,
  enabled,
  getAnswers,
  onSynced,
  onStatusChange,
}: Options) {
  const [snapshot, setSnapshot] = useState<ConnectionSnapshot>({
    state: "online",
    pendingCount: 0,
    lastSyncedAt: null,
    idbAvailable: true,
  });

  const debounceRef = useRef<number | undefined>(undefined);
  const dirtySinceRef = useRef<number | null>(null);
  const lastSentJsonRef = useRef<string>("");
  const lastSentAtRef = useRef(0);
  const lastSyncedAtRef = useRef<number | null>(null);
  const drainInFlightRef = useRef<Promise<DrainResult> | null>(null);
  const runDrainRef = useRef<() => Promise<void>>(async () => {});
  const onStatusChangeRef = useRef(onStatusChange);
  const onSyncedRef = useRef(onSynced);
  const getAnswersRef = useRef(getAnswers);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
    onSyncedRef.current = onSynced;
    getAnswersRef.current = getAnswers;
  });

  const publish = useCallback(
    (next: Partial<ConnectionSnapshot> & { state?: ClientSyncState }) => {
      setSnapshot((prev) => {
        const merged = { ...prev, ...next };
        if (merged.lastSyncedAt != null) {
          lastSyncedAtRef.current = merged.lastSyncedAt;
        }
        if (snapshotsEqual(prev, merged)) {
          return prev;
        }
        onStatusChangeRef.current?.(merged);
        return merged;
      });
    },
    [],
  );

  const refreshPending = useCallback(async () => {
    if (!liveSessionId || !deviceId) {
      return 0;
    }
    const count = await prunePendingSyncQueue(liveSessionId, deviceId);
    publish({ pendingCount: count });
    return count;
  }, [liveSessionId, deviceId, publish]);

  const markFullySynced = useCallback(() => {
    const json = stableStringifyStudentAnswers(getAnswersRef.current());
    lastSentJsonRef.current = json;
    onSyncedRef.current?.(json);
  }, []);

  const cancelScheduledFlush = useCallback(() => {
    if (debounceRef.current !== undefined) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = undefined;
    }
  }, []);

  const runDrain = useCallback(async (): Promise<void> => {
    if (!liveSessionId || !deviceId || !displayName) {
      return;
    }

    // Loop until the queue is empty. A concurrent enqueue during an in-flight drain
    // previously left pending rows behind because the waiter returned early.
    while (true) {
      if (drainInFlightRef.current) {
        await drainInFlightRef.current;
        continue;
      }

      const browserOffline = typeof navigator !== "undefined" && !navigator.onLine;
      if (!browserOffline) {
        publish({ state: "syncing" });
      }

      const drain = (async () => {
        try {
          const result = await drainSyncQueue(liveSessionId, deviceId, (item) =>
            putStudentAnswersSync({
              liveSessionId: item.liveSessionId,
              deviceId: item.deviceId,
              displayName: item.displayName,
              answers: item.answers,
              submissionId: item.submissionId,
            }),
          );
          const pendingAfter = await refreshPending();
          const syncedAt = result.synced > 0 ? Date.now() : lastSyncedAtRef.current;
          publish({
            pendingCount: pendingAfter,
            state: deriveSyncState({ ...result, pending: pendingAfter }),
            lastSyncedAt: syncedAt,
          });
          if (pendingAfter === 0) {
            markFullySynced();
          }
          return result;
        } finally {
          drainInFlightRef.current = null;
        }
      })();

      drainInFlightRef.current = drain;
      const result = await drain;

      const pendingAfter = await refreshPending();
      if (pendingAfter === 0) {
        return;
      }
      // Retry immediately only when we made progress (e.g. a newer enqueue landed mid-drain).
      if (result.synced === 0) {
        return;
      }
    }
  }, [liveSessionId, deviceId, displayName, markFullySynced, publish, refreshPending]);

  useEffect(() => {
    runDrainRef.current = runDrain;
  }, [runDrain]);

  const scheduleSync = useCallback(() => {
    if (!enabled || !liveSessionId || !deviceId || !displayName) {
      return;
    }
    const answers = getAnswersRef.current();
    const json = stableStringifyStudentAnswers(answers);
    if (json === lastSentJsonRef.current) {
      void (async () => {
        const pending = await refreshPending();
        const navOnline = typeof navigator !== "undefined" && navigator.onLine;
        publish({
          pendingCount: pending,
          state:
            pending > 0
              ? navOnline
                ? "syncing"
                : "offline"
              : navOnline
                ? "synced"
                : "local_only",
        });
        if (pending === 0) {
          markFullySynced();
        }
      })();
      return;
    }
    if (dirtySinceRef.current === null) {
      dirtySinceRef.current = Date.now();
    }
    const browserOffline = typeof navigator !== "undefined" && !navigator.onLine;
    publish({ state: browserOffline ? "offline" : "syncing" });

    const flush = async () => {
      const current = getAnswersRef.current();
      await saveLocalAnswers(liveSessionId, deviceId, current);
      await enqueueSyncItem({
        liveSessionId,
        deviceId,
        displayName,
        answers: current,
      });
      await refreshPending();
      dirtySinceRef.current = null;
      lastSentAtRef.current = Date.now();
      await runDrain();
    };

    cancelScheduledFlush();

    const dirtyFor = Date.now() - (dirtySinceRef.current ?? Date.now());
    const sinceLast = Date.now() - lastSentAtRef.current;
    if (dirtyFor >= SYNC_MAX_WAIT_MS || sinceLast >= SYNC_MAX_WAIT_MS) {
      void flush();
    } else {
      debounceRef.current = window.setTimeout(() => void flush(), SYNC_DEBOUNCE_MS);
    }
  }, [
    enabled,
    liveSessionId,
    deviceId,
    displayName,
    cancelScheduledFlush,
    markFullySynced,
    publish,
    refreshPending,
    runDrain,
  ]);

  const acknowledgeSynced = useCallback(async (): Promise<void> => {
    if (!liveSessionId || !deviceId) {
      return;
    }
    await clearPendingSyncQueue(liveSessionId, deviceId);
    markFullySynced();
    publish({
      pendingCount: 0,
      state: navigator.onLine ? "synced" : "local_only",
      lastSyncedAt: Date.now(),
    });
  }, [liveSessionId, deviceId, markFullySynced, publish]);

  const flushNow = useCallback(async (): Promise<{ pending: number }> => {
    if (!liveSessionId || !deviceId || !displayName) {
      return { pending: 0 };
    }

    cancelScheduledFlush();
    const current = getAnswersRef.current();
    await saveLocalAnswers(liveSessionId, deviceId, current);
    await enqueueSyncItem({
      liveSessionId,
      deviceId,
      displayName,
      answers: current,
    });
    dirtySinceRef.current = null;
    lastSentAtRef.current = Date.now();
    await refreshPending();
    await runDrain();
    const pending = await refreshPending();
    return { pending };
  }, [liveSessionId, deviceId, displayName, cancelScheduledFlush, refreshPending, runDrain]);

  useEffect(() => {
    void isIdbAvailable().then((ok) => publish({ idbAvailable: ok }));
  }, [publish]);

  // Heal any stale/orphaned queue rows on load so the pending count can't show a
  // runaway value before the first autosave fires.
  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  useEffect(() => {
    const onOnline = () => {
      publish({ state: "syncing" });
      void runDrainRef.current();
    };
    const onOffline = () => publish({ state: "offline" });
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    // Optimistic on load: assume reachable and let a failed request prove otherwise.
    publish({ state: "synced" });
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [publish]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onPageHide = () => {
      void (async () => {
        if (!liveSessionId || !deviceId || !displayName) {
          return;
        }
        const answers = getAnswersRef.current();
        await saveLocalAnswers(liveSessionId, deviceId, answers);
        await enqueueSyncItem({ liveSessionId, deviceId, displayName, answers });
        void runDrain();
      })();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [enabled, liveSessionId, deviceId, displayName, runDrain]);

  return useMemo(
    () => ({
      snapshot,
      scheduleSync,
      flushNow,
      acknowledgeSynced,
      refreshPending,
    }),
    [snapshot, scheduleSync, flushNow, acknowledgeSynced, refreshPending],
  );
}
