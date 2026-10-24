import { notFound } from "next/navigation";

import { TeacherSettings } from "@/components/settings/TeacherSettings";
import { loadBillingState } from "@/lib/billing/store";
import { isBillingConfigured } from "@/lib/billing/stripe";
import { getCachedRequestSession } from "@/lib/cached-request-session";
import { isLocale } from "@/lib/i18n/config";
import { isMissingColumnError, isMissingRelationError } from "@/lib/is-missing-db-column";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { teacherDefaultsFromRow, type TeacherDefaultsRow } from "@/lib/teacher-defaults";
import { usageTermStartIso } from "@/lib/teacher-usage";

type Props = {
  params: Promise<{ lang: string }>;
};

export default async function TeacherSettingsPage({ params }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }

  const auth = await getCachedRequestSession();
  if (!auth?.user || !auth.profile || auth.profile.role !== "teacher") {
    notFound();
  }
  const userId = auth.user.id;
  const supabase = await createSupabaseServerClient();

  // Pre-migration deploys: a missing avatar column / defaults table just means
  // "no photo" and "recommended defaults" — the page still renders.
  let avatarUrl: string | null = null;
  const avatar = await supabase.from("profiles").select("avatar_url").eq("id", userId).maybeSingle();
  if (!avatar.error) {
    avatarUrl = typeof avatar.data?.avatar_url === "string" ? avatar.data.avatar_url : null;
  } else if (!isMissingColumnError(avatar.error, "avatar_url")) {
    throw new Error(avatar.error.message);
  }

  let defaultsRow: TeacherDefaultsRow | null = null;
  const defaultsRes = await supabase
    .from("teacher_defaults")
    .select("duration_minutes, delivery_mode, accept_late_sync, live_feedback")
    .eq("user_id", userId)
    .maybeSingle();
  if (!defaultsRes.error) {
    defaultsRow = (defaultsRes.data as TeacherDefaultsRow | null) ?? null;
  } else if (!isMissingRelationError(defaultsRes.error, "teacher_defaults")) {
    throw new Error(defaultsRes.error.message);
  }

  const termStart = usageTermStartIso();
  const [forms, sessions, students] = await Promise.all([
    supabase.from("forms").select("id", { count: "exact", head: true }).eq("created_by", userId),
    supabase
      .from("form_sessions")
      .select("id", { count: "exact", head: true })
      .eq("created_by", userId)
      .gte("created_at", termStart),
    // RLS limits this to responses on the teacher's own forms.
    supabase
      .from("form_responses")
      .select("id", { count: "exact", head: true })
      .is("student_id", null)
      .not("finished_at", "is", null),
  ]);

  const billing = await loadBillingState(supabase, userId);

  return (
    <TeacherSettings
      user={{ id: userId, email: auth.user.email ?? "" }}
      profile={{ displayName: auth.profile.display_name?.trim() ?? "", avatarUrl }}
      defaults={teacherDefaultsFromRow(defaultsRow)}
      usage={{
        forms: forms.count ?? 0,
        sessions: sessions.count ?? 0,
        students: students.count ?? 0,
      }}
      billing={billing}
      billingConfigured={isBillingConfigured()}
      stripePublishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null}
    />
  );
}
