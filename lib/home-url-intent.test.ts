import { describe, expect, it } from "vitest";

import { readFormIdFromUrl, hasTeacherHomeIntentFromSearchParams, readTeacherHomeIntent } from "@/lib/home-url-intent";

describe("home-url-intent", () => {
  it("detects builder intent from form query", () => {
    expect(readTeacherHomeIntent({ search: "?form=abc-123", hash: "" })).toBe("builder");
  });

  it("detects join intent from code query", () => {
    expect(readTeacherHomeIntent({ search: "?code=ABCDEF", hash: "" })).toBe("join");
  });

  it("detects join intent from resume query", () => {
    expect(readTeacherHomeIntent({ search: "?resume=ABCDEFGH", hash: "" })).toBe("join");
  });

  it("detects join intent from fresh device query", () => {
    expect(readTeacherHomeIntent({ search: "?new=1", hash: "" })).toBe("join");
  });

  it("detects join intent from hash", () => {
    expect(readTeacherHomeIntent({ search: "", hash: "#join-session" })).toBe("join");
  });

  it("returns none for plain home", () => {
    expect(readTeacherHomeIntent({ search: "", hash: "" })).toBe("none");
  });

  it("detects builder/join intent from search params for proxy routing", () => {
    expect(hasTeacherHomeIntentFromSearchParams(new URLSearchParams("form=abc"))).toBe(true);
    expect(hasTeacherHomeIntentFromSearchParams(new URLSearchParams("code=ABCDEF"))).toBe(true);
    expect(hasTeacherHomeIntentFromSearchParams(new URLSearchParams(""))).toBe(false);
  });

  it("reads form id from query", () => {
    expect(readFormIdFromUrl({ search: "?form=my-form-id" })).toBe("my-form-id");
    expect(readFormIdFromUrl({ search: "?other=1" })).toBe("");
  });
});
