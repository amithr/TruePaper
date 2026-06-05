import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/public/live-sessions/[liveSessionId]/feedback/route";
import { createMockSupabase } from "@/lib/test/mock-supabase";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";

const createSupabaseAnonServiceClient = vi.fn();

vi.mock("@/lib/supabase/anon-service", () => ({
  createSupabaseAnonServiceClient: () => createSupabaseAnonServiceClient(),
}));

describe("GET /api/public/live-sessions/feedback", () => {
  beforeEach(() => {
    createSupabaseAnonServiceClient.mockReset();
  });

  it("requires deviceId", async () => {
    const res = await GET(
      new Request(`http://localhost/api/public/live-sessions/${TEST_LIVE_SESSION_ID}/feedback`),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns parsed live teacher feedback", async () => {
    const supabase = createMockSupabase({
      rpc: () => ({
        data: { enabled: true, feedback: { q1: { message: "Good start" } } },
        error: null,
      }),
    });
    createSupabaseAnonServiceClient.mockReturnValue(supabase);

    const res = await GET(
      new Request(
        `http://localhost/api/public/live-sessions/${TEST_LIVE_SESSION_ID}/feedback?deviceId=${TEST_DEVICE_ID}`,
      ),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { enabled: boolean };
    expect(body.enabled).toBe(true);
  });
});
