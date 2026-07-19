"use client";

import { useParams, useSearchParams } from "next/navigation";

import { useLocaleRouter as useRouter } from "@/lib/i18n/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FormAssetImage } from "@/components/FormAssetImage";
import { ExamMarkdown } from "@/components/ExamMarkdown";
import { HelpHint } from "@/components/HelpHint";
import { LoadingBar } from "@/components/LoadingBar";
import { OverflowMenu, type OverflowMenuItem } from "@/components/OverflowMenu";
import {
  canvasFeedbackKey,
  canvasFeedbackPayload,
  TeacherResponseWatch,
} from "@/components/response-types/TeacherResponseWatch";
import { QuestionTypeBadge } from "@/components/response-types/QuestionTypeBadge";
import { ScoreRing } from "@/components/ScoreMeter";
import { StudentReviewShare } from "@/components/StudentReviewShare";
import { TeacherFeedbackComposer } from "@/components/TeacherFeedbackComposer";
import { TeacherStudentRejoinShare } from "@/components/TeacherStudentRejoinShare";
import { TeacherTopBar } from "@/components/TeacherTopBar";
import { WatchFormBrief } from "@/components/watch/WatchFormBrief";
import { WatchProgressStrip, type JumpSquareState } from "@/components/watch/WatchProgressStrip";
import { WatchScoreStepper } from "@/components/watch/WatchScoreStepper";
import {
  WatchStudentHeader,
  type WatchLiveChipState,
} from "@/components/watch/WatchStudentHeader";
import { useOfflineFeedback } from "@/lib/offline/use-offline-feedback";
import { useFeedbackSyncStatus } from "@/lib/offline/use-feedback-sync-status";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";
import { countAnsweredQuestions } from "@/lib/count-answered-questions";
import {
  gradingStateFor,
  isFullyGraded,
  sumEarnedPoints,
  sumPossiblePoints,
} from "@/lib/exam-grades";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { useScoreCopy } from "@/lib/i18n/score-copy";
import type { Form, Question, StudentAnswers } from "@/lib/forms";
import type { LiveSessionOverviewPayload } from "@/lib/live-session-overview";
import { LIVE_PRESENCE_STALE_MS, LIVE_TYPING_INDICATOR_MS } from "@/lib/participant-status";
import { isNoTimeLimitSession } from "@/lib/session-window";
import { stableStringifyStudentAnswers } from "@/lib/student-answers-json";
import { notifyStudentExamFeedback } from "@/lib/notify-student-exam-feedback";
import { usePollingRefresh } from "@/lib/use-polling-refresh";
import { useLiveSessionOverviewRefresh } from "@/lib/use-live-session-overview-refresh";
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
    lastTypingAt?: string | null;
    lastSeenAt?: string | null;
    focusQuestionId?: string | null;
    hasJoined: boolean;
    handRaiseQuestionId?: string | null;
    handRaisedAt?: string | null;
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

function formatRelativeShort(iso: string | null | undefined, nowMs: number): string {
  if (!iso) {
    return "";
  }
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return "";
  }
  const deltaSec = Math.round((then - nowMs) / 1000);
  const abs = Math.abs(deltaSec);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 60) {
    return rtf.format(deltaSec, "second");
  }
  if (abs < 3600) {
    return rtf.format(Math.round(deltaSec / 60), "minute");
  }
  if (abs < 86400) {
    return rtf.format(Math.round(deltaSec / 3600), "hour");
  }
  return rtf.format(Math.round(deltaSec / 86400), "day");
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

