import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseTextQuestionGrades } from "@/lib/text-grades";

type Params = {
  params: Promise<{ liveSessionId: string; deviceId: string }>;
};

type Body = {
  questionId?: string;
  score?: number;
  feedback?: string;
};

function toTwoSentences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  const parts = trimmed.match(/[^.!?]+[.!?]?/g)?.map((p) => p.trim()).filter(Boolean) ?? [];
  return parts.slice(0, 2).join(" ").trim();
}

export async function PATCH(request: Request, { params }: Params) {
  const { liveSessionId, deviceId } = await params;
  const body = (await request.json()) as Body;
  const questionId = body.questionId?.trim() ?? "";
  const feedbackRaw = body.feedback?.trim() ?? "";
  const score = Math.max(0, Math.min(5, Math.round(Number(body.score) || 0)));

  if (!questionId) {
    return NextResponse.json({ error: "questionId is required." }, { status: 400 });
  }
  if (!feedbackRaw) {
    return NextResponse.json({ error: "Feedback is required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can edit feedback." }, { status: 403 });
  }

  const { data: owned, error: ownedError } = await supabase
    .from("form_sessions")
    .select("id")
    .eq("id", liveSessionId)
    .eq("created_by", session.user.id)
    .maybeSingle();
  if (ownedError) {
    return NextResponse.json({ error: ownedError.message }, { status: 500 });
  }
  if (!owned) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const { data: responseRow, error: responseError } = await supabase
    .from("form_responses")
    .select("id, text_grades")
    .eq("live_session_id", liveSessionId)
    .eq("anonymous_session_id", decodeURIComponent(deviceId))
    .is("student_id", null)
    .maybeSingle();
  if (responseError) {
    return NextResponse.json({ error: responseError.message }, { status: 500 });
  }
  if (!responseRow) {
    return NextResponse.json({ error: "Student response not found." }, { status: 404 });
  }

  const existing = parseTextQuestionGrades(responseRow.text_grades);
  const gradedAt = new Date().toISOString();
  existing[questionId] = {
    score,
    feedback: toTwoSentences(feedbackRaw),
    gradedAt,
  };

  const { error: updateError } = await supabase
    .from("form_responses")
    .update({
      text_grades: existing,
      text_graded_at: gradedAt,
    })
    .eq("id", responseRow.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, gradedAt });
}
