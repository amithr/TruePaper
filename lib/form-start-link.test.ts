import { describe, expect, it } from "vitest";

import {
  buildFormStartPath,
  buildFormStartUrl,
  parseFormStartSearchParams,
} from "@/lib/form-start-link";

describe("buildFormStartPath", () => {
  it("builds a path with default minutes", () => {
    expect(buildFormStartPath("abc-123")).toBe("/dashboard/forms/abc-123/start?minutes=45");
  });

  it("encodes no-limit and delivery mode", () => {
    expect(
      buildFormStartPath("f1", { noTimeLimit: true, deliveryMode: "hybrid" }),
    ).toBe("/dashboard/forms/f1/start?noLimit=1&delivery=hybrid");
  });

  it("encodes late sync off", () => {
    expect(buildFormStartPath("f1", { acceptLateSync: false })).toBe(
      "/dashboard/forms/f1/start?minutes=45&lateSync=0",
    );
  });
});

describe("buildFormStartUrl", () => {
  it("localizes the path", () => {
    expect(buildFormStartUrl("https://app.test", "uk", "f1", { durationMinutes: 60 })).toBe(
      "https://app.test/uk/dashboard/forms/f1/start?minutes=60",
    );
  });
});

describe("parseFormStartSearchParams", () => {
  it("round-trips no-limit + delivery", () => {
    const path = buildFormStartPath("f1", { noTimeLimit: true, deliveryMode: "self_paced" });
    const qs = path.split("?")[1] ?? "";
    expect(parseFormStartSearchParams(new URLSearchParams(qs))).toEqual({
      noTimeLimit: true,
      durationMinutes: undefined,
      deliveryMode: "self_paced",
      acceptLateSync: true,
    });
  });

  it("defaults delivery to live", () => {
    expect(parseFormStartSearchParams(new URLSearchParams("minutes=30"))).toEqual({
      noTimeLimit: false,
      durationMinutes: 30,
      deliveryMode: "live",
      acceptLateSync: true,
    });
  });

  it("parses late sync off", () => {
    expect(parseFormStartSearchParams(new URLSearchParams("lateSync=0"))).toEqual({
      noTimeLimit: false,
      durationMinutes: 45,
      deliveryMode: "live",
      acceptLateSync: false,
    });
  });
});
