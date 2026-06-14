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
};

export function useOfflineFinishSubmit({
  liveSessionId,
  deviceId,
  onFinished,
}: Options) {
  const [pendingFinish, setPendingFinish] = useState(false);
  const drainInFlightRef = useRef<Promise<boolean> | null>(null);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  });

  const refreshPending = useCallback(async (): Promise<boolean> => {
    if (!liveSessionId || !deviceId) {
      setPendingFinish(false);
      return false;
    }
    const pending = await hasPendingFinish(liveSessionId, deviceId);
    setPendingFinish(pending);
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
      setPendingFinish(stillPending);
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
      setPendingFinish(true);
      await registerOfflineBackgroundSync();
      postMessageDrainSync();
      void runDrain();
    },
    [liveSessionId, deviceId, runDrain],
  );

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

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
