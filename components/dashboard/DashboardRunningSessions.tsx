"use client";

import { LocaleLink as Link } from "@/lib/i18n/client";
import { useCallback, useEffect, useState } from "react";

import { deferEffect } from "@/lib/defer-effect";

import { ConfirmButton } from "@/components/ConfirmButton";
import { HelpHint } from "@/components/HelpHint";
import {
  EntityList,
  EntityListPanel,
  EntityListRow,
  EntityListToolbar,
} from "@/components/lists/EntityList";
import { SessionJoinShare } from "@/components/SessionJoinShare";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { notifyStudentExamResumed } from "@/lib/notify-student-exam-resumed";
import { isNoTimeLimitSession } from "@/lib/session-window";
import type { SuspendedStudentRow, TeacherSessionSummary } from "@/lib/teacher-sessions";
import { usePollingRefresh } from "@/lib/use-polling-refresh";
import { focusRing, ui } from "@/lib/ui";
import { messageForBackgroundRefreshError } from "@/lib/background-network-error";
import { requestJson } from "@/lib/request-json";
import { formatSessionCountdown, maskDashboardDeviceId } from "@/lib/session-countdown";

type Props = {
  initialSessions: TeacherSessionSummary[];
  initialSuspensions: Record<string, SuspendedStudentRow[]>;
  onError: (message: string) => void;
};

