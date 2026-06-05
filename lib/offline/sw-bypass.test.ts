import { describe, expect, it } from "vitest";

import { shouldBypassServiceWorker } from "@/lib/offline/sw-bypass";

function req(
  overrides: Partial<{ method: string; url: string; headers: Record<string, string> }> = {},
) {
  const headers = new Map(Object.entries(overrides.headers ?? {}));
  return {
    method: overrides.method ?? "GET",
    url: overrides.url ?? "http://localhost/en",
    headers: { get: (name: string) => headers.get(name) ?? null },
  };
}

describe("shouldBypassServiceWorker", () => {
  it("bypasses non-GET requests", () => {
    expect(shouldBypassServiceWorker(req({ method: "POST" }), "http://localhost")).toBe(true);
  });

  it("bypasses cross-origin requests", () => {
    expect(
      shouldBypassServiceWorker(req({ url: "https://example.com/page" }), "http://localhost"),
    ).toBe(true);
  });

  it("bypasses API routes", () => {
    expect(
      shouldBypassServiceWorker(req({ url: "http://localhost/api/public/join" }), "http://localhost"),
    ).toBe(true);
  });

  it("bypasses RSC and Next.js router headers", () => {
    expect(
      shouldBypassServiceWorker(
        req({ url: "http://localhost/en?_rsc=1" }),
        "http://localhost",
      ),
    ).toBe(true);
    expect(
      shouldBypassServiceWorker(
        req({ url: "http://localhost/en", headers: { RSC: "1" } }),
        "http://localhost",
      ),
    ).toBe(true);
    expect(
      shouldBypassServiceWorker(
        req({ url: "http://localhost/en", headers: { "Next-Action": "x" } }),
        "http://localhost",
      ),
    ).toBe(true);
  });

  it("allows same-origin static shell GET", () => {
    expect(shouldBypassServiceWorker(req(), "http://localhost")).toBe(false);
  });
});
