"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  const drainInFlightRef = useRef<Promise<void> | null>(null);
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
    if (drainInFlightRef.current) {
      await drainInFlightRef.current;
      return;
    }

    const drain = (async () => {
      publish({ state: "syncing" });
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
        const online = typeof navigator !== "undefined" && navigator.onLine;
        const syncedAt = result.synced > 0 ? Date.now() : lastSyncedAtRef.current;
        publish({
          pendingCount: result.pending,
          state:
            result.pending > 0
              ? online
                ? "syncing"
                : "offline"
              : online
                ? "synced"
                : "local_only",
          lastSyncedAt: syncedAt,
        });
        if (result.pending === 0) {
          markFullySynced();
        }
      } finally {
        drainInFlightRef.current = null;
      }
    })();

    drainInFlightRef.current = drain;
    await drain;
  }, [liveSessionId, deviceId, displayName, markFullySynced, publish]);

  const scheduleSync = useCallback(() => {
    if (!enabled || !liveSessionId || !deviceId || !displayName) {
      return;
    }
    const answers = getAnswersRef.current();
    const json = stableStringifyStudentAnswers(answers);
    if (json === lastSentJsonRef.current) {
      void (async () => {
        const pending = await refreshPending();
        const online = typeof navigator !== "undefined" && navigator.onLine;
        publish({
          pendingCount: pending,
          state:
            pending > 0 ? (online ? "syncing" : "offline") : online ? "synced" : "local_only",
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
    publish({
      state: navigator.onLine ? "syncing" : "offline",
    });

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

  useEffect(() => {
    const onOnline = () => {
      publish({ state: "syncing" });
      void runDrain();
    };
    const onOffline = () => publish({ state: "offline" });
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    publish({ state: navigator.onLine ? "synced" : "offline" });
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [publish, runDrain]);

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

  return {
    snapshot,
    scheduleSync,
    flushNow,
    acknowledgeSynced,
    refreshPending,
  };
}
