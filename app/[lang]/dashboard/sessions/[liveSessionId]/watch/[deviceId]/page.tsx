"use client";

import { useParams } from "next/navigation";

import { LocaleLink as Link, useLocaleRouter as useRouter } from "@/lib/i18n/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LoadingBar } from "@/components/LoadingBar";
import { OverflowMenu, type OverflowMenuItem } from "@/components/OverflowMenu";
import {
  canvasFeedbackKey,
  canvasFeedbackPayload,
  TeacherResponseWatch,
} from "@/components/response-types/TeacherResponseWatch";
import { ScoreRing } from "@/components/ScoreMeter";
import { StudentReviewShare } from "@/components/StudentReviewShare";
import { TeacherStudentRejoinShare } from "@/components/TeacherStudentRejoinShare";
import {
  gradingStateFor,
  isFullyGraded,
  sumEarnedPoints,
  sumPossiblePoints,
} from "@/lib/exam-grades";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { useScoreCopy } from "@/lib/i18n/score-copy";
import type { Form, Question, StudentAnswers } from "@/lib/forms";
import { isNoTimeLimitSession } from "@/lib/session-window";
import { stableStringifyStudentAnswers } from "@/lib/student-answers-json";
import { notifyStudentExamFeedback } from "@/lib/notify-student-exam-feedback";
import { usePollingRefresh } from "@/lib/use-polling-refresh";
import { type LiveTeacherFeedbackByQuestionId } from "@/lib/live-teacher-feedback";
import { focusRing, ui } from "@/lib/ui";
import { messageForBackgroundRefreshError } from "@/lib/background-network-error";
import { deferEffect } from "@/lib/defer-effect";
import { requestJson } from "@/lib/request-json";
import { useLatestRef } from "@/lib/use-latest-ref";
import type { DrawingStroke } from "@/lib/response-types/drawing";

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

