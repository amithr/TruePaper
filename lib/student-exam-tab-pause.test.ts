import { describe, expect, it } from "vitest";

import { shouldApplyTeacherExamResume } from "@/lib/student-exam-tab-pause";

describe("shouldApplyTeacherExamResume", () => {
  it("blocks resume when the server never confirmed tab suspension", () => {
    expect(shouldApplyTeacherExamResume(false)).toBe(false);
  });

  it("allows resume after the server had recorded suspension", () => {
    expect(shouldApplyTeacherExamResume(true)).toBe(true);
  });
});
