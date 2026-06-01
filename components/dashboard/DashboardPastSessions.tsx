"use client";

import { useLocaleRouter as useRouter } from "@/lib/i18n/client";
import { useCallback, useEffect, useRef, useState } from "react";

import { ConfirmButton } from "@/components/ConfirmButton";
import { LoadingBar } from "@/components/LoadingBar";
import { PAST_SESSIONS_PAGE_SIZE } from "@/lib/teacher-dashboard-server";
import type { TeacherSessionSummary } from "@/lib/teacher-sessions";
import { deferEffect } from "@/lib/defer-effect";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { ui } from "@/lib/ui";
import { requestJson } from "@/lib/request-json";

const ROW_EXIT_MS = 320;

type Props = {
  onError: (message: string) => void;
};

export function DashboardPastSessions({ onError }: Props) {
  const router = useRouter();
  const t = useTranslations();
  const [sessions, setSessions] = useState<TeacherSessionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [exitingSessionIds, setExitingSessionIds] = useState<Set<string>>(() => new Set());
  const pageRef = useRef(0);
  const finishedExitRef = useRef<Set<string>>(new Set());

  const totalPages = Math.max(1, Math.ceil(total / PAST_SESSIONS_PAGE_SIZE));
  const hasVisibleRows = sessions.length > 0 || exitingSessionIds.size > 0;
  const showEmpty =
    !loading && total === 0 && sessions.length === 0 && exitingSessionIds.size === 0;

  const loadPage = useCallback(
    async (pageIndex: number) => {
      setLoading(true);
      try {
        const data = await requestJson<{
          sessions: TeacherSessionSummary[];
          total: number;
          page: number;
        }>(
          `/api/teacher/sessions?scope=past&page=${pageIndex}&limit=${PAST_SESSIONS_PAGE_SIZE}`,
        );
        setSessions(data.sessions);
        setTotal(data.total);
        setPage(data.page);
        pageRef.current = data.page;
      } catch (e) {
        onError(e instanceof Error ? e.message : t("pastSessions.errors.load"));
      } finally {
        setLoading(false);
      }
    },
    [onError, t],
  );

  useEffect(() => {
    deferEffect(() => {
      void loadPage(0);
    });
  }, [loadPage]);

  const finishRowExit = useCallback(
    (sessionId: string) => {
      if (finishedExitRef.current.has(sessionId)) {
        return;
      }
      finishedExitRef.current.add(sessionId);

      setExitingSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });

      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== sessionId);
        if (next.length === 0 && pageRef.current > 0) {
          void loadPage(pageRef.current - 1);
        }
        return next;
      });
      setTotal((prev) => Math.max(0, prev - 1));
    },
    [loadPage],
  );

  const beginRowExit = useCallback(
    (sessionId: string) => {
      finishedExitRef.current.delete(sessionId);
      const reducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reducedMotion) {
        finishRowExit(sessionId);
        return;
      }
      setExitingSessionIds((prev) => new Set(prev).add(sessionId));
      window.setTimeout(() => finishRowExit(sessionId), ROW_EXIT_MS);
    },
    [finishRowExit],
  );

  const deleteSession = async (sessionId: string) => {
    setDeletingSessionId(sessionId);
    onError("");
    try {
      await requestJson<{ ok: true }>(`/api/forms/live-sessions/${sessionId}`, {
        method: "DELETE",
      });
      beginRowExit(sessionId);
    } catch (e) {
      onError(e instanceof Error ? e.message : t("pastSessions.errors.delete"));
    } finally {
      setDeletingSessionId(null);
    }
  };

  return (
    <section className="tp-card p-6">
      <p className={ui.sectionTitle}>{t("dashboard.historyEyebrow")}</p>
      <h2 className="text-xl font-semibold tracking-tight">{t("dashboard.pastSessionsTitle")}</h2>
      {loading && sessions.length === 0 && exitingSessionIds.size === 0 ? (
        <LoadingBar className="mt-4 max-w-md" label={t("loading.pastSessions")} />
      ) : null}
      {showEmpty ? <p className="mt-4 tp-empty">{t("pastSessions.empty")}</p> : null}
      {!loading && hasVisibleRows ? (
        <div className="mt-4 space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--tp-border)] text-[var(--tp-text-muted)]">
                  <th className="py-2 pr-4 font-medium">{t("pastSessions.colForm")}</th>
                  <th className="py-2 pr-4 font-medium">{t("pastSessions.colCode")}</th>
                  <th className="py-2 pr-4 font-medium">{t("pastSessions.colClosed")}</th>
                  <th className="py-2 pr-4 font-medium">{t("pastSessions.colStudents")}</th>
                  <th className="py-2 font-medium">{t("pastSessions.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const exiting = exitingSessionIds.has(s.id);
                  return (
                    <tr
                      key={s.id}
                      role={exiting ? undefined : "link"}
                      tabIndex={exiting ? -1 : 0}
                      onClick={
                        exiting
                          ? undefined
                          : () => router.push(`/dashboard/sessions/${s.id}`)
                      }
                      onKeyDown={
                        exiting
                          ? undefined
                          : (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                router.push(`/dashboard/sessions/${s.id}`);
                              }
                            }
                      }
                      aria-hidden={exiting}
                      className={`border-b border-[var(--tp-border)]/60 last:border-0 transition-colors ${
                        exiting
                          ? "tp-anim-fade-out"
                          : "cursor-pointer hover:bg-[var(--tp-bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tp-accent-ring)] focus-visible:ring-inset"
                      }`}
                    >
                      <td className="py-3 pr-4 font-medium text-[var(--tp-text)]">
                        {s.formTitle}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs tracking-[0.25em] text-[var(--tp-text-muted)]">
                        {s.joinCode}
                      </td>
                      <td className="py-3 pr-4 text-[var(--tp-text-secondary)]">
                        {new Date(s.closesAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3 pr-4 text-[var(--tp-text)]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{s.responseCount}</span>
                          {s.needsGradingCount > 0 ? (
                            <span className="tp-grade-pill tp-grade-pill--needs">
                              {t("pastSessions.toGrade", { n: s.needsGradingCount })}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3" onClick={(event) => event.stopPropagation()}>
                        <ConfirmButton
                          tone="danger"
                          label={t("common.delete")}
                          confirmLabel={t("common.tapAgain")}
                          busy={deletingSessionId === s.id}
                          busyLabel={t("common.deleting")}
                          disabled={deletingSessionId !== null || exiting}
                          className="px-2 py-1 text-xs"
                          onConfirm={() => void deleteSession(s.id)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {total > PAST_SESSIONS_PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--tp-border)] pt-3 text-sm text-[var(--tp-text-secondary)]">
              <p>
                {t("pastSessions.page", {
                  current: page + 1,
                  total: totalPages,
                  totalSessions: total,
                })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 0 || loading}
                  onClick={() => void loadPage(page - 1)}
                  className={`${ui.btnSecondary} px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {t("common.previous")}
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages - 1 || loading}
                  onClick={() => void loadPage(page + 1)}
                  className={`${ui.btnSecondary} px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {t("common.next")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
