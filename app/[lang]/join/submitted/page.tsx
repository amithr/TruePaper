"use client";

import { LanguageToggle } from "@/components/LanguageToggle";
import { useTranslations } from "@/lib/i18n/I18nProvider";

export default function ExamSubmittedPage() {
  const t = useTranslations();

  return (
    <div className="min-h-screen bg-[var(--tp-bg)]">
      <div className="pointer-events-none fixed right-4 top-4 z-50 sm:right-6 sm:top-6">
        <div className="pointer-events-auto">
          <LanguageToggle />
        </div>
      </div>
      <main
        className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-16 text-center"
        data-testid="exam-submitted-page"
      >
        <div className="w-full space-y-5 rounded-[var(--tp-radius)] border border-[var(--tp-success-border)] bg-[var(--tp-surface)] px-8 py-10 shadow-sm">
          <span aria-hidden className="mx-auto inline-flex">
            <svg
              className="h-14 w-14 text-[var(--tp-mint)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </span>
          <h1 className="text-2xl font-semibold text-[var(--tp-text)]">{t("home.submitted.title")}</h1>
          <p className="text-base text-[var(--tp-text-secondary)]">{t("home.submitted.message")}</p>
          <p className="text-sm text-[var(--tp-text-muted)]">{t("home.submitted.closeHint")}</p>
        </div>
      </main>
    </div>
  );
}
