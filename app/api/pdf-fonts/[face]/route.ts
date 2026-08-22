import { NextResponse } from "next/server";

import { PDF_FONT_FILES, type ExamPdfFontFace } from "@/lib/exam-pdf-fonts";
import { readExamPdfFontBuffer } from "@/lib/exam-pdf-node";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ face: string }>;
};

/**
 * Serve the IBM Plex woff files used by client-side exam PDF generation.
 * Faces are allowlisted via PDF_FONT_FILES; bytes come from node_modules.
 */
export async function GET(_request: Request, { params }: Params) {
  const { face } = await params;
  if (!Object.prototype.hasOwnProperty.call(PDF_FONT_FILES, face)) {
    return NextResponse.json({ error: "Unknown font face." }, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = readExamPdfFontBuffer(face as ExamPdfFontFace);
  } catch {
    return NextResponse.json({ error: "Font unavailable." }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "font/woff",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
