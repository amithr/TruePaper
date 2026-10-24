import { NextResponse } from "next/server";

import { isMissingRelationError } from "@/lib/is-missing-db-column";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseTeacherDefaults, teacherDefaultsToRow } from "@/lib/teacher-defaults";

/** Settings → Exam defaults. Whole-object replace. */
export async function PUT(request: Request) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers have exam defaults." }, { status: 403 });
  }

  const defaults = parseTeacherDefaults(await request.json().catch(() => null));
  if (!defaults) {
    return NextResponse.json(
      { error: "Invalid defaults: durationMinutes 5–480 or null, deliveryMode live|self_paced|hybrid, booleans." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("teacher_defaults")
    .upsert(
      { user_id: session.user.id, ...teacherDefaultsToRow(defaults), updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  if (error) {
    if (isMissingRelationError(error, "teacher_defaults")) {
      return NextResponse.json(
        { error: "Database is missing teacher_defaults. Run migration 20261023130000_teacher_settings.sql." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, defaults });
}
