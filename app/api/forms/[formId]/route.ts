import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ formId: string }>;
};

type UpdateFormBody = {
  title?: string;
  description?: string;
  liveTeacherFeedbackEnabled?: boolean;
};

export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can edit forms." }, { status: 403 });
  }

  const { formId } = await params;
  const body = (await request.json()) as UpdateFormBody;
  const title = body.title?.trim();
  const description = body.description?.trim();

  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  const patch: { title: string; description: string; live_teacher_feedback_enabled?: boolean } = {
    title,
    description: description ?? "",
  };
  if (typeof body.liveTeacherFeedbackEnabled === "boolean") {
    patch.live_teacher_feedback_enabled = body.liveTeacherFeedbackEnabled;
  }

  const { data, error } = await supabase
    .from("forms")
    .update(patch)
    .eq("id", formId)
    .eq("created_by", session.user.id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data?.length) {
    return NextResponse.json(
      { error: "Form not found or you do not have access." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can delete forms." }, { status: 403 });
  }

  const { formId } = await params;

  const { data, error } = await supabase.from("forms").delete().eq("id", formId).select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data?.length) {
    return NextResponse.json({ error: "Form not found or you do not have access." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
