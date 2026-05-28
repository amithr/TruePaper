"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Confetti } from "@/components/Confetti";
import { JoinCodeInput } from "@/components/JoinCodeInput";
import { LoadingBar } from "@/components/LoadingBar";
import { ScoreRing } from "@/components/ScoreMeter";
import { SessionJoinShare } from "@/components/SessionJoinShare";
import { StudentExamTextarea } from "@/components/StudentExamTextarea";
import { StudentTeacherFeedbackCard } from "@/components/StudentTeacherFeedbackCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  createFreshAnonymousSessionId,
  getOrCreateAnonymousSessionId,
  joinUrlRequestsFreshDevice,
  persistAnonymousSessionId,
} from "@/lib/anonymous-session";
import { formatPointsScore, scoreTier, scoreTierMessage } from "@/lib/exam-grades";
import { deferEffect } from "@/lib/defer-effect";
import { mergePendingBuilderForm, peekPendingBuilderForm } from "@/lib/pending-builder-form";
import { postExamTabLeave } from "@/lib/exam-tab-leave";
import { useLatestRef } from "@/lib/use-latest-ref";
import type { Form, Question, QuestionType, StudentAnswers } from "@/lib/forms";
import { isValidLiveSessionDisplayName, normalizeLiveSessionDisplayName } from "@/lib/live-session-display-name";
import { parseLiveSessionStudentGet } from "@/lib/live-session-student-get";
import { isValidJoinCodeFormat, normalizeJoinCode } from "@/lib/join-code";
import { isValidResumeCodeFormat, normalizeResumeCode } from "@/lib/resume-code";
import { isNoTimeLimitSession } from "@/lib/session-window";
import { LIVE_BOARD_BROADCAST_EVENT, liveBoardChannelName } from "@/lib/broadcast-live-board";
import type { StudentExamRemotePatch } from "@/lib/student-exam-remote-patch";
import { mergeStudentAnswersForSave } from "@/lib/collect-student-exam-answers";
import { shouldApplyServerAnswersOnLoad } from "@/lib/student-exam-answer-hydration";
import { fetchStudentAlreadySubmitted, STUDENT_ALREADY_SUBMITTED_MESSAGE } from "@/lib/fetch-student-submission-status";
import { fetchStudentExamStatus } from "@/lib/fetch-student-exam-status";
import { fetchStudentLiveTeacherFeedback } from "@/lib/fetch-student-live-feedback";
import { hasLiveTeacherFeedbackContent } from "@/lib/live-teacher-feedback";
import { requestJson } from "@/lib/request-json";
import { stableStringifyStudentAnswers } from "@/lib/student-answers-json";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { usePollingRefresh } from "@/lib/use-polling-refresh";
import { notifyTeacherWatchAnswerDraft } from "@/lib/notify-teacher-watch-answer-draft";
import { useStudentExamRealtime } from "@/lib/use-student-exam-realtime";
import { useThrottledCallback } from "@/lib/use-throttled-callback";
import { buttonLabel, focusRing, ui } from "@/lib/ui";

type SessionUser = {
  id: string;
  email?: string | null;
};

type SessionProfile = {
  id: string;
  role: "teacher" | "student";
  display_name: string | null;
};

type SessionData = {
  user: SessionUser;
  profile: SessionProfile | null;
};

type JoinApiResponse = {
  liveSessionId: string;
  formId: string;
  opensAt: string;
  closesAt: string;
  form: Form;
};

type ResumeApiResponse = {
  liveSessionId: string;
  formId: string;
  deviceId: string;
  displayName: string;
  joinCode: string;
  resumeCode: string;
  opensAt: string;
  closesAt: string;
  form: Form;
};

type TeacherLiveBanner = {
  joinCode: string;
  liveSessionId: string;
  opensAt: string;
  closesAt: string;
  formTitle: string;
};

type JoinedLiveSession = {
  liveSessionId: string;
  form: Form;
  opensAt: string;
  closesAt: string;
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

/** Best-effort: block common copy/cut paths during a live exam (not foolproof). */
function examProtectionHandlers(enabled: boolean) {
  if (!enabled) {
    return {};
  }
  return {
    onCopy: (e: { preventDefault: () => void }) => e.preventDefault(),
    onCut: (e: { preventDefault: () => void }) => e.preventDefault(),
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    onDragStart: (e: { preventDefault: () => void }) => e.preventDefault(),
    onKeyDown: (e: { ctrlKey: boolean; metaKey: boolean; key: string; preventDefault: () => void }) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C" || e.key === "x" || e.key === "X")) {
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
      }
    },
  };
}

/** Debounce after the last keystroke; max-wait forces a save during continuous typing (teacher live view). */
const E2E_AUTOSAVE =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_E2E_AUTOSAVE === "1";
const AUTOSAVE_DEBOUNCE_MS = E2E_AUTOSAVE ? 200 : 600;
const AUTOSAVE_MAX_WAIT_MS = E2E_AUTOSAVE ? 800 : 2000;

async function notifyLiveBoardRefresh(joinCode: string): Promise<void> {
  const code = joinCode.trim().toUpperCase();
  if (!code) {
    return;
  }
  try {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase.channel(liveBoardChannelName(code));
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        void supabase.removeChannel(channel);
        reject(new Error("timeout"));
      }, 5000);
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          window.clearTimeout(timeout);
          await channel.send({
            type: "broadcast",
            event: LIVE_BOARD_BROADCAST_EVENT,
            payload: { at: new Date().toISOString() },
          });
          void supabase.removeChannel(channel);
          resolve();
        }
      });
    });
  } catch {
    /* optional */
  }
}

function serializeBuilderFormDetails(form: Form): string {
  return JSON.stringify({
    title: form.title,
    description: form.description,
    liveTeacherFeedbackEnabled: form.liveTeacherFeedbackEnabled,
  });
}

function serializeBuilderQuestion(question: Question): string {
  return JSON.stringify({
    prompt: question.prompt,
    type: question.type,
    options: question.options,
    correctAnswer: question.type === "multipleChoice" ? question.correctAnswer : null,
    points: question.points,
  });
}

/** Why a logged-in teacher should remain on `/` instead of the dashboard. */
type TeacherHomeIntent = "builder" | "join" | "none";

function readTeacherHomeIntent(): TeacherHomeIntent {
  if (typeof window === "undefined") {
    return "none";
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("form")?.trim()) {
    return "builder";
  }
  if (params.has("code") || params.has("join") || params.has("resume")) {
    return "join";
  }
  const hash = window.location.hash;
  if (hash === "#join-session" || hash.startsWith("#join-session")) {
    return "join";
  }
  return "none";
}

function readFormIdFromUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return new URLSearchParams(window.location.search).get("form")?.trim() ?? "";
}

