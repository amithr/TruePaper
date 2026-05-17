import { redirect } from "next/navigation";

import { TeacherDashboard } from "@/components/dashboard/TeacherDashboard";
import { getSessionUser } from "@/lib/request-auth";
import { fetchActiveTeacherSessions } from "@/lib/teacher-dashboard-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function TeacherDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const auth = await getSessionUser(supabase);

  if (!auth?.user) {
    redirect("/login");
  }

  if (!auth.profile || auth.profile.role !== "teacher") {
    redirect("/");
  }

  const profile = auth.profile;
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
