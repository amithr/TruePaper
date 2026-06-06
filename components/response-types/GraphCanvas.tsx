"use client";

import type { GraphConfig, GraphLabel, GraphLine, GraphPoint } from "@/lib/response-types/types";
import {
  formatGraphCoord,
  GRAPH_PADDING,
  mathToPixel,
  plotArea,
  resolveGraphBounds,
  resolveGraphSize,
} from "@/lib/response-types/graph-coords";

type PlaneProps = {
  config: GraphConfig;
  points: GraphPoint[];
  lines: GraphLine[];
  labels?: GraphLabel[];
  selectedPointId?: string | null;
  selectedLabelId?: string | null;
  highlightPointIds?: string[];
};

export function GraphPlane({
  config,
  points,
  lines,
  labels = [],
  selectedPointId = null,
  selectedLabelId = null,
  highlightPointIds = [],
}: PlaneProps) {
  const bounds = resolveGraphBounds(config);
  const { width, height } = resolveGraphSize(config);
  const { plotWidth, plotHeight } = plotArea(width, height);
  const showGrid = config.showGrid !== false;
  const pointById = new Map(points.map((point) => [point.id, point]));
  const highlightSet = new Set(highlightPointIds);

  const xTicks: number[] = [];
  for (let x = Math.ceil(bounds.xMin); x <= Math.floor(bounds.xMax); x += 1) {
    xTicks.push(x);
  }
  const yTicks: number[] = [];
  for (let y = Math.ceil(bounds.yMin); y <= Math.floor(bounds.yMax); y += 1) {
    yTicks.push(y);
  }

  const axisX =
    bounds.xMin <= 0 && bounds.xMax >= 0
      ? mathToPixel(0, 0, bounds, width, height).px
      : null;
  const axisY =
    bounds.yMin <= 0 && bounds.yMax >= 0
      ? mathToPixel(0, 0, bounds, width, height).py
      : null;

  return (
    <>
      <rect x={0} y={0} width={width} height={height} fill="#fff" />

      {showGrid
        ? xTicks.map((tick) => {
            const { px } = mathToPixel(tick, bounds.yMin, bounds, width, height);
            return (
              <line
                key={`grid-x-${tick}`}
                x1={px}
                y1={GRAPH_PADDING}
                x2={px}
                y2={GRAPH_PADDING + plotHeight}
                stroke="#e4e4e7"
                strokeWidth={tick === 0 ? 0 : 1}
              />
            );
          })
        : null}

      {showGrid
        ? yTicks.map((tick) => {
            const { py } = mathToPixel(bounds.xMin, tick, bounds, width, height);
            return (
              <line
                key={`grid-y-${tick}`}
                x1={GRAPH_PADDING}
                y1={py}
                x2={GRAPH_PADDING + plotWidth}
                y2={py}
                stroke="#e4e4e7"
                strokeWidth={tick === 0 ? 0 : 1}
              />
            );
          })
        : null}

      {axisX !== null ? (
        <line
          x1={axisX}
          y1={GRAPH_PADDING}
          x2={axisX}
          y2={GRAPH_PADDING + plotHeight}
          stroke="#71717a"
          strokeWidth={1.5}
        />
      ) : null}
      {axisY !== null ? (
        <line
          x1={GRAPH_PADDING}
          y1={axisY}
          x2={GRAPH_PADDING + plotWidth}
          y2={axisY}
          stroke="#71717a"
          strokeWidth={1.5}
        />
      ) : null}

      {xTicks.map((tick) => {
        const { px, py } = mathToPixel(tick, bounds.yMin, bounds, width, height);
        return (
          <text
            key={`label-x-${tick}`}
            x={px}
            y={py + 16}
            textAnchor="middle"
            fontSize={11}
            fill="#71717a"
          >
            {formatGraphCoord(tick)}
          </text>
        );
      })}
      {yTicks.map((tick) => {
        if (tick === bounds.yMin) {
          return null;
        }
        const { px, py } = mathToPixel(bounds.xMin, tick, bounds, width, height);
        return (
          <text
            key={`label-y-${tick}`}
            x={px - 8}
            y={py + 4}
            textAnchor="end"
            fontSize={11}
            fill="#71717a"
          >
            {formatGraphCoord(tick)}
          </text>
        );
      })}

      {config.xAxisLabel?.trim() ? (
        <text
          x={GRAPH_PADDING + plotWidth / 2}
          y={height - 8}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          fill="#3f3f46"
        >
          {config.xAxisLabel.trim()}
        </text>
      ) : null}
      {config.yAxisLabel?.trim() ? (
        <text
          x={14}
          y={GRAPH_PADDING + plotHeight / 2}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          fill="#3f3f46"
          transform={`rotate(-90, 14, ${GRAPH_PADDING + plotHeight / 2})`}
        >
          {config.yAxisLabel.trim()}
        </text>
      ) : null}

      {lines.map((line) => {
        const from = pointById.get(line.from);
        const to = pointById.get(line.to);
        if (!from || !to) {
          return null;
        }
        const start = mathToPixel(from.x, from.y, bounds, width, height);
        const end = mathToPixel(to.x, to.y, bounds, width, height);
        return (
          <line
            key={line.id}
            x1={start.px}
            y1={start.py}
            x2={end.px}
            y2={end.py}
            stroke="#2563eb"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        );
      })}

      {points.map((point, index) => {
        const { px, py } = mathToPixel(point.x, point.y, bounds, width, height);
        const selected = point.id === selectedPointId;
        const highlighted = highlightSet.has(point.id);
        return (
          <g key={point.id}>
            <circle
              cx={px}
              cy={py}
              r={selected || highlighted ? 8 : 6}
              fill={selected ? "#c2410c" : highlighted ? "#f97316" : "#2563eb"}
              stroke="#fff"
              strokeWidth={2}
            />
            <text
              x={px}
              y={py - 12}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="#18181b"
            >
              ({formatGraphCoord(point.x)}, {formatGraphCoord(point.y)})
            </text>
            <title>{`Point ${index + 1}`}</title>
          </g>
        );
      })}

      {labels.map((label) => {
        if (!label.text.trim()) {
          return null;
        }
        const { px, py } = mathToPixel(label.x, label.y, bounds, width, height);
        const selected = label.id === selectedLabelId;
        return (
          <text
            key={label.id}
            x={px}
            y={py}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={13}
            fontWeight={600}
            fill={selected ? "#c2410c" : "#18181b"}
            stroke="#fff"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {label.text}
          </text>
        );
      })}
    </>
  );
}

type Props = PlaneProps & {
  readOnly?: boolean;
  className?: string;
  "data-testid"?: string;
};

export function GraphCanvas({
  config,
  points,
  lines,
  labels = [],
  readOnly = false,
  selectedPointId = null,
  selectedLabelId = null,
  highlightPointIds = [],
  className = "",
  "data-testid": testId,
}: Props) {
  const { width, height } = resolveGraphSize(config);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-hidden={readOnly ? undefined : true}
      data-testid={testId}
      className={`max-w-full rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-white ${className}`}
    >
      <GraphPlane
        config={config}
        points={points}
        lines={lines}
        labels={labels}
        selectedPointId={selectedPointId}
        selectedLabelId={selectedLabelId}
        highlightPointIds={highlightPointIds}
      />
    </svg>
  );
}

export { resolveGraphSize } from "@/lib/response-types/graph-coords";
