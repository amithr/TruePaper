"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { LoadingBar } from "@/components/LoadingBar";
import type { Form, StudentAnswers } from "@/lib/forms";
import { isNoTimeLimitSession } from "@/lib/session-window";
import { parseStudentAnswersJson, stableStringifyStudentAnswers } from "@/lib/student-answers-json";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  parseLiveTeacherFeedback,
  type LiveTeacherFeedbackByQuestionId,
} from "@/lib/live-teacher-feedback";
import { buttonLabel, ui } from "@/lib/ui";
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
  liveTeacherFeedback: LiveTeacherFeedbackByQuestionId;
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
  const answersUnchanged =
    stableStringifyStudentAnswers(prev.answers) === stableStringifyStudentAnswers(answers);
  const dn =
    typeof row.student_display_name === "string" ? row.student_display_name.trim() : prev.student.displayName;
  const lastActivityAt =
    typeof row.last_activity_at === "string" ? row.last_activity_at : prev.student.lastActivityAt;
  const updatedAt = typeof row.updated_at === "string" ? row.updated_at : prev.updatedAt;
  const liveTeacherFeedback = parseLiveTeacherFeedback(row.live_teacher_feedback);
  const feedbackUnchanged =
    JSON.stringify(prev.liveTeacherFeedback) === JSON.stringify(liveTeacherFeedback);

  if (
    answersUnchanged &&
    feedbackUnchanged &&
    updatedAt === prev.updatedAt &&
    dn === prev.student.displayName &&
    (row.suspended_at != null) === prev.student.suspended &&
    (row.finished_at != null) === prev.student.finished &&
    lastActivityAt === prev.student.lastActivityAt
  ) {
    return prev;
  }

  return {
    ...prev,
    answers,
    liveTeacherFeedback,
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

/** Fast poll so teachers see typing even when Supabase Realtime is unavailable. */
const LIVE_ANSWERS_POLL_MS = 400;
const REALTIME_CONNECT_TIMEOUT_MS = 5000;

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
  const [statusMessage, setStatusMessage] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [realtimeMode, setRealtimeMode] = useState<RealtimeMode>("connecting");
  const [pointsDraftsByQuestionId, setPointsDraftsByQuestionId] = useState<Record<string, number>>({});
  const [savingPointsQuestionId, setSavingPointsQuestionId] = useState<string | null>(null);
  const [expandedLiveFeedbackQuestionIds, setExpandedLiveFeedbackQuestionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [liveFeedbackDraftsByQuestionId, setLiveFeedbackDraftsByQuestionId] = useState<
    Record<string, string>
  >({});
  const liveFeedbackSaveTimerRef = useRef<Record<string, number>>({});
  const latestLiveFeedbackDraftsRef = useRef<Record<string, string>>({});

  const refresh = useCallback(async () => {
    if (!liveSessionId || !deviceId) {
      return;
    }
    setLoadError("");
    try {
      const data = await requestJson<SnapshotJson>(
        `/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(deviceId)}/exam-snapshot`,
      );
      setSnapshot((prev) => {
        if (!prev) {
          return data;
        }
        const answersUnchanged =
          stableStringifyStudentAnswers(prev.answers) === stableStringifyStudentAnswers(data.answers);
        const feedbackUnchanged =
          JSON.stringify(prev.liveTeacherFeedback) === JSON.stringify(data.liveTeacherFeedback);
        const metaUnchanged =
          prev.updatedAt === data.updatedAt &&
          prev.student.suspended === data.student.suspended &&
          prev.student.finished === data.student.finished &&
          prev.student.displayName === data.student.displayName &&
          prev.student.lastActivityAt === data.student.lastActivityAt;
        if (answersUnchanged && feedbackUnchanged && metaUnchanged) {
          return prev;
        }
        return data;
      });
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
    if (!snapshot) {
      return;
    }
    const nextPoints: Record<string, number> = {};
    for (const question of snapshot.form.questions) {
      nextPoints[question.id] = Math.max(1, Math.min(1000, Number(question.points) || 1));
    }
    setPointsDraftsByQuestionId(nextPoints);
  }, [snapshot?.form.id, snapshot?.updatedAt]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    setLiveFeedbackDraftsByQuestionId((prev) => {
      const next = { ...snapshot.liveTeacherFeedback };
      for (const questionId of Object.keys(prev)) {
        if (liveFeedbackSaveTimerRef.current[questionId] !== undefined) {
          next[questionId] = prev[questionId];
        }
      }
      return next;
    });
  }, [snapshot?.updatedAt, snapshot?.liveTeacherFeedback]);

  latestLiveFeedbackDraftsRef.current = liveFeedbackDraftsByQuestionId;

  const scheduleLiveFeedbackSave = useCallback(
    (questionId: string) => {
      const existing = liveFeedbackSaveTimerRef.current[questionId];
      if (existing !== undefined) {
        window.clearTimeout(existing);
      }
      liveFeedbackSaveTimerRef.current[questionId] = window.setTimeout(() => {
        delete liveFeedbackSaveTimerRef.current[questionId];
        void (async () => {
          if (!liveSessionId || !deviceId) {
            return;
          }
          const message = (latestLiveFeedbackDraftsRef.current[questionId] ?? "").trim();
          try {
            await requestJson<{ ok: true }>(
              `/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(deviceId)}/live-feedback`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ questionId, message }),
              },
            );
          } catch {
            /* ignore — teacher can retry by typing */
          }
        })();
      }, 350);
    },
    [liveSessionId, deviceId],
  );

  const saveQuestionPoints = async (question: Form["questions"][number]) => {
    const nextPoints = Math.max(1, Math.min(1000, pointsDraftsByQuestionId[question.id] ?? question.points));
    setSavingPointsQuestionId(question.id);
    setLoadError("");
    try {
      await requestJson<{ ok: true }>(`/api/questions/${question.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: question.prompt,
          type: question.type,
          options: question.options,
          correctAnswer: question.type === "multipleChoice" ? question.correctAnswer : null,
          points: nextPoints,
        }),
      });
      await refresh();
      setStatusMessage("Point value updated.");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not save point value.");
    } finally {
      setSavingPointsQuestionId(null);
    }
  };

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
    if (realtimeMode !== "connecting" || session === undefined || session === null) {
      return;
    }
    const id = window.setTimeout(() => {
      setRealtimeMode((mode) => (mode === "connecting" ? "poll" : mode));
    }, REALTIME_CONNECT_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [realtimeMode, session]);

  useEffect(() => {
    if (session === undefined || session === null || !snapshot || snapshot.student.finished) {
      return;
    }
    const id = window.setInterval(() => {
      void refresh();
    }, LIVE_ANSWERS_POLL_MS);
    return () => window.clearInterval(id);
  }, [session, snapshot?.student.finished, refresh]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--tp-bg)] px-6 text-zinc-600">
        <LoadingBar className="max-w-xs" />
      </div>
    );
  }

  if (session === null || !snapshot) {
    return (
      <div className="min-h-screen bg-[var(--tp-bg)] py-8 text-[var(--tp-text)] sm:py-10">
        <main className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <Link
            href={liveSessionId ? `/dashboard/sessions/${liveSessionId}` : "/dashboard"}
            className="text-sm font-medium text-zinc-700 underline"
          >
            ← Session board
          </Link>
          {loadError ? (
            <p className="mt-6 tp-alert tp-alert-error">
              {loadError}
            </p>
          ) : (
            <LoadingBar className="mt-6 max-w-md" label="Loading student exam" />
          )}
        </main>
      </div>
    );
  }

  const s = snapshot.session;
  const st = snapshot.student;
  const msLeft = new Date(s.closesAt).getTime() - nowTick;
  const titleName = st.displayName || maskDeviceId(st.anonymousSessionId);
  const noTimeLimit = isNoTimeLimitSession(s.opensAt, s.closesAt);

  const autoAwardedPointsForQuestion = (question: Form["questions"][number]): number | null => {
    if (question.type !== "multipleChoice" || !question.correctAnswer) {
      return null;
    }
    const maxPoints = pointsDraftsByQuestionId[question.id] ?? question.points;
    return snapshot.answers[question.id] === question.correctAnswer ? maxPoints : 0;
  };

  const streamLine =
    realtimeMode === "live"
      ? "Answers refresh as the student types (autosave + live updates)."
      : realtimeMode === "poll"
        ? "Answers refresh as the student types (autosave every few hundred ms)."
        : "Connecting to live updates…";

  const focusRing =
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2";

  return (
    <div className="min-h-screen bg-[var(--tp-bg)] py-8 text-[var(--tp-text)] sm:py-10">
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 sm:px-6">
        <div>
          <Link
            href={`/dashboard/sessions/${liveSessionId}`}
            className={`text-sm font-medium text-zinc-700 underline ${focusRing}`}
          >
            ← Session board
          </Link>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Live session · {titleName}</h1>
          <p className="mt-1 font-mono text-xs text-zinc-600">Device {maskDeviceId(st.anonymousSessionId)}</p>
          <p className="mt-2 text-sm text-zinc-600">
            {s.sessionOpen
              ? `${noTimeLimit ? "Session open · No time limit" : `Session open · Time left ${formatCountdown(msLeft)}`} · ${streamLine}`
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
            <p className="font-medium">This student has not opened the session on their device yet.</p>
          ) : st.suspended ? (
            <p className="font-medium">
              Session is paused (tab left). Answers below reflect their last autosave or save.
            </p>
          ) : st.finished ? (
            <p className="font-medium">Student has submitted. Answers are read-only.</p>
          ) : (
            <p className="font-medium">
              Live view — text answers update as the student types (autosave every few hundred ms).
            </p>
          )}
          {st.lastActivityAt ? (
            <p className="mt-1 text-xs opacity-90">
              Last activity on device: {new Date(st.lastActivityAt).toLocaleString()}
            </p>
          ) : null}
        </div>
        {statusMessage ? (
          <p className="tp-alert tp-alert-success border px-4 py-3 text-sm text-emerald-900">
            {statusMessage}
          </p>
        ) : null}

        <section className="tp-card p-6">
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
            <div className={`mt-6 ${ui.questionList}`}>
              {snapshot.form.questions.map((question, index) => (
                <article key={question.id} className={ui.questionCardNested}>
                  <h3 className="text-sm font-semibold text-zinc-900">
                    {index + 1}. {question.prompt || "Untitled question"}
                  </h3>

                  <div className={`${ui.questionScoring} mt-3 mb-4 flex flex-wrap items-end gap-3`}>
                    <div>
                      <p className={ui.sectionTitle}>Scoring</p>
                      <label className={`${ui.label} mt-1.5 block`}>
                        Points
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={1000}
                            value={pointsDraftsByQuestionId[question.id] ?? question.points}
                            onChange={(event) =>
                              setPointsDraftsByQuestionId((current) => ({
                                ...current,
                                [question.id]: Math.max(
                                  1,
                                  Math.min(1000, Number(event.target.value) || 1),
                                ),
                              }))
                            }
                            className={ui.pointsInput}
                          />
                          <span className="text-sm font-medium text-[var(--tp-text-muted)]">pts</span>
                        </div>
                      </label>
                    </div>
                    {question.type === "multipleChoice" ? (
                      <label className={`${ui.label} block min-w-[8rem]`}>
                        Auto grade
                        <input
                          type="text"
                          readOnly
                          value={
                            autoAwardedPointsForQuestion(question) === null
                              ? "—"
                              : `${autoAwardedPointsForQuestion(question)}/${pointsDraftsByQuestionId[question.id] ?? question.points}`
                          }
                          className={`${ui.input} mt-1 bg-[var(--tp-bg)] text-center font-semibold tabular-nums`}
                        />
                      </label>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void saveQuestionPoints(question)}
                      disabled={savingPointsQuestionId === question.id}
                      className={`${ui.btnPrimary} px-2.5 py-1.5 text-xs disabled:opacity-50`}
                    >
                      {savingPointsQuestionId === question.id
                        ? buttonLabel("Saving…")
                        : buttonLabel("Save points")}
                    </button>
                  </div>

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
                      {question.correctAnswer ? (
                        <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                          <p>
                            Correct answer: <span className="font-medium text-zinc-900">{question.correctAnswer}</span>
                          </p>
                          <p className="mt-1">
                            Auto score:{" "}
                            <span className="font-medium text-zinc-900">
                              {snapshot.answers[question.id] === question.correctAnswer
                                ? pointsDraftsByQuestionId[question.id] ?? question.points
                                : 0}
                            </span>
                            /{pointsDraftsByQuestionId[question.id] ?? question.points} (graded from teacher answer key)
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500">
                          No correct answer set by teacher, so this question is not auto-scored.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <textarea
                        readOnly
                        rows={6}
                        value={snapshot.answers[question.id] ?? ""}
                        placeholder="No response yet."
                        className="w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                      />
                      {snapshot.form.liveTeacherFeedbackEnabled ? (
                        <div className="rounded-md border border-sky-200 bg-sky-50/80 px-3 py-3">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedLiveFeedbackQuestionIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(question.id)) {
                                  next.delete(question.id);
                                } else {
                                  next.add(question.id);
                                }
                                return next;
                              })
                            }
                            className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium text-sky-950"
                          >
                            <span>Live feedback to student</span>
                            <span className="text-xs font-normal text-sky-800">
                              {expandedLiveFeedbackQuestionIds.has(question.id)
                                ? buttonLabel("Hide")
                                : buttonLabel("Show")}
                            </span>
                          </button>
                          {expandedLiveFeedbackQuestionIds.has(question.id) ? (
                            <textarea
                              rows={3}
                              value={liveFeedbackDraftsByQuestionId[question.id] ?? ""}
                              onChange={(event) => {
                                const next = event.target.value;
                                setLiveFeedbackDraftsByQuestionId((current) => ({
                                  ...current,
                                  [question.id]: next,
                                }));
                                scheduleLiveFeedbackSave(question.id);
                              }}
                              placeholder="Students see this under their answer as you type…"
                              className="mt-2 w-full rounded-md border border-sky-300 bg-white px-3 py-2 text-sm text-zinc-900"
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
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
