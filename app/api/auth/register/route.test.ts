import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/auth/register/route";
import { createMockSupabaseServer } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

const validBody = {
  email: "teacher@example.com",
  password: "ValidPassw0rd!",
  confirmPassword: "ValidPassw0rd!",
  displayName: "Teacher One",
  agreedToTerms: true,
};

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    createSupabaseServerClient.mockResolvedValue(createMockSupabaseServer());
  });

  it("requires terms agreement", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ ...validBody, agreedToTerms: false }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects password mismatch", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ ...validBody, confirmPassword: "OtherPassw0rd!" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects weak passwords", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ ...validBody, password: "short", confirmPassword: "short" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/12 characters/i);
  });

  it("creates account and reports email confirmation", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { needsEmailConfirmation: boolean; user: { email: string } };
    expect(body.needsEmailConfirmation).toBe(true);
    expect(body.user.email).toBe("teacher@example.com");
  });
});
