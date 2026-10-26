"use client";

import { Check } from "lucide-react";

import { StudentResponseDispatcher } from "@/components/response-types/StudentResponseDispatcher";
import type { Question } from "@/lib/forms";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { answerKeyView } from "@/lib/review/answer-key";

type Props = {
  question: Question;
  index: number;
  /** Show the answer key on the blank card (where the type has one). */
  revealed: boolean;
};

const noop = () => undefined;

/**
 * One question as the students saw it, blank and inert. With `revealed`, the
 * same card shows the key as if it had been chosen, or accepted answers as chips.
 */
export function ReviewSlide({ question, index, revealed }: Props) {
  const t = useTranslations();
  const key = answerKeyView(question);
  const wireAnswer = revealed && key?.kind === "wire" ? key.answer : undefined;

  return (
    <div className="tp-present-slide" data-revealed={revealed && key ? "true" : undefined} data-testid="review-slide">
      {revealed && key ? (
        <span className="tp-present-answer-badge" data-testid="review-answer-badge">
          <Check aria-hidden className="h-4 w-4" />
          {t("review.present.answerBadge")}
        </span>
      ) : null}
      <StudentResponseDispatcher
        question={question}
        index={index}
        answer={wireAnswer}
        answered={false}
        examActive={false}
        disabled
        protectTextarea={false}
        showLiveFeedbackFeature={false}
        feedbackStore={{}}
        onAnswerChange={noop}
        onChoiceChange={noop}
      />
      {revealed && key?.kind === "list" ? (
        <div className="tp-present-accepted" data-testid="review-accepted-answers">
          <p className="tp-present-accepted__label">{t("review.present.acceptedAnswers")}</p>
          <div className="tp-present-accepted__chips">
            {key.answers.map((answer) => (
              <span key={answer} className="tp-present-accepted__chip">
                {answer}
              </span>
            ))}
          </div>
          {key.caseSensitive ? (
            <p className="tp-present-accepted__note">{t("review.present.caseSensitiveNote")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
