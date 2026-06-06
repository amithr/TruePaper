/**
 * Shared response-type abstraction. New types implement ResponseTypePlugin in
 * registry.ts without touching session/feedback/sync core logic.
 */

import type { DrawingStroke } from "@/lib/response-types/drawing";

export type ResponseTypeId =
  | "multipleChoice"
  | "shortAnswer"
  | "extendedWritten"
  | "structuredMultiPart"
  | "annotateSource"
  | "drawDiagram"
  | "graph"
  | "photoHandwritten"
  | "trueFalse"
  | "matching"
  | "ordering"
  | "labelling"
  | "mathInput"
  /** Legacy DB rows; treated as extendedWritten */
  | "text";

export type RubricLevel = {
  id: string;
  label: string;
  descriptor: string;
  points: number;
};

export type RubricCriterion = {
  id: string;
  label: string;
  levels: RubricLevel[];
};

export type ShortAnswerConfig = {
  acceptedAnswers?: string[];
  caseSensitive?: boolean;
};

export type ExtendedWrittenConfig = {
  minWords?: number;
  targetWords?: number;
  showCount?: "words" | "chars";
};

export type StructuredPart = {
  id: string;
  label: string;
  prompt?: string;
};

export type StructuredMultiPartConfig = {
  parts: StructuredPart[];
};

export type AnnotateSourceConfig = {
  passageText: string;
};

export type ObjectiveItem = { id: string; text: string };

export type DrawDiagramConfig = {
  width?: number;
  height?: number;
  backgroundDataUrl?: string;
};

export type GraphConfig = {
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width?: number;
  height?: number;
  showGrid?: boolean;
};

export type PhotoHandwrittenConfig = {
  maxDimension?: number;
};

export type TrueFalseConfig = {
  correctAnswer?: boolean;
};

export type MatchingConfig = {
  left: ObjectiveItem[];
  right: ObjectiveItem[];
  correct: Record<string, string>;
};

export type OrderingConfig = {
  items: ObjectiveItem[];
  correctOrder: string[];
};

export type LabellingConfig = {
  zones: ObjectiveItem[];
  terms: ObjectiveItem[];
  correct: Record<string, string>;
};

export type MathInputConfig = {
  placeholder?: string;
};

export type ResponseConfig =
  | ShortAnswerConfig
  | ExtendedWrittenConfig
  | StructuredMultiPartConfig
  | AnnotateSourceConfig
  | DrawDiagramConfig
  | GraphConfig
  | PhotoHandwrittenConfig
  | TrueFalseConfig
  | MatchingConfig
  | OrderingConfig
  | LabellingConfig
  | MathInputConfig
  | Record<string, never>;

export type HighlightSpan = {
  id: string;
  start: number;
  end: number;
  note?: string;
};

export type ShortAnswerValue = { type: "shortAnswer"; text: string };
export type ExtendedWrittenValue = { type: "extendedWritten"; text: string };
export type StructuredMultiPartValue = {
  type: "structuredMultiPart";
  parts: Record<string, string>;
  activePartId?: string;
};
export type AnnotateSourceValue = {
  type: "annotateSource";
  highlights: HighlightSpan[];
};
export type MultipleChoiceValue = { type: "multipleChoice"; choice: string };

export type DrawDiagramValue = { type: "drawDiagram"; strokes: DrawingStroke[] };

export type GraphPoint = { id: string; x: number; y: number };
export type GraphLine = { id: string; from: string; to: string };
export type GraphValue = { type: "graph"; points: GraphPoint[]; lines: GraphLine[] };

export type PhotoHandwrittenValue = {
  type: "photoHandwritten";
  imageDataUrl: string;
  width: number;
  height: number;
};
export type TrueFalseValue = { type: "trueFalse"; answer: boolean | null };
export type MatchingValue = { type: "matching"; pairs: Record<string, string> };
export type OrderingValue = { type: "ordering"; order: string[] };
export type LabellingValue = { type: "labelling"; assignments: Record<string, string> };
export type MathInputValue = { type: "mathInput"; latex: string };

export type ResponseValue =
  | ShortAnswerValue
  | ExtendedWrittenValue
  | StructuredMultiPartValue
  | AnnotateSourceValue
  | MultipleChoiceValue
  | DrawDiagramValue
  | GraphValue
  | PhotoHandwrittenValue
  | TrueFalseValue
  | MatchingValue
  | OrderingValue
  | LabellingValue
  | MathInputValue;

export type InlineComment = {
  id: string;
  start: number;
  end: number;
  message: string;
};

export type RubricScoreEntry = {
  criterionId: string;
  levelId: string;
  points: number;
  comment?: string;
};

export type TeacherFeedbackPayload =
  | { kind: "message"; message: string }
  | { kind: "perPart"; parts: Record<string, string> }
  | { kind: "inline"; comments: InlineComment[] }
  | { kind: "quick"; nudge: string }
  | { kind: "rubric"; scores: RubricScoreEntry[]; total?: number }
  | { kind: "canvas"; strokes: DrawingStroke[] };

export type FeedbackAnchor = "whole" | "part" | "range" | "canvas";

export function isWrittenResponseType(type: ResponseTypeId): boolean {
  return (
    type === "text" ||
    type === "shortAnswer" ||
    type === "extendedWritten" ||
    type === "structuredMultiPart" ||
    type === "annotateSource" ||
    type === "mathInput"
  );
}

export function isObjectiveResponseType(type: ResponseTypeId): boolean {
  return (
    type === "multipleChoice" ||
    type === "trueFalse" ||
    type === "matching" ||
    type === "ordering" ||
    type === "labelling"
  );
}

export function isVisualResponseType(type: ResponseTypeId): boolean {
  return type === "drawDiagram" || type === "graph" || type === "photoHandwritten";
}

const KNOWN_TYPES = new Set<ResponseTypeId>([
  "multipleChoice",
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
  "text",
]);

export function normalizeResponseType(type: string): ResponseTypeId {
  if (type === "text") {
    return "extendedWritten";
  }
  if (KNOWN_TYPES.has(type as ResponseTypeId)) {
    return type as ResponseTypeId;
  }
  return "extendedWritten";
}
