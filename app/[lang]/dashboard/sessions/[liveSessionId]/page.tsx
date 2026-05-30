"use client";

import { useParams } from "next/navigation";

import { LocaleLink as Link, useLocaleRouter as useRouter } from "@/lib/i18n/client";
import { useCallback, useEffect, useState } from "react";

import { ConfirmButton } from "@/components/ConfirmButton";
import { LoadingBar } from "@/components/LoadingBar";
import { ScoreBar } from "@/components/ScoreMeter";
import { SessionJoinShare } from "@/components/SessionJoinShare";
import { StudentReviewShare } from "@/components/StudentReviewShare";
import { TeacherStudentRejoinShare } from "@/components/TeacherStudentRejoinShare";
import {
  countNeedsGrading,
  gradingRosterPriority,
  matchesFilter,
  type GradingRosterFilter,
} from "@/lib/grading-roster";
import type { LiveParticipantUiStatus } from "@/lib/participant-status";
import { isNoTimeLimitSession } from "@/lib/session-window";
import { deferEffect } from "@/lib/defer-effect";
import { notifyStudentExamResumed } from "@/lib/notify-student-exam-resumed";
import { usePollingRefresh } from "@/lib/use-polling-refresh";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing, ui } from "@/lib/ui";

import { messageForBackgroundRefreshError } from "@/lib/background-network-error";
import { requestJson } from "@/lib/request-json";

type OverviewSession = {
  id: string;
  joinCode: string;
  opensAt: string;
  closesAt: string;
  formId: string;
  formTitle: string;
  sessionOpen: boolean;
};

type OverviewParticipant = {
  anonymousSessionId: string;
  displayName: string;
  status: LiveParticipantUiStatus;
  suspendedAt: string | null;
  finishedAt: string | null;
  gradedAt: string | null;
  pointsEarned: number | null;
  pointsPossible: number | null;
  lastActivityAt: string | null;
  lastTypingAt: string | null;
  updatedAt: string;
};

