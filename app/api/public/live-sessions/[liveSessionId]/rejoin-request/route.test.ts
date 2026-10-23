import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, POST } from "@/app/api/public/live-sessions/[liveSessionId]/rejoin-request/route";
import { createMockSupabase } from "@/lib/test/mock-supabase";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";

const createSupabaseAnonServiceClient = vi.fn();
const notifyLiveSessionActivity = vi.fn();

vi.mock("@/lib/supabase/anon-service", () => ({
  createSupabaseAnonServiceClient: () => createSupabaseAnonServiceClient(),
}));

vi.mock("@/lib/notify-live-session-activity", () => ({
  notifyLiveSessionActivity: (...args: unknown[]) => notifyLiveSessionActivity(...args),
}));

const params = { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) };

function post(body: Record<string, unknown>) {
  return POST(
    new Request(`http://localhost/api/public/live-sessions/${TEST_LIVE_SESSION_ID}/rejoin-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    params,
  );
}

describe("POST /api/public/live-sessions/[id]/rejoin-request", () => {
  beforeEach(() => {
    createSupabaseAnonServiceClient.mockReset();
    notifyLiveSessionActivity.mockReset();
  });

  it("validates the body", async () => {
    expect((await post({ deviceId: "bad", displayName: "Jordan" })).status).toBe(400);
    expect((await post({ deviceId: TEST_DEVICE_ID, displayName: "" })).status).toBe(400);
  });

  it("files the request and pokes the teacher roster", async () => {
    const supabase = createMockSupabase({
      rpc: (name) => {
        expect(name).toBe("request_live_session_device_rejoin");
        return { data: { ok: true, status: "pending" }, error: null };
      },
    });
    createSupabaseAnonServiceClient.mockReturnValue(supabase);
    const res = await post({ deviceId: TEST_DEVICE_ID, displayName: "Jordan Lee" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "pending" });
    expect(supabase.rpc).toHaveBeenCalledWith("request_live_session_device_rejoin", {
      p_live_session_id: TEST_LIVE_SESSION_ID,
      p_display_name: "Jordan Lee",
      p_device_id: TEST_DEVICE_ID,
    });
    expect(notifyLiveSessionActivity).toHaveBeenCalledWith(TEST_LIVE_SESSION_ID);
  });

  it.each([
    ["not_found", 404],
    ["already_submitted", 403],
    ["ambiguous", 409],
    ["target_has_attempt", 409],
    ["session_closed", 409],
  ])("maps reason %s to %i with the code in the body", async (reason, status) => {
    createSupabaseAnonServiceClient.mockReturnValue(
      createMockSupabase({ rpc: () => ({ data: { ok: false, reason }, error: null }) }),
    );
    const res = await post({ deviceId: TEST_DEVICE_ID, displayName: "Jordan" });
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ code: reason });
    expect(notifyLiveSessionActivity).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/public/live-sessions/[id]/rejoin-request", () => {
  beforeEach(() => {
    createSupabaseAnonServiceClient.mockReset();
    notifyLiveSessionActivity.mockReset();
  });

  it("cancels the request for this device", async () => {
    const supabase = createMockSupabase({
      rpc: () => ({ data: { ok: true, status: "cancelled" }, error: null }),
    });
    createSupabaseAnonServiceClient.mockReturnValue(supabase);
    const res = await DELETE(
      new Request(
        `http://localhost/api/public/live-sessions/${TEST_LIVE_SESSION_ID}/rejoin-request?deviceId=${TEST_DEVICE_ID}`,
        { method: "DELETE" },
      ),
      params,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "cancelled" });
    expect(supabase.rpc).toHaveBeenCalledWith("cancel_live_session_device_rejoin", {
      p_live_session_id: TEST_LIVE_SESSION_ID,
      p_device_id: TEST_DEVICE_ID,
    });
  });
});
