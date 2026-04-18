export type QuestionType = "multipleChoice" | "text";

export type Question = {
  id: string;
  prompt: string;
  type: QuestionType;
  options: string[];
  displayOrder: number;
};

export type Form = {
  id: string;
  title: string;
  description: string;
  /** Owning teacher user id, or null for legacy rows */
  createdBy: string | null;
  questions: Question[];
};

export type StudentAnswers = Record<string, string>;
