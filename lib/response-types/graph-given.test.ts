import { describe, expect, it } from "vitest";

import { resolveGraphGiven } from "@/lib/response-types/graph-coords";

describe("resolveGraphGiven", () => {
  it("returns empty sets when there is no starting graph", () => {
    expect(resolveGraphGiven({})).toEqual({ points: [], lines: [], labels: [], curves: [] });
  });

  it("keeps valid elements and drops malformed ones (AI-imported JSON)", () => {
    const given = resolveGraphGiven({
      given: {
        points: [
          { id: "g1", x: 1, y: 9 },
          { id: "g2", x: 8, y: 2 },
          { id: "bad", x: Number.NaN, y: 2 },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { id: "", x: 1, y: 1 } as any,
        ],
        lines: [
          { id: "ok", from: "g1", to: "g2" },
          { id: "dangling", from: "g1", to: "missing" },
          { id: "self", from: "g1", to: "g1" },
        ],
        labels: [
          { id: "l1", x: 8.5, y: 1.5, text: "D1" },
          { id: "blank", x: 1, y: 1, text: "  " },
        ],
      },
    });
    expect(given.points.map((p) => p.id)).toEqual(["g1", "g2"]);
    expect(given.lines.map((l) => l.id)).toEqual(["ok"]);
    expect(given.labels.map((l) => l.id)).toEqual(["l1"]);
  });

  it("keeps curves whose points all exist", () => {
    const given = resolveGraphGiven({
      given: {
        points: [
          { id: "g1", x: 1, y: 8 },
          { id: "g2", x: 4, y: 1 },
          { id: "g3", x: 7, y: 8 },
        ],
        curves: [
          { id: "mc", pointIds: ["g1", "g2", "g3"] },
          { id: "broken", pointIds: ["g1", "nope", "g3"] },
          { id: "short", pointIds: ["g1"] },
        ],
      },
    });
    expect(given.curves.map((c) => c.id)).toEqual(["mc"]);
  });
});