export default function Home() {
  const router = useRouter();
  /** False until client has read `window.location` (SSR/hydration safe). */
  const [urlSynced, setUrlSynced] = useState(false);
  const [homePageIntent, setHomePageIntent] = useState<TeacherHomeIntent>("none");
  const [session, setSession] = useState<SessionData | null | undefined>(undefined);
  const [mode, setMode] = useState<"teacher" | "student">("student");
  const [authForms, setAuthForms] = useState<Form[]>([]);
  const [activeFormId, setActiveFormId] = useState("");
  const [pendingAutoResumeCode, setPendingAutoResumeCode] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [rejoinCodeInput, setRejoinCodeInput] = useState("");
  const [joinDisplayNameInput, setJoinDisplayNameInput] = useState("");
  const [activeExamDisplayName, setActiveExamDisplayName] = useState("");
  const [joinedSession, setJoinedSession] = useState<JoinedLiveSession | null>(null);
  const [teacherLiveBanner, setTeacherLiveBanner] = useState<TeacherLiveBanner | null>(null);
  const [anonymousSessionId, setAnonymousSessionId] = useState("");
  /** Local exam answers (controlled inputs). Hydrated from server once per session/device. */
  const [examAnswers, setExamAnswers] = useState<StudentAnswers>({});
  /** Teacher builder student-preview answers (never persisted). */
  const [previewAnswers, setPreviewAnswers] = useState<StudentAnswers>({});
  const [examSuspended, setExamSuspended] = useState(false);
  const [examFinished, setExamFinished] = useState(false);
  const [examGraded, setExamGraded] = useState(false);
  const [pointsEarned, setPointsEarned] = useState<number | null>(null);
  const [pointsPossible, setPointsPossible] = useState<number | null>(null);
  const [showStudentConfetti, setShowStudentConfetti] = useState(false);
  const studentConfettiFiredRef = useRef(false);
  const [liveTeacherFeedback, setLiveTeacherFeedback] = useState<Record<string, string>>({});
  const [liveTeacherFeedbackEnabledLive, setLiveTeacherFeedbackEnabledLive] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [builderSaveStatus, setBuilderSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [builderSaveError, setBuilderSaveError] = useState("");
  const typingHeartbeatTimerRef = useRef<number | undefined>(undefined);
  const lastPointerInteractionPingAtRef = useRef(0);
  const loadedExamNamePrefillRef = useRef(false);
  const examFormRef = useRef<HTMLFormElement>(null);
  const latestStudentAnswersRef = useRef<StudentAnswers>({});
  const lastPersistedAnswersJsonRef = useRef("");
  const suspendAutosaveRef = useRef(false);
  const autosaveTimerRef = useRef<number | undefined>(undefined);
  const lastAutosaveSentAtRef = useRef(0);
  const pendingDirtySinceRef = useRef<number | null>(null);
  const autosaveStatusElRef = useRef<HTMLParagraphElement>(null);
  const autosaveBannerClearRef = useRef<number | undefined>(undefined);
  const setAutosaveStatus = useCallback((message: string) => {
    const el = autosaveStatusElRef.current;
    if (!el) {
      return;
    }
    el.textContent = message || "\u00a0";
  }, []);
  const clearJoinFormFields = useCallback(() => {
    setJoinCodeInput("");
    setJoinDisplayNameInput("");
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("truepaper_last_exam_display_name");
      }
    } catch {
      /* ignore */
    }
  }, []);
  const lastPersistedBuilderFormDetailsRef = useRef("");
  const lastPersistedBuilderQuestionJsonByIdRef = useRef<Record<string, string>>({});
  const builderSaveInFlightRef = useRef(false);
  const builderSavedClearRef = useRef<number | undefined>(undefined);
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  /** Join / rejoin in flight — separate from teacher builder and exam save mutations. */
  const [isJoiningSession, setIsJoiningSession] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [urlAuthNotice, setUrlAuthNotice] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const tabLeaveReportedRef = useRef(false);
  const studentResponseLoadKeyRef = useRef<string | null>(null);
  const [studentAnswersHydrated, setStudentAnswersHydrated] = useState(false);

  const isTeacher = session?.profile?.role === "teacher";

  useEffect(() => {
    const intent = readTeacherHomeIntent();
    const formId = readFormIdFromUrl();
    setHomePageIntent(intent);
    if (formId) {
      setActiveFormId(formId);
      const pending = peekPendingBuilderForm(formId);
      if (pending) {
        setAuthForms((prev) =>
          prev.some((form) => form.id === formId) ? prev : [...prev, pending],
        );
      }
    }
    if (intent === "builder") {
      setMode("teacher");
    } else if (intent === "join") {
      setMode("student");
    }
    setUrlSynced(true);
  }, []);

  const activeForm = useMemo(
    () => authForms.find((form) => form.id === activeFormId),
    [authForms, activeFormId],
  );

  const latestActiveFormRef = useLatestRef(activeForm);

  const closesAtForStudent = joinedSession?.closesAt ?? null;
  const joinedSessionNoTimeLimit = joinedSession
    ? isNoTimeLimitSession(joinedSession.opensAt, joinedSession.closesAt)
    : false;
  const sessionOpen =
    closesAtForStudent && joinedSession
      ? nowTick + 500 >= new Date(joinedSession.opensAt).getTime() &&
        (joinedSessionNoTimeLimit ||
          nowTick <= new Date(closesAtForStudent).getTime() + 500)
      : false;

  const studentMsLeft = closesAtForStudent ? new Date(closesAtForStudent).getTime() - nowTick : 0;

  const scheduleTypingHeartbeat = useCallback(() => {
    if (
      !joinedSession ||
      !anonymousSessionId ||
      !activeExamDisplayName ||
      !sessionOpen ||
      examSuspended ||
      examFinished
    ) {
      return;
    }
    const liveSessionId = joinedSession.liveSessionId;
    const deviceId = anonymousSessionId;
    const displayName = activeExamDisplayName;
    window.clearTimeout(typingHeartbeatTimerRef.current);
    typingHeartbeatTimerRef.current = window.setTimeout(() => {
      typingHeartbeatTimerRef.current = undefined;
      void (async () => {
        try {
          await fetch(`/api/public/live-sessions/${liveSessionId}/heartbeat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deviceId,
              displayName,
              isTyping: true,
              interaction: true,
            }),
          });
        } catch {
          /* ignore */
        }
      })();
    }, 450);
  }, [
    joinedSession,
    anonymousSessionId,
    activeExamDisplayName,
    sessionOpen,
    examSuspended,
    examFinished,
  ]);

  const schedulePointerInteractionHeartbeat = useCallback(() => {
    if (
      !joinedSession ||
      !anonymousSessionId ||
      !activeExamDisplayName ||
      !sessionOpen ||
      examSuspended ||
      examFinished
    ) {
      return;
    }
    const now = Date.now();
    if (now - lastPointerInteractionPingAtRef.current < 1200) {
      return;
    }
    lastPointerInteractionPingAtRef.current = now;
    const liveSessionId = joinedSession.liveSessionId;
    const deviceId = anonymousSessionId;
    const displayName = activeExamDisplayName;
    void (async () => {
      try {
        await fetch(`/api/public/live-sessions/${liveSessionId}/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId,
            displayName,
            isTyping: false,
            interaction: true,
          }),
        });
      } catch {
        /* ignore */
      }
    })();
  }, [
    joinedSession,
    anonymousSessionId,
    activeExamDisplayName,
    sessionOpen,
    examSuspended,
    examFinished,
  ]);

  useEffect(() => {
    if (!joinedSession && !teacherLiveBanner) {
      return;
    }
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [joinedSession, teacherLiveBanner]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (typeof window === "undefined" || loadedExamNamePrefillRef.current) {
        return;
      }
      loadedExamNamePrefillRef.current = true;
      try {
        const saved = window.localStorage.getItem("truepaper_last_exam_display_name");
        if (saved) {
          setJoinDisplayNameInput(saved);
        }
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (typeof window === "undefined") {
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const err = params.get("error");
      const rawDesc = params.get("error_description");
      if (!err && !rawDesc) {
        return;
      }
      const desc = rawDesc
        ? decodeURIComponent(rawDesc.replace(/\+/g, " "))
        : "";
      if (err === "access_denied" || params.get("error_code") === "otp_expired") {
        setUrlAuthNotice(
          desc ||
            "That email link is invalid or has expired. Request a new confirmation email from the Supabase dashboard (Authentication → Users) or sign up again.",
        );
      } else {
        setUrlAuthNotice(desc || err || "Something went wrong with email confirmation.");
      }
      window.history.replaceState({}, "", window.location.pathname);
    }, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    deferEffect(() => {
      const params = new URLSearchParams(window.location.search);

      if (joinUrlRequestsFreshDevice(params)) {
        setAnonymousSessionId(createFreshAnonymousSessionId());
      } else {
        setAnonymousSessionId(getOrCreateAnonymousSessionId());
      }

      const raw = params.get("code") ?? params.get("join");
      if (raw) {
        const normalized = normalizeJoinCode(raw);
        if (isValidJoinCodeFormat(normalized)) {
          setJoinCodeInput(normalized);
          setStatusMessage("Session code loaded. Enter your name, then tap Start task.");
        }
      }
      const resumeRaw = params.get("resume");
      if (resumeRaw) {
        const normalizedResume = normalizeResumeCode(resumeRaw);
        if (isValidResumeCodeFormat(normalizedResume)) {
          setRejoinCodeInput(normalizedResume);
          setPendingAutoResumeCode(normalizedResume);
        }
      }
      const u = new URL(window.location.href);
      if (u.searchParams.has("code") || u.searchParams.has("join")) {
        u.searchParams.delete("code");
        u.searchParams.delete("join");
      }
      if (u.searchParams.has("resume")) {
        u.searchParams.delete("resume");
      }
      u.searchParams.delete("new");
      u.searchParams.delete("student");
      window.history.replaceState({}, "", u.pathname + u.search + u.hash);
    });
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/auth/session");
          const data = (await response.json()) as {
            user: SessionUser | null;
            profile: SessionProfile | null;
          };
          if (!data.user) {
            setSession(null);
            return;
          }
          setSession({ user: data.user, profile: data.profile });
        } catch {
          setSession(null);
        }
      })();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!urlSynced || session === undefined) {
        return;
      }
      if (!session) {
        setMode("student");
        return;
      }
      if (session.profile?.role === "teacher") {
        setMode(homePageIntent === "join" || joinedSession ? "student" : "teacher");
      } else {
        setMode("student");
      }
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [session, joinedSession, homePageIntent, urlSynced]);

  useEffect(() => {
    if (!urlSynced || session === undefined) {
      return;
    }

    if (
      session?.profile?.role === "teacher" &&
      homePageIntent === "none" &&
      !joinedSession
    ) {
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      void (async () => {
        setIsLoadingForms(true);
        setErrorMessage("");
        try {
          if (session?.profile?.role === "teacher") {
            const auth = await requestJson<{ forms: Form[] }>("/api/forms");
            if (cancelled) {
              return;
            }
            const formId = readFormIdFromUrl();
            setAuthForms(
              formId ? mergePendingBuilderForm(auth.forms, formId) : auth.forms,
            );
          } else {
            if (!cancelled) {
              setAuthForms([]);
            }
          }
        } catch (error) {
          if (!cancelled) {
            setErrorMessage(error instanceof Error ? error.message : "Failed to load forms.");
          }
        } finally {
          if (!cancelled) {
            setIsLoadingForms(false);
          }
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [session, homePageIntent, joinedSession, urlSynced]);

  useEffect(() => {
    if (!urlSynced || typeof window === "undefined" || session?.profile?.role !== "teacher") {
      return;
    }
    const formId = readFormIdFromUrl();
    if (!formId) {
      return;
    }
    deferEffect(() => {
      setActiveFormId(formId);
      setMode("teacher");
      const pending = peekPendingBuilderForm(formId);
      if (pending) {
        setAuthForms((prev) =>
          prev.some((form) => form.id === formId) ? prev : [...prev, pending],
        );
      }
      const { pathname, hash } = window.location;
      window.history.replaceState(
        {},
        "",
        `${pathname}?form=${encodeURIComponent(formId)}${hash}`,
      );
    });
  }, [session, urlSynced]);

  /**
   * Teachers opening `/` without builder/join intent go straight to the dashboard.
   */
  useEffect(() => {
    if (!urlSynced || session === undefined || session === null) {
      return;
    }
    if (session.profile?.role !== "teacher") {
      return;
    }
    if (homePageIntent !== "none" || joinedSession) {
      return;
    }
    router.replace("/dashboard");
  }, [session, router, homePageIntent, joinedSession, urlSynced]);

  /** Non-teachers must not open the form builder via `?form=`. */
  useEffect(() => {
    if (!urlSynced || session === undefined || session === null) {
      return;
    }
    if (session.profile?.role === "teacher") {
      return;
    }
    if (homePageIntent !== "builder") {
      return;
    }
    setActiveFormId("");
    setHomePageIntent("none");
    router.replace("/");
  }, [session, homePageIntent, router, urlSynced]);

  useEffect(() => {
    setPreviewAnswers({});
  }, [activeFormId]);

  const joinedLiveSessionId = joinedSession?.liveSessionId ?? "";
  const isLiveTeacherFeedbackEnabled =
    liveTeacherFeedbackEnabledLive || joinedSession?.form.liveTeacherFeedbackEnabled === true;

  useEffect(() => {
    if (!joinedLiveSessionId || !anonymousSessionId) {
      return;
    }

    const loadStudentResponse = async () => {
      try {
        const params = new URLSearchParams({ deviceId: anonymousSessionId });
        const response = await fetch(
          `/api/public/live-sessions/${joinedLiveSessionId}/responses?${params.toString()}`,
        );
        const raw = (await response.json()) as unknown;
        if (!response.ok) {
          const err = raw as { error?: string };
          throw new Error(err.error ?? "Request failed.");
        }
        const parsed = parseLiveSessionStudentGet(raw);
        const loadKey = `${joinedLiveSessionId}:${anonymousSessionId}`;
        const isFirstLoadForKey = studentResponseLoadKeyRef.current !== loadKey;
        studentResponseLoadKeyRef.current = loadKey;

        if (isFirstLoadForKey) {
          if (parsed.finished) {
            setStudentAnswersHydrated(true);
            setStatusMessage(STUDENT_ALREADY_SUBMITTED_MESSAGE);
            clearJoinFormFields();
            setJoinedSession(null);
            setActiveExamDisplayName("");
            setExamAnswers({});
            setExamFinished(false);
            setExamGraded(false);
            setPointsEarned(null);
            setPointsPossible(null);
            setExamSuspended(false);
            return;
          }
          const hasLocalEdits = pendingDirtySinceRef.current !== null;
          if (shouldApplyServerAnswersOnLoad(isFirstLoadForKey, hasLocalEdits)) {
            latestStudentAnswersRef.current = parsed.answers;
            lastPersistedAnswersJsonRef.current = stableStringifyStudentAnswers(parsed.answers);
            setExamAnswers(parsed.answers);
            pendingDirtySinceRef.current = null;
          }
        }
        setStudentAnswersHydrated(true);
        setExamSuspended(parsed.suspended);
        setExamFinished(parsed.finished);
        setExamGraded(parsed.graded);
        setPointsEarned(parsed.pointsEarned);
        setPointsPossible(parsed.pointsPossible);
        setLiveTeacherFeedback((prev) => ({ ...prev, ...parsed.liveTeacherFeedback }));
        if (parsed.liveTeacherFeedbackEnabled) {
          setLiveTeacherFeedbackEnabledLive(true);
        }
        if (parsed.graded && parsed.pointsEarned != null && parsed.pointsPossible != null) {
          setStatusMessage(
            `Graded — you earned ${formatPointsScore(parsed.pointsEarned, parsed.pointsPossible)}.`,
          );
        } else if (parsed.finished) {
          setStatusMessage("You have submitted this exam.");
        } else if (parsed.suspended) {
          setStatusMessage("This exam is paused until your teacher allows you to continue.");
        }
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "Failed to load student answers.");
      }
    };

    const timeoutId = setTimeout(() => {
      void loadStudentResponse();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [joinedLiveSessionId, anonymousSessionId]);

  useEffect(() => {
    if (!examGraded || studentConfettiFiredRef.current) {
      return;
    }
    if (pointsEarned == null || pointsPossible == null) {
      return;
    }
    const tier = scoreTier(pointsEarned, pointsPossible);
    if (tier !== "perfect" && tier !== "great") {
      return;
    }
    studentConfettiFiredRef.current = true;
    deferEffect(() => setShowStudentConfetti(true));
    const id = window.setTimeout(() => {
      deferEffect(() => setShowStudentConfetti(false));
    }, 2200);
    return () => window.clearTimeout(id);
  }, [examGraded, pointsEarned, pointsPossible]);

  useEffect(() => {
    if (!joinedLiveSessionId || !anonymousSessionId || !examFinished || examGraded) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/public/live-sessions/${joinedLiveSessionId}/responses?deviceId=${encodeURIComponent(anonymousSessionId)}`,
          );
          if (!res.ok) {
            return;
          }
          const data = (await res.json()) as unknown;
          const parsed = parseLiveSessionStudentGet(data);
          if (parsed.graded) {
            setExamGraded(true);
            setPointsEarned(parsed.pointsEarned);
            setPointsPossible(parsed.pointsPossible);
            if (parsed.pointsEarned != null && parsed.pointsPossible != null) {
              setStatusMessage(
                `Graded — you earned ${formatPointsScore(parsed.pointsEarned, parsed.pointsPossible)}.`,
              );
            }
          }
        } catch {
          /* ignore background poll errors */
        }
      })();
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [joinedLiveSessionId, anonymousSessionId, examFinished, examGraded]);

  const refreshLiveTeacherFeedback = useCallback(async () => {
    if (!joinedLiveSessionId || !anonymousSessionId) {
      return;
    }
    const snapshot = await fetchStudentLiveTeacherFeedback(
      joinedLiveSessionId,
      anonymousSessionId,
    );
    if (!snapshot) {
      return;
    }
    if (snapshot.enabled) {
      setLiveTeacherFeedbackEnabledLive(true);
    }
    setLiveTeacherFeedback((prev) => ({ ...prev, ...snapshot.feedback }));
  }, [joinedLiveSessionId, anonymousSessionId]);

  const applyStudentExamRemotePatch = useCallback((patch: StudentExamRemotePatch) => {
    if (patch.liveTeacherFeedback !== undefined) {
      setLiveTeacherFeedback((prev) => ({ ...prev, ...patch.liveTeacherFeedback }));
      if (hasLiveTeacherFeedbackContent(patch.liveTeacherFeedback)) {
        setLiveTeacherFeedbackEnabledLive(true);
      }
    }
    if (patch.suspended === true) {
      setExamSuspended(true);
      setStatusMessage(
        "This exam is paused until your teacher allows you to continue.",
      );
    } else if (patch.suspended === false) {
      setExamSuspended((prevSuspended) => {
        if (prevSuspended) {
          setStatusMessage("Your teacher allowed you to continue. You can answer again.");
        }
        return false;
      });
    }
    if (patch.finished === true) {
      setExamFinished(true);
      setStatusMessage("You have submitted this exam.");
    }
  }, []);

  useStudentExamRealtime({
    liveSessionId: joinedLiveSessionId,
    deviceId: anonymousSessionId,
    enabled: Boolean(joinedLiveSessionId && anonymousSessionId && studentAnswersHydrated),
    onPatch: applyStudentExamRemotePatch,
  });

  useEffect(() => {
    if (!studentAnswersHydrated || !joinedLiveSessionId || !anonymousSessionId) {
      return;
    }
    const syncOnVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshLiveTeacherFeedback();
      }
    };
    document.addEventListener("visibilitychange", syncOnVisible);
    window.addEventListener("focus", syncOnVisible);
    return () => {
      document.removeEventListener("visibilitychange", syncOnVisible);
      window.removeEventListener("focus", syncOnVisible);
    };
  }, [studentAnswersHydrated, joinedLiveSessionId, anonymousSessionId, refreshLiveTeacherFeedback]);

  useEffect(() => {
    if (!studentAnswersHydrated || !joinedLiveSessionId || !anonymousSessionId) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void refreshLiveTeacherFeedback();
    }, 400);
    return () => window.clearTimeout(timeoutId);
  }, [studentAnswersHydrated, joinedLiveSessionId, anonymousSessionId, refreshLiveTeacherFeedback]);

  usePollingRefresh({
    enabled:
      Boolean(joinedLiveSessionId && anonymousSessionId && studentAnswersHydrated) &&
      isLiveTeacherFeedbackEnabled,
    intervalMs: 5000,
    onRefresh: () => void refreshLiveTeacherFeedback(),
  });

  const persistStudentAnswers = useCallback(async () => {
    if (
      !joinedSession ||
      !anonymousSessionId ||
      !activeExamDisplayName ||
      !sessionOpen ||
      examSuspended ||
      examFinished ||
      suspendAutosaveRef.current
    ) {
      return;
    }
    const textQuestions = joinedSession.form.questions.filter((q) => q.type === "text");
    const currentAnswers = mergeStudentAnswersForSave(
      latestStudentAnswersRef.current,
      examFormRef.current,
      textQuestions,
    );
    latestStudentAnswersRef.current = currentAnswers;
    const currentJson = stableStringifyStudentAnswers(currentAnswers);
    if (currentJson === lastPersistedAnswersJsonRef.current) {
      pendingDirtySinceRef.current = null;
      setAutosaveStatus("");
      return;
    }

    try {
      setAutosaveStatus("Saving…");
      await requestJson<{ ok: true }>(
        `/api/public/live-sessions/${joinedSession.liveSessionId}/responses`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: anonymousSessionId,
            displayName: activeExamDisplayName,
            answers: currentAnswers,
          }),
        },
      );
      lastPersistedAnswersJsonRef.current = currentJson;
      pendingDirtySinceRef.current = null;
      if (autosaveBannerClearRef.current !== undefined) {
        window.clearTimeout(autosaveBannerClearRef.current);
      }
      setAutosaveStatus("All changes saved");
      autosaveBannerClearRef.current = window.setTimeout(() => {
        autosaveBannerClearRef.current = undefined;
        setAutosaveStatus("");
      }, 2600);
    } catch {
      setAutosaveStatus("Autosave failed. Use Save answers.");
    }
  }, [
    joinedSession,
    anonymousSessionId,
    activeExamDisplayName,
    sessionOpen,
    examSuspended,
    examFinished,
    setAutosaveStatus,
  ]);

  const scheduleStudentAutosave = useCallback(() => {
    if (
      !joinedSession ||
      !anonymousSessionId ||
      !activeExamDisplayName ||
      !sessionOpen ||
      examSuspended ||
      examFinished ||
      suspendAutosaveRef.current
    ) {
      return;
    }

    const textQuestions = joinedSession.form.questions.filter((q) => q.type === "text");
    const mergedForDirtyCheck = mergeStudentAnswersForSave(
      latestStudentAnswersRef.current,
      examFormRef.current,
      textQuestions,
    );
    latestStudentAnswersRef.current = mergedForDirtyCheck;
    const nextJson = stableStringifyStudentAnswers(mergedForDirtyCheck);
    if (nextJson === lastPersistedAnswersJsonRef.current) {
      pendingDirtySinceRef.current = null;
      return;
    }

    if (pendingDirtySinceRef.current === null) {
      pendingDirtySinceRef.current = Date.now();
    }

    setAutosaveStatus("Saving…");

    const now = Date.now();
    const dirtyFor = now - (pendingDirtySinceRef.current ?? now);
    const sinceLastSent = now - lastAutosaveSentAtRef.current;

    if (autosaveTimerRef.current !== undefined) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    const run = () => {
      lastAutosaveSentAtRef.current = Date.now();
      void persistStudentAnswers();
    };

    if (dirtyFor >= AUTOSAVE_MAX_WAIT_MS || sinceLastSent >= AUTOSAVE_MAX_WAIT_MS) {
      run();
    } else {
      autosaveTimerRef.current = window.setTimeout(run, AUTOSAVE_DEBOUNCE_MS);
    }
  }, [
    joinedSession,
    anonymousSessionId,
    activeExamDisplayName,
    sessionOpen,
    examSuspended,
    examFinished,
    persistStudentAnswers,
    setAutosaveStatus,
  ]);

  const broadcastAnswerDraft = useThrottledCallback(
    (liveSessionId: string, deviceId: string, answers: StudentAnswers) => {
      void notifyTeacherWatchAnswerDraft(liveSessionId, deviceId, answers);
    },
    180,
  );

  const patchTextAnswer = useCallback(
    (questionId: string, next: string) => {
      setExamAnswers((prev) => {
        const updated = { ...prev, [questionId]: next };
        latestStudentAnswersRef.current = updated;
        if (joinedSession && anonymousSessionId) {
          broadcastAnswerDraft(joinedSession.liveSessionId, anonymousSessionId, updated);
        }
        return updated;
      });
      scheduleTypingHeartbeat();
      scheduleStudentAutosave();
    },
    [
      scheduleTypingHeartbeat,
      scheduleStudentAutosave,
      joinedSession,
      anonymousSessionId,
      broadcastAnswerDraft,
    ],
  );

  const patchChoiceAnswer = useCallback(
    (questionId: string, next: string) => {
      setExamAnswers((prev) => {
        const updated = { ...prev, [questionId]: next };
        latestStudentAnswersRef.current = updated;
        if (joinedSession && anonymousSessionId) {
          void notifyTeacherWatchAnswerDraft(
            joinedSession.liveSessionId,
            anonymousSessionId,
            updated,
          );
        }
        return updated;
      });
      scheduleTypingHeartbeat();
      scheduleStudentAutosave();
    },
    [scheduleTypingHeartbeat, scheduleStudentAutosave, joinedSession, anonymousSessionId],
  );

  useEffect(() => {
    if (!sessionOpen || examSuspended || examFinished) {
      if (autosaveTimerRef.current !== undefined) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = undefined;
      }
    }
  }, [sessionOpen, examSuspended, examFinished]);

  useEffect(() => {
    if (!studentAnswersHydrated || !joinedSession || !sessionOpen || examSuspended || examFinished) {
      return;
    }
    scheduleStudentAutosave();
  }, [
    examAnswers,
    studentAnswersHydrated,
    joinedSession,
    sessionOpen,
    examSuspended,
    examFinished,
    scheduleStudentAutosave,
  ]);

  useEffect(() => {
    if (!joinedSession || !anonymousSessionId || !activeExamDisplayName) {
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`/api/public/live-sessions/${joinedSession.liveSessionId}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: anonymousSessionId,
            displayName: activeExamDisplayName,
          }),
        });
        if (res.status === 403) {
          const body = (await res.json()) as { error?: string };
          clearJoinFormFields();
          setJoinedSession(null);
          setActiveExamDisplayName("");
          setExamAnswers({});
          setStudentAnswersHydrated(false);
          setExamFinished(false);
          setExamGraded(false);
          setPointsEarned(null);
          setPointsPossible(null);
          setExamSuspended(false);
          setStatusMessage(body.error ?? STUDENT_ALREADY_SUBMITTED_MESSAGE);
          return;
        }
        if (res.ok && joinCodeInput) {
          void notifyLiveBoardRefresh(joinCodeInput);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [joinedSession, anonymousSessionId, activeExamDisplayName, joinCodeInput]);

  useEffect(() => {
    return () => {
      if (typingHeartbeatTimerRef.current !== undefined) {
        window.clearTimeout(typingHeartbeatTimerRef.current);
      }
      if (autosaveTimerRef.current !== undefined) {
        window.clearTimeout(autosaveTimerRef.current);
      }
      if (autosaveBannerClearRef.current !== undefined) {
        window.clearTimeout(autosaveBannerClearRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!examSuspended) {
      tabLeaveReportedRef.current = false;
    }
  }, [examSuspended]);

  useEffect(() => {
    if (!joinedSession || !anonymousSessionId || !examSuspended) {
      return;
    }
    const liveSessionId = joinedSession.liveSessionId;
    const checkIfResumed = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void fetchStudentExamStatus(liveSessionId, anonymousSessionId).then((status) => {
        if (status && !status.suspended) {
          applyStudentExamRemotePatch({ suspended: false });
        }
      });
    };
    checkIfResumed();
    document.addEventListener("visibilitychange", checkIfResumed);
    window.addEventListener("focus", checkIfResumed);
    return () => {
      document.removeEventListener("visibilitychange", checkIfResumed);
      window.removeEventListener("focus", checkIfResumed);
    };
  }, [joinedSession, anonymousSessionId, examSuspended, applyStudentExamRemotePatch]);

  useEffect(() => {
    if (
      !joinedSession ||
      !sessionOpen ||
      examSuspended ||
      examFinished ||
      !anonymousSessionId ||
      !activeExamDisplayName
    ) {
      return;
    }

    let hiddenTimer: number | undefined;
    let blurTimer: number | undefined;
    const liveSessionId = joinedSession.liveSessionId;
    const deviceId = anonymousSessionId;
    const displayName = activeExamDisplayName;
    const tabLeaveUrl = `/api/public/live-sessions/${liveSessionId}/tab-leave`;

    const applyPausedState = () => {
      setExamSuspended(true);
      setStatusMessage(
        "The exam was paused because this page was hidden. Wait for your teacher to let you continue.",
      );
    };

    const reportTabLeave = () => {
      if (tabLeaveReportedRef.current) {
        return;
      }
      tabLeaveReportedRef.current = true;
      applyPausedState();
      postExamTabLeave(tabLeaveUrl, { deviceId, displayName });
    };

    const isDocumentHidden = () =>
      document.visibilityState === "hidden" || document.hidden === true;

    const onVisibility = () => {
      if (isDocumentHidden()) {
        hiddenTimer = window.setTimeout(() => {
          if (isDocumentHidden()) {
            reportTabLeave();
          }
          hiddenTimer = undefined;
        }, 200);
      } else {
        if (hiddenTimer !== undefined) {
          window.clearTimeout(hiddenTimer);
          hiddenTimer = undefined;
        }
      }
    };

    /** Fires reliably when leaving the page on iOS/Android (more so than visibilitychange alone). */
    const onPageHide = () => {
      reportTabLeave();
    };

    /** App switch on mobile often blurs the window before visibility becomes hidden. */
    const onWindowBlur = () => {
      if (blurTimer !== undefined) {
        window.clearTimeout(blurTimer);
      }
      blurTimer = window.setTimeout(() => {
        blurTimer = undefined;
        if (isDocumentHidden()) {
          reportTabLeave();
        }
      }, 400);
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("blur", onWindowBlur);

    if (isDocumentHidden()) {
      reportTabLeave();
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("blur", onWindowBlur);
      if (hiddenTimer !== undefined) {
        window.clearTimeout(hiddenTimer);
      }
      if (blurTimer !== undefined) {
        window.clearTimeout(blurTimer);
      }
    };
  }, [joinedSession, sessionOpen, examSuspended, examFinished, anonymousSessionId, activeExamDisplayName]);

  useEffect(() => {
    if (mode !== "teacher" || !isTeacher) {
      return;
    }
    const timeoutId = setTimeout(() => {
      const pool = authForms;
      if (pool.length === 0) {
        setActiveFormId("");
        return;
      }
      if (activeFormId && !pool.some((form) => form.id === activeFormId)) {
        const urlFormId = readFormIdFromUrl();
        if (urlFormId !== activeFormId) {
          setActiveFormId("");
        }
      }
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [authForms, activeFormId, mode, isTeacher]);

  const logout = async () => {
    setIsMutating(true);
    setStatusMessage("");
    try {
      await requestJson<{ ok: true }>("/api/auth/logout", { method: "POST" });
      setSession(null);
      setAuthForms([]);
      setMode("student");
      setJoinedSession(null);
      setExamSuspended(false);
      setExamFinished(false);
      setExamGraded(false);
      setPointsEarned(null);
      setPointsPossible(null);
      setActiveExamDisplayName("");
      setTeacherLiveBanner(null);
      setStatusMessage("Signed out.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Sign out failed.");
    } finally {
      setIsMutating(false);
    }
  };

  const updateActiveForm = (updater: (form: Form) => Form) => {
    setAuthForms((current) =>
      current.map((form) => (form.id === activeFormId ? updater(form) : form)),
    );
  };

  /** Refresh the dirty-tracker baseline when the active form changes (e.g. opening a different form). */
  useEffect(() => {
    if (!activeForm) {
      lastPersistedBuilderFormDetailsRef.current = "";
      lastPersistedBuilderQuestionJsonByIdRef.current = {};
      setBuilderSaveStatus("idle");
      setBuilderSaveError("");
      return;
    }
    lastPersistedBuilderFormDetailsRef.current = serializeBuilderFormDetails(activeForm);
    const persistedQuestions: Record<string, string> = {};
    for (const question of activeForm.questions) {
      persistedQuestions[question.id] = serializeBuilderQuestion(question);
    }
    lastPersistedBuilderQuestionJsonByIdRef.current = persistedQuestions;
    setBuilderSaveStatus("idle");
    setBuilderSaveError("");
  }, [activeFormId]); // intentionally not [activeForm] — recomputes only when opening a different form

  /** Compute whether the active form has unsaved edits. */
  const builderHasUnsavedChanges = useMemo(() => {
    if (!activeForm) {
      return false;
    }
    if (
      serializeBuilderFormDetails(activeForm) !==
      lastPersistedBuilderFormDetailsRef.current
    ) {
      return true;
    }
    for (const question of activeForm.questions) {
      const json = serializeBuilderQuestion(question);
      if (json !== lastPersistedBuilderQuestionJsonByIdRef.current[question.id]) {
        return true;
      }
    }
    return false;
  }, [activeForm, builderSaveStatus]);

  /** Reset "Saved" pill back to idle as soon as the teacher makes a new edit. */
  useEffect(() => {
    if (builderSaveStatus === "saved" && builderHasUnsavedChanges) {
      setBuilderSaveStatus("idle");
    }
  }, [builderHasUnsavedChanges, builderSaveStatus]);

  const saveBuilderForm = useCallback(async (): Promise<boolean> => {
    const form = latestActiveFormRef.current;
    if (!form || form.id !== activeFormId || builderSaveInFlightRef.current) {
      return false;
    }

    const detailsJson = serializeBuilderFormDetails(form);
    const formDetailsDirty = detailsJson !== lastPersistedBuilderFormDetailsRef.current;
    const dirtyQuestions: Question[] = [];
    for (const question of form.questions) {
      const questionJson = serializeBuilderQuestion(question);
      if (questionJson !== lastPersistedBuilderQuestionJsonByIdRef.current[question.id]) {
        dirtyQuestions.push(question);
      }
    }

    if (!formDetailsDirty && dirtyQuestions.length === 0) {
      setBuilderSaveStatus("saved");
      return true;
    }

    builderSaveInFlightRef.current = true;
    setBuilderSaveStatus("saving");
    setBuilderSaveError("");
    try {
      if (formDetailsDirty) {
        await requestJson<{ ok: true }>(`/api/forms/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            description: form.description,
            liveTeacherFeedbackEnabled: form.liveTeacherFeedbackEnabled,
          }),
        });
        lastPersistedBuilderFormDetailsRef.current = detailsJson;
      }

      for (const question of dirtyQuestions) {
        await requestJson<{ ok: true }>(`/api/questions/${question.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: question.prompt,
            type: question.type,
            options: question.options,
            correctAnswer: question.type === "multipleChoice" ? question.correctAnswer : null,
            points: question.points,
          }),
        });
        lastPersistedBuilderQuestionJsonByIdRef.current[question.id] =
          serializeBuilderQuestion(question);
      }

      setBuilderSaveStatus("saved");
      if (builderSavedClearRef.current !== undefined) {
        window.clearTimeout(builderSavedClearRef.current);
      }
      builderSavedClearRef.current = window.setTimeout(() => {
        builderSavedClearRef.current = undefined;
        setBuilderSaveStatus((prev) => (prev === "saved" ? "idle" : prev));
      }, 2600);
      return true;
    } catch (error) {
      setBuilderSaveStatus("error");
      setBuilderSaveError(
        error instanceof Error ? error.message : "Failed to save. Try again.",
      );
      return false;
    } finally {
      builderSaveInFlightRef.current = false;
    }
  }, [activeFormId, latestActiveFormRef]);

  /** Cleanup the "Saved" timeout if the form unmounts. */
  useEffect(() => {
    return () => {
      if (builderSavedClearRef.current !== undefined) {
        window.clearTimeout(builderSavedClearRef.current);
      }
    };
  }, []);

  /** Warn the teacher if they try to leave/close the tab with unsaved builder changes. */
  useEffect(() => {
    if (!builderHasUnsavedChanges || mode !== "teacher" || !isTeacher) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [builderHasUnsavedChanges, mode, isTeacher]);

  const addQuestion = async (type: QuestionType) => {
    if (!activeForm) {
      return;
    }

    setIsMutating(true);
    setStatusMessage("");
    try {
      // Flush any pending edits to existing questions/details before adding a new one
      // so that the next save isn't asked to PATCH a question that hasn't been created yet.
      if (builderHasUnsavedChanges) {
        const ok = await saveBuilderForm();
        if (!ok) {
          return;
        }
      }
      const data = await requestJson<{ question: Question }>(
        `/api/forms/${activeForm.id}/questions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
        },
      );
      updateActiveForm((form) => ({
        ...form,
        questions: [...form.questions, data.question],
      }));
      lastPersistedBuilderQuestionJsonByIdRef.current[data.question.id] =
        serializeBuilderQuestion(data.question);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to add question.");
    } finally {
      setIsMutating(false);
    }
  };

  const removeQuestion = async (questionId: string) => {
    setIsMutating(true);
    setStatusMessage("");
    try {
      await requestJson<{ ok: true }>(`/api/questions/${questionId}`, {
        method: "DELETE",
      });
      updateActiveForm((form) => ({
        ...form,
        questions: form.questions.filter((question) => question.id !== questionId),
      }));
      delete lastPersistedBuilderQuestionJsonByIdRef.current[questionId];
      const nextAnswers = { ...latestStudentAnswersRef.current };
      delete nextAnswers[questionId];
      latestStudentAnswersRef.current = nextAnswers;
      setExamAnswers(nextAnswers);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to remove question.");
    } finally {
      setIsMutating(false);
    }
  };

  const rejoinWithResumeCode = async (rawCode: string) => {
    const code = normalizeResumeCode(rawCode);
    if (!isValidResumeCodeFormat(code)) {
      setStatusMessage("Enter your 8-character personal rejoin code.");
      return;
    }

    setIsJoiningSession(true);
    setStatusMessage("");
    try {
      const data = await requestJson<ResumeApiResponse>(
        `/api/public/resume?code=${encodeURIComponent(code)}`,
      );
      persistAnonymousSessionId(data.deviceId);
      setAnonymousSessionId(data.deviceId);
      setJoinCodeInput(data.joinCode);
      setRejoinCodeInput(code);
      const displayName = normalizeLiveSessionDisplayName(data.displayName);
      if (isValidLiveSessionDisplayName(displayName)) {
        setActiveExamDisplayName(displayName);
        setJoinDisplayNameInput(displayName);
        try {
          if (typeof window !== "undefined") {
            window.localStorage.setItem("truepaper_last_exam_display_name", displayName);
          }
        } catch {
          /* ignore */
        }
      }
      setJoinedSession({
        liveSessionId: data.liveSessionId,
        form: data.form,
        opensAt: data.opensAt,
        closesAt: data.closesAt,
      });
      setLiveTeacherFeedbackEnabledLive(data.form.liveTeacherFeedbackEnabled);
      latestStudentAnswersRef.current = {};
      lastPersistedAnswersJsonRef.current = stableStringifyStudentAnswers({});
      pendingDirtySinceRef.current = null;
      studentResponseLoadKeyRef.current = null;
      setExamAnswers({});
      setStudentAnswersHydrated(false);
      setExamSuspended(false);
      setExamFinished(false);
      setExamGraded(false);
      setPointsEarned(null);
      setPointsPossible(null);
      setStatusMessage("");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not rejoin that exam.");
    } finally {
      setIsJoiningSession(false);
    }
  };

  const joinWithCode = async (rawCode: string) => {
    const code = normalizeJoinCode(rawCode);
    if (!isValidJoinCodeFormat(code)) {
      setStatusMessage("Enter the 6-character code (letters and numbers, no I/O/U/0/1).");
      return;
    }

    const displayName = normalizeLiveSessionDisplayName(joinDisplayNameInput);
    if (!isValidLiveSessionDisplayName(displayName)) {
      setStatusMessage("Enter your name (1–120 characters) before starting the exam.");
      return;
    }

    setIsJoiningSession(true);
    setStatusMessage("");
    try {
      let deviceIdForJoin = anonymousSessionId;
      if (isTeacher && mode === "student") {
        deviceIdForJoin = createFreshAnonymousSessionId();
        setAnonymousSessionId(deviceIdForJoin);
      }
      const data = await requestJson<JoinApiResponse>(`/api/public/join?code=${encodeURIComponent(code)}`);
      if (
        deviceIdForJoin &&
        (await fetchStudentAlreadySubmitted(data.liveSessionId, deviceIdForJoin))
      ) {
        throw new Error(STUDENT_ALREADY_SUBMITTED_MESSAGE);
      }
      setJoinedSession({
        liveSessionId: data.liveSessionId,
        form: data.form,
        opensAt: data.opensAt,
        closesAt: data.closesAt,
      });
      setLiveTeacherFeedbackEnabledLive(data.form.liveTeacherFeedbackEnabled);
      setJoinCodeInput(code);
      setActiveExamDisplayName(displayName);
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("truepaper_last_exam_display_name", displayName);
        }
      } catch {
        /* ignore */
      }
      latestStudentAnswersRef.current = {};
      lastPersistedAnswersJsonRef.current = stableStringifyStudentAnswers({});
      pendingDirtySinceRef.current = null;
      studentResponseLoadKeyRef.current = null;
      setExamAnswers({});
      setStudentAnswersHydrated(false);
      setExamSuspended(false);
      setExamFinished(false);
      setExamGraded(false);
      setPointsEarned(null);
      setPointsPossible(null);
      setAutosaveStatus("");
      setStatusMessage("You are in the live session.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not join that session.");
    } finally {
      setIsJoiningSession(false);
    }
  };

  const rejoinWithResumeCodeRef = useLatestRef(rejoinWithResumeCode);

  useEffect(() => {
    if (!pendingAutoResumeCode || joinedSession || isJoiningSession) {
      return;
    }
    const code = pendingAutoResumeCode;
    deferEffect(() => {
      void rejoinWithResumeCodeRef.current(code);
      setPendingAutoResumeCode("");
    });
  }, [pendingAutoResumeCode, joinedSession, isJoiningSession, rejoinWithResumeCodeRef]);

  const leaveJoinedSession = () => {
    setIsJoiningSession(false);
    setJoinedSession(null);
    latestStudentAnswersRef.current = {};
    lastPersistedAnswersJsonRef.current = "";
    pendingDirtySinceRef.current = null;
    if (autosaveTimerRef.current !== undefined) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = undefined;
    }
    setAutosaveStatus("");
    studentResponseLoadKeyRef.current = null;
    setExamAnswers({});
    setStudentAnswersHydrated(false);
    setExamSuspended(false);
    setExamFinished(false);
    setExamGraded(false);
    setPointsEarned(null);
    setPointsPossible(null);
    setActiveExamDisplayName("");
    setLiveTeacherFeedback({});
    setLiveTeacherFeedbackEnabledLive(false);
    setRejoinCodeInput("");
    setStatusMessage("Left the session.");
  };

  const saveStudentAnswers = async () => {
    if (!joinedSession || !anonymousSessionId || !activeExamDisplayName) {
      return;
    }

    setIsMutating(true);
    setStatusMessage("");
    const textQuestions = joinedSession.form.questions.filter((q) => q.type === "text");
    const answers = mergeStudentAnswersForSave(
      latestStudentAnswersRef.current,
      examFormRef.current,
      textQuestions,
    );
    latestStudentAnswersRef.current = answers;
    suspendAutosaveRef.current = true;
    try {
      await requestJson<{ ok: true }>(
        `/api/public/live-sessions/${joinedSession.liveSessionId}/responses`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: anonymousSessionId,
            displayName: activeExamDisplayName,
            answers,
          }),
        },
      );
      lastPersistedAnswersJsonRef.current = stableStringifyStudentAnswers(answers);
      pendingDirtySinceRef.current = null;
      setAutosaveStatus("All changes saved");
      setStatusMessage("Answers saved.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save answers.");
    } finally {
      suspendAutosaveRef.current = false;
      setIsMutating(false);
    }
  };

  const submitExam = async () => {
    if (!joinedSession || !anonymousSessionId || !activeExamDisplayName) {
      return;
    }

    setIsMutating(true);
    setStatusMessage("");
    const textQuestions = joinedSession.form.questions.filter((q) => q.type === "text");
    const answers = mergeStudentAnswersForSave(
      latestStudentAnswersRef.current,
      examFormRef.current,
      textQuestions,
    );
    latestStudentAnswersRef.current = answers;
    suspendAutosaveRef.current = true;
    if (autosaveTimerRef.current !== undefined) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = undefined;
    }
    try {
      await requestJson<{ ok: true }>(
        `/api/public/live-sessions/${joinedSession.liveSessionId}/responses`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: anonymousSessionId,
            displayName: activeExamDisplayName,
            answers,
          }),
        },
      );
      await requestJson<{ ok: true }>(
        `/api/public/live-sessions/${joinedSession.liveSessionId}/finish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: anonymousSessionId,
            displayName: activeExamDisplayName,
          }),
        },
      );
      const codeForBoard = joinCodeInput;
      clearJoinFormFields();
      leaveJoinedSession();
      if (codeForBoard) {
        void notifyLiveBoardRefresh(codeForBoard);
      }
      router.replace("/");
      router.refresh();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not submit the exam.");
    } finally {
      suspendAutosaveRef.current = false;
      setIsMutating(false);
    }
  };

  const hasVerifiedExamName = isValidLiveSessionDisplayName(activeExamDisplayName);

  const isBuilderStudentPreview =
    isTeacher &&
    mode === "student" &&
    Boolean(activeForm) &&
    !joinedSession;

  /** Live exam form, or the open form when a teacher previews the student experience. */
  const studentExamForm =
    joinedSession && hasVerifiedExamName
      ? joinedSession.form
      : isBuilderStudentPreview && activeForm
        ? activeForm
        : null;

  const effectiveExamAnswers = isBuilderStudentPreview ? previewAnswers : examAnswers;
  const studentExamQuestions = useMemo(() => {
    if (!studentExamForm) {
      return [];
    }
    return [...studentExamForm.questions].sort(
      (left, right) => left.displayOrder - right.displayOrder,
    );
  }, [studentExamForm]);

  const showLiveTeacherFeedback =
    Boolean(joinedSession) &&
    (isLiveTeacherFeedbackEnabled || hasLiveTeacherFeedbackContent(liveTeacherFeedback));

  const examAnswersLoading = Boolean(joinedSession) && !studentAnswersHydrated;

  /** Whether a student has supplied a non-empty answer to a question. */
  const isQuestionAnswered = useCallback(
    (question: Question): boolean => {
      const value = effectiveExamAnswers[question.id];
      if (typeof value !== "string") {
        return false;
      }
      return value.trim().length > 0;
    },
    [effectiveExamAnswers],
  );

  const examAnsweredCount = useMemo(
    () => studentExamQuestions.reduce((acc, q) => acc + (isQuestionAnswered(q) ? 1 : 0), 0),
    [studentExamQuestions, isQuestionAnswered],
  );
  const examTotalQuestions = studentExamQuestions.length;
  const examProgressPct =
    examTotalQuestions > 0
      ? Math.min(100, Math.round((examAnsweredCount / examTotalQuestions) * 100))
      : 0;
  const examAllAnswered =
    examTotalQuestions > 0 && examAnsweredCount === examTotalQuestions;

  const examProgressFillVariant = examAllAnswered
    ? "ready"
    : examProgressPct >= 80
      ? "almost"
      : examProgressPct >= 50
        ? "mid"
        : "";

  const examProgressCheer = (() => {
    if (examTotalQuestions === 0) return "";
    if (examAllAnswered) return "Ready to submit!";
    if (examProgressPct >= 80) return "Almost done!";
    if (examProgressPct >= 50) return "Halfway there!";
    if (examProgressPct >= 25) return "Off to a great start!";
    if (examAnsweredCount > 0) return "Keep going!";
    return "Let's go!";
  })();

  /** One-shot celebration when the student finishes their last question. */
  const [showAllAnsweredCelebrate, setShowAllAnsweredCelebrate] = useState(false);
  const lastAllAnsweredKeyRef = useRef<string>("");

  useEffect(() => {
    if (
      !joinedSession ||
      examFinished ||
      examSuspended ||
      !examTotalQuestions ||
      examAnswersLoading
    ) {
      return;
    }
    const key = `${joinedSession.liveSessionId}:${anonymousSessionId}`;
    if (examAllAnswered) {
      if (lastAllAnsweredKeyRef.current === key) {
        return;
      }
      lastAllAnsweredKeyRef.current = key;
      deferEffect(() => setShowAllAnsweredCelebrate(true));
      const t = window.setTimeout(
        () => deferEffect(() => setShowAllAnsweredCelebrate(false)),
        1800,
      );
      return () => window.clearTimeout(t);
    }
    if (lastAllAnsweredKeyRef.current === key) {
      lastAllAnsweredKeyRef.current = "";
    }
  }, [
    examAllAnswered,
    joinedSession,
    examFinished,
    examSuspended,
    examTotalQuestions,
    examAnswersLoading,
    anonymousSessionId,
  ]);

  const teacherPendingDashboardRedirect =
    urlSynced &&
    session?.profile?.role === "teacher" &&
    homePageIntent === "none" &&
    !joinedSession;

  if (session === undefined || !urlSynced || teacherPendingDashboardRedirect) {
    return (
      <div className="min-h-screen bg-[var(--tp-bg)] py-8 text-[var(--tp-text)] sm:py-10">
        <main className="mx-auto w-full max-w-5xl tp-card p-8">
          <div className="animate-pulse space-y-4" aria-hidden="true">
            <div className="h-9 w-72 max-w-full rounded-md bg-[var(--tp-border)]" />
            <div className="h-4 max-w-2xl rounded bg-[var(--tp-bg-subtle)]" />
            <div className="h-4 max-w-xl rounded bg-[var(--tp-bg-subtle)]" />
            <div className="mt-8 h-48 rounded-xl bg-[var(--tp-bg-subtle)]" />
          </div>
          <LoadingBar className="mt-6 max-w-md" />
        </main>
      </div>
    );
  }

  const showTeacherTools = mode === "teacher" && isTeacher;
  /** Join UI for logged-in users only; guests render it once in the landing block below. */
  const showJoinSection =
    Boolean(session) &&
    !isBuilderStudentPreview &&
    ((!isTeacher) || (isTeacher && mode === "student"));
  const teacherBannerMsLeft = teacherLiveBanner
    ? new Date(teacherLiveBanner.closesAt).getTime() - nowTick
    : 0;
  const teacherBannerNoTimeLimit = teacherLiveBanner
    ? isNoTimeLimitSession(teacherLiveBanner.opensAt, teacherLiveBanner.closesAt)
    : false;

  const joinSessionSection = (
    <section
      id="join-session"
      className="mb-8 tp-card-accent p-6 sm:p-8 tp-anim-fade-up"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={ui.sectionTitle}>Join</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">Join a live session</h2>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          {session && !isTeacher ? (
            <button
              type="button"
              onClick={() => void logout()}
              disabled={isMutating}
              className={`${ui.btnGhost} ${focusRing} disabled:opacity-50`}
              aria-label="Log out"
              title="Log out"
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
                <path d="M16 17l5-5-5-5M21 12H9M13 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
              </svg>
            </button>
          ) : null}
          <span aria-hidden className="hidden sm:inline-flex tp-brand-mark tp-brand-mark--lg">
            T
          </span>
        </div>
      </div>

      <div className="mt-6 space-y-5">
        {joinedSession ? (
          <div>
            <p className={ui.sectionTitle}>Your name</p>
            <p className="mt-1 text-base font-semibold text-[var(--tp-text)]">
              {activeExamDisplayName}
            </p>
          </div>
        ) : (
          <label className="block">
            <span className="block text-sm font-semibold text-[var(--tp-text)]">
              Your name
            </span>
            <input
              type="text"
              autoComplete="name"
              required
              spellCheck={false}
              maxLength={120}
              value={joinDisplayNameInput}
              onChange={(e) => setJoinDisplayNameInput(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                }
              }}
              className="tp-input"
              placeholder="e.g. Jordan Lee"
            />
          </label>
        )}

        <div>
          <span className="block text-sm font-semibold text-[var(--tp-text)]">
            Session code
          </span>
          <p className="mt-0.5 text-xs text-[var(--tp-text-muted)]">
            Six characters, from your teacher.
          </p>
          <div className="mt-3">
            <JoinCodeInput
              value={joinCodeInput}
              onChange={setJoinCodeInput}
              disabled={Boolean(joinedSession)}
              aria-label="Class session code"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!joinedSession ? (
            <button
              type="button"
              data-testid="student-join-submit"
              onClick={() => void joinWithCode(joinCodeInput)}
              disabled={
                isJoiningSession ||
                !isValidJoinCodeFormat(normalizeJoinCode(joinCodeInput)) ||
                !isValidLiveSessionDisplayName(normalizeLiveSessionDisplayName(joinDisplayNameInput))
              }
              aria-busy={isJoiningSession}
              className={`${ui.btnPrimary} disabled:opacity-50`}
            >
              {isJoiningSession ? buttonLabel("Starting…") : buttonLabel("Start task")}
            </button>
          ) : (
            <button
              type="button"
              onClick={leaveJoinedSession}
              className={ui.btnSecondary}
            >
              {buttonLabel("Leave session")}
            </button>
          )}
        </div>
      </div>

      {!joinedSession ? (
        <details className="mt-6 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] px-4 py-3 text-sm">
          <summary className="cursor-pointer select-none text-sm font-semibold text-[var(--tp-text)]">
            Already started? Use your personal rejoin code
          </summary>
          <p className="mt-2 text-sm text-[var(--tp-text-secondary)]">
            Eight characters from when you joined — not the class code.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block text-sm font-medium">
              <span className="sr-only">Personal rejoin code</span>
              <input
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={10}
                value={rejoinCodeInput}
                onChange={(e) => setRejoinCodeInput(e.target.value.toUpperCase())}
                className="tp-input font-mono tracking-widest"
                placeholder="ABCD 1234"
              />
            </label>
            <button
              type="button"
              onClick={() => void rejoinWithResumeCode(rejoinCodeInput)}
              disabled={
                isJoiningSession || !isValidResumeCodeFormat(normalizeResumeCode(rejoinCodeInput))
              }
              aria-busy={isJoiningSession}
              className={`justify-self-start ${ui.btnSecondary} disabled:opacity-50`}
            >
              {isJoiningSession ? buttonLabel("Rejoining…") : buttonLabel("Rejoin")}
            </button>
          </div>
        </details>
      ) : null}
    </section>
  );

  return (
    <div className={ui.page}>
      <div className="pointer-events-none fixed right-4 top-4 z-50 sm:right-6 sm:top-6">
        <div className="pointer-events-auto">
          <ThemeToggle />
        </div>
      </div>
      <main className={`${ui.pageMain} tp-card p-6 sm:p-8`}>
        {urlAuthNotice ? (
          <div
            className={`mb-6 ${ui.alertWarning}`}
            role="alert"
          >
            <p>{urlAuthNotice}</p>
            <button
              type="button"
              onClick={() => setUrlAuthNotice("")}
              className={`shrink-0 font-medium text-amber-900 underline ${focusRing}`}
            >
              {buttonLabel("Dismiss")}
            </button>
          </div>
        ) : null}
        {!session ? (
          <div className="mb-8 space-y-6">
            {joinSessionSection}
            <div className="rounded-[var(--tp-radius)] border border-[var(--tp-border)] bg-[var(--tp-surface)] p-6 sm:p-7">
              <p className={ui.sectionTitle}>For teachers</p>
              <h1 className="mt-1 text-xl font-bold text-[var(--tp-text)]">
                Build forms. Watch your class write.
              </h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/login"
                  className={`${ui.btnPrimary} ${focusRing}`}
                >
                  {buttonLabel("Sign in")}
                </Link>
                <Link
                  href="/register"
                  className={`${ui.btnSecondary} ${focusRing}`}
                >
                  {buttonLabel("Create account")}
                </Link>
              </div>
            </div>
          </div>
        ) : isTeacher ? (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Link
                href="/dashboard"
                className={`inline-flex items-center gap-1.5 text-sm font-medium text-[var(--tp-text-secondary)] hover:text-[var(--tp-text)] ${focusRing}`}
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
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                </svg>
                Dashboard
              </Link>
              <h1 className="mt-2 text-2xl font-bold tracking-tight">
                {isBuilderStudentPreview ? "Student preview" : "Form builder"}
              </h1>
              <p className="mt-1 text-sm text-[var(--tp-text-secondary)]">
                {isBuilderStudentPreview
                  ? "See how students will experience this exam."
                  : "Build forms and start live sessions. Students join with a code."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {session ? (
                <div
                  role="tablist"
                  className="inline-flex items-center rounded-full border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] p-1"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "teacher"}
                    onClick={() => setMode("teacher")}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      mode === "teacher"
                        ? "bg-[var(--tp-surface)] text-[var(--tp-text)] shadow-sm"
                        : "text-[var(--tp-text-secondary)] hover:text-[var(--tp-text)]"
                    }`}
                  >
                    {buttonLabel("Teacher")}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "student"}
                    onClick={() => setMode("student")}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      mode === "student"
                        ? "bg-[var(--tp-surface)] text-[var(--tp-text)] shadow-sm"
                        : "text-[var(--tp-text-secondary)] hover:text-[var(--tp-text)]"
                    }`}
                  >
                    {buttonLabel("Student")}
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => void logout()}
                disabled={isMutating}
                className={`${ui.btnGhost} ${focusRing} disabled:opacity-50`}
                aria-label="Log out"
                title="Log out"
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
                  <path d="M16 17l5-5-5-5M21 12H9M13 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
                </svg>
              </button>
            </div>
          </div>
        ) : null}

        {teacherLiveBanner && showTeacherTools ? (
          <div className="mb-6 rounded-[var(--tp-radius)] border border-[var(--tp-success-border)] bg-[var(--tp-mint-soft)] px-4 py-3 text-sm text-emerald-900 tp-anim-fade-up">
            <p className="font-semibold inline-flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full bg-[var(--tp-mint)]"
                style={{ animation: "tp-typing-pulse 1.4s ease-in-out infinite" }}
              />
              Live: {teacherLiveBanner.formTitle}
            </p>
            <p className="mt-1">
              <span className="rounded bg-[var(--tp-surface)]/80 px-2 py-0.5 font-mono text-base tracking-widest">
                {teacherLiveBanner.joinCode}
              </span>{" "}
              · {teacherBannerNoTimeLimit ? "No time limit" : `Time left ${formatCountdown(teacherBannerMsLeft)}`}
            </p>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              <Link
                href={`/live/${encodeURIComponent(teacherLiveBanner.joinCode)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`tp-link ${focusRing}`}
              >
                Class display (projector)
              </Link>
              <button
                type="button"
                className={`tp-link ${focusRing}`}
                onClick={() => setTeacherLiveBanner(null)}
              >
                {buttonLabel("Dismiss banner")}
              </button>
            </p>
            <div className="mt-3">
              <SessionJoinShare joinCode={teacherLiveBanner.joinCode} />
            </div>
          </div>
        ) : null}

        {showJoinSection ? joinSessionSection : null}

        {isLoadingForms && showTeacherTools ? (
          <LoadingBar className="max-w-xs" label="Loading forms" />
        ) : errorMessage && showTeacherTools ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{errorMessage}</p>
        ) : showTeacherTools && !activeForm ? (
          <div className="py-10 text-center text-sm text-[var(--tp-text-secondary)]">
            <p className="font-medium text-[var(--tp-text)]">No form open</p>
            <p className="mt-2 max-w-md mx-auto">
              In the{" "}
              <Link href="/dashboard" className={`tp-link ${focusRing}`}>
                form library
              </Link>
              , click <span className="font-medium text-[var(--tp-text)]">Edit in builder</span> on a form to open it
              here.
            </p>
          </div>
        ) : showTeacherTools && activeForm ? (
          <section className="space-y-8">
            <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-surface)]/95 px-4 py-2.5 text-sm shadow-sm backdrop-blur-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className={ui.sectionTitle}>Form builder</p>
                {builderSaveStatus === "saving" ? (
                  <span
                    className="tp-save-indicator"
                    data-state="saving"
                    role="status"
                    aria-live="polite"
                  >
                    <span aria-hidden className="tp-save-dot" />
                    <span>Saving…</span>
                  </span>
                ) : builderSaveStatus === "saved" && !builderHasUnsavedChanges ? (
                  <span
                    className="tp-save-indicator"
                    data-state="saved"
                    role="status"
                    aria-live="polite"
                  >
                    <span aria-hidden className="tp-save-dot" />
                    <span>Saved</span>
                  </span>
                ) : builderSaveStatus === "error" ? (
                  <span
                    className="tp-save-indicator"
                    data-state="error"
                    role="alert"
                  >
                    <span aria-hidden className="tp-save-dot" />
                    <span>{builderSaveError || "Save failed"}</span>
                  </span>
                ) : builderHasUnsavedChanges ? (
                  <span className="tp-save-indicator" data-state="saving">
                    <span aria-hidden className="tp-save-dot" />
                    <span>Unsaved changes</span>
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void saveBuilderForm()}
                disabled={
                  builderSaveStatus === "saving" ||
                  isMutating ||
                  (!builderHasUnsavedChanges && builderSaveStatus !== "error")
                }
                className={`${ui.btnPrimary} disabled:opacity-50`}
                aria-busy={builderSaveStatus === "saving"}
              >
                <svg
                  aria-hidden
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                {builderSaveStatus === "saving"
                  ? buttonLabel("Saving…")
                  : buttonLabel("Save form")}
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-medium">
                Form title
                <input
                  type="text"
                  value={activeForm.title}
                  onChange={(event) =>
                    updateActiveForm((form) => ({ ...form, title: event.target.value }))
                  }
                  className="tp-input"
                />
              </label>

              <label className="block text-sm font-medium">
                Form description
                <textarea
                  value={activeForm.description}
                  onChange={(event) =>
                    updateActiveForm((form) => ({ ...form, description: event.target.value }))
                  }
                  className="tp-input"
                  rows={3}
                />
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={activeForm.liveTeacherFeedbackEnabled}
                  onChange={(event) =>
                    updateActiveForm((form) => ({
                      ...form,
                      liveTeacherFeedbackEnabled: event.target.checked,
                    }))
                  }
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-[var(--tp-text)]">Live teacher feedback</span>
                  <span className="mt-0.5 block text-[var(--tp-text-secondary)]">
                    While students answer text questions, you can type comments on their live view that
                    appear under their text box in real time.
                  </span>
                </span>
              </label>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-[var(--tp-border)] pt-6">
              <button
                type="button"
                onClick={() => void addQuestion("multipleChoice")}
                disabled={isMutating}
                className="tp-btn-primary"
              >
                {buttonLabel("Add multiple choice")}
              </button>
              <button
                type="button"
                onClick={() => void addQuestion("text")}
                disabled={isMutating}
                className={ui.btnSecondary}
              >
                {buttonLabel("Add text area")}
              </button>
            </div>

            <div className={`${ui.questionList} border-t border-[var(--tp-border)] pt-8`}>
              {activeForm.questions.length === 0 ? (
                <p className={ui.empty}>Add questions to this form.</p>
              ) : (
                activeForm.questions.map((question, index) => (
                  <article key={question.id} className={ui.questionCardNested}>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--tp-border)] pb-4">
                      <h3 className="text-sm font-semibold text-[var(--tp-text-secondary)]">
                        Question {index + 1}
                      </h3>
                      <button
                        type="button"
                        onClick={() => void removeQuestion(question.id)}
                        disabled={isMutating}
                        className="text-sm font-medium text-red-600"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                      <aside
                        className={`${ui.questionScoring} order-first w-full shrink-0 sm:max-w-[11rem] lg:order-2 lg:w-40`}
                      >
                        <p className={ui.sectionTitle}>Scoring</p>
                        <label className={`${ui.label} mt-2 block`}>
                          Points
                          <div className="mt-1.5 flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={1000}
                              value={question.points}
                              onChange={(event) =>
                                updateActiveForm((form) => ({
                                  ...form,
                                  questions: form.questions.map((formQuestion) =>
                                    formQuestion.id === question.id
                                      ? {
                                          ...formQuestion,
                                          points: Math.max(
                                            1,
                                            Math.min(1000, Number(event.target.value) || 1),
                                          ),
                                        }
                                      : formQuestion,
                                  ),
                                }))
                              }
                              className={ui.pointsInput}
                              aria-label={`Points for question ${index + 1}`}
                            />
                            <span className="text-sm font-medium text-[var(--tp-text-muted)]">pts</span>
                          </div>
                        </label>
                      </aside>

                      <div className="min-w-0 flex-1 space-y-4 lg:order-1">
                        <label className={ui.label}>
                          Prompt
                      <input
                        type="text"
                        value={question.prompt}
                        onChange={(event) =>
                          updateActiveForm((form) => ({
                            ...form,
                            questions: form.questions.map((formQuestion) =>
                              formQuestion.id === question.id
                                ? { ...formQuestion, prompt: event.target.value }
                                : formQuestion,
                            ),
                          }))
                        }
                        className={ui.input}
                      />
                    </label>

                        {question.type === "multipleChoice" ? (
                          <div className="space-y-2">
                        {question.options.map((option, optionIndex) => (
                          <label
                            key={`${question.id}-option-${optionIndex}`}
                            className="block text-sm"
                          >
                            Option {optionIndex + 1}
                            <input
                              type="text"
                              value={option}
                              onChange={(event) =>
                                updateActiveForm((form) => ({
                                  ...form,
                                  questions: form.questions.map((formQuestion) => {
                                    if (formQuestion.id !== question.id) {
                                      return formQuestion;
                                    }

                                    return {
                                      ...formQuestion,
                                      options: formQuestion.options.map((currentOption, i) =>
                                        i === optionIndex ? event.target.value : currentOption,
                                      ),
                                      correctAnswer:
                                        formQuestion.correctAnswer &&
                                        formQuestion.options.some(
                                          (existingOption, i) =>
                                            i !== optionIndex && existingOption === formQuestion.correctAnswer,
                                        )
                                          ? formQuestion.correctAnswer
                                          : formQuestion.options[optionIndex] === formQuestion.correctAnswer
                                            ? event.target.value
                                            : formQuestion.correctAnswer,
                                    };
                                  }),
                                }))
                              }
                              className="tp-input"
                            />
                          </label>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            updateActiveForm((form) => ({
                              ...form,
                              questions: form.questions.map((formQuestion) => {
                                if (formQuestion.id !== question.id) {
                                  return formQuestion;
                                }

                                return {
                                  ...formQuestion,
                                  options: [
                                    ...formQuestion.options,
                                    `Option ${formQuestion.options.length + 1}`,
                                  ],
                                };
                              }),
                            }))
                          }
                          className={ui.btnPrimary}
                        >
                          {buttonLabel("Add option")}
                        </button>
                        <label className="block text-sm font-medium">
                          Correct answer (optional)
                          <select
                            value={question.correctAnswer ?? ""}
                            onChange={(event) =>
                              updateActiveForm((form) => ({
                                ...form,
                                questions: form.questions.map((formQuestion) =>
                                  formQuestion.id === question.id
                                    ? {
                                        ...formQuestion,
                                        correctAnswer: event.target.value || null,
                                      }
                                    : formQuestion,
                                ),
                              }))
                            }
                            className="tp-input"
                          >
                            <option value="">No correct answer selected</option>
                            {question.options.map((option, optionIndex) => (
                              <option key={`${question.id}-correct-${optionIndex}`} value={option}>
                                {option || `Option ${optionIndex + 1}`}
                              </option>
                            ))}
                          </select>
                        </label>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        ) : studentExamForm && !showTeacherTools ? (
          <section
            className="relative space-y-5"
            data-exam-protected={joinedSession ? "" : undefined}
            onPointerMove={schedulePointerInteractionHeartbeat}
            onPointerOver={schedulePointerInteractionHeartbeat}
            onFocusCapture={schedulePointerInteractionHeartbeat}
            {...examProtectionHandlers(Boolean(joinedSession && !examFinished))}
          >
            {isBuilderStudentPreview ? (
              <div className="rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] px-4 py-3 text-sm">
                <p className="font-medium text-[var(--tp-text)]">Preview mode</p>
                <p className="mt-1 text-[var(--tp-text-secondary)]">
                  Try the exam as a student. Answers here are not saved.
                </p>
              </div>
            ) : null}
            {joinedSession && examFinished ? (
              <div
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 overflow-hidden rounded-[var(--tp-radius)] border border-[var(--tp-success-border)] bg-[var(--tp-surface)]/95 p-6 text-center shadow-lg backdrop-blur-sm tp-anim-fade-in"
                role="status"
                aria-live="polite"
              >
                {showStudentConfetti ? <Confetti /> : null}
                {examGraded && pointsEarned != null && pointsPossible != null ? (
                  <>
                    <div className="tp-anim-pop">
                      <ScoreRing
                        earned={pointsEarned}
                        possible={pointsPossible}
                        size={140}
                        stroke={12}
                        animate
                      />
                    </div>
                    <p className="text-lg font-semibold text-[var(--tp-text)]">
                      {scoreTierMessage(scoreTier(pointsEarned, pointsPossible))}
                    </p>
                    <p className="max-w-md text-sm text-[var(--tp-text-secondary)]">
                      You earned{" "}
                      <span className="font-semibold text-[var(--tp-text)]">
                        {formatPointsScore(pointsEarned, pointsPossible)}
                      </span>
                      .
                    </p>
                  </>
                ) : (
                  <>
                    <span aria-hidden className="tp-anim-celebrate">
                      <svg
                        className="h-12 w-12 text-[var(--tp-mint)]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                    </span>
                    <p className="text-lg font-semibold text-[var(--tp-text)]">Submitted</p>
                    <p className="inline-flex items-center gap-2 text-sm text-[var(--tp-text-secondary)]">
                      <span aria-hidden className="tp-halo-dot" />
                      Your teacher is grading your exam.
                    </p>
                    <p className="max-w-md text-xs text-[var(--tp-text-muted)]">
                      Your answers are saved. You can keep this tab open — your score will appear
                      here when grading is done.
                    </p>
                  </>
                )}
              </div>
            ) : null}
            {joinedSession && examSuspended ? (
              <div
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-[var(--tp-radius)] border border-[var(--tp-warning-border)] bg-[var(--tp-surface)]/95 p-6 text-center shadow-lg backdrop-blur-sm tp-anim-fade-in"
                role="alert"
              >
                <span aria-hidden>
                  <svg
                    className="h-10 w-10 text-[var(--tp-amber)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M10 9v6M14 9v6" />
                  </svg>
                </span>
                <p className="text-lg font-semibold text-[var(--tp-text)]">Paused</p>
                <p className="max-w-md text-sm text-[var(--tp-text-secondary)]">
                  Keep this tab visible. Your teacher will let you back in.
                </p>
              </div>
            ) : null}
            {isBuilderStudentPreview && examTotalQuestions > 0 ? (
              <div
                className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-surface)]/95 px-4 py-2.5 text-sm shadow-sm backdrop-blur-sm"
              >
                <span className="font-medium text-[var(--tp-text)]">No time limit</span>
                <div
                  className="tp-exam-progress"
                  role="progressbar"
                  aria-label="Exam progress"
                  aria-valuemin={0}
                  aria-valuemax={examTotalQuestions}
                  aria-valuenow={examAnsweredCount}
                >
                  <div className="tp-exam-progress__bar" aria-hidden>
                    <div
                      className={`tp-exam-progress__fill${
                        examProgressFillVariant
                          ? ` tp-exam-progress__fill--${examProgressFillVariant}`
                          : ""
                      }`}
                      style={{ width: `${examProgressPct}%` }}
                    />
                  </div>
                  <div className="tp-exam-progress__label">
                    <span className="tp-exam-progress__count">
                      {examAnsweredCount} / {examTotalQuestions}
                    </span>
                    <span className="text-[var(--tp-text-muted)]">answered</span>
                    <span
                      className={`tp-exam-progress__cheer${
                        examAllAnswered ? " tp-exam-progress__cheer--ready" : ""
                      }`}
                      aria-live="polite"
                    >
                      · {examProgressCheer}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
            {joinedSession ? (
              <div
                className={`sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[var(--tp-radius-sm)] border px-4 py-2.5 text-sm shadow-sm ${
                  sessionOpen
                    ? "border-[var(--tp-border)] bg-[var(--tp-surface)]/95 backdrop-blur-sm text-[var(--tp-text)]"
                    : "border-[var(--tp-warning-border)] bg-[var(--tp-warning-soft)] text-[var(--tp-warning-text)]"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  {sessionOpen && !joinedSessionNoTimeLimit && !examFinished ? (
                    <>
                      <svg
                        aria-hidden
                        className="h-4 w-4 text-[var(--tp-accent)]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                      <span className="font-mono tabular-nums text-base font-semibold">
                        {formatCountdown(studentMsLeft)}
                      </span>
                      <span className="text-xs text-[var(--tp-text-secondary)]">left</span>
                    </>
                  ) : (
                    <span className="font-medium">
                      {examFinished
                        ? "Submitted"
                        : sessionOpen
                          ? "No time limit"
                          : nowTick < new Date(joinedSession.opensAt).getTime()
                            ? "Session not yet open"
                            : "Session has ended"}
                    </span>
                  )}
                </span>
                {examTotalQuestions > 0 && !examFinished && sessionOpen ? (
                  <div
                    className="tp-exam-progress"
                    role="progressbar"
                    aria-label="Exam progress"
                    aria-valuemin={0}
                    aria-valuemax={examTotalQuestions}
                    aria-valuenow={examAnsweredCount}
                  >
                    <div className="tp-exam-progress__bar" aria-hidden>
                      <div
                        className={`tp-exam-progress__fill${
                          examProgressFillVariant
                            ? ` tp-exam-progress__fill--${examProgressFillVariant}`
                            : ""
                        }`}
                        style={{ width: `${examProgressPct}%` }}
                      />
                    </div>
                    <div className="tp-exam-progress__label">
                      <span className="tp-exam-progress__count">
                        {examAnsweredCount} / {examTotalQuestions}
                      </span>
                      <span className="text-[var(--tp-text-muted)]">answered</span>
                      <span
                        className={`tp-exam-progress__cheer${
                          examAllAnswered ? " tp-exam-progress__cheer--ready" : ""
                        }`}
                        aria-live="polite"
                      >
                        · {examProgressCheer}
                      </span>
                    </div>
                  </div>
                ) : null}
                {activeExamDisplayName ? (
                  <span className="text-xs text-[var(--tp-text-secondary)]">
                    {activeExamDisplayName}
                  </span>
                ) : null}
              </div>
            ) : null}

            <header>
              <h2 className="text-2xl font-bold">{studentExamForm.title || "Untitled Form"}</h2>
              {studentExamForm.description ? (
                <p className="mt-1 text-[var(--tp-text-secondary)]">{studentExamForm.description}</p>
              ) : null}
            </header>

            {studentExamQuestions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--tp-border-strong)] p-4 text-[var(--tp-text-secondary)]">
                This form has no questions yet.
              </p>
            ) : (
              <form ref={examFormRef} className={ui.questionList}>
                {studentExamQuestions.map((question, index) => {
                  const answered = isQuestionAnswered(question);
                  const examActive = Boolean(
                    isBuilderStudentPreview ||
                      (joinedSession && sessionOpen && !examSuspended && !examFinished),
                  );
                  return (
                  <article
                    key={question.id}
                    className={`${ui.questionCardNested}${
                      answered && examActive ? " tp-question-card--answered" : ""
                    }`}
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-base font-semibold text-[var(--tp-text)]">
                        {index + 1}. {question.prompt || "Untitled question"}
                      </h3>
                      {answered && examActive ? (
                        <span
                          key={`answered-${question.id}-badge`}
                          className="tp-answered-badge"
                          aria-label="Answered"
                        >
                          <svg
                            aria-hidden
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M5 12l5 5L20 7" />
                          </svg>
                          Answered
                        </span>
                      ) : null}
                    </div>

                    {question.type === "multipleChoice" ? (
                      <div className="space-y-2">
                        {question.options.map((option, optionIndex) => (
                          <label
                            key={`${question.id}-${optionIndex}`}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="radio"
                              name={question.id}
                              value={option}
                              checked={effectiveExamAnswers[question.id] === option}
                              disabled={
                                isBuilderStudentPreview
                                  ? false
                                  : examAnswersLoading ||
                                    (Boolean(joinedSession) && !sessionOpen) ||
                                    Boolean(examSuspended) ||
                                    Boolean(examFinished)
                              }
                              onChange={(event) => {
                                if (isBuilderStudentPreview) {
                                  setPreviewAnswers((prev) => ({
                                    ...prev,
                                    [question.id]: event.target.value,
                                  }));
                                  return;
                                }
                                scheduleTypingHeartbeat();
                                patchChoiceAnswer(question.id, event.target.value);
                              }}
                            />
                            <span>{option || `Option ${optionIndex + 1}`}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <StudentExamTextarea
                          id={question.id}
                          rows={4}
                          value={effectiveExamAnswers[question.id] ?? ""}
                          disabled={
                            isBuilderStudentPreview
                              ? false
                              : examAnswersLoading ||
                                (Boolean(joinedSession) && !sessionOpen) ||
                                Boolean(examSuspended) ||
                                Boolean(examFinished)
                          }
                          protect={Boolean(
                            !isBuilderStudentPreview &&
                              joinedSession &&
                              studentAnswersHydrated &&
                              sessionOpen &&
                              !examSuspended &&
                              !examFinished,
                          )}
                          onValueChange={(next) => {
                            if (isBuilderStudentPreview) {
                              setPreviewAnswers((prev) => ({
                                ...prev,
                                [question.id]: next,
                              }));
                              return;
                            }
                            scheduleTypingHeartbeat();
                            patchTextAnswer(question.id, next);
                          }}
                          placeholder="Type your response..."
                          className="tp-input"
                        />
                        {showLiveTeacherFeedback ? (
                          <StudentTeacherFeedbackCard
                            message={liveTeacherFeedback[question.id] ?? ""}
                          />
                        ) : null}
                      </div>
                    )}
                  </article>
                  );
                })}
              </form>
            )}

            {!isBuilderStudentPreview ? (
            <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p
                ref={autosaveStatusElRef}
                data-testid="student-autosave-status"
                aria-live="polite"
                className="text-xs text-[var(--tp-text-secondary)]"
              >
                {"\u00a0"}
              </p>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={() => void saveStudentAnswers()}
                  disabled={
                    isMutating ||
                    !anonymousSessionId ||
                    !joinedSession ||
                    !sessionOpen ||
                    examSuspended ||
                    examFinished
                  }
                  className={`${ui.btnSecondary} disabled:opacity-50`}
                >
                  {buttonLabel("Save now")}
                </button>
                {joinedSession && sessionOpen && !examSuspended && !examFinished ? (
                  <div className="relative">
                    {showAllAnsweredCelebrate ? (
                      <Confetti pieces={22} durationMs={1500} />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void submitExam()}
                      disabled={isMutating || !anonymousSessionId}
                      className={`${
                        examAllAnswered
                          ? `tp-submit-ready ${focusRing}`
                          : `${ui.btnPrimary} disabled:opacity-50`
                      }`}
                      aria-label={
                        examAllAnswered ? "You're ready — submit your exam" : "Submit exam"
                      }
                    >
                      <svg
                        aria-hidden
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                      {examAllAnswered ? "Submit your exam" : "Submit exam"}
                      {examAllAnswered ? (
                        <svg
                          aria-hidden
                          className="h-4 w-4 tp-submit-ready__arrow"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M5 12h14M13 5l7 7-7 7" />
                        </svg>
                      ) : null}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            ) : null}
          </section>
        ) : !showTeacherTools ? (
          <p className="text-[var(--tp-text-secondary)]">
            {isTeacher && mode === "student" && !activeForm
              ? "Enter your name and join with a session code to try the exam as a student."
              : "Enter a code above to begin."}
          </p>
        ) : null}

        {statusMessage ? (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="mt-6 rounded-md border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] px-3 py-2 text-sm text-[var(--tp-text-secondary)]"
          >
            {statusMessage}
          </div>
        ) : null}
      </main>
    </div>
  );
}
