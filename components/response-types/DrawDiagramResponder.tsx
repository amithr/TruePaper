"use client";

import { DrawingCanvas } from "@/components/DrawingCanvas";
import type { DrawDiagramConfig } from "@/lib/response-types/types";
import type { DrawingStroke } from "@/lib/response-types/drawing";

type Props = {
  strokes: DrawingStroke[];
  disabled: boolean;
  config: DrawDiagramConfig;
  onChange: (strokes: DrawingStroke[]) => void;
};

export function DrawDiagramResponder({ strokes, disabled, config, onChange }: Props) {
  const width = Math.max(320, Math.min(800, config.width ?? 600));
  const height = Math.max(200, Math.min(600, config.height ?? 360));

  return (
    <DrawingCanvas
      width={width}
      height={height}
      strokes={strokes}
      backgroundImageUrl={config.backgroundDataUrl}
      disabled={disabled}
      onChange={onChange}
      data-testid="student-draw-canvas"
    />
  );
}
