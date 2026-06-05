import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShortAnswerResponder } from "@/components/response-types/ShortAnswerResponder";
import { renderWithI18n } from "@/lib/test/render-i18n";

describe("ShortAnswerResponder", () => {
  it("renders input and forwards changes", () => {
    const onChange = vi.fn();
    renderWithI18n(
      <ShortAnswerResponder
        id="q1"
        value=""
        disabled={false}
        onChange={onChange}
      />,
    );
    const input = screen.getByTestId("student-short-answer");
    fireEvent.change(input, { target: { value: "Paris" } });
    expect(onChange).toHaveBeenCalledWith("Paris");
  });

  it("submits on Enter when handler provided", () => {
    const onSubmit = vi.fn();
    renderWithI18n(
      <ShortAnswerResponder
        id="q1"
        value="done"
        disabled={false}
        onChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.keyDown(screen.getByTestId("student-short-answer"), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalled();
  });
});
