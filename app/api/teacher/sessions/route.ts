import { NextResponse } from "next/server";

import {
  fetchActiveTeacherSessions,
  fetchPastTeacherSessions,
  PAST_SESSIONS_PAGE_SIZE,
} from "@/lib/teacher-dashboard-server";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can view sessions." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") ?? "active";

  try {
    if (scope === "past") {
      const page = Number(searchParams.get("page") ?? "0");
      const limit = Number(searchParams.get("limit") ?? String(PAST_SESSIONS_PAGE_SIZE));
      const result = await fetchPastTeacherSessions(supabase, session.user.id, page, limit);
      return NextResponse.json(result);
    }

    const result = await fetchActiveTeacherSessions(supabase, session.user.id);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load sessions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
