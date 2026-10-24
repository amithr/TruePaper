"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Appearance, type Stripe, type StripePaymentElementChangeEvent } from "@stripe/stripe-js";
import { Check, Lock } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { formatMonthlyPrice, getPlan, type PlanId } from "@/lib/billing/plans";
import { useLocale, useTranslations } from "@/lib/i18n/I18nProvider";
import type { TranslationPath } from "@/lib/i18n/types";
import { ui } from "@/lib/ui";

export type CheckoutOutcome = "succeeded" | "processing";

type Props = {
  publishableKey: string;
  clientSecret: string;
  plan: Exclude<PlanId, "free">;
  /** Where redirect-based payment methods come back to (same page, `?billing=return`). */
  returnUrl: string;
  onDone: (outcome: CheckoutOutcome) => void;
  onCancel: () => void;
};

const stripePromises = new Map<string, Promise<Stripe | null>>();

function stripeFor(publishableKey: string): Promise<Stripe | null> {
  let p = stripePromises.get(publishableKey);
  if (!p) {
    p = loadStripe(publishableKey);
    stripePromises.set(publishableKey, p);
  }
  return p;
}

/** Payment Element styled with the app's tokens. */
const appearance: Appearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#2563eb",
    colorBackground: "#ffffff",
    colorText: "#0f172a",
    colorTextSecondary: "#475569",
    colorTextPlaceholder: "#94a3b8",
    colorDanger: "#ef4444",
    fontFamily: '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif',
    fontSizeBase: "14px",
    borderRadius: "12px",
    spacingUnit: "4px",
  },
  rules: {
    ".Input": { border: "1px solid #d4d7e0", boxShadow: "none", padding: "10px 12px" },
    ".Input:focus": { border: "1px solid #2563eb", boxShadow: "0 0 0 3px #eff6ff" },
    ".Input--invalid": { border: "1px solid #ef4444", boxShadow: "0 0 0 3px #fef2f2" },
    ".Label": { fontWeight: "500", color: "#475569", marginBottom: "6px" },
    ".Tab": { border: "1px solid #e6e8ef", boxShadow: "none" },
    ".Tab--selected": { border: "1px solid #2563eb", backgroundColor: "#eff6ff" },
    ".Error": { fontSize: "13px" },
  },
};

export function CheckoutForm(props: Props) {
  const options = useMemo(
    () => ({ clientSecret: props.clientSecret, appearance, loader: "auto" as const }),
    [props.clientSecret],
  );
  const stripe = useMemo(() => stripeFor(props.publishableKey), [props.publishableKey]);
  return (
    <Elements stripe={stripe} options={options}>
      <CheckoutFormInner {...props} />
    </Elements>
  );
}

function CheckoutFormInner({ plan, returnUrl, onDone, onCancel }: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [complete, setComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const planMeta = getPlan(plan);
  const name = t(`billing.plans.${plan}.name` as TranslationPath);
  const price = formatMonthlyPrice(planMeta, locale);

  const onChange = (event: StripePaymentElementChangeEvent) => {
    setComplete(event.complete);
    if (event.complete) {
      setError("");
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || !complete || submitting) {
      return;
    }
    setSubmitting(true);
    setError("");
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? t("billing.checkout.failed"));
      setSubmitting(false);
      return;
    }
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",
    });
    if (result.error) {
      setError(result.error.message ?? t("billing.checkout.failed"));
      setSubmitting(false);
      return;
    }
    const status = result.paymentIntent?.status;
    if (status === "succeeded") {
      onDone("succeeded");
      return;
    }
    if (status === "processing") {
      onDone("processing");
      return;
    }
    setError(t("billing.checkout.failed"));
    setSubmitting(false);
  };

  return (
    <form className="tp-checkout" onSubmit={onSubmit} data-testid="billing-checkout" aria-busy={submitting}>
      <div className="tp-checkout__head">
        <p className={ui.sectionTitle}>{t("billing.checkout.title", { plan: name })}</p>
        <p className="tp-checkout__summary">
          {planMeta.studentLimit === null
            ? t("billing.checkout.summaryUnlimited", { price })
            : t("billing.checkout.summary", { price, n: planMeta.studentLimit })}
        </p>
      </div>

      {!ready ? <p className="tp-checkout__loading">{t("billing.checkout.loading")}</p> : null}
      <PaymentElement options={{ layout: "tabs" }} onReady={() => setReady(true)} onChange={onChange} />

      <p className="tp-checkout__feedback" data-tone={error ? "error" : complete ? "ok" : "neutral"} role="status">
        {error ? (
          error
        ) : complete ? (
          <>
            <Check aria-hidden className="h-3.5 w-3.5" />
            {t("billing.checkout.ready")}
          </>
        ) : ready ? (
          t("billing.checkout.incomplete")
        ) : null}
      </p>

      <div className="tp-checkout__actions">
        <button
          type="submit"
          className={ui.btnPrimary}
          disabled={!stripe || !elements || !complete || submitting}
          data-testid="billing-pay"
        >
          {submitting ? t("billing.checkout.paying") : t("billing.checkout.pay", { price })}
        </button>
        <button type="button" className={ui.btnGhost} disabled={submitting} onClick={onCancel}>
          {t("billing.checkout.cancel")}
        </button>
      </div>
      <p className="tp-checkout__secure">
        <Lock aria-hidden className="h-3 w-3" />
        {t("billing.checkout.securedBy")}
      </p>
    </form>
  );
}
