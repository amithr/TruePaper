import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AcceptedAnswersField,
  parseAcceptedAnswers,
} from "@/components/builder/AcceptedAnswersField";
import { renderWithI18n } from "@/lib/test/render-i18n";

describe("parseAcceptedAnswers", () => {
  it("splits on commas, trims and dedupes", () => {
    expect(parseAcceptedAnswers("oxygen, O2 ,oxygen,, ")).toEqual(["oxygen", "O2"]);
  });

  it("splits on lines when present so answers may contain commas", () => {
    expect(parseAcceptedAnswers("1,000\n1000\n")).toEqual(["1,000", "1000"]);
  });
});

describe("AcceptedAnswersField", () => {
  it("keeps a typed trailing comma and only saves on blur", () => {
    const onPatch = vi.fn();
    renderWithI18n(
      <AcceptedAnswersField
        questionId="q1"
        acceptedAnswers={["oxygen"]}
        caseSensitive={false}
        onPatch={onPatch}
        label="Accepted answers"
      />,
    );
    const input = screen.getByTestId("accepted-answers-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "oxygen," } });
    expect(input.value).toBe("oxygen,");
    expect(onPatch).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "oxygen, O2" } });
    fireEvent.blur(input);
    expect(onPatch).toHaveBeenCalledWith({ acceptedAnswers: ["oxygen", "O2"] });
  });

  it("shows what will count as correct and warns when empty", () => {
    renderWithI18n(
      <AcceptedAnswersField
        questionId="q1"
        acceptedAnswers={[]}
        caseSensitive={false}
        onPatch={vi.fn()}
        label="Accepted answers"
      />,
    );
    expect(screen.getByText(/won't auto-grade/i)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("accepted-answers-input"), {
      target: { value: "7.35, 7.3" },
    });
    expect(screen.getByText(/7\.35 · 7\.3/)).toBeInTheDocument();
  });

  it("maps the Ignore capitalisation checkbox to caseSensitive", () => {
    const onPatch = vi.fn();
    renderWithI18n(
      <AcceptedAnswersField
        questionId="q1"
        acceptedAnswers={["a"]}
        caseSensitive={false}
        onPatch={onPatch}
        label="Accepted answers"
      />,
    );
    const box = screen.getByRole("checkbox", { name: /ignore capitalisation/i });
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(onPatch).toHaveBeenCalledWith({ caseSensitive: true });
  });
});
