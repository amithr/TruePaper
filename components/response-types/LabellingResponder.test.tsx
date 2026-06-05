import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LabellingResponder } from "@/components/response-types/LabellingResponder";
import { renderWithI18n } from "@/lib/test/render-i18n";

const config = {
  zones: [{ id: "z1", text: "Nucleus" }],
  terms: [
    { id: "t1", text: "Control center" },
    { id: "t2", text: "Energy factory" },
  ],
};

describe("LabellingResponder", () => {
  it("assigns terms to zones", () => {
    const onChange = vi.fn();
    renderWithI18n(
      <LabellingResponder assignments={{}} disabled={false} config={config} onChange={onChange} />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "t1" } });
    expect(onChange).toHaveBeenCalledWith({ z1: "t1" });
  });
});
