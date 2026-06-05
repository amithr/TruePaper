"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DrawingCanvas } from "@/components/DrawingCanvas";
import type { Question } from "@/lib/forms";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { parseResponseValue } from "@/lib/response-types/answers";
import {
  feedbackKeyForCanvas,
  getCanvasAnnotation,
  getDisplayMessage,
  serializeFeedbackPayload,
  type TeacherFeedbackStore,
} from "@/lib/response-types/feedback";
import type { DrawingStroke } from "@/lib/response-types/drawing";
import {
  normalizeResponseType,
  type DrawDiagramConfig,
  type LabellingConfig,
  type MatchingConfig,
  type OrderingConfig,
} from "@/lib/response-types/types";
import { deferEffect } from "@/lib/defer-effect";
import { focusRing } from "@/lib/ui";

type FeedbackEditorProps = {
  questionId: string;
  showEditor: boolean;
  draftMessage: string;
  isSaving: boolean;
  feedbackHint: string;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (value: string) => void;
};

type Props = {
  question: Question;
  rawAnswer: string | undefined;
  feedbackStore: TeacherFeedbackStore;
  liveFeedbackEnabled: boolean;
  feedbackFocusQuestionId: string | null;
  liveFeedbackDraftsByQuestionId: Record<string, string>;
  liveFeedbackSavingQuestionIds: Set<string>;
  onFeedbackFocus: (questionId: string) => void;
  onFeedbackBlur: (questionId: string) => void;
  onFeedbackChange: (questionId: string, value: string) => void;
  onCanvasAnnotationSave?: (questionId: string, strokes: DrawingStroke[]) => void;
};

function WrittenFeedbackBlock({
  showEditor,
  draftMessage,
  isSaving,
  feedbackHint,
  liveFeedbackEnabled,
  onFocus,
  onBlur,
  onChange,
}: Omit<FeedbackEditorProps, "questionId"> & { liveFeedbackEnabled: boolean }) {
  const t = useTranslations();

  if (!liveFeedbackEnabled && !showEditor) {
    return null;
  }
  if (!showEditor) {
    return (
      <button
        type="button"
        className={`mt-2 text-sm font-medium text-[var(--tp-accent)] ${focusRing}`}
        onClick={onFocus}
      >
        {t("session.watch.addFeedback")}
      </button>
    );
  }

  return (
    <div className="rounded-[var(--tp-radius-sm)] border border-sky-200 bg-sky-50/70 px-3 py-3">
      <label className="block text-sm font-medium text-sky-950">
        <span className="inline-flex flex-wrap items-center gap-2">
          {t("session.watch.teacherFeedback")}
          <span
            data-testid="teacher-live-feedback-status"
            data-state={isSaving ? "saving" : "saved"}
            className="tp-save-indicator"
          >
            <span aria-hidden className="tp-save-dot" />
            <span>{isSaving ? t("common.saving") : feedbackHint}</span>
          </span>
        </span>
        <textarea
          rows={3}
          data-testid="teacher-live-feedback-input"
          value={draftMessage}
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t("session.watch.feedbackPlaceholder")}
          className="mt-2 w-full rounded-md border border-sky-300 bg-white px-3 py-2 text-sm text-zinc-900"
        />
      </label>
    </div>
  );
}

