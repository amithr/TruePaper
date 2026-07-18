import { describe, expect, it } from "vitest";

import { buildSummaryTokens, countAutogradableQuestions } from "@/lib/builder/summary-tokens";
import type { Question } from "@/lib/forms";

function q(partial: Partial<Question> & Pick<Question, "type">): Question {
  return {
    id: partial.id ?? "q1",
    prompt: partial.prompt ?? "Prompt",
    promptImagePath: partial.promptImagePath ?? null,
    type: partial.type,
    options: partial.options ?? [],
    correctAnswer: partial.correctAnswer ?? null,
    points: partial.points ?? 1,
    displayOrder: partial.displayOrder ?? 0,
    responseConfig: partial.responseConfig ?? {},
  };
}

describe("buildSummaryTokens", () => {
  it("summarizes extended written word targets and points", () => {
    const tokens = buildSummaryTokens(
      q({
        type: "extendedWritten",
        points: 4,
        responseConfig: { minWords: 50, targetWords: 200 },
      }),
    );
    expect(tokens).toEqual([
      { key: "response", labelKey: "wordRange", values: { min: 50, target: 200 } },
      { key: "scoring", labelKey: "pointsOther", values: { n: 4 } },
    ]);
  });

  it("marks auto-graded scoring when a key is present", () => {
    const tokens = buildSummaryTokens(
      q({
        type: "multipleChoice",
        points: 1,
        options: ["A", "B", "C", "D"],
        correctAnswer: "A",
      }),
    );
    expect(tokens).toEqual([
      { key: "response", labelKey: "choicesOther", values: { n: 4 } },
      { key: "scoring", labelKey: "pointsOneAuto", values: { n: 1 } },
    ]);
  });

  it("includes an image token when a prompt image is set", () => {
    const tokens = buildSummaryTokens(
      q({
        type: "shortAnswer",
        promptImagePath: "forms/x/q.png",
        responseConfig: { acceptedAnswers: ["oxygen", "O2"] },
      }),
    );
    expect(tokens[0]).toMatchObject({ key: "image", labelKey: "image" });
  });
});

describe("countAutogradableQuestions", () => {
  it("counts questions with autograde keys", () => {
    expect(
      countAutogradableQuestions([
        q({ type: "multipleChoice", options: ["A"], correctAnswer: "A" }),
        q({ type: "extendedWritten" }),
        q({ type: "shortAnswer", responseConfig: { acceptedAnswers: ["x"] } }),
      ]),
    ).toBe(2);
  });
});
