import type { Form, FormLastSessionDefaults, Question, QuestionType } from "@/lib/forms";
import { parseResponseConfig } from "@/lib/response-types/registry";

type FormRow = {
  id: string;
  title: string;
  description: string | null;
  description_image_path?: string | null;
  created_by: string | null;
  live_teacher_feedback_enabled?: boolean | null;
};

type QuestionRow = {
  id: string;
  form_id: string;
  prompt: string;
  prompt_image_path?: string | null;
  question_type: QuestionType;
  options: unknown;
  correct_answer: string | null;
  points: number | null;
  display_order: number;
  response_config?: unknown;
};

export const mapQuestionRow = (row: QuestionRow): Question => ({
  id: row.id,
  prompt: row.prompt,
  promptImagePath:
    typeof row.prompt_image_path === "string" && row.prompt_image_path.trim()
      ? row.prompt_image_path.trim()
      : null,
  type: row.question_type,
  options: Array.isArray(row.options)
    ? row.options.filter((value): value is string => typeof value === "string")
    : [],
  correctAnswer: row.question_type === "multipleChoice" ? row.correct_answer : null,
  points: Math.max(1, Math.floor(Number(row.points) || 1)),
  displayOrder: row.display_order,
  responseConfig: parseResponseConfig(row.question_type, row.response_config),
});

export const buildForms = (forms: FormRow[], questions: QuestionRow[]): Form[] => {
  const questionByFormId = new Map<string, Question[]>();

  for (const row of questions) {
    const current = questionByFormId.get(row.form_id) ?? [];
    current.push(mapQuestionRow(row));
    questionByFormId.set(row.form_id, current);
  }

  return forms.map((form) => ({
    id: form.id,
    title: form.title,
    description: form.description ?? "",
    descriptionImagePath:
      typeof form.description_image_path === "string" && form.description_image_path.trim()
        ? form.description_image_path.trim()
        : null,
    createdBy: form.created_by,
    liveTeacherFeedbackEnabled: form.live_teacher_feedback_enabled === true,
    questions: (questionByFormId.get(form.id) ?? []).sort(
      (left, right) => left.displayOrder - right.displayOrder,
    ),
  }));
};

export type FormSummaryExtras = {
  questionCount: number;
  autogradeCount: number;
  lastRunAt: string | null;
  lastSessionDefaults: FormLastSessionDefaults | null;
};

export const buildFormSummaries = (
  forms: FormRow[],
  extrasByFormId: Map<string, FormSummaryExtras>,
): Form[] =>
  forms.map((form) => {
    const extras = extrasByFormId.get(form.id);
    return {
      id: form.id,
      title: form.title,
      description: form.description ?? "",
      descriptionImagePath:
        typeof form.description_image_path === "string" && form.description_image_path.trim()
          ? form.description_image_path.trim()
          : null,
      createdBy: form.created_by,
      liveTeacherFeedbackEnabled: form.live_teacher_feedback_enabled === true,
      questions: [],
      questionCount: extras?.questionCount ?? 0,
      lastRunAt: extras?.lastRunAt ?? null,
      autogradeCount: extras?.autogradeCount ?? 0,
      lastSessionDefaults: extras?.lastSessionDefaults ?? null,
    };
  });
