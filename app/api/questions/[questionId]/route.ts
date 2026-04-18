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

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  const type = body.type;
  if (type !== "multipleChoice" && type !== "text") {
    return NextResponse.json({ error: "Invalid question type." }, { status: 400 });
  }

  const options = type === "multipleChoice" ? body.options ?? [] : [];

  const { error } = await supabase
    .from("questions")
    .update({
      prompt,
      question_type: type,
      options,
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
