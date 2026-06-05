import { beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH } from "@/app/api/forms/live-sessions/[liveSessionId]/participants/[deviceId]/grades/route";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID, TEST_QUESTION_ID } from "@/lib/test/fixtures";
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

describe("PATCH grades", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
  });

  it("requires valid questionId", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    createSupabaseServerClient.mockResolvedValue({ rpc: vi.fn() });

    const res = await PATCH(
      new Request("http://localhost/api/grades", {
        method: "PATCH",
        body: JSON.stringify({ questionId: "bad", points: 3 }),
      }),
      {
        params: Promise.resolve({
          liveSessionId: TEST_LIVE_SESSION_ID,
          deviceId: TEST_DEVICE_ID,
        }),
      },
    );
    expect(res.status).toBe(400);
  });

  it("sets question grade via rpc", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const rpc = vi.fn().mockResolvedValue({ data: { [TEST_QUESTION_ID]: 4 }, error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    const res = await PATCH(
      new Request("http://localhost/api/grades", {
        method: "PATCH",
        body: JSON.stringify({ questionId: TEST_QUESTION_ID, points: 4 }),
      }),
      {
        params: Promise.resolve({
          liveSessionId: TEST_LIVE_SESSION_ID,
          deviceId: TEST_DEVICE_ID,
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
