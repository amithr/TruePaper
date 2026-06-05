import { NextResponse } from "next/server";

import { mapTemplateDetail } from "@/lib/library/mappers";
import {
  buildSnapshotFromForm,
  deriveInteractionTypes,
  loadFormForSnapshot,
  resolveScopeOrgFields,
} from "@/lib/library/server";
import type { SaveTemplateInput, TemplateSnapshot } from "@/lib/library/types";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ templateId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { templateId } = await params;
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: row, error } = await supabase
    .from("library_templates")
    .select(
      "id, author_id, title, description, source_kind, scope, language, subject, grade_level, curriculum_tags, nmt_dpa_relevant, interaction_types, current_version_number, created_at, updated_at",
    )
    .eq("id", templateId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const { data: version } = await supabase
    .from("library_template_versions")
    .select("snapshot, changelog")
    .eq("template_id", templateId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!version) {
    return NextResponse.json({ error: "Template version not found." }, { status: 404 });
  }

  const { data: author } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", row.author_id as string)
    .maybeSingle();

  const { data: clone } = await supabase
    .from("library_template_clones")
    .select("cloned_at_version_number")
    .eq("teacher_id", session.user.id)
    .eq("template_id", templateId)
    .order("cloned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const snapshot = version.snapshot as TemplateSnapshot;
  const detail = mapTemplateDetail(
    {
      ...row,
      author_name: author?.display_name ?? null,
      question_count: snapshot.questions?.length ?? 0,
      cloned_at_version_number: clone?.cloned_at_version_number ?? null,
    } as Parameters<typeof mapTemplateDetail>[0],
    snapshot,
    (version.changelog as string) ?? "",
  );

  return NextResponse.json({ template: detail });
}

type PatchBody = SaveTemplateInput & {
  resyncFromFormId?: string;
};

export async function PATCH(request: Request, { params }: Params) {
  const { templateId } = await params;
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("library_templates")
    .select("id, author_id, current_version_number")
    .eq("id", templateId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (!existing || existing.author_id !== session.user.id) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const body = (await request.json()) as PatchBody;
  const scope = body.scope;
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("organization_id, department_id")
    .eq("id", session.user.id)
    .maybeSingle();

  const orgFields = scope ? resolveScopeOrgFields(scope, profileRow ?? {}) : null;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title?.trim()) patch.title = body.title.trim();
  if (typeof body.description === "string") patch.description = body.description.trim();
  if (scope) {
    patch.scope = scope;
    patch.organization_id = orgFields?.organizationId ?? null;
    patch.department_id = orgFields?.departmentId ?? null;
  }
  if (body.language === "en" || body.language === "uk") patch.language = body.language;
  if (typeof body.subject === "string") patch.subject = body.subject.trim();
  if (typeof body.gradeLevel === "string") patch.grade_level = body.gradeLevel.trim();
  if (Array.isArray(body.curriculumTags)) patch.curriculum_tags = body.curriculumTags;
  if (typeof body.nmtDpaRelevant === "boolean") patch.nmt_dpa_relevant = body.nmtDpaRelevant;
  if (Array.isArray(body.interactionTypes)) patch.interaction_types = body.interactionTypes;

  let newVersionNumber = existing.current_version_number as number;

  if (body.resyncFromFormId) {
    const form = await loadFormForSnapshot(supabase, body.resyncFromFormId, session.user.id);
    if (!form) {
      return NextResponse.json({ error: "Form not found." }, { status: 404 });
    }
    const snapshot = buildSnapshotFromForm(form);
    newVersionNumber += 1;
    patch.current_version_number = newVersionNumber;
    patch.interaction_types = deriveInteractionTypes(snapshot);

    const { error: versionError } = await supabase.from("library_template_versions").insert({
      template_id: templateId,
      version_number: newVersionNumber,
      snapshot,
      changelog: body.changelog?.trim() || `Updated to version ${newVersionNumber}`,
      created_by: session.user.id,
    });
    if (versionError) {
      return NextResponse.json({ error: versionError.message }, { status: 500 });
    }
  }

  const { error: updateError } = await supabase
    .from("library_templates")
    .update(patch)
    .eq("id", templateId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, versionNumber: newVersionNumber });
}
