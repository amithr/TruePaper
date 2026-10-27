import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/public/live-sessions/[liveSessionId]/review-token/route";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";

const rpc = vi.fn();

vi.mock("@/lib/supabase/anon-service", () => ({
  createSupabaseAnonServiceClient: () => ({ rpc }),
}));

function call(body: unknown) {
  return POST(
    new Request("http://localhost/api/review-token", { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
  );
}

describe("POST /api/public/live-sessions/[id]/review-token", () => {
  beforeEach(() => rpc.mockReset());

  it("requires a valid device id", async () => {
    expect((await call({ deviceId: "nope" })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the student's own token", async () => {
    rpc.mockResolvedValue({ data: "abcdefgh2345", error: null });
    const res = await call({ deviceId: TEST_DEVICE_ID });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ token: "ABCDEFGH2345" });
    expect(rpc).toHaveBeenCalledWith("claim_student_review_token", {
      p_live_session_id: TEST_LIVE_SESSION_ID,
      p_device_id: TEST_DEVICE_ID,
    });
  });

  it("maps not-finished and missing rows", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "exam not handed in" } });
    expect((await call({ deviceId: TEST_DEVICE_ID })).status).toBe(409);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "student response not found" } });
    expect((await call({ deviceId: TEST_DEVICE_ID })).status).toBe(404);
  });

  it("names the migration when the RPC is missing", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42883", message: "function does not exist" } });
    const res = await call({ deviceId: TEST_DEVICE_ID });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("20261027120000");
  });
});
