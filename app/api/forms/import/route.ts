import { NextResponse } from "next/server";

import { AiExamParseError, parseAiExamDocument } from "@/lib/ai-exam-import";
import { buildForms } from "@/lib/forms-api";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ImportBody = {
  /** The parsed exam document, or the raw uploaded JSON at the root. */
  document?: unknown;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can import exams." }, { status: 403 });
  }

  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return NextResponse.json({ error: "The uploaded file is not valid JSON." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseAiExamDocument(body.document ?? body);
  } catch (error) {
    if (error instanceof AiExamParseError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json({ error: "Could not read the exam file." }, { status: 422 });
  }

  const { data: formRow, error: formError } = await supabase
    .from("forms")
    .insert({
      title: parsed.title,
      description: parsed.description,
      created_by: session.user.id,
    })
    .select("id, title, description, created_by, live_teacher_feedback_enabled")
    .single();

  if (formError || !formRow) {
    return NextResponse.json(
      { error: formError?.message ?? "Failed to create form." },
      { status: 500 },
    );
  }

  const questionInserts = parsed.questions.map((question, index) => ({
    form_id: formRow.id,
    prompt: question.prompt,
    question_type: question.type,
    options: question.options,
    correct_answer: question.correctAnswer,
    points: question.points,
    display_order: index,
    response_config: question.responseConfig,
  }));

  const { data: questionRows, error: questionsError } = await supabase
    .from("questions")
    .insert(questionInserts)
    .select(
      "id, form_id, prompt, question_type, options, correct_answer, points, display_order, response_config",
    );

  if (questionsError) {
    // Avoid leaving an empty orphan form behind if question insert fails.
    await supabase.from("forms").delete().eq("id", formRow.id);
    return NextResponse.json({ error: questionsError.message }, { status: 500 });
  }

  const [form] = buildForms([formRow], questionRows ?? []);
  return NextResponse.json({ form });
}
