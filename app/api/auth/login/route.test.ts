import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/auth/login/route";
import { createMockSupabaseServer } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
  });

  it("requires email and password", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 on auth failure", async () => {
    const supabase = createMockSupabaseServer({
      signInWithPassword: vi.fn().mockResolvedValue({
        error: { message: "Invalid login credentials" },
      }),
    });
    createSupabaseServerClient.mockResolvedValue(supabase);

    const res = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "teacher@example.com", password: "wrong" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns ok on success", async () => {
    createSupabaseServerClient.mockResolvedValue(createMockSupabaseServer());

    const res = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "Teacher@Example.com", password: "ValidPassw0rd!" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
