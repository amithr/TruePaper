import { describe, expect, it } from "vitest";

import { curvePathData, curveSegments, type CubicSegment, type XY } from "@/lib/response-types/graph-curve";

function sample(start: XY, s: CubicSegment, t: number): XY {
  const u = 1 - t;
  return {
    x: u ** 3 * start.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t ** 3 * s.to.x,
    y: u ** 3 * start.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t ** 3 * s.to.y,
  };
}

function allSamples(points: XY[]): XY[] {
  const segments = curveSegments(points);
  const out: XY[] = [];
  let start = points[0];
  for (const s of segments) {
    for (let k = 0; k <= 20; k += 1) {
      out.push(sample(start, s, k / 20));
    }
    start = s.to;
  }
  return out;
}

describe("curveSegments", () => {
  it("passes exactly through every point", () => {
    const points = [
      { x: 0, y: 5 },
      { x: 2, y: 2 },
      { x: 4, y: 1 },
      { x: 7, y: 3 },
    ];
    const segments = curveSegments(points);
    expect(segments).toHaveLength(3);
    segments.forEach((s, i) => expect(s.to).toEqual(points[i + 1]));
  });

  it("rounds a U-shaped cost curve, staying close to its points", () => {
    // Two equal lowest points: the bottom should round (dip a little), not run flat.
    const points = [
      { x: 1, y: 6 },
      { x: 3, y: 4 },
      { x: 4, y: 3 },
      { x: 6, y: 3 },
      { x: 8, y: 7 },
    ];
    const samples = allSamples(points);
    const bottom = samples.filter((p) => p.x > 4.2 && p.x < 5.8);
    expect(Math.min(...bottom.map((p) => p.y))).toBeLessThan(3);
    // A small dip only — never wildly past the data.
    for (const p of samples) {
      expect(p.y).toBeGreaterThan(2.3);
      expect(p.y).toBeLessThan(7.5);
    }
  });

  it("does not overshoot a PPC-style decreasing curve (monotone in x and y)", () => {
    const points = [
      { x: 0, y: 9 },
      { x: 5, y: 7.5 },
      { x: 8, y: 4.5 },
      { x: 9.5, y: 0 },
    ];
    for (const p of allSamples(points)) {
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeLessThanOrEqual(9 + 1e-9);
    }
  });

  it("keeps an increasing curve increasing (no wobble between points)", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0.2 },
      { x: 2, y: 0.5 },
      { x: 3, y: 4 },
      { x: 4, y: 9 },
    ];
    const ys = allSamples(points).map((p) => p.y);
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1] - 1e-9);
    }
  });

  it("handles curves that turn back in x (PPC-style / loops)", () => {
    const points = [
      { x: 0, y: 8 },
      { x: 5, y: 6 },
      { x: 7, y: 2 },
      { x: 6, y: 0 },
    ];
    const segments = curveSegments(points);
    expect(segments).toHaveLength(3);
    for (const p of allSamples(points)) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });

  it("degrades gracefully for tiny inputs and repeated points", () => {
    expect(curveSegments([{ x: 1, y: 1 }])).toEqual([]);
    expect(curveSegments([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toEqual([]);
    expect(curveSegments([{ x: 0, y: 0 }, { x: 3, y: 3 }])).toHaveLength(1);
  });
});

describe("curvePathData", () => {
  it("builds an SVG path starting at the first point", () => {
    const d = curvePathData([
      { x: 10, y: 10 },
      { x: 20, y: 5 },
      { x: 30, y: 10 },
    ]);
    expect(d.startsWith("M 10 10 C")).toBe(true);
    expect(d.match(/C /g)).toHaveLength(2);
  });
});
