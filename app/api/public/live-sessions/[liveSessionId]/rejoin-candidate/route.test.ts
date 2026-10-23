import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/public/live-sessions/[liveSessionId]/rejoin-candidate/route";
import { createMockSupabase } from "@/lib/test/mock-supabase";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";

const createSupabaseAnonServiceClient = vi.fn();

vi.mock("@/lib/supabase/anon-service", () => ({
  createSupabaseAnonServiceClient: () => createSupabaseAnonServiceClient(),
}));

function get(query: string) {
  return GET(
    new Request(`http://localhost/api/public/live-sessions/${TEST_LIVE_SESSION_ID}/rejoin-candidate?${query}`),
    { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
  );
}

describe("GET /api/public/live-sessions/[id]/rejoin-candidate", () => {
  beforeEach(() => {
    createSupabaseAnonServiceClient.mockReset();
  });

  it("requires a device id and a name", async () => {
    expect((await get(`deviceId=bad&name=Jordan`)).status).toBe(400);
    expect((await get(`deviceId=${TEST_DEVICE_ID}&name=`)).status).toBe(400);
  });

  it("returns the candidate summary without any device id", async () => {
    createSupabaseAnonServiceClient.mockReturnValue(
      createMockSupabase({
        rpc: (name, args) => {
          expect(name).toBe("lookup_live_session_rejoin_candidate");
          expect(args).toEqual({
            p_live_session_id: TEST_LIVE_SESSION_ID,
            p_display_name: "Jordan Lee",
            p_device_id: TEST_DEVICE_ID,
          });
          return {
            data: {
              ok: true,
              found: true,
              answeredCount: 3,
              questionTotal: 10,
              lastActiveAt: "2026-10-23T10:00:00.000Z",
              suspended: false,
              pendingRequest: false,
            },
            error: null,
          };
        },
      }),
    );
    const res = await get(`deviceId=${TEST_DEVICE_ID}&name=${encodeURIComponent("  Jordan   Lee ")}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      found: true,
      ambiguous: false,
      answeredCount: 3,
      questionTotal: 10,
      lastActiveAt: "2026-10-23T10:00:00.000Z",
      suspended: false,
      pendingRequest: false,
    });
  });

  it("maps a closed session to 409 and a missing RPC to 503", async () => {
    createSupabaseAnonServiceClient.mockReturnValue(
      createMockSupabase({ rpc: () => ({ data: { ok: false, reason: "session_closed" }, error: null }) }),
    );
    const closed = await get(`deviceId=${TEST_DEVICE_ID}&name=Jordan`);
    expect(closed.status).toBe(409);
    expect(await closed.json()).toMatchObject({ code: "session_closed" });

    createSupabaseAnonServiceClient.mockReturnValue(
      createMockSupabase({
        rpc: () => ({
          data: null,
          error: { message: "function lookup_live_session_rejoin_candidate does not exist", code: "42883" },
        }),
      }),
    );
    expect((await get(`deviceId=${TEST_DEVICE_ID}&name=Jordan`)).status).toBe(503);
  });
});
