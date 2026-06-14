import { describe, expect, it } from "vitest";

import { studentConnectionDisplayState } from "@/lib/student-connection-display-state";

describe("studentConnectionDisplayState", () => {
  it("shows offline when browser is offline", () => {
    expect(studentConnectionDisplayState(false, { state: "synced", pendingFinish: false, serverReachable: true })).toBe(
      "offline",
    );
  });

  it("shows offline when server ping fails", () => {
    expect(studentConnectionDisplayState(true, { state: "synced", pendingFinish: false, serverReachable: false })).toBe(
      "offline",
    );
  });

  it("shows syncing when submit is queued", () => {
    expect(studentConnectionDisplayState(true, { state: "synced", pendingFinish: true, serverReachable: true })).toBe(
      "syncing",
    );
  });
});
