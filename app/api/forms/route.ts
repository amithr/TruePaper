import { NextResponse } from "next/server";

import { buildFormSummaries, buildForms } from "@/lib/forms-api";
import type { Form } from "@/lib/forms";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CreateFormBody = {
  title?: string;
  description?: string;
};

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const summaryOnly = new URL(request.url).searchParams.get("summary") === "1";

  let formsQuery = supabase
    .from("forms")
    .select("id, title, description, created_by, live_teacher_feedback_enabled")
    .order("created_at", { ascending: true });

  if (session.profile?.role === "teacher") {
    formsQuery = formsQuery.eq("created_by", session.user.id);
  }

  const { data: forms, error: formsError } = await formsQuery;

  if (formsError) {
    return NextResponse.json({ error: formsError.message }, { status: 500 });
  }

  if (!forms || forms.length === 0) {
    return NextResponse.json({ forms: [] satisfies Form[] });
  }

  if (summaryOnly) {
    const formIds = forms.map((form) => form.id);
    const { data: questionRows, error: countError } = await supabase
      .from("questions")
      .select("form_id")
      .in("form_id", formIds);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const questionCountByFormId = new Map<string, number>();
    for (const row of questionRows ?? []) {
      const fid = row.form_id as string;
      questionCountByFormId.set(fid, (questionCountByFormId.get(fid) ?? 0) + 1);
    }

    return NextResponse.json({ forms: buildFormSummaries(forms, questionCountByFormId) });
  }

  const formIds = forms.map((form) => form.id);
  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select("id, form_id, prompt, question_type, options, correct_answer, points, display_order")
    .in("form_id", formIds)
    .order("display_order", { ascending: true });

  if (questionsError) {
    return NextResponse.json({ error: questionsError.message }, { status: 500 });
  }

  return NextResponse.json({ forms: buildForms(forms, questions ?? []) });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can create forms." }, { status: 403 });
  }

  const body = (await request.json()) as CreateFormBody;
  const title = body.title?.trim() || "Untitled Form";
  const description = body.description?.trim() || "";

  const { data, error } = await supabase
    .from("forms")
    .insert({ title, description, created_by: session.user.id })
    .select("id, title, description, created_by, live_teacher_feedback_enabled")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create form" }, { status: 500 });
  }

  return NextResponse.json({
    form: {
      id: data.id,
      title: data.title,
      description: data.description ?? "",
      createdBy: data.created_by,
      liveTeacherFeedbackEnabled: false,
      questions: [],
    } satisfies Form,
  });
}
