import { describe, expect, it } from "vitest";

import { annotatePassageText, parseResponseConfig } from "@/lib/response-types/registry";

describe("annotatePassageText", () => {
  it("new annotate questions start with an empty passage", () => {
    expect(annotatePassageText(parseResponseConfig("annotateSource", undefined))).toBe("");
  });

  it("hides the legacy placeholder that used to be saved as the passage", () => {
    expect(
      annotatePassageText({
        passageText:
          "Paste the source passage here. Students will highlight spans and add margin notes.",
      }),
    ).toBe("");
  });

  it("returns real passages unchanged", () => {
    expect(annotatePassageText({ passageText: "The Houthis seized Mokha." })).toBe(
      "The Houthis seized Mokha.",
    );
    expect(annotatePassageText({})).toBe("");
    expect(annotatePassageText(null)).toBe("");
  });
});
