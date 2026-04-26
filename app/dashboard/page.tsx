"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Form } from "@/lib/forms";
import type { TeacherSessionSummary } from "@/lib/teacher-sessions";

type ApiError = { error?: string };

type SessionUser = { id: string; email?: string | null };
type SessionProfile = { id: string; role: "teacher" | "student"; display_name: string | null };
type SessionData = { user: SessionUser; profile: SessionProfile | null };

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

function isSessionRunning(now: number, opensAt: string, closesAt: string): boolean {
  const open = new Date(opensAt).getTime();
  const close = new Date(closesAt).getTime();
  return now >= open && now <= close;
}

type SuspendedStudentRow = {
  anonymousSessionId: string;
  displayName: string;
  suspendedAt: string;
};

function maskDeviceId(id: string): string {
  return `…${id.slice(-8)}`;
}

function welcomeName(profile: SessionProfile | null, email: string | null | undefined): string {
  const trimmed = profile?.display_name?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (email) {
    return email.split("@")[0] ?? "there";
  }
  return "there";
}

const PAST_SESSIONS_PAGE_SIZE = 5;

export default function TeacherDashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null | undefined>(undefined);
  const [sessions, setSessions] = useState<TeacherSessionSummary[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [loadError, setLoadError] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [sessionDurations, setSessionDurations] = useState<Record<string, number>>({});
  const [startingFormId, setStartingFormId] = useState<string | null>(null);
  const [suspensionsBySession, setSuspensionsBySession] = useState<Record<string, SuspendedStudentRow[]>>(
    {},
  );
  const [pastSessionsPage, setPastSessionsPage] = useState(0);
  const [formLibrarySearch, setFormLibrarySearch] = useState("");

  const refreshData = useCallback(async () => {
    setLoadError("");
    try {
      const [sessionRes, sessionsRes, formsRes] = await Promise.all([
        fetch("/api/auth/session"),
        requestJson<{ sessions: TeacherSessionSummary[] }>("/api/teacher/sessions"),
        requestJson<{ forms: Form[] }>("/api/forms"),
      ]);
      const sessionJson = (await sessionRes.json()) as {
        user: SessionUser | null;
        profile: SessionProfile | null;
      };
      if (!sessionJson.user) {
        setSession(null);
        router.replace("/login");
        return;
      }
      if (sessionJson.profile?.role !== "teacher") {
        setSession(null);
        router.replace("/");
        return;
      }
      setSession({ user: sessionJson.user, profile: sessionJson.profile });
      setSessions(sessionsRes.sessions);
      setForms(formsRes.forms);

      const nowMs = Date.now();
      const runningSessions = sessionsRes.sessions.filter((s) =>
        isSessionRunning(nowMs, s.opensAt, s.closesAt),
      );
      const nextSusp: Record<string, SuspendedStudentRow[]> = {};
      await Promise.all(
        runningSessions.map(async (s) => {
          try {
            const sub = await requestJson<{ students: SuspendedStudentRow[] }>(
              `/api/forms/live-sessions/${s.id}/suspensions`,
            );
            nextSusp[s.id] = sub.students;
          } catch {
            nextSusp[s.id] = [];
          }
        }),
      );
      setSuspensionsBySession(nextSusp);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load dashboard.");
    }
  }, [router]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshData();
    }, 5000);
    return () => window.clearInterval(id);
  }, [refreshData]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { running, past } = useMemo(() => {
    const run: TeacherSessionSummary[] = [];
    const done: TeacherSessionSummary[] = [];
    for (const s of sessions) {
      if (isSessionRunning(nowTick, s.opensAt, s.closesAt)) {
        run.push(s);
      } else {
        done.push(s);
      }
    }
    return { running: run, past: done };
  }, [sessions, nowTick]);

  const pastSessionsTotalPages = Math.max(1, Math.ceil(past.length / PAST_SESSIONS_PAGE_SIZE));

  useEffect(() => {
    const maxPage = Math.max(0, pastSessionsTotalPages - 1);
    setPastSessionsPage((p) => Math.min(p, maxPage));
  }, [pastSessionsTotalPages]);

  const pastSessionsPageSlice = useMemo(() => {
    const start = pastSessionsPage * PAST_SESSIONS_PAGE_SIZE;
    return past.slice(start, start + PAST_SESSIONS_PAGE_SIZE);
  }, [past, pastSessionsPage]);

  const filteredForms = useMemo(() => {
    const q = formLibrarySearch.trim().toLowerCase();
    if (!q) {
      return forms;
    }
    return forms.filter((f) => {
      const title = (f.title || "").toLowerCase();
      const desc = (f.description || "").toLowerCase();
      return title.includes(q) || desc.includes(q);
    });
  }, [forms, formLibrarySearch]);

  const logout = async () => {
    await requestJson<{ ok: true }>("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  };

  const resumeStudent = async (liveSessionId: string, deviceId: string) => {
    setLoadError("");
    try {
      await requestJson<{ ok: true }>(`/api/forms/live-sessions/${liveSessionId}/resume-student`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      await refreshData();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not resume student.");
    }
  };

  const stopRunningSession = async (liveSessionId: string) => {
    setLoadError("");
    try {
      await requestJson<{ ok: true }>(`/api/forms/live-sessions/${liveSessionId}/stop`, {
        method: "POST",
      });
      await refreshData();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not stop session.");
    }
  };

  const startSessionForForm = async (formId: string) => {
    const minutes = sessionDurations[formId] ?? 45;
    setStartingFormId(formId);
    setLoadError("");
    try {
      const data = await requestJson<{
        joinCode: string;
        closesAt: string;
      }>(`/api/forms/${formId}/live-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes: minutes }),
      });
      await refreshData();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not start session.");
    } finally {
      setStartingFormId(null);
    }
  };

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-600">
        Loading your dashboard…
      </div>
    );
  }

  if (session === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-600">
        Redirecting…
      </div>
    );
  }

  const name = welcomeName(session.profile, session.user.email);

  return (
    <div className="min-h-screen bg-zinc-100 py-10 text-zinc-900">
      <main className="mx-auto w-full max-w-5xl space-y-10 px-4 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <div>
            <p className="text-sm font-medium text-emerald-700">Welcome to Truepaper</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Hello, {name}</h1>
            <p className="mt-2 max-w-2xl text-zinc-600">
              Run timed sessions so students join with a 6-character code—each session is one form
              window where many students can submit answers on their own devices.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800"
            >
              Student join page
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700"
            >
              Log out
            </button>
          </div>
        </header>

        {loadError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </p>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Currently running sessions</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Open windows. Assigned is every device with a session row. In progress counts devices
                with recent pointer/hover/move or typing (idle after ~45s with no pointer and no typing).
                Counts refresh automatically every few seconds.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshData()}
              className="text-sm font-medium text-zinc-700 underline"
            >
              Refresh now
            </button>
          </div>
          {running.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
              No sessions are open right now. Start one from your form library below.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {running.map((s) => {
                const msLeft = new Date(s.closesAt).getTime() - nowTick;
                const suspended = suspensionsBySession[s.id] ?? [];
                return (
                  <li key={s.id} className="px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <Link
                          href={`/dashboard/sessions/${s.id}`}
                          className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                        >
                          {s.formTitle}
                        </Link>
                        <p className="mt-0.5 font-mono text-sm tracking-widest text-zinc-700">
                          {s.joinCode}
                        </p>
                        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                          <Link href={`/dashboard/sessions/${s.id}`} className="font-medium text-zinc-700 underline">
                            Open session board
                          </Link>
                          <Link
                            href={`/live/${encodeURIComponent(s.joinCode)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-emerald-800 underline"
                          >
                            Class display (projector)
                          </Link>
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 text-right text-sm text-zinc-600">
                        <div>
                          <p>
                            <span className="font-semibold text-zinc-900">{s.assignedCount}</span> assigned
                            <span className="mx-1 text-zinc-400">·</span>
                            <span className="font-semibold text-zinc-900">{s.inProgressCount}</span> in
                            progress
                          </p>
                          <p className="mt-0.5">Time left {formatCountdown(msLeft)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void stopRunningSession(s.id)}
                          className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-800"
                        >
                          Stop session
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
                                Allow to continue
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

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Past sessions</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Completed or expired windows; same join code history for your records. Showing{" "}
            {PAST_SESSIONS_PAGE_SIZE} per page.
          </p>
          {past.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
              No past sessions yet.
            </p>
          ) : (
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
                    {pastSessionsPageSlice.map((s) => (
                      <tr key={s.id} className="border-b border-zinc-100 last:border-0">
                        <td className="py-3 pr-4 font-medium text-zinc-900">{s.formTitle}</td>
                        <td className="py-3 pr-4 font-mono tracking-widest">{s.joinCode}</td>
                        <td className="py-3 pr-4 text-zinc-600">
                          {new Date(s.opensAt).toLocaleString()}
                        </td>
                        <td className="py-3 pr-4 text-zinc-600">
                          {new Date(s.closesAt).toLocaleString()}
                        </td>
                        <td className="py-3 text-zinc-900">{s.responseCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {past.length > PAST_SESSIONS_PAGE_SIZE ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3 text-sm text-zinc-600">
                  <p>
                    Page{" "}
                    <span className="font-medium text-zinc-900">{pastSessionsPage + 1}</span> of{" "}
                    <span className="font-medium text-zinc-900">{pastSessionsTotalPages}</span>
                    <span className="text-zinc-400"> · </span>
                    {past.length} session{past.length === 1 ? "" : "s"}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={pastSessionsPage <= 0}
                      onClick={() => setPastSessionsPage((p) => Math.max(0, p - 1))}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={pastSessionsPage >= pastSessionsTotalPages - 1}
                      onClick={() =>
                        setPastSessionsPage((p) => Math.min(pastSessionsTotalPages - 1, p + 1))
                      }
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Form library</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Edit questions and copy, or start a timed session without leaving the dashboard.
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  const data = await requestJson<{ form: Form }>("/api/forms", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                  });
                  setForms((prev) => [...prev, data.form]);
                  router.push(`/?form=${data.form.id}`);
                } catch (e) {
                  setLoadError(e instanceof Error ? e.message : "Could not create form.");
                }
              }}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
            >
              New form
            </button>
          </div>
          {forms.length > 0 ? (
            <label className="mb-4 block text-sm font-medium text-zinc-800">
              Search forms
              <input
                type="search"
                value={formLibrarySearch}
                onChange={(e) => setFormLibrarySearch(e.target.value)}
                placeholder="Filter by title or description…"
                autoComplete="off"
                spellCheck={false}
                className="mt-1.5 w-full max-w-md rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 placeholder:text-zinc-400"
              />
            </label>
          ) : null}
          {forms.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
              Create your first form to build questions, then start a live session for your class.
            </p>
          ) : filteredForms.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
              No forms match “{formLibrarySearch.trim()}”. Try a different search.
            </p>
          ) : (
            <ul className="space-y-4">
              {filteredForms.map((form) => (
                <li
                  key={form.id}
                  className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-zinc-100 bg-zinc-50/80 px-4 py-4"
                >
                  <div>
                    <p className="font-semibold text-zinc-900">{form.title || "Untitled form"}</p>
                    <p className="mt-1 text-sm text-zinc-600">
                      {form.questions.length} question{form.questions.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-sm text-zinc-600">
                      Minutes
                      <input
                        type="number"
                        min={5}
                        max={480}
                        value={sessionDurations[form.id] ?? 45}
                        onChange={(e) =>
                          setSessionDurations((d) => ({
                            ...d,
                            [form.id]: Number(e.target.value) || 45,
                          }))
                        }
                        className="w-20 rounded-md border border-zinc-300 px-2 py-1"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={startingFormId === form.id}
                      onClick={() => void startSessionForForm(form.id)}
                      className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {startingFormId === form.id ? "Starting…" : "Start session"}
                    </button>
                    <Link
                      href={`/?form=${form.id}`}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800"
                    >
                      Edit in builder
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
