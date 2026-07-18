import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TeacherQuestionHeader } from "@/components/response-types/TeacherQuestionHeader";
import { renderWithI18n } from "@/lib/test/render-i18n";

describe("TeacherQuestionHeader", () => {
  it("shows number and type badge on one row with optional title", () => {
    renderWithI18n(
      <TeacherQuestionHeader
        index={2}
        type="mathInput"
        title="Calculate the height"
        trailing={<span data-testid="trail">Auto</span>}
      />,
    );

    expect(screen.getByTestId("teacher-question-header")).toBeInTheDocument();
    expect(screen.getByTestId("teacher-question-number")).toHaveTextContent("3");
    expect(screen.getByTestId("question-type-badge")).toHaveTextContent(/math/i);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Calculate the height");
    expect(screen.getByTestId("trail")).toHaveTextContent("Auto");
  });
});
