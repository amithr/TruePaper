"use client";

import { type ReactNode, useState } from "react";

import { DrawingCanvas } from "@/components/DrawingCanvas";
import { PhotoHandwrittenResponder } from "@/components/response-types/PhotoHandwrittenResponder";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import type { DrawDiagramConfig } from "@/lib/response-types/types";
import {
  drawDiagramImageUploadAllowed,
  type DrawDiagramPhoto,
  type DrawingStroke,
} from "@/lib/response-types/drawing";
import { focusRing } from "@/lib/ui";

type Mode = "draw" | "photo";

type Props = {
  strokes: DrawingStroke[];
  /** Photo uploaded in place of the drawing (it is the answer while set). */
  photo?: DrawDiagramPhoto | null;
  disabled: boolean;
  config: DrawDiagramConfig;
  /** Resolved background (e.g. the question image); falls back to config.backgroundDataUrl. */
  backgroundImageUrl?: string;
  onChange: (strokes: DrawingStroke[]) => void;
  /** Omit to offer drawing only. */
  onPhotoChange?: (photo: DrawDiagramPhoto | null) => void;
};

export function DrawDiagramResponder({
  strokes,
  photo = null,
  disabled,
  config,
  backgroundImageUrl,
  onChange,
  onPhotoChange,
}: Props) {
  const t = useTranslations();
  const uploadAllowed = drawDiagramImageUploadAllowed(config);
  const [mode, setMode] = useState<Mode>(photo ? "photo" : "draw");
  const width = Math.max(320, Math.min(800, config.width ?? 600));
  const height = Math.max(200, Math.min(600, config.height ?? 360));

  const canvas = (toolbarStart?: ReactNode) => (
    <DrawingCanvas
      width={width}
      height={height}
      strokes={strokes}
      backgroundImageUrl={backgroundImageUrl ?? config.backgroundDataUrl}
      disabled={disabled}
      onChange={onChange}
      toolbarStart={toolbarStart}
      data-testid="student-draw-canvas"
    />
  );

  // A photo uploaded before the teacher turned uploads off is still shown, so it can be removed.
  if (!onPhotoChange || (!uploadAllowed && !photo)) {
    return canvas();
  }

  const resolvedBackground = backgroundImageUrl ?? config.backgroundDataUrl;
  const canvasShown = mode === "draw" && !photo;

  const modeButton = (value: Mode, label: string) => (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={mode === value}
      onClick={() => setMode(value)}
      className={`min-h-9 rounded-full px-4 text-sm font-medium transition-colors ${focusRing} ${
        mode === value
          ? "bg-[var(--tp-surface)] text-[var(--tp-text)] shadow-sm"
          : "text-[var(--tp-text-secondary)] hover:text-[var(--tp-text)]"
      }`}
    >
      {label}
    </button>
  );

  const modeSwitch = (
    <div
      role="group"
      aria-label={t("responseTypes.drawDiagram.modeAria")}
      className="inline-flex gap-1 rounded-full border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] p-1"
    >
      {modeButton("draw", t("responseTypes.drawDiagram.drawMode"))}
      {modeButton("photo", t("responseTypes.drawDiagram.photoMode"))}
    </div>
  );

  if (canvasShown) {
    // Share one toolbar row with Undo / Clear so the switch doesn't add a stacked gap.
    return <div className="mt-4">{canvas(modeSwitch)}</div>;
  }

  return (
    <div className="mt-4 space-y-3">
      {modeSwitch}

      {resolvedBackground ? (
        // The question image normally sits inside the canvas; keep it visible while uploading.
        <div className="overflow-hidden rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolvedBackground}
            alt={t("home.exam.promptImageAlt")}
            className="max-h-[360px] w-full object-contain"
          />
        </div>
      ) : null}

      {mode === "photo" ? (
        <PhotoHandwrittenResponder
          imageDataUrl={photo?.dataUrl ?? ""}
          width={photo?.width ?? 0}
          height={photo?.height ?? 0}
          disabled={disabled}
          config={{}}
          emptyLabel={t("responseTypes.drawDiagram.photoEmpty")}
          onChange={(dataUrl, photoWidth, photoHeight) =>
            onPhotoChange(dataUrl ? { dataUrl, width: photoWidth, height: photoHeight } : null)
          }
        />
      ) : photo ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] px-4 py-3"
          data-testid="student-draw-photo-notice"
        >
          <p className="text-sm text-[var(--tp-text-secondary)]">
            {t("responseTypes.drawDiagram.photoReplacesDrawing")}
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPhotoChange(null)}
            className={`tp-btn-secondary min-h-11 px-4 text-sm ${focusRing}`}
          >
            {t("responseTypes.drawDiagram.removePhotoAndDraw")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
