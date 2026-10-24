import { beforeEach, describe, expect, it, vi } from "vitest";

import { PUT } from "@/app/api/teacher/defaults/route";
import { TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();
const getSessionUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));
vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

const valid = { durationMinutes: null, deliveryMode: "hybrid", acceptLateSync: false, liveFeedback: true };

function put(body: unknown) {
  return PUT(
    new Request("http://localhost/api/teacher/defaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("PUT /api/teacher/defaults", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
  });

  it("upserts the teacher's row", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const upsert = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => ({ upsert })) });
    const res = await put(valid);
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: TEST_TEACHER_SESSION.user.id,
        duration_minutes: null,
        delivery_mode: "hybrid",
        accept_late_sync: false,
        live_feedback: true,
      }),
      { onConflict: "user_id" },
    );
    expect(await res.json()).toMatchObject({ ok: true, defaults: valid });
  });

  it("rejects invalid payloads and unauthenticated callers", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn() });
    expect((await put({ ...valid, durationMinutes: 1000 })).status).toBe(400);
    getSessionUser.mockResolvedValue(null);
    expect((await put(valid)).status).toBe(401);
  });

  it("explains a missing table with 503", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const upsert = vi.fn().mockResolvedValue({
      error: { message: "Could not find the table 'public.teacher_defaults' in the schema cache", code: "PGRST205" },
    });
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => ({ upsert })) });
    expect((await put(valid)).status).toBe(503);
  });
});