export function DashboardRunningSessions({
  initialSessions,
  initialSuspensions,
  onError,
}: Props) {
  const t = useTranslations();
  const [sessions, setSessions] = useState(initialSessions);
  const [suspensionsBySession, setSuspensionsBySession] = useState(initialSuspensions);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [stoppingSessionId, setStoppingSessionId] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => Date.now());

  const refreshActive = useCallback(async () => {
    try {
      const data = await requestJson<{
        sessions: TeacherSessionSummary[];
        suspensionsBySession: Record<string, SuspendedStudentRow[]>;
      }>("/api/teacher/sessions?scope=active");
      setSessions(data.sessions);
      setSuspensionsBySession(data.suspensionsBySession ?? {});
      setLastSyncedAt(Date.now());
      onError("");
    } catch (e) {
      const message = messageForBackgroundRefreshError(
        e,
        t("runningSessions.errors.refresh"),
      );
      if (message) {
        onError(message);
      }
    }
  }, [onError, t]);

  useEffect(() => {
    deferEffect(() => {
      setSessions(initialSessions);
      setSuspensionsBySession(initialSuspensions);
    });
  }, [initialSessions, initialSuspensions]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  usePollingRefresh({
    enabled: sessions.length > 0,
    intervalMs: 5000,
    immediate: false,
    onRefresh: () => void refreshActive(),
  });

  const resumeStudent = async (liveSessionId: string, deviceId: string) => {
    try {
      await requestJson<{ ok: true }>(`/api/forms/live-sessions/${liveSessionId}/resume-student`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: deviceId.toLowerCase() }),
      });
      void notifyStudentExamResumed(liveSessionId, deviceId);
      await refreshActive();
    } catch (e) {
      onError(e instanceof Error ? e.message : t("runningSessions.errors.resume"));
    }
  };

  const stopRunningSession = async (liveSessionId: string) => {
    setStoppingSessionId(liveSessionId);
    try {
      await requestJson<{ ok: true }>(`/api/forms/live-sessions/${liveSessionId}/stop`, {
        method: "POST",
      });
      await refreshActive();
    } catch (e) {
      onError(e instanceof Error ? e.message : t("runningSessions.errors.stop"));
    } finally {
      setStoppingSessionId(null);
    }
  };

  const hasToGrade = sessions.some((s) => s.needsGradingCount > 0);

  return (
    <section id="running-sessions" className="scroll-mt-6 tp-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={ui.sectionTitle}>{t("runningSessions.eyebrow")}</p>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full bg-[var(--tp-mint)]"
              style={
                sessions.length > 0
                  ? { animation: "tp-typing-pulse 1.4s ease-in-out infinite" }
                  : undefined
              }
            />
            {t("runningSessions.title")}
            {sessions.length > 0 ? (
              <span className="text-sm font-normal text-[var(--tp-text-muted)]">
                · {sessions.length}
              </span>
            ) : null}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void refreshActive()}
          className={`tp-btn-ghost text-sm ${focusRing}`}
          title={
            lastSyncedAt
              ? t("common.updatedAt", { time: new Date(lastSyncedAt).toLocaleTimeString() })
              : t("common.refresh")
          }
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
          {t("common.refresh")}
        </button>
      </div>
      {sessions.length === 0 ? (
        <p className="tp-empty">{t("runningSessions.empty")}</p>
      ) : (
        <EntityListPanel>
          <EntityListToolbar>
            <div className="flex flex-wrap items-center gap-2">
              {hasToGrade ? (
                <HelpHint id="dash-to-grade" text={t("help.dashboard.toGrade")} />
              ) : null}
              <HelpHint id="dash-join-code" text={t("help.dashboard.joinCode")} />
            </div>
          </EntityListToolbar>
          <EntityList>
            {sessions.map((s) => {
              const msLeft = new Date(s.closesAt).getTime() - nowTick;
              const suspended = suspensionsBySession[s.id] ?? [];
              const noTimeLimit = isNoTimeLimitSession(s.opensAt, s.closesAt);
              return (
                <EntityListRow key={s.id} className="tp-entity-list-row--stacked">
                  <div className="tp-entity-list-row__primary min-w-0">
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/sessions/${s.id}`}
                        className={`tp-entity-list-row__title ${focusRing}`}
                      >
                        {s.formTitle}
                      </Link>
                      <p className="tp-entity-list-row__cell tp-entity-list-row__cell--mono mt-0.5">
                        {s.joinCode}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="tp-status tp-status-typing">
                          <span className="tp-status-dot" />
                          {t("runningSessions.working", { n: s.inProgressCount })}
                        </span>
                        <span className="tp-status tp-status-finished">
                          <span className="tp-status-dot" />
                          {t("runningSessions.done", { n: s.finishedCount })}
                        </span>
                        <span className="tp-status tp-status-idle">
                          <span className="tp-status-dot" />
                          {t("runningSessions.joined", { n: s.assignedCount })}
                        </span>
                        {s.needsGradingCount > 0 ? (
                          <span
                            className="tp-status tp-status-blocked"
                            title={t("runningSessions.toGradeTitle", { count: s.needsGradingCount })}
                          >
                            <span className="tp-status-dot" />
                            {t("runningSessions.toGrade", { n: s.needsGradingCount })}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2">
                        <SessionJoinShare joinCode={s.joinCode} />
                      </div>
                    </div>
                  </div>
                  <div className="tp-entity-list-row__actions">
                    <div className="text-sm text-[var(--tp-text-secondary)]">
                      {noTimeLimit ? (
                        <span>{t("common.noTimeLimit")}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <svg
                            aria-hidden
                            className="h-4 w-4 text-[var(--tp-accent)]"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 7v5l3 2" />
                          </svg>
                          <span className="font-mono font-semibold tabular-nums text-[var(--tp-text)]">
                            {formatSessionCountdown(msLeft)}
                          </span>
                        </span>
                      )}
                    </div>
                    <ConfirmButton
                      tone="danger"
                      label={t("session.actions.stop")}
                      confirmLabel={t("common.tapAgainStop")}
                      busy={stoppingSessionId === s.id}
                      busyLabel={
                        <>
                          <span
                            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-red-200 border-t-red-800"
                            aria-hidden
                          />
                          {t("common.stopping")}
                        </>
                      }
                      onConfirm={() => stopRunningSession(s.id)}
                    />
                  </div>
                  {suspended.length > 0 ? (
                    <div className="tp-entity-list-callout">
                      <p className="inline-flex items-center gap-1.5 font-semibold">
                        <span aria-hidden className="tp-status tp-status-blocked">
                          <span className="tp-status-dot" />
                          {t("session.status.paused")}
                        </span>
                        {t("runningSessions.pausedNeedApproval", { n: suspended.length })}
                      </p>
                      <ul className="tp-entity-list-nested">
                        {suspended.map((row) => (
                          <li
                            key={row.anonymousSessionId}
                            className="tp-entity-list-nested__row"
                          >
                            <span className="text-xs">
                              <span className="font-medium">
                                {row.displayName ? row.displayName : t("common.student")}
                              </span>
                              <span className="mx-1.5 opacity-60">·</span>
                              <span className="font-mono">
                                {maskDashboardDeviceId(row.anonymousSessionId)}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => void resumeStudent(s.id, row.anonymousSessionId)}
                              className="rounded-[var(--tp-radius-xs)] bg-[var(--tp-amber)] px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-transform active:scale-95"
                            >
                              {t("session.actions.letIn")}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </EntityListRow>
              );
            })}
          </EntityList>
        </EntityListPanel>
      )}
    </section>
  );
}
