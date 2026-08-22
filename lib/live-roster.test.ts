import { describe, expect, it } from "vitest";

import {
  compareLiveRosterParticipants,
  countLiveRosterBuckets,
  deriveLiveRosterRow,
  matchesLiveRosterFilter,
  questionIndexForFocus,
} from "@/lib/live-roster";
import type { LiveSessionOverviewParticipant } from "@/lib/live-session-overview";
import { DEFAULT_ROSTER_ACTIVITY_THRESHOLDS } from "@/lib/roster-activity";
import { TEST_DEVICE_ID } from "@/lib/test/fixtures";

function participant(
  overrides: Partial<LiveSessionOverviewParticipant> = {},
): LiveSessionOverviewParticipant {
  return {
    anonymousSessionId: TEST_DEVICE_ID,
    displayName: "Ada",
    status: "started",
    suspendedAt: null,
    finishedAt: null,
    gradedAt: null,
    pointsEarned: null,
    pointsPossible: null,
    answeredCount: 0,
    textPreview: "",
    textWordCount: 0,
    lastActivityAt: "2026-06-05T12:00:00.000Z",
    lastTypingAt: null,
    lastSeenAt: "2026-06-05T12:00:00.000Z",
    syncState: "synced",
    pendingSyncCount: 0,
    handRaiseQuestionId: null,
    handRaisedAt: null,
    focusQuestionId: null,
    updatedAt: "2026-06-05T12:00:00.000Z",
    ...overrides,
  };
}

const preview = [
  { id: "q1", type: "text" as const },
  { id: "q2", type: "text" as const },
];

const baseOpts = {
  previewQuestions: preview,
  questionTotal: 2,
  activityThresholds: DEFAULT_ROSTER_ACTIVITY_THRESHOLDS,
  sessionOpen: true,
  nowMs: Date.parse("2026-06-05T12:00:00.000Z"),
};

describe("live-roster", () => {
  it("maps focus question id to 1-based index", () => {
    expect(questionIndexForFocus("q2", preview)).toBe(2);
    expect(questionIndexForFocus(null, preview)).toBeNull();
  });

  it("marks waiting and stalled as attention", () => {
    const waiting = deriveLiveRosterRow(
      participant({ suspendedAt: "2026-06-05T11:50:00.000Z", status: "blocked" }),
      baseOpts,
    );
    expect(waiting.kind).toBe("waiting");
    expect(waiting.attention).toBe(true);

    const stalled = deriveLiveRosterRow(
      participant({
        lastActivityAt: "2026-06-05T11:50:00.000Z",
        lastSeenAt: "2026-06-05T12:00:00.000Z",
        focusQuestionId: "q1",
      }),
      baseOpts,
    );
    expect(stalled.kind).toBe("stalled");
    expect(stalled.attention).toBe(true);
  });

  it("sorts waiting before working before done", () => {
    const waiting = deriveLiveRosterRow(
      participant({ suspendedAt: "2026-06-05T11:50:00.000Z", status: "blocked", displayName: "Zed" }),
      baseOpts,
    );
    const working = deriveLiveRosterRow(participant({ displayName: "Ann" }), baseOpts);
    const done = deriveLiveRosterRow(
      participant({ finishedAt: "2026-06-05T12:00:00.000Z", displayName: "Bee" }),
      baseOpts,
    );
    const ordered = [
      { displayName: "Bee", model: done },
      { displayName: "Ann", model: working },
      { displayName: "Zed", model: waiting },
    ].sort(compareLiveRosterParticipants);
    expect(ordered.map((r) => r.displayName)).toEqual(["Zed", "Ann", "Bee"]);
  });

  it("filters and buckets attention / working / done", () => {
    const rows = [
      deriveLiveRosterRow(
        participant({ suspendedAt: "2026-06-05T11:50:00.000Z", status: "blocked" }),
        baseOpts,
      ),
      deriveLiveRosterRow(participant({ displayName: "Work" }), baseOpts),
      deriveLiveRosterRow(
        participant({ finishedAt: "2026-06-05T12:00:00.000Z", displayName: "Done" }),
        baseOpts,
      ),
    ];
    const buckets = countLiveRosterBuckets(rows);
    expect(buckets).toEqual({ all: 3, attention: 1, working: 1, done: 1 });
    expect(matchesLiveRosterFilter(rows[0]!, "attention")).toBe(true);
    expect(matchesLiveRosterFilter(rows[1]!, "working")).toBe(true);
    expect(matchesLiveRosterFilter(rows[2]!, "done")).toBe(true);
  });
});
