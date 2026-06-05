import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/forms/live-sessions/[liveSessionId]/suspensions/route";
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

describe("GET suspensions", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
  });

  it("returns 401 without session", async () => {
    getSessionUser.mockResolvedValue(null);
    createSupabaseServerClient.mockResolvedValue({});
    const res = await GET(new Request("http://localhost/api/suspensions"), {
      params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns suspended students", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);

    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: TEST_LIVE_SESSION_ID }, error: null });
    const eq2 = vi.fn(() => ({ maybeSingle }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const selectOwns = vi.fn(() => ({ eq: eq1 }));

    const eqResponses = vi.fn().mockResolvedValue({
      data: [
        {
          anonymous_session_id: TEST_DEVICE_ID,
          student_display_name: "Ada",
          suspended_at: "2026-06-05T12:00:00.000Z",
        },
      ],
      error: null,
    });
    const selectResponses = vi.fn(() => ({ eq: eqResponses }));

    const from = vi.fn((table: string) => {
      if (table === "form_sessions") {
        return { select: selectOwns };
      }
      return { select: selectResponses };
    });

    createSupabaseServerClient.mockResolvedValue({ from });

    const res = await GET(new Request("http://localhost/api/suspensions"), {
      params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { students: Array<{ displayName: string }> };
    expect(body.students).toHaveLength(1);
    expect(body.students[0]!.displayName).toBe("Ada");
  });
});
