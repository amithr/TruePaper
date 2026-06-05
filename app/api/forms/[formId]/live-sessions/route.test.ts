import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/forms/[formId]/live-sessions/route";
import { createMockSupabaseServer, TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();
const getSessionUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

describe("POST /api/forms/[formId]/live-sessions", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
  });

  it("requires teacher auth", async () => {
    getSessionUser.mockResolvedValue(null);
    createSupabaseServerClient.mockResolvedValue(createMockSupabaseServer());

    const res = await POST(
      new Request("http://localhost/api/forms/f1/live-sessions", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ formId: "f1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("rejects non-teachers", async () => {
    getSessionUser.mockResolvedValue({
      user: TEST_TEACHER_SESSION.user,
      profile: { role: "student", display_name: "Student" },
    });
    createSupabaseServerClient.mockResolvedValue(createMockSupabaseServer());

    const res = await POST(
      new Request("http://localhost/api/forms/f1/live-sessions", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ formId: "f1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("creates session with delivery mode", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const supabase = createMockSupabaseServer({
      insertResult: {
        data: {
          id: "session-new",
          join_code: "ABCDEF",
          opens_at: "2026-06-05T12:00:00.000Z",
          closes_at: "2026-06-05T13:00:00.000Z",
          delivery_mode: "hybrid",
        },
        error: null,
      },
    });
    createSupabaseServerClient.mockResolvedValue(supabase);

    const res = await POST(
      new Request("http://localhost/api/forms/f1/live-sessions", {
        method: "POST",
        body: JSON.stringify({ durationMinutes: 60, deliveryMode: "hybrid" }),
      }),
      { params: Promise.resolve({ formId: "f1" }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { liveSessionId: string; deliveryMode: string };
    expect(body.liveSessionId).toBe("session-new");
    expect(body.deliveryMode).toBe("hybrid");
  });
});
