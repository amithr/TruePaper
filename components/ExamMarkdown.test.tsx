import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExamMarkdown } from "@/components/ExamMarkdown";

describe("ExamMarkdown", () => {
  it("renders bold, lists, and paragraphs from Markdown", () => {
    render(
      <ExamMarkdown>
        {"A ball moves at **12 m/s**.\n\n**Calculate** the height.\n\n- Take `g = 9.8`\n- Show working"}
      </ExamMarkdown>,
    );

    expect(screen.getByText("12 m/s", { exact: false }).tagName).toBe("STRONG");
    expect(screen.getByText("Calculate").tagName).toBe("STRONG");
    expect(screen.getByText(/Take/)).toBeInTheDocument();
    expect(screen.getByText("g = 9.8").tagName).toBe("CODE");
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("returns nothing for blank input", () => {
    const { container } = render(<ExamMarkdown>{"   "}</ExamMarkdown>);
    expect(container).toBeEmptyDOMElement();
  });
});
