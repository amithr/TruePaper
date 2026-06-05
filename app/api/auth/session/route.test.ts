import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/auth/session/route";
import { TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();
const getSessionUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

describe("GET /api/auth/session", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
    createSupabaseServerClient.mockResolvedValue({});
  });

  it("returns null user when unauthenticated", async () => {
    getSessionUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null, profile: null });
  });

  it("returns session user and profile", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const res = await GET();
    const body = (await res.json()) as { user: { id: string }; profile: { role: string } };
    expect(body.user.id).toBe(TEST_TEACHER_SESSION.user.id);
    expect(body.profile.role).toBe("teacher");
  });
});
