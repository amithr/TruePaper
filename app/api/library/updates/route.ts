import { NextResponse } from "next/server";

import { mapTemplateSummary } from "@/lib/library/mappers";
import type { LibraryTemplateSummary } from "@/lib/library/types";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: clones, error: cloneError } = await supabase
    .from("library_template_clones")
    .select("template_id, cloned_at_version_number")
    .eq("teacher_id", session.user.id);

  if (cloneError) {
    return NextResponse.json({ error: cloneError.message }, { status: 500 });
  }

  if (!clones?.length) {
    return NextResponse.json({ items: [] satisfies LibraryTemplateSummary[] });
  }

  const latestCloneByTemplate = new Map<string, number>();
  for (const clone of clones) {
    const tid = clone.template_id as string;
    const ver = clone.cloned_at_version_number as number;
    const prev = latestCloneByTemplate.get(tid);
    if (prev === undefined || ver > prev) {
      latestCloneByTemplate.set(tid, ver);
    }
  }

  const templateIds = [...latestCloneByTemplate.keys()];
  const { data: templates, error } = await supabase
    .from("library_templates")
    .select(
      "id, author_id, title, description, source_kind, scope, language, subject, grade_level, curriculum_tags, nmt_dpa_relevant, interaction_types, current_version_number, created_at, updated_at",
    )
    .in("id", templateIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (templates ?? [])
    .filter((row) => {
      const clonedAt = latestCloneByTemplate.get(row.id as string) ?? 0;
      return (row.current_version_number as number) > clonedAt;
    })
    .map((row) =>
      mapTemplateSummary({
        ...row,
        author_name: null,
        question_count: 0,
        cloned_at_version_number: latestCloneByTemplate.get(row.id as string) ?? null,
      } as Parameters<typeof mapTemplateSummary>[0]),
    );

  return NextResponse.json({ items });
}
