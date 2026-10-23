"use client";

import { useState } from "react";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import type { RejoinCandidate } from "@/lib/fetch-rejoin-candidate";
import { formatRelativeShort } from "@/lib/format-relative-short";
import { ui } from "@/lib/ui";

type Props = {
  displayName: string;
  candidate: RejoinCandidate;
  busy?: boolean;
  onContinue: () => void;
  onStartNew: () => void;
};

/**
 * The name typed on a new device matches an unfinished attempt elsewhere. Continue
 * asks the teacher to move that attempt here; Start new is for a namesake.
 * With several namesakes we never guess: only Start new (plus the resume-code hint).
 */
export function StudentRejoinOnNewDeviceCard({
  displayName,
  candidate,
  busy = false,
  onContinue,
  onStartNew,
}: Props) {
  const t = useTranslations();
  // "last active 2 minutes ago" relative to when the card appeared.
  const [nowMs] = useState(() => Date.now());
  const ago = formatRelativeShort(candidate.lastActiveAt, nowMs);
  const counts = { answered: candidate.answeredCount, total: candidate.questionTotal };

  return (
    <div className="mt-6 space-y-4" data-testid="student-rejoin-device">
      <div>
        <h3 className="text-xl font-semibold text-[var(--tp-text)]">
          {candidate.ambiguous
            ? t("home.rejoinDevice.ambiguousTitle", { name: displayName })
            : t("home.rejoinDevice.title", { name: displayName })}
        </h3>
        <p className="mt-1 text-sm text-[var(--tp-text-secondary)]">
          {candidate.ambiguous
            ? t("home.rejoinDevice.ambiguousHint")
            : ago
              ? t("home.rejoinDevice.detail", { ...counts, ago })
              : t("home.rejoinDevice.detailNoTime", counts)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!candidate.ambiguous ? (
          <button
            type="button"
            className={`${ui.btnPrimary} disabled:opacity-50`}
            disabled={busy}
            aria-busy={busy}
            data-testid="student-rejoin-continue"
            onClick={onContinue}
          >
            {t("home.rejoinDevice.continue")}
          </button>
        ) : null}
        <button
          type="button"
          className={candidate.ambiguous ? ui.btnPrimary : ui.btnGhost}
          disabled={busy}
          data-testid="student-rejoin-start-new"
          onClick={onStartNew}
        >
          {t("home.rejoinDevice.startNew", { name: displayName })}
        </button>
      </div>
    </div>
  );
}
