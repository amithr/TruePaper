"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { LoadingBar } from "@/components/LoadingBar";
import { ScoreBar } from "@/components/ScoreMeter";
import { StudentReviewShare } from "@/components/StudentReviewShare";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  countNeedsGrading,
  gradingRosterPriority,
  matchesFilter,
  type GradingRosterFilter,
} from "@/lib/grading-roster";
import type { LiveParticipantUiStatus } from "@/lib/participant-status";
import {
  LIVE_SESSION_OVERVIEW_EVENT,
  liveSessionOverviewChannelName,
} from "@/lib/broadcast-live-session-overview";
import { deferEffect } from "@/lib/defer-effect";
import { isNoTimeLimitSession } from "@/lib/session-window";
import { useBroadcastRefresh } from "@/lib/use-broadcast-refresh";
import { usePollingRefresh } from "@/lib/use-polling-refresh";
import { usePostgresRealtimeRefresh } from "@/lib/use-postgres-realtime-refresh";
import { focusRing, ui } from "@/lib/ui";
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

function statusLabel(status: LiveParticipantUiStatus): string {
  switch (status) {
    case "blocked":
      return "Paused";
    case "finished":
      return "Submitted";
    case "graded":
      return "Graded";
    case "typing":
      return "Typing";
    case "idle":
      return "Idle";
    default:
      return status;
  }
}

export default function SessionExamListPage() {
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
  const [lastOverviewSyncAt, setLastOverviewSyncAt] = useState<number | null>(null);
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
      const message = messageForBackgroundRefreshError(e, "Failed to load student exams.");
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
    `exam-list:${liveSessionId}`,
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

  if (session === undefined || (session !== null && !overview)) {
    return (
      <div className={ui.page}>
        <main className={ui.pageMain}>
          <LoadingBar className="max-w-md" label="Loading student exams" />
        </main>
      </div>
    );
  }

  if (session === null || !overview) {
    return (
      <div className={ui.page}>
        <main className={ui.pageMain}>
          <Link href={`/dashboard/sessions/${liveSessionId}`} className={`text-sm font-medium underline ${focusRing}`}>
            ← Session board
          </Link>
          {loadError ? (
            <p className="mt-6 tp-alert tp-alert-error">{loadError}</p>
          ) : (
            <LoadingBar className="mt-6 max-w-md" label="Loading student exams" />
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
              ← Session board
            </Link>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">Student exams</h1>
            <p className="mt-1 text-sm text-[var(--tp-text-secondary)]">
              {s.formTitle} · Code {s.joinCode}
            </p>
            <p className="mt-2 text-sm text-[var(--tp-text-secondary)]">
              {s.sessionOpen
                ? noTimeLimit
                  ? "Live session open · No time limit"
                  : `Live session open · Time left ${formatCountdown(msLeft)}`
                : "This session window is closed."}
            </p>
            <p className="mt-2 text-xs text-[var(--tp-text-muted)]">
              Last updated{" "}
              {lastOverviewSyncAt ? new Date(lastOverviewSyncAt).toLocaleTimeString() : "—"}
              {activeCount > 0 ? ` · ${activeCount} working now` : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            <a
              href={`/api/forms/live-sessions/${liveSessionId}/exam-bundle-pdf`}
              download
              className={`tp-btn-ghost text-sm ${focusRing}`}
              title="Download a single PDF with every student's exam, feedback, and score"
            >
              Download all (PDF)
            </a>
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

        {loadError ? <p className="tp-alert tp-alert-error">{loadError}</p> : null}

        <section className="tp-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-sm text-[var(--tp-text-secondary)]">
              Every student device in this session. Click a row to open that exam. The list
              refreshes automatically while the session is open.
            </p>
            {overview.participants.length > 0 ? (
              <div
                role="group"
                aria-label="Filter student exams"
                className="tp-filter-bar"
              >
                <button
                  type="button"
                  className="tp-filter-chip"
                  aria-pressed={rosterFilter === "all"}
                  onClick={() => setRosterFilter("all")}
                >
                  All
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
                  Needs grading
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
                  Graded
                  {gradedCount > 0 ? (
                    <span className="text-[var(--tp-text-muted)]">· {gradedCount}</span>
                  ) : null}
                </button>
              </div>
            ) : null}
          </div>

          {overview.participants.length === 0 ? (
            <p className="mt-4 tp-empty">No students have joined yet.</p>
          ) : displayedParticipants.length === 0 ? (
            <p className="mt-4 tp-empty">
              {rosterFilter === "needs-grading"
                ? "Nothing to grade right now. Submissions awaiting grading will appear here."
                : rosterFilter === "graded"
                  ? "No graded exams yet."
                  : "No students match this filter."}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--tp-border)] text-[var(--tp-text-muted)]">
                    <th className="py-2 pr-4 font-medium">Student</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Last activity</th>
                    <th className="py-2 pr-4 font-medium">Score</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedParticipants.map((p) => (
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
                            {p.displayName ? (
                              p.displayName
                            ) : (
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
                      <td className="py-3 pr-4 text-[var(--tp-text-secondary)]">
                        {p.status === "graded" &&
                        p.pointsEarned != null &&
                        p.pointsPossible != null ? (
                          <ScoreBar
                            earned={p.pointsEarned}
                            possible={p.pointsPossible}
                            className="max-w-[10rem]"
                          />
                        ) : p.finishedAt ? (
                          <span className="tp-grade-pill tp-grade-pill--needs">Needs grading</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3" onClick={(event) => event.stopPropagation()}>
                        <div className="flex flex-wrap items-center gap-2">
                          <StudentReviewShare
                            liveSessionId={liveSessionId}
                            deviceId={p.anonymousSessionId}
                            disabled={!p.displayName && p.status !== "finished" && p.status !== "graded"}
                          />
                          <a
                            href={`/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(p.anonymousSessionId)}/exam-pdf`}
                            download
                            className="rounded-[var(--tp-radius-sm)] border border-[var(--tp-border-strong)] bg-[var(--tp-surface)] px-2.5 py-1 text-xs font-medium text-[var(--tp-text)] shadow-sm transition-all hover:bg-[var(--tp-bg-subtle)] active:scale-[0.97]"
                            title="Download this student's exam as PDF"
                          >
                            PDF
                          </a>
                        </div>
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
