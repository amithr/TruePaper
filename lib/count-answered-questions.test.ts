import { describe, expect, it } from "vitest";

import { countAnsweredQuestions } from "@/lib/count-answered-questions";

describe("countAnsweredQuestions", () => {
  it("counts only non-empty string answers for known question ids", () => {
    expect(
      countAnsweredQuestions(
        { q1: "yes", q2: "  ", q3: "", q4: "ok" },
        ["q1", "q2", "q3", "q5"],
      ),
    ).toBe(1);
  });
});
