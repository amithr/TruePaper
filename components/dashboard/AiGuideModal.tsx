"use client";

import { useEffect } from "react";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing, ui } from "@/lib/ui";

type Props = {
  open: boolean;
  onClose: () => void;
  onImportExam: () => void;
};

const STEPS = ["download", "uploadAi", "ask", "save", "import", "matchTypes"] as const;

export function AiGuideModal({ open, onClose, onImportExam }: Props) {
  const t = useTranslations();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-guide-dialog-title"
        className={`${ui.card} w-full max-w-lg p-6 shadow-xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={ui.sectionTitle}>{t("formLibrary.import.aiGuideEyebrow")}</p>
            <h2 id="ai-guide-dialog-title" className="mt-1 text-xl font-semibold tracking-tight">
              {t("formLibrary.import.aiGuideTitle")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`${ui.btnGhost} px-2 py-1 text-sm ${focusRing}`}
            aria-label={t("common.close")}
          >
            ×
          </button>
        </div>

        <p className="mt-3 text-sm text-[var(--tp-text-secondary)]">
          {t("formLibrary.import.aiGuideIntro")}
        </p>

        <ol className="mt-5 space-y-3 text-sm text-[var(--tp-text)]">
          {STEPS.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--tp-bg-subtle)] text-xs font-semibold"
                aria-hidden
              >
                {index + 1}
              </span>
              <span>{t(`formLibrary.import.aiGuideSteps.${step}`)}</span>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <a
            href="/api/forms/ai-template"
            download
            className={`${ui.btnPrimary} inline-flex items-center gap-2 ${focusRing}`}
          >
            <svg
              aria-hidden
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
            </svg>
            {t("formLibrary.import.downloadTemplate")}
          </a>
          <button
            type="button"
            onClick={() => {
              onClose();
              onImportExam();
            }}
            className={`${ui.btnSecondary} ${focusRing}`}
          >
            {t("formLibrary.import.importExam")}
          </button>
        </div>
      </div>
    </div>
  );
}
