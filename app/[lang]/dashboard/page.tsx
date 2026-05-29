import { notFound, redirect } from "next/navigation";

import { TeacherDashboard } from "@/components/dashboard/TeacherDashboard";
import { isLocale } from "@/lib/i18n/config";
import { getCachedRequestSession } from "@/lib/cached-request-session";
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
    />
  );
}
