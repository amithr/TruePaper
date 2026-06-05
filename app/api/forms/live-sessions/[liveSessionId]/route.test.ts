import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE } from "@/app/api/forms/live-sessions/[liveSessionId]/route";
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

describe("DELETE live session", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
  });

  it("requires teacher auth", async () => {
    getSessionUser.mockResolvedValue(null);
    createSupabaseServerClient.mockResolvedValue({ rpc: vi.fn() });

    const res = await DELETE(new Request("http://localhost/api/session", { method: "DELETE" }), {
      params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("deletes session via rpc", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const rpc = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    const res = await DELETE(new Request("http://localhost/api/session", { method: "DELETE" }), {
      params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
