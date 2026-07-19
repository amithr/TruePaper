"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { DrawingCanvas } from "@/components/DrawingCanvas";
import { AnnotateSourceResponder } from "@/components/response-types/AnnotateSourceResponder";
import { GraphCanvas } from "@/components/response-types/GraphCanvas";
import { WatchResponseBox } from "@/components/watch/WatchResponseBox";
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
  /** Inserted between the response and feedback (score stepper). */
  scoreSlot?: ReactNode;
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
    <div className="tp-watch-feedback">
      <div className="tp-watch-feedback__head">
        <span className="tp-watch-feedback__label">{t("session.watch.feedback")}</span>
        <span className="tp-watch-feedback__hint">
          {liveFeedbackEnabled ? t("session.watch.feedbackLiveHint") : feedbackHint}
        </span>
        <span
          data-testid="teacher-live-feedback-status"
          data-state={isSaving ? "saving" : "saved"}
          className="tp-watch-feedback__status"
        >
          {isSaving ? t("common.saving") : null}
        </span>
      </div>
      <textarea
        rows={3}
        data-testid="teacher-live-feedback-input"
        value={draftMessage}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("session.watch.feedbackPlaceholder")}
        className={`tp-watch-feedback__input ${focusRing}`}
      />
    </div>
  );
}

function WatchQuestionBlock({
  children,
  scoreSlot,
  feedback,
}: {
  children: ReactNode;
  scoreSlot?: ReactNode;
  feedback: Omit<FeedbackEditorProps, "questionId"> & { liveFeedbackEnabled: boolean };
}) {
  return (
    <div className="space-y-3">
      {children}
      {scoreSlot}
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
  scoreSlot,
}: Props) {
  const t = useTranslations();
  const type = normalizeResponseType(question.type);
  const value = parseResponseValue(type, rawAnswer);
  const savedMsg = getDisplayMessage(feedbackStore, question.id);
  const draftMsg = liveFeedbackDraftsByQuestionId[question.id] ?? "";
  const showFeedbackEditor =
    liveFeedbackEnabled ||
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
    const empty = !value.choice;
    return (
      <WatchQuestionBlock feedback={feedbackBundle} scoreSlot={scoreSlot}>
        <WatchResponseBox empty={empty} testId="teacher-watch-answer">
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
        </WatchResponseBox>
      </WatchQuestionBlock>
    );
  }

  if (type === "trueFalse" && value.type === "trueFalse") {
    const empty = value.answer === null;
    return (
      <WatchQuestionBlock feedback={feedbackBundle} scoreSlot={scoreSlot}>
        <WatchResponseBox empty={empty} testId="teacher-watch-answer">
          <p className="text-sm font-medium">
            {value.answer
              ? t("responseTypes.trueFalse.true")
              : t("responseTypes.trueFalse.false")}
          </p>
        </WatchResponseBox>
      </WatchQuestionBlock>
    );
  }

  if (type === "matching" && value.type === "matching") {
    const config = question.responseConfig as MatchingConfig;
    const left = config.left ?? [];
    const right = config.right ?? [];
    const rightById = Object.fromEntries(right.map((r) => [r.id, r.text]));
    return (
      <WatchQuestionBlock feedback={feedbackBundle} scoreSlot={scoreSlot}>
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
      <WatchQuestionBlock feedback={feedbackBundle} scoreSlot={scoreSlot}>
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
      <WatchQuestionBlock feedback={feedbackBundle} scoreSlot={scoreSlot}>
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
      <WatchQuestionBlock feedback={feedbackBundle} scoreSlot={scoreSlot}>
        <div className="space-y-3" data-testid="teacher-watch-answer">
          <WatchResponseBox
            empty={!working}
            label={t("responseTypes.mathInput.workingLabel")}
          >
            <pre className="tp-watch-response__pre">{working}</pre>
          </WatchResponseBox>
          <WatchResponseBox
            empty={!answer}
            label={t("responseTypes.mathInput.answerLabel")}
            emphasis
          >
            <pre className="tp-watch-response__pre tp-watch-response__pre--final">{answer}</pre>
          </WatchResponseBox>
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
        {scoreSlot}
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
        {!hasStudentWork ? <WatchResponseBox empty /> : null}
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
        {scoreSlot}
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
          <div
            className="relative overflow-hidden rounded-[10px] border border-[var(--tp-border)]"
            data-testid="teacher-watch-answer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.imageDataUrl}
              alt={t("responseTypes.photoHandwritten.previewAlt")}
              className="max-h-[480px] w-full object-contain bg-white"
            />
          </div>
        ) : (
          <WatchResponseBox empty testId="teacher-watch-answer" />
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
        {scoreSlot}
        <WrittenFeedbackBlock {...feedbackBundle} />
      </div>
    );
  }

  if (type === "annotateSource" && value.type === "annotateSource") {
    return (
      <WatchQuestionBlock feedback={feedbackBundle} scoreSlot={scoreSlot}>
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

  const textEmpty = !textPreview.trim();
  return (
    <WatchQuestionBlock feedback={feedbackBundle} scoreSlot={scoreSlot}>
      <WatchResponseBox empty={textEmpty} testId="teacher-watch-answer">
        <pre className="tp-watch-response__pre whitespace-pre-wrap">{textPreview}</pre>
      </WatchResponseBox>
    </WatchQuestionBlock>
  );
}

export function canvasFeedbackPayload(strokes: DrawingStroke[]): string {
  return serializeFeedbackPayload({ kind: "canvas", strokes });
}

export function canvasFeedbackKey(questionId: string): string {
  return feedbackKeyForCanvas(questionId);
}
