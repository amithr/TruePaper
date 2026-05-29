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
  correctAnswer?: string | null;
  points?: number;
};

export async function POST(request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can add questions." }, { status: 403 });
  }

  const { formId } = await params;
  const body = (await request.json()) as CreateQuestionBody;
  const type = body.type;
  const points = Math.max(1, Math.min(1000, Math.floor(Number(body.points) || 1)));

  if (type !== "multipleChoice" && type !== "text") {
    return NextResponse.json({ error: "Invalid question type." }, { status: 400 });
  }

  const { data: formOwner, error: formOwnerError } = await supabase
    .from("forms")
    .select("id")
    .eq("id", formId)
    .eq("created_by", session.user.id)
    .maybeSingle();

  if (formOwnerError) {
    return NextResponse.json({ error: formOwnerError.message }, { status: 500 });
  }

  if (!formOwner) {
    return NextResponse.json(
      { error: "Form not found or you do not have access." },
      { status: 404 },
    );
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
    type === "multipleChoice"
      ? body.options && body.options.length > 0
        ? body.options.map((value) => value.trim())
        : ["Option 1", "Option 2"]
      : [];
  const requestedCorrectAnswer =
    type === "multipleChoice" ? (typeof body.correctAnswer === "string" ? body.correctAnswer.trim() : "") : "";
  const correctAnswer =
    type === "multipleChoice" && requestedCorrectAnswer && options.includes(requestedCorrectAnswer)
      ? requestedCorrectAnswer
      : null;

  const { data, error } = await supabase
    .from("questions")
    .insert({
      form_id: formId,
      prompt,
      question_type: type,
      options,
      correct_answer: correctAnswer,
      points,
      display_order: displayOrder,
    })
    .select("id, prompt, question_type, options, correct_answer, points, display_order")
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
      correctAnswer: data.question_type === "multipleChoice" ? data.correct_answer : null,
      points: Math.max(1, Math.floor(Number(data.points) || 1)),
      displayOrder: data.display_order,
    } satisfies Question,
  });
}
