"use client";

import { useTranslations } from "@/lib/i18n/I18nProvider";

type Props = {
  message: string;
};

/** Shown under each text answer when live teacher feedback is enabled for the form. */
export function StudentTeacherFeedbackCard({ message }: Props) {
  const t = useTranslations();
  const trimmed = message.trim();

  return (
    <aside className="tp-teacher-feedback-card" role="status" aria-live="polite" aria-atomic="true">
      <p className="tp-teacher-feedback-card__title">{t("feedback.title")}</p>
      {trimmed ? (
        <p
          data-testid="student-teacher-feedback-body"
          className="tp-teacher-feedback-card__body whitespace-pre-wrap"
        >
          {message}
        </p>
      ) : (
        <p className="tp-teacher-feedback-card__placeholder">{t("feedback.placeholder")}</p>
      )}
    </aside>
  );
}
