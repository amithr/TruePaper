import { NextResponse } from "next/server";
import { z } from "zod";

import type { Form } from "@/lib/forms";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const templateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(600).default(""),
  questions: z
    .array(
      z.object({
        prompt: z.string().trim().min(1).max(500),
        type: z.enum(["multipleChoice", "text"]),
        options: z.array(z.string().trim().min(1).max(200)).max(8).optional().default([]),
        correctAnswer: z.string().trim().min(1).max(200).nullable().optional(),
        points: z.number().int().min(1).max(1000).optional().default(1),
      }),
    )
    .min(1)
    .max(100),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can create forms from templates." }, { status: 403 });
  }

  const payload = (await request.json()) as unknown;
  const parsed = templateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid template JSON format." }, { status: 400 });
  }
  const template = parsed.data;

  const normalizedQuestions = template.questions.map((question, index) => {
    if (question.type === "text") {
      return {
        prompt: question.prompt.trim(),
        type: "text" as const,
        options: [] as string[],
        correctAnswer: null as string | null,
        points: question.points,
        displayOrder: index,
      };
    }
    const options = Array.from(
      new Set(question.options.map((value) => value.trim()).filter((value) => value.length > 0)),
    ).slice(0, 8);
    const safeOptions = options.length >= 2 ? options : ["Option 1", "Option 2"];
    const correct = question.correctAnswer?.trim() ?? "";
    return {
      prompt: question.prompt.trim(),
      type: "multipleChoice" as const,
      options: safeOptions,
      correctAnswer: correct && safeOptions.includes(correct) ? correct : null,
      points: question.points,
      displayOrder: index,
    };
  });

  const { data: formRow, error: formError } = await supabase
    .from("forms")
    .insert({
      title: template.title.trim(),
      description: template.description.trim(),
      created_by: session.user.id,
    })
    .select("id, title, description, created_by")
    .single();

  if (formError || !formRow) {
    return NextResponse.json({ error: formError?.message ?? "Failed to create form." }, { status: 500 });
  }

  const { data: questionRows, error: questionError } = await supabase
    .from("questions")
    .insert(
      normalizedQuestions.map((question) => ({
        form_id: formRow.id,
        prompt: question.prompt,
        question_type: question.type,
        options: question.options,
        correct_answer: question.correctAnswer,
        points: question.points,
        display_order: question.displayOrder,
      })),
    )
    .select("id, prompt, question_type, options, correct_answer, points, display_order")
    .order("display_order", { ascending: true });

  if (questionError) {
    return NextResponse.json({ error: questionError.message }, { status: 500 });
  }

  return NextResponse.json({
    form: {
      id: formRow.id,
      title: formRow.title,
      description: formRow.description ?? "",
      createdBy: formRow.created_by,
      questions: (questionRows ?? []).map((question) => ({
        id: question.id,
        prompt: question.prompt,
        type: question.question_type,
        options: Array.isArray(question.options)
          ? question.options.filter((value): value is string => typeof value === "string")
          : [],
        correctAnswer: question.question_type === "multipleChoice" ? question.correct_answer : null,
        points: Math.max(1, Math.floor(Number(question.points) || 1)),
        displayOrder: question.display_order,
      })),
    } satisfies Form,
  });
}
