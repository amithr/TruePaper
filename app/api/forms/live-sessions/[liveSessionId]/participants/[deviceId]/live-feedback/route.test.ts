import { beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH } from "@/app/api/forms/live-sessions/[liveSessionId]/participants/[deviceId]/live-feedback/route";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID, TEST_QUESTION_ID } from "@/lib/test/fixtures";
import { TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();
const createSupabaseAnonServiceClient = vi.fn();
const getSessionUser = vi.fn();

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
  broadcastStudentExamPatch: vi.fn().mockResolvedValue(undefined),
}));

describe("PATCH live-feedback", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
    createSupabaseAnonServiceClient.mockReturnValue({});
  });

  it("requires teacher auth", async () => {
    getSessionUser.mockResolvedValue(null);
    createSupabaseServerClient.mockResolvedValue({ rpc: vi.fn() });

    const res = await PATCH(
      new Request("http://localhost/api/live-feedback", {
        method: "PATCH",
        body: JSON.stringify({ questionId: TEST_QUESTION_ID, message: "Nice work" }),
      }),
      {
        params: Promise.resolve({
          liveSessionId: TEST_LIVE_SESSION_ID,
          deviceId: TEST_DEVICE_ID,
        }),
      },
    );
    expect(res.status).toBe(401);
  });

  it("sends live feedback via rpc", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    const res = await PATCH(
      new Request("http://localhost/api/live-feedback", {
        method: "PATCH",
        body: JSON.stringify({ questionId: TEST_QUESTION_ID, message: "Nice work" }),
      }),
      {
        params: Promise.resolve({
          liveSessionId: TEST_LIVE_SESSION_ID,
          deviceId: TEST_DEVICE_ID,
        }),
      },
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_live_teacher_feedback", {
      p_live_session_id: TEST_LIVE_SESSION_ID,
      p_device_id: TEST_DEVICE_ID.toLowerCase(),
      p_question_id: TEST_QUESTION_ID,
      p_message: "Nice work",
    });
  });
});
