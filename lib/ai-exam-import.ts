import { getResponseTypeMeta, parseResponseConfig } from "@/lib/response-types/registry";
import type { ResponseConfig, ResponseTypeId } from "@/lib/response-types/types";
import { normalizeResponseType } from "@/lib/response-types/types";
import { isValidQuestionType } from "@/lib/response-types/valid-types";

export const AI_EXAM_TEMPLATE_FILENAME = "truepaper-exam-authoring-guide.md";

/** Hard cap so a malformed/huge file can't create thousands of rows. */
export const AI_EXAM_MAX_QUESTIONS = 200;

export class AiExamParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiExamParseError";
  }
}

export type ParsedAiExamQuestion = {
  type: ResponseTypeId;
  prompt: string;
  options: string[];
  correctAnswer: string | null;
  points: number;
  responseConfig: ResponseConfig;
};

export type ParsedAiExam = {
  title: string;
  description: string;
  questions: ParsedAiExamQuestion[];
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function clampPoints(raw: unknown, fallback: number): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) {
    return Math.max(1, Math.min(1000, fallback));
  }
  return Math.min(1000, n);
}

function parseQuestion(raw: unknown, index: number): ParsedAiExamQuestion {
  const label = `Question ${index + 1}`;
  const obj = asObject(raw);
  if (!obj) {
    throw new AiExamParseError(`${label}: each item in "questions" must be an object.`);
  }

  const rawType = typeof obj.type === "string" ? obj.type.trim() : "";
  if (!rawType) {
    throw new AiExamParseError(`${label}: missing "type".`);
  }
  if (!isValidQuestionType(rawType)) {
    throw new AiExamParseError(`${label}: unsupported question type "${rawType}".`);
  }

  const type = normalizeResponseType(rawType);
  const meta = getResponseTypeMeta(type);

  const prompt =
    typeof obj.prompt === "string" && obj.prompt.trim()
      ? obj.prompt.trim()
      : meta.defaultPrompt();

  const points = clampPoints(obj.points, meta.defaultPoints);

  // Accept either "config" or "responseConfig"; merge over type defaults.
  const rawConfig = asObject(obj.config) ?? asObject(obj.responseConfig) ?? {};
  const responseConfig = parseResponseConfig(type, rawConfig);

  let options: string[] = [];
  let correctAnswer: string | null = null;

  if (type === "multipleChoice") {
    options = Array.isArray(obj.options)
      ? obj.options
          .filter((option): option is string => typeof option === "string")
          .map((option) => option.trim())
          .filter((option) => option.length > 0)
      : [];
    if (options.length < 2) {
      throw new AiExamParseError(`${label}: multiple choice needs at least 2 options.`);
    }
    const requested = typeof obj.correctAnswer === "string" ? obj.correctAnswer.trim() : "";
    correctAnswer = requested && options.includes(requested) ? requested : null;
  }

  return { type, prompt, options, correctAnswer, points, responseConfig };
}

/**
 * Validate + normalize an AI-generated exam document (the JSON a teacher uploads).
 * Accepts the document at the root or wrapped in `{ exam: {...} }`.
 * Throws {@link AiExamParseError} with a human-readable message on invalid input.
 */
export function parseAiExamDocument(raw: unknown): ParsedAiExam {
  const root = asObject(raw);
  if (!root) {
    throw new AiExamParseError('The file must be a JSON object with a "questions" array.');
  }

  const doc = asObject(root.exam) ?? root;
  const questionsRaw = doc.questions;

  if (!Array.isArray(questionsRaw) || questionsRaw.length === 0) {
    throw new AiExamParseError('Add at least one question under "questions".');
  }
  if (questionsRaw.length > AI_EXAM_MAX_QUESTIONS) {
    throw new AiExamParseError(`Too many questions (maximum ${AI_EXAM_MAX_QUESTIONS}).`);
  }

  const title =
    typeof doc.title === "string" && doc.title.trim()
      ? doc.title.trim().slice(0, 200)
      : "Untitled Form";
  const description =
    typeof doc.description === "string" ? doc.description.trim().slice(0, 2000) : "";

  const questions = questionsRaw.map((question, index) => parseQuestion(question, index));

  return { title, description, questions };
}

