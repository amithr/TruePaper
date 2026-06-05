import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/public/live-sessions/[liveSessionId]/heartbeat/route";
import { createMockSupabase } from "@/lib/test/mock-supabase";
import { TEST_DEVICE_ID, TEST_DISPLAY_NAME, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";

const createSupabaseAnonServiceClient = vi.fn();

vi.mock("@/lib/supabase/anon-service", () => ({
  createSupabaseAnonServiceClient: () => createSupabaseAnonServiceClient(),
}));

function heartbeatRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/public/live-sessions/${TEST_LIVE_SESSION_ID}/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/public/live-sessions/[id]/heartbeat", () => {
  beforeEach(() => {
    createSupabaseAnonServiceClient.mockReset();
  });

  it("forwards pending sync metadata to 7-arg RPC", async () => {
    const supabase = createMockSupabase({
      rpc: (name, args) => {
        expect(name).toBe("heartbeat_live_session_student");
        expect(args.p_pending_sync_count).toBe(2);
        expect(args.p_sync_state).toBe("offline");
        return { data: null, error: null };
      },
    });
    createSupabaseAnonServiceClient.mockReturnValue(supabase);

    const res = await POST(
      heartbeatRequest({
        deviceId: TEST_DEVICE_ID,
        displayName: TEST_DISPLAY_NAME,
        isTyping: false,
        interaction: true,
        pendingSyncCount: 2,
        syncState: "offline",
      }),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("clamps negative pendingSyncCount to zero", async () => {
    const supabase = createMockSupabase({
      rpc: (_name, args) => {
        expect(args.p_pending_sync_count).toBe(0);
        expect(args.p_sync_state).toBe("synced");
        return { data: null, error: null };
      },
    });
    createSupabaseAnonServiceClient.mockReturnValue(supabase);

    const res = await POST(
      heartbeatRequest({
        deviceId: TEST_DEVICE_ID,
        displayName: TEST_DISPLAY_NAME,
        pendingSyncCount: -5,
        syncState: "invalid",
      }),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(200);
  });
});
