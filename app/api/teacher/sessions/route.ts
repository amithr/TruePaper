import { NextResponse } from "next/server";

import { isLiveParticipantActivelyEngaged } from "@/lib/participant-status";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TeacherSessionSummary } from "@/lib/teacher-sessions";

type FormNested = { title: string } | { title: string }[] | null;

function readFormTitle(forms: FormNested): string {
  if (!forms) {
    return "Form";
  }
  const row = Array.isArray(forms) ? forms[0] : forms;
  return row?.title?.trim() || "Form";
}

function sessionWindowOpen(opensAt: string, closesAt: string, nowMs: number): boolean {
  return nowMs >= new Date(opensAt).getTime() && nowMs <= new Date(closesAt).getTime();
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can view sessions." }, { status: 403 });
  }

  const { data: rows, error } = await supabase
    .from("form_sessions")
    .select("id, join_code, opens_at, closes_at, created_at, form_id, forms ( title )")
    .eq("created_by", session.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sessions = (rows ?? []) as Array<{
    id: string;
    join_code: string;
    opens_at: string;
    closes_at: string;
    created_at: string;
    form_id: string;
    forms: FormNested;
  }>;

  const ids = sessions.map((s) => s.id);
  const assigned = new Map<string, number>();
  const inProgress = new Map<string, number>();
  const finished = new Map<string, number>();
  const nowMs = Date.now();
  const windowOpenBySessionId = new Map(
    sessions.map((s) => [s.id, sessionWindowOpen(s.opens_at, s.closes_at, nowMs)]),
  );

  if (ids.length > 0) {
    const { data: responseRows, error: countError } = await supabase
      .from("form_responses")
      .select("live_session_id, suspended_at, finished_at, last_activity_at, last_typing_at")
      .in("live_session_id", ids)
      .is("student_id", null);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    for (const row of responseRows ?? []) {
      const lid = row.live_session_id as string | null;
      if (!lid) {
        continue;
      }
      assigned.set(lid, (assigned.get(lid) ?? 0) + 1);
      if (row.finished_at) {
        finished.set(lid, (finished.get(lid) ?? 0) + 1);
      }
      const windowOpen = windowOpenBySessionId.get(lid) ?? false;
      if (
        isLiveParticipantActivelyEngaged(
          {
            suspendedAt: row.suspended_at as string | null,
            finishedAt: row.finished_at as string | null,
            lastActivityAt: row.last_activity_at as string | null,
            lastTypingAt: row.last_typing_at as string | null,
          },
          windowOpen,
          nowMs,
        )
      ) {
        inProgress.set(lid, (inProgress.get(lid) ?? 0) + 1);
      }
    }
  }

  const summaries: TeacherSessionSummary[] = sessions.map((s) => {
    const a = assigned.get(s.id) ?? 0;
    const ip = inProgress.get(s.id) ?? 0;
    const fin = finished.get(s.id) ?? 0;
    return {
      id: s.id,
      formId: s.form_id,
      formTitle: readFormTitle(s.forms),
      joinCode: s.join_code,
      opensAt: s.opens_at,
      closesAt: s.closes_at,
      createdAt: s.created_at,
      assignedCount: a,
      inProgressCount: ip,
      finishedCount: fin,
      responseCount: a,
    };
  });

  return NextResponse.json({ sessions: summaries });
}
