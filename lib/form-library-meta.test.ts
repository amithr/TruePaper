import { describe, expect, it } from "vitest";

import { avatarTintForForm, formInitial, lastRunAge } from "@/lib/form-library-meta";

describe("formInitial", () => {
  it("returns uppercase first letter", () => {
    expect(formInitial("biology")).toBe("B");
  });

  it("falls back when empty", () => {
    expect(formInitial("   ")).toBe("F");
  });
});

describe("avatarTintForForm", () => {
  it("is stable for the same id", () => {
    expect(avatarTintForForm("form-a")).toEqual(avatarTintForForm("form-a"));
  });
});

describe("lastRunAge", () => {
  const now = Date.parse("2026-07-18T12:00:00.000Z");

  it("returns never when missing", () => {
    expect(lastRunAge(null, now)).toEqual({ kind: "never" });
  });

  it("returns today for same calendar day window", () => {
    expect(lastRunAge("2026-07-18T08:00:00.000Z", now)).toEqual({ kind: "today" });
  });

  it("returns days / weeks / months buckets", () => {
    expect(lastRunAge("2026-07-16T12:00:00.000Z", now)).toEqual({ kind: "days", n: 2 });
    expect(lastRunAge("2026-06-27T12:00:00.000Z", now)).toEqual({ kind: "weeks", n: 3 });
    expect(lastRunAge("2026-04-18T12:00:00.000Z", now)).toEqual({ kind: "months", n: 3 });
  });
});
