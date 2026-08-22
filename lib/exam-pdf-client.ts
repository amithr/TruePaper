/**
 * Browser-side exam PDF generation. Fetches the exam data + fonts + images,
 * then renders with the shared generator (`lib/exam-pdf.ts`) using pdfkit's
 * standalone build, reporting progress so the UI can show a determinate bar.
 * The server PDF routes remain as a fallback when this pipeline fails.
 */

import {
  buildSessionExamBundlePdf,
  buildSingleStudentExamPdf,
  safeFilenameSlug,
  type ExamPdfEngine,
  type ExamPdfQuestionImages,
} from "@/lib/exam-pdf";
import { PDF_FONT_FACES, type ExamPdfFontBuffers } from "@/lib/exam-pdf-fonts";
import type { ExamPdfSession, ExamPdfStudent } from "@/lib/exam-pdf-load";
import { formAssetPublicUrl } from "@/lib/form-assets";
import type { Form } from "@/lib/forms";

export type ExamPdfPhase = "data" | "fonts" | "images" | "render";

export type ExamPdfProgress = {
  phase: ExamPdfPhase;
  /** Completed units within the phase (e.g. students rendered). */
  done: number;
  total: number;
  /** Overall completion across all phases, 0..1. */
  overall: number;
};

const PHASE_WEIGHTS: Record<ExamPdfPhase, number> = {
  data: 0.15,
  fonts: 0.15,
  images: 0.2,
  render: 0.5,
};

const PHASE_ORDER: ExamPdfPhase[] = ["data", "fonts", "images", "render"];

function overallProgress(phase: ExamPdfPhase, done: number, total: number): number {
  let overall = 0;
  for (const step of PHASE_ORDER) {
    if (step === phase) {
      overall += PHASE_WEIGHTS[step] * (total > 0 ? Math.min(1, done / total) : 1);
      break;
    }
    overall += PHASE_WEIGHTS[step];
  }
  return Math.min(1, overall);
}

/** Let the browser paint between synchronous rendering chunks. */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type ExamPdfData = {
  session: ExamPdfSession;
  form: Form;
  students: ExamPdfStudent[];
};

async function fetchExamData(liveSessionId: string, deviceId?: string): Promise<ExamPdfData> {
  const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
  const res = await fetch(
    `/api/forms/live-sessions/${encodeURIComponent(liveSessionId)}/exam-pdf-data${query}`,
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Could not load exam data.");
  }
  return (await res.json()) as ExamPdfData;
}

async function fetchFonts(onOne: () => void): Promise<ExamPdfFontBuffers> {
  const entries = await Promise.all(
    PDF_FONT_FACES.map(async (face) => {
      const res = await fetch(`/api/pdf-fonts/${face}`);
      if (!res.ok) {
        throw new Error("Could not load PDF fonts.");
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      onOne();
      return [face, bytes] as const;
    }),
  );
  return Object.fromEntries(entries) as ExamPdfFontBuffers;
}

/** Fetch prompt/description images from public storage; failures are skipped. */
async function fetchImages(
  form: Form,
  onOne: () => void,
): Promise<{ questions: ExamPdfQuestionImages; description: ArrayBuffer | null }> {
  const questions: ExamPdfQuestionImages = {};
  let description: ArrayBuffer | null = null;

  const fetchOne = async (path: string | null | undefined): Promise<ArrayBuffer | null> => {
    const url = formAssetPublicUrl(path);
    if (!url) {
      return null;
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      return res.ok ? await res.arrayBuffer() : null;
    } catch {
      return null;
    } finally {
      onOne();
    }
  };

  await Promise.all([
    fetchOne(form.descriptionImagePath).then((bytes) => {
      description = bytes;
    }),
    ...form.questions
      .filter((question) => Boolean(question.promptImagePath))
      .map(async (question) => {
        const bytes = await fetchOne(question.promptImagePath);
        if (bytes) {
          questions[question.id] = bytes;
        }
      }),
  ]);

  return { questions, description };
}

function countImages(form: Form): number {
  return (
    (form.descriptionImagePath ? 1 : 0) +
    form.questions.filter((question) => Boolean(question.promptImagePath)).length
  );
}

export type GenerateExamPdfOptions = {
  liveSessionId: string;
  /** Generate for one student; omit for the whole-session bundle. */
  deviceId?: string;
  onProgress?: (progress: ExamPdfProgress) => void;
};

export async function generateExamPdf(
  options: GenerateExamPdfOptions,
): Promise<{ blob: Blob; filename: string }> {
  const { liveSessionId, deviceId, onProgress } = options;
  const report = (phase: ExamPdfPhase, done: number, total: number) => {
    onProgress?.({ phase, done, total, overall: overallProgress(phase, done, total) });
  };

  report("data", 0, 1);
  const data = await fetchExamData(liveSessionId, deviceId);
  report("data", 1, 1);

  let fontsDone = 0;
  const fontTotal = PDF_FONT_FACES.length;
  const [pdfkitModule, fonts] = await Promise.all([
    import("pdfkit/js/pdfkit.standalone.js"),
    fetchFonts(() => {
      fontsDone += 1;
      report("fonts", fontsDone, fontTotal);
    }),
  ]);
  const engine: ExamPdfEngine = { PDFDocument: pdfkitModule.default, fonts };

  const imageTotal = countImages(data.form);
  let imagesDone = 0;
  report("images", 0, Math.max(1, imageTotal));
  const images = await fetchImages(data.form, () => {
    imagesDone += 1;
    report("images", imagesDone, Math.max(1, imageTotal));
  });
  report("images", Math.max(1, imageTotal), Math.max(1, imageTotal));

  const formSlug = safeFilenameSlug(data.session.formTitle, "exam");
  let bytes: Uint8Array;
  let filename: string;

  report("render", 0, deviceId ? 1 : Math.max(1, data.students.length));
  await yieldToBrowser();

  if (deviceId) {
    const student = data.students[0];
    if (!student) {
      throw new Error("This student has not joined the session.");
    }
    bytes = await buildSingleStudentExamPdf({
      engine,
      session: data.session,
      form: data.form,
      student,
      questionImages: images.questions,
    });
    report("render", 1, 1);
    filename = `${formSlug}-${safeFilenameSlug(student.displayName, "student")}.pdf`;
  } else {
    bytes = await buildSessionExamBundlePdf({
      engine,
      session: data.session,
      form: data.form,
      students: data.students,
      questionImages: images.questions,
      descriptionImage: images.description,
      onStudentRendered: async (done, total) => {
        report("render", done, total);
        await yieldToBrowser();
      },
    });
    const codeSlug = safeFilenameSlug(data.session.joinCode, "session");
    filename = `${formSlug}-${codeSlug}-all-students.pdf`;
  }

  return { blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), filename };
}

/** Trigger a browser download for a generated PDF blob. */
export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
