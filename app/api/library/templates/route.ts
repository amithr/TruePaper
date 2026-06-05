import { NextResponse } from "next/server";

import type { Form } from "@/lib/forms";
import { mapTemplateSummary, questionCountFromSnapshot } from "@/lib/library/mappers";
import {
  buildSnapshotFromForm,
  deriveInteractionTypes,
  loadFormForSnapshot,
  loadQuestionForSnapshot,
  loadSessionForSnapshot,
  resolveScopeOrgFields,
} from "@/lib/library/server";
import type {
  LibraryBrowseResult,
  SaveTemplateInput,
  TemplateScope,
  TemplateSnapshot,
} from "@/lib/library/types";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 30;

type CreateBody = SaveTemplateInput & {
  sourceKind: "question" | "form" | "session";
  formId?: string;
  questionId?: string;
  liveSessionId?: string;
};

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can browse the library." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(0, Number(searchParams.get("page") ?? 0) || 0);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE),
  );
  const scopeFilter = searchParams.get("scope") ?? "";
  const q = searchParams.get("q")?.trim() ?? "";
  const subject = searchParams.get("subject")?.trim() ?? "";
  const gradeLevel = searchParams.get("gradeLevel")?.trim() ?? "";
  const language = searchParams.get("language")?.trim() ?? "";
  const nmtDpa = searchParams.get("nmtDpa") === "1";
  const interactionType = searchParams.get("interactionType")?.trim() ?? "";
  const sourceKind = searchParams.get("sourceKind")?.trim() ?? "";

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("organization_id, department_id")
    .eq("id", session.user.id)
    .maybeSingle();

  let query = supabase
    .from("library_templates")
    .select(
      "id, author_id, title, description, source_kind, scope, language, subject, grade_level, curriculum_tags, nmt_dpa_relevant, interaction_types, current_version_number, created_at, updated_at",
      { count: "exact" },
    )
    .order("updated_at", { ascending: false });

  if (scopeFilter === "mine") {
    query = query.eq("author_id", session.user.id);
  } else if (scopeFilter === "department") {
    if (!profileRow?.department_id) {
      return NextResponse.json({
        items: [],
        page,
        pageSize,
        total: 0,
        hasMore: false,
      } satisfies LibraryBrowseResult);
    }
    query = query.eq("scope", "department").eq("department_id", profileRow.department_id);
  } else if (scopeFilter === "school") {
    if (!profileRow?.organization_id) {
      return NextResponse.json({
        items: [],
        page,
        pageSize,
        total: 0,
        hasMore: false,
      } satisfies LibraryBrowseResult);
    }
    query = query.eq("scope", "school").eq("organization_id", profileRow.organization_id);
  } else if (scopeFilter === "public") {
    query = query.eq("scope", "public");
  } else if (scopeFilter === "shared") {
    query = query.neq("scope", "private").neq("author_id", session.user.id);
  } else {
    const parts = [`author_id.eq.${session.user.id}`, "scope.eq.public"];
    if (profileRow?.organization_id) {
      parts.push(
        `and(scope.eq.school,organization_id.eq.${profileRow.organization_id})`,
      );
    }
    if (profileRow?.department_id) {
      parts.push(
        `and(scope.eq.department,department_id.eq.${profileRow.department_id})`,
      );
    }
    query = query.or(parts.join(","));
  }

  if (q) {
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,subject.ilike.%${q}%`);
  }
  if (subject) {
    query = query.ilike("subject", `%${subject}%`);
  }
  if (gradeLevel) {
    query = query.ilike("grade_level", `%${gradeLevel}%`);
  }
  if (language === "en" || language === "uk") {
    query = query.eq("language", language);
  }
  if (nmtDpa) {
    query = query.eq("nmt_dpa_relevant", true);
  }
  if (interactionType) {
    query = query.contains("interaction_types", [interactionType]);
  }
  if (sourceKind === "question" || sourceKind === "form" || sourceKind === "session") {
    query = query.eq("source_kind", sourceKind);
  }

  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);

  if (error) {
    if (error.message.includes("library_templates")) {
      return NextResponse.json(
        { error: "Run migration 20260605140000_template_library.sql." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const templateIds = (data ?? []).map((row) => row.id as string);
  const cloneVersionByTemplate = new Map<string, number>();

  if (templateIds.length > 0) {
    const { data: clones } = await supabase
      .from("library_template_clones")
      .select("template_id, cloned_at_version_number")
      .eq("teacher_id", session.user.id)
      .in("template_id", templateIds);

    for (const clone of clones ?? []) {
      const tid = clone.template_id as string;
      const ver = clone.cloned_at_version_number as number;
      const prev = cloneVersionByTemplate.get(tid);
      if (prev === undefined || ver > prev) {
        cloneVersionByTemplate.set(tid, ver);
      }
    }
  }

  const versionIds = templateIds;
  const questionCountByTemplate = new Map<string, number>();
  if (versionIds.length > 0) {
    const { data: versions } = await supabase
      .from("library_template_versions")
      .select("template_id, snapshot")
      .in("template_id", versionIds)
      .order("version_number", { ascending: false });

    const seen = new Set<string>();
    for (const ver of versions ?? []) {
      const tid = ver.template_id as string;
      if (seen.has(tid)) {
        continue;
      }
      seen.add(tid);
      const snap = ver.snapshot as TemplateSnapshot;
      questionCountByTemplate.set(tid, questionCountFromSnapshot(snap));
    }
  }

  const authorIds = [...new Set((data ?? []).map((row) => row.author_id as string))];
  const authorNameById = new Map<string, string | null>();
  if (authorIds.length > 0) {
    const { data: authors } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", authorIds);
    for (const author of authors ?? []) {
      authorNameById.set(author.id as string, (author.display_name as string | null) ?? null);
    }
  }

  const items = (data ?? []).map((row) => {
    const tid = row.id as string;
    const authorId = row.author_id as string;
    return mapTemplateSummary({
      id: tid,
      author_id: authorId,
      title: row.title as string,
      description: row.description as string,
      source_kind: row.source_kind as string,
      scope: row.scope as string,
      language: row.language as string,
      subject: row.subject as string,
      grade_level: row.grade_level as string,
      curriculum_tags: row.curriculum_tags as string[] | null,
      nmt_dpa_relevant: row.nmt_dpa_relevant as boolean,
      interaction_types: row.interaction_types as string[] | null,
      current_version_number: row.current_version_number as number,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      author_name: authorNameById.get(authorId) ?? null,
      question_count: questionCountByTemplate.get(tid) ?? 0,
      cloned_at_version_number: cloneVersionByTemplate.get(tid) ?? null,
    });
  });

  const total = count ?? 0;
  return NextResponse.json({
    items,
    page,
    pageSize,
    total,
    hasMore: from + items.length < total,
  } satisfies LibraryBrowseResult);
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can save templates." }, { status: 403 });
  }

  const body = (await request.json()) as CreateBody;
  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  const sourceKind = body.sourceKind;
  if (sourceKind !== "question" && sourceKind !== "form" && sourceKind !== "session") {
    return NextResponse.json({ error: "Invalid source kind." }, { status: 400 });
  }

  let snapshot: TemplateSnapshot;
  if (sourceKind === "form") {
    const formId = body.formId?.trim();
    if (!formId) {
      return NextResponse.json({ error: "formId is required." }, { status: 400 });
    }
    const form = await loadFormForSnapshot(supabase, formId, session.user.id);
    if (!form) {
      return NextResponse.json({ error: "Form not found." }, { status: 404 });
    }
    snapshot = buildSnapshotFromForm(form);
  } else if (sourceKind === "question") {
    const questionId = body.questionId?.trim();
    if (!questionId) {
      return NextResponse.json({ error: "questionId is required." }, { status: 400 });
    }
    const loaded = await loadQuestionForSnapshot(supabase, questionId, session.user.id);
    if (!loaded) {
      return NextResponse.json({ error: "Question not found." }, { status: 404 });
    }
    snapshot = buildSnapshotFromForm(loaded.form, loaded.questionId);
  } else {
    const liveSessionId = body.liveSessionId?.trim();
    if (!liveSessionId) {
      return NextResponse.json({ error: "liveSessionId is required." }, { status: 400 });
    }
    const loaded = await loadSessionForSnapshot(supabase, liveSessionId, session.user.id);
    if (!loaded) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    snapshot = buildSnapshotFromForm(loaded.form, undefined, loaded.sessionDefaults);
  }

  const scope = (body.scope ?? "private") as TemplateScope;
  if (!["private", "department", "school", "public"].includes(scope)) {
    return NextResponse.json({ error: "Invalid scope." }, { status: 400 });
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("organization_id, department_id")
    .eq("id", session.user.id)
    .maybeSingle();

  const orgFields = resolveScopeOrgFields(scope, profileRow ?? {});
  if (scope === "department" && (!orgFields.organizationId || !orgFields.departmentId)) {
    return NextResponse.json(
      { error: "Join a department before sharing at department scope." },
      { status: 400 },
    );
  }
  if (scope === "school" && !orgFields.organizationId) {
    return NextResponse.json(
      { error: "Join a school before sharing at school scope." },
      { status: 400 },
    );
  }

  const interactionTypes =
    body.interactionTypes && body.interactionTypes.length > 0
      ? body.interactionTypes
      : deriveInteractionTypes(snapshot);

  const { data: templateRow, error: templateError } = await supabase
    .from("library_templates")
    .insert({
      author_id: session.user.id,
      title,
      description: body.description?.trim() ?? snapshot.description ?? "",
      source_kind: sourceKind,
      scope,
      organization_id: orgFields.organizationId,
      department_id: orgFields.departmentId,
      language: body.language === "uk" ? "uk" : "en",
      subject: body.subject?.trim() ?? "",
      grade_level: body.gradeLevel?.trim() ?? "",
      curriculum_tags: body.curriculumTags ?? [],
      nmt_dpa_relevant: body.nmtDpaRelevant === true,
      interaction_types: interactionTypes,
      current_version_number: 1,
    })
    .select("id")
    .single();

  if (templateError || !templateRow) {
    return NextResponse.json(
      { error: templateError?.message ?? "Failed to save template." },
      { status: 500 },
    );
  }

  const { error: versionError } = await supabase.from("library_template_versions").insert({
    template_id: templateRow.id,
    version_number: 1,
    snapshot,
    changelog: body.changelog?.trim() ?? "Initial version",
    created_by: session.user.id,
  });

  if (versionError) {
    return NextResponse.json({ error: versionError.message }, { status: 500 });
  }

  return NextResponse.json({ templateId: templateRow.id });
}
