import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BillingSection } from "@/components/billing/BillingSection";
import { FREE_STATE, type BillingState } from "@/lib/billing/subscription-state";
import { renderWithI18n } from "@/lib/test/render-i18n";

const requestJson = vi.fn();
const checkoutProps = vi.fn();

vi.mock("@/lib/request-json", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/request-json")>()),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));
// Stripe's Elements need a real key + network; stand in for the form here.
vi.mock("@/components/billing/CheckoutForm", () => ({
  CheckoutForm: (props: { plan: string; clientSecret: string; onDone: (o: string) => void }) => {
    checkoutProps(props);
    return (
      <div data-testid="mock-checkout">
        <button type="button" onClick={() => props.onDone("succeeded")}>
          mock pay
        </button>
      </div>
    );
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const usage = { forms: 1, sessions: 2, students: 3 };

function render(initial: BillingState = FREE_STATE, configured = true) {
  const onError = vi.fn();
  renderWithI18n(
    <BillingSection initial={initial} configured={configured} publishableKey="pk_test_x" usage={usage} onError={onError} />,
  );
  return { onError };
}

describe("BillingSection", () => {
  beforeEach(() => {
    requestJson.mockReset();
    checkoutProps.mockReset();
  });

  it("marks the current plan and opens the embedded checkout for a paid tier", async () => {
    requestJson.mockResolvedValueOnce({ ok: true, clientSecret: "pi_secret", ...FREE_STATE, status: "incomplete" });
    render();
    expect(screen.getByTestId("plan-card-free")).toHaveAttribute("data-current", "true");
    expect(screen.getByTestId("plan-choose-free")).toBeDisabled();
    fireEvent.click(screen.getByTestId("plan-choose-classroom"));
    await waitFor(() => expect(screen.getByTestId("mock-checkout")).toBeInTheDocument());
    expect(requestJson).toHaveBeenCalledWith(
      "/api/billing/subscriptions",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ plan: "classroom" }) }),
    );
    expect(checkoutProps).toHaveBeenCalledWith(expect.objectContaining({ plan: "classroom", clientSecret: "pi_secret" }));
  });

  it("syncs from Stripe the moment the payment succeeds and shows the new plan", async () => {
    requestJson
      .mockResolvedValueOnce({ ok: true, clientSecret: "pi_secret", ...FREE_STATE, status: "incomplete" })
      .mockResolvedValueOnce({ ok: true, ...FREE_STATE, plan: "classroom", status: "active", studentLimit: 35, hasCustomer: true });
    render();
    fireEvent.click(screen.getByTestId("plan-choose-classroom"));
    await waitFor(() => expect(screen.getByTestId("mock-checkout")).toBeInTheDocument());
    fireEvent.click(screen.getByText("mock pay"));
    await waitFor(() => expect(screen.getByTestId("billing-current-plan")).toHaveTextContent("Classroom"));
    expect(requestJson).toHaveBeenLastCalledWith("/api/billing/subscriptions/sync", { method: "POST" });
    expect(screen.queryByTestId("mock-checkout")).not.toBeInTheDocument();
    expect(screen.getByTestId("plan-card-classroom")).toHaveAttribute("data-current", "true");
  });

  it("asks twice before moving a paid plan to Free, then reports the end date", async () => {
    const paid: BillingState = { ...FREE_STATE, plan: "classroom", status: "active", studentLimit: 35, hasCustomer: true, subscriptionId: "sub_1", currentPeriodEnd: "2026-11-24T12:00:00Z" };
    requestJson.mockResolvedValueOnce({ ok: true, clientSecret: null, ...paid, cancelAtPeriodEnd: true });
    render(paid);
    expect(screen.getByTestId("billing-period")).toHaveTextContent(/Renews/);
    fireEvent.click(screen.getByTestId("plan-choose-free"));
    expect(requestJson).not.toHaveBeenCalled();
    expect(screen.getByText(/tap again to confirm/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("plan-choose-free"));
    await waitFor(() => expect(screen.getByTestId("billing-period")).toHaveTextContent(/Ends/));
  });

  it("disables paid plans and explains when Stripe isn't configured", () => {
    render(FREE_STATE, false);
    expect(screen.getByTestId("plan-choose-department")).toBeDisabled();
    expect(screen.getByText(/isn't set up on this server/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /manage billing/i })).not.toBeInTheDocument();
  });
});
