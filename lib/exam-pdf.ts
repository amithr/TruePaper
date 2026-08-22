/**
 * Exam PDF generator. Isomorphic: runs on the server (see `lib/exam-pdf-node.ts`)
 * and in the browser (see `lib/exam-pdf-client.ts`). Callers inject an
 * `ExamPdfEngine` (PDFDocument constructor + font bytes) so this module never
 * imports pdfkit or Node built-ins directly.
 */

import { formatPointsScore } from "@/lib/exam-grades";
import type { Form, Question } from "@/lib/forms";
import {
  PDF_BODY_SIZE,
  PDF_FONT,
  registerExamPdfFonts,
  type ExamPdfFontBuffers,
} from "@/lib/exam-pdf-fonts";
import type { ExamPdfSession, ExamPdfStudent } from "@/lib/exam-pdf-load";
import { parseResponseValue } from "@/lib/response-types/answers";
import type { DrawingStroke } from "@/lib/response-types/drawing";
import { getCanvasAnnotation } from "@/lib/response-types/feedback";
import {
  GRAPH_PADDING,
  formatGraphCoord,
  mathToPixel,
  plotArea,
  resolveGraphBounds,
  resolveGraphSize,
} from "@/lib/response-types/graph-coords";
import {
  normalizeResponseType,
  type AnnotateSourceConfig,
  type DrawDiagramConfig,
  type GraphConfig,
  type LabellingConfig,
  type MatchingConfig,
  type OrderingConfig,
  type StructuredMultiPartConfig,
  type TrueFalseConfig,
} from "@/lib/response-types/types";

/** Image bytes pdfkit accepts in both runtimes (Buffer on server, ArrayBuffer in browser). */
export type ExamPdfImageBytes = Uint8Array | ArrayBuffer;

/** Pre-fetched prompt images by question id (see exam-pdf-load / exam-pdf-client). */
export type ExamPdfQuestionImages = Record<string, ExamPdfImageBytes>;

/** Injected per-runtime pdfkit build plus font bytes. */
export type ExamPdfEngine = {
  PDFDocument: new (options?: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument;
  fonts: ExamPdfFontBuffers;
};

const PAGE_MARGIN = 56;
const PAGE_WIDTH = 612;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const COLOR_TEXT = "#18181b";
const COLOR_MUTED = "#52525b";
const COLOR_FAINT = "#a1a1aa";
const COLOR_ACCENT = "#7c3aed";
const COLOR_SUCCESS = "#047857";
const COLOR_WARNING = "#b45309";
const COLOR_BORDER = "#e4e4e7";
const COLOR_SOFT = "#f4f4f5";
const COLOR_FEEDBACK_BG = "#f5f3ff";
const COLOR_FEEDBACK_BORDER = "#ddd6fe";
const COLOR_GRAPH_GRID = "#e4e4e7";
const COLOR_GRAPH_AXIS = "#71717a";
const COLOR_GRAPH_INK = "#2563eb";

type ExamPdfDoc = PDFKit.PDFDocument;

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function maskDeviceId(id: string): string {
  if (!id) {
    return "—";
  }
  return `…${id.slice(-8)}`;
}

function statusLabel(student: ExamPdfStudent): { label: string; color: string } {
  if (!student.hasJoined) {
    return { label: "Not joined", color: COLOR_FAINT };
  }
  if (student.suspended && !student.finished) {
    return { label: "Paused", color: COLOR_WARNING };
  }
  if (student.graded) {
    return { label: "Graded", color: COLOR_ACCENT };
  }
  if (student.finished) {
    return { label: "Submitted", color: COLOR_SUCCESS };
  }
  return { label: "In progress", color: COLOR_MUTED };
}

function studentDisplayName(student: ExamPdfStudent): string {
  return student.displayName.trim() || "No name";
}

/** Build a safe filename slug from a string. */
export function safeFilenameSlug(input: string, fallback: string): string {
  const cleaned = input
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9-_ ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return cleaned.length > 0 ? cleaned : fallback;
}

function hr(doc: ExamPdfDoc, color: string = COLOR_BORDER): void {
  const y = doc.y + 4;
  doc
    .save()
    .moveTo(PAGE_MARGIN, y)
    .lineTo(PAGE_WIDTH - PAGE_MARGIN, y)
    .lineWidth(0.5)
    .strokeColor(color)
    .stroke()
    .restore();
  doc.y = y + 6;
  doc.x = PAGE_MARGIN;
}

function spacer(doc: ExamPdfDoc, lines = 0.5): void {
  doc.moveDown(lines);
}

function ensureSpace(doc: ExamPdfDoc, needed: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) {
    doc.addPage();
  }
}

function writeKeyValueRow(doc: ExamPdfDoc, pairs: Array<[string, string]>): void {
  if (pairs.length === 0) {
    return;
  }
  ensureSpace(doc, 36);
  const colWidth = CONTENT_WIDTH / pairs.length;
  const startY = doc.y;
  let maxBottom = startY;
  pairs.forEach(([label, value], index) => {
    const x = PAGE_MARGIN + index * colWidth;
    const valueFont =
      label === "Join code" || label === "Session code"
        ? PDF_FONT.monoSemiBold
        : PDF_FONT.regular;
    doc
      .font(PDF_FONT.semibold)
      .fontSize(8)
      .fillColor(COLOR_MUTED)
      .text(label.toUpperCase(), x, startY, { width: colWidth - 8 });
    doc
      .font(valueFont)
      .fontSize(PDF_BODY_SIZE)
      .fillColor(COLOR_TEXT)
      .text(value || "—", x, doc.y, { width: colWidth - 8 });
    if (doc.y > maxBottom) {
      maxBottom = doc.y;
    }
    doc.y = startY;
  });
  doc.y = maxBottom + 4;
  doc.x = PAGE_MARGIN;
}

