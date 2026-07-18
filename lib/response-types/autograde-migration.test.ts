import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Smoke-check the finish autograde migration stays aligned with TS graders.
 * Full SQL execution is covered in Supabase; this guards type regressions in git.
 */
describe("autograde_short_math_tf migration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260718130000_autograde_short_math_tf.sql"),
    "utf8",
  );

  it("extends autograde_mc_for_response for shortAnswer, trueFalse, and mathInput", () => {
    expect(sql).toContain("create or replace function public.autograde_mc_for_response");
    expect(sql).toContain("'multipleChoice'");
    expect(sql).toContain("'shortAnswer'");
    expect(sql).toContain("'trueFalse'");
    expect(sql).toContain("'mathInput'");
    expect(sql).toContain("acceptedAnswers");
    expect(sql).toContain("->> 'answer'");
    expect(sql).toContain("->> 'latex'");
  });
});
