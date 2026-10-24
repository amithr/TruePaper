import { describe, expect, it } from "vitest";

import {
  comparePlans,
  formatMonthlyPrice,
  getPlan,
  isPlanId,
  planForStudentCount,
  planFromLookupKey,
  PLANS,
} from "@/lib/billing/plans";

describe("billing plans", () => {
  it("keeps up to 10 students free and sizes tiers by student count", () => {
    expect(getPlan("free").studentLimit).toBe(10);
    expect(getPlan("free").monthlyAmount).toBe(0);
    expect(planForStudentCount(1)).toBe("free");
    expect(planForStudentCount(10)).toBe("free");
    expect(planForStudentCount(11)).toBe("classroom");
    expect(planForStudentCount(35)).toBe("classroom");
    expect(planForStudentCount(36)).toBe("department");
    expect(planForStudentCount(151)).toBe("school");
    expect(getPlan("school").studentLimit).toBeNull();
  });

  it("maps Stripe lookup keys back to plans and orders tiers", () => {
    for (const plan of PLANS) {
      if (plan.lookupKey) {
        expect(planFromLookupKey(plan.lookupKey)).toBe(plan.id);
      }
    }
    expect(planFromLookupKey("nope")).toBeNull();
    expect(comparePlans("classroom", "free")).toBeGreaterThan(0);
    expect(comparePlans("free", "school")).toBeLessThan(0);
    expect(isPlanId("department")).toBe(true);
    expect(isPlanId("enterprise")).toBe(false);
  });

  it("formats whole-dollar monthly prices", () => {
    expect(formatMonthlyPrice(getPlan("classroom"), "en")).toBe("$9");
    expect(formatMonthlyPrice(getPlan("school"), "en")).toBe("$79");
  });
});
