import { describe, expect, it } from "vitest";

import { readFormIdFromUrl, readTeacherHomeIntent } from "@/lib/home-url-intent";

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

  it("detects join intent from hash", () => {
    expect(readTeacherHomeIntent({ search: "", hash: "#join-session" })).toBe("join");
  });

  it("returns none for plain home", () => {
    expect(readTeacherHomeIntent({ search: "", hash: "" })).toBe("none");
  });

  it("reads form id from query", () => {
    expect(readFormIdFromUrl({ search: "?form=my-form-id" })).toBe("my-form-id");
    expect(readFormIdFromUrl({ search: "?other=1" })).toBe("");
  });
});
