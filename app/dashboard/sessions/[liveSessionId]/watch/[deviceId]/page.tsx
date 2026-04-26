"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { Form, StudentAnswers } from "@/lib/forms";
import { parseStudentAnswersJson } from "@/lib/student-answers-json";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type ApiError = { error?: string };

type SnapshotJson = {
  session: {
    id: string;
    joinCode: string;
    opensAt: string;
    closesAt: string;
    sessionOpen: boolean;
  };
  student: {
    anonymousSessionId: string;
    displayName: string;
    suspended: boolean;
    finished: boolean;
    lastActivityAt: string | null;
    hasJoined: boolean;
  };
  form: Form;
  answers: StudentAnswers;
  updatedAt: string | null;
};

type SessionUser = { id: string; email?: string | null };
type SessionProfile = { id: string; role: "teacher" | "student"; display_name: string | null };
type SessionData = { user: SessionUser; profile: SessionProfile | null };

type RealtimeMode = "connecting" | "live" | "poll";

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const data = (await response.json()) as T & ApiError;
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
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

function maskDeviceId(id: string): string {
  return `…${id.slice(-8)}`;
}

function mergeSnapshotFromRow(prev: SnapshotJson, row: Record<string, unknown>): SnapshotJson {
  const answers = parseStudentAnswersJson(row.answers);
  const dn =
    typeof row.student_display_name === "string" ? row.student_display_name.trim() : prev.student.displayName;
  const lastActivityAt =
    typeof row.last_activity_at === "string" ? row.last_activity_at : prev.student.lastActivityAt;
  const updatedAt = typeof row.updated_at === "string" ? row.updated_at : prev.updatedAt;

  return {
    ...prev,
    answers,
    student: {
      ...prev.student,
      hasJoined: true,
      displayName: dn,
      suspended: row.suspended_at != null,
      finished: row.finished_at != null,
      lastActivityAt,
    },
    updatedAt,
  };
}

const FALLBACK_POLL_MS = 8000;

