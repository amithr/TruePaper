import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/public/live-sessions/[liveSessionId]/state/route";
import { createMockSupabase } from "@/lib/test/mock-supabase";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";

const createSupabaseAnonServiceClient = vi.fn();

vi.mock("@/lib/supabase/anon-service", () => ({
  createSupabaseAnonServiceClient: () => createSupabaseAnonServiceClient(),
}));

describe("GET /api/public/live-sessions/state", () => {
  beforeEach(() => {
    createSupabaseAnonServiceClient.mockReset();
  });

  it("requires deviceId query param", async () => {
    const res = await GET(
      new Request(`http://localhost/api/public/live-sessions/${TEST_LIVE_SESSION_ID}/state`),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns lightweight session state", async () => {
    const supabase = createMockSupabase({
      rpc: (name) => {
        expect(name).toBe("get_live_session_student_state");
        return {
          data: {
            opensAt: "2026-01-01T00:00:00.000Z",
            closesAt: "2026-12-31T00:00:00.000Z",
            suspended: false,
            finished: true,
          },
          error: null,
        };
      },
    });
    createSupabaseAnonServiceClient.mockReturnValue(supabase);

    const res = await GET(
      new Request(
        `http://localhost/api/public/live-sessions/${TEST_LIVE_SESSION_ID}/state?deviceId=${TEST_DEVICE_ID}`,
      ),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { finished: boolean; suspended: boolean };
    expect(body.finished).toBe(true);
    expect(body.suspended).toBe(false);
  });
});
