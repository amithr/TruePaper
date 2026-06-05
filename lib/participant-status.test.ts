import { describe, expect, it } from "vitest";

import {
  computeLiveParticipantUiStatus,
  LIVE_INTERACTION_IDLE_MS,
  LIVE_TYPING_INDICATOR_MS,
} from "@/lib/participant-status";

const now = Date.UTC(2026, 5, 5, 12, 0, 0);

describe("computeLiveParticipantUiStatus", () => {
  it("returns blocked when suspended", () => {
    expect(
      computeLiveParticipantUiStatus(
        {
          suspendedAt: new Date(now).toISOString(),
          finishedAt: null,
          lastActivityAt: null,
          lastTypingAt: null,
        },
        true,
        now,
      ),
    ).toBe("blocked");
  });

  it("returns typing within indicator window", () => {
    expect(
      computeLiveParticipantUiStatus(
        {
          suspendedAt: null,
          finishedAt: null,
          lastActivityAt: new Date(now - 1000).toISOString(),
          lastTypingAt: new Date(now - 1000).toISOString(),
        },
        true,
        now,
      ),
    ).toBe("typing");
  });

  it("returns idle when interaction is stale", () => {
    const stale = new Date(now - LIVE_INTERACTION_IDLE_MS - 1).toISOString();
    expect(
      computeLiveParticipantUiStatus(
        {
          suspendedAt: null,
          finishedAt: null,
          lastActivityAt: stale,
          lastTypingAt: stale,
        },
        true,
        now,
      ),
    ).toBe("idle");
  });

  it("returns finished when submitted", () => {
    expect(
      computeLiveParticipantUiStatus(
        {
          suspendedAt: null,
          finishedAt: new Date(now).toISOString(),
          lastActivityAt: null,
          lastTypingAt: null,
        },
        true,
        now,
      ),
    ).toBe("finished");
  });

  it("returns started when recently active", () => {
    expect(
      computeLiveParticipantUiStatus(
        {
          suspendedAt: null,
          finishedAt: null,
          lastActivityAt: new Date(now - 5000).toISOString(),
          lastTypingAt: null,
        },
        true,
        now,
      ),
    ).toBe("started");
  });
});
