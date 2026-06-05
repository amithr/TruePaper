import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TrueFalseResponder } from "@/components/response-types/TrueFalseResponder";
import { renderWithI18n } from "@/lib/test/render-i18n";

describe("TrueFalseResponder", () => {
  it("renders true/false choices and reports selection", () => {
    const onChange = vi.fn();
    renderWithI18n(
      <TrueFalseResponder answer={null} disabled={false} onChange={onChange} />,
    );

    const group = screen.getByTestId("student-true-false");
    expect(group).toBeInTheDocument();

    const buttons = screen.getAllByRole("radio");
    fireEvent.click(buttons[0]!);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("marks selected answer", () => {
    renderWithI18n(
      <TrueFalseResponder answer={false} disabled={false} onChange={vi.fn()} />,
    );
    const falseButton = screen.getByRole("radio", { name: /false/i });
    expect(falseButton).toHaveAttribute("aria-checked", "true");
  });
});
