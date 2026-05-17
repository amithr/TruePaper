import { describe, expect, it } from "vitest";

import {
  resolveExamAnswersWhenServerLoads,
  shouldApplyServerAnswersOnLoad,
} from "@/lib/student-exam-answer-hydration";

describe("shouldApplyServerAnswersOnLoad", () => {
  it("applies server answers only on first load without local edits", () => {
    expect(shouldApplyServerAnswersOnLoad(true, false)).toBe(true);
    expect(shouldApplyServerAnswersOnLoad(true, true)).toBe(false);
    expect(shouldApplyServerAnswersOnLoad(false, false)).toBe(false);
    expect(shouldApplyServerAnswersOnLoad(false, true)).toBe(false);
  });
});

describe("resolveExamAnswersWhenServerLoads", () => {
  it("keeps in-progress typing when a late server payload is empty (autosave race)", () => {
    const current = { "q1": "Full paragraph the student is still writing" };
    const server = { "q1": "" };

    const resolved = resolveExamAnswersWhenServerLoads({
      isFirstLoadForKey: false,
      hasLocalEdits: true,
      currentAnswers: current,
      serverAnswers: server,
    });

    expect(resolved).toEqual(current);
  });

  it("does not overwrite after first load even without dirty flag if not first load", () => {
    const current = { "q1": "Student text" };
    const server = { "q1": "Older saved copy" };

    const resolved = resolveExamAnswersWhenServerLoads({
      isFirstLoadForKey: false,
      hasLocalEdits: false,
      currentAnswers: current,
      serverAnswers: server,
    });

    expect(resolved).toEqual(current);
  });

  it("hydrates from server on first load when the student has not typed yet", () => {
    const resolved = resolveExamAnswersWhenServerLoads({
      isFirstLoadForKey: true,
      hasLocalEdits: false,
      currentAnswers: {},
      serverAnswers: { "q1": "Previously saved answer" },
    });

    expect(resolved).toEqual({ "q1": "Previously saved answer" });
  });

  it("preserves local typing on first load if the student started before hydration finished", () => {
    const resolved = resolveExamAnswersWhenServerLoads({
      isFirstLoadForKey: true,
      hasLocalEdits: true,
      currentAnswers: { "q1": "Already typing before load returned" },
      serverAnswers: { "q1": "" },
    });

    expect(resolved).toEqual({ "q1": "Already typing before load returned" });
  });
});
