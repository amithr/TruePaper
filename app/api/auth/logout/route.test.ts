import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/auth/logout/route";

const signOut = vi.fn();
const createSupabaseServerClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    signOut.mockReset();
    createSupabaseServerClient.mockResolvedValue({ auth: { signOut } });
  });

  it("returns ok when sign out succeeds", async () => {
    signOut.mockResolvedValue({ error: null });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns error when sign out fails", async () => {
    signOut.mockResolvedValue({ error: { message: "Failed" } });
    const res = await POST();
    expect(res.status).toBe(400);
  });
});
