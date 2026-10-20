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
      prompt: "Photosynthesis happens in two stages inside the chloroplast.",
      points: 8,
      config: {
        parts: [
          { id: "a", label: "a)", prompt: "**Describe** the light-dependent reaction." },
          { id: "b", label: "b)", prompt: "**Describe** the Calvin cycle." },
        ],
      },
    },
  },
  {
    type: "matching",
    summary:
      "Match left items to right items. Provide `config.left`, `config.right` (each id+text) and `config.correct` mapping leftId → rightId. Students see both columns in the order you list them, so scramble `right` (never line it up with `left`).",
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
          { id: "r1", text: "Leaf pores" },
          { id: "r2", text: "Green pigment" },
        ],
        correct: { l1: "r2", l2: "r1" },
      },
    },
  },
  {
    type: "ordering",
    summary:
      "Put items in the right sequence. Provide `config.items` (id+text) and `config.correctOrder` (array of ids). Students start from the order of `items`, so list them **scrambled**, never in the correct order.",
    example: {
      type: "ordering",
      prompt: "Order the steps of the scientific method.",
      points: 3,
      config: {
        items: [
          { id: "i1", text: "Conclusion" },
          { id: "i2", text: "Hypothesis" },
          { id: "i3", text: "Experiment" },
        ],
        correctOrder: ["i2", "i3", "i1"],
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
    summary:
      "Student shows workings plus a final answer. Auto-graded from `config.acceptedAnswers` (comma-separated variants). Optional `config.placeholder` for the final-answer field.",
    example: {
      type: "mathInput",
      prompt:
        "A ball is thrown vertically upward with speed 12 m/s.\n\n**Calculate** the maximum height reached.\n\n- Take `g = 9.8 m/s²`\n- Show your working",
      points: 2,
      config: {
        acceptedAnswers: ["7.35", "7.3", "7.347"],
        placeholder: "e.g. 7.35",
      },
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
    summary:
      "Student draws on a canvas (no answer key), or uploads a photo of a paper drawing instead. Optional `config.width`/`config.height`; set `config.allowImageUpload: false` only if the teacher wants drawing on screen only.",
    example: {
      type: "drawDiagram",
      prompt: "Draw and label a chloroplast.",
      points: 4,
      config: { width: 600, height: 360 },
    },
  },
  {
    type: "graph",
    summary:
      "Student plots points, joins them with straight lines and adds text labels on a coordinate plane (no answer key). Set axis bounds and labels in `config`. Optional `config.given` pre-draws a starting graph (points, lines, labels) that students see in grey and build on.",
    example: {
      type: "graph",
      prompt:
        "Consumer incomes rise and the good is normal.\n\n**Draw** the new demand curve, label it D2, and label the new equilibrium E2.",
      points: 4,
      config: {
        xMin: 0,
        xMax: 10,
        yMin: 0,
        yMax: 10,
        xAxisLabel: "Quantity (thousands)",
        yAxisLabel: "Price ($)",
        given: {
          points: [
            { id: "g1", x: 1, y: 9 },
            { id: "g2", x: 8, y: 2 },
            { id: "g3", x: 1, y: 2 },
            { id: "g4", x: 8, y: 9 },
          ],
          lines: [
            { id: "gd", from: "g1", to: "g2" },
            { id: "gs", from: "g3", to: "g4" },
          ],
          labels: [
            { id: "gl1", x: 8.6, y: 1.6, text: "D1" },
            { id: "gl2", x: 8.6, y: 9.4, text: "S" },
          ],
        },
      },
    },
  },
  {
    type: "photoHandwritten",
    summary:
      "Student uploads a photo of handwritten work (no answer key). Prefer for multi-step calculations, proofs, or workings that need paper.",
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
    description:
      "- 4 short questions on photosynthesis\n- Answer every question; there is no penalty for guessing",
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
4. Save the assistant's reply as a \`.json\` file (no Markdown fences).
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

## Choosing the right question type

Pick \`type\` from what the student must **do**, not from how the source text is
worded. Prefer the most specific type that fits:

| If the student must… | Prefer |
|----------------------|--------|
| Pick one option from a short list | \`multipleChoice\` |
| Judge a clear true/false claim | \`trueFalse\` |
| Give a single word, number, or short phrase that can be auto-marked | \`shortAnswer\` |
| Enter a calculated final answer (with space for workings) | \`mathInput\` |
| Show multi-step calculation on paper / photo of workings | \`photoHandwritten\` |
| Write a paragraph / essay / explanation | \`extendedWritten\` |
| Answer several labelled sub-parts of one stem | \`structuredMultiPart\` |
| Match terms to definitions / causes to effects | \`matching\` |
| Put steps, events, or stages in order | \`ordering\` |
| Label parts of a diagram or named zones | \`labelling\` |
| Annotate or highlight a source passage | \`annotateSource\` |
| Draw a free-hand diagram with **no axes** (cell, apparatus, circuit, map, flow) | \`drawDiagram\` |
| Plot data, draw a line or curve on axes, or draw any diagram **with axes** (supply and demand, AD/AS, PPC, cost curves, distance–time, rate graphs) | \`graph\` |

### When to use \`graph\`

Use \`graph\` whenever the answer lives on **axes**, even if the source says
“draw a diagram”:

- plotting values from a table, or points the student has calculated;
- drawing a straight line or curve, or a line of best fit;
- economics and science diagrams with axes: supply and demand, AD/AS, PPC,
  cost and revenue curves, distance–time, velocity–time, rate of reaction;
- marking an equilibrium, intercept or gap, or showing a curve **shifting**.

Use \`drawDiagram\` only when there are no axes (a labelled cell, apparatus,
circuit, map, food web) or the student must sketch free-hand shapes.

Setting up a \`graph\`:

- Always set \`xAxisLabel\` and \`yAxisLabel\`, with units (“Price ($)”,
  “Time (s)”).
- Gridlines and tick marks are drawn at **every whole number**, so keep each
  axis to about 0–20 units. Put the scale in the label instead of using big
  numbers: “Quantity (thousands)” from 0 to 10, not 0 to 10,000.
- Choose bounds that fit every value the student needs, with a little margin.
- Curves are drawn as straight segments between points, so a few well-placed
  points are enough.
- Ask for labels in the prompt (“label the new curve D2”). Students add text
  labels with the Label tool.

Starting graph (\`config.given\`): when the question starts from an existing
diagram (“The diagram shows the market for…”, “Shift the curve…”, “Add the
new equilibrium…”), pre-draw it in \`config.given\` instead of describing it:

- \`points\`: \`{ id, x, y }\` with short unique ids (\`g1\`, \`g2\`…);
- \`lines\`: \`{ id, from, to }\` joining two given point ids;
- \`labels\`: \`{ id, x, y, text }\` placed just beyond the end of each line
  (e.g. “D1”, “S”, “AD”).

Never put the answer in \`given\`. It holds only what the student starts from.

Rules of thumb:

- If the source asks students to **calculate**, **solve**, **evaluate**, or
  **find the value of**, use \`mathInput\` (workings + auto-graded final answer
  via \`config.acceptedAnswers\`), or \`photoHandwritten\` when a photo of paper
  work is required.
- Do **not** put calculation tasks in \`extendedWritten\` or \`multipleChoice\`
  unless the teacher’s material clearly wants that format.
- Do **not** force every question into multiple choice — mix types so each item
  uses the interaction that matches the skill being assessed.
- If the teacher’s prompt names formats (e.g. “questions 1–5 multiple choice”),
  follow those instructions first.

## Writing clear, readable question text (Markdown)

Students see \`prompt\` (and form \`description\` / part prompts) rendered as
**Markdown** on phone and laptop during the live exam. Format stems so they
scan cleanly — do not dump one long unformatted paragraph.

### Markdown you should use

| Need | Markdown in the JSON string |
|------|-----------------------------|
| Paragraph break | blank line (\`\\n\\n\`) |
| Soft line break | single \`\\n\` (also fine) |
| Emphasis | \`**bold**\` rarely — see “When to use bold” below; \`*italic*\` sparingly |
| Bullet list | lines starting with \`- \` or \`* \` |
| Numbered list | \`1. \` \`2. \` … |
| Inline code / formula fragment | backticks, e.g. \`\`g = 9.8 m/s²\`\` |
| Simple table (given data) | GFM pipe table |

Do **not** rely on raw HTML. Keep headings light (\`###\` at most) — most stems
need paragraphs + lists only.

### When to use bold

Plain text is the default. Bold is only for something a student could misread
or skip under exam pressure. If everything is bold, nothing stands out, and
long bold text is harder to read.

- At most **one** short bold phrase per prompt (or per part prompt), and many
  prompts need none.
- Bold the **command word** when it defines the task (“**Calculate**”,
  “**Explain**”, “**Compare**”), or a **condition that changes the answer**
  (“**not**”, “**two** reasons”, “in **kJ**”, “**without** a calculator”).
- Never bold whole sentences or paragraphs, the context or scenario, given
  data and numbers, names or key terms just because they are important, or
  “Show your working”.
- Never use bold in \`description\`, \`options\`, or other plain-text fields.

Good: \`"**Explain** why the rate of reaction falls after 2 minutes."\`
Too much: \`"**Explain why the rate of reaction falls after 2 minutes.**"\`
Too much: \`"A **2 kg** ball moves at **4 m/s**. **Calculate** its **kinetic energy**."\`

### Structure each prompt

1. **Context** (optional): short setup or given data.
2. **Task** (required): what the student must do, in plain text (bold only as
   described in “When to use bold”).
3. **Constraints** (optional): units, word count, “show your working”, etc.

Also:

- Prefer short sentences and plain classroom language.
- Keep one main ask per question (use \`structuredMultiPart\` for genuine a/b/c).
- **Never** put teacher-only material in student-facing fields (\`prompt\`,
  \`description\`, options, part prompts, or \`config.passageText\`): no
  “Teacher note:”, mark schemes, answers, hints for the teacher, or commentary
  about how to grade.
- **Do not describe diagrams or figures in words.** If the source refers to a
  diagram, figure, graph, map, or photo, write a short instruction only
  (e.g. “Refer to the diagram.” / “Label the parts shown.”) and use
  \`drawDiagram\`, \`labelling\`, or \`graph\` as appropriate. Teachers attach the
  real image in Truepaper — do **not** invent ASCII art, long visual
  descriptions, or fake figure captions that try to stand in for the image.
  Exception: a simple diagram **with axes** that the student must build on
  (e.g. a demand curve to shift) can be pre-drawn as a \`graph\` with
  \`config.given\`.
- For \`annotateSource\`, put the full passage in \`config.passageText\`, not the
  prompt; keep the prompt as the instruction only.
- For \`structuredMultiPart\`, keep the overall stem in \`prompt\` and put each
  sub-question in \`config.parts[].prompt\` (Markdown allowed in both).

Good prompt shape (example — note Markdown in the JSON string):

${FENCE}json
{
  "type": "mathInput",
  "prompt": "A ball is thrown vertically upward with speed 12 m/s.\\n\\n**Calculate** the maximum height reached.\\n\\n- Take \`g = 9.8 m/s²\`\\n- Show your working",
  "points": 2,
  "config": { "acceptedAnswers": ["7.35", "7.3"] }
}
${FENCE}

## Making the exam look organized on the student screen

Students answer one question card after another in a single scrolling column,
often on a phone. Truepaper draws some of each card itself, so write content
that fits the layout instead of repeating it.

### What Truepaper already shows (do not repeat it)

- Every card header shows the question number (\`Q1\`, \`Q2\`, …) and the marks
  (\`3 marks\`). Do **not** start a prompt with “Question 1:”, “1.”, “Q1)”, and
  do **not** write “(3 marks)” or “[2]” in the text. Set \`points\` instead.
- The answer controls (choice buttons, true/false buttons, matching columns,
  drag-to-order list, answer boxes) come from the \`type\`. Do **not** add
  “Choose one answer:”, “True or false?”, “Write your answer below:”, or
  “Options: A… B…” to the prompt.
- \`structuredMultiPart\` shows each part's \`label\` as a tab. Do **not** repeat
  the label inside the part prompt (write “Describe…”, not “a) Describe…”).
- \`description\` appears at the top of the exam in a **“Before you start:”**
  box. Use it for student instructions (see below), not for teacher notes.

### Order the questions logically

The exam shows questions in the order of the \`questions\` array, so make that order
feel planned:

- Group questions on the same topic or source next to each other, following
  the order of the teacher's material.
- Within a group, go from quick recall (\`multipleChoice\`, \`trueFalse\`,
  \`shortAnswer\`, \`matching\`) to application (\`mathInput\`, \`ordering\`,
  \`labelling\`) to longer answers (\`structuredMultiPart\`, \`extendedWritten\`).
- Keep questions that use the same data, passage, or scenario together. If
  several questions share a long context, prefer one \`structuredMultiPart\` with
  the context in its \`prompt\`, so students don't scroll back to find it.
- Questions should not depend on the answer to an earlier question, and should
  not give away the answer to one.
- Set \`points\` in proportion to effort: about 1 for recall, 2–4 for
  application, and more for extended or multi-part answers.

### Write a helpful \`description\`

Keep it short. Use 2–5 bullet points that tell the student what to expect,
such as the number of questions or sections, what to do for calculations
(units, significant figures, show working), and any materials allowed. Do not
include answers, grading notes, or a list of every question.

${FENCE}json
"description": "- 12 questions on photosynthesis\\n- Questions 1–6 are quick checks; 7–12 need working or written answers\\n- Give units with every numerical answer"
${FENCE}

If the exam has sections, name them here (e.g. “Questions 1–6: recall”).
Do **not** put section headings inside individual prompts.

### Keep prompts short and scannable

- Most prompts should be 1–3 short paragraphs. Put long source text in
  \`config.passageText\` (\`annotateSource\`) or in the stem of a
  \`structuredMultiPart\`, not in every prompt.
- Put given data in a bullet list or a small pipe table (3–4 columns at
  most, so it fits a phone). Put the task on its own line **after** the data.
- End with the task. The last line the student reads before answering should
  be what they have to do.

### Options, items, and labels are plain text

Markdown is rendered only in \`prompt\`, \`description\`, and part prompts. Text in
\`options\`, matching \`left\`/\`right\`, ordering \`items\`, labelling \`zones\`/\`terms\`,
and part \`label\`s appears **exactly as written**, so:

- Do not use \`**\`, backticks, or list markers in them.
- Do not prefix options with “A)”, “B.”, “1.”; students tap the option itself.
- Keep options short (ideally under ~10 words), similar in length, and
  grammatically parallel, so that the correct one does not stand out.
- Avoid “All of the above” / “None of the above”, and change where the
  correct option appears from question to question.
- Use consistent part labels: \`a)\`, \`b)\`, \`c)\` …

### Never give the answer away through layout

Students see list items in the order you write them:

- \`ordering\`: list \`items\` **scrambled**. Never list them in the correct order
  (\`correctOrder\` holds the answer).
- \`matching\`: scramble \`right\` so that item 1 on the left is not matched by
  item 1 on the right.
- \`labelling\`: list \`terms\` in a different order from \`zones\`.

### Math, symbols, and units

There is **no LaTeX rendering**. \`$x^2$\` or \`\\frac{a}{b}\` will show up as raw
symbols. Instead:

- Use Unicode: \`x²\`, \`x³\`, \`√2\`, \`π\`, \`×\`, \`÷\`, \`±\`, \`≤\`, \`≥\`, \`≠\`, \`°\`, \`Δ\`, \`H₂O\`, \`CO₂\`.
- Write fractions inline (\`3/4\`, \`(a + b)/2\`) and wrap a formula in backticks
  when it should stand out: \`\`v = u + at\`\`.
- Always give units with values (\`12 m/s\`, \`25 °C\`).

## Top-level shape

${FENCE}json
{
  "title": "string — the exam title",
  "description": "string — optional student instructions shown in the 'Before you start:' box (Markdown)",
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

- Choose each \`type\` using the table above (task → type), then write a clear
  Markdown \`prompt\` using the readability guidance (bold sparingly, use lists
  for givens, blank lines between paragraphs).
- Prefer a mix of question types appropriate to the content and skills assessed.
- Order questions logically (topic groups, simple → complex) and write a short
  bulleted student \`description\`.
- Do not repeat what the app already shows: no “Question 1:”, no marks in the
  text, no “Choose one:”, no part labels inside part prompts.
- Keep options/items plain text (no Markdown, no “A)” prefixes), and scramble
  ordering items and matching/labelling columns.
- No LaTeX. Use Unicode symbols and backticks for formulas.
- Anything answered on axes is a \`graph\` (with axis labels, small whole-number
  ranges, and \`config.given\` for a starting diagram), not a \`drawDiagram\`.
- Plain text by default: at most one short bold phrase per prompt (a command
  word or a condition a student could miss), and no bold in descriptions or options.
- For objective types (\`matching\`, \`ordering\`, \`labelling\`) always include the
  full \`config\` with ids that are consistent between the items and the answer key.
- Keep ids short and unique within a question (e.g. \`l1\`, \`r1\`, \`i1\`).
- Do not invent new \`type\` values or extra top-level fields.
- Do **not** add teacher notes, mark schemes, or diagram descriptions — leave
  images and teacher-only guidance for the human teacher in Truepaper.
`;
}
