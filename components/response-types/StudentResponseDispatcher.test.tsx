import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudentResponseDispatcher } from "@/components/response-types/StudentResponseDispatcher";
import { makeQuestion } from "@/lib/test/question-fixtures";
import { renderWithI18n } from "@/lib/test/render-i18n";

describe("StudentResponseDispatcher", () => {
  it("renders true/false responder for trueFalse questions", () => {
    renderWithI18n(
      <StudentResponseDispatcher
        question={makeQuestion("trueFalse")}
        index={0}
        answer={undefined}
        answered={false}
        examActive
        disabled={false}
        protectTextarea={false}
        showLiveFeedbackFeature={false}
        feedbackStore={{}}
        onAnswerChange={vi.fn()}
        onChoiceChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("student-true-false")).toBeInTheDocument();
  });

  it("renders short answer input for shortAnswer questions", () => {
    renderWithI18n(
      <StudentResponseDispatcher
        question={makeQuestion("shortAnswer")}
        index={0}
        answer={undefined}
        answered={false}
        examActive
        disabled={false}
        protectTextarea={false}
        showLiveFeedbackFeature={false}
        feedbackStore={{}}
        onAnswerChange={vi.fn()}
        onChoiceChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("student-short-answer")).toBeInTheDocument();
  });

  it("renders annotate source passage and tools for empty answers", () => {
    renderWithI18n(
      <StudentResponseDispatcher
        question={makeQuestion("annotateSource")}
        index={0}
        answer={undefined}
        answered={false}
        examActive
        disabled={false}
        protectTextarea={false}
        showLiveFeedbackFeature={false}
        feedbackStore={{}}
        onAnswerChange={vi.fn()}
        onChoiceChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /highlight/i })).toBeInTheDocument();
    expect(
      screen.getByText(/Paste the source passage here/i),
    ).toBeInTheDocument();
  });
});
