import { afterEach, describe, expect, it, vi } from "vitest";

import {
  drawDiagramBackgroundUrl,
  promptImageInsideDrawAnswer,
  promptImageUsedAsCanvasBackground,
} from "@/lib/response-types/drawing";

const SUPABASE_URL = "https://example.supabase.co";
const IMAGE_PATH = "teacher-1/form-1/q-q1.jpg";
const PUBLIC_URL = `${SUPABASE_URL}/storage/v1/object/public/form-assets/${IMAGE_PATH}`;

describe("drawDiagramBackgroundUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the question image URL when opted in and an image exists", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
    expect(
      drawDiagramBackgroundUrl({ promptImageAsBackground: true }, IMAGE_PATH),
    ).toBe(PUBLIC_URL);
  });

  it("ignores the question image without the opt-in flag", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
    expect(drawDiagramBackgroundUrl({}, IMAGE_PATH)).toBeUndefined();
  });

  it("falls back to legacy backgroundDataUrl when no image is attached", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
    expect(
      drawDiagramBackgroundUrl(
        { promptImageAsBackground: true, backgroundDataUrl: "data:image/png;base64,abc" },
        null,
      ),
    ).toBe("data:image/png;base64,abc");
  });
});

describe("promptImageUsedAsCanvasBackground", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is true only with the flag and a resolvable image", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
    expect(
      promptImageUsedAsCanvasBackground({ promptImageAsBackground: true }, IMAGE_PATH),
    ).toBe(true);
    expect(promptImageUsedAsCanvasBackground({}, IMAGE_PATH)).toBe(false);
    expect(
      promptImageUsedAsCanvasBackground({ promptImageAsBackground: true }, null),
    ).toBe(false);
  });
});

describe("promptImageInsideDrawAnswer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const question = {
    type: "drawDiagram",
    responseConfig: { promptImageAsBackground: true },
    promptImagePath: IMAGE_PATH,
  };

  it("is true for a drawing on the question-image canvas", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
    const drawing = JSON.stringify({ type: "drawDiagram", strokes: [] });
    expect(promptImageInsideDrawAnswer(question, drawing)).toBe(true);
    expect(promptImageInsideDrawAnswer(question, undefined)).toBe(true);
  });

  it("is false when the student uploaded a photo instead, so the image shows inline", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
    const photo = JSON.stringify({
      type: "drawDiagram",
      strokes: [],
      imageDataUrl: "data:image/jpeg;base64,AAA",
    });
    expect(promptImageInsideDrawAnswer(question, photo)).toBe(false);
  });
});
