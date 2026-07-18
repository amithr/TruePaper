import { NextResponse } from "next/server";

import {
  FORM_ASSETS_BUCKET,
  assertFormAssetSize,
  formAssetPublicUrl,
  formDescriptionAssetPath,
  formQuestionAssetPath,
  isAllowedFormAssetMime,
} from "@/lib/form-assets";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ formId: string }>;
};

type Target = { kind: "description" } | { kind: "question"; questionId: string };

function parseTarget(raw: FormDataEntryValue | null): Target | null {
  if (typeof raw !== "string") {
    return null;
  }
  if (raw === "description") {
    return { kind: "description" };
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
    return { kind: "question", questionId: raw.toLowerCase() };
  }
  return null;
}

async function assertFormOwner(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  formId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data, error } = await supabase
    .from("forms")
    .select("id")
    .eq("id", formId)
    .eq("created_by", userId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }
  if (!data) {
    return { ok: false, status: 404, error: "Form not found or you do not have access." };
  }
  return { ok: true };
}

export async function POST(request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can upload form images." }, { status: 403 });
  }

  const { formId } = await params;
  const owner = await assertFormOwner(supabase, formId, session.user.id);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const target = parseTarget(formData.get("target"));
  if (!target) {
    return NextResponse.json(
      { error: "Target must be 'description' or a question id." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Image file is required." }, { status: 400 });
  }

  try {
    assertFormAssetSize(file.size);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid image size." },
      { status: 400 },
    );
  }

  if (!isAllowedFormAssetMime(file.type)) {
    return NextResponse.json({ error: "Use a JPEG, PNG, or WebP image." }, { status: 400 });
  }

  let storagePath: string;
  if (target.kind === "description") {
    storagePath = formDescriptionAssetPath(session.user.id, formId);
  } else {
    const { data: question, error: qError } = await supabase
      .from("questions")
      .select("id")
      .eq("id", target.questionId)
      .eq("form_id", formId)
      .maybeSingle();
    if (qError) {
      return NextResponse.json({ error: qError.message }, { status: 500 });
    }
    if (!question) {
      return NextResponse.json({ error: "Question not found on this form." }, { status: 404 });
    }
    storagePath = formQuestionAssetPath(session.user.id, formId, target.questionId);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(FORM_ASSETS_BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type || "image/jpeg",
      upsert: true,
      cacheControl: "3600",
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  if (target.kind === "description") {
    const { error } = await supabase
      .from("forms")
      .update({ description_image_path: storagePath })
      .eq("id", formId)
      .eq("created_by", session.user.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from("questions")
      .update({ prompt_image_path: storagePath })
      .eq("id", target.questionId)
      .eq("form_id", formId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    path: storagePath,
    url: formAssetPublicUrl(storagePath),
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can remove form images." }, { status: 403 });
  }

  const { formId } = await params;
  const owner = await assertFormOwner(supabase, formId, session.user.id);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  const { searchParams } = new URL(request.url);
  const target = parseTarget(searchParams.get("target"));
  if (!target) {
    return NextResponse.json(
      { error: "Target must be 'description' or a question id." },
      { status: 400 },
    );
  }

  let existingPath: string | null = null;
  if (target.kind === "description") {
    const { data, error } = await supabase
      .from("forms")
      .select("description_image_path")
      .eq("id", formId)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    existingPath =
      typeof data?.description_image_path === "string" ? data.description_image_path : null;
    const { error: clearError } = await supabase
      .from("forms")
      .update({ description_image_path: null })
      .eq("id", formId)
      .eq("created_by", session.user.id);
    if (clearError) {
      return NextResponse.json({ error: clearError.message }, { status: 500 });
    }
  } else {
    const { data, error } = await supabase
      .from("questions")
      .select("id, prompt_image_path")
      .eq("id", target.questionId)
      .eq("form_id", formId)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Question not found on this form." }, { status: 404 });
    }
    existingPath = typeof data.prompt_image_path === "string" ? data.prompt_image_path : null;
    const { error: clearError } = await supabase
      .from("questions")
      .update({ prompt_image_path: null })
      .eq("id", target.questionId)
      .eq("form_id", formId);
    if (clearError) {
      return NextResponse.json({ error: clearError.message }, { status: 500 });
    }
  }

  if (existingPath) {
    await supabase.storage.from(FORM_ASSETS_BUCKET).remove([existingPath]);
  }

  return NextResponse.json({ ok: true });
}
