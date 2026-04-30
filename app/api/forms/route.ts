import { NextResponse } from "next/server";

import { buildForms } from "@/lib/forms-api";
import type { Form } from "@/lib/forms";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CreateFormBody = {
  title?: string;
  description?: string;
};

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: forms, error: formsError } = await supabase
    .from("forms")
    .select("id, title, description, created_by")
    .order("created_at", { ascending: true });

  if (formsError) {
    return NextResponse.json({ error: formsError.message }, { status: 500 });
  }

  if (!forms || forms.length === 0) {
    return NextResponse.json({ forms: [] satisfies Form[] });
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
    .select("id, title, description, created_by")
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
      questions: [],
    } satisfies Form,
  });
}
