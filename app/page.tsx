"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LoadingBar } from "@/components/LoadingBar";
import { SessionJoinShare } from "@/components/SessionJoinShare";
import { StudentExamTextarea } from "@/components/StudentExamTextarea";
import { getOrCreateAnonymousSessionId } from "@/lib/anonymous-session";
import { postExamTabLeave } from "@/lib/exam-tab-leave";
import type { Form, Question, QuestionType, StudentAnswers } from "@/lib/forms";
import { isValidLiveSessionDisplayName, normalizeLiveSessionDisplayName } from "@/lib/live-session-display-name";
import { parseLiveSessionStudentGet } from "@/lib/live-session-student-get";
import { isValidJoinCodeFormat, normalizeJoinCode } from "@/lib/join-code";
import { isNoTimeLimitSession } from "@/lib/session-window";
import { stableStringifyStudentAnswers } from "@/lib/student-answers-json";
import { buttonLabel, focusRing, ui } from "@/lib/ui";

type ApiError = {
  error?: string;
};

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
const AUTOSAVE_DEBOUNCE_MS = 200;
const AUTOSAVE_MAX_WAIT_MS = 300;

const BUILDER_AUTOSAVE_MS = 5000;

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

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null | undefined>(undefined);
  const [mode, setMode] = useState<"teacher" | "student">("student");
  const [authForms, setAuthForms] = useState<Form[]>([]);
  const [activeFormId, setActiveFormId] = useState("");
  const [pendingAutoJoinCode, setPendingAutoJoinCode] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joinDisplayNameInput, setJoinDisplayNameInput] = useState("");
  const [activeExamDisplayName, setActiveExamDisplayName] = useState("");
  const [joinedSession, setJoinedSession] = useState<JoinedLiveSession | null>(null);
  const [teacherLiveBanner, setTeacherLiveBanner] = useState<TeacherLiveBanner | null>(null);
  const [anonymousSessionId, setAnonymousSessionId] = useState("");
  const [studentAnswers, setStudentAnswers] = useState<StudentAnswers>({});
  const [examSuspended, setExamSuspended] = useState(false);
  const [examFinished, setExamFinished] = useState(false);
  const [liveTeacherFeedback, setLiveTeacherFeedback] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState("");
  const [autosaveBanner, setAutosaveBanner] = useState("");
  const [builderAutosaveBanner, setBuilderAutosaveBanner] = useState("");
  const typingHeartbeatTimerRef = useRef<number | undefined>(undefined);
  const lastPointerInteractionPingAtRef = useRef(0);
  const loadedExamNamePrefillRef = useRef(false);
  const latestStudentAnswersRef = useRef<StudentAnswers>({});
  const lastPersistedAnswersJsonRef = useRef("");
  const suspendAutosaveRef = useRef(false);
  const autosaveTimerRef = useRef<number | undefined>(undefined);
  const lastAutosaveSentAtRef = useRef(0);
  const pendingDirtySinceRef = useRef<number | null>(null);
  const lastPersistedBuilderFormDetailsRef = useRef("");
  const lastPersistedBuilderQuestionJsonByIdRef = useRef<Record<string, string>>({});
  const builderAutosaveInFlightRef = useRef(false);
  const builderAutosaveBannerClearRef = useRef<number | undefined>(undefined);
  const latestActiveFormRef = useRef<Form | undefined>(undefined);
  const autosaveBannerClearRef = useRef<number | undefined>(undefined);
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [urlAuthNotice, setUrlAuthNotice] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const teacherHomeRedirectDoneRef = useRef(false);
  const joinIntentFromUrlRef = useRef(false);
  const tabLeaveReportedRef = useRef(false);

  const isTeacher = session?.profile?.role === "teacher";

  latestStudentAnswersRef.current = studentAnswers;

  const activeForm = useMemo(
    () => authForms.find((form) => form.id === activeFormId),
    [authForms, activeFormId],
  );

  latestActiveFormRef.current = activeForm;

  const closesAtForStudent = joinedSession?.closesAt ?? null;
  const sessionOpen =
    closesAtForStudent && joinedSession
      ? nowTick >= new Date(joinedSession.opensAt).getTime() &&
        nowTick <= new Date(closesAtForStudent).getTime()
      : false;

  const studentMsLeft = closesAtForStudent ? new Date(closesAtForStudent).getTime() - nowTick : 0;
  const joinedSessionNoTimeLimit =
    joinedSession ? isNoTimeLimitSession(joinedSession.opensAt, joinedSession.closesAt) : false;

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
      setAnonymousSessionId(getOrCreateAnonymousSessionId());
    }, 0);
    return () => clearTimeout(timeoutId);
  }, []);

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
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("code") ?? params.get("join");
    if (raw) {
      const normalized = normalizeJoinCode(raw);
      if (isValidJoinCodeFormat(normalized)) {
        setJoinCodeInput(normalized);
        setPendingAutoJoinCode(normalized);
        joinIntentFromUrlRef.current = true;
      }
    }
    const u = new URL(window.location.href);
    if (u.searchParams.has("code") || u.searchParams.has("join")) {
      u.searchParams.delete("code");
      u.searchParams.delete("join");
      window.history.replaceState({}, "", u.pathname + u.search + u.hash);
    }
  }, []);

  useEffect(() => {
    if (!pendingAutoJoinCode || joinedSession || isMutating) {
      return;
    }
    const normalizedDisplayName = normalizeLiveSessionDisplayName(joinDisplayNameInput);
    if (!isValidLiveSessionDisplayName(normalizedDisplayName)) {
      setStatusMessage("Join code loaded from link. Enter your name, then tap Join.");
      return;
    }
    void joinWithCode(pendingAutoJoinCode);
    setPendingAutoJoinCode("");
  }, [pendingAutoJoinCode, joinDisplayNameInput, joinedSession, isMutating]);

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
      if (session === undefined) {
        return;
      }
      if (!session) {
        setMode("student");
        return;
      }
      if (session.profile?.role === "teacher") {
        setMode("teacher");
      } else {
        setMode("student");
      }
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [session]);

  useEffect(() => {
    if (session === undefined) {
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
            setAuthForms(auth.forms);
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
  }, [session]);

  useEffect(() => {
    if (typeof window === "undefined" || session?.profile?.role !== "teacher") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const formId = params.get("form");
    if (!formId) {
      return;
    }
    if (!authForms.some((f) => f.id === formId)) {
      return;
    }
    setActiveFormId(formId);
    setMode("teacher");
    const { pathname, hash } = window.location;
    window.history.replaceState(
      {},
      "",
      `${pathname}?form=${encodeURIComponent(formId)}${hash}`,
    );
  }, [session, authForms]);

  /**
   * Teachers opening `/` without `?form=` (or join/code params) go to the dashboard — forms are opened
   * here via Form library → Edit in builder (`?form=…`).
   */
  useEffect(() => {
    if (session === undefined) {
      return;
    }
    if (session === null) {
      teacherHomeRedirectDoneRef.current = false;
      return;
    }
    if (session.profile?.role !== "teacher") {
      return;
    }
    if (teacherHomeRedirectDoneRef.current) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.has("form") || params.has("code") || params.has("join") || joinIntentFromUrlRef.current) {
      teacherHomeRedirectDoneRef.current = true;
      return;
    }
    const h = window.location.hash;
    if (h === "#join-session" || h.startsWith("#join-session")) {
      teacherHomeRedirectDoneRef.current = true;
      return;
    }
    teacherHomeRedirectDoneRef.current = true;
    router.replace("/dashboard");
  }, [session, router]);

  const syncListsAfterTeacherChange = async () => {
    if (session?.profile?.role === "teacher") {
      const auth = await requestJson<{ forms: Form[] }>("/api/forms");
      setAuthForms(auth.forms);
    }
  };

  useEffect(() => {
    if (!joinedSession || !anonymousSessionId) {
      return;
    }

    const loadStudentResponse = async () => {
      try {
        const params = new URLSearchParams({ deviceId: anonymousSessionId });
        const response = await fetch(
          `/api/public/live-sessions/${joinedSession.liveSessionId}/responses?${params.toString()}`,
        );
        const raw = (await response.json()) as unknown;
        if (!response.ok) {
          const err = raw as { error?: string };
          throw new Error(err.error ?? "Request failed.");
        }
        const parsed = parseLiveSessionStudentGet(raw);
        setStudentAnswers(parsed.answers);
        lastPersistedAnswersJsonRef.current = stableStringifyStudentAnswers(parsed.answers);
        suspendAutosaveRef.current = false;
        setExamSuspended(parsed.suspended);
        setExamFinished(parsed.finished);
        setLiveTeacherFeedback(parsed.liveTeacherFeedback);
        if (parsed.finished) {
          setStatusMessage("You have submitted this exam.");
        } else if (parsed.suspended) {
          setStatusMessage("This exam is paused until your teacher allows you to continue.");
        } else {
          setStatusMessage("Loaded saved answers.");
        }
      } catch (error) {
        suspendAutosaveRef.current = false;
        setStatusMessage(error instanceof Error ? error.message : "Failed to load student answers.");
      }
    };

    const timeoutId = setTimeout(() => {
      void loadStudentResponse();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [joinedSession, anonymousSessionId]);

  useEffect(() => {
    if (!joinedSession || !anonymousSessionId) {
      return;
    }
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ deviceId: anonymousSessionId });
          const response = await fetch(
            `/api/public/live-sessions/${joinedSession.liveSessionId}/responses?${params.toString()}`,
          );
          const raw = (await response.json()) as {
            answers?: unknown;
            suspended?: boolean;
            finished?: boolean;
            liveTeacherFeedback?: unknown;
            error?: string;
          };
          if (!response.ok) {
            return;
          }
          const parsed = parseLiveSessionStudentGet(raw);
          setExamSuspended((prevSuspended) => {
            if (prevSuspended && !parsed.suspended) {
              setStatusMessage("Your teacher allowed you to continue. You can answer again.");
            }
            return parsed.suspended;
          });
          setExamFinished((prevFinished) => {
            if (!prevFinished && parsed.finished) {
              setStatusMessage("You have submitted this exam.");
            }
            return parsed.finished;
          });
          if (parsed.suspended || parsed.finished) {
            setStudentAnswers(parsed.answers);
            lastPersistedAnswersJsonRef.current = stableStringifyStudentAnswers(parsed.answers);
          }
          setLiveTeacherFeedback(parsed.liveTeacherFeedback);
        } catch {
          /* ignore */
        }
      })();
    }, joinedSession?.form.liveTeacherFeedbackEnabled ? 1200 : 3000);
    return () => window.clearInterval(id);
  }, [joinedSession, anonymousSessionId, joinedSession?.form.liveTeacherFeedbackEnabled]);

  useEffect(() => {
    if (
      !joinedSession ||
      !anonymousSessionId ||
      !activeExamDisplayName ||
      !sessionOpen ||
      examSuspended ||
      examFinished
    ) {
      if (autosaveTimerRef.current !== undefined) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = undefined;
      }
      return;
    }
    if (suspendAutosaveRef.current) {
      return;
    }

    const answers = latestStudentAnswersRef.current;
    const nextJson = stableStringifyStudentAnswers(answers);
    if (nextJson === lastPersistedAnswersJsonRef.current) {
      pendingDirtySinceRef.current = null;
      return;
    }

    if (pendingDirtySinceRef.current === null) {
      pendingDirtySinceRef.current = Date.now();
    }

    const runPersist = () => {
      if (suspendAutosaveRef.current) {
        return;
      }
      const currentAnswers = latestStudentAnswersRef.current;
      const currentJson = stableStringifyStudentAnswers(currentAnswers);
      if (currentJson === lastPersistedAnswersJsonRef.current) {
        return;
      }

      void (async () => {
        try {
          setAutosaveBanner("Saving…");
          const res = await fetch(`/api/public/live-sessions/${joinedSession.liveSessionId}/responses`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deviceId: anonymousSessionId,
              displayName: activeExamDisplayName,
              answers: currentAnswers,
            }),
          });
          const raw = (await res.json()) as { error?: string };
          if (!res.ok) {
            setAutosaveBanner(raw.error ?? "Autosave failed. Use Save answers.");
            return;
          }
          lastPersistedAnswersJsonRef.current = stableStringifyStudentAnswers(currentAnswers);
          pendingDirtySinceRef.current = null;
          if (autosaveBannerClearRef.current !== undefined) {
            window.clearTimeout(autosaveBannerClearRef.current);
          }
          setAutosaveBanner("All changes saved");
          autosaveBannerClearRef.current = window.setTimeout(() => {
            autosaveBannerClearRef.current = undefined;
            setAutosaveBanner((prev) => (prev === "All changes saved" ? "" : prev));
          }, 2600);
        } catch {
          setAutosaveBanner("Autosave failed. Use Save answers.");
        }
      })();
    };

    const now = Date.now();
    const dirtyFor = pendingDirtySinceRef.current ? now - pendingDirtySinceRef.current : 0;
    const sinceLastSent = now - lastAutosaveSentAtRef.current;
    window.clearTimeout(autosaveTimerRef.current);

    if (dirtyFor >= AUTOSAVE_MAX_WAIT_MS || sinceLastSent >= AUTOSAVE_MAX_WAIT_MS) {
      lastAutosaveSentAtRef.current = now;
      runPersist();
    } else {
      const debounceMs = Math.min(
        AUTOSAVE_DEBOUNCE_MS,
        Math.max(0, AUTOSAVE_MAX_WAIT_MS - dirtyFor),
      );
      autosaveTimerRef.current = window.setTimeout(() => {
        lastAutosaveSentAtRef.current = Date.now();
        runPersist();
      }, debounceMs);
    }

    return () => {
      if (autosaveTimerRef.current !== undefined) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = undefined;
      }
    };
  }, [
    studentAnswers,
    joinedSession,
    sessionOpen,
    examSuspended,
    examFinished,
    anonymousSessionId,
    activeExamDisplayName,
  ]);

  useEffect(() => {
    if (!joinedSession || !anonymousSessionId || !activeExamDisplayName) {
      return;
    }
    void (async () => {
      try {
        await fetch(`/api/public/live-sessions/${joinedSession.liveSessionId}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: anonymousSessionId,
            displayName: activeExamDisplayName,
          }),
        });
      } catch {
        /* ignore */
      }
    })();
  }, [joinedSession?.liveSessionId, anonymousSessionId, activeExamDisplayName]);

  useEffect(() => {
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
    const ping = () => {
      void fetch(`/api/public/live-sessions/${liveSessionId}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          displayName,
          isTyping: false,
          interaction: false,
        }),
      });
    };
    ping();
    const id = window.setInterval(ping, 25000);
    return () => window.clearInterval(id);
  }, [
    joinedSession,
    anonymousSessionId,
    activeExamDisplayName,
    sessionOpen,
    examSuspended,
    examFinished,
  ]);

  useEffect(() => {
    return () => {
      if (typingHeartbeatTimerRef.current !== undefined) {
        window.clearTimeout(typingHeartbeatTimerRef.current);
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
      }, 50);
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
        setActiveFormId("");
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

  useEffect(() => {
    if (!activeForm) {
      lastPersistedBuilderFormDetailsRef.current = "";
      lastPersistedBuilderQuestionJsonByIdRef.current = {};
      return;
    }
    lastPersistedBuilderFormDetailsRef.current = serializeBuilderFormDetails(activeForm);
    const persistedQuestions: Record<string, string> = {};
    for (const question of activeForm.questions) {
      persistedQuestions[question.id] = serializeBuilderQuestion(question);
    }
    lastPersistedBuilderQuestionJsonByIdRef.current = persistedQuestions;
  }, [activeForm?.id]);

  useEffect(() => {
    if (!activeFormId || mode !== "teacher" || !isTeacher) {
      return;
    }

    const runBuilderAutosave = async () => {
      const form = latestActiveFormRef.current;
      if (!form || form.id !== activeFormId || builderAutosaveInFlightRef.current) {
        return;
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
        return;
      }

      builderAutosaveInFlightRef.current = true;
      setBuilderAutosaveBanner("Saving…");
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
          await syncListsAfterTeacherChange();
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

        if (builderAutosaveBannerClearRef.current !== undefined) {
          window.clearTimeout(builderAutosaveBannerClearRef.current);
        }
        setBuilderAutosaveBanner("All changes saved");
        builderAutosaveBannerClearRef.current = window.setTimeout(() => {
          builderAutosaveBannerClearRef.current = undefined;
          setBuilderAutosaveBanner((prev) => (prev === "All changes saved" ? "" : prev));
        }, 2600);
      } catch (error) {
        setBuilderAutosaveBanner(
          error instanceof Error ? error.message : "Autosave failed. Changes will retry shortly.",
        );
      } finally {
        builderAutosaveInFlightRef.current = false;
      }
    };

    const id = window.setInterval(() => {
      void runBuilderAutosave();
    }, BUILDER_AUTOSAVE_MS);
    return () => window.clearInterval(id);
  }, [activeFormId, mode, isTeacher]);

  const addQuestion = async (type: QuestionType) => {
    if (!activeForm) {
      return;
    }

    setIsMutating(true);
    setStatusMessage("");
    try {
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
      await syncListsAfterTeacherChange();
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
      setStudentAnswers((currentAnswers) => {
        const nextAnswers = { ...currentAnswers };
        delete nextAnswers[questionId];
        return nextAnswers;
      });
      await syncListsAfterTeacherChange();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to remove question.");
    } finally {
      setIsMutating(false);
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
      setStatusMessage("Enter your name (1–120 characters) before joining the exam.");
      return;
    }

    setIsMutating(true);
    setStatusMessage("");
    try {
      suspendAutosaveRef.current = true;
      const data = await requestJson<JoinApiResponse>(`/api/public/join?code=${encodeURIComponent(code)}`);
      setJoinedSession({
        liveSessionId: data.liveSessionId,
        form: data.form,
        opensAt: data.opensAt,
        closesAt: data.closesAt,
      });
      setJoinCodeInput(code);
      setActiveExamDisplayName(displayName);
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("truepaper_last_exam_display_name", displayName);
        }
      } catch {
        /* ignore */
      }
      setStudentAnswers({});
      setExamSuspended(false);
      setExamFinished(false);
      setStatusMessage("You are in the live session.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not join that session.");
    } finally {
      setIsMutating(false);
    }
  };

  const leaveJoinedSession = () => {
    suspendAutosaveRef.current = true;
    lastPersistedAnswersJsonRef.current = "";
    lastAutosaveSentAtRef.current = 0;
    pendingDirtySinceRef.current = null;
    if (autosaveTimerRef.current !== undefined) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = undefined;
    }
    setAutosaveBanner("");
    setJoinedSession(null);
    setStudentAnswers({});
    setExamSuspended(false);
    setExamFinished(false);
    setActiveExamDisplayName("");
    setLiveTeacherFeedback({});
    setStatusMessage("Left the session.");
  };

  const saveStudentAnswers = async () => {
    if (!joinedSession || !anonymousSessionId || !activeExamDisplayName) {
      return;
    }

    setIsMutating(true);
    setStatusMessage("");
    try {
      await requestJson<{ ok: true }>(
        `/api/public/live-sessions/${joinedSession.liveSessionId}/responses`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: anonymousSessionId,
            displayName: activeExamDisplayName,
            answers: studentAnswers,
          }),
        },
      );
      lastPersistedAnswersJsonRef.current = stableStringifyStudentAnswers(studentAnswers);
      setStatusMessage("Answers saved.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save answers.");
    } finally {
      setIsMutating(false);
    }
  };

  const submitExam = async () => {
    if (!joinedSession || !anonymousSessionId || !activeExamDisplayName) {
      return;
    }

    setIsMutating(true);
    setStatusMessage("");
    try {
      await requestJson<{ ok: true }>(
        `/api/public/live-sessions/${joinedSession.liveSessionId}/responses`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: anonymousSessionId,
            displayName: activeExamDisplayName,
            answers: studentAnswers,
          }),
        },
      );
      lastPersistedAnswersJsonRef.current = stableStringifyStudentAnswers(studentAnswers);
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
      setExamFinished(true);
      setStatusMessage("Exam submitted. You can still read your answers.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not submit the exam.");
    } finally {
      setIsMutating(false);
    }
  };

  const hasVerifiedExamName = isValidLiveSessionDisplayName(activeExamDisplayName);

  /** Teacher “Student view”: preview the selected form without a join code. Real students join via code + name. */
  const studentExamForm =
    (joinedSession && hasVerifiedExamName ? joinedSession.form : null) ??
    (mode === "student" && isTeacher && activeForm && !joinedSession ? activeForm : null);
  const isStudentExamPreview = Boolean(studentExamForm && !joinedSession);
  const studentExamQuestions = useMemo(() => {
    if (!studentExamForm) {
      return [];
    }
    return [...studentExamForm.questions].sort(
      (left, right) => left.displayOrder - right.displayOrder,
    );
  }, [studentExamForm]);

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-[var(--tp-bg)] py-8 text-[var(--tp-text)] sm:py-10">
        <main className="mx-auto w-full max-w-5xl tp-card p-8">
          <div className="animate-pulse space-y-4" aria-hidden="true">
            <div className="h-9 w-72 max-w-full rounded-md bg-zinc-200" />
            <div className="h-4 max-w-2xl rounded bg-zinc-100" />
            <div className="h-4 max-w-xl rounded bg-zinc-100" />
            <div className="mt-8 h-48 rounded-xl bg-zinc-100" />
          </div>
          <LoadingBar className="mt-6 max-w-md" />
        </main>
      </div>
    );
  }

  const showTeacherTools = mode === "teacher" && isTeacher;
  const teacherBannerMsLeft = teacherLiveBanner
    ? new Date(teacherLiveBanner.closesAt).getTime() - nowTick
    : 0;
  const teacherBannerNoTimeLimit = teacherLiveBanner
    ? isNoTimeLimitSession(teacherLiveBanner.opensAt, teacherLiveBanner.closesAt)
    : false;

  const joinSessionSection = (
    <section id="join-session" className="mb-8 tp-card p-6">
      <p className={ui.sectionTitle}>Student</p>
      <h2 className="mb-3 text-lg font-semibold tracking-tight">Join a live session</h2>
      <p className="mb-3 text-sm text-zinc-600">
        Enter the code your teacher gives you (6 characters, no spaces) and your name as it should
        appear to your teacher. If your teacher shared a join link, the code may already be filled in.
      </p>
      <div className="mb-3 grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center">
        <label className="text-sm font-medium">
          Your name for this session <span className="text-red-600">*</span>
        </label>
        {joinedSession ? (
          <p className="text-base font-semibold text-zinc-900">{activeExamDisplayName}</p>
        ) : (
          <div className="max-w-md">
            <input
              type="text"
              autoComplete="name"
              required
              spellCheck={false}
              maxLength={120}
              value={joinDisplayNameInput}
              onChange={(e) => setJoinDisplayNameInput(e.target.value)}
              className="tp-input"
              placeholder="e.g. Jordan Lee"
              aria-describedby="join-display-name-hint"
            />
            <p id="join-display-name-hint" className="mt-1 text-xs text-zinc-500">
              Required before you can join and begin the exam.
            </p>
          </div>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end">
        <label className="text-sm font-medium">Session code</label>
        <input
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={8}
          value={joinCodeInput}
          onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
          disabled={Boolean(joinedSession)}
          className="w-48 rounded-md border border-zinc-300 px-3 py-2 font-mono tracking-widest"
          placeholder="ABCD12"
        />
        {!joinedSession ? (
          <button
            type="button"
            onClick={() => void joinWithCode(joinCodeInput)}
            disabled={
              isMutating ||
              !isValidJoinCodeFormat(normalizeJoinCode(joinCodeInput)) ||
              !isValidLiveSessionDisplayName(normalizeLiveSessionDisplayName(joinDisplayNameInput))
            }
            className="justify-self-start tp-btn-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            Join
          </button>
        ) : (
          <button
            type="button"
            onClick={leaveJoinedSession}
            className="justify-self-start rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
          >
            {buttonLabel("Leave session")}
          </button>
        )}
      </div>
      {isTeacher && mode === "student" ? (
        <p className="mt-3 text-sm text-zinc-500">
          You can scroll down to preview the form as students see it—no code needed. Use a join code when
          you want to test saving answers in a live session.
        </p>
      ) : null}
    </section>
  );

  return (
    <div className={ui.page}>
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
        {session === null ? (
          <div className="mb-8 space-y-8">
            {joinSessionSection}
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-6">
              <h1 className="text-2xl font-bold text-zinc-900">Truepaper</h1>
              <p className="mt-2 max-w-2xl text-sm text-zinc-600">
                Teachers build forms and run timed live sessions. Students join on this page with a
                code—no account needed. Answers stay on this browser until you clear site data.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/login"
                  className={`tp-btn-primary ${focusRing}`}
                >
                  {buttonLabel("Teacher log in")}
                </Link>
                <Link
                  href="/register"
                  className={`${ui.btnSecondary} ${focusRing}`}
                >
                  {buttonLabel("Teacher register")}
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {isTeacher ? (
                <Link href="/dashboard" className={`text-sm font-medium text-zinc-700 underline ${focusRing}`}>
                  ← Dashboard
                </Link>
              ) : null}
              <h1 className="text-3xl font-bold">Classroom Form Builder</h1>
              <p className="text-zinc-600">
                Teachers sign in to build forms and start live sessions. Students enter the 6-character
                session code and their name—no account required. Answers are tied to this browser (clear
                site data to start over on this device).
              </p>
              <p className="mt-2 text-sm text-zinc-500">
                Signed in as {session.user.email ?? session.user.id}
                {session.profile ? ` · ${session.profile.role}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {session && isTeacher ? (
                <div className={`rounded-lg border border-zinc-300 p-1 ${focusRing}`}>
                  <button
                    type="button"
                    onClick={() => setMode("teacher")}
                    className={`rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-0 ${
                      mode === "teacher" ? "bg-zinc-900 text-white" : "text-zinc-600"
                    }`}
                  >
                    {buttonLabel("Teacher view")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("student")}
                    className={`rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-0 ${
                      mode === "student" ? "bg-zinc-900 text-white" : "text-zinc-600"
                    }`}
                  >
                    {buttonLabel("Student view")}
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => void logout()}
                disabled={isMutating}
                className={`tp-btn-secondary ${focusRing} disabled:opacity-50`}
              >
                {buttonLabel("Log out")}
              </button>
            </div>
          </div>
        )}

        {teacherLiveBanner && showTeacherTools ? (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            <p className="font-semibold">Active session: {teacherLiveBanner.formTitle}</p>
            <p className="mt-1">
              Join code{" "}
              <span className="rounded bg-white px-2 py-0.5 font-mono text-base tracking-widest">
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

        {session && !showTeacherTools ? joinSessionSection : null}

        {isLoadingForms && showTeacherTools ? (
          <LoadingBar className="max-w-xs" label="Loading forms" />
        ) : errorMessage && showTeacherTools ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{errorMessage}</p>
        ) : showTeacherTools && !activeForm ? (
          <div className="py-10 text-center text-sm text-zinc-600">
            <p className="font-medium text-zinc-800">No form open</p>
            <p className="mt-2 max-w-md mx-auto">
              In the{" "}
              <Link href="/dashboard" className={`tp-link ${focusRing}`}>
                form library
              </Link>
              , click <span className="font-medium text-zinc-800">Edit in builder</span> on a form to open it
              here.
            </p>
          </div>
        ) : showTeacherTools && activeForm ? (
          <section className="space-y-8">
            {builderAutosaveBanner ? (
              <p className="tp-alert border border-[var(--tp-border)] bg-[var(--tp-bg)] text-[var(--tp-text-secondary)]">
                {builderAutosaveBanner}
              </p>
            ) : (
              <p className={`${ui.badgeSuccess} w-fit`}>Autosave on</p>
            )}
            <p className={ui.sectionTitle}>Form builder</p>
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

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm">
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
                  <span className="font-medium text-zinc-900">Live teacher feedback</span>
                  <span className="mt-0.5 block text-zinc-600">
                    While students answer text questions, you can type comments on their live view that
                    appear under their text box in real time.
                  </span>
                </span>
              </label>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-zinc-200 pt-6">
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
            {joinedSession && examFinished ? (
              <div
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl border border-emerald-300 bg-white/95 p-6 text-center shadow-lg backdrop-blur-sm"
                role="status"
              >
                <p className="text-lg font-semibold text-emerald-950">Submitted</p>
                <p className="max-w-md text-sm text-emerald-900">
                  Your answers are saved and marked complete. You can still read the form below; editing
                  and saving are turned off.
                </p>
              </div>
            ) : null}
            {joinedSession && examSuspended ? (
              <div
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl border border-amber-300 bg-white/95 p-6 text-center shadow-lg backdrop-blur-sm"
                role="alert"
              >
                <p className="text-lg font-semibold text-amber-950">Paused</p>
                <p className="max-w-md text-sm text-amber-900">
                  This page was hidden during the live session. Only your teacher can allow you to
                  continue. Keep this tab visible once you are allowed back in.
                </p>
              </div>
            ) : null}
            {joinedSession ? (
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  sessionOpen
                    ? "border-zinc-200 bg-zinc-50 text-zinc-800"
                    : "border-amber-200 bg-amber-50 text-amber-950"
                }`}
              >
                <p className="font-medium">
                  {examFinished
                    ? "You have submitted. The timer below is for the class session window."
                    : sessionOpen
                      ? joinedSessionNoTimeLimit
                        ? "This session has no time limit."
                        : `Time remaining in this session: ${formatCountdown(studentMsLeft)}`
                      : nowTick < new Date(joinedSession.opensAt).getTime()
                        ? "This session has not opened yet."
                        : "This session has ended. You can still read your answers; saving may be blocked."}
                </p>
                {activeExamDisplayName ? (
                  <p className="mt-1 text-zinc-600">
                    Answering as <span className="font-semibold text-zinc-900">{activeExamDisplayName}</span>
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
                <p className="font-medium">Student preview (no join code)</p>
                <p className="mt-1 text-sky-900">
                  This is how the form looks to the class. Answers you type here are only on this page
                  until you join a live session with a code—then Save will store them for that session.
                </p>
              </div>
            )}

            <header>
              <h2 className="text-2xl font-bold">{studentExamForm.title || "Untitled Form"}</h2>
              {studentExamForm.description ? (
                <p className="mt-1 text-zinc-600">{studentExamForm.description}</p>
              ) : null}
            </header>

            {studentExamQuestions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-zinc-600">
                This form has no questions yet.
              </p>
            ) : (
              <form className={ui.questionList}>
                {studentExamQuestions.map((question, index) => (
                  <article key={question.id} className={ui.questionCardNested}>
                    <h3 className="mb-3 text-base font-semibold text-[var(--tp-text)]">
                      {index + 1}. {question.prompt || "Untitled question"}
                    </h3>

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
                              checked={studentAnswers[question.id] === option}
                              disabled={
                                (Boolean(joinedSession) && !sessionOpen) ||
                                Boolean(examSuspended) ||
                                Boolean(examFinished)
                              }
                              onChange={(event) => {
                                scheduleTypingHeartbeat();
                                setStudentAnswers((currentAnswers) => ({
                                  ...currentAnswers,
                                  [question.id]: event.target.value,
                                }));
                              }}
                            />
                            <span>{option || `Option ${optionIndex + 1}`}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <StudentExamTextarea
                        id={question.id}
                        rows={4}
                        value={studentAnswers[question.id] ?? ""}
                        disabled={
                          (Boolean(joinedSession) && !sessionOpen) ||
                          Boolean(examSuspended) ||
                          Boolean(examFinished)
                        }
                        protect={Boolean(
                          joinedSession && sessionOpen && !examSuspended && !examFinished,
                        )}
                        onChange={(next) => {
                          scheduleTypingHeartbeat();
                          setStudentAnswers((currentAnswers) => ({
                            ...currentAnswers,
                            [question.id]: next,
                          }));
                        }}
                        placeholder="Type your response..."
                        className="tp-input"
                      />
                    )}
                    {question.type === "text" &&
                    joinedSession &&
                    (liveTeacherFeedback[question.id] ?? "").trim() ? (
                      <div
                        className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950"
                        role="note"
                        aria-live="polite"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
                          Teacher feedback
                        </p>
                        <p className="mt-1 whitespace-pre-wrap">{liveTeacherFeedback[question.id]}</p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </form>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => void saveStudentAnswers()}
                disabled={
                  isMutating ||
                  !anonymousSessionId ||
                  !joinedSession ||
                  !sessionOpen ||
                  isStudentExamPreview ||
                  examSuspended ||
                  examFinished
                }
                className="tp-btn-primary disabled:opacity-50"
              >
                {buttonLabel("Save answers")}
              </button>
              {joinedSession && sessionOpen && !examSuspended && !examFinished ? (
                <button
                  type="button"
                  onClick={() => void submitExam()}
                  disabled={isMutating || !anonymousSessionId || isStudentExamPreview}
                  className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Submit
                </button>
              ) : null}
              {isStudentExamPreview ? (
                <p className="text-sm text-zinc-600">
                  Join a live session with a code above to enable saving.
                </p>
              ) : null}
            </div>
            {autosaveBanner ? (
              <p className="mt-2 text-xs text-zinc-600" aria-live="polite">
                {autosaveBanner}
              </p>
            ) : null}
          </section>
        ) : !showTeacherTools ? (
          <p className="text-zinc-600">
            {isTeacher && mode === "student"
              ? "Create a form in Teacher view to preview it here, or join with your session code."
              : "Join with your code to see the form."}
          </p>
        ) : null}

        {statusMessage ? (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700"
          >
            {statusMessage}
          </div>
        ) : null}
      </main>
    </div>
  );
}
