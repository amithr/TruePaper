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

  it("generates a server-side submissionId when omitted (avoids 4-arg overload ambiguity)", async () => {
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const supabase = createMockSupabase({
      rpc: (name, args) => {
        expect(name).toBe("save_live_session_student_response");
        // Always the 5-arg form: p_submission_id is populated even when the client omits it.
        expect(typeof args.p_submission_id).toBe("string");
        expect(args.p_submission_id as string).toMatch(uuidRe);
        return { data: { ok: true, deduped: false }, error: null };
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
