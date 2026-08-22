/** @vitest-environment node */
import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/pdf-fonts/[face]/route";

describe("GET pdf-fonts", () => {
  it("serves an allowlisted font face with immutable caching", async () => {
    const res = await GET(new Request("http://localhost/api/pdf-fonts/regular"), {
      params: Promise.resolve({ face: "regular" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("font/woff");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(1000);
    // woff magic number
    expect(Buffer.from(bytes.subarray(0, 4)).toString()).toBe("wOFF");
  });

  it("rejects unknown faces", async () => {
    const res = await GET(new Request("http://localhost/api/pdf-fonts/evil"), {
      params: Promise.resolve({ face: "../../etc/passwd" }),
    });
    expect(res.status).toBe(404);
  });
});
