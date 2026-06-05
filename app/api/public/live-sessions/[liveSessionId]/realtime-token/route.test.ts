import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/public/live-sessions/[liveSessionId]/realtime-token/route";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";

const getSupabaseJwtSecret = vi.fn();
const mintStudentRealtimeJwt = vi.fn();

vi.mock("@/lib/supabase/mint-student-realtime-jwt", () => ({
  getSupabaseJwtSecret: () => getSupabaseJwtSecret(),
  mintStudentRealtimeJwt: (...args: unknown[]) => mintStudentRealtimeJwt(...args),
}));

describe("GET /api/public/live-sessions/realtime-token", () => {
  beforeEach(() => {
    getSupabaseJwtSecret.mockReset();
    mintStudentRealtimeJwt.mockReset();
  });

  it("requires deviceId", async () => {
    const res = await GET(
      new Request(`http://localhost/api/realtime-token`),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 503 when JWT secret is missing", async () => {
    getSupabaseJwtSecret.mockReturnValue(null);
    const res = await GET(
      new Request(
        `http://localhost/api/realtime-token?deviceId=${TEST_DEVICE_ID}`,
      ),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(503);
  });

  it("mints token when configured", async () => {
    getSupabaseJwtSecret.mockReturnValue("secret");
    mintStudentRealtimeJwt.mockReturnValue("jwt-token");
    const res = await GET(
      new Request(
        `http://localhost/api/realtime-token?deviceId=${TEST_DEVICE_ID}`,
      ),
      { params: Promise.resolve({ liveSessionId: TEST_LIVE_SESSION_ID }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token).toBe("jwt-token");
  });
});
