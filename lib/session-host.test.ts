import { describe, expect, it, vi } from "vitest";

import { fetchSessionHost, parseSessionHost } from "@/lib/session-host";
import { TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";

describe("parseSessionHost", () => {
  it("keeps the two public fields and nothing else", () => {
    expect(parseSessionHost({ ok: true, displayName: " Ms. Rivera ", avatarUrl: "https://x/a.png", email: "x" })).toEqual({
      displayName: "Ms. Rivera",
      avatarUrl: "https://x/a.png",
    });
    expect(parseSessionHost({ ok: true, displayName: "", avatarUrl: "" })).toBeNull();
    expect(parseSessionHost({ ok: false })).toBeNull();
    expect(parseSessionHost("nope")).toBeNull();
  });
});

describe("fetchSessionHost", () => {
  it("returns null on a pre-migration database instead of failing the join", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "function get_live_session_host does not exist", code: "42883" } });
    expect(await fetchSessionHost({ rpc } as never, TEST_LIVE_SESSION_ID)).toBeNull();
    rpc.mockResolvedValue({ data: { ok: true, displayName: "Mr. Okafor", avatarUrl: null }, error: null });
    expect(await fetchSessionHost({ rpc } as never, TEST_LIVE_SESSION_ID)).toEqual({ displayName: "Mr. Okafor", avatarUrl: null });
    expect(rpc).toHaveBeenLastCalledWith("get_live_session_host", { p_live_session_id: TEST_LIVE_SESSION_ID });
  });
});