export default function WatchStudentExamPage() {
  const t = useTranslations();
  const { formatPointsScore } = useScoreCopy();
  const router = useRouter();
  const params = useParams();
  const liveSessionId = typeof params.liveSessionId === "string" ? params.liveSessionId : "";
  const rawDevice = typeof params.deviceId === "string" ? params.deviceId : "";
  const deviceId = decodeURIComponent(rawDevice).trim();
  const deviceIdNorm = deviceId.toLowerCase();

  const [snapshot, setSnapshot] = useState<SnapshotJson | null>(null);
  const [loadError, setLoadError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
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
  const [feedbackFocusQuestionId, setFeedbackFocusQuestionId] = useState<string | null>(null);
  const [liveFeedbackDraftsByQuestionId, setLiveFeedbackDraftsByQuestionId] = useState<
    Record<string, string>
  >({});
  const [liveFeedbackSavingQuestionIds, setLiveFeedbackSavingQuestionIds] = useState<Set<string>>(
    () => new Set(),
  );
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
    return snapshot.answers;
  }, [snapshot]);

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
      const message = messageForBackgroundRefreshError(e, t("session.errors.load"));
      if (message) {
        setLoadError(message);
      }
    }
  });

  useEffect(() => {
    if (!liveSessionId || !deviceIdNorm) {
      return;
    }
    deferEffect(() => {
      void refreshRef.current();
    });
  }, [liveSessionId, deviceIdNorm, refreshRef]);

  usePollingRefresh({
    enabled:
      Boolean(snapshot?.session.sessionOpen) && Boolean(liveSessionId && deviceIdNorm),
    intervalMs: 3000,
    immediate: false,
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
      setLoadError(e instanceof Error ? e.message : t("session.errors.saveFeedback"));
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

  const persistCanvasAnnotation = useCallback(
    async (questionId: string, strokes: DrawingStroke[]) => {
      if (!liveSessionId || !deviceIdNorm) {
        return;
      }
      try {
        const result = await requestJson<{
          ok: true;
          liveTeacherFeedback: LiveTeacherFeedbackByQuestionId;
        }>(
          `/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(deviceIdNorm)}/feedback-key`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: canvasFeedbackKey(questionId),
              payload: strokes.length > 0 ? canvasFeedbackPayload(strokes) : "",
            }),
          },
        );
        const mergedFeedback = applyServerLiveFeedback(result.liveTeacherFeedback);
        setSnapshot((prev) => (prev ? { ...prev, liveTeacherFeedback: mergedFeedback } : prev));
        void notifyStudentExamFeedback(liveSessionId, deviceIdNorm, mergedFeedback);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : t("session.errors.saveFeedback"));
      }
    },
    [deviceIdNorm, liveSessionId, t],
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
      setStatusMessage(t("session.watch.statusPointsUpdated"));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("session.errors.savePoints"));
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
          t("session.watch.gradeSavedAria", { earned, max: maxPts }),
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
        setLoadError(e instanceof Error ? e.message : t("session.errors.saveEarned"));
      }
    },
    [liveSessionId, deviceIdNorm, t],
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
      setStatusMessage(t("session.watch.statusMarkedGraded"));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("session.errors.markGraded"));
    } finally {
      setMarkingGraded(false);
    }
  };

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-[var(--tp-bg)] py-8 text-[var(--tp-text)] sm:py-10">
        <main className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <Link
            href={liveSessionId ? `/dashboard/sessions/${liveSessionId}` : "/dashboard"}
            className="text-sm font-medium text-zinc-700 underline"
          >
            {t("session.backSessionBoard")}
          </Link>
          {loadError ? (
            <p className="mt-6 tp-alert tp-alert-error">
              {loadError}
            </p>
          ) : (
            <LoadingBar className="mt-6 max-w-md" label={t("loading.studentExam")} />
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
      setLoadError(e instanceof Error ? e.message : t("session.errors.removeExam"));
      setRemovingExam(false);
    }
  };

  const overflowItems: OverflowMenuItem[] = [];
  if (st.hasJoined) {
    overflowItems.push({
      type: "custom",
      key: "review-share",
      node: (
        <StudentReviewShare
          liveSessionId={liveSessionId}
          deviceId={deviceIdNorm}
        />
      ),
    });
    overflowItems.push({
      type: "link",
      label: t("session.watch.downloadPdf"),
      href: `/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(deviceIdNorm)}/exam-pdf`,
      download: true,
    });
    if (s.sessionOpen && !st.finished) {
      overflowItems.push({
        type: "custom",
        key: "rejoin-share",
        node: (
          <TeacherStudentRejoinShare
            liveSessionId={liveSessionId}
            deviceId={deviceIdNorm}
            initialCode={snapshot.studentResumeCode}
            studentLabel={st.displayName || undefined}
          />
        ),
      });
    }
    overflowItems.push({
      type: "button",
      label: t("session.watch.removeExam"),
      tone: "danger",
      disabled: removingExam,
      onClick: () => void removeStudentExam(),
    });
  }

  return (
    <div className="relative min-h-screen bg-[var(--tp-bg)] py-6 text-[var(--tp-text)] sm:py-8">
      <main className="mx-auto w-full max-w-3xl space-y-5 px-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/dashboard/sessions/${liveSessionId}`}
              className={`text-sm font-medium text-[var(--tp-text-secondary)] underline ${focusRing}`}
            >
              {t("session.backSessionBoard")}
            </Link>
            <h1 className="mt-3 truncate text-2xl font-bold tracking-tight">{titleName}</h1>
            <p className="mt-1 text-sm text-[var(--tp-text-secondary)]">
              {s.sessionOpen
                ? noTimeLimit
                  ? t("session.watch.sessionOpenNoLimit")
                  : t("session.watch.sessionOpenTimeLeft", { timeLeft: formatCountdown(msLeft) })
                : t("session.watch.sessionClosedCopy")}
            </p>
            <p className="sr-only">
              {t("session.watch.device", { deviceId: maskDeviceId(st.anonymousSessionId) })}
            </p>
          </div>
          <OverflowMenu label={t("session.watch.moreActions")} items={overflowItems} />
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
                        {t("session.status.graded")}
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
                        {t("session.status.submitted")}
                      </span>
                      <span className="text-[var(--tp-text-secondary)] font-medium">
                        {t("session.watch.gradedProgress", {
                          graded: gradedCount,
                          total: allQuestions.length,
                        })}
                      </span>
                    </span>
                  )}
                </p>
                <p className="font-mono text-xs tabular-nums text-[var(--tp-text-secondary)]">
                  {t("session.watch.pts", { earned: runningEarned, possible: possibleTotal })}
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
                  {t("session.watch.lastActivity", {
                    datetime: new Date(st.lastActivityAt).toLocaleString(),
                  })}
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
                    ? t("session.watch.markGradedTitle")
                    : t("session.watch.markGradedDisabledTitle")
                }
                className={`tp-mark-graded-cta ${focusRing}`}
              >
                {markingGraded ? (
                  t("common.marking")
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
                    {t("session.watch.markGraded")}
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
              <p className="font-medium">{t("session.watch.notJoined")}</p>
            ) : st.suspended ? (
              <p className="font-medium">{t("session.watch.pausedTab")}</p>
            ) : (
              <p className="font-medium">{t("session.watch.liveSync")}</p>
            )}
            {st.lastActivityAt ? (
              <p className="mt-1 text-xs opacity-80">
                {t("session.watch.lastActivity", {
                  datetime: new Date(st.lastActivityAt).toLocaleString(),
                })}
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
            <h2 className="text-xl font-bold">{snapshot.form.title || t("common.untitledForm")}</h2>
            {snapshot.form.description ? (
              <p className="mt-1 text-sm text-zinc-600">{snapshot.form.description}</p>
            ) : null}
          </header>

          {snapshot.form.questions.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-600">
              {t("session.watch.noQuestions")}
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
                      {index + 1}. {question.prompt || t("common.untitledQuestion")}
                    </h3>
                    {st.finished ? (
                      gradingState === "needs-grading" ? (
                        <span className="tp-grade-pill tp-grade-pill--needs">{t("session.watch.needsGradingPill")}</span>
                      ) : gradingState === "auto" ? (
                        <span className="tp-grade-pill tp-grade-pill--auto">
                          {t("session.watch.autoPill", { earned: serverGrade ?? 0, possible: question.points })}
                        </span>
                      ) : (
                        <span className="tp-grade-pill tp-grade-pill--graded">
                          {t("session.watch.gradedPill", { earned: serverGrade ?? 0, possible: question.points })}
                        </span>
                      )
                    ) : null}
                  </div>

                  <details className="mt-3 mb-4 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] px-3 py-2">
                    <summary className={`cursor-pointer text-sm font-medium text-[var(--tp-text-secondary)] ${focusRing}`}>
                      {t("session.watch.adjustPoints")}
                    </summary>
                    <div className={`${ui.questionScoring} mt-3 flex flex-wrap items-end gap-3`}>
                      <div>
                        <p className={ui.sectionTitle}>{t("session.watch.scoring")}</p>
                        <label className={`${ui.label} mt-1.5 block`}>
                          {t("session.watch.points")}
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
                        className={`${ui.btnSecondary} min-h-11 px-3 text-sm disabled:opacity-50`}
                      >
                        {savingPointsQuestionId === question.id
                          ? t("common.saving")
                          : t("session.watch.savePoints")}
                      </button>
                    </div>
                  </details>

                  {st.finished ? (
                    <div className="mt-3 mb-4 rounded-[var(--tp-radius-sm)] border border-violet-200 bg-violet-50/50 px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className={ui.sectionTitle}>{t("session.watch.earned")}</p>
                        {!st.graded && saveState ? (
                          <span
                            className="tp-save-indicator"
                            data-state={saveState === "error" ? "error" : saveState}
                          >
                            <span aria-hidden className="tp-save-dot" />
                            <span>
                              {saveState === "saving"
                                ? t("common.saving")
                                : saveState === "saved"
                                  ? t("home.builder.saved")
                                  : t("home.builder.saveFailed")}
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
                            {t("session.watch.autoScored")}
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
                              {t("session.watch.override")}
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <>
                          {!st.graded ? (
                            <div
                              className="mt-2 flex flex-wrap items-center gap-2"
                              role="group"
                              aria-label={t("session.watch.quickScoreAria")}
                            >
                              <button
                                type="button"
                                onClick={() => handleGradeChange(question.points)}
                                className={`tp-quick-chip tp-quick-chip--full ${
                                  draftGrade === question.points ? "tp-quick-chip--active" : ""
                                } ${focusRing}`}
                              >
                                {t("session.watch.full")}
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
                                  {t("session.watch.half")}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => handleGradeChange(0)}
                                className={`tp-quick-chip tp-quick-chip--zero ${
                                  draftGrade === 0 ? "tp-quick-chip--active" : ""
                                } ${focusRing}`}
                              >
                                {t("session.watch.zero")}
                              </button>
                              <span className="text-sm font-semibold text-[var(--tp-text)]">
                                {draftGrade} / {question.points}
                              </span>
                            </div>
                          ) : (
                            <p className="mt-2 text-sm font-semibold text-[var(--tp-text)]">
                              {draftGrade} / {question.points} pts
                            </p>
                          )}
                          {!st.graded ? (
                            <details className="mt-2">
                              <summary className={`cursor-pointer text-xs font-medium text-[var(--tp-text-secondary)] ${focusRing}`}>
                                {t("session.watch.customScore")}
                              </summary>
                              <label className={`${ui.label} mt-2 block`}>
                                {t("session.watch.pointsForAnswer")}
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
                                    aria-label={t("session.watch.pointsEarnedAria", { n: index + 1 })}
                                  />
                                  <span className="text-sm font-medium text-[var(--tp-text-muted)]">
                                    / {question.points}
                                  </span>
                                </div>
                              </label>
                            </details>
                          ) : null}
                          {isAutoMc && showMcOverride && !st.graded ? (
                            <p className="mt-2 text-xs text-[var(--tp-text-secondary)]">
                              {t("session.watch.overriding")}{" "}
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
                                {t("session.watch.restoreAuto")}
                              </button>
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}

                  <TeacherResponseWatch
                    question={question}
                    rawAnswer={displayAnswers[question.id]}
                    feedbackStore={snapshot.liveTeacherFeedback}
                    liveFeedbackEnabled={snapshot.form.liveTeacherFeedbackEnabled}
                    feedbackFocusQuestionId={feedbackFocusQuestionId}
                    liveFeedbackDraftsByQuestionId={liveFeedbackDraftsByQuestionId}
                    liveFeedbackSavingQuestionIds={liveFeedbackSavingQuestionIds}
                    onFeedbackFocus={setFeedbackFocusQuestionId}
                    onFeedbackBlur={(questionId) => flushLiveFeedbackSave(questionId)}
                    onFeedbackChange={(questionId, next) => {
                      dirtyLiveFeedbackRef.current[questionId] = true;
                      setLiveFeedbackDraftsByQuestionId((current) => ({
                        ...current,
                        [questionId]: next,
                      }));
                      scheduleLiveFeedbackSave(questionId);
                    }}
                    onCanvasAnnotationSave={(questionId, strokes) => {
                      void persistCanvasAnnotation(questionId, strokes);
                    }}
                  />
                </article>
                );
              })}
            </div>
          )}
        </section>

        {snapshot.updatedAt ? (
          <p className="text-center text-xs text-zinc-500">
            {t("session.watch.lastServerUpdate", {
              datetime: new Date(snapshot.updatedAt).toLocaleString(),
            })}
          </p>
        ) : null}
      </main>
    </div>
  );
}
