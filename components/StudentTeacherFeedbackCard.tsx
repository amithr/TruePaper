"use client";

import { useTranslations } from "@/lib/i18n/I18nProvider";

type Props = {
  message: string;
};

/** Live teacher note under a student answer — calm “bubble” treatment. */
export function StudentTeacherFeedbackCard({ message }: Props) {
  const t = useTranslations();
  const trimmed = message.trim();

  return (
    <aside className="tp-exam-fb-bubble" role="status" aria-live="polite" aria-atomic="true">
      <p className="tp-exam-fb-bubble__title">
        <span aria-hidden className="tp-exam-fb-bubble__dot" />
        {t("feedback.title")}
      </p>
      {trimmed ? (
        <p
          data-testid="student-teacher-feedback-body"
          className="tp-exam-fb-bubble__body whitespace-pre-wrap"
        >
          {message}
        </p>
      ) : (
        <p className="tp-exam-fb-bubble__placeholder">{t("feedback.placeholder")}</p>
      )}
    </aside>
  );
}
