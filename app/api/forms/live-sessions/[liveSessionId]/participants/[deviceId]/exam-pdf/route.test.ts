import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/forms/live-sessions/[liveSessionId]/participants/[deviceId]/exam-pdf/route";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";
import { PDF_LOADED_SESSION, PDF_STUDENT } from "@/lib/test/pdf-fixtures";
import { TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();
const getSessionUser = vi.fn();
const loadSessionForPdf = vi.fn();
const loadStudentForPdf = vi.fn();
const buildSingleStudentExamPdf = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

vi.mock("@/lib/exam-pdf-load", () => ({
  loadSessionForPdf: (...args: unknown[]) => loadSessionForPdf(...args),
  loadStudentForPdf: (...args: unknown[]) => loadStudentForPdf(...args),
}));

vi.mock("@/lib/exam-pdf", () => ({
  buildSingleStudentExamPdf: (...args: unknown[]) => buildSingleStudentExamPdf(...args),
  safeFilenameSlug: (input: string, fallback: string) => input || fallback,
}));

describe("GET exam-pdf", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
    loadSessionForPdf.mockReset();
    loadStudentForPdf.mockReset();
    buildSingleStudentExamPdf.mockReset();
    createSupabaseServerClient.mockResolvedValue({});
    buildSingleStudentExamPdf.mockResolvedValue(Buffer.from("%PDF-1.4"));
  });

  it("requires teacher auth", async () => {
    getSessionUser.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/exam-pdf"), {
      params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID, deviceId: TEST_DEVICE_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns PDF attachment for student", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    loadSessionForPdf.mockResolvedValue(PDF_LOADED_SESSION);
    loadStudentForPdf.mockResolvedValue(PDF_STUDENT);

    const res = await GET(new Request("http://localhost/api/exam-pdf"), {
      params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID, deviceId: TEST_DEVICE_ID }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
