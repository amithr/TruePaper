import { describe, expect, it } from "vitest";

import {
  getResponseTypeMeta,
  listAuthorableResponseTypes,
  parseResponseConfig,
  questionSupportsLiveFeedback,
} from "@/lib/response-types/registry";

describe("response-types registry", () => {
  it("lists authorable types with defaults", () => {
    const types = listAuthorableResponseTypes();
    expect(types.length).toBeGreaterThan(5);
    expect(types.some((t) => t.id === "extendedWritten")).toBe(true);
  });

  it("returns meta for known types", () => {
    const meta = getResponseTypeMeta("trueFalse");
    expect(meta.id).toBe("trueFalse");
    expect(meta.defaultConfig()).toBeDefined();
  });

  it("parses trueFalse config", () => {
    const config = parseResponseConfig("trueFalse", { correctAnswer: false });
    expect(config).toEqual({ correctAnswer: false });
  });

  it("falls back to defaults for invalid config", () => {
    const config = parseResponseConfig("matching", null);
    expect(config).toHaveProperty("left");
    expect(config).toHaveProperty("right");
  });

  it("defaults math input to acceptedAnswers list and placeholder", () => {
    const config = parseResponseConfig("mathInput", null);
    expect(config).toMatchObject({
      acceptedAnswers: [],
      caseSensitive: false,
    });
    expect(config).toHaveProperty("placeholder");
    const merged = parseResponseConfig("mathInput", {
      acceptedAnswers: ["2", "2.0"],
      placeholder: "final",
    });
    expect(merged).toMatchObject({
      acceptedAnswers: ["2", "2.0"],
      placeholder: "final",
      caseSensitive: false,
    });
  });

  it("reports live feedback support per type", () => {
    expect(questionSupportsLiveFeedback("extendedWritten")).toBe(true);
    expect(questionSupportsLiveFeedback("trueFalse")).toBe(true);
    expect(questionSupportsLiveFeedback("multipleChoice")).toBe(true);
  });
});
