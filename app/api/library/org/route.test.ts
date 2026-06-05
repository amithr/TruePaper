import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH } from "@/app/api/library/org/route";
import { TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();
const getSessionUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

describe("/api/library/org", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
  });

  it("GET returns 401 without session", async () => {
    getSessionUser.mockResolvedValue(null);
    createSupabaseServerClient.mockResolvedValue({});
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("PATCH returns 403 for non-teachers", async () => {
    getSessionUser.mockResolvedValue({
      user: TEST_TEACHER_SESSION.user,
      profile: { role: "student", display_name: "Student" },
    });
    createSupabaseServerClient.mockResolvedValue({});

    const res = await PATCH(
      new Request("http://localhost/api/library/org", {
        method: "PATCH",
        body: JSON.stringify({ organizationId: null }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
