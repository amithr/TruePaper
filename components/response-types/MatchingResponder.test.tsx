import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MatchingResponder } from "@/components/response-types/MatchingResponder";
import { renderWithI18n } from "@/lib/test/render-i18n";

const config = {
  left: [
    { id: "l1", text: "Cat" },
    { id: "l2", text: "Dog" },
  ],
  right: [
    { id: "r1", text: "Meow" },
    { id: "r2", text: "Woof" },
  ],
};

describe("MatchingResponder", () => {
  it("pairs left and right items on tap", () => {
    const onChange = vi.fn();
    renderWithI18n(
      <MatchingResponder pairs={{}} disabled={false} config={config} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /cat/i }));
    fireEvent.click(screen.getByRole("button", { name: /woof/i }));

    expect(onChange).toHaveBeenCalledWith({ l1: "r2" });
  });
});
