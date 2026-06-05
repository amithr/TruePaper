import { describe, expect, it } from "vitest";

import { GET, PUT } from "@/app/api/public/forms/[formId]/responses/route";

describe("legacy /api/public/forms/[formId]/responses", () => {
  it("GET returns 410 gone", async () => {
    const res = await GET();
    expect(res.status).toBe(410);
  });

  it("PUT returns 410 gone", async () => {
    const res = await PUT();
    expect(res.status).toBe(410);
  });
});