export default function WatchStudentExamPage() {
  const router = useRouter();
  const params = useParams();
  const liveSessionId = typeof params.liveSessionId === "string" ? params.liveSessionId : "";
  const rawDevice = typeof params.deviceId === "string" ? params.deviceId : "";
  const deviceId = decodeURIComponent(rawDevice).trim();
  const deviceIdNorm = deviceId.toLowerCase();

  const [session, setSession] = useState<SessionData | null | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<SnapshotJson | null>(null);
  const [loadError, setLoadError] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [realtimeMode, setRealtimeMode] = useState<RealtimeMode>("connecting");

  const refresh = useCallback(async () => {
    if (!liveSessionId || !deviceId) {
      return;
    }
    setLoadError("");
    try {
      const data = await requestJson<SnapshotJson>(
        `/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(deviceId)}/exam-snapshot`,
      );
      setSnapshot(data);
    } catch (e) {
      setSnapshot(null);
      setLoadError(e instanceof Error ? e.message : "Failed to load.");
    }
  }, [liveSessionId, deviceId]);

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
    void refresh();
  }, [session, refresh]);

  useEffect(() => {
    if (session === undefined || session === null || !snapshot) {
      return;
    }

    let cancelled = false;
    setRealtimeMode("connecting");

    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`teacher-exam-watch:${liveSessionId}:${deviceIdNorm}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "form_responses",
          filter: `live_session_id=eq.${liveSessionId}`,
        },
        (payload) => {
          const row = (payload.new ?? null) as Record<string, unknown> | null;
          if (!row || typeof row.anonymous_session_id !== "string") {
            return;
          }
          if (row.anonymous_session_id.toLowerCase() !== deviceIdNorm) {
            return;
          }
          setSnapshot((prev) => (prev ? mergeSnapshotFromRow(prev, row) : prev));
        },
      )
      .subscribe((status) => {
        if (cancelled) {
          return;
        }
        if (status === "SUBSCRIBED") {
          setRealtimeMode("live");
          void refresh();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRealtimeMode("poll");
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [session, snapshot?.form.id, liveSessionId, deviceIdNorm, refresh]);

  useEffect(() => {
    if (realtimeMode !== "poll" || session === undefined || session === null) {
      return;
    }
    const id = window.setInterval(() => {
      void refresh();
    }, FALLBACK_POLL_MS);
    return () => window.clearInterval(id);
  }, [realtimeMode, session, refresh]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-600">
        Loading…
      </div>
    );
  }

  if (session === null || !snapshot) {
    return (
      <div className="min-h-screen bg-zinc-100 py-10 text-zinc-900">
        <main className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <Link
            href={liveSessionId ? `/dashboard/sessions/${liveSessionId}` : "/dashboard"}
            className="text-sm font-medium text-zinc-700 underline"
          >
            ← Session board
          </Link>
          {loadError ? (
            <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {loadError}
            </p>
          ) : (
            <p className="mt-6 text-zinc-600">Loading student exam…</p>
          )}
        </main>
      </div>
    );
  }

  const s = snapshot.session;
  const st = snapshot.student;
  const msLeft = new Date(s.closesAt).getTime() - nowTick;
  const titleName = st.displayName || maskDeviceId(st.anonymousSessionId);

  const streamLine =
    realtimeMode === "live"
      ? "Answers stream live over Supabase Realtime when this student autosaves."
      : realtimeMode === "poll"
        ? "Realtime is unavailable (check migrations / Realtime). Falling back to periodic refresh."
        : "Connecting to live updates…";

  return (
    <div className="min-h-screen bg-zinc-100 py-10 text-zinc-900">
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 sm:px-6">
        <div>
          <Link
            href={`/dashboard/sessions/${liveSessionId}`}
            className="text-sm font-medium text-zinc-700 underline"
          >
            ← Session board
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Live exam · {titleName}</h1>
          <p className="mt-1 font-mono text-xs text-zinc-600">Device {maskDeviceId(st.anonymousSessionId)}</p>
          <p className="mt-2 text-sm text-zinc-600">
            {s.sessionOpen
              ? `Session open · Time left ${formatCountdown(msLeft)} · ${streamLine}`
              : "This session window is closed. Showing the last saved copy."}
          </p>
        </div>

        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            st.suspended
              ? "border-amber-300 bg-amber-50 text-amber-950"
              : st.finished
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : "border-zinc-200 bg-white text-zinc-800"
          }`}
        >
          {!st.hasJoined ? (
            <p className="font-medium">This student has not opened the exam on their device yet.</p>
          ) : st.suspended ? (
            <p className="font-medium">Exam is paused (tab left). Answers below reflect their last autosave or save.</p>
          ) : st.finished ? (
            <p className="font-medium">Student has submitted. Answers are read-only.</p>
          ) : (
            <p className="font-medium">
              Live view — answers update as they work; responses autosave shortly after each change.
            </p>
          )}
          {st.lastActivityAt ? (
            <p className="mt-1 text-xs opacity-90">
              Last activity on device: {new Date(st.lastActivityAt).toLocaleString()}
            </p>
          ) : null}
        </div>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <header>
            <h2 className="text-xl font-bold">{snapshot.form.title || "Untitled form"}</h2>
            {snapshot.form.description ? (
              <p className="mt-1 text-sm text-zinc-600">{snapshot.form.description}</p>
            ) : null}
          </header>

          {snapshot.form.questions.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-600">
              This form has no questions yet.
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              {snapshot.form.questions.map((question, index) => (
                <article key={question.id} className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
                  <h3 className="mb-2 text-sm font-semibold text-zinc-900">
                    {index + 1}. {question.prompt || "Untitled question"}
                  </h3>

                  {question.type === "multipleChoice" ? (
                    <div className="space-y-2">
                      {question.options.map((option, optionIndex) => (
                        <label
                          key={`${question.id}-${optionIndex}`}
                          className="flex cursor-default items-center gap-2 text-sm"
                        >
                          <input
                            type="radio"
                            name={`watch-${question.id}`}
                            value={option}
                            checked={snapshot.answers[question.id] === option}
                            disabled
                          />
                          <span>{option || `Option ${optionIndex + 1}`}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      readOnly
                      rows={6}
                      value={snapshot.answers[question.id] ?? ""}
                      placeholder="No response yet."
                      className="w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                    />
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {snapshot.updatedAt ? (
          <p className="text-center text-xs text-zinc-500">
            Last response update (server): {new Date(snapshot.updatedAt).toLocaleString()}
          </p>
        ) : null}
      </main>
    </div>
  );
}
