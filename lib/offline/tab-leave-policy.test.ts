import { describe, expect, it } from "vitest";

import { tabLeaveBlurGraceMs, tabLeaveGraceMs, tabLeaveSuspensionEnabled } from "@/lib/offline/tab-leave-policy";

describe("tabLeaveSuspensionEnabled", () => {
  it("only suspends in live delivery", () => {
    expect(tabLeaveSuspensionEnabled("live")).toBe(true);
    expect(tabLeaveSuspensionEnabled("self_paced")).toBe(false);
    expect(tabLeaveSuspensionEnabled("hybrid")).toBe(false);
  });
});

describe("tabLeaveGraceMs", () => {
  it("uses longer grace for flexible delivery modes", () => {
    expect(tabLeaveGraceMs("live")).toBeLessThan(tabLeaveGraceMs("self_paced"));
    expect(tabLeaveGraceMs("hybrid")).toBe(tabLeaveGraceMs("self_paced"));
  });
});

describe("tabLeaveBlurGraceMs", () => {
  it("adds extra buffer beyond hidden grace", () => {
    expect(tabLeaveBlurGraceMs("live")).toBeGreaterThan(tabLeaveGraceMs("live"));
  });
});
