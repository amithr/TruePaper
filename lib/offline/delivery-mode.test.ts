import { describe, expect, it } from "vitest";

import { fetchSessionDeliveryMode, sessionAllowsAnswerSync } from "@/lib/offline/delivery-mode";
import { createMockSupabase } from "@/lib/test/mock-supabase";
import { TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";

describe("sessionAllowsAnswerSync", () => {
  it("allows sync when live session window is open", () => {
    expect(sessionAllowsAnswerSync(true, "live")).toBe(true);
  });

  it("allows sync after window for self_paced and hybrid", () => {
    expect(sessionAllowsAnswerSync(false, "self_paced")).toBe(true);
    expect(sessionAllowsAnswerSync(false, "hybrid")).toBe(true);
  });

  it("blocks sync when live session is closed", () => {
    expect(sessionAllowsAnswerSync(false, "live")).toBe(false);
  });
});

describe("fetchSessionDeliveryMode", () => {
  it("returns delivery_mode from form_sessions", async () => {
    const supabase = createMockSupabase({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { delivery_mode: "self_paced" },
              error: null,
            }),
          }),
        }),
      }),
    });
    const mode = await fetchSessionDeliveryMode(supabase as never, TEST_LIVE_SESSION_ID);
    expect(mode).toBe("self_paced");
  });

  it("defaults to live when column is missing", async () => {
    const supabase = createMockSupabase({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: null,
              error: { message: 'column "delivery_mode" does not exist' },
            }),
          }),
        }),
      }),
    });
    const mode = await fetchSessionDeliveryMode(supabase as never, TEST_LIVE_SESSION_ID);
    expect(mode).toBe("live");
  });
});
