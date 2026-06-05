import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchAirAlertState } from "@/lib/offline/air-alert";

const isAirAlertEnabled = vi.fn();

vi.mock("@/lib/offline/config", () => ({
  isAirAlertEnabled: () => isAirAlertEnabled(),
}));

describe("fetchAirAlertState", () => {
  beforeEach(() => {
    isAirAlertEnabled.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns inactive when feature flag is off", async () => {
    isAirAlertEnabled.mockReturnValue(false);
    const state = await fetchAirAlertState("31");
    expect(state.active).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("marks active when alerts exist for region", async () => {
    isAirAlertEnabled.mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ alerts: [{ regionId: 31, regionName: "Kyiv" }] }),
    } as Response);

    const state = await fetchAirAlertState("31");
    expect(state.active).toBe(true);
    expect(state.region).toBe("31");
  });

  it("uses cache within 60s window", async () => {
    vi.resetModules();
    isAirAlertEnabled.mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ alerts: [{ regionId: 99 }] }),
    } as Response);

    const { fetchAirAlertState: fetchFresh } = await import("@/lib/offline/air-alert");
    await fetchFresh();
    await fetchFresh();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
