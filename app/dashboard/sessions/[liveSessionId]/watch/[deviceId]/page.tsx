"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConfirmButton } from "@/components/ConfirmButton";
import { Confetti } from "@/components/Confetti";
import { LoadingBar } from "@/components/LoadingBar";
import { ScoreRing } from "@/components/ScoreMeter";
import { StudentReviewShare } from "@/components/StudentReviewShare";
import { TeacherStudentRejoinShare } from "@/components/TeacherStudentRejoinShare";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  formatPointsScore,
  gradingStateFor,
  isFullyGraded,
  sumEarnedPoints,
  sumPossiblePoints,
} from "@/lib/exam-grades";
import type { Form, Question, StudentAnswers } from "@/lib/forms";
import { isNoTimeLimitSession } from "@/lib/session-window";
import { parseStudentAnswersJson, stableStringifyStudentAnswers } from "@/lib/student-answers-json";
import {
  LIVE_SESSION_OVERVIEW_EVENT,
  liveSessionOverviewChannelName,
} from "@/lib/broadcast-live-session-overview";
import { TEACHER_WATCH_ANSWER_DRAFT_EVENT } from "@/lib/broadcast-exam-drafts";
import {
  TEACHER_WATCH_BROADCAST_EVENT,
  teacherWatchChannelName,
} from "@/lib/broadcast-teacher-watch";
import { notifyStudentExamFeedback } from "@/lib/notify-student-exam-feedback";
import { notifyStudentFeedbackDraft } from "@/lib/notify-student-feedback-draft";
import { useThrottledCallback } from "@/lib/use-throttled-callback";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { useBroadcastRefresh } from "@/lib/use-broadcast-refresh";
import { usePollingRefresh } from "@/lib/use-polling-refresh";
import {
  parseLiveTeacherFeedback,
  type LiveTeacherFeedbackByQuestionId,
} from "@/lib/live-teacher-feedback";
import { buttonLabel, focusRing, ui } from "@/lib/ui";
import { messageForBackgroundRefreshError } from "@/lib/background-network-error";
import { deferEffect } from "@/lib/defer-effect";
import { requestJson } from "@/lib/request-json";
import { useLatestRef } from "@/lib/use-latest-ref";

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
    graded: boolean;
    gradedAt: string | null;
    lastActivityAt: string | null;
    hasJoined: boolean;
  };
  form: Form;
  answers: StudentAnswers;
  questionGrades: Record<string, number>;
  pointsEarned: number | null;
  pointsPossible: number | null;
  liveTeacherFeedback: LiveTeacherFeedbackByQuestionId;
  studentResumeCode: string | null;
  updatedAt: string | null;
};

type SessionUser = { id: string; email?: string | null };
type SessionProfile = { id: string; role: "teacher" | "student"; display_name: string | null };
type SessionData = { user: SessionUser; profile: SessionProfile | null };

