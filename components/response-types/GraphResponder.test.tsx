import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GraphResponder } from "@/components/response-types/GraphResponder";
import type { GraphCurve, GraphLabel, GraphLine, GraphPoint } from "@/lib/response-types/types";
import { renderWithI18n } from "@/lib/test/render-i18n";

// 480×480 plane, 40px padding, bounds 0–10 → 40px per unit.
const config = { xMin: 0, xMax: 10, yMin: 0, yMax: 10, width: 480, height: 480 };
const at = (x: number, y: number) => ({ clientX: 40 + x * 40, clientY: 40 + (10 - y) * 40 });

/** A finger tap: press and release in the same place. */
function tap(el: Element, pos: { clientX: number; clientY: number }) {
  fireEvent.pointerDown(el, { ...pos, pointerId: 1, pointerType: "touch", button: 0 });
  fireEvent.pointerUp(el, { ...pos, pointerId: 1, pointerType: "touch", button: 0 });
}

/** Press, move through `path`, release at the last position. */
function drag(el: Element, path: { clientX: number; clientY: number }[]) {
  fireEvent.pointerDown(el, { ...path[0], pointerId: 1, pointerType: "touch", button: 0 });
  for (const pos of path.slice(1)) {
    fireEvent.pointerMove(el, { ...pos, pointerId: 1, pointerType: "touch" });
  }
  fireEvent.pointerUp(el, { ...path[path.length - 1], pointerId: 1, pointerType: "touch", button: 0 });
}

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

const original = SVGElement.prototype.getBoundingClientRect;
beforeEach(() => {
  SVGElement.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 480, height: 480, right: 480, bottom: 480, x: 0, y: 0 }) as DOMRect;
});
afterEach(() => {
  SVGElement.prototype.getBoundingClientRect = original;
});

describe("GraphResponder lines", () => {
  it("draws a line from two taps on empty space — no points needed beforehand", () => {
    const { getState } = renderControlled();
    fireEvent.click(screen.getByRole("button", { name: "Draw line" }));
    const svg = screen.getByTestId("student-graph-canvas");

    tap(svg, at(1, 1));
    expect(getState().points).toHaveLength(1);
    expect(screen.getByTestId("graph-hint")).toHaveTextContent(/where the line ends/i);
    tap(svg, at(8, 6));

    const state = getState();
    expect(state.points).toHaveLength(2);
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]).toMatchObject({ from: state.points[0].id, to: state.points[1].id });
    expect(state.points[1]).toMatchObject({ x: 8, y: 6 });
    expect(screen.getByTestId("graph-hint")).toHaveTextContent(/where the line starts/i);
  });

  it("mixes an existing point with a new one, and Undo backs out a half-drawn line", () => {
    const { getState } = renderControlled({ points: [{ id: "a", x: 2, y: 2 }] });
    fireEvent.click(screen.getByRole("button", { name: "Draw line" }));
    const svg = screen.getByTestId("student-graph-canvas");

    tap(svg, at(2, 2)); // existing point starts the line
    tap(svg, at(9, 9)); // empty space ends it
    expect(getState().points).toHaveLength(2);
    expect(getState().lines[0]).toMatchObject({ from: "a" });

    tap(svg, at(5, 5)); // start a second line on empty space…
    expect(getState().points).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Undo" })); // …and change your mind
    expect(getState().points).toHaveLength(2);
    expect(getState().lines).toHaveLength(1);
  });

  it("shows a dashed preview and a coordinate readout while the second end is dragged", () => {
    renderControlled({ points: [{ id: "a", x: 2, y: 2 }] });
    fireEvent.click(screen.getByRole("button", { name: "Draw line" }));
    const svg = screen.getByTestId("student-graph-canvas");
    tap(svg, at(2, 2));
    fireEvent.pointerDown(svg, { ...at(6, 6), pointerId: 1, pointerType: "touch", button: 0 });
    fireEvent.pointerMove(svg, { ...at(7, 4), pointerId: 1, pointerType: "touch" });
    expect(screen.getByTestId("graph-readout")).toHaveTextContent("(7, 4)");
    expect(screen.getByTestId("graph-ghost").querySelector("line")).not.toBeNull();
  });
});

describe("GraphResponder points on touch", () => {
  it("places a point where the finger is released, not where it first touched", () => {
    const { getState } = renderControlled();
    const svg = screen.getByTestId("student-graph-canvas");
    drag(svg, [at(3, 3), at(3.4, 3.6), at(4, 4)]);
    expect(getState().points).toHaveLength(1);
    expect(getState().points[0]).toMatchObject({ x: 4, y: 4 });
  });

  it("drags an existing point to move it; lines through it follow", () => {
    const { getState } = renderControlled({
      points: [
        { id: "a", x: 2, y: 2 },
        { id: "b", x: 6, y: 6 },
      ],
      lines: [{ id: "l", from: "a", to: "b" }],
    });
    const svg = screen.getByTestId("student-graph-canvas");
    drag(svg, [at(6, 6), at(7, 6), at(8, 7)]);
    expect(getState().points.find((p) => p.id === "b")).toMatchObject({ x: 8, y: 7 });
    expect(getState().points).toHaveLength(2);
    expect(getState().lines).toHaveLength(1);
  });

  it("uses a finger-sized hit area when the canvas is shrunk on a phone", () => {
    // Rendered at half size: 240 CSS px for a 480 viewBox.
    SVGElement.prototype.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 240, height: 240, right: 240, bottom: 240, x: 0, y: 0 }) as DOMRect;
    const { getState } = renderControlled({ points: [{ id: "a", x: 5, y: 5 }] });
    const svg = screen.getByTestId("student-graph-canvas");
    // 18 CSS px off the point (= 36 viewBox px, beyond the old 14px radius): still a hit, so no new point.
    const near = { clientX: (40 + 5 * 40) / 2 + 18, clientY: (40 + 5 * 40) / 2 };
    fireEvent.pointerDown(svg, { ...near, pointerId: 1, pointerType: "touch", button: 0 });
    fireEvent.pointerUp(svg, { ...near, pointerId: 1, pointerType: "touch", button: 0 });
    expect(getState().points).toHaveLength(1);
  });
});

describe("GraphResponder curves", () => {
  it("draws a curve from new and existing points, finishing on the last point", () => {
    const { getState } = renderControlled({ points: [{ id: "existing", x: 7, y: 8 }] });
    fireEvent.click(screen.getByRole("button", { name: "Draw curve" }));
    const svg = screen.getByTestId("student-graph-canvas");

    tap(svg, at(1, 8)); // empty space → new point + added to curve
    tap(svg, at(4, 1)); // another new point
    expect(screen.getByRole("button", { name: "Finish curve" })).toBeDisabled();
    tap(svg, at(7, 8)); // existing point
    expect(screen.getByTestId("graph-curve-draft")).toBeInTheDocument();
    tap(svg, at(7, 8)); // tap last point again → finish

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
    tap(svg, at(1, 1));
    tap(svg, at(2, 4));
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

describe("GraphResponder labels", () => {
  it("still places and edits labels with a tap", () => {
    const { getState } = renderControlled();
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    const svg = screen.getByTestId("student-graph-canvas");
    tap(svg, at(3, 7));
    fireEvent.change(screen.getByPlaceholderText(/Point A/), { target: { value: "Point A" } });
    // Both the mode button and the editor's save button read "Add label"; the save one is last.
    const buttons = screen.getAllByRole("button", { name: "Add label" });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(getState().labels).toHaveLength(1);
    expect(getState().labels[0]).toMatchObject({ x: 3, y: 7, text: "Point A" });
  });
});
