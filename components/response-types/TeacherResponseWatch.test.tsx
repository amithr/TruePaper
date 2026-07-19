import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TeacherResponseWatch } from "@/components/response-types/TeacherResponseWatch";
import { serializeResponseValue } from "@/lib/response-types/answers";
import { makeQuestion } from "@/lib/test/question-fixtures";
import { renderWithI18n } from "@/lib/test/render-i18n";

describe("TeacherResponseWatch", () => {
  it("shows math working and final answer separately", () => {
    renderWithI18n(
      <TeacherResponseWatch
        question={makeQuestion("mathInput")}
        rawAnswer={serializeResponseValue({
          type: "mathInput",
          working: "12^2/(2*9.8)",
          answer: "7.35",
        })}
        feedbackStore={{}}
        liveFeedbackEnabled={false}
        feedbackFocusQuestionId={null}
        liveFeedbackDraftsByQuestionId={{}}
        liveFeedbackSavingQuestionIds={new Set()}
        onFeedbackFocus={vi.fn()}
        onFeedbackBlur={vi.fn()}
        onFeedbackChange={vi.fn()}
      />,
    );

    const block = screen.getByTestId("teacher-watch-answer");
    expect(block).toHaveTextContent("12^2/(2*9.8)");
    expect(block).toHaveTextContent("7.35");
    expect(screen.getByText(/working/i)).toBeInTheDocument();
    expect(screen.getByText(/final answer/i)).toBeInTheDocument();
    // Final answer uses the emphasis response surface.
    expect(block.querySelector(".tp-watch-response--emphasis")).toBeTruthy();
  });
});
