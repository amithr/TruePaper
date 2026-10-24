import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE } from "@/app/api/teacher/account/route";
import { TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();
const getSessionUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));
vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

function del(body: unknown) {
  return DELETE(
    new Request("http://localhost/api/teacher/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function client(rpcResult: { error: { message: string; code?: string } | null }) {
  const remove = vi.fn().mockResolvedValue({ error: null });
  const list = vi
    .fn()
    // form-assets: one form folder with one file, then the avatars bucket with one file.
    .mockResolvedValueOnce({ data: [{ name: "form-1", id: null }] })
    .mockResolvedValueOnce({ data: [{ name: "q-1.jpg", id: "obj-1" }] })
    .mockResolvedValueOnce({ data: [{ name: "avatar.png", id: "obj-2" }] });
  const storage = { from: vi.fn(() => ({ list, remove })) };
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const signOut = vi.fn().mockResolvedValue({ error: null });
  return { client: { storage, rpc, auth: { signOut } }, remove, rpc, signOut };
}

describe("DELETE /api/teacher/account", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
  });

  it("requires an explicit confirmation flag", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    createSupabaseServerClient.mockResolvedValue(client({ error: null }).client);
    expect((await del({})).status).toBe(400);
  });

  it("removes storage objects, runs delete_my_account, then signs out", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const { client: c, remove, rpc, signOut } = client({ error: null });
    createSupabaseServerClient.mockResolvedValue(c);
    const res = await del({ confirm: true });
    expect(res.status).toBe(200);
    const uid = TEST_TEACHER_SESSION.user.id;
    expect(remove).toHaveBeenNthCalledWith(1, [`${uid}/form-1/q-1.jpg`]);
    expect(remove).toHaveBeenNthCalledWith(2, [`${uid}/avatar.png`]);
    expect(rpc).toHaveBeenCalledWith("delete_my_account");
    expect(signOut).toHaveBeenCalled();
  });

  it("explains a missing RPC with 503 and refuses non-teachers", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    createSupabaseServerClient.mockResolvedValue(
      client({ error: { message: "function public.delete_my_account() does not exist", code: "42883" } }).client,
    );
    expect((await del({ confirm: true })).status).toBe(503);
    getSessionUser.mockResolvedValue({ ...TEST_TEACHER_SESSION, profile: { role: "student" } });
    expect((await del({ confirm: true })).status).toBe(403);
  });
});
