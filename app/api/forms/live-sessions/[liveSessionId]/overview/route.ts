import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { countAnsweredQuestions } from "@/lib/count-answered-questions";
import { parseQuestionGrades, sumEarnedPoints, sumPossiblePoints } from "@/lib/exam-grades";
import { isMissingColumnError } from "@/lib/is-missing-db-column";
import {
  OVERVIEW_STATUS_BUCKET_MS,
  overviewFingerprint,
  type OverviewFingerprintPresence,
} from "@/lib/overview-fingerprint";
import {
  liveSessionRosterPreview,
  rosterPreviewQuestionIds,
  textAnswerWordCount,
} from "@/lib/live-typing-preview";
import { parseStudentAnswersJson } from "@/lib/student-answers-json";
import { finalizeLiveSessionIfClosed } from "@/lib/live-session-finalize";
import { computeLiveParticipantUiStatus } from "@/lib/participant-status";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const FORM_RESPONSES_OVERVIEW_SELECT_WITH_NAME =
  "anonymous_session_id, student_display_name, answers, suspended_at, finished_at, text_graded_at, text_grades, last_activity_at, last_typing_at, updated_at";
const FORM_RESPONSES_OVERVIEW_SELECT_LEGACY =
  "anonymous_session_id, answers, suspended_at, finished_at, last_activity_at, last_typing_at, updated_at";

type FormResponseOverviewRow = {
  anonymous_session_id: string | null;
  student_display_name?: string | null;
  answers?: unknown;
  suspended_at: string | null;
  finished_at: string | null;
  text_graded_at?: string | null;
  text_grades?: unknown;
  last_activity_at: string | null;
  last_typing_at: string | null;
  updated_at: string;
};

type PresenceOverviewRow = {
  anonymous_session_id: string | null;
  last_activity_at: string | null;
  last_typing_at: string | null;
  last_seen_at?: string | null;
  sync_state?: string | null;
  pending_sync_count?: number | null;
  hand_raise_question_id?: string | null;
  hand_raised_at?: string | null;
};

type Params = {
  params: Promise<{ liveSessionId: string }>;
};

function sessionWindowOpen(opensAt: string, closesAt: string, nowMs: number): boolean {
  return nowMs >= new Date(opensAt).getTime() && nowMs <= new Date(closesAt).getTime();
}

