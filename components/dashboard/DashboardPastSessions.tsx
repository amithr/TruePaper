"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ConfirmButton } from "@/components/ConfirmButton";
import { LoadingBar } from "@/components/LoadingBar";
import { PAST_SESSIONS_PAGE_SIZE } from "@/lib/teacher-dashboard-server";
import type { TeacherSessionSummary } from "@/lib/teacher-sessions";
import { deferEffect } from "@/lib/defer-effect";
import { buttonLabel, ui } from "@/lib/ui";
import { requestJson } from "@/lib/request-json";
import { usePostgresRealtimeRefresh } from "@/lib/use-postgres-realtime-refresh";

type Props = {
  onError: (message: string) => void;
};

export function DashboardPastSessions({ onError }: Props) {
  const router = useRouter();
  const [sessions, setSessions] = useState<TeacherSessionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAST_SESSIONS_PAGE_SIZE));

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
      } catch (e) {
        onError(e instanceof Error ? e.message : "Failed to load past sessions.");
      } finally {
        setLoading(false);
      }
    },
    [onError],
  );

  useEffect(() => {
    deferEffect(() => {
      void loadPage(0);
    });
  }, [loadPage]);

  const refreshCurrentPage = useCallback(() => {
    void loadPage(page);
  }, [loadPage, page]);

  usePostgresRealtimeRefresh(
    true,
    "teacher-dashboard-past",
    [{ table: "form_responses" }, { table: "form_sessions" }],
    refreshCurrentPage,
    { debounceMs: 600, minIntervalMs: 2000 },
  );

  const deleteSession = async (sessionId: string) => {
    setDeletingSessionId(sessionId);
    onError("");
    try {
      await requestJson<{ ok: true }>(`/api/forms/live-sessions/${sessionId}`, {
        method: "DELETE",
      });
      const nextPage = sessions.length === 1 && page > 0 ? page - 1 : page;
      await loadPage(nextPage);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not delete session.");
    } finally {
      setDeletingSessionId(null);
    }
  };

  return (
    <section className="tp-card p-6">
      <p className={ui.sectionTitle}>History</p>
      <h2 className="text-xl font-semibold tracking-tight">Past sessions</h2>
      {loading && sessions.length === 0 ? (
        <LoadingBar className="mt-4 max-w-md" label="Loading past sessions" />
      ) : null}
      {!loading && total === 0 ? (
        <p className="mt-4 tp-empty">No sessions yet.</p>
      ) : null}
      {!loading && sessions.length > 0 ? (
        <div className="mt-4 space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--tp-border)] text-[var(--tp-text-muted)]">
                  <th className="py-2 pr-4 font-medium">Form</th>
                  <th className="py-2 pr-4 font-medium">Code</th>
                  <th className="py-2 pr-4 font-medium">Closed</th>
                  <th className="py-2 pr-4 font-medium">Students</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={s.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/dashboard/sessions/${s.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(`/dashboard/sessions/${s.id}`);
                      }
                    }}
                    className="cursor-pointer border-b border-[var(--tp-border)]/60 last:border-0 hover:bg-[var(--tp-bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tp-accent-ring)] focus-visible:ring-inset transition-colors"
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
                            {s.needsGradingCount} to grade
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3" onClick={(event) => event.stopPropagation()}>
                      <ConfirmButton
                        tone="danger"
                        label={buttonLabel("Delete")}
                        confirmLabel={buttonLabel("Tap again")}
                        busy={deletingSessionId === s.id}
                        busyLabel={buttonLabel("Deleting…")}
                        disabled={deletingSessionId !== null}
                        className="px-2 py-1 text-xs"
                        onConfirm={() => void deleteSession(s.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > PAST_SESSIONS_PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--tp-border)] pt-3 text-sm text-[var(--tp-text-secondary)]">
              <p>
                Page <span className="font-medium text-[var(--tp-text)]">{page + 1}</span> of{" "}
                <span className="font-medium text-[var(--tp-text)]">{totalPages}</span>
                <span className="text-[var(--tp-text-muted)]"> · </span>
                {total} session{total === 1 ? "" : "s"}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 0 || loading}
                  onClick={() => void loadPage(page - 1)}
                  className={`${ui.btnSecondary} px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {buttonLabel("Previous")}
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages - 1 || loading}
                  onClick={() => void loadPage(page + 1)}
                  className={`${ui.btnSecondary} px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {buttonLabel("Next")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
