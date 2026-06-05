import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/public/live-sessions/[liveSessionId]/finish/route";
import { TEST_DEVICE_ID, TEST_DISPLAY_NAME, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";

const rpc = vi.fn();
const createSupabaseAnonServiceClient = vi.fn();

vi.mock("@/lib/supabase/anon-service", () => ({
  createSupabaseAnonServiceClient: () => createSupabaseAnonServiceClient(),
}));

describe("POST /api/public/live-sessions/finish", () => {
  beforeEach(() => {
    rpc.mockReset();
    createSupabaseAnonServiceClient.mockReturnValue({ rpc });
  });

  it("requires valid deviceId and display name", async () => {
    const res = await POST(
      new Request("http://localhost/api/finish", {
        method: "POST",
        body: JSON.stringify({ deviceId: "bad", displayName: "" }),
      }),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("finishes student response", async () => {
    rpc.mockResolvedValue({ error: null });
    const res = await POST(
      new Request("http://localhost/api/finish", {
        method: "POST",
        body: JSON.stringify({ deviceId: TEST_DEVICE_ID, displayName: TEST_DISPLAY_NAME }),
      }),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("finish_live_session_student_response", {
      p_live_session_id: TEST_LIVE_SESSION_ID,
      p_device_id: TEST_DEVICE_ID,
      p_display_name: TEST_DISPLAY_NAME,
    });
  });
});
