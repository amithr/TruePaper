"use client";

import { TeacherAvatar } from "@/components/TeacherAvatar";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import type { SessionHost } from "@/lib/session-host";

type Props = {
  message: string;
  /** When known, the bubble is signed by the teacher (photo + name). */
  host?: SessionHost | null;
};

/** Live teacher note under a student answer — calm “bubble” treatment. */
export function StudentTeacherFeedbackCard({ message, host = null }: Props) {
  const t = useTranslations();
  const trimmed = message.trim();

  return (
    <aside className="tp-exam-fb-bubble" role="status" aria-live="polite" aria-atomic="true">
      <p className="tp-exam-fb-bubble__title">
        {host?.displayName ? (
          <>
            <TeacherAvatar size="xs" name={host.displayName} avatarUrl={host.avatarUrl} />
            {t("feedback.fromTeacher", { name: host.displayName })}
          </>
        ) : (
          <>
            <span aria-hidden className="tp-exam-fb-bubble__dot" />
            {t("feedback.title")}
          </>
        )}
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
