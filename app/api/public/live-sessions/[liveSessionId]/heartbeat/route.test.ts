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

const missingFnError = {
  message: "function heartbeat_live_session_student does not exist",
  code: "42883",
};

describe("POST /api/public/live-sessions/[id]/heartbeat", () => {
  beforeEach(() => {
    createSupabaseAnonServiceClient.mockReset();
  });

  it("forwards pending sync metadata and focus to modern RPC", async () => {
    const focusId = "11111111-1111-4111-8111-111111111111";
    const supabase = createMockSupabase({
      rpc: (name, args) => {
        expect(name).toBe("heartbeat_live_session_student");
        expect(args.p_pending_sync_count).toBe(2);
        expect(args.p_sync_state).toBe("offline");
        expect(args.p_focus_question_id).toBe(focusId);
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
        focusQuestionId: focusId,
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

  it("falls back to 7-arg RPC when focus-aware heartbeat is unavailable", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const supabase = createMockSupabase({
      rpc: (_name, args) => {
        calls.push(args);
        if (calls.length === 1) {
          // 8-arg (with focus) missing
          return { data: null, error: missingFnError };
        }
        expect(args.p_pending_sync_count).toBe(1);
        expect(args.p_sync_state).toBe("pending");
        expect(args.p_focus_question_id).toBeUndefined();
        return { data: null, error: null };
      },
    });
    createSupabaseAnonServiceClient.mockReturnValue(supabase);

    const res = await POST(
      heartbeatRequest({
        deviceId: TEST_DEVICE_ID,
        displayName: TEST_DISPLAY_NAME,
        isTyping: true,
        interaction: true,
        pendingSyncCount: 1,
        syncState: "pending",
        focusQuestionId: "11111111-1111-4111-8111-111111111111",
      }),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("falls back to 5-arg RPC when 7-arg heartbeat is unavailable", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const supabase = createMockSupabase({
      rpc: (_name, args) => {
        calls.push(args);
        if (calls.length <= 2) {
          // 8-arg then 7-arg missing
          return { data: null, error: missingFnError };
        }
        expect(args.p_pending_sync_count).toBeUndefined();
        expect(args.p_sync_state).toBeUndefined();
        expect(args.p_focus_question_id).toBeUndefined();
        return { data: null, error: null };
      },
    });
    createSupabaseAnonServiceClient.mockReturnValue(supabase);

    const res = await POST(
      heartbeatRequest({
        deviceId: TEST_DEVICE_ID,
        displayName: TEST_DISPLAY_NAME,
        isTyping: true,
        interaction: true,
        pendingSyncCount: 1,
        syncState: "pending",
      }),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(3);
  });
});
