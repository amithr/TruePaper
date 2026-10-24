import { beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH } from "@/app/api/teacher/profile/route";
import { TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();
const getSessionUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));
vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/teacher/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function clientWithUpdate(result: { error: { message: string; code?: string } | null }) {
  const eq = vi.fn().mockResolvedValue(result);
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { client: { from }, update, eq };
}

describe("PATCH /api/teacher/profile", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
  });

  it("requires a signed-in teacher", async () => {
    createSupabaseServerClient.mockResolvedValue({});
    getSessionUser.mockResolvedValue(null);
    expect((await patch({ displayName: "A" })).status).toBe(401);
    getSessionUser.mockResolvedValue({ ...TEST_TEACHER_SESSION, profile: { role: "student" } });
    expect((await patch({ displayName: "A" })).status).toBe(403);
  });

  it("normalises and saves the display name with the registration rule", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const { client, update, eq } = clientWithUpdate({ error: null });
    createSupabaseServerClient.mockResolvedValue(client);
    const res = await patch({ displayName: "  Ms.   Rivera " });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ display_name: "Ms. Rivera" });
    expect(eq).toHaveBeenCalledWith("id", TEST_TEACHER_SESSION.user.id);
  });

  it("rejects an empty name and an empty patch", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    createSupabaseServerClient.mockResolvedValue(clientWithUpdate({ error: null }).client);
    expect((await patch({ displayName: "   " })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
  });

  it("explains a missing avatar column with 503", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    createSupabaseServerClient.mockResolvedValue(
      clientWithUpdate({ error: { message: 'column "avatar_url" does not exist', code: "42703" } }).client,
    );
    expect((await patch({ avatarUrl: null })).status).toBe(503);
  });
});
