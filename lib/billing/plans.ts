/**
 * Student-count tiers. The cap is the number of students in one live session
 * (concurrent roster size); Free covers a small class at no cost.
 */
export type PlanId = "free" | "classroom" | "department" | "school";

export type Plan = {
  id: PlanId;
  /** Students per live session; null = unlimited. */
  studentLimit: number | null;
  /** Monthly price in the smallest currency unit (USD cents). 0 = no subscription. */
  monthlyAmount: number;
  currency: "usd";
  /** Stable Stripe Price lookup key (prices are created on demand by this key). */
  lookupKey: string | null;
};

export const FREE_STUDENT_LIMIT = 10;

export const PLANS: readonly Plan[] = [
  { id: "free", studentLimit: FREE_STUDENT_LIMIT, monthlyAmount: 0, currency: "usd", lookupKey: null },
  { id: "classroom", studentLimit: 35, monthlyAmount: 900, currency: "usd", lookupKey: "truepaper_classroom_monthly_v1" },
  { id: "department", studentLimit: 150, monthlyAmount: 2900, currency: "usd", lookupKey: "truepaper_department_monthly_v1" },
  { id: "school", studentLimit: null, monthlyAmount: 7900, currency: "usd", lookupKey: "truepaper_school_monthly_v1" },
] as const;

export const PLAN_ORDER: readonly PlanId[] = PLANS.map((p) => p.id);

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && PLAN_ORDER.includes(value as PlanId);
}

export function getPlan(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

export function planFromLookupKey(lookupKey: string | null | undefined): PlanId | null {
  if (!lookupKey) {
    return null;
  }
  return PLANS.find((p) => p.lookupKey === lookupKey)?.id ?? null;
}

/** The cheapest plan that fits a class of `students`. */
export function planForStudentCount(students: number): PlanId {
  for (const plan of PLANS) {
    if (plan.studentLimit === null || students <= plan.studentLimit) {
      return plan.id;
    }
  }
  return "school";
}

export function comparePlans(a: PlanId, b: PlanId): number {
  return PLAN_ORDER.indexOf(a) - PLAN_ORDER.indexOf(b);
}

/** "$9" / "$29" for the plan cards; amounts are whole dollars by design. */
export function formatMonthlyPrice(plan: Plan, locale = "en"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: plan.currency.toUpperCase(),
    minimumFractionDigits: plan.monthlyAmount % 100 === 0 ? 0 : 2,
  }).format(plan.monthlyAmount / 100);
}