function badge(doc: ExamPdfDoc, label: string, color: string): void {
  const padX = 8;
  const padY = 3;
  doc.font(PDF_FONT.semibold).fontSize(9);
  const labelWidth = doc.widthOfString(label);
  const width = labelWidth + padX * 2;
  const height = 16;
  const x = PAGE_MARGIN;
  const y = doc.y;
  doc.save();
  doc.roundedRect(x, y, width, height, 8).fillColor(color).fillOpacity(0.14).fill();
  doc.restore();
  doc.save();
  doc.fillColor(color);
  doc.text(label, x + padX, y + padY - 0.5, { width: labelWidth, lineBreak: false });
  doc.restore();
  doc.x = PAGE_MARGIN;
  doc.y = y + height + 6;
}

function questionHeader(doc: ExamPdfDoc, question: Question, index: number, earned: number | null): void {
  doc.font(PDF_FONT.semibold).fontSize(12).fillColor(COLOR_TEXT);
  doc.text(`Q${index + 1}. ${question.prompt || "Untitled question"}`, PAGE_MARGIN, doc.y, {
    width: CONTENT_WIDTH,
  });
  doc.font(PDF_FONT.regular).fontSize(9).fillColor(COLOR_MUTED);
  const typeLabel =
    question.type === "multipleChoice" ? "Multiple choice" : "Written response";
  const pointsLabel =
    earned != null
      ? `${earned} / ${question.points} pt${question.points === 1 ? "" : "s"} earned`
      : `${question.points} pt${question.points === 1 ? "" : "s"} possible`;
  doc.text(`${typeLabel} · ${pointsLabel}`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  spacer(doc, 0.4);
}

function noAnswerNote(doc: ExamPdfDoc, message = "No answer submitted."): void {
  doc.font(PDF_FONT.italic).fontSize(10).fillColor(COLOR_MUTED);
  doc.text(message, PAGE_MARGIN + 4, doc.y, { width: CONTENT_WIDTH - 8 });
  doc.x = PAGE_MARGIN;
}

/** One filled/empty radio-style marker row (multiple choice, true/false). */
function renderChoiceRow(
  doc: ExamPdfDoc,
  label: string,
  chosen: boolean,
  isAnswerKey: boolean,
): void {
  const markerSize = 10;
  const textOffset = markerSize + 10;
  ensureSpace(doc, markerSize + 6);
  const markerX = PAGE_MARGIN + 4;
  const markerY = doc.y + 2;
  doc.save();
  doc
    .circle(markerX + markerSize / 2, markerY + markerSize / 2, markerSize / 2)
    .lineWidth(0.9)
    .strokeColor(chosen ? COLOR_ACCENT : COLOR_BORDER)
    .stroke();
  if (chosen) {
    doc
      .circle(markerX + markerSize / 2, markerY + markerSize / 2, markerSize / 2 - 2)
      .fillColor(COLOR_ACCENT)
      .fill();
  }
  doc.restore();

  doc.font(PDF_FONT.regular).fontSize(PDF_BODY_SIZE).fillColor(COLOR_TEXT);
  const parts: string[] = [label || "(blank option)"];
  if (isAnswerKey) {
    parts.push("· answer key");
  }
  doc.text(parts.join("  "), markerX + textOffset, doc.y, {
    width: CONTENT_WIDTH - textOffset - 4,
  });
  spacer(doc, 0.2);
  doc.x = PAGE_MARGIN;
}

function renderMultipleChoiceAnswer(
  doc: ExamPdfDoc,
  question: Question,
  studentAnswer: string,
): void {
  for (const option of question.options) {
    renderChoiceRow(
      doc,
      option,
      option === studentAnswer,
      question.correctAnswer != null && option === question.correctAnswer,
    );
  }
  if (
    studentAnswer.trim() &&
    !question.options.some((option) => option === studentAnswer)
  ) {
    noAnswerNote(doc, `Student chose: ${studentAnswer}`);
  } else if (!studentAnswer.trim()) {
    noAnswerNote(doc, "Student did not pick an option.");
  }
  doc.x = PAGE_MARGIN;
}

function renderTrueFalseAnswer(
  doc: ExamPdfDoc,
  question: Question,
  studentAnswer: string,
): void {
  const value = parseResponseValue("trueFalse", studentAnswer);
  const answer = value.type === "trueFalse" ? value.answer : null;
  const config = question.responseConfig as TrueFalseConfig;
  renderChoiceRow(doc, "True", answer === true, config.correctAnswer === true);
  renderChoiceRow(doc, "False", answer === false, config.correctAnswer === false);
  if (answer === null) {
    noAnswerNote(doc, "Student did not pick an option.");
  }
}

/** Small uppercase label above a block (e.g. WORKING / FINAL ANSWER). */
function sectionLabel(doc: ExamPdfDoc, label: string): void {
  ensureSpace(doc, 16);
  doc.font(PDF_FONT.semibold).fontSize(8).fillColor(COLOR_MUTED);
  doc.text(label.toUpperCase(), PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.y += 2;
  doc.x = PAGE_MARGIN;
}

function renderTextAnswer(
  doc: ExamPdfDoc,
  answer: string,
  options: { font?: string } = {},
): void {
  const trimmed = answer.trim();
  const padding = 10;
  const innerWidth = CONTENT_WIDTH - padding * 2;

  const fontName = trimmed ? options.font ?? PDF_FONT.regular : PDF_FONT.italic;
  const body = trimmed || "No answer submitted.";
  doc.font(fontName).fontSize(PDF_BODY_SIZE);
  const textHeight = doc.heightOfString(body, { width: innerWidth });
  const boxHeight = textHeight + padding * 2;

  ensureSpace(doc, boxHeight + 6);
  const boxTop = doc.y;

  doc.save();
  doc
    .roundedRect(PAGE_MARGIN, boxTop, CONTENT_WIDTH, boxHeight, 6)
    .fillColor("#fafafa")
    .fill();
  doc
    .roundedRect(PAGE_MARGIN, boxTop, CONTENT_WIDTH, boxHeight, 6)
    .lineWidth(0.6)
    .strokeColor(COLOR_BORDER)
    .stroke();
  doc.restore();

  doc.font(fontName).fontSize(PDF_BODY_SIZE).fillColor(trimmed ? COLOR_TEXT : COLOR_MUTED);
  doc.text(body, PAGE_MARGIN + padding, boxTop + padding, { width: innerWidth });

  doc.x = PAGE_MARGIN;
  doc.y = boxTop + boxHeight + 6;
}

type PdfImageSource = ExamPdfImageBytes | string;

function imageDimensions(
  doc: ExamPdfDoc,
  image: PdfImageSource,
): { width: number; height: number } | null {
  try {
    const opened = (
      doc as unknown as { openImage(src: PdfImageSource): { width: number; height: number } }
    ).openImage(image);
    if (opened && opened.width > 0 && opened.height > 0) {
      return { width: opened.width, height: opened.height };
    }
  } catch {
    // Unsupported format — caller skips the image.
  }
  return null;
}

/** Embed an uploaded image (question prompt / form description / photo answer) at its natural aspect ratio. */
function renderInlineImage(doc: ExamPdfDoc, image: PdfImageSource, maxHeight = 240): void {
  const dims = imageDimensions(doc, image);
  if (!dims) {
    return;
  }
  const scale = Math.min(CONTENT_WIDTH / dims.width, maxHeight / dims.height, 1);
  const width = dims.width * scale;
  const height = dims.height * scale;

  ensureSpace(doc, height + 10);
  const x = PAGE_MARGIN;
  const y = doc.y;
  try {
    doc.image(image as Buffer, x, y, { width, height });
  } catch {
    return;
  }
  doc.save();
  doc.rect(x, y, width, height).lineWidth(0.6).strokeColor(COLOR_BORDER).stroke();
  doc.restore();
  doc.x = PAGE_MARGIN;
  doc.y = y + height + 8;
}

function strokePaths(
  doc: ExamPdfDoc,
  strokes: DrawingStroke[],
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
): void {
  for (const stroke of strokes) {
    if (stroke.points.length < 2) {
      continue;
    }
    doc.moveTo(x + stroke.points[0].x * width, y + stroke.points[0].y * height);
    for (let i = 1; i < stroke.points.length; i += 1) {
      const p = stroke.points[i];
      doc.lineTo(x + p.x * width, y + p.y * height);
    }
    doc
      .lineWidth(Math.max(0.5, stroke.width * scale))
      .lineCap("round")
      .lineJoin("round")
      .strokeColor(stroke.color || "#1e3a5f")
      .stroke();
  }
}

function annotationNotes(
  doc: ExamPdfDoc,
  noAnswer: boolean,
  hasTeacherStrokes: boolean,
): void {
  const notes: string[] = [];
  if (noAnswer) {
    notes.push("No answer submitted.");
  }
  if (hasTeacherStrokes) {
    notes.push("Includes teacher canvas annotations.");
  }
  if (notes.length > 0) {
    doc.font(PDF_FONT.italic).fontSize(9).fillColor(COLOR_MUTED);
    doc.text(notes.join("  "), PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.y += 2;
  }
}

function renderDrawDiagramAnswer(
  doc: ExamPdfDoc,
  question: Question,
  studentAnswer: string,
  teacherStrokes: DrawingStroke[],
  backgroundImage: ExamPdfImageBytes | undefined,
): void {
  const value = parseResponseValue("drawDiagram", studentAnswer);
  const strokes = value.type === "drawDiagram" ? value.strokes : [];
  const config = question.responseConfig as DrawDiagramConfig;
  const background: PdfImageSource | undefined = backgroundImage ?? config.backgroundDataUrl;

  if (strokes.length === 0 && teacherStrokes.length === 0 && !background) {
    renderTextAnswer(doc, "");
    return;
  }

  const canvasWidth = Math.max(320, Math.min(800, config.width ?? 600));
  const canvasHeight = Math.max(200, Math.min(600, config.height ?? 360));
  const scale = Math.min(CONTENT_WIDTH / canvasWidth, 360 / canvasHeight);
  const width = canvasWidth * scale;
  const height = canvasHeight * scale;

  ensureSpace(doc, height + 12);
  const x = PAGE_MARGIN;
  const y = doc.y;

  doc.save();
  doc.roundedRect(x, y, width, height, 6).clip();
  doc.rect(x, y, width, height).fillColor("#ffffff").fill();
  if (background) {
    try {
      doc.image(background as Buffer, x, y, { width, height });
    } catch {
      // Unsupported image format — keep the white canvas.
    }
  }
  strokePaths(doc, strokes, x, y, width, height, scale);
  strokePaths(doc, teacherStrokes, x, y, width, height, scale);
  doc.restore();

  doc.save();
  doc.roundedRect(x, y, width, height, 6).lineWidth(0.6).strokeColor(COLOR_BORDER).stroke();
  doc.restore();

  doc.x = PAGE_MARGIN;
  doc.y = y + height + 6;
  annotationNotes(doc, strokes.length === 0, teacherStrokes.length > 0);
}

/** Vector-render a graph answer: grid, axes, lines, points, labels (mirrors GraphCanvas). */
function renderGraphAnswer(
  doc: ExamPdfDoc,
  question: Question,
  studentAnswer: string,
  teacherStrokes: DrawingStroke[],
): void {
  const config = question.responseConfig as GraphConfig;
  const value = parseResponseValue("graph", studentAnswer);
  const points = value.type === "graph" ? value.points : [];
  const lines = value.type === "graph" ? value.lines : [];
  const labels = value.type === "graph" ? value.labels : [];

  const bounds = resolveGraphBounds(config);
  const { width: graphWidth, height: graphHeight } = resolveGraphSize(config);
  const { plotWidth, plotHeight } = plotArea(graphWidth, graphHeight);
  const scale = Math.min(CONTENT_WIDTH / graphWidth, 340 / graphHeight, 1);
  const width = graphWidth * scale;
  const height = graphHeight * scale;

  ensureSpace(doc, height + 12);
  const originX = PAGE_MARGIN;
  const originY = doc.y;
  const map = (mx: number, my: number): { px: number; py: number } => {
    const p = mathToPixel(mx, my, bounds, graphWidth, graphHeight);
    return { px: originX + p.px * scale, py: originY + p.py * scale };
  };
  const centeredText = (text: string, cx: number, cy: number): void => {
    doc.text(text, cx - doc.widthOfString(text) / 2, cy - doc.currentLineHeight() / 2, {
      lineBreak: false,
    });
  };

  doc.save();
  doc.roundedRect(originX, originY, width, height, 6).clip();
  doc.rect(originX, originY, width, height).fillColor("#ffffff").fill();

  const xTicks: number[] = [];
  for (let x = Math.ceil(bounds.xMin); x <= Math.floor(bounds.xMax); x += 1) {
    xTicks.push(x);
  }
  const yTicks: number[] = [];
  for (let y = Math.ceil(bounds.yMin); y <= Math.floor(bounds.yMax); y += 1) {
    yTicks.push(y);
  }

  if (config.showGrid !== false) {
    doc.lineWidth(Math.max(0.4, scale)).strokeColor(COLOR_GRAPH_GRID);
    for (const tick of xTicks) {
      if (tick === 0) {
        continue;
      }
      const { px } = map(tick, bounds.yMin);
      doc
        .moveTo(px, originY + GRAPH_PADDING * scale)
        .lineTo(px, originY + (GRAPH_PADDING + plotHeight) * scale)
        .stroke();
    }
    for (const tick of yTicks) {
      if (tick === 0) {
        continue;
      }
      const { py } = map(bounds.xMin, tick);
      doc
        .moveTo(originX + GRAPH_PADDING * scale, py)
        .lineTo(originX + (GRAPH_PADDING + plotWidth) * scale, py)
        .stroke();
    }
  }

  doc.lineWidth(1.5 * scale).strokeColor(COLOR_GRAPH_AXIS);
  if (bounds.xMin <= 0 && bounds.xMax >= 0) {
    const { px } = map(0, 0);
    doc
      .moveTo(px, originY + GRAPH_PADDING * scale)
      .lineTo(px, originY + (GRAPH_PADDING + plotHeight) * scale)
      .stroke();
  }
  if (bounds.yMin <= 0 && bounds.yMax >= 0) {
    const { py } = map(0, 0);
    doc
      .moveTo(originX + GRAPH_PADDING * scale, py)
      .lineTo(originX + (GRAPH_PADDING + plotWidth) * scale, py)
      .stroke();
  }

  doc.font(PDF_FONT.regular).fontSize(Math.max(6.5, 11 * scale)).fillColor(COLOR_GRAPH_AXIS);
  for (const tick of xTicks) {
    const { px, py } = map(tick, bounds.yMin);
    centeredText(formatGraphCoord(tick), px, py + 10 * scale);
  }
  for (const tick of yTicks) {
    if (tick === bounds.yMin) {
      continue;
    }
    const { px, py } = map(bounds.xMin, tick);
    const label = formatGraphCoord(tick);
    doc.text(label, px - 6 * scale - doc.widthOfString(label), py - doc.currentLineHeight() / 2, {
      lineBreak: false,
    });
  }

  doc.font(PDF_FONT.semibold).fontSize(Math.max(7, 12 * scale)).fillColor("#3f3f46");
  if (config.xAxisLabel?.trim()) {
    centeredText(
      config.xAxisLabel.trim(),
      originX + (GRAPH_PADDING + plotWidth / 2) * scale,
      originY + height - 10 * scale,
    );
  }
  if (config.yAxisLabel?.trim()) {
    const cx = originX + 12 * scale;
    const cy = originY + (GRAPH_PADDING + plotHeight / 2) * scale;
    doc.save();
    doc.rotate(-90, { origin: [cx, cy] });
    centeredText(config.yAxisLabel.trim(), cx, cy);
    doc.restore();
  }

  const pointById = new Map(points.map((point) => [point.id, point]));
  doc.lineWidth(2.5 * scale).lineCap("round").strokeColor(COLOR_GRAPH_INK);
  for (const line of lines) {
    const from = pointById.get(line.from);
    const to = pointById.get(line.to);
    if (!from || !to) {
      continue;
    }
    const start = map(from.x, from.y);
    const end = map(to.x, to.y);
    doc.moveTo(start.px, start.py).lineTo(end.px, end.py).stroke();
  }

  for (const point of points) {
    const { px, py } = map(point.x, point.y);
    doc
      .circle(px, py, 6 * scale)
      .lineWidth(2 * scale)
      .fillColor(COLOR_GRAPH_INK)
      .strokeColor("#ffffff")
      .fillAndStroke();
    doc.font(PDF_FONT.semibold).fontSize(Math.max(6.5, 11 * scale)).fillColor(COLOR_TEXT);
    centeredText(
      `(${formatGraphCoord(point.x)}, ${formatGraphCoord(point.y)})`,
      px,
      py - 12 * scale,
    );
  }

  doc.font(PDF_FONT.semibold).fontSize(Math.max(7, 13 * scale)).fillColor(COLOR_TEXT);
  for (const label of labels) {
    if (!label.text.trim()) {
      continue;
    }
    const { px, py } = map(label.x, label.y);
    centeredText(label.text, px, py);
  }

  strokePaths(doc, teacherStrokes, originX, originY, width, height, scale);
  doc.restore();

  doc.save();
  doc
    .roundedRect(originX, originY, width, height, 6)
    .lineWidth(0.6)
    .strokeColor(COLOR_BORDER)
    .stroke();
  doc.restore();

  doc.x = PAGE_MARGIN;
  doc.y = originY + height + 6;
  annotationNotes(
    doc,
    points.length === 0 && lines.length === 0 && labels.length === 0,
    teacherStrokes.length > 0,
  );
}

function renderPhotoAnswer(
  doc: ExamPdfDoc,
  studentAnswer: string,
  teacherStrokes: DrawingStroke[],
): void {
  const value = parseResponseValue("photoHandwritten", studentAnswer);
  const dataUrl = value.type === "photoHandwritten" ? value.imageDataUrl : "";
  if (!dataUrl) {
    renderTextAnswer(doc, "");
    return;
  }
  const dims = imageDimensions(doc, dataUrl);
  if (!dims) {
    renderTextAnswer(doc, "");
    return;
  }
  const scale = Math.min(CONTENT_WIDTH / dims.width, 320 / dims.height, 1);
  const width = dims.width * scale;
  const height = dims.height * scale;

  ensureSpace(doc, height + 10);
  const x = PAGE_MARGIN;
  const y = doc.y;
  try {
    doc.image(dataUrl, x, y, { width, height });
  } catch {
    renderTextAnswer(doc, "");
    return;
  }
  strokePaths(doc, teacherStrokes, x, y, width, height, scale);
  doc.save();
  doc.rect(x, y, width, height).lineWidth(0.6).strokeColor(COLOR_BORDER).stroke();
  doc.restore();
  doc.x = PAGE_MARGIN;
  doc.y = y + height + 6;
  annotationNotes(doc, false, teacherStrokes.length > 0);
}

/** Two-column rows: prompt item on the left, the student's pick on the right. */
function renderPairRows(
  doc: ExamPdfDoc,
  rows: Array<{ left: string; right: string | null }>,
): void {
  const leftWidth = CONTENT_WIDTH * 0.45;
  const rightWidth = CONTENT_WIDTH - leftWidth - 16;
  for (const row of rows) {
    ensureSpace(doc, 20);
    const rowY = doc.y;
    doc.font(PDF_FONT.medium).fontSize(PDF_BODY_SIZE).fillColor(COLOR_TEXT);
    doc.text(row.left, PAGE_MARGIN, rowY, { width: leftWidth });
    const leftBottom = doc.y;
    doc
      .font(row.right ? PDF_FONT.regular : PDF_FONT.italic)
      .fontSize(PDF_BODY_SIZE)
      .fillColor(row.right ? COLOR_TEXT : COLOR_FAINT);
    doc.text(row.right ?? "—", PAGE_MARGIN + leftWidth + 16, rowY, { width: rightWidth });
    doc.y = Math.max(leftBottom, doc.y) + 4;
    doc.x = PAGE_MARGIN;
  }
}

function renderMatchingAnswer(doc: ExamPdfDoc, question: Question, studentAnswer: string): void {
  const config = question.responseConfig as MatchingConfig;
  const value = parseResponseValue("matching", studentAnswer);
  const pairs = value.type === "matching" ? value.pairs : {};
  const rightById = new Map((config.right ?? []).map((item) => [item.id, item.text]));
  const leftItems = config.left ?? [];
  if (leftItems.length === 0) {
    renderTextAnswer(doc, "");
    return;
  }
  renderPairRows(
    doc,
    leftItems.map((item) => ({
      left: item.text,
      right: rightById.get(pairs[item.id] ?? "") ?? null,
    })),
  );
  if (Object.keys(pairs).length === 0) {
    noAnswerNote(doc);
  }
}

function renderOrderingAnswer(doc: ExamPdfDoc, question: Question, studentAnswer: string): void {
  const config = question.responseConfig as OrderingConfig;
  const value = parseResponseValue("ordering", studentAnswer);
  const order = value.type === "ordering" ? value.order : [];
  const itemById = new Map((config.items ?? []).map((item) => [item.id, item.text]));
  if (order.length === 0) {
    renderTextAnswer(doc, "");
    return;
  }
  order.forEach((id, index) => {
    ensureSpace(doc, 18);
    doc.font(PDF_FONT.regular).fontSize(PDF_BODY_SIZE).fillColor(COLOR_TEXT);
    doc.text(`${index + 1}.  ${itemById.get(id) ?? "(removed item)"}`, PAGE_MARGIN + 4, doc.y, {
      width: CONTENT_WIDTH - 8,
    });
    doc.y += 2;
    doc.x = PAGE_MARGIN;
  });
}

function renderLabellingAnswer(doc: ExamPdfDoc, question: Question, studentAnswer: string): void {
  const config = question.responseConfig as LabellingConfig;
  const value = parseResponseValue("labelling", studentAnswer);
  const assignments = value.type === "labelling" ? value.assignments : {};
  const termById = new Map((config.terms ?? []).map((item) => [item.id, item.text]));
  const zones = config.zones ?? [];
  if (zones.length === 0) {
    renderTextAnswer(doc, "");
    return;
  }
  renderPairRows(
    doc,
    zones.map((zone) => ({
      left: zone.text,
      right: termById.get(assignments[zone.id] ?? "") ?? null,
    })),
  );
  if (Object.keys(assignments).length === 0) {
    noAnswerNote(doc);
  }
}

function renderStructuredAnswer(doc: ExamPdfDoc, question: Question, studentAnswer: string): void {
  const config = question.responseConfig as StructuredMultiPartConfig;
  const value = parseResponseValue("structuredMultiPart", studentAnswer);
  const parts = value.type === "structuredMultiPart" ? value.parts : {};
  const configParts = config.parts ?? [];
  if (configParts.length === 0) {
    renderTextAnswer(doc, "");
    return;
  }
  for (const part of configParts) {
    sectionLabel(doc, part.label || "Part");
    renderTextAnswer(doc, parts[part.id] ?? "");
  }
}

function renderAnnotateSourceAnswer(
  doc: ExamPdfDoc,
  question: Question,
  studentAnswer: string,
): void {
  const config = question.responseConfig as AnnotateSourceConfig;
  const value = parseResponseValue("annotateSource", studentAnswer);
  const highlights = value.type === "annotateSource" ? value.highlights : [];
  const passage = config.passageText ?? "";
  if (highlights.length === 0) {
    renderTextAnswer(doc, "");
    return;
  }
  highlights.forEach((highlight, index) => {
    const excerpt = passage.slice(highlight.start, highlight.end).trim();
    sectionLabel(doc, `Highlight ${index + 1}`);
    renderTextAnswer(doc, excerpt ? `“${excerpt}”` : "(empty selection)");
    if (highlight.note?.trim()) {
      doc.font(PDF_FONT.italic).fontSize(10).fillColor(COLOR_MUTED);
      doc.text(`Note: ${highlight.note.trim()}`, PAGE_MARGIN + 4, doc.y, {
        width: CONTENT_WIDTH - 8,
      });
      doc.y += 4;
      doc.x = PAGE_MARGIN;
    }
  });
}

function renderMathInputAnswer(doc: ExamPdfDoc, studentAnswer: string): void {
  const value = parseResponseValue("mathInput", studentAnswer);
  const working = value.type === "mathInput" ? value.working || value.latex || "" : "";
  const answer = value.type === "mathInput" ? value.answer : "";
  if (working.trim()) {
    sectionLabel(doc, "Working");
    renderTextAnswer(doc, working, { font: PDF_FONT.mono });
  }
  sectionLabel(doc, "Final answer");
  renderTextAnswer(doc, answer, { font: PDF_FONT.monoSemiBold });
}

function renderFeedback(doc: ExamPdfDoc, message: string): void {
  const trimmed = message.trim();
  if (!trimmed) {
    return;
  }
  const padding = 10;
  const innerWidth = CONTENT_WIDTH - padding * 2;

  doc.font(PDF_FONT.semibold).fontSize(9);
  const titleHeight = doc.heightOfString("Teacher feedback", { width: innerWidth });
  doc.font(PDF_FONT.regular).fontSize(PDF_BODY_SIZE);
  const bodyHeight = doc.heightOfString(trimmed, { width: innerWidth });
  const boxHeight = padding * 2 + titleHeight + 4 + bodyHeight;

  ensureSpace(doc, boxHeight + 6);
  const boxTop = doc.y;

  doc.save();
  doc
    .roundedRect(PAGE_MARGIN, boxTop, CONTENT_WIDTH, boxHeight, 6)
    .fillColor(COLOR_FEEDBACK_BG)
    .fill();
  doc
    .roundedRect(PAGE_MARGIN, boxTop, CONTENT_WIDTH, boxHeight, 6)
    .lineWidth(0.6)
    .strokeColor(COLOR_FEEDBACK_BORDER)
    .stroke();
  doc.restore();

  doc
    .font(PDF_FONT.semibold)
    .fontSize(9)
    .fillColor(COLOR_ACCENT)
    .text("TEACHER FEEDBACK", PAGE_MARGIN + padding, boxTop + padding, { width: innerWidth });
  doc
    .font(PDF_FONT.regular)
    .fontSize(PDF_BODY_SIZE)
    .fillColor(COLOR_TEXT)
    .text(trimmed, PAGE_MARGIN + padding, boxTop + padding + titleHeight + 4, {
      width: innerWidth,
    });

  doc.x = PAGE_MARGIN;
  doc.y = boxTop + boxHeight + 6;
}

function pageFooter(doc: ExamPdfDoc, session: ExamPdfSession): void {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - 36;
    doc.save();
    doc
      .font(PDF_FONT.regular)
      .fontSize(8)
      .fillColor(COLOR_FAINT)
      .text(`${session.formTitle} · Code ${session.joinCode}`, PAGE_MARGIN, y, {
        width: CONTENT_WIDTH / 2,
        align: "left",
        lineBreak: false,
      });
    doc.text(`Page ${i + 1} of ${range.count}`, PAGE_MARGIN + CONTENT_WIDTH / 2, y, {
      width: CONTENT_WIDTH / 2,
      align: "right",
      lineBreak: false,
    });
    doc.restore();
  }
}

function writeStudentHeader(doc: ExamPdfDoc, student: ExamPdfStudent): void {
  doc.font(PDF_FONT.semibold).fontSize(20).fillColor(COLOR_TEXT);
  doc.text(studentDisplayName(student), PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.font(PDF_FONT.regular).fontSize(10).fillColor(COLOR_MUTED);
  doc.text(`Device ${maskDeviceId(student.anonymousSessionId)}`, PAGE_MARGIN, doc.y, {
    width: CONTENT_WIDTH,
  });
  spacer(doc, 0.4);

  const status = statusLabel(student);
  badge(doc, status.label, status.color);

  const pairs: Array<[string, string]> = [];
  if (student.graded && student.pointsEarned != null) {
    pairs.push([
      "Final score",
      formatPointsScore(student.pointsEarned, student.pointsPossible),
    ]);
  } else if (student.finished) {
    pairs.push(["Points possible", `${student.pointsPossible} pts`]);
  } else {
    pairs.push(["Status", student.suspended ? "Paused" : "In progress"]);
  }
  pairs.push(["Submitted", formatTimestamp(student.finishedAt)]);
  pairs.push(["Graded", formatTimestamp(student.gradedAt)]);
  writeKeyValueRow(doc, pairs);
  hr(doc);
}

function renderAnswer(
  doc: ExamPdfDoc,
  question: Question,
  studentAnswer: string,
  teacherStrokes: DrawingStroke[],
  promptImage: ExamPdfImageBytes | undefined,
  imageAsCanvasBackground: boolean,
): void {
  const type = normalizeResponseType(question.type);
  switch (type) {
    case "multipleChoice":
      renderMultipleChoiceAnswer(doc, question, studentAnswer);
      return;
    case "trueFalse":
      renderTrueFalseAnswer(doc, question, studentAnswer);
      return;
    case "drawDiagram":
      renderDrawDiagramAnswer(
        doc,
        question,
        studentAnswer,
        teacherStrokes,
        imageAsCanvasBackground ? promptImage : undefined,
      );
      return;
    case "graph":
      renderGraphAnswer(doc, question, studentAnswer, teacherStrokes);
      return;
    case "photoHandwritten":
      renderPhotoAnswer(doc, studentAnswer, teacherStrokes);
      return;
    case "matching":
      renderMatchingAnswer(doc, question, studentAnswer);
      return;
    case "ordering":
      renderOrderingAnswer(doc, question, studentAnswer);
      return;
    case "labelling":
      renderLabellingAnswer(doc, question, studentAnswer);
      return;
    case "structuredMultiPart":
      renderStructuredAnswer(doc, question, studentAnswer);
      return;
    case "annotateSource":
      renderAnnotateSourceAnswer(doc, question, studentAnswer);
      return;
    case "mathInput":
      renderMathInputAnswer(doc, studentAnswer);
      return;
    default:
      renderTextAnswer(doc, studentAnswer);
  }
}

function renderStudentQuestions(
  doc: ExamPdfDoc,
  form: Form,
  student: ExamPdfStudent,
  questionImages: ExamPdfQuestionImages,
): void {
  form.questions.forEach((question, index) => {
    ensureSpace(doc, 100);
    const earned = student.graded ? student.questionGrades[question.id] ?? 0 : null;
    questionHeader(doc, question, index, earned);
    const studentAnswer = student.answers[question.id] ?? "";
    const promptImage = questionImages[question.id];
    const imageAsCanvasBackground =
      normalizeResponseType(question.type) === "drawDiagram" &&
      (question.responseConfig as DrawDiagramConfig).promptImageAsBackground === true;
    if (promptImage && !imageAsCanvasBackground) {
      renderInlineImage(doc, promptImage);
    }
    renderAnswer(
      doc,
      question,
      studentAnswer,
      getCanvasAnnotation(student.liveTeacherFeedback, question.id),
      promptImage,
      imageAsCanvasBackground,
    );
    const feedback = student.liveTeacherFeedback[question.id] ?? "";
    if (feedback.trim().length > 0) {
      renderFeedback(doc, feedback);
    }
    spacer(doc, 0.6);
  });
}

function writeStudentSection(
  doc: ExamPdfDoc,
  form: Form,
  student: ExamPdfStudent,
  questionImages: ExamPdfQuestionImages,
): void {
  writeStudentHeader(doc, student);
  if (!student.hasJoined) {
    doc.font(PDF_FONT.italic).fontSize(PDF_BODY_SIZE).fillColor(COLOR_MUTED);
    doc.text("This student has not joined the session yet.", PAGE_MARGIN, doc.y, {
      width: CONTENT_WIDTH,
    });
    return;
  }
  if (form.questions.length === 0) {
    doc.font(PDF_FONT.italic).fontSize(PDF_BODY_SIZE).fillColor(COLOR_MUTED);
    doc.text("This form has no questions.", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
    return;
  }
  renderStudentQuestions(doc, form, student, questionImages);
}

function writeSessionCover(
  doc: ExamPdfDoc,
  session: ExamPdfSession,
  form: Form,
  students: ExamPdfStudent[],
  descriptionImage: ExamPdfImageBytes | null,
): void {
  doc.font(PDF_FONT.semibold).fontSize(10).fillColor(COLOR_ACCENT);
  doc.text("SESSION RESULTS", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  spacer(doc, 0.2);
  doc.font(PDF_FONT.semibold).fontSize(24).fillColor(COLOR_TEXT);
  doc.text(session.formTitle, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  if (form.description?.trim()) {
    doc.font(PDF_FONT.regular).fontSize(PDF_BODY_SIZE).fillColor(COLOR_MUTED);
    doc.text(form.description.trim(), PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  }
  if (descriptionImage) {
    spacer(doc, 0.4);
    renderInlineImage(doc, descriptionImage, 180);
  }
  spacer(doc, 0.6);
  writeKeyValueRow(doc, [
    ["Join code", session.joinCode],
    ["Opens", formatTimestamp(session.opensAt)],
    ["Closes", formatTimestamp(session.closesAt)],
  ]);

  const submitted = students.filter((s) => s.finished).length;
  const graded = students.filter((s) => s.graded).length;
  writeKeyValueRow(doc, [
    ["Students", String(students.length)],
    ["Submitted", String(submitted)],
    ["Graded", String(graded)],
  ]);
  hr(doc);
  doc.font(PDF_FONT.semibold).fontSize(13).fillColor(COLOR_TEXT);
  doc.text("Students in this bundle", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  spacer(doc, 0.4);

  if (students.length === 0) {
    doc.font(PDF_FONT.italic).fontSize(PDF_BODY_SIZE).fillColor(COLOR_MUTED);
    doc.text("No students have joined this session.", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
    return;
  }

  const colName = CONTENT_WIDTH * 0.5;
  const colStatus = CONTENT_WIDTH * 0.25;
  const colScore = CONTENT_WIDTH * 0.25;
  const headerY = doc.y;
  doc.font(PDF_FONT.semibold).fontSize(9).fillColor(COLOR_MUTED);
  doc.text("STUDENT", PAGE_MARGIN, headerY, { width: colName, lineBreak: false });
  doc.text("STATUS", PAGE_MARGIN + colName, headerY, { width: colStatus, lineBreak: false });
  doc.text("SCORE", PAGE_MARGIN + colName + colStatus, headerY, {
    width: colScore,
    align: "right",
    lineBreak: false,
  });
  doc.y = headerY + 14;
  hr(doc, COLOR_SOFT);

  students.forEach((student) => {
    ensureSpace(doc, 22);
    const rowY = doc.y;
    doc.font(PDF_FONT.regular).fontSize(PDF_BODY_SIZE).fillColor(COLOR_TEXT);
    doc.text(studentDisplayName(student), PAGE_MARGIN, rowY, { width: colName, lineBreak: false });
    const status = statusLabel(student);
    doc.fillColor(status.color);
    doc.text(status.label, PAGE_MARGIN + colName, rowY, { width: colStatus, lineBreak: false });
    doc.fillColor(COLOR_TEXT);
    const scoreText =
      student.graded && student.pointsEarned != null
        ? formatPointsScore(student.pointsEarned, student.pointsPossible)
        : student.finished
          ? "Pending"
          : "—";
    doc.text(scoreText, PAGE_MARGIN + colName + colStatus, rowY, {
      width: colScore,
      align: "right",
      lineBreak: false,
    });
    doc.y = rowY + 18;
  });
}

function createDoc(engine: ExamPdfEngine): ExamPdfDoc {
  const doc = new engine.PDFDocument({
    size: "LETTER",
    margins: {
      top: PAGE_MARGIN,
      bottom: PAGE_MARGIN + 24,
      left: PAGE_MARGIN,
      right: PAGE_MARGIN,
    },
    info: {
      Producer: "Truepaper",
      Creator: "Truepaper",
    },
    bufferPages: true,
  });
  registerExamPdfFonts(doc, engine.fonts);
  doc.font(PDF_FONT.regular);
  return doc;
}

async function docToBytes(doc: ExamPdfDoc): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("end", () => {
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(bytes);
    });
    doc.on("error", reject);
    doc.end();
  });
}

export async function buildSingleStudentExamPdf(args: {
  engine: ExamPdfEngine;
  session: ExamPdfSession;
  form: Form;
  student: ExamPdfStudent;
  questionImages?: ExamPdfQuestionImages;
}): Promise<Uint8Array> {
  const { engine, session, form, student, questionImages = {} } = args;
  const doc = createDoc(engine);
  doc.font(PDF_FONT.semibold).fontSize(10).fillColor(COLOR_ACCENT);
  doc.text("STUDENT EXAM", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  spacer(doc, 0.2);
  doc.font(PDF_FONT.semibold).fontSize(20).fillColor(COLOR_TEXT);
  doc.text(session.formTitle, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.font(PDF_FONT.monoSemiBold).fontSize(PDF_BODY_SIZE).fillColor(COLOR_MUTED);
  doc.text(`Session code ${session.joinCode}`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  spacer(doc, 0.6);
  writeStudentSection(doc, form, student, questionImages);
  pageFooter(doc, session);
  return docToBytes(doc);
}

export async function buildSessionExamBundlePdf(args: {
  engine: ExamPdfEngine;
  session: ExamPdfSession;
  form: Form;
  students: ExamPdfStudent[];
  questionImages?: ExamPdfQuestionImages;
  descriptionImage?: ExamPdfImageBytes | null;
  /**
   * Awaited after each student section renders — lets the browser update a
   * progress bar between students (pass a callback that yields a macrotask).
   */
  onStudentRendered?: (done: number, total: number) => void | Promise<void>;
}): Promise<Uint8Array> {
  const {
    engine,
    session,
    form,
    students,
    questionImages = {},
    descriptionImage = null,
    onStudentRendered,
  } = args;
  const doc = createDoc(engine);
  writeSessionCover(doc, session, form, students, descriptionImage);
  for (const [index, student] of students.entries()) {
    doc.addPage();
    writeStudentSection(doc, form, student, questionImages);
    if (onStudentRendered) {
      await onStudentRendered(index + 1, students.length);
    }
  }
  pageFooter(doc, session);
  return docToBytes(doc);
}
