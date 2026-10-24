import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/public/live-sessions/[liveSessionId]/register/route";
import { TEST_DEVICE_ID, TEST_DISPLAY_NAME, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";

const rpc = vi.fn();
const createSupabaseAnonServiceClient = vi.fn();

vi.mock("@/lib/supabase/anon-service", () => ({
  createSupabaseAnonServiceClient: () => createSupabaseAnonServiceClient(),
}));

describe("POST /api/public/live-sessions/register", () => {
  beforeEach(() => {
    rpc.mockReset();
    createSupabaseAnonServiceClient.mockReturnValue({ rpc });
  });

  it("requires valid deviceId and display name", async () => {
    const res = await POST(
      new Request("http://localhost/api/register", {
        method: "POST",
        body: JSON.stringify({ deviceId: "bad", displayName: "" }),
      }),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("registers student presence", async () => {
    rpc.mockResolvedValue({ error: null });

    const res = await POST(
      new Request("http://localhost/api/register", {
        method: "POST",
        body: JSON.stringify({ deviceId: TEST_DEVICE_ID, displayName: TEST_DISPLAY_NAME }),
      }),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("register_live_session_student_presence", {
      p_live_session_id: TEST_LIVE_SESSION_ID,
      p_device_id: TEST_DEVICE_ID,
      p_display_name: TEST_DISPLAY_NAME,
    });
  });

  it("turns away the 11th student on the Free tier (409 session_full)", async () => {
    rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === "live_session_student_capacity"
          ? { data: { ok: true, allowed: false, limit: 10, count: 10, plan: "free" }, error: null }
          : { error: null },
      ),
    );
    const res = await POST(
      new Request("http://localhost/api/register", {
        method: "POST",
        body: JSON.stringify({ deviceId: TEST_DEVICE_ID, displayName: TEST_DISPLAY_NAME }),
      }),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "session_full", limit: 10 });
    expect(rpc).not.toHaveBeenCalledWith("register_live_session_student_presence", expect.anything());
  });

  it("lets a returning device through and skips the cap on a pre-billing database", async () => {
    rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === "live_session_student_capacity"
          ? { data: null, error: { message: "function live_session_student_capacity does not exist", code: "42883" } }
          : { error: null },
      ),
    );
    const res = await POST(
      new Request("http://localhost/api/register", {
        method: "POST",
        body: JSON.stringify({ deviceId: TEST_DEVICE_ID, displayName: TEST_DISPLAY_NAME }),
      }),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(200);
  });

  it("maps exam already submitted to 403", async () => {
    rpc.mockResolvedValue({ error: { message: "exam already submitted", code: "P0001" } });

    const res = await POST(
      new Request("http://localhost/api/register", {
        method: "POST",
        body: JSON.stringify({ deviceId: TEST_DEVICE_ID, displayName: TEST_DISPLAY_NAME }),
      }),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(403);
  });
});
