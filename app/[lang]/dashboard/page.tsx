import { notFound } from "next/navigation";

import { TeacherDashboard } from "@/components/dashboard/TeacherDashboard";
import { isLocale } from "@/lib/i18n/config";
import { getCachedRequestSession } from "@/lib/cached-request-session";
import { isMissingColumnError, isMissingRelationError } from "@/lib/is-missing-db-column";
import { fetchActiveTeacherSessions } from "@/lib/teacher-dashboard-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { teacherDefaultsFromRow, type TeacherDefaultsRow } from "@/lib/teacher-defaults";

type Props = {
  params: Promise<{ lang: string }>;
};

export default async function TeacherDashboardPage({ params }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }

  const auth = await getCachedRequestSession();
  if (!auth?.user || !auth.profile || auth.profile.role !== "teacher") {
    notFound();
  }
  const profile = auth.profile;

  const supabase = await createSupabaseServerClient();
  const { sessions, suspensionsBySession } = await fetchActiveTeacherSessions(
    supabase,
    auth.user.id,
  );

  // First-login tour: account-scoped flag. Treat a missing column (pre-migration)
  // as "completed" so we never trigger the tour against an un-migrated database.
  let tourCompleted = true;
  const { data: tourRow, error: tourError } = await supabase
    .from("profiles")
    .select("onboarding_tour_completed_at")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (tourError) {
    if (!isMissingColumnError(tourError, "onboarding_tour_completed_at")) {
      // Unexpected error — fail safe by skipping the tour rather than crashing.
      tourCompleted = true;
    }
  } else {
    tourCompleted = Boolean(tourRow?.onboarding_tour_completed_at);
  }

  // Settings → Exam defaults seed the Start popover for forms that have never run.
  // A missing table (pre-migration) means the recommended defaults.
  let defaultsRow: TeacherDefaultsRow | null = null;
  const defaultsRes = await supabase
    .from("teacher_defaults")
    .select("duration_minutes, delivery_mode, accept_late_sync, live_feedback")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!defaultsRes.error) {
    defaultsRow = (defaultsRes.data as TeacherDefaultsRow | null) ?? null;
  } else if (!isMissingRelationError(defaultsRes.error, "teacher_defaults")) {
    throw new Error(defaultsRes.error.message);
  }

  return (
    <TeacherDashboard
      user={{ id: auth.user.id, email: auth.user.email }}
      profile={{
        id: profile.id,
        role: "teacher",
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      }}
      initialRunning={sessions}
      initialSuspensions={suspensionsBySession}
      tourCompleted={tourCompleted}
      teacherDefaults={teacherDefaultsFromRow(defaultsRow)}
    />
  );
}
