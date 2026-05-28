import type { SupabaseClient } from "@supabase/supabase-js";

import { finalizeLiveSessionIfClosed } from "@/lib/live-session-finalize";
import { isMissingColumnError } from "@/lib/is-missing-db-column";
import { isLiveParticipantActivelyEngaged } from "@/lib/participant-status";
import type { SuspendedStudentRow, TeacherSessionSummary } from "@/lib/teacher-sessions";

export const PAST_SESSIONS_PAGE_SIZE = 5;

type FormNested = { title: string } | { title: string }[] | null;

type SessionRow = {
  id: string;
  join_code: string;
  opens_at: string;
  closes_at: string;
  created_at: string;
  form_id: string;
  forms: FormNested;
};

type SuspensionQueryRow = {
  live_session_id: string | null;
  anonymous_session_id: string | null;
  student_display_name?: string | null;
  suspended_at: string | null;
};

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

function rowToSummary(
  s: SessionRow,
  assigned: Map<string, number>,
  inProgress: Map<string, number>,
  finished: Map<string, number>,
  needsGrading: Map<string, number>,
): TeacherSessionSummary {
  const a = assigned.get(s.id) ?? 0;
  const ip = inProgress.get(s.id) ?? 0;
  const fin = finished.get(s.id) ?? 0;
  const ng = needsGrading.get(s.id) ?? 0;
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
    needsGradingCount: ng,
    responseCount: a,
  };
}

const COUNTS_SELECT_WITH_GRADED =
  "live_session_id, suspended_at, finished_at, text_graded_at, last_activity_at, last_typing_at";
const COUNTS_SELECT_LEGACY =
  "live_session_id, suspended_at, finished_at, last_activity_at, last_typing_at";

async function attachResponseCounts(
  supabase: SupabaseClient,
  sessions: SessionRow[],
  nowMs: number,
): Promise<{
  summaries: TeacherSessionSummary[];
  windowOpenBySessionId: Map<string, boolean>;
}> {
  const windowOpenBySessionId = new Map(
    sessions.map((s) => [s.id, sessionWindowOpen(s.opens_at, s.closes_at, nowMs)]),
  );
  const ids = sessions.map((s) => s.id);
  const assigned = new Map<string, number>();
  const inProgress = new Map<string, number>();
  const finished = new Map<string, number>();
  const needsGrading = new Map<string, number>();

  if (ids.length > 0) {
    const primary = await supabase
      .from("form_responses")
      .select(COUNTS_SELECT_WITH_GRADED)
      .in("live_session_id", ids)
      .is("student_id", null);

    let rows = primary.data as Array<Record<string, unknown>> | null;
    let rowsError = primary.error;
    if (rowsError && isMissingColumnError(rowsError, "text_graded_at")) {
      const retry = await supabase
        .from("form_responses")
        .select(COUNTS_SELECT_LEGACY)
        .in("live_session_id", ids)
        .is("student_id", null);
      rows = retry.data as Array<Record<string, unknown>> | null;
      rowsError = retry.error;
    }
    if (rowsError) {
      throw new Error(rowsError.message);
    }

    for (const row of rows ?? []) {
      const lid = row.live_session_id as string | null;
      if (!lid) {
        continue;
      }
      assigned.set(lid, (assigned.get(lid) ?? 0) + 1);
      const finishedAt = row.finished_at as string | null;
      const gradedAt = (row.text_graded_at as string | null | undefined) ?? null;
      if (finishedAt) {
        finished.set(lid, (finished.get(lid) ?? 0) + 1);
        if (!gradedAt) {
          needsGrading.set(lid, (needsGrading.get(lid) ?? 0) + 1);
        }
      }
      const windowOpen = windowOpenBySessionId.get(lid) ?? false;
      if (
        isLiveParticipantActivelyEngaged(
          {
            suspendedAt: row.suspended_at as string | null,
            finishedAt,
            gradedAt,
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

  return {
    summaries: sessions.map((s) =>
      rowToSummary(s, assigned, inProgress, finished, needsGrading),
    ),
    windowOpenBySessionId,
  };
}

async function loadSuspensionsForSessions(
  supabase: SupabaseClient,
  sessionIds: string[],
): Promise<Record<string, SuspendedStudentRow[]>> {
  const suspensionsBySession: Record<string, SuspendedStudentRow[]> = {};
  if (sessionIds.length === 0) {
    return suspensionsBySession;
  }

  const primary = await supabase
    .from("form_responses")
    .select("live_session_id, anonymous_session_id, student_display_name, suspended_at")
    .in("live_session_id", sessionIds)
    .not("suspended_at", "is", null);

  let suspensionRows: SuspensionQueryRow[] | null = primary.data as SuspensionQueryRow[] | null;
  let suspensionError = primary.error;

  if (suspensionError && isMissingColumnError(suspensionError, "student_display_name")) {
    const retry = await supabase
      .from("form_responses")
      .select("live_session_id, anonymous_session_id, suspended_at")
      .in("live_session_id", sessionIds)
      .not("suspended_at", "is", null);
    suspensionRows = retry.data as SuspensionQueryRow[] | null;
    suspensionError = retry.error;
  }

  if (suspensionError) {
    throw new Error(suspensionError.message);
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

  return suspensionsBySession;
}

/** Live sessions only (window open now). */
export async function fetchActiveTeacherSessions(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  sessions: TeacherSessionSummary[];
  suspensionsBySession: Record<string, SuspendedStudentRow[]>;
}> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const { data: rows, error } = await supabase
    .from("form_sessions")
    .select("id, join_code, opens_at, closes_at, created_at, form_id, forms ( title )")
    .eq("created_by", userId)
    .lte("opens_at", nowIso)
    .gte("closes_at", nowIso)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const sessions = (rows ?? []) as SessionRow[];
  const { summaries } = await attachResponseCounts(supabase, sessions, nowMs);
  const suspensionsBySession = await loadSuspensionsForSessions(
    supabase,
    summaries.map((s) => s.id),
  );

  return { sessions: summaries, suspensionsBySession };
}

/** Non-running sessions, newest first, paginated. */
export async function fetchPastTeacherSessions(
  supabase: SupabaseClient,
  userId: string,
  page: number,
  limit: number,
): Promise<{
  sessions: TeacherSessionSummary[];
  total: number;
  page: number;
  limit: number;
}> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const safePage = Math.max(0, page);
  const safeLimit = Math.min(50, Math.max(1, limit));
  const from = safePage * safeLimit;
  const to = from + safeLimit - 1;

  const { data: rows, error, count } = await supabase
    .from("form_sessions")
    .select("id, join_code, opens_at, closes_at, created_at, form_id, forms ( title )", {
      count: "exact",
    })
    .eq("created_by", userId)
    .or(`closes_at.lt.${nowIso},opens_at.gt.${nowIso}`)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  const sessions = (rows ?? []) as SessionRow[];

  for (const s of sessions) {
    if (new Date(s.closes_at).getTime() <= nowMs) {
      void finalizeLiveSessionIfClosed(supabase, s.id).catch(() => {
        /* best-effort */
      });
    }
  }

  const { summaries } = await attachResponseCounts(supabase, sessions, nowMs);

  return {
    sessions: summaries,
    total: count ?? 0,
    page: safePage,
    limit: safeLimit,
  };
}
