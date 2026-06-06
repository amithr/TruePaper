import type {
  AnnotateSourceValue,
  DrawDiagramValue,
  ExtendedWrittenValue,
  GraphValue,
  LabellingValue,
  MatchingValue,
  MathInputValue,
  MultipleChoiceValue,
  OrderingValue,
  PhotoHandwrittenValue,
  ResponseTypeId,
  ResponseValue,
  ShortAnswerValue,
  StructuredMultiPartValue,
  TrueFalseValue,
} from "@/lib/response-types/types";
import { normalizeResponseType } from "@/lib/response-types/types";
import type { DrawingStroke } from "@/lib/response-types/drawing";

const STRUCTURED_PREFIX = '{"type":"structuredMultiPart"';
const ANNOTATE_PREFIX = '{"type":"annotateSource"';
const JSON_TYPES = new Set([
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
]);

function parseJsonValue<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseJsonWire<T extends { type: string }>(
  text: string,
  expectedType: string,
): T | null {
  if (!text.startsWith("{")) {
    return null;
  }
  const parsed = parseJsonValue<T>(text);
  if (parsed?.type === expectedType) {
    return parsed;
  }
  return null;
}

/** Parse a wire-format answer string into a typed ResponseValue. */
export function parseResponseValue(
  type: ResponseTypeId | string,
  raw: string | undefined,
): ResponseValue {
  const normalized = normalizeResponseType(type);
  const text = raw ?? "";

  if (normalized === "multipleChoice") {
    return { type: "multipleChoice", choice: text };
  }

  if (normalized === "structuredMultiPart") {
    const parsed = parseJsonWire<StructuredMultiPartValue>(text, "structuredMultiPart");
    if (parsed?.parts) {
      return {
        type: "structuredMultiPart",
        parts: parsed.parts,
        activePartId: parsed.activePartId,
      };
    }
  }

  if (normalized === "annotateSource") {
    const parsed = parseJsonWire<AnnotateSourceValue>(text, "annotateSource");
    if (parsed && Array.isArray(parsed.highlights)) {
      return { type: "annotateSource", highlights: parsed.highlights };
    }
  }

  if (normalized === "drawDiagram") {
    const parsed = parseJsonWire<DrawDiagramValue>(text, "drawDiagram");
    if (parsed && Array.isArray(parsed.strokes)) {
      return { type: "drawDiagram", strokes: parsed.strokes };
    }
    return { type: "drawDiagram", strokes: [] };
  }

  if (normalized === "graph") {
    const parsed = parseJsonWire<GraphValue>(text, "graph");
    if (parsed && Array.isArray(parsed.points)) {
      return {
        type: "graph",
        points: parsed.points,
        lines: Array.isArray(parsed.lines) ? parsed.lines : [],
        labels: Array.isArray(parsed.labels) ? parsed.labels : [],
      };
    }
    return { type: "graph", points: [], lines: [], labels: [] };
  }

  if (normalized === "photoHandwritten") {
    const parsed = parseJsonWire<PhotoHandwrittenValue>(text, "photoHandwritten");
    if (parsed?.imageDataUrl) {
      return {
        type: "photoHandwritten",
        imageDataUrl: parsed.imageDataUrl,
        width: parsed.width ?? 0,
        height: parsed.height ?? 0,
      };
    }
    return { type: "photoHandwritten", imageDataUrl: "", width: 0, height: 0 };
  }

  if (normalized === "trueFalse") {
    const parsed = parseJsonWire<TrueFalseValue>(text, "trueFalse");
    if (parsed && "answer" in parsed) {
      return { type: "trueFalse", answer: parsed.answer };
    }
    return { type: "trueFalse", answer: null };
  }

  if (normalized === "matching") {
    const parsed = parseJsonWire<MatchingValue>(text, "matching");
    if (parsed?.pairs) {
      return { type: "matching", pairs: parsed.pairs };
    }
    return { type: "matching", pairs: {} };
  }

  if (normalized === "ordering") {
    const parsed = parseJsonWire<OrderingValue>(text, "ordering");
    if (parsed?.order) {
      return { type: "ordering", order: parsed.order };
    }
    return { type: "ordering", order: [] };
  }

  if (normalized === "labelling") {
    const parsed = parseJsonWire<LabellingValue>(text, "labelling");
    if (parsed?.assignments) {
      return { type: "labelling", assignments: parsed.assignments };
    }
    return { type: "labelling", assignments: {} };
  }

  if (normalized === "mathInput") {
    const parsed = parseJsonWire<MathInputValue>(text, "mathInput");
    if (parsed && typeof parsed.latex === "string") {
      return { type: "mathInput", latex: parsed.latex };
    }
    return { type: "mathInput", latex: text };
  }

  if (normalized === "shortAnswer") {
    return { type: "shortAnswer", text };
  }

  return { type: "extendedWritten", text };
}

