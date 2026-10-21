/**
 * Smooth curves through graph points, as cubic Bézier segments (shared by the SVG
 * renderer and the PDF export). The curve passes exactly through every point.
 *
 * - x and y each only increase or only decrease (growth/decay, demand, a PPC): monotone
 *   cubic interpolation (Fritsch–Carlson), so the curve never wobbles between points.
 * - otherwise (U-shaped cost curves, humps, curves that turn back): centripetal
 *   Catmull–Rom — rounded like a hand-drawn curve (a U's bottom may dip slightly between
 *   its two lowest points) and free of cusps and self-intersections.
 */

export type XY = { x: number; y: number };
export type CubicSegment = { c1: XY; c2: XY; to: XY };

function isStrictlyMonotone(values: number[]): boolean {
  let direction = 0;
  for (let i = 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta === 0) {
      return false;
    }
    const sign = Math.sign(delta);
    if (direction !== 0 && sign !== direction) {
      return false;
    }
    direction = sign;
  }
  return true;
}

function isMonotoneCurve(points: XY[]): boolean {
  return isStrictlyMonotone(points.map((p) => p.x)) && isStrictlyMonotone(points.map((p) => p.y));
}

function monotoneSegments(points: XY[]): CubicSegment[] {
  const n = points.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(points[i + 1].x - points[i].x);
    slope.push((points[i + 1].y - points[i].y) / dx[i]);
  }
  // Tangents: Fritsch–Carlson (zero at local extrema, harmonic mean elsewhere).
  const m: number[] = new Array(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    if (slope[i - 1] * slope[i] <= 0) {
      m[i] = 0;
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      m[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
    }
  }
  const segments: CubicSegment[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const h = dx[i] / 3;
    segments.push({
      c1: { x: p0.x + h, y: p0.y + m[i] * h },
      c2: { x: p1.x - h, y: p1.y - m[i + 1] * h },
      to: { x: p1.x, y: p1.y },
    });
  }
  return segments;
}

function catmullRomSegments(points: XY[]): CubicSegment[] {
  const alpha = 0.5; // centripetal
  const n = points.length;
  // Mirror the ends so the first/last segments have neighbours.
  const first = { x: 2 * points[0].x - points[1].x, y: 2 * points[0].y - points[1].y };
  const last = {
    x: 2 * points[n - 1].x - points[n - 2].x,
    y: 2 * points[n - 1].y - points[n - 2].y,
  };
  const pts = [first, ...points, last];
  const dist = (a: XY, b: XY) => Math.max(1e-6, Math.hypot(b.x - a.x, b.y - a.y) ** alpha);

  const segments: CubicSegment[] = [];
  for (let i = 1; i < pts.length - 2; i += 1) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];
    const d1 = dist(p0, p1);
    const d2 = dist(p1, p2);
    const d3 = dist(p2, p3);
    // Barry–Goldman tangents for non-uniform parameterisation, converted to Bézier.
    const t1 = {
      x: (p1.x - p0.x) / d1 - (p2.x - p0.x) / (d1 + d2) + (p2.x - p1.x) / d2,
      y: (p1.y - p0.y) / d1 - (p2.y - p0.y) / (d1 + d2) + (p2.y - p1.y) / d2,
    };
    const t2 = {
      x: (p2.x - p1.x) / d2 - (p3.x - p1.x) / (d2 + d3) + (p3.x - p2.x) / d3,
      y: (p2.y - p1.y) / d2 - (p3.y - p1.y) / (d2 + d3) + (p3.y - p2.y) / d3,
    };
    segments.push({
      c1: { x: p1.x + (t1.x * d2) / 3, y: p1.y + (t1.y * d2) / 3 },
      c2: { x: p2.x - (t2.x * d2) / 3, y: p2.y - (t2.y * d2) / 3 },
      to: { x: p2.x, y: p2.y },
    });
  }
  return segments;
}

/** Bézier segments through `points` (in any coordinate space). Needs at least 2 points. */
export function curveSegments(points: XY[]): CubicSegment[] {
  const cleaned = points.filter(
    (p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y,
  );
  if (cleaned.length < 2) {
    return [];
  }
  if (cleaned.length === 2) {
    const [a, b] = cleaned;
    return [{ c1: a, c2: b, to: b }];
  }
  return isMonotoneCurve(cleaned) ? monotoneSegments(cleaned) : catmullRomSegments(cleaned);
}

/** SVG path data for a curve through `points`. */
export function curvePathData(points: XY[]): string {
  const segments = curveSegments(points);
  if (segments.length === 0) {
    return "";
  }
  const f = (n: number) => Math.round(n * 100) / 100;
  const start = points[0];
  return [
    `M ${f(start.x)} ${f(start.y)}`,
    ...segments.map(
      (s) => `C ${f(s.c1.x)} ${f(s.c1.y)} ${f(s.c2.x)} ${f(s.c2.y)} ${f(s.to.x)} ${f(s.to.y)}`,
    ),
  ].join(" ");
}
