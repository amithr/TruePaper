import { describe, expect, it } from "vitest";

import { rejoinStatusFromState } from "@/lib/use-rejoin-request-poll";

describe("rejoinStatusFromState", () => {
  it("is pending while the request is open and this device has no row", () => {
    expect(rejoinStatusFromState({ hasResponse: false, rejoinRequest: "pending" })).toBe("pending");
  });

  it("is approved once the attempt has moved to this device", () => {
    expect(rejoinStatusFromState({ hasResponse: true, rejoinRequest: "none" })).toBe("approved");
  });

  it("reports declined and expired", () => {
    expect(rejoinStatusFromState({ hasResponse: false, rejoinRequest: "declined" })).toBe("declined");
    expect(rejoinStatusFromState({ hasResponse: false, rejoinRequest: "expired" })).toBe("expired");
    // A pre-migration server never reports a request: treat as expired so the student isn't stuck.
    expect(rejoinStatusFromState({})).toBe("expired");
  });
});
