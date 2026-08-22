import type { LiveSessionOverviewParticipant } from "@/lib/live-session-overview";
import type { RosterPreviewQuestion } from "@/lib/live-typing-preview";
import { LIVE_PRESENCE_STALE_MS } from "@/lib/participant-status";
import {
  deriveRosterActivity,
  inactiveMinutes,
  type RosterActivityThresholds,
} from "@/lib/roster-activity";

function isRosterOffline(
  p: Pick<LiveSessionOverviewParticipant, "syncState" | "lastSeenAt">,
  nowMs: number,
): boolean {
  if (p.syncState === "offline") {
    return true;
  }
  if (nowMs > 0 && p.lastSeenAt) {
    return nowMs - new Date(p.lastSeenAt).getTime() > LIVE_PRESENCE_STALE_MS;
  }
  return false;
}

export type LiveRosterFilter = "all" | "attention" | "working" | "done";

/** Visual / sort kind for a live-session roster row. */
export type LiveRosterKind = "waiting" | "help" | "stalled" | "working" | "done";

export type LiveRosterRowModel = {
  kind: LiveRosterKind;
  /** True when connection is offline (subtitle may prefer offline copy while still working). */
  offline: boolean;
  /** 1-based question index the student is focused on, if known. */
  questionIndex: number | null;
  idleMinutes: number;
  answered: number;
  total: number;
  /** Needs-attention bucket (waiting / help / stalled). */
  attention: boolean;
  done: boolean;
};

export function questionIndexForFocus(
  focusQuestionId: string | null | undefined,
  previewQuestions: readonly RosterPreviewQuestion[],
): number | null {
  if (!focusQuestionId) {
    return null;
  }
  const idx = previewQuestions.findIndex((q) => q.id === focusQuestionId);
  return idx >= 0 ? idx + 1 : null;
}

export function deriveLiveRosterRow(
  p: LiveSessionOverviewParticipant,
  opts: {
    previewQuestions: readonly RosterPreviewQuestion[];
    questionTotal: number;
    activityThresholds: RosterActivityThresholds;
    sessionOpen: boolean;
    nowMs: number;
  },
): LiveRosterRowModel {
  const done = Boolean(p.finishedAt || p.gradedAt);
  const waiting = Boolean(p.suspendedAt) || p.status === "blocked";
  const handRaised = Boolean(p.handRaisedAt && p.handRaiseQuestionId);
  const activity = deriveRosterActivity(p, opts.activityThresholds, opts.sessionOpen, opts.nowMs);
  const stalled = !done && !waiting && (activity.level === "soft" || activity.level === "strong");
  const idleMinutes = stalled ? inactiveMinutes(activity.inactiveMs) : 0;
  const offline = !done && !waiting && isRosterOffline(p, opts.nowMs);
  const focusId = p.focusQuestionId ?? (handRaised ? p.handRaiseQuestionId : null);
  const questionIndex = questionIndexForFocus(focusId, opts.previewQuestions);

  let kind: LiveRosterKind;
  if (done) {
    kind = "done";
  } else if (waiting) {
    kind = "waiting";
  } else if (handRaised) {
    kind = "help";
  } else if (stalled) {
    kind = "stalled";
  } else {
    kind = "working";
  }

  const attention = kind === "waiting" || kind === "help" || kind === "stalled";

  return {
    kind,
    offline,
    questionIndex,
    idleMinutes,
    answered: p.answeredCount,
    total: opts.questionTotal,
    attention,
    done,
  };
}

export function liveRosterSortPriority(kind: LiveRosterKind): number {
  switch (kind) {
    case "waiting":
      return 0;
    case "help":
      return 1;
    case "stalled":
      return 2;
    case "working":
      return 3;
    case "done":
      return 4;
    default:
      return 5;
  }
}

export function matchesLiveRosterFilter(row: LiveRosterRowModel, filter: LiveRosterFilter): boolean {
  switch (filter) {
    case "attention":
      return row.attention;
    case "working":
      return row.kind === "working";
    case "done":
      return row.done;
    default:
      return true;
  }
}

export function compareLiveRosterParticipants(
  a: { displayName: string; model: LiveRosterRowModel },
  b: { displayName: string; model: LiveRosterRowModel },
): number {
  const byKind = liveRosterSortPriority(a.model.kind) - liveRosterSortPriority(b.model.kind);
  if (byKind !== 0) {
    return byKind;
  }
  return (a.displayName || "").localeCompare(b.displayName || "");
}

export function countLiveRosterBuckets(
  rows: LiveRosterRowModel[],
): { all: number; attention: number; working: number; done: number } {
  let attention = 0;
  let working = 0;
  let done = 0;
  for (const row of rows) {
    if (row.done) {
      done += 1;
    } else if (row.attention) {
      attention += 1;
    } else if (row.kind === "working") {
      working += 1;
    }
  }
  return { all: rows.length, attention, working, done };
}
