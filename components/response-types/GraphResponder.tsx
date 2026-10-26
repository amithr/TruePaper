"use client";

import { useCallback, useRef, useState } from "react";
import { GraphPlane, resolveGraphSize } from "@/components/response-types/GraphCanvas";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import {
  formatGraphCoord,
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

/**
 * A press on the plane that may become a drag: placing a new point (shown as a
 * ghost that follows the finger, with a coordinate readout the finger can't
 * cover) or moving an existing student point.
 */
type Drag =
  | { kind: "place"; x: number; y: number }
  | { kind: "move"; pointId: string; x: number; y: number };

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Hit areas are measured on screen, so a shrunken canvas on a phone stays tappable. */
const HIT_RADIUS_CSS = 22;
const LABEL_HIT_RADIUS_CSS = 24;
/** In viewBox units; the floor when the canvas renders larger than its viewBox. */
const HIT_RADIUS_MIN = 14;

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
  /** The line tool created the pending start point, so Undo should remove it again. */
  const lineStartCreatedRef = useRef(false);
  const [pendingLabel, setPendingLabel] = useState<{ x: number; y: number } | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [draftLabelText, setDraftLabelText] = useState("");
  // Curve being drawn: ordered point ids, plus which of those points it created.
  const [draftCurve, setDraftCurve] = useState<string[]>([]);
  const [draftCreated, setDraftCreated] = useState<string[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const pressRef = useRef<{ hit: GraphPoint | null } | null>(null);

  // Most edits leave curves alone; keep the old 3-argument call sites readable.
  const onChange = (nextPoints: GraphPoint[], nextLines: GraphLine[], nextLabels: GraphLabel[]) =>
    onChangeAll(nextPoints, nextLines, nextLabels, curves);

  /**
   * Client coords → viewBox pixels, plus the viewBox-per-CSS-pixel scale. Uses the
   * SVG's own screen matrix when the browser provides it, so a letterboxed or
   * scaled canvas (phones) maps exactly; the bounding-box maths is the fallback.
   */
  const toPlane = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) {
        return null;
      }
      const ctm = typeof svg.getScreenCTM === "function" ? svg.getScreenCTM() : null;
      if (ctm && ctm.a !== 0 && ctm.d !== 0 && typeof DOMPoint === "function") {
        const local = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
        return { px: local.x, py: local.y, scaleX: 1 / ctm.a, scaleY: 1 / ctm.d };
      }
      const rect = svg.getBoundingClientRect();
      const scaleX = rect.width > 0 ? width / rect.width : 1;
      const scaleY = rect.height > 0 ? height / rect.height : 1;
      return {
        px: (clientX - rect.left) * scaleX,
        py: (clientY - rect.top) * scaleY,
        scaleX,
        scaleY,
      };
    },
    [height, width],
  );

  const snapPosition = useCallback(
    (x: number, y: number) => ({
      x: snapGraphCoord(Math.min(bounds.xMax, Math.max(bounds.xMin, x))),
      y: snapGraphCoord(Math.min(bounds.yMax, Math.max(bounds.yMin, y))),
    }),
    [bounds],
  );

  /** Client coords → snapped, clamped math coords. */
  const toMath = useCallback(
    (clientX: number, clientY: number) => {
      const plane = toPlane(clientX, clientY);
      if (!plane) {
        return null;
      }
      const { x, y } = pixelToMath(plane.px, plane.py, bounds, width, height);
      return snapPosition(x, y);
    },
    [bounds, height, snapPosition, toPlane, width],
  );

  const findPointAt = useCallback(
    (clientX: number, clientY: number): GraphPoint | null => {
      const plane = toPlane(clientX, clientY);
      if (!plane) {
        return null;
      }
      // Finger-sized on screen; never smaller than the old viewBox radius.
      const radius = Math.max(HIT_RADIUS_MIN, HIT_RADIUS_CSS * plane.scaleX);
      // Student points first; given points too, so new lines can start/end on them.
      for (const point of [...points, ...given.points]) {
        const { px: pointPx, py: pointPy } = mathToPixel(point.x, point.y, bounds, width, height);
        if (Math.hypot(plane.px - pointPx, plane.py - pointPy) <= radius) {
          return point;
        }
      }
      return null;
    },
    [bounds, given.points, height, points, toPlane, width],
  );

  const findLabelAt = useCallback(
    (clientX: number, clientY: number): GraphLabel | null => {
      const plane = toPlane(clientX, clientY);
      if (!plane) {
        return null;
      }
      const radius = Math.max(HIT_RADIUS_MIN, LABEL_HIT_RADIUS_CSS * plane.scaleX);
      for (const label of labels) {
        if (!label.text.trim()) {
          continue;
        }
        const { px: labelPx, py: labelPy } = mathToPixel(label.x, label.y, bounds, width, height);
        if (Math.hypot(plane.px - labelPx, plane.py - labelPy) <= radius) {
          return label;
        }
      }
      return null;
    },
    [bounds, height, labels, toPlane, width],
  );

  const isStudentPoint = (point: GraphPoint) => points.some((p) => p.id === point.id);

  const addPoint = (x: number, y: number) => {
    onChange([...points, { id: newId("p"), ...snapPosition(x, y) }], lines, labels);
  };

  const movePoint = (pointId: string, x: number, y: number) => {
    const current = points.find((p) => p.id === pointId);
    if (!current || (current.x === x && current.y === y)) {
      return;
    }
    onChange(
      points.map((p) => (p.id === pointId ? { ...p, x, y } : p)),
      lines,
      labels,
    );
  };

  const lineExists = (fromId: string, toId: string) =>
    lines.some(
      (line) =>
        (line.from === fromId && line.to === toId) || (line.from === toId && line.to === fromId),
    );

  /** Connect two points; `withPoint` lets a brand-new end point land in the same update. */
  const addLine = (fromId: string, toId: string, withPoint?: GraphPoint) => {
    const nextPoints = withPoint ? [...points, withPoint] : points;
    if (fromId === toId || lineExists(fromId, toId)) {
      if (withPoint) {
        onChange(nextPoints, lines, labels);
      }
      return;
    }
    onChange(nextPoints, [...lines, { id: newId("l"), from: fromId, to: toId }], labels);
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

  const clearLineStart = () => {
    setLineStartId(null);
    lineStartCreatedRef.current = false;
  };

  /** A new point at (x, y), used by whichever tool is active. */
  const placeAt = (x: number, y: number) => {
    if (mode === "point") {
      addPoint(x, y);
      return;
    }
    const point: GraphPoint = { id: newId("p"), ...snapPosition(x, y) };
    if (mode === "line") {
      if (!lineStartId) {
        // Start the line here: the point exists at once so it survives a mode switch.
        onChange([...points, point], lines, labels);
        setLineStartId(point.id);
        lineStartCreatedRef.current = true;
        return;
      }
      addLine(lineStartId, point.id, point);
      clearLineStart();
      return;
    }
    if (mode === "curve") {
      onChangeAll([...points, point], lines, labels, curves);
      setDraftCurve([...draftCurve, point.id]);
      setDraftCreated([...draftCreated, point.id]);
    }
  };

  /** A tap that landed on something (or label mode, which never drags). */
  const handleTap = (clientX: number, clientY: number, hit: GraphPoint | null) => {
    if (mode === "label") {
      const hitLabel = findLabelAt(clientX, clientY);
      if (hitLabel) {
        beginLabelEdit(hitLabel);
        return;
      }
      const at = toMath(clientX, clientY);
      if (at) {
        beginLabelPlacement(at.x, at.y);
      }
      return;
    }
    if (!hit) {
      return;
    }
    if (mode === "curve") {
      const last = draftCurve[draftCurve.length - 1];
      if (hit.id === last) {
        // Tapping the last point again finishes the curve.
        finishCurve();
        return;
      }
      setDraftCurve([...draftCurve, hit.id]);
      return;
    }
    if (mode === "line") {
      if (!lineStartId) {
        setLineStartId(hit.id);
        lineStartCreatedRef.current = false;
        return;
      }
      addLine(lineStartId, hit.id);
      clearLineStart();
    }
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    const svg = event.currentTarget;
    if (typeof svg.setPointerCapture === "function") {
      try {
        svg.setPointerCapture(event.pointerId);
      } catch {
        /* capture is a nicety */
      }
    }
    const hit = findPointAt(event.clientX, event.clientY);
    pressRef.current = { hit };
    if (mode === "label") {
      return;
    }
    if (hit) {
      if (mode === "point" && isStudentPoint(hit)) {
        setDrag({ kind: "move", pointId: hit.id, x: hit.x, y: hit.y });
      }
      return;
    }
    const at = toMath(event.clientX, event.clientY);
    if (at) {
      setDrag({ kind: "place", ...at });
    }
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) {
      return;
    }
    const at = toMath(event.clientX, event.clientY);
    if (at && (at.x !== drag.x || at.y !== drag.y)) {
      setDrag({ ...drag, ...at });
    }
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const press = pressRef.current;
    pressRef.current = null;
    const active = drag;
    setDrag(null);
    if (disabled) {
      return;
    }
    if (active?.kind === "move") {
      movePoint(active.pointId, active.x, active.y);
      return;
    }
    if (active?.kind === "place") {
      placeAt(active.x, active.y);
      return;
    }
    handleTap(event.clientX, event.clientY, press?.hit ?? null);
  };

  const onPointerCancel = () => {
    pressRef.current = null;
    setDrag(null);
  };

  const handleUndo = () => {
    setDrag(null);
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
    if (lineStartId) {
      // Back out of a half-drawn line; the point the line tool added goes too.
      const startedId = lineStartId;
      const created = lineStartCreatedRef.current;
      clearLineStart();
      if (created) {
        onChange(points.filter((p) => p.id !== startedId), lines, labels);
      }
      return;
    }
    if (curves.length > 0) {
      onChangeAll(points, lines, labels, curves.slice(0, -1));
      return;
    }
    if (lines.length > 0) {
      onChange(points, lines.slice(0, -1), labels);
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
  };

  const handleClear = () => {
    onChangeAll([], [], [], []);
    clearLineStart();
    cancelLabelEdit();
    resetDraftCurve();
    setDrag(null);
  };

  const handleModeChange = (next: GraphMode) => {
    setMode(next);
    clearLineStart();
    cancelLabelEdit();
    resetDraftCurve();
    setDrag(null);
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

  const allPoints = [...given.points, ...points];
  const lineStart = lineStartId ? allPoints.find((p) => p.id === lineStartId) : null;
  const ghost = drag ? mathToPixel(drag.x, drag.y, bounds, width, height) : null;
  const ghostFrom =
    drag?.kind === "place" && mode === "line" && lineStart
      ? mathToPixel(lineStart.x, lineStart.y, bounds, width, height)
      : null;
  // Keep the readout inside the plane: flip it to the other side near the edges.
  const readoutX = ghost ? (ghost.px > width - 90 ? ghost.px - 14 : ghost.px + 14) : 0;
  const readoutAnchor = ghost && ghost.px > width - 90 ? "end" : "start";
  const readoutY = ghost ? (ghost.py < 40 ? ghost.py + 30 : ghost.py - 18) : 0;

  const tool = (value: GraphMode, label: string) => (
    <button
      type="button"
      className={mode === value ? "tp-btn-primary text-sm" : "tp-btn-secondary text-sm"}
      aria-pressed={mode === value}
      onClick={() => handleModeChange(value)}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-2" data-testid="student-graph-responder">
      {!disabled ? (
        <div className="tp-graph-toolbar flex flex-wrap gap-2">
          {tool("point", t("responseTypes.graph.pointMode"))}
          {tool("line", t("responseTypes.graph.lineMode"))}
          {tool("curve", t("responseTypes.graph.curveMode"))}
          {tool("label", t("responseTypes.graph.labelMode"))}
          <button type="button" className="tp-btn-secondary text-sm" onClick={handleUndo}>
            {t("responseTypes.graph.undo")}
          </button>
          <button type="button" className="tp-btn-secondary text-sm" onClick={handleClear}>
            {t("responseTypes.graph.clear")}
          </button>
        </div>
      ) : null}
      {!disabled ? (
        <p className="tp-graph-hint text-xs text-[var(--tp-text-secondary)]" data-testid="graph-hint">
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
        // h-auto: the height attribute must not pin the box when max-w-full shrinks the
        // width, or the plane gets letterboxed and taps land on the wrong y.
        className={`tp-graph-canvas h-auto max-w-full touch-none select-none rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-white ${disabled ? "opacity-80" : mode === "label" ? "cursor-text" : "cursor-crosshair"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        data-testid="student-graph-canvas"
        data-dragging={drag ? drag.kind : undefined}
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
        {ghost && drag ? (
          <g data-testid="graph-ghost" pointerEvents="none">
            {ghostFrom ? (
              <line
                x1={ghostFrom.px}
                y1={ghostFrom.py}
                x2={ghost.px}
                y2={ghost.py}
                stroke="#2563eb"
                strokeWidth={2}
                strokeDasharray="5 4"
                opacity={0.7}
              />
            ) : null}
            <circle cx={ghost.px} cy={ghost.py} r={16} fill="#2563eb" opacity={0.12} />
            <circle cx={ghost.px} cy={ghost.py} r={7} fill="#2563eb" stroke="#fff" strokeWidth={2} />
            <text
              x={readoutX}
              y={readoutY}
              textAnchor={readoutAnchor}
              fontSize={13}
              fontWeight={600}
              fill="#1e3a8a"
              stroke="#fff"
              strokeWidth={4}
              paintOrder="stroke"
              data-testid="graph-readout"
            >
              ({formatGraphCoord(drag.x)}, {formatGraphCoord(drag.y)})
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
