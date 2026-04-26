import { NextResponse } from "next/server";

import type { StudentAnswers } from "@/lib/forms";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ formId: string }>;
};

type SaveResponseBody = {
  answers?: StudentAnswers;
};

export async function GET(_: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { formId } = await params;

  const { data, error } = await supabase
    .from("form_responses")
    .select("answers")
    .eq("form_id", formId)
    .eq("student_id", session.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const answers: StudentAnswers =
    data && typeof data.answers === "object" && data.answers !== null
      ? Object.fromEntries(
          Object.entries(data.answers).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {};

  return NextResponse.json({ answers });
}

export async function PUT(request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { formId } = await params;
  const body = (await request.json()) as SaveResponseBody;
  const answers = body.answers ?? {};

  const { error } = await supabase.from("form_responses").upsert(
    {
      form_id: formId,
      student_id: session.user.id,
      anonymous_session_id: null,
      answers,
    },
    {
      onConflict: "form_id,student_id",
    },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
