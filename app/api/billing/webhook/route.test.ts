import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/billing/webhook/route";

const constructEvent = vi.fn();
const upsert = vi.fn();
const maybeSingle = vi.fn();

vi.mock("@/lib/billing/stripe", () => ({
  getStripe: () => ({ webhooks: { constructEvent: (...args: unknown[]) => constructEvent(...args) } }),
  isBillingConfigured: () => true,
}));
vi.mock("@/lib/supabase/service-role", () => ({
  isServiceRoleConfigured: () => true,
  createSupabaseServiceRoleClient: () => ({
    from: () => ({
      upsert,
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  }),
}));

function post(body = "{}", sig: string | null = "t=1,v1=abc") {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (sig) {
    headers.set("stripe-signature", sig);
  }
  return POST(new Request("http://localhost/api/billing/webhook", { method: "POST", headers, body }));
}

const sub = {
  id: "sub_1",
  object: "subscription",
  customer: "cus_1",
  status: "active",
  cancel_at_period_end: false,
  metadata: { supabase_user_id: "u1", truepaper_plan: "department" },
  items: { data: [{ id: "si_1", price: { lookup_key: "truepaper_department_monthly_v1" }, current_period_end: 1795000000 }] },
};

describe("POST /api/billing/webhook", () => {
  beforeEach(() => {
    constructEvent.mockReset();
    upsert.mockReset().mockResolvedValue({ error: null });
    maybeSingle.mockReset();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  it("rejects a missing or bad signature", async () => {
    expect((await post("{}", null)).status).toBe(400);
    constructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature for payload");
    });
    expect((await post()).status).toBe(400);
  });

  it("mirrors subscription events into billing_subscriptions", async () => {
    constructEvent.mockReturnValue({ type: "customer.subscription.updated", data: { object: sub } });
    const res = await post();
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", plan: "department", student_limit: 150, status: "active" }),
      { onConflict: "user_id" },
    );
  });

  it("looks the user up by customer when metadata is missing, and ignores strangers", async () => {
    constructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { ...sub, status: "canceled", metadata: {} } },
    });
    maybeSingle.mockResolvedValueOnce({ data: { user_id: "u9" } });
    expect(await (await post()).json()).toEqual({ received: true });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u9", plan: "free" }), { onConflict: "user_id" });

    maybeSingle.mockResolvedValueOnce({ data: null });
    expect(await (await post()).json()).toMatchObject({ received: true, ignored: "unknown customer" });
  });

  it("acknowledges unrelated events without touching the database", async () => {
    constructEvent.mockReturnValue({ type: "invoice.paid", data: { object: {} } });
    expect(await (await post()).json()).toMatchObject({ received: true, ignored: "invoice.paid" });
    expect(upsert).not.toHaveBeenCalled();
  });
});
