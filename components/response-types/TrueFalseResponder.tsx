"use client";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing } from "@/lib/ui";

type Props = {
  answer: boolean | null;
  disabled: boolean;
  onChange: (answer: boolean) => void;
};

export function TrueFalseResponder({ answer, disabled, onChange }: Props) {
  const t = useTranslations();

  return (
    <div className="tp-tf-choices grid grid-cols-2 gap-3" role="radiogroup" data-testid="student-true-false">
      {([true, false] as const).map((value) => {
        const selected = answer === value;
        const label = value ? t("responseTypes.trueFalse.true") : t("responseTypes.trueFalse.false");
        return (
          <button
            key={String(value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(value)}
            className={`tp-tf-choice min-h-11 rounded-[var(--tp-radius-sm)] border px-4 py-3 text-sm font-medium transition-colors ${
              selected
                ? "border-[var(--tp-accent)] bg-[var(--tp-accent-soft)] text-[var(--tp-text)]"
                : "border-[var(--tp-border)] bg-[var(--tp-surface)] text-[var(--tp-text-secondary)]"
            } ${focusRing}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
