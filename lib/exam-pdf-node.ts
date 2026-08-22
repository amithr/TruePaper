/**
 * Server-only PDF engine: the Node pdfkit build plus fonts read from
 * node_modules. Client generation uses `lib/exam-pdf-client.ts` instead.
 */

import fs from "node:fs";
import path from "node:path";

import PDFDocument from "pdfkit";

import type { ExamPdfEngine } from "@/lib/exam-pdf";
import {
  PDF_FONT_FACES,
  PDF_FONT_FILES,
  type ExamPdfFontBuffers,
  type ExamPdfFontFace,
} from "@/lib/exam-pdf-fonts";

const PLEX_ROOT = path.join(process.cwd(), "node_modules", "@ibm", "plex");

/** Read one Plex woff file from node_modules (also serves `/api/pdf-fonts`). */
export function readExamPdfFontBuffer(face: ExamPdfFontFace): Buffer {
  const { family, file } = PDF_FONT_FILES[face];
  return fs.readFileSync(path.join(PLEX_ROOT, family, "fonts", "complete", "woff", file));
}

let cachedFonts: ExamPdfFontBuffers | null = null;

function loadFonts(): ExamPdfFontBuffers {
  if (!cachedFonts) {
    cachedFonts = Object.fromEntries(
      PDF_FONT_FACES.map((face) => [face, readExamPdfFontBuffer(face)]),
    ) as unknown as ExamPdfFontBuffers;
  }
  return cachedFonts;
}

/** Engine for the server PDF routes and tests. */
export function nodeExamPdfEngine(): ExamPdfEngine {
  return { PDFDocument, fonts: loadFonts() };
}
