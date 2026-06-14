import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/auth/onboarding-tour/complete/route";
import { TEST_TEACHER_SESSION, TEST_TEACHER_USER } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();
const getSessionUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

function mockSupabaseWithUpdate(result: { error: { message: string; code?: string } | null }) {
  const eq = vi.fn().mockResolvedValue(result);
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { client: { from }, from, update, eq };
}

describe("POST onboarding-tour/complete", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
  });

  it("requires authentication", async () => {
    getSessionUser.mockResolvedValue(null);
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn() });

    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("rejects non-teachers", async () => {
    getSessionUser.mockResolvedValue({
      user: { id: "student-1", email: "s@example.com" },
      profile: { role: "student", display_name: "Student" },
    });
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn() });

    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("stamps the completion timestamp for the current teacher", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const { client, from, update, eq } = mockSupabaseWithUpdate({ error: null });
    createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, persisted: true });
    expect(from).toHaveBeenCalledWith("profiles");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ onboarding_tour_completed_at: expect.any(String) }),
    );
    expect(eq).toHaveBeenCalledWith("id", TEST_TEACHER_USER.id);
  });

  it("treats a missing column as a no-op success (pre-migration)", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const { client } = mockSupabaseWithUpdate({
      error: { message: 'column "onboarding_tour_completed_at" does not exist', code: "42703" },
    });
    createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, persisted: false });
  });

  it("surfaces unexpected database errors", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const { client } = mockSupabaseWithUpdate({ error: { message: "boom" } });
    createSupabaseServerClient.mockResolvedValue(client);

    const res = await POST();
    expect(res.status).toBe(500);
  });
});
