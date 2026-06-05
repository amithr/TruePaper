import { describe, expect, it } from "vitest";

import { formatSessionCountdown, maskDashboardDeviceId } from "@/lib/session-countdown";

describe("session-countdown", () => {
  it("formats countdown as M:SS", () => {
    expect(formatSessionCountdown(0)).toBe("0:00");
    expect(formatSessionCountdown(65_000)).toBe("1:05");
    expect(formatSessionCountdown(3_661_000)).toBe("61:01");
  });

  it("masks device ids for dashboard display", () => {
    expect(maskDashboardDeviceId("a1b2c3d4-e5f6-4789-a012-3456789abcde")).toBe("…789abcde");
  });
});
