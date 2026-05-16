export type QuestionType = "multipleChoice" | "text";

export type Question = {
  id: string;
  prompt: string;
  type: QuestionType;
  options: string[];
  /** Teacher-authored answer key for multiple choice; never used for student rendering. */
  correctAnswer: string | null;
  /** Teacher-defined points awarded for this question. */
  points: number;
  displayOrder: number;
};

export type Form = {
  id: string;
  title: string;
  description: string;
  /** Owning teacher user id, or null for legacy rows */
  createdBy: string | null;
  /** When true, teachers can send live comments visible to students under text questions. */
  liveTeacherFeedbackEnabled: boolean;
  questions: Question[];
};

export type StudentAnswers = Record<string, string>;
