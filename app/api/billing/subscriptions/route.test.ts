import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/billing/subscriptions/route";
import { TEST_TEACHER_SESSION } from "@/lib/test/mock-server";

const getSessionUser = vi.fn();
const isBillingConfigured = vi.fn(() => true);
const stripe = {
  subscriptions: { retrieve: vi.fn(), create: vi.fn(), update: vi.fn() },
  customers: { search: vi.fn(), create: vi.fn() },
  prices: { list: vi.fn(), create: vi.fn() },
  products: { create: vi.fn() },
};
/** In-memory billing_subscriptions row for the mocked Supabase client. */
let row: Record<string, unknown> | null = null;
const upsert = vi.fn(async (value: Record<string, unknown>) => {
  row = { ...(row ?? {}), ...value };
  return { error: null };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      upsert,
    }),
  }),
}));
vi.mock("@/lib/request-auth", () => ({ getSessionUser: (...args: unknown[]) => getSessionUser(...args) }));
vi.mock("@/lib/billing/stripe", () => ({
  getStripe: () => stripe,
  isBillingConfigured: () => isBillingConfigured(),
}));

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/billing/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const openInvoice = { status: "open", confirmation_secret: { client_secret: "pi_secret_123", type: "payment_intent" } };
const item = (key: string) => ({ id: "si_1", price: { lookup_key: key }, current_period_end: 1795000000 });

describe("POST /api/billing/subscriptions", () => {
  beforeEach(() => {
    row = null;
    upsert.mockClear();
    getSessionUser.mockReset().mockResolvedValue(TEST_TEACHER_SESSION);
    isBillingConfigured.mockReturnValue(true);
    for (const group of Object.values(stripe)) {
      for (const fn of Object.values(group)) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }
    stripe.prices.list.mockResolvedValue({ data: [{ id: "price_classroom" }] });
    stripe.customers.search.mockResolvedValue({ data: [] });
    stripe.customers.create.mockResolvedValue({ id: "cus_new" });
  });

  it("answers 503 when Stripe keys are missing and 400 for an unknown plan", async () => {
    isBillingConfigured.mockReturnValue(false);
    expect((await post({ plan: "classroom" })).status).toBe(503);
    isBillingConfigured.mockReturnValue(true);
    expect((await post({ plan: "gold" })).status).toBe(400);
  });

  it("creates an incomplete subscription and hands back the invoice's client secret", async () => {
    stripe.subscriptions.create.mockResolvedValue({
      id: "sub_new",
      customer: "cus_new",
      status: "incomplete",
      cancel_at_period_end: false,
      metadata: { supabase_user_id: TEST_TEACHER_SESSION.user.id, truepaper_plan: "classroom" },
      items: { data: [item("truepaper_classroom_monthly_v1")] },
      latest_invoice: openInvoice,
    });

    const res = await post({ plan: "classroom" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, clientSecret: "pi_secret_123", subscriptionId: "sub_new" });
    expect(stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: TEST_TEACHER_SESSION.user.email, metadata: { supabase_user_id: TEST_TEACHER_SESSION.user.id } }),
    );
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_new",
        items: [{ price: "price_classroom" }],
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        expand: ["latest_invoice.confirmation_secret"],
      }),
    );
    // The row mirrors the incomplete subscription (still Free until the payment lands).
    expect(row).toMatchObject({ stripe_subscription_id: "sub_new", status: "incomplete", plan: "classroom" });
  });

  it("switches the price in place for an existing subscription", async () => {
    row = { user_id: TEST_TEACHER_SESSION.user.id, stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", plan: "classroom", status: "active", student_limit: 35, current_period_end: null, cancel_at_period_end: false };
    stripe.subscriptions.retrieve.mockResolvedValue({ id: "sub_1", status: "active", items: { data: [item("truepaper_classroom_monthly_v1")] } });
    stripe.prices.list.mockResolvedValue({ data: [{ id: "price_school" }] });
    stripe.subscriptions.update.mockResolvedValue({
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      cancel_at_period_end: false,
      metadata: {},
      items: { data: [item("truepaper_school_monthly_v1")] },
      latest_invoice: { status: "paid", confirmation_secret: null },
    });

    const res = await post({ plan: "school" });
    expect(await res.json()).toMatchObject({ ok: true, clientSecret: null, plan: "school", studentLimit: null });
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      "sub_1",
      expect.objectContaining({ items: [{ id: "si_1", price: "price_school" }], proration_behavior: "always_invoice" }),
    );
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it("moves to Free by cancelling at the period end", async () => {
    row = { user_id: TEST_TEACHER_SESSION.user.id, stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", plan: "classroom", status: "active", student_limit: 35, current_period_end: null, cancel_at_period_end: false };
    stripe.subscriptions.retrieve.mockResolvedValue({ id: "sub_1", status: "active", items: { data: [item("truepaper_classroom_monthly_v1")] } });
    stripe.subscriptions.update.mockResolvedValue({
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      cancel_at_period_end: true,
      metadata: {},
      items: { data: [item("truepaper_classroom_monthly_v1")] },
      latest_invoice: null,
    });
    const res = await post({ plan: "free" });
    expect(await res.json()).toMatchObject({ ok: true, plan: "classroom", cancelAtPeriodEnd: true });
    expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true });
  });
});
