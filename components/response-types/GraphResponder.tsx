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
import type { GraphConfig, GraphLabel, GraphLine, GraphPoint } from "@/lib/response-types/types";
import { ui } from "@/lib/ui";

type GraphMode = "point" | "line" | "label";

type Props = {
  points: GraphPoint[];
  lines: GraphLine[];
  labels: GraphLabel[];
  disabled: boolean;
  config: GraphConfig;
  onChange: (points: GraphPoint[], lines: GraphLine[], labels: GraphLabel[]) => void;
};

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const HIT_RADIUS = 14;
const LABEL_HIT_RADIUS = 18;

export function GraphResponder({
  points,
  lines,
  labels,
  disabled,
  config,
  onChange,
}: Props) {
  const t = useTranslations();
  const bounds = resolveGraphBounds(config);
  const { width, height } = resolveGraphSize(config);
  const svgRef = useRef<SVGSVGElement>(null);
  const [mode, setMode] = useState<GraphMode>("point");
  const [lineStartId, setLineStartId] = useState<string | null>(null);
  const [pendingLabel, setPendingLabel] = useState<{ x: number; y: number } | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [draftLabelText, setDraftLabelText] = useState("");

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

  const findLabelAt = useCallback(
    (clientX: number, clientY: number): GraphLabel | null => {
      const svg = svgRef.current;
      if (!svg) {
        return null;
      }
      const rect = svg.getBoundingClientRect();
      const scaleX = width / rect.width;
      const scaleY = height / rect.height;
      const px = (clientX - rect.left) * scaleX;
      const py = (clientY - rect.top) * scaleY;
      for (const label of labels) {
        if (!label.text.trim()) {
          continue;
        }
        const { px: labelPx, py: labelPy } = mathToPixel(label.x, label.y, bounds, width, height);
        if (Math.hypot(px - labelPx, py - labelPy) <= LABEL_HIT_RADIUS) {
          return label;
        }
      }
      return null;
    },
    [bounds, height, labels, width],
  );

  const snapPosition = (x: number, y: number) => ({
    x: snapGraphCoord(Math.min(bounds.xMax, Math.max(bounds.xMin, x))),
    y: snapGraphCoord(Math.min(bounds.yMax, Math.max(bounds.yMin, y))),
  });

  const addPoint = (x: number, y: number) => {
    onChange([...points, { id: newId("p"), ...snapPosition(x, y) }], lines, labels);
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
    onChange(points, [...lines, { id: newId("l"), from: fromId, to: toId }], labels);
  };

  const beginLabelEdit = (label: GraphLabel) => {
    setEditingLabelId(label.id);
    setDraftLabelText(label.text);
    setPendingLabel(null);
  };

  const beginLabelPlacement = (x: number, y: number) => {
    setPendingLabel(snapPosition(x, y));
    setEditingLabelId(null);
    setDraftLabelText("");
  };

  const commitLabel = () => {
    const text = draftLabelText.trim();
    if (!text) {
      setPendingLabel(null);
      setEditingLabelId(null);
      setDraftLabelText("");
      return;
    }
    if (editingLabelId) {
      onChange(
        points,
        lines,
        labels.map((label) => (label.id === editingLabelId ? { ...label, text } : label)),
      );
    } else if (pendingLabel) {
      onChange(
        points,
        lines,
        [...labels, { id: newId("lbl"), x: pendingLabel.x, y: pendingLabel.y, text }],
      );
    }
    setPendingLabel(null);
    setEditingLabelId(null);
    setDraftLabelText("");
  };

  const cancelLabelEdit = () => {
    setPendingLabel(null);
    setEditingLabelId(null);
    setDraftLabelText("");
  };

  const handlePlaneClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (disabled) {
      return;
    }

    if (mode === "label") {
      const hitLabel = findLabelAt(event.clientX, event.clientY);
      if (hitLabel) {
        beginLabelEdit(hitLabel);
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
      beginLabelPlacement(x, y);
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
      onChange(points, lines.slice(0, -1), labels);
      setLineStartId(null);
      return;
    }
    if (labels.length > 0) {
      onChange(points, lines, labels.slice(0, -1));
      cancelLabelEdit();
      return;
    }
    if (points.length > 0) {
      const removed = points[points.length - 1];
      onChange(
        points.slice(0, -1),
        lines.filter((line) => line.from !== removed.id && line.to !== removed.id),
        labels,
      );
    }
    setLineStartId(null);
  };

  const handleClear = () => {
    onChange([], [], []);
    setLineStartId(null);
    cancelLabelEdit();
  };

  const handleModeChange = (next: GraphMode) => {
    setMode(next);
    setLineStartId(null);
    cancelLabelEdit();
  };

  const showLabelEditor = pendingLabel !== null || editingLabelId !== null;
  const displayLabels = [...labels];
  if (pendingLabel && draftLabelText.trim()) {
    displayLabels.push({
      id: "__preview__",
      x: pendingLabel.x,
      y: pendingLabel.y,
      text: draftLabelText,
    });
  }

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
          <button
            type="button"
            className={mode === "label" ? "tp-btn-primary text-sm" : "tp-btn-secondary text-sm"}
            onClick={() => handleModeChange("label")}
          >
            {t("responseTypes.graph.labelMode")}
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
            : mode === "line"
              ? lineStartId
                ? t("responseTypes.graph.lineHintSecond")
                : t("responseTypes.graph.lineHintFirst")
              : t("responseTypes.graph.labelHint")}
        </p>
      ) : null}
      {showLabelEditor && !disabled ? (
        <div className="flex flex-wrap items-end gap-2 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] p-3">
          <label className={`${ui.label} min-w-[12rem] flex-1`}>
            {t("responseTypes.graph.labelText")}
            <input
              type="text"
              value={draftLabelText}
              onChange={(event) => setDraftLabelText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitLabel();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelLabelEdit();
                }
              }}
              className="tp-input"
              autoFocus
              maxLength={48}
              placeholder={t("responseTypes.graph.labelPlaceholder")}
            />
          </label>
          <button type="button" className="tp-btn-primary text-sm" onClick={commitLabel}>
            {editingLabelId ? t("responseTypes.graph.saveLabel") : t("responseTypes.graph.addLabel")}
          </button>
          <button type="button" className="tp-btn-secondary text-sm" onClick={cancelLabelEdit}>
            {t("common.cancel")}
          </button>
        </div>
      ) : null}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={`max-w-full touch-none rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-white ${disabled ? "opacity-80" : mode === "label" ? "cursor-text" : "cursor-crosshair"}`}
        onClick={handlePlaneClick}
        data-testid="student-graph-canvas"
      >
        <GraphPlane
          config={config}
          points={points}
          lines={lines}
          labels={displayLabels}
          selectedPointId={lineStartId}
          selectedLabelId={editingLabelId}
        />
        {pendingLabel ? (
          <circle
            cx={mathToPixel(pendingLabel.x, pendingLabel.y, bounds, width, height).px}
            cy={mathToPixel(pendingLabel.x, pendingLabel.y, bounds, width, height).py}
            r={5}
            fill="none"
            stroke="#c2410c"
            strokeWidth={2}
            strokeDasharray="3 2"
          />
        ) : null}
      </svg>
    </div>
  );
}
