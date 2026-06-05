import type {
  LibraryTemplateDetail,
  LibraryTemplateSummary,
  TemplateLanguage,
  TemplateScope,
  TemplateSnapshot,
  TemplateSourceKind,
} from "@/lib/library/types";

type TemplateRow = {
  id: string;
  author_id: string;
  title: string;
  description: string;
  source_kind: string;
  scope: string;
  language: string;
  subject: string;
  grade_level: string;
  curriculum_tags: string[] | null;
  nmt_dpa_relevant: boolean;
  interaction_types: string[] | null;
  current_version_number: number;
  created_at: string;
  updated_at: string;
  author_name?: string | null;
  question_count?: number | null;
  cloned_at_version_number?: number | null;
};

export function mapTemplateSummary(row: TemplateRow): LibraryTemplateSummary {
  const clonedAt = row.cloned_at_version_number ?? undefined;
  const current = row.current_version_number;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    sourceKind: row.source_kind as TemplateSourceKind,
    scope: row.scope as TemplateScope,
    language: row.language as TemplateLanguage,
    subject: row.subject,
    gradeLevel: row.grade_level,
    curriculumTags: row.curriculum_tags ?? [],
    nmtDpaRelevant: row.nmt_dpa_relevant,
    interactionTypes: row.interaction_types ?? [],
    currentVersionNumber: current,
    questionCount: row.question_count ?? 0,
    authorId: row.author_id,
    authorName: row.author_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    clonedAtVersionNumber: clonedAt,
    updateAvailable:
      typeof clonedAt === "number" && clonedAt > 0 && current > clonedAt ? true : undefined,
  };
}

export function mapTemplateDetail(
  row: TemplateRow,
  snapshot: TemplateSnapshot,
  changelog: string,
): LibraryTemplateDetail {
  return {
    ...mapTemplateSummary(row),
    snapshot,
    changelog,
  };
}

export function questionCountFromSnapshot(snapshot: TemplateSnapshot): number {
  return snapshot.questions?.length ?? 0;
}
