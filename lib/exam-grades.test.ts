import { describe, expect, it } from "vitest";

import {
  formatPointsScore,
  gradingStateFor,
  isFullyGraded,
  mcEarnedPoints,
  parseQuestionGrades,
  questionScoreTone,
  scorePercent,
  scoreTier,
  scoreTierMessage,
  sumEarnedPoints,
  sumPossiblePoints,
} from "@/lib/exam-grades";
import type { Question } from "@/lib/forms";

const mcQuestion: Question = {
  id: "q1",
  prompt: "Pick one",
  promptImagePath: null,
  type: "multipleChoice",
  options: ["A", "B"],
  correctAnswer: "B",
  points: 5,
  displayOrder: 0,
  responseConfig: {},
};

describe("parseQuestionGrades", () => {
  it("parses numeric entries", () => {
    expect(parseQuestionGrades({ q1: 3, q2: "4" })).toEqual({ q1: 3, q2: 4 });
  });

  it("ignores invalid values", () => {
    expect(parseQuestionGrades({ q1: -2, q2: "nope" })).toEqual({ q1: 0 });
  });
});

describe("sumPossiblePoints", () => {
  it("sums question weights", () => {
    expect(
      sumPossiblePoints([
        { points: 2 },
        { points: 3 },
      ]),
    ).toBe(5);
  });
});

describe("sumEarnedPoints", () => {
  it("sums grades for known questions", () => {
    expect(sumEarnedPoints({ q1: 2, q2: 1, other: 99 }, [{ id: "q1" }, { id: "q2" }])).toBe(3);
  });
});

describe("mcEarnedPoints", () => {
  it("awards full points for correct MC answer", () => {
    expect(mcEarnedPoints(mcQuestion, "B")).toBe(5);
  });

  it("awards zero for wrong or missing answer", () => {
    expect(mcEarnedPoints(mcQuestion, "A")).toBe(0);
    expect(mcEarnedPoints(mcQuestion, "")).toBe(0);
  });
});

describe("formatPointsScore", () => {
  it("formats singular and plural", () => {
    expect(formatPointsScore(1, 1)).toBe("1 / 1 pt");
    expect(formatPointsScore(4, 10)).toBe("4 / 10 pts");
  });
});

describe("scorePercent", () => {
  it("returns 0 when possible is 0", () => {
    expect(scorePercent(5, 0)).toBe(0);
  });

  it("rounds the ratio to nearest integer", () => {
    expect(scorePercent(3, 4)).toBe(75);
    expect(scorePercent(2, 3)).toBe(67);
  });

  it("clamps to [0, 100]", () => {
    expect(scorePercent(-5, 10)).toBe(0);
    expect(scorePercent(11, 10)).toBe(100);
  });
});

describe("scoreTier", () => {
  it("classifies by percentage", () => {
    expect(scoreTier(10, 10)).toBe("perfect");
    expect(scoreTier(8, 10)).toBe("great");
    expect(scoreTier(6, 10)).toBe("solid");
    expect(scoreTier(3, 10)).toBe("needs-work");
  });
});

describe("scoreTierMessage", () => {
  it("returns supportive copy", () => {
    expect(scoreTierMessage("perfect")).toMatch(/perfect/i);
    expect(scoreTierMessage("needs-work")).toMatch(/review/i);
  });
});

describe("questionScoreTone", () => {
  it("returns full / partial / zero", () => {
    expect(questionScoreTone(5, 5)).toBe("full");
    expect(questionScoreTone(3, 5)).toBe("partial");
    expect(questionScoreTone(0, 5)).toBe("zero");
    expect(questionScoreTone(0, 0)).toBe("zero");
  });
});

describe("gradingStateFor", () => {
  const text: Pick<Question, "id" | "type" | "correctAnswer" | "responseConfig"> = {
    id: "t1",
    type: "text",
    correctAnswer: null,
    responseConfig: {},
  };
  const mcWithKey: Pick<Question, "id" | "type" | "correctAnswer" | "responseConfig"> = {
    id: "m1",
    type: "multipleChoice",
    correctAnswer: "B",
    responseConfig: {},
  };
  const mcNoKey: Pick<Question, "id" | "type" | "correctAnswer" | "responseConfig"> = {
    id: "m2",
    type: "multipleChoice",
    correctAnswer: null,
    responseConfig: {},
  };
  const mathWithKey: Pick<Question, "id" | "type" | "correctAnswer" | "responseConfig"> = {
    id: "math1",
    type: "mathInput",
    correctAnswer: null,
    responseConfig: { acceptedAnswers: ["7.35"] },
  };

  it("is 'needs-grading' when earned is null/undefined", () => {
    expect(gradingStateFor(text, null)).toBe("needs-grading");
    expect(gradingStateFor(text, undefined)).toBe("needs-grading");
  });

  it("is 'auto' for MC with an answer key", () => {
    expect(gradingStateFor(mcWithKey, 5)).toBe("auto");
  });

  it("is 'auto' for math input with accepted answers", () => {
    expect(gradingStateFor(mathWithKey, 3)).toBe("auto");
  });

  it("is 'graded' for text or MC without a key", () => {
    expect(gradingStateFor(text, 5)).toBe("graded");
    expect(gradingStateFor(mcNoKey, 5)).toBe("graded");
  });
});

describe("isFullyGraded", () => {
  it("returns false when any question is missing", () => {
    expect(isFullyGraded({ a: 1 }, [{ id: "a" }, { id: "b" }])).toBe(false);
  });
  it("returns true when every question has a numeric grade", () => {
    expect(isFullyGraded({ a: 1, b: 0 }, [{ id: "a" }, { id: "b" }])).toBe(true);
  });
  it("returns false on empty questions list", () => {
    expect(isFullyGraded({}, [])).toBe(false);
  });
});
