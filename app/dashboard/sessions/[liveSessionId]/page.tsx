"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { LoadingBar } from "@/components/LoadingBar";
import { SessionJoinShare } from "@/components/SessionJoinShare";
import type { LiveParticipantUiStatus } from "@/lib/participant-status";
import { isNoTimeLimitSession } from "@/lib/session-window";

type ApiError = { error?: string };

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

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const data = (await response.json()) as T & ApiError;
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}

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
      return "bg-amber-100 text-amber-950 ring-amber-200";
    case "finished":
      return "bg-emerald-100 text-emerald-950 ring-emerald-200";
    case "typing":
      return "bg-sky-100 text-sky-950 ring-sky-200";
    case "idle":
      return "bg-zinc-100 text-zinc-800 ring-zinc-200";
    default:
      return "bg-violet-100 text-violet-950 ring-violet-200";
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

  const focusRing =
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2";

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
      setLoadError(e instanceof Error ? e.message : "Failed to load session.");
      setOverview(null);
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
    void refreshOverview();
  }, [session, refreshOverview]);

  useEffect(() => {
    if (session === undefined || session === null) {
      return;
    }
    const id = window.setInterval(() => {
      setNowTick(Date.now());
      void refreshOverview();
    }, 4000);
    return () => window.clearInterval(id);
  }, [session, refreshOverview]);

  const stopSession = async () => {
    if (!liveSessionId) {
      return;
    }
    if (
      !window.confirm(
        "Stop this live session? Students will not be able to join or save answers in this session window anymore.",
      )
    ) {
      return;
    }
    setActionBusy(true);
    setLoadError("");
    try {
      await requestJson<{ ok: true }>(`/api/forms/live-sessions/${liveSessionId}/stop`, {
        method: "POST",
      });
      await refreshOverview();
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
        body: JSON.stringify({ deviceId }),
      });
      await refreshOverview();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not resume student.");
    } finally {
      setActionBusy(false);
    }
  };


  if (session === undefined) {
    return (
      <div className="min-h-screen bg-zinc-100 py-10 text-zinc-900">
        <main className="mx-auto w-full max-w-5xl px-4 sm:px-6">
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
      <div className="min-h-screen bg-zinc-100 py-10 text-zinc-900">
        <main className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <Link href="/dashboard" className="text-sm font-medium text-zinc-700 underline">
            ← Dashboard
          </Link>
          {loadError ? (
            <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
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
    <div className="min-h-screen bg-zinc-100 py-10 text-zinc-900">
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6">
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
                  className={`font-medium text-emerald-800 underline ${focusRing}`}
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
            <button
              type="button"
              disabled={actionBusy || !sessionRunning}
              onClick={() => void stopSession()}
              className={`rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-800 disabled:opacity-50 ${focusRing}`}
            >
              Stop session
            </button>
            <button
              type="button"
              onClick={() => void refreshOverview()}
              className={`rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 ${focusRing}`}
            >
              Refresh now
            </button>
            </div>
          </div>
        </div>

        {loadError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </p>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Students in this session</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Status and activity for each student device in this live session. The list refreshes
            automatically.
          </p>
          <button
            type="button"
            onClick={() => setParticipantHelpOpen((o) => !o)}
            className={`mt-2 text-sm font-medium text-emerald-800 underline ${focusRing}`}
            aria-expanded={participantHelpOpen}
          >
            {participantHelpOpen ? "Hide status details" : "What do these statuses mean?"}
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
            <p className="mt-4 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
              No devices have joined yet.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-500">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Device</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Last activity</th>
                    <th className="py-2 pr-4 font-medium">Live exam</th>
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
                      className="cursor-pointer border-b border-zinc-100 last:border-0 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset"
                    >
                      <td className="py-3 pr-4 text-zinc-900">
                        {p.displayName ? p.displayName : <span className="text-zinc-400">—</span>}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-zinc-800">
                        {maskDeviceId(p.anonymousSessionId)}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(p.status)}`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-zinc-600">
                        {p.lastActivityAt ? new Date(p.lastActivityAt).toLocaleString() : "—"}
                      </td>
                      <td className="py-3 pr-4">
                        <Link
                          href={`/dashboard/sessions/${liveSessionId}/watch/${encodeURIComponent(p.anonymousSessionId)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="text-sm font-medium text-sky-800 underline decoration-sky-300 underline-offset-2 hover:decoration-sky-600"
                        >
                          Watch live
                        </Link>
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
                            className="rounded-md bg-amber-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                          >
                            Allow to continue
                          </button>
                        ) : (
                          <span className="text-zinc-400">—</span>
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
