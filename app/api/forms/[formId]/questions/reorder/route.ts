import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ formId: string }>;
};

type Body = {
  questionIds?: string[];
};

export async function POST(request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can reorder questions." }, { status: 403 });
  }

  const { formId } = await params;
  const body = (await request.json()) as Body;
  const questionIds = Array.isArray(body.questionIds)
    ? body.questionIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  if (questionIds.length === 0) {
    return NextResponse.json({ error: "questionIds is required." }, { status: 400 });
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

  const { data: existing, error: existingError } = await supabase
    .from("questions")
    .select("id")
    .eq("form_id", formId);

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const existingIds = new Set((existing ?? []).map((row) => row.id as string));
  if (
    questionIds.length !== existingIds.size ||
    questionIds.some((id) => !existingIds.has(id))
  ) {
    return NextResponse.json(
      { error: "questionIds must list every question on this form exactly once." },
      { status: 400 },
    );
  }

  for (let index = 0; index < questionIds.length; index += 1) {
    const id = questionIds[index]!;
    const { error } = await supabase
      .from("questions")
      .update({ display_order: index })
      .eq("id", id)
      .eq("form_id", formId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
