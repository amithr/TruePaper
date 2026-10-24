"use client";

import { Check } from "lucide-react";

import { comparePlans, formatMonthlyPrice, PLANS, type PlanId } from "@/lib/billing/plans";
import type { BillingState } from "@/lib/billing/subscription-state";
import { useLocale, useTranslations } from "@/lib/i18n/I18nProvider";
import type { TranslationPath } from "@/lib/i18n/types";
import { focusRing, ui } from "@/lib/ui";

type Props = {
  billing: BillingState;
  /** Billing keys present on the server; otherwise paid buttons are disabled. */
  configured: boolean;
  busyPlan: PlanId | null;
  onChoose: (plan: PlanId) => void;
};

const POPULAR: PlanId = "classroom";

export function planName(t: ReturnType<typeof useTranslations>, plan: PlanId): string {
  return t(`billing.plans.${plan}.name` as TranslationPath);
}

/** The four tiers side by side; the current one is marked, others offer a switch. */
export function PlanPicker({ billing, configured, busyPlan, onChoose }: Props) {
  const t = useTranslations();
  const locale = useLocale();

  return (
    <div className="tp-plan-grid" role="list">
      {PLANS.map((plan) => {
        const name = planName(t, plan.id);
        const isCurrent = plan.id === billing.plan && !(plan.id === "free" && billing.cancelAtPeriodEnd);
        const isPaid = plan.id !== "free";
        const direction = comparePlans(plan.id, billing.plan);
        const disabled = (isPaid && !configured) || busyPlan !== null;
        let cta: string;
        if (isCurrent) {
          cta = t("billing.current");
        } else if (plan.id === "free") {
          cta = t("billing.downgradeToFree");
        } else if (billing.plan === "free") {
          cta = t("billing.choose", { plan: name });
        } else {
          cta = t("billing.switchTo", { plan: name });
        }
        return (
          <div
            key={plan.id}
            role="listitem"
            className="tp-plan-card"
            data-current={isCurrent ? "true" : undefined}
            data-popular={plan.id === POPULAR ? "true" : undefined}
            data-testid={`plan-card-${plan.id}`}
          >
            {plan.id === POPULAR && !isCurrent ? (
              <span className="tp-plan-card__flag">{t("billing.popular")}</span>
            ) : null}
            {isCurrent ? (
              <span className="tp-plan-card__flag tp-plan-card__flag--current">
                <Check aria-hidden className="h-3 w-3" />
                {t("billing.current")}
              </span>
            ) : null}
            <p className="tp-plan-card__name">{name}</p>
            <p className="tp-plan-card__price">
              {plan.monthlyAmount === 0 ? (
                t("billing.freePrice")
              ) : (
                <>
                  {formatMonthlyPrice(plan, locale)}
                  <span className="tp-plan-card__per">{t("billing.perMonth")}</span>
                </>
              )}
            </p>
            <p className="tp-plan-card__seats">
              {plan.studentLimit === null
                ? t("billing.unlimitedStudents")
                : t("billing.studentsPerSession", { n: plan.studentLimit })}
            </p>
            <p className="tp-plan-card__blurb">{t(`billing.plans.${plan.id}.blurb` as TranslationPath)}</p>
            <button
              type="button"
              className={`${direction > 0 ? ui.btnPrimary : ui.btnSecondary} tp-plan-card__cta`}
              disabled={disabled || isCurrent}
              aria-busy={busyPlan === plan.id}
              onClick={() => onChoose(plan.id)}
              data-testid={`plan-choose-${plan.id}`}
            >
              {busyPlan === plan.id ? t("billing.working") : cta}
            </button>
          </div>
        );
      })}
      <span className={`sr-only ${focusRing}`} aria-hidden />
    </div>
  );
}
