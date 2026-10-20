import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StructuredMultiPartResponder } from "@/components/response-types/StructuredMultiPartResponder";
import { renderWithI18n } from "@/lib/test/render-i18n";

const config = {
  parts: [
    { id: "a", label: "a)", prompt: "Real GDP ____" },
    { id: "b", label: "b)", prompt: "Price level ____" },
    { id: "c", label: "c)", prompt: "Long-run ____ growth" },
  ],
};

describe("StructuredMultiPartResponder", () => {
  it("lists every part with its prompt and an answer box (no tabs)", () => {
    renderWithI18n(
      <StructuredMultiPartResponder
        questionId="q1"
        parts={{}}
        disabled={false}
        protect={false}
        config={config}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("tab")).toBeNull();
    for (const part of config.parts) {
      const row = screen.getByTestId(`structured-part-${part.id}`);
      expect(row).toHaveTextContent(part.prompt);
      const box = within(row).getByLabelText(`Answer for ${part.label}`);
      expect(box).toHaveAttribute("aria-describedby", `q1-${part.id}-prompt`);
    }
    expect(screen.getByRole("status")).toHaveTextContent("0 of 3 answered");
  });

  it("reports the edited part and marks answered parts", () => {
    const onChange = vi.fn();
    renderWithI18n(
      <StructuredMultiPartResponder
        questionId="q1"
        parts={{ a: "rises" }}
        disabled={false}
        protect={false}
        config={config}
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId("structured-part-a")).toHaveAttribute("data-answered", "true");
    expect(screen.getByTestId("structured-part-b")).not.toHaveAttribute("data-answered");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 3 answered");

    fireEvent.change(screen.getByLabelText("Answer for b)"), { target: { value: "falls" } });
    expect(onChange).toHaveBeenCalledWith({ a: "rises", b: "falls" }, "b");
  });

  it("shows every answer read-only, with 'No answer' for blanks", () => {
    renderWithI18n(
      <StructuredMultiPartResponder
        questionId="review-q1"
        parts={{ a: "rises", c: "economic" }}
        disabled
        protect={false}
        config={config}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Answer for a)")).toHaveValue("rises");
    expect(screen.getByLabelText("Answer for c)")).toHaveValue("economic");
    expect(within(screen.getByTestId("structured-part-b")).getByText(/no answer/i)).toBeInTheDocument();
  });

  it("shows teacher feedback under the part it belongs to", () => {
    renderWithI18n(
      <StructuredMultiPartResponder
        questionId="q1"
        parts={{ a: "rises" }}
        disabled={false}
        protect={false}
        config={config}
        partFeedback={{ b: "Think about aggregate supply." }}
        onChange={vi.fn()}
      />,
    );
    expect(within(screen.getByTestId("structured-part-b")).getByText("Think about aggregate supply.")).toBeInTheDocument();
  });
});
