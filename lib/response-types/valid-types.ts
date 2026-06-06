import type { ResponseTypeId } from "@/lib/response-types/types";

export const VALID_QUESTION_TYPES: readonly ResponseTypeId[] = [
  "multipleChoice",
  "text",
  "shortAnswer",
  "extendedWritten",
  "structuredMultiPart",
  "annotateSource",
  "drawDiagram",
  "graph",
  "photoHandwritten",
  "trueFalse",
  "matching",
  "ordering",
  "labelling",
  "mathInput",
] as const;

const VALID_SET = new Set<string>(VALID_QUESTION_TYPES);

export function isValidQuestionType(type: string): type is ResponseTypeId {
  return VALID_SET.has(type);
}
