"use client";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import type { MathInputConfig } from "@/lib/response-types/types";
import { focusRing } from "@/lib/ui";

const MATH_SYMBOLS = ["π", "√", "²", "³", "±", "×", "÷", "≤", "≥", "≠", "∞", "∑", "∫", "θ", "α", "β"];

type Props = {
  id: string;
  working: string;
  answer: string;
  disabled: boolean;
  config: MathInputConfig;
  onChange: (next: { working: string; answer: string }) => void;
};

export function MathInputResponder({
  id,
  working,
  answer,
  disabled,
  config,
  onChange,
}: Props) {
  const t = useTranslations();

  const insertSymbol = (symbol: string) => {
    if (disabled) {
      return;
    }
    onChange({ working: `${working}${symbol}`, answer });
  };

  return (
    <div className="space-y-4" data-testid="student-math-input">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-[var(--tp-text)]" htmlFor={`${id}-working`}>
          {t("responseTypes.mathInput.workingLabel")}
        </label>
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
          id={`${id}-working`}
          rows={4}
          value={working}
          disabled={disabled}
          onChange={(event) => onChange({ working: event.target.value, answer })}
          placeholder={t("responseTypes.mathInput.workingPlaceholder")}
          className={`tp-input w-full resize-y font-mono text-sm ${focusRing}`}
          spellCheck={false}
          autoComplete="off"
        />
        <p className="text-xs text-[var(--tp-text-muted)]">{t("responseTypes.mathInput.workingHint")}</p>
      </div>

      <label className="block space-y-1.5 text-sm font-medium text-[var(--tp-text)]" htmlFor={`${id}-answer`}>
        {t("responseTypes.mathInput.answerLabel")}
        <input
          id={`${id}-answer`}
          type="text"
          value={answer}
          disabled={disabled}
          onChange={(event) => onChange({ working, answer: event.target.value })}
          placeholder={config.placeholder ?? t("responseTypes.mathInput.placeholder")}
          className={`tp-input w-full font-mono text-sm ${focusRing}`}
          spellCheck={false}
          autoComplete="off"
          data-testid="student-math-final-answer"
        />
      </label>
    </div>
  );
}