export default function WatchStudentExamPage() {
  const t = useTranslations();
  const { formatPointsScore } = useScoreCopy();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const focusQuestionFromUrl = searchParams.get("question")?.trim() ?? "";
  const liveSessionId = typeof params.liveSessionId === "string" ? params.liveSessionId : "";
  const rawDevice = typeof params.deviceId === "string" ? params.deviceId : "";
  const deviceId = decodeURIComponent(rawDevice).trim();
  const deviceIdNorm = deviceId.toLowerCase();

  const [snapshot, setSnapshot] = useState<SnapshotJson | null>(null);
  const feedback = useOfflineFeedback({
    liveSessionId: liveSessionId || null,
    deviceId: deviceIdNorm || null,
    enabled: snapshot?.form.liveTeacherFeedbackEnabled === true,
  });
  const feedbackSync = useFeedbackSyncStatus({
    liveSessionId: liveSessionId || null,
    enabled: Boolean(liveSessionId),
  });
  const [loadError, setLoadError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  /** Local score drafts; `null` = not marked yet. */
  const [gradeDraftsByQuestionId, setGradeDraftsByQuestionId] = useState<
    Record<string, number | null>
  >({});
  /** Server-confirmed earned points by question id. `undefined` means not graded yet. */
  const [serverGradesByQuestionId, setServerGradesByQuestionId] = useState<
    Record<string, number | undefined>
  >({});
  const [briefOpen, setBriefOpen] = useState(false);
  const [rosterDeviceIds, setRosterDeviceIds] = useState<string[]>([]);
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
  const urlFeedbackFocusQuestionId = useMemo(() => {
    if (
      !focusQuestionFromUrl ||
      !snapshot?.form.questions.some((q) => q.id === focusQuestionFromUrl)
    ) {
      return null;
    }
    return focusQuestionFromUrl;
  }, [focusQuestionFromUrl, snapshot?.form.questions]);
  const activeFeedbackFocusQuestionId = feedbackFocusQuestionId ?? urlFeedbackFocusQuestionId;
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
      if (isGradePending(questionId) && typeof draft === "number") {
        merged[questionId] = draft;
      }
    }
    return merged;
  };

  const refreshRosterRef = useLatestRef(async () => {
    if (!liveSessionId) {
      return;
    }
    try {
      const data = await requestJson<LiveSessionOverviewPayload>(
        `/api/forms/live-sessions/${liveSessionId}/overview`,
      );
      setRosterDeviceIds(
        data.participants.map((p) => p.anonymousSessionId.trim().toLowerCase()),
      );
    } catch {
      /* roster nav is best-effort */
    }
  });

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
          prev.student.lastActivityAt === data.student.lastActivityAt &&
          (prev.student.lastTypingAt ?? null) === (data.student.lastTypingAt ?? null) &&
          (prev.student.lastSeenAt ?? null) === (data.student.lastSeenAt ?? null) &&
          (prev.student.focusQuestionId ?? null) === (data.student.focusQuestionId ?? null) &&
          (prev.student.handRaiseQuestionId ?? null) ===
            (data.student.handRaiseQuestionId ?? null) &&
          (prev.student.handRaisedAt ?? null) === (data.student.handRaisedAt ?? null);
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
      void refreshRosterRef.current();
    });
  }, [liveSessionId, deviceIdNorm, refreshRef, refreshRosterRef]);

  usePollingRefresh({
    enabled:
      Boolean(snapshot?.session.sessionOpen) && Boolean(liveSessionId && deviceIdNorm),
    intervalMs: 3000,
    immediate: false,
    onRefresh: () => void refreshRef.current(),
  });

  // Student raise/lower hand notifies the overview channel — refresh the watch
  // snapshot so the typing/hand indicators clear without waiting for the poll.
  useLiveSessionOverviewRefresh(
    Boolean(snapshot?.session.sessionOpen) && Boolean(liveSessionId && deviceIdNorm),
    liveSessionId,
    () => {
      void refreshRef.current();
      void refreshRosterRef.current();
    },
  );

  const handRaiseQuestionId =
    snapshot?.student.handRaisedAt && snapshot.student.handRaiseQuestionId
      ? snapshot.student.handRaiseQuestionId
      : null;

  // Drop sticky ?question= once the student lowers (or moves) their hand.
  useEffect(() => {
    if (!focusQuestionFromUrl) {
      return;
    }
    if (handRaiseQuestionId === focusQuestionFromUrl) {
      return;
    }
    if (snapshot == null) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has("question")) {
      return;
    }
    params.delete("question");
    const qs = params.toString();
    router.replace(
      `/dashboard/sessions/${liveSessionId}/watch/${encodeURIComponent(deviceIdNorm)}${
        qs ? `?${qs}` : ""
      }`,
    );
  }, [
    focusQuestionFromUrl,
    handRaiseQuestionId,
    snapshot,
    searchParams,
    router,
    liveSessionId,
    deviceIdNorm,
  ]);

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
        const next: Record<string, number | null> = {};
        for (const question of snapshot.form.questions) {
          const serverVal = serverGrades[question.id];
          if (isGradePending(question.id)) {
            next[question.id] =
              prev[question.id] ??
              latestGradeDraftsRef.current[question.id] ??
              (typeof serverVal === "number" ? serverVal : null);
          } else {
            next[question.id] = typeof serverVal === "number" ? serverVal : null;
            dirtyGradeRef.current[question.id] = false;
          }
        }
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preserve in-flight grade drafts on poll
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preserve in-flight feedback drafts on poll
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
      }, 700);
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
    // applyServerLiveFeedback reads refs only; stable across renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  useEffect(() => {
    if (!urlFeedbackFocusQuestionId) {
      return;
    }
    deferEffect(() => {
      document.getElementById(`watch-q-${urlFeedbackFocusQuestionId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [urlFeedbackFocusQuestionId]);

  const persistQuestionGrade = useCallback(
    async (question: Question) => {
      const maxPts = Math.max(1, Math.min(1000, Number(question.points) || 1));
      const draft = latestGradeDraftsRef.current[question.id];
      if (typeof draft !== "number") {
        setGradeSaveStateByQuestionId((prev) => {
          const next = { ...prev };
          delete next[question.id];
          return next;
        });
        return;
      }
      const earned = Math.max(0, Math.min(maxPts, draft));
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
    // latestGradeDraftsRef is stable; omit from deps to avoid grade autosave churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    }, 700);
  }, []);

  const flushAllGradeSaves = useCallback(async () => {
    const ids = Object.keys(gradeSaveTimerRef.current);
    const pending: Promise<void>[] = [];
    for (const qid of ids) {
      const timer = gradeSaveTimerRef.current[qid];
      if (timer !== undefined) {
        window.clearTimeout(timer);
        delete gradeSaveTimerRef.current[qid];
        const question = snapshot?.form.questions.find((q) => q.id === qid);
        if (question) {
          pending.push(persistGradeRef.current(question));
        }
      }
    }
    await Promise.all(pending);
  }, [snapshot]);

  useEffect(() => {
    const onHide = () => void flushAllGradeSaves();
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
    try {
      await flushAllGradeSaves();
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
        <main className="mx-auto w-full max-w-3xl space-y-6 px-4 sm:px-6">
          <TeacherTopBar />
          <div>
            <Breadcrumbs
              items={[
                { label: t("nav.dashboard"), href: "/dashboard" },
                ...(liveSessionId
                  ? [{ label: t("nav.liveSession"), href: `/dashboard/sessions/${liveSessionId}` }]
                  : []),
                { label: t("nav.studentExam") },
              ]}
            />
            {loadError ? (
              <p className="mt-6 tp-alert tp-alert-error">
                {loadError}
              </p>
            ) : (
              <LoadingBar className="mt-6 max-w-md" label={t("loading.studentExam")} />
            )}
          </div>
        </main>
      </div>
    );
  }

  const s = snapshot.session;
  const st = snapshot.student;
  const msLeft = new Date(s.closesAt).getTime() - nowTick;
  const titleName = st.displayName || maskDeviceId(st.anonymousSessionId);
  const noTimeLimit = isNoTimeLimitSession(s.opensAt, s.closesAt);

  const allQuestions = snapshot.form.questions;
  const possibleTotal = sumPossiblePoints(allQuestions);
  const questionIds = allQuestions.map((q) => q.id);
  const answeredCount = countAnsweredQuestions(displayAnswers, questionIds);

  const effectiveGrades: Record<string, number> = {};
  let pointsAwarded = 0;
  for (const q of allQuestions) {
    const server = serverGradesByQuestionId[q.id];
    const draft = gradeDraftsByQuestionId[q.id];
    // Draft is `null` until the teacher marks; prefer local draft once set.
    const value = typeof draft === "number" ? draft : typeof server === "number" ? server : null;
    if (typeof value === "number") {
      effectiveGrades[q.id] = value;
      pointsAwarded += value;
    }
  }
  const runningEarned = sumEarnedPoints(
    Object.fromEntries(allQuestions.map((q) => [q.id, effectiveGrades[q.id] ?? 0])),
    allQuestions,
  );
  const gradedCount = allQuestions.filter(
    (q) => typeof serverGradesByQuestionId[q.id] === "number",
  ).length;
  const allGraded = isFullyGraded(serverGradesByQuestionId, allQuestions);
  const anyGradeSaving = Object.values(gradeSaveStateByQuestionId).some((v) => v === "saving");
  const canMarkGraded =
    st.finished && !st.graded && allQuestions.length > 0 && allGraded && !anyGradeSaving;

  const rosterIndex = rosterDeviceIds.indexOf(deviceIdNorm);
  const studentIndex = rosterIndex >= 0 ? rosterIndex + 1 : 1;
  const studentCount = Math.max(rosterDeviceIds.length, 1);
  const prevDeviceId =
    rosterIndex > 0 ? rosterDeviceIds[rosterIndex - 1] : undefined;
  const nextDeviceId =
    rosterIndex >= 0 && rosterIndex < rosterDeviceIds.length - 1
      ? rosterDeviceIds[rosterIndex + 1]
      : undefined;

  const navigateToStudent = (targetDeviceId: string) => {
    const q =
      activeFeedbackFocusQuestionId ||
      st.focusQuestionId ||
      handRaiseQuestionId ||
      "";
    const qs = q ? `?question=${encodeURIComponent(q)}` : "";
    router.push(
      `/dashboard/sessions/${liveSessionId}/watch/${encodeURIComponent(targetDeviceId)}${qs}`,
    );
  };

  const jumpToQuestion = (questionId: string) => {
    document.getElementById(`watch-q-${questionId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  const lastSeenStale =
    Boolean(st.lastSeenAt) &&
    nowTick - new Date(st.lastSeenAt!).getTime() > LIVE_PRESENCE_STALE_MS;
  const typingRecently =
    Boolean(st.lastTypingAt) &&
    nowTick - new Date(st.lastTypingAt!).getTime() < LIVE_TYPING_INDICATOR_MS;
  const focusQId = st.focusQuestionId ?? null;
  const typingQuestionIndex =
    focusQId && typingRecently
      ? allQuestions.findIndex((q) => q.id === focusQId)
      : -1;

  let liveChip: WatchLiveChipState;
  if (!st.hasJoined) {
    liveChip = { kind: "notJoined" };
  } else if (st.suspended) {
    liveChip = { kind: "paused" };
  } else if (st.finished || lastSeenStale || !s.sessionOpen) {
    liveChip = {
      kind: "offline",
      lastSeenLabel: formatRelativeShort(st.lastSeenAt ?? st.lastActivityAt, nowTick) || undefined,
    };
  } else if (typingQuestionIndex >= 0) {
    liveChip = { kind: "typing", questionIndex: typingQuestionIndex + 1 };
  } else {
    liveChip = { kind: "live" };
  }

  const lastActivityLabel = formatRelativeShort(st.lastActivityAt, nowTick);

  const jumpSquares = allQuestions.map((q, index) => {
    const server = serverGradesByQuestionId[q.id];
    const draft = gradeDraftsByQuestionId[q.id];
    const graded = typeof draft === "number" || typeof server === "number";
    const answered = (displayAnswers[q.id] ?? "").trim().length > 0;
    const state: JumpSquareState = graded ? "graded" : answered ? "answered" : "empty";
    return { id: q.id, index, state };
  });

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
        <span className="flex items-center gap-2">
          <StudentReviewShare
            liveSessionId={liveSessionId}
            deviceId={deviceIdNorm}
          />
          <HelpHint id="watch-review-link" text={t("help.watch.reviewLink")} />
        </span>
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
          <span className="flex items-center gap-2">
            <TeacherStudentRejoinShare
              liveSessionId={liveSessionId}
              deviceId={deviceIdNorm}
              initialCode={snapshot.studentResumeCode}
              studentLabel={st.displayName || undefined}
            />
            <HelpHint id="watch-resume-code" text={t("help.session.resumeCode")} />
          </span>
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
    <div className="relative min-h-screen bg-[var(--tp-watch-page-bg,#eef1f6)] py-6 text-[var(--tp-text)] sm:py-8">
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 sm:px-6">
        <TeacherTopBar />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Breadcrumbs
            items={[
              { label: t("nav.dashboard"), href: "/dashboard" },
              {
                label: snapshot.form.title || t("nav.liveSession"),
                href: `/dashboard/sessions/${liveSessionId}`,
              },
              { label: titleName },
            ]}
          />
          <div className="flex items-center gap-2">
            <SyncStatusIndicator
              status={feedbackSync.status}
              viewer="teacher"
              contextLabel={t("sync.context.yourFeedback")}
              onRetry={() => void feedbackSync.retry()}
            />
            {canMarkGraded ? (
              <button
                type="button"
                disabled={markingGraded}
                onClick={() => void markExamGraded()}
                title={t("session.watch.markGradedTitle")}
                className={`tp-mark-graded-cta ${focusRing}`}
              >
                {markingGraded ? t("common.marking") : t("session.watch.markGraded")}
              </button>
            ) : null}
          </div>
        </div>

        <WatchStudentHeader
          studentName={titleName}
          chip={liveChip}
          lastActivityLabel={lastActivityLabel || undefined}
          studentIndex={studentIndex}
          studentCount={studentCount}
          onPrev={prevDeviceId ? () => navigateToStudent(prevDeviceId) : undefined}
          onNext={nextDeviceId ? () => navigateToStudent(nextDeviceId) : undefined}
          actions={
            <OverflowMenu label={t("session.watch.moreActions")} items={overflowItems} />
          }
        />

        <p className="sr-only">
          {t("session.watch.device", { deviceId: maskDeviceId(st.anonymousSessionId) })}
          {s.sessionOpen
            ? noTimeLimit
              ? t("session.watch.sessionOpenNoLimit")
              : t("session.watch.sessionOpenTimeLeft", { timeLeft: formatCountdown(msLeft) })
            : t("session.watch.sessionClosedCopy")}
        </p>

        {st.finished ? (
          <div className="tp-grade-strip tp-anim-fade-up">
            <ScoreRing
              earned={st.graded ? (snapshot.pointsEarned ?? runningEarned) : runningEarned}
              possible={st.graded ? (snapshot.pointsPossible ?? possibleTotal) : possibleTotal}
              size={72}
              stroke={8}
              animate={st.graded}
            />
            <div className="tp-grade-strip__progress">
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
                {markingGraded ? t("common.marking") : t("session.watch.markGraded")}
              </button>
            ) : null}
          </div>
        ) : null}

        <WatchProgressStrip
          answeredCount={answeredCount}
          questionCount={allQuestions.length}
          pointsAwarded={pointsAwarded}
          pointsMax={possibleTotal}
          jumps={jumpSquares}
          onJump={jumpToQuestion}
        />

        <WatchFormBrief
          title={snapshot.form.title || t("common.untitledForm")}
          description={snapshot.form.description || ""}
          descriptionImagePath={snapshot.form.descriptionImagePath}
          open={briefOpen}
          onOpenChange={setBriefOpen}
        />

        <p className="sr-only" aria-live="polite" role="status">
          {gradeAriaMessage}
        </p>
        {loadError ? <p className={ui.alertError}>{loadError}</p> : null}
        {feedback.failedCount > 0 ? (
          <p className={ui.alertWarning} role="alert">
            {t("feedback.composer.failedBanner", { count: feedback.failedCount })}
          </p>
        ) : null}
        {statusMessage ? (
          <p className="tp-alert tp-alert-success border px-4 py-3 text-sm text-emerald-900">
            {statusMessage}
          </p>
        ) : null}

        {allQuestions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--tp-border)] bg-white p-4 text-sm text-[var(--tp-text-secondary)]">
            {t("session.watch.noQuestions")}
          </p>
        ) : (
          <div className="tp-watch-q-list">
            {allQuestions.map((question, index) => {
              const serverGrade = serverGradesByQuestionId[question.id];
              const draftGrade = gradeDraftsByQuestionId[question.id];
              const gradingState = gradingStateFor(question, serverGrade);
              const isAutoMc = gradingState === "auto";
              const showMcOverride = isAutoMc && mcOverriddenQuestionIds.has(question.id);
              const saveState = gradeSaveStateByQuestionId[question.id];
              const scoreValue: number | null =
                typeof draftGrade === "number"
                  ? draftGrade
                  : typeof serverGrade === "number"
                    ? serverGrade
                    : null;
              const scoreDisabled =
                st.graded || (isAutoMc && !showMcOverride);
              const isTypingHere =
                typingRecently && focusQId === question.id && !st.finished && !st.suspended;
              const isHandHere = handRaiseQuestionId === question.id;
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
                  id={`watch-q-${question.id}`}
                  className={`tp-watch-q${isTypingHere ? " tp-watch-q--typing" : ""}${
                    isHandHere && !isTypingHere ? " tp-watch-q--hand" : ""
                  }`}
                >
                  <div className="tp-watch-q__meta">
                    <span className="tp-watch-q__num">{index + 1}</span>
                    <QuestionTypeBadge
                      type={question.type}
                      className={`tp-watch-type-badge tp-watch-type-badge--${question.type}`}
                    />
                    <span className="tp-watch-q__max">
                      {t("session.watch.maxMarks", { max: question.points })}
                    </span>
                  </div>
                  {isTypingHere ? (
                    <p className="tp-watch-typing-hint">
                      <span aria-hidden className="tp-watch-typing-hint__dot" />
                      {t("session.watch.studentTypingHere")}
                    </p>
                  ) : null}
                  {isHandHere ? (
                    <p className="tp-watch-hand-hint">{t("session.watch.handRaisedBadge")}</p>
                  ) : null}
                  <div className="tp-watch-q__prompt">
                    <ExamMarkdown>{question.prompt || t("common.untitledQuestion")}</ExamMarkdown>
                  </div>
                  {question.promptImagePath ? (
                    <FormAssetImage
                      path={question.promptImagePath}
                      alt={t("home.exam.promptImageAlt")}
                      className="mt-3 overflow-hidden rounded-[10px] border border-[var(--tp-border)] bg-white"
                    />
                  ) : null}

                  <div className="tp-watch-q__response">
                    <TeacherResponseWatch
                      question={question}
                      rawAnswer={displayAnswers[question.id]}
                      feedbackStore={snapshot.liveTeacherFeedback}
                      liveFeedbackEnabled={snapshot.form.liveTeacherFeedbackEnabled}
                      feedbackFocusQuestionId={activeFeedbackFocusQuestionId}
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
                      scoreSlot={
                        <div className="tp-watch-q__score-row">
                          {isAutoMc && !showMcOverride ? (
                            <div className="tp-watch-score tp-watch-score--auto">
                              <span className="tp-watch-score__label">
                                {t("session.watch.score")}
                              </span>
                              <span className="tp-watch-score__auto-val">
                                {serverGrade ?? 0} / {question.points}
                              </span>
                              <span className="tp-watch-score__auto-hint">
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
                            <WatchScoreStepper
                              score={scoreValue}
                              max={question.points}
                              disabled={scoreDisabled}
                              saveState={saveState}
                              onChange={handleGradeChange}
                            />
                          )}
                          {isAutoMc && showMcOverride && !st.graded ? (
                            <p className="mt-1 text-xs text-[var(--tp-text-secondary)]">
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
                        </div>
                      }
                    />
                  </div>

                  {snapshot.form.liveTeacherFeedbackEnabled ? (
                    <TeacherFeedbackComposer
                      items={feedback.itemsByQuestionId.get(question.id) ?? []}
                      onSend={(body) =>
                        feedback.sendFeedback({
                          questionId: question.id,
                          body,
                          responseVersionTag: snapshot.updatedAt,
                        })
                      }
                      onEdit={feedback.editFeedback}
                      onDelete={feedback.deleteFeedback}
                      onRetry={feedback.retryFeedback}
                    />
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
