import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getLlmConfigFromEnv } from "@/lib/ai-model";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StudentAnswers } from "@/lib/forms";

type Params = {
  params: Promise<{ liveSessionId: string }>;
};
type Body = {
  deviceId?: string;
};

const evaluationSchema = z.object({
  evaluations: z.array(
    z.object({
      questionId: z.string(),
      score: z.number().min(0).max(5),
      feedback: z.string().trim().min(1).max(320),
    }),
  ),
});

function parseAnswers(raw: unknown): StudentAnswers {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function toTwoSentences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  const parts = trimmed.match(/[^.!?]+[.!?]?/g)?.map((p) => p.trim()).filter(Boolean) ?? [];
  return parts.slice(0, 2).join(" ").trim();
}

export async function POST(request: Request, { params }: Params) {
  const { liveSessionId } = await params;
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }
  const targetDeviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can run autograding." }, { status: 403 });
  }
  const llm = getLlmConfigFromEnv();
  if (llm.provider !== "openai") {
    return NextResponse.json(
      { error: `Unsupported LLM_PROVIDER "${llm.provider}". Currently supported: openai.` },
      { status: 400 },
    );
  }
  if (!llm.apiKey) {
    return NextResponse.json({ error: "LLM_API_KEY is not configured." }, { status: 503 });
  }
  if (llm.apiKey.includes("REPLACE_WITH_YOUR_OPENAI_KEY")) {
    return NextResponse.json(
      { error: "LLM_API_KEY is still a placeholder. Set a real OpenAI API key in .env.local." },
      { status: 503 },
    );
  }

  const { data: sessionRow, error: sessionError } = await supabase
    .from("form_sessions")
    .select("id, form_id, created_by, closes_at")
    .eq("id", liveSessionId)
    .eq("created_by", session.user.id)
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }
  if (!sessionRow) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  const nowMs = Date.now();
  const closesAtMs = new Date(sessionRow.closes_at as string).getTime();
  if (Number.isFinite(closesAtMs) && nowMs <= closesAtMs) {
    return NextResponse.json(
      { error: "Autograding is only available after the session window has ended." },
      { status: 400 },
    );
  }

  const { data: questionRows, error: questionError } = await supabase
    .from("questions")
    .select("id, prompt, question_type, correct_answer")
    .eq("form_id", sessionRow.form_id)
    .eq("question_type", "text")
    .order("display_order", { ascending: true });

  if (questionError) {
    return NextResponse.json({ error: questionError.message }, { status: 500 });
  }

  if (!questionRows || questionRows.length === 0) {
    return NextResponse.json({ ok: true, gradedCount: 0, message: "No text questions to grade." });
  }

  const textQuestions = questionRows.map((q) => ({
    id: q.id as string,
    prompt: (q.prompt as string) ?? "",
    rubricAnswer: (q.correct_answer as string | null) ?? "",
  }));
  const questionIdSet = new Set(textQuestions.map((q) => q.id));

  let responsesQuery = supabase
    .from("form_responses")
    .select("id, answers, finished_at, anonymous_session_id")
    .eq("live_session_id", liveSessionId)
    .is("student_id", null)
    .not("finished_at", "is", null);
  if (targetDeviceId) {
    responsesQuery = responsesQuery.eq("anonymous_session_id", targetDeviceId);
  }
  const { data: responseRows, error: responseError } = await responsesQuery;

  if (responseError) {
    return NextResponse.json({ error: responseError.message }, { status: 500 });
  }

  const openai = createOpenAI({ apiKey: llm.apiKey });
  const gradedAt = new Date().toISOString();
  let gradedCount = 0;

  for (const row of responseRows ?? []) {
    const responseId = row.id as string;
    const answers = parseAnswers(row.answers);
    const answerPayload = textQuestions
      .map((q) => ({
        questionId: q.id,
        prompt: q.prompt,
        rubricAnswer: q.rubricAnswer || null,
        answer: (answers[q.id] ?? "").trim(),
      }))
      .filter((item) => item.answer.length > 0);

    if (answerPayload.length === 0) {
      continue;
    }

    const { object } = await generateObject({
      model: openai(llm.model),
      schema: evaluationSchema,
      prompt: `
You are grading text answers for a classroom assessment.
Score each answer from 0 to 5.
Return concise feedback in exactly 1-2 short sentences at about a 6th-grade reading level.
Explain why the student got this score and what to improve.
If a rubricAnswer is present, use it as the ideal expected response.

Items to grade:
${JSON.stringify(answerPayload)}
      `,
    });

    const gradeMap: Record<string, { score: number; feedback: string; gradedAt: string }> = {};
    for (const item of object.evaluations) {
      if (!questionIdSet.has(item.questionId)) {
        continue;
      }
      gradeMap[item.questionId] = {
        score: Math.max(0, Math.min(5, Math.round(item.score))),
        feedback: toTwoSentences(item.feedback),
        gradedAt,
      };
    }
    if (Object.keys(gradeMap).length === 0) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("form_responses")
      .update({
        text_grades: gradeMap,
        text_graded_at: gradedAt,
      })
      .eq("id", responseId);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    gradedCount += 1;
  }

  return NextResponse.json({ ok: true, gradedCount, gradedAt, deviceId: targetDeviceId || null });
}
