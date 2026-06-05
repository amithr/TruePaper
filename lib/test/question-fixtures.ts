import type { Question } from "@/lib/forms";
import { getResponseTypeMeta } from "@/lib/response-types/registry";
import type { ResponseTypeId } from "@/lib/response-types/types";

export function makeQuestion(
  type: ResponseTypeId = "trueFalse",
  overrides: Partial<Question> = {},
): Question {
  const meta = getResponseTypeMeta(type);
  return {
    id: "q-fixture-1",
    prompt: "Fixture question?",
    type,
    options: [],
    correctAnswer: null,
    points: meta.defaultPoints,
    displayOrder: 0,
    responseConfig: meta.defaultConfig(),
    ...overrides,
  };
}
