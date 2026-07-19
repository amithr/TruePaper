"use client";

import { AnnotateSourceResponder } from "@/components/response-types/AnnotateSourceResponder";
import { DrawDiagramResponder } from "@/components/response-types/DrawDiagramResponder";
import { GraphResponder } from "@/components/response-types/GraphResponder";
import { ExtendedWrittenResponder } from "@/components/response-types/ExtendedWrittenResponder";
import { LabellingResponder } from "@/components/response-types/LabellingResponder";
import { MatchingResponder } from "@/components/response-types/MatchingResponder";
import { MathInputResponder } from "@/components/response-types/MathInputResponder";
import { OrderingResponder } from "@/components/response-types/OrderingResponder";
import { PhotoHandwrittenResponder } from "@/components/response-types/PhotoHandwrittenResponder";
import { ShortAnswerResponder } from "@/components/response-types/ShortAnswerResponder";
import { StructuredMultiPartResponder } from "@/components/response-types/StructuredMultiPartResponder";
import { TrueFalseResponder } from "@/components/response-types/TrueFalseResponder";
import { ExamMarkdown } from "@/components/ExamMarkdown";
import { FormAssetImage } from "@/components/FormAssetImage";
import { StudentTeacherFeedbackCard } from "@/components/StudentTeacherFeedbackCard";
import type { Question } from "@/lib/forms";
import {
  parseResponseValue,
  serializeResponseValue,
} from "@/lib/response-types/answers";
import {
  getCanvasAnnotation,
  getDisplayMessage,
  getPartFeedback,
  getQuickNudge,
  migrateLegacyFeedback,
  type TeacherFeedbackStore,
} from "@/lib/response-types/feedback";
import { questionSupportsLiveFeedback } from "@/lib/response-types/registry";
import type {
  AnnotateSourceConfig,
  DrawDiagramConfig,
  ExtendedWrittenConfig,
  GraphConfig,
  LabellingConfig,
  MatchingConfig,
  MathInputConfig,
  OrderingConfig,
  PhotoHandwrittenConfig,
  StructuredMultiPartConfig,
} from "@/lib/response-types/types";
import { normalizeResponseType } from "@/lib/response-types/types";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import type { ReactNode } from "react";

type Props = {
  question: Question;
  index: number;
  answer: string | undefined;
  answered: boolean;
  examActive: boolean;
  disabled: boolean;
  protectTextarea: boolean;
  showLiveFeedbackFeature: boolean;
  feedbackStore: TeacherFeedbackStore;
  /** Green ✓ Saved under the answer fields (reserved height). */
  showSavedTick?: boolean;
  headerExtra?: ReactNode;
  onAnswerChange: (serialized: string) => void;
  onChoiceChange: (value: string) => void;
};