type GuideTypeDoc = {
  type: ResponseTypeId;
  summary: string;
  /** Example fields beyond prompt/points/type, formatted as JSON snippet lines. */
  example: Record<string, unknown>;
};

/**
 * Per-type authoring notes for the downloadable guide. Keyed by every authorable
 * type so the generated doc always documents the full schema the importer accepts.
 */
const GUIDE_TYPE_DOCS: GuideTypeDoc[] = [
  {
    type: "multipleChoice",
    summary: "One correct option. Provide `options` (2+) and a `correctAnswer` that exactly matches one option.",
    example: {
      type: "multipleChoice",
      prompt: "Which organelle performs photosynthesis?",
      points: 1,
      options: ["Mitochondrion", "Chloroplast", "Ribosome", "Nucleus"],
      correctAnswer: "Chloroplast",
    },
  },
  {
    type: "trueFalse",
    summary: "A true/false statement. Put the answer in `config.correctAnswer` (boolean).",
    example: {
      type: "trueFalse",
      prompt: "Chlorophyll absorbs mostly green light.",
      points: 1,
      config: { correctAnswer: false },
    },
  },
  {
    type: "shortAnswer",
    summary: "Single word/phrase, auto-graded. List acceptable answers in `config.acceptedAnswers`.",
    example: {
      type: "shortAnswer",
      prompt: "Name the gas released during the light reaction.",
      points: 1,
      config: { acceptedAnswers: ["oxygen", "O2"], caseSensitive: false },
    },
  },
  {
    type: "extendedWritten",
    summary: "Long-form written response, manually graded. Optional word targets in `config`.",
    example: {
      type: "extendedWritten",
      prompt: "Explain how light energy is converted to chemical energy.",
      points: 6,
      config: { showCount: "words", targetWords: 200, minWords: 50 },
    },
  },
  {
    type: "structuredMultiPart",
    summary: "A question with labelled sub-parts. Provide `config.parts` (each with id, label, prompt).",
    example: {
      type: "structuredMultiPart",
      prompt: "Photosynthesis stages",
      points: 8,
      config: {
        parts: [
          { id: "a", label: "a)", prompt: "Describe the light-dependent reaction." },
          { id: "b", label: "b)", prompt: "Describe the Calvin cycle." },
        ],
      },
    },
  },
  {
    type: "matching",
    summary:
      "Match left items to right items. Provide `config.left`, `config.right` (each id+text) and `config.correct` mapping leftId → rightId.",
    example: {
      type: "matching",
      prompt: "Match each term to its definition.",
      points: 3,
      config: {
        left: [
          { id: "l1", text: "Chlorophyll" },
          { id: "l2", text: "Stomata" },
        ],
        right: [
          { id: "r1", text: "Green pigment" },
          { id: "r2", text: "Leaf pores" },
        ],
        correct: { l1: "r1", l2: "r2" },
      },
    },
  },
  {
    type: "ordering",
    summary: "Put items in the right sequence. Provide `config.items` (id+text) and `config.correctOrder` (array of ids).",
    example: {
      type: "ordering",
      prompt: "Order the steps of the scientific method.",
      points: 3,
      config: {
        items: [
          { id: "i1", text: "Hypothesis" },
          { id: "i2", text: "Experiment" },
          { id: "i3", text: "Conclusion" },
        ],
        correctOrder: ["i1", "i2", "i3"],
      },
    },
  },
  {
    type: "labelling",
    summary:
      "Assign labels to zones (e.g. a diagram). Provide `config.zones`, `config.terms` (id+text) and `config.correct` mapping zoneId → termId.",
    example: {
      type: "labelling",
      prompt: "Label the parts of the cell.",
      points: 3,
      config: {
        zones: [
          { id: "z1", text: "Outer boundary" },
          { id: "z2", text: "Control centre" },
        ],
        terms: [
          { id: "t1", text: "Cell membrane" },
          { id: "t2", text: "Nucleus" },
        ],
        correct: { z1: "t1", z2: "t2" },
      },
    },
  },
  {
    type: "mathInput",
    summary: "Student enters an equation/expression. Optional `config.placeholder`.",
    example: {
      type: "mathInput",
      prompt: "Write the overall equation for photosynthesis.",
      points: 2,
      config: { placeholder: "e.g. 6CO2 + 6H2O -> ..." },
    },
  },
  {
    type: "annotateSource",
    summary: "Student highlights/annotates a passage. Put the passage in `config.passageText`.",
    example: {
      type: "annotateSource",
      prompt: "Highlight the evidence the author uses.",
      points: 5,
      config: { passageText: "Paste the full source passage here for students to annotate." },
    },
  },
  {
    type: "drawDiagram",
    summary: "Student draws on a canvas (no answer key). Optional `config.width`/`config.height`.",
    example: {
      type: "drawDiagram",
      prompt: "Draw and label a chloroplast.",
      points: 4,
      config: { width: 600, height: 360 },
    },
  },
  {
    type: "graph",
    summary: "Student plots on a coordinate plane (no answer key). Optional axis bounds/labels in `config`.",
    example: {
      type: "graph",
      prompt: "Plot rate of reaction against temperature.",
      points: 4,
      config: { xMin: 0, xMax: 10, yMin: 0, yMax: 10, xAxisLabel: "Temp (°C)", yAxisLabel: "Rate" },
    },
  },
  {
    type: "photoHandwritten",
    summary: "Student uploads a photo of handwritten work (no answer key).",
    example: {
      type: "photoHandwritten",
      prompt: "Upload your worked solution.",
      points: 4,
      config: {},
    },
  },
];

