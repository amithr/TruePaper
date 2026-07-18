import { NextResponse } from "next/server";

import { buildFormSummaries, buildForms, mapQuestionRow, type FormSummaryExtras } from "@/lib/forms-api";
import type { Form, FormLastSessionDefaults, QuestionType } from "@/lib/forms";
import { hasAutogradeKey } from "@/lib/response-types/autograde";
import { getSessionUser } from "@/lib/request-auth";
import {
  getSessionDurationMinutes,
  isNoTimeLimitSession,
} from "@/lib/session-window";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CreateFormBody = {
  title?: string;
  description?: string;
};

function deliveryModeFromRow(value: unknown): FormLastSessionDefaults["deliveryMode"] {
  if (value === "self_paced" || value === "hybrid") {
    return value;
  }
  return "live";
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const summaryOnly = new URL(request.url).searchParams.get("summary") === "1";

  let formsQuery = supabase
    .from("forms")
    .select(
      "id, title, description, description_image_path, created_by, live_teacher_feedback_enabled",
    )
    .order("created_at", { ascending: true });

  if (session.profile?.role === "teacher") {
    formsQuery = formsQuery.eq("created_by", session.user.id);
  }

  const { data: forms, error: formsError } = await formsQuery;

  if (formsError) {
    return NextResponse.json({ error: formsError.message }, { status: 500 });
  }

  if (!forms || forms.length === 0) {
    return NextResponse.json({ forms: [] satisfies Form[] });
  }

  if (summaryOnly) {
    const formIds = forms.map((form) => form.id);
    const [{ data: questionRows, error: countError }, { data: sessionRows, error: sessionsError }] =
      await Promise.all([
        supabase
          .from("questions")
          .select("form_id, question_type, correct_answer, response_config")
          .in("form_id", formIds),
        supabase
          .from("form_sessions")
          .select("form_id, opens_at, closes_at, delivery_mode, accept_late_sync, created_at")
          .in("form_id", formIds)
          .order("created_at", { ascending: false }),
      ]);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }
    if (sessionsError) {
      return NextResponse.json({ error: sessionsError.message }, { status: 500 });
    }

    const extrasByFormId = new Map<string, FormSummaryExtras>();
    for (const formId of formIds) {
      extrasByFormId.set(formId, {
        questionCount: 0,
        autogradeCount: 0,
        lastRunAt: null,
        lastSessionDefaults: null,
      });
    }

    for (const row of questionRows ?? []) {
      const formId = row.form_id as string;
      const extras = extrasByFormId.get(formId);
      if (!extras) {
        continue;
      }
      extras.questionCount += 1;
      const mapped = mapQuestionRow({
        id: "summary",
        form_id: formId,
        prompt: "",
        question_type: row.question_type as QuestionType,
        options: [],
        correct_answer: (row.correct_answer as string | null) ?? null,
        points: 1,
        display_order: 0,
        response_config: row.response_config,
      });
      if (hasAutogradeKey(mapped)) {
        extras.autogradeCount += 1;
      }
    }

    for (const row of sessionRows ?? []) {
      const formId = row.form_id as string;
      const extras = extrasByFormId.get(formId);
      if (!extras || extras.lastRunAt) {
        continue;
      }
      const opensAt = String(row.opens_at);
      const closesAt = String(row.closes_at);
      const noTimeLimit = isNoTimeLimitSession(opensAt, closesAt);
      const durationMinutes = noTimeLimit
        ? 45
        : Math.max(5, Math.min(480, getSessionDurationMinutes(opensAt, closesAt) ?? 45));
      extras.lastRunAt = typeof row.created_at === "string" ? row.created_at : opensAt;
      extras.lastSessionDefaults = {
        durationMinutes,
        noTimeLimit,
        deliveryMode: deliveryModeFromRow(row.delivery_mode),
        acceptLateSync: row.accept_late_sync !== false,
      };
    }

    return NextResponse.json({ forms: buildFormSummaries(forms, extrasByFormId) });
  }

  const formIds = forms.map((form) => form.id);
  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select(
      "id, form_id, prompt, prompt_image_path, question_type, options, correct_answer, points, display_order, response_config",
    )
    .in("form_id", formIds)
    .order("display_order", { ascending: true });

  if (questionsError) {
    return NextResponse.json({ error: questionsError.message }, { status: 500 });
  }

  return NextResponse.json({ forms: buildForms(forms, questions ?? []) });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can create forms." }, { status: 403 });
  }

  const body = (await request.json()) as CreateFormBody;
  const title = body.title?.trim() || "Untitled Form";
  const description = body.description?.trim() || "";

  const { data, error } = await supabase
    .from("forms")
    .insert({ title, description, created_by: session.user.id })
    .select(
      "id, title, description, description_image_path, created_by, live_teacher_feedback_enabled",
    )
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create form" }, { status: 500 });
  }

  return NextResponse.json({
    form: {
      id: data.id,
      title: data.title,
      description: data.description ?? "",
      descriptionImagePath: data.description_image_path ?? null,
      createdBy: data.created_by,
      liveTeacherFeedbackEnabled: false,
      questions: [],
    } satisfies Form,
  });
}
