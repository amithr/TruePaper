import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/library/templates/[templateId]/clone/route";
import { TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const createSupabaseServerClient = vi.fn();
const getSessionUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

describe("POST /api/library/templates/clone", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getSessionUser.mockReset();
  });

  it("returns 401 without session", async () => {
    getSessionUser.mockResolvedValue(null);
    createSupabaseServerClient.mockResolvedValue({ rpc: vi.fn() });

    const res = await POST(
      new Request("http://localhost/api/clone", { method: "POST" }),
      { params: Promise.resolve({ templateId: "tpl-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("clones template via rpc", async () => {
    getSessionUser.mockResolvedValue(TEST_TEACHER_SESSION);
    const rpc = vi.fn().mockResolvedValue({
      data: { formId: "form-new", templateId: "tpl-1", clonedAtVersion: 2 },
      error: null,
    });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    const res = await POST(
      new Request("http://localhost/api/clone", { method: "POST" }),
      { params: Promise.resolve({ templateId: "tpl-1" }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { formId: string };
    expect(body.formId).toBe("form-new");
  });
});
