"use client";

import { DrawingCanvas } from "@/components/DrawingCanvas";
import { AnnotateSourceResponder } from "@/components/response-types/AnnotateSourceResponder";
import { GraphCanvas } from "@/components/response-types/GraphCanvas";
import { LabellingResponder } from "@/components/response-types/LabellingResponder";
import { MatchingResponder } from "@/components/response-types/MatchingResponder";
import { OrderingResponder } from "@/components/response-types/OrderingResponder";
import { StructuredMultiPartResponder } from "@/components/response-types/StructuredMultiPartResponder";
import { TrueFalseResponder } from "@/components/response-types/TrueFalseResponder";
import { StudentTeacherFeedbackCard } from "@/components/StudentTeacherFeedbackCard";
import type { Question } from "@/lib/forms";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { isResponseAnswered, parseResponseValue } from "@/lib/response-types/answers";
import { drawDiagramBackgroundUrl } from "@/lib/response-types/drawing";
import { getCanvasAnnotation } from "@/lib/response-types/feedback";
import type {
  AnnotateSourceConfig,
  DrawDiagramConfig,
  GraphConfig,
  LabellingConfig,
  MatchingConfig,
  OrderingConfig,
  StructuredMultiPartConfig,
} from "@/lib/response-types/types";
import { normalizeResponseType } from "@/lib/response-types/types";

type Props = {
  question: Question;
  answer: string | undefined;
  /** Whole-question teacher message; empty string hides the card. */
  feedbackMessage: string;
  /** Full feedback store — used for canvas annotations. */
  feedbackStore: Record<string, string>;
};

const noop = () => {};

