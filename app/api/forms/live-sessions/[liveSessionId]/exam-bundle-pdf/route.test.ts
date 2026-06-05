import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/forms/live-sessions/[liveSessionId]/exam-bundle-pdf/route";
import { TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";
import { PDF_LOADED_SESSION, PDF_STUDENT } from "@/lib/test/pdf-fixtures";
import { TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();
const getSessionUser = vi.fn();
const loadSessionForPdf = vi.fn();
const loadAllStudentsForPdf = vi.fn();
const buildSessionExamBundlePdf = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

vi.mock("@/lib/exam-pdf-load", () => ({
  loadSessionForPdf: (...args: unknown[]) => loadSessionForPdf(...args),
  loadAllStudentsForPdf: (...args: unknown[]) => loadAllStudentsForPdf(...args),
}));

vi.mock("@/lib/exam-pdf", () => ({
  buildSessionExamBundlePdf: (...args: unknown[]) => buildSessionExamBundlePdf(...args),
  safeFilenameSlug: (input: string, fallback: string) => input || fallback,
}));

describe("GET exam-bundle-pdf", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
    loadSessionForPdf.mockReset();
    loadAllStudentsForPdf.mockReset();
    buildSessionExamBundlePdf.mockReset();
    createSupabaseServerClient.mockResolvedValue({});
    buildSessionExamBundlePdf.mockResolvedValue(Buffer.from("%PDF-bundle"));
  });

  it("returns 403 for non-teachers", async () => {
    getSessionUser.mockResolvedValue({
      user: TEST_TEACHER_SESSION.user,
      profile: { role: "student", display_name: "Student" },
    });
    const res = await GET(new Request("http://localhost/api/exam-bundle-pdf"), {
      params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns bundle PDF", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    loadSessionForPdf.mockResolvedValue(PDF_LOADED_SESSION);
    loadAllStudentsForPdf.mockResolvedValue([PDF_STUDENT]);

    const res = await GET(new Request("http://localhost/api/exam-bundle-pdf"), {
      params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });
});
