import { describe, expect, it } from "vitest";

import { isSupabaseAuthCookieName } from "@/lib/supabase/auth-cookie";

describe("isSupabaseAuthCookieName", () => {
  it("matches Supabase SSR auth cookie names", () => {
    expect(isSupabaseAuthCookieName("sb-abc-auth-token")).toBe(true);
    expect(isSupabaseAuthCookieName("sb-abc-auth-token.0")).toBe(true);
  });

  it("rejects unrelated cookies", () => {
    expect(isSupabaseAuthCookieName("tp_locale")).toBe(false);
    expect(isSupabaseAuthCookieName("sb-abc-other")).toBe(false);
  });
});
