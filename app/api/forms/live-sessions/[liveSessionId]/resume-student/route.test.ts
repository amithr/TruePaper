import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/forms/live-sessions/[liveSessionId]/resume-student/route";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";
import { TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();
const createSupabaseAnonServiceClient = vi.fn();
const getSessionUser = vi.fn();
const broadcastStudentExamPatch = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

vi.mock("@/lib/supabase/anon-service", () => ({
  createSupabaseAnonServiceClient: () => createSupabaseAnonServiceClient(),
}));

vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

vi.mock("@/lib/student-exam-channel", () => ({
  broadcastStudentExamPatch: (...args: unknown[]) => broadcastStudentExamPatch(...args),
}));

vi.mock("@/lib/notify-live-session-activity", () => ({
  notifyLiveSessionActivity: vi.fn(),
}));

describe("POST /api/forms/live-sessions/resume-student", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
    broadcastStudentExamPatch.mockReset();
    createSupabaseAnonServiceClient.mockReturnValue({});
    broadcastStudentExamPatch.mockResolvedValue(undefined);
  });

  it("requires valid deviceId", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    createSupabaseServerClient.mockResolvedValue({ rpc: vi.fn() });

    const res = await POST(
      new Request("http://localhost/api/resume-student", {
        method: "POST",
        body: JSON.stringify({ deviceId: "bad" }),
      }),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("clears suspension for teacher-owned session", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const rpc = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    const res = await POST(
      new Request("http://localhost/api/resume-student", {
        method: "POST",
        body: JSON.stringify({ deviceId: TEST_DEVICE_ID }),
      }),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("teacher_clear_live_session_student_suspension", {
      p_live_session_id: TEST_LIVE_SESSION_ID,
      p_device_id: TEST_DEVICE_ID.toLowerCase(),
    });
  });
});
