import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AnnotatePassageField } from "@/components/builder/AnnotatePassageField";
import type { Form, Question } from "@/lib/forms";
import { annotatePassageText } from "@/lib/response-types/registry";
import { makeQuestion } from "@/lib/test/question-fixtures";
import { renderWithI18n } from "@/lib/test/render-i18n";

const ARTICLE =
  "The Houthis have previously attacked ships in the Red Sea from Yemeni territory further north, but control of Mokha gives the militia a foothold closer to the strait, with implications for global trade.";

function setup(question: Question) {
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
    <AnnotatePassageField
      question={question}
      updateActiveForm={updateActiveForm}
      pasteMoved={false}
      onUndoPasteMove={vi.fn()}
    />,
  );
  const latest = () => (updateActiveForm.mock.results.at(-1)?.value as Form).questions[0];
  return { latest };
}

describe("AnnotatePassageField", () => {
  it("is always visible and saves the passage students will annotate", () => {
    const { latest } = setup(makeQuestion("annotateSource", { id: "q1", prompt: "Annotate the source" }));
    expect(screen.getByText(/add the source passage here/i)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("builder-annotate-passage"), { target: { value: ARTICLE } });
    expect(annotatePassageText(latest().responseConfig)).toBe(ARTICLE);
  });

  it("offers to move an article that was put in the question text", () => {
    const { latest } = setup(makeQuestion("annotateSource", { id: "q1", prompt: ARTICLE }));
    fireEvent.click(screen.getByRole("button", { name: /move it to the source passage/i }));
    expect(annotatePassageText(latest().responseConfig)).toBe(ARTICLE);
    expect(latest().prompt).toBe("Highlight and annotate the source below.");
  });
});
