import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrderingResponder } from "@/components/response-types/OrderingResponder";
import { renderWithI18n } from "@/lib/test/render-i18n";

const config = {
  items: [
    { id: "a", text: "First" },
    { id: "b", text: "Second" },
    { id: "c", text: "Third" },
  ],
};

describe("OrderingResponder", () => {
  it("moves items down in the order list", () => {
    const onChange = vi.fn();
    renderWithI18n(
      <OrderingResponder order={["a", "b", "c"]} disabled={false} config={config} onChange={onChange} />,
    );

    const moveDownButtons = screen.getAllByRole("button", { name: /move down/i });
    fireEvent.click(moveDownButtons[0]!);

    expect(onChange).toHaveBeenCalledWith(["b", "a", "c"]);
  });
});
