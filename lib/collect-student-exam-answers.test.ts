import { describe, expect, it } from "vitest";

import { mergeStudentAnswersForSave } from "@/lib/collect-student-exam-answers";
import type { Question } from "@/lib/forms";

const textQuestion = (id: string): Question => ({
  id,
  prompt: "Write your answer",
  type: "text",
  options: [],
  correctAnswer: null,
  points: 1,
  displayOrder: 0,
});

function formWithTextarea(id: string, value: string): HTMLFormElement {
  const form = document.createElement("form");
  const field = document.createElement("textarea");
  field.id = id;
  field.name = id;
  field.value = value;
  form.appendChild(field);
  return form;
}

describe("mergeStudentAnswersForSave", () => {
  it("reads the full live textarea value when ref/state is empty or stale", () => {
    const form = formWithTextarea(
      "q-text",
      "This is the complete essay the student typed across many sentences.",
    );

    const merged = mergeStudentAnswersForSave(
      { "q-text": "" },
      form,
      [textQuestion("q-text")],
    );

    expect(merged["q-text"]).toBe(
      "This is the complete essay the student typed across many sentences.",
    );
  });

  it("reads the full live textarea when state still has an older partial value", () => {
    const form = formWithTextarea("q-text", "Final version after more typing");

    const merged = mergeStudentAnswersForSave(
      { "q-text": "Final" },
      form,
      [textQuestion("q-text")],
    );

    expect(merged["q-text"]).toBe("Final version after more typing");
  });

  it("merges multiple text questions from the DOM", () => {
    const form = document.createElement("form");
    const a = document.createElement("textarea");
    a.id = "q1";
    a.value = "Answer one";
    const b = document.createElement("textarea");
    b.id = "q2";
    b.value = "Answer two";
    form.append(a, b);

    const merged = mergeStudentAnswersForSave(
      { q1: "stale", q2: "" },
      form,
      [textQuestion("q1"), textQuestion("q2")],
    );

    expect(merged.q1).toBe("Answer one");
    expect(merged.q2).toBe("Answer two");
  });

  it("ignores multiple-choice questions in the DOM merge", () => {
    const form = formWithTextarea("q-text", "Text only");
    const merged = mergeStudentAnswersForSave(
      { "q-mc": "Option A", "q-text": "" },
      form,
      [textQuestion("q-text")],
    );
    expect(merged["q-mc"]).toBe("Option A");
    expect(merged["q-text"]).toBe("Text only");
  });

  it("returns base answers when form ref is missing", () => {
    const base = { "q-text": "kept" };
    expect(mergeStudentAnswersForSave(base, null, [textQuestion("q-text")])).toEqual(base);
  });
});
