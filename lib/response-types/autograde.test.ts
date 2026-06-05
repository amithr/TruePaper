import { describe, expect, it } from "vitest";

import { autogradeEarnedPoints, hasAutogradeKey } from "@/lib/response-types/autograde";
import { serializeResponseValue } from "@/lib/response-types/answers";
import type { Question } from "@/lib/forms";

describe("hasAutogradeKey", () => {
  it("detects true/false correct answer", () => {
    expect(
      hasAutogradeKey({
        type: "trueFalse",
        correctAnswer: null,
        responseConfig: { correctAnswer: true },
      }),
    ).toBe(true);
  });
});

describe("autogradeEarnedPoints", () => {
  const tfQuestion = {
    id: "q1",
    type: "trueFalse",
    prompt: "T/F",
    options: [],
    correctAnswer: null,
    points: 2,
    displayOrder: 0,
    responseConfig: { correctAnswer: true },
  } satisfies Question;

  it("grades true/false", () => {
    const answer = serializeResponseValue({ type: "trueFalse", answer: true });
    expect(autogradeEarnedPoints(tfQuestion, answer)).toBe(2);
    const wrong = serializeResponseValue({ type: "trueFalse", answer: false });
    expect(autogradeEarnedPoints(tfQuestion, wrong)).toBe(0);
  });
});
