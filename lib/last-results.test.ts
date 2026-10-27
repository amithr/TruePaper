import { beforeEach, describe, expect, it } from "vitest";

import { clearLastResults, LAST_RESULTS_STORAGE_KEY, loadLastResults, saveLastResults } from "@/lib/last-results";

const entry = {
  liveSessionId: "s1",
  deviceId: "d1",
  displayName: "Jordan",
  formTitle: "Biology quiz",
  finishedAt: 1,
  token: null,
};

describe("last results storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips, including a later token", () => {
    saveLastResults(entry);
    expect(loadLastResults()).toEqual(entry);
    saveLastResults({ ...entry, token: "ABCDEFGH2345" });
    expect(loadLastResults()?.token).toBe("ABCDEFGH2345");
    clearLastResults();
    expect(loadLastResults()).toBeNull();
  });

  it("drops malformed entries instead of trusting them", () => {
    window.localStorage.setItem(LAST_RESULTS_STORAGE_KEY, '{"token": 5}');
    expect(loadLastResults()).toBeNull();
    expect(window.localStorage.getItem(LAST_RESULTS_STORAGE_KEY)).toBeNull();
  });
});
