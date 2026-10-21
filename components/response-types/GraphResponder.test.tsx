import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GraphResponder } from "@/components/response-types/GraphResponder";
import type { GraphCurve, GraphLabel, GraphLine, GraphPoint } from "@/lib/response-types/types";
import { renderWithI18n } from "@/lib/test/render-i18n";

// 480×480 plane, 40px padding, bounds 0–10 → 40px per unit.
const config = { xMin: 0, xMax: 10, yMin: 0, yMax: 10, width: 480, height: 480 };
const at = (x: number, y: number) => ({ clientX: 40 + x * 40, clientY: 40 + (10 - y) * 40 });

type State = { points: GraphPoint[]; lines: GraphLine[]; labels: GraphLabel[]; curves: GraphCurve[] };

/** Controlled harness so each onChange re-renders with the new answer, like the exam does. */
function renderControlled(initial: Partial<State> = {}) {
  let state: State = { points: [], lines: [], labels: [], curves: [], ...initial };
  const onChange = vi.fn();
  const view = renderWithI18n(<div />);
  const rerender = () =>
    view.rerender(
      <GraphResponder
        {...state}
        disabled={false}
        config={config}
        onChange={(points, lines, labels, curves) => {
          state = { points, lines, labels, curves };
          onChange(state);
          rerender();
        }}
      />,
    );
  rerender();
  return { getState: () => state, onChange };
}

describe("GraphResponder curves", () => {
  const original = SVGElement.prototype.getBoundingClientRect;
  beforeEach(() => {
    SVGElement.prototype.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 480, height: 480, right: 480, bottom: 480, x: 0, y: 0 }) as DOMRect;
  });
  afterEach(() => {
    SVGElement.prototype.getBoundingClientRect = original;
  });

  it("draws a curve from new and existing points, finishing on the last point", () => {
    const { getState } = renderControlled({ points: [{ id: "existing", x: 7, y: 8 }] });
    fireEvent.click(screen.getByRole("button", { name: "Draw curve" }));
    const svg = screen.getByTestId("student-graph-canvas");

    fireEvent.click(svg, at(1, 8)); // empty space → new point + added to curve
    fireEvent.click(svg, at(4, 1)); // another new point
    expect(screen.getByRole("button", { name: "Finish curve" })).toBeDisabled();
    fireEvent.click(svg, at(7, 8)); // existing point
    expect(screen.getByTestId("graph-curve-draft")).toBeInTheDocument();
    fireEvent.click(svg, at(7, 8)); // tap last point again → finish

    const state = getState();
    expect(state.points).toHaveLength(3);
    expect(state.curves).toHaveLength(1);
    expect(state.curves[0].pointIds).toHaveLength(3);
    expect(state.curves[0].pointIds[2]).toBe("existing");
    expect(screen.queryByTestId("graph-curve-draft")).toBeNull();
    expect(screen.getByTestId("graph-curve")).toBeInTheDocument();
  });

  it("Cancel drops points the unfinished curve created", () => {
    const { getState } = renderControlled();
    fireEvent.click(screen.getByRole("button", { name: "Draw curve" }));
    const svg = screen.getByTestId("student-graph-canvas");
    fireEvent.click(svg, at(1, 1));
    fireEvent.click(svg, at(2, 4));
    expect(getState().points).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(getState().points).toHaveLength(0);
    expect(getState().curves).toHaveLength(0);
  });

  it("Undo removes the last curve, and removing a point drops curves through it", () => {
    const points = [
      { id: "a", x: 1, y: 8 },
      { id: "b", x: 4, y: 1 },
      { id: "c", x: 7, y: 8 },
    ];
    const { getState } = renderControlled({
      points,
      curves: [{ id: "mc", pointIds: ["a", "b", "c"] }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(getState().curves).toHaveLength(0);
    expect(getState().points).toHaveLength(3);
  });
});
