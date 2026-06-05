import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/library/updates/route";
import { TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();
const getSessionUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

describe("GET /api/library/updates", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
  });

  it("returns 401 without session", async () => {
    getSessionUser.mockResolvedValue(null);
    createSupabaseServerClient.mockResolvedValue({});
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns empty items when teacher has no clones", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const eq = vi.fn().mockResolvedValue({ data: [], error: null });
    const select = vi.fn(() => ({ eq }));
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn(() => ({ select })),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
  });
});
