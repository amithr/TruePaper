import fs from "node:fs";
import path from "node:path";

/** Logical font names registered on each PDF document. */
export const PDF_FONT = {
  regular: "PlexSans",
  medium: "PlexSansMedium",
  semibold: "PlexSansSemiBold",
  italic: "PlexSansItalic",
  mono: "PlexMono",
  monoSemiBold: "PlexMonoSemiBold",
} as const;

const PLEX_ROOT = path.join(process.cwd(), "node_modules", "@ibm", "plex");

function plexWoffBuffer(familyDir: string, file: string): Buffer {
  const filePath = path.join(PLEX_ROOT, familyDir, "fonts", "complete", "woff", file);
  return fs.readFileSync(filePath);
}

/** Register IBM Plex faces (woff via fontkit) so printed exams match the UI. */
export function registerExamPdfFonts(doc: PDFKit.PDFDocument): void {
  doc.registerFont(PDF_FONT.regular, plexWoffBuffer("IBM-Plex-Sans", "IBMPlexSans-Regular.woff"));
  doc.registerFont(PDF_FONT.medium, plexWoffBuffer("IBM-Plex-Sans", "IBMPlexSans-Medium.woff"));
  doc.registerFont(PDF_FONT.semibold, plexWoffBuffer("IBM-Plex-Sans", "IBMPlexSans-SemiBold.woff"));
  doc.registerFont(PDF_FONT.italic, plexWoffBuffer("IBM-Plex-Sans", "IBMPlexSans-Italic.woff"));
  doc.registerFont(PDF_FONT.mono, plexWoffBuffer("IBM-Plex-Mono", "IBMPlexMono-Medium.woff"));
  doc.registerFont(
    PDF_FONT.monoSemiBold,
    plexWoffBuffer("IBM-Plex-Mono", "IBMPlexMono-SemiBold.woff"),
  );
}

/** Minimum body size for print readability (handoff: ≥12pt). */
export const PDF_BODY_SIZE = 12;
