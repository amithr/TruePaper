import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/forms/live-sessions/[liveSessionId]/exam-pdf-data/route";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";
import { PDF_LOADED_SESSION, PDF_STUDENT } from "@/lib/test/pdf-fixtures";
import { TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();
const getSessionUser = vi.fn();
const loadSessionForPdf = vi.fn();
const loadStudentForPdf = vi.fn();
const loadAllStudentsForPdf = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

vi.mock("@/lib/exam-pdf-load", () => ({
  loadSessionForPdf: (...args: unknown[]) => loadSessionForPdf(...args),
  loadStudentForPdf: (...args: unknown[]) => loadStudentForPdf(...args),
  loadAllStudentsForPdf: (...args: unknown[]) => loadAllStudentsForPdf(...args),
}));

function makeRequest(deviceId?: string): Request {
  const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
  return new Request(`http://localhost/api/exam-pdf-data${query}`);
}

describe("GET exam-pdf-data", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
    loadSessionForPdf.mockReset();
    loadStudentForPdf.mockReset();
    loadAllStudentsForPdf.mockReset();
    createSupabaseServerClient.mockResolvedValue({});
  });

  it("returns 401 when signed out", async () => {
    getSessionUser.mockResolvedValue(null);
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-teachers", async () => {
    getSessionUser.mockResolvedValue({
      user: TEST_TEACHER_SESSION.user,
      profile: { role: "student", display_name: "Student" },
    });
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for a malformed deviceId", async () => {
    const res = await GET(makeRequest("not a device id"), {
      params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns session, form, and all students without deviceId", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    loadSessionForPdf.mockResolvedValue(PDF_LOADED_SESSION);
    loadAllStudentsForPdf.mockResolvedValue([PDF_STUDENT]);

    const res = await GET(makeRequest(), {
      params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      session: { joinCode: string };
      form: { id: string };
      students: unknown[];
    };
    expect(body.session.joinCode).toBe("ABCDEF");
    expect(body.form.id).toBe("form-1");
    expect(body.students).toHaveLength(1);
  });

  it("returns a single student when deviceId is given", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    loadSessionForPdf.mockResolvedValue(PDF_LOADED_SESSION);
    loadStudentForPdf.mockResolvedValue(PDF_STUDENT);

    const res = await GET(makeRequest(TEST_DEVICE_ID), {
      params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { students: Array<{ anonymousSessionId: string }> };
    expect(body.students).toHaveLength(1);
    expect(body.students[0].anonymousSessionId).toBe(TEST_DEVICE_ID);
    expect(loadAllStudentsForPdf).not.toHaveBeenCalled();
  });

  it("returns 404 when the student has not joined", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    loadSessionForPdf.mockResolvedValue(PDF_LOADED_SESSION);
    loadStudentForPdf.mockResolvedValue(null);

    const res = await GET(makeRequest(TEST_DEVICE_ID), {
      params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }),
    });
    expect(res.status).toBe(404);
  });
});
