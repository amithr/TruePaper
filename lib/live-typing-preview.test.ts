import { describe, expect, it } from "vitest";

import {
  liveSessionRosterPreview,
  liveTypingPreview,
  rosterPreviewQuestionIds,
  textAnswerWordCount,
  truncateTypingPreview,
} from "@/lib/live-typing-preview";

describe("liveTypingPreview", () => {
  it("picks the longest text answer and truncates", () => {
    const long = "a".repeat(120);
    expect(
      liveTypingPreview(
        { q1: "short", q2: long, q3: "mc" },
        ["q1", "q2"],
        40,
      ),
    ).toBe(`${"a".repeat(39)}…`);
  });

  it("uses written question types for roster preview", () => {
    expect(
      liveSessionRosterPreview(
        { q1: "hello world", q2: "Mitochondria" },
        [
          { id: "q1", type: "extendedWritten" },
          { id: "q2", type: "multipleChoice" },
        ],
      ),
    ).toBe("hello world");
    expect(
      rosterPreviewQuestionIds([
        { id: "q1", type: "shortAnswer" },
        { id: "q2", type: "multipleChoice" },
      ]),
    ).toEqual(["q1"]);
  });

  it("counts words on text questions only", () => {
    expect(
      textAnswerWordCount(
        { t1: "one two", t2: "three", mc: "Mitochondria" },
        ["t1", "t2"],
      ),
    ).toBe(3);
  });
});

describe("truncateTypingPreview", () => {
  it("returns empty for blank input", () => {
    expect(truncateTypingPreview("   ")).toBe("");
  });
});