/** Read-only rendering of a student's answer for the public review page. */
export function ReviewResponseView({ question, answer, feedbackMessage, feedbackStore }: Props) {
  const t = useTranslations();
  const type = normalizeResponseType(question.type);
  const value = parseResponseValue(type, answer);
  const answered = isResponseAnswered(type, answer);
  const annotation = getCanvasAnnotation(feedbackStore, question.id);

  const noAnswerNote = !answered ? (
    <p className="text-xs text-[var(--tp-text-muted)]">{t("review.noAnswer")}</p>
  ) : null;

  const annotationBlock = (node: React.ReactNode) =>
    annotation.length > 0 ? (
      <div>
        <p className="mb-2 text-xs font-medium text-[var(--tp-text-secondary)]">
          {t("responseTypes.feedback.annotation")}
        </p>
        {node}
      </div>
    ) : null;

  let body: React.ReactNode = null;

  if (type === "multipleChoice" && value.type === "multipleChoice") {
    body = (
      <>
        <div className="space-y-2">
          {question.options.map((option, optionIndex) => (
            <label
              key={`${question.id}-${optionIndex}`}
              className="flex cursor-default items-center gap-2 text-sm"
            >
              <input
                type="radio"
                name={question.id}
                value={option}
                checked={value.choice === option}
                disabled
                readOnly
              />
              <span>{option || t("review.optionN", { n: optionIndex + 1 })}</span>
            </label>
          ))}
        </div>
        {noAnswerNote}
      </>
    );
  } else if (type === "mathInput" && value.type === "mathInput") {
    const working = value.working.trim();
    const finalAnswer = value.answer.trim() || (value.latex ?? "").trim();
    body = (
      <>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--tp-text-muted)]">
            {t("responseTypes.mathInput.workingLabel")}
          </p>
          <textarea
            readOnly
            rows={4}
            value={working}
            placeholder={t("review.noAnswer")}
            className="w-full resize-y rounded-md border border-[var(--tp-border-strong)] bg-[var(--tp-bg-subtle)] px-3 py-2 font-mono text-sm text-[var(--tp-text)]"
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--tp-text-muted)]">
            {t("responseTypes.mathInput.answerLabel")}
          </p>
          <input
            readOnly
            value={finalAnswer}
            placeholder={t("review.noAnswer")}
            className="w-full rounded-md border border-[var(--tp-border-strong)] bg-[var(--tp-bg-subtle)] px-3 py-2 font-mono text-sm text-[var(--tp-text)]"
          />
        </div>
      </>
    );
  } else if (type === "drawDiagram" && value.type === "drawDiagram") {
    const config = question.responseConfig as DrawDiagramConfig;
    const width = Math.max(320, Math.min(800, config.width ?? 600));
    const height = Math.max(200, Math.min(600, config.height ?? 360));
    const background = drawDiagramBackgroundUrl(config, question.promptImagePath);
    body = (
      <>
        <DrawingCanvas
          width={width}
          height={height}
          strokes={value.strokes}
          backgroundImageUrl={background}
          readOnly
          data-testid="review-draw-answer"
        />
        {noAnswerNote}
        {annotationBlock(
          <DrawingCanvas
            width={width}
            height={height}
            strokes={annotation}
            backgroundImageUrl={background}
            readOnly
          />,
        )}
      </>
    );
  } else if (type === "graph" && value.type === "graph") {
    const config = question.responseConfig as GraphConfig;
    body = (
      <>
        <GraphCanvas
          config={config}
          points={value.points}
          lines={value.lines}
          labels={value.labels}
          readOnly
          data-testid="review-graph-answer"
        />
        {noAnswerNote}
        {annotationBlock(
          <DrawingCanvas
            width={Math.max(320, Math.min(640, config.width ?? 480))}
            height={Math.max(320, Math.min(640, config.height ?? 480))}
            strokes={annotation}
            readOnly
          />,
        )}
      </>
    );
  } else if (type === "photoHandwritten" && value.type === "photoHandwritten") {
    body = (
      <>
        {value.imageDataUrl ? (
          <div className="overflow-hidden rounded-[10px] border border-[var(--tp-border)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.imageDataUrl}
              alt={t("responseTypes.photoHandwritten.previewAlt")}
              className="max-h-[480px] w-full bg-white object-contain"
              data-testid="review-photo-answer"
            />
          </div>
        ) : (
          noAnswerNote
        )}
        {value.imageDataUrl
          ? annotationBlock(
              <DrawingCanvas
                width={value.width || 600}
                height={value.height || 400}
                strokes={annotation}
                backgroundImageUrl={value.imageDataUrl}
                readOnly
              />,
            )
          : null}
      </>
    );
  } else if (type === "trueFalse" && value.type === "trueFalse") {
    body = (
      <>
        <TrueFalseResponder answer={value.answer} disabled onChange={noop} />
        {noAnswerNote}
      </>
    );
  } else if (type === "matching" && value.type === "matching") {
    body = (
      <>
        <MatchingResponder
          pairs={value.pairs}
          disabled
          config={question.responseConfig as MatchingConfig}
          onChange={noop}
        />
        {noAnswerNote}
      </>
    );
  } else if (type === "ordering" && value.type === "ordering") {
    body = (
      <>
        <OrderingResponder
          order={value.order}
          disabled
          config={question.responseConfig as OrderingConfig}
          onChange={noop}
        />
        {noAnswerNote}
      </>
    );
  } else if (type === "labelling" && value.type === "labelling") {
    body = (
      <>
        <LabellingResponder
          assignments={value.assignments}
          disabled
          config={question.responseConfig as LabellingConfig}
          onChange={noop}
        />
        {noAnswerNote}
      </>
    );
  } else if (type === "structuredMultiPart" && value.type === "structuredMultiPart") {
    body = (
      <>
        <StructuredMultiPartResponder
          questionId={`review-${question.id}`}
          parts={value.parts}
          activePartId={undefined}
          disabled
          protect={false}
          config={question.responseConfig as StructuredMultiPartConfig}
          onChange={noop}
        />
        {noAnswerNote}
      </>
    );
  } else if (type === "annotateSource" && value.type === "annotateSource") {
    body = (
      <>
        <AnnotateSourceResponder
          passageId={`review-passage-${question.id}`}
          highlights={value.highlights}
          disabled
          config={question.responseConfig as AnnotateSourceConfig}
          onChange={noop}
        />
        {noAnswerNote}
      </>
    );
  } else {
    // shortAnswer / extendedWritten / legacy text — plain string answers.
    body = (
      <textarea
        readOnly
        rows={6}
        value={answer ?? ""}
        placeholder={t("review.noAnswer")}
        className="w-full resize-y rounded-md border border-[var(--tp-border-strong)] bg-[var(--tp-bg-subtle)] px-3 py-2 text-sm text-[var(--tp-text)]"
      />
    );
  }

  return (
    <div className="space-y-3">
      {body}
      {feedbackMessage.trim().length > 0 ? (
        <StudentTeacherFeedbackCard message={feedbackMessage} />
      ) : null}
    </div>
  );
}