function maskDeviceId(id: string): string {
  return `…${id.slice(-8)}`;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) {
    return "0:00";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function statusBadgeClass(status: LiveParticipantUiStatus): string {
  switch (status) {
    case "blocked":
      return "tp-status tp-status-blocked";
    case "finished":
      return "tp-status tp-status-finished";
    case "graded":
      return "tp-status tp-status-graded";
    case "typing":
      return "tp-status tp-status-typing";
    case "idle":
      return "tp-status tp-status-idle";
    default:
      return "tp-status tp-status-neutral";
  }
}

function statusLabel(
  status: LiveParticipantUiStatus,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (status) {
    case "blocked":
      return t("session.status.paused");
    case "finished":
      return t("session.status.submitted");
    case "graded":
      return t("session.status.graded");
    case "typing":
      return t("session.status.typing");
    case "idle":
      return t("session.status.idle");
    default:
      return status;
  }
}

export default function LiveSessionDetailPage() {
  const t = useTranslations();
  const router = useRouter();
  const params = useParams();
  const liveSessionId = typeof params.liveSessionId === "string" ? params.liveSessionId : "";

  const [overview, setOverview] = useState<{
    session: OverviewSession;
    participants: OverviewParticipant[];
  } | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [loadError, setLoadError] = useState("");
  const [sessionActionBusy, setSessionActionBusy] = useState(false);
  const [participantBusyDeviceId, setParticipantBusyDeviceId] = useState<string | null>(null);
  const [lastOverviewSyncAt, setLastOverviewSyncAt] = useState<number | null>(null);
  const [participantHelpOpen, setParticipantHelpOpen] = useState(false);
  const [rosterFilter, setRosterFilter] = useState<GradingRosterFilter>("all");

  const refreshOverview = useCallback(async () => {
    if (!liveSessionId) {
      return;
    }
    setLoadError("");
    try {
      const data = await requestJson<{
        session: OverviewSession;
        participants: OverviewParticipant[];
      }>(`/api/forms/live-sessions/${liveSessionId}/overview`);
      setOverview(data);
      setLastOverviewSyncAt(Date.now());
    } catch (e) {
      const message = messageForBackgroundRefreshError(e, t("session.errors.loadSession"));
      if (message) {
        setLoadError(message);
      }
    }
  }, [liveSessionId, t]);

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

  const deleteStudentExam = async (deviceId: string) => {
    if (!liveSessionId) {
      return;
    }
    const deviceIdNorm = deviceId.toLowerCase();
    setParticipantBusyDeviceId(deviceIdNorm);
    setLoadError("");
    try {
      await requestJson<{ ok: true }>(
        `/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(deviceIdNorm)}`,
        { method: "DELETE" },
      );
      await refreshOverview();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("session.errors.removeStudent"));
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

  return (
    <div className={ui.page}>
      <main className={`${ui.pageMain} space-y-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Link href="/dashboard" className={`text-sm font-medium text-[var(--tp-text-secondary)] underline ${focusRing}`}>
            {t("session.backDashboard")}
            </Link>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">{s.formTitle}</h1>
            <p className="mt-1 font-mono text-sm tracking-widest text-[var(--tp-text-secondary)]">
              {t("session.codeLabel", { joinCode: s.joinCode })}
            </p>
            <p className="mt-2 text-sm text-[var(--tp-text-secondary)]">
              {sessionRunning
                ? noTimeLimit
                  ? t("session.liveOpenNoLimit")
                  : t("session.liveOpenTimeLeft", { timeLeft: formatCountdown(msLeft) })
                : t("session.windowClosed")}
            </p>
            {sessionRunning ? (
              <p className="mt-2 text-sm">
                <Link
                  href={`/live/${encodeURIComponent(s.joinCode)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`tp-link ${focusRing}`}
                >
                  {t("session.openClassDisplay")}
                </Link>
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <SessionJoinShare joinCode={s.joinCode} />
              <a
                href={`/api/forms/live-sessions/${liveSessionId}/exam-bundle-pdf`}
                download
                className={`tp-btn-ghost text-sm ${focusRing}`}
                title={t("session.downloadAllPdfTitle")}
              >
                {t("session.downloadAllPdf")}
              </a>
            </div>
            <p className="mt-2 text-xs text-[var(--tp-text-muted)]">
              {t("session.lastUpdated", {
                time: lastOverviewSyncAt ? new Date(lastOverviewSyncAt).toLocaleTimeString() : "—",
              })}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap gap-2">
              {sessionRunning ? (
                <ConfirmButton
                  tone="danger"
                  label={t("session.actions.stop")}
                  confirmLabel={t("common.tapAgainStop")}
                  busy={sessionActionBusy}
                  busyLabel={t("common.stopping")}
                  onConfirm={stopSession}
                />
              ) : (
                <ConfirmButton
                  tone="danger"
                  label={t("session.actions.delete")}
                  confirmLabel={t("common.tapAgainDelete")}
                  busy={sessionActionBusy}
                  busyLabel={t("common.deleting")}
                  onConfirm={deleteSession}
                />
              )}
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
        </div>

        {loadError ? (
          <p className="tp-alert tp-alert-error">
            {loadError}
          </p>
        ) : null}

        <section className="tp-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">{t("session.roster.title")}</h2>
              <p className="mt-1 text-sm text-[var(--tp-text-secondary)]">
                {t("session.roster.description")}
              </p>
            </div>
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
          <button
            type="button"
            onClick={() => setParticipantHelpOpen((o) => !o)}
            className={`mt-2 text-sm tp-link ${focusRing}`}
            aria-expanded={participantHelpOpen}
          >
            {participantHelpOpen
              ? t("session.roster.hideStatus")
              : t("session.roster.showStatus")}
          </button>
          {participantHelpOpen ? (
            <p className="mt-2 max-w-2xl text-sm text-[var(--tp-text-secondary)]">
              {t("session.roster.statusHelp")}
            </p>
          ) : null}
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
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--tp-border)] text-[var(--tp-text-muted)]">
                    <th className="py-2 pr-4 font-medium">{t("session.roster.colStudent")}</th>
                    <th className="py-2 pr-4 font-medium">{t("session.roster.colStatus")}</th>
                    <th className="py-2 pr-4 font-medium">{t("session.roster.colLastActivity")}</th>
                    <th className="py-2 pr-4 font-medium">{t("session.roster.colResults")}</th>
                    <th className="py-2 font-medium">{t("session.roster.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedParticipants.map((p) => {
                    const deviceIdNorm = p.anonymousSessionId.toLowerCase();
                    const isRowBusy = participantBusyDeviceId === deviceIdNorm;
                    return (
                    <tr
                      key={p.anonymousSessionId}
                      role="link"
                      tabIndex={0}
                      onClick={() =>
                        router.push(
                          `/dashboard/sessions/${liveSessionId}/watch/${encodeURIComponent(p.anonymousSessionId)}`,
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(
                            `/dashboard/sessions/${liveSessionId}/watch/${encodeURIComponent(p.anonymousSessionId)}`,
                          );
                        }
                      }}
                      className="cursor-pointer border-b border-[var(--tp-border)]/60 last:border-0 hover:bg-[var(--tp-bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tp-accent-ring)] focus-visible:ring-inset transition-colors"
                    >
                      <td className="py-3 pr-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-[var(--tp-text)]">
                            {p.displayName ? p.displayName : (
                              <span className="text-[var(--tp-text-muted)] italic">{t("session.roster.noName")}</span>
                            )}
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--tp-text-muted)]">
                            {maskDeviceId(p.anonymousSessionId)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-col gap-1.5">
                          <span className={statusBadgeClass(p.status)}>
                            <span className="tp-status-dot" />
                            {statusLabel(p.status, t)}
                          </span>
                          {p.status === "graded" &&
                          p.pointsEarned != null &&
                          p.pointsPossible != null ? (
                            <ScoreBar
                              earned={p.pointsEarned}
                              possible={p.pointsPossible}
                              className="max-w-[10rem]"
                            />
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-[var(--tp-text-secondary)]">
                        {p.lastActivityAt
                          ? new Date(p.lastActivityAt).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="py-3 pr-4" onClick={(event) => event.stopPropagation()}>
                        <div className="flex flex-wrap items-center gap-2">
                          <StudentReviewShare
                            liveSessionId={liveSessionId}
                            deviceId={p.anonymousSessionId}
                            disabled={!p.displayName && p.status !== "finished"}
                          />
                          <a
                            href={`/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(p.anonymousSessionId)}/exam-pdf`}
                            download
                            className="rounded-[var(--tp-radius-sm)] border border-[var(--tp-border-strong)] bg-[var(--tp-surface)] px-2.5 py-1 text-xs font-medium text-[var(--tp-text)] shadow-sm transition-all hover:bg-[var(--tp-bg-subtle)] active:scale-[0.97]"
                            title={t("session.downloadStudentPdfTitle")}
                          >
                            {t("session.pdf")}
                          </a>
                        </div>
                      </td>
                      <td className="py-3" onClick={(event) => event.stopPropagation()}>
                        <div className="flex flex-wrap items-center gap-2">
                          {s.sessionOpen && p.status !== "finished" ? (
                            <TeacherStudentRejoinShare
                              liveSessionId={liveSessionId}
                              deviceId={p.anonymousSessionId}
                              studentLabel={p.displayName || undefined}
                            />
                          ) : null}
                          {p.status === "blocked" ? (
                            <button
                              type="button"
                              disabled={participantBusyDeviceId !== null}
                              onClick={() => void resumeStudent(p.anonymousSessionId)}
                              className="rounded-[var(--tp-radius-xs)] bg-[var(--tp-amber)] px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-transform active:scale-95 disabled:opacity-50"
                            >
                              {isRowBusy ? t("common.lettingIn") : t("session.actions.letIn")}
                            </button>
                          ) : null}
                          <ConfirmButton
                            tone="danger"
                            label={t("session.actions.remove")}
                            confirmLabel={t("common.tapAgain")}
                            busy={isRowBusy}
                            busyLabel={t("common.removing")}
                            disabled={participantBusyDeviceId !== null && !isRowBusy}
                            className="px-2 py-1 text-xs"
                            onConfirm={() => deleteStudentExam(p.anonymousSessionId)}
                          />
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
