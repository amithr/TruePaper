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

  it("disables the canvas background toggle until a question image exists", () => {
    renderWithI18n(
      <BuilderResponseConfig
        question={makeQuestion("drawDiagram", { id: "q-draw" })}
        updateActiveForm={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("checkbox", {
      name: /use question image as canvas background/i,
    });
    expect(toggle).toBeDisabled();
    expect(screen.getByText(/add an image to this question first/i)).toBeInTheDocument();
  });

  it("patches promptImageAsBackground when the question has an image", () => {
    const question = makeQuestion("drawDiagram", {
      id: "q-draw",
      promptImagePath: "t1/f1/q-q-draw.jpg",
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

    const toggle = screen.getByRole("checkbox", {
      name: /use question image as canvas background/i,
    });
    expect(toggle).toBeEnabled();
    fireEvent.click(toggle);

    const next = updateActiveForm.mock.results.at(-1)?.value as Form;
    expect(next.questions[0].responseConfig).toMatchObject({
      promptImageAsBackground: true,
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

  it("edits the graph's starting elements with the student tools", () => {
    const question = makeQuestion("graph", {
      id: "q-graph",
      responseConfig: {
        xMin: 0,
        xMax: 10,
        yMin: 0,
        yMax: 10,
        given: {
          points: [
            { id: "g1", x: 1, y: 9 },
            { id: "g2", x: 8, y: 2 },
          ],
          lines: [{ id: "gd", from: "g1", to: "g2" }],
          labels: [{ id: "gl", x: 8.6, y: 1.6, text: "D1" }],
        },
      },
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

    expect(screen.getByText(/Starting graph/i)).toBeInTheDocument();
    // In the editor the given elements are the editable layer (blue), not a grey overlay.
    const editor = screen.getByTestId("student-graph-canvas");
    expect(editor.querySelectorAll("[data-testid=graph-given] line")).toHaveLength(0);
    expect(editor.querySelectorAll("line[stroke='#2563eb']")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    const next = updateActiveForm.mock.results.at(-1)?.value as Form;
    expect(next.questions[0].responseConfig).toMatchObject({
      given: { points: [], lines: [], labels: [] },
    });
  });
});
