import { describe, expect, it } from "vitest";

import { formToSnapshot, questionToSnapshot } from "@/lib/library/snapshots";
import type { Form } from "@/lib/forms";

describe("formToSnapshot", () => {
  it("captures questions with response config for deep clone", () => {
    const form: Form = {
      id: "f1",
      title: "Algebra quiz",
      description: "Unit 3",
      createdBy: "u1",
      liveTeacherFeedbackEnabled: true,
      questions: [
        {
          id: "q1",
          prompt: "Solve x",
          type: "mathInput",
          options: [],
          correctAnswer: null,
          points: 2,
          displayOrder: 0,
          responseConfig: { placeholder: "x = ?" },
        },
      ],
    };
    const snap = formToSnapshot(form);
    expect(snap.title).toBe("Algebra quiz");
    expect(snap.questions).toHaveLength(1);
    expect(snap.questions[0].type).toBe("mathInput");
    expect(snap.questions[0].responseConfig).toEqual({ placeholder: "x = ?" });
  });
});

describe("questionToSnapshot", () => {
  it("preserves display order", () => {
    const snap = questionToSnapshot(
      {
        id: "q1",
        prompt: "TF",
        type: "trueFalse",
        options: [],
        correctAnswer: null,
        points: 1,
        displayOrder: 3,
        responseConfig: { correctAnswer: true },
      },
      0,
    );
    expect(snap.displayOrder).toBe(3);
  });
});
