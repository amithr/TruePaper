"use client";

import { StudentExamTextarea } from "@/components/StudentExamTextarea";
import { StudentTeacherFeedbackCard } from "@/components/StudentTeacherFeedbackCard";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import type { Question } from "@/lib/forms";

type Props = {
  question: Question;
  index: number;
  answer: string | undefined;
  answered: boolean;
  examActive: boolean;
  disabled: boolean;
  protectTextarea: boolean;
  showLiveFeedbackFeature: boolean;
  showLiveTeacherFeedbackCard: boolean;
  liveTeacherFeedbackMessage: string;
  onChoiceChange: (value: string) => void;
  onTextChange: (value: string) => void;
};

export function StudentExamQuestion({
  question,
  index,
  answer,
  answered,
  examActive,
  disabled,
  protectTextarea,
  showLiveFeedbackFeature,
  showLiveTeacherFeedbackCard,
  liveTeacherFeedbackMessage,
  onChoiceChange,
  onTextChange,
}: Props) {
  const t = useTranslations();
  const headingId = `exam-q-${question.id}`;
  const pointsLabel = t("home.exam.questionPts", { n: question.points });

  return (
    <article
      className={`tp-question-card tp-question-card--exam${
        answered && examActive ? " tp-question-card--answered" : ""
      }`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h3 id={headingId} className="text-base font-semibold text-[var(--tp-text)]">
          {index + 1}. {question.prompt || t("common.untitledQuestion")}
        </h3>
        {answered && examActive ? (
          <span
            key={`answered-${question.id}-badge`}
            className="tp-answered-badge"
            aria-label={t("home.exam.answered")}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12l5 5L20 7" />
            </svg>
            {t("home.exam.answered")}
          </span>
        ) : null}
      </div>

      {question.type === "multipleChoice" ? (
        <div
          className="tp-exam-choices"
          role="radiogroup"
          aria-labelledby={headingId}
        >
          {question.options.map((option, optionIndex) => {
            const selected = answer === option;
            const optionLabel = option || t("home.builder.optionN", { n: optionIndex + 1 });
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
                <span className="tp-exam-choice__label">{optionLabel}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <StudentExamTextarea
            id={question.id}
            rows={4}
            value={answer ?? ""}
            disabled={disabled}
            protect={protectTextarea}
            onValueChange={onTextChange}
            placeholder={t("home.exam.typeResponse")}
            className="tp-input tp-exam-textarea"
          />
          {showLiveTeacherFeedbackCard ? (
            <StudentTeacherFeedbackCard message={liveTeacherFeedbackMessage} />
          ) : null}
        </div>
      )}

      <div className="tp-exam-q-meta">
        <span className="tp-exam-q-badge tp-exam-q-badge--points">{pointsLabel}</span>
        {question.type === "text" ? (
          <span className="tp-exam-q-badge tp-exam-q-badge--type">{t("home.exam.written")}</span>
        ) : null}
        {question.type === "text" && showLiveFeedbackFeature ? (
          <span className="tp-exam-q-badge tp-exam-q-badge--feature">
            {t("home.exam.liveFeedbackOn")}
          </span>
        ) : null}
      </div>
    </article>
  );
}
