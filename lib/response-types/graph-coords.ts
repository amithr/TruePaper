import type { GraphConfig } from "@/lib/response-types/types";

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
