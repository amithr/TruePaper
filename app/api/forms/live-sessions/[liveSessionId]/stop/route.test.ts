import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/forms/live-sessions/[liveSessionId]/stop/route";
import { TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";
import { TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();
const getSessionUser = vi.fn();
const notifyLiveSessionActivity = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

vi.mock("@/lib/notify-live-session-activity", () => ({
  notifyLiveSessionActivity: (...args: unknown[]) => notifyLiveSessionActivity(...args),
}));

describe("POST /api/forms/live-sessions/stop", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
    notifyLiveSessionActivity.mockReset();
  });

  it("requires teacher auth", async () => {
    getSessionUser.mockResolvedValue(null);
    createSupabaseServerClient.mockResolvedValue({ rpc: vi.fn() });

    const res = await POST(
      new Request("http://localhost/api/stop", { method: "POST" }),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(401);
  });

  it("stops session via rpc", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, closesAt: "2026-06-05T12:00:00.000Z", finishedCount: 3 },
      error: null,
    });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    const res = await POST(
      new Request("http://localhost/api/stop", { method: "POST" }),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; finishedCount: number };
    expect(body.ok).toBe(true);
    expect(body.finishedCount).toBe(3);
    expect(rpc).toHaveBeenCalledWith("stop_live_session", {
      p_live_session_id: TEST_LIVE_SESSION_ID,
    });
  });
});
