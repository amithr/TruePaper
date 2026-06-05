import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/public/review/[token]/route";

const createSupabaseAnonServiceClient = vi.fn();

vi.mock("@/lib/supabase/anon-service", () => ({
  createSupabaseAnonServiceClient: () => createSupabaseAnonServiceClient(),
}));

describe("GET /api/public/review/[token]", () => {
  beforeEach(() => {
    createSupabaseAnonServiceClient.mockReset();
  });

  it("rejects short tokens", async () => {
    const res = await GET(new Request("http://localhost/api/public/review/short"), {
      params: Promise.resolve({ token: "short" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns review payload", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        formTitle: "Quiz",
        displayName: "Ada",
        questions: [],
        answers: {},
        questionGrades: {},
        pointsEarned: 8,
        pointsPossible: 10,
      },
      error: null,
    });
    createSupabaseAnonServiceClient.mockReturnValue({ rpc });

    const res = await GET(new Request("http://localhost/api/public/review/ABCDEFGH"), {
      params: Promise.resolve({ token: "ABCDEFGH" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { review: { formTitle: string } };
    expect(body.review.formTitle).toBe("Quiz");
  });
});
