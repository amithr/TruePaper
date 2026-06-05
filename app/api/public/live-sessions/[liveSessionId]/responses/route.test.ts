import { beforeEach, describe, expect, it, vi } from "vitest";

import { PUT } from "@/app/api/public/live-sessions/[liveSessionId]/responses/route";
import { createMockSupabase } from "@/lib/test/mock-supabase";
import {
  TEST_DEVICE_ID,
  TEST_DISPLAY_NAME,
  TEST_LIVE_SESSION_ID,
  TEST_SUBMISSION_ID,
} from "@/lib/test/fixtures";

const createSupabaseAnonServiceClient = vi.fn();

vi.mock("@/lib/supabase/anon-service", () => ({
  createSupabaseAnonServiceClient: () => createSupabaseAnonServiceClient(),
}));

vi.mock("@/lib/live-session-finalize", () => ({
  finalizeLiveSessionIfClosed: vi.fn().mockResolvedValue(undefined),
}));

function putRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/public/live-sessions/${TEST_LIVE_SESSION_ID}/responses`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/public/live-sessions/[id]/responses", () => {
  beforeEach(() => {
    createSupabaseAnonServiceClient.mockReset();
  });

  it("rejects invalid deviceId", async () => {
    const res = await PUT(putRequest({ deviceId: "bad", displayName: TEST_DISPLAY_NAME, answers: {} }), {
      params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid submissionId UUID", async () => {
    const res = await PUT(
      putRequest({
        deviceId: TEST_DEVICE_ID,
        displayName: TEST_DISPLAY_NAME,
        answers: { q1: "x" },
        submissionId: "not-a-uuid",
      }),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/submissionId/);
  });

  it("calls 5-arg RPC with submissionId and returns deduped flag", async () => {
    const supabase = createMockSupabase({
      rpc: (name, args) => {
        expect(name).toBe("save_live_session_student_response");
        expect(args.p_submission_id).toBe(TEST_SUBMISSION_ID);
        return { data: { ok: true, deduped: true }, error: null };
      },
    });
    createSupabaseAnonServiceClient.mockReturnValue(supabase);

    const res = await PUT(
      putRequest({
        deviceId: TEST_DEVICE_ID,
        displayName: TEST_DISPLAY_NAME,
        answers: { q1: "synced" },
        submissionId: TEST_SUBMISSION_ID,
      }),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; deduped: boolean };
    expect(body).toEqual({ ok: true, deduped: true });
  });

  it("uses legacy 4-arg RPC when submissionId is omitted", async () => {
    const supabase = createMockSupabase({
      rpc: (name, args) => {
        expect(name).toBe("save_live_session_student_response");
        expect(args.p_submission_id).toBeUndefined();
        return { data: null, error: null };
      },
    });
    createSupabaseAnonServiceClient.mockReturnValue(supabase);

    const res = await PUT(
      putRequest({
        deviceId: TEST_DEVICE_ID,
        displayName: TEST_DISPLAY_NAME,
        answers: { q1: "legacy" },
      }),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
