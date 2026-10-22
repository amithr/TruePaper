import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  addHighlight,
  AnnotateSourceResponder,
} from "@/components/response-types/AnnotateSourceResponder";
import type { HighlightSpan } from "@/lib/response-types/types";
import { renderWithI18n } from "@/lib/test/render-i18n";

const PASSAGE = "The Houthis seized the port of Mokha.\n\nOfficials spoke anonymously.";

/** Select `text` inside the passage the way a student would, then notify listeners. */
function selectInPassage(text: string) {
  const passage = document.getElementById("p1")!;
  const walker = document.createTreeWalker(passage, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node && !(node.textContent ?? "").includes(text)) {
    node = walker.nextNode();
  }
  if (!node) throw new Error(`"${text}" not found in passage`);
  const offset = (node.textContent ?? "").indexOf(text);
  const range = document.createRange();
  range.setStart(node, offset);
  range.setEnd(node, offset + text.length);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });
}

function renderResponder(highlights: HighlightSpan[] = [], onChange = vi.fn(), disabled = false) {
  renderWithI18n(
    <AnnotateSourceResponder
      passageId="p1"
      highlights={highlights}
      disabled={disabled}
      config={{ passageText: PASSAGE }}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("AnnotateSourceResponder", () => {
  it("keeps paragraphs and explains how to annotate", () => {
    renderResponder();
    expect(document.getElementById("p1")).toHaveTextContent(/seized the port of Mokha/);
    expect(screen.getByText(/select words in the passage/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /highlight selection/i })).toBeDisabled();
  });

  it("highlights the selected words with the right character offsets", () => {
    const onChange = renderResponder();
    selectInPassage("port of Mokha");
    const button = screen.getByRole("button", { name: /highlight selection/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    const start = PASSAGE.indexOf("port of Mokha");
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ start, end: start + "port of Mokha".length }),
    ]);
  });

  it("selection offsets stay correct after earlier highlights with notes", () => {
    const first = PASSAGE.indexOf("Houthis");
    const onChange = renderResponder([
      { id: "h1", start: first, end: first + "Houthis".length, note: "Who?" },
    ]);
    // The note number is drawn with CSS, so the passage text is unchanged.
    expect(document.getElementById("p1")!.textContent).toBe(PASSAGE);
    expect(screen.getByTestId("annotate-highlight")).toHaveAttribute("data-note", "1");

    selectInPassage("Officials");
    fireEvent.click(screen.getByRole("button", { name: /highlight selection/i }));
    const start = PASSAGE.indexOf("Officials");
    const next = onChange.mock.calls[0][0] as HighlightSpan[];
    expect(next.find((h) => h.start === start)?.end).toBe(start + "Officials".length);
  });

  it("opens a highlight to add a note or remove it", () => {
    const start = PASSAGE.indexOf("Mokha");
    const onChange = renderResponder([{ id: "h1", start, end: start + 5 }]);

    fireEvent.click(screen.getByTestId("annotate-highlight"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Strategic port  " } });
    fireEvent.click(screen.getByRole("button", { name: /save note/i }));
    expect(onChange).toHaveBeenLastCalledWith([{ id: "h1", start, end: start + 5, note: "Strategic port" }]);

    fireEvent.click(screen.getByTestId("annotate-highlight"));
    fireEvent.click(screen.getByRole("button", { name: /remove highlight/i }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("highlights are keyboard reachable", () => {
    const start = PASSAGE.indexOf("Mokha");
    renderResponder([{ id: "h1", start, end: start + 5 }]);
    const mark = screen.getByTestId("annotate-highlight");
    expect(mark).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(mark, { key: "Enter" });
    expect(screen.getByTestId("annotate-note-editor")).toBeInTheDocument();
  });

  it("is read-only when disabled", () => {
    const start = PASSAGE.indexOf("Mokha");
    renderResponder([{ id: "h1", start, end: start + 5, note: "Port" }], vi.fn(), true);
    expect(screen.queryByRole("button", { name: /highlight selection/i })).toBeNull();
    expect(screen.getByTestId("annotate-highlight")).not.toHaveAttribute("role");
    expect(screen.getByTestId("annotate-notes")).toHaveTextContent("Port");
  });
});

describe("addHighlight", () => {
  const text = "alpha beta gamma delta";

  it("trims surrounding spaces from a selection", () => {
    const [h] = addHighlight([], { start: 5, end: 11 }, text); // " beta "
    expect(text.slice(h.start, h.end)).toBe("beta");
  });

  it("merges overlapping highlights and keeps their notes", () => {
    const existing: HighlightSpan[] = [
      { id: "a", start: 0, end: 5, note: "first" },
      { id: "b", start: 11, end: 16, note: "third" },
    ];
    const next = addHighlight(existing, { start: 3, end: 13 }, text);
    expect(next).toHaveLength(1);
    expect(text.slice(next[0].start, next[0].end)).toBe("alpha beta gamma");
    expect(next[0].note).toBe("first · third");
  });

  it("ignores whitespace-only selections", () => {
    expect(addHighlight([], { start: 5, end: 6 }, text)).toEqual([]);
  });
});
