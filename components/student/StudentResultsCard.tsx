"use client";

import { useCallback, useState } from "react";

import { ScoreRing } from "@/components/ScoreMeter";
import { buildStudentReviewUrl } from "@/lib/student-review-url";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { LocaleLink as Link } from "@/lib/i18n/client";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { useScoreCopy } from "@/lib/i18n/score-copy";
import { scoreTier } from "@/lib/exam-grades";
import { requestJson } from "@/lib/request-json";
import { ui } from "@/lib/ui";
import { usePollingRefresh } from "@/lib/use-polling-refresh";

export const RESULTS_POLL_INTERVAL_MS = 15_000;

export type ResultsSummary = {
  graded: boolean;
  sessionOpen: boolean;
  pointsEarned: number | null;
  pointsPossible: number | null;
};

/** Results are "ready" once marked graded and the exam window has closed (auto-graded scores stay hidden mid-exam). */
export function resultsReady(summary: ResultsSummary | null): boolean {
  return Boolean(summary && summary.graded && !summary.sessionOpen);
}

type Props = {
  token: string;
  /** Compact: no eyebrow, smaller ring (the /join "last exam" card). */
  compact?: boolean;
};

/**
 * "Your results" for one results token: polls while the teacher is marking,
 * then shows the score with a link to the full per-question page. The copy
 * button is the student's only way back from another device.
 */
export function StudentResultsCard({ token, compact = false }: Props) {
  const t = useTranslations();
  const { scoreTierMessage } = useScoreCopy();
  const [summary, setSummary] = useState<ResultsSummary | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const ready = resultsReady(summary);

  const refresh = useCallback(() => {
    void requestJson<{ review: ResultsSummary }>(`/api/public/review/${encodeURIComponent(token)}`)
      .then((data) => {
        setSummary(data.review);
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true));
  }, [token]);

  usePollingRefresh({
    enabled: !ready,
    intervalMs: RESULTS_POLL_INTERVAL_MS,
    immediate: true,
    refreshOnReturn: true,
    onRefresh: refresh,
  });

  const copyLink = async () => {
    const ok = await copyToClipboard(buildStudentReviewUrl(window.location.origin, token));
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const earned = summary?.pointsEarned ?? 0;
  const possible = summary?.pointsPossible ?? 0;

  return (
    <div
      className={compact ? "space-y-3" : "space-y-4"}
      data-testid="student-results-card"
      data-state={ready ? "ready" : "waiting"}
    >
      {ready ? (
        <div className={`flex items-center gap-4 ${compact ? "" : "justify-center"}`}>
          <ScoreRing earned={earned} possible={possible} size={compact ? 64 : 96} stroke={compact ? 7 : 10} showPoints={false} />
          <div className={compact ? "text-left" : "text-left"}>
            <p className="text-lg font-semibold text-[var(--tp-text)]">{t("home.results.readyTitle")}</p>
            <p className="text-sm text-[var(--tp-text-secondary)]" data-testid="student-results-score">
              {t("home.results.score", { earned, possible })}
            </p>
            {possible > 0 ? (
              <p className="mt-1 text-sm text-[var(--tp-text-muted)]">{scoreTierMessage(scoreTier(earned, possible))}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className={compact ? "text-left" : ""}>
          <p className="text-lg font-semibold text-[var(--tp-text)]">{t("home.results.waitingTitle")}</p>
          <p className="text-sm text-[var(--tp-text-secondary)]">
            {loadFailed && !summary ? t("home.results.loadFailed") : t("home.results.waitingBody")}
          </p>
        </div>
      )}
      <div className={`flex flex-wrap items-center gap-2 ${compact ? "" : "justify-center"}`}>
        {ready ? (
          <Link href={`/review/${token}`} className={ui.btnPrimary} data-testid="student-results-open">
            {t("home.results.seeResults")}
          </Link>
        ) : null}
        <button type="button" className={ui.btnSecondary} onClick={() => void copyLink()} data-testid="student-results-copy">
          {copied ? t("home.results.linkCopied") : t("home.results.copyLink")}
        </button>
      </div>
      {!compact ? <p className="text-xs text-[var(--tp-text-muted)]">{t("home.results.linkHint")}</p> : null}
    </div>
  );
}
