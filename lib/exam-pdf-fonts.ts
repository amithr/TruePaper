/**
 * Font constants shared by the server and client PDF generators. This module
 * must stay free of Node-only imports; the fs-backed loader lives in
 * `lib/exam-pdf-node.ts`.
 */

/** Logical font names registered on each PDF document. */
export const PDF_FONT = {
  regular: "PlexSans",
  medium: "PlexSansMedium",
  semibold: "PlexSansSemiBold",
  italic: "PlexSansItalic",
  mono: "PlexMono",
  monoSemiBold: "PlexMonoSemiBold",
} as const;

export type ExamPdfFontFace = keyof typeof PDF_FONT;

/** woff files inside `node_modules/@ibm/plex`, keyed by logical face. */
export const PDF_FONT_FILES: Record<ExamPdfFontFace, { family: string; file: string }> = {
  regular: { family: "IBM-Plex-Sans", file: "IBMPlexSans-Regular.woff" },
  medium: { family: "IBM-Plex-Sans", file: "IBMPlexSans-Medium.woff" },
  semibold: { family: "IBM-Plex-Sans", file: "IBMPlexSans-SemiBold.woff" },
  italic: { family: "IBM-Plex-Sans", file: "IBMPlexSans-Italic.woff" },
  mono: { family: "IBM-Plex-Mono", file: "IBMPlexMono-Medium.woff" },
  monoSemiBold: { family: "IBM-Plex-Mono", file: "IBMPlexMono-SemiBold.woff" },
};

export const PDF_FONT_FACES = Object.keys(PDF_FONT_FILES) as ExamPdfFontFace[];

/** Raw woff bytes per face (Buffer on the server, Uint8Array in the browser). */
export type ExamPdfFontBuffers = Record<ExamPdfFontFace, Uint8Array>;

/** Register IBM Plex faces (woff via fontkit) so printed exams match the UI. */
export function registerExamPdfFonts(doc: PDFKit.PDFDocument, fonts: ExamPdfFontBuffers): void {
  for (const face of PDF_FONT_FACES) {
    doc.registerFont(PDF_FONT[face], fonts[face] as Buffer);
  }
}

/** Minimum body size for print readability (handoff: ≥12pt). */
export const PDF_BODY_SIZE = 12;
