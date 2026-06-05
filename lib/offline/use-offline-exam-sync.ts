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
import { pendingSyncCount, enqueueSyncItem } from "@/lib/offline/sync-queue";
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
  const drainingRef = useRef(false);
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
    const count = await pendingSyncCount(liveSessionId, deviceId);
    publish({ pendingCount: count });
    return count;
  }, [liveSessionId, deviceId, publish]);

  const runDrain = useCallback(async () => {
    if (!liveSessionId || !deviceId || !displayName || drainingRef.current) {
      return;
    }
    drainingRef.current = true;
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
      if (result.synced > 0) {
        const json = stableStringifyStudentAnswers(getAnswersRef.current());
        lastSentJsonRef.current = json;
        onSyncedRef.current?.(json);
      }
    } finally {
      drainingRef.current = false;
    }
  }, [liveSessionId, deviceId, displayName, publish]);

  const scheduleSync = useCallback(() => {
    if (!enabled || !liveSessionId || !deviceId || !displayName) {
      return;
    }
    const answers = getAnswersRef.current();
    const json = stableStringifyStudentAnswers(answers);
    if (json === lastSentJsonRef.current) {
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
      void runDrain();
    };

    if (debounceRef.current !== undefined) {
      window.clearTimeout(debounceRef.current);
    }

    const dirtyFor = Date.now() - (dirtySinceRef.current ?? Date.now());
    const sinceLast = Date.now() - lastSentAtRef.current;
    if (dirtyFor >= SYNC_MAX_WAIT_MS || sinceLast >= SYNC_MAX_WAIT_MS) {
      void flush();
    } else {
      debounceRef.current = window.setTimeout(() => void flush(), SYNC_DEBOUNCE_MS);
    }
  }, [enabled, liveSessionId, deviceId, displayName, publish, refreshPending, runDrain]);

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
    flushNow: runDrain,
    refreshPending,
  };
}
