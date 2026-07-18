import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QuestionTypeBadge } from "@/components/response-types/QuestionTypeBadge";
import { renderWithI18n } from "@/lib/test/render-i18n";

describe("QuestionTypeBadge", () => {
  it("renders the localized question type label", () => {
    renderWithI18n(<QuestionTypeBadge type="mathInput" />);
    expect(screen.getByTestId("question-type-badge")).toHaveTextContent(/math/i);
  });
});
