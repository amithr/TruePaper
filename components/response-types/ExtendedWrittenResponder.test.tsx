import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { ExtendedWrittenResponder } from "@/components/response-types/ExtendedWrittenResponder";
import { renderWithI18n } from "@/lib/test/render-i18n";

function Harness() {
  const [value, setValue] = useState("");
  return (
    <ExtendedWrittenResponder
      id="q1"
      value={value}
      disabled={false}
      protect={false}
      config={{ minWords: 50, targetWords: 200, showCount: "words" }}
      onChange={setValue}
    />
  );
}

describe("ExtendedWrittenResponder", () => {
  it("shows word count and forwards typing", () => {
    renderWithI18n(<Harness />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "One two three" },
    });
    expect(screen.getByText(/3 words/i)).toBeInTheDocument();
    expect(screen.getByText(/minimum 50 words/i)).toBeInTheDocument();
  });
});
