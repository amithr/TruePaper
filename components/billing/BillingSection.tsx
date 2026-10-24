"use client";

import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { CheckoutForm, type CheckoutOutcome } from "@/components/billing/CheckoutForm";
import { PlanPicker, planName } from "@/components/billing/PlanPicker";
import { getPlan, type PlanId } from "@/lib/billing/plans";
import type { BillingState } from "@/lib/billing/subscription-state";
import { deferEffect } from "@/lib/defer-effect";
import { useLocale, useTranslations } from "@/lib/i18n/I18nProvider";
import { RequestJsonError, requestJson } from "@/lib/request-json";
import { ui } from "@/lib/ui";

type Props = {
  initial: BillingState;
  configured: boolean;
  publishableKey: string | null;
  usage: { forms: number; sessions: number; students: number };
  onError: (message: string) => void;
};

type SubscribeResponse = BillingState & { ok: true; clientSecret: string | null };

function formatDate(iso: string | null, locale: string): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }) : "";
}

/** Settings → Plan & usage: tier picker, embedded Stripe checkout, portal link. */
export function BillingSection({ initial, configured, publishableKey, usage, onError }: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const [billing, setBilling] = useState<BillingState>(initial);
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);
  const [checkout, setCheckout] = useState<{ plan: Exclude<PlanId, "free">; clientSecret: string } | null>(null);
  const [armedFree, setArmedFree] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);

  const sync = useCallback(async (): Promise<BillingState | null> => {
    try {
      const next = await requestJson<BillingState & { ok: true }>("/api/billing/subscriptions/sync", { method: "POST" });
      setBilling(next);
      return next;
    } catch {
      toast.error(t("billing.errors.sync"));
      return null;
    }
  }, [t]);

  // Redirect-based payment methods come back here with ?billing=return.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("billing") !== "return") {
      return;
    }
    url.searchParams.delete("billing");
    url.searchParams.delete("payment_intent");
    url.searchParams.delete("payment_intent_client_secret");
    url.searchParams.delete("redirect_status");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    deferEffect(() => {
      void sync().then((next) => {
        if (next && next.plan !== "free") {
          toast.success(t("billing.checkout.switchDone", { plan: planName(t, next.plan) }));
        }
      });
    });
  }, [sync, t]);

  const choose = async (plan: PlanId) => {
    if (!configured) {
      return;
    }
    if (plan === "free" && !armedFree) {
      setArmedFree(true);
      window.setTimeout(() => setArmedFree(false), 4000);
      return;
    }
    setArmedFree(false);
    setBusyPlan(plan);
    setCheckout(null);
    try {
      const res = await requestJson<SubscribeResponse>("/api/billing/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const { clientSecret, ...state } = res;
      if (clientSecret && plan !== "free") {
        setCheckout({ plan, clientSecret });
        return;
      }
      setBilling(state);
      if (plan === "free") {
        toast.success(t("billing.checkout.downgradeDone", { date: formatDate(state.currentPeriodEnd, locale) }));
      } else if (initial.cancelAtPeriodEnd && !state.cancelAtPeriodEnd && state.plan === plan) {
        toast.success(t("billing.checkout.resumed", { plan: planName(t, plan) }));
      } else {
        toast.success(t("billing.checkout.switchDone", { plan: planName(t, plan) }));
      }
    } catch (e) {
      const code = e instanceof RequestJsonError && e.body && typeof e.body === "object" ? (e.body as { code?: string }).code : "";
      onError(code === "not_configured" ? t("billing.notConfigured") : e instanceof Error ? e.message : t("billing.errors.start"));
    } finally {
      setBusyPlan(null);
    }
  };

  const onCheckoutDone = async (outcome: CheckoutOutcome) => {
    const plan = checkout?.plan;
    setCheckout(null);
    if (outcome === "processing") {
      toast.success(t("billing.checkout.processing"));
      void sync();
      return;
    }
    const next = await sync();
    if (plan) {
      const limit = getPlan(plan).studentLimit;
      toast.success(
        limit === null
          ? t("billing.checkout.successUnlimited", { plan: planName(t, plan) })
          : t("billing.checkout.success", { plan: planName(t, plan), n: limit }),
      );
    }
    if (next === null) {
      // The webhook will catch up; show the chosen plan optimistically.
      setBilling((prev) => (plan ? { ...prev, plan, studentLimit: getPlan(plan).studentLimit, status: "active" } : prev));
    }
  };

  const openPortal = async () => {
    setPortalBusy(true);
    try {
      const { url } = await requestJson<{ url: string }>("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnPath: `/${locale}/dashboard/settings` }),
      });
      window.location.assign(url);
    } catch (e) {
      onError(e instanceof Error ? e.message : t("billing.errors.portal"));
      setPortalBusy(false);
    }
  };

  const current = planName(t, billing.plan);
  const periodEnd = formatDate(billing.currentPeriodEnd, locale);
  const returnUrl =
    typeof window !== "undefined" ? `${window.location.origin}/${locale}/dashboard/settings?billing=return#plan` : "";

  return (
    <section id="plan" className="tp-card tp-settings-section" aria-labelledby="settings-plan-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={ui.sectionTitle}>{t("billing.eyebrow")}</p>
          <h2 id="settings-plan-title" className="tp-settings-section__title flex flex-wrap items-center gap-2.5">
            {t("billing.title")}
            <span className="tp-settings-badge tp-settings-badge--mint" data-testid="billing-current-plan">
              {current}
            </span>
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--tp-text-secondary)]">{t("billing.sub")}</p>
          {billing.plan !== "free" && periodEnd ? (
            <p className="mt-1 text-[0.8125rem] text-[var(--tp-text-muted)]" data-testid="billing-period">
              {billing.cancelAtPeriodEnd ? t("billing.endsOn", { date: periodEnd }) : t("billing.renews", { date: periodEnd })}
            </p>
          ) : null}
          {billing.status === "past_due" ? (
            <p className={`${ui.alertWarning} mt-2`} role="status">
              {t("billing.pastDue", { plan: current })}
            </p>
          ) : null}
        </div>
        {billing.hasCustomer && configured ? (
          <div className="text-right">
            <button type="button" className={ui.btnSecondary} disabled={portalBusy} onClick={() => void openPortal()}>
              <ExternalLink aria-hidden className="h-4 w-4" />
              {portalBusy ? t("billing.opening") : t("billing.manage")}
            </button>
            <p className="mt-1 text-xs text-[var(--tp-text-muted)]">{t("billing.manageHint")}</p>
          </div>
        ) : null}
      </div>

      {!configured ? (
        <p className={`${ui.alertWarning} mt-4`} role="status">
          {t("billing.notConfigured")}
        </p>
      ) : null}

      <div className="mt-5">
        <PlanPicker billing={billing} configured={configured} busyPlan={busyPlan} onChoose={(p) => void choose(p)} />
        {armedFree ? (
          <p className="mt-2 text-[0.8125rem] text-[var(--tp-text-secondary)]" role="status">
            {t("billing.downgradeConfirm")}
          </p>
        ) : null}
      </div>

      {checkout && publishableKey ? (
        <div className="mt-5">
          <CheckoutForm
            publishableKey={publishableKey}
            clientSecret={checkout.clientSecret}
            plan={checkout.plan}
            returnUrl={returnUrl}
            onDone={(outcome) => void onCheckoutDone(outcome)}
            onCancel={() => setCheckout(null)}
          />
        </div>
      ) : null}

      <dl className="tp-soft-panel tp-settings-usage mt-5">
        <div>
          <dd>{usage.forms}</dd>
          <dt>{t("settings.plan.usageForms")}</dt>
        </div>
        <div>
          <dd>{usage.sessions}</dd>
          <dt>{t("settings.plan.usageSessions")}</dt>
        </div>
        <div>
          <dd>{usage.students}</dd>
          <dt>{t("settings.plan.usageStudents")}</dt>
        </div>
      </dl>
    </section>
  );
}
