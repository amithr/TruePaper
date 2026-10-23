import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE } from "@/app/api/forms/live-sessions/[liveSessionId]/participants/[deviceId]/rejoin-request/route";
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

function del(deviceId = TEST_DEVICE_ID) {
  return DELETE(new Request("http://localhost/api/rejoin-request", { method: "DELETE" }), {
    params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID, deviceId }),
  });
}

describe("DELETE /api/forms/live-sessions/[id]/participants/[deviceId]/rejoin-request", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
  });

  it("requires a teacher", async () => {
    createSupabaseServerClient.mockResolvedValue({ rpc: vi.fn() });
    getSessionUser.mockResolvedValue(null);
    expect((await del()).status).toBe(401);
    getSessionUser.mockResolvedValue({ ...TEST_TEACHER_SESSION, profile: { role: "student" } });
    expect((await del()).status).toBe(403);
  });

  it("declines the pending request", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });
    const res = await del(TEST_DEVICE_ID.toUpperCase());
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("teacher_decline_live_session_device_rejoin", {
      p_live_session_id: TEST_LIVE_SESSION_ID,
      p_device_id: TEST_DEVICE_ID.toLowerCase(),
    });
  });

  it("maps no-pending-request to 404 and foreign sessions to 403", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "no pending rejoin request" } }),
    });
    expect((await del()).status).toBe(404);
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "not allowed" } }),
    });
    expect((await del()).status).toBe(403);
  });
});
