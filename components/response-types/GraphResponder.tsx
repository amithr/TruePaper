"use client";

import { useCallback, useRef, useState } from "react";
import { GraphPlane, resolveGraphSize } from "@/components/response-types/GraphCanvas";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import {
  mathToPixel,
  pixelToMath,
  resolveGraphBounds,
  resolveGraphGiven,
  snapGraphCoord,
} from "@/lib/response-types/graph-coords";
import type {
  GraphConfig,
  GraphCurve,
  GraphLabel,
  GraphLine,
  GraphPoint,
} from "@/lib/response-types/types";
import { ui } from "@/lib/ui";

type GraphMode = "point" | "line" | "curve" | "label";

/** A curve needs at least this many points to finish (two would just be a line). */
export const MIN_CURVE_POINTS = 3;

type Props = {
  points: GraphPoint[];
  lines: GraphLine[];
  labels: GraphLabel[];
  curves?: GraphCurve[];
  disabled: boolean;
  config: GraphConfig;
  onChange: (
    points: GraphPoint[],
    lines: GraphLine[],
    labels: GraphLabel[],
    curves: GraphCurve[],
  ) => void;
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
  curves = [],
  disabled,
  config,
  onChange: onChangeAll,
}: Props) {
  const t = useTranslations();
  const bounds = resolveGraphBounds(config);
  const { width, height } = resolveGraphSize(config);
  const given = resolveGraphGiven(config);
  const hasGiven = given.points.length + given.lines.length + given.labels.length > 0;
  const svgRef = useRef<SVGSVGElement>(null);
  const [mode, setMode] = useState<GraphMode>("point");
  const [lineStartId, setLineStartId] = useState<string | null>(null);
  const [pendingLabel, setPendingLabel] = useState<{ x: number; y: number } | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [draftLabelText, setDraftLabelText] = useState("");
  // Curve being drawn: ordered point ids, plus which of those points it created.
  const [draftCurve, setDraftCurve] = useState<string[]>([]);
  const [draftCreated, setDraftCreated] = useState<string[]>([]);

  // Most edits leave curves alone; keep the old 3-argument call sites readable.
  const onChange = (nextPoints: GraphPoint[], nextLines: GraphLine[], nextLabels: GraphLabel[]) =>
    onChangeAll(nextPoints, nextLines, nextLabels, curves);

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
      // Student points first; given points too, so new lines can start/end on them.
      for (const point of [...points, ...given.points]) {
        const { px: pointPx, py: pointPy } = mathToPixel(point.x, point.y, bounds, width, height);
        if (Math.hypot(px - pointPx, py - pointPy) <= HIT_RADIUS) {
          return point;
        }
      }
      return null;
    },
    [bounds, given.points, height, points, width],
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

  const resetDraftCurve = () => {
    setDraftCurve([]);
    setDraftCreated([]);
  };

  const finishCurve = () => {
    if (draftCurve.length < MIN_CURVE_POINTS) {
      return;
    }
    onChangeAll(points, lines, labels, [...curves, { id: newId("c"), pointIds: draftCurve }]);
    resetDraftCurve();
  };

  const handleCurveClick = (clientX: number, clientY: number, mathX: number, mathY: number) => {
    const hit = findPointAt(clientX, clientY);
    if (hit) {
      const last = draftCurve[draftCurve.length - 1];
      if (hit.id === last) {
        // Tapping the last point again finishes the curve.
        finishCurve();
        return;
      }
      setDraftCurve([...draftCurve, hit.id]);
      return;
    }
    // Empty space: create a point there and add it to the curve in one step.
    const point = { id: newId("p"), ...snapPosition(mathX, mathY) };
    onChangeAll([...points, point], lines, labels, curves);
    setDraftCurve([...draftCurve, point.id]);
    setDraftCreated([...draftCreated, point.id]);
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

    if (mode === "curve") {
      const svg = svgRef.current;
      if (!svg) {
        return;
      }
      const rect = svg.getBoundingClientRect();
      const px = (event.clientX - rect.left) * (width / rect.width);
      const py = (event.clientY - rect.top) * (height / rect.height);
      const { x, y } = pixelToMath(px, py, bounds, width, height);
      handleCurveClick(event.clientX, event.clientY, x, y);
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
    if (draftCurve.length > 0) {
      // Step back one point in the curve being drawn (and drop it if the curve made it).
      const lastId = draftCurve[draftCurve.length - 1];
      setDraftCurve(draftCurve.slice(0, -1));
      if (draftCreated.includes(lastId)) {
        setDraftCreated(draftCreated.filter((id) => id !== lastId));
        onChangeAll(points.filter((p) => p.id !== lastId), lines, labels, curves);
      }
      return;
    }
    if (curves.length > 0) {
      onChangeAll(points, lines, labels, curves.slice(0, -1));
      return;
    }
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
      onChangeAll(
        points.slice(0, -1),
        lines.filter((line) => line.from !== removed.id && line.to !== removed.id),
        labels,
        curves.filter((curve) => !curve.pointIds.includes(removed.id)),
      );
    }
    setLineStartId(null);
  };

  const handleClear = () => {
    onChangeAll([], [], [], []);
    setLineStartId(null);
    cancelLabelEdit();
    resetDraftCurve();
  };

  const handleModeChange = (next: GraphMode) => {
    setMode(next);
    setLineStartId(null);
    cancelLabelEdit();
    resetDraftCurve();
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
            className={mode === "curve" ? "tp-btn-primary text-sm" : "tp-btn-secondary text-sm"}
            onClick={() => handleModeChange("curve")}
          >
            {t("responseTypes.graph.curveMode")}
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
              : mode === "curve"
                ? draftCurve.length === 0
                  ? t("responseTypes.graph.curveHintStart")
                  : t("responseTypes.graph.curveHintProgress", { n: draftCurve.length })
                : t("responseTypes.graph.labelHint")}
          {hasGiven ? ` ${t("responseTypes.graph.givenHint")}` : ""}
        </p>
      ) : null}
      {mode === "curve" && draftCurve.length > 0 && !disabled ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="graph-curve-actions">
          <button
            type="button"
            className="tp-btn-primary text-sm"
            disabled={draftCurve.length < MIN_CURVE_POINTS}
            onClick={finishCurve}
          >
            {t("responseTypes.graph.finishCurve")}
          </button>
          <button
            type="button"
            className="tp-btn-secondary text-sm"
            onClick={() => {
              // Drop points this unfinished curve created; keep pre-existing ones.
              onChangeAll(
                points.filter((p) => !draftCreated.includes(p.id)),
                lines,
                labels,
                curves,
              );
              resetDraftCurve();
            }}
          >
            {t("common.cancel")}
          </button>
        </div>
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
          curves={curves}
          draftCurvePointIds={draftCurve}
          highlightPointIds={draftCurve}
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
