import type { GraphConfig, GraphLabel, GraphLine, GraphPoint } from "@/lib/response-types/types";

export const GRAPH_PADDING = 40;

export type GraphBounds = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

export function resolveGraphBounds(config: GraphConfig): GraphBounds {
  const xMin = config.xMin ?? -5;
  const xMax = config.xMax ?? 5;
  const yMin = config.yMin ?? -5;
  const yMax = config.yMax ?? 5;
  return {
    xMin: Math.min(xMin, xMax - 1),
    xMax: Math.max(xMax, xMin + 1),
    yMin: Math.min(yMin, yMax - 1),
    yMax: Math.max(yMax, yMin + 1),
  };
}

export function resolveGraphSize(config: GraphConfig): { width: number; height: number } {
  return {
    width: Math.max(320, Math.min(640, config.width ?? 480)),
    height: Math.max(320, Math.min(640, config.height ?? 480)),
  };
}

export function plotArea(width: number, height: number): { plotWidth: number; plotHeight: number } {
  return {
    plotWidth: width - GRAPH_PADDING * 2,
    plotHeight: height - GRAPH_PADDING * 2,
  };
}

export function mathToPixel(
  x: number,
  y: number,
  bounds: GraphBounds,
  width: number,
  height: number,
): { px: number; py: number } {
  const { plotWidth, plotHeight } = plotArea(width, height);
  const px = GRAPH_PADDING + ((x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * plotWidth;
  const py =
    GRAPH_PADDING + plotHeight - ((y - bounds.yMin) / (bounds.yMax - bounds.yMin)) * plotHeight;
  return { px, py };
}

export function pixelToMath(
  px: number,
  py: number,
  bounds: GraphBounds,
  width: number,
  height: number,
): { x: number; y: number } {
  const { plotWidth, plotHeight } = plotArea(width, height);
  const x = bounds.xMin + ((px - GRAPH_PADDING) / plotWidth) * (bounds.xMax - bounds.xMin);
  const y =
    bounds.yMin +
    ((GRAPH_PADDING + plotHeight - py) / plotHeight) * (bounds.yMax - bounds.yMin);
  return { x, y };
}

export function snapGraphCoord(value: number, step = 1): number {
  return Math.round(value / step) * step;
}

export function formatGraphCoord(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export type ResolvedGraphGiven = { points: GraphPoint[]; lines: GraphLine[]; labels: GraphLabel[] };

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * The teacher's starting graph, sanitised: `given` can come from AI-imported JSON,
 * so drop points without numeric coords, lines whose ends don't exist, and empty labels.
 */
export function resolveGraphGiven(config: GraphConfig): ResolvedGraphGiven {
  const raw = config.given;
  if (!raw || typeof raw !== "object") {
    return { points: [], lines: [], labels: [] };
  }
  const points = (Array.isArray(raw.points) ? raw.points : []).filter(
    (p): p is GraphPoint =>
      Boolean(p) && typeof p.id === "string" && p.id.length > 0 && finite(p.x) && finite(p.y),
  );
  const ids = new Set(points.map((p) => p.id));
  const lines = (Array.isArray(raw.lines) ? raw.lines : []).filter(
    (l): l is GraphLine =>
      Boolean(l) && typeof l.id === "string" && ids.has(l.from) && ids.has(l.to) && l.from !== l.to,
  );
  const labels = (Array.isArray(raw.labels) ? raw.labels : []).filter(
    (l): l is GraphLabel =>
      Boolean(l) &&
      typeof l.id === "string" &&
      typeof l.text === "string" &&
      l.text.trim().length > 0 &&
      finite(l.x) &&
      finite(l.y),
  );
  return { points, lines, labels };
}

