"use client";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import type { MathInputConfig } from "@/lib/response-types/types";
import { focusRing } from "@/lib/ui";

const MATH_SYMBOLS = ["π", "√", "²", "³", "±", "×", "÷", "≤", "≥", "≠", "∞", "∑", "∫", "θ", "α", "β"];

type Props = {
  id: string;
  latex: string;
  disabled: boolean;
  config: MathInputConfig;
  onChange: (latex: string) => void;
};

export function MathInputResponder({ id, latex, disabled, config, onChange }: Props) {
  const t = useTranslations();

  const insertSymbol = (symbol: string) => {
    if (disabled) {
      return;
    }
    onChange(`${latex}${symbol}`);
  };

  return (
    <div className="space-y-2" data-testid="student-math-input">
      <div className="flex flex-wrap gap-1.5">
        {MATH_SYMBOLS.map((symbol) => (
          <button
            key={symbol}
            type="button"
            disabled={disabled}
            onClick={() => insertSymbol(symbol)}
            className={`min-h-9 min-w-9 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] px-2 text-sm ${focusRing}`}
            aria-label={t("responseTypes.mathInput.insertSymbol", { symbol })}
          >
            {symbol}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => insertSymbol("()/")}
          className={`min-h-9 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] px-2 text-xs ${focusRing}`}
        >
          ( ) /
        </button>
      </div>
      <textarea
        id={id}
        rows={3}
        value={latex}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={config.placeholder ?? t("responseTypes.mathInput.placeholder")}
        className={`tp-input w-full resize-y font-mono text-sm ${focusRing}`}
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
}