export async function GET(request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can view session details." }, { status: 403 });
  }

  const { data: fs, error: fsError } = await supabase
    .from("form_sessions")
    .select("id, join_code, opens_at, closes_at, form_id, forms ( title )")
    .eq("id", liveSessionId)
    .eq("created_by", session.user.id)
    .maybeSingle();

  if (fsError) {
    return NextResponse.json({ error: fsError.message }, { status: 500 });
  }

  if (!fs) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const forms = fs.forms as { title: string } | { title: string }[] | null;
  const formTitle = Array.isArray(forms) ? forms[0]?.title : forms?.title;

  const nowMs = Date.now();
  const windowOpen = sessionWindowOpen(fs.opens_at, fs.closes_at, nowMs);
  if (!windowOpen) {
    try {
      await finalizeLiveSessionIfClosed(supabase, liveSessionId);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Could not finalize session." },
        { status: 500 },
      );
    }
  }

  const primary = await supabase
    .from("form_responses")
    .select(FORM_RESPONSES_OVERVIEW_SELECT_WITH_NAME)
    .eq("live_session_id", liveSessionId)
    .is("student_id", null);

  let rows: FormResponseOverviewRow[] | null = primary.data as FormResponseOverviewRow[] | null;
  let rowsError = primary.error;

  if (rowsError && isMissingColumnError(rowsError, "student_display_name")) {
    const retry = await supabase
      .from("form_responses")
      .select(FORM_RESPONSES_OVERVIEW_SELECT_LEGACY)
      .eq("live_session_id", liveSessionId)
      .is("student_id", null);
    rows = retry.data as FormResponseOverviewRow[] | null;
    rowsError = retry.error;
  }

  if (rowsError && isMissingColumnError(rowsError, "text_graded_at")) {
    const retry = await supabase
      .from("form_responses")
      .select(FORM_RESPONSES_OVERVIEW_SELECT_WITH_NAME.replace(", text_graded_at, text_grades", ""))
      .eq("live_session_id", liveSessionId)
      .is("student_id", null);
    rows = retry.data as FormResponseOverviewRow[] | null;
    rowsError = retry.error;
  }

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  // Activity/typing live in the narrow presence table (heartbeats no longer
  // rewrite form_responses). Fall back to the row columns if presence is empty
  // (e.g. before the scale migration backfill ran).
  const presenceByDevice = new Map<
    string,
    {
      lastActivityAt: string | null;
      lastTypingAt: string | null;
      lastSeenAt: string | null;
      syncState: "synced" | "pending" | "offline";
      pendingSyncCount: number;
      handRaiseQuestionId: string | null;
      handRaisedAt: string | null;
    }
  >();
  const presencePrimary = await supabase
    .from("live_session_presence")
    .select(
      "anonymous_session_id, last_activity_at, last_typing_at, last_seen_at, sync_state, pending_sync_count, hand_raise_question_id, hand_raised_at",
    )
    .eq("live_session_id", liveSessionId);

  const presenceMissingHand = presencePrimary.error
    ? isMissingColumnError(presencePrimary.error, "hand_raised_at") ||
      isMissingColumnError(presencePrimary.error, "hand_raise_question_id")
    : false;
  const presenceMissingSync =
    presencePrimary.error && isMissingColumnError(presencePrimary.error, "sync_state");
  const presenceMissingLastSeen =
    presencePrimary.error && isMissingColumnError(presencePrimary.error, "last_seen_at");
  const presenceNeedsRetry =
    Boolean(presenceMissingSync) || Boolean(presenceMissingHand) || Boolean(presenceMissingLastSeen);

  // Retry with progressively fewer columns for DBs that predate a migration.
  const reducedPresenceSelect = presenceMissingSync
    ? "anonymous_session_id, last_activity_at, last_typing_at"
    : presenceMissingHand
      ? "anonymous_session_id, last_activity_at, last_typing_at, sync_state, pending_sync_count"
      : "anonymous_session_id, last_activity_at, last_typing_at, sync_state, pending_sync_count, hand_raise_question_id, hand_raised_at";

  const presenceRows = (
    presenceNeedsRetry
      ? (
          await supabase
            .from("live_session_presence")
            .select(reducedPresenceSelect)
            .eq("live_session_id", liveSessionId)
        ).data
      : presencePrimary.data
  ) as PresenceOverviewRow[] | null;

  if (!presencePrimary.error || presenceNeedsRetry) {
    for (const p of presenceRows ?? []) {
      const device = p.anonymous_session_id?.toLowerCase();
      if (device) {
        const rawState = p.sync_state;
        const syncState =
          rawState === "pending" || rawState === "offline" || rawState === "synced"
            ? rawState
            : "synced";
        presenceByDevice.set(device, {
          lastActivityAt: p.last_activity_at ?? null,
          lastTypingAt: p.last_typing_at ?? null,
          lastSeenAt: typeof p.last_seen_at === "string" ? p.last_seen_at : null,
          syncState,
          pendingSyncCount: Math.max(0, Number(p.pending_sync_count) || 0),
          handRaiseQuestionId:
            typeof p.hand_raise_question_id === "string" ? p.hand_raise_question_id : null,
          handRaisedAt: typeof p.hand_raised_at === "string" ? p.hand_raised_at : null,
        });
      }
    }
  }

  const { data: questionRows, error: qError } = await supabase
    .from("questions")
    .select("id, points, question_type")
    .eq("form_id", fs.form_id as string);

  if (qError) {
    return NextResponse.json({ error: qError.message }, { status: 500 });
  }

  const questions = (questionRows ?? []).map((q) => ({
    id: q.id as string,
    points: Math.max(1, Math.floor(Number(q.points) || 1)),
    type: q.question_type as string,
  }));
  const questionIds = questions.map((q) => q.id);
  const previewQuestions = questions.map((q) => ({ id: q.id, type: q.type }));
  const textQuestionIds = rosterPreviewQuestionIds(previewQuestions);
  const questionTotal = questionIds.length;
  const pointsPossible = sumPossiblePoints(questions);

  // Conditional GET: if nothing that affects the payload changed since the
  // client's last fetch, skip parsing answers + building participants entirely.
  const serverNowIso = new Date(nowMs).toISOString();
  const questionsSig = [...questions]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((q) => `${q.id}:${q.points}:${q.type}`)
    .join(",");
  const fingerprintPresence = new Map<string, OverviewFingerprintPresence>();
  for (const [device, pres] of presenceByDevice) {
    fingerprintPresence.set(device, {
      syncState: pres.syncState,
      pendingSyncCount: pres.pendingSyncCount,
      lastActivityAt: pres.lastActivityAt,
      lastTypingAt: pres.lastTypingAt,
      lastSeenAt: pres.lastSeenAt,
      handRaiseQuestionId: pres.handRaiseQuestionId,
      handRaisedAt: pres.handRaisedAt,
    });
  }
  const canonical = overviewFingerprint({
    windowOpen,
    questionsSig,
    timeBucket: Math.floor(nowMs / OVERVIEW_STATUS_BUCKET_MS),
    rows: (rows ?? []).map((r) => ({
      anonymousSessionId: r.anonymous_session_id ?? null,
      displayName: (r.student_display_name as string | null | undefined) ?? null,
      updatedAt: r.updated_at ?? null,
      suspendedAt: r.suspended_at ?? null,
      finishedAt: r.finished_at ?? null,
      gradedAt: (r.text_graded_at as string | null | undefined) ?? null,
    })),
    presenceByDevice: fingerprintPresence,
  });
  const etag = `"${createHash("sha1").update(canonical).digest("base64")}"`;

  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        // Still refresh the client's server-clock offset on a 304.
        "X-Server-Now": serverNowIso,
        "Cache-Control": "no-store",
      },
    });
  }

  const participants = (rows ?? []).map((r) => {
    const suspendedAt = r.suspended_at as string | null;
    const finishedAt = r.finished_at as string | null;
    const gradedAt = (r.text_graded_at as string | null | undefined) ?? null;
    const deviceKey = (r.anonymous_session_id as string | null)?.toLowerCase() ?? "";
    const pres = presenceByDevice.get(deviceKey);
    const lastActivityAt = pres?.lastActivityAt ?? (r.last_activity_at as string | null);
    const lastTypingAt = pres?.lastTypingAt ?? (r.last_typing_at as string | null);
    const syncState = pres?.syncState ?? "synced";
    const pendingSyncCount = pres?.pendingSyncCount ?? 0;
    const grades = parseQuestionGrades(r.text_grades);
    const pointsEarned = gradedAt ? sumEarnedPoints(grades, questions) : null;
    const answers = parseStudentAnswersJson(r.answers);
    const answeredCount = countAnsweredQuestions(answers, questionIds);
    const textPreview = liveSessionRosterPreview(answers, previewQuestions);
    const textWordCount = textAnswerWordCount(answers, textQuestionIds);
    return {
      anonymousSessionId: r.anonymous_session_id as string,
      displayName: (r.student_display_name as string | null | undefined)?.trim() ?? "",
      status: computeLiveParticipantUiStatus(
        { suspendedAt, finishedAt, gradedAt, lastActivityAt, lastTypingAt },
        windowOpen,
      ),
      suspendedAt,
      finishedAt,
      gradedAt,
      pointsEarned,
      pointsPossible: gradedAt ? pointsPossible : null,
      answeredCount,
      textPreview,
      textWordCount,
      lastActivityAt,
      lastTypingAt,
      lastSeenAt: pres?.lastSeenAt ?? null,
      syncState,
      pendingSyncCount,
      handRaiseQuestionId: pres?.handRaiseQuestionId ?? null,
      handRaisedAt: pres?.handRaisedAt ?? null,
      updatedAt: r.updated_at as string,
    };
  });

  return NextResponse.json(
    {
      session: {
        id: fs.id,
        joinCode: fs.join_code,
        opensAt: fs.opens_at,
        closesAt: fs.closes_at,
        formId: fs.form_id,
        formTitle: formTitle?.trim() || "Form",
        sessionOpen: windowOpen,
        questionTotal,
        textQuestionIds,
        previewQuestions,
      },
      participants,
      // Authoritative server clock so the teacher's client can correct for local
      // clock skew when judging presence staleness (last_seen_at is server time).
      serverNow: serverNowIso,
    },
    {
      headers: {
        ETag: etag,
        "X-Server-Now": serverNowIso,
        "Cache-Control": "no-store",
      },
    },
  );
}
