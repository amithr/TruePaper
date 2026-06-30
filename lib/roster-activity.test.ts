import { describe, expect, it } from "vitest";

import {
  DEFAULT_ROSTER_ACTIVITY_THRESHOLDS,
  deriveRosterActivity,
  inactiveMinutes,
  normalizeRosterActivityThresholds,
  type RosterActivityInput,
} from "@/lib/roster-activity";

const NOW = new Date("2026-06-30T12:00:00.000Z").getTime();
const thresholds = { softMin: 4, strongMin: 9 };

function student(overrides: Partial<RosterActivityInput> = {}): RosterActivityInput {
  return {
    suspendedAt: null,
    finishedAt: null,
    gradedAt: null,
    syncState: "synced",
    lastActivityAt: new Date(NOW).toISOString(),
    lastTypingAt: null,
    // Fresh keepalive by default so presence-staleness doesn't suppress the heatmap.
    lastSeenAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

function minutesAgo(min: number): string {
  return new Date(NOW - min * 60_000).toISOString();
}

describe("deriveRosterActivity", () => {
  it("is active when interaction is recent", () => {
    const a = deriveRosterActivity(student({ lastActivityAt: minutesAgo(1) }), thresholds, true, NOW);
    expect(a.level).toBe("active");
  });

  it("flags soft after the soft threshold", () => {
    const a = deriveRosterActivity(student({ lastActivityAt: minutesAgo(5) }), thresholds, true, NOW);
    expect(a.level).toBe("soft");
    expect(inactiveMinutes(a.inactiveMs)).toBe(5);
  });

  it("flags strong after the strong threshold", () => {
    const a = deriveRosterActivity(student({ lastActivityAt: minutesAgo(12) }), thresholds, true, NOW);
    expect(a.level).toBe("strong");
  });

  it("uses the most recent of activity vs typing", () => {
    const a = deriveRosterActivity(
      student({ lastActivityAt: minutesAgo(20), lastTypingAt: minutesAgo(1) }),
      thresholds,
      true,
      NOW,
    );
    expect(a.level).toBe("active");
  });

  it("suppresses the heatmap for offline students (distinct from inactive)", () => {
    const a = deriveRosterActivity(
      student({ lastActivityAt: minutesAgo(30), syncState: "offline" }),
      thresholds,
      true,
      NOW,
    );
    expect(a.level).toBe("none");
  });

  it("does not flag finished, graded, suspended, or closed sessions", () => {
    expect(deriveRosterActivity(student({ lastActivityAt: minutesAgo(30), finishedAt: minutesAgo(1) }), thresholds, true, NOW).level).toBe("none");
    expect(deriveRosterActivity(student({ lastActivityAt: minutesAgo(30), gradedAt: minutesAgo(1) }), thresholds, true, NOW).level).toBe("none");
    expect(deriveRosterActivity(student({ lastActivityAt: minutesAgo(30), suspendedAt: minutesAgo(1) }), thresholds, true, NOW).level).toBe("none");
    expect(deriveRosterActivity(student({ lastActivityAt: minutesAgo(30) }), thresholds, false, NOW).level).toBe("none");
  });

  it("suppresses the heatmap on a silent disconnect (stale last_seen keepalive)", () => {
    const a = deriveRosterActivity(
      student({ lastActivityAt: minutesAgo(20), lastSeenAt: minutesAgo(2) }),
      thresholds,
      true,
      NOW,
    );
    expect(a.level).toBe("none");
  });

  it("still flags a present-but-idle student (fresh keepalive, stale activity)", () => {
    const a = deriveRosterActivity(
      student({ lastActivityAt: minutesAgo(12), lastSeenAt: new Date(NOW - 10_000).toISOString() }),
      thresholds,
      true,
      NOW,
    );
    expect(a.level).toBe("strong");
  });

  it("does not flag a student with no activity timestamp yet", () => {
    const a = deriveRosterActivity(
      student({ lastActivityAt: null, lastTypingAt: null }),
      thresholds,
      true,
      NOW,
    );
    expect(a.level).toBe("active");
  });
});

describe("normalizeRosterActivityThresholds", () => {
  it("falls back to defaults for invalid input", () => {
    expect(normalizeRosterActivityThresholds({})).toEqual(DEFAULT_ROSTER_ACTIVITY_THRESHOLDS);
    expect(normalizeRosterActivityThresholds(null)).toEqual(DEFAULT_ROSTER_ACTIVITY_THRESHOLDS);
  });

  it("clamps to bounds and keeps strong > soft", () => {
    expect(normalizeRosterActivityThresholds({ softMin: 0, strongMin: 0 })).toEqual({ softMin: 1, strongMin: 2 });
    expect(normalizeRosterActivityThresholds({ softMin: 100, strongMin: 100 })).toEqual({ softMin: 59, strongMin: 60 });
    expect(normalizeRosterActivityThresholds({ softMin: 8, strongMin: 5 })).toEqual({ softMin: 8, strongMin: 9 });
  });

  it("rounds fractional minutes", () => {
    expect(normalizeRosterActivityThresholds({ softMin: 3.6, strongMin: 8.2 })).toEqual({ softMin: 4, strongMin: 8 });
  });
});
