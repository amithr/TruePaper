import { describe, expect, it } from "vitest";

import { questionClassStats, studentsForReview } from "@/lib/review/class-stats";
import { serializeResponseValue } from "@/lib/response-types/answers";
import { makeQuestion } from "@/lib/test/question-fixtures";

const mc = makeQuestion("multipleChoice", { id: "q1", options: ["Red", "Blue", "Green"], correctAnswer: "Blue" });
const sa = makeQuestion("shortAnswer", { id: "q2", responseConfig: { acceptedAnswers: ["oxygen"], caseSensitive: false } });
const essay = makeQuestion("extendedWritten", { id: "q3" });
const matching = makeQuestion("matching", {
  id: "q4",
  points: 2,
  responseConfig: {
    left: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
    right: [
      { id: "x", text: "X" },
      { id: "y", text: "Y" },
    ],
    correct: { a: "x", b: "y" },
  },
});

const student = (finished: boolean, answers: Record<string, string>) => ({ finished, answers });
const mcAnswer = (choice: string) => serializeResponseValue({ type: "multipleChoice", choice });

describe("studentsForReview", () => {
  it("prefers students who handed in, else anyone who answered", () => {
    const a = student(true, { q1: mcAnswer("Red") });
    const b = student(false, { q1: mcAnswer("Blue") });
    const idle = student(false, {});
    expect(studentsForReview([a, b, idle])).toEqual([a]);
    expect(studentsForReview([b, idle])).toEqual([b]);
  });
});

describe("questionClassStats", () => {
  it("gives a distribution per option and flags the correct one", () => {
    const stats = questionClassStats(mc, [
      student(true, { q1: mcAnswer("Blue") }),
      student(true, { q1: mcAnswer("Blue") }),
      student(true, { q1: mcAnswer("Red") }),
      student(true, {}),
    ]);
    expect(stats).toMatchObject({ kind: "choices", n: 4, answered: 3 });
    if (stats.kind !== "choices") {
      throw new Error("kind");
    }
    expect(stats.options).toEqual([
      { label: "Red", count: 1, pct: 33, correct: false },
      { label: "Blue", count: 2, pct: 67, correct: true },
      { label: "Green", count: 0, pct: 0, correct: false },
    ]);
  });

  it("counts correct short answers and the most common ones, anonymously", () => {
    const stats = questionClassStats(sa, [
      student(true, { q2: "Oxygen" }),
      student(true, { q2: "oxygen " }),
      student(true, { q2: "carbon dioxide" }),
      student(true, { q2: "" }),
    ]);
    expect(stats).toMatchObject({ kind: "text", n: 4, answered: 3, correct: 2 });
    if (stats.kind !== "text") {
      throw new Error("kind");
    }
    expect(stats.common[0]).toEqual({ text: "Oxygen", count: 2 });
    expect(stats.common[1]).toEqual({ text: "carbon dioxide", count: 1 });
  });

  it("averages partial credit for matching and counts full marks", () => {
    const full = serializeResponseValue({ type: "matching", pairs: { a: "x", b: "y" } });
    const half = serializeResponseValue({ type: "matching", pairs: { a: "x", b: "x" } });
    const stats = questionClassStats(matching, [student(true, { q4: full }), student(true, { q4: half })]);
    expect(stats).toEqual({ kind: "credit", n: 2, answered: 2, averagePct: 75, fullMarks: 1 });
  });

  it("only reports how many answered for free-form work", () => {
    const stats = questionClassStats(essay, [student(true, { q3: "Lots of words" }), student(true, {})]);
    expect(stats).toEqual({ kind: "answered", n: 2, answered: 1 });
  });
});
