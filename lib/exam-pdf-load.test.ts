/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadExamPdfImages } from "@/lib/exam-pdf-load";
import type { Form, Question } from "@/lib/forms";

function makeQuestion(overrides: Partial<Question>): Question {
  return {
    id: "q1",
    prompt: "",
    promptImagePath: null,
    type: "extendedWritten",
    options: [],
    correctAnswer: null,
    points: 1,
    displayOrder: 0,
    responseConfig: {},
    ...overrides,
  };
}

function makeForm(overrides: Partial<Form>): Form {
  return {
    id: "form-1",
    title: "Quiz",
    description: "",
    descriptionImagePath: null,
    createdBy: "t1",
    liveTeacherFeedbackEnabled: false,
    questions: [],
    ...overrides,
  };
}

describe("loadExamPdfImages", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fetches the description image and every question prompt image", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => bytes,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const form = makeForm({
      descriptionImagePath: "t1/f1/description.jpg",
      questions: [
        makeQuestion({ id: "q-text", promptImagePath: "t1/f1/q-q-text.jpg" }),
        makeQuestion({
          id: "q-draw",
          type: "drawDiagram",
          promptImagePath: "t1/f1/q-q-draw.jpg",
          responseConfig: { promptImageAsBackground: true },
        }),
        makeQuestion({ id: "q-plain" }),
      ],
    });

    const images = await loadExamPdfImages(form);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(Object.keys(images.questions).sort()).toEqual(["q-draw", "q-text"]);
    expect(images.description?.equals(Buffer.from([1, 2, 3]))).toBe(true);
  });

  it("skips failed fetches without throwing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const form = makeForm({
      descriptionImagePath: "t1/f1/description.jpg",
      questions: [makeQuestion({ id: "q1", promptImagePath: "t1/f1/q-q1.jpg" })],
    });
    await expect(loadExamPdfImages(form)).resolves.toEqual({
      questions: {},
      description: null,
    });
  });
});
