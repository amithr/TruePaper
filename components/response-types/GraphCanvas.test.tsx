import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GraphCanvas } from "@/components/response-types/GraphCanvas";

const config = {
  xMin: 0,
  xMax: 10,
  yMin: 0,
  yMax: 10,
  given: {
    points: [
      { id: "g1", x: 1, y: 9 },
      { id: "g2", x: 8, y: 2 },
    ],
    lines: [{ id: "gd", from: "g1", to: "g2" }],
    labels: [{ id: "gl", x: 8.6, y: 1.6, text: "D1" }],
  },
};

describe("GraphCanvas starting graph", () => {
  it("draws the teacher's given elements under the student's work", () => {
    render(
      <GraphCanvas
        config={config}
        points={[{ id: "p1", x: 3, y: 9 }]}
        // Student line ending on a given point.
        lines={[{ id: "l1", from: "p1", to: "g2" }]}
        labels={[]}
        data-testid="graph"
      />,
    );
    const given = screen.getByTestId("graph-given");
    expect(given.querySelectorAll("line")).toHaveLength(1);
    expect(within(given as unknown as HTMLElement).getByText("D1")).toBeInTheDocument();
    // 1 given line + 1 student line (resolved against the given point).
    expect(screen.getByTestId("graph").querySelectorAll("line[stroke='#2563eb']")).toHaveLength(1);
  });

  it("draws student and given curves as smooth paths", () => {
    render(
      <GraphCanvas
        config={{
          ...config,
          given: { ...config.given, curves: [{ id: "gc", pointIds: ["g1", "g2", "g1"] }] },
        }}
        points={[
          { id: "a", x: 1, y: 8 },
          { id: "b", x: 4, y: 1 },
          { id: "c", x: 7, y: 8 },
        ]}
        lines={[]}
        labels={[]}
        curves={[{ id: "mc", pointIds: ["a", "b", "c"] }]}
      />,
    );
    const curve = screen.getByTestId("graph-curve");
    expect(curve.getAttribute("d")).toMatch(/^M [\d.]+ [\d.]+ C /);
    expect(screen.getByTestId("graph-given").querySelectorAll("path")).toHaveLength(1);
  });
});
