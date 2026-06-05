import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/forms/route";

const createSupabaseServerClient = vi.fn();
const getSessionUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

describe("GET /api/forms", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
  });

  it("returns 401 without session", async () => {
    getSessionUser.mockResolvedValue(null);
    createSupabaseServerClient.mockResolvedValue({});
    const res = await GET(new Request("http://localhost/api/forms"));
    expect(res.status).toBe(401);
  });

  it("returns empty list when teacher has no forms", async () => {
    getSessionUser.mockResolvedValue({
      user: { id: "t1", email: "t@example.com" },
      profile: { role: "teacher", display_name: "T" },
    });

    const eq = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn(() => ({ eq }));
    const select = vi.fn(() => ({ order }));
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn(() => ({ select })),
    });

    const res = await GET(new Request("http://localhost/api/forms"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ forms: [] });
  });
});
