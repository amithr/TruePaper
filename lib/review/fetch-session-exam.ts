import type { ExamPdfSession, ExamPdfStudent } from "@/lib/exam-pdf-load";
import type { Form } from "@/lib/forms";

export type SessionExamData = {
  session: ExamPdfSession;
  form: Form;
  students: ExamPdfStudent[];
};

/** The full form (prompts, keys) plus every student's answers — teacher-only. */
export async function fetchSessionExam(liveSessionId: string): Promise<SessionExamData> {
  const res = await fetch(`/api/forms/live-sessions/${encodeURIComponent(liveSessionId)}/exam-pdf-data`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Could not load the exam.");
  }
  return (await res.json()) as SessionExamData;
}
