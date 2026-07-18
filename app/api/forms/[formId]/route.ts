import { NextResponse } from "next/server";

import { FORM_ASSETS_BUCKET } from "@/lib/form-assets";
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

  const patch: {
    title?: string;
    description?: string;
    live_teacher_feedback_enabled?: boolean;
  } = {};

  // Partial PATCH: only validate/update fields the client actually sent.
  // (Start-session toggles live feedback without re-sending title.)
  if (body.title !== undefined) {
    const title = body.title.trim();
    if (!title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }
    patch.title = title;
  }
  if (body.description !== undefined) {
    patch.description = body.description.trim();
  }
  if (typeof body.liveTeacherFeedbackEnabled === "boolean") {
    patch.live_teacher_feedback_enabled = body.liveTeacherFeedbackEnabled;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No updates provided." }, { status: 400 });
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

  const { data: formRow, error: formLookupError } = await supabase
    .from("forms")
    .select("id, description_image_path")
    .eq("id", formId)
    .eq("created_by", session.user.id)
    .maybeSingle();

  if (formLookupError) {
    return NextResponse.json({ error: formLookupError.message }, { status: 500 });
  }
  if (!formRow) {
    return NextResponse.json({ error: "Form not found or you do not have access." }, { status: 404 });
  }

  const { data: questionRows } = await supabase
    .from("questions")
    .select("prompt_image_path")
    .eq("form_id", formId);

  const pathsToRemove = [
    typeof formRow.description_image_path === "string" ? formRow.description_image_path : null,
    ...(questionRows ?? []).map((row) =>
      typeof row.prompt_image_path === "string" ? row.prompt_image_path : null,
    ),
  ].filter((path): path is string => Boolean(path));

  const { data, error } = await supabase
    .from("forms")
    .delete()
    .eq("id", formId)
    .eq("created_by", session.user.id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data?.length) {
    return NextResponse.json({ error: "Form not found or you do not have access." }, { status: 404 });
  }

  if (pathsToRemove.length > 0) {
    await supabase.storage.from(FORM_ASSETS_BUCKET).remove(pathsToRemove);
  }

  return NextResponse.json({ ok: true });
}
