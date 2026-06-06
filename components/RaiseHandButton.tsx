"use client";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing } from "@/lib/ui";

type Props = {
  raised: boolean;
  disabled: boolean;
  busy: boolean;
  onToggle: () => void;
};

export function RaiseHandButton({ raised, disabled, busy, onToggle }: Props) {
  const t = useTranslations();

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || busy}
      aria-pressed={raised}
      className={`tp-raise-hand-btn ${raised ? "tp-raise-hand-btn--raised" : ""} ${focusRing}`}
      data-testid="raise-hand-button"
    >
      <span aria-hidden className="tp-raise-hand-btn__icon">
        ✋
      </span>
      <span className="tp-raise-hand-btn__label">
        {busy
          ? t("home.exam.raiseHandBusy")
          : raised
            ? t("home.exam.raiseHandLower")
            : t("home.exam.raiseHand")}
      </span>
    </button>
  );
}
