import type { Question } from "@/lib/forms";
import { isAutogradableType } from "@/lib/response-types/builder-groups";
import { hasAutogradeKey } from "@/lib/response-types/autograde";
import { normalizeResponseType } from "@/lib/response-types/types";

export type BuilderPanelKey = "image" | "response" | "scoring";

export type BuilderSummaryToken = {
  key: BuilderPanelKey;
  /** i18n key under `home.builder.tokens.*` */
  labelKey: string;
  values?: Record<string, string | number>;
};

/** Derive clickable summary tokens for a builder question card. */
export function buildSummaryTokens(question: Question): BuilderSummaryToken[] {
  const type = normalizeResponseType(question.type);
  const tokens: BuilderSummaryToken[] = [];
  const config = question.responseConfig as Record<string, unknown>;

  if (question.promptImagePath) {
    tokens.push({ key: "image", labelKey: "image" });
  }

  if (type === "extendedWritten" || type === "text") {
    const min = Math.max(0, Number(config.minWords ?? 0));
    const target = Math.max(0, Number(config.targetWords ?? 0));
    if (min > 0 || target > 0) {
      tokens.push({
        key: "response",
        labelKey: target > 0 ? "wordRange" : "wordMin",
        values: { min, target },
      });
    } else {
      tokens.push({ key: "response", labelKey: "wordTargets" });
    }
  } else if (type === "shortAnswer" || type === "mathInput") {
    const accepted = Array.isArray(config.acceptedAnswers)
      ? config.acceptedAnswers.filter((a) => typeof a === "string" && a.trim())
      : [];
    tokens.push({
      key: "response",
      labelKey: accepted.length === 1 ? "acceptedOne" : "acceptedOther",
      values: { n: accepted.length },
    });
  } else if (type === "multipleChoice") {
    const n = question.options.length;
    tokens.push({
      key: "response",
      labelKey: n === 1 ? "choicesOne" : "choicesOther",
      values: { n },
    });
  } else if (type === "trueFalse") {
    tokens.push({ key: "response", labelKey: "trueFalse" });
  } else if (type === "structuredMultiPart") {
    const parts = Array.isArray(config.parts) ? config.parts : [];
    tokens.push({
      key: "response",
      labelKey: parts.length === 1 ? "partsOne" : "partsOther",
      values: { n: parts.length },
    });
  } else if (type === "matching" || type === "ordering" || type === "labelling") {
    tokens.push({ key: "response", labelKey: "answerKey" });
  } else if (type === "annotateSource") {
    tokens.push({ key: "response", labelKey: "sourcePassage" });
  } else if (type === "drawDiagram" || type === "graph" || type === "photoHandwritten") {
    tokens.push({ key: "response", labelKey: "canvasSettings" });
  }

  const auto = isAutogradableType(type) && hasAutogradeKey(question);
  tokens.push({
    key: "scoring",
    labelKey: auto
      ? question.points === 1
        ? "pointsOneAuto"
        : "pointsOtherAuto"
      : question.points === 1
        ? "pointsOne"
        : "pointsOther",
    values: { n: question.points },
  });

  return tokens;
}

export function countAutogradableQuestions(questions: Question[]): number {
  return questions.filter((q) => isAutogradableType(q.type) && hasAutogradeKey(q)).length;
}
