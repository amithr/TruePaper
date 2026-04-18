import { NextResponse } from "next/server";

import type { Question, QuestionType } from "@/lib/forms";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ formId: string }>;
};

type CreateQuestionBody = {
  type?: QuestionType;
  prompt?: string;
  options?: string[];
};

export async function POST(request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { formId } = await params;
  const body = (await request.json()) as CreateQuestionBody;
  const type = body.type;

  if (type !== "multipleChoice" && type !== "text") {
    return NextResponse.json({ error: "Invalid question type." }, { status: 400 });
  }

  const { data: maxOrderData, error: maxOrderError } = await supabase
    .from("questions")
    .select("display_order")
    .eq("form_id", formId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxOrderError) {
    return NextResponse.json({ error: maxOrderError.message }, { status: 500 });
  }

  const displayOrder = (maxOrderData?.display_order ?? -1) + 1;
  const prompt =
    body.prompt?.trim() ||
    (type === "multipleChoice" ? "New multiple choice question" : "New text response question");
  const options =
    type === "multipleChoice" ? (body.options && body.options.length > 0 ? body.options : ["Option 1", "Option 2"]) : [];

  const { data, error } = await supabase
    .from("questions")
    .insert({
      form_id: formId,
      prompt,
      question_type: type,
      options,
      display_order: displayOrder,
    })
    .select("id, prompt, question_type, options, display_order")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create question." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    question: {
      id: data.id,
      prompt: data.prompt,
      type: data.question_type,
      options: Array.isArray(data.options)
        ? data.options.filter((value): value is string => typeof value === "string")
        : [],
      displayOrder: data.display_order,
    } satisfies Question,
  });
}
