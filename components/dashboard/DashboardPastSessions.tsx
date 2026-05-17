"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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

  return (
    <section className="tp-card p-6">
      <p className={ui.sectionTitle}>History</p>
      <h2 className="text-xl font-semibold tracking-tight">Past sessions</h2>
      {loading && sessions.length === 0 ? (
        <LoadingBar className="mt-4 max-w-md" label="Loading past sessions" />
      ) : null}
      {!loading && total === 0 ? (
        <p className="mt-4 tp-empty">No past sessions yet.</p>
      ) : null}
      {!loading && sessions.length > 0 ? (
        <div className="mt-4 space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  <th className="py-2 pr-4 font-medium">Form</th>
                  <th className="py-2 pr-4 font-medium">Code</th>
                  <th className="py-2 pr-4 font-medium">Opened</th>
                  <th className="py-2 pr-4 font-medium">Closed</th>
                  <th className="py-2 font-medium">Students</th>
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
                    className="cursor-pointer border-b border-zinc-100 last:border-0 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset"
                  >
                    <td className="py-3 pr-4 font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2">
                      {s.formTitle}
                    </td>
                    <td className="py-3 pr-4 font-mono tracking-widest">{s.joinCode}</td>
                    <td className="py-3 pr-4 text-zinc-600">{new Date(s.opensAt).toLocaleString()}</td>
                    <td className="py-3 pr-4 text-zinc-600">{new Date(s.closesAt).toLocaleString()}</td>
                    <td className="py-3 text-zinc-900">{s.responseCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > PAST_SESSIONS_PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3 text-sm text-zinc-600">
              <p>
                Page <span className="font-medium text-zinc-900">{page + 1}</span> of{" "}
                <span className="font-medium text-zinc-900">{totalPages}</span>
                <span className="text-zinc-400"> · </span>
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
