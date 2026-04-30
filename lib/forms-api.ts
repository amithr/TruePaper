import type { Form, Question, QuestionType } from "@/lib/forms";

type FormRow = {
  id: string;
  title: string;
  description: string | null;
  created_by: string | null;
};

type QuestionRow = {
  id: string;
  form_id: string;
  prompt: string;
  question_type: QuestionType;
  options: unknown;
  correct_answer: string | null;
  points: number | null;
  display_order: number;
};

export const mapQuestionRow = (row: QuestionRow): Question => ({
  id: row.id,
  prompt: row.prompt,
  type: row.question_type,
  options: Array.isArray(row.options)
    ? row.options.filter((value): value is string => typeof value === "string")
    : [],
  correctAnswer: row.question_type === "multipleChoice" ? row.correct_answer : null,
  points: Math.max(1, Math.floor(Number(row.points) || 1)),
  displayOrder: row.display_order,
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
    createdBy: form.created_by,
    questions: (questionByFormId.get(form.id) ?? []).sort(
      (left, right) => left.displayOrder - right.displayOrder,
    ),
  }));
};
