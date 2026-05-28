import PDFDocument from "pdfkit";

import { formatPointsScore } from "@/lib/exam-grades";
import type { Form, Question } from "@/lib/forms";
import type { ExamPdfSession, ExamPdfStudent } from "@/lib/exam-pdf-load";

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
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(COLOR_MUTED)
      .text(label.toUpperCase(), x, startY, { width: colWidth - 8 });
    doc
      .font("Helvetica")
      .fontSize(11)
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
  doc.font("Helvetica-Bold").fontSize(9);
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
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOR_TEXT);
  doc.text(`Q${index + 1}. ${question.prompt || "Untitled question"}`, PAGE_MARGIN, doc.y, {
    width: CONTENT_WIDTH,
  });
  doc.font("Helvetica").fontSize(9).fillColor(COLOR_MUTED);
  const typeLabel =
    question.type === "multipleChoice" ? "Multiple choice" : "Written response";
  const pointsLabel =
    earned != null
      ? `${earned} / ${question.points} pt${question.points === 1 ? "" : "s"} earned`
      : `${question.points} pt${question.points === 1 ? "" : "s"} possible`;
  doc.text(`${typeLabel} · ${pointsLabel}`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  spacer(doc, 0.4);
}

function renderMultipleChoiceAnswer(
  doc: ExamPdfDoc,
  question: Question,
  studentAnswer: string,
): void {
  const markerSize = 10;
  const textOffset = markerSize + 10;
  for (const option of question.options) {
    ensureSpace(doc, markerSize + 6);
    const isChosen = option === studentAnswer;
    const isCorrect =
      question.correctAnswer != null && option === question.correctAnswer;
    const markerX = PAGE_MARGIN + 4;
    const markerY = doc.y + 2;
    doc.save();
    doc
      .circle(markerX + markerSize / 2, markerY + markerSize / 2, markerSize / 2)
      .lineWidth(0.9)
      .strokeColor(isChosen ? COLOR_ACCENT : COLOR_BORDER)
      .stroke();
    if (isChosen) {
      doc
        .circle(markerX + markerSize / 2, markerY + markerSize / 2, markerSize / 2 - 2)
        .fillColor(COLOR_ACCENT)
        .fill();
    }
    doc.restore();

    doc.font("Helvetica").fontSize(11).fillColor(COLOR_TEXT);
    const parts: string[] = [option || "(blank option)"];
    if (isCorrect) {
      parts.push("· answer key");
    }
    doc.text(parts.join("  "), markerX + textOffset, doc.y, {
      width: CONTENT_WIDTH - textOffset - 4,
    });
    spacer(doc, 0.2);
  }
  if (
    studentAnswer.trim() &&
    !question.options.some((option) => option === studentAnswer)
  ) {
    doc.font("Helvetica-Oblique").fontSize(10).fillColor(COLOR_MUTED);
    doc.text(`Student chose: ${studentAnswer}`, PAGE_MARGIN + 4, doc.y, {
      width: CONTENT_WIDTH - 8,
    });
  } else if (!studentAnswer.trim()) {
    doc.font("Helvetica-Oblique").fontSize(10).fillColor(COLOR_MUTED);
    doc.text("Student did not pick an option.", PAGE_MARGIN + 4, doc.y, {
      width: CONTENT_WIDTH - 8,
    });
  }
  doc.x = PAGE_MARGIN;
}

function renderTextAnswer(doc: ExamPdfDoc, answer: string): void {
  const trimmed = answer.trim();
  const padding = 10;
  const innerWidth = CONTENT_WIDTH - padding * 2;

  const fontName = trimmed ? "Helvetica" : "Helvetica-Oblique";
  const body = trimmed || "No answer submitted.";
  doc.font(fontName).fontSize(11);
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

  doc.font(fontName).fontSize(11).fillColor(trimmed ? COLOR_TEXT : COLOR_MUTED);
  doc.text(body, PAGE_MARGIN + padding, boxTop + padding, { width: innerWidth });

  doc.x = PAGE_MARGIN;
  doc.y = boxTop + boxHeight + 6;
}

