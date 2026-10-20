import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MatchingResponder, matchingLetter } from "@/components/response-types/MatchingResponder";
import { renderWithI18n } from "@/lib/test/render-i18n";

const config = {
  left: [
    { id: "l1", text: "Cat" },
    { id: "l2", text: "Dog" },
    { id: "l3", text: "Cow" },
  ],
  right: [
    { id: "r1", text: "Meow" },
    { id: "r2", text: "Woof" },
    { id: "r3", text: "Moo" },
  ],
  correct: {},
};

describe("MatchingResponder", () => {
  it("matches a term by picking a lettered definition", () => {
    const onChange = vi.fn();
    renderWithI18n(
      <MatchingResponder pairs={{}} disabled={false} config={config} onChange={onChange} />,
    );

    const cat = screen.getByLabelText("Cat");
    expect(within(cat).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Choose a definition…",
      "A. Meow",
      "B. Woof",
      "C. Moo",
    ]);
    fireEvent.change(cat, { target: { value: "r2" } });
    expect(onChange).toHaveBeenCalledWith({ l1: "r2" });
    expect(screen.getByRole("status")).toHaveTextContent("0 of 3 matched");
  });

  it("shows the chosen definition and which term uses each definition", () => {
    renderWithI18n(
      <MatchingResponder pairs={{ l1: "r2" }} disabled={false} config={config} onChange={vi.fn()} />,
    );

    expect(screen.getByTestId("matching-term-l1")).toHaveTextContent("Woof");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 3 matched");
    // Dog's picker flags Woof as already matched to term 1.
    const dogOptions = within(screen.getByLabelText("Dog")).getAllByRole("option");
    expect(dogOptions[2]).toHaveTextContent("B. Woof — matched to 1");
  });

  it("moves a definition that is already used instead of duplicating it", () => {
    const onChange = vi.fn();
    renderWithI18n(
      <MatchingResponder
        pairs={{ l1: "r2", l3: "r3" }}
        disabled={false}
        config={config}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Dog"), { target: { value: "r2" } });
    expect(onChange).toHaveBeenCalledWith({ l2: "r2", l3: "r3" });
  });

  it("clears a single match", () => {
    const onChange = vi.fn();
    renderWithI18n(
      <MatchingResponder
        pairs={{ l1: "r2", l2: "r1" }}
        disabled={false}
        config={config}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear the match for Cat" }));
    expect(onChange).toHaveBeenCalledWith({ l2: "r1" });
  });

  it("is read-only when disabled", () => {
    renderWithI18n(
      <MatchingResponder pairs={{ l1: "r1" }} disabled config={config} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("Cat")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  });

  it("letters long keys past Z", () => {
    expect([0, 25, 26, 27].map(matchingLetter)).toEqual(["A", "Z", "A2", "B2"]);
  });
});
