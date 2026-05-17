"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { SessionJoinShare } from "@/components/SessionJoinShare";
import { LIVE_SESSION_OVERVIEW_EVENT, liveSessionOverviewChannelName } from "@/lib/broadcast-live-session-overview";
import { notifyStudentExamResumed } from "@/lib/notify-student-exam-resumed";
import { isNoTimeLimitSession } from "@/lib/session-window";
import type { SuspendedStudentRow, TeacherSessionSummary } from "@/lib/teacher-sessions";
import { useBroadcastRefresh } from "@/lib/use-broadcast-refresh";
import { usePostgresRealtimeRefresh } from "@/lib/use-postgres-realtime-refresh";
import { buttonLabel, focusRing, ui } from "@/lib/ui";
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

function maskDeviceId(id: string): string {
  return `…${id.slice(-8)}`;
}

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
        "Failed to refresh live sessions.",
      );
      if (message) {
        onError(message);
      }
    }
  }, [onError]);

  useEffect(() => {
    setSessions(initialSessions);
    setSuspensionsBySession(initialSuspensions);
  }, [initialSessions, initialSuspensions]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const overviewChannels = sessions.map((s) => liveSessionOverviewChannelName(s.id));

  usePostgresRealtimeRefresh(
    true,
    "teacher-dashboard-active",
    [{ table: "form_sessions" }],
    refreshActive,
    { debounceMs: 800, minIntervalMs: 4000 },
  );

  useBroadcastRefresh(
    overviewChannels.length > 0,
    overviewChannels,
    LIVE_SESSION_OVERVIEW_EVENT,
    refreshActive,
    1500,
  );

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
      onError(e instanceof Error ? e.message : "Could not resume student.");
    }
  };

  const stopRunningSession = async (liveSessionId: string) => {
    if (
      !window.confirm(
        "Stop this live session? Students will not be able to join or save answers in this session window anymore.",
      )
    ) {
      return;
    }
    setStoppingSessionId(liveSessionId);
    try {
      await requestJson<{ ok: true }>(`/api/forms/live-sessions/${liveSessionId}/stop`, {
        method: "POST",
      });
      await refreshActive();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not stop session.");
    } finally {
      setStoppingSessionId(null);
    }
  };

  return (
    <section id="running-sessions" className="scroll-mt-6 tp-card p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={ui.sectionTitle}>Live</p>
          <h2 className="text-xl font-semibold tracking-tight">Currently running sessions</h2>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <button
            type="button"
            onClick={() => void refreshActive()}
            className={`text-sm font-medium text-zinc-700 underline ${focusRing}`}
          >
            {buttonLabel("Refresh now")}
          </button>
          <p className="text-xs text-zinc-500">
            Last updated {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : "—"}
          </p>
        </div>
      </div>
      {sessions.length === 0 ? (
        <p className="tp-empty">
          No sessions are open right now. Start one from your form library below.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {sessions.map((s) => {
            const msLeft = new Date(s.closesAt).getTime() - nowTick;
            const suspended = suspensionsBySession[s.id] ?? [];
            const noTimeLimit = isNoTimeLimitSession(s.opensAt, s.closesAt);
            return (
              <li key={s.id} className="px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link
                      href={`/dashboard/sessions/${s.id}`}
                      className={`font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600 ${focusRing}`}
                    >
                      {s.formTitle}
                    </Link>
                    <p className="mt-0.5 font-mono text-sm tracking-widest text-zinc-700">{s.joinCode}</p>
                    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                      <Link
                        href={`/dashboard/sessions/${s.id}`}
                        className={`font-medium text-zinc-700 underline ${focusRing}`}
                      >
                        Open session board
                      </Link>
                      <Link
                        href={`/live/${encodeURIComponent(s.joinCode)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`tp-link ${focusRing}`}
                      >
                        Class display (projector)
                      </Link>
                    </p>
                    <div className="mt-3">
                      <SessionJoinShare joinCode={s.joinCode} />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 text-right text-sm text-zinc-600">
                    <div>
                      <p>
                        <span className="font-semibold text-zinc-900">{s.assignedCount}</span> assigned
                        <span className="mx-1 text-zinc-400">·</span>
                        <span className="font-semibold text-zinc-900">{s.inProgressCount}</span> in progress
                        <span className="mx-1 text-zinc-400">·</span>
                        <span className="font-semibold text-zinc-900">{s.finishedCount}</span> finished
                      </p>
                      <p className="mt-0.5">
                        {noTimeLimit ? "No time limit" : `Time left ${formatCountdown(msLeft)}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void stopRunningSession(s.id)}
                      disabled={stoppingSessionId === s.id}
                      aria-busy={stoppingSessionId === s.id}
                      className={`inline-flex min-w-[7.5rem] items-center justify-center gap-1.5 rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-800 disabled:opacity-70 ${focusRing}`}
                    >
                      {stoppingSessionId === s.id ? (
                        <>
                          <span
                            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-red-200 border-t-red-800"
                            aria-hidden
                          />
                          {buttonLabel("Stopping…")}
                        </>
                      ) : (
                        buttonLabel("Stop session")
                      )}
                    </button>
                  </div>
                </div>
                {suspended.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    <p className="font-medium">Paused (left tab): {suspended.length}</p>
                    <ul className="mt-2 space-y-2">
                      {suspended.map((row) => (
                        <li
                          key={row.anonymousSessionId}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <span className="text-xs text-amber-900">
                            <span className="font-medium">
                              {row.displayName ? row.displayName : "Student"}
                            </span>
                            <span className="mx-1.5 text-amber-700">·</span>
                            <span className="font-mono">{maskDeviceId(row.anonymousSessionId)}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => void resumeStudent(s.id, row.anonymousSessionId)}
                            className="rounded-md bg-amber-900 px-2 py-1 text-xs font-medium text-white"
                          >
                            {buttonLabel("Allow to continue")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