const FENCE = "```";

/**
 * Build the human + LLM readable Markdown guide that a teacher downloads and
 * pastes into ChatGPT/Claude alongside their source content. Derived from the
 * response-type registry so it stays in sync with supported question types.
 */
export function buildAiExamGuideMarkdown(): string {
  const fullExample = {
    title: "Photosynthesis — Unit Quiz",
    description: "Short check for understanding after the photosynthesis unit.",
    questions: [
      GUIDE_TYPE_DOCS[0].example,
      GUIDE_TYPE_DOCS[1].example,
      GUIDE_TYPE_DOCS[2].example,
      GUIDE_TYPE_DOCS[5].example,
    ],
  };

  const typeRows = GUIDE_TYPE_DOCS.map((doc) => `| \`${doc.type}\` | ${doc.summary} |`).join("\n");

  const typeExamples = GUIDE_TYPE_DOCS.map(
    (doc) =>
      `### \`${doc.type}\`\n\n${doc.summary}\n\n${FENCE}json\n${JSON.stringify(doc.example, null, 2)}\n${FENCE}`,
  ).join("\n\n");

  return `# Truepaper — AI Exam Authoring Guide

This file tells an AI assistant (ChatGPT, Claude, etc.) how to turn your teaching
content into an exam you can import into Truepaper.

## How to use this

1. Open ChatGPT or Claude.
2. Paste **this entire file**, then paste or attach your source content
   (notes, a textbook chapter, a topic outline, learning objectives…).
3. Ask: *"Using the guide above, generate an exam as a single JSON file."*
4. Save the assistant's reply as a \`.json\` file.
5. In Truepaper: **Dashboard → Form library → Import exam**, and upload that file.
6. The exam opens in the form builder, fully editable before you start a session.

## Output rules (important)

- Output **one JSON object only** — no Markdown, no code fences, no commentary.
- Use **only** the question \`type\` values listed below.
- Every question needs a \`type\` and a \`prompt\`. \`points\` is optional (sensible
  defaults are applied).
- Only \`multipleChoice\` uses top-level \`options\` and \`correctAnswer\`.
- All other answer keys / settings go inside a \`config\` object (see each type).
- Maximum ${AI_EXAM_MAX_QUESTIONS} questions per file.

## Top-level shape

${FENCE}json
{
  "title": "string — the exam title",
  "description": "string — optional summary shown to the teacher",
  "questions": [ /* array of question objects, see below */ ]
}
${FENCE}

## Question types

| type | how to use it |
|------|---------------|
${typeRows}

## Per-type examples

${typeExamples}

## Full example

A complete, valid file looks like this:

${FENCE}json
${JSON.stringify(fullExample, null, 2)}
${FENCE}

## Notes for the assistant

- Prefer a mix of question types appropriate to the content.
- For objective types (\`matching\`, \`ordering\`, \`labelling\`) always include the
  full \`config\` with ids that are consistent between the items and the answer key.
- Keep ids short and unique within a question (e.g. \`l1\`, \`r1\`, \`i1\`).
- Do not invent new \`type\` values or extra top-level fields.
`;
}
