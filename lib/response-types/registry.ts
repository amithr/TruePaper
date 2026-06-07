import type {
  AnnotateSourceConfig,
  DrawDiagramConfig,
  ExtendedWrittenConfig,
  FeedbackAnchor,
  GraphConfig,
  LabellingConfig,
  MatchingConfig,
  MathInputConfig,
  OrderingConfig,
  ResponseConfig,
  ResponseTypeId,
  RubricCriterion,
  StructuredMultiPartConfig,
  TrueFalseConfig,
} from "@/lib/response-types/types";

export type ResponseTypeMeta = {
  id: ResponseTypeId;
  /** i18n key under responseTypes.{id} */
  labelKey: string;
  descriptionKey: string;
  feedbackAnchors: FeedbackAnchor[];
  supportsLiveFeedback: boolean;
  supportsRubric: boolean;
  defaultPoints: number;
  defaultConfig: () => ResponseConfig;
  defaultPrompt: () => string;
};

export const CANNED_COMMENT_KEYS = [
  "onTrack",
  "checkPartB",
  "defineTerm",
  "addEvidence",
  "strongStart",
  "reReadPassage",
] as const;

export type CannedCommentKey = (typeof CANNED_COMMENT_KEYS)[number];

export const QUICK_NUDGE_KEYS = [
  "onTrack",
  "keepGoing",
  "checkInstructions",
  "almostThere",
] as const;

export type QuickNudgeKey = (typeof QUICK_NUDGE_KEYS)[number];

