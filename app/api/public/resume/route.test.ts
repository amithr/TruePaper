import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/public/resume/route";
import { createMockSupabase } from "@/lib/test/mock-supabase";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID, TEST_RESUME_CODE } from "@/lib/test/fixtures";

const createSupabaseAnonServiceClient = vi.fn();
const fetchSessionDeliveryMode = vi.fn();

vi.mock("@/lib/supabase/anon-service", () => ({
  createSupabaseAnonServiceClient: () => createSupabaseAnonServiceClient(),
}));

vi.mock("@/lib/offline/delivery-mode", () => ({
  fetchSessionDeliveryMode: (...args: unknown[]) => fetchSessionDeliveryMode(...args),
}));

describe("GET /api/public/resume", () => {
  beforeEach(() => {
    createSupabaseAnonServiceClient.mockReset();
    fetchSessionDeliveryMode.mockReset();
    fetchSessionDeliveryMode.mockResolvedValue("self_paced");
  });

  it("rejects invalid resume code format", async () => {
    const res = await GET(new Request("http://localhost/api/public/resume?code=bad"));
    expect(res.status).toBe(400);
  });

  it("returns session payload with deliveryMode", async () => {
    const supabase = createMockSupabase({
      rpc: (name, args) => {
        expect(name).toBe("lookup_student_resume_code");
        expect(args.p_code).toBe(TEST_RESUME_CODE);
        return {
          data: {
            ok: true,
            liveSessionId: TEST_LIVE_SESSION_ID,
            deviceId: TEST_DEVICE_ID,
            displayName: "Student",
            joinCode: "ABCDEF",
            formId: "form-1",
            opensAt: "2026-01-01T00:00:00.000Z",
            closesAt: "2026-12-31T00:00:00.000Z",
            resumeCode: TEST_RESUME_CODE,
            title: "Resume Form",
            description: "",
            liveTeacherFeedbackEnabled: false,
            questions: [],
          },
          error: null,
        };
      },
    });
    createSupabaseAnonServiceClient.mockReturnValue(supabase);

    const res = await GET(
      new Request(`http://localhost/api/public/resume?code=${TEST_RESUME_CODE}`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      liveSessionId: string;
      deliveryMode: string;
      form: { title: string };
    };
    expect(body.liveSessionId).toBe(TEST_LIVE_SESSION_ID);
    expect(body.deliveryMode).toBe("self_paced");
    expect(body.form.title).toBe("Resume Form");
  });

  it("maps already_submitted to 403", async () => {
    const supabase = createMockSupabase({
      rpc: () => ({
        data: { ok: false, reason: "already_submitted" },
        error: null,
      }),
    });
    createSupabaseAnonServiceClient.mockReturnValue(supabase);

    const res = await GET(
      new Request(`http://localhost/api/public/resume?code=${TEST_RESUME_CODE}`),
    );
    expect(res.status).toBe(403);
  });
});
