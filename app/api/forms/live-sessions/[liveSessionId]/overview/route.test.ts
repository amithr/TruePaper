import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/forms/live-sessions/[liveSessionId]/overview/route";
import { TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";
import { TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();
const getSessionUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

describe("GET /api/forms/live-sessions/overview", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
    createSupabaseServerClient.mockResolvedValue({});
  });

  it("returns 401 without session", async () => {
    getSessionUser.mockResolvedValue(null);
    const res = await GET(
      new Request(`http://localhost/api/forms/live-sessions/${TEST_LIVE_SESSION_ID}/overview`),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-teachers", async () => {
    getSessionUser.mockResolvedValue({
      user: TEST_TEACHER_SESSION.user,
      profile: { role: "student", display_name: "Student" },
    });
    const res = await GET(
      new Request(`http://localhost/api/forms/live-sessions/${TEST_LIVE_SESSION_ID}/overview`),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(403);
  });
});
