import { describe, expect, it } from "vitest";

import { heartbeatSyncMeta } from "@/lib/offline/heartbeat-meta";

describe("heartbeatSyncMeta", () => {
  it("reports offline when navigator is offline", () => {
    const original = navigator.onLine;
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    expect(heartbeatSyncMeta({ state: "synced", pendingCount: 0 })).toEqual({
      pendingSyncCount: 0,
      syncState: "offline",
    });
    Object.defineProperty(navigator, "onLine", { value: original, configurable: true });
  });

  it("reports pending when queue has items", () => {
    expect(heartbeatSyncMeta({ state: "syncing", pendingCount: 2 })).toEqual({
      pendingSyncCount: 2,
      syncState: "pending",
    });
  });

  it("reports synced when online with no pending items", () => {
    expect(heartbeatSyncMeta({ state: "synced", pendingCount: 0 })).toEqual({
      pendingSyncCount: 0,
      syncState: "synced",
    });
  });
});
