import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/forms/live-sessions/[liveSessionId]/participants/[deviceId]/mark-graded/route";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";
import { TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();
const getSessionUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

vi.mock("@/lib/notify-live-session-activity", () => ({
  notifyLiveSessionActivity: vi.fn(),
}));

describe("POST mark-graded", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
  });

  it("requires teacher auth", async () => {
    getSessionUser.mockResolvedValue(null);
    createSupabaseServerClient.mockResolvedValue({ rpc: vi.fn() });

    const res = await POST(
      new Request("http://localhost/api/mark-graded", { method: "POST" }),
      {
        params: Promise.resolve({
          liveSessionId: TEST_LIVE_SESSION_ID,
          deviceId: TEST_DEVICE_ID,
        }),
      },
    );
    expect(res.status).toBe(401);
  });

  it("marks response graded", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const rpc = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    const res = await POST(
      new Request("http://localhost/api/mark-graded", { method: "POST" }),
      {
        params: Promise.resolve({
          liveSessionId: TEST_LIVE_SESSION_ID,
          deviceId: TEST_DEVICE_ID,
        }),
      },
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("teacher_mark_response_graded", {
      p_live_session_id: TEST_LIVE_SESSION_ID,
      p_device_id: TEST_DEVICE_ID.toLowerCase(),
    });
  });
});