type RealtimeMode = "connecting" | "live" | "offline";

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
  const [gradeDraftsByQuestionId, setGradeDraftsByQuestionId] = useState<Record<string, number>>({});
  /** Server-confirmed earned points by question id. `undefined` means not graded yet. */
  const [serverGradesByQuestionId, setServerGradesByQuestionId] = useState<
    Record<string, number | undefined>
  >({});
  const [savingPointsQuestionId, setSavingPointsQuestionId] = useState<string | null>(null);
  /** Saving / saved state for per-question grade autosave (UI only). */
  const [gradeSaveStateByQuestionId, setGradeSaveStateByQuestionId] = useState<
    Record<string, "saving" | "saved" | "error">
  >({});
  /** Questions where the teacher has explicitly overridden the auto-graded MC value. */
  const [mcOverriddenQuestionIds, setMcOverriddenQuestionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const gradeSaveTimerRef = useRef<Record<string, number>>({});
  const gradeSaveClearTimerRef = useRef<Record<string, number>>({});
  /** True while local earned points differ from last server sync for that question. */
  const dirtyGradeRef = useRef<Record<string, boolean>>({});
  const syncedQuestionGradesJsonRef = useRef<string>("");
  const latestGradeDraftsRef = useLatestRef(gradeDraftsByQuestionId);
  const gradeSaveStateRef = useLatestRef(gradeSaveStateByQuestionId);
  const persistGradeRef = useRef<(question: Question) => Promise<void>>(() => Promise.resolve());
  const [markingGraded, setMarkingGraded] = useState(false);
  const [gradeAriaMessage, setGradeAriaMessage] = useState("");
  const [showCelebrate, setShowCelebrate] = useState(false);
  const [liveFeedbackDraftsByQuestionId, setLiveFeedbackDraftsByQuestionId] = useState<
    Record<string, string>
  >({});
  const [liveFeedbackSavingQuestionIds, setLiveFeedbackSavingQuestionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [liveAnswerDrafts, setLiveAnswerDrafts] = useState<StudentAnswers>({});
  const [removingExam, setRemovingExam] = useState(false);
  const liveFeedbackSaveTimerRef = useRef<Record<string, number>>({});
  const scheduleLiveFeedbackSaveRef = useRef<(questionId: string) => void>(() => {});
  const liveFeedbackSavingQuestionIdsRef = useLatestRef(liveFeedbackSavingQuestionIds);
  /** True while local text differs from last successful server save for that question. */
  const dirtyLiveFeedbackRef = useRef<Record<string, boolean>>({});
  const syncedLiveFeedbackJsonRef = useRef<string>("");

  const latestLiveFeedbackDraftsRef = useLatestRef(liveFeedbackDraftsByQuestionId);

  const mergeLiveFeedbackForDisplay = (
    server: LiveTeacherFeedbackByQuestionId,
  ): LiveTeacherFeedbackByQuestionId => {
    const merged = { ...server };
    for (const [questionId, draft] of Object.entries(latestLiveFeedbackDraftsRef.current)) {
      if (isLiveFeedbackPending(questionId) && draft !== undefined) {
        merged[questionId] = draft;
      }
    }
    return merged;
  };

  const isLiveFeedbackPending = (questionId: string): boolean =>
    Boolean(
      dirtyLiveFeedbackRef.current[questionId] ||
        liveFeedbackSaveTimerRef.current[questionId] !== undefined ||
        liveFeedbackSavingQuestionIdsRef.current.has(questionId),
    );

  const isGradePending = (questionId: string): boolean =>
    Boolean(
      dirtyGradeRef.current[questionId] ||
        gradeSaveTimerRef.current[questionId] !== undefined ||
        gradeSaveStateRef.current[questionId] === "saving",
    );

  const mergeQuestionGradesForDisplay = (
    server: Record<string, number | undefined>,
  ): Record<string, number> => {
    const merged: Record<string, number> = {};
    for (const [questionId, value] of Object.entries(server)) {
      if (typeof value === "number") {
        merged[questionId] = value;
      }
    }
    for (const [questionId, draft] of Object.entries(latestGradeDraftsRef.current)) {
      if (isGradePending(questionId)) {
        merged[questionId] = draft;
      }
    }
    return merged;
  };

  const applyServerLiveFeedback = (server: LiveTeacherFeedbackByQuestionId) => {
    const merged = mergeLiveFeedbackForDisplay(server);
    syncedLiveFeedbackJsonRef.current = JSON.stringify(merged);
    return merged;
  };

  const displayAnswers = useMemo(() => {
    if (!snapshot) {
      return {} as StudentAnswers;
    }
    return { ...snapshot.answers, ...liveAnswerDrafts };
  }, [snapshot, liveAnswerDrafts]);

  const broadcastFeedbackDraft = useThrottledCallback(
    (questionId: string, message: string) => {
      if (!liveSessionId || !deviceIdNorm) {
        return;
      }
      void notifyStudentFeedbackDraft(liveSessionId, deviceIdNorm, questionId, message);
    },
    180,
  );

  const refreshRef = useLatestRef(async () => {
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
        const mergedGrades = mergeQuestionGradesForDisplay(data.questionGrades);
        const gradesUnchanged =
          JSON.stringify(prev.questionGrades) === JSON.stringify(mergedGrades);
        const metaUnchanged =
          prev.updatedAt === data.updatedAt &&
          prev.student.suspended === data.student.suspended &&
          prev.student.finished === data.student.finished &&
          prev.student.displayName === data.student.displayName &&
          prev.student.lastActivityAt === data.student.lastActivityAt;
        if (answersUnchanged && feedbackUnchanged && gradesUnchanged && metaUnchanged) {
          return prev;
        }
        return {
          ...data,
          questionGrades: mergedGrades,
          liveTeacherFeedback: applyServerLiveFeedback(data.liveTeacherFeedback),
        };
      });
    } catch (e) {
      const message = messageForBackgroundRefreshError(e, "Failed to load.");
      if (message) {
        setLoadError(message);
      }
    }
  });

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
      void refreshRef.current();
    });
  }, [session, refreshRef]);

  useEffect(() => {
    if (session === undefined || session === null || !liveSessionId || !deviceIdNorm) {
      return;
    }

    let cancelled = false;
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(teacherWatchChannelName(liveSessionId, deviceIdNorm))
      .on("broadcast", { event: TEACHER_WATCH_BROADCAST_EVENT }, () => {
        void refreshRef.current();
      })
      .on("broadcast", { event: TEACHER_WATCH_ANSWER_DRAFT_EVENT }, ({ payload }) => {
        if (cancelled || !payload || typeof payload !== "object" || Array.isArray(payload)) {
          return;
        }
        const answers = (payload as { answers?: unknown }).answers;
        if (answers && typeof answers === "object" && !Array.isArray(answers)) {
          setLiveAnswerDrafts(answers as StudentAnswers);
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [session, liveSessionId, deviceIdNorm, refreshRef]);

  useBroadcastRefresh(
    session !== undefined && session !== null && Boolean(liveSessionId),
    liveSessionId ? [liveSessionOverviewChannelName(liveSessionId)] : [],
    LIVE_SESSION_OVERVIEW_EVENT,
    () => void refreshRef.current(),
    350,
  );

  usePollingRefresh({
    enabled:
      session !== undefined &&
      session !== null &&
      Boolean(snapshot?.session.sessionOpen) &&
      Boolean(liveSessionId && deviceIdNorm),
    intervalMs: 3000,
    onRefresh: () => void refreshRef.current(),
  });

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    const nextPoints: Record<string, number> = {};
    for (const question of snapshot.form.questions) {
      nextPoints[question.id] = Math.max(1, Math.min(1000, Number(question.points) || 1));
    }
    deferEffect(() => {
      setPointsDraftsByQuestionId(nextPoints);
    });
  }, [snapshot?.form.questions]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    const serverJson = JSON.stringify(snapshot.questionGrades);
    if (serverJson === syncedQuestionGradesJsonRef.current) {
      return;
    }
    syncedQuestionGradesJsonRef.current = serverJson;
    const serverGrades = snapshot.questionGrades;
    deferEffect(() => {
      const nextServerGrades: Record<string, number | undefined> = {};
      for (const question of snapshot.form.questions) {
        const serverVal = serverGrades[question.id];
        nextServerGrades[question.id] = typeof serverVal === "number" ? serverVal : undefined;
      }
      setServerGradesByQuestionId(nextServerGrades);
      setGradeDraftsByQuestionId((prev) => {
        const next: Record<string, number> = {};
        for (const question of snapshot.form.questions) {
          const serverVal = serverGrades[question.id];
          if (isGradePending(question.id)) {
            next[question.id] =
              prev[question.id] ?? latestGradeDraftsRef.current[question.id] ?? serverVal ?? 0;
          } else {
            next[question.id] = typeof serverVal === "number" ? serverVal : 0;
            dirtyGradeRef.current[question.id] = false;
          }
        }
        return next;
      });
    });
  }, [snapshot?.questionGrades, snapshot?.form.questions]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    const serverJson = JSON.stringify(snapshot.liveTeacherFeedback);
    if (serverJson === syncedLiveFeedbackJsonRef.current) {
      return;
    }
    syncedLiveFeedbackJsonRef.current = serverJson;
    const serverFeedback = snapshot.liveTeacherFeedback;
    deferEffect(() => {
      setLiveFeedbackDraftsByQuestionId((prev) => {
        const next = { ...serverFeedback };
        for (const questionId of Object.keys(prev)) {
          if (isLiveFeedbackPending(questionId)) {
            next[questionId] = prev[questionId] ?? "";
          }
        }
        return next;
      });
    });
  }, [snapshot?.liveTeacherFeedback, snapshot]);

  const persistLiveFeedbackRef = useLatestRef(async (questionId: string) => {
    if (!liveSessionId || !deviceIdNorm) {
      return;
    }
    const messageAtSaveStart = latestLiveFeedbackDraftsRef.current[questionId] ?? "";
    setLiveFeedbackSavingQuestionIds((prev) => new Set(prev).add(questionId));
    try {
      const result = await requestJson<{
        ok: true;
        liveTeacherFeedback: LiveTeacherFeedbackByQuestionId;
      }>(
        `/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(deviceIdNorm)}/live-feedback`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId, message: messageAtSaveStart }),
        },
      );
      const currentDraft = latestLiveFeedbackDraftsRef.current[questionId] ?? "";
      const serverMsg = result.liveTeacherFeedback[questionId] ?? "";
      const stillEditing = currentDraft !== messageAtSaveStart;

      dirtyLiveFeedbackRef.current[questionId] = currentDraft !== serverMsg;

      const mergedFeedback = applyServerLiveFeedback(result.liveTeacherFeedback);
      setSnapshot((prev) => (prev ? { ...prev, liveTeacherFeedback: mergedFeedback } : prev));

      if (!stillEditing && !dirtyLiveFeedbackRef.current[questionId]) {
        setLiveFeedbackDraftsByQuestionId((prev) => ({
          ...prev,
          [questionId]: serverMsg,
        }));
      } else if (stillEditing) {
        scheduleLiveFeedbackSaveRef.current(questionId);
      }

      void notifyStudentExamFeedback(liveSessionId, deviceIdNorm, mergedFeedback);
      setLoadError("");
    } catch (e) {
      dirtyLiveFeedbackRef.current[questionId] = true;
      setLoadError(e instanceof Error ? e.message : "Could not save feedback to student.");
    } finally {
      setLiveFeedbackSavingQuestionIds((prev) => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
    }
  });

  const scheduleLiveFeedbackSave = useCallback(
    (questionId: string) => {
      const existing = liveFeedbackSaveTimerRef.current[questionId];
      if (existing !== undefined) {
        window.clearTimeout(existing);
      }
      liveFeedbackSaveTimerRef.current[questionId] = window.setTimeout(() => {
        delete liveFeedbackSaveTimerRef.current[questionId];
        void persistLiveFeedbackRef.current(questionId);
      }, 400);
    },
    [persistLiveFeedbackRef],
  );

  useEffect(() => {
    scheduleLiveFeedbackSaveRef.current = scheduleLiveFeedbackSave;
  }, [scheduleLiveFeedbackSave]);

  const flushLiveFeedbackSave = useCallback(
    (questionId: string) => {
      const existing = liveFeedbackSaveTimerRef.current[questionId];
      if (existing !== undefined) {
        window.clearTimeout(existing);
        delete liveFeedbackSaveTimerRef.current[questionId];
      }
      void persistLiveFeedbackRef.current(questionId);
    },
    [persistLiveFeedbackRef],
  );

  const flushAllLiveFeedbackSaves = useCallback(() => {
    for (const questionId of Object.keys(liveFeedbackSaveTimerRef.current)) {
      const existing = liveFeedbackSaveTimerRef.current[questionId];
      if (existing !== undefined) {
        window.clearTimeout(existing);
        delete liveFeedbackSaveTimerRef.current[questionId];
      }
    }
    for (const questionId of Object.keys(dirtyLiveFeedbackRef.current)) {
      if (dirtyLiveFeedbackRef.current[questionId]) {
        void persistLiveFeedbackRef.current(questionId);
      }
    }
  }, [persistLiveFeedbackRef]);

  useEffect(() => {
    const onPageHide = () => {
      flushAllLiveFeedbackSaves();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      flushAllLiveFeedbackSaves();
    };
  }, [flushAllLiveFeedbackSaves]);

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
      await refreshRef.current();
      setStatusMessage("Point value updated.");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not save point value.");
    } finally {
      setSavingPointsQuestionId(null);
    }
  };

  const persistQuestionGrade = useCallback(
    async (question: Question) => {
      const maxPts = Math.max(1, Math.min(1000, Number(question.points) || 1));
      const earned = Math.max(
        0,
        Math.min(maxPts, latestGradeDraftsRef.current[question.id] ?? 0),
      );
      setGradeSaveStateByQuestionId((prev) => ({ ...prev, [question.id]: "saving" }));
      try {
        await requestJson<{ ok: true }>(
          `/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(deviceIdNorm)}/grades`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ questionId: question.id, points: earned }),
          },
        );
        dirtyGradeRef.current[question.id] = false;
        setServerGradesByQuestionId((prev) => ({ ...prev, [question.id]: earned }));
        setSnapshot((prev) => {
          if (!prev) {
            return prev;
          }
          const questionGrades = { ...prev.questionGrades, [question.id]: earned };
          syncedQuestionGradesJsonRef.current = JSON.stringify(questionGrades);
          return { ...prev, questionGrades };
        });
        setGradeDraftsByQuestionId((prev) => ({ ...prev, [question.id]: earned }));
        setGradeSaveStateByQuestionId((prev) => ({ ...prev, [question.id]: "saved" }));
        setGradeAriaMessage(
          `Saved: ${earned} of ${maxPts} point${maxPts === 1 ? "" : "s"} for question.`,
        );
        // Hide the "saved" indicator after a couple seconds.
        const existing = gradeSaveClearTimerRef.current[question.id];
        if (existing !== undefined) {
          window.clearTimeout(existing);
        }
        gradeSaveClearTimerRef.current[question.id] = window.setTimeout(() => {
          delete gradeSaveClearTimerRef.current[question.id];
          setGradeSaveStateByQuestionId((prev) => {
            if (prev[question.id] !== "saved") {
              return prev;
            }
            const next = { ...prev };
            delete next[question.id];
            return next;
          });
        }, 2200);
      } catch (e) {
        dirtyGradeRef.current[question.id] = true;
        setGradeSaveStateByQuestionId((prev) => ({ ...prev, [question.id]: "error" }));
        setLoadError(e instanceof Error ? e.message : "Could not save earned points.");
      }
    },
    [liveSessionId, deviceIdNorm],
  );

  useEffect(() => {
    persistGradeRef.current = persistQuestionGrade;
  }, [persistQuestionGrade]);

  const scheduleGradeSave = useCallback((question: Question) => {
    const existing = gradeSaveTimerRef.current[question.id];
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }
    setGradeSaveStateByQuestionId((prev) => ({ ...prev, [question.id]: "saving" }));
    gradeSaveTimerRef.current[question.id] = window.setTimeout(() => {
      delete gradeSaveTimerRef.current[question.id];
      void persistGradeRef.current(question);
    }, 500);
  }, []);

  const flushAllGradeSaves = useCallback(() => {
    const ids = Object.keys(gradeSaveTimerRef.current);
    for (const qid of ids) {
      const timer = gradeSaveTimerRef.current[qid];
      if (timer !== undefined) {
        window.clearTimeout(timer);
        delete gradeSaveTimerRef.current[qid];
        const question = snapshot?.form.questions.find((q) => q.id === qid);
        if (question) {
          void persistGradeRef.current(question);
        }
      }
    }
  }, [snapshot]);

  useEffect(() => {
    const onHide = () => flushAllGradeSaves();
    window.addEventListener("pagehide", onHide);
    // Snapshot ref maps at effect setup so cleanup acts on the same instances
    // even if the refs are reassigned later.
    const saveTimers = gradeSaveTimerRef.current;
    const clearTimers = gradeSaveClearTimerRef.current;
    return () => {
      window.removeEventListener("pagehide", onHide);
      for (const timer of Object.values(saveTimers)) {
        window.clearTimeout(timer);
      }
      for (const timer of Object.values(clearTimers)) {
        window.clearTimeout(timer);
      }
    };
  }, [flushAllGradeSaves]);

  const markExamGraded = async () => {
    setMarkingGraded(true);
    setLoadError("");
    flushAllGradeSaves();
    try {
      await requestJson<{ ok: true }>(
        `/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(deviceIdNorm)}/mark-graded`,
        { method: "POST" },
      );
      await refreshRef.current();
      setStatusMessage("Exam marked as graded.");
      setShowCelebrate(true);
      window.setTimeout(() => setShowCelebrate(false), 1400);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not mark exam graded.");
    } finally {
      setMarkingGraded(false);
    }
  };

  useEffect(() => {
    if (session === undefined || session === null || !liveSessionId || !deviceIdNorm) {
      return;
    }

    let cancelled = false;
    deferEffect(() => {
      setRealtimeMode("connecting");
    });

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
          setSnapshot((prev) => {
            if (!prev) {
              return prev;
            }
            const next = mergeSnapshotFromRow(prev, row);
            if (next === prev) {
              return prev;
            }
            return {
              ...next,
              liveTeacherFeedback: applyServerLiveFeedback(next.liveTeacherFeedback),
            };
          });
        },
      )
      .subscribe((status) => {
        if (cancelled) {
          return;
        }
        if (status === "SUBSCRIBED") {
          setRealtimeMode("live");
          void refreshRef.current();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRealtimeMode("offline");
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [session, liveSessionId, deviceIdNorm, refreshRef]);

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

  // Derived grading progress + running total.
  const allQuestions = snapshot.form.questions;
  const possibleTotal = sumPossiblePoints(allQuestions);
  // For the running total we want the latest local edits (so the score-strip
  // reacts immediately as the teacher types), but for "fully graded" we rely
  // on server-confirmed state to avoid premature enabling of the CTA.
  const effectiveGrades: Record<string, number> = {};
  for (const q of allQuestions) {
    const server = serverGradesByQuestionId[q.id];
    const draft = gradeDraftsByQuestionId[q.id];
    effectiveGrades[q.id] = typeof server === "number" ? (draft ?? server) : (draft ?? 0);
  }
  const runningEarned = sumEarnedPoints(effectiveGrades, allQuestions);
  const gradedCount = allQuestions.filter(
    (q) => typeof serverGradesByQuestionId[q.id] === "number",
  ).length;
  const allGraded = isFullyGraded(serverGradesByQuestionId, allQuestions);
  const anyGradeSaving = Object.values(gradeSaveStateByQuestionId).some((v) => v === "saving");
  const canMarkGraded =
    st.finished && !st.graded && allQuestions.length > 0 && allGraded && !anyGradeSaving;

  const streamLine =
    realtimeMode === "live"
      ? "Answers update live when the student saves or changes their response."
      : realtimeMode === "offline"
        ? "Live updates disconnected. Use Refresh or reload the page."
        : "Connecting to live updates…";

  const removeStudentExam = async () => {
    if (!liveSessionId || !deviceIdNorm) {
      return;
    }
    setRemovingExam(true);
    setLoadError("");
    try {
      await requestJson<{ ok: true }>(
        `/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(deviceIdNorm)}`,
        { method: "DELETE" },
      );
      router.replace(`/dashboard/sessions/${liveSessionId}`);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not remove student exam.");
      setRemovingExam(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[var(--tp-bg)] py-8 text-[var(--tp-text)] sm:py-10">
      {showCelebrate ? <Confetti /> : null}
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 sm:px-6">
        <div className="flex justify-end">
          <ThemeToggle />
        </div>
        <div>
          <Link
            href={`/dashboard/sessions/${liveSessionId}`}
            className={`text-sm font-medium text-zinc-700 underline ${focusRing}`}
          >
            ← Session board
          </Link>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            {st.finished ? "Review submission" : "Live session"} · {titleName}
          </h1>
          <p className="mt-1 font-mono text-xs text-zinc-600">Device {maskDeviceId(st.anonymousSessionId)}</p>
          <Link
            href={`/dashboard/sessions/${liveSessionId}/exam-list`}
            className={`mt-2 inline-block text-sm tp-link ${focusRing}`}
          >
            See Exam List
          </Link>
          {st.hasJoined ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StudentReviewShare
                liveSessionId={liveSessionId}
                deviceId={deviceIdNorm}
              />
              <a
                href={`/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(deviceIdNorm)}/exam-pdf`}
                download
                className="rounded-[var(--tp-radius-sm)] border border-[var(--tp-border-strong)] bg-[var(--tp-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--tp-text)] shadow-sm transition-all hover:bg-[var(--tp-bg-subtle)] active:scale-[0.97]"
                title="Download this student's exam, feedback, and score as a PDF"
              >
                {buttonLabel("Download PDF")}
              </a>
              <ConfirmButton
                tone="danger"
                label={buttonLabel("Remove exam")}
                confirmLabel={buttonLabel("Tap again to remove")}
                busy={removingExam}
                busyLabel={buttonLabel("Removing…")}
                disabled={removingExam}
                className="px-2.5 py-1.5 text-xs"
                onConfirm={() => void removeStudentExam()}
              />
            </div>
          ) : null}
          {st.hasJoined && s.sessionOpen && !st.finished ? (
            <div className="mt-3">
              <TeacherStudentRejoinShare
                liveSessionId={liveSessionId}
                deviceId={deviceIdNorm}
                initialCode={snapshot.studentResumeCode}
                studentLabel={st.displayName || undefined}
              />
            </div>
          ) : null}
          <p className="mt-2 text-sm text-zinc-600">
            {s.sessionOpen
              ? `${noTimeLimit ? "Session open · No time limit" : `Session open · Time left ${formatCountdown(msLeft)}`} · ${streamLine}`
              : "This session window is closed. Showing the last saved copy."}
          </p>
        </div>

        {st.finished ? (
          <div className="tp-grade-strip tp-anim-fade-up">
            <ScoreRing
              earned={st.graded ? (snapshot.pointsEarned ?? runningEarned) : runningEarned}
              possible={st.graded ? (snapshot.pointsPossible ?? possibleTotal) : possibleTotal}
              size={84}
              stroke={9}
              animate
            />
            <div className="tp-grade-strip__progress">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--tp-text)]">
                  {st.graded ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="tp-status tp-status-graded">
                        <span className="tp-status-dot" />
                        Graded
                      </span>
                      <span className="text-[var(--tp-text-secondary)] font-medium">
                        {formatPointsScore(
                          snapshot.pointsEarned ?? runningEarned,
                          snapshot.pointsPossible ?? possibleTotal,
                        )}
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <span className="tp-status tp-status-finished">
                        <span className="tp-status-dot" />
                        Submitted
                      </span>
                      <span className="text-[var(--tp-text-secondary)] font-medium">
                        {gradedCount} / {allQuestions.length} graded
                      </span>
                    </span>
                  )}
                </p>
                <p className="font-mono text-xs tabular-nums text-[var(--tp-text-secondary)]">
                  {runningEarned} / {possibleTotal} pts
                </p>
              </div>
              <div className="mt-2 tp-grade-strip__bar" aria-hidden>
                <div
                  className={`tp-grade-strip__bar-fill ${
                    allGraded ? "tp-grade-strip__bar-fill--ready" : ""
                  }`}
                  style={{
                    width: `${
                      allQuestions.length === 0
                        ? 0
                        : Math.round((gradedCount / allQuestions.length) * 100)
                    }%`,
                  }}
                />
              </div>
              {st.lastActivityAt ? (
                <p className="mt-1.5 text-[11px] text-[var(--tp-text-muted)]">
                  Last activity {new Date(st.lastActivityAt).toLocaleString()}
                </p>
              ) : null}
            </div>
            {!st.graded ? (
              <button
                type="button"
                disabled={!canMarkGraded || markingGraded}
                onClick={() => void markExamGraded()}
                title={
                  canMarkGraded
                    ? "Mark this exam as fully graded"
                    : "Enter points for every question to enable"
                }
                className={`tp-mark-graded-cta ${focusRing}`}
              >
                {markingGraded ? (
                  buttonLabel("Marking…")
                ) : (
                  <>
                    <svg
                      aria-hidden
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                    Mark as graded
                  </>
                )}
              </button>
            ) : null}
          </div>
        ) : (
          <div
            className={`rounded-[var(--tp-radius)] border px-4 py-3 text-sm ${
              st.suspended
                ? "border-[var(--tp-warning-border)] bg-[var(--tp-warning-soft)] text-[var(--tp-warning-text)]"
                : "border-[var(--tp-border)] bg-[var(--tp-surface)] text-[var(--tp-text)]"
            }`}
          >
            {!st.hasJoined ? (
              <p className="font-medium">Student hasn’t opened the exam yet.</p>
            ) : st.suspended ? (
              <p className="font-medium">Paused — student left the tab.</p>
            ) : (
              <p className="font-medium">Live — answers and feedback sync as you both type.</p>
            )}
            {st.lastActivityAt ? (
              <p className="mt-1 text-xs opacity-80">
                Last activity {new Date(st.lastActivityAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        )}
        <p className="sr-only" aria-live="polite" role="status">
          {gradeAriaMessage}
        </p>
        {loadError ? (
          <p className={ui.alertError}>{loadError}</p>
        ) : null}
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
              {snapshot.form.questions.map((question, index) => {
                const serverGrade = serverGradesByQuestionId[question.id];
                const draftGrade = gradeDraftsByQuestionId[question.id] ?? 0;
                const gradingState = gradingStateFor(question, serverGrade);
                const isAutoMc = gradingState === "auto";
                const showMcOverride = isAutoMc && mcOverriddenQuestionIds.has(question.id);
                const saveState = gradeSaveStateByQuestionId[question.id];
                const gradeInputDisabled =
                  st.graded || (isAutoMc && !showMcOverride);
                const handleGradeChange = (next: number) => {
                  const maxPts = question.points;
                  const clamped = Math.max(0, Math.min(maxPts, Math.round(next)));
                  dirtyGradeRef.current[question.id] = true;
                  setGradeDraftsByQuestionId((current) => ({
                    ...current,
                    [question.id]: clamped,
                  }));
                  scheduleGradeSave(question);
                };
                return (
                <article
                  key={question.id}
                  className={`${ui.questionCardNested} tp-question-grade tp-question-grade--${gradingState}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-zinc-900">
                      {index + 1}. {question.prompt || "Untitled question"}
                    </h3>
                    {st.finished ? (
                      gradingState === "needs-grading" ? (
                        <span className="tp-grade-pill tp-grade-pill--needs">Needs grading</span>
                      ) : gradingState === "auto" ? (
                        <span className="tp-grade-pill tp-grade-pill--auto">
                          Auto · {serverGrade} / {question.points}
                        </span>
                      ) : (
                        <span className="tp-grade-pill tp-grade-pill--graded">
                          Graded · {serverGrade} / {question.points}
                        </span>
                      )
                    ) : null}
                  </div>

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
                    <button
                      type="button"
                      onClick={() => void saveQuestionPoints(question)}
                      disabled={savingPointsQuestionId === question.id}
                      className={`${ui.btnSecondary} px-2.5 py-1.5 text-xs disabled:opacity-50`}
                    >
                      {savingPointsQuestionId === question.id
                        ? buttonLabel("Saving…")
                        : buttonLabel("Save points")}
                    </button>
                  </div>

                  {st.finished ? (
                    <div className="mt-3 mb-4 rounded-[var(--tp-radius-sm)] border border-violet-200 bg-violet-50/50 px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className={ui.sectionTitle}>Earned</p>
                        {!st.graded && saveState ? (
                          <span
                            className="tp-save-indicator"
                            data-state={saveState === "error" ? "error" : saveState}
                          >
                            <span aria-hidden className="tp-save-dot" />
                            <span>
                              {saveState === "saving"
                                ? "Saving"
                                : saveState === "saved"
                                  ? "Saved"
                                  : "Save failed"}
                            </span>
                          </span>
                        ) : null}
                      </div>

                      {isAutoMc && !showMcOverride ? (
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <span className="text-sm font-semibold text-emerald-900">
                            {serverGrade} / {question.points} pts
                          </span>
                          <span className="text-xs text-[var(--tp-text-secondary)]">
                            Auto-scored from the answer key.
                          </span>
                          {!st.graded ? (
                            <button
                              type="button"
                              className={`tp-link text-xs ${focusRing}`}
                              onClick={() =>
                                setMcOverriddenQuestionIds((prev) => {
                                  const next = new Set(prev);
                                  next.add(question.id);
                                  return next;
                                })
                              }
                            >
                              Override
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <>
                          <div className="mt-2 flex flex-wrap items-end gap-3">
                            <label className={`${ui.label} block`}>
                              Points for this answer
                              <div className="mt-1 flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={question.points}
                                  value={draftGrade}
                                  disabled={gradeInputDisabled}
                                  onChange={(event) =>
                                    handleGradeChange(Number(event.target.value) || 0)
                                  }
                                  className={ui.pointsInput}
                                  aria-label={`Points earned on question ${index + 1}`}
                                />
                                <span className="text-sm font-medium text-[var(--tp-text-muted)]">
                                  / {question.points}
                                </span>
                              </div>
                            </label>
                            {!st.graded ? (
                              <div
                                className="flex flex-wrap items-center gap-1.5"
                                role="group"
                                aria-label="Quick score"
                              >
                                <button
                                  type="button"
                                  onClick={() => handleGradeChange(question.points)}
                                  className={`tp-quick-chip tp-quick-chip--full ${
                                    draftGrade === question.points ? "tp-quick-chip--active" : ""
                                  } ${focusRing}`}
                                >
                                  Full
                                </button>
                                {question.points >= 2 ? (
                                  <button
                                    type="button"
                                    onClick={() => handleGradeChange(question.points / 2)}
                                    className={`tp-quick-chip tp-quick-chip--half ${
                                      draftGrade > 0 &&
                                      draftGrade < question.points
                                        ? "tp-quick-chip--active"
                                        : ""
                                    } ${focusRing}`}
                                  >
                                    Half
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => handleGradeChange(0)}
                                  className={`tp-quick-chip tp-quick-chip--zero ${
                                    draftGrade === 0 ? "tp-quick-chip--active" : ""
                                  } ${focusRing}`}
                                >
                                  Zero
                                </button>
                              </div>
                            ) : null}
                          </div>
                          {isAutoMc && showMcOverride && !st.graded ? (
                            <p className="mt-2 text-xs text-[var(--tp-text-secondary)]">
                              Overriding the auto-graded value.{" "}
                              <button
                                type="button"
                                className={`tp-link ${focusRing}`}
                                onClick={() => {
                                  setMcOverriddenQuestionIds((prev) => {
                                    const next = new Set(prev);
                                    next.delete(question.id);
                                    return next;
                                  });
                                }}
                              >
                                Restore auto
                              </button>
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}

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
                            checked={displayAnswers[question.id] === option}
                            disabled
                          />
                          <span>{option || `Option ${optionIndex + 1}`}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <textarea
                        readOnly
                        rows={6}
                        data-testid="teacher-watch-answer"
                        value={displayAnswers[question.id] ?? ""}
                        placeholder="No response yet."
                        className="w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                      />
                      {(() => {
                        const savedMsg = snapshot.liveTeacherFeedback[question.id] ?? "";
                        const draftMsg = liveFeedbackDraftsByQuestionId[question.id] ?? "";
                        const showFeedbackEditor =
                          snapshot.form.liveTeacherFeedbackEnabled ||
                          savedMsg.trim().length > 0 ||
                          draftMsg.trim().length > 0;
                        if (!showFeedbackEditor) {
                          return null;
                        }
                        const feedbackHint =
                          st.finished || !s.sessionOpen
                            ? "Saved · on student results link"
                            : "Saved · visible to student";
                        const isSavingNow = liveFeedbackSavingQuestionIds.has(question.id);
                        return (
                        <div className="rounded-[var(--tp-radius-sm)] border border-sky-200 bg-sky-50/70 px-3 py-3">
                          <label className="block text-sm font-medium text-sky-950">
                            <span className="inline-flex flex-wrap items-center gap-2">
                              Teacher feedback
                              <span
                                data-testid="teacher-live-feedback-status"
                                data-state={isSavingNow ? "saving" : "saved"}
                                className="tp-save-indicator"
                              >
                                <span aria-hidden className="tp-save-dot" />
                                <span>{isSavingNow ? "Saving" : feedbackHint}</span>
                              </span>
                            </span>
                            <textarea
                              rows={3}
                              data-testid="teacher-live-feedback-input"
                              value={liveFeedbackDraftsByQuestionId[question.id] ?? ""}
                              onBlur={() => {
                                flushLiveFeedbackSave(question.id);
                              }}
                              onChange={(event) => {
                                const next = event.target.value;
                                dirtyLiveFeedbackRef.current[question.id] = true;
                                setLiveFeedbackDraftsByQuestionId((current) => ({
                                  ...current,
                                  [question.id]: next,
                                }));
                                broadcastFeedbackDraft(question.id, next);
                                scheduleLiveFeedbackSave(question.id);
                              }}
                              placeholder="Comment appears under the student's answer…"
                              className="mt-2 w-full rounded-md border border-sky-300 bg-white px-3 py-2 text-sm text-zinc-900"
                            />
                          </label>
                        </div>
                        );
                      })()}
                    </div>
                  )}
                </article>
                );
              })}
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
