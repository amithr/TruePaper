import type { SupabaseClient } from "@supabase/supabase-js";

import type { Form } from "@/lib/forms";
import { buildForms } from "@/lib/forms-api";
import type { TemplateSnapshot } from "@/lib/library/types";
import {
  formToSnapshot,
  interactionTypesFromQuestions,
  singleQuestionSnapshot,
} from "@/lib/library/snapshots";

export async function loadFormForSnapshot(
  supabase: SupabaseClient,
  formId: string,
  userId: string,
): Promise<Form | null> {
  const { data: formRow, error: formError } = await supabase
    .from("forms")
    .select("id, title, description, created_by, live_teacher_feedback_enabled")
    .eq("id", formId)
    .eq("created_by", userId)
    .maybeSingle();

  if (formError || !formRow) {
    return null;
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select(
      "id, form_id, prompt, question_type, options, correct_answer, points, display_order, response_config",
    )
    .eq("form_id", formId)
    .order("display_order", { ascending: true });

  if (questionsError) {
    return null;
  }

  const forms = buildForms([formRow], questions ?? []);
  return forms[0] ?? null;
}

export async function loadQuestionForSnapshot(
  supabase: SupabaseClient,
  questionId: string,
  userId: string,
): Promise<{ form: Form; questionId: string } | null> {
  const { data: questionRow, error } = await supabase
    .from("questions")
    .select("id, form_id")
    .eq("id", questionId)
    .maybeSingle();

  if (error || !questionRow) {
    return null;
  }

  const form = await loadFormForSnapshot(supabase, questionRow.form_id as string, userId);
  if (!form) {
    return null;
  }

  if (!form.questions.some((q) => q.id === questionId)) {
    return null;
  }

  return { form, questionId };
}

export async function loadSessionForSnapshot(
  supabase: SupabaseClient,
  liveSessionId: string,
  userId: string,
): Promise<{ form: Form; sessionDefaults: TemplateSnapshot["sessionDefaults"] } | null> {
  const { data: sessionRow, error } = await supabase
    .from("form_sessions")
    .select("id, form_id, opens_at, closes_at, created_by")
    .eq("id", liveSessionId)
    .eq("created_by", userId)
    .maybeSingle();

  if (error || !sessionRow) {
    return null;
  }

  const form = await loadFormForSnapshot(supabase, sessionRow.form_id as string, userId);
  if (!form) {
    return null;
  }

  const opensAt = new Date(sessionRow.opens_at as string).getTime();
  const closesAt = new Date(sessionRow.closes_at as string).getTime();
  const durationMinutes = Math.max(5, Math.round((closesAt - opensAt) / 60_000));
  const noTimeLimit = durationMinutes > 60 * 24 * 365;

  return {
    form,
    sessionDefaults: noTimeLimit ? { noTimeLimit: true } : { durationMinutes },
  };
}

export function buildSnapshotFromForm(
  form: Form,
  questionId?: string,
  sessionDefaults?: TemplateSnapshot["sessionDefaults"],
): TemplateSnapshot {
  if (questionId) {
    const question = form.questions.find((q) => q.id === questionId);
    if (!question) {
      return formToSnapshot(form, sessionDefaults);
    }
    return singleQuestionSnapshot(question, form.title, form.description);
  }
  return formToSnapshot(form, sessionDefaults);
}

export function deriveInteractionTypes(snapshot: TemplateSnapshot): string[] {
  return interactionTypesFromQuestions(
    snapshot.questions.map((q, i) => ({
      id: `snap-${i}`,
      prompt: q.prompt,
      type: q.type as Form["questions"][0]["type"],
      options: q.options,
      correctAnswer: q.correctAnswer,
      points: q.points,
      displayOrder: q.displayOrder,
      responseConfig: q.responseConfig,
    })),
  );
}

export function resolveScopeOrgFields(
  scope: string,
  profile: { organization_id?: string | null; department_id?: string | null },
): { organizationId: string | null; departmentId: string | null } {
  if (scope === "school") {
    return { organizationId: profile.organization_id ?? null, departmentId: null };
  }
  if (scope === "department") {
    return {
      organizationId: profile.organization_id ?? null,
      departmentId: profile.department_id ?? null,
    };
  }
  return { organizationId: null, departmentId: null };
}
