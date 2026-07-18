import { NextResponse } from "next/server";

import { FORM_ASSETS_BUCKET } from "@/lib/form-assets";
import type { QuestionType } from "@/lib/forms";
import { parseResponseConfig } from "@/lib/response-types/registry";
import { isValidQuestionType } from "@/lib/response-types/valid-types";
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
  responseConfig?: unknown;
};

export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can edit questions." }, { status: 403 });
  }

  const { questionId } = await params;
  const body = (await request.json()) as UpdateQuestionBody;
  const prompt = body.prompt?.trim();
  const points = Math.max(1, Math.min(1000, Math.floor(Number(body.points) || 1)));

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  const type = body.type;
  if (!type || !isValidQuestionType(type)) {
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

  const { data, error } = await supabase
    .from("questions")
    .update({
      prompt,
      question_type: type,
      options,
      correct_answer: type === "multipleChoice" ? correctAnswer : null,
      points,
      response_config: parseResponseConfig(type, body.responseConfig),
    })
    .eq("id", questionId)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data?.length) {
    return NextResponse.json(
      { error: "Question not found or you do not have access." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can delete questions." }, { status: 403 });
  }

  const { questionId } = await params;

  const { data: existing, error: existingError } = await supabase
    .from("questions")
    .select("id, prompt_image_path")
    .eq("id", questionId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json(
      { error: "Question not found or you do not have access." },
      { status: 404 },
    );
  }

  const { data, error } = await supabase
    .from("questions")
    .delete()
    .eq("id", questionId)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data?.length) {
    return NextResponse.json(
      { error: "Question not found or you do not have access." },
      { status: 404 },
    );
  }

  const imagePath =
    typeof existing.prompt_image_path === "string" ? existing.prompt_image_path : null;
  if (imagePath) {
    await supabase.storage.from(FORM_ASSETS_BUCKET).remove([imagePath]);
  }

  return NextResponse.json({ ok: true });
}
