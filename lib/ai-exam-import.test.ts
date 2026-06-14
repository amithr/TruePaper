import { describe, expect, it } from "vitest";

import {
  AI_EXAM_MAX_QUESTIONS,
  AiExamParseError,
  buildAiExamGuideMarkdown,
  parseAiExamDocument,
} from "@/lib/ai-exam-import";
import { VALID_QUESTION_TYPES } from "@/lib/response-types/valid-types";

describe("parseAiExamDocument", () => {
  it("parses a minimal valid exam and applies defaults", () => {
    const exam = parseAiExamDocument({
      title: "Quiz",
      questions: [{ type: "extendedWritten", prompt: "Explain X." }],
    });

    expect(exam.title).toBe("Quiz");
    expect(exam.description).toBe("");
    expect(exam.questions).toHaveLength(1);
    expect(exam.questions[0].type).toBe("extendedWritten");
    expect(exam.questions[0].points).toBeGreaterThanOrEqual(1);
  });

  it("falls back to a default title when missing", () => {
    const exam = parseAiExamDocument({ questions: [{ type: "shortAnswer", prompt: "?" }] });
    expect(exam.title).toBe("Untitled Form");
  });

  it("accepts the document wrapped in { exam }", () => {
    const exam = parseAiExamDocument({
      exam: { title: "Wrapped", questions: [{ type: "trueFalse", prompt: "T or F" }] },
    });
    expect(exam.title).toBe("Wrapped");
    expect(exam.questions[0].type).toBe("trueFalse");
  });

  it("normalizes legacy 'text' type to extendedWritten", () => {
    const exam = parseAiExamDocument({ questions: [{ type: "text", prompt: "Write." }] });
    expect(exam.questions[0].type).toBe("extendedWritten");
  });

  it("keeps a valid multiple choice answer key", () => {
    const exam = parseAiExamDocument({
      questions: [
        {
          type: "multipleChoice",
          prompt: "Pick one",
          options: ["A", "B", "C"],
          correctAnswer: "B",
        },
      ],
    });
    expect(exam.questions[0].options).toEqual(["A", "B", "C"]);
    expect(exam.questions[0].correctAnswer).toBe("B");
  });

  it("drops a correctAnswer that is not one of the options", () => {
    const exam = parseAiExamDocument({
      questions: [
        { type: "multipleChoice", prompt: "Pick one", options: ["A", "B"], correctAnswer: "Z" },
      ],
    });
    expect(exam.questions[0].correctAnswer).toBeNull();
  });

  it("merges type-specific config over defaults", () => {
    const exam = parseAiExamDocument({
      questions: [
        { type: "shortAnswer", prompt: "?", config: { acceptedAnswers: ["oxygen"] } },
      ],
    });
    expect(exam.questions[0].responseConfig).toMatchObject({ acceptedAnswers: ["oxygen"] });
  });

  it("clamps invalid points to a sensible value", () => {
    const exam = parseAiExamDocument({
      questions: [{ type: "shortAnswer", prompt: "?", points: -4 }],
    });
    expect(exam.questions[0].points).toBeGreaterThanOrEqual(1);
  });

  it("rejects a document without questions", () => {
    expect(() => parseAiExamDocument({ title: "x" })).toThrow(AiExamParseError);
  });

  it("rejects an unknown question type", () => {
    expect(() =>
      parseAiExamDocument({ questions: [{ type: "essayPlus", prompt: "?" }] }),
    ).toThrow(/unsupported question type/i);
  });

  it("rejects multiple choice with fewer than two options", () => {
    expect(() =>
      parseAiExamDocument({
        questions: [{ type: "multipleChoice", prompt: "?", options: ["only"] }],
      }),
    ).toThrow(/at least 2 options/i);
  });

  it("rejects too many questions", () => {
    const questions = Array.from({ length: AI_EXAM_MAX_QUESTIONS + 1 }, () => ({
      type: "shortAnswer",
      prompt: "?",
    }));
    expect(() => parseAiExamDocument({ questions })).toThrow(/too many questions/i);
  });

  it("rejects non-object input", () => {
    expect(() => parseAiExamDocument("nope")).toThrow(AiExamParseError);
    expect(() => parseAiExamDocument([1, 2, 3])).toThrow(AiExamParseError);
  });
});

describe("buildAiExamGuideMarkdown", () => {
  const guide = buildAiExamGuideMarkdown();

  it("documents every importable (non-legacy) question type", () => {
    for (const type of VALID_QUESTION_TYPES) {
      if (type === "text") {
        continue;
      }
      expect(guide).toContain(`\`${type}\``);
    }
  });

  it("includes the top-level shape and JSON examples", () => {
    expect(guide).toContain('"questions"');
    expect(guide).toContain("```json");
  });
});
