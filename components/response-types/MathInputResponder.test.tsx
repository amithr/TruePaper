import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MathInputResponder } from "@/components/response-types/MathInputResponder";
import { renderWithI18n } from "@/lib/test/render-i18n";

describe("MathInputResponder", () => {
  it("inserts math symbols into the answer", () => {
    const onChange = vi.fn();
    renderWithI18n(
      <MathInputResponder
        id="q1"
        latex=""
        disabled={false}
        config={{ placeholder: "x = ?" }}
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId("student-math-input")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /insert.*π/i }));
    expect(onChange).toHaveBeenCalledWith("π");
  });
});
