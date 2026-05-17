"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { DashboardFormLibrary } from "@/components/dashboard/DashboardFormLibrary";
import { DashboardLazySection } from "@/components/dashboard/DashboardLazySection";
import { DashboardPastSessions } from "@/components/dashboard/DashboardPastSessions";
import { DashboardRunningSessions } from "@/components/dashboard/DashboardRunningSessions";
import { dashboardWelcomeName } from "@/lib/dashboard-welcome";
import type { SuspendedStudentRow, TeacherSessionSummary } from "@/lib/teacher-sessions";
import { buttonLabel, ui } from "@/lib/ui";
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
};

export function TeacherDashboard({
  user,
  profile,
  initialRunning,
  initialSuspensions,
}: Props) {
  const router = useRouter();
  const [loadError, setLoadError] = useState("");

  const onError = useCallback((message: string) => {
    setLoadError(message);
  }, []);

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

  return (
    <div className={ui.page}>
      <main className={`${ui.pageMain} space-y-8`}>
        <header className="flex flex-wrap items-start justify-between gap-4 tp-card p-8">
          <div className="min-w-0 flex-1">
            <p className={ui.sectionTitle}>Overview</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Hello, {name}</h1>
            <p className="mt-2 max-w-2xl text-[var(--tp-text-secondary)]">
              Run live sessions so students join with a 6-character code—each session is one form window
              where many students can submit answers on their own devices.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/#join-session" className={ui.btnSecondary}>
              {buttonLabel("Student join page")}
            </Link>
            <button type="button" onClick={() => void logout()} className={ui.btnGhost}>
              {buttonLabel("Log out")}
            </button>
          </div>
        </header>

        <nav aria-label="Dashboard sections" className="flex flex-wrap items-center gap-2 tp-card p-2">
          <button
            type="button"
            onClick={() => scrollToSection("running-sessions")}
            className={ui.pill}
          >
            {buttonLabel("Currently running")}
          </button>
          <button type="button" onClick={() => scrollToSection("past-sessions")} className={ui.pill}>
            {buttonLabel("Past sessions")}
          </button>
          <button type="button" onClick={() => scrollToSection("form-library")} className={ui.pill}>
            {buttonLabel("Form library")}
          </button>
        </nav>

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
              <p className={ui.sectionTitle}>History</p>
              <h2 className="text-xl font-semibold tracking-tight">Past sessions</h2>
              <p className="mt-4 text-sm text-zinc-500">Loading when you scroll here…</p>
            </div>
          }
        >
          <DashboardPastSessions onError={onError} />
        </DashboardLazySection>

        <DashboardLazySection
          id="form-library"
          placeholder={
            <div className="tp-card p-6">
              <p className={ui.sectionTitle}>Forms</p>
              <h2 className="text-xl font-semibold tracking-tight">Form library</h2>
              <p className="mt-4 text-sm text-zinc-500">Loading when you scroll here…</p>
            </div>
          }
        >
          <DashboardFormLibrary onError={onError} />
        </DashboardLazySection>
      </main>
    </div>
  );
}
