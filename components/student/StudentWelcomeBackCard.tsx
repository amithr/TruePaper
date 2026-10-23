"use client";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { ui } from "@/lib/ui";
import { useLocalAnswerProgress } from "@/lib/use-local-answer-progress";

type Props = {
  displayName: string;
  liveSessionId: string;
  deviceId: string;
  busy?: boolean;
  onContinue: () => void;
  onStartFresh: () => void;
};

/**
 * Shown when the class link/QR is opened on a browser that was already taking
 * this exam (a crashed tab, a re-scan). One tap continues; "Not you?" is for the
 * next student on a shared computer.
 */
export function StudentWelcomeBackCard({
  displayName,
  liveSessionId,
  deviceId,
  busy = false,
  onContinue,
  onStartFresh,
}: Props) {
  const t = useTranslations();
  const progress = useLocalAnswerProgress(liveSessionId, deviceId);

  return (
    <div className="mt-6 space-y-4" data-testid="student-welcome-back">
      <div>
        <h3 className="text-xl font-semibold text-[var(--tp-text)]">
          {t("home.welcomeBack.title", { name: displayName })}
        </h3>
        <p className="mt-1 text-sm text-[var(--tp-text-secondary)]">
          {progress
            ? t("home.welcomeBack.saved", { answered: progress.answered, total: progress.total })
            : t("home.welcomeBack.savedNoCount")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`${ui.btnPrimary} disabled:opacity-50`}
          disabled={busy}
          aria-busy={busy}
          data-testid="student-welcome-back-continue"
          onClick={onContinue}
        >
          {busy ? t("common.rejoining") : t("home.welcomeBack.continue")}
        </button>
        <button
          type="button"
          className={ui.btnGhost}
          disabled={busy}
          data-testid="student-welcome-back-fresh"
          onClick={onStartFresh}
        >
          {t("home.welcomeBack.notYou")}
        </button>
      </div>
    </div>
  );
}
