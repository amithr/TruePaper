import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/forms/live-sessions/[liveSessionId]/participants/[deviceId]/review-link/route";
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

describe("POST review-link", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
  });

  it("creates review URL from token", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const rpc = vi.fn().mockResolvedValue({ data: "REVIEWTOKEN1", error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    const res = await POST(
      new Request("http://localhost/api/review-link", { method: "POST" }),
      {
        params: Promise.resolve({
          liveSessionId: TEST_LIVE_SESSION_ID,
          deviceId: TEST_DEVICE_ID,
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; reviewUrl: string };
    expect(body.ok).toBe(true);
    expect(body.reviewUrl).toContain("REVIEWTOKEN1");
  });
});
