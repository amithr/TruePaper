"use client";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { ui } from "@/lib/ui";
import type { RejoinRequestStatus } from "@/lib/use-rejoin-request-poll";

type Props = {
  status: Exclude<RejoinRequestStatus, "approved">;
  busy?: boolean;
  onCancel: () => void;
  onTryAgain: () => void;
  onStartNew: () => void;
};

/** Waiting for the teacher's Let in after asking to continue on this device. */
export function StudentRejoinWaitingCard({
  status,
  busy = false,
  onCancel,
  onTryAgain,
  onStartNew,
}: Props) {
  const t = useTranslations();

  if (status === "pending") {
    return (
      <div className="mt-6 space-y-4" data-testid="student-rejoin-waiting" role="status">
        <div>
          <h3 className="text-xl font-semibold text-[var(--tp-text)]">
            {t("home.rejoinDevice.waitingTitle")}
          </h3>
          <p className="mt-1 text-sm text-[var(--tp-text-secondary)]">
            {t("home.rejoinDevice.waitingHint")}
          </p>
        </div>
        <button
          type="button"
          className={ui.btnGhost}
          disabled={busy}
          data-testid="student-rejoin-cancel"
          onClick={onCancel}
        >
          {t("home.rejoinDevice.cancel")}
        </button>
      </div>
    );
  }

  const declined = status === "declined";
  return (
    <div
      className="mt-6 space-y-4"
      data-testid="student-rejoin-waiting"
      data-status={status}
      role="alert"
    >
      <div>
        <h3 className="text-xl font-semibold text-[var(--tp-text)]">
          {declined ? t("home.rejoinDevice.declinedTitle") : t("home.rejoinDevice.expiredTitle")}
        </h3>
        <p className="mt-1 text-sm text-[var(--tp-text-secondary)]">
          {declined ? t("home.rejoinDevice.declinedHint") : t("home.rejoinDevice.expiredHint")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!declined ? (
          <button
            type="button"
            className={`${ui.btnPrimary} disabled:opacity-50`}
            disabled={busy}
            data-testid="student-rejoin-try-again"
            onClick={onTryAgain}
          >
            {t("home.rejoinDevice.tryAgain")}
          </button>
        ) : null}
        <button
          type="button"
          className={declined ? ui.btnPrimary : ui.btnGhost}
          disabled={busy}
          data-testid="student-rejoin-start-new"
          onClick={onStartNew}
        >
          {t("home.rejoinDevice.startNewPlain")}
        </button>
      </div>
    </div>
  );
}
