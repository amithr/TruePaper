import type { LiveParticipantUiStatus } from "@/lib/participant-status";

export type GradingRosterFilter = "all" | "needs-grading" | "graded";

export type GradingRosterRow = {
  status: LiveParticipantUiStatus;
  finishedAt: string | null;
  gradedAt: string | null;
};

/**
 * Sort order on the teacher-facing roster pages: surface students who need
 * grading attention first (submitted but not yet graded), then everyone else.
 *
 * Specifically:
 *   1. Submitted-but-not-graded (`finished && !graded`)
 *   2. Paused (suspended)
 *   3. Active (typing / idle / started)
 *   4. Graded
 *   5. Never joined
 */
export function gradingRosterPriority(row: GradingRosterRow): number {
  const isFinished = Boolean(row.finishedAt);
  const isGraded = Boolean(row.gradedAt);
  if (isFinished && !isGraded) {
    return 0;
  }
  if (row.status === "blocked") {
    return 1;
  }
  if (
    row.status === "typing" ||
    row.status === "idle" ||
    row.status === "started"
  ) {
    return 2;
  }
  if (isGraded) {
    return 3;
  }
  return 4;
}

/** Number of submissions awaiting grading (finished but not yet graded). */
export function countNeedsGrading<T extends GradingRosterRow>(rows: T[]): number {
  return rows.reduce((n, r) => n + (r.finishedAt && !r.gradedAt ? 1 : 0), 0);
}

export function compareRosterParticipants<T extends GradingRosterRow & {
  handRaisedAt?: string | null;
}>(a: T, b: T): number {
  const aHand = a.handRaisedAt ? 0 : 1;
  const bHand = b.handRaisedAt ? 0 : 1;
  if (aHand !== bHand) {
    return aHand - bHand;
  }
  return gradingRosterPriority(a) - gradingRosterPriority(b);
}

export function matchesFilter<T extends GradingRosterRow>(row: T, filter: GradingRosterFilter): boolean {
  switch (filter) {
    case "needs-grading":
      return Boolean(row.finishedAt) && !row.gradedAt;
    case "graded":
      return Boolean(row.gradedAt);
    default:
      return true;
  }
}