/** Serialize a ResponseValue to the wire string stored in form_responses.answers. */
export function serializeResponseValue(value: ResponseValue): string {
  switch (value.type) {
    case "multipleChoice":
      return value.choice;
    case "shortAnswer":
    case "extendedWritten":
      return value.text;
    case "structuredMultiPart":
      return JSON.stringify({
        type: "structuredMultiPart",
        parts: value.parts,
        activePartId: value.activePartId,
      });
    case "annotateSource":
      return JSON.stringify({
        type: "annotateSource",
        highlights: value.highlights,
      });
    case "drawDiagram":
      return JSON.stringify({
        type: "drawDiagram",
        strokes: value.strokes,
      });
    case "graph":
      return JSON.stringify({
        type: "graph",
        points: value.points,
        lines: value.lines,
        labels: value.labels,
      });
    case "photoHandwritten":
      return JSON.stringify({
        type: "photoHandwritten",
        imageDataUrl: value.imageDataUrl,
        width: value.width,
        height: value.height,
      });
    case "trueFalse":
      return JSON.stringify({
        type: "trueFalse",
        answer: value.answer,
      });
    case "matching":
      return JSON.stringify({
        type: "matching",
        pairs: value.pairs,
      });
    case "ordering":
      return JSON.stringify({
        type: "ordering",
        order: value.order,
      });
    case "labelling":
      return JSON.stringify({
        type: "labelling",
        assignments: value.assignments,
      });
    case "mathInput":
      return JSON.stringify({
        type: "mathInput",
        latex: value.latex,
      });
    default:
      return "";
  }
}

/** Flat preview for roster subtitles and search. */
export function previewResponseText(
  type: ResponseTypeId | string,
  raw: string | undefined,
  maxLen = 120,
): string {
  const value = parseResponseValue(type, raw);
  let text = "";
  switch (value.type) {
    case "multipleChoice":
      text = value.choice;
      break;
    case "shortAnswer":
    case "extendedWritten":
    case "mathInput":
      text = value.type === "mathInput" ? value.latex : value.text;
      break;
    case "structuredMultiPart":
      text = Object.values(value.parts).join(" ");
      break;
    case "annotateSource":
      text = value.highlights.map((h) => h.note ?? "").filter(Boolean).join(" ");
      break;
    case "trueFalse":
      text = value.answer === null ? "" : value.answer ? "True" : "False";
      break;
    case "matching":
      text = Object.entries(value.pairs)
        .map(([l, r]) => `${l}→${r}`)
        .join(" ");
      break;
    case "ordering":
      text = value.order.join(" ");
      break;
    case "labelling":
      text = Object.entries(value.assignments)
        .map(([z, t]) => `${z}=${t}`)
        .join(" ");
      break;
    case "drawDiagram":
      text = value.strokes.length > 0 ? "Drawing" : "";
      break;
    case "graph": {
      const parts: string[] = [];
      if (value.points.length > 0) {
        parts.push(`${value.points.length} point${value.points.length === 1 ? "" : "s"}`);
      }
      const labelText = value.labels
        .map((label) => label.text.trim())
        .filter(Boolean)
        .join(", ");
      if (labelText) {
        parts.push(labelText);
      }
      text = parts.join("; ");
      break;
    }
    case "photoHandwritten":
      text = value.imageDataUrl ? "Photo upload" : "";
      break;
    default:
      text = "";
  }
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

export function isResponseAnswered(
  type: ResponseTypeId | string,
  raw: string | undefined,
): boolean {
  const value = parseResponseValue(type, raw);
  switch (value.type) {
    case "multipleChoice":
      return value.choice.trim().length > 0;
    case "shortAnswer":
    case "extendedWritten":
    case "mathInput":
      return (value.type === "mathInput" ? value.latex : value.text).trim().length > 0;
    case "structuredMultiPart":
      return Object.values(value.parts).some((part) => part.trim().length > 0);
    case "annotateSource":
      return value.highlights.length > 0;
    case "drawDiagram":
      return value.strokes.length > 0;
    case "graph":
      return (
        value.points.length > 0 ||
        value.lines.length > 0 ||
        value.labels.some((label) => label.text.trim().length > 0)
      );
    case "photoHandwritten":
      return value.imageDataUrl.trim().length > 0;
    case "trueFalse":
      return value.answer !== null;
    case "matching": {
      const pairs = value.pairs;
      return Object.keys(pairs).length > 0 && Object.values(pairs).every((v) => v.trim().length > 0);
    }
    case "ordering":
      return value.order.length > 0;
    case "labelling": {
      const assignments = value.assignments;
      return Object.keys(assignments).length > 0;
    }
    default:
      return false;
  }
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

export function updateResponseValue(
  type: ResponseTypeId | string,
  current: string | undefined,
  patch: Partial<ResponseValue>,
): string {
  const value = parseResponseValue(type, current);
  const merged = { ...value, ...patch } as ResponseValue;
  return serializeResponseValue(merged);
}

export function isStructuredWire(raw: string): boolean {
  return raw.startsWith(STRUCTURED_PREFIX);
}

export function isAnnotateWire(raw: string): boolean {
  return raw.startsWith(ANNOTATE_PREFIX);
}

export function isJsonWireType(type: ResponseTypeId | string): boolean {
  return JSON_TYPES.has(normalizeResponseType(type));
}

export type { ShortAnswerValue, ExtendedWrittenValue, StructuredMultiPartValue, AnnotateSourceValue, MultipleChoiceValue, DrawingStroke };
