import type { Form, Question } from "@/lib/forms";
import type { TemplateQuestionSnapshot, TemplateSnapshot } from "@/lib/library/types";

export function questionToSnapshot(question: Question, index: number): TemplateQuestionSnapshot {
  return {
    prompt: question.prompt,
    type: question.type,
    options: question.options,
    correctAnswer: question.correctAnswer,
    points: question.points,
    displayOrder: question.displayOrder ?? index,
    responseConfig: (question.responseConfig ?? {}) as Record<string, unknown>,
  };
}

export function formToSnapshot(
  form: Form,
  sessionDefaults?: TemplateSnapshot["sessionDefaults"],
): TemplateSnapshot {
  return {
    title: form.title,
    description: form.description,
    liveTeacherFeedbackEnabled: form.liveTeacherFeedbackEnabled,
    questions: form.questions.map((q, i) => questionToSnapshot(q, i)),
    sessionDefaults,
  };
}

export function singleQuestionSnapshot(
  question: Question,
  title: string,
  description = "",
): TemplateSnapshot {
  return {
    title,
    description,
    liveTeacherFeedbackEnabled: false,
    questions: [questionToSnapshot(question, 0)],
  };
}

export function interactionTypesFromQuestions(questions: Question[]): string[] {
  const types = new Set(questions.map((q) => q.type));
  return [...types].sort();
}
