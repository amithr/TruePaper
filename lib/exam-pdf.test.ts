import { describe, expect, it } from "vitest";

import {
  buildSessionExamBundlePdf,
  buildSingleStudentExamPdf,
  safeFilenameSlug,
} from "@/lib/exam-pdf";
import type { ExamPdfSession, ExamPdfStudent } from "@/lib/exam-pdf-load";
import type { Form } from "@/lib/forms";

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
  createdBy: "teacher-1",
  liveTeacherFeedbackEnabled: false,
  questions: [
    {
      id: "q1",
      prompt: "Explain photosynthesis.",
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

describe("exam-pdf", () => {
  it("builds safe filename slugs", () => {
    expect(safeFilenameSlug("Midterm — Essay (2026)", "exam")).toBe("Midterm-Essay-2026");
    expect(safeFilenameSlug("   ", "fallback")).toBe("fallback");
  });

  it("generates a single-student PDF buffer", async () => {
    const buf = await buildSingleStudentExamPdf({ session, form, student });
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("generates a session bundle PDF buffer", async () => {
    const buf = await buildSessionExamBundlePdf({ session, form, students: [student] });
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
