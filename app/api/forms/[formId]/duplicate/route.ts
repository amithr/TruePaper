import { NextResponse } from "next/server";

import { buildForms } from "@/lib/forms-api";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ formId: string }> };

/**
 * Copy a form and its questions into a new form owned by the same teacher.
 * Images are not copied: `form-assets` objects belong to one form (deleting a form
 * removes them), so sharing paths would break the original. The response says so.
 */
export async function POST(_request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can duplicate forms." }, { status: 403 });
  }

  const { formId } = await params;

  const { data: source, error: sourceError } = await supabase
    .from("forms")
    .select("id, title, description, description_image_path, live_teacher_feedback_enabled")
    .eq("id", formId)
    .eq("created_by", session.user.id)
    .maybeSingle();
  if (sourceError) {
    return NextResponse.json({ error: sourceError.message }, { status: 500 });
  }
  if (!source) {
    return NextResponse.json({ error: "Form not found or you do not have access." }, { status: 404 });
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select(
      "prompt, prompt_image_path, question_type, options, correct_answer, points, display_order, response_config",
    )
    .eq("form_id", formId)
    .order("display_order", { ascending: true });
  if (questionsError) {
    return NextResponse.json({ error: questionsError.message }, { status: 500 });
  }

  const { data: formRow, error: formError } = await supabase
    .from("forms")
    .insert({
      title: `${source.title} (copy)`.slice(0, 200),
      description: source.description ?? "",
      live_teacher_feedback_enabled: source.live_teacher_feedback_enabled ?? false,
      created_by: session.user.id,
    })
    .select("id, title, description, description_image_path, created_by, live_teacher_feedback_enabled")
    .single();
  if (formError || !formRow) {
    return NextResponse.json({ error: formError?.message ?? "Failed to create form." }, { status: 500 });
  }

  const imagesSkipped =
    Boolean(source.description_image_path) || (questions ?? []).some((q) => q.prompt_image_path);

  let questionRows: unknown[] = [];
  if (questions && questions.length > 0) {
    const { data, error } = await supabase
      .from("questions")
      .insert(
        questions.map((q, index) => ({
          form_id: formRow.id,
          prompt: q.prompt,
          question_type: q.question_type,
          options: q.options,
          correct_answer: q.correct_answer,
          points: q.points,
          display_order: index,
          response_config: q.response_config,
        })),
      )
      .select(
        "id, form_id, prompt, prompt_image_path, question_type, options, correct_answer, points, display_order, response_config",
      );
    if (error) {
      await supabase.from("forms").delete().eq("id", formRow.id);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    questionRows = data ?? [];
  }

  const [form] = buildForms([formRow], questionRows as Parameters<typeof buildForms>[1]);
  return NextResponse.json({ form, imagesSkipped });
}
