"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BUILDER_TOUR_PENDING_KEY } from "@/lib/onboarding-tour-key";

import { BrandMark } from "@/components/BrandMark";
import { HelpTipsToggle } from "@/components/HelpTipsToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { DashboardFormLibrary } from "@/components/dashboard/DashboardFormLibrary";
import { DashboardLazySection } from "@/components/dashboard/DashboardLazySection";
import { DashboardPastSessions } from "@/components/dashboard/DashboardPastSessions";
import { DashboardRunningSessions } from "@/components/dashboard/DashboardRunningSessions";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { LocaleLink, useLocaleRouter } from "@/lib/i18n/client";
import { dashboardWelcomeName } from "@/lib/dashboard-welcome";
import type { SuspendedStudentRow, TeacherSessionSummary } from "@/lib/teacher-sessions";
import { ui } from "@/lib/ui";
import { requestJson } from "@/lib/request-json";

export type DashboardTeacherUser = {
  id: string;
  email?: string | null;
};

export type DashboardTeacherProfile = {
  id: string;
  role: "teacher";
  display_name: string | null;
};

type Props = {
  user: DashboardTeacherUser;
  profile: DashboardTeacherProfile;
  initialRunning: TeacherSessionSummary[];
  initialSuspensions: Record<string, SuspendedStudentRow[]>;
  /** First-login tour: false → the dashboard segment auto-runs once. */
  tourCompleted?: boolean;
};

export function TeacherDashboard({
  user,
  profile,
  initialRunning,
  initialSuspensions,
  tourCompleted = true,
}: Props) {
  const router = useLocaleRouter();
  const t = useTranslations();
  const [loadError, setLoadError] = useState("");

  const onError = useCallback((message: string) => {
    setLoadError(message);
  }, []);

  // First-login tour (Segment A). Auto-runs once when the profile flag is unset;
  // marking complete is server-side, and a sessionStorage flag hands off to the
  // builder segment if the teacher opens a form next.
  const tourStartedRef = useRef(false);
  useEffect(() => {
    if (tourCompleted || tourStartedRef.current) {
      return;
    }
    tourStartedRef.current = true;
    let cancelled = false;
    const markComplete = () => {
      try {
        window.sessionStorage.setItem(BUILDER_TOUR_PENDING_KEY, "1");
      } catch {
        /* sessionStorage unavailable — builder segment simply won't run */
      }
      void fetch("/api/auth/onboarding-tour/complete", { method: "POST" }).catch(() => {
        /* best-effort; tour still won't re-run this session */
      });
    };
    // Let the dashboard paint (and async sections settle) before anchoring steps.
    const timer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      void import("@/lib/onboarding-tour")
        .then(({ startDashboardTour }) => {
          if (!cancelled) {
            startDashboardTour(t, markComplete);
          }
        })
        .catch(() => {
          /* tour is non-critical */
        });
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tourCompleted, t]);

  const logout = async () => {
    await requestJson<{ ok: true }>("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  };

  const scrollToSection = (sectionId: "running-sessions" | "past-sessions" | "form-library") => {
    if (typeof document === "undefined") {
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const name = dashboardWelcomeName(profile, user.email);
  const avatarSeed = (name || user.email || "T").trim().charAt(0) || "T";

  return (
    <div className={ui.page}>
      <main className={`${ui.pageMain} space-y-6`}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <BrandMark />
          <div className="flex items-center gap-2">
            <HelpTipsToggle />
            <LanguageToggle />
            <LocaleLink
              href="/join"
              className={`${ui.btnSecondary} hidden sm:inline-flex`}
              aria-label={t("dashboard.studentJoinPageAria")}
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
                <path d="M3 12h12" />
                <path d="m11 6 6 6-6 6" />
              </svg>
              {t("nav.studentJoin")}
            </LocaleLink>
            <button
              type="button"
              onClick={() => void logout()}
              className="tp-pill"
              aria-label={t("dashboard.logOutAria")}
              title={t("common.logOut")}
            >
              <span aria-hidden className="tp-avatar">
                {avatarSeed}
              </span>
              <span className="hidden text-sm sm:inline">{t("common.logOut")}</span>
            </button>
          </div>
        </header>

        <section data-tour="welcome" className="tp-card-accent p-6 sm:p-8 tp-anim-fade-up">
          <p className={ui.sectionTitle}>{t("dashboard.eyebrow")}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            {t("dashboard.helloPrefix")}
            <span className="text-[var(--tp-brand)]">{name}</span>
          </h1>
          <p className="mt-2 max-w-2xl text-[var(--tp-text-secondary)]">
            {t("dashboard.welcomeSubtitle")}
          </p>
          <nav
            aria-label={t("dashboard.sectionsAria")}
            className="mt-5 flex flex-wrap items-center gap-2"
          >
            <button
              type="button"
              onClick={() => scrollToSection("running-sessions")}
              className={ui.pill}
            >
              <span aria-hidden className="text-[var(--tp-mint)]">●</span>
              {t("dashboard.running")}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("past-sessions")}
              className={ui.pill}
            >
              {t("dashboard.past")}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("form-library")}
              className={ui.pill}
            >
              {t("dashboard.forms")}
            </button>
          </nav>
        </section>

        {loadError ? <p className="tp-alert tp-alert-error">{loadError}</p> : null}

        <DashboardRunningSessions
          initialSessions={initialRunning}
          initialSuspensions={initialSuspensions}
          onError={onError}
        />

        <DashboardLazySection
          id="past-sessions"
          placeholder={
            <div className="tp-card p-6">
              <p className={ui.sectionTitle}>{t("dashboard.historyEyebrow")}</p>
              <h2 className="text-xl font-semibold tracking-tight">
                {t("dashboard.pastSessionsTitle")}
              </h2>
              <p className="mt-4 text-sm text-[var(--tp-text-muted)]">
                {t("dashboard.loadingPastSessions")}
              </p>
            </div>
          }
        >
          <DashboardPastSessions onError={onError} />
        </DashboardLazySection>

        <DashboardLazySection
          id="form-library"
          placeholder={
            <div className="tp-card p-6">
              <p className={ui.sectionTitle}>{t("dashboard.formsEyebrow")}</p>
              <h2 className="text-xl font-semibold tracking-tight">
                {t("dashboard.formLibraryTitle")}
              </h2>
              <p className="mt-4 text-sm text-[var(--tp-text-muted)]">
                {t("dashboard.loadingFormLibrary")}
              </p>
            </div>
          }
        >
          <DashboardFormLibrary onError={onError} />
        </DashboardLazySection>
      </main>
    </div>
  );
}
