import { NextResponse } from "next/server";

import type { Form, QuestionType } from "@/lib/forms";
import { isValidResumeCodeFormat, normalizeResumeCode } from "@/lib/resume-code";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";

type LookupPayload = {
  ok: boolean;
  reason?: string;
  liveSessionId?: string;
  deviceId?: string;
  displayName?: string;
  joinCode?: string;
  formId?: string;
  opensAt?: string;
  closesAt?: string;
  resumeCode?: string;
  title?: string;
  description?: string;
  liveTeacherFeedbackEnabled?: boolean;
  questions?: Array<{
    id: string;
    prompt: string;
    type: QuestionType;
    options: unknown;
    displayOrder: number;
  }>;
};

function mapQuestions(rows: NonNullable<LookupPayload["questions"]>): Form["questions"] {
  return rows
    .map((row) => ({
      id: row.id,
      prompt: row.prompt,
      type: row.type === "multipleChoice" || row.type === "text" ? row.type : "text",
      options: Array.isArray(row.options)
        ? row.options.filter((o): o is string => typeof o === "string")
        : [],
      correctAnswer: null,
      points: 1,
      displayOrder: Number(row.displayOrder) || 0,
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = normalizeResumeCode(searchParams.get("code") ?? "");

  if (!isValidResumeCodeFormat(code)) {
    return NextResponse.json({ error: "Enter a valid 8-character rejoin code." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAnonServiceClient();
    const { data, error } = await supabase.rpc("lookup_student_resume_code", { p_code: code });

    if (error) {
      if (error.message.includes("lookup_student_resume_code") || error.code === "42883") {
        return NextResponse.json(
          {
            error:
              "Database is missing lookup_student_resume_code. Run migration 20260516150000_student_resume_code.sql.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const payload = data as LookupPayload;
    if (!payload?.ok) {
      const reason = payload?.reason ?? "unknown";
      if (reason === "invalid_code") {
        return NextResponse.json({ error: "Enter a valid 8-character rejoin code." }, { status: 400 });
      }
      if (reason === "session_closed") {
        return NextResponse.json(
          { error: "This exam session has ended. Your answers may already be submitted." },
          { status: 404 },
        );
      }
      if (reason === "already_submitted") {
        return NextResponse.json(
          { error: "You have already submitted this exam and cannot rejoin." },
          { status: 403 },
        );
      }
      return NextResponse.json(
        { error: "That rejoin code was not found. Check the code and try again." },
        { status: 404 },
      );
    }

    const deviceId = payload.deviceId?.trim() ?? "";
    if (!deviceId) {
      return NextResponse.json({ error: "Invalid rejoin record." }, { status: 500 });
    }

    const form: Form = {
      id: payload.formId ?? "",
      title: payload.title ?? "Form",
      description: payload.description ?? "",
      createdBy: null,
      liveTeacherFeedbackEnabled: payload.liveTeacherFeedbackEnabled === true,
      questions: mapQuestions(payload.questions ?? []),
    };

    return NextResponse.json({
      liveSessionId: payload.liveSessionId,
      formId: payload.formId,
      deviceId,
      displayName: payload.displayName ?? "",
      joinCode: payload.joinCode ?? "",
      resumeCode: payload.resumeCode ?? code,
      opensAt: payload.opensAt,
      closesAt: payload.closesAt,
      form,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
