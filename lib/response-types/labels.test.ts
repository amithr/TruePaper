import { describe, expect, it } from "vitest";

import { responseTypeLabelPath } from "@/lib/response-types/labels";

describe("responseTypeLabelPath", () => {
  it("maps known types to responseTypes.*.label paths", () => {
    expect(responseTypeLabelPath("mathInput")).toBe("responseTypes.mathInput.label");
    expect(responseTypeLabelPath("shortAnswer")).toBe("responseTypes.shortAnswer.label");
    expect(responseTypeLabelPath("multipleChoice")).toBe("responseTypes.multipleChoice.label");
  });

  it("normalizes legacy text to extendedWritten", () => {
    expect(responseTypeLabelPath("text")).toBe("responseTypes.extendedWritten.label");
  });
});
