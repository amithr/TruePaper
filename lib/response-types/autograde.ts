import type { Question } from "@/lib/forms";
import { parseResponseValue } from "@/lib/response-types/answers";
import type {
  LabellingConfig,
  MatchingConfig,
  OrderingConfig,
  ShortAnswerConfig,
  TrueFalseConfig,
} from "@/lib/response-types/types";
import { normalizeResponseType } from "@/lib/response-types/types";

function normalizeText(s: string, caseSensitive: boolean): string {
  const trimmed = s.trim();
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

export function hasAutogradeKey(question: Pick<Question, "type" | "correctAnswer" | "responseConfig">): boolean {
  const type = normalizeResponseType(question.type);
  if (type === "multipleChoice") {
    return Boolean(question.correctAnswer?.trim());
  }
  const config = question.responseConfig;
  if (type === "trueFalse") {
    return typeof (config as TrueFalseConfig).correctAnswer === "boolean";
  }
  if (type === "shortAnswer") {
    const accepted = (config as ShortAnswerConfig).acceptedAnswers ?? [];
    return accepted.some((a) => a.trim().length > 0);
  }
  if (type === "matching") {
    const correct = (config as MatchingConfig).correct ?? {};
    return Object.keys(correct).length > 0;
  }
  if (type === "ordering") {
    const order = (config as OrderingConfig).correctOrder ?? [];
    return order.length > 0;
  }
  if (type === "labelling") {
    const correct = (config as LabellingConfig).correct ?? {};
    return Object.keys(correct).length > 0;
  }
  return false;
}

export function autogradeEarnedPoints(
  question: Question,
  rawAnswer: string | undefined,
): number {
  const type = normalizeResponseType(question.type);
  const maxPts = Math.max(1, Math.floor(Number(question.points) || 1));
  const value = parseResponseValue(type, rawAnswer);

  if (type === "multipleChoice" && value.type === "multipleChoice") {
    if (!question.correctAnswer || !value.choice.trim()) {
      return 0;
    }
    return value.choice.trim() === question.correctAnswer ? maxPts : 0;
  }

  if (type === "trueFalse" && value.type === "trueFalse") {
    const correct = (question.responseConfig as TrueFalseConfig).correctAnswer;
    if (typeof correct !== "boolean" || value.answer === null) {
      return 0;
    }
    return value.answer === correct ? maxPts : 0;
  }

  if (type === "shortAnswer" && value.type === "shortAnswer") {
    const config = question.responseConfig as ShortAnswerConfig;
    const accepted = config.acceptedAnswers ?? [];
    if (!value.text.trim() || accepted.length === 0) {
      return 0;
    }
    const caseSensitive = config.caseSensitive ?? false;
    const student = normalizeText(value.text, caseSensitive);
    const match = accepted.some((a) => normalizeText(a, caseSensitive) === student);
    return match ? maxPts : 0;
  }

  if (type === "matching" && value.type === "matching") {
    const config = question.responseConfig as MatchingConfig;
    const correct = config.correct ?? {};
    const keys = Object.keys(correct);
    if (keys.length === 0) {
      return 0;
    }
    let hits = 0;
    for (const leftId of keys) {
      if (value.pairs[leftId] === correct[leftId]) {
        hits += 1;
      }
    }
    return Math.round((hits / keys.length) * maxPts);
  }

  if (type === "ordering" && value.type === "ordering") {
    const config = question.responseConfig as OrderingConfig;
    const correct = config.correctOrder ?? [];
    if (correct.length === 0 || value.order.length === 0) {
      return 0;
    }
    if (value.order.length !== correct.length) {
      return 0;
    }
    const perfect = value.order.every((id, i) => id === correct[i]);
    return perfect ? maxPts : 0;
  }

  if (type === "labelling" && value.type === "labelling") {
    const config = question.responseConfig as LabellingConfig;
    const correct = config.correct ?? {};
    const keys = Object.keys(correct);
    if (keys.length === 0) {
      return 0;
    }
    let hits = 0;
    for (const zoneId of keys) {
      if (value.assignments[zoneId] === correct[zoneId]) {
        hits += 1;
      }
    }
    return Math.round((hits / keys.length) * maxPts);
  }

  return 0;
}
