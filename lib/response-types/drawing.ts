/** Normalized canvas coordinates (0–1) for resolution-independent strokes. */

export type DrawingPoint = { x: number; y: number };

export type DrawingStroke = {
  id: string;
  color: string;
  width: number;
  points: DrawingPoint[];
};

export function newStrokeId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: DrawingStroke[],
  width: number,
  height: number,
): void {
  for (const stroke of strokes) {
    if (stroke.points.length < 2) {
      continue;
    }
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const first = stroke.points[0];
    ctx.moveTo(first.x * width, first.y * height);
    for (let i = 1; i < stroke.points.length; i += 1) {
      const p = stroke.points[i];
      ctx.lineTo(p.x * width, p.y * height);
    }
    ctx.stroke();
  }
}

export function strokesToSvg(
  strokes: DrawingStroke[],
  width: number,
  height: number,
): string {
  const paths = strokes
    .filter((s) => s.points.length >= 2)
    .map((stroke) => {
      const d = stroke.points
        .map((p, i) => {
          const x = (p.x * width).toFixed(1);
          const y = (p.y * height).toFixed(1);
          return `${i === 0 ? "M" : "L"}${x} ${y}`;
        })
        .join(" ");
      return `<path d="${d}" fill="none" stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${paths}</svg>`;
}
