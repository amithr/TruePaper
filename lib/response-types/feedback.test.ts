import { describe, expect, it } from "vitest";

import {
  getCanvasAnnotation,
  getInlineComments,
  getRubricScores,
} from "@/lib/response-types/feedback";

describe("feedback empty collections", () => {
  it("returns stable empty arrays for missing canvas annotations", () => {
    const store = {};
    expect(getCanvasAnnotation(store, "q1")).toBe(getCanvasAnnotation(store, "q2"));
    expect(getRubricScores(store, "q1")).toBe(getRubricScores(store, "q2"));
    expect(getInlineComments(store, "q1")).toBe(getInlineComments(store, "q2"));
  });
});