export function TeacherResponseWatch({
  question,
  rawAnswer,
  feedbackStore,
  liveFeedbackEnabled,
  feedbackFocusQuestionId,
  liveFeedbackDraftsByQuestionId,
  liveFeedbackSavingQuestionIds,
  onFeedbackFocus,
  onFeedbackBlur,
  onFeedbackChange,
  onCanvasAnnotationSave,
}: Props) {
  const t = useTranslations();
  const type = normalizeResponseType(question.type);
  const value = parseResponseValue(type, rawAnswer);
  const savedMsg = getDisplayMessage(feedbackStore, question.id);
  const draftMsg = liveFeedbackDraftsByQuestionId[question.id] ?? "";
  const showFeedbackEditor =
    feedbackFocusQuestionId === question.id ||
    savedMsg.trim().length > 0 ||
    draftMsg.trim().length > 0;
  const isSavingNow = liveFeedbackSavingQuestionIds.has(question.id);

  const canvasStrokes = getCanvasAnnotation(feedbackStore, question.id);
  const [annotationDraft, setAnnotationDraft] = useState<DrawingStroke[]>(canvasStrokes);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    deferEffect(() => {
      setAnnotationDraft((prev) => (prev === canvasStrokes ? prev : canvasStrokes));
    });
  }, [canvasStrokes]);

  const scheduleCanvasSave = useCallback(
    (strokes: DrawingStroke[]) => {
      if (!onCanvasAnnotationSave) {
        return;
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        onCanvasAnnotationSave(question.id, strokes);
      }, 600);
    },
    [onCanvasAnnotationSave, question.id],
  );

  const feedbackProps: FeedbackEditorProps = {
    questionId: question.id,
    showEditor: showFeedbackEditor,
    draftMessage: draftMsg,
    isSaving: isSavingNow,
    feedbackHint: t("session.watch.feedbackSavedLive"),
    onFocus: () => onFeedbackFocus(question.id),
    onBlur: () => onFeedbackBlur(question.id),
    onChange: (next) => onFeedbackChange(question.id, next),
  };

  if (type === "multipleChoice" && value.type === "multipleChoice") {
    return (
      <div className="space-y-2">
        {question.options.map((option, optionIndex) => (
          <label
            key={`${question.id}-${optionIndex}`}
            className="flex cursor-default items-center gap-2 text-sm"
          >
            <input
              type="radio"
              name={`watch-${question.id}`}
              value={option}
              checked={value.choice === option}
              disabled
            />
            <span>{option || t("review.optionN", { n: optionIndex + 1 })}</span>
          </label>
        ))}
      </div>
    );
  }

  if (type === "trueFalse" && value.type === "trueFalse") {
    return (
      <p className="text-sm font-medium" data-testid="teacher-watch-answer">
        {value.answer === null
          ? t("session.watch.noResponse")
          : value.answer
            ? t("responseTypes.trueFalse.true")
            : t("responseTypes.trueFalse.false")}
      </p>
    );
  }

  if (type === "matching" && value.type === "matching") {
    const config = question.responseConfig as MatchingConfig;
    const left = config.left ?? [];
    const right = config.right ?? [];
    const rightById = Object.fromEntries(right.map((r) => [r.id, r.text]));
    return (
      <ul className="space-y-1 text-sm" data-testid="teacher-watch-answer">
        {left.map((item) => (
          <li key={item.id}>
            <span className="font-medium">{item.text}</span>
            <span className="text-[var(--tp-text-secondary)]">
              {" → "}
              {rightById[value.pairs[item.id]] ?? t("session.watch.noResponse")}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  if (type === "ordering" && value.type === "ordering") {
    const config = question.responseConfig as OrderingConfig;
    const itemById = Object.fromEntries((config.items ?? []).map((i) => [i.id, i.text]));
    const order = value.order.length > 0 ? value.order : (config.items ?? []).map((i) => i.id);
    return (
      <ol className="list-decimal space-y-1 pl-5 text-sm" data-testid="teacher-watch-answer">
        {order.map((id) => (
          <li key={id}>{itemById[id] ?? id}</li>
        ))}
      </ol>
    );
  }

  if (type === "labelling" && value.type === "labelling") {
    const config = question.responseConfig as LabellingConfig;
    const termById = Object.fromEntries((config.terms ?? []).map((term) => [term.id, term.text]));
    return (
      <ul className="space-y-1 text-sm" data-testid="teacher-watch-answer">
        {(config.zones ?? []).map((zone) => (
          <li key={zone.id}>
            <span className="font-medium">{zone.text}</span>
            <span className="text-[var(--tp-text-secondary)]">
              {": "}
              {termById[value.assignments[zone.id]] ?? t("session.watch.noResponse")}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  if (type === "mathInput" && value.type === "mathInput") {
    return (
      <div className="space-y-3">
        <pre
          data-testid="teacher-watch-answer"
          className="overflow-x-auto rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900"
        >
          {value.latex || t("session.watch.noResponse")}
        </pre>
        <WrittenFeedbackBlock {...feedbackProps} liveFeedbackEnabled={liveFeedbackEnabled} />
      </div>
    );
  }

  if (type === "drawDiagram" && value.type === "drawDiagram") {
    const config = question.responseConfig as DrawDiagramConfig;
    const width = Math.max(320, Math.min(800, config.width ?? 600));
    const height = Math.max(200, Math.min(600, config.height ?? 360));
    return (
      <div className="space-y-3">
        <DrawingCanvas
          width={width}
          height={height}
          strokes={value.strokes}
          backgroundImageUrl={config.backgroundDataUrl}
          readOnly
          data-testid="teacher-watch-answer"
        />
        {liveFeedbackEnabled ? (
          <div>
            <p className="mb-2 text-xs font-medium text-[var(--tp-text-secondary)]">
              {t("responseTypes.watch.annotate")}
            </p>
            <DrawingCanvas
              width={width}
              height={height}
              strokes={annotationDraft}
              backgroundImageUrl={undefined}
              strokeColor="#c2410c"
              strokeWidth={3}
              onChange={(strokes) => {
                setAnnotationDraft(strokes);
                scheduleCanvasSave(strokes);
              }}
            />
          </div>
        ) : null}
        <WrittenFeedbackBlock {...feedbackProps} liveFeedbackEnabled={liveFeedbackEnabled} />
      </div>
    );
  }

  if (type === "photoHandwritten" && value.type === "photoHandwritten") {
    const width = value.width || 600;
    const height = value.height || 400;
    return (
      <div className="space-y-3">
        {value.imageDataUrl ? (
          <div className="relative overflow-hidden rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.imageDataUrl}
              alt={t("responseTypes.photoHandwritten.previewAlt")}
              className="max-h-[480px] w-full object-contain bg-white"
              data-testid="teacher-watch-answer"
            />
          </div>
        ) : (
          <p className="text-sm text-[var(--tp-text-secondary)]" data-testid="teacher-watch-answer">
            {t("session.watch.noResponse")}
          </p>
        )}
        {liveFeedbackEnabled && value.imageDataUrl ? (
          <div>
            <p className="mb-2 text-xs font-medium text-[var(--tp-text-secondary)]">
              {t("responseTypes.watch.annotate")}
            </p>
            <DrawingCanvas
              width={width}
              height={height}
              strokes={annotationDraft}
              backgroundImageUrl={value.imageDataUrl}
              strokeColor="#c2410c"
              strokeWidth={3}
              onChange={(strokes) => {
                setAnnotationDraft(strokes);
                scheduleCanvasSave(strokes);
              }}
            />
          </div>
        ) : null}
        <WrittenFeedbackBlock {...feedbackProps} liveFeedbackEnabled={liveFeedbackEnabled} />
      </div>
    );
  }

  const textPreview =
    value.type === "shortAnswer" || value.type === "extendedWritten"
      ? value.text
      : value.type === "structuredMultiPart"
        ? Object.entries(value.parts)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")
        : value.type === "annotateSource"
          ? value.highlights.map((h) => h.note ?? `[${h.start}-${h.end}]`).join("\n")
          : rawAnswer ?? "";

  return (
    <div className="space-y-3">
      <textarea
        readOnly
        rows={6}
        data-testid="teacher-watch-answer"
        value={textPreview}
        placeholder={t("session.watch.noResponse")}
        onFocus={() => onFeedbackFocus(question.id)}
        className="w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
      />
      <WrittenFeedbackBlock {...feedbackProps} liveFeedbackEnabled={liveFeedbackEnabled} />
    </div>
  );
}

export function canvasFeedbackPayload(strokes: DrawingStroke[]): string {
  return serializeFeedbackPayload({ kind: "canvas", strokes });
}

export function canvasFeedbackKey(questionId: string): string {
  return feedbackKeyForCanvas(questionId);
}
