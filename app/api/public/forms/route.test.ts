import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/public/forms/route";

describe("GET /api/public/forms", () => {
  it("returns 404 with guidance", async () => {
    const res = await GET();
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/session code/i);
  });
});
