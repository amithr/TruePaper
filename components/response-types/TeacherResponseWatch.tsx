"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { DrawingCanvas } from "@/components/DrawingCanvas";
import { AnnotateSourceResponder } from "@/components/response-types/AnnotateSourceResponder";
import { GraphCanvas } from "@/components/response-types/GraphCanvas";
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
  type AnnotateSourceConfig,
  type DrawDiagramConfig,
  type GraphConfig,
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
          className="mt-2 w-full rounded-md border border-[var(--tp-accent-border)] bg-[var(--tp-surface)] px-3 py-2 text-sm text-[var(--tp-text)]"
        />
      </label>
    </div>
  );
}

function WatchQuestionBlock({
  children,
  feedback,
}: {
  children: ReactNode;
  feedback: Omit<FeedbackEditorProps, "questionId"> & { liveFeedbackEnabled: boolean };
}) {
  return (
    <div className="space-y-3">
      {children}
      <WrittenFeedbackBlock {...feedback} />
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

  const feedbackBundle = {
    showEditor: showFeedbackEditor,
    draftMessage: draftMsg,
    isSaving: isSavingNow,
    feedbackHint: t("session.watch.feedbackSavedLive"),
    liveFeedbackEnabled,
    onFocus: () => onFeedbackFocus(question.id),
    onBlur: () => onFeedbackBlur(question.id),
    onChange: (next: string) => onFeedbackChange(question.id, next),
  };

  if (type === "multipleChoice" && value.type === "multipleChoice") {
    return (
      <WatchQuestionBlock feedback={feedbackBundle}>
        <div className="space-y-2" data-testid="teacher-watch-answer">
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
      </WatchQuestionBlock>
    );
  }

  if (type === "trueFalse" && value.type === "trueFalse") {
    return (
      <WatchQuestionBlock feedback={feedbackBundle}>
        <p className="text-sm font-medium" data-testid="teacher-watch-answer">
          {value.answer === null
            ? t("session.watch.noResponse")
            : value.answer
              ? t("responseTypes.trueFalse.true")
              : t("responseTypes.trueFalse.false")}
        </p>
      </WatchQuestionBlock>
    );
  }

  if (type === "matching" && value.type === "matching") {
    const config = question.responseConfig as MatchingConfig;
    const left = config.left ?? [];
    const right = config.right ?? [];
    const rightById = Object.fromEntries(right.map((r) => [r.id, r.text]));
    return (
      <WatchQuestionBlock feedback={feedbackBundle}>
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
      </WatchQuestionBlock>
    );
  }

  if (type === "ordering" && value.type === "ordering") {
    const config = question.responseConfig as OrderingConfig;
    const itemById = Object.fromEntries((config.items ?? []).map((i) => [i.id, i.text]));
    const order = value.order.length > 0 ? value.order : (config.items ?? []).map((i) => i.id);
    return (
      <WatchQuestionBlock feedback={feedbackBundle}>
        <ol className="list-decimal space-y-1 pl-5 text-sm" data-testid="teacher-watch-answer">
          {order.map((id) => (
            <li key={id}>{itemById[id] ?? id}</li>
          ))}
        </ol>
      </WatchQuestionBlock>
    );
  }

  if (type === "labelling" && value.type === "labelling") {
    const config = question.responseConfig as LabellingConfig;
    const termById = Object.fromEntries((config.terms ?? []).map((term) => [term.id, term.text]));
    return (
      <WatchQuestionBlock feedback={feedbackBundle}>
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
      </WatchQuestionBlock>
    );
  }

  if (type === "mathInput" && value.type === "mathInput") {
    const working = value.working.trim();
    const answer = value.answer.trim() || (value.latex ?? "").trim();
    return (
      <WatchQuestionBlock feedback={feedbackBundle}>
        <div className="space-y-3" data-testid="teacher-watch-answer">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--tp-text-muted)]">
              {t("responseTypes.mathInput.workingLabel")}
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] px-3 py-2 font-mono text-sm text-[var(--tp-text-secondary)]">
              {working || t("session.watch.noResponse")}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--tp-text)]">
              {t("responseTypes.mathInput.answerLabel")}
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-[var(--tp-radius-sm)] border-2 border-[var(--tp-accent-border)] bg-[var(--tp-surface)] px-3 py-3 font-mono text-base font-semibold text-[var(--tp-text)]">
              {answer || t("session.watch.noResponse")}
            </pre>
          </div>
        </div>
      </WatchQuestionBlock>
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
        <WrittenFeedbackBlock {...feedbackBundle} />
      </div>
    );
  }

  if (type === "graph" && value.type === "graph") {
    const config = question.responseConfig as GraphConfig;
    const width = Math.max(320, Math.min(640, config.width ?? 480));
    const height = Math.max(320, Math.min(640, config.height ?? 480));
    const hasStudentWork =
      value.points.length > 0 ||
      value.lines.length > 0 ||
      value.labels.some((label) => label.text.trim().length > 0);
    return (
      <div className="space-y-3">
        <GraphCanvas
          config={config}
          points={value.points}
          lines={value.lines}
          labels={value.labels}
          readOnly
          data-testid="teacher-watch-answer"
        />
        {!hasStudentWork ? (
          <p className="text-sm text-[var(--tp-text-secondary)]">{t("session.watch.noResponse")}</p>
        ) : null}
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
        <WrittenFeedbackBlock {...feedbackBundle} />
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
        <WrittenFeedbackBlock {...feedbackBundle} />
      </div>
    );
  }

  if (type === "annotateSource" && value.type === "annotateSource") {
    return (
      <WatchQuestionBlock feedback={feedbackBundle}>
        <AnnotateSourceResponder
          passageId={`watch-passage-${question.id}`}
          highlights={value.highlights}
          disabled
          config={question.responseConfig as AnnotateSourceConfig}
          onChange={() => {}}
        />
      </WatchQuestionBlock>
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
    <WatchQuestionBlock feedback={feedbackBundle}>
      <textarea
        readOnly
        rows={6}
        data-testid="teacher-watch-answer"
        value={textPreview}
        placeholder={t("session.watch.noResponse")}
        onFocus={() => onFeedbackFocus(question.id)}
        className="w-full resize-y rounded-md border border-[var(--tp-border)] bg-[var(--tp-surface)] px-3 py-2 text-sm text-[var(--tp-text)]"
      />
    </WatchQuestionBlock>
  );
}

export function canvasFeedbackPayload(strokes: DrawingStroke[]): string {
  return serializeFeedbackPayload({ kind: "canvas", strokes });
}

export function canvasFeedbackKey(questionId: string): string {
  return feedbackKeyForCanvas(questionId);
}
