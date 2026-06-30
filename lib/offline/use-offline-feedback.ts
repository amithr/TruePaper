"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  FEEDBACK_POLL_INTERVAL_MS,
  ONLINE_RECONNECT_JITTER_MS,
} from "@/lib/offline/config";
import { postMessageDrainSync, registerOfflineBackgroundSync } from "@/lib/offline/background-sync";
import { drainFeedbackQueue } from "@/lib/offline/feedback-engine";
import {
  editQueuedFeedbackItem,
  enqueueFeedbackItem,
  getFeedbackItem,
  listPendingFeedbackItems,
  removeFeedbackItem,
  retryFailedFeedbackItem,
} from "@/lib/offline/feedback-queue";
import type { FeedbackQueueItem } from "@/lib/offline/types";
import {
  mergeFeedbackForTeacher,
  type ServerFeedbackItem,
  type TeacherFeedbackDisplayItem,
} from "@/lib/feedback-items";
import { deferEffect } from "@/lib/defer-effect";
import { requestJson } from "@/lib/request-json";

type Options = {
  liveSessionId: string | null;
  deviceId: string | null;
  enabled: boolean;
};

export function useOfflineFeedback({ liveSessionId, deviceId, enabled }: Options) {
  const [localItems, setLocalItems] = useState<FeedbackQueueItem[]>([]);
  const [serverItems, setServerItems] = useState<ServerFeedbackItem[]>([]);
  const drainInFlightRef = useRef<Promise<void> | null>(null);

  const refreshLocal = useCallback(async () => {
    if (!liveSessionId || !deviceId) {
      setLocalItems([]);
      return [] as FeedbackQueueItem[];
    }
    const items = await listPendingFeedbackItems(liveSessionId, deviceId);
    setLocalItems(items);
    return items;
  }, [liveSessionId, deviceId]);

  const refreshServer = useCallback(async () => {
    if (!liveSessionId || !deviceId) {
      setServerItems([]);
      return;
    }
    try {
      const data = await requestJson<{ items: ServerFeedbackItem[] }>(
        `/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(
          deviceId,
        )}/feedback-items`,
      );
      setServerItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      /* transient; next poll retries. Local queue still shows pending work. */
    }
  }, [liveSessionId, deviceId]);

  const runDrain = useCallback(async (): Promise<void> => {
    if (!liveSessionId || !deviceId) {
      return;
    }
    if (drainInFlightRef.current) {
      await drainInFlightRef.current;
      return;
    }
    const drain = (async () => {
      try {
        const result = await drainFeedbackQueue(liveSessionId, deviceId);
        await refreshLocal();
        if (result.synced > 0) {
          await refreshServer();
        }
      } finally {
        drainInFlightRef.current = null;
      }
    })();
    drainInFlightRef.current = drain;
    await drain;
  }, [liveSessionId, deviceId, refreshLocal, refreshServer]);

  const sendFeedback = useCallback(
    async (input: {
      questionId: string | null;
      body: string;
      responseVersionTag?: string | null;
    }): Promise<void> => {
      if (!liveSessionId || !deviceId) {
        return;
      }
      const body = input.body.trim();
      if (!body) {
        return;
      }
      await enqueueFeedbackItem({
        liveSessionId,
        studentDeviceId: deviceId,
        questionId: input.questionId,
        body,
        responseVersionTag: input.responseVersionTag ?? null,
      });
      await refreshLocal();
      await registerOfflineBackgroundSync();
      postMessageDrainSync();
      void runDrain();
    },
    [liveSessionId, deviceId, refreshLocal, runDrain],
  );

  /** Edit a queued (local) item in place, or upsert a synced item server-side. */
  const editFeedback = useCallback(
    async (id: string, body: string): Promise<void> => {
      const trimmed = body.trim();
      if (!trimmed) {
        return;
      }
      const local = await getFeedbackItem(id);
      if (local) {
        await editQueuedFeedbackItem(id, trimmed);
        await refreshLocal();
        void runDrain();
        return;
      }
      if (!liveSessionId || !deviceId) {
        return;
      }
      const existing = serverItems.find((i) => i.id === id);
      try {
        await requestJson(
          `/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(
            deviceId,
          )}/feedback-items`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id,
              questionId: existing?.questionId ?? null,
              body: trimmed,
              createdAt: existing?.createdAt ?? new Date().toISOString(),
            }),
          },
        );
        await refreshServer();
      } catch {
        /* surfaced via server poll staying unchanged */
      }
    },
    [liveSessionId, deviceId, serverItems, refreshLocal, refreshServer, runDrain],
  );

  /** Remove a queued item locally (never synced), or retract a synced one. */
  const deleteFeedback = useCallback(
    async (id: string): Promise<void> => {
      const local = await getFeedbackItem(id);
      if (local) {
        await removeFeedbackItem(id);
        await refreshLocal();
        return;
      }
      if (!liveSessionId || !deviceId) {
        return;
      }
      try {
        await requestJson(
          `/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(
            deviceId,
          )}/feedback-items/${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        await refreshServer();
      } catch {
        /* leave as-is; teacher can retry */
      }
    },
    [liveSessionId, deviceId, refreshLocal, refreshServer],
  );

  const retryFeedback = useCallback(
    async (id: string): Promise<void> => {
      await retryFailedFeedbackItem(id);
      await refreshLocal();
      void runDrain();
    },
    [refreshLocal, runDrain],
  );

  useEffect(() => {
    if (!enabled || !liveSessionId || !deviceId) {
      return;
    }
    deferEffect(() => {
      void refreshLocal();
      void refreshServer();
      void runDrain();
    });
  }, [enabled, liveSessionId, deviceId, refreshLocal, refreshServer, runDrain]);

  // Periodic poll: drain any pending work and refresh delivery status.
  useEffect(() => {
    if (!enabled || !liveSessionId || !deviceId) {
      return;
    }
    const id = window.setInterval(() => {
      void runDrain();
      void refreshServer();
    }, FEEDBACK_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [enabled, liveSessionId, deviceId, runDrain, refreshServer]);

  // Reconnect: drain with jitter so a fleet doesn't stampede the server.
  useEffect(() => {
    if (!enabled || !liveSessionId || !deviceId) {
      return;
    }
    const onOnline = () => {
      const jitter = Math.floor(Math.random() * ONLINE_RECONNECT_JITTER_MS);
      window.setTimeout(() => void runDrain(), jitter);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [enabled, liveSessionId, deviceId, runDrain]);

  const items = useMemo(
    () => mergeFeedbackForTeacher(localItems, serverItems),
    [localItems, serverItems],
  );

  const pendingCount = useMemo(
    () => localItems.filter((i) => i.status !== "failed").length,
    [localItems],
  );
  const failedCount = useMemo(
    () => localItems.filter((i) => i.status === "failed").length,
    [localItems],
  );

  return {
    items,
    itemsByQuestionId: useMemo(() => {
      const map = new Map<string, TeacherFeedbackDisplayItem[]>();
      for (const item of items) {
        const key = item.questionId ?? "__response__";
        const list = map.get(key) ?? [];
        list.push(item);
        map.set(key, list);
      }
      return map;
    }, [items]),
    pendingCount,
    failedCount,
    sendFeedback,
    editFeedback,
    deleteFeedback,
    retryFeedback,
    refresh: useCallback(async () => {
      await refreshLocal();
      await refreshServer();
    }, [refreshLocal, refreshServer]),
  };
}
