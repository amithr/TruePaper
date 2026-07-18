"use client";

import { useEffect, useRef, useState } from "react";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing, ui } from "@/lib/ui";

type Props = {
  open: boolean;
  importing: boolean;
  onClose: () => void;
  onImport: (file: File) => void;
};

export function ImportExamModal({ open, importing, onClose, onImport }: Props) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !importing) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, importing, onClose]);

  if (!open) {
    return null;
  }

  const close = () => {
    if (importing) {
      return;
    }
    setSelectedFile(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-exam-dialog-title"
        className={`${ui.card} w-full max-w-lg p-6 shadow-xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={ui.sectionTitle}>{t("formLibrary.import.importEyebrow")}</p>
            <h2 id="import-exam-dialog-title" className="mt-1 text-xl font-semibold tracking-tight">
              {t("formLibrary.import.importTitle")}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={importing}
            className={`${ui.btnGhost} px-2 py-1 text-sm ${focusRing} disabled:opacity-50`}
            aria-label={t("common.close")}
          >
            ×
          </button>
        </div>

        <p className="mt-3 text-sm text-[var(--tp-text-secondary)]">
          {t("formLibrary.import.importIntro")}
        </p>

        <div className="mt-5 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] p-4">
          <p className="text-sm font-medium text-[var(--tp-text)]">
            {t("formLibrary.import.templateHeading")}
          </p>
          <p className="mt-1 text-sm text-[var(--tp-text-secondary)]">
            {t("formLibrary.import.templateHint")}
          </p>
          <a
            href="/api/forms/ai-template"
            download
            className={`${ui.btnSecondary} mt-3 inline-flex items-center gap-2 text-sm ${focusRing}`}
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
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-[var(--tp-text)]">
            {t("formLibrary.import.uploadHeading")}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              setSelectedFile(file);
            }}
          />
          <button
            type="button"
            disabled={importing}
            onClick={() => inputRef.current?.click()}
            className={`mt-2 flex w-full flex-col items-center justify-center gap-2 rounded-[var(--tp-radius-sm)] border border-dashed border-[var(--tp-border-strong)] bg-[var(--tp-surface)] px-4 py-8 text-center ${focusRing} disabled:opacity-50`}
          >
            <svg
              aria-hidden
              className="h-8 w-8 text-[var(--tp-text-muted)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
            </svg>
            <span className="text-sm font-medium text-[var(--tp-text)]">
              {selectedFile ? selectedFile.name : t("formLibrary.import.chooseFile")}
            </span>
            <span className="text-xs text-[var(--tp-text-secondary)]">
              {t("formLibrary.import.acceptedFormats")}
            </span>
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={importing}
            className={`${ui.btnGhost} ${focusRing} disabled:opacity-50`}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={!selectedFile || importing}
            onClick={() => {
              if (selectedFile) {
                onImport(selectedFile);
              }
            }}
            className={`${ui.btnPrimary} inline-flex items-center gap-2 ${focusRing} disabled:opacity-50`}
            aria-busy={importing}
          >
            {importing ? (
              <span
                className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
                aria-hidden
              />
            ) : null}
            {importing ? t("formLibrary.import.importing") : t("formLibrary.import.importExam")}
          </button>
        </div>
      </div>
    </div>
  );
}