export const DEFAULT_RUBRIC: RubricCriterion[] = [
  {
    id: "understanding",
    label: "Understanding",
    levels: [
      { id: "l1", label: "Limited", descriptor: "Partial or inaccurate understanding", points: 1 },
      { id: "l2", label: "Adequate", descriptor: "Mostly accurate understanding", points: 2 },
      { id: "l3", label: "Thorough", descriptor: "Clear, accurate understanding", points: 3 },
      { id: "l4", label: "Insightful", descriptor: "Nuanced, well-developed understanding", points: 4 },
    ],
  },
  {
    id: "evidence",
    label: "Use of evidence",
    levels: [
      { id: "l1", label: "Limited", descriptor: "Little or no relevant evidence", points: 1 },
      { id: "l2", label: "Adequate", descriptor: "Some relevant evidence", points: 2 },
      { id: "l3", label: "Thorough", descriptor: "Well-chosen evidence", points: 3 },
      { id: "l4", label: "Insightful", descriptor: "Persuasive, integrated evidence", points: 4 },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    levels: [
      { id: "l1", label: "Limited", descriptor: "Hard to follow", points: 1 },
      { id: "l2", label: "Adequate", descriptor: "Generally clear", points: 2 },
      { id: "l3", label: "Thorough", descriptor: "Clear and organised", points: 3 },
      { id: "l4", label: "Insightful", descriptor: "Precise and compelling", points: 4 },
    ],
  },
];

const REGISTRY: Record<ResponseTypeId, ResponseTypeMeta> = {
  multipleChoice: {
    id: "multipleChoice",
    labelKey: "multipleChoice",
    descriptionKey: "multipleChoiceDesc",
    feedbackAnchors: ["whole"],
    supportsLiveFeedback: true,
    supportsRubric: false,
    defaultPoints: 1,
    defaultConfig: () => ({}),
    defaultPrompt: () => "New multiple choice question",
  },
  text: {
    id: "extendedWritten",
    labelKey: "extendedWritten",
    descriptionKey: "extendedWrittenDesc",
    feedbackAnchors: ["whole", "range"],
    supportsLiveFeedback: true,
    supportsRubric: true,
    defaultPoints: 4,
    defaultConfig: () => ({ showCount: "words", targetWords: 150 } satisfies ExtendedWrittenConfig),
    defaultPrompt: () => "New written response",
  },
  shortAnswer: {
    id: "shortAnswer",
    labelKey: "shortAnswer",
    descriptionKey: "shortAnswerDesc",
    feedbackAnchors: ["whole"],
    supportsLiveFeedback: true,
    supportsRubric: false,
    defaultPoints: 1,
    defaultConfig: () => ({ acceptedAnswers: [] }),
    defaultPrompt: () => "New short answer",
  },
  extendedWritten: {
    id: "extendedWritten",
    labelKey: "extendedWritten",
    descriptionKey: "extendedWrittenDesc",
    feedbackAnchors: ["whole", "range"],
    supportsLiveFeedback: true,
    supportsRubric: true,
    defaultPoints: 6,
    defaultConfig: () => ({ showCount: "words", targetWords: 200, minWords: 50 } satisfies ExtendedWrittenConfig),
    defaultPrompt: () => "New extended response",
  },
  structuredMultiPart: {
    id: "structuredMultiPart",
    labelKey: "structuredMultiPart",
    descriptionKey: "structuredMultiPartDesc",
    feedbackAnchors: ["whole", "part"],
    supportsLiveFeedback: true,
    supportsRubric: true,
    defaultPoints: 8,
    defaultConfig: () =>
      ({
        parts: [
          { id: "a", label: "a)", prompt: "" },
          { id: "b", label: "b)", prompt: "" },
          { id: "c", label: "c)", prompt: "" },
        ],
      }) satisfies StructuredMultiPartConfig,
    defaultPrompt: () => "New structured question",
  },
  annotateSource: {
    id: "annotateSource",
    labelKey: "annotateSource",
    descriptionKey: "annotateSourceDesc",
    feedbackAnchors: ["whole", "range"],
    supportsLiveFeedback: true,
    supportsRubric: true,
    defaultPoints: 5,
    defaultConfig: () =>
      ({
        passageText:
          "Paste the source passage here. Students will highlight spans and add margin notes.",
      }) satisfies AnnotateSourceConfig,
    defaultPrompt: () => "Annotate the source",
  },
  drawDiagram: {
    id: "drawDiagram",
    labelKey: "drawDiagram",
    descriptionKey: "drawDiagramDesc",
    feedbackAnchors: ["whole", "canvas"],
    supportsLiveFeedback: true,
    supportsRubric: true,
    defaultPoints: 4,
    defaultConfig: () => ({ width: 600, height: 360 }) satisfies DrawDiagramConfig,
    defaultPrompt: () => "Draw your diagram",
  },
  graph: {
    id: "graph",
    labelKey: "graph",
    descriptionKey: "graphDesc",
    feedbackAnchors: ["whole", "canvas"],
    supportsLiveFeedback: true,
    supportsRubric: true,
    defaultPoints: 4,
    defaultConfig: () =>
      ({
        xMin: -5,
        xMax: 5,
        yMin: -5,
        yMax: 5,
        width: 480,
        height: 480,
        showGrid: true,
      }) satisfies GraphConfig,
    defaultPrompt: () => "Plot on the coordinate plane",
  },
  photoHandwritten: {
    id: "photoHandwritten",
    labelKey: "photoHandwritten",
    descriptionKey: "photoHandwrittenDesc",
    feedbackAnchors: ["whole", "canvas"],
    supportsLiveFeedback: true,
    supportsRubric: true,
    defaultPoints: 4,
    defaultConfig: () => ({ maxDimension: 960 }),
    defaultPrompt: () => "Upload handwritten work",
  },
  trueFalse: {
    id: "trueFalse",
    labelKey: "trueFalse",
    descriptionKey: "trueFalseDesc",
    feedbackAnchors: ["whole"],
    supportsLiveFeedback: true,
    supportsRubric: false,
    defaultPoints: 1,
    defaultConfig: () => ({ correctAnswer: true }) satisfies TrueFalseConfig,
    defaultPrompt: () => "True or false?",
  },
  matching: {
    id: "matching",
    labelKey: "matching",
    descriptionKey: "matchingDesc",
    feedbackAnchors: ["whole"],
    supportsLiveFeedback: true,
    supportsRubric: false,
    defaultPoints: 3,
    defaultConfig: () =>
      ({
        left: [
          { id: "l1", text: "Term A" },
          { id: "l2", text: "Term B" },
        ],
        right: [
          { id: "r1", text: "Definition 1" },
          { id: "r2", text: "Definition 2" },
        ],
        correct: { l1: "r1", l2: "r2" },
      }) satisfies MatchingConfig,
    defaultPrompt: () => "Match each term to its definition",
  },
  ordering: {
    id: "ordering",
    labelKey: "ordering",
    descriptionKey: "orderingDesc",
    feedbackAnchors: ["whole"],
    supportsLiveFeedback: true,
    supportsRubric: false,
    defaultPoints: 3,
    defaultConfig: () =>
      ({
        items: [
          { id: "i1", text: "First step" },
          { id: "i2", text: "Second step" },
          { id: "i3", text: "Third step" },
        ],
        correctOrder: ["i1", "i2", "i3"],
      }) satisfies OrderingConfig,
    defaultPrompt: () => "Put the steps in order",
  },
  labelling: {
    id: "labelling",
    labelKey: "labelling",
    descriptionKey: "labellingDesc",
    feedbackAnchors: ["whole"],
    supportsLiveFeedback: true,
    supportsRubric: false,
    defaultPoints: 3,
    defaultConfig: () =>
      ({
        zones: [
          { id: "z1", text: "Zone A" },
          { id: "z2", text: "Zone B" },
        ],
        terms: [
          { id: "t1", text: "Label 1" },
          { id: "t2", text: "Label 2" },
        ],
        correct: { z1: "t1", z2: "t2" },
      }) satisfies LabellingConfig,
    defaultPrompt: () => "Label each part",
  },
  mathInput: {
    id: "mathInput",
    labelKey: "mathInput",
    descriptionKey: "mathInputDesc",
    feedbackAnchors: ["whole"],
    supportsLiveFeedback: true,
    supportsRubric: false,
    defaultPoints: 2,
    defaultConfig: () =>
      ({ placeholder: "Enter your equation…" }) satisfies MathInputConfig,
    defaultPrompt: () => "Enter your answer",
  },
};

export function getResponseTypeMeta(type: ResponseTypeId | string): ResponseTypeMeta {
  const key = type === "text" ? "text" : type;
  return REGISTRY[key as ResponseTypeId] ?? REGISTRY.extendedWritten;
}

export function listAuthorableResponseTypes(): ResponseTypeMeta[] {
  return [
    REGISTRY.extendedWritten,
    REGISTRY.structuredMultiPart,
    REGISTRY.annotateSource,
    REGISTRY.drawDiagram,
    REGISTRY.graph,
    REGISTRY.photoHandwritten,
    REGISTRY.mathInput,
    REGISTRY.shortAnswer,
    REGISTRY.multipleChoice,
    REGISTRY.trueFalse,
    REGISTRY.matching,
    REGISTRY.ordering,
    REGISTRY.labelling,
  ];
}

export function parseResponseConfig(
  type: ResponseTypeId | string,
  raw: unknown,
): ResponseConfig {
  const meta = getResponseTypeMeta(type);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return meta.defaultConfig();
  }
  return { ...meta.defaultConfig(), ...(raw as Record<string, unknown>) } as ResponseConfig;
}

export function getRubricForQuestion(
  config: ResponseConfig,
): RubricCriterion[] {
  if (config && typeof config === "object" && "rubric" in config) {
    const rubric = (config as { rubric?: RubricCriterion[] }).rubric;
    if (Array.isArray(rubric) && rubric.length > 0) {
      return rubric;
    }
  }
  return DEFAULT_RUBRIC;
}

export function questionSupportsLiveFeedback(type: ResponseTypeId | string): boolean {
  return getResponseTypeMeta(type).supportsLiveFeedback;
}
