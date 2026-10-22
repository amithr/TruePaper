import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WatchScoreStepper } from "@/components/watch/WatchScoreStepper";
import { renderWithI18n } from "@/lib/test/render-i18n";

describe("WatchScoreStepper", () => {
  it("lets the teacher type a score and commits it on Enter", () => {
    const onChange = vi.fn();
    renderWithI18n(<WatchScoreStepper score={null} max={10} onChange={onChange} />);
    const input = screen.getByTestId("watch-score-input");
    fireEvent.change(input, { target: { value: "7" } });
    expect(onChange).not.toHaveBeenCalled(); // local until commit
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("clamps typed scores to 0..max and rounds", () => {
    const onChange = vi.fn();
    renderWithI18n(<WatchScoreStepper score={3} max={10} onChange={onChange} />);
    const input = screen.getByTestId("watch-score-input");
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(10);
    fireEvent.change(input, { target: { value: "4.6" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(5);
  });

  it("restores the saved score when the field is cleared or escaped", () => {
    const onChange = vi.fn();
    renderWithI18n(<WatchScoreStepper score={6} max={10} onChange={onChange} />);
    const input = screen.getByTestId("watch-score-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("6");
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("6");
  });

  it("keeps − / + / Full marks working", () => {
    const onChange = vi.fn();
    renderWithI18n(<WatchScoreStepper score={6} max={10} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /increase score/i }));
    expect(onChange).toHaveBeenLastCalledWith(7);
    fireEvent.click(screen.getByRole("button", { name: /full marks/i }));
    expect(onChange).toHaveBeenLastCalledWith(10);
  });
});
