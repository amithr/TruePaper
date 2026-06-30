/**
 * Pure derivation of the single, ambient sync-status signal shown to students
 * and teachers. The three states are intentionally plain — internal transport
 * states (online flags, error codes, "uploading") never reach the UI.
 *
 * Truthfulness invariants (relied on by callers):
 * - A write is removed from its local queue ONLY after the server confirms it,
 *   so an empty queue == confirmed synced. We therefore show `synced` only when
 *   counts are zero, and `queued` for anything still local — never the reverse,
 *   never optimistically "synced".
 * - State derives from queue CONTENTS (counts, oldest age, last-attempt result),
 *   never from a standalone "is online" flag, so flaky wifi that times out reads
 *   as `queued`/`attention`, not `synced`.
 */

/** Oldest queued item age before a struggling sync escalates to `attention`. */
export const SYNC_STRUGGLING_MS = 45_000;

/** Per-item retry attempts that mark a queue as "struggling". */
export const SYNC_STRUGGLING_ATTEMPTS = 2;

export type SyncState = "synced" | "queued" | "attention";

export type SyncBreakdown = {
  /** Pending student answer autosaves (collapses to ≤1). */
  responses: number;
  /** Pending exam submission (0 or 1). */
  submission: number;
  /** Pending teacher feedback comments. */
  comments: number;
};

export type SyncStatus = {
  state: SyncState;
  count: number;
  /** ms epoch of the oldest still-queued item, or null when nothing is queued. */
  oldestQueuedAt: number | null;
  breakdown: SyncBreakdown;
  /** A queued item has hit a terminal failure and needs the user's attention. */
  hasFailed: boolean;
};

export type SyncStatusInput = {
  breakdown: SyncBreakdown;
  oldestQueuedAt: number | null;
  /** A terminal failure is present (e.g. server rejected a feedback item). */
  hasFailed: boolean;
  /** Recent attempts are failing / the server is unreachable. */
  struggling: boolean;
  now?: number;
};

export function syncBreakdownCount(breakdown: SyncBreakdown): number {
  return breakdown.responses + breakdown.submission + breakdown.comments;
}

export function deriveSyncStatus(input: SyncStatusInput): SyncStatus {
  const { breakdown, oldestQueuedAt, hasFailed, struggling } = input;
  const count = syncBreakdownCount(breakdown);

  if (count === 0) {
    return {
      state: "synced",
      count: 0,
      oldestQueuedAt: null,
      breakdown,
      hasFailed: false,
    };
  }

  const now = input.now ?? Date.now();
  const age = oldestQueuedAt != null ? Math.max(0, now - oldestQueuedAt) : 0;
  // Brief blips stay calm (`queued`); only a sustained struggle (or a terminal
  // failure) escalates to the muted-amber `attention` state.
  const attention = hasFailed || (struggling && age >= SYNC_STRUGGLING_MS);

  return {
    state: attention ? "attention" : "queued",
    count,
    oldestQueuedAt,
    breakdown,
    hasFailed,
  };
}

export type RelativeAge = { unit: "now" | "seconds" | "minutes" | "hours"; value: number };

/** Coarse "roughly how old" bucket for the detail view (no exact timestamps). */
export function relativeAge(oldestQueuedAt: number | null, now: number = Date.now()): RelativeAge {
  if (oldestQueuedAt == null) {
    return { unit: "now", value: 0 };
  }
  const seconds = Math.max(0, Math.round((now - oldestQueuedAt) / 1000));
  if (seconds < 20) {
    return { unit: "now", value: 0 };
  }
  if (seconds < 60) {
    return { unit: "seconds", value: seconds };
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return { unit: "minutes", value: minutes };
  }
  return { unit: "hours", value: Math.round(minutes / 60) };
}
