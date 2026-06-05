"use client";

import { useParams } from "next/navigation";

import { LocaleLink as Link, useLocaleRouter as useRouter } from "@/lib/i18n/client";
import { useCallback, useEffect, useState } from "react";

import { ConfirmButton } from "@/components/ConfirmButton";
import { LoadingBar } from "@/components/LoadingBar";
import { SaveTemplateModal } from "@/components/library/SaveTemplateModal";
import { OverflowMenu, type OverflowMenuItem } from "@/components/OverflowMenu";
import { SessionExamRoster } from "@/components/SessionExamRoster";
import { SessionJoinShare } from "@/components/SessionJoinShare";
import {
  countNeedsGrading,
  gradingRosterPriority,
  matchesFilter,
  type GradingRosterFilter,
} from "@/lib/grading-roster";
import type { LiveSessionOverviewPayload } from "@/lib/live-session-overview";
import { isNoTimeLimitSession } from "@/lib/session-window";
import { deferEffect } from "@/lib/defer-effect";
import { notifyStudentExamResumed } from "@/lib/notify-student-exam-resumed";
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

export default function LiveSessionDetailPage() {
  const t = useTranslations();
  const router = useRouter();
  const params = useParams();
  const liveSessionId = typeof params.liveSessionId === "string" ? params.liveSessionId : "";

  const [overview, setOverview] = useState<LiveSessionOverviewPayload | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [loadError, setLoadError] = useState("");
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [sessionActionBusy, setSessionActionBusy] = useState(false);
  const [participantBusyDeviceId, setParticipantBusyDeviceId] = useState<string | null>(null);
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
      const message = messageForBackgroundRefreshError(e, t("session.errors.loadSession"));
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

  const stopSession = async () => {
    if (!liveSessionId) {
      return;
    }
    setSessionActionBusy(true);
    setLoadError("");
    try {
      await requestJson<{ ok: true }>(`/api/forms/live-sessions/${liveSessionId}/stop`, {
        method: "POST",
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("session.errors.stop"));
    } finally {
      setSessionActionBusy(false);
    }
  };

  const deleteSession = async () => {
    if (!liveSessionId) {
      return;
    }
    setSessionActionBusy(true);
    setLoadError("");
    try {
      await requestJson<{ ok: true }>(`/api/forms/live-sessions/${liveSessionId}`, {
        method: "DELETE",
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("session.errors.delete"));
    } finally {
      setSessionActionBusy(false);
    }
  };

  const resumeStudent = async (deviceId: string) => {
    if (!liveSessionId) {
      return;
    }
    const deviceIdNorm = deviceId.toLowerCase();
    setParticipantBusyDeviceId(deviceIdNorm);
    setLoadError("");
    try {
      await requestJson<{ ok: true }>(`/api/forms/live-sessions/${liveSessionId}/resume-student`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: deviceIdNorm }),
      });
      void notifyStudentExamResumed(liveSessionId, deviceId);
      await refreshOverview();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("session.errors.resume"));
    } finally {
      setParticipantBusyDeviceId(null);
    }
  };

  if (!overview) {
    return (
      <div className={ui.page}>
        <main className={ui.pageMain}>
          <Link href="/dashboard" className="text-sm font-medium text-[var(--tp-text-secondary)] underline">
            {t("session.backDashboard")}
          </Link>
          {loadError ? (
            <p className="mt-6 tp-alert tp-alert-error">
              {loadError}
            </p>
          ) : (
            <LoadingBar className="mt-6 max-w-md" label={t("loading.session")} />
          )}
        </main>
      </div>
    );
  }

  const s = overview.session;
  const msLeft = new Date(s.closesAt).getTime() - nowTick;
  const sessionRunning = s.sessionOpen;
  const noTimeLimit = isNoTimeLimitSession(s.opensAt, s.closesAt);
  const needsGradingCount = countNeedsGrading(overview.participants);
  const displayedParticipants = [...overview.participants]
    .filter((p) => matchesFilter(p, rosterFilter))
    .sort((a, b) => {
      const pa = gradingRosterPriority(a);
      const pb = gradingRosterPriority(b);
      if (pa !== pb) return pa - pb;
      return (a.displayName || "").localeCompare(b.displayName || "");
    });

  const sessionOverflowItems: OverflowMenuItem[] = [
    {
      type: "custom",
      key: "join-share",
      node: <SessionJoinShare joinCode={s.joinCode} />,
    },
    {
      type: "link",
      label: t("session.downloadAllPdf"),
      href: `/api/forms/live-sessions/${liveSessionId}/exam-bundle-pdf`,
      download: true,
    },
    ...(sessionRunning
      ? [
          {
            type: "link" as const,
            label: t("session.openClassDisplay"),
            href: `/live/${encodeURIComponent(s.joinCode)}`,
            target: "_blank",
            rel: "noopener noreferrer",
          },
        ]
      : []),
    {
      type: "button",
      label: t("common.refresh"),
      onClick: () => void refreshOverview(),
    },
    {
      type: "button",
      label: t("templateLibrary.save.action"),
      onClick: () => setSaveTemplateOpen(true),
    },
    {
      type: "custom",
      key: "session-action",
      node: sessionRunning ? (
        <ConfirmButton
          tone="danger"
          label={t("session.actions.stop")}
          confirmLabel={t("common.tapAgainStop")}
          busy={sessionActionBusy}
          busyLabel={t("common.stopping")}
          onConfirm={stopSession}
          className="w-full justify-start px-3 py-2.5 text-sm"
        />
      ) : (
        <ConfirmButton
          tone="danger"
          label={t("session.actions.delete")}
          confirmLabel={t("common.tapAgainDelete")}
          busy={sessionActionBusy}
          busyLabel={t("common.deleting")}
          onConfirm={deleteSession}
          className="w-full justify-start px-3 py-2.5 text-sm"
        />
      ),
    },
  ];

  return (
    <div className={ui.page}>
      <main className={`${ui.pageMain} space-y-6`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Link href="/dashboard" className={`text-sm font-medium text-[var(--tp-text-secondary)] underline ${focusRing}`}>
            {t("session.backDashboard")}
            </Link>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">{s.formTitle}</h1>
            <p className="mt-1 text-sm text-[var(--tp-text-secondary)]">
              {sessionRunning
                ? noTimeLimit
                  ? t("session.liveOpenNoLimit")
                  : t("session.liveOpenTimeLeft", { timeLeft: formatCountdown(msLeft) })
                : t("session.windowClosed")}
              {" · "}
              {t("session.codeLabel", { joinCode: s.joinCode })}
            </p>
            <p className="mt-1 text-xs text-[var(--tp-text-muted)]">
              {t("session.lastUpdated", {
                time: lastOverviewSyncAt ? new Date(lastOverviewSyncAt).toLocaleTimeString() : "—",
              })}
            </p>
          </div>
          <OverflowMenu label={t("session.moreActions")} items={sessionOverflowItems} />
        </div>

        {loadError ? (
          <p className="tp-alert tp-alert-error">
            {loadError}
          </p>
        ) : null}

        <section className="tp-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-lg font-semibold">{t("session.roster.title")}</h2>
            {overview.participants.length > 0 ? (
              <div
                role="group"
                aria-label={t("session.roster.filterAria")}
                className="tp-filter-bar"
              >
                <button
                  type="button"
                  className="tp-filter-chip"
                  aria-pressed={rosterFilter === "all"}
                  onClick={() => setRosterFilter("all")}
                >
                  {t("session.roster.all")}
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
                </button>
              </div>
            ) : null}
          </div>
          {overview.participants.length === 0 ? (
            <p className="mt-4 tp-empty">
              {t("session.roster.emptyDevices")}
            </p>
          ) : displayedParticipants.length === 0 ? (
            <p className="mt-4 tp-empty">
              {rosterFilter === "needs-grading"
                ? t("session.roster.emptyNeedsGrading")
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
                onResumeStudent={(deviceId) => void resumeStudent(deviceId)}
                resumeBusyDeviceId={participantBusyDeviceId}
              />
            </div>
          )}
        </section>
      </main>
      <SaveTemplateModal
        open={saveTemplateOpen}
        onClose={() => setSaveTemplateOpen(false)}
        sourceKind="session"
        liveSessionId={liveSessionId}
        defaultTitle={overview?.session.formTitle ?? ""}
      />
    </div>
  );
}
