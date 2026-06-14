import { notFound } from "next/navigation";

import { TeacherDashboard } from "@/components/dashboard/TeacherDashboard";
import { isLocale } from "@/lib/i18n/config";
import { getCachedRequestSession } from "@/lib/cached-request-session";
import { isMissingColumnError } from "@/lib/is-missing-db-column";
import { fetchActiveTeacherSessions } from "@/lib/teacher-dashboard-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  return (
    <TeacherDashboard
      user={{ id: auth.user.id, email: auth.user.email }}
      profile={{
        id: profile.id,
        role: "teacher",
        display_name: profile.display_name,
      }}
      initialRunning={sessions}
      initialSuspensions={suspensionsBySession}
      tourCompleted={tourCompleted}
    />
  );
}
