"use client";

import { useCallback, useEffect, useState } from "react";

import { deferEffect } from "@/lib/defer-effect";
import {
  DEFAULT_ROSTER_ACTIVITY_THRESHOLDS,
  normalizeRosterActivityThresholds,
  type RosterActivityThresholds,
} from "@/lib/roster-activity";

function storageKey(sessionId: string): string {
  return `tp:roster-activity:${sessionId}`;
}

function readStored(sessionId: string): RosterActivityThresholds {
  if (typeof window === "undefined" || !sessionId) {
    return DEFAULT_ROSTER_ACTIVITY_THRESHOLDS;
  }
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId));
    if (!raw) {
      return DEFAULT_ROSTER_ACTIVITY_THRESHOLDS;
    }
    const parsed = JSON.parse(raw) as Partial<RosterActivityThresholds>;
    return normalizeRosterActivityThresholds(parsed);
  } catch {
    return DEFAULT_ROSTER_ACTIVITY_THRESHOLDS;
  }
}

/**
 * Per-session inactivity thresholds, stored locally on the teacher's device.
 * No backend / migration; intentionally does not follow the teacher to another
 * device (a deliberate, low-stakes trade for zero added network/scale cost).
 */
export function useRosterActivityThresholds(
  sessionId: string,
): [RosterActivityThresholds, (next: RosterActivityThresholds) => void] {
  // Start from the default so SSR and first client render agree; load the stored
  // value after mount to avoid a hydration mismatch.
  const [thresholds, setThresholds] = useState<RosterActivityThresholds>(
    DEFAULT_ROSTER_ACTIVITY_THRESHOLDS,
  );

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    deferEffect(() => setThresholds(readStored(sessionId)));
  }, [sessionId]);

  const update = useCallback(
    (next: RosterActivityThresholds) => {
      const normalized = normalizeRosterActivityThresholds(next);
      setThresholds(normalized);
      if (typeof window !== "undefined" && sessionId) {
        try {
          window.localStorage.setItem(storageKey(sessionId), JSON.stringify(normalized));
        } catch {
          /* storage full / disabled — keep the in-memory value */
        }
      }
    },
    [sessionId],
  );

  return [thresholds, update];
}
