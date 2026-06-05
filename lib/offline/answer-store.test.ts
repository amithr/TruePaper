import { describe, expect, it } from "vitest";

import { mergeAnswersLastWrite } from "@/lib/offline/answer-store";

describe("mergeAnswersLastWrite", () => {
  it("prefers higher revision per question", () => {
    const merged = mergeAnswersLastWrite(
      { q1: "local", q2: "local-only" },
      { q1: 3, q2: 1 },
      { q1: "remote", q3: "remote-only" },
      { q1: 1, q3: 2 },
    );
    expect(merged).toEqual({
      q1: "local",
      q2: "local-only",
      q3: "remote-only",
    });
  });

  it("uses remote when revision is newer", () => {
    const merged = mergeAnswersLastWrite(
      { q1: "local" },
      { q1: 1 },
      { q1: "remote" },
      { q1: 5 },
    );
    expect(merged.q1).toBe("remote");
  });
});
