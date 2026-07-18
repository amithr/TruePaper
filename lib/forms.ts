import type { ResponseConfig, ResponseTypeId } from "@/lib/response-types/types";

/** @deprecated Use ResponseTypeId — kept for API backward compatibility */
export type QuestionType = ResponseTypeId;

export type Question = {
  id: string;
  prompt: string;
  /** Storage path in `form-assets` bucket for an optional prompt image. */
  promptImagePath: string | null;
  type: QuestionType;
  options: string[];
  /** Teacher-authored answer key for multiple choice; never used for student rendering. */
  correctAnswer: string | null;
  /** Teacher-defined points awarded for this question. */
  points: number;
  displayOrder: number;
  /** Type-specific authoring config (parts, passage, rubric, word targets, etc.) */
  responseConfig: ResponseConfig;
};

export type FormLastSessionDefaults = {
  durationMinutes: number;
  noTimeLimit: boolean;
  deliveryMode: "live" | "self_paced" | "hybrid";
  acceptLateSync: boolean;
};

export type Form = {
  id: string;
  title: string;
  description: string;
  /** Storage path in `form-assets` bucket for an optional description image. */
  descriptionImagePath: string | null;
  /** Owning teacher user id, or null for legacy rows */
  createdBy: string | null;
  /** When true, teachers can send live comments visible to students under text questions. */
  liveTeacherFeedbackEnabled: boolean;
  questions: Question[];
  /** Present when loaded with GET /api/forms?summary=1 (avoids shipping every question). */
  questionCount?: number;
  /** ISO timestamp of the most recent live session for this form, if any. */
  lastRunAt?: string | null;
  /** Count of questions that have an auto-grade answer key. */
  autogradeCount?: number;
  /** Settings from the most recent session, used to seed the Start popover. */
  lastSessionDefaults?: FormLastSessionDefaults | null;
};

export type StudentAnswers = Record<string, string>;
