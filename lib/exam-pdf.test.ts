/** @vitest-environment node */
import { describe, expect, it } from "vitest";

import {
  buildSessionExamBundlePdf,
  buildSingleStudentExamPdf,
  safeFilenameSlug,
} from "@/lib/exam-pdf";
import { nodeExamPdfEngine } from "@/lib/exam-pdf-node";
import type { ExamPdfSession, ExamPdfStudent } from "@/lib/exam-pdf-load";
import type { Form, Question } from "@/lib/forms";

const engine = nodeExamPdfEngine();

const session: ExamPdfSession = {
  id: "session-1",
  joinCode: "ABCDEF",
  opensAt: "2026-06-05T10:00:00.000Z",
  closesAt: "2026-06-05T11:00:00.000Z",
  formTitle: "Midterm Essay",
};

const form: Form = {
  id: "form-1",
  title: "Midterm Essay",
  description: "Answer all questions.",
  descriptionImagePath: null,
  createdBy: "teacher-1",
  liveTeacherFeedbackEnabled: false,
  questions: [
    {
      id: "q1",
      prompt: "Explain photosynthesis.",
      promptImagePath: null,
      type: "extendedWritten",
      options: [],
      correctAnswer: null,
      points: 5,
      displayOrder: 0,
      responseConfig: { minWords: 50, targetWords: 200, showCount: "words" },
    },
  ],
};

const student: ExamPdfStudent = {
  anonymousSessionId: "device-1",
  displayName: "Ada Lovelace",
  suspended: false,
  finished: true,
  graded: false,
  gradedAt: null,
  finishedAt: "2026-06-05T10:45:00.000Z",
  lastActivityAt: "2026-06-05T10:44:00.000Z",
  hasJoined: true,
  answers: { q1: "Plants convert light to energy." },
  liveTeacherFeedback: {},
  questionGrades: {},
  pointsEarned: null,
  pointsPossible: 5,
};

function pdfHeader(bytes: Uint8Array): string {
  return Buffer.from(bytes.subarray(0, 4)).toString();
}

function formWithQuestion(question: Partial<Question> & { id: string }): Form {
  return {
    ...form,
    questions: [
      {
        id: question.id,
        prompt: question.prompt ?? "Question",
        promptImagePath: question.promptImagePath ?? null,
        type: question.type ?? "extendedWritten",
        options: question.options ?? [],
        correctAnswer: question.correctAnswer ?? null,
        points: question.points ?? 3,
        displayOrder: 0,
        responseConfig: question.responseConfig ?? {},
      },
    ],
  };
}

async function buildWithAnswer(builtForm: Form, answers: Record<string, string>) {
  return buildSingleStudentExamPdf({
    engine,
    session,
    form: builtForm,
    student: { ...student, answers },
  });
}

