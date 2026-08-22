"use client";

import { useCallback, useRef, useState } from "react";

import type { ExamPdfProgress } from "@/lib/exam-pdf-client";
import { useTranslations } from "@/lib/i18n/I18nProvider";

/**
 * Client-side exam PDF download with progress. Falls back to the server PDF
 * route when browser generation fails (old browsers, fetch errors, …).
 */
export function useExamPdfDownload(liveSessionId: string) {
  const [progress, setProgress] = useState<ExamPdfProgress | null>(null);
  const busyRef = useRef(false);

  const start = useCallback(
    async (deviceId?: string) => {
      if (busyRef.current || !liveSessionId) {
        return;
      }
      busyRef.current = true;
      setProgress({ phase: "data", done: 0, total: 1, overall: 0 });
      try {
        const { generateExamPdf, downloadPdfBlob } = await import("@/lib/exam-pdf-client");
        const { blob, filename } = await generateExamPdf({
          liveSessionId,
          deviceId,
          onProgress: setProgress,
        });
        downloadPdfBlob(blob, filename);
      } catch {
        const fallback = deviceId
          ? `/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(deviceId)}/exam-pdf`
          : `/api/forms/live-sessions/${liveSessionId}/exam-bundle-pdf`;
        window.location.assign(fallback);
      } finally {
        busyRef.current = false;
        setProgress(null);
      }
    },
    [liveSessionId],
  );

  return { start, progress };
}

/** Fixed bottom-right toast with a determinate bar while a PDF is generated. */
export function ExamPdfProgressToast({ progress }: { progress: ExamPdfProgress | null }) {
  const t = useTranslations();
  if (!progress) {
    return null;
  }
  const percent = Math.round(progress.overall * 100);
  const phaseLabel =
    progress.phase === "render"
      ? t("session.pdfProgress.render", { done: progress.done, total: progress.total })
      : t(`session.pdfProgress.${progress.phase}`);

  return (
    <div className="tp-pdf-progress" role="status" aria-live="polite">
      <p className="tp-pdf-progress__title">{t("session.pdfProgress.title")}</p>
      <p className="tp-pdf-progress__phase">{phaseLabel}</p>
      <div className="tp-loading-track" aria-hidden>
        <div className="tp-pdf-progress__fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="sr-only">{`${percent}%`}</span>
    </div>
  );
}
