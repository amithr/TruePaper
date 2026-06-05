import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/public/live-board/route";
import { TEST_JOIN_CODE } from "@/lib/test/fixtures";

const createSupabaseAnonServiceClient = vi.fn();

vi.mock("@/lib/supabase/anon-service", () => ({
  createSupabaseAnonServiceClient: () => createSupabaseAnonServiceClient(),
}));

describe("GET /api/public/live-board", () => {
  beforeEach(() => {
    createSupabaseAnonServiceClient.mockReset();
  });

  it("requires valid join code", async () => {
    const res = await GET(new Request("http://localhost/api/public/live-board?code=!!"));
    expect(res.status).toBe(400);
  });

  it("returns public board payload", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        formTitle: "Live Board",
        joinCode: TEST_JOIN_CODE,
        opensAt: "2026-01-01T00:00:00.000Z",
        closesAt: "2026-12-31T00:00:00.000Z",
        durationMinutes: 45,
        questionCounts: { text: 2 },
        assignedCount: 3,
        inProgressCount: 1,
      },
      error: null,
    });
    createSupabaseAnonServiceClient.mockReturnValue({ rpc });

    const res = await GET(
      new Request(`http://localhost/api/public/live-board?code=${TEST_JOIN_CODE}`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { formTitle: string };
    expect(body.formTitle).toBe("Live Board");
  });
});
