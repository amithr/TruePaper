import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BuilderResponseConfig } from "@/components/response-types/BuilderResponseConfig";
import type { Form } from "@/lib/forms";
import { makeQuestion } from "@/lib/test/question-fixtures";
import { renderWithI18n } from "@/lib/test/render-i18n";

describe("BuilderResponseConfig", () => {
  it("edits math accepted answers and placeholder", () => {
    const question = makeQuestion("mathInput", {
      id: "q-math",
      responseConfig: { acceptedAnswers: ["7.35"], placeholder: "e.g. 7.35" },
    });
    const form: Form = {
      id: "f1",
      title: "Quiz",
      description: "",
      descriptionImagePath: null,
      createdBy: "t1",
      liveTeacherFeedbackEnabled: false,
      questions: [question],
    };
    const updateActiveForm = vi.fn((updater: (f: Form) => Form) => updater(form));

    renderWithI18n(
      <BuilderResponseConfig question={question} updateActiveForm={updateActiveForm} />,
    );

    const accepted = screen.getByPlaceholderText(/comma separated/i);
    fireEvent.change(accepted, { target: { value: "7.35, 7.3, 7.347" } });

    expect(updateActiveForm).toHaveBeenCalled();
    const next = updateActiveForm.mock.results.at(-1)?.value as Form;
    expect(next.questions[0].responseConfig).toMatchObject({
      acceptedAnswers: ["7.35", "7.3", "7.347"],
    });
  });

  it("returns null for types without builder config UI", () => {
    const { container } = renderWithI18n(
      <BuilderResponseConfig
        question={makeQuestion("shortAnswer")}
        updateActiveForm={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
