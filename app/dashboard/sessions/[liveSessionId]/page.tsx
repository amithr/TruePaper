"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ConfirmButton } from "@/components/ConfirmButton";
import { LoadingBar } from "@/components/LoadingBar";
import { SessionJoinShare } from "@/components/SessionJoinShare";
import { StudentReviewShare } from "@/components/StudentReviewShare";
import type { LiveParticipantUiStatus } from "@/lib/participant-status";
import { isNoTimeLimitSession } from "@/lib/session-window";
import {
  LIVE_SESSION_OVERVIEW_EVENT,
  liveSessionOverviewChannelName,
} from "@/lib/broadcast-live-session-overview";
import { deferEffect } from "@/lib/defer-effect";
import { notifyStudentExamResumed } from "@/lib/notify-student-exam-resumed";
import { useBroadcastRefresh } from "@/lib/use-broadcast-refresh";
import { usePollingRefresh } from "@/lib/use-polling-refresh";
import { usePostgresRealtimeRefresh } from "@/lib/use-postgres-realtime-refresh";
import { buttonLabel, focusRing, ui } from "@/lib/ui";

import { messageForBackgroundRefreshError } from "@/lib/background-network-error";
import { requestJson } from "@/lib/request-json";

type SessionUser = { id: string; email?: string | null };
type SessionProfile = { id: string; role: "teacher" | "student"; display_name: string | null };
type SessionData = { user: SessionUser; profile: SessionProfile | null };

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
    case "typing":
      return "tp-status tp-status-typing";
    case "idle":
      return "tp-status tp-status-idle";
    default:
      return "tp-status tp-status-neutral";
  }
}

function statusLabel(status: LiveParticipantUiStatus): string {
  switch (status) {
    case "blocked":
      return "Paused";
    case "finished":
      return "Submitted";
    case "typing":
      return "Typing";
    case "idle":
      return "Idle";
    default:
      return status;
  }
}

