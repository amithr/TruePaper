import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_HELP_PREFS,
  HELP_PREFS_CHANGE_EVENT,
  HELP_PREFS_STORAGE_KEY,
  parseHelpPrefs,
  readHelpPrefs,
  setHintsEnabled,
  writeHelpPrefs,
} from "@/lib/help-prefs";

describe("parseHelpPrefs", () => {
  it("returns null for empty input", () => {
    expect(parseHelpPrefs(null)).toBeNull();
    expect(parseHelpPrefs("")).toBeNull();
  });

  it("returns null for the wrong version", () => {
    expect(parseHelpPrefs(JSON.stringify({ version: 2, hintsEnabled: false }))).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseHelpPrefs("{not json")).toBeNull();
  });

  it("defaults hintsEnabled to true when missing", () => {
    expect(parseHelpPrefs(JSON.stringify({ version: 1 }))?.hintsEnabled).toBe(true);
  });

  it("round-trips a stored boolean", () => {
    expect(parseHelpPrefs(JSON.stringify({ version: 1, hintsEnabled: false }))?.hintsEnabled).toBe(
      false,
    );
  });
});

describe("readHelpPrefs / writeHelpPrefs", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns defaults when nothing is stored", () => {
    expect(readHelpPrefs()).toEqual(DEFAULT_HELP_PREFS);
  });

  it("persists and reads back hintsEnabled", () => {
    writeHelpPrefs({ hintsEnabled: false });
    expect(readHelpPrefs().hintsEnabled).toBe(false);
    expect(window.localStorage.getItem(HELP_PREFS_STORAGE_KEY)).toContain('"hintsEnabled":false');
  });

  it("dispatches a change event on write", () => {
    const listener = vi.fn();
    window.addEventListener(HELP_PREFS_CHANGE_EVENT, listener);
    setHintsEnabled(false);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(HELP_PREFS_CHANGE_EVENT, listener);
  });
});
