import { beforeEach, describe, expect, it } from "vitest";

import {
  createFreshAnonymousSessionId,
  getOrCreateAnonymousSessionId,
  peekStoredAnonymousSessionId,
} from "@/lib/anonymous-session";

describe("peekStoredAnonymousSessionId", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null without creating an id", () => {
    expect(peekStoredAnonymousSessionId()).toBeNull();
    expect(window.localStorage.getItem("truepaper_anonymous_session_id")).toBeNull();
  });

  it("returns the stored id and ignores garbage", () => {
    const id = getOrCreateAnonymousSessionId();
    expect(peekStoredAnonymousSessionId()).toBe(id);
    window.localStorage.setItem("truepaper_anonymous_session_id", "nope");
    expect(peekStoredAnonymousSessionId()).toBeNull();
  });

  it("sees a freshly created id", () => {
    const id = createFreshAnonymousSessionId();
    expect(peekStoredAnonymousSessionId()).toBe(id);
  });
});
