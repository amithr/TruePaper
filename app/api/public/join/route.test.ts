import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/public/join/route";
import { createMockSupabase } from "@/lib/test/mock-supabase";
import { TEST_JOIN_CODE, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";

const createSupabaseAnonServiceClient = vi.fn();
const fetchSessionDeliveryMode = vi.fn();

vi.mock("@/lib/supabase/anon-service", () => ({
  createSupabaseAnonServiceClient: () => createSupabaseAnonServiceClient(),
}));

vi.mock("@/lib/offline/delivery-mode", () => ({
  fetchSessionDeliveryMode: (...args: unknown[]) => fetchSessionDeliveryMode(...args),
}));

describe("GET /api/public/join", () => {
  beforeEach(() => {
    createSupabaseAnonServiceClient.mockReset();
    fetchSessionDeliveryMode.mockReset();
    fetchSessionDeliveryMode.mockResolvedValue("hybrid");
  });

  it("rejects invalid join code format", async () => {
    const res = await GET(new Request("http://localhost/api/public/join?code=!!"));
    expect(res.status).toBe(400);
  });

  it("returns session payload with deliveryMode", async () => {
    const supabase = createMockSupabase({
      rpc: (name) => {
        expect(name).toBe("lookup_join_code");
        return {
          data: {
            ok: true,
            liveSessionId: TEST_LIVE_SESSION_ID,
            formId: "form-1",
            opensAt: "2026-01-01T00:00:00.000Z",
            closesAt: "2026-12-31T00:00:00.000Z",
            title: "E2E Form",
            description: "",
            liveTeacherFeedbackEnabled: true,
            questions: [
              {
                id: "q1",
                prompt: "Question?",
                type: "text",
                options: [],
                displayOrder: 0,
                responseConfig: {},
              },
            ],
          },
          error: null,
        };
      },
    });
    createSupabaseAnonServiceClient.mockReturnValue(supabase);

    const res = await GET(new Request(`http://localhost/api/public/join?code=${TEST_JOIN_CODE}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      liveSessionId: string;
      deliveryMode: string;
      form: { title: string };
    };
    expect(body.liveSessionId).toBe(TEST_LIVE_SESSION_ID);
    expect(body.deliveryMode).toBe("hybrid");
    expect(body.form.title).toBe("E2E Form");
    expect(fetchSessionDeliveryMode).toHaveBeenCalledWith(supabase, TEST_LIVE_SESSION_ID);
  });

  it("maps lookup failures to 404", async () => {
    const supabase = createMockSupabase({
      rpc: () => ({
        data: { ok: false, reason: "not_open" },
        error: null,
      }),
    });
    createSupabaseAnonServiceClient.mockReturnValue(supabase);

    const res = await GET(new Request(`http://localhost/api/public/join?code=${TEST_JOIN_CODE}`));
    expect(res.status).toBe(404);
  });
});