export default function LiveSessionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const liveSessionId = typeof params.liveSessionId === "string" ? params.liveSessionId : "";

  const [session, setSession] = useState<SessionData | null | undefined>(undefined);
  const [overview, setOverview] = useState<{
    session: OverviewSession;
    participants: OverviewParticipant[];
  } | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [loadError, setLoadError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [lastOverviewSyncAt, setLastOverviewSyncAt] = useState<number | null>(null);
  const [participantHelpOpen, setParticipantHelpOpen] = useState(false);

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
      const message = messageForBackgroundRefreshError(e, "Failed to load session.");
      if (message) {
        setLoadError(message);
      }
    }
  }, [liveSessionId]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/auth/session");
        const data = (await response.json()) as {
          user: SessionUser | null;
          profile: SessionProfile | null;
        };
        if (!data.user) {
          setSession(null);
          router.replace("/login");
          return;
        }
        if (data.profile?.role !== "teacher") {
          setSession(null);
          router.replace("/");
          return;
        }
        setSession({ user: data.user, profile: data.profile });
      } catch {
        setSession(null);
        router.replace("/login");
      }
    })();
  }, [router]);

  useEffect(() => {
    if (session === undefined || session === null) {
      return;
    }
    deferEffect(() => {
      void refreshOverview();
    });
  }, [session, refreshOverview]);

  usePostgresRealtimeRefresh(
    session !== undefined && session !== null && Boolean(liveSessionId),
    `session-overview:${liveSessionId}`,
    [
      { table: "form_responses", filter: `live_session_id=eq.${liveSessionId}` },
      { table: "form_sessions", filter: `id=eq.${liveSessionId}` },
    ],
    refreshOverview,
    { debounceMs: 500, minIntervalMs: 1000 },
  );

  useBroadcastRefresh(
    session !== undefined && session !== null && Boolean(liveSessionId),
    liveSessionId ? [liveSessionOverviewChannelName(liveSessionId)] : [],
    LIVE_SESSION_OVERVIEW_EVENT,
    refreshOverview,
    500,
  );

  usePollingRefresh({
    enabled:
      session !== undefined && session !== null && Boolean(overview?.session.sessionOpen),
    intervalMs: 4000,
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
    setActionBusy(true);
    setLoadError("");
    try {
      await requestJson<{ ok: true }>(`/api/forms/live-sessions/${liveSessionId}/stop`, {
        method: "POST",
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not stop session.");
    } finally {
      setActionBusy(false);
    }
  };

  const resumeStudent = async (deviceId: string) => {
    if (!liveSessionId) {
      return;
    }
    setActionBusy(true);
    setLoadError("");
    try {
      await requestJson<{ ok: true }>(`/api/forms/live-sessions/${liveSessionId}/resume-student`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: deviceId.toLowerCase() }),
      });
      void notifyStudentExamResumed(liveSessionId, deviceId);
      await refreshOverview();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not resume student.");
    } finally {
      setActionBusy(false);
    }
  };


  if (session === undefined) {
    return (
      <div className={ui.page}>
        <main className={ui.pageMain}>
          <div className="animate-pulse space-y-3 rounded-xl border border-zinc-200 bg-white p-6">
            <div className="h-6 w-48 rounded bg-zinc-200" />
            <div className="h-4 w-32 rounded bg-zinc-100" />
            <div className="h-24 rounded-lg bg-zinc-100" />
          </div>
          <LoadingBar className="mt-4 max-w-md" />
        </main>
      </div>
    );
  }

  if (session === null || !overview) {
    return (
      <div className={ui.page}>
        <main className={ui.pageMain}>
          <Link href="/dashboard" className="text-sm font-medium text-zinc-700 underline">
            ← Dashboard
          </Link>
          {loadError ? (
            <p className="mt-6 tp-alert tp-alert-error">
              {loadError}
            </p>
          ) : (
            <LoadingBar className="mt-6 max-w-md" label="Loading session" />
          )}
        </main>
      </div>
    );
  }

  const s = overview.session;
  const msLeft = new Date(s.closesAt).getTime() - nowTick;
  const sessionRunning = s.sessionOpen;
  const noTimeLimit = isNoTimeLimitSession(s.opensAt, s.closesAt);

  return (
    <div className={ui.page}>
      <main className={`${ui.pageMain} space-y-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Link href="/dashboard" className={`text-sm font-medium text-zinc-700 underline ${focusRing}`}>
            ← Dashboard
            </Link>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">{s.formTitle}</h1>
            <p className="mt-1 font-mono text-sm tracking-widest text-zinc-700">Code {s.joinCode}</p>
            <p className="mt-2 text-sm text-zinc-600">
              {sessionRunning
                ? noTimeLimit
                  ? "Live session open · No time limit"
                  : `Live session open · Time left ${formatCountdown(msLeft)}`
                : "This session window is closed."}
            </p>
            {sessionRunning ? (
              <p className="mt-2 text-sm">
                <Link
                  href={`/live/${encodeURIComponent(s.joinCode)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`tp-link ${focusRing}`}
                >
                  Open class display for projector (new tab)
                </Link>
              </p>
            ) : null}
            <div className="mt-3">
              <SessionJoinShare joinCode={s.joinCode} />
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Last updated{" "}
              {lastOverviewSyncAt ? new Date(lastOverviewSyncAt).toLocaleTimeString() : "—"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap gap-2">
              <ConfirmButton
                tone="danger"
                label={buttonLabel("Stop session")}
                confirmLabel={buttonLabel("Tap again to stop")}
                busy={actionBusy}
                busyLabel={buttonLabel("Stopping…")}
                disabled={!sessionRunning}
                onConfirm={stopSession}
              />
              <button
                type="button"
                onClick={() => void refreshOverview()}
                className={`tp-btn-ghost ${focusRing}`}
                aria-label="Refresh"
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
          <h2 className="text-lg font-semibold">Students in this session</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Status and activity for each student device in this live session. The list refreshes
            automatically.
          </p>
          <button
            type="button"
            onClick={() => setParticipantHelpOpen((o) => !o)}
            className={`mt-2 text-sm tp-link ${focusRing}`}
            aria-expanded={participantHelpOpen}
          >
            {participantHelpOpen
              ? buttonLabel("Hide status details")
              : buttonLabel("What do these statuses mean?")}
          </button>
          {participantHelpOpen ? (
            <p className="mt-2 max-w-2xl text-sm text-zinc-600">
              <span className="font-medium text-zinc-800">Idle</span> means no pointer activity and no
              typing for about 45 seconds. <span className="font-medium text-zinc-800">Typing</span> shows
              briefly when the student is typing. Other badges reflect blocked (tab left) or finished
              states.
            </p>
          ) : null}
          {overview.participants.length === 0 ? (
            <p className="mt-4 tp-empty">
              No devices have joined yet.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--tp-border)] text-[var(--tp-text-muted)]">
                    <th className="py-2 pr-4 font-medium">Student</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Last activity</th>
                    <th className="py-2 pr-4 font-medium">Results</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.participants.map((p) => (
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
                              <span className="text-[var(--tp-text-muted)] italic">No name</span>
                            )}
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--tp-text-muted)]">
                            {maskDeviceId(p.anonymousSessionId)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={statusBadgeClass(p.status)}>
                          <span className="tp-status-dot" />
                          {statusLabel(p.status)}
                        </span>
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
                        <StudentReviewShare
                          liveSessionId={liveSessionId}
                          deviceId={p.anonymousSessionId}
                          disabled={!p.displayName && p.status !== "finished"}
                        />
                      </td>
                      <td className="py-3">
                        {p.status === "blocked" ? (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={(event) => {
                              event.stopPropagation();
                              void resumeStudent(p.anonymousSessionId);
                            }}
                            className="rounded-[var(--tp-radius-xs)] bg-[var(--tp-amber)] px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-transform active:scale-95 disabled:opacity-50"
                          >
                            {buttonLabel("Let in")}
                          </button>
                        ) : (
                          <span className="text-[var(--tp-text-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