export function StudentResponseDispatcher({
  question,
  index,
  answer,
  answered,
  examActive,
  disabled,
  protectTextarea,
  showLiveFeedbackFeature,
  feedbackStore,
  showSavedTick = false,
  headerExtra,
  onAnswerChange,
  onChoiceChange,
}: Props) {
  const t = useTranslations();
  const type = normalizeResponseType(question.type);
  const headingId = `exam-q-${question.id}`;
  const value = parseResponseValue(type, answer);
  const store = migrateLegacyFeedback(feedbackStore);
  const quickNudge = getQuickNudge(store, question.id);
  const wholeMessage = getDisplayMessage(store, question.id);
  const canvasAnnotation = getCanvasAnnotation(store, question.id);
  const showFeedback =
    showLiveFeedbackFeature &&
    questionSupportsLiveFeedback(question.type) &&
    (wholeMessage.trim().length > 0 ||
      quickNudge.trim().length > 0 ||
      canvasAnnotation.length > 0);

  const partFeedback: Record<string, string> = {};
  if (type === "structuredMultiPart" && "parts" in question.responseConfig) {
    for (const part of (question.responseConfig as StructuredMultiPartConfig).parts) {
      const msg = getPartFeedback(store, question.id, part.id);
      if (msg.trim()) {
        partFeedback[part.id] = msg;
      }
    }
  }

  return (
    <article
      id={`exam-card-${question.id}`}
      className="tp-question-card tp-question-card--exam"
      data-answered={answered ? "true" : "false"}
      aria-labelledby={headingId}
    >
      <div className="tp-exam-q-head">
        <span className="tp-exam-q-head__num">Q{index + 1}</span>
        <span className="tp-exam-q-head__marks">
          {t("home.exam.marksLabel", { n: question.points })}
        </span>
        {headerExtra}
      </div>

      <div id={headingId} className="tp-exam-prompt">
        <ExamMarkdown className="min-w-0">
          {question.prompt || t("common.untitledQuestion")}
        </ExamMarkdown>
      </div>

      {question.promptImagePath ? (
        <FormAssetImage
          path={question.promptImagePath}
          alt={t("home.exam.promptImageAlt")}
          className="mt-3 overflow-hidden rounded-[12px] border border-[var(--tp-border)] bg-white"
        />
      ) : null}

      {type === "multipleChoice" && value.type === "multipleChoice" ? (
        <div className="tp-exam-choices" role="radiogroup" aria-labelledby={headingId}>
          {question.options.map((option, optionIndex) => {
            const selected = value.choice === option;
            return (
              <label
                key={`${question.id}-${optionIndex}`}
                className={`tp-exam-choice${selected ? " tp-exam-choice--selected" : ""}`}
              >
                <input
                  type="radio"
                  className="tp-exam-choice__input"
                  name={question.id}
                  value={option}
                  checked={selected}
                  disabled={disabled}
                  onChange={(event) => onChoiceChange(event.target.value)}
                />
                <span className="tp-exam-choice__label">
                  {option || t("home.builder.optionN", { n: optionIndex + 1 })}
                </span>
              </label>
            );
          })}
        </div>
      ) : null}

      {type === "shortAnswer" && value.type === "shortAnswer" ? (
        <ShortAnswerResponder
          id={question.id}
          value={value.text}
          disabled={disabled}
          onChange={(text) => onAnswerChange(serializeResponseValue({ type: "shortAnswer", text }))}
        />
      ) : null}

      {(type === "extendedWritten" || type === "text") && value.type === "extendedWritten" ? (
        <ExtendedWrittenResponder
          id={question.id}
          value={value.text}
          disabled={disabled}
          protect={protectTextarea}
          config={question.responseConfig as ExtendedWrittenConfig}
          onChange={(text) =>
            onAnswerChange(serializeResponseValue({ type: "extendedWritten", text }))
          }
        />
      ) : null}

      {type === "structuredMultiPart" && value.type === "structuredMultiPart" ? (
        <StructuredMultiPartResponder
          questionId={question.id}
          parts={value.parts}
          activePartId={value.activePartId}
          disabled={disabled}
          protect={protectTextarea}
          config={question.responseConfig as StructuredMultiPartConfig}
          partFeedback={partFeedback}
          onChange={(parts, activePartId) =>
            onAnswerChange(
              serializeResponseValue({
                type: "structuredMultiPart",
                parts,
                activePartId,
              }),
            )
          }
        />
      ) : null}

      {type === "annotateSource" && value.type === "annotateSource" ? (
        <AnnotateSourceResponder
          passageId={`passage-${question.id}`}
          highlights={value.highlights}
          disabled={disabled}
          config={question.responseConfig as AnnotateSourceConfig}
          onChange={(highlights) =>
            onAnswerChange(serializeResponseValue({ type: "annotateSource", highlights }))
          }
        />
      ) : null}

      {type === "drawDiagram" && value.type === "drawDiagram" ? (
        <DrawDiagramResponder
          strokes={value.strokes}
          disabled={disabled}
          config={question.responseConfig as DrawDiagramConfig}
          onChange={(strokes) =>
            onAnswerChange(serializeResponseValue({ type: "drawDiagram", strokes }))
          }
        />
      ) : null}

      {type === "graph" && value.type === "graph" ? (
        <GraphResponder
          points={value.points}
          lines={value.lines}
          labels={value.labels}
          disabled={disabled}
          config={question.responseConfig as GraphConfig}
          onChange={(points, lines, labels) =>
            onAnswerChange(serializeResponseValue({ type: "graph", points, lines, labels }))
          }
        />
      ) : null}

      {type === "photoHandwritten" && value.type === "photoHandwritten" ? (
        <PhotoHandwrittenResponder
          imageDataUrl={value.imageDataUrl}
          width={value.width}
          height={value.height}
          disabled={disabled}
          config={question.responseConfig as PhotoHandwrittenConfig}
          onChange={(imageDataUrl, width, height) =>
            onAnswerChange(
              serializeResponseValue({ type: "photoHandwritten", imageDataUrl, width, height }),
            )
          }
        />
      ) : null}

      {type === "trueFalse" && value.type === "trueFalse" ? (
        <TrueFalseResponder
          answer={value.answer}
          disabled={disabled}
          onChange={(tfAnswer) =>
            onAnswerChange(serializeResponseValue({ type: "trueFalse", answer: tfAnswer }))
          }
        />
      ) : null}

      {type === "matching" && value.type === "matching" ? (
        <MatchingResponder
          pairs={value.pairs}
          disabled={disabled}
          config={question.responseConfig as MatchingConfig}
          onChange={(pairs) =>
            onAnswerChange(serializeResponseValue({ type: "matching", pairs }))
          }
        />
      ) : null}

      {type === "ordering" && value.type === "ordering" ? (
        <OrderingResponder
          order={value.order}
          disabled={disabled}
          config={question.responseConfig as OrderingConfig}
          onChange={(order) =>
            onAnswerChange(serializeResponseValue({ type: "ordering", order }))
          }
        />
      ) : null}

      {type === "labelling" && value.type === "labelling" ? (
        <LabellingResponder
          assignments={value.assignments}
          disabled={disabled}
          config={question.responseConfig as LabellingConfig}
          onChange={(assignments) =>
            onAnswerChange(serializeResponseValue({ type: "labelling", assignments }))
          }
        />
      ) : null}

      {type === "mathInput" && value.type === "mathInput" ? (
        <MathInputResponder
          id={question.id}
          working={value.working}
          answer={value.answer}
          disabled={disabled}
          config={question.responseConfig as MathInputConfig}
          onChange={({ working, answer }) =>
            onAnswerChange(serializeResponseValue({ type: "mathInput", working, answer }))
          }
        />
      ) : null}

      <div className="tp-exam-saved" aria-live="polite">
        {showSavedTick && examActive ? (
          <span className="tp-exam-saved__tick">
            <span aria-hidden>✓</span> {t("home.exam.questionSaved")}
          </span>
        ) : null}
      </div>

      {showFeedback ? (
        <div className="tp-exam-feedback-stack">
          {quickNudge ? (
            <p className="tp-exam-nudge">{quickNudge}</p>
          ) : null}
          {wholeMessage ? <StudentTeacherFeedbackCard message={wholeMessage} /> : null}
          {canvasAnnotation.length > 0 && value.type === "photoHandwritten" && value.imageDataUrl ? (
            <div>
              <p className="mb-2 text-xs font-medium text-[var(--tp-text-secondary)]">
                {t("responseTypes.feedback.annotation")}
              </p>
              <DrawingCanvas
                width={value.width || 600}
                height={value.height || 400}
                strokes={canvasAnnotation}
                backgroundImageUrl={value.imageDataUrl}
                readOnly
              />
            </div>
          ) : null}
          {canvasAnnotation.length > 0 && value.type === "drawDiagram" ? (
            <div>
              <p className="mb-2 text-xs font-medium text-[var(--tp-text-secondary)]">
                {t("responseTypes.feedback.annotation")}
              </p>
              <DrawingCanvas
                width={(question.responseConfig as DrawDiagramConfig).width ?? 600}
                height={(question.responseConfig as DrawDiagramConfig).height ?? 360}
                strokes={canvasAnnotation}
                readOnly
              />
            </div>
          ) : null}
          {canvasAnnotation.length > 0 && value.type === "graph" ? (
            <div>
              <p className="mb-2 text-xs font-medium text-[var(--tp-text-secondary)]">
                {t("responseTypes.feedback.annotation")}
              </p>
              <DrawingCanvas
                width={(question.responseConfig as GraphConfig).width ?? 480}
                height={(question.responseConfig as GraphConfig).height ?? 480}
                strokes={canvasAnnotation}
                readOnly
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
