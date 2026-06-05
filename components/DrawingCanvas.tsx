"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  clamp01,
  drawStrokes,
  newStrokeId,
  type DrawingPoint,
  type DrawingStroke,
} from "@/lib/response-types/drawing";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing } from "@/lib/ui";

type Props = {
  width: number;
  height: number;
  strokes: DrawingStroke[];
  backgroundImageUrl?: string;
  readOnly?: boolean;
  disabled?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  onChange?: (strokes: DrawingStroke[]) => void;
  className?: string;
  "data-testid"?: string;
};

export function DrawingCanvas({
  width,
  height,
  strokes,
  backgroundImageUrl,
  readOnly = false,
  disabled = false,
  strokeColor = "#1e3a5f",
  strokeWidth = 2.5,
  onChange,
  className = "",
  "data-testid": testId,
}: Props) {
  const t = useTranslations();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStrokeRef = useRef<DrawingStroke | null>(null);
  const [localStrokes, setLocalStrokes] = useState(strokes);

  useEffect(() => {
    setLocalStrokes(strokes);
  }, [strokes]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, width, height);
    if (backgroundImageUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        drawStrokes(ctx, localStrokes, width, height);
        if (activeStrokeRef.current) {
          drawStrokes(ctx, [activeStrokeRef.current], width, height);
        }
      };
      img.src = backgroundImageUrl;
      return;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    drawStrokes(ctx, localStrokes, width, height);
    if (activeStrokeRef.current) {
      drawStrokes(ctx, [activeStrokeRef.current], width, height);
    }
  }, [backgroundImageUrl, height, localStrokes, width]);

  useEffect(() => {
    paint();
  }, [paint]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): DrawingPoint => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  };

  const commitStrokes = (next: DrawingStroke[]) => {
    setLocalStrokes(next);
    onChange?.(next);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || disabled || !onChange) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke: DrawingStroke = {
      id: newStrokeId(),
      color: strokeColor,
      width: strokeWidth,
      points: [pointFromEvent(event)],
    };
    activeStrokeRef.current = stroke;
    paint();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeStrokeRef.current || readOnly || disabled) {
      return;
    }
    activeStrokeRef.current = {
      ...activeStrokeRef.current,
      points: [...activeStrokeRef.current.points, pointFromEvent(event)],
    };
    paint();
  };

  const handlePointerUp = () => {
    if (!activeStrokeRef.current || readOnly || disabled || !onChange) {
      return;
    }
    const finished = activeStrokeRef.current;
    activeStrokeRef.current = null;
    if (finished.points.length >= 2) {
      commitStrokes([...localStrokes, finished]);
    } else {
      paint();
    }
  };

  const handleUndo = () => {
    if (readOnly || disabled || localStrokes.length === 0) {
      return;
    }
    commitStrokes(localStrokes.slice(0, -1));
  };

  const handleClear = () => {
    if (readOnly || disabled) {
      return;
    }
    commitStrokes([]);
  };

  return (
    <div className={`tp-draw-canvas-wrap ${className}`}>
      {!readOnly && !disabled ? (
        <div className="tp-draw-canvas-toolbar mb-2 flex flex-wrap gap-2">
          <button type="button" onClick={handleUndo} className={`tp-btn-ghost min-h-11 px-3 text-sm ${focusRing}`}>
            {t("responseTypes.drawDiagram.undo")}
          </button>
          <button type="button" onClick={handleClear} className={`tp-btn-ghost min-h-11 px-3 text-sm ${focusRing}`}>
            {t("responseTypes.drawDiagram.clear")}
          </button>
        </div>
      ) : null}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        data-testid={testId}
        className={`tp-draw-canvas w-full max-w-full touch-none rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-white ${
          readOnly || disabled ? "" : "cursor-crosshair"
        }`}
        style={{ aspectRatio: `${width} / ${height}` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    </div>
  );
}
