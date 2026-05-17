import { describe, expect, it } from "vitest";

import { isAnswersOnlyFormResponseUpdate } from "@/lib/student-exam-realtime-filter";

const baseRow = {
  answers: { q1: "hello" },
  live_teacher_feedback: {},
  suspended_at: null,
  finished_at: null,
  student_resume_code: null,
};

describe("isAnswersOnlyFormResponseUpdate", () => {
  it("does not skip when only teacher feedback changed (student must receive feedback)", () => {
    const oldRow = { ...baseRow, live_teacher_feedback: {} };
    const newRow = {
      ...baseRow,
      live_teacher_feedback: { q1: "Nice work — expand your second point." },
    };

    expect(isAnswersOnlyFormResponseUpdate(oldRow, newRow)).toBe(false);
  });

  it("skips when only answers changed (student autosave should not reset UI)", () => {
    const oldRow = { ...baseRow, answers: { q1: "hel" } };
    const newRow = { ...baseRow, answers: { q1: "hello" } };

    expect(isAnswersOnlyFormResponseUpdate(oldRow, newRow)).toBe(true);
  });

  it("does not skip when suspension changes", () => {
    const oldRow = { ...baseRow, suspended_at: null };
    const newRow = { ...baseRow, suspended_at: "2026-05-17T12:00:00.000Z" };

    expect(isAnswersOnlyFormResponseUpdate(oldRow, newRow)).toBe(false);
  });

  it("skips heartbeat-style updates with no meaningful field changes", () => {
    expect(isAnswersOnlyFormResponseUpdate(baseRow, { ...baseRow })).toBe(true);
  });
});
