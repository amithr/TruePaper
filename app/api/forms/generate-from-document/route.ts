import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getLlmConfigFromEnv } from "@/lib/ai-model";
import type { Form } from "@/lib/forms";
import { getSessionUser } from "@/lib/request-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_DOCUMENT_CHARS = 24_000;
const MAX_GENERATED_QUESTIONS = 30;

const generatedFormSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(600).default(""),
  questions: z
    .array(
      z.object({
        prompt: z.string().trim().min(1).max(500),
        type: z.enum(["multipleChoice", "text"]),
        options: z.array(z.string().trim().min(1).max(200)).max(8).optional().default([]),
        correctAnswer: z.string().trim().min(1).max(200).nullable().optional(),
      }),
    )
    .min(1)
    .max(30),
});

function normalizeDocumentText(rawText: string): string {
  return rawText
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, MAX_DOCUMENT_CHARS);
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const session = await getSessionUser(supabase);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.profile?.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can generate forms." }, { status: 403 });
  }

  const llm = getLlmConfigFromEnv();
  if (llm.provider !== "openai") {
    return NextResponse.json(
      { error: `Unsupported LLM_PROVIDER "${llm.provider}". Currently supported: openai.` },
      { status: 400 },
    );
  }
  if (!llm.apiKey) {
    return NextResponse.json(
      { error: "LLM_API_KEY is not configured for AI document analysis." },
      { status: 503 },
    );
  }
  if (llm.apiKey.includes("REPLACE_WITH_YOUR_OPENAI_KEY")) {
    return NextResponse.json(
      { error: "LLM_API_KEY is still a placeholder. Set a real OpenAI API key in .env.local." },
      { status: 503 },
    );
  }

  const formData = await request.formData();
  const documentFile = formData.get("document");
  const multipleChoiceCount = Math.max(0, Math.min(20, Number(formData.get("multipleChoiceCount")) || 0));
  const shortAnswerCount = Math.max(0, Math.min(20, Number(formData.get("shortAnswerCount")) || 0));
  const longAnswerCount = Math.max(0, Math.min(20, Number(formData.get("longAnswerCount")) || 0));
  const totalRequested = multipleChoiceCount + shortAnswerCount + longAnswerCount;

  if (!(documentFile instanceof File)) {
    return NextResponse.json({ error: "Please upload a document file." }, { status: 400 });
  }
  if (totalRequested <= 0) {
    return NextResponse.json(
      { error: "Choose at least one question to generate (multiple choice, short, or long)." },
      { status: 400 },
    );
  }
  if (totalRequested > MAX_GENERATED_QUESTIONS) {
    return NextResponse.json(
      { error: `Please request no more than ${MAX_GENERATED_QUESTIONS} total generated questions.` },
      { status: 400 },
    );
  }

  if (documentFile.size <= 0) {
    return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
  }

  if (documentFile.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json(
      { error: "Document is too large. Maximum supported file size is 2 MB." },
      { status: 400 },
    );
  }

  const text = normalizeDocumentText(await documentFile.text());
  if (!text) {
    return NextResponse.json(
      {
        error:
          "Could not read usable text from the uploaded document. Try a text-based file (txt, md, csv, or copied plain text).",
      },
      { status: 400 },
    );
  }

  try {
    const openai = createOpenAI({ apiKey: llm.apiKey });
    const { object } = await generateObject({
      model: openai(llm.model),
      schema: generatedFormSchema,
      prompt: `
You are generating a classroom assessment form from source notes.

Rules:
- Create practical teacher-ready questions that cover the document.
- Use only question types "multipleChoice" and "text".
- Multiple choice questions must have 2-5 clear options.
- Set "correctAnswer" only for multipleChoice and it must exactly match one option.
- For text questions, set options to [] and correctAnswer to null.
- Generate exactly ${multipleChoiceCount} multiple choice questions.
- Generate exactly ${shortAnswerCount} short-answer text questions (target response length: 3-4 sentences).
- Generate exactly ${longAnswerCount} long-answer text questions (target response length: 1-2 paragraphs).
- Return concise, clear prompts.

Document:
"""${text}"""
      `,
    });

    const title = object.title.trim() || "Generated Form";
    const description = object.description.trim();

    const normalizedQuestions = object.questions.map((question, index) => {
      const type = question.type;
      if (type === "text") {
        return {
          prompt: question.prompt.trim(),
          type,
          options: [] as string[],
          correctAnswer: null as string | null,
          points: 1,
          displayOrder: index,
        };
      }
      const normalizedOptions = Array.from(
        new Set(question.options.map((value) => value.trim()).filter((value) => value.length > 0)),
      ).slice(0, 8);
      const options =
        normalizedOptions.length >= 2 ? normalizedOptions : ["Option 1", "Option 2"];
      const normalizedCorrect = question.correctAnswer?.trim() ?? "";
      const correctAnswer = normalizedCorrect && options.includes(normalizedCorrect) ? normalizedCorrect : null;
      return {
        prompt: question.prompt.trim(),
        type,
        options,
        correctAnswer,
        points: 1,
        displayOrder: index,
      };
    });

    const { data: createdForm, error: formError } = await supabase
      .from("forms")
      .insert({
        title,
        description,
        created_by: session.user.id,
      })
      .select("id, title, description, created_by")
      .single();

    if (formError || !createdForm) {
      return NextResponse.json(
        { error: formError?.message ?? "Failed to create form." },
        { status: 500 },
      );
    }

    const { data: createdQuestions, error: questionsError } = await supabase
      .from("questions")
      .insert(
        normalizedQuestions.map((question) => ({
          form_id: createdForm.id,
          prompt: question.prompt,
          question_type: question.type,
          options: question.options,
          correct_answer: question.correctAnswer,
          points: question.points,
          display_order: question.displayOrder,
        })),
      )
      .select("id, prompt, question_type, options, correct_answer, points, display_order")
      .order("display_order", { ascending: true });

    if (questionsError) {
      return NextResponse.json(
        { error: questionsError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      form: {
        id: createdForm.id,
        title: createdForm.title,
        description: createdForm.description ?? "",
        createdBy: createdForm.created_by,
        questions: (createdQuestions ?? []).map((question) => ({
          id: question.id,
          prompt: question.prompt,
          type: question.question_type,
          options: Array.isArray(question.options)
            ? question.options.filter((value): value is string => typeof value === "string")
            : [],
          correctAnswer: question.question_type === "multipleChoice" ? question.correct_answer : null,
          points: Math.max(1, Math.floor(Number(question.points) || 1)),
          displayOrder: question.display_order,
        })),
      } satisfies Form,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate form from document.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
