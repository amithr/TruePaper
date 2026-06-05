import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AnnotateSourceResponder } from "@/components/response-types/AnnotateSourceResponder";
import { renderWithI18n } from "@/lib/test/render-i18n";

describe("AnnotateSourceResponder", () => {
  it("renders passage text and highlight tools", () => {
    renderWithI18n(
      <AnnotateSourceResponder
        passageId="p1"
        highlights={[]}
        disabled={false}
        config={{ passageText: "The quick brown fox." }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("The quick brown fox.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /highlight/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
