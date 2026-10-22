"use client";

import { ClipboardCopy } from "lucide-react";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { copyToClipboard } from "@/lib/copy-to-clipboard";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing, ui } from "@/lib/ui";

function isExamFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".json") || file.type === "application/json";
}

function hasDraggedFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

export type ImportExamPayload = { file?: File; text?: string };

type Props = {
  open: boolean;
  importing: boolean;
  /** Import error to show inside the dialog (cleared when the teacher edits). */
  error?: string | null;
  onClose: () => void;
  onImport: (payload: ImportExamPayload) => void;
  onClearError?: () => void;
};

/** Fetch the Markdown guide and put it on the clipboard (paste into ChatGPT / Claude). */
export async function copyAiGuide(): Promise<boolean> {
  try {
    const res = await fetch("/api/forms/ai-template");
    if (!res.ok) {
      return false;
    }
    return await copyToClipboard(await res.text());
  } catch {
    return false;
  }
}

export function ImportExamModal({
  open,
  importing,
  error = null,
  onClose,
  onImport,
  onClearError,
}: Props) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // Pasting the AI's reply is the common path; a file upload is the fallback.
  const [tab, setTab] = useState<"paste" | "upload">("paste");
  const [pasted, setPasted] = useState("");
  const canImport = tab === "paste" ? pasted.trim().length > 0 : selectedFile !== null;
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  // dragenter/dragleave also fire for child elements; count depth so the highlight doesn't flicker.
  const dragDepth = useRef(0);

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

  const resetDrag = () => {
    dragDepth.current = 0;
    setDragActive(false);
  };

  const close = () => {
    if (importing) {
      return;
    }
    setSelectedFile(null);
    setFileError(null);
    setPasted("");
    resetDrag();
    onClearError?.();
    onClose();
  };

  const pickFile = (file: File | null) => {
    if (file && !isExamFile(file)) {
      setSelectedFile(null);
      setFileError(t("formLibrary.import.wrongFileType"));
      return;
    }
    setFileError(null);
    setSelectedFile(file);
  };

  // Swallow drops that miss the zone so the browser doesn't navigate to the file.
  const blockStrayDrop = (event: DragEvent) => {
    if (hasDraggedFiles(event)) {
      event.preventDefault();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={close}
      onDragOver={blockStrayDrop}
      onDrop={(event) => {
        blockStrayDrop(event);
        resetDrag();
      }}
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
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void copyAiGuide().then((ok) => {
                  if (ok) {
                    toast.success(t("formLibrary.import.guideCopied"));
                  } else {
                    toast.error(t("formLibrary.import.guideCopyFailed"));
                  }
                });
              }}
              className={`${ui.btnPrimary} inline-flex items-center gap-2 text-sm ${focusRing}`}
            >
              <ClipboardCopy aria-hidden className="h-4 w-4" />
              {t("formLibrary.import.copyGuide")}
            </button>
          <a
            href="/api/forms/ai-template"
            download
            className={`${ui.btnSecondary} inline-flex items-center gap-2 text-sm ${focusRing}`}
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
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-1 border-b border-[var(--tp-border)]" role="tablist">
            {(["paste", "upload"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => {
                  setTab(key);
                  onClearError?.();
                }}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${focusRing} ${
                  tab === key
                    ? "border-[var(--tp-accent)] text-[var(--tp-text)]"
                    : "border-transparent text-[var(--tp-text-secondary)]"
                }`}
              >
                {key === "paste" ? t("formLibrary.import.pasteTab") : t("formLibrary.import.uploadTab")}
              </button>
            ))}
          </div>
          {tab === "paste" ? (
            <label className="mt-3 block text-sm font-medium text-[var(--tp-text)]">
              {t("formLibrary.import.pasteHeading")}
              <textarea
                rows={7}
                value={pasted}
                onChange={(event) => {
                  setPasted(event.target.value);
                  onClearError?.();
                }}
                placeholder={t("formLibrary.import.pastePlaceholder")}
                spellCheck={false}
                className="tp-input mt-2 w-full font-mono text-xs"
                data-testid="import-exam-paste"
              />
            </label>
          ) : null}
          <div hidden={tab !== "upload"}>
          <p className="mt-3 text-sm font-medium text-[var(--tp-text)]">
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
              pickFile(file);
            }}
          />
          <button
            type="button"
            disabled={importing}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => {
              if (importing || !hasDraggedFiles(event)) {
                return;
              }
              event.preventDefault();
              dragDepth.current += 1;
              setDragActive(true);
            }}
            onDragOver={(event) => {
              if (importing || !hasDraggedFiles(event)) {
                return;
              }
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDragLeave={() => {
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (dragDepth.current === 0) {
                setDragActive(false);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              resetDrag();
              if (importing) {
                return;
              }
              pickFile(event.dataTransfer.files?.[0] ?? null);
            }}
            aria-describedby={fileError ? "import-exam-file-error" : undefined}
            data-drag-active={dragActive || undefined}
            className={`mt-2 flex w-full flex-col items-center justify-center gap-2 rounded-[var(--tp-radius-sm)] border border-dashed px-4 py-8 text-center transition-colors ${
              dragActive
                ? "border-[var(--tp-accent)] bg-[var(--tp-accent-soft)]"
                : fileError
                  ? "border-[var(--tp-danger-border)] bg-[var(--tp-surface)]"
                  : "border-[var(--tp-border-strong)] bg-[var(--tp-surface)] hover:bg-[var(--tp-bg-subtle)]"
            } ${focusRing} disabled:opacity-50`}
          >
            <svg
              aria-hidden
              className={`pointer-events-none h-8 w-8 ${dragActive ? "text-[var(--tp-accent)]" : "text-[var(--tp-text-muted)]"}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
            </svg>
            <span className="pointer-events-none text-sm font-medium text-[var(--tp-text)]">
              {dragActive
                ? t("formLibrary.import.dropToAdd")
                : selectedFile
                  ? selectedFile.name
                  : t("formLibrary.import.chooseFile")}
            </span>
            <span className="pointer-events-none text-xs text-[var(--tp-text-secondary)]">
              {t("formLibrary.import.acceptedFormats")}
            </span>
          </button>
          {fileError ? (
            <p
              id="import-exam-file-error"
              role="alert"
              className="mt-2 text-sm text-[var(--tp-danger-text)]"
            >
              {fileError}
            </p>
          ) : null}
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-[var(--tp-danger-text)]" data-testid="import-exam-error">
              {error}
            </p>
          ) : null}
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
            disabled={!canImport || importing}
            onClick={() => {
              if (tab === "paste") {
                onImport({ text: pasted });
              } else if (selectedFile) {
                onImport({ file: selectedFile });
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