function renderFeedback(doc: ExamPdfDoc, message: string): void {
  const trimmed = message.trim();
  if (!trimmed) {
    return;
  }
  const padding = 10;
  const innerWidth = CONTENT_WIDTH - padding * 2;

  doc.font("Helvetica-Bold").fontSize(9);
  const titleHeight = doc.heightOfString("Teacher feedback", { width: innerWidth });
  doc.font("Helvetica").fontSize(11);
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
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(COLOR_ACCENT)
    .text("TEACHER FEEDBACK", PAGE_MARGIN + padding, boxTop + padding, { width: innerWidth });
  doc
    .font("Helvetica")
    .fontSize(11)
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
      .font("Helvetica")
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
  doc.font("Helvetica-Bold").fontSize(20).fillColor(COLOR_TEXT);
  doc.text(studentDisplayName(student), PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.font("Helvetica").fontSize(10).fillColor(COLOR_MUTED);
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

function renderStudentQuestions(doc: ExamPdfDoc, form: Form, student: ExamPdfStudent): void {
  form.questions.forEach((question, index) => {
    ensureSpace(doc, 100);
    const earned = student.graded ? student.questionGrades[question.id] ?? 0 : null;
    questionHeader(doc, question, index, earned);
    const studentAnswer = student.answers[question.id] ?? "";
    if (question.type === "multipleChoice") {
      renderMultipleChoiceAnswer(doc, question, studentAnswer);
    } else {
      renderTextAnswer(doc, studentAnswer);
    }
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
): void {
  writeStudentHeader(doc, student);
  if (!student.hasJoined) {
    doc.font("Helvetica-Oblique").fontSize(11).fillColor(COLOR_MUTED);
    doc.text("This student has not joined the session yet.", PAGE_MARGIN, doc.y, {
      width: CONTENT_WIDTH,
    });
    return;
  }
  if (form.questions.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(11).fillColor(COLOR_MUTED);
    doc.text("This form has no questions.", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
    return;
  }
  renderStudentQuestions(doc, form, student);
}

function writeSessionCover(
  doc: ExamPdfDoc,
  session: ExamPdfSession,
  form: Form,
  students: ExamPdfStudent[],
): void {
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR_ACCENT);
  doc.text("SESSION RESULTS", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  spacer(doc, 0.2);
  doc.font("Helvetica-Bold").fontSize(24).fillColor(COLOR_TEXT);
  doc.text(session.formTitle, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  if (form.description?.trim()) {
    doc.font("Helvetica").fontSize(11).fillColor(COLOR_MUTED);
    doc.text(form.description.trim(), PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
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
  doc.font("Helvetica-Bold").fontSize(13).fillColor(COLOR_TEXT);
  doc.text("Students in this bundle", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  spacer(doc, 0.4);

  if (students.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(11).fillColor(COLOR_MUTED);
    doc.text("No students have joined this session.", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
    return;
  }

  const colName = CONTENT_WIDTH * 0.5;
  const colStatus = CONTENT_WIDTH * 0.25;
  const colScore = CONTENT_WIDTH * 0.25;
  const headerY = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR_MUTED);
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
    doc.font("Helvetica").fontSize(11).fillColor(COLOR_TEXT);
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

function createDoc(): ExamPdfDoc {
  return new PDFDocument({
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
}

async function bufferDoc(doc: ExamPdfDoc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export async function buildSingleStudentExamPdf(args: {
  session: ExamPdfSession;
  form: Form;
  student: ExamPdfStudent;
}): Promise<Buffer> {
  const { session, form, student } = args;
  const doc = createDoc();
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR_ACCENT);
  doc.text("STUDENT EXAM", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  spacer(doc, 0.2);
  doc.font("Helvetica-Bold").fontSize(20).fillColor(COLOR_TEXT);
  doc.text(session.formTitle, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.font("Helvetica").fontSize(10).fillColor(COLOR_MUTED);
  doc.text(`Session code ${session.joinCode}`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  spacer(doc, 0.6);
  writeStudentSection(doc, form, student);
  pageFooter(doc, session);
  return bufferDoc(doc);
}

export async function buildSessionExamBundlePdf(args: {
  session: ExamPdfSession;
  form: Form;
  students: ExamPdfStudent[];
}): Promise<Buffer> {
  const { session, form, students } = args;
  const doc = createDoc();
  writeSessionCover(doc, session, form, students);
  students.forEach((student) => {
    doc.addPage();
    writeStudentSection(doc, form, student);
  });
  pageFooter(doc, session);
  return bufferDoc(doc);
}
