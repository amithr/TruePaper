"use client";

import { useEffect, useRef, useState } from "react";

import { deriveSyncStatus, type SyncStatus } from "@/lib/sync-status";

type Options = {
  /** Pending student answer autosaves (0 or 1 — the queue collapses). */
  pendingResponses: number;
  /** Exam submission queued for delivery. */
  pendingFinish: boolean;
  /** Recent sync attempts are failing / server unreachable (transport-derived). */
  struggling: boolean;
};

const SYNCED: SyncStatus = {
  state: "synced",
  count: 0,
  oldestQueuedAt: null,
  breakdown: { responses: 0, submission: 0, comments: 0 },
  hasFailed: false,
};

/**
 * Derives the student's ambient sync status purely from local queue facts the
 * answer/finish hooks already track — no IndexedDB reads on the hot path and no
 * server round-trip. Oldest-age is measured from when each queue first became
 * non-empty, which is enough for the coarse "roughly how old" detail.
 */
export function useStudentSyncStatus({
  pendingResponses,
  pendingFinish,
  struggling,
}: Options): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(SYNCED);
  const responsesSinceRef = useRef<number | null>(null);
  const finishSinceRef = useRef<number | null>(null);

  useEffect(() => {
    const recompute = () => {
      const now = Date.now();
      if (pendingResponses > 0) {
        responsesSinceRef.current ??= now;
      } else {
        responsesSinceRef.current = null;
      }
      if (pendingFinish) {
        finishSinceRef.current ??= now;
      } else {
        finishSinceRef.current = null;
      }

      const times = [responsesSinceRef.current, finishSinceRef.current].filter(
        (x): x is number => x != null,
      );
      const oldestQueuedAt = times.length ? Math.min(...times) : null;

      setStatus(
        deriveSyncStatus({
          breakdown: {
            responses: pendingResponses > 0 ? 1 : 0,
            submission: pendingFinish ? 1 : 0,
            comments: 0,
          },
          oldestQueuedAt,
          hasFailed: false,
          struggling,
          now,
        }),
      );
    };

    recompute();

    // While anything is pending, re-evaluate on a slow cadence so the age display
    // stays fresh and a sustained struggle can escalate to `attention` at the
    // threshold. Stops entirely once synced.
    const pending = pendingResponses > 0 || pendingFinish;
    if (!pending) {
      return;
    }
    const id = window.setInterval(recompute, 5_000);
    return () => window.clearInterval(id);
  }, [pendingResponses, pendingFinish, struggling]);

  return status;
}
