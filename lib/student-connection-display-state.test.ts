import { describe, expect, it } from "vitest";

import { studentConnectionDisplayState } from "@/lib/student-connection-display-state";

describe("studentConnectionDisplayState", () => {
  it("shows offline when the browser is offline", () => {
    expect(studentConnectionDisplayState(false, { state: "synced" })).toBe("offline");
  });

  it("maps local_only to offline for display", () => {
    expect(studentConnectionDisplayState(true, { state: "local_only" })).toBe("offline");
  });

  it("passes through online sync states", () => {
    expect(studentConnectionDisplayState(true, { state: "syncing" })).toBe("syncing");
    expect(studentConnectionDisplayState(true, { state: "synced" })).toBe("synced");
  });
});
