import { NextResponse } from "next/server";

import { isMissingColumnError } from "@/lib/is-missing-db-column";
import { parseLiveTeacherFeedback } from "@/lib/live-teacher-feedback";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ liveSessionId: string; deviceId: string }>;
};

type Body = {
  questionId?: string;
  message?: string;
};

const MAX_MESSAGE_LEN = 2000;

export async function PATCH(request: Request, { params }: Params) {
  const { liveSessionId, deviceId: rawDeviceId } = await params;
  const deviceId = decodeURIComponent(rawDeviceId).trim();
  const body = (await request.json()) as Body;
  const questionId = body.questionId?.trim() ?? "";
  const message = (body.message ?? "").trim().slice(0, MAX_MESSAGE_LEN);

  if (!questionId) {
    return NextResponse.json({ error: "questionId is required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can send live feedback." }, { status: 403 });
  }

  const { data: fs, error: fsError } = await supabase
    .from("form_sessions")
    .select("id, form_id, forms ( live_teacher_feedback_enabled )")
    .eq("id", liveSessionId)
    .eq("created_by", session.user.id)
    .maybeSingle();

  if (fsError) {
    if (isMissingColumnError(fsError, "live_teacher_feedback_enabled")) {
      return NextResponse.json(
        {
          error:
            "Database is missing live_teacher_feedback_enabled on forms. Run migration 20260516120000_live_teacher_feedback.sql.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: fsError.message }, { status: 500 });
  }
  if (!fs) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const formNested = fs.forms as { live_teacher_feedback_enabled?: boolean } | { live_teacher_feedback_enabled?: boolean }[] | null;
  const formRow = Array.isArray(formNested) ? formNested[0] : formNested;
  if (!formRow?.live_teacher_feedback_enabled) {
    return NextResponse.json(
      { error: "Live teacher feedback is not enabled for this form." },
      { status: 400 },
    );
  }

  const { data: question, error: qError } = await supabase
    .from("questions")
    .select("id, question_type")
    .eq("id", questionId)
    .eq("form_id", fs.form_id as string)
    .maybeSingle();

  if (qError) {
    return NextResponse.json({ error: qError.message }, { status: 500 });
  }
  if (!question || question.question_type !== "text") {
    return NextResponse.json({ error: "Question not found or not a text question." }, { status: 404 });
  }

  const { data: responseRow, error: responseError } = await supabase
    .from("form_responses")
    .select("id, live_teacher_feedback")
    .eq("live_session_id", liveSessionId)
    .eq("anonymous_session_id", deviceId)
    .is("student_id", null)
    .maybeSingle();

  if (responseError) {
    if (isMissingColumnError(responseError, "live_teacher_feedback")) {
      return NextResponse.json(
        {
          error:
            "Database is missing live_teacher_feedback on form_responses. Run migration 20260516120000_live_teacher_feedback.sql.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: responseError.message }, { status: 500 });
  }
  if (!responseRow) {
    return NextResponse.json({ error: "Student response not found." }, { status: 404 });
  }

  const existing = parseLiveTeacherFeedback(responseRow.live_teacher_feedback);
  if (message) {
    existing[questionId] = message;
  } else {
    delete existing[questionId];
  }

  const { error: updateError } = await supabase
    .from("form_responses")
    .update({ live_teacher_feedback: existing })
    .eq("id", responseRow.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, liveTeacherFeedback: existing });
}
