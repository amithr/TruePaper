"use client";

import { useCallback, useRef, useState } from "react";
import { GraphPlane, resolveGraphSize } from "@/components/response-types/GraphCanvas";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import {
  mathToPixel,
  pixelToMath,
  resolveGraphBounds,
  snapGraphCoord,
} from "@/lib/response-types/graph-coords";
import type { GraphConfig, GraphLine, GraphPoint } from "@/lib/response-types/types";

type GraphMode = "point" | "line";

type Props = {
  points: GraphPoint[];
  lines: GraphLine[];
  disabled: boolean;
  config: GraphConfig;
  onChange: (points: GraphPoint[], lines: GraphLine[]) => void;
};

function newPointId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newLineId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `l-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const HIT_RADIUS = 14;

export function GraphResponder({ points, lines, disabled, config, onChange }: Props) {
  const t = useTranslations();
  const bounds = resolveGraphBounds(config);
  const { width, height } = resolveGraphSize(config);
  const svgRef = useRef<SVGSVGElement>(null);
  const [mode, setMode] = useState<GraphMode>("point");
  const [lineStartId, setLineStartId] = useState<string | null>(null);

  const findPointAt = useCallback(
    (clientX: number, clientY: number): GraphPoint | null => {
      const svg = svgRef.current;
      if (!svg) {
        return null;
      }
      const rect = svg.getBoundingClientRect();
      const scaleX = width / rect.width;
      const scaleY = height / rect.height;
      const px = (clientX - rect.left) * scaleX;
      const py = (clientY - rect.top) * scaleY;
      for (const point of points) {
        const { px: pointPx, py: pointPy } = mathToPixel(point.x, point.y, bounds, width, height);
        if (Math.hypot(px - pointPx, py - pointPy) <= HIT_RADIUS) {
          return point;
        }
      }
      return null;
    },
    [bounds, height, points, width],
  );

  const addPoint = (x: number, y: number) => {
    const snapped = {
      x: snapGraphCoord(Math.min(bounds.xMax, Math.max(bounds.xMin, x))),
      y: snapGraphCoord(Math.min(bounds.yMax, Math.max(bounds.yMin, y))),
    };
    onChange([...points, { id: newPointId(), ...snapped }], lines);
  };

  const addLine = (fromId: string, toId: string) => {
    if (fromId === toId) {
      return;
    }
    const exists = lines.some(
      (line) =>
        (line.from === fromId && line.to === toId) || (line.from === toId && line.to === fromId),
    );
    if (exists) {
      return;
    }
    onChange(points, [...lines, { id: newLineId(), from: fromId, to: toId }]);
  };

  const handlePlaneClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (disabled) {
      return;
    }
    const hit = findPointAt(event.clientX, event.clientY);
    if (mode === "line") {
      if (hit) {
        if (!lineStartId) {
          setLineStartId(hit.id);
          return;
        }
        addLine(lineStartId, hit.id);
        setLineStartId(null);
      }
      return;
    }
    if (hit) {
      return;
    }
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const rect = svg.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const px = (event.clientX - rect.left) * scaleX;
    const py = (event.clientY - rect.top) * scaleY;
    const { x, y } = pixelToMath(px, py, bounds, width, height);
    addPoint(x, y);
  };

  const handleUndo = () => {
    if (lines.length > 0) {
      onChange(points, lines.slice(0, -1));
      return;
    }
    if (points.length > 0) {
      const removed = points[points.length - 1];
      onChange(
        points.slice(0, -1),
        lines.filter((line) => line.from !== removed.id && line.to !== removed.id),
      );
    }
    setLineStartId(null);
  };

  const handleClear = () => {
    onChange([], []);
    setLineStartId(null);
  };

  const handleModeChange = (next: GraphMode) => {
    setMode(next);
    setLineStartId(null);
  };

  return (
    <div className="space-y-2" data-testid="student-graph-responder">
      {!disabled ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={mode === "point" ? "tp-btn-primary text-sm" : "tp-btn-secondary text-sm"}
            onClick={() => handleModeChange("point")}
          >
            {t("responseTypes.graph.pointMode")}
          </button>
          <button
            type="button"
            className={mode === "line" ? "tp-btn-primary text-sm" : "tp-btn-secondary text-sm"}
            onClick={() => handleModeChange("line")}
          >
            {t("responseTypes.graph.lineMode")}
          </button>
          <button type="button" className="tp-btn-secondary text-sm" onClick={handleUndo}>
            {t("responseTypes.graph.undo")}
          </button>
          <button type="button" className="tp-btn-secondary text-sm" onClick={handleClear}>
            {t("responseTypes.graph.clear")}
          </button>
        </div>
      ) : null}
      {!disabled ? (
        <p className="text-xs text-[var(--tp-text-secondary)]">
          {mode === "point"
            ? t("responseTypes.graph.pointHint")
            : lineStartId
              ? t("responseTypes.graph.lineHintSecond")
              : t("responseTypes.graph.lineHintFirst")}
        </p>
      ) : null}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={`max-w-full touch-none rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-white ${disabled ? "opacity-80" : "cursor-crosshair"}`}
        onClick={handlePlaneClick}
        data-testid="student-graph-canvas"
      >
        <GraphPlane
          config={config}
          points={points}
          lines={lines}
          selectedPointId={lineStartId}
        />
      </svg>
    </div>
  );
}
