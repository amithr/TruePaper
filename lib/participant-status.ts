export type LiveParticipantUiStatus =
  | "blocked"
  | "graded"
  | "finished"
  | "typing"
  | "idle"
  | "started";

/** Recent typing shows the typing badge. */
export const LIVE_TYPING_INDICATOR_MS = 8000;

/** No pointer/hover activity and no typing within this window counts as idle. */
export const LIVE_INTERACTION_IDLE_MS = 45000;

export type ParticipantStatusInput = {
  suspendedAt: string | null;
  finishedAt: string | null;
  gradedAt?: string | null;
  lastActivityAt: string | null;
  lastTypingAt: string | null;
};

/** True when the student is actively engaged (pointer/hover or typing) within the idle window. */
export function isLiveParticipantActivelyEngaged(
  row: ParticipantStatusInput,
  sessionWindowOpen: boolean,
  nowMs: number = Date.now(),
): boolean {
  if (!sessionWindowOpen || row.suspendedAt || row.finishedAt || row.gradedAt) {
    return false;
  }
  const status = computeLiveParticipantUiStatus(row, sessionWindowOpen, nowMs);
  return status === "typing" || status === "started";
}

/** Derive a coarse UI status for the teacher monitor (heartbeats + timestamps). */
export function computeLiveParticipantUiStatus(
  row: ParticipantStatusInput,
  sessionWindowOpen: boolean,
  nowMs: number = Date.now(),
): LiveParticipantUiStatus {
  if (row.suspendedAt) {
    return "blocked";
  }
  if (row.gradedAt) {
    return "graded";
  }
  if (row.finishedAt) {
    return "finished";
  }
  if (!sessionWindowOpen) {
    return "idle";
  }
  const now = nowMs;
  const lastTypMs = row.lastTypingAt ? new Date(row.lastTypingAt).getTime() : 0;
  if (row.lastTypingAt) {
    const typingAge = now - lastTypMs;
    if (typingAge >= 0 && typingAge < LIVE_TYPING_INDICATOR_MS) {
      return "typing";
    }
  }
  const lastActMs = row.lastActivityAt ? new Date(row.lastActivityAt).getTime() : 0;
  const pointerIdle = !lastActMs || now - lastActMs > LIVE_INTERACTION_IDLE_MS;
  const typingIdle = !lastTypMs || now - lastTypMs > LIVE_INTERACTION_IDLE_MS;
  if (pointerIdle && typingIdle) {
    return "idle";
  }
  return "started";
}
