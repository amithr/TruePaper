"use client";

import { useTranslations } from "@/lib/i18n/I18nProvider";

/** Terminal screen on the old device after the teacher moved the attempt elsewhere. */
export function StudentExamMovedCard() {
  const t = useTranslations();
  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[var(--tp-surface)]/95 p-6 text-center shadow-lg backdrop-blur-sm tp-anim-fade-in"
      role="alert"
      data-testid="student-exam-moved"
    >
      <p className="text-lg font-semibold text-[var(--tp-text)]">
        {t("home.rejoinDevice.movedTitle")}
      </p>
      <p className="max-w-md text-sm text-[var(--tp-text-secondary)]">
        {t("home.rejoinDevice.movedHint")}
      </p>
    </div>
  );
}
