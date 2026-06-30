import { describe, expect, it } from "vitest";

import {
  deriveSyncStatus,
  relativeAge,
  SYNC_STRUGGLING_MS,
  type SyncBreakdown,
} from "@/lib/sync-status";

const empty: SyncBreakdown = { responses: 0, submission: 0, comments: 0 };

describe("deriveSyncStatus", () => {
  it("reports synced only when nothing is queued", () => {
    const status = deriveSyncStatus({
      breakdown: empty,
      oldestQueuedAt: null,
      hasFailed: false,
      struggling: false,
    });
    expect(status.state).toBe("synced");
    expect(status.count).toBe(0);
    expect(status.oldestQueuedAt).toBeNull();
  });

  it("reports queued (not synced) whenever any item is pending", () => {
    const status = deriveSyncStatus({
      breakdown: { responses: 1, submission: 1, comments: 2 },
      oldestQueuedAt: Date.now(),
      hasFailed: false,
      struggling: false,
    });
    expect(status.state).toBe("queued");
    expect(status.count).toBe(4);
  });

  it("escalates to attention immediately on a terminal failure", () => {
    const status = deriveSyncStatus({
      breakdown: { ...empty, comments: 1 },
      oldestQueuedAt: Date.now(),
      hasFailed: true,
      struggling: false,
    });
    expect(status.state).toBe("attention");
    expect(status.hasFailed).toBe(true);
  });

  it("stays calm (queued) during a brief struggle below the threshold", () => {
    const now = Date.now();
    const status = deriveSyncStatus({
      breakdown: { ...empty, responses: 1 },
      oldestQueuedAt: now - 5_000,
      hasFailed: false,
      struggling: true,
      now,
    });
    expect(status.state).toBe("queued");
  });

  it("escalates to attention after a sustained struggle", () => {
    const now = Date.now();
    const status = deriveSyncStatus({
      breakdown: { ...empty, responses: 1 },
      oldestQueuedAt: now - (SYNC_STRUGGLING_MS + 1_000),
      hasFailed: false,
      struggling: true,
      now,
    });
    expect(status.state).toBe("attention");
  });

  it("does not escalate on age alone when sync is not struggling", () => {
    const now = Date.now();
    const status = deriveSyncStatus({
      breakdown: { ...empty, responses: 1 },
      oldestQueuedAt: now - (SYNC_STRUGGLING_MS + 10_000),
      hasFailed: false,
      struggling: false,
      now,
    });
    expect(status.state).toBe("queued");
  });
});

describe("relativeAge", () => {
  const base = 1_000_000_000_000;

  it("buckets fresh items as 'now'", () => {
    expect(relativeAge(base, base + 5_000)).toEqual({ unit: "now", value: 0 });
  });

  it("buckets sub-minute as seconds", () => {
    expect(relativeAge(base, base + 40_000)).toEqual({ unit: "seconds", value: 40 });
  });

  it("buckets minutes and hours", () => {
    expect(relativeAge(base, base + 5 * 60_000)).toEqual({ unit: "minutes", value: 5 });
    expect(relativeAge(base, base + 3 * 3_600_000)).toEqual({ unit: "hours", value: 3 });
  });

  it("returns 'now' when there is no queued item", () => {
    expect(relativeAge(null)).toEqual({ unit: "now", value: 0 });
  });
});
