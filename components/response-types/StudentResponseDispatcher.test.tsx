import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudentResponseDispatcher } from "@/components/response-types/StudentResponseDispatcher";
import { serializeResponseValue } from "@/lib/response-types/answers";
import { makeQuestion } from "@/lib/test/question-fixtures";
import { renderWithI18n } from "@/lib/test/render-i18n";

vi.mock("@/components/DrawingCanvas", () => ({
  DrawingCanvas: (props: { "data-testid"?: string; backgroundImageUrl?: string }) => (
    <div
      data-testid={props["data-testid"] ?? "mock-drawing-canvas"}
      data-background={props.backgroundImageUrl ?? ""}
    />
  ),
}));

describe("StudentResponseDispatcher", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  it("renders math working + final answer and serializes both on change", () => {
    const onAnswerChange = vi.fn();
    renderWithI18n(
      <StudentResponseDispatcher
        question={makeQuestion("mathInput", {
          responseConfig: { acceptedAnswers: ["2"], placeholder: "final" },
        })}
        index={0}
        answer={serializeResponseValue({ type: "mathInput", working: "1+1", answer: "" })}
        answered={false}
        examActive
        disabled={false}
        protectTextarea={false}
        showLiveFeedbackFeature={false}
        feedbackStore={{}}
        onAnswerChange={onAnswerChange}
        onChoiceChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("student-math-input")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1+1")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("student-math-final-answer"), {
      target: { value: "2" },
    });
    expect(onAnswerChange).toHaveBeenCalledWith(
      serializeResponseValue({ type: "mathInput", working: "1+1", answer: "2" }),
    );
  });

  it("moves the question image into the canvas when promptImageAsBackground is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    renderWithI18n(
      <StudentResponseDispatcher
        question={makeQuestion("drawDiagram", {
          promptImagePath: "t1/f1/q-q1.jpg",
          responseConfig: { width: 600, height: 360, promptImageAsBackground: true },
        })}
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
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("student-draw-canvas")).toHaveAttribute(
      "data-background",
      "https://example.supabase.co/storage/v1/object/public/form-assets/t1/f1/q-q1.jpg",
    );
  });

  it("keeps the question image above the canvas without the flag", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    renderWithI18n(
      <StudentResponseDispatcher
        question={makeQuestion("drawDiagram", {
          promptImagePath: "t1/f1/q-q1.jpg",
          responseConfig: { width: 600, height: 360 },
        })}
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
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.getByTestId("student-draw-canvas")).toHaveAttribute("data-background", "");
  });
});
