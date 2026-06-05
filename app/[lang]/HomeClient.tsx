"use client";

import { LocaleLink as Link, useLocaleRouter as useRouter } from "@/lib/i18n/client";
import { useAutoUkrainianHome } from "@/lib/i18n/use-auto-uk-home";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import dynamic from "next/dynamic";

import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { JoinCodeInput } from "@/components/JoinCodeInput";
import { useBodyFocusMode } from "@/lib/use-body-focus-mode";
import { LoadingBar } from "@/components/LoadingBar";
import { LandingHero } from "./LandingHero";

/**
 * Heavy or rarely-rendered widgets are pulled into their own JS chunks so the
 * home page's initial bundle doesn't pay for them. None of these need to
 * render on the first paint:
 *
 *  - `ScoreRing` — only shown on the submitted/graded overlay.
 *  - `SessionJoinShare` — pulls in `react-qr-code`; only used by teachers
 *    once they have a live banner.
 *  - `StudentExamQuestion` — student exam cards (choices, text areas, badges).
 */
const ScoreRing = dynamic(
  () => import("@/components/ScoreMeter").then((m) => m.ScoreRing),
  { ssr: false },
);
const SessionJoinShare = dynamic(
  () => import("@/components/SessionJoinShare").then((m) => m.SessionJoinShare),
  { ssr: false },
);
const StudentExamQuestion = dynamic(
  () => import("@/components/StudentExamQuestion").then((m) => m.StudentExamQuestion),
  { ssr: false },
);
import { LanguageToggle } from "@/components/LanguageToggle";
import { BuilderResponseConfig } from "@/components/response-types/BuilderResponseConfig";
import { SaveTemplateModal } from "@/components/library/SaveTemplateModal";
import {
  createFreshAnonymousSessionId,
  getOrCreateAnonymousSessionId,
  joinUrlRequestsFreshDevice,
  persistAnonymousSessionId,
} from "@/lib/anonymous-session";
import { scoreTier } from "@/lib/exam-grades";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { useScoreCopy } from "@/lib/i18n/score-copy";
import { deferEffect } from "@/lib/defer-effect";
import {
  readFormIdFromUrl,
  readTeacherHomeIntent,
  type TeacherHomeIntent,
} from "@/lib/home-url-intent";
import { mergePendingBuilderForm, peekPendingBuilderForm } from "@/lib/pending-builder-form";
import {
  listAuthorableResponseTypes,
  parseResponseConfig,
  questionSupportsLiveFeedback,
} from "@/lib/response-types/registry";
import { isResponseAnswered } from "@/lib/response-types/answers";
import { postExamTabLeave } from "@/lib/exam-tab-leave";
import { useLatestRef } from "@/lib/use-latest-ref";
import type { Form, Question, QuestionType, StudentAnswers } from "@/lib/forms";
import { isValidLiveSessionDisplayName, normalizeLiveSessionDisplayName } from "@/lib/live-session-display-name";
import { parseLiveSessionStudentGet } from "@/lib/live-session-student-get";
import { isValidJoinCodeFormat, normalizeJoinCode } from "@/lib/join-code";
import { isValidResumeCodeFormat, normalizeResumeCode } from "@/lib/resume-code";
import { isNoTimeLimitSession } from "@/lib/session-window";
import type { StudentExamRemotePatch } from "@/lib/student-exam-remote-patch";
import { mergeStudentAnswersForSave } from "@/lib/collect-student-exam-answers";
import { notifyTeacherWatchAnswerDraft } from "@/lib/notify-teacher-watch-answer-draft";
import { shouldApplyServerAnswersOnLoad } from "@/lib/student-exam-answer-hydration";
import { fetchStudentAlreadySubmitted } from "@/lib/fetch-student-submission-status";
import { fetchStudentExamStatus } from "@/lib/fetch-student-exam-status";
import { fetchStudentLiveTeacherFeedback } from "@/lib/fetch-student-live-feedback";
import { hasLiveTeacherFeedbackContent } from "@/lib/live-teacher-feedback";
import { requestJson, requestJsonWithTimeout } from "@/lib/request-json";
import { stableStringifyStudentAnswers } from "@/lib/student-answers-json";
import { usePollingRefresh } from "@/lib/use-polling-refresh";
import { loadLocalAnswers, mergeAnswersLastWrite } from "@/lib/offline/answer-store";
import { fetchAirAlertState } from "@/lib/offline/air-alert";
import { isAirAlertEnabled } from "@/lib/offline/config";
import type { DeliveryMode } from "@/lib/offline/config";
import { sessionAllowsAnswerSync } from "@/lib/offline/delivery-mode";
import { heartbeatSyncMeta } from "@/lib/offline/heartbeat-meta";
import { cacheExamSession, loadCachedExamSession } from "@/lib/offline/session-cache";
import type { ConnectionSnapshot } from "@/lib/offline/types";
import { useOfflineExamSync } from "@/lib/offline/use-offline-exam-sync";
import { useStudentExamRealtime } from "@/lib/use-student-exam-realtime";
import { useStudentExamStatePoll } from "@/lib/use-student-exam-state-poll";
import { focusRing, ui } from "@/lib/ui";

import type { ClientSessionData } from "@/lib/client-session";

export type { ClientSessionData as SessionData } from "@/lib/client-session";

type SessionData = ClientSessionData;

type JoinApiResponse = {
  liveSessionId: string;
  formId: string;
  opensAt: string;
  closesAt: string;
  deliveryMode?: DeliveryMode;
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
  deliveryMode?: DeliveryMode;
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
  deliveryMode: DeliveryMode;
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
    responseConfig: question.responseConfig,
  });
}

function HomeChrome({
  children,
  guestHeader,
  hideLanguageToggle,
}: {
  children: React.ReactNode;
  /** Guest landing: Sign in + language toggle in one aligned row. */
  guestHeader?: boolean;
  /** Focus surfaces (live exam, join) hide persistent chrome. */
  hideLanguageToggle?: boolean;
}) {
  const t = useTranslations();

  if (hideLanguageToggle) {
    return <>{children}</>;
  }

  if (guestHeader) {
    return (
      <>
        <header className="tp-home-chrome pointer-events-none fixed inset-x-0 top-0 z-50">
          <div className="tp-home-chrome__inner pointer-events-auto">
            <Link href="/login" className={`tp-btn-secondary tp-home-chrome__signin ${focusRing}`}>
              {t("common.signIn")}
            </Link>
            <LanguageToggle />
          </div>
        </header>
        {children}
      </>
    );
  }

  return (
    <>
      <div className="pointer-events-none fixed right-4 top-4 z-50 sm:right-6 sm:top-6">
        <div className="pointer-events-auto flex items-center">
          <LanguageToggle />
        </div>
      </div>
      {children}
    </>
  );
}

type HomeClientProps = {
  /**
   * Session resolved server-side and passed in. `null` for guests. Removing
   * the previous client `/api/auth/session` fetch saves a network round trip
   * on every home-page load.
   */
  initialSession: SessionData | null;
  /** Guest-only: marketing homepage vs dedicated student join page. */
  guestView?: "landing" | "join";
};

