import { describe, expect, it } from "vitest";

import {
  overviewFingerprint,
  type OverviewFingerprintInput,
  type OverviewFingerprintPresence,
} from "@/lib/overview-fingerprint";

function presence(over: Partial<OverviewFingerprintPresence> = {}): OverviewFingerprintPresence {
  return {
    syncState: "synced",
    pendingSyncCount: 0,
    lastActivityAt: null,
    lastTypingAt: null,
    lastSeenAt: null,
    handRaiseQuestionId: null,
    handRaisedAt: null,
    ...over,
  };
}

function base(): OverviewFingerprintInput {
  return {
    windowOpen: true,
    questionsSig: "q1:1:short_text",
    timeBucket: 100,
    rows: [
      {
        anonymousSessionId: "DEV-A",
        displayName: "Ana",
        updatedAt: "2026-06-30T10:00:00Z",
        suspendedAt: null,
        finishedAt: null,
        gradedAt: null,
      },
      {
        anonymousSessionId: "DEV-B",
        displayName: "Bo",
        updatedAt: "2026-06-30T10:00:05Z",
        suspendedAt: null,
        finishedAt: null,
        gradedAt: null,
      },
    ],
    presenceByDevice: new Map([
      ["dev-a", presence({ lastSeenAt: "2026-06-30T10:00:01Z" })],
      ["dev-b", presence({ lastSeenAt: "2026-06-30T10:00:06Z" })],
    ]),
  };
}

describe("overviewFingerprint", () => {
  it("is stable for identical input", () => {
    expect(overviewFingerprint(base())).toBe(overviewFingerprint(base()));
  });

  it("is independent of row order", () => {
    const reordered = base();
    reordered.rows = [reordered.rows[1], reordered.rows[0]];
    expect(overviewFingerprint(reordered)).toBe(overviewFingerprint(base()));
  });

  it("changes when a response is updated (answer content proxy)", () => {
    const next = base();
    next.rows[0].updatedAt = "2026-06-30T10:05:00Z";
    expect(overviewFingerprint(next)).not.toBe(overviewFingerprint(base()));
  });

  it("changes when presence (sync / last_seen / hand) changes", () => {
    const synced = base();
    const offline = base();
    offline.presenceByDevice.set("dev-a", presence({ syncState: "offline" }));
    expect(overviewFingerprint(offline)).not.toBe(overviewFingerprint(synced));
  });

  it("changes when the time bucket advances (bounded status freshness)", () => {
    const later = base();
    later.timeBucket = 101;
    expect(overviewFingerprint(later)).not.toBe(overviewFingerprint(base()));
  });

  it("changes when the session window flips open/closed", () => {
    const closed = base();
    closed.windowOpen = false;
    expect(overviewFingerprint(closed)).not.toBe(overviewFingerprint(base()));
  });
});