describe("exam-pdf", () => {
  it("builds safe filename slugs", () => {
    expect(safeFilenameSlug("Midterm — Essay (2026)", "exam")).toBe("Midterm-Essay-2026");
    expect(safeFilenameSlug("   ", "fallback")).toBe("fallback");
  });

  it("generates a single-student PDF buffer", async () => {
    const buf = await buildSingleStudentExamPdf({ engine, session, form, student });
    expect(buf.length).toBeGreaterThan(100);
    expect(pdfHeader(buf)).toBe("%PDF");
  });

  it("generates a session bundle PDF buffer", async () => {
    const buf = await buildSessionExamBundlePdf({ engine, session, form, students: [student] });
    expect(buf.length).toBeGreaterThan(100);
    expect(pdfHeader(buf)).toBe("%PDF");
  });

  it("reports per-student progress while rendering a bundle", async () => {
    const calls: Array<[number, number]> = [];
    await buildSessionExamBundlePdf({
      engine,
      session,
      form,
      students: [student, { ...student, anonymousSessionId: "device-2", displayName: "Bob" }],
      onStudentRendered: (done, total) => {
        calls.push([done, total]);
      },
    });
    expect(calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("renders drawDiagram answers as strokes with a background image", async () => {
    const drawForm: Form = {
      ...form,
      questions: [
        {
          id: "q-draw",
          prompt: "Mark the capital city.",
          promptImagePath: "t1/f1/q-q-draw.jpg",
          type: "drawDiagram",
          options: [],
          correctAnswer: null,
          points: 4,
          displayOrder: 0,
          responseConfig: { width: 600, height: 360, promptImageAsBackground: true },
        },
      ],
    };
    const answer = JSON.stringify({
      type: "drawDiagram",
      strokes: [
        {
          id: "s1",
          color: "#1e3a5f",
          width: 2.5,
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.9, y: 0.9 },
          ],
        },
      ],
    });
    const annotation = JSON.stringify({
      kind: "canvas",
      strokes: [
        {
          id: "t1",
          color: "#c2410c",
          width: 3,
          points: [
            { x: 0.4, y: 0.4 },
            { x: 0.6, y: 0.4 },
          ],
        },
      ],
    });
    const drawStudent: ExamPdfStudent = {
      ...student,
      answers: { "q-draw": answer },
      liveTeacherFeedback: { "q-draw::canvas": annotation },
    };
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );

    const buf = await buildSingleStudentExamPdf({
      engine,
      session,
      form: drawForm,
      student: drawStudent,
      questionImages: { "q-draw": png },
    });
    expect(pdfHeader(buf)).toBe("%PDF");

    const plain = await buildSingleStudentExamPdf({
      engine,
      session,
      form: drawForm,
      student: drawStudent,
    });
    expect(buf.length).toBeGreaterThan(plain.length);
  });

  it("embeds prompt images for non-canvas questions and the cover description image", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const imageForm: Form = {
      ...form,
      descriptionImagePath: "t1/f1/description.jpg",
      questions: [{ ...form.questions[0], promptImagePath: "t1/f1/q-q1.jpg" }],
    };

    const withImages = await buildSessionExamBundlePdf({
      engine,
      session,
      form: imageForm,
      students: [student],
      questionImages: { q1: png },
      descriptionImage: png,
    });
    expect(pdfHeader(withImages)).toBe("%PDF");

    const withoutImages = await buildSessionExamBundlePdf({
      engine,
      session,
      form: imageForm,
      students: [student],
    });
    expect(withImages.length).toBeGreaterThan(withoutImages.length);
  });

  it("renders an empty drawDiagram answer as a text box without crashing", async () => {
    const drawForm = formWithQuestion({
      id: "q-draw",
      type: "drawDiagram",
      responseConfig: { width: 600, height: 360 },
    });
    const buf = await buildWithAnswer(drawForm, {});
    expect(pdfHeader(buf)).toBe("%PDF");
  });

  it("vector-renders graph answers (points, lines, labels) larger than an empty graph", async () => {
    const graphForm = formWithQuestion({
      id: "q-graph",
      type: "graph",
      responseConfig: {
        xMin: -5,
        xMax: 5,
        yMin: -5,
        yMax: 5,
        xAxisLabel: "Time",
        yAxisLabel: "Distance",
      },
    });
    const richAnswer = JSON.stringify({
      type: "graph",
      points: Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, x: i - 5, y: (i % 7) - 3 })),
      lines: [{ id: "l1", from: "p0", to: "p11" }],
      labels: [{ id: "t1", x: 0, y: -3, text: "origin shift" }],
    });
    const smallAnswer = JSON.stringify({
      type: "graph",
      points: [{ id: "p1", x: 1, y: 1 }],
      lines: [],
      labels: [{ id: "t1", x: 0, y: -3, text: "x" }],
    });
    const rich = await buildWithAnswer(graphForm, { "q-graph": richAnswer });
    expect(pdfHeader(rich)).toBe("%PDF");
    const small = await buildWithAnswer(graphForm, { "q-graph": smallAnswer });
    expect(pdfHeader(small)).toBe("%PDF");
    // Same fonts in both — the extra points/lines mean strictly more vector ops.
    expect(rich.length).toBeGreaterThan(small.length);
    const empty = await buildWithAnswer(graphForm, {});
    expect(pdfHeader(empty)).toBe("%PDF");
  });

  it("embeds photoHandwritten answers from their data URL", async () => {
    const photoForm = formWithQuestion({ id: "q-photo", type: "photoHandwritten" });
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const answer = JSON.stringify({
      type: "photoHandwritten",
      imageDataUrl: dataUrl,
      width: 1,
      height: 1,
    });
    const withPhoto = await buildWithAnswer(photoForm, { "q-photo": answer });
    expect(pdfHeader(withPhoto)).toBe("%PDF");
    // Object dictionaries are uncompressed, so the embedded image XObject is greppable.
    expect(Buffer.from(withPhoto).toString("latin1")).toContain("/Subtype /Image");
    const empty = await buildWithAnswer(photoForm, {});
    expect(Buffer.from(empty).toString("latin1")).not.toContain("/Subtype /Image");
  });

  it("renders trueFalse answers with markers", async () => {
    const tfForm = formWithQuestion({
      id: "q-tf",
      type: "trueFalse",
      responseConfig: { correctAnswer: true },
    });
    const answer = JSON.stringify({ type: "trueFalse", answer: false });
    const buf = await buildWithAnswer(tfForm, { "q-tf": answer });
    expect(pdfHeader(buf)).toBe("%PDF");
  });

  it("renders matching answers as prompt/pick rows", async () => {
    const matchingForm = formWithQuestion({
      id: "q-match",
      type: "matching",
      responseConfig: {
        left: [
          { id: "l1", text: "Mitochondria" },
          { id: "l2", text: "Ribosome" },
        ],
        right: [
          { id: "r1", text: "Energy" },
          { id: "r2", text: "Protein" },
        ],
        correct: { l1: "r1", l2: "r2" },
      },
    });
    const answer = JSON.stringify({ type: "matching", pairs: { l1: "r2" } });
    const buf = await buildWithAnswer(matchingForm, { "q-match": answer });
    expect(pdfHeader(buf)).toBe("%PDF");
    const empty = await buildWithAnswer(matchingForm, {});
    expect(pdfHeader(empty)).toBe("%PDF");
  });

  it("renders ordering answers as a numbered list", async () => {
    const orderingForm = formWithQuestion({
      id: "q-order",
      type: "ordering",
      responseConfig: {
        items: [
          { id: "i1", text: "Wake up" },
          { id: "i2", text: "Eat breakfast" },
        ],
        correctOrder: ["i1", "i2"],
      },
    });
    const answer = JSON.stringify({ type: "ordering", order: ["i2", "i1"] });
    const buf = await buildWithAnswer(orderingForm, { "q-order": answer });
    expect(pdfHeader(buf)).toBe("%PDF");
  });

  it("renders labelling, structured, annotate, and mathInput answers", async () => {
    const questions: Question[] = [
      {
        id: "q-label",
        prompt: "Label the diagram.",
        promptImagePath: null,
        type: "labelling",
        options: [],
        correctAnswer: null,
        points: 2,
        displayOrder: 0,
        responseConfig: {
          zones: [{ id: "z1", text: "Top" }],
          terms: [{ id: "t1", text: "Nucleus" }],
          correct: { z1: "t1" },
        },
      },
      {
        id: "q-parts",
        prompt: "Answer both parts.",
        promptImagePath: null,
        type: "structuredMultiPart",
        options: [],
        correctAnswer: null,
        points: 4,
        displayOrder: 1,
        responseConfig: { parts: [{ id: "a", label: "Part A" }, { id: "b", label: "Part B" }] },
      },
      {
        id: "q-annotate",
        prompt: "Highlight the thesis.",
        promptImagePath: null,
        type: "annotateSource",
        options: [],
        correctAnswer: null,
        points: 3,
        displayOrder: 2,
        responseConfig: { passageText: "The quick brown fox jumps over the lazy dog." },
      },
      {
        id: "q-math",
        prompt: "Solve for x.",
        promptImagePath: null,
        type: "mathInput",
        options: [],
        correctAnswer: null,
        points: 2,
        displayOrder: 3,
        responseConfig: {},
      },
    ];
    const richForm: Form = { ...form, questions };
    const answers = {
      "q-label": JSON.stringify({ type: "labelling", assignments: { z1: "t1" } }),
      "q-parts": JSON.stringify({
        type: "structuredMultiPart",
        parts: { a: "First answer", b: "Second answer" },
      }),
      "q-annotate": JSON.stringify({
        type: "annotateSource",
        highlights: [{ id: "h1", start: 4, end: 19, note: "Key phrase" }],
      }),
      "q-math": JSON.stringify({ type: "mathInput", working: "2x = 10", answer: "x = 5" }),
    };
    const buf = await buildWithAnswer(richForm, answers);
    expect(pdfHeader(buf)).toBe("%PDF");
    const empty = await buildWithAnswer(richForm, {});
    expect(pdfHeader(empty)).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(empty.length);
  });
});
