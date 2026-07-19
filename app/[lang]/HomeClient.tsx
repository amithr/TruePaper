"use client";

import { LocaleLink as Link, useLocaleRouter as useRouter } from "@/lib/i18n/client";
import { useAutoUkrainianHome } from "@/lib/i18n/use-auto-uk-home";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import dynamic from "next/dynamic";

import { JoinCodeInput } from "@/components/JoinCodeInput";
import { StudentExamHeader } from "@/components/exam/StudentExamHeader";
import { StudentExamHandIn } from "@/components/exam/StudentExamHandIn";
import { useBodyFocusMode } from "@/lib/use-body-focus-mode";
import { BUILDER_TOUR_PENDING_KEY } from "@/lib/onboarding-tour-key";
import { LoadingBar } from "@/components/LoadingBar";
import { LandingHero } from "./LandingHero";

/**
 * Heavy or rarely-rendered widgets are pulled into their own JS chunks so the
 * home page's initial bundle doesn't pay for them. None of these need to
 * render on the first paint:
 *
 *  - `SessionJoinShare` — pulls in `react-qr-code`; only used by teachers
 *    once they have a live banner.
 *  - `StudentExamQuestion` — student exam cards (choices, text areas, badges).
 */
const SessionJoinShare = dynamic(
  () => import("@/components/SessionJoinShare").then((m) => m.SessionJoinShare),
  { ssr: false },
);
const StudentExamQuestion = dynamic(
  () => import("@/components/StudentExamQuestion").then((m) => m.StudentExamQuestion),
  { ssr: false },
);
import { ExamCaptureWatermark } from "@/components/ExamCaptureWatermark";
import { ExamMarkdown } from "@/components/ExamMarkdown";
import { LanguageToggle } from "@/components/LanguageToggle";
import { FormAssetImage } from "@/components/FormAssetImage";
import { FormAssetImageEditor } from "@/components/FormAssetImageEditor";
import { OverflowMenu } from "@/components/OverflowMenu";
import { BuilderTypePicker } from "@/components/builder/BuilderTypePicker";
import { BuilderQuestionFields } from "@/components/builder/BuilderQuestionFields";
import { QuestionTypeBadge } from "@/components/response-types/QuestionTypeBadge";
import {
  buildSummaryTokens,
  countAutogradableQuestions,
  type BuilderPanelKey,
} from "@/lib/builder/summary-tokens";
import { typeBadgeFamily } from "@/lib/response-types/builder-groups";
import { SaveTemplateModal } from "@/components/library/SaveTemplateModal";
import {
  createFreshAnonymousSessionId,
  getOrCreateAnonymousSessionId,
  joinUrlRequestsFreshDevice,
  persistAnonymousSessionId,
} from "@/lib/anonymous-session";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import type { TranslationPath } from "@/lib/i18n/types";
import { useScoreCopy } from "@/lib/i18n/score-copy";
import { deferEffect } from "@/lib/defer-effect";
import {
  readFormIdFromUrl,
  readTeacherHomeIntent,
  type TeacherHomeIntent,
} from "@/lib/home-url-intent";
import { mergePendingBuilderForm, peekPendingBuilderForm } from "@/lib/pending-builder-form";
import { questionSupportsLiveFeedback } from "@/lib/response-types/registry";
import { isResponseAnswered } from "@/lib/response-types/answers";
import { postExamTabLeave, postExamTabLeaveAwait } from "@/lib/exam-tab-leave";
import { formatExamWatermarkLabel } from "@/lib/exam-capture-protection";
import { useExamCaptureProtection } from "@/lib/use-exam-capture-protection";
import { useLatestRef } from "@/lib/use-latest-ref";
import type { Form, Question, QuestionType, StudentAnswers } from "@/lib/forms";
import { isValidLiveSessionDisplayName, normalizeLiveSessionDisplayName } from "@/lib/live-session-display-name";
import { parseLiveSessionStudentGet } from "@/lib/live-session-student-get";
import { isValidJoinCodeFormat, normalizeJoinCode } from "@/lib/join-code";
import {
  formatResumeCodeForDisplay,
  isValidResumeCodeFormat,
  normalizeResumeCode,
} from "@/lib/resume-code";
import { isNoTimeLimitSession } from "@/lib/session-window";
import type { StudentExamRemotePatch } from "@/lib/student-exam-remote-patch";
import { mergeStudentAnswersForSave } from "@/lib/collect-student-exam-answers";
import { notifyTeacherWatchAnswerDraft } from "@/lib/notify-teacher-watch-answer-draft";
import { shouldApplyServerAnswersOnLoad } from "@/lib/student-exam-answer-hydration";
import { fetchStudentAlreadySubmitted } from "@/lib/fetch-student-submission-status";
import { fetchStudentExamStatus } from "@/lib/fetch-student-exam-status";
import { fetchStudentLiveTeacherFeedback } from "@/lib/fetch-student-live-feedback";
import { hasLiveTeacherFeedbackContent } from "@/lib/live-teacher-feedback";
import { requestJson } from "@/lib/request-json";
import { stableStringifyStudentAnswers } from "@/lib/student-answers-json";
import { usePollingRefresh } from "@/lib/use-polling-refresh";
import { loadLocalAnswers, mergeAnswersLastWrite } from "@/lib/offline/answer-store";
import { fetchAirAlertState } from "@/lib/offline/air-alert";
import { isAirAlertEnabled } from "@/lib/offline/config";
import type { DeliveryMode } from "@/lib/offline/config";
import { sessionAllowsAnswerSync } from "@/lib/offline/delivery-mode";
import { heartbeatSyncMeta } from "@/lib/offline/heartbeat-meta";
import { LIVE_PRESENCE_KEEPALIVE_MS } from "@/lib/participant-status";
import { LiveCountdown } from "@/components/LiveCountdown";
import { cacheExamSession, loadCachedExamSession } from "@/lib/offline/session-cache";
import type { ConnectionSnapshot } from "@/lib/offline/types";
import { newSubmissionId } from "@/lib/offline/sync-queue";
import { isRetryableNetworkError } from "@/lib/network-error";
import { submitExamToServer } from "@/lib/offline/finish-transport";
import { clearJoinDraft, loadJoinDraft, saveJoinDraft } from "@/lib/offline/join-cache";
import {
  tabLeaveBlurGraceMs,
  tabLeaveGraceMs,
  tabLeaveSuspensionEnabled,
} from "@/lib/offline/tab-leave-policy";
import { useOfflineExamSync } from "@/lib/offline/use-offline-exam-sync";
import { useOfflineFinishSubmit } from "@/lib/offline/use-offline-finish-submit";
import { useStudentSyncStatus } from "@/lib/use-student-sync-status";
import { useBrowserOnline } from "@/lib/use-browser-online";
import { useClientSessionHydration } from "@/lib/use-client-session-hydration";
import { useStudentExamRealtime } from "@/lib/use-student-exam-realtime";
import { shouldApplyTeacherExamResume } from "@/lib/student-exam-tab-pause";
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
   * Session from SSR when available; static home/join pages pass `null` and
   * hydrate via `/api/auth/session` when a Supabase auth cookie is present.
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

  const goToSubmittedPage = useCallback(() => {
    router.replace("/join/submitted");
  }, [router]);
  const t = useTranslations();
  const { formatPointsScore } = useScoreCopy();
  useAutoUkrainianHome();
  /** False until client has read `window.location` (SSR/hydration safe). */
  const [urlSynced, setUrlSynced] = useState(false);
  const [homePageIntent, setHomePageIntent] = useState<TeacherHomeIntent>("none");
  const { session, setSession, sessionHydrated } = useClientSessionHydration(initialSession);
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
  const [examResumeCode, setExamResumeCode] = useState("");
  const [handInConfirming, setHandInConfirming] = useState(false);
  const [savedTickByQuestionId, setSavedTickByQuestionId] = useState<Record<string, boolean>>(
    {},
  );
  const savedTickTimerRef = useRef<Record<string, number>>({});
  const [examFinished, setExamFinished] = useState(false);
  const [handRaiseQuestionId, setHandRaiseQuestionId] = useState<string | null>(null);
  const [raiseHandBusyQuestionId, setRaiseHandBusyQuestionId] = useState<string | null>(null);
  const [liveTeacherFeedback, setLiveTeacherFeedback] = useState<Record<string, string>>({});
  const [liveTeacherFeedbackEnabledLive, setLiveTeacherFeedbackEnabledLive] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [builderSaveStatus, setBuilderSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [builderSaveError, setBuilderSaveError] = useState("");
  const typingHeartbeatTimerRef = useRef<number | undefined>(undefined);
  const lastPointerInteractionPingAtRef = useRef(0);
  /** Question the student last focused / typed in — sent on interaction heartbeats. */
  const focusQuestionIdRef = useRef<string | null>(null);
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
    pendingFinish: false,
    serverReachable: true,
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
  const [addingQuestionType, setAddingQuestionType] = useState<QuestionType | null>(null);
  const [saveTemplateTarget, setSaveTemplateTarget] = useState<
    | { kind: "form"; title: string }
    | { kind: "question"; questionId: string; title: string }
    | null
  >(null);
  const [builderDetailsOpen, setBuilderDetailsOpen] = useState(true);
  const [builderPickerOpen, setBuilderPickerOpen] = useState(false);
  const [builderInsertAt, setBuilderInsertAt] = useState<number | null>(null);
  const [builderOpenPanel, setBuilderOpenPanel] = useState<{
    questionId: string;
    panel: BuilderPanelKey;
  } | null>(null);
  const [builderOpenMenuId, setBuilderOpenMenuId] = useState<string | null>(null);
  const [builderDragId, setBuilderDragId] = useState<string | null>(null);
  const builderAutosaveTimerRef = useRef<number | undefined>(undefined);
  const builderPromptFocusIdRef = useRef<string | null>(null);
  /** Join / rejoin in flight — separate from teacher builder and exam save mutations. */
  const [isJoiningSession, setIsJoiningSession] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [urlAuthNotice, setUrlAuthNotice] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const tabLeaveReportedRef = useRef(false);
  /** Server recorded tab suspension — required before accepting `suspended: false` (teacher resume). */
  const serverTabPauseConfirmedRef = useRef(false);
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

  // First-login tour (Segment B). Runs once in the builder when handed off from
  // the dashboard segment via a transient sessionStorage flag.
  const builderTourStartedRef = useRef(false);
  useEffect(() => {
    if (builderTourStartedRef.current || mode !== "teacher" || !isTeacher || !activeForm) {
      return;
    }
    let pending = false;
    try {
      pending = window.sessionStorage.getItem(BUILDER_TOUR_PENDING_KEY) === "1";
    } catch {
      pending = false;
    }
    if (!pending) {
      return;
    }
    builderTourStartedRef.current = true;
    try {
      window.sessionStorage.removeItem(BUILDER_TOUR_PENDING_KEY);
    } catch {
      /* ignore */
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      void import("@/lib/onboarding-tour")
        .then(({ startBuilderTour }) => {
          if (!cancelled) {
            startBuilderTour(t, () => {});
          }
        })
        .catch(() => {
          /* tour is non-critical */
        });
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, isTeacher, activeForm, t]);

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
              focusQuestionId: focusQuestionIdRef.current,
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
            focusQuestionId: focusQuestionIdRef.current,
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
    // Visible countdowns now self-tick in <LiveCountdown>, so this top-level tick
    // only drives session open/closed gating — a coarser cadence keeps the large
    // student screen from re-rendering every second while idle/reading.
    const id = window.setInterval(() => setNowTick(Date.now()), 3000);
    return () => window.clearInterval(id);
  }, [joinedSession, teacherLiveBanner]);

  // Idle presence keepalive: a low-frequency heartbeat that updates last_seen_at
  // WITHOUT touching last_activity_at (interaction:false), so the teacher roster
  // can tell a present-but-thinking student from a silently dropped connection.
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
    const sendKeepalive = () => {
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
              interaction: false,
              ...syncMeta,
            }),
          });
        } catch {
          /* offline / transient — next tick retries */
        }
      })();
    };
    const id = window.setInterval(sendKeepalive, LIVE_PRESENCE_KEEPALIVE_MS);
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
      void loadJoinDraft().then((draft) => {
        if (!draft) {
          return;
        }
        setJoinCodeInput((prev) => prev || draft.joinCode);
        setJoinDisplayNameInput((prev) => prev || draft.displayName);
      });
    }, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (joinedSession) {
      return;
    }
    const code = normalizeJoinCode(joinCodeInput);
    const name = normalizeLiveSessionDisplayName(joinDisplayNameInput);
    if (!code && !name) {
      return;
    }
    const id = window.setTimeout(() => void saveJoinDraft(code, name), 500);
    return () => window.clearTimeout(id);
  }, [joinCodeInput, joinDisplayNameInput, joinedSession]);

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

  // Session: static pages pass `null`; `useClientSessionHydration` fetches
  // `/api/auth/session` only when a Supabase auth cookie is present.

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
            if (formId) {
              setActiveFormId(formId);
              setMode("teacher");
            }
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
    if (!urlSynced || !sessionHydrated || session === null || guestView === "join") {
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
  }, [session, router, homePageIntent, joinedSession, urlSynced, sessionHydrated, guestView]);

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
      if (!snap.idbAvailable) {
        setAutosaveStatus(t("offline.idbCleared"));
      }
    },
  });
  const onPendingFinishRestored = useCallback(() => {
    setStatusMessage(t("offline.submitQueued"));
  }, [t]);

  const finishSubmit = useOfflineFinishSubmit({
    liveSessionId: joinedLiveSessionId || null,
    deviceId: anonymousSessionId || null,
    onFinished: () => {
      void offlineSync.acknowledgeSynced().catch(() => {});
      goToSubmittedPage();
    },
    onPendingFinishRestored,
  });
  const connectionSnapshot = useMemo(
    (): ConnectionSnapshot => ({
      ...offlineSync.snapshot,
      pendingFinish: finishSubmit.pendingFinish,
    }),
    [offlineSync.snapshot, finishSubmit.pendingFinish],
  );
  useEffect(() => {
    connSnapshotRef.current = connectionSnapshot;
  }, [connectionSnapshot]);

  const scheduleOfflineAnswerSync = offlineSync.scheduleSync;

  const offlineSyncRef = useLatestRef(offlineSync);
  const answerSyncEnabledRef = useLatestRef(answerSyncEnabled);
  const browserOnline = useBrowserOnline();
  const studentSyncStatus = useStudentSyncStatus({
    pendingResponses: connectionSnapshot.pendingCount,
    pendingFinish: connectionSnapshot.pendingFinish,
    struggling: !connectionSnapshot.serverReachable,
  });
  const lastSyncHeartbeatKeyRef = useRef("");

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
    const syncMeta = heartbeatSyncMeta({
      state: connectionSnapshot.state,
      pendingCount: connectionSnapshot.pendingCount,
    });
    const key = `${browserOnline ? "online" : "offline"}:${syncMeta.syncState}:${syncMeta.pendingSyncCount}`;
    if (lastSyncHeartbeatKeyRef.current === key) {
      return;
    }
    lastSyncHeartbeatKeyRef.current = key;
    void (async () => {
      try {
        await fetch(`/api/public/live-sessions/${joinedSession.liveSessionId}/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: anonymousSessionId,
            displayName: activeExamDisplayName,
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
    browserOnline,
    connectionSnapshot.pendingCount,
    connectionSnapshot.state,
    joinedSession,
    anonymousSessionId,
    activeExamDisplayName,
    sessionOpen,
    examSuspended,
    examFinished,
  ]);

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

        if (parsed?.finished) {
          router.replace("/join/submitted");
          return;
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
          if (parsed.suspended) {
            serverTabPauseConfirmedRef.current = true;
          }
          setExamSuspended(parsed.suspended);
          setExamFinished(parsed.finished);
          if (parsed.resumeCode) {
            setExamResumeCode(formatResumeCodeForDisplay(parsed.resumeCode));
          }
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
          } else if (parsed.suspended) {
            setStatusMessage(t("home.status.paused"));
          }
        } else if (fetchFailed && localRecord) {
          setStatusMessage(t("offline.status.offline"));
        }

        setStudentAnswersHydrated(true);
        if (!fetchFailed && answerSyncEnabledRef.current) {
          const json = stableStringifyStudentAnswers(latestStudentAnswersRef.current);
          if (json !== lastPersistedAnswersJsonRef.current) {
            void offlineSyncRef.current.flushNow();
          }
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
  }, [joinedLiveSessionId, anonymousSessionId, t, clearJoinFormFields, formatPointsScore, router]);

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
      serverTabPauseConfirmedRef.current = true;
      setExamSuspended(true);
      setStatusMessage(t("home.status.paused"));
    } else if (patch.suspended === false) {
      if (!shouldApplyTeacherExamResume(serverTabPauseConfirmedRef.current)) {
        return;
      }
      serverTabPauseConfirmedRef.current = false;
      setExamSuspended((prevSuspended) => {
        if (prevSuspended) {
          setStatusMessage(t("home.status.resumed"));
        }
        return false;
      });
    }
    if (patch.finished === true) {
      goToSubmittedPage();
      return;
    }
    if (patch.handRaiseQuestionId !== undefined || patch.handRaisedAt !== undefined) {
      setHandRaiseQuestionId(
        patch.handRaisedAt && patch.handRaiseQuestionId ? patch.handRaiseQuestionId : null,
      );
    }
  }, [t, goToSubmittedPage]);

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
    const json = stableStringifyStudentAnswers(getAnswersForSync());
    if (json === lastPersistedAnswersJsonRef.current) {
      return;
    }
    setAutosaveStatus(t("home.autosave.saving"));
    scheduleOfflineAnswerSync();
  }, [answerSyncEnabled, getAnswersForSync, setAutosaveStatus, t, scheduleOfflineAnswerSync]);

  const scheduleStudentAutosaveRef = useLatestRef(scheduleStudentAutosave);

  const scheduleQuestionSavedTick = useCallback((questionId: string) => {
    setSavedTickByQuestionId((prev) =>
      prev[questionId] ? { ...prev, [questionId]: false } : prev,
    );
    const existing = savedTickTimerRef.current[questionId];
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }
    savedTickTimerRef.current[questionId] = window.setTimeout(() => {
      delete savedTickTimerRef.current[questionId];
      setSavedTickByQuestionId((prev) => ({ ...prev, [questionId]: true }));
    }, 600);
  }, []);

  const patchTextAnswer = useCallback(
    (questionId: string, next: string) => {
      focusQuestionIdRef.current = questionId;
      setExamAnswers((prev) => {
        const updated = { ...prev, [questionId]: next };
        latestStudentAnswersRef.current = updated;
        return updated;
      });
      scheduleQuestionSavedTick(questionId);
      scheduleTypingHeartbeat();
      scheduleStudentAutosave();
    },
    [scheduleTypingHeartbeat, scheduleStudentAutosave, scheduleQuestionSavedTick],
  );

  const patchChoiceAnswer = useCallback(
    (questionId: string, next: string) => {
      focusQuestionIdRef.current = questionId;
      setExamAnswers((prev) => {
        const updated = { ...prev, [questionId]: next };
        latestStudentAnswersRef.current = updated;
        return updated;
      });
      scheduleQuestionSavedTick(questionId);
      scheduleTypingHeartbeat();
      scheduleStudentAutosave();
    },
    [scheduleTypingHeartbeat, scheduleStudentAutosave, scheduleQuestionSavedTick],
  );

  const toggleRaiseHand = useCallback(
    async (questionId: string) => {
      if (!joinedLiveSessionId || !anonymousSessionId) {
        return;
      }
      const raised = handRaiseQuestionId !== questionId;
      setRaiseHandBusyQuestionId(questionId);
      try {
        const res = await fetch(`/api/public/live-sessions/${joinedLiveSessionId}/raise-hand`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: anonymousSessionId,
            questionId,
            raised,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          throw new Error(data.error ?? t("home.exam.raiseHandError"));
        }
        setHandRaiseQuestionId(raised ? questionId : null);
      } catch (e) {
        setStatusMessage(e instanceof Error ? e.message : t("home.exam.raiseHandError"));
      } finally {
        setRaiseHandBusyQuestionId(null);
      }
    },
    [anonymousSessionId, handRaiseQuestionId, joinedLiveSessionId, t],
  );

  useEffect(() => {
    if (!studentAnswersHydrated || !joinedSession || !sessionOpen || examSuspended || examFinished) {
      return;
    }
    scheduleStudentAutosaveRef.current();
  }, [
    examAnswers,
    studentAnswersHydrated,
    joinedSession,
    sessionOpen,
    examSuspended,
    examFinished,
    scheduleStudentAutosaveRef,
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
      serverTabPauseConfirmedRef.current = false;
    }
  }, [examSuspended]);

  useEffect(() => {
    if (!joinedSession || !anonymousSessionId || !examSuspended || !activeExamDisplayName) {
      return;
    }
    const liveSessionId = joinedSession.liveSessionId;
    const deviceId = anonymousSessionId;
    const displayName = activeExamDisplayName;
    const tabLeaveUrl = `/api/public/live-sessions/${liveSessionId}/tab-leave`;

    const syncTabPauseWithServer = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void (async () => {
        const status = await fetchStudentExamStatus(liveSessionId, deviceId);
        if (!status) {
          return;
        }
        if (status.suspended) {
          serverTabPauseConfirmedRef.current = true;
          return;
        }
        if (!serverTabPauseConfirmedRef.current) {
          const ok = await postExamTabLeaveAwait(tabLeaveUrl, { deviceId, displayName });
          if (ok) {
            serverTabPauseConfirmedRef.current = true;
          }
          return;
        }
        applyStudentExamRemotePatch({ suspended: false });
      })();
    };

    syncTabPauseWithServer();
    document.addEventListener("visibilitychange", syncTabPauseWithServer);
    window.addEventListener("focus", syncTabPauseWithServer);
    window.addEventListener("online", syncTabPauseWithServer);
    return () => {
      document.removeEventListener("visibilitychange", syncTabPauseWithServer);
      window.removeEventListener("focus", syncTabPauseWithServer);
      window.removeEventListener("online", syncTabPauseWithServer);
    };
  }, [
    joinedSession,
    anonymousSessionId,
    examSuspended,
    activeExamDisplayName,
    applyStudentExamRemotePatch,
  ]);

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
    if (!tabLeaveSuspensionEnabled(deliveryMode)) {
      return;
    }

    let hiddenTimer: number | undefined;
    let blurTimer: number | undefined;
    const liveSessionId = joinedSession.liveSessionId;
    const deviceId = anonymousSessionId;
    const displayName = activeExamDisplayName;
    const tabLeaveUrl = `/api/public/live-sessions/${liveSessionId}/tab-leave`;
    const hiddenGraceMs = tabLeaveGraceMs(deliveryMode);
    const blurGraceMs = tabLeaveBlurGraceMs(deliveryMode);

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
      postExamTabLeave(tabLeaveUrl, { deviceId, displayName }, (delivered) => {
        if (delivered) {
          serverTabPauseConfirmedRef.current = true;
        }
      });
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
        }, hiddenGraceMs);
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
      }, blurGraceMs);
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
  }, [
    joinedSession,
    sessionOpen,
    examSuspended,
    examFinished,
    anonymousSessionId,
    activeExamDisplayName,
    deliveryMode,
    t,
  ]);

  useEffect(() => {
    if (mode !== "teacher" || !isTeacher) {
      return;
    }
    const timeoutId = setTimeout(() => {
      const pool = authForms;
      const urlFormId = readFormIdFromUrl();

      if (pool.length === 0) {
        // Keep a URL-selected form while the list is still loading.
        if (!urlFormId) {
          setActiveFormId("");
        }
        return;
      }

      if (urlFormId && pool.some((form) => form.id === urlFormId)) {
        setActiveFormId(urlFormId);
        return;
      }

      if (activeFormId && !pool.some((form) => form.id === activeFormId)) {
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


  /** Collapse form details once the form has a real title. */
  useEffect(() => {
    if (!activeForm) {
      return;
    }
    const untitled = !activeForm.title.trim() || activeForm.title.trim() === "Untitled Form";
    deferEffect(() => {
      setBuilderDetailsOpen(untitled);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when switching forms
  }, [activeFormId]);

  /** Debounced autosave for builder edits. */
  useEffect(() => {
    if (mode !== "teacher" || !isTeacher || !activeForm || !builderHasUnsavedChanges) {
      return;
    }
    if (builderAutosaveTimerRef.current !== undefined) {
      window.clearTimeout(builderAutosaveTimerRef.current);
    }
    builderAutosaveTimerRef.current = window.setTimeout(() => {
      builderAutosaveTimerRef.current = undefined;
      void saveBuilderForm();
    }, 800);
    return () => {
      if (builderAutosaveTimerRef.current !== undefined) {
        window.clearTimeout(builderAutosaveTimerRef.current);
        builderAutosaveTimerRef.current = undefined;
      }
    };
  }, [activeForm, builderHasUnsavedChanges, isTeacher, mode, saveBuilderForm]);

  useEffect(() => {
    const id = builderPromptFocusIdRef.current;
    if (!id || !activeForm) {
      return;
    }
    const el = document.querySelector<HTMLTextAreaElement>(
      `textarea[data-builder-prompt="${id}"]`,
    );
    if (el) {
      el.focus();
      builderPromptFocusIdRef.current = null;
    }
  }, [activeForm?.questions.length, activeForm]);

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

  const persistQuestionOrder = async (formId: string, questions: Question[]) => {
    const questionIds = questions.map((q) => q.id);
    await requestJson<{ ok: true }>(`/api/forms/${formId}/questions/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionIds }),
    });
    updateActiveForm((form) => ({
      ...form,
      questions: questions.map((q, index) => ({ ...q, displayOrder: index })),
    }));
  };

  const addQuestion = async (type: QuestionType, insertAt: number | null = null) => {
    if (!activeForm) {
      return;
    }

    setIsMutating(true);
    setAddingQuestionType(type);
    setStatusMessage("");
    setBuilderPickerOpen(false);
    try {
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
      const current = latestActiveFormRef.current?.questions ?? activeForm.questions;
      const nextQuestions = [...current];
      const at =
        insertAt === null || insertAt < 0 || insertAt > nextQuestions.length
          ? nextQuestions.length
          : insertAt;
      nextQuestions.splice(at, 0, data.question);
      updateActiveForm((form) => ({
        ...form,
        questions: nextQuestions.map((q, index) => ({ ...q, displayOrder: index })),
      }));
      setPersistedBuilderQuestionJsonById((prev) => ({
        ...prev,
        [data.question.id]: serializeBuilderQuestion(data.question),
      }));
      if (at < nextQuestions.length - 1) {
        await persistQuestionOrder(activeForm.id, nextQuestions);
      }
      builderPromptFocusIdRef.current = data.question.id;
      setBuilderInsertAt(null);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t("home.errors.addQuestion"));
    } finally {
      setAddingQuestionType(null);
      setIsMutating(false);
    }
  };

  const duplicateQuestion = async (questionId: string) => {
    if (!activeForm) {
      return;
    }
    const source = activeForm.questions.find((q) => q.id === questionId);
    if (!source) {
      return;
    }
    setIsMutating(true);
    setStatusMessage("");
    try {
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
          body: JSON.stringify({
            type: source.type,
            prompt: source.prompt,
            options: source.options,
            correctAnswer: source.correctAnswer,
            points: source.points,
            responseConfig: source.responseConfig,
          }),
        },
      );
      const current = latestActiveFormRef.current?.questions ?? activeForm.questions;
      const sourceIndex = current.findIndex((q) => q.id === questionId);
      const nextQuestions = [...current];
      const insertAt = sourceIndex < 0 ? nextQuestions.length : sourceIndex + 1;
      nextQuestions.splice(insertAt, 0, data.question);
      updateActiveForm((form) => ({
        ...form,
        questions: nextQuestions.map((q, index) => ({ ...q, displayOrder: index })),
      }));
      setPersistedBuilderQuestionJsonById((prev) => ({
        ...prev,
        [data.question.id]: serializeBuilderQuestion(data.question),
      }));
      await persistQuestionOrder(activeForm.id, nextQuestions);
      builderPromptFocusIdRef.current = data.question.id;
      setBuilderOpenMenuId(null);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t("home.errors.addQuestion"));
    } finally {
      setIsMutating(false);
    }
  };

  const reorderQuestionsByDrag = async (fromId: string, toId: string) => {
    if (!activeForm || fromId === toId) {
      return;
    }
    const current = [...activeForm.questions];
    const fromIndex = current.findIndex((q) => q.id === fromId);
    const toIndex = current.findIndex((q) => q.id === toId);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved!);
    updateActiveForm((form) => ({
      ...form,
      questions: current.map((q, index) => ({ ...q, displayOrder: index })),
    }));
    try {
      await persistQuestionOrder(activeForm.id, current);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t("home.errors.saveForm"));
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
      if (data.resumeCode) {
        setExamResumeCode(formatResumeCodeForDisplay(data.resumeCode));
      }
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
      setHandInConfirming(false);
      setStatusMessage("");
      void clearJoinDraft();
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
      setAutosaveStatus("");
      setStatusMessage(t("home.status.inLiveSession"));
      void clearJoinDraft();
    } catch (error) {
      // Safari often surfaces failed fetches as "Load failed" — map to a clear join hint.
      setStatusMessage(
        isRetryableNetworkError(error)
          ? t("home.errors.joinNetwork")
          : error instanceof Error
            ? error.message
            : t("home.errors.joinSession"),
      );
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
    setActiveExamDisplayName("");
    setLiveTeacherFeedback({});
    setLiveTeacherFeedbackEnabledLive(false);
    setRejoinCodeInput("");
    setStatusMessage(t("home.status.leftSession"));
  };

  const submitExam = async () => {
    if (!joinedSession) {
      return;
    }
    let deviceId = anonymousSessionId;
    if (!deviceId) {
      deviceId = getOrCreateAnonymousSessionId();
      if (deviceId) {
        setAnonymousSessionId(deviceId);
      }
    }
    if (!deviceId || !activeExamDisplayName) {
      setStatusMessage(t("home.errors.submitExam"));
      return;
    }

    setIsMutating(true);
    setStatusMessage("");
    setAutosaveSuspended(true);
    const textQuestions = joinedSession.form.questions.filter((q) => questionSupportsLiveFeedback(q.type));
    const answers = mergeStudentAnswersForSave(
      latestStudentAnswersRef.current,
      examFormRef.current,
      textQuestions,
    );
    latestStudentAnswersRef.current = answers;
    const submissionId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : undefined;
    try {
      setAutosaveStatus(t("home.autosave.saving"));
      const result = await submitExamToServer({
        liveSessionId: joinedSession.liveSessionId,
        deviceId,
        displayName: activeExamDisplayName,
        answers,
        submissionId: submissionId ?? newSubmissionId(),
      });
      if (result.ok) {
        lastPersistedAnswersJsonRef.current = stableStringifyStudentAnswers(answers);
        await offlineSync.acknowledgeSynced().catch(() => {});
        if (autosaveBannerClearRef.current !== undefined) {
          window.clearTimeout(autosaveBannerClearRef.current);
          autosaveBannerClearRef.current = undefined;
        }
        setAutosaveStatus("");
        goToSubmittedPage();
        return;
      }
      if (result.retryable) {
        await finishSubmit.queueSubmit({
          displayName: activeExamDisplayName,
          answers,
          submissionId,
        });
        setAutosaveStatus("");
        setStatusMessage(t("offline.submitQueued"));
        return;
      }
      setAutosaveStatus(t("home.autosave.failed"));
      setStatusMessage(result.message || t("home.errors.submitExam"));
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      if (isRetryableNetworkError(error)) {
        await finishSubmit.queueSubmit({
          displayName: activeExamDisplayName,
          answers,
          submissionId,
        });
        setAutosaveStatus("");
        setStatusMessage(t("offline.submitQueued"));
        return;
      }
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

  const isJoinRoute = guestView === "join";
  const inStudentExam =
    Boolean(joinedSession) && !examFinished && !isBuilderStudentPreview;

  const examCaptureProtectionEnabled = inStudentExam;

  const examWatermarkLabel = useMemo(() => {
    if (!joinedSession || !activeExamDisplayName) {
      return "";
    }
    return formatExamWatermarkLabel(activeExamDisplayName, joinedSession.liveSessionId);
  }, [joinedSession, activeExamDisplayName]);

  const onCaptureViolation = useCallback(
    (kind: "getDisplayMedia" | "printScreen" | "screenshotShortcut") => {
      if (!joinedSession || !anonymousSessionId || !activeExamDisplayName || examFinished) {
        return;
      }
      if (kind === "getDisplayMedia") {
        if (tabLeaveSuspensionEnabled(deliveryMode) && !examSuspended) {
          setExamSuspended(true);
          setStatusMessage(t("home.status.screenCapturePaused"));
          if (!tabLeaveReportedRef.current) {
            tabLeaveReportedRef.current = true;
            postExamTabLeave(
              `/api/public/live-sessions/${joinedSession.liveSessionId}/tab-leave`,
              { deviceId: anonymousSessionId, displayName: activeExamDisplayName },
              (delivered) => {
                if (delivered) {
                  serverTabPauseConfirmedRef.current = true;
                }
              },
            );
          }
        } else {
          setStatusMessage(t("home.status.screenCaptureBlocked"));
        }
        return;
      }
      setStatusMessage(t("home.status.screenshotShortcut"));
    },
    [
      joinedSession,
      anonymousSessionId,
      activeExamDisplayName,
      examFinished,
      examSuspended,
      deliveryMode,
      t,
    ],
  );

  useExamCaptureProtection(examCaptureProtectionEnabled, onCaptureViolation);

  useBodyFocusMode(inStudentExam || isJoinRoute);

  const teacherPendingDashboardRedirect =
    urlSynced &&
    sessionHydrated &&
    !isJoinRoute &&
    session?.profile?.role === "teacher" &&
    homePageIntent === "none" &&
    !joinedSession;

  const showGuestHeader = guestView === "landing" && !session;

  if (!urlSynced || !sessionHydrated || teacherPendingDashboardRedirect) {
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
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{t("home.join.title")}</h2>
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
  const takingStudentExam = Boolean(studentExamForm && !showTeacherTools);
  const mainClassName = isGuestMarketing
    ? "tp-guest-landing-main"
    : takingStudentExam
      ? "tp-exam-main"
      : `${ui.pageMain} tp-card p-6 sm:p-8`;

  return (
    <HomeChrome
      guestHeader={isGuestMarketing}
      hideLanguageToggle={inStudentExam || isJoinRoute}
    >
      <div className={takingStudentExam ? "tp-exam-page" : ui.page}>
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
          <div className="tp-builder-header mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Link
                href="/dashboard"
                className={`inline-flex items-center gap-1.5 text-[13px] font-medium text-[#64748b] hover:text-[#334155] ${focusRing}`}
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
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                {isBuilderStudentPreview
                  ? t("home.teacher.previewTitle")
                  : t("home.teacher.builderTitle")}
              </h1>
            </div>
            {!isBuilderStudentPreview && activeForm ? (
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="tp-builder-autosave"
                  data-tour="builder-autosave"
                  data-state={
                    builderSaveStatus === "saving" || builderHasUnsavedChanges
                      ? "saving"
                      : builderSaveStatus === "error"
                        ? "error"
                        : "saved"
                  }
                  role="status"
                  aria-live="polite"
                >
                  <span aria-hidden className="tp-builder-autosave__dot" />
                  {builderSaveStatus === "saving"
                    ? t("home.builder.saving")
                    : builderSaveStatus === "error"
                      ? builderSaveError || t("home.builder.saveFailed")
                      : builderHasUnsavedChanges
                        ? t("home.builder.saving")
                        : t("home.builder.savedJustNow")}
                </span>
                <button
                  type="button"
                  onClick={() => setMode("student")}
                  className={`tp-builder-preview-btn ${focusRing}`}
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
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {t("home.builder.previewAsStudent")}
                </button>
                <OverflowMenu
                  label={t("home.builder.moreActions")}
                  showClose={false}
                  items={[
                    {
                      type: "button",
                      label: t("templateLibrary.save.action"),
                      onClick: () =>
                        setSaveTemplateTarget({
                          kind: "form",
                          title: activeForm.title || t("common.untitledForm"),
                        }),
                    },
                  ]}
                />
              </div>
            ) : isBuilderStudentPreview ? (
              <button
                type="button"
                onClick={() => setMode("teacher")}
                className={`${ui.btnSecondary} ${focusRing}`}
              >
                {t("home.teacher.modeTeacher")}
              </button>
            ) : null}
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
              {teacherBannerNoTimeLimit || !teacherLiveBanner
                ? t("common.noTimeLimit")
                : (
                    <LiveCountdown
                      closesAt={teacherLiveBanner.closesAt}
                      render={(msLeft) =>
                        t("home.teacher.timeLeft", { timeLeft: formatCountdown(msLeft) })
                      }
                    />
                  )}
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
          <section className="tp-builder-shell space-y-5">
            <div className="tp-builder-details">
              {builderDetailsOpen ? (
                <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                  <label className="block text-[12.5px] font-semibold text-[#64748b]">
                    {t("home.builder.formTitle")}
                    <input
                      type="text"
                      data-tour="form-title"
                      value={activeForm.title}
                      onChange={(event) =>
                        updateActiveForm((form) => ({ ...form, title: event.target.value }))
                      }
                      className="tp-builder-details__title-input"
                    />
                  </label>
                  <label className="block text-[12.5px] font-semibold text-[#64748b]">
                    {t("home.builder.formDescription")}{" "}
                    <span className="font-normal text-[#94a3b8]">
                      — {t("home.builder.descriptionHint")}
                    </span>
                    <textarea
                      value={activeForm.description}
                      onChange={(event) =>
                        updateActiveForm((form) => ({
                          ...form,
                          description: event.target.value,
                        }))
                      }
                      className="tp-builder-details__desc-input"
                      rows={3}
                    />
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <FormAssetImageEditor
                      formId={activeForm.id}
                      target="description"
                      imagePath={activeForm.descriptionImagePath}
                      disabled={isMutating}
                      onPathChange={(path) =>
                        updateActiveForm((form) => ({ ...form, descriptionImagePath: path }))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setBuilderDetailsOpen(false)}
                      className={`tp-builder-details__done ${focusRing}`}
                    >
                      {t("home.builder.doneDetails")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="tp-builder-details__collapsed"
                  onClick={() => setBuilderDetailsOpen(true)}
                >
                  <div className="min-w-0">
                    <div className="tp-builder-details__collapsed-title">
                      {activeForm.title || t("common.untitledForm")}
                    </div>
                    {activeForm.description.trim() ? (
                      <div className="tp-builder-details__collapsed-desc">
                        {activeForm.description}
                      </div>
                    ) : null}
                  </div>
                  <span className="tp-builder-details__edit">{t("home.builder.editDetails")}</span>
                </button>
              )}
            </div>

            <div className="tp-builder-summary">
              <div className="tp-builder-summary__meta">
                <strong>
                  {activeForm.questions.length === 1
                    ? t("home.builder.summaryQuestionsOne", { n: activeForm.questions.length })
                    : t("home.builder.summaryQuestionsOther", { n: activeForm.questions.length })}
                </strong>
                <span className="tp-builder-summary__sep" aria-hidden>
                  ·
                </span>
                <span>
                  {t("home.builder.summaryPoints", {
                    n: activeForm.questions.reduce((sum, q) => sum + q.points, 0),
                  })}
                </span>
                <span className="tp-builder-summary__sep" aria-hidden>
                  ·
                </span>
                <span>
                  {t("home.builder.summaryAutograde", {
                    n: countAutogradableQuestions(activeForm.questions),
                    total: activeForm.questions.length,
                  })}
                </span>
              </div>
              <span className="tp-builder-summary__hint">{t("home.builder.dragToReorder")}</span>
            </div>

            <div className="tp-builder-question-list">
              {activeForm.questions.length === 0 && !addingQuestionType ? (
                <p className={ui.empty}>{t("home.builder.emptyQuestions")}</p>
              ) : null}
              {activeForm.questions.map((question, index) => {
                const tokens = buildSummaryTokens(question);
                const family = typeBadgeFamily(question.type);
                const panelKey =
                  builderOpenPanel?.questionId === question.id
                    ? builderOpenPanel.panel
                    : null;
                return (
                  <div key={question.id}>
                    <article
                      className="tp-builder-card"
                      draggable={false}
                      onDragOver={(event) => {
                        if (builderDragId) {
                          event.preventDefault();
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (builderDragId) {
                          void reorderQuestionsByDrag(builderDragId, question.id);
                          setBuilderDragId(null);
                        }
                      }}
                    >
                      <div className="tp-builder-card__header">
                        <button
                          type="button"
                          className="tp-builder-card__drag"
                          title={t("home.builder.dragHandle")}
                          draggable
                          onDragStart={() => setBuilderDragId(question.id)}
                          onDragEnd={() => setBuilderDragId(null)}
                          aria-label={t("home.builder.dragHandle")}
                        >
                          <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                            <path d="M4 7h16v2H4V7zm0 4h16v2H4v-2zm0 4h16v2H4v-2z" />
                          </svg>
                        </button>
                        <span className="tp-builder-card__num">{index + 1}</span>
                        <QuestionTypeBadge
                          type={question.type}
                          className={`tp-builder-type-badge tp-builder-type-badge--${family}`}
                        />
                        <div className="tp-builder-card__spacer" />
                        <div className="tp-builder-card__tokens">
                          {tokens.map((token) => {
                            const active = panelKey === token.key;
                            return (
                              <button
                                key={`${question.id}-${token.key}-${token.labelKey}`}
                                type="button"
                                className={`tp-builder-token ${focusRing}`}
                                data-active={active ? "true" : undefined}
                                onClick={() => {
                                  setBuilderOpenMenuId(null);
                                  setBuilderPickerOpen(false);
                                  setBuilderOpenPanel((prev) =>
                                    prev?.questionId === question.id && prev.panel === token.key
                                      ? null
                                      : { questionId: question.id, panel: token.key },
                                  );
                                }}
                              >
                                {t(
                                  `home.builder.tokens.${token.labelKey}` as TranslationPath,
                                  token.values ?? {},
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <OverflowMenu
                          label={t("home.builder.moreActions")}
                          showClose={false}
                          open={builderOpenMenuId === question.id}
                          onOpenChange={(open) => {
                            setBuilderOpenMenuId(open ? question.id : null);
                            if (open) {
                              setBuilderPickerOpen(false);
                              setBuilderOpenPanel(null);
                            }
                          }}
                          items={[
                            {
                              type: "button",
                              label: t("home.builder.duplicate"),
                              disabled: isMutating,
                              onClick: () => void duplicateQuestion(question.id),
                            },
                            {
                              type: "button",
                              label: t("home.builder.addImage"),
                              onClick: () => {
                                setBuilderOpenPanel({
                                  questionId: question.id,
                                  panel: "image",
                                });
                              },
                            },
                            { type: "divider", key: `div-${question.id}` },
                            {
                              type: "button",
                              label: t("home.builder.deleteEllipsis"),
                              tone: "danger",
                              disabled: isMutating,
                              onClick: () => void removeQuestion(question.id),
                            },
                          ]}
                        />
                      </div>
                      <textarea
                        rows={2}
                        data-builder-prompt={question.id}
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
                        className="tp-builder-card__prompt"
                        aria-label={t("home.builder.prompt")}
                      />
                      <BuilderQuestionFields
                        formId={activeForm.id}
                        question={question}
                        index={index}
                        openPanel={panelKey}
                        isMutating={isMutating}
                        updateActiveForm={updateActiveForm}
                      />
                    </article>
                    <button
                      type="button"
                      className="tp-builder-insert"
                      onClick={() => {
                        setBuilderInsertAt(index + 1);
                        setBuilderPickerOpen(true);
                        setBuilderOpenMenuId(null);
                        setBuilderOpenPanel(null);
                      }}
                    >
                      <span>{t("home.builder.insertHere")}</span>
                    </button>
                  </div>
                );
              })}
              {addingQuestionType ? (
                <article
                  className="tp-builder-card flex items-center justify-center gap-3 py-10 text-sm text-[var(--tp-text-secondary)]"
                  role="status"
                  aria-live="polite"
                >
                  <span
                    className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[var(--tp-border)] border-t-[var(--tp-accent)]"
                    aria-hidden
                  />
                  {t("home.builder.addingQuestion")}
                </article>
              ) : null}
              <BuilderTypePicker
                open={builderPickerOpen}
                onOpenChange={(open) => {
                  setBuilderPickerOpen(open);
                  if (!open) {
                    setBuilderInsertAt(null);
                  } else {
                    setBuilderOpenMenuId(null);
                    setBuilderOpenPanel(null);
                  }
                }}
                disabled={isMutating}
                addingType={addingQuestionType}
                onSelect={(type) => void addQuestion(type, builderInsertAt)}
              />
            </div>
          </section>
        ) : studentExamForm && !showTeacherTools ? (
          <section
            className="tp-exam-shell relative"
            data-exam-protected={joinedSession ? "" : undefined}
            onPointerMove={schedulePointerInteractionHeartbeat}
            onPointerOver={schedulePointerInteractionHeartbeat}
            onFocusCapture={schedulePointerInteractionHeartbeat}
            {...examProtectionHandlers(Boolean(joinedSession && !examFinished))}
          >
            {examCaptureProtectionEnabled && examWatermarkLabel ? (
              <ExamCaptureWatermark label={examWatermarkLabel} />
            ) : null}
            {isBuilderStudentPreview ? (
              <div className="tp-exam-body !pb-2">
                <div className="rounded-[12px] border border-[var(--tp-border)] bg-white px-4 py-3 text-sm">
                  <p className="font-medium text-[var(--tp-text)]">{t("home.exam.previewTitle")}</p>
                  <p className="mt-1 text-[var(--tp-text-secondary)]">
                    {t("home.exam.previewDesc")}
                  </p>
                </div>
              </div>
            ) : null}
            {joinedSession && examSuspended ? (
              <div
                className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[var(--tp-surface)]/95 p-6 text-center shadow-lg backdrop-blur-sm tp-anim-fade-in"
                role="alert"
              >
                <p className="text-lg font-semibold text-[var(--tp-text)]">{t("home.exam.overlay.paused")}</p>
                <p className="max-w-md text-sm text-[var(--tp-text-secondary)]">
                  {t("home.exam.overlay.pausedHint")}
                </p>
              </div>
            ) : null}

            {joinedSession || isBuilderStudentPreview ? (
              <StudentExamHeader
                title={studentExamForm.title || t("common.untitledForm")}
                syncStatus={
                  isBuilderStudentPreview
                    ? {
                        state: "synced",
                        count: 0,
                        oldestQueuedAt: null,
                        breakdown: { responses: 0, submission: 0, comments: 0 },
                        hasFailed: false,
                      }
                    : studentSyncStatus
                }
                dots={studentExamQuestions.map((q, index) => ({
                  id: q.id,
                  index,
                  answered: isQuestionAnswered(q),
                }))}
                onJump={(questionId) => {
                  document
                    .getElementById(`exam-card-${questionId}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                closesAt={
                  isBuilderStudentPreview
                    ? null
                    : closesAtForStudent
                }
                opensAt={isBuilderStudentPreview ? null : joinedSession?.opensAt}
                sessionOpen={isBuilderStudentPreview ? true : sessionOpen}
                examFinished={examFinished}
                formatCountdown={formatCountdown}
              />
            ) : null}

            <div className="tp-exam-body">
              {studentExamForm.description || studentExamForm.descriptionImagePath ? (
                <div className="tp-exam-intro">
                  <p className="tp-exam-intro__label">{t("home.exam.beforeYouStart")}</p>
                  {studentExamForm.description ? (
                    <ExamMarkdown variant="body" className="tp-exam-intro__body">
                      {studentExamForm.description}
                    </ExamMarkdown>
                  ) : null}
                  {studentExamForm.descriptionImagePath ? (
                    <FormAssetImage
                      path={studentExamForm.descriptionImagePath}
                      alt={t("home.exam.descriptionImageAlt")}
                      className="mt-3 overflow-hidden rounded-[12px] border border-[var(--tp-border)] bg-white"
                    />
                  ) : null}
                </div>
              ) : null}

              {studentExamQuestions.length === 0 ? (
                <p className="rounded-[12px] border border-dashed border-[var(--tp-border-strong)] bg-white p-4 text-[var(--tp-text-secondary)]">
                  {t("home.exam.noQuestions")}
                </p>
              ) : (
                <form ref={examFormRef} className="tp-exam-q-list">
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
                    const showRaiseHand = Boolean(
                      joinedSession &&
                        examWritable &&
                        !examFinished &&
                        !examSuspended &&
                        !airAlertPaused &&
                        !isBuilderStudentPreview,
                    );
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
                        showRaiseHand={showRaiseHand}
                        handRaised={handRaiseQuestionId === question.id}
                        raiseHandBusy={raiseHandBusyQuestionId === question.id}
                        showSavedTick={savedTickByQuestionId[question.id] === true}
                        onToggleRaiseHand={() => void toggleRaiseHand(question.id)}
                        onFocusQuestion={() => {
                          focusQuestionIdRef.current = question.id;
                        }}
                        onChoiceChange={(value) => {
                          if (isBuilderStudentPreview) {
                            setPreviewAnswers((prev) => ({
                              ...prev,
                              [question.id]: value,
                            }));
                            scheduleQuestionSavedTick(question.id);
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
                            scheduleQuestionSavedTick(question.id);
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
                <p className="rounded-[12px] border border-[var(--tp-border)] bg-white px-3 py-2 text-sm text-[var(--tp-text-secondary)]">
                  {t("offline.airAlertPaused")}
                </p>
              ) : null}

              {!isBuilderStudentPreview && joinedSession && examWritable && !examFinished ? (
                <StudentExamHandIn
                  blankCount={Math.max(0, examTotalQuestions - examAnsweredCount)}
                  questionCount={examTotalQuestions}
                  confirming={handInConfirming}
                  submitting={isMutating}
                  resumeCode={examResumeCode || null}
                  autosaveStatusRef={autosaveStatusElRef}
                  onCancelConfirm={() => setHandInConfirming(false)}
                  onHandIn={() => {
                    const blanks = Math.max(0, examTotalQuestions - examAnsweredCount);
                    if (blanks > 0 && !handInConfirming) {
                      setHandInConfirming(true);
                      return;
                    }
                    setHandInConfirming(false);
                    void submitExam();
                  }}
                />
              ) : null}
            </div>
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
