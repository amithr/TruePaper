import { NextResponse } from "next/server";

import type { Form, Question, QuestionType } from "@/lib/forms";
import { parseResponseConfig } from "@/lib/response-types/registry";
import { normalizeResponseType } from "@/lib/response-types/types";
import { isValidJoinCodeFormat, normalizeJoinCode } from "@/lib/join-code";
import { fetchSessionDeliveryMode } from "@/lib/offline/delivery-mode";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";

type LookupPayload = {
  ok: boolean;
  reason?: string;
  liveSessionId?: string;
  formId?: string;
  opensAt?: string;
  closesAt?: string;
  title?: string;
  description?: string;
  descriptionImagePath?: string | null;
  liveTeacherFeedbackEnabled?: boolean;
  questions?: Array<{
    id: string;
    prompt: string;
    promptImagePath?: string | null;
    type: QuestionType;
    options: unknown;
    displayOrder: number;
    responseConfig?: unknown;
  }>;
};

function mapQuestions(rows: NonNullable<LookupPayload["questions"]>): Question[] {
  return rows
    .map((row) => ({
      id: row.id,
      prompt: row.prompt,
      promptImagePath:
        typeof row.promptImagePath === "string" && row.promptImagePath.trim()
          ? row.promptImagePath.trim()
          : null,
      type: normalizeResponseType(row.type),
      options: Array.isArray(row.options)
        ? row.options.filter((o): o is string => typeof o === "string")
        : [],
      correctAnswer: null,
      points: 1,
      displayOrder: Number(row.displayOrder) || 0,
      responseConfig: parseResponseConfig(row.type, row.responseConfig),
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("code") ?? "";
  const code = normalizeJoinCode(raw);

  if (!isValidJoinCodeFormat(code)) {
    return NextResponse.json({ error: "Enter a valid 6-character code." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAnonServiceClient();
    const { data, error } = await supabase.rpc("lookup_join_code", { p_code: code });

    if (error) {
      if (error.message.includes("lookup_join_code") || error.code === "42883") {
        return NextResponse.json(
          {
            error:
              "Database is missing lookup_join_code. Run migration supabase/migrations/20260421120000_join_code_sessions.sql.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const payload = data as LookupPayload;
    if (!payload?.ok) {
      const reason = payload?.reason ?? "unknown";
      const status = reason === "invalid_code" ? 400 : 404;
      return NextResponse.json({ error: "That code is not valid or the session is not open.", reason }, { status });
    }

    const form: Form = {
      id: payload.formId ?? "",
      title: payload.title ?? "Form",
      description: payload.description ?? "",
      descriptionImagePath:
        typeof payload.descriptionImagePath === "string" && payload.descriptionImagePath.trim()
          ? payload.descriptionImagePath.trim()
          : null,
      createdBy: null,
      liveTeacherFeedbackEnabled: payload.liveTeacherFeedbackEnabled === true,
      questions: mapQuestions(payload.questions ?? []),
    };

    const deliveryMode = payload.liveSessionId
      ? await fetchSessionDeliveryMode(supabase, payload.liveSessionId)
      : "live";

    return NextResponse.json({
      liveSessionId: payload.liveSessionId,
      formId: payload.formId,
      opensAt: payload.opensAt,
      closesAt: payload.closesAt,
      deliveryMode,
      form,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