export default function HomeClient({
  initialSession,
  guestView = "landing",
}: HomeClientProps) {
  const router = useRouter();
  const t = useTranslations();
  const { formatPointsScore, scoreTierMessage } = useScoreCopy();
  useAutoUkrainianHome();
  const responseTypeLabel = (type: QuestionType): string => {
    switch (type) {
      case "multipleChoice":
        return t("responseTypes.multipleChoice.label");
      case "shortAnswer":
        return t("responseTypes.shortAnswer.label");
      case "extendedWritten":
      case "text":
        return t("responseTypes.extendedWritten.label");
      case "structuredMultiPart":
        return t("responseTypes.structuredMultiPart.label");
      case "annotateSource":
        return t("responseTypes.annotateSource.label");
      case "drawDiagram":
        return t("responseTypes.drawDiagram.label");
      case "photoHandwritten":
        return t("responseTypes.photoHandwritten.label");
      case "trueFalse":
        return t("responseTypes.trueFalse.label");
      case "matching":
        return t("responseTypes.matching.label");
      case "ordering":
        return t("responseTypes.ordering.label");
      case "labelling":
        return t("responseTypes.labelling.label");
      case "mathInput":
        return t("responseTypes.mathInput.label");
      default:
        return t("responseTypes.extendedWritten.label");
    }
  };
  /** False until client has read `window.location` (SSR/hydration safe). */
  const [urlSynced, setUrlSynced] = useState(false);
  const [homePageIntent, setHomePageIntent] = useState<TeacherHomeIntent>("none");
  const [session, setSession] = useState<SessionData | null>(initialSession);
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
  const [airAlertPaused, setAirAlertPaused] = useState(false);
  const [examFinished, setExamFinished] = useState(false);
  const [examGraded, setExamGraded] = useState(false);
  const [pointsEarned, setPointsEarned] = useState<number | null>(null);
  const [pointsPossible, setPointsPossible] = useState<number | null>(null);
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
  const [autosaveSuspended, setAutosaveSuspended] = useState(false);
  const pendingDirtySinceRef = useRef<number | null>(null);
  const autosaveStatusElRef = useRef<HTMLParagraphElement>(null);
  const autosaveBannerClearRef = useRef<number | undefined>(undefined);
  const connSnapshotRef = useRef<ConnectionSnapshot>({
    state: "synced",
    pendingCount: 0,
    lastSyncedAt: null,
    idbAvailable: true,
  });
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
  const [persistedBuilderFormDetails, setPersistedBuilderFormDetails] = useState("");
  const [persistedBuilderQuestionJsonById, setPersistedBuilderQuestionJsonById] = useState<
    Record<string, string>
  >({});
  const builderSaveInFlightRef = useRef(false);
  const builderSavedClearRef = useRef<number | undefined>(undefined);
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [saveTemplateTarget, setSaveTemplateTarget] = useState<
    | { kind: "form"; title: string }
    | { kind: "question"; questionId: string; title: string }
    | null
  >(null);
  /** Join / rejoin in flight — separate from teacher builder and exam save mutations. */
  const [isJoiningSession, setIsJoiningSession] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [urlAuthNotice, setUrlAuthNotice] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const tabLeaveReportedRef = useRef(false);
  const studentResponseLoadKeyRef = useRef<string | null>(null);
  const teacherDashboardRedirectedRef = useRef(false);
  const [studentAnswersHydrated, setStudentAnswersHydrated] = useState(false);
  /** False on guest `/` until we know the URL is not a student join deep link. */
  const [guestLandingReady, setGuestLandingReady] = useState(guestView !== "landing");

  const isTeacher = session?.profile?.role === "teacher";

  useEffect(() => {
    const intent = readTeacherHomeIntent();
    const formId = readFormIdFromUrl();
    const pending = formId ? peekPendingBuilderForm(formId) : null;
    deferEffect(() => {
      if (!initialSession && guestView === "landing" && intent === "join") {
        const suffix = `${window.location.search}${window.location.hash}`;
        router.replace(suffix ? `/join${suffix}` : "/join");
        return;
      }
      if (guestView === "landing") {
        setGuestLandingReady(true);
      }
      setHomePageIntent(intent);
      if (formId) {
        setActiveFormId(formId);
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
    });
  }, [guestView, initialSession, router]);

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
          const syncMeta = heartbeatSyncMeta(connSnapshotRef.current);
          await fetch(`/api/public/live-sessions/${liveSessionId}/heartbeat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deviceId,
              displayName,
              isTyping: true,
              interaction: true,
              ...syncMeta,
            }),
          });
        } catch {
          /* ignore */
        }
      })();
    }, 2000);
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
    if (now - lastPointerInteractionPingAtRef.current < 3000) {
      return;
    }
    lastPointerInteractionPingAtRef.current = now;
    const liveSessionId = joinedSession.liveSessionId;
    const deviceId = anonymousSessionId;
    const displayName = activeExamDisplayName;
    void (async () => {
      try {
        const syncMeta = heartbeatSyncMeta(connSnapshotRef.current);
        await fetch(`/api/public/live-sessions/${liveSessionId}/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId,
            displayName,
            isTyping: false,
            interaction: true,
            ...syncMeta,
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
          desc || t("home.authNotice.linkExpired"),
        );
      } else {
        setUrlAuthNotice(desc || err || t("home.authNotice.generic"));
      }
      window.history.replaceState({}, "", window.location.pathname);
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [t]);

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
          setStatusMessage(t("home.status.sessionCodeLoaded"));
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
  }, [t]);

  // Session is now provided as an SSR prop (`initialSession`). The old client
  // fetch to /api/auth/session was removed to eliminate a round trip on every
  // home-page load. Auth mutations elsewhere (login / logout / OAuth callback)
  // already navigate, which re-renders this page with a fresh server session.

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!urlSynced) {
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
    if (!urlSynced) {
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
            setErrorMessage(error instanceof Error ? error.message : t("home.errors.loadForms"));
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
  }, [session, homePageIntent, joinedSession, urlSynced, t]);

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
   * `/join` stays available for teachers who want to preview the student flow.
   */
  useEffect(() => {
    if (!urlSynced || session === null || guestView === "join") {
      return;
    }
    if (session.profile?.role !== "teacher") {
      return;
    }
    if (homePageIntent !== "none" || joinedSession) {
      return;
    }
    if (teacherDashboardRedirectedRef.current) {
      return;
    }
    if (typeof window !== "undefined") {
      const path = window.location.pathname;
      const onLocalizedHome = path === "/" || /^\/(en|uk)\/?$/.test(path);
      if (!onLocalizedHome) {
        return;
      }
    }
    teacherDashboardRedirectedRef.current = true;
    router.replace("/dashboard");
  }, [session, router, homePageIntent, joinedSession, urlSynced, guestView]);

  /** Non-teachers must not open the form builder via `?form=`. */
  useEffect(() => {
    if (!urlSynced || session === null) {
      return;
    }
    if (session.profile?.role === "teacher") {
      return;
    }
    if (homePageIntent !== "builder") {
      return;
    }
    deferEffect(() => {
      setActiveFormId("");
      setHomePageIntent("none");
      router.replace("/");
    });
  }, [session, homePageIntent, router, urlSynced]);

  useEffect(() => {
    deferEffect(() => {
      setPreviewAnswers({});
    });
  }, [activeFormId]);

  const joinedLiveSessionId = joinedSession?.liveSessionId ?? "";
  const isLiveTeacherFeedbackEnabled =
    liveTeacherFeedbackEnabledLive || joinedSession?.form.liveTeacherFeedbackEnabled === true;
  const deliveryMode = joinedSession?.deliveryMode ?? "live";
  const examWritable =
    sessionAllowsAnswerSync(sessionOpen, deliveryMode) && !airAlertPaused && !examSuspended;

  const getAnswersForSync = useCallback(() => {
    if (!joinedSession) {
      return latestStudentAnswersRef.current;
    }
    const textQuestions = joinedSession.form.questions.filter((q) =>
      questionSupportsLiveFeedback(q.type),
    );
    const merged = mergeStudentAnswersForSave(
      latestStudentAnswersRef.current,
      examFormRef.current,
      textQuestions,
    );
    latestStudentAnswersRef.current = merged;
    return merged;
  }, [joinedSession]);

  const answerSyncEnabled = Boolean(
    joinedSession &&
      anonymousSessionId &&
      activeExamDisplayName &&
      !examSuspended &&
      !examFinished &&
      !airAlertPaused &&
      !autosaveSuspended &&
      sessionAllowsAnswerSync(sessionOpen, deliveryMode),
  );

  const offlineSync = useOfflineExamSync({
    liveSessionId: joinedLiveSessionId || null,
    deviceId: anonymousSessionId || null,
    displayName: activeExamDisplayName,
    enabled: answerSyncEnabled,
    getAnswers: getAnswersForSync,
    onSynced: (json) => {
      lastPersistedAnswersJsonRef.current = json;
      pendingDirtySinceRef.current = null;
      if (autosaveBannerClearRef.current !== undefined) {
        window.clearTimeout(autosaveBannerClearRef.current);
      }
      setAutosaveStatus(t("home.autosave.saved"));
      autosaveBannerClearRef.current = window.setTimeout(() => {
        autosaveBannerClearRef.current = undefined;
        setAutosaveStatus("");
      }, 2600);
    },
    onStatusChange: (snap) => {
      connSnapshotRef.current = snap;
      if (!snap.idbAvailable) {
        setAutosaveStatus(t("offline.idbCleared"));
      }
    },
  });

  const offlineSyncRef = useLatestRef(offlineSync);
  const answerSyncEnabledRef = useLatestRef(answerSyncEnabled);

  useEffect(() => {
    if (!isAirAlertEnabled() || !joinedSession || examFinished) {
      deferEffect(() => setAirAlertPaused(false));
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const state = await fetchAirAlertState(process.env.NEXT_PUBLIC_AIR_ALERT_REGION);
      if (!cancelled) {
        setAirAlertPaused(state.active);
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [joinedSession, examFinished]);

  useEffect(() => {
    if (!joinedLiveSessionId || !anonymousSessionId) {
      return;
    }

    const loadStudentResponse = async () => {
      try {
        const localRecord = await loadLocalAnswers(joinedLiveSessionId, anonymousSessionId);
        const params = new URLSearchParams({ deviceId: anonymousSessionId });
        let parsed = null as ReturnType<typeof parseLiveSessionStudentGet> | null;
        let fetchFailed = false;

        try {
          const response = await fetch(
            `/api/public/live-sessions/${joinedLiveSessionId}/responses?${params.toString()}`,
          );
          const raw = (await response.json()) as unknown;
          if (!response.ok) {
            const err = raw as { error?: string };
            throw new Error(err.error ?? t("home.errors.requestFailed"));
          }
          parsed = parseLiveSessionStudentGet(raw);
        } catch {
          fetchFailed = true;
          if (!localRecord) {
            const cached = await loadCachedExamSession(joinedLiveSessionId, anonymousSessionId);
            if (cached) {
              setJoinedSession((prev) =>
                prev
                  ? {
                      ...prev,
                      form: cached.form,
                      deliveryMode: cached.deliveryMode,
                    }
                  : prev,
              );
            }
          }
        }

        const loadKey = `${joinedLiveSessionId}:${anonymousSessionId}`;
        const isFirstLoadForKey = studentResponseLoadKeyRef.current !== loadKey;
        studentResponseLoadKeyRef.current = loadKey;

        if (parsed && isFirstLoadForKey) {
          if (parsed.finished) {
            setStudentAnswersHydrated(true);
            setStatusMessage(t("home.status.alreadySubmitted"));
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
        }

        const hasLocalEdits = pendingDirtySinceRef.current !== null;
        if (isFirstLoadForKey && shouldApplyServerAnswersOnLoad(isFirstLoadForKey, hasLocalEdits)) {
          const serverAnswers = parsed?.answers ?? {};
          const merged = localRecord
            ? mergeAnswersLastWrite(
                localRecord.answers,
                localRecord.revisions,
                serverAnswers,
                {},
              )
            : serverAnswers;
          latestStudentAnswersRef.current = merged;
          lastPersistedAnswersJsonRef.current = stableStringifyStudentAnswers(merged);
          setExamAnswers(merged);
          pendingDirtySinceRef.current = null;
        } else if (fetchFailed && localRecord && isFirstLoadForKey) {
          latestStudentAnswersRef.current = localRecord.answers;
          setExamAnswers(localRecord.answers);
        }

        if (parsed) {
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
              t("home.status.graded", {
                score: formatPointsScore(parsed.pointsEarned, parsed.pointsPossible),
              }),
            );
          } else if (parsed.finished) {
            setStatusMessage(t("home.status.submitted"));
          } else if (parsed.suspended) {
            setStatusMessage(t("home.status.paused"));
          }
        } else if (fetchFailed && localRecord) {
          setStatusMessage(t("offline.status.offline"));
        }

        setStudentAnswersHydrated(true);
        if (!fetchFailed && answerSyncEnabledRef.current) {
          void offlineSyncRef.current.flushNow();
        }
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : t("home.errors.loadAnswers"));
        setStudentAnswersHydrated(true);
      }
    };

    const timeoutId = setTimeout(() => {
      void loadStudentResponse();
    }, 0);

    return () => clearTimeout(timeoutId);
    // offlineSyncRef / answerSyncEnabledRef intentionally omitted — stable ref indirection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedLiveSessionId, anonymousSessionId, t, clearJoinFormFields, formatPointsScore]);

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
                t("home.status.graded", {
                  score: formatPointsScore(parsed.pointsEarned, parsed.pointsPossible),
                }),
              );
            }
          }
        } catch {
          /* ignore background poll errors */
        }
      })();
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [joinedLiveSessionId, anonymousSessionId, examFinished, examGraded, t, formatPointsScore]);

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
      setStatusMessage(t("home.status.paused"));
    } else if (patch.suspended === false) {
      setExamSuspended((prevSuspended) => {
        if (prevSuspended) {
          setStatusMessage(t("home.status.resumed"));
        }
        return false;
      });
    }
    if (patch.finished === true) {
      setExamFinished(true);
      setStatusMessage(t("home.status.submitted"));
    }
  }, [t]);

  useStudentExamStatePoll({
    liveSessionId: joinedLiveSessionId,
    deviceId: anonymousSessionId,
    enabled:
      Boolean(joinedLiveSessionId && anonymousSessionId && studentAnswersHydrated) && !examFinished,
    onPatch: applyStudentExamRemotePatch,
  });

  useStudentExamRealtime({
    liveSessionId: joinedLiveSessionId,
    deviceId: anonymousSessionId,
    enabled:
      Boolean(joinedLiveSessionId && anonymousSessionId && studentAnswersHydrated) &&
      !examFinished,
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

  const scheduleStudentAutosave = useCallback(() => {
    if (!answerSyncEnabled) {
      return;
    }
    setAutosaveStatus(t("home.autosave.saving"));
    offlineSync.scheduleSync();
  }, [answerSyncEnabled, offlineSync, setAutosaveStatus, t]);

  const patchTextAnswer = useCallback(
    (questionId: string, next: string) => {
      setExamAnswers((prev) => {
        const updated = { ...prev, [questionId]: next };
        latestStudentAnswersRef.current = updated;
        return updated;
      });
      scheduleTypingHeartbeat();
      scheduleStudentAutosave();
    },
    [scheduleTypingHeartbeat, scheduleStudentAutosave],
  );

  const patchChoiceAnswer = useCallback(
    (questionId: string, next: string) => {
      setExamAnswers((prev) => {
        const updated = { ...prev, [questionId]: next };
        latestStudentAnswersRef.current = updated;
        return updated;
      });
      scheduleTypingHeartbeat();
      scheduleStudentAutosave();
    },
    [scheduleTypingHeartbeat, scheduleStudentAutosave],
  );

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
    if (
      !studentAnswersHydrated ||
      !joinedLiveSessionId ||
      !anonymousSessionId ||
      !answerSyncEnabled
    ) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void notifyTeacherWatchAnswerDraft(
        joinedLiveSessionId,
        anonymousSessionId,
        getAnswersForSync(),
      );
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [
    examAnswers,
    studentAnswersHydrated,
    joinedLiveSessionId,
    anonymousSessionId,
    answerSyncEnabled,
    getAnswersForSync,
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
          setStatusMessage(body.error ?? t("home.status.alreadySubmitted"));
          return;
        }
      } catch {
        /* ignore */
      }
    })();
  }, [joinedSession, anonymousSessionId, activeExamDisplayName, t, clearJoinFormFields]);

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
      setStatusMessage(t("home.status.tabHiddenPaused"));
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
  }, [joinedSession, sessionOpen, examSuspended, examFinished, anonymousSessionId, activeExamDisplayName, t]);

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
      setStatusMessage(t("home.status.signedOut"));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t("home.status.signOutFailed"));
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
      deferEffect(() => {
        setPersistedBuilderFormDetails("");
        setPersistedBuilderQuestionJsonById({});
        setBuilderSaveStatus("idle");
        setBuilderSaveError("");
      });
      return;
    }
    const details = serializeBuilderFormDetails(activeForm);
    const persistedQuestions: Record<string, string> = {};
    for (const question of activeForm.questions) {
      persistedQuestions[question.id] = serializeBuilderQuestion(question);
    }
    deferEffect(() => {
      setPersistedBuilderFormDetails(details);
      setPersistedBuilderQuestionJsonById(persistedQuestions);
      setBuilderSaveStatus("idle");
      setBuilderSaveError("");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot only when switching forms
  }, [activeFormId]);

  /** Compute whether the active form has unsaved edits. */
  const builderHasUnsavedChanges = useMemo(() => {
    if (!activeForm) {
      return false;
    }
    if (serializeBuilderFormDetails(activeForm) !== persistedBuilderFormDetails) {
      return true;
    }
    for (const question of activeForm.questions) {
      const json = serializeBuilderQuestion(question);
      if (json !== persistedBuilderQuestionJsonById[question.id]) {
        return true;
      }
    }
    return false;
  }, [activeForm, persistedBuilderFormDetails, persistedBuilderQuestionJsonById]);

  /** Reset "Saved" pill back to idle as soon as the teacher makes a new edit. */
  useEffect(() => {
    if (builderSaveStatus === "saved" && builderHasUnsavedChanges) {
      deferEffect(() => {
        setBuilderSaveStatus("idle");
      });
    }
  }, [builderHasUnsavedChanges, builderSaveStatus]);

  const saveBuilderForm = useCallback(async (): Promise<boolean> => {
    const form = latestActiveFormRef.current;
    if (!form || form.id !== activeFormId || builderSaveInFlightRef.current) {
      return false;
    }

    const detailsJson = serializeBuilderFormDetails(form);
    const formDetailsDirty = detailsJson !== persistedBuilderFormDetails;
    const dirtyQuestions: Question[] = [];
    for (const question of form.questions) {
      const questionJson = serializeBuilderQuestion(question);
      if (questionJson !== persistedBuilderQuestionJsonById[question.id]) {
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
        setPersistedBuilderFormDetails(detailsJson);
      }

      const nextPersistedQuestions = { ...persistedBuilderQuestionJsonById };
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
            responseConfig: question.responseConfig,
          }),
        });
        nextPersistedQuestions[question.id] = serializeBuilderQuestion(question);
      }
      if (dirtyQuestions.length > 0) {
        setPersistedBuilderQuestionJsonById(nextPersistedQuestions);
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
        error instanceof Error ? error.message : t("home.errors.saveForm"),
      );
      return false;
    } finally {
      builderSaveInFlightRef.current = false;
    }
  }, [
    activeFormId,
    latestActiveFormRef,
    persistedBuilderFormDetails,
    persistedBuilderQuestionJsonById,
    t,
  ]);

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
      setPersistedBuilderQuestionJsonById((prev) => ({
        ...prev,
        [data.question.id]: serializeBuilderQuestion(data.question),
      }));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t("home.errors.addQuestion"));
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
      setPersistedBuilderQuestionJsonById((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
      const nextAnswers = { ...latestStudentAnswersRef.current };
      delete nextAnswers[questionId];
      latestStudentAnswersRef.current = nextAnswers;
      setExamAnswers(nextAnswers);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t("home.errors.removeQuestion"));
    } finally {
      setIsMutating(false);
    }
  };

  const rejoinWithResumeCode = async (rawCode: string) => {
    const code = normalizeResumeCode(rawCode);
    if (!isValidResumeCodeFormat(code)) {
      setStatusMessage(t("home.validation.rejoinCode"));
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
        deliveryMode: data.deliveryMode ?? "live",
      });
      setLiveTeacherFeedbackEnabledLive(data.form.liveTeacherFeedbackEnabled);
      void cacheExamSession({
        liveSessionId: data.liveSessionId,
        deviceId: data.deviceId,
        joinCode: data.joinCode,
        displayName: isValidLiveSessionDisplayName(displayName) ? displayName : data.displayName,
        form: data.form,
        deliveryMode: data.deliveryMode ?? "live",
      });
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
      setStatusMessage(error instanceof Error ? error.message : t("home.errors.rejoinExam"));
    } finally {
      setIsJoiningSession(false);
    }
  };

  const joinWithCode = async (rawCode: string) => {
    const code = normalizeJoinCode(rawCode);
    if (!isValidJoinCodeFormat(code)) {
      setStatusMessage(t("home.validation.joinCode"));
      return;
    }

    const displayName = normalizeLiveSessionDisplayName(joinDisplayNameInput);
    if (!isValidLiveSessionDisplayName(displayName)) {
      setStatusMessage(t("home.validation.displayName"));
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
        throw new Error(t("home.status.alreadySubmitted"));
      }
      setJoinedSession({
        liveSessionId: data.liveSessionId,
        form: data.form,
        opensAt: data.opensAt,
        closesAt: data.closesAt,
        deliveryMode: data.deliveryMode ?? "live",
      });
      setLiveTeacherFeedbackEnabledLive(data.form.liveTeacherFeedbackEnabled);
      if (deviceIdForJoin) {
        void cacheExamSession({
          liveSessionId: data.liveSessionId,
          deviceId: deviceIdForJoin,
          joinCode: code,
          displayName,
          form: data.form,
          deliveryMode: data.deliveryMode ?? "live",
        });
      }
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
      setStatusMessage(t("home.status.inLiveSession"));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t("home.errors.joinSession"));
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
    setStatusMessage(t("home.status.leftSession"));
  };

  const submitExam = async () => {
    if (!joinedSession || !anonymousSessionId || !activeExamDisplayName) {
      return;
    }

    setIsMutating(true);
    setStatusMessage("");
    // Suspend autosave so a background drain can't race the explicit submit below.
    setAutosaveSuspended(true);
    const textQuestions = joinedSession.form.questions.filter((q) => questionSupportsLiveFeedback(q.type));
    const answers = mergeStudentAnswersForSave(
      latestStudentAnswersRef.current,
      examFormRef.current,
      textQuestions,
    );
    latestStudentAnswersRef.current = answers;
    try {
      setAutosaveStatus(t("home.autosave.saving"));
      // Authoritative save + finish. We intentionally do NOT await offlineSync.flushNow()
      // here: it can block on an in-flight background drain (a timeout-less fetch), which
      // would freeze the button on "Submitting…" forever. A bounded request guarantees we
      // always either finish or surface an error.
      await requestJsonWithTimeout<{ ok: true }>(
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
      await requestJsonWithTimeout<{ ok: true }>(
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
      // Best-effort: clear any queued autosave items now that the server copy is final.
      await offlineSync.acknowledgeSynced().catch(() => {});
      if (autosaveBannerClearRef.current !== undefined) {
        window.clearTimeout(autosaveBannerClearRef.current);
        autosaveBannerClearRef.current = undefined;
      }
      setAutosaveStatus("");
      setExamFinished(true);
      setStatusMessage(t("home.status.submitted"));
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      setAutosaveStatus(t("home.autosave.failed"));
      setStatusMessage(
        aborted
          ? t("home.errors.submitTimeout")
          : error instanceof Error
            ? error.message
            : t("home.errors.submitExam"),
      );
    } finally {
      setAutosaveSuspended(false);
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
      return isResponseAnswered(question.type, effectiveExamAnswers[question.id]);
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

  const isJoinRoute = guestView === "join";
  const inStudentExam =
    Boolean(joinedSession) && !examFinished && !isBuilderStudentPreview;
  useBodyFocusMode(inStudentExam || isJoinRoute);

  const teacherPendingDashboardRedirect =
    urlSynced &&
    !isJoinRoute &&
    session?.profile?.role === "teacher" &&
    homePageIntent === "none" &&
    !joinedSession;

  const showGuestHeader = guestView === "landing" && !session;

  if (!urlSynced || teacherPendingDashboardRedirect) {
    return (
      <HomeChrome guestHeader={showGuestHeader}>
        <div className="min-h-screen bg-[var(--tp-bg)] py-8 text-[var(--tp-text)] sm:py-10">
          <main className="mx-auto w-full max-w-5xl tp-card p-8">
            <div className="animate-pulse space-y-4" aria-hidden="true">
              <div className="h-9 w-72 max-w-full rounded-md bg-[var(--tp-border)]" />
              <div className="h-4 max-w-2xl rounded bg-[var(--tp-bg-subtle)]" />
              <div className="h-4 max-w-xl rounded bg-[var(--tp-bg-subtle)]" />
              <div className="mt-8 h-48 rounded-xl bg-[var(--tp-bg-subtle)]" />
            </div>
            <LoadingBar className="mt-6 max-w-md" label={t("loading.default")} />
          </main>
        </div>
      </HomeChrome>
    );
  }

  const showTeacherTools = mode === "teacher" && isTeacher;
  /** Join UI for logged-in users only; guests render it once in the landing block below. */
  const showJoinSection =
    !isJoinRoute &&
    Boolean(session) &&
    !joinedSession &&
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
          <p className={ui.sectionTitle}>{t("home.join.eyebrow")}</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">{t("home.join.title")}</h2>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          {session && !isTeacher ? (
            <button
              type="button"
              onClick={() => void logout()}
              disabled={isMutating}
              className={`${ui.btnGhost} ${focusRing} disabled:opacity-50`}
              aria-label={t("common.logOut")}
              title={t("common.logOut")}
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
            <p className={ui.sectionTitle}>{t("home.join.yourName")}</p>
            <p className="mt-1 text-base font-semibold text-[var(--tp-text)]">
              {activeExamDisplayName}
            </p>
          </div>
        ) : (
          <label className="block">
            <span className="block text-sm font-semibold text-[var(--tp-text)]">
              {t("home.join.yourName")}
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
              placeholder={t("home.join.namePlaceholder")}
            />
          </label>
        )}

        <div>
          <span className="block text-sm font-semibold text-[var(--tp-text)]">
            {t("home.join.sessionCode")}
          </span>
          <p className="mt-0.5 text-xs text-[var(--tp-text-muted)]">
            {t("home.join.sessionCodeHint")}
          </p>
          <div className="mt-3">
            <JoinCodeInput
              value={joinCodeInput}
              onChange={setJoinCodeInput}
              disabled={Boolean(joinedSession)}
              aria-label={t("home.join.sessionCodeAria")}
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
              {isJoiningSession ? t("common.starting") : t("home.join.startTask")}
            </button>
          ) : (
            <button
              type="button"
              onClick={leaveJoinedSession}
              className={ui.btnSecondary}
            >
              {t("home.join.leaveSession")}
            </button>
          )}
        </div>
      </div>

      {!joinedSession ? (
        <details className="mt-6 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] px-4 py-3 text-sm">
          <summary className="cursor-pointer select-none text-sm font-semibold text-[var(--tp-text)]">
            {t("home.join.rejoinSummary")}
          </summary>
          <p className="mt-2 text-sm text-[var(--tp-text-secondary)]">
            {t("home.join.rejoinHint")}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block text-sm font-medium">
              <span className="sr-only">{t("home.join.rejoinCodeSrOnly")}</span>
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
                placeholder={t("home.join.rejoinPlaceholder")}
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
              {isJoiningSession ? t("common.rejoining") : t("home.join.rejoin")}
            </button>
          </div>
        </details>
      ) : null}
    </section>
  );

  const isGuestMarketing = !session && guestView === "landing" && guestLandingReady;
  const mainClassName = isGuestMarketing
    ? "tp-guest-landing-main"
    : `${ui.pageMain} tp-card p-6 sm:p-8`;

  return (
    <HomeChrome
      guestHeader={isGuestMarketing}
      hideLanguageToggle={inStudentExam || isJoinRoute}
    >
      <div className={ui.page}>
        <main className={mainClassName}>
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
              {t("common.dismiss")}
            </button>
          </div>
        ) : null}
        {isGuestMarketing ? (
          <LandingHero teacherCtaHref="/register" joinHref="/join" />
        ) : null}
        {isJoinRoute ? (
          <div className="tp-guest-join mx-auto max-w-lg">
            <div className="mb-6 flex items-center justify-between gap-3">
              <Link
                href={session && isTeacher ? "/dashboard" : "/"}
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
                {session && isTeacher ? t("home.teacher.dashboardLink") : "TruePaper"}
              </Link>
              <LanguageToggle />
            </div>
            {joinSessionSection}
          </div>
        ) : null}
        {session && isTeacher && !isJoinRoute ? (
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
                {t("home.teacher.dashboardLink")}
              </Link>
              <h1 className="mt-2 text-2xl font-bold tracking-tight">
                {isBuilderStudentPreview ? t("home.teacher.previewTitle") : t("home.teacher.builderTitle")}
              </h1>
              <p className="mt-1 text-sm text-[var(--tp-text-secondary)]">
                {isBuilderStudentPreview
                  ? t("home.teacher.previewSubtitle")
                  : t("home.teacher.builderSubtitle")}
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
                    {t("home.teacher.modeTeacher")}
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
                    {t("home.teacher.modeStudent")}
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => void logout()}
                disabled={isMutating}
                className={`${ui.btnGhost} ${focusRing} disabled:opacity-50`}
                aria-label={t("common.logOut")}
                title={t("common.logOut")}
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
              {t("home.teacher.liveBanner", { formTitle: teacherLiveBanner.formTitle })}
            </p>
            <p className="mt-1">
              <span className="rounded bg-[var(--tp-surface)]/80 px-2 py-0.5 font-mono text-base tracking-widest">
                {teacherLiveBanner.joinCode}
              </span>{" "}
              ·{" "}
              {teacherBannerNoTimeLimit
                ? t("common.noTimeLimit")
                : t("home.teacher.timeLeft", {
                    timeLeft: formatCountdown(teacherBannerMsLeft),
                  })}
            </p>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              <Link
                href={`/live/${encodeURIComponent(teacherLiveBanner.joinCode)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`tp-link ${focusRing}`}
              >
                {t("home.teacher.classDisplay")}
              </Link>
              <button
                type="button"
                className={`tp-link ${focusRing}`}
                onClick={() => setTeacherLiveBanner(null)}
              >
                {t("home.teacher.dismissBanner")}
              </button>
            </p>
            <div className="mt-3">
              <SessionJoinShare joinCode={teacherLiveBanner.joinCode} />
            </div>
          </div>
        ) : null}

        {showJoinSection ? joinSessionSection : null}

        {isLoadingForms && showTeacherTools ? (
          <LoadingBar className="max-w-xs" label={t("loading.forms")} />
        ) : errorMessage && showTeacherTools ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{errorMessage}</p>
        ) : showTeacherTools && !activeForm ? (
          <div className="py-10 text-center text-sm text-[var(--tp-text-secondary)]">
            <p className="font-medium text-[var(--tp-text)]">{t("home.teacher.noFormOpen")}</p>
            <p className="mt-2 max-w-md mx-auto">
              {t("home.teacher.noFormOpenHintPrefix")}{" "}
              <Link href="/dashboard" className={`tp-link ${focusRing}`}>
                {t("home.teacher.formLibraryLink")}
              </Link>
              , {t("home.teacher.noFormOpenHintSuffix")}{" "}
              <span className="font-medium text-[var(--tp-text)]">{t("home.teacher.editInBuilder")}</span>{" "}
              {t("home.teacher.noFormOpenHintEnd")}
            </p>
          </div>
        ) : showTeacherTools && activeForm ? (
          <section className="space-y-8">
            <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-surface)]/95 px-4 py-2.5 text-sm shadow-sm backdrop-blur-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className={ui.sectionTitle}>{t("home.builder.eyebrow")}</p>
                {builderSaveStatus === "saving" ? (
                  <span
                    className="tp-save-indicator"
                    data-state="saving"
                    role="status"
                    aria-live="polite"
                  >
                    <span aria-hidden className="tp-save-dot" />
                    <span>{t("home.builder.saving")}</span>
                  </span>
                ) : builderSaveStatus === "saved" && !builderHasUnsavedChanges ? (
                  <span
                    className="tp-save-indicator"
                    data-state="saved"
                    role="status"
                    aria-live="polite"
                  >
                    <span aria-hidden className="tp-save-dot" />
                    <span>{t("home.builder.saved")}</span>
                  </span>
                ) : builderSaveStatus === "error" ? (
                  <span
                    className="tp-save-indicator"
                    data-state="error"
                    role="alert"
                  >
                    <span aria-hidden className="tp-save-dot" />
                    <span>{builderSaveError || t("home.builder.saveFailed")}</span>
                  </span>
                ) : builderHasUnsavedChanges ? (
                  <span className="tp-save-indicator" data-state="saving">
                    <span aria-hidden className="tp-save-dot" />
                    <span>{t("home.builder.unsavedChanges")}</span>
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
                  ? t("home.builder.saving")
                  : t("home.builder.saveForm")}
              </button>
              {activeForm ? (
                <button
                  type="button"
                  onClick={() =>
                    setSaveTemplateTarget({
                      kind: "form",
                      title: activeForm.title || t("common.untitledForm"),
                    })
                  }
                  className={ui.btnSecondary}
                >
                  {t("templateLibrary.save.action")}
                </button>
              ) : null}
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-medium">
                {t("home.builder.formTitle")}
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
                {t("home.builder.formDescription")}
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
                  <span className="font-medium text-[var(--tp-text)]">{t("home.builder.liveFeedbackLabel")}</span>
                  <span className="mt-0.5 block text-[var(--tp-text-secondary)]">
                    {t("home.builder.liveFeedbackDesc")}
                  </span>
                </span>
              </label>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-[var(--tp-border)] pt-6">
              {listAuthorableResponseTypes().map((typeMeta) => (
                <button
                  key={typeMeta.id}
                  type="button"
                  onClick={() => void addQuestion(typeMeta.id)}
                  disabled={isMutating}
                  className={typeMeta.id === "extendedWritten" ? "tp-btn-primary" : ui.btnSecondary}
                >
                  {responseTypeLabel(typeMeta.id)}
                </button>
              ))}
            </div>

            <div className={`${ui.questionList} border-t border-[var(--tp-border)] pt-8`}>
              {activeForm.questions.length === 0 ? (
                <p className={ui.empty}>{t("home.builder.emptyQuestions")}</p>
              ) : (
                activeForm.questions.map((question, index) => (
                  <article key={question.id} className={ui.questionCardNested}>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--tp-border)] pb-4">
                      <h3 className="text-sm font-semibold text-[var(--tp-text-secondary)]">
                        {t("home.builder.questionN", { n: index + 1 })}
                      </h3>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setSaveTemplateTarget({
                              kind: "question",
                              questionId: question.id,
                              title: question.prompt || t("common.untitledQuestion"),
                            })
                          }
                          className="text-sm font-medium text-[var(--tp-accent)]"
                        >
                          {t("templateLibrary.save.action")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeQuestion(question.id)}
                          disabled={isMutating}
                          className="text-sm font-medium text-red-600"
                        >
                          {t("home.builder.remove")}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                      <aside
                        className={`${ui.questionScoring} order-first w-full shrink-0 sm:max-w-[11rem] lg:order-2 lg:w-40`}
                      >
                        <p className={ui.sectionTitle}>{t("home.builder.scoring")}</p>
                        <label className={`${ui.label} mt-2 block`}>
                          {t("home.builder.points")}
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
                              aria-label={t("home.builder.pointsAria", { n: index + 1 })}
                            />
                            <span className="text-sm font-medium text-[var(--tp-text-muted)]">{t("home.builder.pts")}</span>
                          </div>
                        </label>
                      </aside>

                      <div className="min-w-0 flex-1 space-y-4 lg:order-1">
                        <label className={ui.label}>
                          {t("home.builder.prompt")}
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
                            {t("home.builder.optionN", { n: optionIndex + 1 })}
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
                                    t("home.builder.optionN", {
                                      n: formQuestion.options.length + 1,
                                    }),
                                  ],
                                };
                              }),
                            }))
                          }
                          className={ui.btnPrimary}
                        >
                          {t("home.builder.addOption")}
                        </button>
                        <label className="block text-sm font-medium">
                          {t("home.builder.correctAnswer")}
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
                            <option value="">{t("home.builder.noCorrectSelected")}</option>
                            {question.options.map((option, optionIndex) => (
                              <option key={`${question.id}-correct-${optionIndex}`} value={option}>
                                {option || t("home.builder.optionN", { n: optionIndex + 1 })}
                              </option>
                            ))}
                          </select>
                        </label>
                          </div>
                        ) : null}
                        {(question.type === "extendedWritten" || question.type === "text" || question.type === "shortAnswer") ? (
                          <div className="space-y-2 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] p-3">
                            <p className={ui.sectionTitle}>{t("responseTypes.builder.answerSettings")}</p>
                            {question.type !== "shortAnswer" ? (
                              <div className="grid gap-2 sm:grid-cols-2">
                                <label className="text-sm">
                                  {t("responseTypes.builder.minWords")}
                                  <input
                                    type="number"
                                    min={0}
                                    value={Number((question.responseConfig as { minWords?: number }).minWords ?? 0)}
                                    onChange={(event) =>
                                      updateActiveForm((form) => ({
                                        ...form,
                                        questions: form.questions.map((formQuestion) =>
                                          formQuestion.id === question.id
                                            ? {
                                                ...formQuestion,
                                                responseConfig: {
                                                  ...parseResponseConfig(formQuestion.type, formQuestion.responseConfig),
                                                  minWords: Math.max(0, Number(event.target.value) || 0),
                                                },
                                              }
                                            : formQuestion,
                                        ),
                                      }))
                                    }
                                    className="tp-input"
                                  />
                                </label>
                                <label className="text-sm">
                                  {t("responseTypes.builder.targetWords")}
                                  <input
                                    type="number"
                                    min={0}
                                    value={Number((question.responseConfig as { targetWords?: number }).targetWords ?? 0)}
                                    onChange={(event) =>
                                      updateActiveForm((form) => ({
                                        ...form,
                                        questions: form.questions.map((formQuestion) =>
                                          formQuestion.id === question.id
                                            ? {
                                                ...formQuestion,
                                                responseConfig: {
                                                  ...parseResponseConfig(formQuestion.type, formQuestion.responseConfig),
                                                  targetWords: Math.max(0, Number(event.target.value) || 0),
                                                },
                                              }
                                            : formQuestion,
                                        ),
                                      }))
                                    }
                                    className="tp-input"
                                  />
                                </label>
                              </div>
                            ) : (
                              <label className="text-sm">
                                {t("responseTypes.builder.acceptedAnswers")}
                                <input
                                  type="text"
                                  value={((question.responseConfig as { acceptedAnswers?: string[] }).acceptedAnswers ?? []).join(", ")}
                                  onChange={(event) =>
                                    updateActiveForm((form) => ({
                                      ...form,
                                      questions: form.questions.map((formQuestion) =>
                                        formQuestion.id === question.id
                                          ? {
                                              ...formQuestion,
                                              responseConfig: {
                                                ...parseResponseConfig(formQuestion.type, formQuestion.responseConfig),
                                                acceptedAnswers: event.target.value
                                                  .split(",")
                                                  .map((v) => v.trim())
                                                  .filter(Boolean),
                                              },
                                            }
                                          : formQuestion,
                                      ),
                                    }))
                                  }
                                  className="tp-input"
                                  placeholder={t("responseTypes.builder.acceptedAnswersPlaceholder")}
                                />
                              </label>
                            )}
                          </div>
                        ) : null}
                        {question.type === "structuredMultiPart" ? (
                          <div className="space-y-2 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] p-3">
                            <p className={ui.sectionTitle}>{t("responseTypes.builder.parts")}</p>
                            {(question.responseConfig as { parts?: Array<{ id: string; label: string; prompt?: string }> }).parts?.map((part, partIndex) => (
                              <div key={`${question.id}-part-${part.id}`} className="grid gap-2 sm:grid-cols-2">
                                <input
                                  type="text"
                                  value={part.label}
                                  onChange={(event) =>
                                    updateActiveForm((form) => ({
                                      ...form,
                                      questions: form.questions.map((formQuestion) =>
                                        formQuestion.id === question.id
                                          ? {
                                              ...formQuestion,
                                              responseConfig: {
                                                ...parseResponseConfig(formQuestion.type, formQuestion.responseConfig),
                                                parts: ((parseResponseConfig(formQuestion.type, formQuestion.responseConfig) as { parts: Array<{ id: string; label: string; prompt?: string }> }).parts ?? []).map((p, i) =>
                                                  i === partIndex ? { ...p, label: event.target.value } : p,
                                                ),
                                              },
                                            }
                                          : formQuestion,
                                      ),
                                    }))
                                  }
                                  className="tp-input"
                                />
                                <input
                                  type="text"
                                  value={part.prompt ?? ""}
                                  onChange={(event) =>
                                    updateActiveForm((form) => ({
                                      ...form,
                                      questions: form.questions.map((formQuestion) =>
                                        formQuestion.id === question.id
                                          ? {
                                              ...formQuestion,
                                              responseConfig: {
                                                ...parseResponseConfig(formQuestion.type, formQuestion.responseConfig),
                                                parts: ((parseResponseConfig(formQuestion.type, formQuestion.responseConfig) as { parts: Array<{ id: string; label: string; prompt?: string }> }).parts ?? []).map((p, i) =>
                                                  i === partIndex ? { ...p, prompt: event.target.value } : p,
                                                ),
                                              },
                                            }
                                          : formQuestion,
                                      ),
                                    }))
                                  }
                                  className="tp-input"
                                  placeholder={t("responseTypes.builder.partPrompt")}
                                />
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {question.type === "annotateSource" ? (
                          <label className={ui.label}>
                            {t("responseTypes.builder.sourcePassage")}
                            <textarea
                              rows={5}
                              value={String((question.responseConfig as { passageText?: string }).passageText ?? "")}
                              onChange={(event) =>
                                updateActiveForm((form) => ({
                                  ...form,
                                  questions: form.questions.map((formQuestion) =>
                                    formQuestion.id === question.id
                                      ? {
                                          ...formQuestion,
                                          responseConfig: {
                                            ...parseResponseConfig(formQuestion.type, formQuestion.responseConfig),
                                            passageText: event.target.value,
                                          },
                                        }
                                      : formQuestion,
                                  ),
                                }))
                              }
                              className="tp-input"
                            />
                          </label>
                        ) : null}
                        <BuilderResponseConfig question={question} updateActiveForm={updateActiveForm} />
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
                <p className="font-medium text-[var(--tp-text)]">{t("home.exam.previewTitle")}</p>
                <p className="mt-1 text-[var(--tp-text-secondary)]">
                  {t("home.exam.previewDesc")}
                </p>
              </div>
            ) : null}
            {joinedSession && examFinished ? (
              <div
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 overflow-hidden rounded-[var(--tp-radius)] border border-[var(--tp-success-border)] bg-[var(--tp-surface)]/95 p-6 text-center shadow-lg backdrop-blur-sm tp-anim-fade-in"
                role="status"
                aria-live="polite"
              >
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
                      {t("home.exam.overlay.youEarned", {
                        score: formatPointsScore(pointsEarned, pointsPossible),
                      })}
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
                    <p className="text-lg font-semibold text-[var(--tp-text)]">{t("home.exam.overlay.submitted")}</p>
                    <p className="inline-flex items-center gap-2 text-sm text-[var(--tp-text-secondary)]">
                      <span aria-hidden className="tp-halo-dot" />
                      {t("home.exam.overlay.grading")}
                    </p>
                    <p className="max-w-md text-xs text-[var(--tp-text-muted)]">
                      {t("home.exam.overlay.gradingHint")}
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
                <p className="text-lg font-semibold text-[var(--tp-text)]">{t("home.exam.overlay.paused")}</p>
                <p className="max-w-md text-sm text-[var(--tp-text-secondary)]">
                  {t("home.exam.overlay.pausedHint")}
                </p>
              </div>
            ) : null}
            {isBuilderStudentPreview && examTotalQuestions > 0 ? (
              <div className="tp-exam-strip">
                <span className="font-medium text-[var(--tp-text)]">{t("common.noTimeLimit")}</span>
                <div
                  className="tp-exam-progress"
                  role="progressbar"
                  aria-label={t("home.exam.progressAria")}
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
                  </div>
                </div>
              </div>
            ) : null}
            {joinedSession ? (
              <div
                className={`tp-exam-strip${
                  sessionOpen ? "" : " tp-exam-strip--closed"
                }`}
              >
                <span className="tp-exam-strip__timer">
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
                      <span className="font-mono text-base">
                        {formatCountdown(studentMsLeft)}
                      </span>
                    </>
                  ) : (
                    <span>
                      {examFinished
                        ? t("home.exam.submitted")
                        : sessionOpen
                          ? t("common.noTimeLimit")
                          : nowTick < new Date(joinedSession.opensAt).getTime()
                            ? t("home.exam.sessionNotOpen")
                            : t("home.exam.sessionEnded")}
                    </span>
                  )}
                </span>
                {examTotalQuestions > 0 && !examFinished && sessionOpen ? (
                  <div
                    className="tp-exam-progress"
                    role="progressbar"
                    aria-label={t("home.exam.progressAria")}
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
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <header>
              <h2 className="text-2xl font-bold">{studentExamForm.title || t("common.untitledForm")}</h2>
              {studentExamForm.description ? (
                <p className="mt-1 text-[var(--tp-text-secondary)]">{studentExamForm.description}</p>
              ) : null}
            </header>

            {studentExamQuestions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--tp-border-strong)] p-4 text-[var(--tp-text-secondary)]">
                {t("home.exam.noQuestions")}
              </p>
            ) : (
              <form ref={examFormRef} className={ui.questionList}>
                {studentExamQuestions.map((question, index) => {
                  const answered = isQuestionAnswered(question);
                  const examActive = Boolean(
                    isBuilderStudentPreview ||
                      (joinedSession && examWritable && !examFinished),
                  );
                  const inputsDisabled =
                    !isBuilderStudentPreview &&
                    (examAnswersLoading ||
                      (Boolean(joinedSession) &&
                        !sessionAllowsAnswerSync(sessionOpen, deliveryMode)) ||
                      Boolean(examSuspended) ||
                      Boolean(airAlertPaused) ||
                      Boolean(examFinished));
                  return (
                    <StudentExamQuestion
                      key={question.id}
                      question={question}
                      index={index}
                      answer={effectiveExamAnswers[question.id]}
                      answered={answered}
                      examActive={examActive}
                      disabled={inputsDisabled}
                      protectTextarea={Boolean(
                        !isBuilderStudentPreview &&
                          joinedSession &&
                          studentAnswersHydrated &&
                          examWritable &&
                          !examFinished,
                      )}
                      showLiveFeedbackFeature={showLiveTeacherFeedback}
                      feedbackStore={liveTeacherFeedback}
                      onChoiceChange={(value) => {
                        if (isBuilderStudentPreview) {
                          setPreviewAnswers((prev) => ({
                            ...prev,
                            [question.id]: value,
                          }));
                          return;
                        }
                        scheduleTypingHeartbeat();
                        patchChoiceAnswer(question.id, value);
                      }}
                      onTextChange={(next) => {
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
                    />
                  );
                })}
              </form>
            )}

            {airAlertPaused && joinedSession ? (
              <p className="rounded-lg border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] px-3 py-2 text-sm text-[var(--tp-text-secondary)]">
                {t("offline.airAlertPaused")}
              </p>
            ) : null}

            {!isBuilderStudentPreview ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                {joinedSession ? (
                  <ConnectionIndicator
                    state={offlineSync.snapshot.state}
                    pendingCount={offlineSync.snapshot.pendingCount}
                  />
                ) : null}
                <p
                  ref={autosaveStatusElRef}
                  data-testid="student-autosave-status"
                  aria-live="polite"
                  className="text-xs text-[var(--tp-text-secondary)]"
                >
                  {"\u00a0"}
                </p>
              </div>
              {joinedSession && examWritable && !examFinished ? (
                <button
                  type="button"
                  onClick={() => void submitExam()}
                  disabled={isMutating || !anonymousSessionId}
                  className={`${
                    examAllAnswered
                      ? `tp-submit-ready ${focusRing}`
                      : `${ui.btnPrimary} min-h-11 disabled:opacity-50`
                  }${isMutating ? " tp-submit-ready--busy" : ""}`}
                  aria-busy={isMutating}
                  aria-label={
                    isMutating
                      ? t("common.submitting")
                      : examAllAnswered
                        ? t("home.exam.submitReadyAria")
                        : t("home.exam.submitAria")
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
                  {isMutating
                    ? t("common.submitting")
                    : examAllAnswered
                      ? t("home.exam.submitReady")
                      : t("home.exam.submitExam")}
                </button>
              ) : joinedSession && examFinished ? (
                <span
                  className="tp-submit-ready tp-submit-ready--done inline-flex min-h-11 items-center gap-2 px-5"
                  role="status"
                  data-testid="student-submit-done"
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
                  {t("home.exam.submitted")}
                </span>
              ) : null}
            </div>
            ) : null}
          </section>
        ) : !showTeacherTools &&
          isTeacher &&
          mode === "student" &&
          !activeForm ? (
          <p className="text-[var(--tp-text-secondary)]">
            {t("home.hint.teacherStudentJoin")}
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
      {activeForm && saveTemplateTarget ? (
        <SaveTemplateModal
          open
          onClose={() => setSaveTemplateTarget(null)}
          sourceKind={saveTemplateTarget.kind === "form" ? "form" : "question"}
          formId={saveTemplateTarget.kind === "form" ? activeForm.id : undefined}
          questionId={
            saveTemplateTarget.kind === "question" ? saveTemplateTarget.questionId : undefined
          }
          defaultTitle={saveTemplateTarget.title}
        />
      ) : null}
    </HomeChrome>
  );
}
