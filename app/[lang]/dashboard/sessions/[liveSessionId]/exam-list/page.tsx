"use client";

import { useParams } from "next/navigation";

import { LocaleLink as Link, useLocaleRouter as useRouter } from "@/lib/i18n/client";
import { useCallback, useEffect, useState } from "react";

import { LoadingBar } from "@/components/LoadingBar";
import { SessionExamRoster } from "@/components/SessionExamRoster";
import {
  countNeedsGrading,
  gradingRosterPriority,
  matchesFilter,
  type GradingRosterFilter,
} from "@/lib/grading-roster";
import type { LiveSessionOverviewPayload } from "@/lib/live-session-overview";
import { deferEffect } from "@/lib/defer-effect";
import { isNoTimeLimitSession } from "@/lib/session-window";
import { useLiveSessionAnswerDrafts } from "@/lib/use-live-session-answer-drafts";
import { usePollingRefresh } from "@/lib/use-polling-refresh";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing, ui } from "@/lib/ui";
import { messageForBackgroundRefreshError } from "@/lib/background-network-error";
import { requestJson } from "@/lib/request-json";

function formatCountdown(ms: number): string {
  if (ms <= 0) {
    return "0:00";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function SessionExamListPage() {
  const t = useTranslations();
  const router = useRouter();
  const params = useParams();
  const liveSessionId = typeof params.liveSessionId === "string" ? params.liveSessionId : "";

  const [overview, setOverview] = useState<LiveSessionOverviewPayload | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [loadError, setLoadError] = useState("");
  const [lastOverviewSyncAt, setLastOverviewSyncAt] = useState<number | null>(null);
  const [rosterFilter, setRosterFilter] = useState<GradingRosterFilter>("all");
  const [filterInitialized, setFilterInitialized] = useState(false);

  const liveDraftsByDevice = useLiveSessionAnswerDrafts(
    Boolean(overview?.session.sessionOpen),
    liveSessionId,
  );

  const refreshOverview = useCallback(async () => {
    if (!liveSessionId) {
      return;
    }
    setLoadError("");
    try {
      const data = await requestJson<LiveSessionOverviewPayload>(
        `/api/forms/live-sessions/${liveSessionId}/overview`,
      );
      setOverview(data);
      setLastOverviewSyncAt(Date.now());
      if (!filterInitialized) {
        const needs = countNeedsGrading(data.participants);
        if (needs > 0) {
          setRosterFilter("needs-grading");
        }
        setFilterInitialized(true);
      }
    } catch (e) {
      const message = messageForBackgroundRefreshError(e, t("session.errors.loadExamList"));
      if (message) {
        setLoadError(message);
      }
    }
  }, [filterInitialized, liveSessionId, t]);

  useEffect(() => {
    if (!liveSessionId) {
      return;
    }
    deferEffect(() => {
      void refreshOverview();
    });
  }, [liveSessionId, refreshOverview]);

  usePollingRefresh({
    enabled: Boolean(overview?.session.sessionOpen),
    intervalMs: 3000,
    immediate: false,
    onRefresh: () => void refreshOverview(),
  });

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!overview) {
    return (
      <div className={ui.page}>
        <main className={ui.pageMain}>
          <Link href={`/dashboard/sessions/${liveSessionId}`} className={`text-sm font-medium underline ${focusRing}`}>
            {t("session.backSessionBoard")}
          </Link>
          {loadError ? (
            <p className="mt-6 tp-alert tp-alert-error">{loadError}</p>
          ) : (
            <LoadingBar className="mt-6 max-w-md" label={t("loading.studentExams")} />
          )}
        </main>
      </div>
    );
  }

  const s = overview.session;
  const msLeft = new Date(s.closesAt).getTime() - nowTick;
  const noTimeLimit = isNoTimeLimitSession(s.opensAt, s.closesAt);
  const activeCount = overview.participants.filter(
    (p) => p.status === "typing" || p.status === "started",
  ).length;
  const needsGradingCount = countNeedsGrading(overview.participants);
  const gradedCount = overview.participants.filter((p) => Boolean(p.gradedAt)).length;
  const displayedParticipants = [...overview.participants]
    .filter((p) => matchesFilter(p, rosterFilter))
    .sort((a, b) => {
      const pa = gradingRosterPriority(a);
      const pb = gradingRosterPriority(b);
      if (pa !== pb) return pa - pb;
      return (a.displayName || "").localeCompare(b.displayName || "");
    });

  return (
    <div className={ui.page}>
      <main className={`${ui.pageMain} space-y-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Link
              href={`/dashboard/sessions/${liveSessionId}`}
              className={`text-sm font-medium text-[var(--tp-text-secondary)] underline ${focusRing}`}
            >
              {t("session.backSessionBoard")}
            </Link>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">{t("session.examList.title")}</h1>
            <p className="mt-1 text-sm text-[var(--tp-text-secondary)]">
              {t("session.examList.subtitle", { formTitle: s.formTitle, joinCode: s.joinCode })}
            </p>
            <p className="mt-2 text-sm text-[var(--tp-text-secondary)]">
              {s.sessionOpen
                ? noTimeLimit
                  ? t("session.liveOpenNoLimit")
                  : t("session.liveOpenTimeLeft", { timeLeft: formatCountdown(msLeft) })
                : t("session.windowClosed")}
            </p>
            <p className="mt-2 text-xs text-[var(--tp-text-muted)]">
              {t("session.lastUpdated", {
                time: lastOverviewSyncAt ? new Date(lastOverviewSyncAt).toLocaleTimeString() : "—",
              })}
              {activeCount > 0 ? t("session.roster.workingNow", { count: activeCount }) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/forms/live-sessions/${liveSessionId}/exam-bundle-pdf`}
              download
              className={`tp-btn-ghost text-sm ${focusRing}`}
              title={t("session.downloadAllPdfTitle")}
            >
              {t("session.downloadAllPdfShort")}
            </a>
            <button
              type="button"
              onClick={() => void refreshOverview()}
              className={`tp-btn-ghost ${focusRing}`}
              aria-label={t("session.refreshAria")}
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
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M3 21v-5h5" />
              </svg>
            </button>
          </div>
        </div>

        {loadError ? <p className="tp-alert tp-alert-error">{loadError}</p> : null}

        <section className="tp-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-sm text-[var(--tp-text-secondary)]">
              {t("session.examList.description")}
            </p>
            {overview.participants.length > 0 ? (
              <div
                role="group"
                aria-label={t("session.roster.filterExamsAria")}
                className="tp-filter-bar"
              >
                <button
                  type="button"
                  className="tp-filter-chip"
                  aria-pressed={rosterFilter === "all"}
                  onClick={() => setRosterFilter("all")}
                >
                  {t("session.roster.all")}
                  <span className="text-[var(--tp-text-muted)]">
                    · {overview.participants.length}
                  </span>
                </button>
                <button
                  type="button"
                  className="tp-filter-chip"
                  aria-pressed={rosterFilter === "needs-grading"}
                  onClick={() => setRosterFilter("needs-grading")}
                >
                  {t("session.roster.needsGrading")}
                  {needsGradingCount > 0 ? (
                    <span className="tp-filter-count">{needsGradingCount}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="tp-filter-chip"
                  aria-pressed={rosterFilter === "graded"}
                  onClick={() => setRosterFilter("graded")}
                >
                  {t("session.roster.graded")}
                  {gradedCount > 0 ? (
                    <span className="text-[var(--tp-text-muted)]">· {gradedCount}</span>
                  ) : null}
                </button>
              </div>
            ) : null}
          </div>

          {overview.participants.length === 0 ? (
            <p className="mt-4 tp-empty">{t("liveDisplay.engagementNone")}</p>
          ) : displayedParticipants.length === 0 ? (
            <p className="mt-4 tp-empty">
              {rosterFilter === "needs-grading"
                ? t("session.roster.emptyNeedsGradingAlt")
                : rosterFilter === "graded"
                  ? t("session.roster.emptyGraded")
                  : t("session.roster.emptyFilter")}
            </p>
          ) : (
            <div className="mt-4">
              <SessionExamRoster
                previewQuestions={s.previewQuestions ?? s.textQuestionIds.map((id) => ({ id, type: "text" }))}
                liveDraftsByDevice={liveDraftsByDevice}
                participants={displayedParticipants}
                onOpenExam={(deviceId) =>
                  router.push(
                    `/dashboard/sessions/${liveSessionId}/watch/${encodeURIComponent(deviceId)}`,
                  )
                }
              />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
