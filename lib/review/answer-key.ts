import type { Question } from "@/lib/forms";
import { serializeResponseValue } from "@/lib/response-types/answers";
import type {
  LabellingConfig,
  MatchingConfig,
  MathInputConfig,
  OrderingConfig,
  ShortAnswerConfig,
  TrueFalseConfig,
} from "@/lib/response-types/types";
import { normalizeResponseType } from "@/lib/response-types/types";

/**
 * The answer key in a form the review slide can show:
 * - `wire`: a serialized answer the student renderer displays as if chosen
 *   (MC option, true/false, matching pairs, ordering, labelling);
 * - `list`: accepted text answers (short answer, math input) shown as chips;
 * - null when the type has no key (extended writing, drawings, graphs, …).
 */
export type AnswerKeyView =
  | { kind: "wire"; answer: string }
  | { kind: "list"; answers: string[]; caseSensitive: boolean }
  | null;

export function answerKeyView(question: Question): AnswerKeyView {
  const type = normalizeResponseType(question.type);
  const config = question.responseConfig;
  switch (type) {
    case "multipleChoice": {
      const choice = question.correctAnswer?.trim() ?? "";
      return choice ? { kind: "wire", answer: serializeResponseValue({ type: "multipleChoice", choice }) } : null;
    }
    case "trueFalse": {
      const answer = (config as TrueFalseConfig).correctAnswer;
      return typeof answer === "boolean" ? { kind: "wire", answer: serializeResponseValue({ type: "trueFalse", answer }) } : null;
    }
    case "shortAnswer":
    case "mathInput": {
      const c = config as ShortAnswerConfig | MathInputConfig;
      const answers = (c.acceptedAnswers ?? []).map((a) => a.trim()).filter(Boolean);
      return answers.length > 0 ? { kind: "list", answers, caseSensitive: c.caseSensitive === true } : null;
    }
    case "matching": {
      const pairs = (config as MatchingConfig).correct ?? {};
      return Object.keys(pairs).length > 0 ? { kind: "wire", answer: serializeResponseValue({ type: "matching", pairs }) } : null;
    }
    case "ordering": {
      const order = (config as OrderingConfig).correctOrder ?? [];
      return order.length > 0 ? { kind: "wire", answer: serializeResponseValue({ type: "ordering", order }) } : null;
    }
    case "labelling": {
      const assignments = (config as LabellingConfig).correct ?? {};
      return Object.keys(assignments).length > 0
        ? { kind: "wire", answer: serializeResponseValue({ type: "labelling", assignments }) }
        : null;
    }
    default:
      return null;
  }
}
