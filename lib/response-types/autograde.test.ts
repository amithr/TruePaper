import { describe, expect, it } from "vitest";

import { serializeResponseValue } from "@/lib/response-types/answers";
import { autogradeEarnedPoints, hasAutogradeKey } from "@/lib/response-types/autograde";
import type { Question } from "@/lib/forms";
import { makeQuestion } from "@/lib/test/question-fixtures";

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

  it("detects short answer accepted answers", () => {
    expect(
      hasAutogradeKey({
        type: "shortAnswer",
        correctAnswer: null,
        responseConfig: { acceptedAnswers: ["oxygen"] },
      }),
    ).toBe(true);
    expect(
      hasAutogradeKey({
        type: "shortAnswer",
        correctAnswer: null,
        responseConfig: { acceptedAnswers: [] },
      }),
    ).toBe(false);
  });

  it("detects math input accepted answers", () => {
    expect(
      hasAutogradeKey({
        type: "mathInput",
        correctAnswer: null,
        responseConfig: { acceptedAnswers: ["7.35"] },
      }),
    ).toBe(true);
    expect(
      hasAutogradeKey({
        type: "mathInput",
        correctAnswer: null,
        responseConfig: { acceptedAnswers: ["", "  "] },
      }),
    ).toBe(false);
  });
});

describe("autogradeEarnedPoints", () => {
  const tfQuestion = makeQuestion("trueFalse", {
    id: "q1",
    points: 2,
    responseConfig: { correctAnswer: true },
  });

  it("grades true/false", () => {
    const answer = serializeResponseValue({ type: "trueFalse", answer: true });
    expect(autogradeEarnedPoints(tfQuestion, answer)).toBe(2);
    const wrong = serializeResponseValue({ type: "trueFalse", answer: false });
    expect(autogradeEarnedPoints(tfQuestion, wrong)).toBe(0);
  });

  it("grades short answer against accepted list (case-insensitive by default)", () => {
    const question = makeQuestion("shortAnswer", {
      id: "q-sa",
      points: 4,
      responseConfig: { acceptedAnswers: ["Oxygen", "O2"], caseSensitive: false },
    });
    expect(autogradeEarnedPoints(question, "oxygen")).toBe(4);
    expect(autogradeEarnedPoints(question, "O2")).toBe(4);
    expect(autogradeEarnedPoints(question, "nitrogen")).toBe(0);
    expect(autogradeEarnedPoints(question, "")).toBe(0);
  });

  it("respects caseSensitive short answers", () => {
    const question = makeQuestion("shortAnswer", {
      points: 1,
      responseConfig: { acceptedAnswers: ["Na"], caseSensitive: true },
    });
    expect(autogradeEarnedPoints(question, "Na")).toBe(1);
    expect(autogradeEarnedPoints(question, "na")).toBe(0);
  });

  it("grades math input final answer against accepted list", () => {
    const mathQuestion = makeQuestion("mathInput", {
      id: "q2",
      points: 3,
      responseConfig: { acceptedAnswers: ["7.35", "7.3"], caseSensitive: false },
    });
    const correct = serializeResponseValue({
      type: "mathInput",
      working: "v^2/2g",
      answer: "7.35",
    });
    expect(autogradeEarnedPoints(mathQuestion, correct)).toBe(3);

    const variant = serializeResponseValue({
      type: "mathInput",
      working: "lots of algebra",
      answer: "7.3",
    });
    expect(autogradeEarnedPoints(mathQuestion, variant)).toBe(3);

    const wrong = serializeResponseValue({
      type: "mathInput",
      working: "v^2/2g",
      answer: "12",
    });
    expect(autogradeEarnedPoints(mathQuestion, wrong)).toBe(0);
  });

  it("does not score math working alone — only the final answer", () => {
    const mathQuestion = makeQuestion("mathInput", {
      points: 2,
      responseConfig: { acceptedAnswers: ["2"] },
    });
    const workingOnly = serializeResponseValue({
      type: "mathInput",
      working: "1+1=2",
      answer: "",
    });
    expect(autogradeEarnedPoints(mathQuestion, workingOnly)).toBe(0);
  });

  it("grades legacy math latex field as the final answer", () => {
    const mathQuestion = makeQuestion("mathInput", {
      points: 5,
      responseConfig: { acceptedAnswers: ["x=2"] },
    });
    const legacy = JSON.stringify({ type: "mathInput", latex: "x=2" });
    expect(autogradeEarnedPoints(mathQuestion, legacy)).toBe(5);
  });

  it("returns 0 for math input with no accepted answers configured", () => {
    const mathQuestion = makeQuestion("mathInput", {
      points: 2,
      responseConfig: { acceptedAnswers: [] },
    });
    const answer = serializeResponseValue({
      type: "mathInput",
      working: "steps",
      answer: "42",
    });
    expect(autogradeEarnedPoints(mathQuestion, answer)).toBe(0);
  });

  it("trims whitespace when matching math final answers", () => {
    const mathQuestion = makeQuestion("mathInput", {
      points: 1,
      responseConfig: { acceptedAnswers: ["42"] },
    });
    const answer = serializeResponseValue({
      type: "mathInput",
      working: "",
      answer: "  42  ",
    });
    expect(autogradeEarnedPoints(mathQuestion, answer)).toBe(1);
  });
});
