import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useClientSessionHydration } from "@/lib/use-client-session-hydration";

const requestJson = vi.fn();

vi.mock("@/lib/request-json", () => ({
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

vi.mock("@/lib/supabase/auth-cookie", () => ({
  documentHasSupabaseAuthCookie: vi.fn(() => false),
}));

import { documentHasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";

describe("useClientSessionHydration", () => {
  beforeEach(() => {
    requestJson.mockReset();
    vi.mocked(documentHasSupabaseAuthCookie).mockReturnValue(false);
  });

  it("resolves immediately for guests without an auth cookie", async () => {
    const { result } = renderHook(() => useClientSessionHydration(null));

    await waitFor(() => expect(result.current.sessionHydrated).toBe(true));
    expect(result.current.session).toBeNull();
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("fetches session when an auth cookie is present", async () => {
    vi.mocked(documentHasSupabaseAuthCookie).mockReturnValue(true);
    requestJson.mockResolvedValue({
      user: { id: "u1", email: "t@example.com" },
      profile: { id: "u1", role: "teacher", display_name: "Teacher" },
    });

    const { result } = renderHook(() => useClientSessionHydration(null));

    await waitFor(() => expect(result.current.sessionHydrated).toBe(true));
    expect(requestJson).toHaveBeenCalledWith("/api/auth/session");
    expect(result.current.session?.profile?.role).toBe("teacher");
  });

  it("uses SSR initial session without fetching", async () => {
    const initial = {
      user: { id: "u1", email: "t@example.com" },
      profile: { id: "u1", role: "teacher" as const, display_name: "Teacher" },
    };
    const { result } = renderHook(() => useClientSessionHydration(initial));

    await waitFor(() => expect(result.current.sessionHydrated).toBe(true));
    expect(result.current.session).toEqual(initial);
    expect(requestJson).not.toHaveBeenCalled();
  });
});
