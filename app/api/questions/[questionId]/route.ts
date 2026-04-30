import { NextResponse } from "next/server";

import type { QuestionType } from "@/lib/forms";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ questionId: string }>;
};

type UpdateQuestionBody = {
  prompt?: string;
  type?: QuestionType;
  options?: string[];
  correctAnswer?: string | null;
  points?: number;
};

export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { questionId } = await params;
  const body = (await request.json()) as UpdateQuestionBody;
  const prompt = body.prompt?.trim();
  const points = Math.max(1, Math.min(1000, Math.floor(Number(body.points) || 1)));

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  const type = body.type;
  if (type !== "multipleChoice" && type !== "text") {
    return NextResponse.json({ error: "Invalid question type." }, { status: 400 });
  }

  const options =
    type === "multipleChoice"
      ? (body.options ?? [])
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      : [];
  const rawCorrectAnswer = typeof body.correctAnswer === "string" ? body.correctAnswer.trim() : "";
  const correctAnswer = type === "multipleChoice" && rawCorrectAnswer ? rawCorrectAnswer : null;
  if (type === "multipleChoice" && correctAnswer && !options.includes(correctAnswer)) {
    return NextResponse.json(
      { error: "Correct answer must match one of the multiple choice options." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("questions")
    .update({
      prompt,
      question_type: type,
      options,
      correct_answer: type === "multipleChoice" ? correctAnswer : null,
      points,
    })
    .eq("id", questionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { questionId } = await params;

  const { error } = await supabase.from("questions").delete().eq("id", questionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
