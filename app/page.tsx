"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LoadingBar } from "@/components/LoadingBar";
import { SessionJoinShare } from "@/components/SessionJoinShare";
import { StudentExamTextarea } from "@/components/StudentExamTextarea";
import { getOrCreateAnonymousSessionId } from "@/lib/anonymous-session";
import type { Form, Question, QuestionType, StudentAnswers } from "@/lib/forms";
import { isValidLiveSessionDisplayName, normalizeLiveSessionDisplayName } from "@/lib/live-session-display-name";
import { parseLiveSessionStudentGet } from "@/lib/live-session-student-get";
import { isValidJoinCodeFormat, normalizeJoinCode } from "@/lib/join-code";
import { isNoTimeLimitSession } from "@/lib/session-window";
import { stableStringifyStudentAnswers } from "@/lib/student-answers-json";

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

function seedFromString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeSeededRandom(seed: number): () => number {
  let state = seed || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleQuestionsDeterministically(questions: Question[], seedKey: string): Question[] {
  const seededRandom = makeSeededRandom(seedFromString(seedKey));
  const result = [...questions];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(seededRandom() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null | undefined>(undefined);
  const [mode, setMode] = useState<"teacher" | "student">("student");
  const [authForms, setAuthForms] = useState<Form[]>([]);
  const [activeFormId, setActiveFormId] = useState("");
  const [documentToGenerate, setDocumentToGenerate] = useState<File | null>(null);
  const [isGeneratingFormFromDocument, setIsGeneratingFormFromDocument] = useState(false);
  const [templateToImport, setTemplateToImport] = useState<File | null>(null);
  const [isImportingTemplate, setIsImportingTemplate] = useState(false);
  const [generateMultipleChoiceCount, setGenerateMultipleChoiceCount] = useState(5);
  const [generateShortAnswerCount, setGenerateShortAnswerCount] = useState(3);
  const [generateLongAnswerCount, setGenerateLongAnswerCount] = useState(2);
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
  const [statusMessage, setStatusMessage] = useState("");
  const [autosaveBanner, setAutosaveBanner] = useState("");
  const typingHeartbeatTimerRef = useRef<number | undefined>(undefined);
  const lastPointerInteractionPingAtRef = useRef(0);
  const loadedExamNamePrefillRef = useRef(false);
  const latestStudentAnswersRef = useRef<StudentAnswers>({});
  const lastPersistedAnswersJsonRef = useRef("");
  const suspendAutosaveRef = useRef(false);
  const autosaveTimerRef = useRef<number | undefined>(undefined);
  const autosaveBannerClearRef = useRef<number | undefined>(undefined);
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [urlAuthNotice, setUrlAuthNotice] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const teacherHomeRedirectDoneRef = useRef(false);
  const joinIntentFromUrlRef = useRef(false);

  const isTeacher = session?.profile?.role === "teacher";

  latestStudentAnswersRef.current = studentAnswers;

  const activeForm = useMemo(
    () => authForms.find((form) => form.id === activeFormId),
    [authForms, activeFormId],
  );

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
          const raw = (await response.json()) as { answers?: unknown; suspended?: boolean; error?: string };
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
        } catch {
          /* ignore */
        }
      })();
    }, 3000);
    return () => window.clearInterval(id);
  }, [joinedSession, anonymousSessionId]);

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

    window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      if (suspendAutosaveRef.current) {
        return;
      }
      const answers = latestStudentAnswersRef.current;
      const nextJson = stableStringifyStudentAnswers(answers);
      if (nextJson === lastPersistedAnswersJsonRef.current) {
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
              answers,
            }),
          });
          const raw = (await res.json()) as { error?: string };
          if (!res.ok) {
            setAutosaveBanner(raw.error ?? "Autosave failed. Use Save answers.");
            return;
          }
          lastPersistedAnswersJsonRef.current = stableStringifyStudentAnswers(answers);
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
    }, 1100);

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
    const liveSessionId = joinedSession.liveSessionId;
    const deviceId = anonymousSessionId;
    const displayName = activeExamDisplayName;

    const reportTabLeave = async () => {
      try {
        const res = await fetch(`/api/public/live-sessions/${liveSessionId}/tab-leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId, displayName }),
        });
        let errBody: { error?: string } = {};
        try {
          errBody = (await res.json()) as { error?: string };
        } catch {
          /* ignore */
        }
        if (!res.ok) {
          setStatusMessage(errBody.error ?? "Could not record tab change.");
          return;
        }
        setExamSuspended(true);
        setStatusMessage(
          "The exam was paused because this page was hidden. Wait for your teacher to let you continue.",
        );
      } catch {
        setStatusMessage("Could not record tab change. Try again or contact your teacher.");
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenTimer = window.setTimeout(() => {
          if (document.visibilityState === "hidden") {
            void reportTabLeave();
          }
          hiddenTimer = undefined;
        }, 200);
      } else if (hiddenTimer !== undefined) {
        window.clearTimeout(hiddenTimer);
        hiddenTimer = undefined;
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (hiddenTimer !== undefined) {
        window.clearTimeout(hiddenTimer);
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

  const saveActiveFormDetails = async () => {
    if (!activeForm) {
      return;
    }

    setIsMutating(true);
    setStatusMessage("");
    try {
      await requestJson<{ ok: true }>(`/api/forms/${activeForm.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: activeForm.title,
          description: activeForm.description,
        }),
      });
      setStatusMessage("Form saved.");
      await syncListsAfterTeacherChange();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save form.");
    } finally {
      setIsMutating(false);
    }
  };

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
      await syncListsAfterTeacherChange();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to add question.");
    } finally {
      setIsMutating(false);
    }
  };

  const createFormFromDocument = async () => {
    if (!documentToGenerate) {
      setStatusMessage("Choose a document first.");
      return;
    }
    setIsGeneratingFormFromDocument(true);
    setStatusMessage("");
    try {
      const payload = new FormData();
      payload.set("document", documentToGenerate);
      payload.set("multipleChoiceCount", String(Math.max(0, Math.min(20, generateMultipleChoiceCount))));
      payload.set("shortAnswerCount", String(Math.max(0, Math.min(20, generateShortAnswerCount))));
      payload.set("longAnswerCount", String(Math.max(0, Math.min(20, generateLongAnswerCount))));
      const data = await requestJson<{ form: Form }>("/api/forms/generate-from-document", {
        method: "POST",
        body: payload,
      });
      setAuthForms((current) => [...current, data.form]);
      setActiveFormId(data.form.id);
      setDocumentToGenerate(null);
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", `/?form=${encodeURIComponent(data.form.id)}`);
      }
      setStatusMessage("Form generated from document.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not generate form from document.");
    } finally {
      setIsGeneratingFormFromDocument(false);
    }
  };

  const downloadExamTemplate = () => {
    const template = {
      title: "Exam title",
      description: "Brief description/instructions",
      questions: [
        {
          prompt: "Multiple choice question prompt",
          type: "multipleChoice",
          options: ["Option A", "Option B", "Option C", "Option D"],
          correctAnswer: "Option A",
          points: 1,
        },
        {
          prompt: "Short answer question prompt (3-4 sentence response)",
          type: "text",
          options: [],
          correctAnswer: null,
          points: 2,
        },
      ],
    };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "truepaper-exam-template.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importExamTemplate = async () => {
    if (!templateToImport) {
      setStatusMessage("Choose a JSON template file first.");
      return;
    }
    setIsImportingTemplate(true);
    setStatusMessage("");
    try {
      const text = await templateToImport.text();
      const parsed = JSON.parse(text) as unknown;
      const data = await requestJson<{ form: Form }>("/api/forms/create-from-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      setAuthForms((current) => [...current, data.form]);
      setActiveFormId(data.form.id);
      setTemplateToImport(null);
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", `/?form=${encodeURIComponent(data.form.id)}`);
      }
      setStatusMessage("Form created from JSON template.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not import JSON template.");
    } finally {
      setIsImportingTemplate(false);
    }
  };

  const saveQuestion = async (question: Question) => {
    setIsMutating(true);
    setStatusMessage("");
    try {
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
      setStatusMessage("Question saved.");
      await syncListsAfterTeacherChange();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save question.");
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
    // Randomize joined exam question order per student/session, but keep it stable for that student.
    if (joinedSession && anonymousSessionId) {
      const seedKey = `${joinedSession.liveSessionId}:${anonymousSessionId}:${activeExamDisplayName}`;
      return shuffleQuestionsDeterministically(studentExamForm.questions, seedKey);
    }
    return studentExamForm.questions;
  }, [studentExamForm, joinedSession, anonymousSessionId, activeExamDisplayName]);

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-zinc-100 py-10 text-zinc-900">
        <main className="mx-auto w-full max-w-5xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
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
    <section id="join-session" className="mb-8 rounded-xl border border-zinc-200 p-4">
      <h2 className="mb-3 text-lg font-semibold">Join a live session</h2>
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
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
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
            className="justify-self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            Join
          </button>
        ) : (
          <button
            type="button"
            onClick={leaveJoinedSession}
            className="justify-self-start rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
          >
            Leave session
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

  const focusRing =
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2";

  return (
    <div className="min-h-screen bg-zinc-100 py-10 text-zinc-900">
      <main className="mx-auto w-full max-w-5xl rounded-2xl bg-white p-8 shadow-sm">
        {urlAuthNotice ? (
          <div
            className="mb-6 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            role="alert"
          >
            <p>{urlAuthNotice}</p>
            <button
              type="button"
              onClick={() => setUrlAuthNotice("")}
              className={`shrink-0 font-medium text-amber-900 underline ${focusRing}`}
            >
              Dismiss
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
                  className={`rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white ${focusRing}`}
                >
                  Teacher log in
                </Link>
                <Link
                  href="/register"
                  className={`rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 ${focusRing}`}
                >
                  Teacher register
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
                    Teacher view
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("student")}
                    className={`rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-0 ${
                      mode === "student" ? "bg-zinc-900 text-white" : "text-zinc-600"
                    }`}
                  >
                    Student view
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => void logout()}
                disabled={isMutating}
                className={`rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 ${focusRing} disabled:opacity-50`}
              >
                Log out
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
                className={`font-medium text-emerald-900 underline ${focusRing}`}
              >
                Class display (projector)
              </Link>
              <button
                type="button"
                className={`font-medium text-emerald-900 underline ${focusRing}`}
                onClick={() => setTeacherLiveBanner(null)}
              >
                Dismiss banner
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
              <Link href="/dashboard" className={`font-medium text-emerald-800 underline ${focusRing}`}>
                form library
              </Link>
              , click <span className="font-medium text-zinc-800">Edit in builder</span> on a form to open it
              here.
            </p>
          </div>
        ) : showTeacherTools && activeForm ? (
          <section className="space-y-8">
            <div className="space-y-3">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Generate from document (AI)
                </p>
                <div className="mb-3 grid gap-2 sm:grid-cols-3">
                  <label className="text-xs font-medium text-zinc-700">
                    Multiple choice
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={generateMultipleChoiceCount}
                      onChange={(event) =>
                        setGenerateMultipleChoiceCount(Math.max(0, Math.min(20, Number(event.target.value) || 0)))
                      }
                      className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs font-medium text-zinc-700">
                    Short answer (3-4 sentences)
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={generateShortAnswerCount}
                      onChange={(event) =>
                        setGenerateShortAnswerCount(Math.max(0, Math.min(20, Number(event.target.value) || 0)))
                      }
                      className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs font-medium text-zinc-700">
                    Long answer (1-2 paragraphs)
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={generateLongAnswerCount}
                      onChange={(event) =>
                        setGenerateLongAnswerCount(Math.max(0, Math.min(20, Number(event.target.value) || 0)))
                      }
                      className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    accept=".txt,.md,.markdown,.csv,.rtf,text/plain,text/markdown,text/csv"
                    onChange={(event) => setDocumentToGenerate(event.target.files?.[0] ?? null)}
                    className="max-w-xs text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void createFormFromDocument()}
                    disabled={!documentToGenerate || isGeneratingFormFromDocument}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isGeneratingFormFromDocument ? "Generating…" : "Generate form"}
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  AI template workflow
                </p>
                <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-zinc-700">
                  <li>Download the AI template file.</li>
                  <li>
                    Upload it to your AI tool and fill in the exam content.
                    <span className="relative ml-2 inline-flex items-center align-middle">
                      <button
                        type="button"
                        aria-label="Show suggested AI prompts"
                        className="group inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-400 bg-white text-xs font-semibold text-zinc-700"
                      >
                        ?
                        <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-[26rem] -translate-x-1/2 rounded-md border border-zinc-200 bg-white p-3 text-left text-xs text-zinc-700 shadow-lg group-hover:block group-focus-visible:block">
                          <p className="font-semibold text-zinc-900">Suggested prompts</p>
                          <p className="mt-2 font-medium text-zinc-800">General fill</p>
                          <p>
                            "Fill this JSON template for a [grade level] [subject] exam on [topic]. Keep
                            the same JSON keys and output valid JSON only."
                          </p>
                          <p className="mt-2 font-medium text-zinc-800">Difficulty + distribution</p>
                          <p>
                            "Set difficulty to [easy/moderate/challenging]. Include a balanced mix across
                            knowledge recall, understanding, and application."
                          </p>
                          <p className="mt-2 font-medium text-zinc-800">Text response expectations</p>
                          <p>
                            "For short answers, prompts should target 3-4 sentence responses. For long
                            answers, prompts should target 1-2 paragraph responses."
                          </p>
                        </span>
                      </button>
                    </span>
                  </li>
                  <li>Save the JSON file and upload it here using Add Populated AI Template.</li>
                </ol>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={downloadExamTemplate}
                    title="Download a template, paste/fill it in any AI platform, then upload the completed JSON with 'Import JSON as form'."
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900"
                  >
                    Download AI template
                  </button>
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={(event) => setTemplateToImport(event.target.files?.[0] ?? null)}
                    className="max-w-xs text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void importExamTemplate()}
                    disabled={!templateToImport || isImportingTemplate}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isImportingTemplate ? "Adding…" : "Add Populated AI Template"}
                  </button>
                </div>
              </div>

              <label className="block text-sm font-medium">
                Form title
                <input
                  type="text"
                  value={activeForm.title}
                  onChange={(event) =>
                    updateActiveForm((form) => ({ ...form, title: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                />
              </label>

              <label className="block text-sm font-medium">
                Form description
                <textarea
                  value={activeForm.description}
                  onChange={(event) =>
                    updateActiveForm((form) => ({ ...form, description: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                  rows={3}
                />
              </label>

              <button
                type="button"
                onClick={saveActiveFormDetails}
                disabled={isMutating}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
              >
                Save form details
              </button>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-zinc-200 pt-6">
              <button
                type="button"
                onClick={() => void addQuestion("multipleChoice")}
                disabled={isMutating}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
              >
                Add multiple choice
              </button>
              <button
                type="button"
                onClick={() => void addQuestion("text")}
                disabled={isMutating}
                className="rounded-md bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-900"
              >
                Add text area
              </button>
            </div>

            <div className="space-y-0 border-t border-zinc-200 pt-8">
              {activeForm.questions.length === 0 ? (
                <p className="py-2 text-sm text-zinc-600">Add questions to this form.</p>
              ) : (
                activeForm.questions.map((question, index) => (
                  <article
                    key={question.id}
                    className="border-b border-zinc-200 py-6 last:border-b-0"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-zinc-500">Question {index + 1}</h3>
                      <button
                        type="button"
                        onClick={() => void removeQuestion(question.id)}
                        disabled={isMutating}
                        className="text-sm font-medium text-red-600"
                      >
                        Remove
                      </button>
                    </div>

                    <label className="block text-sm font-medium">
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
                        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                      />
                    </label>
                    <label className="mt-3 block text-sm font-medium">
                      Points
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
                                    points: Math.max(1, Math.min(1000, Number(event.target.value) || 1)),
                                  }
                                : formQuestion,
                            ),
                          }))
                        }
                        className="mt-1 w-28 rounded-md border border-zinc-300 px-3 py-2"
                      />
                    </label>

                    {question.type === "multipleChoice" ? (
                      <div className="mt-4 space-y-2">
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
                              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
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
                          className="rounded-md bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-900"
                        >
                          Add option
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
                            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
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

                    <button
                      type="button"
                      onClick={() => void saveQuestion(question)}
                      disabled={isMutating}
                      className="mt-4 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
                    >
                      Save question
                    </button>
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
              <form className="space-y-4">
                {studentExamQuestions.map((question, index) => (
                  <article key={question.id} className="rounded-xl border border-zinc-200 p-4">
                    <h3 className="mb-2 font-semibold">
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
                        className="w-full rounded-md border border-zinc-300 px-3 py-2"
                      />
                    )}
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
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Save answers
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
