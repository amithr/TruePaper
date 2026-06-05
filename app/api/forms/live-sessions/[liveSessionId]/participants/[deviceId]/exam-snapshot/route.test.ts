import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/forms/live-sessions/[liveSessionId]/participants/[deviceId]/exam-snapshot/route";
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

describe("GET exam-snapshot", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
  });

  it("requires teacher auth", async () => {
    getSessionUser.mockResolvedValue(null);
    createSupabaseServerClient.mockResolvedValue({});

    const res = await GET(new Request("http://localhost/api/exam-snapshot"), {
      params: Promise.resolve({
        liveSessionId: TEST_LIVE_SESSION_ID,
        deviceId: TEST_DEVICE_ID,
      }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when session not owned", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq2 = vi.fn(() => ({ maybeSingle }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const select = vi.fn(() => ({ eq: eq1 }));
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => ({ select })) });

    const res = await GET(new Request("http://localhost/api/exam-snapshot"), {
      params: Promise.resolve({
        liveSessionId: TEST_LIVE_SESSION_ID,
        deviceId: TEST_DEVICE_ID,
      }),
    });
    expect(res.status).toBe(404);
  });
});
