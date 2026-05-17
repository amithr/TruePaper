import { NextResponse } from "next/server";

import { finalizeLiveSessionIfClosed } from "@/lib/live-session-finalize";
import { isMissingColumnError } from "@/lib/is-missing-db-column";
import { isLiveParticipantActivelyEngaged } from "@/lib/participant-status";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SuspendedStudentRow, TeacherSessionSummary } from "@/lib/teacher-sessions";

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

type SuspensionQueryRow = {
  live_session_id: string | null;
  anonymous_session_id: string | null;
  student_display_name?: string | null;
  suspended_at: string | null;
};

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
  const nowMs = Date.now();
  const windowOpenBySessionId = new Map(
    sessions.map((s) => [s.id, sessionWindowOpen(s.opens_at, s.closes_at, nowMs)]),
  );

  const runningIds = sessions.filter((s) => windowOpenBySessionId.get(s.id)).map((s) => s.id);

  // Finalize closed sessions in the background — do not block the dashboard response.
  for (const s of sessions) {
    if (!windowOpenBySessionId.get(s.id)) {
      void finalizeLiveSessionIfClosed(supabase, s.id).catch(() => {
        /* best-effort */
      });
    }
  }

  const assigned = new Map<string, number>();
  const inProgress = new Map<string, number>();
  const finished = new Map<string, number>();

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

  const suspensionsBySession: Record<string, SuspendedStudentRow[]> = {};
  if (runningIds.length > 0) {
    const primary = await supabase
      .from("form_responses")
      .select("live_session_id, anonymous_session_id, student_display_name, suspended_at")
      .in("live_session_id", runningIds)
      .not("suspended_at", "is", null);

    let suspensionRows: SuspensionQueryRow[] | null = primary.data as SuspensionQueryRow[] | null;
    let suspensionError = primary.error;

    if (suspensionError && isMissingColumnError(suspensionError, "student_display_name")) {
      const retry = await supabase
        .from("form_responses")
        .select("live_session_id, anonymous_session_id, suspended_at")
        .in("live_session_id", runningIds)
        .not("suspended_at", "is", null);
      suspensionRows = retry.data as SuspensionQueryRow[] | null;
      suspensionError = retry.error;
    }

    if (suspensionError) {
      return NextResponse.json({ error: suspensionError.message }, { status: 500 });
    }

    for (const row of suspensionRows ?? []) {
      const lid = row.live_session_id;
      const deviceId = row.anonymous_session_id;
      if (!lid || !deviceId || !row.suspended_at) {
        continue;
      }
      const list = suspensionsBySession[lid] ?? [];
      list.push({
        anonymousSessionId: deviceId,
        displayName: row.student_display_name?.trim() ?? "",
        suspendedAt: row.suspended_at,
      });
      suspensionsBySession[lid] = list;
    }
  }

  return NextResponse.json({ sessions: summaries, suspensionsBySession });
}
