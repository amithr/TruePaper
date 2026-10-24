import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH } from "@/app/api/admin/users/[userId]/route";
import { TEST_DEVICE_ID } from "@/lib/test/fixtures";
import { TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const getSessionUser = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc }) }));
vi.mock("@/lib/request-auth", () => ({ getSessionUser: (...args: unknown[]) => getSessionUser(...args) }));

const ADMIN_SESSION = { ...TEST_TEACHER_SESSION, profile: { ...TEST_TEACHER_SESSION.profile, is_admin: true } };
const params = { params: Promise.resolve({ userId: TEST_DEVICE_ID }) };

function patch(body: unknown) {
  return PATCH(
    new Request(`http://localhost/api/admin/users/${TEST_DEVICE_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    params,
  );
}

describe("/api/admin/users/[userId]", () => {
  beforeEach(() => {
    getSessionUser.mockReset();
    rpc.mockReset();
  });

  it("is a 404-grade secret for non-admins: 401 signed out, 403 for plain teachers", async () => {
    getSessionUser.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost"), params)).status).toBe(401);
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    expect((await GET(new Request("http://localhost"), params)).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the account detail for admins", async () => {
    getSessionUser.mockResolvedValue(ADMIN_SESSION);
    rpc.mockResolvedValue({ data: { ok: true, profile: { id: TEST_DEVICE_ID }, billing: null, forms: [], sessions: [] }, error: null });
    const res = await GET(new Request("http://localhost"), params);
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("admin_get_user", { p_user_id: TEST_DEVICE_ID });
  });

  it("grants a complimentary plan and admin access through the RPCs", async () => {
    getSessionUser.mockResolvedValue(ADMIN_SESSION);
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    const res = await patch({ planOverride: "school", isAdmin: true });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("admin_set_plan_override", { p_user_id: TEST_DEVICE_ID, p_plan: "school" });
    expect(rpc).toHaveBeenCalledWith("admin_set_admin", { p_user_id: TEST_DEVICE_ID, p_is_admin: true });
    expect((await patch({ planOverride: "platinum" })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
  });

  it("maps the database's self-demotion guard and a missing migration", async () => {
    getSessionUser.mockResolvedValue(ADMIN_SESSION);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "cannot change your own admin flag" } });
    expect((await patch({ isAdmin: false })).status).toBe(400);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "function public.admin_set_admin(uuid, boolean) does not exist", code: "42883" } });
    expect((await patch({ isAdmin: false })).status).toBe(503);
  });
});
