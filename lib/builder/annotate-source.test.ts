import { describe, expect, it } from "vitest";

import {
  looksLikeSourceText,
  moveQuestionTextToPassage,
  promptLooksLikeMisplacedSource,
} from "@/lib/builder/annotate-source";
import { annotatePassageText } from "@/lib/response-types/registry";
import { makeQuestion } from "@/lib/test/question-fixtures";

const ARTICLE =
  "The Iran-backed Houthi militia captured a strategic Red Sea port city on Thursday, according to two Yemeni officials, in a sweeping ground offensive that could give the group greater control over an important shipping route.";

describe("annotate source helpers", () => {
  it("recognises an article but not an instruction", () => {
    expect(looksLikeSourceText(ARTICLE)).toBe(true);
    // Short multi-line sources (a poem stanza) count once they pass ~80 characters.
    expect(
      looksLikeSourceText(
        "Shall I compare thee to a summer's day?\nThou art more lovely and more temperate:\nRough winds do shake",
      ),
    ).toBe(true);
    expect(looksLikeSourceText("Highlight the evidence the writer uses.")).toBe(false);
  });

  it("flags an annotate question whose source was typed into the question text", () => {
    expect(promptLooksLikeMisplacedSource(makeQuestion("annotateSource", { prompt: ARTICLE }))).toBe(true);
    expect(
      promptLooksLikeMisplacedSource(
        makeQuestion("annotateSource", { prompt: ARTICLE, responseConfig: { passageText: "Real source" } }),
      ),
    ).toBe(false);
    expect(promptLooksLikeMisplacedSource(makeQuestion("extendedWritten", { prompt: ARTICLE }))).toBe(false);
  });

  it("moves the question text into the passage and leaves an instruction", () => {
    const moved = moveQuestionTextToPassage(
      makeQuestion("annotateSource", { prompt: `  ${ARTICLE}  ` }),
      "Highlight and annotate the source below.",
    );
    expect(moved.prompt).toBe("Highlight and annotate the source below.");
    expect(annotatePassageText(moved.responseConfig)).toBe(ARTICLE);
  });
});
