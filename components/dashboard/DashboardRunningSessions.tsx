"use client";

import { LocaleLink as Link, useLocaleRouter as useRouter } from "@/lib/i18n/client";
import { useCallback, useEffect, useState } from "react";

import { deferEffect } from "@/lib/defer-effect";

import { ConfirmButton } from "@/components/ConfirmButton";
import { LiveCountdown } from "@/components/LiveCountdown";
import {
  EntityList,
  EntityListPanel,
  EntityListRow,
} from "@/components/lists/EntityList";
import { OverflowMenu, type OverflowMenuItem } from "@/components/OverflowMenu";
import { SessionJoinShare } from "@/components/SessionJoinShare";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { useLocale, useTranslations } from "@/lib/i18n/I18nProvider";
import { notifyStudentExamResumed } from "@/lib/notify-student-exam-resumed";
import {
  getSessionDurationMinutes,
  isNoTimeLimitSession,
} from "@/lib/session-window";
import { formatSessionCountdown, maskDashboardDeviceId } from "@/lib/session-countdown";
import { buildStudentJoinUrl } from "@/lib/student-join-url";
import type { SuspendedStudentRow, TeacherSessionSummary } from "@/lib/teacher-sessions";
import { usePollingRefresh } from "@/lib/use-polling-refresh";
import { focusRing } from "@/lib/ui";
import { messageForBackgroundRefreshError } from "@/lib/background-network-error";
import { requestJson } from "@/lib/request-json";
import { toast } from "sonner";

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
  const locale = useLocale();
  const router = useRouter();
  const [sessions, setSessions] = useState(initialSessions);
  const [suspensionsBySession, setSuspensionsBySession] = useState(initialSuspensions);
  const [stoppingSessionId, setStoppingSessionId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [origin] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));

  const refreshActive = useCallback(async () => {
    try {
      const data = await requestJson<{
        sessions: TeacherSessionSummary[];
        suspensionsBySession: Record<string, SuspendedStudentRow[]>;
      }>("/api/teacher/sessions?scope=active");
      setSessions(data.sessions);
      setSuspensionsBySession(data.suspensionsBySession ?? {});
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

  usePollingRefresh({
    enabled: sessions.length > 0,
    intervalMs: 5000,
    immediate: false,
    onRefresh: () => void refreshActive(),
  });

  useEffect(() => {
    if (!copiedCodeId) {
      return;
    }
    const id = window.setTimeout(() => setCopiedCodeId(null), 1500);
    return () => window.clearTimeout(id);
  }, [copiedCodeId]);

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
      setOpenMenuId(null);
      await refreshActive();
    } catch (e) {
      onError(e instanceof Error ? e.message : t("runningSessions.errors.stop"));
    } finally {
      setStoppingSessionId(null);
    }
  };

  const copyJoinCode = async (sessionId: string, joinCode: string) => {
    const ok = await copyToClipboard(joinCode);
    if (ok) {
      setCopiedCodeId(sessionId);
    }
  };

  const copyJoinLink = async (joinCode: string) => {
    if (!origin) {
      return;
    }
    const link = buildStudentJoinUrl(origin, joinCode, { locale });
    if (!link) {
      return;
    }
    const ok = await copyToClipboard(link);
    if (ok) {
      toast.success(t("share.join.linkCopied"));
    }
  };

  const menuItemsFor = (s: TeacherSessionSummary): OverflowMenuItem[] => [
    {
      type: "button",
      label: t("runningSessions.copyJoinLink"),
      disabled: !origin,
      onClick: () => void copyJoinLink(s.joinCode),
    },
    {
      type: "button",
      label: t("home.teacher.classDisplay"),
      onClick: () => {
        window.open(
          `/${locale}/live/${encodeURIComponent(s.joinCode)}`,
          "_blank",
          "noopener,noreferrer",
        );
      },
    },
    { type: "divider", key: `stop-div-${s.id}` },
    {
      type: "custom",
      key: `stop-${s.id}`,
      node: (
        <ConfirmButton
          tone="danger"
          label={t("runningSessions.stopEllipsis")}
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
          onConfirm={() => void stopRunningSession(s.id)}
          className="tp-overflow-menu__confirm"
        />
      ),
    },
  ];

  return (
    <section id="running-sessions" className="scroll-mt-6 tp-card tp-running-sessions p-6">
      <div className="tp-running-sessions__header">
        <span
          aria-hidden
          className="tp-running-sessions__live-dot"
          style={
            sessions.length > 0
              ? { animation: "tp-typing-pulse 1.4s ease-in-out infinite" }
              : undefined
          }
        />
        <div>
          <p className="tp-running-sessions__eyebrow">{t("runningSessions.eyebrow")}</p>
          <h2 className="tp-running-sessions__title">
            {t("runningSessions.title")}
            {sessions.length > 0 ? (
              <span className="tp-running-sessions__count"> · {sessions.length}</span>
            ) : null}
          </h2>
        </div>
      </div>

      {sessions.length === 0 ? (
        <p className="tp-empty">{t("runningSessions.empty")}</p>
      ) : (
        <EntityListPanel>
          <EntityList className="tp-running-sessions__list">
            {sessions.map((s) => {
              const suspended = suspensionsBySession[s.id] ?? [];
              const noTimeLimit = isNoTimeLimitSession(s.opensAt, s.closesAt);
              const totalMinutes = getSessionDurationMinutes(s.opensAt, s.closesAt) ?? 0;
              const totalMs = Math.max(1, new Date(s.closesAt).getTime() - new Date(s.opensAt).getTime());
              const waiting = s.assignedCount === 0;
              const openHref = `/dashboard/sessions/${s.id}`;

              return (
                <EntityListRow
                  key={s.id}
                  className="tp-running-session-row"
                  interactive
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("[data-row-action], a")) {
                      return;
                    }
                    setOpenMenuId(null);
                    router.push(openHref);
                  }}
                >
                  <div className="tp-running-session-row__code-block" data-row-action>
                    <button
                      type="button"
                      className="tp-running-session-row__code"
                      title={t("runningSessions.copyCodeHint")}
                      onClick={(event) => {
                        event.stopPropagation();
                        void copyJoinCode(s.id, s.joinCode);
                      }}
                    >
                      <span className="tp-running-session-row__code-text">{s.joinCode}</span>
                      <span className="tp-running-session-row__code-glyph">
                        {copiedCodeId === s.id
                          ? t("runningSessions.codeCopiedShort")
                          : "⧉"}
                      </span>
                    </button>
                    <SessionJoinShare joinCode={s.joinCode} variant="qrIcon" />
                  </div>

                  <div className="tp-running-session-row__main">
                    <Link
                      href={openHref}
                      className={`tp-running-session-row__title ${focusRing}`}
                      onClick={() => setOpenMenuId(null)}
                    >
                      {s.formTitle}
                    </Link>
                    {waiting ? (
                      <div className="tp-running-session-row__waiting">
                        <span aria-hidden className="tp-running-session-row__waiting-dot" />
                        {t("runningSessions.waitingForStudents")}
                      </div>
                    ) : (
                      <div className="tp-running-session-row__pills">
                        <span className="tp-running-session-row__pill tp-running-session-row__pill--joined">
                          {t("runningSessions.joined", { n: s.assignedCount })}
                        </span>
                        <span className="tp-running-session-row__pill tp-running-session-row__pill--working">
                          {t("runningSessions.working", { n: s.inProgressCount })}
                        </span>
                        <span className="tp-running-session-row__pill tp-running-session-row__pill--done">
                          {t("runningSessions.done", { n: s.finishedCount })}
                        </span>
                        {s.needsGradingCount > 0 ? (
                          <span
                            className="tp-running-session-row__pill tp-running-session-row__pill--grade"
                            title={t("runningSessions.toGradeTitle", {
                              count: s.needsGradingCount,
                            })}
                          >
                            {t("runningSessions.toGrade", { n: s.needsGradingCount })}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div className="tp-running-session-row__time">
                    {noTimeLimit ? (
                      <div className="tp-running-session-row__time-value">
                        {t("common.noTimeLimit")}
                      </div>
                    ) : (
                      <LiveCountdown
                        closesAt={s.closesAt}
                        render={(msLeft) => {
                          const fractionLeft = Math.max(0, Math.min(1, msLeft / totalMs));
                          const low = fractionLeft < 0.25;
                          return (
                            <>
                              <div
                                className="tp-running-session-row__time-value"
                                data-low={low ? "true" : undefined}
                              >
                                {formatSessionCountdown(msLeft)}
                              </div>
                              <div className="tp-running-session-row__time-label">
                                {t("runningSessions.leftOfTotal", { total: totalMinutes })}
                              </div>
                              <div className="tp-running-session-row__bar">
                                <div
                                  className="tp-running-session-row__bar-fill"
                                  data-low={low ? "true" : undefined}
                                  style={{ width: `${Math.round(fractionLeft * 100)}%` }}
                                />
                              </div>
                            </>
                          );
                        }}
                      />
                    )}
                  </div>

                  <div className="tp-running-session-row__actions" data-row-action>
                    <button
                      type="button"
                      className={`tp-running-session-row__open ${focusRing}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenMenuId(null);
                        router.push(openHref);
                      }}
                    >
                      {t("runningSessions.open")}
                      <svg
                        aria-hidden
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </button>
                    <OverflowMenu
                      label={t("runningSessions.moreActions")}
                      items={menuItemsFor(s)}
                      showClose={false}
                      open={openMenuId === s.id}
                      onOpenChange={(open) => setOpenMenuId(open ? s.id : null)}
                    />
                  </div>

                  {suspended.length > 0 ? (
                    <div className="tp-entity-list-callout" data-row-action>
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
          <p className="tp-running-sessions__hint">{t("runningSessions.rowHint")}</p>
        </EntityListPanel>
      )}
    </section>
  );
}
