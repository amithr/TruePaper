import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MathInputResponder } from "@/components/response-types/MathInputResponder";
import { renderWithI18n } from "@/lib/test/render-i18n";

describe("MathInputResponder", () => {
  it("inserts math symbols into the working area", () => {
    const onChange = vi.fn();
    renderWithI18n(
      <MathInputResponder
        id="q1"
        working=""
        answer=""
        disabled={false}
        config={{ placeholder: "x = ?", acceptedAnswers: ["2"] }}
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId("student-math-input")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /insert.*π/i }));
    expect(onChange).toHaveBeenCalledWith({ working: "π", answer: "" });
  });

  it("updates the final answer field independently", () => {
    const onChange = vi.fn();
    renderWithI18n(
      <MathInputResponder
        id="q1"
        working="1+1"
        answer=""
        disabled={false}
        config={{ acceptedAnswers: ["2"] }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId("student-math-final-answer"), {
      target: { value: "2" },
    });
    expect(onChange).toHaveBeenCalledWith({ working: "1+1", answer: "2" });
  });

  it("updates working without clearing the final answer", () => {
    const onChange = vi.fn();
    renderWithI18n(
      <MathInputResponder
        id="q1"
        working=""
        answer="2"
        disabled={false}
        config={{ acceptedAnswers: ["2"] }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/working/i), {
      target: { value: "1+1" },
    });
    expect(onChange).toHaveBeenCalledWith({ working: "1+1", answer: "2" });
  });
});
