"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  FINISH_POLL_INTERVAL_MS,
  ONLINE_RECONNECT_JITTER_MS,
} from "@/lib/offline/config";
import { registerOfflineBackgroundSync, postMessageDrainSync } from "@/lib/offline/background-sync";
import { drainFinishQueue } from "@/lib/offline/finish-engine";
import {
  enqueueFinishItem,
  hasPendingFinish,
} from "@/lib/offline/finish-queue";
import type { StudentAnswers } from "@/lib/forms";

type Options = {
  liveSessionId: string | null;
  deviceId: string | null;
  onFinished?: () => void;
  onPendingFinishRestored?: () => void;
};

export function useOfflineFinishSubmit({
  liveSessionId,
  deviceId,
  onFinished,
  onPendingFinishRestored,
}: Options) {
  const [pendingFinishRaw, setPendingFinishRaw] = useState(false);
  const pendingFinish = Boolean(liveSessionId && deviceId && pendingFinishRaw);
  const drainInFlightRef = useRef<Promise<boolean> | null>(null);
  const onFinishedRef = useRef(onFinished);
  const onPendingFinishRestoredRef = useRef(onPendingFinishRestored);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  });

  useEffect(() => {
    onPendingFinishRestoredRef.current = onPendingFinishRestored;
  });

  const refreshPending = useCallback(async (): Promise<boolean> => {
    if (!liveSessionId || !deviceId) {
      return false;
    }
    const pending = await hasPendingFinish(liveSessionId, deviceId);
    setPendingFinishRaw(pending);
    return pending;
  }, [liveSessionId, deviceId]);

  const runDrain = useCallback(async (): Promise<boolean> => {
    if (!liveSessionId || !deviceId) {
      return false;
    }

    if (drainInFlightRef.current) {
      await drainInFlightRef.current;
      return !(await hasPendingFinish(liveSessionId, deviceId));
    }

    const drain = (async () => {
      const result = await drainFinishQueue(liveSessionId, deviceId);
      const stillPending = await hasPendingFinish(liveSessionId, deviceId);
      setPendingFinishRaw(stillPending);
      if (result.finished) {
        onFinishedRef.current?.();
      }
      return result.finished;
    })();

    drainInFlightRef.current = drain;
    try {
      return await drain;
    } finally {
      drainInFlightRef.current = null;
    }
  }, [liveSessionId, deviceId]);

  const queueSubmit = useCallback(
    async (input: {
      displayName: string;
      answers: StudentAnswers;
      submissionId?: string;
    }): Promise<void> => {
      if (!liveSessionId || !deviceId) {
        return;
      }
      await enqueueFinishItem({
        liveSessionId,
        deviceId,
        displayName: input.displayName,
        answers: input.answers,
        submissionId: input.submissionId,
      });
      setPendingFinishRaw(true);
      await registerOfflineBackgroundSync();
      postMessageDrainSync();
      void runDrain();
    },
    [liveSessionId, deviceId, runDrain],
  );

  useEffect(() => {
    if (!liveSessionId || !deviceId) {
      return;
    }
    let cancelled = false;
    void hasPendingFinish(liveSessionId, deviceId).then((pending) => {
      if (cancelled) {
        return;
      }
      setPendingFinishRaw(pending);
      if (pending) {
        onPendingFinishRestoredRef.current?.();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [liveSessionId, deviceId]);

  useEffect(() => {
    if (!pendingFinish || !liveSessionId || !deviceId) {
      return;
    }
    void runDrain();
    const id = window.setInterval(() => void runDrain(), FINISH_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [pendingFinish, liveSessionId, deviceId, runDrain]);

  useEffect(() => {
    if (!liveSessionId || !deviceId) {
      return;
    }
    const onOnline = () => {
      const jitter = Math.floor(Math.random() * ONLINE_RECONNECT_JITTER_MS);
      window.setTimeout(() => void runDrain(), jitter);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [liveSessionId, deviceId, runDrain]);

  return {
    pendingFinish,
    queueSubmit,
    drainNow: runDrain,
    refreshPending,
  };
}
