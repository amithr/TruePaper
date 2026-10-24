import { NextResponse } from "next/server";

import { isMissingColumnError } from "@/lib/is-missing-db-column";
import { isValidLiveSessionDisplayName, normalizeLiveSessionDisplayName } from "@/lib/live-session-display-name";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  displayName?: string;
  /** `null` clears the photo. */
  avatarUrl?: string | null;
};

/** Settings → Profile. Same name rule as registration (1–120 chars). */
export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can edit this profile." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const patch: { display_name?: string; avatar_url?: string | null } = {};

  if (body.displayName !== undefined) {
    const displayName = normalizeLiveSessionDisplayName(String(body.displayName ?? ""));
    if (!isValidLiveSessionDisplayName(displayName)) {
      return NextResponse.json({ error: "Your name is required (1–120 characters)." }, { status: 400 });
    }
    patch.display_name = displayName;
  }
  if (body.avatarUrl !== undefined) {
    if (body.avatarUrl !== null && typeof body.avatarUrl !== "string") {
      return NextResponse.json({ error: "avatarUrl must be a string or null." }, { status: 400 });
    }
    patch.avatar_url = body.avatarUrl;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { error } = await supabase.from("profiles").update(patch).eq("id", session.user.id);
  if (error) {
    if (isMissingColumnError(error, "avatar_url")) {
      return NextResponse.json(
        { error: "Database is missing profiles.avatar_url. Run migration 20261023130000_teacher_settings.sql." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, displayName: patch.display_name, avatarUrl: patch.avatar_url });
}
