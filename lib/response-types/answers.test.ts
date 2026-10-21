import { describe, expect, it } from "vitest";

import {
  isResponseAnswered,
  parseResponseValue,
  previewResponseText,
  serializeResponseValue,
} from "@/lib/response-types/answers";

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

  it("round-trips math input working + final answer", () => {
    const raw = serializeResponseValue({
      type: "mathInput",
      working: "12^2 / (2*9.8)",
      answer: "7.35",
    });
    expect(parseResponseValue("mathInput", raw)).toEqual({
      type: "mathInput",
      working: "12^2 / (2*9.8)",
      answer: "7.35",
    });
    expect(isResponseAnswered("mathInput", raw)).toBe(true);
  });

  it("maps legacy math latex field to final answer", () => {
    const legacy = JSON.stringify({ type: "mathInput", latex: "x=2" });
    expect(parseResponseValue("mathInput", legacy)).toEqual({
      type: "mathInput",
      working: "",
      answer: "x=2",
    });
  });

  it("treats math as answered when working or final answer is present", () => {
    expect(
      isResponseAnswered(
        "mathInput",
        serializeResponseValue({ type: "mathInput", working: "steps", answer: "" }),
      ),
    ).toBe(true);
    expect(
      isResponseAnswered(
        "mathInput",
        serializeResponseValue({ type: "mathInput", working: "", answer: "2" }),
      ),
    ).toBe(true);
    expect(
      isResponseAnswered(
        "mathInput",
        serializeResponseValue({ type: "mathInput", working: "", answer: "" }),
      ),
    ).toBe(false);
  });

  it("previews math final answer preferentially over working", () => {
    const raw = serializeResponseValue({
      type: "mathInput",
      working: "long working out",
      answer: "7.35",
    });
    expect(previewResponseText("mathInput", raw)).toBe("7.35");
    expect(
      previewResponseText(
        "mathInput",
        serializeResponseValue({ type: "mathInput", working: "only working", answer: "" }),
      ),
    ).toBe("only working");
  });
});

describe("drawDiagram photo answers", () => {
  it("round-trips an uploaded photo alongside strokes and counts it as answered", () => {
    const raw = serializeResponseValue({
      type: "drawDiagram",
      strokes: [],
      imageDataUrl: "data:image/jpeg;base64,AAA",
      imageWidth: 800,
      imageHeight: 600,
    });
    expect(parseResponseValue("drawDiagram", raw)).toEqual({
      type: "drawDiagram",
      strokes: [],
      imageDataUrl: "data:image/jpeg;base64,AAA",
      imageWidth: 800,
      imageHeight: 600,
    });
    expect(isResponseAnswered("drawDiagram", raw)).toBe(true);
  });

  it("omits photo fields when there is no photo", () => {
    const raw = serializeResponseValue({ type: "drawDiagram", strokes: [], imageDataUrl: undefined });
    expect(JSON.parse(raw)).toEqual({ type: "drawDiagram", strokes: [] });
  });
});

describe("graph curves", () => {
  it("round-trips curves and counts a curve as answered", () => {
    const raw = serializeResponseValue({
      type: "graph",
      points: [],
      lines: [],
      labels: [],
      curves: [{ id: "c1", pointIds: ["p1", "p2", "p3"] }],
    });
    const parsed = parseResponseValue("graph", raw);
    expect(parsed).toMatchObject({ curves: [{ id: "c1", pointIds: ["p1", "p2", "p3"] }] });
    expect(isResponseAnswered("graph", raw)).toBe(true);
  });

  it("keeps answers without curves byte-for-byte as before", () => {
    const raw = serializeResponseValue({ type: "graph", points: [], lines: [], labels: [], curves: [] });
    expect(JSON.parse(raw)).toEqual({ type: "graph", points: [], lines: [], labels: [] });
    // Older saved answers (no `curves` key) parse with an empty list.
    expect(parseResponseValue("graph", raw)).toMatchObject({ curves: [] });
  });
});
