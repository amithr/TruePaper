"use client";

import type { Ref } from "react";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing } from "@/lib/ui";

type Props = {
  blankCount: number;
  questionCount: number;
  confirming: boolean;
  submitting: boolean;
  resumeCode?: string | null;
  autosaveStatusRef?: Ref<HTMLParagraphElement>;
  onHandIn: () => void;
  onCancelConfirm?: () => void;
};

/** Bottom hand-in panel with blank-confirm step and quiet resume-code hint. */
export function StudentExamHandIn({
  blankCount,
  questionCount,
  confirming,
  submitting,
  resumeCode,
  autosaveStatusRef,
  onHandIn,
  onCancelConfirm,
}: Props) {
  const t = useTranslations();
  const allAnswered = questionCount > 0 && blankCount === 0;

  const title = confirming
    ? t("home.exam.handInConfirmTitle", { k: blankCount })
    : allAnswered
      ? t("home.exam.handInAllAnswered")
      : t("home.exam.handInStillBlank", { k: blankCount, n: questionCount });

  return (
    <div className="tp-exam-handin">
      <div className="tp-exam-handin__card">
        <p className="tp-exam-handin__title">{title}</p>
        <p className="tp-exam-handin__hint">{t("home.exam.handInHint")}</p>
        <div className="tp-exam-handin__actions">
          {confirming && onCancelConfirm ? (
            <button
              type="button"
              className={`tp-exam-handin__cancel ${focusRing}`}
              onClick={onCancelConfirm}
              disabled={submitting}
            >
              {t("common.back")}
            </button>
          ) : null}
          <button
            type="button"
            className={`tp-exam-handin__btn ${focusRing}${
              submitting ? " tp-exam-handin__btn--busy" : ""
            }`}
            onClick={onHandIn}
            disabled={submitting || questionCount === 0}
            aria-busy={submitting}
            aria-label={
              submitting
                ? t("common.submitting")
                : confirming
                  ? t("home.exam.handInAnywayAria")
                  : t("home.exam.handInAria")
            }
          >
            {submitting
              ? t("common.submitting")
              : confirming
                ? t("home.exam.handInAnyway")
                : t("home.exam.handIn")}
          </button>
        </div>
      </div>
      <p className="tp-exam-handin__resume">
        {resumeCode ? (
          <>
            {t("home.exam.resumeHintPrefix")}{" "}
            <code className="tp-exam-handin__code">{resumeCode}</code>
          </>
        ) : (
          t("home.exam.resumeHintAsk")
        )}
      </p>
      <p
        ref={autosaveStatusRef}
        data-testid="student-autosave-status"
        className="sr-only"
        aria-live="polite"
      />
    </div>
  );
}
