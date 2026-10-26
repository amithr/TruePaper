import { describe, expect, it } from "vitest";

import { answerKeyView } from "@/lib/review/answer-key";
import { parseResponseValue } from "@/lib/response-types/answers";
import { makeQuestion } from "@/lib/test/question-fixtures";

const wire = (q: Parameters<typeof answerKeyView>[0]) => {
  const key = answerKeyView(q);
  if (key?.kind !== "wire") {
    throw new Error(`expected a wire key, got ${JSON.stringify(key)}`);
  }
  return key.answer;
};

describe("answerKeyView", () => {
  it("renders choice-style keys as a wire answer the student card can display", () => {
    const mc = makeQuestion("multipleChoice", { options: ["A", "B", "C"], correctAnswer: "B" });
    expect(parseResponseValue("multipleChoice", wire(mc))).toMatchObject({ choice: "B" });

    const tf = makeQuestion("trueFalse", { responseConfig: { correctAnswer: false } });
    expect(parseResponseValue("trueFalse", wire(tf))).toMatchObject({ answer: false });

    const ordering = makeQuestion("ordering", {
      responseConfig: { items: [{ id: "x", text: "X" }, { id: "y", text: "Y" }], correctOrder: ["y", "x"] },
    });
    expect(parseResponseValue("ordering", wire(ordering))).toMatchObject({ order: ["y", "x"] });

    const matching = makeQuestion("matching", {
      responseConfig: { left: [{ id: "l1", text: "L" }], right: [{ id: "r1", text: "R" }], correct: { l1: "r1" } },
    });
    expect(parseResponseValue("matching", wire(matching))).toMatchObject({ pairs: { l1: "r1" } });
  });

  it("lists accepted text answers, with the capitalisation rule", () => {
    const q = makeQuestion("shortAnswer", { responseConfig: { acceptedAnswers: [" oxygen ", "O2", ""], caseSensitive: true } });
    expect(answerKeyView(q)).toEqual({ kind: "list", answers: ["oxygen", "O2"], caseSensitive: true });
  });

  it("has nothing to reveal for free-form types or missing keys", () => {
    expect(answerKeyView(makeQuestion("extendedWritten"))).toBeNull();
    expect(answerKeyView(makeQuestion("graph"))).toBeNull();
    expect(answerKeyView(makeQuestion("multipleChoice", { options: ["A", "B"], correctAnswer: "" }))).toBeNull();
    expect(answerKeyView(makeQuestion("shortAnswer", { responseConfig: { acceptedAnswers: [] } }))).toBeNull();
  });
});
