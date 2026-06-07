import { describe, expect, it } from "vitest";

import { isResponseAnswered, parseResponseValue, serializeResponseValue } from "@/lib/response-types/answers";

describe("response answer wire format", () => {
  it("parses and detects answered multiple choice", () => {
    const value = parseResponseValue("multipleChoice", "Option A");
    expect(value.type).toBe("multipleChoice");
    expect(isResponseAnswered("multipleChoice", "Option A")).toBe(true);
    expect(isResponseAnswered("multipleChoice", "")).toBe(false);
  });

  it("round-trips true/false answers", () => {
    const raw = serializeResponseValue({ type: "trueFalse", answer: true });
    expect(isResponseAnswered("trueFalse", raw)).toBe(true);
    expect(parseResponseValue("trueFalse", raw)).toEqual({ type: "trueFalse", answer: true });
  });

  it("detects answered draw diagram strokes", () => {
    const raw = serializeResponseValue({
      type: "drawDiagram",
      strokes: [{ points: [{ x: 1, y: 2 }], color: "#000", width: 2 }],
      width: 400,
      height: 300,
    });
    expect(isResponseAnswered("drawDiagram", raw)).toBe(true);
    expect(isResponseAnswered("drawDiagram", serializeResponseValue({ type: "drawDiagram", strokes: [], width: 400, height: 300 }))).toBe(
      false,
    );
  });

  it("detects answered matching pairs", () => {
    const raw = serializeResponseValue({
      type: "matching",
      pairs: { left1: "right1" },
    });
    expect(isResponseAnswered("matching", raw)).toBe(true);
  });

  it("parses empty annotate source answers as highlight type", () => {
    expect(parseResponseValue("annotateSource", undefined)).toEqual({
      type: "annotateSource",
      highlights: [],
    });
    expect(isResponseAnswered("annotateSource", undefined)).toBe(false);
  });
});
