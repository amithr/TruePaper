/**
 * Teacher-only "who looks stuck/disengaged" heatmap for the live roster.
 *
 * Derived ENTIRELY client-side from data the overview poll already carries
 * (`lastActivityAt` / `lastTypingAt` per student) — no per-student network call.
 * "Activity" = any interaction heartbeat (pointer/hover/focus + typing), which
 * is what already refreshes `lastActivityAt`.
 *
 * Disconnected stays DISTINCT from inactive: a student reported offline has the
 * inactivity treatment suppressed (the roster wifi dot carries that meaning),
 * so a blackout where half the class drops doesn't read as mass disengagement.
 */
import { LIVE_PRESENCE_STALE_MS } from "@/lib/participant-status";

export type RosterActivityLevel = "active" | "soft" | "strong" | "none";

export type RosterActivityThresholds = {
  /** Minutes of no activity before the subtle "slowing down" treatment. */
  softMin: number;
  /** Minutes of no activity before the stronger "looks stuck" treatment. */
  strongMin: number;
};

export const DEFAULT_ROSTER_ACTIVITY_THRESHOLDS: RosterActivityThresholds = {
  softMin: 4,
  strongMin: 9,
};

export const ROSTER_ACTIVITY_MIN = 1;
export const ROSTER_ACTIVITY_MAX = 60;

/** How often the roster recomputes activity locally (cheap, not per-event). */
export const ROSTER_ACTIVITY_TICK_MS = 20_000;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeRosterActivityThresholds(
  input: Partial<RosterActivityThresholds> | null | undefined,
): RosterActivityThresholds {
  const soft = clamp(input?.softMin ?? DEFAULT_ROSTER_ACTIVITY_THRESHOLDS.softMin, ROSTER_ACTIVITY_MIN, ROSTER_ACTIVITY_MAX - 1);
  let strong = clamp(input?.strongMin ?? DEFAULT_ROSTER_ACTIVITY_THRESHOLDS.strongMin, ROSTER_ACTIVITY_MIN + 1, ROSTER_ACTIVITY_MAX);
  if (strong <= soft) {
    strong = Math.min(ROSTER_ACTIVITY_MAX, soft + 1);
  }
  return { softMin: soft, strongMin: strong };
}

export type RosterActivityInput = {
  suspendedAt: string | null;
  finishedAt: string | null;
  gradedAt: string | null;
  syncState: "synced" | "pending" | "offline";
  lastActivityAt: string | null;
  lastTypingAt: string | null;
  /** Last heartbeat of any kind (incl. idle keepalive); null pre-migration. */
  lastSeenAt: string | null;
};

export type RosterActivity = {
  level: RosterActivityLevel;
  /** ms since the last interaction; 0 when not applicable. */
  inactiveMs: number;
};

export function deriveRosterActivity(
  p: RosterActivityInput,
  thresholds: RosterActivityThresholds,
  sessionOpen: boolean,
  nowMs: number = Date.now(),
): RosterActivity {
  // Terminal / paused / closed states have their own pills — no heat treatment.
  if (!sessionOpen || p.finishedAt || p.gradedAt || p.suspendedAt) {
    return { level: "none", inactiveMs: 0 };
  }

  // Disconnected != disengaged: suppress inactivity, keep it distinct from offline.
  if (p.syncState === "offline") {
    return { level: "none", inactiveMs: 0 };
  }

  // Silent disconnect: keepalive heartbeats stopped arriving, so we can't trust
  // "no activity" to mean disengagement. Suppress (the offline wifi dot, which
  // also keys off stale last_seen, carries this). Null degrades to legacy behavior.
  if (p.lastSeenAt) {
    const seenAge = nowMs - new Date(p.lastSeenAt).getTime();
    if (seenAge > LIVE_PRESENCE_STALE_MS) {
      return { level: "none", inactiveMs: 0 };
    }
  }

  const lastA = p.lastActivityAt ? new Date(p.lastActivityAt).getTime() : 0;
  const lastT = p.lastTypingAt ? new Date(p.lastTypingAt).getTime() : 0;
  const last = Math.max(lastA, lastT);
  if (!last) {
    // No activity timestamp yet (just registered) — don't flag prematurely.
    return { level: "active", inactiveMs: 0 };
  }

  const inactiveMs = Math.max(0, nowMs - last);
  const softMs = thresholds.softMin * 60_000;
  const strongMs = thresholds.strongMin * 60_000;
  if (inactiveMs >= strongMs) {
    return { level: "strong", inactiveMs };
  }
  if (inactiveMs >= softMs) {
    return { level: "soft", inactiveMs };
  }
  return { level: "active", inactiveMs };
}

/** Whole-minute "time since last activity" for the small roster label. */
export function inactiveMinutes(inactiveMs: number): number {
  return Math.floor(inactiveMs / 60_000);
}
