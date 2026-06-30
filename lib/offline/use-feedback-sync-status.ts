"use client";

import { useCallback, useEffect, useState } from "react";

import { ONLINE_RECONNECT_JITTER_MS, FEEDBACK_POLL_INTERVAL_MS } from "@/lib/offline/config";
import { drainSessionFeedbackQueue } from "@/lib/offline/feedback-engine";
import {
  listSessionFeedbackItems,
  retryAllFailedFeedbackItems,
} from "@/lib/offline/feedback-queue";
import {
  deriveSyncStatus,
  SYNC_STRUGGLING_ATTEMPTS,
  type SyncStatus,
} from "@/lib/sync-status";
import { onSyncQueueChanged } from "@/lib/sync-status-events";
import { deferEffect } from "@/lib/defer-effect";

type Options = {
  liveSessionId: string | null;
  enabled: boolean;
};

const SYNCED: SyncStatus = {
  state: "synced",
  count: 0,
  oldestQueuedAt: null,
  breakdown: { responses: 0, submission: 0, comments: 0 },
  hasFailed: false,
};

/**
 * Derives the teacher's ambient sync status from their local feedback queue
 * (all students), reactively via the in-tab queue-change signal. Also keeps the
 * queue draining on this page so feedback delivers regardless of whether the
 * teacher is on the session header or a per-student watch page.
 */
export function useFeedbackSyncStatus({ liveSessionId, enabled }: Options) {
  const [status, setStatus] = useState<SyncStatus>(SYNCED);

  const refresh = useCallback(async () => {
    if (!liveSessionId) {
      setStatus(SYNCED);
      return;
    }
    const items = await listSessionFeedbackItems(liveSessionId);
    if (items.length === 0) {
      setStatus(SYNCED);
      return;
    }
    const hasFailed = items.some((i) => i.status === "failed");
    const struggling = items.some(
      (i) => i.status !== "failed" && i.attempts >= SYNC_STRUGGLING_ATTEMPTS,
    );
    const oldestQueuedAt = items.reduce<number | null>(
      (min, i) => (min == null ? i.createdAt : Math.min(min, i.createdAt)),
      null,
    );
    setStatus(
      deriveSyncStatus({
        breakdown: { responses: 0, submission: 0, comments: items.length },
        oldestQueuedAt,
        hasFailed,
        struggling,
      }),
    );
  }, [liveSessionId]);

  const drain = useCallback(async () => {
    if (!liveSessionId) {
      return;
    }
    await drainSessionFeedbackQueue(liveSessionId);
    await refresh();
  }, [liveSessionId, refresh]);

  const retry = useCallback(async () => {
    if (!liveSessionId) {
      return;
    }
    await retryAllFailedFeedbackItems(liveSessionId);
    await drain();
  }, [liveSessionId, drain]);

  // Reactive: re-read on every local queue mutation (any page in this tab).
  useEffect(() => {
    if (!enabled || !liveSessionId) {
      return;
    }
    deferEffect(() => void refresh());
    const off = onSyncQueueChanged(() => void refresh());
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      off();
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, liveSessionId, refresh]);

  // Keep delivering: drain on mount, on reconnect (jittered), and on a slow poll
  // while items remain pending.
  useEffect(() => {
    if (!enabled || !liveSessionId) {
      return;
    }
    deferEffect(() => void drain());
    const onOnline = () => {
      const jitter = Math.floor(Math.random() * ONLINE_RECONNECT_JITTER_MS);
      window.setTimeout(() => void drain(), jitter);
    };
    window.addEventListener("online", onOnline);
    const id = window.setInterval(() => void drain(), FEEDBACK_POLL_INTERVAL_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(id);
    };
  }, [enabled, liveSessionId, drain]);

  return { status, retry };
}
